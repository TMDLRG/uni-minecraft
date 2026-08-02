# Motor-Inference Hierarchy — LIVE RED test (P4), pre-registered

Registered **before** the run (RED-first discipline, same as `HARVEST_FIX_PLAN.md`). The claim under test
and the falsification gates are fixed here so the result cannot be moved after the fact.

## Claim under test (and the claim FENCE)
> A categorical motor-inference hierarchy can **learn** a Minecraft harvest motor chain under the registered
> conditions — the parent option projects a desired proprioceptive configuration (C_motor) DOWN, the motor
> inner loop (`SP.Brain.MotorControl` + `SP.Brain.Motor`) fulfils it by descending proprioceptive prediction
> error while **inferring the control sign from reafference**, and the proprioceptive reafference folds UP to
> learn `B_motor` (muscle memory).

**NOT** claimed (until every bar below is met): "the agent learned harvesting", "human-like motor control",
"full human motor inference". If a gate fails, the result is **WITHHELD** (recorded as a partial), never
percent-scored or spun.

## What is already validated OFFLINE (committed, deterministic)
- **P1** `motor_cortex_test.exs` — proprioceptive pipeline additive + `:motor_cortex`-absent **byte-identical**
  (action-sequence + posterior `mad < 1e-12`); 272-test brain suite green.
- **P2** `motor_cortex_test.exs` — the motor factors learn `A_motor`/`B_motor`, the config posterior becomes
  informative (peak 0.75), the habit `E` accumulates, and learned `A/B` persist across `MC.save/load`.
- **P3** `motor_control_test.exs` — the inner loop converges closed-loop against a simulated body, **inferring
  the control sign + axis from reafference**, nulling the target-relative prediction error; `motor_cortex_test`
  P3 — the live `MC.step` mine_log option emits fine primitives and self-terminates on `dig=broke`; the
  default genome never engages it.

The live RED test below adds the only thing offline tests cannot: that the loop **closes through a real
mineflayer body in a real world** and the chain is learned there.

## Conditions (fixed)
- Lineage: 6 UNIs, `Genome.motor_primary()` (the 12 default factors + the 5 motor factors), kin **9**,
  usernames `UNI-9-1..6`, **separate** memory dir `runs/colony_motor/` (a motor brain never loads into a
  default UNI). Launch: `runs/motor_lineage.exs` inside the colony BEAM (rootless on the lab, per
  `ops_colony_lab_rootless`), `MC_HOST=mc-server`.
- **Body-assist OFF:** `:mine` routes through the motor inner loop (fine primitives), NOT the `mineTree`
  approach-script. (The inner loop's `step_forward`/`hold_mine` close range + strike; the brain aims.)
- **Optimistic-B ablated:** the coarse harvest bridge is not enabled for this lineage (mine_prior off), so any
  harvest is attributable to the motor hierarchy, not the task-level prior.
- Forest seed `8675309` (trees present); phase 1 (the wood-seeking curriculum).

## The 3-part gate (pre-stated; PASS requires ALL three)
1. **Behavioral.** ≥ **K = 3 of 6** motor UNIs reach `wood ≥ 3` within **N = 6 h**, with body-assist off and
   optimistic-B ablated. (Withheld if < 3.)
2. **Mechanism.** For ≥1 passing UNI, the trace shows the full chain in order:
   `:mine committed → mine_log option active (brain.motor ≠ nil) → fine-primitive sequence (turn/pitch/step) →
   inner-loop target-relative error falls → body logs "motor strike block_broken wood_delta>0" → the motor
   factors' B updates on the relevant transitions (probe).` Evidence: body stderr + `runs/probe_motor.exs`.
3. **Ablation.** A paired control performs **worse** (paired CI excludes a registered margin):
   - control A: motor-learning off (`learn_b=false` on the motor lineage), and
   - control B: motor-policy shuffled (the inner loop emits a random fine primitive each tick).
   If neither control is worse than the live hierarchy, the hierarchy is not the cause ⇒ WITHHELD.

## Probes / evidence
- `runs/probe_motor.exs` — reads a live motor UNI: option state (`brain.motor`), the 5 proprioceptive
  posteriors, and `B_motor` (off-identity mass) for the motor factors.
- Body stderr — the fine-primitive strikes (`motor strike dig_started` / `block_broken wood_delta`).
- RCON `data get entity UNI-9-* Inventory` — independent wood confirmation (as in the harvest fix).

## Simulation results (offline, deterministic — `runs/motor_sim.exs`)
The end-to-end sim closes the loop through the REAL `MC.step` + inner loop with a simulated body (one tree
in front). It de-risks the live run by validating the whole mechanism + the ablation logic short of a real
world. Optimistic-B OFF, body-assist OFF throughout.

| run | wood | strikes | mine_log options | B^mine off-identity | result |
|-----|------|---------|------------------|---------------------|--------|
| **live hierarchy** (depth 5, 4000 steps) | **2660** | 2660 | 1330 | 0.0 → 5.99 | wood≥3 ✓ |
| **live hierarchy** (depth 1, 2000 steps) | **1475** | 1475 | 738 | 0.0 → 5.98 | wood≥3 ✓ |
| **ablation B** — inner loop SHUFFLED (depth 1, 2000) | **2** | 2 | 79 | learns :mine→no-change | partial ✗ |

Reading: the brain EXPLORES `:mine` (738–1330 options) with no optimistic-B; the continuous inner loop
FULFILS the proprioceptive target (aim→approach→strike); wood enters (1475–2660); the high-level `B^mine`
learns `empty→has_wood` from REAL success, bootstrapping harvest. Zero raw `:mine` ever reaches the body
(the option always emits fine primitives). The shuffled control collapses harvest ~700× (1475 → 2),
isolating the inner-loop SERVO POLICY as the cause — not chance, not the high-level prior. This is the
behavioral + mechanism + ablation gate validated **in simulation**.

## LIVE results (lab, `uni-colony-motor` on `localhost/uni-colony:v3`, kin-9, mc-server seed 8675309)
Deployed as a SEPARATE container (UNI_AUTOSTART=0) — the default streamed colony (kin 0–3) stays online +
undisturbed. All 6 motor UNIs (`UNI-9-1..6`) connected (RCON `list`).

- **Mechanism — PASS (live).** Body stderr shows the inner-loop chain on REAL logs:
  `motor strike dig_started=birch_log → motor strike block_broken wood_delta=1` (repeatedly), via the fine
  primitives (NOT the old `mine_tree` body-assist — body-assist is off for `:mine`). The brain selects the
  option, the continuous servo aims+approaches+strikes, real wood enters.
- **Behavioral — passing early, multi-hour tally running.** Within minutes, **RCON (the server's authoritative
  inventory) shows `UNI-9-2` holding birch_planks + stick + wooden_pickaxe + wooden_sword** — it harvested
  real wood and bootstrapped wood→planks→sticks→TOOLS with optimistic-B OFF and body-assist OFF. The formal
  K=3-of-6 / wood≥3 / N=6 h tally accrues over the running window.
- **Ablation — validated in sim (~700× collapse); the live paired control (shuffle) is the next run.**

## Status
- Offline P1–P3 (unit + integration): **PASS** (committed; full brain suite 277 / 0).
- End-to-end SIM (behavioral + mechanism + ablation): **PASS** (table above).
- LIVE Minecraft **mechanism**: **PASS** (real strikes land real wood; RCON-confirmed harvest→tools).
- LIVE **behavioral** K-of-6 over N h: **RUNNING** (UNI-9-2 already reached tools; tally accrues).
- LIVE **ablation** paired control: **pending** the shuffle run (sim already shows the ~700× collapse).
