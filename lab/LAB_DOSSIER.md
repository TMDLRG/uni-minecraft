# Life, No Game — Hard-Science Lab Dossier

*A bounded, falsifiable simulation lab. Evidence classes throughout: A (derivable/established), B (mainstream peer-reviewed/agency), C (structured hypothesis), D (interpretive), U (speculative), X (contradicted-by-test). End-state words only. No broad framework is ever called "proven."*

> **Provenance.** The science prose below was produced by an adversarially-verified multi-agent
> workflow (run wf_ceaef9b2-5ab, 25 agents) and cross-checked: the verification pass caught and
> corrected real defects (a k4 arithmetic error, a mis-attributed O3 cross-section, a swapped
> Moon/Mercury label, and the gravity envelope tightened to <=0.36% from rounded data). **None of
> the corrections moved a verdict.** Every load-bearing number is sourced in lab/evidence/.
>
> **Implementation status (what actually runs).** The conclusions here are backed by pure,
> zero-dependency, deterministic Elixir modules under lib/sp/lab/, verified by
> mix test test/sp/lab/ (**26 tests + 4 doctests, 0 failures**; full suite **413 tests, 0
> failures**, purely additive):
>
> | Conclusion in this dossier | Backing module | Backing test |
> |---|---|---|
> | g = GM/R^2 holds; g = kP fails out-of-sample | SP.Lab.Physics, SP.Lab.ModelCompare | pressure model fails 5/5 bodies |
> | Ozone UV shield: tau ~ 89 at 300 DU -> transmission ~ 0 | SP.Lab.Radiation | UV-C transmission < 1e-30 |
> | Oxygen is not required for life (anaerobic survives) | SP.Lab.Bioenergetics | anaerobic cell :viable without O2 |
> | Vacuum removes convection, not radiation; energy bounded | SP.Lab.SolarEnergy | radiative floor persists as h->0 |
>
> **Not yet implemented** (owed, not hidden): full Chapman kinetics, the Hunten escape flux, a
> generational-DNA lab layer, the live UI, and a lab-side active-inference loop. See
> lab/docs/SCIENTIFIC_LIMITS.md. Reproduce everything: mix test test/sp/lab/ --seed 0.

## Executive Summary

This lab decomposed the thesis **"Ozone = Life"** into five separable readings and tested each, plus four adjacent physical claims, against sourced numbers and re-run calculations. The headline result: of the five ozone readings, **exactly one survives as established science** (the UV shield, Class B), one **survives as a narrowed conditional hypothesis** (the biosignature, Class C), and **three fail or fall outside scope**. Every cross-domain "physics" shortcut (pressure replaces gravity, vacuum yields unlimited energy, simulation proves reality) is **contradicted-by-test** or **outside-model-scope**.

| Claim | Class | Result | Reason | Test / Source |
|---|---|---|---|---|
| Ozone IS life (literal identity) | U/X | contradicted-by-test | Abiotic O₃ on sterile Venus & Mars; O₃ is a triatomic oxidant, meets no life criterion | SPICAV/Venus Express (Montmessin 2011); SPICAM/Mars Express |
| Ozone shields surface life from UV | B | supported-within-model | Hartley-band τ ≈ 88.8 → transmission < 10⁻³⁸ | Beer-Lambert; NASA Ozone Watch; ICNIRP |
| Ozone is a biosignature of life | C | survives-as-narrowed-hypothesis | Conditional, false-positive-prone; O₂→O₃ non-monotonic | Catling 2018; Kozakis 2022 |
| Ozone powers/constitutes living processes | U/X | outside-model-scope | No role in chemiosmosis; toxic oxidant at ground level | Mitchell chemiosmotic theory (Nobel 1978) |
| Ozone as symbol of a living world | D | metaphor-preserved | Valid imagery; zero physical claim | — |
| Ozone necessary for ALL life | U/X | contradicted-by-test | Anoxic Archean biosphere predates ozone column | GOE ~2.4 Ga; life ~3.5–3.8 Ga |
| Ozone makes/retains water | U | outside-model-scope | Water gated by cold trap + escape physics, not O₃ | Hunten 1973; Wordsworth & Pierrehumbert 2013 |
| Atmospheric pressure replaces gravity | X | contradicted-by-test | g = GM/R² holds ≤0.36%; g = kP fails ~14–15 orders | NSSDCA 7-body table |
| Life requires oxygen | U/X | contradicted-by-test | Anaerobes, fermentation; life predates O₂ | Anaerobic respiration; GOE timing |
| Vacuum collector → unlimited energy | X | contradicted-by-test | Radiative floor 893 W irreducible as h→0 | Stefan-Boltzmann balance |
| Active inference proves physics | X | outside-model-scope | ELBO ranks models within a hypothesis space only | Friston 2010; lab/docs/SCIENTIFIC_LIMITS.md |

## Ozone science

The **Chapman mechanism** (Chapman 1930, Class A) is the pure-oxygen backbone: O₂ photolysis (slow source), O+O₂+M→O₃ (fast source), O₃ photolysis (the shield channel), and O+O₃→2O₂ (slow sink). The steady-state result `[O₃] ≈ [O₂]√(J₁k₂[M]/J₃k₄)` explains *why an ozone layer exists* — recombination grows downward with air density while the UV source attenuates downward, so the product peaks at mid-stratosphere. **Fence (Class B):** pure-oxygen Chapman **overpredicts ozone by ~2×**; the real budget needs catalytic HOₓ/NOₓ/ClOₓ/BrOₓ cycles plus Brewer-Dobson transport. A 4-reaction toy with fixed J₁/J₃ is order-of-magnitude, **not** predictive — the photolysis frequencies are actinic-flux integrals, not constants. Peak ozone sits at **~32 km by mixing ratio** (~8 ppm, 30–35 km) but **lower (~20–25 km) by number density** — these must never be conflated.

The decisive control: **abiotic ozone exists on dead worlds.** Venus shows a tenuous nightside layer at ~100 km (~10⁷–10⁸ cm⁻³, up to ~1000× thinner than Earth's); Mars shows a ~0.4–4 DU column anti-correlated with water vapor. Ozone forms in *any* UV-irradiated O/O₂ atmosphere, biotic or not — which is why the literal "ozone = life" reading is **contradicted-by-test**.

## Water science

Nothing in Chapman photochemistry produces water. Stratospheric water is gated by the **cold trap** (~190–200 K tropopause; saturation vapor pressure sets a low H₂O mixing ratio aloft). Long-term retention is set by **escape physics**: the Hunten (1973) diffusion-limited flux `Φ = b·f_H·(1/H_a − 1/H_i)` gives Earth ~4.3–4.7×10⁸ H atoms cm⁻² s⁻¹, fixed by how much hydrogen reaches the homopause — independent of exospheric temperature in this regime. Wordsworth & Pierrehumbert (2013, Class B) show CO₂ suppresses water loss in most regimes by *cooling* the cold trap. Water loss is **multivariate** (gravity/escape velocity, integrated stellar XUV, volatile inventory, cold trap); **ozone is not among the controlling variables.** The "ozone makes/retains water" claim is **outside-model-scope**.

## Oxygen / proton bioenergetics

The foundational, near-universal energy currency of cellular life is the **proton-motive force** (Mitchell, Nobel 1978, Class B): `Δp = Δψ − (2.303RT/F)ΔpH`, with the Nernst factor re-derived at **59.16 mV/pH (298 K)**, rising to 61.51 mV/pH at physiological 310 K. This mechanism is **oxygen-independent** — it runs identically on O₂, sulfate, nitrate, fumarate, CO₂, or light. Oxygen's +0.82 V (E°′ ~+0.815 V) reduction potential is a **thermodynamic advantage** (highest energy yield), **not a necessity**. Anaerobes and fermentation sustain whole ecosystems with no O₂, and life predated atmospheric oxygen by ~1–1.4 Gyr (earliest life ~3.5–3.8 Ga vs GOE ~2.4 Ga). So "life requires oxygen" is **contradicted-by-test**, and **ozone has no bioenergetic role whatsoever** (outside-model-scope). A category note: a *proton gradient* is an electrochemical concept — it must never be equivocated with any "protons are the soul" claim (U/X, category error). What survives: *proton gradients are foundational* (B), a far narrower, oxygen-agnostic claim than "ozone = life."

## Planetary gravity / pressure tests

Across the 7-body NSSDCA reference table, `g = GM/R²` reproduces every body to **≤0.36%** (binding residual: the Moon, 1.6258 vs 1.62, rounding; next-largest Jupiter 0.095%). *(Note: the commonly-quoted "≤0.26%" envelope is not reproducible from the rounded table — use ≤0.36%, or full-precision NSSDCA masses.)* The competing pressure-weight law `g = kP` (calibrated on Earth) **fails by ~14–15 orders of magnitude**: it predicts ~2.9×10⁻¹⁴ m/s² for the near-vacuum Moon (real g = 1.62), overshoots Venus 100× (91× Earth's pressure yet **lower** g), and overshoots Titan 10.5× (thicker atmosphere yet the lowest g of the set). Pressure spans ~16.5 orders across the table; gravity only a factor ~19. **"Atmospheric pressure replaces gravity" is contradicted-by-test (X).** Gravity is set by mass and radius.

## Active inference & agents (analogy only)

The lab's agent layer is held to **model-comparison math, not physics**. Variational free energy is an **upper** bound on surprisal (`F[q] ≥ −ln p(y|m)`; never "lower bound on surprisal"); ELBO = −F ≤ ln p(y|m), tight iff the recognition density equals the model posterior (KL = 0; toy: 0.223 nats at q=0.5,p=0.8). Expected free energy decomposes as risk + ambiguity − info-gain (epistemic drive subtracted). **Hard fence (`lab/docs/SCIENTIFIC_LIMITS.md`):** the host runtime *does* run a live perceive→infer→act→learn loop where actions change future observations (`SP.Sim.step/1` → `Sensor.transduce` → `agent_mod.decide` → `interpret_all`; `SP.Brain.Agent.decide/3` commits the action forward) — what is **not-yet-shown** is a *novel, pre-registered, out-of-sample prediction* a mainstream baseline cannot make; until one is registered before its test and survives, this remains a faithful, falsifiable re-derivation, not a proven capability. "Trauma-locked agents" is a **parameter-regime analogy** (maladaptive priors / miscalibrated precision), **never** a clinical claim (metaphor-preserved). ELBO/VFE rank models *within* an assumed hypothesis space; **a simulation cannot prove reality** (outside-model-scope, X for the proof claim).

## Solar / vacuum energy

The steady-state balance `P_net = η_abs·G·A − ε·σ·A·(T⁴−T_env⁴) − h·A·(T−T_env)` re-runs exactly (η=ε=0.9, G=1361 W/m², A=1 m², T=400 K, T_env=300 K): P_abs = 1224.9 W, P_rad = 893.1 W, equilibrium 423.3 K in vacuum vs 369.1 K with convection. **As h→0 (perfect vacuum), loss does NOT vanish** — it asymptotes to the strictly-positive radiative floor (893 W). Vacuum raises stagnation temperature *incrementally* and creates no energy; evacuated tubes still need selective low-emissivity coatings. Single-junction PV is capped near **~33–34%** (Shockley-Queisser; 33.16% with back-surface mirror at 1.34 eV, up to 33.7% in alternate tabulations — these are *different* calculations, not a mirror/no-mirror pair). PV cooling gives incremental gains only. **"Vacuum yields unlimited/free energy" is contradicted-by-test (X).**

## What survived

- **Ozone as a UV shield for modern complex surface life** — B, supported-within-model (τ ≈ 88.8 at the Hartley peak; surface UV-C transmission < 10⁻³⁸, effectively zero).
- **Proton-motive force as the foundational bioenergetic currency** — B, supported-within-model (oxygen-independent).
- **g = GM/R²** as the law of surface gravity — A, reproduced ≤0.36% across 7 bodies.
- **The irreducible radiative floor** and the **Shockley-Queisser ceiling** — bounded engineering facts, A/B.

## What failed

- **"Ozone = life" (literal)** — contradicted-by-test (abiotic O₃ on Venus/Mars).
- **"Ozone necessary for all life"** — contradicted-by-test (anoxic Archean biosphere).
- **"Life requires oxygen"** — contradicted-by-test (anaerobes; life predates O₂).
- **"Pressure replaces gravity"** — contradicted-by-test (~14–15 order failure).
- **"Vacuum → unlimited energy"** and **"single-junction PV beats SQ"** — contradicted-by-test.
- **"Disequilibrium / a single molecule proves life"** — not-yet-shown (Bayesian LR stays modest; gas-phase Φ = 1.5 J/mol is not even the solar system's largest).

## What remains hypothesis

- **Ozone as a contextual biosignature** — C, survives-as-narrowed-hypothesis. It raises a *graded* posterior only after excluding abiotic false positives (CO₂ photolysis, M-dwarf H-escape, runaway-greenhouse ocean loss) and accounting for biotic false negatives. The O₂→O₃ mapping is **non-monotonic and host-star-dependent** (O₃ peaks at only 25–55% PAL O₂ for hotter stars), so O₃ is not a clean O₂ proxy.
- **The specific O₃ degeneracy (~10% vs ~100% PAL same column)** — U, under-sourced; requires a direct figure citation from Kozakis et al. 2022, or softening to the verified general non-monotonicity.

## What remains metaphor

- **Ozone as the "protective envelope" or "breath" of a living world** — metaphor-preserved (D). Valid imagery carrying zero physical-identity claim. The moment it is read as physical identity, it collapses into the literal reading and is contradicted-by-test.

## Reproducibility (mix test)

Independent re-runs confirmed and **caught real defects**: (1) k₄ at 220 K is **6.86×10⁻¹⁶**, not the originally stated 1.8×10⁻¹⁵ (arithmetic error corrected); (2) the σ_O₃ Hartley value 1.127×10⁻¹⁷ was **mis-attributed** to the Hodges 2019 consensus (real consensus 1.1329×10⁻¹⁷; 1.127 is the AMT 2015 single-lab value); (3) the 257.34 nm cross-section is **11.07×10⁻¹⁸**, not 11.26; (4) the pressure-law worked example **swapped Moon/Mercury labels** (Mercury ≈ 4.8×10⁻¹⁴, Moon ≈ 2.9×10⁻¹⁴); (5) the gravity envelope is **≤0.36%**, not ≤0.26%. Every Chapman/Beer-Lambert/heat-balance/PMF/escape equation passed dimensional check; the steady-state ozone formula and the diffusion-flux dual form were independently re-derived. **None of these corrections moved any verdict** — the physics conclusions are robust to them.

## Open questions

1. The exact current-edition JPL exponent for k₂ ((T/300)^−2.3 vs −2.4) — *requires-stronger-source* (live JPL PDF refused connection during audit).
2. The specific O₃/O₂ dual-value degeneracy — *requires* a direct figure citation.
3. Whether any kinetically-maintained gas pair *other than* O₂-CH₄ could give a comparably diagnostic disequilibrium signature — *requires-experiment* (modeling).

## Next experimental program

1. **Pin the kinetics:** re-source k₂'s edition exponent and the O₃ degeneracy figure from primaries; restate σ as a bound, not a pinned transmission.
2. **Run the Chapman backbone honestly:** label it order-of-magnitude, then add one catalytic cycle (e.g., NOₓ) and show it pulls the ~2× overprediction toward measurement — *requires-experiment*.
3. **Biosignature decision test:** implement the Catling-2018 graded posterior with explicit abiotic likelihoods and demonstrate that O₃-alone never reaches the top confidence band.
4. **Escape-vs-ozone controls:** vary gravity/XUV/cold-trap in a 1-D water-loss model to confirm ozone is causally downstream — closing the "ozone makes water" claim on the ledger.

*End-state: ozone-as-shield is supported-within-model; ozone-as-life is contradicted-by-test; ozone-as-biosignature survives-as-narrowed-hypothesis; the bioenergetic/metaphysical readings are outside-model-scope; the metaphor is metaphor-preserved. No broad framework is proven; nothing earns "unlimited energy," "non-terrestrial humans," "protons as the soul," or "a simulation proves reality."*