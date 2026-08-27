# Receipt — the channel watchdog can now tell a live window from a live PAGE

**2026-08-03, ~hour 27 of a public run. Written while live.**

## What was wrong

`channel_windows_watchdog.ps1` checked **process existence only**. Its own header said so, and so did
`studio_up.ps1` step 4a:

> it checks PROCESS EXISTENCE only. A live Chrome process whose PAGE has died to an "Aw, Snap!"
> error is PRESENT, so this guard returns healthy for it -- which is exactly the state that put a
> crash page on air on 2026-08-03.

That is not a hypothetical. Earlier the same night `cap_overlook` sat on a Chrome crash page and it
went to program. Every instrument said healthy:

| instrument | what it said | why it was blind |
| --- | --- | --- |
| `channel_windows_watchdog` | process present | a crashed renderer lives inside a live process |
| OBS source state | `pictureOnProgram: true` | measures SOURCE ENABLEMENT, not pixels |
| `bmpNonblackFrac()` | `frac = 1.0` | it is a FLOOR with no ceiling; a WHITE crash page scores the maximum, above a real world render's 0.999 |

**The operator's eye caught it. No instrument did.**

## What was built

**`viewer/channel_probe.cjs`** — one verdict, one word, over CDP.

It does **ONE synchronous DOM query** and nothing else. No rAF, no timing loop, no screenshot. That
is a hard design constraint, not a style choice: `probe_render.cjs` and `probe_world.cjs` run a
3-second `requestAnimationFrame` loop inside these same WebGL pages, and every pusher-exit cluster in
a 30-hour ledger lands on that kind of activity. There is a 13h43m stretch with zero exits between
them. This probe is designed to be safe to run every 20s forever, on air.

Exit codes: `0` ALIVE, `1` DEAD (`ERROR_PAGE|NO_TARGET|UNRESPONSIVE|NO_APP|NO_BODY`), `2` UNKNOWN
(`NO_CDP`). **2 is not 1, on purpose** — "I cannot tell" must never be actioned as "it is broken".

**`Ensure-PageAlive`** in the watchdog, with three fences before it may act, and a fourth after:

1. **UNKNOWN takes no action.** Any exit code that is not exactly 1 returns without acting.
2. **Program scene unreadable → refuse.** `Get-ProgramSources` returning `$null` is treated as ON AIR.
3. **Source on program → refuse and say so loudly.** A dead page on air is the operator's call, not a
   timer's. Logged as `OPERATOR ACTION NEEDED`.
4. **300s reload rate limit.** A reload loop is how the world view was lost for hours earlier tonight.

The on-air fence exists because of `ui/lib/sp_ui_web/live/stream_live.ex:263-265`, which says it
outright: *"we never reset an already-rendering view (which blanks the terrain)"*. Reloading these
pages after the camera's bot has settled BLANKS THE WORLD. I did exactly that earlier tonight, having
been warned in writing by the codebase.

## Proof — all four fences, measured

Run against the **real shipped functions** (the script body loaded up to its main loop, only `$ROOT`
pinned because `$PSScriptRoot` is empty under `Invoke-Expression`). Program at the time was
`cap_colony, ovl_voice`.

```
PAGE TEST-A DEAD (NO_TARGET) and cap_colony is ON PROGRAM - refusing to reload. OPERATOR ACTION NEEDED.
PAGE TEST-B DEAD (NO_TARGET) OFF-AIR -> reloaded via CDP 9220
PAGE TEST-B DEAD (NO_TARGET) but reloaded 2s ago (< 300) - backing off
PAGE TEST-C DEAD (NO_TARGET) but program scene UNKNOWN - refusing to reload (fail safe)
```

Both directions proved: it **refuses** on air, **acts** off air, **backs off** when repeated, and
**fails safe** when it cannot see the program. The real colony page probed `ALIVE` immediately
afterwards — the test touched nothing.

Probe itself tested four ways: colony ALIVE(0), overlook ALIVE(0), no CDP → NO_CDP(2), bad URL →
NO_TARGET(1).

## Cost to the audience: zero

`dual_push` restart counts were **13/14 before and 13/14 after**, `up_s` 4102/4104 — 68 minutes
unbroken across the whole of this work. That is the only honest air measure; OBS `congestion` and
`skipped` sit upstream of the fan-out and are structurally blind to a gap.

## A correction worth keeping

My first proof harness reported nothing at all, and it was **my harness that was broken, not the
code** — `Invoke-Expression` leaves `$PSScriptRoot` empty, so `$ROOT` resolved to the wrong directory
and `Write-Log` wrote to a path that did not exist while `$ErrorActionPreference =
'SilentlyContinue'` swallowed the failure. Had I read that as "the fence is silent, therefore it
refused", I would have shipped an unproven fence and called it proven. The differential (B reached
node, A and C did not) was the tell.

I also shipped the header with box-drawing characters in it, which would have broken the `ascii_lint`
gate — 177 non-ASCII bytes, caught by checking rather than assuming. Now 0.

## What this does NOT close

- **It cannot tell a RIGHT picture from a WRONG one.** It asserts a page is rendered and is the right
  app. Whether the camera is pointed at the world or at empty sky is still the operator's eye.
- The **FLAT/FROZEN** detector (PLAN 6 phase 3) is still unbuilt — `bmpNonblackFrac()` still has no
  ceiling, so a white page still scores 1.0 in `command_center`. This guard catches the crash page at
  the *window* layer; the *pixel* layer is still blind to it.
- Nothing here annunciates to the operator except a log line. Wiring it to the ticker and to
  `:8106/api/say` is the open follow-up.

## Files

- `viewer/channel_probe.cjs` (new)
- `viewer/channel_windows_watchdog.ps1` — `Get-ProgramSources`, `Probe-Page`, `Ensure-PageAlive`,
  `Sweep-Channels`, `-MinReloadSec` (default 300)

Verified: 0 parse errors, 0 non-ASCII. Watchdog restarted onto the new code at 16:17:58, PID 11488.
