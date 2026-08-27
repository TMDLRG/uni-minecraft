# RED PRE-REGISTRATION — H-CYCLE-01

**Inter-layer update schedule as a cycle ratio (the operator's golden-ratio hypothesis)**

- **Status:** FROZEN. Committed **before** any instrumentation code exists and before any arm is run.
- **Prospectivity:** decided by the commit graph (D9). This record must be a proven strict ancestor
  of the commit introducing any result. A result whose prediction record is not an ancestor is
  retrospective, permanently.
- **Operator co-sign obtained (2026-08-19):** (1) the reading of *"must not impact the bound on
  surprisal"* adopted in §4; (2) lifting the standing design fence on `@l2_period`
  (`docs/specs/generative_model_depth.md:111`, `docs/specs/rung1_graded_viability.md:58`,
  `docs/RESUME_RUNG1.md:77`).
- **Verdict vocabulary:** PASS / PARTIAL / FALSIFIES / NOT_ESTABLISHED / WITHHELD. Never
  percent-scored. Never "equivalent". Never "no difference". Underpowered is not equivalence.

---

## 0. The hypothesis under test (the operator's, decomposed — not the agent's claim)

**H1 — CYCLE-RATIO MECHANISM.** There exists an inter-layer update schedule, defined purely as
counts of cycles, such that the ratio of update rates between adjacent nested layers is the golden
ratio, realised as the Fibonacci sequence: an outer layer runs `r` cycles before it moves the layer
below, cascading down.

- **H1a — SPECIFICITY.** The ratio is φ ≈ 1.618 *specifically*, not merely "some ratio > 1". An
  effect that is flat in `r` around φ FALSIFIES H1a even if the Fibonacci arm beats the flat control.
- **H1b — PURITY / TIMING ONLY.** The schedule alters only *when* a layer updates. It must not
  adjust the decision rule and must not impact the bound on surprisal.
- **H1c — NO CLOCK.** The schedule is indexed by integer cycle counts; no wall-clock quantity enters
  it. *(Already true of the incumbent: `mc.ex:337` gates on `rem(tick, @l2_period)`, `tick` a pure
  counter initialised `mc.ex:104`, incremented `mc.ex:180`.)*

**H2 — DIRECTION (the operator's registered prediction).** Update rate increases monotonically with
layer height: lower/bodily layers run at the LOWEST frequency; the OUTERMOST layer runs at the
HIGHEST frequency.

> **ADVERSE, RECORDED FIRST:** H2 is the exact inverse of what is built. `mc.ex:32`/`:337` runs the
> outer L2 once per **12** inner L1 ticks; `strategist.ex:2-4` states *"the SAME discrete engine
> instanced a level up, running slower"*; and `test/sp/brain/strategist_test.exs:51-66` asserts
> L1-fast / L2-slow and currently **PASSES**. This is good for the programme — H2 is a risky
> contradiction of the incumbent, not a restatement of it. **That test will NOT be edited to
> accommodate any result.** The incumbent is kept alive as scored arm A7.

**H1b is currently VIOLATED by the shipped code** (recorded now, before measuring): when
`mc.ex:337` fires, `modulate/4` (`mc.ex:359-367`) runs `Strategist.apply_context` (absolute `C`
overrides, `strategist.ex:96` → `efe.ex:99`/`plan.ex:155`) and `Hormones.modulate` (policy precision
`γ × (1 + 1.5·stress)`, plasticity `lr × (1 − 0.6·stress)`, `hormones.ex:20-23,29-35`). Changing the
period therefore changes the decision and the learning rate. Cadence and gain are the same lever
today. Neutralising this is a pre-condition of the test, not an optimisation.

---

## 1. Substrate and depth

**Colony only** (`UNI.Minecraft`). The flagellum side has no update loop for a schedule to act on
(static hierarchical density, latent integrated out, 2 free parameters, deterministic quadrature).

**Depth N = 3**, using three structures that already exist and are already wired:
L1 `Factors` (`mc.ex:136`), the `SlowContext`/`Hierarchy2` scene parent (`mc.ex:98,134,140`; built
and injected, merely OFF by default at `genome.ex:198`, coupling δ = 0.0 at `genome.ex:202`), and
L2 `Strategist` (`mc.ex:337`).

**N = 3 is the minimum at which φ is measurable at all: N = 2 yields ONE ratio, and one number
cannot exhibit a sequence.** Any N = 2 sweep is a pilot for the confound, never a test of H1a.

---

## 2. The schedule (frozen generator)

Layers indexed `n = 1` (innermost/bodily) … `N` (outermost). One BASE CYCLE = one observation
delivered to the agent. Schedule = adjacent ratio vector `r = (r_1 … r_{N-1})` plus an orientation
flag `O ∈ {OUTER_FAST, OUTER_SLOW}` naming which end is pinned to the base cycle.

**Cascaded Beatty gate** (one rule covering integer, irrational and unit ratios identically). With
`k` the 1-based firing count of the layer nearer the driver, the farther layer fires iff

```
floor(k / r) > floor((k - 1) / r)
```

and **always fires at k = 1** (registered phase convention: every layer fires once at cycle 0, so
all arms begin from an identically initialised state and differ only in schedule thereafter).

Properties (why this generator):
- `r = 1` everywhere reproduces the FLAT engine exactly — the identity control.
- `r = 12` reproduces the incumbent gate, so the shipped system is an arm, not an unmodelled baseline.
- `r = φ` is admissible directly; the realised firing pattern is the Fibonacci/Zeckendorf word, and
  integer truncation gives exactly the Fibonacci periods (1, 2, 3, 5, 8, 13, 21, 34). **"Golden
  ratio as cycle ratio" and "Fibonacci sequence of periods" are therefore the SAME arm.**
- Reversing `O` permutes which layer gets which rate but leaves the MULTISET of per-layer rates
  unchanged, so **A1 and A2 are compute-matched**: identical total layer-updates per episode. The
  direction test is a controlled contrast, not a budget comparison.

**Action emission is NOT gated** — the agent emits an action every base cycle, holding its last
committed action where no layer refreshed (the semantics already used at `mc.ex:340-342`).
Otherwise arms would differ in rate of *acting*, which is not timing of *inference*.

---

## 3. Arms — the ONLY thing that differs is `r` and `O`

Same genome, seeds, world, spawn, initial model bytes, base-cycle count, δ, precision rule, RNG stream.

| arm | `r` | `O` | role |
|---|---|---|---|
| **A0** | (1, 1) | — | FLAT CONTROL; doubles as the identity arm |
| **A1** | (φ, φ) | OUTER_FAST | **the operator's prediction (H1+H2)** |
| **A2** | (φ, φ) | OUTER_SLOW | standard deep-temporal convention; compute-matched to A1 |
| **A3** | (1.571, 1.571) | OUTER_FAST | **NEAR-DECOY π/2 — the numerology killer** |
| **A4** | (1.45, 1.45) | OUTER_FAST | far-decoy low |
| **A5** | (1.80, 1.80) | OUTER_FAST | far-decoy high |
| **A6** | (r̂, r̂) | OUTER_FAST | FITTED-FREE; r̂ by grid search [1.0, 3.0] step 0.05 on TRAINING seeds only |
| **A7** | (1, 12) | OUTER_SLOW | INCUMBENT as a scored arm |

**DECOY DISCIPLINE:** 1, 2, 3/2, 5/3, 8/5, 13/8, 21/13 are Fibonacci convergents and are
DISQUALIFIED as decoys. (1.5 looks like an obvious decoy and is actually 3/2, a convergent.)
A3/A4/A5 bracket φ from both sides so a MONOTONE-in-`r` effect is distinguishable from a PEAK-AT-φ.

**CROSSED FACTOR** (not an arm; every arm run at both): `down_payload ∈ {:full, :neutral}`.
`:neutral` makes `Strategist.apply_context` a no-op and `Hormones.of_context` constant, so the only
thing the schedule changes is *when* each layer's posterior is refreshed. `:full` (default) is
byte-identical to today.

---

## 4. The interpretive reading of H1b — OPERATOR CO-SIGNED

*"Must not impact the bound on surprisal"* is ambiguous between (i) the bound's **form** is
untouched and the inequality always holds, and (ii) the bound's **value** is unchanged. Reading (ii)
makes the hypothesis unfalsifiable — a schedule with no measurable consequence cannot be tested, and
if it had no consequence there would be nothing for φ to be the ratio *of*.

**This programme adopts reading (i)**, proved by P1–P3 below. Operator co-signed 2026-08-19.

---

## 5. Mechanical proofs — all green BEFORE any arm is scored

- **P1 — STATIC FENCE.** AST/compile-time test: `SP.Brain.Schedule` exports only boolean-returning
  predicates, and `Infer`, `Efe`, `Plan`, `Precision`, `Learn` reference neither `tick`, `counts`
  nor `Schedule`. *Falsifier:* any reference. This is the "it is a timer, not a gain" proof in code.
- **P2 — IDENTITY AT r = 1.** The scheduled engine must be BYTE-IDENTICAL to the flat engine: same
  emitted action sequence AND same sha256 of `:erlang.term_to_binary(brain.model)` over K = 500
  cycles × M = 20 seeds. *Falsifier:* any byte differs. **IF P2 FAILS THE PROGRAMME IS VOID** — the
  instrument would be measuring an accidental side effect (most likely differential RNG consumption;
  the gates must not draw from `brain.rng`).
- **P3 — BOUND HOLDS POINTWISE.** At every cycle of every arm, for every factor, `F ≥ −ln p(o)`.
  The schedule may change the *value* of F — it must, or it does nothing — but never the inequality.
  *Falsifier:* one violation anywhere.
- **P4 — CONTENT-vs-TIMING ABLATION.** The `:full`/`:neutral` crossing above.

---

## 6. Scoring rule

**Primary metric — one-step-ahead PREDICTIVE log score** (strictly proper), formed from the FORWARD
PRIOR, not the posterior:

```
p̂(o_m) = ( A^m · softmax(forward_prior(m)) )[o_m]
arm score = mean over cycles of  −Σ_m ln p̂(o_m)      [nats per cycle, lower better]
```

**LOAD-BEARING CORRECTION:** neither existing quantity is usable. `Infer.vfe/2` (`infer.ex:55-62`)
and `Precision.surprise/3` (`precision.ex:56-59`) are both computed against the POSTERIOR `m.qs` —
post-hoc fit, not prediction. A schedule that updates a layer more often would look better on them
for a reason that is not predictive skill. Requires one new pure read-only function
`Infer.predictive_surprise/2`, built from the existing private `forward_prior/1` and `obs_log/2`;
it touches no state and enters no decision.

- **AGGREGATION UNIT = THE AGENT**, never the cycle (frames/time points are not independent
  replicates). **N = 40 agents per arm**, paired by seed across arms.
- **SPLIT:** seeds partitioned once, frozen here. Training seeds are used ONLY to pick `r̂` in A6;
  held-out seeds are never touched by any tuning in any arm.
- **UNCERTAINTY:** paired agent-cluster bootstrap, 2000 replicates, house RNG seed `20260717`,
  95% percentile interval on the paired difference. Decision threshold 0.0.
- **MATERIALITY FLOOR `δ_mat` — NOT imposed by hand.** Computed BEFORE unblinding any treatment arm
  as the half-width of the NULL contrast: the flat arm A0 split into two random halves of seeds and
  scored against itself. That is this assay's own resolution floor. Any effect smaller than `δ_mat`
  is NOT_ESTABLISHED regardless of its CI.
- **SECONDARY** (reported, never primary, confounded): survival cycles, harvest, action entropy,
  distinct-cell visitation, Dirichlet mass growth per layer.

---

## 7. Gates

**VOID** — if P2 fails, or P3 fails anywhere, the run is VOID and nothing is reported as a result.

- **G1 PASS (H1+H2 supported):** A1 beats A0 **and** A1 beats A2, both paired CIs excluding 0 and
  both |effects| > `δ_mat`, **in BOTH `down_payload` settings**.
- **G2 FALSIFIES H2 (the DIRECTION TEST):** A2 beats A1, CI excluding 0, |effect| > `δ_mat`. The
  standard convention wins and the operator's registered direction is falsified. Because A1 and A2
  are compute-matched, no "the fast arm just got more updates" rebuttal is available to either side.
- **G3 FALSIFIES H1a (SPECIFICITY / numerology):** A1 and A3 (π/2) indistinguishable — CI contains 0
  AND width < `δ_mat` — while both beat A0. Verdict: the effect is *"slowing the inner layers
  helps"*, NOT *"the golden ratio"*. **This must be reported as the headline of the receipt, not as
  a caveat, and the words "golden ratio" may not appear in any positive claim thereafter.**
- **G4 SUPPORTS H1a:** A1 beats A3, A4 and A5, all CIs excluding 0 and all |effects| > `δ_mat`, AND
  A6's `r̂` CI contains φ and excludes 1.0. **This is the only route to a φ claim.** Anything weaker
  is G3.
- **G5 FALSIFIES H1b (timing-only):** the schedule effect is present at `:full` and absent at
  `:neutral`, interaction CI excluding 0. The effect was carried by the DOWN message's content
  (`C`, `γ`, `lr`) rather than by timing. **Given how `mc.ex:359-367` is wired this is the most
  likely single outcome, and it is pre-registered as such so it cannot be reframed after the fact.**
- **G6 NOT_ESTABLISHED:** any primary CI contains 0, or |effect| < `δ_mat`.

**MULTIPLICITY:** the PRIMARY contrast is **A1 vs A0 at `down_payload = :neutral`**. All others are
SECONDARY; the family (8 arms × 2 payload settings) is stated here. G2, G3 and G5 are named
secondary contrasts with pre-declared directions and retain falsifying force; unnamed post-hoc
contrasts do not.

---

## 8. Pilot (explicitly NOT a test of φ)

Before the N = 3 ladder, an N = 2 pilot sweeps the period over {1, 2, 3, 5, 8, 12, 13, 21} crossed
with `down_payload ∈ {:full, :neutral}`. **One ratio is not a sequence; this is not evidence for or
against H1a and will not be reported as such.** It answers exactly one question: *is cadence
separable from content in this codebase at all?*

**Pre-registered prediction:** at `:full` the curve is NOT flat (the held option rewrites `C`, `γ`,
`lr`). At `:neutral` it should be much flatter. If flat at `:neutral` and non-flat at `:full`, the
shipped cadence is a **gain lever wearing a timer's coat**, H1b is measurably violated by the
estate's only cycle ratio, and the neutral-DOWN arm is thereby earned as a pre-condition of every
later arm.

---

## 9. Tests expected to move — and why that is not permission to edit them

`gen2_hierarchy_test.exs:49,63-64,72` assert outcomes after 15 and 3 ticks and depend on period-12
arithmetic; they will change under any non-incumbent arm. **PREDICTED FROM TICK ARITHMETIC, NOT
MEASURED.** They are pinned to the INCUMBENT arm A7 and must pass there; under other arms a
difference is **data, not breakage**. `strategist_test.exs:51-66` (L1-fast/L2-slow) is likewise
pinned to A7 and will not be edited.

---

## 10. Superseded

A prior test applied φ to the **sensory precision gain** `gamma_m` and returned
INCONCLUSIVE-leaning-against (optimum ≈ 1.80; φ tied with a planted decoy). **That test is about a
different object — a gain term, not an update schedule — and is hereby SUPERSEDED. It is not
evidence for or against H1/H1a/H2 and must not be cited as such in any receipt for this programme.**

## 11. Provenance of introduced constants

`8` (layer count) and `φ = 1.618…` are **class-3 introduced design thresholds: DESIGN_ONLY,
evidential for nothing.** The operator states plainly that 8 is the working number to test, not a
derived one. Note the trap: the `8` appearing in flagellum evidence is **stator occupancy
N ∈ {1..8}, a STATE count, not a layer count**; conflating them would be the category error the
truth contract exists to catch.

## 12. Claim ceiling

Nothing in this programme licenses a claim about the flagellum (no update loop), about any human
outcome (`L0..L12` is DESIGN-ONLY/NOT-SCORED/NOT-CLAIMED; emotions in this engine are labels on
posteriors, not states), about biological active-inference identity (G10/X12 NOT_ESTABLISHED,
discriminating interventions: 0), or about parity (X16 FAIL; P4 the first unsatisfied rung;
P4/P5/P7 irreducibly external). The strongest allowable sentence concerns a **simulated agent in a
Minecraft-like world**, and no more.

---

# 13. CORRECTION — H-CYCLE-01 IS WITHDRAWN (appended 2026-08-19, same day, before any arm was run)

**This programme was REJECTED by lab-team review before a single line of instrumentation was
written and before any result existed. Nothing above this line has been edited; it is preserved
verbatim as the refuted design.** Merged verdict: **REJECT** (math-breaker REJECT short-circuits
the protocol). No `Schedule` module, no gate change, no `down_payload`, no `predictive_surprise`
was built; the working tree was verified clean.

Four defects, each independently reproduced.

**D-1 — P3, this record's own VOID condition, was ALREADY FALSE in shipped code.** Closed form:
after `Infer.infer_states` sets `qs` to the exact softmax minimiser,
`F = −ln Σ_s p⁻(s) · Π_m A^m[o_m|s]^(γ_m)`. The tempered likelihood `A^γ` is **never
renormalised**, so γ parameterises no probability model, `∂F/∂γ > 0` everywhere, and **F → 0 as
γ → 0**: the engine's objective pays maximally for blindness. The bound holds with *equality* at
γ = 1 and fails for every γ < 1.

| γ_m | F | −ln p(o) | P3 |
|---|---|---|---|
| 2.0 | 0.891598 | 0.693147 | holds |
| 1.0 | 0.693147 | 0.693147 | equality |
| 0.5 | 0.458145 | 0.693147 | **violated** |
| 0.1 | 0.114375 | 0.693147 | **violated 6.06×** |
| 0.01 | 0.011979 | 0.693147 | violated 58× |

*(A = [[0.9,0.1],[0.1,0.9]], d = [0.5,0.5], o = 0.)* Measured on the **live default agent**
(5 seeds × 200 cycles × 12 factors, comparator using the engine's own `softmax(ln B·s)` forward
prior): min γ_m 0.635, **7261 / 12000 = 60.5% of factor-cycles violate P3**, worst shortfall 0.765
nats. `Precision.update_sensory` drives γ_m toward `2.0/(s+1.0)`, so γ_m < 1 whenever a channel's
surprise exceeds 1 nat — routine. **The VOID condition is violated in the majority of
factor-cycles, in shipped code, with no schedule anywhere near it.** Note also that
`precision_test.exs`'s test *named* "the upper-bound property holds" only asserts F falls under
perception; it never compares F to `−ln p(o)`. The estate has never tested this property.

**D-2 — the L1 gate in §2 is a content change dressed as timing.** `Factors.infer_states` itself
calls `Precision.update_sensory` (factors.ex:89), so the single proposed gate would gate perception
+ Dirichlet `learn` + `grow` + sensory precision in one act, while `commit_action`
(mc.ex:153 → factors.ex:111-121) bumps the habit prior `pe`/`e` **outside any gate**, every base
cycle, and nothing decays `pe`. An arm at ratio `r` buys ~1/r of the model-evidence mass against
habit accruing at rate 1. P1 (a static fence over five callee modules) **cannot see it**, because
the asymmetry lives in `mc.ex`.

**D-3 — the depth-3 ladder does not exist.** `w` is written in exactly one place
(`Hierarchy2.new/3`, hierarchy2.ex:39); no update path exists anywhere.
`MC.build_slow_context` (mc.ex:460-473) hands it uniform columns, so `child_priors = W·q(scene)` is
**uniform for every `q(scene)`** — the DOWN message is literally invariant to the parent's belief,
hence invariant to how often the parent refreshes. **`r_2` produces exactly zero variation, by
construction.** Worse: the one non-trivial thing a δ>0 coupling does (infer.ex:36) is
`vscale(forward_prior, 1-δ)` — it **tempers the forward prior**, i.e. a gain carrying no scene
information. *The middle layer's only live effect is the thing H1b forbids.* Real depth is 2, and
by §1's own sentence one ratio cannot exhibit a sequence, so **H1a was untestable as designed.**

**D-4 — §2's generator cannot reproduce the incumbent, and §2 says it can.** Literal §2
(`floor(k/r) > floor((k-1)/r)`, always fire at k=1) at r=12 fires at `[0, 11, 23, 35, 47]`; the
incumbent `rem(tick,12)==0` fires at `[0, 12, 24, 36]`. The rate matches, the **phase does not, and
no value of r fixes it** — the required Beatty index `{1,13,25,…}` is not `{ceil(r·j)}` for any r.
Structural, not tuning. Consequence: **arm A7 was not the incumbent**, and the claim in §2 that
"`r = 12` reproduces the incumbent gate" is FALSE as written. *(`floor` → `ceil` reproduces
`[0,12,24,36]` exactly, makes the k=1 clause redundant, and still leaves r=1 as the identity
control — but that is an amendment to a frozen record and is the operator's to co-sign, not an
agent's to apply.)*

**Feasibility, recorded for any successor design.** Default genome (`plan_depth: 5`, `plan_beam: 3`,
12 factors, `nu: 10`) costs **207.4 ms/step**; at `plan_depth: 1`, **1.0 ms/step**. P2 alone
(K=500 × M=20) is ~35 min *per arm* at default depth; the §8 pilot is ~**9.2 hours** at default
depth versus ~5 min at depth 1. **"The default genome" and the sample sizes in §6 are not
simultaneously affordable** — any successor must state which decider depth it scores.

**Preserved and reusable** (scratchpad, pre-change/pristine tree): a deterministic capture harness
and four P2 reference captures at depths 1 and 5. They already establish that **flat ≠ incumbent**
under that harness at both depths, i.e. a P2 comparison would have had the resolution to detect a
schedule change rather than passing vacuously. Step-0 baseline on the pristine tree:
`4 doctests, 1049 tests, 2 failures (4 excluded)` — the two expected control-plane ledger-tally
tests, by name.

**STATUS: WITHDRAWN.** No successor may be pre-registered until D-1 is repaired, because every arm
of every schedule test inherits an objective whose gradient points at blindness. The indicated
repair is to **normalise the tempered column**, `p_γ(o|s) = A[o|s]^γ / Σ_o' A[o'|s]^γ`, giving
`F → ln(n_o)` as γ→0 and finite F as γ→∞ — a **bounded interior optimum**, which converts precision
from a clamped heuristic into a derivable quantity. That is an FE-touching engine repair and is
principal-gated.

*This correction is appended, never substituted. The refuted design above is the evidence that the
gate worked.*
