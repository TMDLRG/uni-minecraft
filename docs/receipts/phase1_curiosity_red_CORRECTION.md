# P1 curiosity RED — magnitude correction (2026-07-11)

**Status:** the P1 verdict (**PARTIAL** — HOARD suppressed, PLATEAU-BREAK failed) is **unchanged**. Only the
**magnitude** of the HOARD result is corrected. This memo is committed so the over-claim and its refutation
both live in the evidence chain (honesty lock, Track A1).

## The withdrawn claim
Three docs stated the HOARD result as **"curiosity Σpickaxes = 1 (max 1) vs control Σ = 25 (one UNI at 24),
25× reduction"** over a **"9 h"** run:
- `docs/DEEPENING_PLAN.md` (CURRENT STATUS, P1 line)
- `docs/UNI_MISSION_DEEPENING.md` (§ LIVE paired RED, HOARD gate bullet)
- `docs/specs/metric_plateau_break.md` (the "P1 PARTIAL is the template" quote)

## What the sole committed receipt actually shows
`docs/receipts/phase1_curiosity_red.log` — 11 cycles, 16:45→18:25 (**~110 min, not 9 h**). Arms: **kin-10 =
treatment (curiosity, gain 0.5)** = UNI-10-*; **kin-11 = control (gain 0)** = UNI-11-*.

Settled cycle (cycle 11) pickaxe counts:

| arm | per-UNI pick | Σ pick | max single |
|---|---|---|---|
| **treatment (kin-10)** | 0, **10**, 0 | **10** | 10 (UNI-10-2) |
| **control (kin-11)** | **24**, 0, **21** | **45** | 24 (UNI-11-1) |

**Ratio ≈ 4.5×**, not 25×. The trajectory: control grows two runaway hoarders (UNI-11-1: 3→16→24→24;
UNI-11-3: 1→10→22→21); treatment holds one residual hoarder (UNI-10-2 flat at ~10) with the other two near 0.

## Where the "1 vs 25 / 25× / max 1" numbers came from
The headline **cherry-picked a single control hoarder** (UNI-11-1 at 24 ≈ "25") and reported treatment as
"1 (max 1)" — which **ignores the second control hoarder** (UNI-11-3 at 21) and the **residual treatment
hoarder** (UNI-10-2 at 10). No committed receipt supports "1", "25", "25×", "max 1", or the "9 h" duration.

## Corrected statement (receipt-backed)
> **HOARD gate PASS (direction only).** At the settled cycle, curiosity Σpickaxes = **10** (one residual
> hoarder) vs control Σ = **45** (two runaway hoarders) — **≈4.5× fewer**. The runaway pickaxe attractor
> reproduced in control and was **suppressed, not eliminated**, in curiosity. **PLATEAU-BREAK gate FAIL**
> (no cobble either arm). **Verdict: PARTIAL** (unchanged).

## Second committed data point (baseline snapshot, recovered 2026-07-11)
The lab-box baseline `~uni/baseline/2026-06-25/rcon/` is now committed at
`docs/receipts/phase1_baseline_2026-06-25/` (the 6 kin-10/11 inventory snapshots). Counting pickaxes at that
single snapshot (2026-06-25 20:17):

| arm | per-UNI pickaxes | Σ | max hoarder |
|---|---|---|---|
| treatment (kin-10) | UNI-10-1=0, 10-2=1, 10-3=13 | **14** | 13 |
| control (kin-11) | UNI-11-1=23, 11-2=0, 11-3=0 | **23** | 23 |

**≈1.6× fewer** at this snapshot — again a **modest, noisy effect with a hoarder in BOTH arms**, and again
**nothing near "1 vs 25 / 25× / max 1."** Two independent committed data points (the ~110-min log: 10 vs 45,
~4.5×; this baseline snapshot: 14 vs 23, ~1.6×) agree on **direction** (treatment fewer) and on **magnitude
being modest (~1.6–4.5×), not 25×.** Both are single/short snapshots, not a powered time-series — so P1's
honest status is "curiosity **suppressed** the runaway pickaxe attractor (direction only, modest, noisy);
PLATEAU-BREAK FAIL; verdict PARTIAL." No committed evidence supports the withdrawn 25× headline.
**No headline outruns its committed receipt.**
