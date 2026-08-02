# Typed Model Spec — `:novelty` (parameter information-gain EFE term)

**Status:** MERGED + gated (live). This document is ARTIFACT #1: the typed model spec of the
already-merged novelty term (`lib/sp/brain/novelty.ex`), authored by the AIF Core Theorist.
It is also the **TEMPLATE every Phase-2 organ inherits** — every gated organ spec
(`docs/specs/metabolism.md`, etc.) MUST reproduce these nine sections in this order, cite real
`file:line`, and carry a ClaimFence.

> **What "novelty" is, in one line:** the third Expected-Free-Energy term — *parameter*
> information gain over the Dirichlet counts of `A` (and `B`) — that the flat two-term EFE
> (epistemic `H[qo] − E[H(o|s)]` + pragmatic `qo·C`) was missing. It is the pymdp/SPM
> **pA-novelty** approximation (NOT the digamma `E[ln A]` form), per UNI-GPT consult Q2
> (SIGN-WITH-CHANGES). It rides the **epistemic channel** under the **same γ** as the
> state-epistemic term, is **independent of C**, and **decays monotonically to 0** as counts → ∞.

**Source files (all absolute; root `C:\Users\mpolz\Documents\Strings`):**
- `lib\sp\brain\novelty.ex` — the term itself (`w_a/3` `:36-50`, `w_b/3` `:57-71`, `@floor` `:30`).
- `lib\sp\brain\plan.ex` — the LIVE depth-5 decider integration (`advance/3` `:124-148`; A-novelty `:137`, B-novelty `:142`; gain read `:92`; `pa_m` carried `:97`).
- `lib\sp\brain\efe.ex` — the depth-1 mirror (`step_value/3` `:87-101`; A-novelty `:98`; gain read `:91`).
- `lib\sp\brain\model.ex` — `novelty_gain` field default `0.0` (`:35`, `:98`); Dirichlet seed `pa = A*1+1`, `pb = B*1+1` (`:84-85`, `:115`).
- `lib\sp\brain\genome.ex` — gating (`curiosity_primary/1` `:189-191`; field default `:143`; defensive read `:219`; back-fill `:344`; mutate draw `:304`; recombine `:330`).
- `test\sp\brain\novelty_test.exs` — the 6 ValidationAnchors (`:16-81`).

---

## 1. StateSpace

The novelty term **adds no hidden-state factor and changes no state space.** It is a read-only
functional of the *existing* generative model's belief `q(s)` and Dirichlet concentrations. It is
defined per-factor and consumes only that factor's own quantities — so the **mean-field
factorisation `q(x) = Π_f q(x_f)` is preserved** (no joint is materialised; `plan.ex:88-100`
builds an independent per-factor context, `advance/3` `:124-148` rolls each factor independently).

Per factor `f` with `Ns_f` hidden states and `No_f` outcomes, the quantities the term reads:

| Symbol | Meaning | Type | Where |
|--------|---------|------|-------|
| `qs` | current belief over the `Ns_f` states | `[float]` length `Ns_f`, Σ=1 | `plan.ex:130` (`qs1 = B^u·qs`); `efe.ex:96` |
| `qs1` | predicted next-state belief under action `u`, `B^u·qs` | `[float]` length `Ns_f` | `plan.ex:129` |
| `qo` | predicted outcome, `A·qs1` (Plan) / `A·qs` (Efe) | `[float]` length `No_f`, Σ=1 | `plan.ex:133`, `efe.ex:96` |
| `pa_m` | A Dirichlet counts, COLUMN-MAJOR (`Ns_f` columns of `No_f`) | `[[float]]` | `novelty.ex:34`; carried `plan.ex:97` |
| `pb_u` | B Dirichlet counts for action `u` (`Ns_f` columns of `Ns_f`) | `[[float]]` | `novelty.ex:54`; `plan.ex:142` `elem(pb_tuple, u)` |

`pa`/`pb` are the live Dirichlet concentrations (the learning state), **seeded** `pa = A*1+1`,
`pb = B*1+1` (`model.ex:84-85`, `add1/1` `:115`) — so the minimum count is the prior pseudocount,
which is exactly the `@floor` (§6).

---

## 2. ObservationChannels

The term introduces **no new observation modality** and reads **no observation** at decision time.
It is purely *prospective*: it scores the information the agent *expects to gain about its own
likelihood/transition parameters* if it visits a `(state, outcome)` or `(state, next-state)` cell,
using the predicted `qo` / `qs1` — never an actual observation. (Observation enters the system only
later, through Dirichlet learning, which raises the counts and thereby *decays* the novelty — §6.)

The two novelty functionals, per factor:

**A-novelty (observation-parameter information gain), `novelty.ex:36-50`:**

```
W_a(pa, qs, qo) = ½ · Σ_s  qs[s] · ( Σ_o qo[o] / pa[s][o]  −  1 / Σ_o pa[s][o] )
```

with each `pa[s][o]` and each column-sum floored at `@floor` (`novelty.ex:40,45`):
`inv_colsum = 1/max(Σ_o pa[s][o], @floor)`, and the inner term sums `qo[o]/max(pa[s][o], @floor)`.

**B-novelty (transition-parameter information gain) for action `u`, `novelty.ex:57-71`:**

```
W_b(pb_u, qs, qs1) = ½ · Σ_s  qs[s] · ( Σ_{s'} qs1[s'] / pb_u[s][s']  −  1 / Σ_{s'} pb_u[s][s'] )
```

— identical algebraic shape, with `qs1` (predicted next state) in place of `qo`, and the same
`@floor` clamp (`novelty.ex:61,66`). Both are **large and positive in under-sampled (low-count)
cells**, both → 0 as counts → ∞.

---

## 3. ActionSpace

The action set is **unchanged**: novelty adds no action and removes none. The shared per-factor
action index `u ∈ 0..nu-1` is the same as the rest of the engine.

**Critical invariant — novelty is NOT a scalar-per-action term.** Action `u` enters the novelty
contribution **only** by selecting (a) the transition column `B^u` that produces `qs1`
(`plan.ex:129`), and (b) for B-novelty, the per-action count column `elem(pb_tuple, u)`
(`plan.ex:142`). There is **no `+ f(u)` constant added to any action's logit.** Two actions whose
`B^u` and `pb_u` columns are byte-identical receive byte-identical novelty — this is what the
**action-clone-invariance test** (CLAUDE.md hard invariant #3) protects, and the novelty term is
constructed to pass it. (B-novelty is the *one legitimately action-indexed* EFE term, but it is
indexed through the **transition counts**, not through an action identity — the column, not the
label.)

---

## 4. PreferenceModel

**Novelty is independent of `C`.** `w_a/3` and `w_b/3` take only `(pa|pb, qs, qo|qs1)` — there is
**no `C` argument anywhere** in `novelty.ex` (`:36`, `:57`). It is information gain, never a
preference or reward. This is the structural half of the no-smuggled-reward proof (the temporal
half is the monotonic decay, §6): a term that (i) does not see `C` and (ii) vanishes as the model
saturates **cannot** be a disguised preference.

In the policy score the novelty term and the pragmatic `qo·C` term are **separate, additive
channels**: at `plan.ex:134` the base step value is `H[qo] − qs1·amb + qo·c_m`, and novelty is
added *after* on the epistemic side (`plan.ex:137`, `:142`) — it never multiplies, gates, or
rescales `C`. (Contrast: it would be a reward-hack if novelty scaled with `C`; here it is provably
orthogonal.)

---

## 5. PolicySet

Policy evaluation is the **depth-limited beam search** in `Plan.action_values/2`
(`plan.ex:26-36`) — the LIVE decider, run at `depth: 5, beam: 3`. The novelty term enters there,
and **only** there, in `advance/3` (`plan.ex:124-148`):

- **Epistemic channel placement.** The per-factor one-step value is
  `base = H[qo] − qs1·amb + qo·c_m` (`plan.ex:134`); when `ng > 0`, A-novelty is added on the
  **epistemic** side: `base + ng · W_a(pa_m, qs1, qo)` (`plan.ex:137`). After the per-modality
  reduction, B-novelty for the chosen action is added: `sv + ng · W_b(pb_u, qs, qs1)`
  (`plan.ex:142`). Both ride the **same epistemic channel under the same γ** as the state-epistemic
  term `H[qo] − qs1·amb` — there is no separate novelty precision (§7).
- **Gate.** `ng = Map.get(sub, :novelty_gain, 0.0)` (`plan.ex:92`). When `ng = 0.0`, the
  `if ng > 0.0` guards (`plan.ex:137`, `:142`) are false and the value is *exactly* the
  flat-engine step value `H[qo] − qs1·amb + qo·c` — see §8 byte-identity.
- **Depth-1 mirror.** `Efe.step_value/3` (`efe.ex:87-101`) is the depth-1 fallback; it adds **only
  A-novelty** (`efe.ex:98`, `nov = ng·W_a(pa_m, qs, qo)`), because at depth-1 the per-action
  transition counts are not rolled. **Therefore the full A+B novelty drive is realised only on the
  live depth-5 Plan path** (`plan.ex`), which is why the byte-identity anchor (§8) and the
  exploration anchor (§8) both test the **Plan** path, not the Efe path. The Efe mirror exists for
  the depth-1 code path and for pre-novelty saved models (the `Map.get … 0.0` default keeps it
  safe).

---

## 6. LearningParameters

Learning is **Hebbian Dirichlet count accumulation** on `pa`/`pb` (seeded `A*1+1`, `B*1+1` at
`model.ex:84-85`). The novelty term is the *driver toward* the cells that still need learning, and
it is annihilated *by* that learning — they are inverse:

- **Monotonic decay (the no-smuggled-reward invariant).** As any count → ∞, the reciprocals
  `qo[o]/pa[s][o]` and `1/Σ_o pa[s][o]` → 0, so `W_a → 0` (and `W_b → 0`), **independent of C**
  (CLAUDE.md hard invariant #4). Each observation increments the counts → strictly lowers the
  term → the drive to revisit a saturated cell vanishes. Proven by Anchor A (§8): the swept
  sequence is `Enum.sort(:desc)`-equal and the last element `< 1e-3` (`novelty_test.exs:24-25`).
- **`@floor = 1.0` bound (`novelty.ex:30`).** The Dirichlet prior pseudocount — you cannot be
  *more* uncertain than the prior, so counts below `@floor` are clamped before the reciprocal
  (`max(pa_so, @floor)`, `max(Σ col, @floor)`; `novelty.ex:40,45,61,66`). This makes
  `1/count ≤ 1`, so the term **cannot blow up** and cannot swamp survival (the research's γ-bound).
  It is a **no-op for any well-formed factor** (seeded counts ≥ 1); it only clamps degenerate
  sub-prior cells (e.g. a freshly structure-grown state). Proven by Anchor C (§8).
- **`novelty_gain` (the heritable coupling).** A per-factor scalar `ng ≥ 0`, default **`0.0`**
  (`model.ex:35`; `genome.ex:143`). It is heritable: drawn in `mutate/2` (the draw is **appended
  LAST**, `genome.ex:304`, clamped `[0.0, 1.0]`, so existing lineages' RNG order is unchanged),
  averaged in `recombine/3` (`genome.ex:330`), back-filled for old DNA via `Map.put_new(…, 0.0)`
  (`genome.ex:344`), and read defensively in `card/1` (`Map.get(dna, :novelty_gain, 0.0)`,
  `genome.ex:219`). The opt-in lineage is `Genome.curiosity_primary(gain)` = `%{default() |
  novelty_gain: gain}` (`genome.ex:189-191`); the control is `default/0` (`novelty_gain = 0.0`).

---

## 7. PrecisionSchedule

**No new precision parameter.** The novelty term rides the **existing policy precision γ** with the
**same weighting as the state-epistemic term** — it is *summed into the epistemic channel*
(`plan.ex:137`, `:142`; `efe.ex:98`) before the channel is scaled by γ downstream, so it shares the
state-epistemic term's precision exactly. There is **no `gamma_novelty`** and no per-novelty
sensory precision `γ_m`. The only knob modulating novelty's magnitude is the heritable
**`novelty_gain`** coupling (§6), which is an additive-organ gain, not a precision.

The amplitude bound is enforced structurally, not by a precision schedule: the `@floor` clamp (§6)
caps each cell's contribution at `≤ 1` before the `½` factor, and `novelty_gain ∈ [0,1]`
(`genome.ex:304`) caps the coupling — together these are the "cannot swamp survival" guarantee
without any tuned precision.

---

## 8. ValidationAnchors

The six tests in `test\sp\brain\novelty_test.exs` (each named with what it proves):

| # | Test (file:line) | Proves |
|---|------------------|--------|
| **A** | `"W_a is POSITIVE and decays MONOTONICALLY to 0 …"` (`:16-26`) | `W_a ≥ 0` at the prior (`:23`); the swept-count sequence is `Enum.sort(:desc)`-equal — **strictly monotonic decay** (`:24`); last element `< 1e-3` — **`W_a → 0` as counts → ∞** (`:25`). This is the no-smuggled-reward temporal invariant (hard invariant #4). |
| **B** | `"W_a is INDEPENDENT of C …"` (`:28-32`) | `w_a` takes only `(pa, qs, qo)` — **no C argument** (`:29`); identical inputs ⇒ identical value (`:31`). The structural half of the no-reward proof (§4). |
| **C** | `"novelty is BOUNDED even for degenerate sub-prior counts …"` (`:34-38`) | counts of `0.0001` would blow up an unfloored `1/count`; with `@floor` the result `abs(big) < 1.0` (`:37`) — **the count floor bounds the term** (cannot swamp survival, §6/§7). |
| **D** | `"W_b PROMOTES under-sampled actions …"` (`:40-47`) | a fresh (count-1) transition has **higher** novelty than a saturated (count-500) one (`fresh > saturated`, `:45`); the saturated transition's novelty `< 1e-2` — **decayed to ~0** (`:46`). This is the action-novelty driver that breaks the behavioural plateau. |
| **E** | `"byte-identical at novelty_gain=0 over the depth-5 Plan path …"` (`:49-56`) | over the LIVE decider `Plan.action_values(model, depth: 5, beam: 3)`, `novelty_gain = 0.0` reproduces the flat-engine action values with **max abs deviation `< 1e-12`** (`:54`). This is the byte-identity / additive-gated invariant (hard invariant #2) tested on the live depth-5 path (the depth-1 Efe mirror is insufficient). |
| **F** | `"prospective EXPLORATION: a fresh curiosity agent samples actions more uniformly …"` (`:58-81`) | running the **real live decider** for 200 steps, `Genome.curiosity_primary(0.5)` yields **action entropy > control + 0.2** (`:77`) and **more place+craft** (the under-used build/craft chain) than the fixating `default/0` control (`:79`). This is the prospective behavioural payoff: a standing drive to act where the model is still uncertain. |

**The byte-identity gate every inheriting Phase-2 organ MUST reproduce** is Anchor **E**: assert
`Enum.zip_with(v_base, v_on0, fn a, b -> abs(a - b) end) |> Enum.max() < 1.0e-12` over
`Plan.action_values(MC.new(seed: 7).model, depth: 5, beam: 3)` with the organ's coupling at its
inert default — proving the OFF path is byte-identical on the live decider, not merely on the
depth-1 mirror.

---

## 9. ClaimFence

**Binding (CLAUDE.md; `docs/LAB_PROTOCOL.md` claim fence; `docs/UNI_MISSION_DEEPENING.md:100`).**

The novelty term `W_a`/`W_b` is **measured parameter information gain** — an operational
active-learning quantity over Dirichlet counts. It is a **NECESSARY-NOT-SUFFICIENT substrate** with
**ZERO evidential weight for awareness, consciousness, experience, or life on its own.**

- Passing any novelty ValidationAnchor demonstrates the **named behaviour** (monotonic-decaying
  information gain; prospective exploration of under-sampled actions; byte-identical OFF path) —
  **never experience.** Anchor F shows the agent *acts* to reduce parameter uncertainty; it does
  **not** show the agent *is curious*, *feels* drawn, or *wants* to explore.
- The `novelty_gain` coupling, the `W_a`/`W_b` floats, and the per-cell information values are
  **model variables, not felt states.** They must **never** be surfaced or described as curiosity,
  interest, wanting, boredom, or any subjective/phenomenal term. This is **functional-access
  `novelty_drive` only** — a logit contribution on the epistemic channel, nothing more.
- No claim about awareness/consciousness/life follows from this term, this spec, or any single gate.
  The attribution fence stands: a behaviour is "passed" only against its own registered RED verdict
  (Lab Protocol); operational/organisational measures carry no evidential weight for experience.

---

## Inheritance note (why this is the template)

Every Phase-2 gated organ spec reproduces sections **1–9 above, in order**, and inherits these
load-bearing patterns from novelty:
1. **Gate at an inert default** (novelty: `novelty_gain: 0.0`) → **byte-identical OFF path**,
   verified by an Anchor-E-style mad `< 1e-12` assertion over `Plan.action_values(depth:5, beam:3)`.
2. **No scalar-per-action term** — any action dependence must enter through `B^u` / per-action
   counts (the column, not the label), protected by the action-clone-invariance test.
3. **Monotonic decay / bounded amplitude** for any information term (novelty: `@floor` + decay).
4. **Heritable knob plumbed the novelty way** — struct default, `Map.put_new` back-fill, mutate
   draw **appended LAST**, defensive `Map.get(dna, key, default)` in `card/1`.
5. **A ClaimFence section, verbatim discipline** — model variables are never surfaced as felt states.
