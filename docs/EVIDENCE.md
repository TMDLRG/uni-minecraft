# UNI — Scientific Evidence Report & Falsification Invitation

**System:** THE STRATIFIED PALIMPSEST — a pure-Elixir active-inference agent ("UNI") that
plays real Minecraft through a `mineflayer` body.
**Status:** gen-2. Reasoning stack live and on-screen; pure-OTP runtime; on-chip math fence.
**Date of report:** generated at audit time. **Branch:** `gen2-runtime`.

This document states precisely **what is claimed**, **what is proven and how**, **what is
NOT claimed**, and **how anyone, anywhere, can try to falsify it**. It is written to be
attacked. If a claim below survives your best attempt to break it, that is the result.

---

## 0. The one-paragraph claim

UNI is a discrete **active-inference** agent. It selects actions to minimise **expected
free energy** (EFE) — an explicit sum of an epistemic (information-gain) term and a
pragmatic (preference) term — over beliefs maintained by minimising **variational free
energy** (VFE). There is **no reward signal and no reinforcement learning** anywhere in the
system. The numerical core is **pure Elixir** with **zero foreign computation layers** (no
Nx, no Rust, no NIF, no math FFI), JIT-compiled to native CPU code by BeamAsm. A two-level
hierarchy (L1 fast sensorimotor, L2 slow strategic) communicates across a Markov blanket
that carries **only primitives**. Every numerical kernel is checked to **1e-6** against an
independent Python (scipy/numpy) oracle, and 26 acceptance gates are enforced in CI.

---

## 1. Architecture (what runs)

```
 Minecraft world  ──σ(senses)──►  body (mineflayer, Node)  ──σ line──►  SP.Runtime.Agent
                                                                              │  (pure cmd/2)
                                                                              ▼
        L2 Strategist (slow OODA, every 12 ticks)  ◄── situation digest (a primitive int)
                          │  option + C-overrides + hormones (down)
                          ▼
        L1 Factors model  ── infer (VFE) ─► learn (Dirichlet) ─► grow (structure) ─► decide (EFE)
                                                                              │
                                  α(action atom) ◄── Directive.Actuate ◄──────┘
```

- **Markov blanket (η ⊥ r | σ,α).** Only two messages ever cross body↔brain: a sense line
  `σ` in, one action atom `α` out. Only an integer situation digest crosses L1↔L2 up, and
  an option atom + a preference-override map down. No belief struct ever crosses.
- **Purity boundary.** `SP.Runtime.Agent.cmd/2` consumes a CloudEvents `Signal`, runs one
  perception→learning→action cycle (`MC.step/2`), and returns directives. It performs no
  effects; the runtime interprets directives. This is the Jido contract, implemented in
  pure OTP with **zero Jido in the build**.

---

## 2. Mathematical derivations

Notation: hidden states `s` (per factor `f`), observations `o` (per modality `m`), actions
`u`/policies `π`. `A` = likelihood `P(o|s)` (column-major, `A[:,s]` a distribution over o).
`B^u` = transition `P(s'|s,u)` (column-major, `B[:,s]` a distribution over s'). `C` =
log-preferences over outcomes. `D` = prior over states. `E` = habit prior over actions.

### 2.1 Variational free energy (perception) and the bound

For one factor with observation `o`, the variational posterior `q(s)` minimises

  F[q] = Σ_s q(s)·( ln q(s) − ln P(o,s) )
       = D_KL[ q(s) ‖ P(s|o) ] − ln P(o).                                   (2.1)

Because `D_KL ≥ 0`, **F is an upper bound on surprisal**: `F ≥ −ln P(o)`. Minimising F
over q tightens the bound; the minimiser is the true posterior and then `F = −ln P(o)`.

The mean-field update (per factor) that this report's code performs is

  ln q(s) = forward_prior(s) + Σ_m γ_m · ln A^m[o_m, s] − ln Z,             (2.2)

with `q = softmax(...)`. `γ_m` is the (dynamic) sensory precision of modality m.

**Gate 3** asserts `F ≥ −ln P(o)` numerically on a worked 2-state example.

### 2.2 The forward message: `(ln B)·s`, NOT `ln(B·s)`  (bound-critical)

The empirical prior over the next state, used as `forward_prior` in (2.2), is the
**expected log-transition**, computed by logging the transition columns first and then
taking the belief-weighted sum:

  forward_prior(s') = Σ_s q(s) · ln B^u[s', s]   ≡   ((ln B)·q)(s').        (2.3)

This is **not** `ln(B·q)`. By Jensen's inequality, for a convex/concave separation,

  ln( Σ_s B[s',s] q(s) )  ≥  Σ_s q(s) ln B[s',s],                          (2.4)

so `ln(Bq) ≥ (ln B)q` pointwise, with a strictly positive gap whenever B mixes states.
Using `ln(Bq)` would **break the VFE upper-bound guarantee** (§16 of the spec). The code
implements (2.3) in `Math.ln_matvec/2`.

**Gate 2** asserts the Jensen gap is strictly positive on a worked example
(`gap ≈ 0.1845` for `B=[[0.7,0.3],[0.2,0.8]]`, `q=[0.5,0.5]`).

### 2.3 Mean-field factorisation (the joint is never built)

The agent maintains a factorised belief `q(s_1,…,s_F) = Π_f q_f(s_f)`. The belief state has
size `Σ_f N_f` (sum of per-factor cardinalities), **not** `Π_f N_f` (the joint). For the
default 7-factor agent: `Σ_f N_f = 4+4+6+3+3+4+5 = 29`, while the joint would be
`Π_f N_f = 17 280`. The joint is never materialised; all updates are per-factor.

**Gate 5** asserts `belief_size == Σ_f N_f` and reports `29` vs `∏ = 17280`.

### 2.4 Expected free energy (action) and its decomposition

For a policy `π` (action sequence), the expected free energy at horizon step τ is

  G(π) = Σ_τ  E_q[ ln q(s_τ|π) − ln q(s_τ|o_τ,π) ]   (epistemic, negative info gain)
              − E_q[ ln C(o_τ) ]                        (pragmatic, expected preference).  (2.5)

- **Epistemic term**: expected reduction in uncertainty about hidden states — drives
  curiosity/exploration. It is **intrinsic**; it is not a reward.
- **Pragmatic term**: expected log-preference of the outcomes the policy is expected to
  bring about. `C` is set by the curriculum/phase (and, at L2, by the strategic option).

Action posterior:

  Q(π) = softmax( ln E − γ · G(π) ),                                       (2.6)

where `E` is the habit prior over actions (agency) and `γ` is the dynamic **policy
precision**. The chosen action is **sampled** from `Q` (exploration preserved), then
committed; the habit `E` is a Dirichlet count strengthened toward what the agent does
(idleness excluded, heritably — see §2.7).

**Gate 7** asserts `G` decomposes into finite epistemic + pragmatic parts and `Q(π)` is a
proper distribution.

### 2.5 Dirichlet learning (no reward)

`A`, `B`, and `E` are Dirichlet-distributed; learning is **counting co-occurrences**, not
gradient-on-reward:

  a_post[o,s] = a_prior[o,s] + η · q(s)·[obs = o],                          (2.7)
  b_post[s',s] (per action) updated analogously from `q(s')q(s)`,
  e_post[u]   = e_prior[u] + [action = u]   (unless u = noop, heritable).

with learning rate `η`. Expected log-likelihoods used in inference are `ψ(a) − ψ(Σ a)`
(the digamma expectation of `ln` under a Dirichlet). **Gate 1** asserts `ψ(x)` matches
scipy to 1e-6 at anchor points.

There is **no value function, no TD error, no policy gradient, no reward** — only VFE
(perception), EFE (action), and Dirichlet counting (learning).

### 2.6 Dynamic precision (attention / confidence)

Sensory precision `γ_m` is retuned from the surprise of what each modality just saw
(attention). Policy precision `γ` is updated from the variance of EFE across policies
(`Precision.update_policy`): sharper when the agent is confident which policy is best,
flatter when ambiguous, then **clamped** to `[γ_min, γ_max]`. Because `Math.softmax`
subtracts the max before exponentiating and `γ` is clamped, the policy distribution is
numerically stable even under high-stress (high-`γ`, strong-`C`) regimes (verified).

### 2.7 The L2/L1 hierarchy (two selves)

L2 is the **same** discrete engine instanced a level up and run slower (every 12 L1 ticks).
Its hidden factor is the strategic **situation** {calm, threatened, depleted, social, idle};
its actions are strategic **options** {forage, build, flee, socialize, rest}.

- **Up (a primitive):** the body-computed situation index (an integer 0–4) is L2's
  observation. No belief crosses.
- **Down (primitives):** the chosen option sets L1's empirical priors as **absolute**
  preference-override vectors `C` (idempotent), and a hormone state retunes L1's policy
  precision `γ` (stress→sharper) — transiently. The persisted L1 model stays pure
  (transient `γ`/`C`/`lr` stripped), so memory round-trips across death.

The two selves genuinely differ in timescale: L1 commits within a tick; L2 integrates over
many digests with a sticky transition, so the "remembering self" concentrates only under
sustained evidence (verified by an entropy-decrease test).

**Transition convention (and a fixed defect).** `B` is column-major: `col_j = P(next|j)`.
An earlier gen-2 build of the L2 option-transitions was transposed (outer index = next),
which `Model.new`'s column-normalisation silently masked — the coarse `flee` outcome
survived only via `A`+`C`, while the designed per-option differentiation was scrambled.
This was found in audit, fixed (outer index = source), and **live-verified**: agents now
select situation-appropriate options (flee under threat, forage when safe/idle/social) with
diverse multi-step intents. A semantic orientation test now guards against regression.

---

## 3. Evidence (what is proven, and how to reproduce it)

All commands run from the repo root with Elixir 1.19 / OTP 28.

| Evidence | Command | Result |
|---|---|---|
| Core test suite | `mix test` | **266 tests, 0 failures** |
| UI test suite | `cd ui && mix test` | **11 tests, 0 failures** |
| §16 covenant gates (×2 cards) | `mix sp.brain.verify` | **all gates pass** |
| Oracle 1e-6 parity | `mix test test/sp/brain/oracle_test.exs` | digamma/VFE/EFE match scipy/numpy |
| No foreign layer (gate 14) | `mix sp.brain.verify` | 23 math files foreign-free |
| Native JIT (gate 15) | `mix sp.brain.verify` | `emu_flavor == :jit` |

### 3.1 The 26-point covenant (enforced gates)

Per compiled card, gates 1–13 (digamma≈scipy; `(lnB)s≠ln(Bs)`; VFE bound; A/B stochastic;
mean-field no-joint; purity; EFE decomposition; bounded planning ≡ exhaustive at full beam;
hierarchy blanket primitives-only; Designer≡Genome) plus deferred runtime gates 8–10
(blanket σ/α only; lockstep; leakage). Gen-2 adds **global** gates 14 (no foreign layer in
the math namespace) and 15 (native JIT). CI fails if any gate breaks — the covenant is
enforceable, not aspirational.

### 3.2 Live evidence (in the actual game)

Embodied agents on the live server were observed (via the colony snapshot) to:
- run continuous perception→action cycles (counts in the hundreds), self-healing across
  in-game deaths (the body reconnects in 4 s);
- select **situation-appropriate** L2 options — `flee` under threat, `forage` when safe —
  not a uniform/degenerate choice;
- emit **multi-step plans** (e.g. `forward → forward → forward`, `turn → forward → mine`)
  from deep recursive-EFE lookahead;
- surface emotion (content/grief/anger), stress, and a metacognitive-confidence read on
  the `/stream` overlay.

---

## 4. What is explicitly NOT claimed (the fences)

- **No reward / no RL.** This is a design invariant, not a tuning choice. Falsifiable by
  search (§5).
- **No qualia, no sentience, no felt experience.** The "consciousness functions"
  (`SP.Brain.Awareness`: global-availability broadcast, reportability, metacognition) model
  *access and report*, not phenomenal experience. The report is the agent describing its
  computed state. We make **no** claim about the hard problem. See `docs/PHENOMENOLOGY.md`.
- **No biological fidelity claim** for hormones/emotion — they are parameter-modulation
  mechanisms (engineering choices), not measured neuro-endocrinology.
- **Not proven optimal.** EFE minimisation is a principled objective, not a guarantee of
  task-optimal behaviour in Minecraft.

---

## 5. Falsification protocol — please try to break this

We invite the community to attack any claim. Concrete, actionable tests:

1. **Oracle parity.** Re-derive the digamma/VFE/EFE/`(lnB)s` values independently (your own
   scipy/numpy/Julia) and compare to `mix sp.brain.verify` gate outputs. Claim: agreement to
   1e-6. *Falsify by exhibiting a divergence beyond 1e-6 on any anchor.*
2. **No-reward.** `grep -ri "reward\|q_learning\|td_error\|policy_gradient\|return" lib/`.
   Claim: no reward/RL machinery drives behaviour. *Falsify by finding a value/return signal
   in the action path.*
3. **No foreign layer.** Inspect `lib/sp/brain/*.ex` (gate 14). Claim: the math is pure
   Elixir, no Nx/Rust/NIF/FFI. *Falsify by finding a foreign compute call in a math kernel.*
4. **VFE bound.** Construct adversarial `A`/`D`/`o` and check `F ≥ −ln P(o)` (gate 3 logic).
   *Falsify by exhibiting `F < −ln P(o)`.*
5. **Mean-field.** Verify the joint `∏_f N_f` is never allocated (gate 5; memory profile a
   long run). *Falsify by showing a joint-sized allocation.*
6. **Blanket purity.** Inspect the body↔brain protocol and the L1↔L2 messages. Claim: only
   `σ`/`α` and primitive digests/options cross. *Falsify by finding a belief/state object
   crossing a blanket.*
7. **Determinism.** Same `(params, observation, seed)` ⇒ same action (gate 6). *Falsify by
   exhibiting nondeterminism with fixed inputs.*
8. **Hierarchy responsiveness.** Drive sustained "threatened" senses; claim the L2 commits
   to `flee` and applies the danger-`C` override + stress. *Falsify by showing it does not
   respond, or responds to the wrong situation.*
9. **Option correctness (the fixed defect).** Verify the L2 transition `B` is column-major
   and oriented (flee moves a threatened source toward calm) — `Strategist` orientation
   test. *Falsify by showing scrambled option selection.*
10. **Memory across death.** Save→load→step; claim the learned model round-trips exactly and
    keeps learning. *Falsify by showing memory loss or a non-round-trip.*
11. **On-chip.** Run on a non-JIT BEAM; claim the runtime refuses to start (gate 15 / boot
    fence). On a JIT BEAM, benchmark `MC.step` throughput. *Falsify the "native code" claim
    by showing the kernels are not JIT-compiled.*
12. **Consciousness fence.** Attempt to show the `Awareness` report constitutes evidence of
    qualia. Claim: it does not — it is access/report only. *This is the bounded, honest
    question we most want stressed.*

---

## 6. Standing open questions (unresolved; we want data)

- **Does metacognitive confidence climb meaningfully over a long single life** as `A`
  sharpens? (Early life it reads ~0 by construction — uninformative likelihoods. Not yet
  observed climbing over many hours.)
- **Does population evolution within kin produce fitness gains across generations** in the
  live game? (Unit-tested with simulated deaths via `SP.Runtime.Lineage`; not yet observed
  breeding across real in-game deaths over a long run.)
- **How much of "reported consciousness" do access/report/metacognition reproduce, and
  where do they provably fall short?** (The falsification ledger in `docs/PHENOMENOLOGY.md`.)
- **Does the L2 "remembering self" yield measurably better long-horizon outcomes** than
  L1-only agents under matched conditions?
- **Structure growth**: does letting factors grow their state space pay for itself
  (better evidence per added state) over long runs?

---

## 7. Reproducibility

- Elixir 1.19.x / OTP 28 (BeamAsm JIT). `mix deps.get` (core has zero hex deps).
- Minecraft: a local offline-mode Paper server (FOSS, on your own server; no Mojang
  login, no cracking). Node + `mineflayer` under `viewer/`.
- `mix sp.brain.verify` (gates), `mix test` (suite), `mix uni.play` (single agent),
  `/stream` (the live colony overlay).

---

*This report is an invitation. The system is built to be falsified; the covenant holds
because CI breaks when a gate breaks. If you break a claim that CI does not catch, that gap
is itself the contribution — please report it.*
