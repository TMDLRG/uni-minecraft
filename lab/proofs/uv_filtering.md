# Beer-Lambert UV Attenuation by the Ozone Column: Quantifying the Stratospheric UV Shield

## Scope

This document establishes one decomposed component of the "Ozone = Life" thesis: the **UV shield**. It quantifies how the atmospheric ozone (O₃) column attenuates biologically harmful ultraviolet radiation by physical absorption (Beer-Lambert law) in the Hartley band. It establishes attenuation physics **only**. It does not establish that ozone is alive, creates life, or proves any broad life thesis — see the fence below.

## Equations (preserved exactly)

**Beer-Lambert attenuation:**

$$I(\lambda,z) = I_0(\lambda)\,e^{-\tau(\lambda,z)}$$

**Optical depth from cross-section and column density:**

$$\tau(\lambda) = \sum_i \sigma_i(\lambda)\, N_i$$

**Dobson Unit to column number density:**

$$N = \mathrm{DU} \times 2.69\times10^{16}\ \mathrm{molecules\,cm^{-2}}$$

## Variables and units

| Symbol | Meaning | Units |
|---|---|---|
| $I(\lambda,z)$ | spectral irradiance at depth $z$ | W m⁻² nm⁻¹ |
| $I_0(\lambda)$ | incident irradiance at top of column | W m⁻² nm⁻¹ |
| $\tau$ | optical depth | dimensionless |
| $\sigma_i(\lambda)$ | absorption cross-section of species $i$ | cm²/molecule |
| $N_i$ | vertical (or slant) column number density | molecules/cm² |
| DU | total ozone column | dimensionless (1 DU = 2.69×10¹⁶ cm⁻²) |

## Worked example (vertical, Hartley peak ~255 nm)

Earth's mean total column ≈ **300 DU** [B]. Convert: $N = 300 \times 2.69\times10^{16} = 8.07\times10^{18}\ \mathrm{cm^{-2}}$.

Hartley-peak cross-section $\sigma \approx 1.1\times10^{-17}\ \mathrm{cm^2}$ [B]:

$$\tau = (1.1\times10^{-17})(8.07\times10^{18}) = 88.8$$

$$I/I_0 = e^{-88.8} = 2.8\times10^{-39}$$

Surface UV-C at 255 nm is reduced to a **bound of < 10⁻³⁸ — effectively zero**. This figure is robust: at a band-edge cross-section $\sigma \approx 1\times10^{-18}\ \mathrm{cm^2}$, $\tau \approx 8$ (transmission ~3×10⁻⁴), and slant solar paths only increase $\tau$. The result is stated as a bound, not a pinned transmission value, because the monochromatic single-absorber idealization is not the full scattering radiative-transfer solution. (Using the verified peak $\sigma = 1.13\times10^{-17}$ raises $\tau$ to ~91, *strengthening* the conclusion.)

## Dimensional check

Optical depth exponent: $[\mathrm{cm^2/molecule}]\times[\mathrm{molecules/cm^2}] = $ dimensionless → $e^{-\tau}$ dimensionless → $I$ inherits units of $I_0$. **Consistent.** DU conversion: $[\mathrm{DU}]\times[\mathrm{cm^{-2}/DU}] = \mathrm{cm^{-2}}$. **Consistent.**

## Evidence class per claim

- Beer-Lambert exponential attenuation — **A** (established radiative-transfer physics; arithmetic).
- Hartley band peak ~255 nm, $\sigma \approx 1.1\times10^{-17}\ \mathrm{cm^2}$ — **B** (measured; magnitude verified to within uncertainty). *Sourcing correction: the consensus value at 253.65 nm is 1.1329(35)×10⁻¹⁷ (Hodges et al. 2019, Metrologia); the 1.127×10⁻¹⁷ figure is the AMT 2015 single-lab determination — re-attribute accordingly. The companion 257.34 nm value is 11.07×10⁻¹⁸, not 11.26×10⁻¹⁸.*
- 1 DU = 2.69×10¹⁶ molecules/cm², Earth column ~300 DU — **B** (NASA Ozone Watch).
- UV-C 100–280 / UV-B 280–315 / UV-A 315–400 nm — **B** (ICNIRP/CIE; re-source from primary).
- $\tau \approx 88.8$, transmission ~10⁻³⁹ — **A** (arithmetic from the above; stated as a bound).
- "Ozone provides UV attenuation" — **supported-within-model**. The shield is a *consequence* of pre-existing O₂ and is not an independent corroborator of biology.

## Falsification conditions

This shield claim would be **contradicted-by-test** if: (1) measured O₃ Hartley cross-sections fell orders of magnitude below ~10⁻¹⁷ cm²; (2) measured surface solar UV-C at 255 nm under a ~300 DU column were non-negligible; or (3) DU-to-column conversion deviated from the Loschmidt-consistent 2.69×10¹⁶ cm⁻². None of these holds.

## Outside this model

This domain establishes UV-attenuation physics only. It does **not** establish, and these are fenced out: ozone is alive (outside-model-scope); the shield "proves life" (UV protection is at most necessary-for-surface-life-as-we-know-it, never sufficient); Beer-Lambert is a "life force" (it is photon extinction; absorbed energy drives photodissociation $\mathrm{O_3} + h\nu \to \mathrm{O_2} + \mathrm{O}$, not any vital principle — metaphor-preserved at most); ozone makes water, replaces gravity, or that a simulation proves reality (all outside-model-scope). **Allowed top statement:** ozone provides strong, physically-quantified UV-C/UV-B attenuation via Beer-Lambert absorption in the Hartley band — *supported-within-model*. Forbidden: any leap from "shields UV" to "is life."