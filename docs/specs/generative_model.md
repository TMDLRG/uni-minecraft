# Generative model + invariants + RED discipline — the A4 backbone

> The shared substrate both A4 organs (`curriculum_removal.md` = survival-C; `sensorium.md` = binocular vision)
> sit on. Design-only; ship gate = a formal `/lab-team-review` MERGED VERDICT + owner go-ahead before code.
> Corrections folded from the 2026-07-11 review (`docs/receipts/a4_lab_team_review.md`).

## 0. The developmental ladder — MOTIVATION, not a realized substrate (blocker #10)
The cookbook ladder (L0 genome → L1 viability → L2 metabolism/interoception → L4 affect-as-precision → L5
sensorimotor → L6 perception) and the owner's "tail-up, deepest/slowest first, layers develop up/over at
different frequencies" are the **design intuition** that orders the work: survival-C first (the base), vision
after (a faster layer). **This framing is aspirational, not current code — do not cite it as implemented:**
- **Per-factor timescales (yuga 4:3:2:1):** NOT implemented. `precision.ex:44-49` uses GLOBAL constants
  (`@rho/@kappa/@eps0/@g_min/@g_max`) — no per-factor timescale, decay half-life, or count floor.
- **Cavity / deep-hierarchy (M22):** NOT live. `hierarchy2.ex:20` states verbatim it is "NOT wired into the
  live decide path."
**Binding consequence:** neither RED-A nor RED-B may DEPEND on per-factor timescales or the cavity hierarchy.
They currently do not — keep it that way. A real per-factor-timescale substrate is a separate, later,
falsifiable rung with its own spec + RED.

## The per-factor generative model (what IS live)
Mean-field multi-factor categorical active inference; the joint `q(x)=Π_f q(x_f)` is never materialised
(`factors.ex:14-17`). Per factor `f`:
- **A** (`model.ex`): likelihood, `Ns` columns of length `No`, column-major; Dirichlet `pa = A·1 + 1`
  (`model.ex:84,115`), learned online (`learn_a`).
- **B**: per-action transition `B^u`; identity ("states-persist") by default; non-identity only for the
  metabolism emptying/filling B (`designer.ex:97-101`, `pb_seed`).
- **C**: action-independent per-factor log-preference; **fixed per genome, never learned** (no `learn_c`/`pc`).
- **D**: uniform initial-state prior.
- **E**: policy/habit prior (`ln E` added to the policy logits).
- **EFE** (`efe.ex:87-101`): `G(π) = −Σ_f [ epistemic_f + pragmatic_f ]`, with
  `epistemic_f = H(qo_f) − E[H(o|s)]_f` (+ parameter-novelty `W` when `novelty_gain>0`) and
  `pragmatic_f = qo_f · C_f` (`efe.ex:99`). Policy posterior `q(π) = softmax(γ·(−G) + ln E)`.

## No-smuggled-reward — the PRECISE statement (blocker #11)
The earlier spec said "C never enters A/B/D/policies" — **that is false and self-undermining.** C **does** enter
the policy posterior: it is the pragmatic term `qo·C` at `efe.ex:99`, the ONLY C pathway. The correct,
defensible invariant set:
1. **C is UN-LEARNED** and disjoint from the A/B/D tensors (no `learn_c`, no `pc`; `genome.ex:239`). Preferences
   are a fixed genome property, modulated only transiently at runtime and stripped by `demodulate` (`mc.ex:293-298`).
2. **The epistemic + parameter-novelty channel is C-independent** and decays monotonically to 0 as Dirichlet
   counts → ∞ (`Novelty.w_a`; invariant #4) — the no-smuggled-reward proof.
3. **No scalar-per-action term** in the policy logits: `u` enters `plan.ex` only through the transition column
   `B^u` and the `W_b` novelty column, never as an action identity or per-action scalar (action-clone test).

## Cross-cutting invariants + guards (both organs clear these)
| # | Invariant | Guard |
|---|---|---|
| 1 | Byte-identical `default/0` (additive+gated) | `decider_byte_identity_test.exs`, `mad<1e-12` vs golden over depth-5 Plan |
| 2 | No scalar-per-action | `action_clone_invariance_test.exs` A1/A2/A3 on an informative-A factor |
| 3 | Additive + gated; new factors appended LAST **and read by name, not tail position** | see `sensorium.md` §II.6 (motor_config reindex) |
| 4 | Monotonic decay of any info term (W→0 indep. of C) | `Novelty` prior-floor; V5 |
| 5 | G5b action-severed twin (ENERGY axis, ≥ replication set, p<0.05) | un-passed ⇒ strike "survival/life" language |
| 6 | Claim fence — behaviour only, zero weight for experience/life | `LAB_PROTOCOL.md` §VI |
| 7 | One-cure-at-a-time (paired arms differ in exactly ONE gated field) | probe-asserted equality of all else |
| 8 | Thrice/independent validation (RCON + brain-probe + committed receipt) | ≥ replication set |
| 9 | Held-once + CI-excludes-threshold; PASS/PARTIAL/FAIL/WITHHELD | — |

## RED discipline (shared by RED-A and RED-B) — corrections #6/#7/#8/#15
- **Activation gate FIRST, numeric (Phase-2's missing receipt).** Before scoring any behaviour, a
  pre-registered NUMERIC bar must prove the organ is mechanistically live: RED-A = energy-posterior depletion
  slope + G5b twin p<0.05; RED-B = held-out cortex free-energy drop (nats) + `:scene`/`:depth` posterior
  concentration (A leaves uniform). **Activation-miss ⇒ WITHHELD, never FAIL** (Phase-2 §16 rule). (#6, #15)
- **Replication unit = distinct WORLD-SEED, ≥5 (blocker #7).** N UNIs in a single forest seed (8675309) share
  terrain/mobs/weather — they are NOT independent replicates; a paired CI over them understates variance (the
  §16 "N=6, p≈0.73" artifact). Register ≥5 distinct world-seeds (or a clustered/within-world-correlated CI);
  the CI-excludes-threshold verdict (inv #9) is unsound until the replication unit is defined.
- **World-ceiling reference = ONE role, pinned before T0 (blocker #8).** A non-learning reference controller
  (scripted/oracle, exact seed/world/body) establishes reachability. It is a **ceiling** (target unreachable
  by the reference ⇒ the negative is a WORLD ceiling ⇒ WITHHELD, re-scope the world) — NOT also the PASS floor.
  Pre-register the reference's exact spec + its single role + run it and pin its numeral before treatment T0.
- **Qualitative → numeric (blocker #6).** Every "collapses / FE drops / accumulates" becomes a pre-registered
  numeral (FE-drop in nats, recognition-accuracy Δ, depth-discrimination AUC, twin p-value) touched held-once.
- **Continuous collector, pre-registered (blocker #15).** Name the harness-managed RCON ≤10-min time-series +
  start/mid/end brain probes (survives context compaction) in each RED doc — Phase-2 froze ~day-2 and only the
  26k-row series caught it.
- **Staging:** RED-A verdicted → THEN RED-B live T0. Never combine (one-cure-at-a-time).
- **G6 is never weakened** (owner R1) and is a **SECONDARY, expected-FAIL** observation for either single cure
  (survival-C-alone / vision-alone are "necessary not sufficient"); a G6 non-move is neither a pass nor "the
  cure failed" (Phase-2's exact mis-read).
