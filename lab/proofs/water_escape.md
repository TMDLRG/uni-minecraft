# Water Photolysis, Hydrogen Escape, and Multivariate Habitability — A Bounded Proof Document

## Scope

This document establishes, within a bounded simulation model, that long-term planetary **water loss is governed by escape physics, stellar XUV history, volatile inventory, and the cold trap — not by ozone**. It formalizes three load-bearing relations: escape velocity, surface gravity, and the diffusion-limited hydrogen escape flux. It then fences the implicit "ozone makes/retains water" and "pressure sets gravity" claims. Numbers carry an evidence class: **A** derivable/reproduced here, **B** mainstream peer-reviewed/agency, **C** structured assumption, **D** interpretive, **X** contradicted-by-test.

## Equations (preserved exactly)

**Escape velocity** (Class A):

$$v_{esc} = \sqrt{\dfrac{2GM}{R}}$$

**Surface gravity** (Class A):

$$g = \dfrac{GM}{R^2}$$

**Diffusion-limited (Hunten) escape flux** of the light species (Class B):

$$\Phi_{l} = b\,f_{i}\left(\dfrac{1}{H_{a}} - \dfrac{1}{H_{i}}\right) = \dfrac{b\,f_{i}\,g\,(m_a-m_i)}{kT}$$

## Variables and units

| Symbol | Meaning | Units |
|---|---|---|
| $v_{esc}$ | bulk escape velocity | m/s |
| $g$ | surface gravity | m/s² |
| $G$ | gravitational constant $=6.674\times10^{-11}$ | m³ kg⁻¹ s⁻² (A) |
| $M,R$ | body mass, radius | kg, m |
| $\Phi_l$ | upward escape flux of light species | atoms cm⁻² s⁻¹ |
| $b$ | binary diffusion parameter ($b=Dn$), $\sim1.8\times10^{19}$ for H/H₂ in air | cm⁻¹ s⁻¹ (B) |
| $f_i$ | mixing ratio of escaping species ($f_H\sim1.7\times10^{-5}$, Earth) | dimensionless (B/assumption) |
| $H_a,H_i$ | scale heights of background, light species ($H=kT/mg$) | cm |
| $m_a,m_i$ | mean molecular masses | kg |
| $T$ | homopause temperature | K |

The **cold trap** (Earth tropopause, ~190–200 K, Class B) gates how much H₂O reaches the photolysis region by setting the saturation vapor pressure upstream of $f_i$.

## Worked example

**Titan escape (A):** $\mu=GM=8978.13710\ \text{km}^3\,\text{s}^{-2}$, $R=2574.76$ km. Then $v_{esc}=\sqrt{2\cdot8978.137/2574.76}=\sqrt{6.9737}=2.641$ km/s; $g=8978.137/2574.76^2=1.354$ m/s². Both match the JPL/Cassini reference.

**Earth H flux (B):** with $b\sim1.8\times10^{19}$, $T\sim208$ K, $g\sim9.45$ m/s², $H_a\sim6.3$ km, $H_H\sim183$ km, the coefficient $C=b(1/H_a-1/H_H)\sim2.75\times10^{13}$ cm⁻² s⁻¹. With $f_H\sim1.7\times10^{-5}$: $\Phi_l\sim4.7\times10^{8}$ H atoms cm⁻² s⁻¹ (canonical $\sim4.3\times10^{8}$; same order). The flux is fixed by how much H reaches the homopause — set by the cold trap — and is **independent of exospheric temperature in this regime**: the diffusion bottleneck, not Jeans escape, controls.

## Dimensional check

- $v_{esc}$: $[\text{m}^3\text{kg}^{-1}\text{s}^{-2}\cdot\text{kg}/\text{m}]^{1/2}=[\text{m}^2\text{s}^{-2}]^{1/2}=$ m/s. ✓
- $g$: $[\text{m}^3\text{kg}^{-1}\text{s}^{-2}\cdot\text{kg}/\text{m}^2]=$ m/s². ✓
- $\Phi_l$: $[\text{cm}^{-1}\text{s}^{-1}]\cdot[1]\cdot[\text{cm}^{-1}]=$ cm⁻² s⁻¹. ✓ The equivalent form $g(m_a-m_i)/(kT)$ carries units of inverse length (verified). *Notation note: write this check in one unit system — the second form mixes CGS ($g$ in cm/s²) and SI ($J$) tokens; the exponent bookkeeping is correct, but pick all-SI then convert at the end.*

## Evidence class per claim

- Water loss is multivariate (escape physics + integrated XUV + volatile inventory + cold trap) — **B** (Wordsworth & Pierrehumbert 2013; Hunten 1973; Luger & Barnes 2015).
- $g=GM/R^2$ reproduces all seven reference bodies to **≤0.36%** (binding residual = Moon, calc 1.6258 vs ref 1.62) — **A**, reproduced this session. *Use ≤0.36%, not ≤0.26%; the tighter envelope holds only at full-precision NSSDCA masses.*
- O₃ is a Chapman-cycle photochemical product of O₂ that absorbs UV-B/UV-C — **A/B** (Chapman 1930).
- Therefore O₃ is causally **downstream** of water inventory and escape, not a cause of water presence — **D** (interpretive fence). *These two were previously bundled under one D label; the established mechanism is A/B, only the causal-ordering bridge is D.*

## Falsification conditions

1. **Pressure-weight law $g=k\,P$ ($k=g_\oplus/P_\oplus$) — Class X, contradicted-by-test.** It predicts $\sim2.9\times10^{-14}$ m/s² for the **Moon** ($P=3\times10^{-15}$ bar) and $\sim4.8\times10^{-14}$ for **Mercury** ($P=5\times10^{-15}$ bar) — both near-vacuum yet with real $g$ of 1.62 and 3.70; predicts ~891 m/s² for Venus (actual 8.87, *lower* than Earth at 92× the pressure) and 14.2 m/s² for Titan (actual 1.354, the lowest of the set despite a thick atmosphere). Failure spans ~14 orders of magnitude. Gravity is set by $M$ and $R$.
2. The model is **falsified** if a tuned escape+cold-trap+XUV calculation fails to reproduce a measured planetary water-loss history while invoking only these variables, or if ozone column is shown to causally control stratospheric H₂O independent of temperature.

## Outside this model

This document does **not** establish: that ozone is alive, creates water, or retains water (outside-model-scope / U/X); that atmospheric pressure replaces or generates gravity (X); that habitability reduces to any single factor; or that any simulation "proves" the underlying physics. Escape velocity and gravity are weak-field, non-rotating, spherical idealizations (sub-percent corrections from oblateness/rotation). The diffusion limit is valid only in the diffusion-limited regime — it breaks down under XUV-driven hydrodynamic (energy-limited) escape, blow-off, or for species heavier than the background. The literal-life, biosignature, bioenergetic, and metaphor readings of any "Ozone = Life" thesis lie outside this domain and must be decomposed and tested separately.