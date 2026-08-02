# Ozone Photochemistry (Chapman) and the Decomposed "Ozone = Life" Thesis

## Scope

This document establishes the pure-oxygen **Chapman mechanism** for stratospheric ozone, the steady-state result that explains *why an ozone layer exists*, and the abiotic-ozone controls (Venus, Mars) that decompose and fence the "Ozone = Life" thesis. It is a backbone/order-of-magnitude model, **not** a predictive stratospheric chemistry budget (pure-oxygen Chapman overpredicts ozone by ~2× because it omits catalytic HOx/NOx/ClOx/BrOx loss). Allowed verdict words only.

## The four Chapman reactions

$$\mathrm{O_2} + h\nu \xrightarrow{\,J_1\,} 2\,\mathrm{O} \qquad (\lambda \approx 175\text{-}242\,\mathrm{nm})$$
$$\mathrm{O} + \mathrm{O_2} + \mathrm{M} \xrightarrow{\,k_2\,} \mathrm{O_3} + \mathrm{M}, \quad k_2 = 6.0\times10^{-34}\,(T/300)^{-2.4}\ \mathrm{cm^6\,molecule^{-2}\,s^{-1}}$$
$$\mathrm{O_3} + h\nu \xrightarrow{\,J_3\,} \mathrm{O_2} + \mathrm{O} \qquad (\lambda \approx 240\text{-}320\,\mathrm{nm}\ \text{shield-relevant})$$
$$\mathrm{O} + \mathrm{O_3} \xrightarrow{\,k_4\,} 2\,\mathrm{O_2}, \quad k_4 = 8.0\times10^{-12}\,\exp(-2060/T)\ \mathrm{cm^3\,molecule^{-1}\,s^{-1}}$$

The steady-state odd-oxygen ($O_x=$ O $+$ O₃) balance ($2J_1[\mathrm{O_2}]=2k_4[\mathrm O][\mathrm{O_3}]$) plus the fast-cycle partitioning gives the Chapman layer:

$$[\mathrm{O_3}] \approx [\mathrm{O_2}]\sqrt{\dfrac{J_1\,k_2[\mathrm{M}]}{J_3\,k_4}}$$

## Variables and units

| Symbol | Meaning | Units |
|---|---|---|
| $J_1, J_3$ | O₂, O₃ photolysis frequencies | s⁻¹ (actinic-flux integrals, **not** constants — assumption on magnitude) |
| $k_2$ | termolecular recombination rate | cm⁶ molecule⁻² s⁻¹ |
| $k_4$ | odd-oxygen loss rate | cm³ molecule⁻¹ s⁻¹ |
| $[\mathrm O],[\mathrm{O_2}],[\mathrm{O_3}],[\mathrm M]$ | number densities | cm⁻³ |
| $T$ | temperature | K |

## Worked example (z ≈ 30 km, T = 230 K)

$k_2(230) = 6.0\times10^{-34}(230/300)^{-2.4} = 1.135\times10^{-33}$ cm⁶ s⁻¹; with $[\mathrm O]\sim10^8$, $[\mathrm{O_2}]\sim7\times10^{16}$, $[\mathrm M]\sim3.8\times10^{17}$ cm⁻³ → R2 rate $\approx 3.0\times10^9$ cm⁻³ s⁻¹.
$k_4(230) = 8.0\times10^{-12}\exp(-2060/230) = 1.03\times10^{-15}$ cm³ s⁻¹; with $[\mathrm{O_3}]\sim5\times10^{12}$ → R4 loss $\approx 5.2\times10^5$ cm⁻³ s⁻¹. The R2/R3 null cycle ($\gg$ R1/R4) keeps O and O₃ tightly coupled; $k_2[\mathrm M]$ rises downward while $J_1$ falls downward, so the product peaks at intermediate altitude — the **Chapman maximum** (~32 km is the peak *mixing-ratio* altitude; peak *number density* sits lower, ~20–25 km — keep distinct). [Class A for the derivation; B for the rate constants.]

## Dimensional check

R2: $[\mathrm{cm^6\,molec^{-2}\,s^{-1}}][\mathrm{cm^{-3}}]^3=\mathrm{cm^{-3}\,s^{-1}}$. R4: $[\mathrm{cm^3\,molec^{-1}\,s^{-1}}][\mathrm{cm^{-3}}]^2=\mathrm{cm^{-3}\,s^{-1}}$. Steady-state √-argument: $(\mathrm{s^{-1}\cdot cm^6 s^{-1}\cdot cm^{-3})/(s^{-1}\cdot cm^3 s^{-1}})=$ dimensionless, so $[\mathrm{O_3}]$ inherits cm⁻³. All consistent.

## Evidence class per claim

- The four-reaction Chapman backbone and the layer-existence result — **A** (derivable; Chapman 1930, Jacob Ch.10).
- $k_2, k_4, J_1, J_3$ magnitudes — **B** (JPL kinetics; $J$ values are bracketed assumptions, not constants).
- Chapman overpredicts ozone ~2× absent catalytic cycles — **B**.
- Abiotic ozone on Venus (~100 km nightside layer, 10⁷–10⁸ cm⁻³) and Mars (~0.4–4 DU, seasonal polar layer) — **B**, the decisive controls.

## Decomposition of "Ozone = Life" (never collapse)

- **(a) Literal identity "ozone is alive"** — *contradicted-by-test* (U/X): O₃ is a triatomic oxidant, toxic to tissue at ground level; abiotic O₃ exists on sterile Venus/Mars.
- **(b) Biosignature** — *survives-as-narrowed-hypothesis* (C): conditional, false-positive-prone proxy for O₂, only after excluding abiotic pathways; the O₂→O₃ map is nonlinear.
- **(c) UV shield for modern surface life** — *supported-within-model* (B): the only Class-B reading; not universal necessity (Archean anoxic biosphere pre-GOE ~2.4 Ga).
- **(d) Bioenergetic "ozone powers life"** — *outside-model-scope* / U/X: no metabolic role.
- **(e) Metaphor** — *metaphor-preserved* (D): imagery only, zero physical-identity claim.

## Falsification conditions

The model is contradicted if: abiotic ozone were shown impossible (Venus/Mars controls falsify this already); the Chapman maximum failed to predict an intermediate-altitude layer; or pure-oxygen Chapman *underpredicted* observed ozone (it overpredicts ~2×, the known limitation). "Ozone = Life (literal)" is **already contradicted** by the dead-planet controls.

## Outside this model

This domain does not establish that ozone makes water, replaces gravity ($g=GM/R^2$ holds to ≤0.36% across seven bodies; $g=kP$ is X-contradicted), is necessary for all life, or that any simulation "proves" the thesis. Bioenergetic and metaphysical readings are outside-model-scope; only the UV-shield reading is empirically Class B, and even it is downstream of pre-existing O₂.