# Deployed and validated end to end — ~9h into the 25h run

**Date:** 2026-08-02, ~21:36–21:43 UTC · **Track:** studio · **Box:** THINKER · **Stream:** live throughout, never interrupted

All four services carrying the fixes from `cd66f3c`..`0438aa7` (the radio bed, the double-bed slider
window, the real fallback, the duck ratchet, the world tile) were restarted, one at a time, operator
directed. This is the deployment record — the fixes were correct in the tree before this; this is what
proves they are **running**.

## Order and method

| service | old PID | new PID | supervisor | down time |
|---|---|---|---|---|
| `music_director.cjs` | 52188 | 3220 | none — manual relaunch | ~2s |
| `voice_server.cjs` | 28628 | 29500 | none — manual relaunch | ~2s + reconnect |
| `command_center.cjs` | 1448 | 20524 | `systray_watchdog.ps1` — auto | ~22s |
| `launcher.cjs` | 28576 | 28136 | `door_watchdog.ps1` — auto | ~6s |

`music_director` and `voice_server` have no supervisor and were stopped and relaunched directly.
`command_center` and `launcher` were stopped and left to their own supervisors — deliberately, both to
avoid a double-start race and to prove the supervision itself works, which it did: both came back on
their own, unprompted, within the documented poll cadence.

**Sequenced, not parallel**, each verified against live OBS state before moving to the next. No two
services were down at once.

## The stream, before the first restart and after the last

```
outputSkippedFrames  441 -> 441   (zero new skips across all four restarts)
outputCongestion     0 -> 0
outputReconnecting   false -> false
program scene         DUAL_AB -> DUAL_AB (unchanged)
ShowRadio             unmuted, -12.6dB, PLAYING throughout every single check
ShowMusic             muted throughout every single check
```

## Per-service notes

**`music_director`** — clean stdout banner, no stderr. Ledger shows a `connected` event and no
`radio_dead_fallback`/`radio_recovered` noise (the radio never went down, so the new hysteresis had
nothing to arbitrate — expected).

**`voice_server`** — a genuine 85-second utterance fired from the show *during* the restart wait window,
on the **old** (unpatched) code, and restored cleanly to -12.6 dB. That's independent corroboration of
the diagnosis: the ratchet needs **back-to-back** speech to bite, and a single isolated utterance was
always fine. After restart, `ovl_voice`'s browser source reconnected its WebSocket within ~10s via its
own exponential-backoff retry (`800ms → ×2 → cap 10s`) with no manual intervention. The ratchet guard
itself was **not** force-tested — that would mean deliberately sending back-to-back speech on air purely
to prove a code path.

**`command_center`** — restarted entirely by `systray_watchdog.ps1`'s own dead-process detection (5s
poll, 10s down-grace). Its `onConnected()` OBS-reconnect routine was confirmed harmless beforehand
(idempotent `SetStudioModeEnabled`/transition calls, and a role-resync that only writes when OBS's
current state differs from the saved file — a no-op here since OBS's own state never changed). Verified
after: role scenes, bed mute/volume, and program scene all unchanged; the freshly booted music poller
had already picked up a live session (`Run Command`, `sessionOpen: true`).

**`launcher`** — restarted by `door_watchdog.ps1` in ~6s, the fastest of the four (5s poll, no grace
period). First post-restart poll of `/api/status` reported the world tile `up: false` — cold DNS
resolution against `uni-lab-lan.uni-lab.local` right after process boot, not a defect (`httpJson`'s
timeout is 2000ms and Node performs no DNS caching of its own). Self-corrected on the very next poll, 5s
later. Six subsequent polls all clean. The Door's own `/api/door/state` world entry was checked
separately and confirmed reading the same fixed probe.

## A false alarm I caught before reporting it

A post-restart audio meter check showed **both** `ShowRadio` and `ShowMusic` producing non-silent meter
frames (117/117 each) — for a moment this read as double audio. It was not: `GetInputMute` confirmed
`ShowMusic: muted: true` throughout. **OBS's `InputVolumeMeters` event reports a source's own decoded
level regardless of its mute state** — muting gates what reaches the program output, not what the meter
displays. A meter reading alone is not proof of program-output audibility; mute state is the authoritative
signal, and this receipt's earlier audibility claims (immediately after the initial `radio_everywhere.cjs`
apply) were always paired with an explicit mute check, so they stand. This one wasn't, initially, and it's
recorded because it could have been reported as a false defect if the mute check hadn't been run before
speaking.

## Noted, not chased

Across a short burst of `/producer/health` polls, one sample reported `tps: 199.8` sandwiched between
clean `tps: 20.0` reads, not reproduced in six immediate follow-up samples. Quoted here because the world
tile now surfaces this field verbatim and an odd number in it deserves a line, not silence. A Paper server
does not normally exceed 20 TPS; this reads as a momentary artifact in the producer's own measurement, not
a sustained state. **Diagnosing it further is the science/colony track's territory, not the studio's** —
this receipt only records that it was seen and was not persistent.

## Still open

**C4 (continuity across a program cut)** remains `NOT_MEASURED`. No cut has occurred since the gate ran.
The operator was asked again; nothing is blocked on it.
