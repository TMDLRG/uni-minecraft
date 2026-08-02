# Cure-1 — Emergent food-foraging (the developmental ontogeny) — build receipt

**Status: offline-green + committed. NOT live-validated. No live deploy without a recorded RED verdict + owner go-ahead.**
Branch `lab/ozone-life-uni-hard-science`. Owner-directed (2026-07-11).

## 0. The claim (fenced)
A hungry deep-body UNI learns to hunt to stay alive — foraging that is **constructed** by the generative model +
learning + innate priors, with **no reward, no goal-code, no food give**. Per the claim fence this demonstrates the
named BEHAVIOUR (self-maintenance by foraging) only; it carries **zero** evidential weight for awareness, hunger-as-
experience, or life. Every store / count / belief float named below is a MODEL VARIABLE.

## 1. The developmental ontogeny (owner directive — "no shortcut, all the way down")
We do not drop an infant into a hard world to learn-or-die. We build the feeding organism the way the universe does:

| Ontogeny (biology) | UNI realisation | Where |
|---|---|---|
| Cellular nutrient hyper-prior — the cell *predicts* it will be fed to setpoint | interoceptive reserve-C (γ_m=1.0 large-magnitude C) + strong `pb_seed` 50 on energy_reserve/gut_satiety | genome.ex `card/1`, modality specs |
| Digestive/consummatory organ **built but dormant** pre-birth | `B[:attack]→has_food` present in the model but **flat** (Dirichlet counts unlearned) at birth | designer/factors, learned online |
| **Womb/wean** period — sustained gently while the organ matures | nursery `metab_scale` runway (core drain slowed s×) — NO manna | homeostat.ex `core_drain`, genome `nursery` |
| **Weaning** to self-feeding | graduation drops the scaffold → pure world, natural prey, zero gives | pureworld_qa.exs |

**Honesty correction (math-breaker C9, owed plainly):** UNI's L2 is a **control/preference hierarchy** (situation
observed *up* mc_codec, absolute C-override *down* mc.ex) — **not** a predictive-coding errors-up/predictions-down
stack. The "hyper-prior" is a large-magnitude interoceptive **C**, not an elevated precision. The branching-tree /
hormonal birth-activation is the *direction*, not the current fact — see §6 (next rung).

## 2. The emergence mechanism (reward-free, C-independent decay)
1. interoceptive-depleted (low `energy_reserve` bin) → L2 `:forage` context (mc_codec `situation_index`, gap 1).
2. `:forage` prey-orient C makes facing/closing prey pragmatic (mc.ex strategist_config, gap 2, gated to `:homeostat`).
3. `:attack`'s transition column is **under-sampled** ⇒ transition-novelty `W_b` (plan.ex:142, gated `ng>0`) makes it
   worth **trying** — a standing GLOBAL epistemic drive over every under-sampled column (C4: it does NOT name `:attack`).
4. a world-earned kill (body.js `collectDrops`) lets Dirichlet **B learn** `attack→has_food`.
5. thereafter the forage `has_food` C selects the hunt **pragmatically**; the epistemic drive **decays to 0** as counts
   saturate (novelty.ex, independent of C — the no-smuggled-reward property).

## 3. Typed spec — the code (additive, gated, default byte-identical)
- `Genome.homeostat_colony_forage(gain \\ 0.3)` = `%{homeostat_colony() | novelty_gain: gain}` — the ENTIRE FE cure
  (precedent: `curiosity_primary/0`). All novelty machinery (card→designer→plan `W_a`/`W_b`) already exists + is gated.
- `Genome.nursery(gain \\ 0.3, scale \\ 0.5)` = forage lineage + `nursery: %{scale}` (runtime-only womb-runway).
- `Genome` struct: new gated field `nursery: nil` (+ `slow_defaults` back-fill).
- `Homeostat`: new field `metab_scale: 1.0`; `core_drain = … * frac * b.metab_scale` (`*1.0` bit-exact ⇒ byte-identical).
- `agent.ex`: `body: Homeostat.new(metab_scale: nursery_scale(brain.dna))`; `attack_count` telemetry (C5, runtime-only);
  `nursery_scale/1` helper; additive `UNI_LINEAGE` registry entries (live `"homeostat_colony"` case untouched).
- **`homeostat_colony/0` (the LIVE streamed genome) is byte-untouched** (C1). No `adopt` novelty override (C2). No
  cooked_beef / calorie give anywhere (C3). No strike motor-option / body.js FE change (Cure 2 deferred — C11).

## 4. Adversarial review of record
3-lens fork→break→repair→vote (math-breaker / fep-theorist / embodiment), MERGED VERDICT **SIGN-WITH-CHANGES**
(workflow wmtheaty4, 2026-07-11). All required changes **C1–C11 applied** (see the build plan; `wf_build_plan` archived
in the session scratchpad). A formal `/lab-team-review` re-run is available before any LIVE deploy if the canonical
skill invocation is wanted.

## 5. Ship-gate checklist
**Offline math fence — GREEN (`mix test test/sp/brain` = 339/0, `mix compile --warnings-as-errors` clean):**
- [x] Default byte-identical — `decider_byte_identity_test` (mad<1e-12 vs frozen golden).
- [x] **Live-lineage byte-identical** — `forage_discovery_gating_test` T1b: `homeostat_colony_forage(0.0)` == frozen
      `homeostat_colony` golden (proves the streamed genome is untouched).
- [x] Drive is live — T1c: `forage(0.3)` ≠ `forage(0.0)`.
- [x] Nursery runtime-only — T1d: `nursery(0.3,0.5)` decider == `homeostat_colony_forage(0.3)` (metab_scale doesn't touch A/B/C/D/E).
- [x] No scalar-per-action WITH novelty on — T2 clone-invariance holds (W_b column-local) + existing `action_clone_invariance_test`.
- [x] Monotone decay, C-independent — `novelty_test` (W→0 as counts→∞).
- [x] Body default bit-exact — rung-1 dynamics stays green (metab_scale 1.0).
- [x] `homeostat_colony/0` unchanged; no goal-code (grep: no "if hungry+prey then attack"); no give in launchers.
- [x] **Offline food-economy precheck** — `verify_forage_dynamics.exs` 4/4: competent hunter survives (mean 0.807),
      naive eat-on-empty dies (world non-trivial ⇒ survival attributable to foraging).

**Empirical gate — PENDING (needs the lab box + owner go-ahead; separate mc-nursery/mc-pure containers, kin 70/71):**
- [ ] Cure-1 forage RED (novelty-on vs novelty-off) recorded verdict **before** the nursery bundle (first rule, C11).
- [ ] Graduation on the scaffold-free exam: survives, self-earned recoveries, ends reserve-band, zero gives.
- [ ] `analyze_forage_qa.py` → **PASS**: the trained brain forages+survives in a PURE world on every seed AND the
      untrained twin does NOT (the discriminator) — zero VOID.

**Live deploy — only after all above + owner go-ahead recorded** (separate container, distinct kin + memory dir, ONE
`--sname` node, never the streamed `uni-colony`). Then, and only then, ping the Producer for G2.

## 6. Next rung (NOT built this session — deferred, honors the first rule)
The one piece of the ontogeny not yet modelled: **mom's signals + the baby's own hormone change that switch the
feeding system on**. Design seam: a developmental schedule that gates the *epistemic* term (`novelty_gain`) through
`SP.Brain.Hormones` at a birth transition — an epistemic gate, **not** a reward. Requires its own lab-team review and
must not stack until Cure-1's forage RED has a recorded verdict.

## 7. How to run (lab box, under owner go-ahead)
`runs/nursery_forage_gate.sh` — STAGE 0 offline precheck → nursery train (forage novelty + womb-runway) → pure-world
QA trained+control → paired gate. Smoke: `TRAIN_SEC=900 SOAK_SEC=600 SEEDS=1`. Full: `SEEDS="1 2 3"`, 1800s soaks.
