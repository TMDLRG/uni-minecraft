# VFE / ELBO / EFE Bound Discipline for the Agent Layer

## Scope

This document specifies the **variational free energy (VFE)**, **evidence lower bound (ELBO)**, and **expected free energy (EFE)** identities that govern the simulation lab's agent layer — **model comparison and policy scoring only**. It is **not** a physics proof and **not** a clinical claim. Per `lab/docs/SCIENTIFIC_LIMITS.md`, the **host** system implements a live active-inference loop (`SP.*`: `SP.Sim.step/1` runs `Body.step` → `Sensor.transduce` → `agent_mod.decide` → `interpret_all`, and `SP.Brain.Agent.decide/3` commits the chosen action so the next tick's prior and transition-learning condition on it — a closed perceive→infer→act→learn loop where actions change future observations). This *lab* layer adds **no** separate agent loop; it only documents the bound discipline the host agent's VFE/ELBO/EFE math is held to, and fences the language.

## Equations (preserved exactly)

**VFE — upper bound on surprisal** (Class A; `docs/MATH_DERIVATIONS.md` 8, 20–22):

$$F[q] \;=\; \int q(\eta|r)\,\ln\frac{q(\eta|r)}{p(y,\eta|m)}\,d\eta \;=\; D_{\mathrm{KL}}\!\big(q(\eta|r)\,\|\,p(\eta|y,m)\big) \;-\; \ln p(y|m)$$

**ELBO** (Class A):

$$\mathrm{ELBO}(q) \;=\; -F[q] \;=\; \mathbb{E}_q[\ln p(y,\eta|m)] + H[q] \;\le\; \ln p(y|m)$$

**EFE — policy scoring** (Class B; Sajid, Ball, Parr & Friston 2019/2021, arXiv:1909.10863):

$$G(\pi) \;=\; \mathbb{E}_{q(o,s|\pi)}\!\big[\ln q(s|\pi) - \ln p(o,s|C)\big] \;=\; \underbrace{\mathbb{E}[D_{\mathrm{KL}}(q(o|\pi)\|p(o|C))]}_{\text{risk}} + \underbrace{\mathbb{E}_{q(s|\pi)}[H[p(o|s)]]}_{\text{ambiguity}} \;-\; \underbrace{\mathrm{IG}}_{\text{info gain}}$$

Selection (canonical repo form, CLAUDE.md §2/§3): $Q(\pi) = \mathrm{softmax}\big(\ln E - \gamma\, G(\pi)\big)$.

## Variables and Units

- $F[q]$: variational free energy [nats]. **Lower is better.**
- $q(\eta|r)$: moving recognition density over hidden causes $\eta$, parameterized by recognition states $r$ [dimensionless density].
- $p(\eta|y,m)$: exact posterior **under model $m$** [density] — model-internal, **not** the world/process.
- $p(y|m)$: model evidence [probability]; $-\ln p(y|m)$ = surprisal [nats].
- $H[q]=-\mathbb{E}_q[\ln q]$: entropy [nats]. $\gamma$: policy precision [dimensionless]; $E$: habit/prior. $C$: log-preferences. IG: expected information gain [nats, **subtracted** → epistemic drive].

## Worked Example (numbers)

Binary hidden cause $\eta\in\{0,1\}$, model posterior $p(\eta{=}1|y,m)=0.8$. If $q(\eta{=}1|r)=0.5$:

$$\mathrm{KL} = 0.5\cdot\ln\tfrac{0.5}{0.8} + 0.5\cdot\ln\tfrac{0.5}{0.2} = 0.5(-0.470) + 0.5(+0.916) = \mathbf{0.223144\ \text{nats}}$$

So $F = -\ln p(y|m) + 0.223144$ — **above** the surprisal floor by exactly the KL gap. (Per the verdict correction: $-0.470$ and $+0.916$ are the *unweighted* logs; the 0.5-weighted contributions are $-0.235$ and $+0.458$.) If instead $q=0.8$ (matched to the posterior), KL $=0$, the bound is **tight**, and ELBO $=\ln p(y|m)$. Minimizing $F$ drives $q$ toward the posterior; it **never** drops below $-\ln p(y|m)$.

## Dimensional Check

All terms in **nats**. VFE: KL [nats] $-\ln p(y|m)$ [nats] $\Rightarrow$ [nats]. ELBO: expected log-joint [nats] $+$ entropy [nats] $\le$ log-evidence [nats]. EFE: risk (KL) $+$ ambiguity (entropy) $-$ info-gain, all [nats] $\Rightarrow G$ [nats]; info-gain subtracted lowers $G$ (sign matches CLAUDE.md §2/§4). **PASS** (independently re-verified in verdict).

## Evidence Class per Claim

- VFE is an **upper** bound on surprisal; $F\ge-\ln p(y|m)$; ELBO $\le\ln p(y|m)$ — **Class A** (derived in-repo).
- $q$ vs $p$, and $p(\eta|y,m)$ ≠ the world — **Class A** invariant.
- EFE decomposition (risk + ambiguity − info-gain), $Q(\pi)$ selection — **Class B** (peer-reviewed).
- KL-gap $=0$ iff $q=$ posterior; 1e-10 acceptance threshold — **Class A** (theorem on tree/junction-tree only; **regression check** on loopy graphs).

## Falsification Conditions

- Observe $F < -\ln p(y|m)$ for any $q$ → the bound identity is **contradicted-by-test** (would indicate a code/derivation defect).
- ELBO exceeding $\ln p(y|m)$ → inequality inverted → contradicted.
- On a declared tree/junction-tree, $\max|q_{BP}-q_{\text{enumerated}}| \ge 10^{-10}$ → the **exactness** claim fails (downgrade to VARIATIONALLY-CONTROLLED).

## Outside This Model (fence)

This domain proves **no physical mechanism**: not gravity ($g=GM/R^2$ stands on its own; $g=kP$ is **X / contradicted-by-test**), not ozone chemistry, not water formation, not the origin of life. Free energy here is **information-theoretic** (energy−entropy over densities), **not** literal Helmholtz/Gibbs (no $pV$, no temperature). ELBO/VFE **rank models within an assumed hypothesis space** — they are surrogates for intractable log-evidence, **not** truth certificates; "a simulation proves reality" is forbidden. The **host** runtime *is* a closed perceive→infer→act→learn loop (actions change future observations; `SP.Sim`/`SP.Runtime.Agent`/`SP.Brain.Agent`), but this *lab* domain proves **no physical mechanism** and registers **no capability** beyond that — the standing not-yet-shown fence (`lab/docs/SCIENTIFIC_LIMITS.md`) is that no *novel, pre-registered, out-of-sample prediction* a mainstream baseline cannot make has yet survived. "Trauma-locked agent" = a parameter-regime analogy (maladaptive priors / miscalibrated $\gamma$), **never** a clinical claim. Exactness is always **relative to a declared factorization**. Citation: Sajid et al. = **2019** (arXiv:1909.10863) / **2021** (Neural Computation), not 2020.