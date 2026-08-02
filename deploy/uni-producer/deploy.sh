#!/bin/sh
# ⚠️ STALE — DO NOT RUN AS-IS. This script describes the ONE-TIME 2026-07-15 CUTOVER from the old
# `uni-cam` camera to `uni-producer`. That cutover has already happened. The live topology no
# longer matches this script's assumptions, and running it blind BREAKS THE LIVE CAMERA:
#
#   * step 2 stops `uni-cam` — that container NO LONGER EXISTS (removed after the 07-15 cutover),
#     so with `set -e` the script dies here; without it, it continues into the collision below.
#   * step 4 creates `uni-viewer-cam-fwd2` publishing host :3020 — but the LIVE forwarder is
#     `uni-viewer-cam-fwd` (created 2026-07-16 07:34:37) and it already holds :3020. The bind
#     COLLIDES and the new forwarder fails, leaving the camera path down.
#
# Verified live 2026-07-18: rootless containers under `uni` are uni-colony, mc-server,
# uni-viewer-fwd, uni-viewer-in, uni-viewer-mc-fwd, uni-producer, uni-viewer-cam-fwd.
# There is no `uni-cam` and no `uni-viewer-cam-fwd2`.
#
# ── TO REDEPLOY THE PRODUCER TODAY ──────────────────────────────────────────────────────────
# Follow `docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md` (Stage v1a). In short: build a
# NEW tag (never overwrite the running one — that is your rollback), then recreate ONLY
# `uni-producer` with the same --name/--hostname/--network so its `uni-producer` network ALIAS is
# preserved, and LEAVE `uni-viewer-cam-fwd` ALONE. The forwarder targets `tcp-connect:uni-producer:3020`
# BY NAME and socat re-resolves per connection, so it follows the new container IP on its own.
# (Proven: the forwarder started 07:34:39, the producer 07:43:50 — 9m11s LATER — and the path
# still serves HTTP 200, which is only possible with late resolution.)
#
# ── DO NOT COPY THE ENV BLOCK BELOW VERBATIM ────────────────────────────────────────────────
# Read the LIVE values off the running container (`podman inspect uni-producer`), not from this
# script and not from the /run/user/1000/uniprod.txt snapshot. That snapshot still carries
# `VIEWER_URL=http://10.190.245.122:3020` — a hard IP literal for a DHCP lease that HAS SINCE
# MOVED to .121. The live container was already corrected to the DNS name
# `http://uni-lab-lan.uni-lab.local:3020`. Re-pinning the literal would re-arm exactly the trap
# CLAUDE.md's `_lan_dynamic_law` exists to prevent.
#
# Reviewed: docs/specs/producer_remote_sense_observe_only.md.
# Pre-registered gate: producer-camera-attached (evidence/gates.ndjson).
#
# TOUCHES (as originally written): uni-cam + uni-viewer-cam-fwd (stopped, kept for rollback), NEW
# containers uni-producer + uni-viewer-cam-fwd2. NEVER touches uni-colony / mc-server / minds.

if [ "$UNI_DEPLOY_ACK_STALE" != "1" ]; then
  echo "REFUSING: deploy/uni-producer/deploy.sh is STALE against the post-2026-07-15 topology." >&2
  echo "It stops uni-cam (gone) and creates uni-viewer-cam-fwd2 (collides on :3020 with the live" >&2
  echo "uni-viewer-cam-fwd). Running it blind takes the live camera down." >&2
  echo "" >&2
  echo "Use docs/runbooks/RADIO_AND_TELEMETRY_DEPLOY_2026-07-18.md (Stage v1a) instead." >&2
  echo "If you have genuinely re-derived this script against the CURRENT topology, re-run with" >&2
  echo "UNI_DEPLOY_ACK_STALE=1 to override." >&2
  exit 1
fi

set -ex

# 1. Build the image from these exact bytes.
podman build -t uni-producer:v1 -f deploy/uni-producer/Containerfile .

# 2. Cutover — exactly one camera process may own the "Director" login (MC kicks duplicates).
#    STOP (not rm) the old camera + its forwarder: instant rollback = start them again.
podman stop uni-cam uni-viewer-cam-fwd

# 3. The producer node. LOAD-BEARING env (reviewed; attested in the deploy receipt):
#    UNI_OBSERVE_ONLY=1 + UNI_POPULATE=0 — an unfenced node under rows=[] would spawn real
#    bodies / fire kill @e at the live world. UNI_COLONY_NODE reroutes rows to the PURE remote
#    board read. VIEWER_URL is registry-derived at invocation (no IP literal in this script).
podman run -d --name uni-producer --hostname uni-producer \
  --network uni-colony-net \
  -p 4200:4001 \
  -e UNI_AUTOSTART=1 \
  -e UNI_POPULATE=0 \
  -e UNI_OBSERVE_ONLY=1 \
  -e UNI_COLONY_NODE=uni@uni-colony \
  -e MC_HOST=mc-server \
  -e VIEWER_URL="${VIEWER_URL:?set VIEWER_URL from the infra registry (colonycam LAN URL)}" \
  --restart unless-stopped \
  uni-producer:v1

# 4. Re-point host :3020 at the new camera (old forwarder is stopped, port free; same
#    socat image + shape as the forwarder it replaces).
podman run -d --name uni-viewer-cam-fwd2 \
  --network uni-colony-net \
  -p 3020:3020 \
  --restart unless-stopped \
  docker.io/alpine/socat -d -d tcp-listen:3020,fork,reuseaddr tcp-connect:uni-producer:3020

podman ps --format '{{.Names}} | {{.Status}}'
