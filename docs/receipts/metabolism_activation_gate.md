# Metabolism activation gate — the energy-posterior receipt Phase-2 lacked (2026-07-11)

> **✅ SUPERSEDED FORWARD BY `docs/receipts/metabolism_activation_gate_LIVE.md` (production PASS).**
> This receipt is the OFFLINE proof: the organ dynamics are correct *when driven* (pos/neg/neg/pos + reproduction).
> The live wiring gap that made it inert in Phase-2 has since been remediated (`88be5c9`, `383ffb4`, `535f9b6`,
> `a9b1508`) and the live pos/neg/neg/pos gate PASSED in production (2026-07-11, receipt above): 3 agents on
> mc-server all `alive_final=true` with 8–10 energy-posterior reversals; NEG-1 severed-action twin dies @ 25;
> NEG-2 severed-food dies @ 16. **Activation is proven both offline AND in production.**

**What this closes.** Phase-2 §16 / `docs/receipts/phase2_metabolism_red.md` recorded the metabolism
hypothesis as **WITHHELD** because *organ activation was unverified* — "G5b un-passed and no energy-posterior
receipt." This is that receipt: a rigorous **positive / negative / negative / positive** proof that the
`:metabolism` organ is **mechanistically live**.

**Harness:** `runs/metabolism_activation_gate.exs` (deterministic; `mix run --no-start`). **Verdict: PASS.**

## Pre-registered bars (pinned before the run)
- POSITIVE PASS: survive ≥120/150 ticks AND ≥2 energy-posterior direction reversals AND E[bin] range ≥1.0.
- NEGATIVE PASS-as-negative: dies at tick < 60 (no sustained viability).
- G5b margin (acting lifetime − twin lifetime) > 0.

## Results
| arm | condition | outcome | energy posterior |
|---|---|---|---|
| **POS-1** | fed + acting, seed 7 | **survives 150** | 68 reversals, amp 1.94 (depletes ↔ refills) |
| **NEG-1** | action-severed twin (forced :noop) | **dies @ 25** | monotone drain, no refill |
| **NEG-2** | acting but `inv.food=0`, seed 7 | **dies @ 16** (4 failed eats) | monotone drain to empty |
| **POS-2** | fed + acting, seed 42 | **survives 150** | 35 reversals, amp 2.55 |

**G5b margin = 150 − 25 = 125 > 0.**

## What it proves (and its bounds)
Viability is **action-dependent** (NEG-1: no action → death) AND **food-dependent** (NEG-2: action without a
real-food refill → death), while the fed+acting agent **sustains** via an energy-posterior limit cycle
(POS-1) **reproducibly** across seeds (POS-2). Two structurally-distinct negatives (severed action vs severed
food) rule out a decorative edge — the organ implements a genuine food-contingent homeostat that modulates
action to keep an internal store viable.

## Honesty fence (binding)
- **Scope = ACTIVATION / mechanism only.** This upgrades P2's activation from *WITHHELD* to **VERIFIED —
  OFFLINE**. It is a synthetic-world proof; a **production** (live colony against `mc-server`) energy-posterior
  receipt is the next confirmation. Do not present this as a production result.
- It says **nothing** about **G6** (behavioural plateau-break), which **FAILED** live in Phase-2 and remains
  open. A live activation ≠ a live behavioural cure.
- **Claim fence:** `energy` is a model variable, never a felt state. This is homeostatic self-maintenance —
  self-maintenance, **never** experience / hunger-as-felt / life / awareness.
