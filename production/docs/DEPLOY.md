# DEPLOY - UNI Production Platform on the broadcast node

**Status:** this is a **design/reference**, status `pending`. Nothing here is deployed. Every command
below is a proposal for how the broadcast node *would* add these units, mirroring exactly how UNI.OS
installs its lab-os units (`install -D` the quadlets/services, an `enable_etc_service` helper, the
nginx `location` blocks, and the nftables `trusted`/`forward` rules). Run nothing blindly; every
mutating step on the appliance goes through the **uni-lab MCP human-approval gate** (the agent cannot
self-approve). See `## Status (honest)` at the foot.

This file targets the **dedicated UNI.OS broadcast node** (ADR-PROD-003), NOT the ERP appliance. The
business stack (`solutionwright-*`, `odoo`, `jitsi`, `cloudflared`, `portainer`) is **read-only
observation, never a mutation target**; the encoder is **not** co-located with it.

**For the ordered, gated P1 bring-up sequence (the *when* + the gates + the smoke test + rollback), follow
[`P1-BRINGUP.md`](P1-BRINGUP.md).** This file is the per-component reference it draws on.

---

## 0. Node prerequisites (one-time)

- Same UNI.OS image: rootful Podman + the quadlet generator + nginx + nftables (the lab-os pattern).
- A cheap **NVENC/VAAPI-capable GPU** for hardware encode (GAP **G-ENC**). With no GPU the design
  encodes 720p30 x264 `faster` as the honest floor - heavier on CPU; size the node accordingly.
- Persistent spool dir (host bind, survives reboot; never `/tmp` or `/run`):

```sh
# (mutating: route through the MCP os_exec dry-run -> confirm on the appliance)
install -d -m 0755 /var/lib/uni/broadcast
install -d -m 0755 /var/lib/uni/broadcast/clips        # FINAL pool (rsync/symlink the broadcast-ready MP4s here)
install -d -m 0755 /var/lib/uni/broadcast/overlays     # overlay package (step 3)
install -d -m 0755 /var/lib/uni/broadcast/run-of-show  # per-slot templates (step 5)
install -d -m 0755 /var/lib/uni/logs
```

---

## 1. Mixer image (G-ENC; no canonical upstream "OBS + obs-websocket + xvfb" image)

There is no single pinned upstream image that bundles headless OBS + obs-websocket + xvfb/wayland.
Bake one on the node and pre-pull/pin it, exactly like the portainer pre-pull records a resolved digest:

The Containerfiles now exist in the tree: `production/containers/Containerfile.obs` (+ `obs-entrypoint.sh`)
and `production/containers/Containerfile.captions` (+ `caption_worker.py`). Build them on the node:

```sh
# From production/containers/ on the node:
podman build -t localhost/uni-bcast-obs:latest -f Containerfile.obs .
# Freeze it: read the resolved digest and pin it into the quadlet Image= line.
podman image inspect localhost/uni-bcast-obs:latest --format '{{.Digest}}'
# -> replace Image=localhost/uni-bcast-obs:latest with @sha256:<digest> in uni-bcast-mixer.container
```

The captions image (`localhost/uni-bcast-captions`) is baked the same way from `Containerfile.captions`
(faster-whisper + CTranslate2 + the `caption_worker.py` stream worker). The relay/overlays/livekit images are upstream (`bluenviron/mediamtx`,
`caddy:alpine`, `livekit/livekit-server`) - pre-pull them so the resolved digest is recorded:

```sh
podman pull docker.io/bluenviron/mediamtx:latest
podman pull docker.io/library/caddy:alpine
podman pull docker.io/livekit/livekit-server:latest
```

---

## 2. Install the quadlets (the `install -D` lines)

Quadlets live as `[Container]` files under `/etc/containers/systemd/`; `podman-system-generator` turns
each into a `.service` at boot (the portainer.container pattern - rootful, no login session needed).

```sh
# From the repo's production/containers/systemd/ on the node:
install -D -m 0644 uni-bcast-mixer.container    /etc/containers/systemd/uni-bcast-mixer.container
install -D -m 0644 uni-bcast-relay.container    /etc/containers/systemd/uni-bcast-relay.container
install -D -m 0644 uni-bcast-overlays.container /etc/containers/systemd/uni-bcast-overlays.container
install -D -m 0644 uni-bcast-livekit.container  /etc/containers/systemd/uni-bcast-livekit.container
install -D -m 0644 uni-bcast-captions.container /etc/containers/systemd/uni-bcast-captions.container

# Config files referenced by the quadlets (mounted read-only from the spool):
install -D -m 0644 mediamtx.yml /var/lib/uni/broadcast/mediamtx.yml
install -D -m 0644 livekit.yaml /var/lib/uni/broadcast/livekit.yaml

# Generate + start (the quadlet generator runs on daemon-reload):
systemctl daemon-reload
systemctl start uni-bcast-overlays.service   # bring overlays + relay up first (sinks before the mixer)
systemctl start uni-bcast-relay.service
systemctl start uni-bcast-livekit.service
systemctl start uni-bcast-captions.service
systemctl start uni-bcast-mixer.service      # mixer last - it publishes into the relay
```

(`[Install] WantedBy=multi-user.target default.target` in each quadlet means they auto-start on boot
once generated; the explicit `systemctl start` is just for first bring-up.)

---

## 3. Overlay package + the Caddyfile alias

Copy the transparent 2D-canvas overlay pages into the read-only bind, and drop a Caddyfile that serves
the site root on :8099 and aliases `/overlays/state.json` -> the producer's `broadcast.json` with
`Cache-Control: no-store` (so each page's `fetch(...,{cache:'no-store'})` loop sees fresh state).

```sh
# Mirror production/overlays/* -> the node spool (read-only bind in the quadlet):
rsync -a --delete production/overlays/ /var/lib/uni/broadcast/overlays/
# The guest STAGE page is authored under production/guest/ but is SERVED from /overlays/stage.html
# (OBS captures it as the GUESTS scene), so stage it into the overlays bind too:
install -D -m 0644 production/guest/stage.html /var/lib/uni/broadcast/overlays/stage.html
# broadcast.json must exist before the overlays container mounts it read-only (seed it from the sample):
install -D -m 0644 production/overlays/broadcast.sample.json /var/lib/uni/broadcast/broadcast.json
```

`/var/lib/uni/broadcast/overlays/Caddyfile` (served by the quadlet; loopback only):

```caddyfile
:8099 {
    root * /var/lib/uni/broadcast/overlays
    # Alias the live overlay state to /overlays/state.json with no caching.
    @state path /overlays/state.json
    handle @state {
        header Cache-Control "no-store"
        rewrite * /broadcast.json
        root * /var/lib/uni/broadcast
        file_server
    }
    handle {
        file_server
    }
}
```

---

## 4. Install the host services (the `enable_etc_service` helper lines)

Host units run Python from `/opt/uni` via the venv (`ExecStart=/opt/uni/.venv/bin/python -m <module>`),
mirroring `uni-control-mcp.service`. Install them under `/etc/systemd/system/` and enable+start. UNI.OS
uses a small `enable_etc_service` helper (install + daemon-reload + enable --now); inline below:

```sh
enable_etc_service() {  # name.service in $PWD -> /etc/systemd/system, enabled + started
  install -m 0644 "$1" "/etc/systemd/system/$1"
  systemctl daemon-reload
  systemctl enable --now "$1"
}

# From the repo's production/systemd/ on the node:
enable_etc_service uni-production-mcp.service   # FastMCP on 127.0.0.1:8095, shares /etc/uni-approvals
enable_etc_service uni-producer.service         # show-runner (after the MCP)
enable_etc_service uni-playout.service          # scheduler/playout (after producer)
```

Code dependencies (the `production/` package must be present under `/opt/uni/production/` with
`__init__.py`, `mcp/server.py`, `producer/run.py`, `playout/run.py` - authored by the sibling agents).

The shared approval store `/etc/uni-approvals` + the `uni-approvald` daemon already exist for
uni-control-mcp; the production MCP reuses them (ADR-PROD-002). No new daemon.

---

## 5. Run-of-show + catalog inputs

```sh
# Per-slot run-of-show templates (the 8 templates + the 4h-slot + weekly grid - sibling artifacts):
rsync -a production/run-of-show/ /var/lib/uni/broadcast/run-of-show/
# Build catalog.json from the FINAL pool (sibling artifact production/catalog/build-catalog.mjs):
node production/catalog/build-catalog.mjs --out /var/lib/uni/broadcast/catalog.json
```

---

## 6. nginx - the `/prod-mcp` location (stream-safe) + the `/overlays/` alias

Add to the node's nginx server (the same conf that fronts the lab UI; mirror the lab-os `/mcp` block,
which is stream-safe because MCP streamable-HTTP is chunked HTTP/SSE, NOT a WebSocket upgrade - so we
must NOT force `Connection: upgrade`).

```nginx
# Production MCP (token-gated inside the app; loopback-only upstream on :8095 - 8094 belongs to uni-glass-configure on the node).
location /prod-mcp {
    proxy_pass http://127.0.0.1:8095/prod-mcp;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    # The MCP streamable transport's DNS-rebinding protection only accepts a 127.0.0.1 Host. Forward
    # the upstream's own authority (not the external $host) so a real client at http://<node>/prod-mcp
    # is accepted instead of rejected 421. nginx is the only client of :8095.
    proxy_set_header Host 127.0.0.1:8095;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}

# Overlays static + the no-store state alias (if you prefer nginx to the in-container Caddy on :8099).
location /overlays/ {
    proxy_pass http://127.0.0.1:8099/overlays/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    add_header Cache-Control "no-store" always;
}
location = /overlays/state.json {
    alias /var/lib/uni/broadcast/broadcast.json;
    add_header Cache-Control "no-store" always;
    default_type application/json;
}
```

```sh
install -D -m 0644 uni-production.conf /etc/nginx/conf.d/uni-production.conf
nginx -t && systemctl reload nginx
```

---

## 7. nftables - open the broadcast ports (the `trusted` chain + the `forward` requirement)

The node's firewall is **default-deny inbound** (the lab-os pattern). Published container ports only
work once their dport is allowed in the `trusted` chain, AND the `podman0` bridge forward is accepted.

**7a. Forward chain (REQUIRED for published container ports to reach the containers).** The lab-os
`forward` chain is `policy drop` with no accepts; published ports rely on podman's own iptables/nft
forward rules. If those are not present on this node, add an explicit accept for the podman bridge:

```nginx
# in table inet filter, chain forward:
iifname "podman0" accept
oifname "podman0" ct state established,related accept
```

**7b. Inbound dports (add to the `trusted` chain, persist in `/etc/nftables.conf`).** Loopback-only
surfaces (obs-websocket 4455, mediamtx API 9997, overlays 8099, captions 8501, prod-mcp 8095) need NO
rule. Only the guest/ingest surfaces that must be reachable on the LAN/WAN are opened:

```nginx
# in table inet filter, chain trusted:
tcp dport 1935 accept              # RTMP ingest (mixer -> relay; LAN). Drop if mixer+relay share a pod/loopback.
udp dport 8890 accept              # SRT ingest (mixer -> relay; PREFERRED).
tcp dport 7880 accept              # LiveKit signalling ws/http (remote guests).
tcp dport 7881 accept              # LiveKit rtc-tcp fallback.
udp dport 50000-50200 accept       # LiveKit rtc-udp media range.
# Public egress to YouTube/Twitch is OUTBOUND (relay -> their RTMP) and needs no inbound rule.
```

Apply (mutating - dry-run then confirm through the MCP):

```sh
nft add rule inet filter trusted tcp dport 1935 accept
nft add rule inet filter trusted udp dport 8890 accept
nft add rule inet filter trusted tcp dport 7880 accept
nft add rule inet filter trusted tcp dport 7881 accept
nft add rule inet filter trusted udp dport 50000-50200 accept
# Persist by adding the same lines to the `trusted` chain in /etc/nftables.conf, then:
nft -f /etc/nftables.conf
```

Note: if the mixer and relay run on the SAME node, prefer keeping the mixer->relay hop on loopback
(`127.0.0.1:1935` / `127.0.0.1:8890`) and skip the 1935/8890 inbound rules entirely - only LiveKit's
guest ports then need opening.

---

## 8. requirements-runtime.txt additions

The host services import beyond the current lab-os runtime (`fastapi`, `uvicorn`, `pydantic`,
`jsonschema`, `PyYAML`, `numpy`, `mcp`, `httpx`). Add to `lab-os/requirements-runtime.txt` (baked into
the node venv; without these the host units crash-loop invisibly, like the v2.4.0 `mcp` regression):

```text
# UNI Production Platform host services (production.mcp / producer / playout):
websockets>=12.0          # obs-websocket client (cut_to/duck/roll_clip adapters drive OBS over ws)
faster-whisper>=1.0       # live captioner worker (if captions runs as a host svc instead of the quadlet)
# mcp>=1.20.0 and httpx>=0.27 are already present (control_mcp) and are reused by production.mcp.
```

(The faster-whisper/CTranslate2 heavy deps live in the **captions container image**, not the host venv,
unless the operator chooses to run the captioner as a host service - keep it containerised by default.)

---

## 9. IMAGE_MB bump note

The node's rootfs/image budget grows: the baked **uni-bcast-obs** image (OBS + xvfb + ffmpeg, ~1.5-2.5
GB), the baked **uni-bcast-captions** image (CTranslate2 + a faster-whisper model, ~0.5-1.5 GB
depending on model size), plus the upstream `mediamtx` (~0.05 GB), `caddy:alpine` (~0.05 GB), and
`livekit-server` (~0.15 GB). **Bump `IMAGE_MB`** (the build-rootfs / installer image-size budget) by
**at least ~5000 MB** to cover the pre-pulled/baked broadcast images plus the whisper model cache and
the FINAL clip pool staging. Re-measure after the first build and pin the real number.

---

## 10. GPU / CDI install note (NVENC / VAAPI for hardware encode - GAP G-ENC)

Default is **x264 software** (zero-GPU floor). To engage hardware encode on a GPU node:

**NVIDIA NVENC (CDI):**
```sh
# Install the NVIDIA driver + container toolkit on the node, then generate the CDI spec:
nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
# Verify Podman sees the device:
podman run --rm --device nvidia.com/gpu=all docker.io/library/ubuntu nvidia-smi
# Then in uni-bcast-mixer.container uncomment:  PodmanArgs=--device nvidia.com/gpu=all
# and set Environment=UNI_BCAST_ENCODER=nvenc  (and UNI_CAP_COMPUTE_TYPE=float16 for the captioner).
```

**VAAPI (Intel/AMD render node):**
```sh
# Ensure /dev/dri/renderD128 exists and the vaapi driver is installed, then in the quadlet uncomment:
#   PodmanArgs=--device /dev/dri
# and set Environment=UNI_BCAST_ENCODER=vaapi
```

After flipping the encoder, restart the mixer (`systemctl restart uni-bcast-mixer.service`) and confirm
the OBS encoder picked the hardware path in `journalctl -u uni-bcast-mixer`.

---

## Verify (read-only)

```sh
systemctl --type=service | grep uni-bcast        # quadlet-generated services running
systemctl status uni-production-mcp uni-producer uni-playout
podman ps                                          # 5 broadcast containers Up
curl -s http://127.0.0.1:9997/v3/paths/list        # mediamtx API (loopback)
curl -s http://127.0.0.1:8099/overlays/onair.html  # overlay served
curl -s http://127.0.0.1:8099/overlays/state.json  # aliased broadcast.json, no-store
cat /run/uni-production-mcp.err.log                 # any startup traceback (tmpfs, always writable)
```

---

## Status (honest)

This document is a **design/reference**; **no part of this stack is deployed**. Every command is a
**proposal** (status `pending`), not a record of something that ran. No banned-unqualified word is used
as a claim (not: verified / proven / guaranteed / isolated / secure / 100% / certified / real; used:
checked / observed / as captured / appears / pending confirmation).

- The quadlet/service patterns mirror the appliance's own `portainer.container`, `uni-control-mcp.service`,
  `uni-builder-api.service`, the nginx `/mcp` block, and the `nftables.conf` `trusted`/`forward` chains
  **as captured 2026-06-21/22** from `/opt/uni/lab-os/*` via the uni-lab MCP (Class-C, command-output).
- The **business stack** (`solutionwright-*`, `odoo`, `jitsi`, `cloudflared`, `portainer`) is **never a
  mutation target**; the encoder runs on a **dedicated broadcast node**, not co-located with the ERP.
- Every mutating step routes through the **uni-lab human-approval gate**; the producer agent only
  proposes and **cannot self-approve** (GAP **G-PA**, Class-Sec / pending until a captured red-team run).
- Open gaps that bear on this deploy: **G-ENC** (encoder node/GPU is an operator hardware choice;
  x264-software-on-the-ERP-box is forbidden), **G-CAP** (multilingual caption latency unmeasured),
  **G-MUSIC** (no music-bed asset exists - source CC/royalty-free), **G-9x16** (vertical catalog content
  must be pillarboxed/shorts-walled into 16:9). See `production/docs/GAPS_REGISTER.md`.
