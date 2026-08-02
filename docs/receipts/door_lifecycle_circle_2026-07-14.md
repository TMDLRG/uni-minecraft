# Receipt — door-lifecycle-circle (the circle written in code) — 2026-07-14

Gate row: `door-lifecycle-circle`. Verdict **PASS** for the drilled legs (register, prediction,
mandate, graceful close-all, one-key open-all); OBS *graceful-close* leg honestly **PARTIAL** (see below).

## What was built
- `viewer/door_lifecycle.cjs` — the lifecycle engine: 12-door registry (studio/frame/observer/
  virtual/remote scopes), state = open/closed x locked/unlocked, the four vectors per door
  (HOW it opens/closes/locks/unlocks), circle invariant (`circle_ok`: an open door must be ready to
  close, a closed door ready to open), per-door predictions of next transitions, append-only audit
  ledger (`viewer/runtime/door_lifecycle.ndjson`), register file (`door_state.json`), ONE KEY
  (door "all" -> studio_up.ps1 / graceful -Stop).
- `/api/door/state|open|close` on the launcher; DOORS panel + audit trail + one-key buttons on /door.
- Graceful shutdown verbs: `POST /api/shutdown` (command_center, stops fan-out children first),
  `POST /shutdown` (overlay_server :8099, publisher :8095 — both loopback-bound). `studio_up.ps1
  -Stop` gained a GRACEFUL PHASE: systray stopped FIRST (no resurrection mid-close), graceful POSTs,
  OBS CloseMainWindow -> taskkill WM_CLOSE -> force only as fallback.
- THE MANDATE fence: remote doors (world/colony/colonycam/relay) refuse open/close with
  "this system never impacts the UNIs; it only observes them" — mutation belongs to Organic
  Operator Michael Polzin (fleet approval queue / science seat).
- Gaia projection: `studio.doors.register` declared in `viewer/gaia/sources.json` (verbatim file
  signal; predictions are the source's own). `verify_gaia.cjs` stays 11 PASS / 0 FAIL.

## Honest calibrations — two falsified designs, corrected forward
1. **detached:true spawns die mute** under the launcher's node context: the first close-all wrote a
   log header and NOTHING else — no action, no error. Proven by re-running the identical command
   non-detached (full output, exit 0). Fixed in `door_lifecycle.ps()` AND the pre-existing
   `launcher.runPs` (whose START/STOP/RESTORE buttons carried the same latent silent-failure).
2. **OBS graceful close is PARTIAL**: tray-minimized OBS no-ops CloseMainWindow and ignored
   WM_CLOSE (taskkill) in 8s -> force fallback fired. The enforced guarantee is therefore START-side:
   every open path clears `.sentinel` + safe-mode markers and launches with
   `--disable-shutdown-check` — OBS self-heals and starts clean; the safe-mode dialog cannot block
   a bring-up regardless of how the previous instance died.

## Drill outputs (verbatim)
- REGISTER: 12 doors, all `circle_ok=true`; `stream` open=False locked=True (the human key CONFIRM);
  remote doors locked by mandate.
- PREDICTION: closed `overlays` individually -> ledger predicted systray reopen -> `:8099` False at
  +2s, **True at ~10s — PREDICTION VERIFIED**.
- MANDATE: `close colony` -> **HTTP 409** `{"refused":true,"mandate":"REFUSED - this system never
  impacts the UNIs; it only observes them... Organic Operator Michael Polzin..."}`.
- CLOSE-ALL (graceful): systray stopped first; graceful stops sent to command center / overlay
  server / publisher; OBS fallback; `=== DOWN: VERIFIED CLEAN (nothing left running) ===` exit 0.
  Frame (:8090) + witness (:8096) stayed OPEN. **UNIs untouched: colony :4000 HTTP 200 + :3020 up
  during the entire studio death.**
- ONE KEY OPEN-ALL via `/api/door/open {door:all}`: every studio door UP within 180s
  (4455/9997/8098/8099/8443/8095), OBS started unattended (ws answering = no safe-mode block),
  overlays proof gate ran inside the bring-up, CamHost rebound. Register: all `circle_ok=true`.

## Residual known papercuts (open, honest)
- OBS ignores WM_CLOSE when tray-minimized -> its close stays force-fallback (start-side self-heal
  is the guarantee). A cleaner exit needs an OBS-side mechanism (no Quit request in obs-websocket v5).
- studio_stage rebuilds reset the CamHost dshow device; the open-all drill rebinds it explicitly.
