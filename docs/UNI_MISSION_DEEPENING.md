# UNI deepening — mission update (research synthesis, 2026-06-23)

Produced by a 14-agent research workflow (`wf_15e09eec-2e7`): ground the current architecture → research 6
pillars (FEP literature + codebase) → adversarially stress-test each for invariant/honesty violations →
synthesise. Then refined by UNI-GPT consult cycles (below). This is the substrate for the ultracode plan.

## Mission
Build a literal digital organism on the CPU whose **life is the predict-act tick** — one mean-field
active-inference body that perceives, learns, and acts to minimise free energy at the flow-rate of this
universe — deepened into a coherent whole: a **lateralised cortex** (dual precision/granularity parents)
above a shared factor bank, a **segmental proprioceptive spine** below, and **interoceptive organs with
glands and endogenous cycles** within. Every layer ADDITIVE, GATED behind an opt-in genome organ (default
genome byte-identical), and FREE-ENERGY-CONSISTENT (every new term reduces to a recognised FE quantity —
pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`, parameter-novelty over Dirichlet counts, or precision
`γ/γ_m/η`; never an ad-hoc reward; no Nx/Rust/NIF/GPU, no backprop/RL/TD).

The immediate scientific target: **break the empirical phase-2/3 plateau** (one UNI hoards 32 pickaxes,
exploration flattens) with the cure the adversarial review converged on — the **missing third EFE term
(parameter information gain)** plus **non-saturable interoceptive drives** — but FIRST proving the diagnosis
(precision-collapse vs curriculum ceiling). Advance the world-map only on falsifiable gates; hold a strict
claim-fence (operational measures are NECESSARY-not-SUFFICIENT substrates carrying ZERO evidential weight for
awareness/consciousness/life on their own); stop only when counter-science says the map must be updated.

## The deepened architecture
- **Decision core (unchanged invariant).** Per-factor categorical AIF; live decider is `SP.Brain.Plan`
  (depth-5 beam), so every new EFE term threads into `Plan` first, `efe.ex` as the mirror.
- **Cortex above — lateralisation (`:hemispheres`).** Two `SlowContext` parents (left = fine `W_c`/high γ,
  right = coarse `W_c`/low γ) over the same child bank; DOWN blend `normalize(L^wL·R^wR)` into the existing
  δ-weighted `emp_prior`; callosal `{wL,wR}=softmax(−β·[ΣF_left,ΣF_right])`. The right hemisphere broadens via
  its WIDER prior raising `H(qo)` — not a salience-sign flip.
- **Spine below — segmental motor (`:spine`, prereq `:motor_cortex`).** `MotorControl`'s servo generalised
  into a stack of `SP.Brain.Motor` segments (down = set-point, up = residual PE, intra-tick fold). Per-segment
  precision Π = variable impedance (stiff/committed vs compliant/exploratory) from `Hormones`/`Strategist`;
  `Π_distal_relax` injects structured motor variability through the UNCHANGED epistemic term, never a value bonus.
- **Organs within — interoception + homeostasis (`:metabolism`/`:viscera`, prereq `:interoception`).**
  `init_a:diagonal` self-sensing factors (energy/satiety/hydration) with a NON-IDENTITY emptying/filling `B`
  (the one genuinely new generative object), `C` peaked at SETPOINT (prefer 'ok', not maximum). Seeded `B`
  protected from Hebbian erosion by a per-modality `learn_b=false` override + compile-time reachability
  assertion. Allostasis falls out of the depth-5 planner rolling the emptying-`B` forward; energy bridges
  `SP.Lab.Bioenergetics`.
- **Glands + cycles (`:endocrine`, prereq `:interoception`).** Persistent `SP.Brain.Endocrine` state on the MC
  struct (advanced per tick, stripped in `demodulate`): (1) satiety attenuates ONLY positive C on a WHITELIST
  `[:inventory,:build]` (multiplicative shrink, never sign-flip, never status/threat/self); (2) endogenous
  oscillators retune `γ_m/η` (ACh/DA-as-precision). Circadian entrainment CONDITIONAL on a real sensed light
  clock, else free-running ultradian.
- **Standing active-learning drive — novelty (`:curiosity`, `novelty_gain` default 0.0).** The missing
  parameter-information-gain term `W` from existing Dirichlet counts, per-factor, threaded into `Plan` + `efe`,
  γ-bounded. The load-bearing plateau cure: nonzero in under-sampled `(state,action)` cells, decays to 0 as
  counts accumulate (the no-reward guarantee).
- **Cycle / life-frequency.** The two-timescale OODA is the metabolic rhythm; the 2nd hemisphere parent + 2nd
  EFE pass run at L2 cadence so depth-5 stays under the body tick (a wall-clock gate guards "pure Elixir at the
  universe's tick frequency").

## Roadmap (each phase additive, gated, with a falsifiable RED gate)
- **Phase 0 — DIAGNOSE the plateau** (instrumentation only). Measure on a frozen plateau whether γ is saturated
  high and `H(qo)` collapsed (⇒ precision/EFE deficit ⇒ proceed) vs a curriculum ceiling
  (`phase_goal_met?(3)` needs wood≥8 ∧ tools≥1 ⇒ fix that first). No cure ships against a misdiagnosis.
- **Phase 1 — NOVELTY term W** (`:curiosity`) — the primary plateau cure. Gate: control vs treatment, N≥20
  seeds — lower hoard, higher distinct-cell visitation, faster phase-3/4 advance (p<0.05), W monotonic-decay
  (the no-smuggled-reward check), byte-identity at `novelty_gain=0` over the depth-5 path.
- **Phase 2 — INTEROCEPTIVE ORGANS + emptying-B** (`:metabolism`). Gate: sustained action entropy after first
  tool (control collapses), interoceptive level oscillates around setpoint (limit-cycle, not flatline), no new
  saturated attractor, depth-5 forages at higher energy than depth-1 (allostasis), viability ≥ control.
- **Phase 3 — SPINE** (`:spine`). Gate A: a 2-segment Π=1.0 spine is byte-identical to today's `MotorControl`
  (MAD<1e-12). Gate B: `spine_distal_relax>0` yields more distal-outcome entropy AND a new config at strike-rate
  ≥ single-servo AND viability ≥ control, beating the `motor_shuffle` noise control. Held at "could supply
  variability" until a build-trajectory change is also measured.
- **Phase 4 — GLANDS + CYCLES** (`:endocrine`). 2×2 ablation (satiety × oscillator). Satiety-on: peak pickaxes
  bounded (≤~3 vs 32) + phase-3 entry + survival not degraded. Oscillator-on (only if a sensed clock exists):
  circadian phase cross-correlates with the day period.
- **Phase 5 — HEMISPHERES** (`:hemispheres`). H1 byte-identical at δ=0; H2 dual-regime present
  (γ_right<γ_left, H(qo_right)>H(qo_left)); H3 lateralised genome explores more + reaches phase-3 faster; the
  SYMMETRIC-DUPLICATE control must NOT show H3 (proving asymmetry, not parameter count, is the cause).

## Invariants preserved
No Nx/Rust/NIF/GPU, no backprop/RL/TD; every term a recognised FE quantity (no scalar-per-action term — guarded
by a test). Additive+gated, each phase's byte-identity gate run through the DEPTH-5 Plan path. Graded-on
couplings default 0.0. Mean-field purity / clean Markov blanket (sufficient statistics only). Determinism +
persistence (transient fields stripped on demodulate; gland/setpoint state contributes ZERO bytes to the saved
model; new mutate draws appended LAST). Oracle parity. **Live-stream go-ahead before any organ on the live
colony.**

## Falsification signals (when to update the map)
- Phase-0 H0 fails (γ not saturated, `H(qo)` not collapsed) ⇒ the whole incomplete-EFE diagnosis is wrong;
  re-root in curriculum/structure-learning.
- Novelty fails (treatment still hoards) ⇒ parameter-info-gain is not the missing driver.
- W does not decay monotonically ⇒ it is smuggled reward; revert (no-RL breach).
- Homeostasis: entropy also collapses, or level flatlines, or depth-5 no earlier than depth-1 ⇒ no standing
  gradient / no allostasis.
- Spine: relaxation raises entropy but degrades strike-rate/viability, or fails to beat the shuffle control ⇒
  noise, not exploration.
- Glands: satiety swept [0.1..1.0] still hoards ⇒ not preference-saturation; or degrades survival ⇒ λ mis-scoped.
- Hemispheres: the symmetric-duplicate control matches the asymmetric ⇒ it is parameters, not lateralisation.
- Any default/coupling-0 run differs from HEAD over the depth-5 path ⇒ not additive+gated; revert.
- Deepened decide step falls below the body/universe tick cadence ⇒ life-frequency invariant violated.
- An acting agent does NO better than an action-severed twin at staying viable ⇒ the self-maintenance
  ("life") operationalisation is unsupported — say so, drop the framing.

## Awareness / life measures (operational, falsifiable — strict claim-fence)
**Binding fence:** these are behavioural/organisational measures. A non-identity emptying-B + setpoint C is a
thermostat; novelty W is active learning; a dual-precision parent is a coupling mechanism. Each is
NECESSARY-NOT-SUFFICIENT and carries ZERO evidential weight for experience. Passing a gate demonstrates the
named behaviour, NEVER experience. Do not surface gland floats as felt states.
- **Action-dependent viability persistence** (the "life" axis): ticks-inside-the-viable-set(acting) −
  ticks-inside-V(action-severed twin) > 0 (p<0.05). Self-maintenance, not life-as-experience. Drop
  "autopoietic / non-organic life" unless NESS is actually instrumented (it is not).
- **Allostasis signature:** inferred setpoint moves BEFORE depletion; depth-5 forages at higher energy than
  depth-1.
- **Active-learning / curiosity:** total novelty W as `Awareness.broadcast.novelty_drive` (functional-access
  only) — must correlate with subsequent exploration and FALL at insight. Measured info-gain, NOT felt curiosity.
- **State-visitation entropy** (the plateau-break metric) + bounded duplicate-tool count.
- **Dual-regime presence** (mechanism check only): γ_right<γ_left, H(qo_right)>H(qo_left). Nothing more.

## Open questions taken to the UNI-GPT (consult cycles)
1. Novelty FORM: `W = −½·Σ(qo·qs)(1/pa − 1/Σpa)` (pymdp/SPM pA-novelty, no digamma) vs the digamma `E[lnA]`
   form — which for a depth-5 beam planner, same γ/sign as the state-epistemic term? Does transition-novelty
   `W_b` share that γ?
2. Allostasis as setpoint→C: `SlowContext` is a scene→state PRIOR, not a setpoint→C generator. Is mapping an
   inferred energy-setpoint posterior to a log-preference vector FE-correct, or must it be a hyperprior over C
   with its own VFE term? What stops it being disguised reward?
3. Callosal arbitration: is `softmax(−β·[ΣF_left,ΣF_right])` a legitimate precision-on-precision allocation,
   and does β=0 reduce to recognised model-averaging? Is left-dominance FE-justified or ad-hoc?
4. Coarse-`W_c` granularity: the principled deterministic coarsening (state-merge vs column-smoothing) for a
   genuinely "global" right regime, heritable + oracle-mirrorable.
5. Emptying-B + learning: freeze `learn_b` on viscera columns, or a strong Dirichlet prior Hebbian may refine
   but not erase? FE-correct way to keep depletion dynamics stable yet adaptable.
6. Energy-cost as C: confirm "mining costs energy" as `qo_energy·C` shifted THROUGH `B_energy` is FE-consistent
   (not per-action reward) + how to test no scalar-per-action term leaked into the logits.
7. Diagnosis priority: how to cleanly separate precision-collapse from curriculum ceiling in H0 — is saturated
   γ + low `H(qo)` sufficient evidence, or could a ceiling present that way too?
8. Stacking order: with hemispheres (3rd temporal level) above L1/L2 and a continuous spine below, is the
   mean-field factorisation across FOUR effective levels still FE-sound? Does running the 2nd pass at L2
   cadence break timescale-separation assumptions?

## Execution status (2026-06-23)
- **P0 — DONE.** `lib/sp/brain/diagnose.ex` shadow-EFE audit → H0 = `epistemic_starvation` (see Q1 result).
- **P1 — built + offline-validated; LIVE RED PARTIAL (verdict 2026-06-24, ~9 h, N=3/arm).** Mechanism:
  `lib/sp/brain/novelty.ex` (W_a + W_b, pymdp pA/pB-novelty, prior-floor-bounded, gated `novelty_gain` 0.0
  default). Offline ✓: byte-identical at 0 over depth-5 (mad<1e-12, suite 0/0); monotonic-decay/C-independent
  /bounded; fresh curiosity agent explores ~uniformly (entropy 2.29 vs 1.91, build/craft ~3×). LIVE paired
  RED (`uni-colony-curiosity` on `localhost/uni-colony:v4`, owner-approved; kin 10 gain=0.5 vs kin 11 gain=0,
  same code/world/bodies; launcher `runs/curiosity_lineage.exs`; collector `runs/cur_red.log`):
  - **HOARD gate PASS (direction only; magnitude CORRECTED 2026-07-11):** at the settled cycle of the sole
    committed receipt (`docs/receipts/phase1_curiosity_red.log`, ~110 min / 11 cycles), curiosity Σpickaxes
    = 10 (one residual hoarder, UNI-10-2 at 10) vs control Σ = 45 (two runaway hoarders, UNI-11-1 at 24 +
    UNI-11-3 at 21) — **≈4.5× fewer**; the runaway pickaxe attractor reproduced in control and was
    *suppressed, not eliminated,* in curiosity. The earlier "Σ = 1 (max 1) vs 25 / 25× / one UNI at 24"
    figures cherry-picked a single control hoarder, ignored the second control hoarder and the residual
    treatment hoarder, and have no committed receipt; they are withdrawn
    (`docs/receipts/phase1_curiosity_red_CORRECTION.md`). The "9 h" timepoints in this block (incl. the
    −0.07 entropy figure below) likewise have no committed receipt — only the ~110-min log is committed.
  - **Behavioral plateau-break (stone/building) FAIL:** neither arm reached cobblestone (Δphase = 0, both at
    3.67). Distinct-cells Δ = −285 (control higher, an artifact of +40% more ticks). Action-entropy advantage
    decayed monotonically (offline +0.38 → t0 +0.35 → 90 min +0.10 → 9h **−0.07**) — exactly the math's
    W→0 as counts→∞ (no-reward guarantee preserved), but novelty's behavioural push wanes once the model is
    well-fit. So the cure is on the SUB-claim (hoard), NOT on the FULL claim (plateau-break).
  - **Scientific reading:** the plateau is MULTI-CAUSAL. Phase-0 diagnosis (epistemic_starvation) was real;
    novelty cures the hoarding manifestation; but the agent has NO standing drive that wants stone (phase-3
    C is `wood=+5,tools=+12`, nothing toward stone/shelter). A **non-saturable interoceptive drive** —
    Phase 2 (organs/emptying-B/setpoint-C, the OTHER GPT-signed cure) — is the load-bearing missing piece.
    This is the registered falsification path working as designed: half-falsification recorded as PARTIAL,
    Phase 1 sound but insufficient alone. Do NOT spin "hoard suppression" as a plateau-break.
- **P2–P5** — the approved roadmap (organs → spine → glands → hemispheres), each gated/FE-signed, on reach.

## UNI-GPT consult rulings
Consult run 2026-06-23 on the UNI Active Inference Guide GPT (thread `…/c/6a3adc3d`). All 5 FE-consistency
questions answered (sent one at a time; the GPT reasons ~1–3 min before each answer).

**Q1 — diagnosis priority — SIGN-WITH-CHANGES (a sharpening of Phase 0).**
- "Saturated γ + collapsed H(qo)" is NOT sufficient. Both failure modes produce a sharp policy posterior
  over a narrow predicted-outcome trajectory — `Q(π)=σ(lnE−γG−F)`, `G=Σ_τ H·s + o·(ln o − ln C)` — so γ/H
  collapse is a shared EFFECT, not a cause.
- **The cleanest discriminator: a SHADOW / counterfactual EFE audit over the same frozen-seed tick — do NOT
  change the live action.** Log two policy rankings: `argmin_π G` under the ACTUAL gate vs `argmin_π G` under
  an UNMASKED / prerequisite-repaired curriculum gate (shadow-relax the curriculum gate, or make wood/build
  policies available in the shadow planner). Telemetry per tick: `{live: {winner, efe:{epistemic,pragmatic,
  total}, h_qo_by_factor, distinct_sa_cells, active_goal_atoms, policy_mask_size}, shadow: {winner, efe…,
  distinct_sa_projection, reachable_prereq_policy}, discriminator: {same_winner, wood_policy_rank_live,
  wood_policy_rank_shadow, gate_delta}}`.
  - **Precision-collapse signature:** the SAME hoarding policy wins even under the shadow-relaxed gate; the
    EFE gap stays dominated by high-γ pragmatic value for hoarding; epistemic terms near zero; distinct-cell
    growth flat outside the hoarding loop ⇒ a decider-level attractor / precision-epistemic starvation ⇒
    proceed to the novelty cure (Phase 1).
  - **Curriculum-ceiling signature:** under the shadow gate that reintroduces wood<8 as an active unmet
    prerequisite, wood/stone/build policies become competitive or win ⇒ fix the curriculum gate first.
- Verbatim: "The decisive variable is not H(qo) alone. It is whether the counterfactual policy ranking
  changes when the curriculum gate / prerequisite goal generator is shadow-corrected."
- **Action:** Phase 0 in the roadmap is upgraded — add the shadow counterfactual-EFE audit (read-only, live
  action unchanged) as the H0 discriminator, not just γ + H(qo) logging.

**Q1 — H0 RESULT (2026-06-23, `lib/sp/brain/diagnose.ex` on the live hoarders' .bins UNI-0-1 / UNI-2-1):
`epistemic_starvation` — PROCEED to Phase 1.** The audit ruled OUT both alternatives:
- NOT classic γ-runaway: policy γ = 7.8 / 7.9 (unsaturated; max 16).
- NOT a simple curriculum-C ceiling: re-injecting the phase-1 wood-C (has_wood=+8) on the inventory factor did
  NOT flip the winner or lift mining's rank (`winner_changed: false` on both).
- IS the precision/epistemic-deficit signature: epistemic/pragmatic ratio = **0.01 / 0.006** (the information
  drive is ~100–170× weaker than the pragmatic term), the EFE landscape is **nearly flat** (value spread
  1.5 / 0.6 over a 62 / 135 baseline) so the agent is indifferent and defaults to `:noop` / `:eat` (matching
  the observed idle hoarding). ⇒ the missing parameter-information-gain (novelty) term is the FE-correct cure.
  (Side-finding: UNI-0-1's inventory factor grew to 5 states via structure learning and is frozen in the new
  state; UNI-2-1's inventory belief is uniform — both degenerate, worth a Phase-2 look, but not the primary
  plateau driver.)

**Q2 — the novelty / parameter-information-gain term — SIGN-WITH-CHANGES.**
- (a) **SIGN-WITH-CHANGES:** use the pymdp/SPM **pA-novelty** approximation, NOT digamma `E[lnA]`. The `−½`
  in `W` is the EFE/G sign; in `neg_efe` ADD the **positive** `½·Σ_{o,s} qo·qs·(1/a − 1/Σa)`, scaled by γ.
- (b) **SIGN:** add `W_b` for transition Dirichlet counts under the SAME γ, strictly per-factor/action from
  that factor's own `pb`, then sum.
- (c) **SIGN:** `W` must decay monotonically to 0 as the relevant counts → ∞, and be independent of `C`.
  That is the no-smuggled-reward invariant (the Phase-1 monotonic-decay gate).

**Q3 — energy-cost as C, not reward — SIGN.**
- (a) **SIGN:** FE-consistent — energy cost is an interoceptive outcome preference under `C_energy`, reached
  through action-conditioned `B_energy`. Mining is costly only because it PREDICTS depleted-energy outcomes,
  never because `:mine` gets a scalar penalty.
- (b) **SIGN — the test is "action-clone invariance":** clone `:idle_a`/`:idle_b` with identical A/B/C/D/E
  (incl. energy) ⇒ identical policy logits; set `action_cost[:idle_b]=999` ⇒ logits unchanged; change only
  `B_energy[:mine]` to debit energy ⇒ only the predicted `qo_energy·C_energy` term may change. Pass ⇒ logits
  depend on predicted OUTCOMES, never action ID. (This becomes a required Phase-2 test.)

**Q4 — allostasis as setpoint→C — SIGN-WITH-CHANGES.**
- FE-correct as a DECLARED generative-model mapping: `q(setpoint_context) → f_setpoint → normalized
  C_energy`; the planner uses only `G_energy = qo_energy·ln C_energy`. A full hyperprior over C is cleaner
  Bayesian hierarchy but NOT required — a pure context-conditioned function is acceptable empirical-Bayes.
- **Guardrails (no disguised reward):** `f_setpoint` must be action-independent, normalized, fixed BEFORE
  evaluating candidate policies, and enter logits ONLY through predicted `qo_energy`. No action scalar, no
  "forage bonus," no policy-indexed C. Test: clone two policies with identical predicted `qo_energy` ⇒ logits
  match even if one is named `:forage`.

**Q5 — protecting the seeded emptying-B — CHANGE from the research proposal.**
- Prefer **option (ii): a STRONG Dirichlet prior** (evidence may refine but not erase), NOT freezing
  `learn_b`. Freezing is only correct if depletion/filling is treated as HARD physiology, not learnable
  dynamics. **Strength:** each viscera-column concentration LARGER than the expected lifetime evidence —
  practically **10–100× lifetime updates** for adaptation without erasure. (Supersedes the synthesis's
  `learn_b=false` viscera override; use a strong prior instead, with `learn_b=false` reserved for any column
  declared hard-physiology.)
