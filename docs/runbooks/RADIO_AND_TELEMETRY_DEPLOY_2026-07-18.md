# Deploy runbook — per-UNI telemetry (v1a/v1b) + cpradio session-liveness fix

> **Seat:** science agent · **Written:** 2026-07-18 · **Status of every stage below: NOT YET DEPLOYED**
> unless a receipt says otherwise. Read the whole stage before running any of it.

**The one rule this runbook exists to enforce:** `uni-producer` and `uni-colony` are DIFFERENT
containers with DIFFERENT blast radii. Restarting the producer costs a picture. Restarting the
colony costs **six live minds**. Never let a change to one imply a restart of the other.

| Container | Restarting it costs | Holds live minds? |
|---|---|---|
| `uni-producer` (`:4200`) | the OVERLOOK camera + narration for the restart window | **No** — observe-only, `UNI_OBSERVE_ONLY=1` |
| `uni-colony` (`:4000`) | **THE SIX LIVE UNI MINDS** (ephemeral FS, `mounts: []`) | **YES — destructive** |
| `cpradio` (`:8687`) | the radio audio bed + all listener sessions | No |

---

## Stage v1a — per-UNI routes (producer only) — commit `08fa60d`

**Blast radius:** OVERLOOK goes dark for the restart window. **`uni-colony` is NOT touched.**
**Precondition:** OVERLOOK off program (operator on a cover scene), OR an accepted brief blip.

Changes: `ui/lib/sp_ui_web/controllers/producer_uni_controller.ex` (new),
`ui/lib/sp_ui_web/router.ex` (4 entries), `production/schemas/producer_uni_state.v1.json` (new).
Serves ONLY fields already on `SP.Runtime.Board`. No `Agent.publish/1` edit. No FE code.

1. Confirm OVERLOOK is off program and the producer is currently healthy (so you know what you are
   comparing against):
   ```
   curl -s http://producer.uni-lab.local:4200/producer/health
   # expect verdict=LIVE driver=producer colony_count=6
   ```
2. Rebuild the `uni-producer` image from the pushed ref (**never the working tree** — CLAUDE.md
   "Method of work" §2) at commit `08fa60d`, **under a NEW tag**. Never overwrite the tag the
   running container uses: that image IS the rollback.

   > **⚠️ DO NOT run `deploy/uni-producer/deploy.sh`.** It describes the one-time 2026-07-15
   > `uni-cam` → `uni-producer` cutover and is STALE: it stops `uni-cam` (gone) and creates
   > `uni-viewer-cam-fwd2` publishing host `:3020`, which **collides** with the live
   > `uni-viewer-cam-fwd` and takes the camera down. A refusal guard now blocks it
   > (`UNI_DEPLOY_ACK_STALE=1` overrides, only after genuine re-derivation).

   > **⚠️ DO NOT copy env from `/run/user/1000/uniprod.txt`.** That snapshot carries
   > `VIEWER_URL=http://10.190.245.122:3020` — a hard IP literal for a DHCP lease that **has since
   > moved to `.121`**. The live container was already corrected to the DNS name
   > `http://uni-lab-lan.uni-lab.local:3020`. **Read the live values off the running container**
   > (`podman inspect uni-producer`); re-pinning the literal re-arms the exact trap CLAUDE.md's
   > `_lan_dynamic_law` exists to prevent.

   Recreate **only** `uni-producer`, preserving `--name`/`--hostname`/`--network` so its
   `uni-producer` network **alias** survives, and **leave `uni-viewer-cam-fwd` alone**:
   ```
   podman run -d --name uni-producer --hostname uni-producer --network uni-colony-net \
     -p 4200:4001 -e UNI_AUTOSTART=1 -e UNI_POPULATE=0 -e UNI_OBSERVE_ONLY=1 \
     -e UNI_COLONY_NODE=uni@uni-colony -e MC_HOST=mc-server \
     -e VIEWER_URL=http://uni-lab-lan.uni-lab.local:3020 \
     --restart unless-stopped uni-producer:<new-tag>
   ```
   **`UNI_OBSERVE_ONLY=1` and `UNI_POPULATE=0` are load-bearing** — they are the fence that keeps
   the producer from spawning or culling bodies in the world it watches. Do not drop them, and
   **verify them on the running container after recreate**, not just in the command you typed.

   **Why the camera survives the IP change.** `uni-viewer-cam-fwd` targets
   `tcp-connect:uni-producer:3020` **by name**, and socat with `fork` re-resolves per connection.
   Proven, not assumed: the forwarder started `2026-07-16 07:34:39` and the producer started
   `07:43:50` — **9m11s later** — yet host `:3020` serves HTTP 200. A startup-time resolve would
   have failed permanently. So the new container's IP is picked up automatically as long as the
   alias is preserved. Established connections (OBS `cap_overlook`) still break and must
   reconnect — that is the blip, and why OVERLOOK must be off program.
3. **Gate — `producer-per-uni-telemetry`.** All four must return 200 with the disclaimer present:
   ```
   for r in uni_roster generations; do
     curl -s "http://producer.uni-lab.local:4200/producer/$r" | head -c 400; echo; done
   curl -s "http://producer.uni-lab.local:4200/producer/uni_state/UNI-1-3"   | head -c 400
   curl -s "http://producer.uni-lab.local:4200/producer/uni_history/UNI-1-3" | head -c 400
   ```
   PASS requires, on every one of the four: `disclaimer` present verbatim, `x-uni-claim-fence`
   header present, and **no** synthesized score/rank/percentage field anywhere in the payload.
   Also assert `/producer/health` still reads `verdict=LIVE driver=producer colony_count=6` —
   if `colony_count` dropped, the producer lost its remote board and the restart hurt something.
4. Flip the gate row to PASS + write `docs/receipts/producer_per_uni_telemetry_2026-07-18.md`.
5. **Hand back to the studio agent** to wire the Gaia projector (`viewer/gaia/**` is their seat,
   not mine). Tell them the routes are LAN-plane only — see the plane note below.

> **Plane note, measured 2026-07-18:** `:4200` answers on the chip's **LAN** plane
> (`producer.uni-lab.local` → `10.190.245.121`) but **NOT** on the tailscale overlay
> (`100.100.188.48:4200` → socket hang up). Only `:8687` is published on the overlay. Any Gaia
> collector must address the **name**, not the overlay literal.

---

## Stage v1b — additive `Agent.publish/1` — **DESTRUCTIVE, NOT IN THIS WINDOW**

**Blast radius: THE SIX LIVE MINDS.** Adds `energy/satiety/homeostat body/eat_count/attack_count/
gamma_m` to the board row. It only takes effect on a **`uni-colony` redeploy**, because that is
where `SP.Runtime.Agent` runs.

**THREE HARD PRECONDITIONS — ALL of them, no exceptions:**

1. **MANDATORY capture-before-destroy.** Run
   `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` in **`anchor`** mode, commit + push,
   and confirm `node viewer/gaia/evidence_hold.cjs verify` prints **PASS**. Six minds spanning kin
   groups 0–3, founder UNI-0-1 still active, ~day 1320. `podman rm` without this wastes them
   **permanently** — Gaia cannot enforce this herself (it would break her read-only law).
2. **Off air.** Not a cover scene — off air.
3. **A separate, explicit operator GO for the redeploy itself.** The v1 go-ahead covers writing the
   code and the v1a producer restart. It does **not** authorize destroying a running colony.

Only after all three: rebuild `uni-colony` from a pushed ref, redeploy rootless as `uni`, then
re-prove `verify_colony.cjs` + `/producer/health` before claiming anything.

---

## Stage A — `cpradio` session-liveness fix

**Blast radius:** the radio audio bed drops for the restart window. `uni-colony` NOT touched.
Root cause + evidence: `docs/receipts/music_nowplaying_stuck_root_cause_2026-07-18.md`.

**Read this first:** the service is **rootful** podman, container `cpradio`, source in a volume at
`/var/lib/containers/storage/volumes/musicradio/_data/server.py`, mounted into the container
**read-only** (`RW:false`). So the patch is applied on the **host**, then the container restarts to
pick it up. There is no image rebuild.

1. Back up, then apply (idempotent — safe to re-run, exits 0 with "already patched"):
   ```
   cp /var/lib/containers/storage/volumes/musicradio/_data/server.py \
      /var/lib/containers/storage/volumes/musicradio/_data/server.py.bak-pre-liveness-20260718
   python3 deploy/uni-os/cpradio/patch_session_liveness.py \
      /var/lib/containers/storage/volumes/musicradio/_data/server.py
   python3 -c "import ast,sys;ast.parse(open(sys.argv[1]).read())" \
      /var/lib/containers/storage/volumes/musicradio/_data/server.py   # syntax gate before restart
   ```
2. `podman restart cpradio`  → then `curl -s http://127.0.0.1:8687/healthz` → `ok`.
3. **Gate — `music-nowplaying-advances`.** Open a real listener, then two probes ≥ 60 s apart:
   ```
   curl -sN "http://127.0.0.1:8687/radio?session=gatecheck" > /dev/null &
   sleep 5;  curl -s "http://127.0.0.1:8687/api/nowplaying?session=gatecheck"   # T0
   sleep 90; curl -s "http://127.0.0.1:8687/api/nowplaying?session=gatecheck"   # T1
   kill %1
   ```
   PASS = `seq` incremented **OR** `title`/`artist` changed to a NEW pair, **AND** `positionSec`
   never exceeded `durationSec + 5` on any successful probe.
   FALSIFIES = `seq` fixed AND title unchanged AND `positionSec > durationSec + 30` on both.
4. **Leak regression check** (this is the actual root cause, so prove it directly):
   ```
   curl -s http://127.0.0.1:8687/api/telemetry | grep -o '"activeListeners":[0-9]*'
   ss -tnp state established 'sport = :8687' | wc -l
   ```
   After the listener above is killed and `RADIO_SESSION_STALE_SEC` elapses, `activeListeners`
   MUST fall back to the number of real established connections. A non-zero `activeListeners` with
   zero established sockets is the defect returning.
5. Write `docs/receipts/music_nowplaying_advances_2026-07-18.md`, flip the gate row.
6. Leave the studio-side `stalePlayhead` guard in place — it is a safety net, not the mechanism.

> ### ⚠️ MANDATORY FOLLOW-UP after ANY cpradio restart — hand to the STUDIO seat
>
> **A cpradio restart strands OBS on a half-open socket that silently produces nothing.** This is
> not hypothetical and it is not a server fault — it recurred on the 2026-07-18 deploy and cost real
> diagnostic time. Budget for it on every future restart.
>
> Symptom: `obs64` still holds an **ESTABLISHED** connection to `:8687` created *before* the restart
> (observed 4.5 h stale). OBS reports `OBS_MEDIA_STATE_PLAYING` with an advancing cursor while
> `/api/nowplaying` returns `no-session`. **From OBS's side it looks perfectly healthy and is
> completely dead.**
>
> * `TriggerMediaInputAction RESTART` does **NOT** clear it — it returns success and changes nothing.
> * **What works:** clear the ShowRadio source's `input` to `""`, wait 3 s, then restore the URL.
>   That forces `ffmpeg_source` to drop the socket and open a fresh one. `activeListeners` goes
>   0 → 1 immediately.
>
> **Seat boundary:** the recovery action is STUDIO-side (`viewer/*`, OBS). The chip/science seat must
> **not** perform it — hand back after the restart and let the studio agent force the input
> clear/restore. This note exists so the next chip-side restart is not misdiagnosed as a server
> regression: a transient `activeListeners=0` immediately after a restart is the OBS socket, not the
> patch. Confirm by probing with a fresh session id (`/api/nowplaying?session=probe-test-sid`) — if
> that registers instantly with a real position, the service is fine.

**Optional, only if the operator wants the incident lever:** set `RADIO_ADMIN_TOKEN` in the
container env to enable `POST /api/reset` + `/api/skip`. **Unset = the verbs return
`503 not configured`.** Do not enable them and then describe them as "secured" unless the token is
actually set — same discipline as the retracted publisher-PIN claim in `CLAUDE.md`.

---

## Rollback

| Stage | Rollback |
|---|---|
| v1a | recreate `uni-producer` from the previous image tag; routes vanish, `/producer/health` unchanged |
| v1b | **the minds do not roll back** — that is why the capture is mandatory, not advisory |
| A | `cp server.py.bak-pre-liveness-20260718 server.py && podman restart cpradio` |
