# Full-depth generative model — graded per-subsystem viability + closed world↔body↔mind loops (DESIGN)

> **Design-only.** FE-touching ⇒ every cure needs a `/lab-team-review` MERGED VERDICT + typed spec + paired
> pre-registered RED + ship-gate checklist + owner go-ahead (live-stream guard) **before** code. Adversarially
> designed + hardened by the full-depth design workflow (`wf_4cf9ba90-5ce`, 20 agents: 3 grounding → 4 depth
> domains × math-breaker/embodiment/architect → architect merge). **MERGED VERDICT = SIGN-WITH-CHANGES.**

## Why this exists (owner correction, 2026-07-11)
Fitting into a Minecraft body is **not** license to reduce the models or their hierarchical depth — it is the
opportunity to make them **real and really digital**. A human arm, down to the cells, gets *tired*, has *extra
energy*, is *nominal*, is *critical*. The model must carry graded per-subsystem viability (cell→tissue→limb→
organism) and **close all the loops** world↔body↔mind↔body↔world at full depth. See [[feedback_model_depth]].

**Measured evidence licensing this:** the current metabolism is a **single global** `energy`+`satiety` scalar,
each 4 coarse bins, setpoint-peaked C `{2:+3, 3:0}` (`curriculum.ex:33`) — flat at "full", **no reward for a
reserve**. The v2 regulation gate (`metabolism_regulation_gate_v2.md`, FALSIFIES) measured this flat drive
**dying 6/12 worlds** (genuine self-drains, food reachable) and *looser* in dispersion than a hoarding foil.
The shallowness fails, measured. This design is the honest, staged path to the depth — it does **not** claim to
deliver the full per-subsystem/full-loop mandate in one shot.

---

## The unified model — a 3-tier categorical AIF stack, one closed loop, one opt-in organ (`:homeostat`)
All four reviewed depth domains collapse to ONE structure. `:metabolism` stays frozen (its gates hold);
new depth lives behind an opt-in `:homeostat` organ absent from `default/0` ⇒ byte-identical default.

### L0 — process substrate (body; NOT a belief — the Markov-blanket process side)
Continuous per-subsystem reserve scalars on the bridge: ATP `energy`, `gut` buffer, per-limb `fatigue`
(arm/leg), `soma`/health. `Metabolism.step` advances each by wall-clock `dt` with **acted-subsystem
attribution** (mine/attack → arm, forward/turn/jump → legs; `@upkeep` on the core every tick incl. `:noop` = the
load-bearing "no free hold" that makes the death edge bite). Drain/refill/death are real world-consequence.

### L1 — subsystem interoceptive factors (mind; the graded depth)
Per-subsystem reserve factors, each a standard per-factor `A[no×ns] / B[nu×ns×ns] / C[no] / D[ns]` Dirichlet
factor, **ns=no=6** with the owner gradient **{0 critical, 1 depleted, 2 tired, 3 nominal, 4 sated, 5 surplus}**,
`init_a :diagonal` (self-sensing), `b_init :emptying/:filling/:fatiguing` durably seeded (`pb_seed≈50` ⇒ W_b→0
*faster*). Members: `energy_reserve`, `gut_satiety` (dissociated from energy via a body-side gut→energy
digestion transfer, so "full gut / low energy just after eating" is representable), `muscle_fatigue`
(work-accruing / rest-recovering — a fatigue signal, NOT an appetite brake), `soma_integrity` (health channel).

### L2 — organism viability parent (deepest; Cure 5, gated hardest)
One `Sg=4` SlowContext/Hierarchy2 marginal filter {thriving, nominal, strained, critical}, **NEUTRAL C** (never
a second reward). Acts ONLY through the DOWN empirical prior. Its transition `B^G` is **DIRECTIONAL** (seeded
off-diagonal decline drift, OR a new `pB^G` Dirichlet + learn rule) — **not** the stock sticky diagonal (a
low-pass smoother, incapable of anticipation). Informative `W_c` maps subsystem-reserve(6) → organism-
viability(4), keyed on homeostat factor names only (the 12 default factors keep uniform `W_c` ⇒ inert even at
δ>0).

### The closed loop (every segment on a named seam — no dangling half)
- **world→body:** MC food/health/action stream → bridge store drain/refill → real death edge.
- **body→mind:** `Metabolism.inject` → `felt_*` observations → subsystem beliefs (mind reads only injected obs).
- **mind UP:** child *extrinsic likelihood* (not posterior) folds into the parent via `W_cᵀ` predict/correct;
  cavity honoured by **timescale separation** (down-prior = last-tick parent belief, injected before this tick's
  up-fold — no child sees its own current posterior).
- **mind DOWN:** parent viability → each child's empirical prior, **added-alongside / precision-weighted** the
  child's own predictive emptying-B forward prior (NOT the replacement blend that dilutes the one predictive
  term). δ=0 short-circuits to the exact forward prior (byte-identical).
- **mind→body execution:** `muscle_fatigue` → `Motor.pi` loop-gain (fresh 1.0 → spent ~0.35) → weaker servo →
  degraded aim reafference (genuine consequence for MINING; `:motor_cortex`-gated, scoped honestly).
- **mind→body precision/affect:** 2-axis interoceptive affect {urgency u = believed critical mass, comfort c =
  believed high-satiety mass} + organism-viability posterior → Hormones γ/lr dial (gated on the ORGAN, not on
  `l2==nil`). Criticality sharpens γ; comfort broadens (u-gated); lr damps with a **hard floor > 0**. Transient:
  re-based each tick, stripped before persist.
- **body→world:** emit → MC actuates → world changes → re-sense.

### Graded viability + allostasis (the fix for the measured death)
Replace BOTH the drain-setpoint C `{2:+3,3:0}` AND the reward-smuggling monotone foil `{2:+2,3:+4}` with a
**reserve-holding INTERIOR-PEAK** C: `reserve_ramp(6) = [-8, -3, -1, +1, +2.5, +2]` — positive gradient
nominal→sated (refill pressure returns the instant belief slips below sated) with **surplus(2.0) < sated(2.5)**
so the argmax is an **interior buffer bin**, never the ceiling ⇒ bounded, non-hoarding, non-saturable-at-the-
edge. Anticipation needs **no new EFE term**: the existing depth-5 Plan rollout applies emptying-B forward, so a
non-eat policy predicts a penalised low-reserve future ⇒ **eat-before-edge for free**. The L2 parent adds
pre-edge demand-shift *on top, if it earns it*.

### Timescales (yuga 4:3:2:1) & work/fatigue
Kali ts=1: felt A (fast). Dvapara ts=2: reserve B. Fatigue on a distinct faster clock (~3 s) vs energy (~8 s) —
the first per-factor timescale differentiation. Satya ts=4: the viability parent (slow ⇒ its down-prior is
anticipatory). Work/fatigue: graded effort cost in the BODY store (never policy logits), inefficiency rises as
the limb tires, recovery energy-rate-limited, fatigue lowers `Motor.pi` ⇒ **work-rest pacing** = the allostatic
brake the flat scalar lacked. The parent's period does NOT re-derive the default `@l2_period` (byte-identity).

---

## Staged gate ladder (one cure at a time — each a recorded verdict before the next)
1. **CURE 1 — graded-reserve interior-peak setpoint (ships first).** Single organism `energy` factor,
   cardinality 4→6 (`Designer.transition(:emptying,…)` is already ns-generic — no engine change) + a new
   `drive_c(:reserve, no)` interior-peak shape keyed by the `drive_shape` gene (default `:setpoint` ⇒
   byte-identical). Parent OFF, no factoring, no affect, no fatigue — a win is attributable to exactly one change.
   **PASS iff:** (a) N≥12 survival ≥11/12 (vs measured ~6/12); (b) `allostasis_index` = believed reserve at
   eat-onset, (`:reserve` − `:setpoint`) CI-excludes-0 positive (eats earlier); (c) **two-ended satiation** —
   fights harder near critical in a scarce world AND stops eating / does not hoard in a rich world; (d) **beats
   BOTH** `:setpoint` and `:saturable`, survival-count CI excluding each. **FALSIFIES/REJECT** if survival not
   improved, OR indistinguishable from `:saturable` (then it is just "eat more"), OR rests/hoards into starvation.
2. **CURE 2 — per-subsystem factoring** (`energy_reserve` + `gut_satiety` via gut→energy transfer + `soma_integrity`).
   PASS iff a cross-subsystem **dissociation Δ** CI-excludes-0 (beliefs measurably decouple), with a per-subsystem
   severed-limb falsifier for EACH factor.
3. **CURE 3 — work↔fatigue limb tier** (`muscle_fatigue` → `Motor.pi`). **Blocker prereq:** reindex
   `motor_config` by NAME not `Enum.take(-5)` (`mc.ex:152`). Per-mechanism ablation arms (C-only / inefficiency-
   only / pi-only) so any win is attributable.
4. **CURE 4 — affect→precision loop** (2-axis urgency/comfort → γ/lr + interoceptive γ_m). Un-gate from L2 by
   gating on the ORGAN; reset_baseline before apply, strip γ+lr+γ_m before persist; lr floor fenced > 0.
5. **CURE 5 — anticipatory organism-viability parent** (directional `B^G`, an explicit engine addition, NOT the
   stock smoother). **Decisive discriminator:** the δ>0 arm must beat δ→0 on a cross-subsystem allostasis_index;
   if δ→0 matches, keep Cures 1–4 and REJECT the parent.

## Invariant guarantees (each a REJECT-on-fail gate, proven per-seam)
1. **Categorical AIF only** — standard A/B/C/D/E Dirichlet factors + exact SlowContext marginal filter;
   `q=softmax(prior+Σγ_m·lnA)`; additive `G=ΣG_f` = epistemic + pragmatic. No Nx/Rust/NIF/backprop/RL.
2. **Additive + gated + byte-identical** — depth behind `:homeostat` absent from `default/0`; new C shapes queried
   only for homeostat factors; new knobs default inert, drawn LAST. **Binding fences:** do NOT lift `@factor_cap`
   globally, do NOT re-derive `@l2_period`, gate step-path edits on `:homeostat in active_organs` (NOT `l2==nil`,
   which `metabolism_l1_phase0` also traverses). Per-seam `mad<1e-12` over default AND every touched lineage.
3. **No scalar-per-action** — every cost enters via that action's own B column → felt obs → belief, NEVER policy
   logits; affect γ multiplies ALL policies uniformly (action-independent). Guarded by action-clone-invariance
   (extended) + a NEW action-history-invariance test (any demand estimate is a fn of a hidden-state posterior
   only — the "recent-costly-fraction" driver is DELETED).
4. **Monotonic decay / no smuggled reward** — info terms use the floored `wnorm` kernel ⇒ W→0 as counts→∞,
   C-independent; C is a bounded log-preference (interior-peak, surplus<sated), not an info term; the parent
   carries NEUTRAL C. lr floor > 0 so criticality can't freeze Hebbian learning.

## Claim fence + what is deliberately still simplified (named, not smuggled)
**Fence:** every reserve/felt/viability/urgency/comfort/fatigue float is a MODEL VARIABLE, never a felt state.
Passing a gate demonstrates graded self-maintenance / allostatic pacing as **behaviour only** — a
necessary-not-sufficient substrate with ZERO weight for awareness/consciousness/life. "The arm gets tired" is a
limb-ATP/soreness proxy, not sentience; it must NOT be narrated as felt hunger/pain in any stream overlay.
**Still simplified (honest ceilings):** (1) mean-field, not exact joint — the planner can't yet anticipate "a
tired arm wastes ATP" (deferred joint conditioning); (2) cavity approximate (timescale separation, not exact
leave-one-out); (3) subsystem depth staged across Cures 2–5, parent-of-parents deferred; (4) `fatigue→Motor.pi`
is a world consequence for MINING only (leg fatigue via cost+C until a locomotion servo exists; `soma_integrity`
gated on measured health-channel variance); (5) short horizon may not reach the penalty region (remedy: L2
parent); (6) affect is 2-axis, full emotion vector stays read-only.

## Top risks
- **Anticipation may not separate** (structural): Cures 1–4 give raised setpoint + reactive rollout-anticipation;
  genuine pre-edge allostasis needs Cure 5's directional parent, pre-registered to FAIL its δ→0 discriminator if
  built as the stock smoother.
- **Reward-smuggling via C shape or a demand estimate** (the one corpus REJECT): a monotone ramp *is* the
  saturable foil; a history-conditioned demand estimate is a cross-tick action→preference loop the within-tick
  clone test is blind to. Mitigations binding (interior-peak surplus<sated + discrimination arm; delete the
  history driver + action-history-invariance guard).
- **Fake/thin world loops:** a subsystem whose belief drains with no world consequence is a preference-hack —
  per-subsystem severed-limb falsifiers required (`muscle_fatigue`, `soma_integrity` are the thin links).
- **Byte-identity / cross-lineage perturbation** (`motor_config` positional index, global `@factor_cap`,
  `@l2_period`, `l2==nil`-gated edits) — organ-gated edits + per-seam mad-check over every touched lineage.
- **Affect-loop instability / compounding** — reset_baseline before apply, strip γ_m before persist, drop
  `:direct` per-sub salience, u-gate `satiety_attenuate`, contraction-bound κ_s, tune interacting brakes jointly.
