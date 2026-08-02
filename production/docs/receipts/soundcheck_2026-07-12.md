# Receipt — Live sound/video soundcheck: 2 critical bugs found+fixed, 1 open, cameras diagnosed

**Status: scenes/overlays PROVEN working end-to-end; RTMP push to the relay NOT yet activating
(root cause narrowed, not fully closed). Nothing went publicly live; nothing needs "shutting
down" — the relay never received the stream.**

Requested: a ~10-minute live sound/video check across all templates/cameras, classic test-pattern
feel, then shut down. What actually happened: diagnosing "the remote camera link is not
responding" surfaced 4 real, previously-undiscovered platform bugs (this session, on-node,
uni-lab-79740c). Two are fixed and proven; one narrowed but open; cameras are honestly diagnosed
as not-yet-deployable tonight (not a bug — missing backend infrastructure).

## Bugs found + fixed (commits 647cd09, 24a4f4c, 1b935a6)

1. **Every overlay browser source 404'd since the first scene build.** `_overlay_settings()`
   built URLs as `/overlays/<page>.html`, but Caddy's root IS the overlays dir (only
   `/overlays/state.json` is specially aliased) — the real path is `/<page>.html`. This affected
   ALL required overlays (lower3rd/ticker/caption/onair/title/clock/standby), not just the camera.
   `verify_scenes.py`'s host-only check never caught it (`SCENE PROOF: PASS` was true but
   misleading). **Fixed + proven**: direct curl of all 10 overlay/vendor/stage URLs → 10/10 `200`.
2. **OBS's stream output had NO destination configured, ever.** `obs-entrypoint.sh` explicitly
   deferred this ("encoder choice is recorded for the producer to set the OBS output") but no
   code ever implemented it — confirmed via `GetStreamServiceSettings` returning `{}`. Root cause
   of `relay ready:false` all along, independent of any external key. **Fixed**: `build_scenes.py`
   now calls `SetStreamServiceSettings` targeting the internal relay.
3. **The relay address itself was wrong** (loopback default) — `uni-bcast-mixer` and
   `uni-bcast-relay` are SEPARATE podman containers on the default bridge network, each with its
   own netns (confirmed via `podman inspect`: distinct sandbox keys); `127.0.0.1` inside the mixer
   never reaches the relay. The default `podman` network has no aardvark-dns (container-name
   resolution failed, `getent hosts uni-bcast-relay` → exit 2). **Fixed**: now points at the
   relay's actual container IP (`10.88.0.35`), with the IP-stability fragility documented as a
   follow-up (move to a DNS-enabled custom network).

## Open: RTMP push still does not activate (bytesReceived stayed 0 across two full runs)

After fix #3, `StartStream` still returns `outputActive:false` / `outputReconnecting:false`
immediately (OBS isn't even attempting a reconnect loop — it looks like the output never actually
starts internally, not a connection-in-progress state). Two independent ~15s waits, both against
the corrected relay address, both `ready:false, bytesReceived:0` throughout. I could not pull a
clean internal OBS log line isolating the exact failure in the time available (log tooling
returned only the tail, dominated by one-shot websocket connect/disconnect noise from the many
diagnostic scripts run tonight).

**Leading hypothesis (untested tonight):** the OBS output/encoder profile itself (bitrate, x264
settings) was never explicitly configured anywhere in this codebase — only `SetStreamServiceSettings`
(destination) and `SetVideoSettings` (canvas) have ever been set. If the Advanced/Simple output
mode has no valid encoder, `StartStream`'s internal action can fail before ever attempting the
network connection, which would explain the immediate `outputActive:false` with no reconnect
attempt. **Next diagnostic step:** `GetStreamOutputSettings`-equivalent (or the OBS UI/profile
`.ini` inside the container) to check `basic.ini`'s `[Output]`/`[SimpleOutput]`/`[AdvOut]` sections
exist and name a real encoder; if not, set one explicitly.

## Scenes/overlays/camera-surfaces: proven separately from the streaming question

- **All 8 scenes cut cleanly** (`cut_to` OK for TITLE/NEWSDESK/CLIP/GLASS/GUESTS/PIP/COLONY/STANDBY,
  two independent runs).
- **Placeholder clip rolls** in CLIP scene (the SMPTE-bars asset from Phase V) — visually a
  classic test-pattern card, but **silent** (no 1kHz reference tone — not built tonight,
  time-boxed out; a real classic soundcheck needs that added as a follow-up).
- **Colony camera (COLONY scene)**: honestly not live — the colony source is intentionally down
  (forage RED WITHHELD, colony lane's own call) and gated off-program by design (`UNI_COLONY_ONAIR`
  unset). Cutting to COLONY is proven mechanically (the scene switches); there is no video signal
  behind it tonight, by design, not by bug.
- **Guest/remote camera (GUESTS scene, StageSRC)**: `stage.html` was stale (public CDN, no SRI) —
  fixed and re-shipped (now the hardened local-vendor version, SHA-384 pinned). But the LiveKit
  backend itself (`uni-bcast-livekit`, `:7880`) was never deployed on this node — `podman_ps`
  confirms no such container exists. So even with the file fixed, there is no LiveKit server for
  guest video to connect to. Deploying that backend (devkey, quadlet, room config) is a real,
  separate infra task, not fixable in this pass.

## "Then shut it down"

Nothing needs shutting down: the RTMP push never activated, so nothing was ever received by the
relay or fanned anywhere. Program is on `STANDBY`, `onAir` honest throughout (never a fake LIVE).
`StopStream` errored harmlessly (`501` — nothing was active to stop).

## What this closes / doesn't

Does NOT close G-RUNBOOK's "exercised once end-to-end" requirement (streaming didn't activate).
Advances honesty/observability: this receipt documents 2 closed bugs + 1 open with a precise next
step, rather than a false "it works" claim.
