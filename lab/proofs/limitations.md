# What the Lab Does Not Prove — Toy-Model Boundaries and Out-of-Scope Claims

## Scope

This document fences the **bounded simulation lab** behind the "Ozone = Life" investigation. It records, in load-bearing terms, what the verified physics **does and does not** establish, and pins the toy-model boundaries so no downstream reader mistakes a within-model result for a proof of the broad thesis. All numbers below trace to the verified findings; verdict words follow the allowed set.

## The thesis is decomposed, never asserted

"Ozone = Life" is **never** a single claim. It splits into five sub-claims, each judged separately:

| Sub-claim | Verdict | Class |
|---|---|---|
| (a) Literal "ozone *is* life" | contradicted-by-test | U/X |
| (b) Ozone is a definitive biosignature | contradicted-by-test | X (literal) / C (conditional) |
| (c) Ozone, in stellar+atmospheric context, raises the posterior of life | survives-as-narrowed-hypothesis | C |
| (d) Ozone shields surface life from UV | supported-within-model | B |
| (e) Ozone as metaphor for a living world's envelope | metaphor-preserved | D |

Only **(c)** and **(d)** survive as scientific claims, and both are conditional.

## The governing equations (preserved exactly)

**Beer–Lambert UV shield:**

$$I(\lambda,z) = I_0(\lambda)\,e^{-\tau(\lambda,z)}, \qquad \tau(\lambda) = \sum_i \sigma_i(\lambda)\,N_i$$

**Chapman steady-state ozone:**

$$[\mathrm{O_3}] \approx [\mathrm{O_2}]\sqrt{\frac{J_1\,k_2[\mathrm{M}]}{J_3\,k_4}}$$

**Gravity falsifier (the hard-boundary guard):**

$$g = \frac{GM}{R^2} \quad\text{(holds)} \qquad vs \qquad g \stackrel{?}{=} k\,P \quad\text{(FAILS)}$$

### Variables and units
- $I, I_0$: spectral irradiance [W m⁻² nm⁻¹]; $\tau$: optical depth [dimensionless]
- $\sigma_i$: absorption cross-section [cm²/molecule]; $N_i$: column density [molecules/cm²]
- $[\mathrm{O_3}],[\mathrm{O_2}],[\mathrm{M}]$: number densities [cm⁻³]; $J_1,J_3$: photolysis frequencies [s⁻¹]; $k_2$ [cm⁶ molec⁻² s⁻¹]; $k_4$ [cm³ molec⁻¹ s⁻¹]
- $g$ [m s⁻²]; $G = 6.674\times10^{-11}$ [m³ kg⁻¹ s⁻²]; $M$ [kg]; $R$ [m]; $P$ [Pa]

## Worked example — the UV shield (within-model)

For a 300 DU column: $N = 300 \times 2.69\times10^{16} = 8.07\times10^{18}$ molecules/cm². At the Hartley peak ($\sigma \approx 1.1\times10^{-17}$ cm²):

$$\tau = (1.1\times10^{-17})(8.07\times10^{18}) \approx 88.8, \qquad e^{-88.8} \approx 3\times10^{-39}$$

Surface UV-C is **effectively zero** — stated as a bound (transmission < 10⁻³⁸), not a pinned figure, since this is a monochromatic single-absorber idealization, not a full radiative-transfer solution. This supports sub-claim (d) only.

## Dimensional check

Beer–Lambert exponent: $[\text{cm}^2][\text{cm}^{-2}] = $ dimensionless ✓. Gravity: $[\text{m}^3\text{kg}^{-1}\text{s}^{-2}][\text{kg}]/[\text{m}^2] = \text{m s}^{-2}$ ✓. The pressure law $k\cdot P = [\text{m s}^{-2}\text{Pa}^{-1}][\text{Pa}]$ is *dimensionally* valid but **empirically false off-Earth** — falsification rests on the data, not the units.

## What the lab does NOT prove (evidence-classed)

- **Ozone is not alive / does not create life** — contradicted-by-test (X). Abiotic ozone exists on Venus (~100 km nightside layer, ~10⁷–10⁸ cm⁻³) and Mars (~0.4–4 DU), both sterile. (Class B controls.)
- **Ozone is not required for all life** — U/X. Anaerobic and Archean pre-GOE life (~3.5–3.8 Ga) predates atmospheric O₂/O₃ by ~1–1.4 Gyr. (Class B.)
- **Ozone does not make or retain water** — outside-model-scope. Stratospheric water is gated by the cold trap; retention by escape physics + XUV history. (Class B/D.)
- **Atmospheric pressure does not replace gravity** — contradicted-by-test (X). $g=GM/R^2$ reproduces seven bodies to ≤0.36% (binding residual: Moon, calc 1.626 vs ref 1.62); $g=kP$ fails by ~14 orders on the Moon, overshoots Venus ~100×. *(Correction folded: ≤0.36%, not ≤0.26%; the rounded-table residual exceeds the tighter envelope.)*
- **Chapman is not a complete ozone model** — pure-O₂ Chapman overpredicts by ~2×; the real budget needs catalytic HOₓ/NOₓ/ClOₓ/BrOₓ cycles. Order-of-magnitude backbone only. (Class B.)
- **Active inference / a simulation does not prove physics or reality** — outside-model-scope. VFE/ELBO rank models *within* an assumed hypothesis space; no strong-sense active-inference loop is live. (Class A fence.)

## Falsification conditions

The within-model claims are falsified if: (1) a tuned full radiative-transfer solve shows the Hartley-band column does *not* extinguish surface UV-C; (2) a verified body breaks $g=GM/R^2$ beyond rounding while obeying $g=kP$; (3) the O₂→O₃ mapping is shown monotonic and host-star-independent (it is not — O₃ peaks at 25–55% PAL O₂ for hotter hosts); or (4) an abiotic-ozone control planet is shown to host life, collapsing the false-positive distinction.

## Outside this model

This lab establishes ozone **photochemistry**, the **UV-shield** attenuation physics, and the **abiotic-ozone controls** — nothing more. It says nothing certifying: ozone as alive, ozone as a definitive life-proof, ozone as a water source, pressure-as-gravity, unlimited energy, protons-as-soul, human non-terrestrial origin, or "a simulation proves reality." Every load-bearing number traces to a cited source; magnitudes labeled order-of-magnitude (J₁, J₃, Huggins σ) are not pinned constants. **Allowed top statement:** ozone provides physically-quantified UV-C/UV-B attenuation (supported-within-model, B), and is a context-gated, false-positive-prone candidate biosignature (survives-as-narrowed-hypothesis, C) — never a proof of life.