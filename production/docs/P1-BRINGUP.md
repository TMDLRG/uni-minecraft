# P1 bring-up runbook -- the gated deploy of the broadcast stack on the dedicated node

> **STATUS UPDATE (2026-07-11): Phases B-G1 + F HAVE RUN** against `uni-lab-79740c` (not a
> dedicated node — the only non-ERP box on the mesh; deviation documented). Live record +
> deviations + proof gate: [`DEPLOYED_STATE.md`](DEPLOYED_STATE.md). Remaining: G2 scenes,
> H nginx/nftables, I smoke test. The text below is the original playbook.

**Status (original):** design/reference, status `pending`. Nothing here has run. This is the ordered, **human-approval-gated**
playbook for standing up **P1** (OBS mixer + MediaMTX relay + production-MCP, one program to YouTube, music +
Piper narration controllable over MCP) on the **dedicated UNI.OS broadcast node** chosen 2026-06-22. It is NOT
run on the ERP appliance (`uni-lab`) -- that box stays untouched (no encoder, business stack read-only).

**The gate (binding).** Every mutating step is issued through the **uni-lab MCP** and **blocks on a human
approve/deny** at the operator approval UI -- the agent cannot self-approve (GAP **G-PA**). Mutating tools used:
`os_file_write`, `os_exec`, `podman_quadlet_apply`, `podman_pull`, `os_systemctl_action`. Read-only probes
(`os_sysinfo`, `podman_ps`, `os_systemctl_status`, `os_journalctl_tail`, `podman_images`) are never gated.

**Companion docs:** [`DEPLOY.md`](DEPLOY.md) is the per-component reference (the *what/how* of each unit, nginx,
nftables, GPU). This runbook is the *ordered playbook* (the *when*, the gates, the smoke test, the rollback).

---

## Phase A -- node prerequisites (operator, one-time, before I can act)

- [ ] **Flash a UNI.OS node** from the same image (rootful Podman + quadlet generator + nginx + nftables +
      `/opt/uni/.venv` + `/etc/uni/runtime.env` token). A *separate* box from the ERP appliance.
- [ ] **(Recommended) attach an NVENC/VAAPI GPU** for hardware encode (G-ENC). Without one, P1 runs **720p30
      x264 `faster`** (CPU floor) -- size the node for a few sustained cores.
- [ ] **Networking:** node on the LAN + the WireGuard net (so the uni-lab MCP / approval gate reach it). Note
      its LAN/WG address.
- [ ] **Give me a control path to the node:** either (a) the node is itself reachable by a uni-lab-style MCP
      (preferred -- same gate), or (b) SSH + I drive `podman`/`systemctl` through the existing MCP's `os_exec`
      against the node. Tell me which + the address.
- [ ] **(Before a real show, not blocking P1 bring-up) source a music bed** -- GAP **G-MUSIC**: no music asset
      exists; drop a CC/royalty-free track at `/var/lib/uni/broadcast/music/bed.m4a`. Narration ducking needs a
      music input to ride; P1 can come up silent and add it after.

When A is done, hand me the node address + control path and I run Phases B-J, gating each mutation.

---

## Phase B -- ground the node (read-only; not gated)

1. `os_sysinfo` -> confirm hostname/IP is the **broadcast node, NOT** `uni-lab` (10.190.245.122); record cores,
   RAM, load.
2. `podman_ps` -> confirm **no `solutionwright-*` business containers** here (this must be a clean node).
3. `podman_images` -> what is already present.
4. `os_systemctl_status nginx` + `os_file_read /etc/nftables.conf` -> confirm the lab-os firewall/nginx baseline.
5. Check for a GPU: `os_exec "ls -l /dev/dri 2>/dev/null; nvidia-smi -L 2>/dev/null || echo no-nvidia"` (read-only).

**Go/no-go:** proceed only if B1-B2 confirm a clean, non-ERP node.

---

## Phase C -- ship the payload (gated)

The host services import `production.*` from `/opt/uni`; the quadlets read configs + pages from
`/var/lib/uni/broadcast`.

1. Create the spool tree (DEPLOY step 0) -- `os_exec` (dry-run -> confirm):
   `install -d -m 0755 /var/lib/uni/broadcast/{,clips,overlays,run-of-show,music,audit} /var/lib/uni/logs`
2. Ship the code: rsync/`os_file_write` the `production/` tree to `/opt/uni/production/` (package importable as
   `production.*`; `PYTHONPATH=/opt/uni` per the units). Confirm `production/__init__.py`, `mcp/server.py`,
   `producer/run.py`, `playout/run.py` land.
3. Overlays + stage page + seed state (DEPLOY step 3): rsync `production/overlays/` -> the overlays bind;
   `install` `guest/stage.html` -> `overlays/stage.html`; `install` `overlays/broadcast.sample.json` ->
   `/var/lib/uni/broadcast/broadcast.json` (the overlays container needs it to exist before it mounts it).
4. Configs: `os_file_write` `mediamtx.yml`, `livekit.yaml`, the `Caddyfile` into `/var/lib/uni/broadcast/`.
5. Catalog + clips: stage the broadcast-ready MP4s into `/var/lib/uni/broadcast/clips/`, then
   `os_exec "node /opt/uni/production/catalog/build-catalog.mjs --out /var/lib/uni/broadcast/catalog.json"`.
6. venv deps (DEPLOY step 8): add the production lines to `requirements-runtime.txt` and
   `os_exec "/opt/uni/.venv/bin/pip install -r .../requirements-runtime.txt"` (websockets, etc.).
7. Stream key: `os_file_write` `/etc/uni/runtime.env` additions (`YT_KEY=...`, optional `TWITCH_KEY=...`,
   `UNI_OBS_WS_PASSWORD=...`) -- never in git; the relay + mixer read them from the env file.

---

## Phase D -- build the two local images (gated)

1. `os_exec "cd /opt/uni/production/containers && podman build -t localhost/uni-bcast-obs:latest -f Containerfile.obs ."`
   (the entrypoint = `obs-entrypoint.sh`). **This is the riskiest step** (headless OBS + Xvfb software-GL):
   watch `os_journalctl_tail`/build output. If the headless container path fails on this node, fall back to OBS
   running natively on the node host (same obs-websocket director) and skip the mixer quadlet -- decide + document.
2. `os_exec "... podman build -t localhost/uni-bcast-captions:latest -f Containerfile.captions ."` (faster-whisper).
3. `podman_pull docker.io/bluenviron/mediamtx:latest`, `docker.io/library/caddy:alpine`,
   `docker.io/livekit/livekit-server:latest` (records resolved digests offline-first).
4. Pin digests: `podman_images` -> read each `@sha256:` and `os_file_write` them into the quadlet `Image=` lines
   (the portainer pre-pull-and-pin pattern), so the node never auto-pulls a moving tag.

---

## Phase E -- bring up the sinks first (gated): relay, overlays, livekit

Order matters: start the **sinks before the mixer** so the program has somewhere to go.

1. `podman_quadlet_apply uni-bcast-relay.container` -> `os_systemctl_action daemon-reload` ->
   `os_systemctl_action start uni-bcast-relay.service`.
2. Same for `uni-bcast-overlays.container` and `uni-bcast-livekit.container`.
3. Read-only verify: `podman_ps` (3 Up), `os_exec "curl -s http://127.0.0.1:9997/v3/paths/list"` (mediamtx API),
   `os_exec "curl -s http://127.0.0.1:8099/overlays/onair.html | head"` (overlays served),
   `os_exec "curl -s http://127.0.0.1:8099/overlays/state.json | head"` (aliased broadcast.json, no-store).

---

## Phase F -- the production MCP host service (gated)

1. Install + enable the host units (DEPLOY step 4): `os_file_write` the three `.service` files to
   `/etc/systemd/system/`, `os_systemctl_action daemon-reload`, then `os_systemctl_action enable --now` for
   `uni-production-mcp.service` (then `uni-producer`, `uni-playout`).
2. Smoke test (read-only): `os_exec "cat /run/uni-production-mcp.err.log"` (no fatal traceback;
   fail-closed if `UNI_RUNTIME_TOKEN` missing), `os_systemctl_status uni-production-mcp`.
3. MCP responds: from a bearer-holding client over WireGuard, call `get_show_state` and `list_scenes` -> the
   envelope returns (scene may be `null` until the mixer is up -- that is honest, not a failure).

---

## Phase G -- the mixer + the producer build the stage (gated)

1. `podman_quadlet_apply uni-bcast-mixer.container` -> `daemon-reload` -> `start uni-bcast-mixer.service`
   (and `uni-bcast-captions.service`).
2. `os_journalctl_tail uni-bcast-mixer` -> confirm OBS launched + obs-websocket bound :4455 + the encoder path
   (x264 floor, or nvenc/vaapi if the device was passed -- DEPLOY step 10).
3. The producer (or `obs_stage` lineage) builds the scenes over obs-websocket: COLONY/GLASS/GUESTS/CLIP/
   NEWSDESK/TITLE/STANDBY/PIP + the music + overlay browser-sources. Verify with `list_scenes` -> the 8 scenes.

---

## Phase H -- expose the guest/ingest ports + the MCP (gated)

1. nginx (DEPLOY step 6): `os_file_write` `uni-production.conf` (the stream-safe `/prod-mcp` block +
   `/overlays/` alias), then `os_exec "nginx -t && systemctl reload nginx"`.
2. nftables (DEPLOY step 7): add the `forward podman0 accept` rules if absent, and the `trusted` dports for the
   guest path (LiveKit `7880/7881`, `50000-50200/udp`). Keep mixer->relay on **loopback** (no 1935/8890 inbound)
   since they share the node. `os_exec` dry-run -> confirm, then persist in `/etc/nftables.conf`.

---

## Phase I -- end-to-end smoke test (gated only at go-live)

1. Point the mixer's output at the relay (loopback SRT `srt://127.0.0.1:8890?streamid=publish:uni/program`).
2. Set the relay's `${YT_KEY}` to a **PRIVATE/unlisted** YouTube live test (never the public channel for the
   smoke test).
3. Drive the MCP: `open_session` (operator approves once) -> `cut_to COLONY` -> `set_music_volume 0.2` ->
   `narrate "UNI production platform, phase one smoke test." en` (music auto-ducks) -> `cut_to GLASS` ->
   `roll_clip <a FINAL clipId>`. Confirm on the private YouTube watch page: one clean program, scene cuts,
   music riding, narration ducking, overlays painting.
4. `start_broadcast` is **human-gated + 2-step** (dry_run -> confirm -> operator approves) -- use it only for the
   real go-live, after the private test passes.

**Go/no-go:** P1 is met when one program reaches YouTube from the node, the operator cuts/rolls/narrates via the
MCP, and the ERP appliance is **unchanged** (`podman_ps` on `uni-lab` shows every `solutionwright-*` still Up,
checked before + after -- a deploy invariant even though we never target it).

---

## Phase J -- rollback (gated)

Each piece is independently reversible (additive units; no business target touched):
- `os_systemctl_action stop <unit>` + `podman_quadlet_apply --remove` / `os_file_write` removing the quadlet ->
  `daemon-reload`.
- Remove the nginx conf + reload; remove the added nft rules (or reboot to the persisted `/etc/nftables.conf`).
- The spool + images remain for a retry; nothing on `uni-lab` is involved, so business continuity is unaffected.

---

## Status (honest)

- This runbook is a **proposal**, status `pending`; **no step has run**. The live-state facts about the ERP
  appliance were captured **2026-06-22T11:25Z** via the uni-lab MCP (Class-C): host `uni-lab` @10.190.245.122,
  load avg ~4, the `solutionwright-*` business stack Up, **no GPU encoder**, approval queue empty. That is
  exactly why P1 targets a **separate** node, gated at every mutation.
- No banned-unqualified word is used as a claim (not verified/proven/guaranteed/isolated/secure/100%/
  certified/real; used checked/observed/as captured/appears/pending confirmation).
- Open gaps that bear on this bring-up: **G-ENC** (encoder GPU/node -- operator hardware; x264 floor until then),
  **G-PA** (producer cannot self-approve -- Class-Sec, pending a captured red-team), **G-CAP** (multilingual
  caption latency unmeasured), **G-MUSIC** (no music bed asset -- source CC), **G-9x16** (vertical catalog must be
  pillarboxed). See `production/docs/GAPS_REGISTER.md`.
- The headless-OBS container (Phase D1) is the load-bearing unknown -- authored from the standard Xvfb+software-GL
  recipe but **not yet built/validated**; the documented fallback is native OBS on the node driven by the same
  obs-websocket director.
