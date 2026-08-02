# Spec — Survival-C (curriculum removal), the deepest/slowest layer

> Part I of A4. Reads with `generative_model.md` (backbone) + `sensorium.md` (Part II). Design-only; ship gate
> = formal `/lab-team-review` + owner go-ahead. Corrections folded from `docs/receipts/a4_lab_team_review.md`.

## Hypothesis (to prove, not assume)
With C grounded ONLY in viability + a real death edge (the metabolism emptying-B) + a natural epistemic drive,
UNI keeps its body viable and acts *without any curriculum or goal-setting*. Phase-2 showed the curriculum was
a confound; removing it lets us ask the pivot cleanly. OPEN question.

## I.1 StateSpace + the CORRECT setpoint shape (blocker #9)
No new factors. Survival-C reuses the existing action-independent survival factors and changes only their C:
`status` (viability edge), `threat`, `@self_pref`, `@social`, and — via `:metabolism` — `energy`/`satiety`.
**Correction (the earlier "flat-top F8" claim was wrong):** `@energy_setpoint`/`@satiety_setpoint`
(`curriculum.ex:33-34`) = `%{0=>-8.0, 1=>-2.0, 2=>+3.0, 3=>0.0}` is a **single-peaked interoceptive setpoint**:
**peak at "ok" (bin 2, +3.0), neutral at "full" (bin 3, 0.0), steep penalty toward "empty" (bin 0, −8.0)** —
an inverted-U, NOT a flat top. It is **non-saturable** because there is no monotone-increasing pragmatic value
in over-filling (bin 3 < bin 2, so stuffing past "ok" is mildly *dispreferred*); the only standing gradient is
*away from depletion*. **F8 falsifier restated against the true shape:** if any survival-C factor's C is
monotone-increasing in "more" (a `more-is-better` reward), it is a preference-hack and is struck. (A genuine
flat-top variant would set bin3=bin2; the current shape is *stronger* non-saturability than a plateau.)

## I.2 PreferenceModel — phase-independent survival table
Replace the *phase*-indexed `Curriculum.preference(phase, modality, no)` (`curriculum.ex:47-51`) with a
**phase-independent survival table** for `curriculum: :survival_only` lineages: return the viability vectors
for `status/threat/self/social/energy/satiety` at all times, and **all-zeros (neutral)** for every task
modality (`inventory/vision/sky/scene/depth/...`). Keep the **allostatic gain** (`satiety→C` attenuation,
`metabolism.ex:75-90`) — positive-appetitive-lobe-only whitelist; it never touches the depletion penalties
(the suicidal-when-sated backdoor). That is real interoceptive dynamics, not task-C.
- **Affect→precision (deferred, honestly staged):** the colony has NO 8-channel Z vector — only surprise-driven
  `gamma_m`/`gamma` + a one-axis `:stress`→γ (`hormones.ex`) + a non-causal Emotion read-out. A later cure may
  extend `:stress`→γ into a small interoceptive-affect precision channel — but γ must stay a **GLOBAL** policy/
  factor precision (sharpens the whole softmax uniformly), **never a selective gain on any C's positive lobe**
  (that would be reward-in-a-wig, bypassing the `qo·C`-only rule). Its Z-ablation falsifier is pre-registered
  before that cure runs. Do NOT fabricate the full Z.

## I.3 What is REMOVED / neutralized — BOTH task-C channels, by viability-provenance (blocker #4)
Gated on `curriculum: :survival_only`:
- **Channel 1 — Curriculum task-C:** the phase 1–4 `inventory`/`vision`/`sky` weights (`curriculum.ex:37-45`)
  → neutral (the survival table returns zeros for them).
- **The climb:** `phase_goal_met?/2` + `maybe_advance_phase/2` + `set_phase/2` C-refresh (`mc.ex:219-227,479-500`)
  → no-op.
- **Channel 2 — runtime `strategist_config/1` (`mc.ex:428-466`), easy to miss:** it injects absolute per-option
  C overrides. **Whitelist by viability-provenance, not by name:** KEEP `status`(needs_safe) + `threat`
  (danger_calm/danger_flee) — viability-derived. **DROP** `inv_forage`/`inv_build`/`vis_tree`/`vis_shelter`
  **and** `light_surface`/`sky_surface` — all are hand-authored spatial/task preference-hacks NOT derived from
  any viability setpoint (e.g. `inv_forage` rewards has_wood +2.0, `vis_tree` rewards seeing-a-tree +3.0). A
  "curriculum-free" agent that still carries build/anti-bedrock preferences is not curriculum-free.
- `diagnose.shadow_wood` (`diagnose.ex:86-93`) becomes N/A for these lineages.

## I.4 Seams — additive+gated, `:metabolism` BINDING, heritable-field discipline (blockers #2, #13)
- **Genome field `curriculum: :survival_only | :phased` (default `:phased`).** Gates I.2 (survival table vs
  `Curriculum.preference`), the climb no-op, and I.3 channel-2 neutralization.
- **`:metabolism` is a BINDING prerequisite of the survival-C treatment (blocker #2 / embodiment).** The ONLY
  non-identity emptying/filling B in the whole model is the metabolism organ (`genome.ex:109-111`,
  `b_init: :emptying`, `pb_seed: 50.0`). `status/threat/self/social` carry setpoint C but have identity
  "states-persist" B (passive read-outs = preferences, not homeostats). **A `survival_only` genome WITHOUT
  `:metabolism` is "setpoint C with no emptying B" = the Phase-1-insufficient preference-relabel — RED-A's
  FALSIFIES would then be pre-ordained, not earned.** So the survival-C lineage MUST carry `:metabolism`.
- **Heritable-field discipline (blocker #13):** back-fill `slow_defaults` `Map.put_new(:curriculum, :phased)`
  (`genome.ex:360-366` precedent); read `Map.get(dna, :curriculum, :phased)` in `card/1` (mirroring
  `novelty_gain`, `genome.ex:240`); if heritable, APPEND the Det draw LAST in `mutate/2` (`genome.ex:311`) to
  preserve draw order (else every existing lineage's mutation stream shifts).
- **Byte-identity:** `default/0` stays `:phased` and untouched. Because C never enters A/B/D/policies-tensors
  (backbone) and phase-0 default is already survival-only, `express(default())` is bit-identical. **Test:**
  extend `decider_byte_identity_test.exs` to express BOTH `:survival_only` and `:phased` and assert the default
  golden stays `mad<1e-12` over the depth-5 Plan path. Run `action_clone_invariance` A1/A2/A3 on the
  `survival_only` lineage (its informative-A survival factors are exactly what the guard needs; strategist_config
  injects action-INDEPENDENT per-outcome C, so A2's no-`action_cost` guard must be exercised here).

## I.5 RED-A — paired, pre-registered (single-variable; corrections #2, #15)
- **Arms (differ in EXACTLY the `curriculum:` field):** treatment `:survival_only` vs control `:phased` (the
  current climbing curriculum — that IS the cure under test). **Both arms carry `:metabolism` + energy/satiety
  factors + identical `novelty_gain`, world/seed/body/kin**, and are pinned to the SAME start phase (live
  default is `phase:1`, `colony.ex:107`/`lineage.ex:132` — pin it explicitly). A probe asserts all-else-equal.
- **Replication unit = ≥5 distinct world-seeds** (backbone RED-discipline), not N UNIs in one seed.
- **Activation gate (numeric, FIRST):** energy-posterior depletes/refills (pre-registered depletion slope) AND
  G5b energy-severed twin dies (`ticks-in-V(acting) − ticks-in-V(noop-twin) > 0`, p<0.05 over the seed set).
  **Miss ⇒ WITHHELD.**
- **World-ceiling:** the reference controller (one role, pinned before T0) shows the natural-behaviour target IS
  reachable in these worlds; else WITHHELD + re-scope.
- **PASS = non-inferiority + activation:** treatment live-fraction ≥ control − 0.15 (G5a) AND treatment ≥ the
  pre-registered natural-behaviour floor (distinct resources touched / placed_used ≥ 1, RCON) — i.e. removing
  the curriculum does NOT collapse the agent. **G6 plateau-break is SECONDARY + expected-FAIL** for
  survival-C-alone (do not spin a G6 non-move as pass or as the cure failing).
- **FALSIFIES:** the survival-C agent goes inert (no viable self-maintenance, no natural foraging) while the
  curriculum control sustains ⇒ the curriculum was load-bearing for *any* competent behaviour (the pivot needs
  the epistemic drive first). — Valid ONLY because `:metabolism` is bound in (else this branch is pre-ordained).

## Target code (gated, additive; ONLY after formal MERGED VERDICT + owner go-ahead)
`curriculum.ex` (survival table), `genome.ex` (`curriculum:` field + back-fill + `:metabolism` prereq for the
survival-C lineage constructor), `mc.ex` (climb no-op + strategist_config viability-whitelist, both gated),
tests as in I.4. Launcher `runs/survival_c_lineage.exs` + probe + the world-ceiling reference.
