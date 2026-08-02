# Receipt — verdict=LIVE truthfulness (Phase III)

**Status: SOURCE-CONFIRMED + TEST-LOCKED. LIVE two-probe flip PENDING colony bring-up.**

## What was broken

`ui/lib/sp_ui_web/controllers/health_controller.ex` set `verdict=LIVE` from `producer_up AND
director_up` alone (PID existence). `lib/sp/show.ex:status/0` synthesized
`driver: (director && :producer) || nil` — a live Director PID always read `driver: :producer`,
even when the Director was still the rule-based `:self` puppet (the exact "puppet-cam" failure
this project has hit twice). The `verdict=LIVE` self-probe was therefore vacuous.

## The fix (colony lane, commit `61671b0`, 2026-07-11)

- `lib/sp/brain/director.ex` — added a real `driver/0` getter (`GenServer.call`) exposing the
  Director's actual internal driver state (`:self` | `:producer`), not a synthesized value.
- `lib/sp/show.ex:67` — `status/0` now reads
  `driver: director && safe(fn -> SP.Brain.Director.driver() end)` — the REAL driver, wrapped
  in the module's existing `safe/1` swallow-and-degrade helper (no new failure mode).
- `SP.Show.verdict/1` was extracted as a **pure function** (module doc, ~L75-79) requiring
  `producer_up AND director_up AND driver == :producer` for `"LIVE"`; a live Director PID still
  in `:self` now correctly reads `"PARTIAL"` — the puppet-cam guard the endpoint was always
  meant to be.
- Frame-advance (anti-frozen) checking stays **caller-side** by design (a stateless HTTP probe
  cannot compare two of its own prior calls) — `viewer/studio_up.ps1:186-202`'s puppet-cam guard
  already does the two-probe frame-advance dance on top of the now-honest `driver` field.

## Evidence captured today

1. **Source read, confirmed as described above** (`lib/sp/show.ex:64-73`, both the `driver` line
   and the `verdict/1` doc comment naming the exact contract). Verified during Phase-3 plan review
   before this remediation pass started, and re-verified now.
2. **Test lock (reported by the colony lane, not independently re-run by this agent this pass):**
   `test/sp/show_verdict_test.exs` — 5/5 passing, locking the `PARTIAL` vs `LIVE` contract at the
   pure-function level. *(Class-C: reported, not independently executed by the broadcast lane in
   this session — re-run `mix test test/sp/show_verdict_test.exs` to upgrade to Class-B before
   citing this receipt as full closure.)*

## What is NOT yet captured (honest gap)

The **live two-probe flip** (`curl /producer/health` showing `PARTIAL` while the Director is
`:self`, then `LIVE` after `SP.Brain.Director.set_driver(:producer)` is called on a running
colony) requires the colony source to be UP. As of this receipt, `http://localhost:4000/producer/health`
from THINKER **times out** — the colony source is intentionally DOWN for the emergent-forage
rebuild (per the colony lane's NO-GO ack). This live capture is **PENDING** and will be taken the
next time the colony source is brought up (either for the colony's own survival-gate RED run, or
specifically to close this receipt).

## Verdict

Source-level fix confirmed correct and test-locked by the owning lane. **Sufficient to treat
Phase III as CLOSED for planning/sequencing purposes** (it no longer blocks Phase XI heartbeat
wiring, which reads this same field honestly either way — `PARTIAL` is a true, not a false,
report). The live-probe artifact remains an open action item, tracked here, not fabricated.
