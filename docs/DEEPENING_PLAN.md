# Execution Plan — UNI Deepening: break the plateau, then grow organs/spine/glands/hemispheres

> **Durable in-repo copy of the execution plan** (the live working copy is
> `~/.claude/plans/prancy-launching-teapot.md`, which is session-local; THIS file is the version that
> travels with the repo). Read alongside `CLAUDE.md`, `docs/LAB_PROTOCOL.md`,
> `docs/UNI_MISSION_DEEPENING.md` (mission + 5 signed consults + verdicts), and `docs/lab_team/`.

## CURRENT STATUS (2026-06-24) — read this first
- **P0 — DONE.** Shadow-EFE audit (`lib/sp/brain/diagnose.ex` + `runs/probe_plateau.exs`) on the real
  hoarders' `.bins`. H0 = **epistemic_starvation** (NOT γ-runaway, NOT curriculum-ceiling; epistemic/
  pragmatic ratio ~0.01, flat EFE landscape). → proceeded to P1.
- **P1 — DONE offline; LIVE RED = PARTIAL.** Novelty term (`lib/sp/brain/novelty.ex`, gated `novelty_gain`
  default 0.0). Offline ✓ (byte-identical at 0 mad<1e-12, monotonic-decay, C-independent, bounded;
  exploration entropy 2.29 vs 1.91). LIVE paired RED (kin-10 gain 0.5 vs kin-11 gain 0): **HOARD gate PASS
  (direction); magnitude CORRECTED 2026-07-11** — the committed receipt
  (`docs/receipts/phase1_curiosity_red.log`, ~110 min / 11 cycles) shows at the settled cycle treatment
  Σpickaxes=10 (one residual hoarder, UNI-10-2 at 10) vs control Σ=45 (two runaway hoarders, UNI-11-1 at 24
  + UNI-11-3 at 21) — **≈4.5× fewer**; the runaway pickaxe attractor reproduced in control and was
  *suppressed, not eliminated,* in curiosity. **The earlier "9 h / Σ=1 vs 25 / 25× / max 1" figures have no
  committed receipt and are withdrawn** (see `docs/receipts/phase1_curiosity_red_CORRECTION.md`).
  **PLATEAU-BREAK gate FAIL** (no cobble either arm, phase tied 3.67; action-entropy advantage decayed to 0
  as W→0 — the no-reward guarantee). PARTIAL: novelty suppresses the hoard manifestation, NOT the
  standing-drive deficit. Verdict + receipts in `docs/UNI_MISSION_DEEPENING.md`.
- **Lab-team review of the P1 verdict: MERGED = SIGN-WITH-CHANGES** (math SIGN; arch SIGN-WITH-CHANGES;
  experiment SIGN-WITH-CHANGES; embodiment SIGN). **4 REQUIRED ARTIFACTS before Phase 2 code:**
  1. Typed model spec `docs/specs/novelty.md` (StateSpace/Observation/Action/Preference/Policy/Learning/
     Precision/ValidationAnchors/ClaimFence) — the template all Phase-2 organs inherit.
  2. **Hardened collector** — `systemd` unit or harness-watchdog (the P1 bash collector died at 100 min);
     **N ≥ 6 per arm** for Phase 2.
  3. **Better behavioural metric** — replace the perverse `phase_goal_met?(3) = wood≥8 ∧ tools≥1` (which
     hoarding itself satisfies) with **distinct-resource-types-touched** / `placed_blocks > 0`.
  4. **Phase-2 organ design goes through `/lab-team-review` BEFORE any code** — no exceptions.
- **Artifacts 1–4 PRODUCED (2026-06-24, workflow `wf_97fde3a9-83c`):** `docs/specs/novelty.md` (typed
  template), `docs/specs/metric_plateau_break.md` (placed/used-blocks>0 + distinct-types, RCON-authoritative,
  no-compromise), `docs/specs/collector.md` + `ops/phase2_collector/*` (defense-in-depth: systemd user-timer
  + podman sidecar + harness task + `uni-lab-79740c` vantage, N≥6/arm), and `docs/specs/phase2_metabolism_packet.md`
  (the full-organ Phase-2 design). The packet went through **`/lab-team-review`**.
- **Phase-2 packet verdict: MERGED = SIGN-WITH-CHANGES** (math/arch/exp SIGN-WITH-CHANGES; embodiment REJECT
  elevated to blocking changes). Receipt = packet §9. **10 BLOCKING changes before any Phase-2 code**, two
  code-confirmed by the orchestrator: (B1) the strong-Dirichlet seed mechanism is NON-FUNCTIONAL —
  `model.ex:70-71` `norm_cols` runs before `:84-85` `add1`, so a real typed concentration seam is required;
  (B2) the live `bridge.ex` has NO viability edge (`metabolize`/`Viability`/`shutdown` are Sim/Eval-only), so
  `:energy` must bind to the live MC food/health channel (or a homeostatic-death coupling) + an action-severed-
  twin gate, or the "life" framing is struck. Plus: V6 action-clone test must be authored (G0 BLOCKED-PENDING-V6);
  limit-cycle (G2/G4) derived-or-reclassified; satiety→C whitelist; `:b_init` atomic two-edit; learn_b
  expressibility; gate numerals + BASELINE_WOOD pre-registered.
- **Repair pass DONE + re-verified (2026-06-24).** `docs/specs/metabolism.md` authored (the shippable typed
  spec closing all 10 blockers at the DESIGN level; owner B2=Both + B4=derived baked in); packet §10 = the
  repairs map. B4 limit-cycle/allostasis DERIVED with a runnable receipt `runs/phase2_homeostat_demo.exs`
  (limit cycle robust; allostasis TUNED, work_bonus≳4). Re-verify (`wf_352db2b5-946`, math/arch/red/embodiment
  + merge): **DESIGN-COMPLETE-SIGN** (no blocker left open; receipt re-reproduced) — recorded in metabolism.md §15.
- **CODE PASS — STARTED (owner: "1 then 2").** Pure tests DONE + green on HEAD: **V6** action-clone-invariance
  (`test/sp/brain/action_clone_invariance_test.exs` — G0's V6 condition met, no per-action scalar) + **V1**
  byte-identity golden (`decider_byte_identity_test.exs` + `test/fixtures/decider_golden_seed7_d5b3.bin`,
  frozen HEAD reference). **Full brain suite 281/0.** No `lib/**` changed (additive test files only).
- **ORGAN 2a DONE + VERIFIED (generative structure, additive + gated).** Implemented the SEAMS: `model.ex`
  `:pb_seed` concentration (κ=1.0 byte-identical to `add1`, κ=50 strong prior) + `factors.ex` thread +
  `designer.ex` `:b_init` emptying-B / per-modality `:learn_b` / `pb_seed` + `genome.ex` `@prereqs metabolism`
  + `:energy`/`:satiety` modalities (LAST) + `card/1 Map.take` widen + `metabolism_primary/0` + `curriculum.ex`
  setpoint-peaked C. **V1 byte-identity holds AGAINST THE GOLDEN after the designer B refactor (B6 gate ✓);
  V6 green ⇒ G0's two conditions both met offline.** Organ compiles to a 14-factor model: V3 (emptying-B
  non-identity/drains, `:eat` refills), V4 (C peaked at 'ok'), strong pb_seed, arm-integrity (14 vs 12).
  **Full brain suite 285/0** (`test/sp/brain/{action_clone_invariance,decider_byte_identity,metabolism_organ}_test.exs`).
  Default genome byte-identical; nothing regressed.
- **ORGAN 2b CORE DONE + VERIFIED (the live viability edge — the load-bearing plateau-break mechanism).**
  `lib/sp/brain/metabolism.ex` (pure dynamics: upkeep drain every tick / costly-action work / `:eat` refills
  ONLY with food / `empty`=death) + `bridge.ex` live coupling (inject the synthesized `:energy`/`:satiety`
  observation → decide → advance the store → `empty` persists memory + stops the GenServer = death, Port closes)
  + `mc_codec.ex` `:energy`/`:satiety` clauses. **GATED on the `:metabolism` genome ⇒ the default live decide
  path is byte-identical** (the metabolic branch is never taken). `metabolism_test.exs` proves the G5b MECHANISM
  (an all-`:noop` twin drains to death; a forage-and-eat agent sustains). Clean compile (`--warnings-as-errors`);
  **full brain suite 291/0.**
- **B3 DONE + VERIFIED — the metabolism organ is CODE-COMPLETE.** `satiety→C` attenuation: when satiety is
  believed high, the appetitive POSITIVE lobe of the energy/satiety C is down-weighted (`Metabolism.attenuate_model`,
  multiplier ∈ [0,1]); wired into `mc.ex modulate/4` (before policy eval), stripped by `demodulate` (zero saved
  bytes), and a **no-op ⇒ byte-identical** for any genome without a satiety factor (default strategist genomes
  unchanged). BLACKLIST (self/social/status/threat) + depletion penalties never touched. Tests: V9 (×4), V5
  (strong-seed decay), V8 (per-modality `learn_b`). V7 ⊆ V6; V10 (no double-count) holds by the orthogonal-store
  design (`:energy` is an internal ATP store, NOT the world food bar `status` reads). **Full brain suite 297/0.**
- **OFFLINE RED PRE-CHECK built (`runs/phase2_red_sim.exs`) — found + fixed a real bug, more tuning needed.**
  The real agent (full engine + the bridge metabolic loop) in a synthetic benign world initially COLLAPSED into
  an eat-every-tick attractor (G2/G3 FAIL). Diagnosis: the seeded emptying-B drained ~1 bin/tick in the planner
  while the actual store drains ~1 bin/6 ticks, so the depth-5 planner believed `empty` was imminent at `ok`
  and over-ate to buffer. **FIX (designer.ex): gentle drain (0.85 STAY / 0.15 down) matching the store rate.**
  Post-fix: the generative model is CORRECT (rests at full/ok, eats at low/empty), the agent OSCILLATES
  (G2 ≥2 cycles ✓) + SURVIVES while the `:noop` twin DIES at tick 25 (G5b ✓). STILL MARGINAL: it over-maintains
  (eats often, amplitude ~0.6<1.0 bin) and G4 shows no depth-1-vs-depth-5 separation — residual habit-snowball +
  double eat-pull (energy+satiety). Suite 297/0; default byte-identical.
- **OFFLINE TUNING DONE — RED-ready, G0/G1/G2/G3/G5b PASS; G4 honestly not-offline-separable.** Diagnosis
  via instrumented closed loop: TWO confounders, not one — (1) uniform cold-start belief → defensive eat at
  t1, (2) habit prior snowballs `:eat`. ONE cure (exact analogue of the existing `:noop` exclusion at
  `mc.ex:289`): **for a `:metabolism` genome, `:eat` is excluded from habit bumps** — eating is need-driven,
  not a tendency that should snowball into a reflex. Result: action entropy 0.04 → **2.05** (matches the
  control's 1.97 ⇒ diverse exploration), :eat count 149 → **35**, energy amplitude **1.94 bins** (G2 ≥1 ✓,
  68 direction reversals ≥2 ✓), `:noop` twin still dies at tick 25 (G5b ✓). G4 (depth-5 forages earlier
  than depth-1) does NOT separate in the synthetic world — and that's correct, not a tuning bug: with the
  setpoint-peaked C, eating at `ok` is suboptimal (pushes to `full` C=0 from `ok` C=+3), and the cliff at
  `empty` is 14+ ticks away (beyond depth-5). **G4 separation requires a competing pragmatic pull** (e.g.
  phase-3 `inventory tools=+12`) — exactly what the live MC world provides; per spec §12 the live depth-5
  beam EFE on the real factor is G4's actual gate. Suite 297/0; default byte-identical.
- **NEXT = the live paired RED.** With owner go-ahead + live-stream guard: pin the gate numerals (offline-
  derived: G2 ≥1-bin amp, ≥2 cycles; G5b twin <30-tick death) + `BASELINE_WOOD`, deploy the hardened
  collector (rootless `uni` + `os_file_read` readback), run `metabolism_primary` vs `default/0`, N≥6/arm,
  pre-registered G0–G6 (`metabolism.md` §11). **One cure at a time** (P1 PARTIAL stands).
- **LIVE PAIRED RED — RAN (~15 days); verdict COMMITTED + adversarially verified (2026-07-11).** kin-12
  metabolism vs kin-13 default, N=6/arm, 26,244 rows. Receipt: `docs/receipts/phase2_metabolism_red.md` (raw
  `.jsonl.gz` committed). **Split verdict: (1) G6 plateau-break = FAIL** (0/12 UNIs reached cobblestone/
  shelter; treatment did not exceed control, placed 72 vs 83). **(2) metabolism hypothesis = WITHHELD** —
  arms statistically indistinguishable at N=6 (diff CI≈[−14.3,+10.6]) AND organ activation UNVERIFIED (G5b
  un-passed, no energy-posterior receipt). The earlier "homeostat / epistemic-starvation" reading is
  **struck** (the organ-free control froze identically ⇒ a shared world/bin ceiling; novelty was off in both
  arms). Honest predicate for the next cure: **"G6 not demonstrated AND metabolism activation unverified"** —
  NOT "metabolism failed." This does NOT by itself validate the Track-B reframe; it also flags a possible
  world/observation-bin ceiling needing a world-ceiling control. Full detail: `metabolism.md` §16.

---

## Context (why)
The motor-inference hierarchy is shipped, live, and learning. The live baseline exposed the wall: both
colonies plateau at the "make a tool" phase and collapse into one attractor (a UNI hoards 32 pickaxes, no
stone, no building). North star: *literal digital life with measurable awareness and full human ability
within this body/world* — deeper/wider minds, hemispheres, spine, organs + glands with internal cycles.
A 14-agent FEP research pass + 5 signed UNI-GPT consults converged on: the plateau is a **missing third
EFE term (parameter information gain)** PLUS **non-saturable interoceptive drives**, and we **prove the
diagnosis before applying the cure**. Full research + rulings: `docs/UNI_MISSION_DEEPENING.md`.

## Invariants (guardrails — every phase)
- No Nx/Rust/NIF/GPU, no backprop, no RL/TD/reward-on-policy. Every new term is a recognised FE quantity:
  pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`, parameter-novelty `W` from Dirichlet counts, or
  precision `γ/γ_m/η`. No scalar-per-action term in the policy logits (guarded by the action-clone test).
- Additive + GATED behind an opt-in genome organ/field absent from `default/0` ⇒ default genome
  byte-identical. Each phase ships its byte-identity gate through the depth-5 `Plan` path (the live
  decider), not just the depth-1 `efe` fallback.
- Graded-on couplings default 0.0 (`novelty_gain`, future `endo_coupling`) — present-but-zero ⇒ flat engine.
- Mean-field / clean Markov blanket; determinism + persistence (transient fields stripped on `demodulate`;
  new heritable traits back-filled via `slow_defaults` `Map.put_new`; new `mutate/2` Det draws appended
  LAST); oracle parity.
- Live-stream go-ahead before any organ runs on the live colony; every cure proven offline first.

## Phase 0 — DIAGNOSE the plateau (DONE)
Shadow counterfactual-EFE audit (UNI-GPT Q1): is it precision-collapse (γ saturated, H(qo)→0) or a
curriculum ceiling (`phase_goal_met?(3)` needs wood≥8 ∧ tools≥1)? γ + H(qo) alone are NOT sufficient; the
discriminator is whether the counterfactual policy ranking changes under a shadow-corrected curriculum
gate. Mechanism: `lib/sp/brain/diagnose.ex` (read-only) + `runs/probe_plateau.exs`. **Result: H0 =
epistemic_starvation** (epistemic/pragmatic ratio ~0.01, flat landscape, idles at :noop/:eat).

## Phase 1 — NOVELTY term W (DONE offline; LIVE = PARTIAL)
The missing third EFE term — expected information gain about the A Dirichlet parameters (UNI-GPT Q2,
pymdp/SPM pA-novelty, NOT digamma). `W_a` in `neg_efe` adds `+½·Σ qo·qs·(1/pa − 1/Σpa)`; `W_b` over `pb`
under the same γ, per-factor. Counts floored at the prior pseudocount (bounded — cannot swamp survival).
Integration: `plan.ex advance/3` (LIVE depth-5) + `efe.ex step_value/3` (mirror). Gated `novelty_gain`
(heritable, default 0.0). `curiosity_primary/0` = the test lineage. **Verdict: PARTIAL** — hoard PASS,
plateau-break FAIL (see CURRENT STATUS).

## Phases 2–5 — the deepening (staged; each gated, FE-signed; each goes through /lab-team-review first)
- **Phase 2 — INTEROCEPTIVE ORGANS + emptying-B** (organ `:metabolism`, prereq `:interoception`) — THE
  load-bearing plateau-break cure. New `init_a:diagonal` energy/satiety factors; non-identity emptying/
  filling `B` via a `:b_init => :emptying` modality field (default nil ⇒ identity ⇒ byte-identical), as a
  STRONG Dirichlet prior (10–100× lifetime, NOT freeze — UNI-GPT Q5). `C` setpoint-peaked ('ok'; flat/neg
  at 'full'). Energy-cost = `qo_energy·C` through `B_energy`, never a per-action scalar (UNI-GPT Q3).
  Allostasis = a declared `f_setpoint→C` map, action-independent, fixed before policy eval (UNI-GPT Q4).
  Gates: action entropy ≥ floor after first tool; interoceptive level OSCILLATES around setpoint (limit-
  cycle); depth-5 forages at higher energy than depth-1; action-clone-invariance passes; OFF byte-identical.
- **Phase 3 — SPINE** (organ `:spine`, prereq `:motor_cortex`). `MotorControl` → stack of `SP.Brain.Motor`
  segments; per-segment precision Π = variable impedance; `Π_distal_relax` injects structured motor
  variability through the UNCHANGED epistemic term. Gate: 2-segment Π=1.0 byte-identical; `distal_relax>0`
  more distal entropy + new config at strike-rate ≥ single-servo, beating the `motor_shuffle` control.
- **Phase 4 — GLANDS + CYCLES** (organ `:endocrine`). Persistent `SP.Brain.Endocrine` state on the MC
  struct (stripped in `demodulate`): satiety attenuates ONLY positive C on whitelist `[:inventory,:build]`;
  oscillators retune `γ_m/η`; circadian conditional on a sensed clock. Gate: 2×2 ablation; satiety bounds
  the hoard + phase-3 entry + survival; OFF byte-identical.
- **Phase 5 — HEMISPHERES** (organ `:hemispheres`). Two `SlowContext` parents (left fine/high-γ, right
  coarse/low-γ); DOWN blend `normalize(L^wL·R^wR)`; callosal `softmax(−β·[ΣF_left,ΣF_right])`. Gate: H1
  byte-identical at δ=0; H2 dual-regime; H3 explores more; the SYMMETRIC-DUPLICATE control must NOT show H3.

## Awareness / life measures (operational, falsifiable — strict claim-fence)
Behavioural/organisational substrates, NECESSARY-NOT-SUFFICIENT, ZERO evidential weight for experience.
Measures: action-dependent viability persistence; allostasis signature; novelty `W` as a
functional-access `novelty_drive` (must correlate with later exploration + FALL at insight); state-
visitation entropy + bounded duplicate-tool count; dual-regime presence. We update the world-map only on
a failed gate.

## Critical files + seams
- `lib/sp/brain/plan.ex advance/3` (LIVE decider) + `efe.ex step_value/3` (mirror); `factors.ex
  evaluate_policies/1` (per-factor epistemic/pragmatic + γ); `precision.ex update_policy/2` (γ);
  `model.ex :pa/:pb` (Dirichlet counts); `infer.ex` (`qo=matvec(a_m,qs)`).
- `genome.ex` — heritable-field + `slow_defaults` back-fill + `mutate/2` append-LAST + organ
  (`@prereqs`/`@modalities`/`active_organs`) + opt-in builder; `designer.ex compile/1` + `likelihood/3` +
  `Genome.card` `Map.take` (`:init_a` ⇒ add `:b_init`); `curriculum.ex preference/3` + `mc.ex
  phase_goal_met?/2`/`set_phase`; `mc.ex save`/`demodulate` + the `:slow_context`/`:motor` struct discipline.
- New so far: `lib/sp/brain/{diagnose,novelty}.ex`; `runs/{probe_plateau,curiosity_lineage,probe_curiosity}.exs`.

## Verification
- Offline first: per-phase RED gates + named byte-identity assertions through the depth-5 Plan path (the
  `motor_cortex_test`/`slow_context_wired_test`/`novelty_test` precedents); monotonic-W-decay; action-clone
  invariance; full brain suite green.
- Live (per `ops_colony_lab_rootless`, owner go-ahead): opt-in lineages in separate containers, distinct
  kin/memory dir, alongside the undisturbed default + motor + curiosity colonies — RED test the gate,
  probe, RCON-confirm.
