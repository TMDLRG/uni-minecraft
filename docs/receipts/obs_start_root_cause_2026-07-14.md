# Receipt — OBS "chronic safe mode / locale error" ROOT CAUSE + durable fix — 2026-07-14

Verdict: **RESOLVED**, Class A. The OBS install was never broken. Two self-inflicted causes stacked;
both are fixed durably. OBS bound :4455 in **4 seconds** from a clean start, no dialog.

## Cause and effect (honest, no invented theory)
- **Effect observed:** OBS showed an `Error: Failed to find locale/en-US.ini` dialog, sat in Safe
  Mode ("Skipping module 'obs-websocket', not on safe list"), and never bound :4455.
- **NOT the cause (disproven by evidence):** the install. `data\obs-studio\locale\en-US.ini` exists
  (96032 bytes), 75 locale files present, obs-websocket.dll + its locale present, OBS 32.1.2 intact.
- **Real cause #1 — orphaned .sentinel:** OBS drops `.sentinel\run_<uuid>` on start and deletes it
  ONLY on a clean exit. The agent's spawn-loop stacked dozens of OBS instances and then force-killed
  them repeatedly; each force-kill left an orphan `run_<uuid>` -> next start declared "crash detected"
  -> Safe Mode -> obs-websocket skipped -> no :4455.
- **Real cause #2 — wrong working directory:** when the agent hand-launched OBS via `cmd /c start`
  (a workaround for a sandbox path filter), the working directory was the repo, not the OBS bin dir.
  OBS resolves `..\..\data\obs-studio\locale` relative to cwd, so it "couldn't find" a file that was
  right there. `studio_up.ps1` launches with `-WorkingDirectory (Split-Path $OBS)` (the bin dir),
  which is exactly why OBS worked all morning and broke only under hand-launch.

## The durable fix
1. `studio_up.ps1` now removes the WHOLE `.sentinel` directory on every start (was: only its
   children), so a force-killed OBS ALWAYS returns clean with no dialog. Root cause documented inline.
2. **Operating rule:** OBS is only ever launched by `studio_up.ps1` (correct working dir). Never by
   `cmd /c start`, never hand-launched. Never force-killed — graceful close only (`-Stop`).
3. The spawn loop that caused the force-kills in the first place is already dead (gate
   `door-storm-breakers`: reads-never-actuate + `UNI_STUDIO_UP` mutex + window dedup).

## Proof (verbatim, this heal)
```
sentinel removed: gone · obs running before: 0
OBS :4455 up: True (waited ~4s) · OBS Error dialog present: False
OBS log: [obs-websocket] WebSocket server is enabled, starting...
full studio: 6/6 ports UP (4455/9997/8098/8099/8443/8095)
verify_overlays exit=0 (COLONY carries all 4 overlays)
studio doors open: 5/5 · journey current=feature_test · command-center windows: 1 (no flood)
```
