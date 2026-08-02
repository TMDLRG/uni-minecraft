# Receipt — door-boot-persistent (The Door survives an apocalypse) — 2026-07-14

Gate row: `door-boot-persistent` (evidence/gates.ndjson). Verdict **PARTIAL** — three legs PROVEN
live today, the literal reboot leg honestly PENDING until the next real power-cycle.

## What was built
- `viewer/door_watchdog.ps1` — dedicated supervisor for `launcher.cjs` (:8090, serves `/door`);
  named-mutex (`UNI_DOOR_WATCHDOG`) self-dedup; 5s interval; `-Once` gate mode.
- `viewer/door_boot_install.ps1` — per-user Startup `.vbs` (`UNI-Door-Watchdog.vbs`) + install marker
  (mirrors the proven `gaia_boot_install.ps1` mechanism). Installed 2026-07-14T11:12:14.
- `viewer/door_boot_proof.ps1` — autonomous reboot arbiter (cannot false-pass: boot must post-date
  the install marker AND the watchdog must start post-boot AND :8090 answer).
- `viewer/door_open.vbs` + `viewer/door_open.ps1` — THE ICON PATH: always spawn the watchdog (mutex
  makes duplicates exit), wait for :8090, open the Chrome app window; if node itself is dead, open
  the static `viewer/door_offline.html` triage page (the door never dead-ends).
- Desktop + Start-menu shortcuts retargeted to `wscript.exe door_open.vbs` (door icon kept).
- `studio_up.ps1 -Stop` survival is **by construction** (inspected, not executed live): neither
  `launcher.cjs` nor `door_watchdog.ps1` appears in Kill-Everything's node/powershell match lists.

## Honest calibration — a falsified first design, corrected forward
The first self-dedup used a CommandLine substring match (`*door_watchdog.ps1*`). The T1 drill
FALSIFIED it: the fresh watchdog matched the operator agent's own tool shell (whose command TEXT
mentions the script), declared a phantom twin, and exited — leaving the launcher dead. Log line:
`2026-07-14T11:12:16 another door_watchdog is already running (PID 25316) - exiting`.
Corrected to a named mutex (only a real holder is a twin); `door_open.ps1` now spawns
unconditionally and lets the mutex arbitrate. The failed drill + correction are part of this receipt.

## Drill outputs (verbatim)

### T0 — dedup (mutex): spawn a 2nd watchdog, exactly ONE survives
```
before: 1 (PID 32964)
after spawn attempt: 1 (PID 32964)
T0 VERDICT: DEDUP PROVEN (mutex held, twin exited)
log: 2026-07-14T11:14:57 another door_watchdog holds the mutex - exiting
```

### T1 — crash-restart: kill launcher.cjs, watchdog resurrects it
```
killing launcher PID=34608
launcher alive after kill: False
T1 VERDICT: launcher_resurrected=True door_serving=True -> CRASH-RESTART PROVEN
log: 2026-07-14T11:14:10 launcher.cjs DOWN - restarting / started launcher.cjs (port 8090)
```

### T3 — apocalypse: kill watchdog + launcher, ONE icon click resurrects the chain
```
post-kill: watchdogs=0 launcher=False door=False  (must be 0/False/False)
-- clicking the icon (wscript door_open.vbs) --
T3 VERDICT: watchdogs=1 launcher=True door_serving=True -> ONE-CLICK COLD RESURRECTION PROVEN
log: 2026-07-14T11:15:07 door_watchdog started (interval 5s, port 8090)
     2026-07-14T11:15:07 launcher.cjs DOWN - restarting / started launcher.cjs (port 8090)
```

### T4 — reboot leg (autonomous arbiter): honest NOT YET
```
last_boot              : 07/13/2026 16:01:55
install_marker         : 07/14/2026 11:12:14
rebooted_since_install : False
started_after_boot     : True
port_8090_up           : True
DOOR REBOOT-SURVIVAL: NOT YET - crash-restart + cold one-click are the proven legs; the reboot leg
confirms automatically on the next power-cycle.
```

## What flips the gate to PASS
After the operator's next real reboot: `powershell -File viewer\door_boot_proof.ps1` prints
`DOOR REBOOT-SURVIVAL: PROVEN` (exit 0). Append a superseding PASS row citing that output.
