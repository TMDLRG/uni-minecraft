# Receipt — THE ONE CHANGE: the off-monitor air alarm

**Date:** 2026-07-17 · **Track:** studio · **Surface:** THINKER · `viewer/hud/native/UNI.Hud.Widget`
**Gate:** `air-alarm-annunciates` — registered PENDING before the change.

## Why

Every prior receipt and the 88-agent sweep ended on the same standing item: **nothing in the studio
reaches a human who is not reading pixels.** The entire off-screen inventory was two systray balloons —
one about an OBS dialog, one about a downed process — neither about air. A black program kills no
process and opens no dialog, so if the world went dark while the operator stepped away, they found out
from a viewer. The walk-away leg did not exist. This builds it — the last thing standing between "you
can go live" and "you can stay live."

## What it is

Built in the **widget** (Session-0 isolation forbids the service from playing sound or showing UI in the
operator's session). The DECISION is the pure, unit-tested `AlarmEngine`; the widget owns the
ANNUNCIATION.

- **ARM** on the first fresh, MEASURED `air.streaming == true`. **DISARM** only on a fresh, measured
  `streaming == false`. **Never disarm on UNKNOWN/stale** — an alarm that goes quiet because it lost
  sight is fail-OPEN. (That is why BLIND is itself a firing code.)
- **FIRE** — three codes, each a measured fact, each gated:
  - **EGRESS COLLAPSE** — `streaming && egress.readers == 0`, held **30s** (`readers == null` never
    fires — a MediaMTX blip is silence, not a siren).
  - **KEY REJECTED** — a `fanout.*` health row `ok:false` on the **D5 uniReady branch only** (the row
    that says a platform is REJECTING while the ingest publishes — never the "YOUR KEY IS NOT
    IMPLICATED" no-publisher branch that is normal during ARM-before-CONFIRM).
  - **BLIND** — the snapshot stale (`hud.stale`, request-time) or the GET failed entirely.
- **ANNUNCIATE** — red banner in its own always-visible grid row (cannot be scrolled away) +
  `SystemSounds.Exclamation` recurring while unacked + `FlashWindowEx(FLASHW_ALL|FLASHW_TIMERNOFG)` +
  tray balloon (once per code per episode).
- **ACK** — one button per firing code: silences that code's **sound for 10 min**, auto-re-arms if it
  clears and recurs; **never clears the badge, never disarms fan-out, never cuts, never acks a
  non-firing code.** ANNUNCIATES ONLY — **G-PA untouched.**

## Proof

### The engine — 13 unit tests, rehearsed against regression

`UNI.Hud.Widget.Tests` (AlarmEngineTests) proves both halves. The **false-alarm** cases are the
load-bearing ones: `OffAir_IsSilent`, `ArmBeforeConfirm_IsSilent`, `ReadersNull_NeverFiresEgress`,
`EgressCollapse_RequiresDwell`, `Unknown_DoesNotDisarm`. The **fire** cases:
`EgressCollapse_Fires_AfterDwell`, `KeyRejected_Fires`, `Blind_Fires_WhileArmed`. The **ACK** discipline:
silences sound not badge, auto-expires, refuses a non-firing code.

Rehearsed against a deliberate regression — making a `readers == null` blip fire EgressCollapse:

```
Failed!  - Failed: 1, Passed: 34     (ReadersNull_NeverFiresEgress caught it)
```

restored → `35 / 35`.

### The wiring — LIVE, on the real widget

A mock served the widget a `LIVE_LIVE, streaming=true, egress.readers=0, armed=2` snapshot (a live black
push). After the 30s dwell the widget raised, at the very top, unmissable:

> **⚠ AIR ALARM — EGRESS COLLAPSE — live, but NOBODY is pulling the program**   [ ACK EgressCollapse ]

with the badge reading `● LIVE`, the egress tile `0/2 · ingesting, but NOBODY is pulling it`, the
taskbar flashing and the tray ballooning (`hud_alarm_firing.png`). Restored to the real OFF-AIR service,
the latch disarmed and the banner collapsed — **silent when normal** (`hud_alarm_silent.png`).

### A crash I introduced and fixed (found the hard way)

Tearing down the mock restarted the real service, which serves `hud.last_poll_age_ms: null` before its
first poll. The widget's `TryPath2(...)?.GetInt64()` (from the B4 footer work) only guards an ABSENT
path, not a present-but-JSON-**null** value, so `.GetInt64()` threw `InvalidOperationException` — and in
an `async void` timer tick that **crashed the whole widget** (Application event log APPCRASH, 12:15:40).
The glance surface — the thing that exists to say when something is wrong — must never be the thing that
dies. Fixed at source: null-safe `NumL`/`NumI` helpers over all ten numeric extractions in `Refresh`.
Backstop: the tick is now wrapped so any future per-tick fault is swallowed-and-logged and the next tick
retries. Redeployed widget stable 20s+ across the exact restart window that crashed it.

**Verdict: PASS** — the alarm fires on a measured dark air, stays silent off-air and through the
ARM-before-CONFIRM window and a MediaMTX blip, and the surface no longer crashes on a null.

## Fence / NOT VERIFIED

- The **on-REAL-air** annunciation (a genuine dark platform during an actual broadcast) is exercised in
  WS-F — the mock proves the wiring, not a real show.
- KEY REJECTED is an **inference** from a flapping pusher against a publishing ingest, not a measurement
  of the far end. Platform acceptance stays NOT VERIFIABLE locally.
