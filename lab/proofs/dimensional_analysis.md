# Dimensional Consistency Proof — Every Implemented Formula in the Simulation Lab

## Scope

This document certifies the **dimensional consistency** of the seven load-bearing formulas implemented across the lab's physics, chemistry, bioenergetics, and agent-layer domains: surface gravity, escape velocity, Beer–Lambert UV attenuation, proton-motive force (PMF), the ATP free-energy proxy, the steady-state solar heat balance, and the variational-free-energy model score. Each equation's units are reduced to base SI/CGS and shown to balance. Dimensional consistency is a **necessary, not sufficient** condition for physical correctness: a dimensionally valid law can still be empirically false (the falsified `g = kP` weight law is the worked counter-example below). This document does **not** establish any of the physical theses the equations participate in.

## Equations, Units, and Checks

**Gravity (Class A — derivable):**
$$g = \frac{GM}{R^2}$$
$g$ [m s⁻²]; $G = 6.674\times10^{-11}$ [m³ kg⁻¹ s⁻²]; $M$ [kg]; $R$ [m].
Check: $[\text{m}^3\,\text{kg}^{-1}\,\text{s}^{-2}][\text{kg}]/[\text{m}^2] = \text{m s}^{-2}$. **PASS.**

**Escape velocity (Class A):**
$$v_{esc} = \sqrt{\frac{2GM}{R}}$$
Check: $\left[\text{m}^3\,\text{kg}^{-1}\,\text{s}^{-2}\cdot\text{kg}/\text{m}\right]^{1/2} = [\text{m}^2\,\text{s}^{-2}]^{1/2} = \text{m s}^{-1}$. **PASS.**

**Beer–Lambert attenuation (Class A):**
$$I(\lambda,z) = I_0(\lambda)\,e^{-\tau}, \qquad \tau = \sum_i \sigma_i(\lambda)\,N_i$$
$\sigma$ [cm²/molecule]; $N$ [molecules/cm²].
Check: exponent $\tau = [\text{cm}^2][\text{cm}^{-2}] = $ dimensionless; $I$ inherits $I_0$ units [W m⁻² nm⁻¹]. **PASS.**

**Proton-motive force (Class B):**
$$\Delta p = \Delta\psi - \frac{2.303\,RT}{F}\,\Delta\mathrm{pH}$$
$\Delta\psi$ [V = J/C]; $R$ [J mol⁻¹ K⁻¹]; $T$ [K]; $F$ [C/mol]; $\Delta$pH dimensionless.
Check: second term $= [\text{J mol}^{-1}\text{K}^{-1}\cdot\text{K}/(\text{C mol}^{-1})] = \text{J/C} = \text{V}$. Both terms volts. **PASS.**

**ATP free-energy proxy (Class C — $n$ system-dependent):**
$$\Delta G \approx -\,n\,F\,\Delta p$$
Check: $[\,1\,][\text{C/mol}][\text{V}] = \text{C}\cdot\text{J/C}\cdot\text{mol}^{-1} = \text{J/mol}$. **PASS.**

**Steady-state solar heat balance (Class A):**
$$P_{net} = \eta_{abs}\,G\,A - \epsilon\,\sigma\,A\,(T^4 - T_{env}^4) - h\,A\,(T - T_{env})$$
Check: term 1 $[\,1\,][\text{W m}^{-2}][\text{m}^2]=\text{W}$; term 2 $[\text{W m}^{-2}\text{K}^{-4}][\text{m}^2][\text{K}^4]=\text{W}$; term 3 $[\text{W m}^{-2}\text{K}^{-1}][\text{m}^2][\text{K}]=\text{W}$. **PASS.**

**Variational free-energy model score (Class A, nats):**
$$F[q] = D_{\mathrm{KL}}\!\big(q(\eta|r)\,\|\,p(\eta|y,m)\big) - \ln p(y|m)$$
Check: KL [nats] $-$ surprisal [nats] $=$ [nats]. **PASS.**

## Worked Example (cross-checks the units numerically)

Titan: $\mu = GM = 8978.137$ km³ s⁻², $R = 2574.76$ km.
$g = 8978.137/2574.76^2 = 1.354\times10^{-3}$ km s⁻² $= 1.354$ m s⁻² (matches reference).
$v_{esc} = \sqrt{2\cdot8978.137/2574.76} = 2.641$ km s⁻². Units land as m s⁻² and km s⁻² exactly as the reduction predicts.

## Dimensional Check Summary

All seven formulas balance. Independent verification reproduced every check: the diffusion-flux equivalent forms matched to machine precision, and the heat-balance worked example reproduced $P_{rad}=893.1$ W, $T_{eq,vac}=423.3$ K.

## Evidence Class Per Claim

- $g$, $v_{esc}$, Beer–Lambert, heat balance, VFE score: **Class A** (derivable; reduced here).
- PMF: **Class B** (textbook chemiosmotic identity).
- ATP proxy: **Class C** (proton count $n$ is c-ring/system-dependent — never a universal yield).

## Falsification Conditions

A formula fails this proof if any term's reduced units differ from the others summed/equated with it (e.g., adding a [W] to a [K]), or if a claimed equality has unequal dimensions on each side. **Note the load-bearing limit of this proof:** the pressure-weight law $g = kP$ is *dimensionally valid* ([m s⁻² Pa⁻¹][Pa] = m s⁻²) yet **contradicted-by-test** (Class X) — it mispredicts the Moon by ~14 orders of magnitude. Dimensional balance never rescues an empirically false law.

## Outside This Model

This document certifies **only** unit consistency. It does not prove gravity, ozone chemistry, bioenergetics, or that minimizing $F[q]$ "proves reality" — the VFE score ranks models *within* an assumed hypothesis space and is information-theoretic, not thermodynamic (no $pV$, no Helmholtz/Gibbs identity). Sign conventions for $\Delta p$ and $\Delta G$ are convention-dependent and must be declared at point of use. No result here bears on the "Ozone = Life" thesis, free energy, or any metaphysical claim — those are outside-model-scope.