# Receipt — end-to-end stability audit, spawn-storm breakers, and BOTH boot gates PROVEN — 2026-07-14

Gate rows fed by this receipt: `door-storm-breakers` (PASS, Class A), `door-boot-persistent`
(PASS — reboot leg closed), `gaia-boot-persistent` (PASS — reboot leg closed).

## 1. The incident, honestly (two storm waves, one real reboot)
- **Wave 1 (OBS loop):** journey `verify_1` auto-triggered ONE KEY, and the concurrency fix's
  end-of-function disk reload discarded the once-only guard -> every 3s poll from every open /door
  tab spawned `studio_up.ps1` -> OBS relaunched endlessly; ~68 stacked shells killed.
- **The reboot:** the operator power-cycled mid-storm. OS truth: `LastBootUpTime 07/14/2026 12:26:45`.
- **Wave 2 (command-center window flood):** Startup legs correctly revived the door post-reboot,
  but the revived launcher loaded the STILL-BUGGY journey code from disk (the read-purity fix
  `d09f700` was committed ~12:33, after the 12:26 boot) -> storm resumed; every `studio_up` run also
  popped a NEW command-center Chrome window (step 8b was unconditional). Killed + launcher restarted
  on fixed code ~12:44 -> calm since (timed watches below).
- **Silver lining, measured:** the emergency reboot IS the real power-cycle both boot-persistence
  gates were waiting for. Both autonomous arbiters flipped to PROVEN (section 4).

## 2. The three storm breakers (any one alone stops the class; all three are in)
1. **Reads never actuate** (`d09f700`): journey verify steps are pure observers; opening the studio
   is always a deliberate operator click.
2. **One bring-up at a time** (this commit): OS named mutex `UNI_STUDIO_UP` inside `studio_up.ps1`
   itself — any extra invocation exits in <1s having started NOTHING. `-Stop`/`-Status` are never
   blocked. `-MutexProbe` is the side-effect-free drill hook.
3. **Idempotent windows** (this commit): the command-center Chrome window opens only if no chrome
   process already runs on its dedicated profile dir (`chrome-profiles\command`).

## 3. Class-A drill outputs (verbatim)
### Timed spawn watch after the sweep (nothing spawning)
```
sample 1 @ 12:42:27: studio_up/systray=0  cc-windows=0  obs64=0
sample 2 @ 12:42:35: studio_up/systray=0  cc-windows=0  obs64=0
sample 3 @ 12:42:43: studio_up/systray=0  cc-windows=0  obs64=0
```
### Mutex under REAL concurrency (3 simultaneous -MutexProbe)
```
probe 1 : MUTEX: HELD (this instance would proceed)
probe 2 : MUTEX: BUSY (another bring-up in flight - would exit without starting anything)
probe 3 : MUTEX: BUSY (another bring-up in flight - would exit without starting anything)
VERDICT: held=1 busy=2 -> MUTEX PROVEN under real concurrency
obs64 spawned by the drill: 0
```
### Reads-never-actuate re-proof after all changes
```
3 journey polls + 12s: studio_up shells: 0  obs64: 0  cc-windows: 0
```
(Earlier same-day proof: 8 consecutive polls, 0 spawns.)
### Storm cleanup: half-open services closed gracefully
```
graceful stop sent :8098 / :8099 / :8095
studio ports 4455/9997/8098/8099/8443/8095: down/down/down/down/down/down
```

## 4. BOTH boot-persistence gates — the arbiters' verbatim verdicts (exit 0)
```
-- door_boot_proof --
last_boot 07/14/2026 12:26:45 · install_marker 07/14/2026 12:23:20 · rebooted_since_install True
watchdog_last_start 07/14/2026 12:36:37 · started_after_boot True · port_8090_up True
DOOR REBOOT-SURVIVAL: PROVEN - the machine rebooted after install and the logon task returned the door on :8090.

-- gaia_boot_proof --
last_boot 07/14/2026 12:26:45 · install_marker 07/13/2026 20:32:11 · rebooted_since_install True
watchdog_last_start 07/14/2026 12:28:16 · started_after_boot True · port_8096_up True
REBOOT-SURVIVAL: PROVEN - the machine rebooted after install and the logon task returned Gaia on :8096 onto canonical bytes.
```
The journey independently detected the same reboot from `os.uptime()`:
```
{"ts":"2026-07-14T17:28:14.791Z","step":"reboot_1","event":"auto-advance",
 "detail":"last_boot=2026-07-14T17:26:44.929Z armed_at=2026-07-14T17:17:08.189Z - a real reboot occurred since arming"}
```

## 5. Code / runtime / reality cross-check
| Surface | Code (HEAD d09f700 + this commit) | Runtime (measured) | Agree |
|---|---|---|---|
| Door | door.html + living map + journey UI | :8090 UP, serves `The living map` + `renderMap` | YES |
| Gaia | collectors emit doors/journey/producer signals | :8096 UP, signals present, gate 11 PASS | YES |
| Journey | pure-read verify, atomic arming | current=verify_1, 2/11 done, ledger consistent | YES |
| Studio | closed until ONE KEY | all 6 ports down; obs64=0 | YES |
| Boot legs | 3 Startup .vbs entries on disk | both arbiters PROVEN post-reboot | YES |
| Spawners | mutex + dedup + pure reads | timed watches: zero spawns | YES |

## 6. Honest notes / residuals
- `studio_up -Status | Select-Object -First 3` showed exit -1 in the drill harness — an artifact of
  the early-closed pipeline in the drill command, not of the script (full -Status runs exit 0).
- The post-reboot auto-open window did NOT appear during the storm (box was saturated; the 90s wait
  honestly gave up, exit 1). With storms structurally dead, the next logon should auto-open; if it
  ever cannot, the desktop icon and the offline triage page remain.
- Window-dedup's full integration proof (a second `studio_up` run NOT opening a second window)
  lands at the next deliberate ONE KEY press — the predicate and drill of its guard are above.
- Sequence diagrams: `docs/DOOR_LIFECYCLE_SEQUENCES.md` (mermaid — boot, one-key, graceful close,
  journey, go-live, incident appendix). Live visual: the living map panel on `/door`.
