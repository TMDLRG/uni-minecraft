# What is wrong, what is predicted to fix it, and what that does and does not buy

*Written 2026-08-19. Every figure here was **executed**, not asserted. Where a number is
hand-derived rather than measured it says so. This document exists because a defect that could not
be seen survived for months.*

---

## 0. The goal, stated so it can be checked by someone who does not trust us

**"Full biological parity that can ship and be proven — or disproven — by others."** That decomposes
into four things, and only the first is ours to finish alone:

| # | requirement | what it means concretely | status |
|---|---|---|---|
| 1 | **Reproducible** | anyone can re-run and get identical bytes | engine is bit-deterministic; **holds** |
| 2 | **Receipted** | every claim names the artifact and command that produced it | holds for new work; older behavioural claims are **now suspect** (§3.9) |
| 3 | **Falsifiable** | each claim states what result would kill it | holds for new work |
| 4 | **Independently checkable** | a third party with no access to us can confirm or refute | **P4/P5/P7 — irreducibly external, not reachable from this repository** |

**The honest headline: nothing in this document moves biological parity.** All of it is `P0`/`P1`
work — computational integrity and equation/implementation. It is the floor that makes a parity
claim *meaningful*, not a parity claim. An engine whose beliefs are provably frozen cannot support
any statement about inference, so this work is a **precondition**, not progress up the ladder.

Biological parity lives in the flagellum programme, and its status is unchanged: **P3 as an
executed activity, with P4 (transfer) the first unsatisfied rung**, `X16 FULL_BIOLOGICAL_PARITY =
FAIL`, and `G10/X12` (does a bacterium implement active inference?) `NOT_ESTABLISHED` with zero
discriminating interventions. See `docs/EXTERNAL-DOORS-ACQUISITION-CHECKLIST.md` in the flagellum
tree for what each external door needs.

---

## 1. THE ENGINE'S FREE ENERGY WAS NOT A BOUND — **REPAIRED** `b645421`

**Wrong.** The likelihood was raised to the sensory-precision power and never renormalised:
`F = −ln Σ_s p⁻(s) Π_m A^m[o_m|s]^γ_m`. So γ parameterised **no probability model**,
`∂F/∂γ > 0` everywhere, and `F → 0` as `γ → 0` — **the objective the engine minimises paid
maximally for going blind.** Measured: 50.5% and 60.5% of live factor-cycles violated
`F ≥ −ln p(o)` in two runs with different sense streams.

**Repair.** Normalise the tempered column, `p_γ(o|s) = A[o|s]^γ / Σ_o' A[o'|s]^γ`.

**Predicted, and verified.** Outcome mass `Σ_o e^(−F(o))` = **exactly 1** at every γ (was 4.19 at
γ=0.1 — the engine was manufacturing probability out of nothing). `F → ln(n_o)` as `γ → 0` instead
of collapsing to 0. The argmin over γ **moves off the clamp**, so precision becomes *derivable*
rather than pinned — the precondition for it ever being model-adjustable.

**Correction to my own claim.** I said this would take violations to zero. It goes **50.5% → 22.3%**
against the *untempered* comparator, and no repair could have zeroed that: the normalised tempered
model is a different, legitimate model, so that comparison is a crossing point, not a floor. Against
**its own** model the repaired F is a proper bound — **0 of 12 000**.

**Untested where it matters.** Every live factor was degenerate (§2), so this repair has **never run
on a non-degenerate likelihood**. The frozen-factor RED is its first real test and can only VOID it,
never confirm it.

---

## 2. TWELVE OF TWENTY-ONE FACTORS ARE FROZEN BY SYMMETRY — **NEXT REPAIR**

**Wrong, and it is the largest defect standing.** For every exteroceptive factor the likelihood has
identical columns, the transitions are the identity, and the prior is uniform. Relabelling the
hidden states therefore changes **nothing**, and every update rule in the engine reads state-indexed
*values*, never a state *index* — so the whole update map is equivariant under that relabelling. An
equivariant map applied to a point invariant under the full permutation group returns a point
invariant under the full permutation group.

**The belief is uniform at every step, forever, as a matter of group theory.** Measured
`max|qᵢ−qⱼ|`: 4.4×10⁻¹⁶ (400 ticks), 3.0×10⁻¹⁵ (2 000 adversarial), 1.8×10⁻¹⁵ (600 live steps) —
float dust on an algebraic zero.

**What that costs, all measured.** The epistemic term is **exactly 0** for these factors, forever.
Their per-action value spread is 1.1–5.0×10⁻¹⁶, so they contribute **nothing to any decision at any
planning depth**. A constant added to all actions cancels in the softmax and `update_policy` is
shift-invariant, so **every strategist preference override and the entire curriculum are
behaviourally inert**. On the default genome all twelve are frozen, every action ties *exactly*, and
behaviour reduces to `softmax(ln E)` + a random draw — a Pólya urn. That is the mechanism behind the
measured absorbing action-lock (one action 95.2% of ticks, action entropy 0).

**Two things this is NOT.** It is not the learning rule — under a uniform belief an observation
carries information about *which outcome*, never *which state*; a rule that broke this symmetry
would be manufacturing information provably not in the data. It is not `ns == no` — measured at
`ns=5, no=4` the pin still holds at 1.7×10⁻¹⁶. The code comment naming `no==ns` names where the
defect was **noticed**, not what causes it.

**The actual seam.** The initialiser sets `Â₀ = 1/n_o` — the **mean of its own symmetric Dirichlet
prior**, which is precisely the one point in the simplex that every permutation fixes. *The defect is
choosing the prior's mean as the starting point, not the prior.*

**Repair, predicted.** Sample the prior instead of evaluating its mean:
`Â₀[:,s] ~ Dir(1·1_{n_o})` per state-column, drawn once, deterministically seeded from the existing
`SP.Determinism` on a committed domain string. `E[Â₀] = 1/n_o` **exactly**, so the concentrations are
byte-identical *in expectation* — **the prior is not changed by one iota; only its per-agent
realisation stops sitting on the symmetric point.** No engine kernel changes; the Python oracle is
untouched and cross-language parity is immune by construction.

**Predicted effects.** Beliefs track their own observations; the epistemic term becomes non-zero for
the first time; the agent **predicts its next observation better** on a prequential (predict-then-see)
score formed from the forward prior *before* inference and *before* learning.

**Falsifiers, pre-registered.**
- **Agitation, not inference** — beliefs move but predictive score does not improve beyond the
  assay's own null half-width. *Does not ship.*
- **Worse** — predictive score degrades materially. Then the deliberate choice at `genome.ex:91-94`
  is **vindicated for exteroception** and must be reported in those words.
- **Covenant breach** — two different pre-registered draws give materially different results, meaning
  the specific realisation carries information and a prior was smuggled in. *Does not ship.*

**Knowingly necessary but not sufficient.** With identity transitions, `q(o) = A·B^u·q` is still the
same for every action at birth. Action-differentiation waits on the per-action transitions diverging
through learning, which is slow. Failing the action criteria is **PARTIAL, not a pass** — and any
write-up claiming "the curriculum now works" on this evidence is overclaiming.

**Precedent, and it matters.** A signed lab-team review already ordered `init_a: :diagonal` for two
*exteroceptive* vision factors, calling a stuck-uniform exteroceptive factor **"an inert smuggled
feature."** That order was never fully carried out; its gate is still `PENDING`. The recommended fix
here is *more* conservative than the one already signed, because a diagonal likelihood asserts that
hidden cause *k* emits codec bin *k* — a claim about the world — whereas a draw from the unchanged
prior asserts nothing.

**Operator gate.** `genome.ex:5-9` and `docs/UNIVERSE.md:138-141` state as **covenant** that the DNA
encodes no world knowledge. The fix is built **gated off by default**, so it changes no existing
lineage; **enabling it for a scored lineage is the operator's call, not an agent's.**

---

## 3. THE REST OF THE STANDING DEFECTS

| # | wrong | predicted repair | status |
|---|---|---|---|
| 3.1 | **Absorbing action lock.** Only the taken action's transition block learns, so taking an action makes it look better, so it is taken again. In a world that does not answer back, the first accident is permanent. | Decay, or update non-taken blocks, or a genuinely responsive world. Requires design — it is an FE-touching change. | open |
| 3.2 | **Habit prior never decays** and at L2 outgrows the entire evidence spread after **3 decisions** (`ln(1+k)` exceeds 1.25 nats at k=3). | A forgetting term on `pe`. New term ⇒ lab-team review. | open |
| 3.3 | **Nothing decays or unlearns anywhere.** All Dirichlet counts grow monotonically for the life of the saved brain and are carried across death. | A principled forgetting factor. | open |
| 3.4 | **Precision is not model-adjustable.** `ρ, κ, ε₀, g_min, g_max, salience_sign` are all compile-time constants, identical for every factor, genome and lineage; evolution cannot touch them. | Now *possible* because §1 gave F an interior optimum: derive γ from the bounded F rather than clamping it. | unblocked by §1 |
| 3.5 | **Attention runs backwards.** The shipped rule attenuates a channel *because* it is surprising, and the attention spotlight is built from those same gains — so the model is steered **away** from whatever surprises it. | The operator's rule: slow world updates, faster on agreement, attention-shift on surprise-bound breach. Designed, not built. | designed |
| 3.6 | **A −36.84 nat artifact.** Hard zeros in the transitions meet an `ln(x+1e-16)` floor, so `ln 0 = −36.84` — the largest magnitude in the model, set by an arbitrary epsilon, swamping the observation by ~14 orders of magnitude on a peaked belief. L2 explicitly guards against this; every L1 factor ships it. | Floor the transition matrices like L2 does (≥0.05). | open |
| 3.7 | **The middle layer is dead.** Its weight matrix is written once as uniform and never updated, so its down-message is identical for *every* parent belief. Its only live effect (δ-tempering the forward prior) is a **gain** — the one thing a timing layer must not be. | Write `W`, or delete the layer and stop calling it a level. | open |
| 3.8 | **What you are shown ≠ what it does.** Telemetry computes from the depth-1 policy path while the agent decides at depth 5; the intent display clamps to depth 4; the previewed action is a greedy argmax while the committed action is a sampled draw. | Compute displays from the same call the decision uses. | open |
| 3.9 | **The behavioural record is suspect.** Every measurement ever taken on those twelve factors — the plateau, the "epistemic starvation" diagnosis, the hoard, the single-action lock, every curriculum phase advance — was taken on an agent whose **world-facing factors were structurally inert**. | Re-read those results after §2 lands. Not a code change; a records change. | **open, and the largest scope item here** |
| 3.10 | **`dna.lr` is a dead gene** — mutated and recombined by evolution, never reaching the learner. | Wire it or delete it. Evolution is currently spending variance on a null coordinate. | open |

---

## 4. THE FLOW — in order, with what each buys

1. **§1 free energy** — done, committed `b645421`. Buys: γ names a probability model; precision
   becomes derivable. Moves `P0/P1`. **Moves no parity rung.**
2. **§2 frozen factors** — designed, RED pre-registered, built gated-off. Buys: the agent's
   world-facing beliefs respond to the world at all. **This is the precondition for every
   behavioural claim the engine has ever made.** Moves `P0/P1`.
3. **§3.9 re-read the record** — once §2 lands, every historical behavioural result on those factors
   must be re-examined. Cheap, and it is the honest debt of §2.
4. **§3.4/§3.5 precision** — the operator's rule, now implementable on a bounded F.
5. **§3.1–3.3 decay** — the absorbing lock and the habit ratchet. FE-touching; needs review.
6. **Everything above is `P0`/`P1`.** The parity ladder moves only at
   `docs/EXTERNAL-DOORS-ACQUISITION-CHECKLIST.md`: P4 transfer needs an independent commensurate
   cohort; P5 intervention needs the discriminating wet-lab experiment (raise sensory ambiguity at
   zero gradient and see whether the motor acts to resolve it — active inference predicts yes, every
   matched alternative predicts no); P7 needs a lab independent of us and of this software.

---

## 5. What "shippable and checkable by others" requires that we can still do here

- **Every gate re-runnable from a clean clone**, with the command in the receipt.
- **Every number traceable** to a file:line or to a shown computation.
- **Every adverse result retained** and stated first — including that a plain lognormal still
  out-predicts every mechanistic flagellar model on held-out data.
- **No claim above its receipt.** `X16` stays FAIL until X01–X15 all pass; no averaging, no
  relabelling.
- **The instruments audited too.** The test named *"the upper-bound property holds"* never compared
  F to `−ln p(o)`. A vacuous test is worse than no test, because it certifies the thing it never
  checked.

*Every defect above was found by looking. The ones we have not found yet are in the parts we have
not made visible.*
