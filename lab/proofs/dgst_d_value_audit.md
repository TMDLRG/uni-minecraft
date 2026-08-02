# Gravity vs Pressure: The g = GM/R² Law and Why a Pressure-Proportional Weight Model Fails Everywhere Off Earth

## Scope

This document establishes Newtonian surface gravity, `g = GM/R²`, as the governing law of weight on a planetary body, and decomposes the competing hypothesis that surface gravity is set by atmospheric pressure (`g = k·P`). It tests the pressure model by calibrating it on Earth and predicting `g` on six other Solar-System bodies. It also records the "D-value" (Dobson Unit) only as a *geometric column index*, with no role in setting gravity. **This is a cross-domain falsification guard, carried so that no "atmosphere = life-or-physics substrate" narrative can smuggle in a pressure-replaces-gravity claim.** It is not ozone chemistry.

## Equations (preserved exactly)

$$g = \frac{GM}{R^2}, \qquad v_{esc} = \sqrt{\frac{2GM}{R}}$$

$$g = \frac{GM}{R^2} \quad\text{(holds, <=0.36\%)} \qquad vs \qquad g \stackrel{?}{=} k\,P,\; k=\frac{g_\oplus}{P_\oplus} \quad\text{(FAILS)}$$

## Variables and units

| Symbol | Meaning | Unit |
|---|---|---|
| `g` | surface gravitational acceleration | m s⁻² |
| `G` | Newton gravitational constant = 6.674×10⁻¹¹ | m³ kg⁻¹ s⁻² (CODATA 2018) |
| `M` | body mass | kg |
| `R` | body radius | m |
| `v_esc` | escape speed | m s⁻¹ |
| `P` | surface atmospheric pressure | Pa (or bar) |
| `k` | Earth-calibrated proportionality constant `g⊕/P⊕` | m s⁻² Pa⁻¹ |
| 1 DU | Dobson Unit = 2.69×10¹⁶ molecules cm⁻² | column index only |

## Dimensional check

`GM/R²` = [m³ kg⁻¹ s⁻²][kg]/[m²] = [N kg⁻¹] = **m s⁻²**. ✓
`v_esc` = √([m³ kg⁻¹ s⁻²][kg]/[m]) = √[m² s⁻²] = **m s⁻¹**. ✓
`k·P` = [m s⁻² Pa⁻¹][Pa] = **m s⁻²** — dimensionally valid, but **empirically false off-Earth** (the failure is in the ratios, not the units). [Class A]

## Worked example (with numbers)

**Titan, by `g = GM/R²`:** μ = GM = 8978.13710 km³ s⁻², R = 2574.76 km.
`g = 8978.13710 / 2574.76² = 8978.137 / 6.6294×10⁶ = 1.3543×10⁻³ km s⁻² = 1.354 m s⁻²`.
`v_esc = √(2·8978.137/2574.76) = √6.9737 = 2.6408 km s⁻¹`. Both match the reference. [Class A/B]

**The pressure model `g = k·P`, calibrated on Earth** (`k = 9.82 / 1.014×10⁵`):

| Body | P (bar) | `g` predicted by `k·P` | `g` actual (m s⁻²) | verdict |
|---|---|---|---|---|
| Moon | ~3×10⁻¹⁵ | ~2.9×10⁻¹⁴ | 1.62 | fails ~14 orders |
| Mercury | ~5×10⁻¹⁵ | ~4.8×10⁻¹⁴ | 3.70 | fails ~14 orders |
| Venus | 92 | ~891 | 8.87 | overshoots ~100× |
| Titan | 1.5 | ~14.2 | 1.354 | overshoots ~10.5× |

Near-vacuum bodies (Moon, Mercury) keep full gravity; Venus has 92× Earth's pressure yet **lower** `g` than Earth; Titan has a thicker-than-Earth atmosphere yet the **lowest** `g` of the set. **Gravity is set by mass and radius, not by surface pressure.** [Class A — reproduced this session]

## Evidence class per claim

- `g = GM/R²` reproduces all seven verified bodies (Earth, Moon, Mars, Venus, Mercury, Jupiter, Titan) to **≤0.36%** (binding residual = Moon, 1.6258 vs 1.62 reference): **Class A**, derivable + reproduced. *(Note: the tighter ≤0.26% sometimes quoted holds only at full-precision NSSDCA masses; from rounded factsheet values the bound is ≤0.36%.)*
- `g = k·P` calibrated on Earth fails by up to ~14 orders of magnitude (Moon) and overshoots Venus ~100×: **contradicted-by-test (Class X)**.
- The D-value (Dobson Unit) is a column number-density index (2.69×10¹⁶ molecules cm⁻² per DU), with **zero** role in setting gravity: **Class B** (geometric definition only).

## Falsification conditions

The Newtonian law would be contradicted-by-test if any body's measured `g` departed from `GM/R²` beyond rotational/oblateness corrections (sub-percent to few-percent). The pressure model `g = k·P` is **already falsified**: it requires `g→0` as `P→0`, but the Moon and Mercury hold `g = 1.62` and `3.70` m s⁻² in near-vacuum; and it requires `g` to rise monotonically with `P`, contradicted by Venus (high P, modest g) and Titan (thick atmosphere, lowest g). One such body suffices; four independently confirm.

## Outside this model

This document concerns **Newtonian surface gravity only**. It says nothing about ozone, life, biosignatures, or water synthesis — those are decomposed in their own domains. It does not assert "atmospheric pressure replaces gravity" (that is **Class X, contradicted-by-test**), nor that a thick atmosphere strengthens gravity to retain water. `g = GM/R²` is itself a weak-field Newtonian approximation, exact enough across these bodies; it carries no claim about general relativity, planetary interiors, or the origin of mass. No result here proves any broad framework, and "a simulation proves reality" remains **outside-model-scope**.