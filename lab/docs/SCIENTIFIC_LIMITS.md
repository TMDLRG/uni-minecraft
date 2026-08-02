# Scientific Limits — what this lab does NOT establish

Written in the repository's falsification spirit: state the fences before anyone has to find
them. Every item here is `not-yet-shown`, `outside-model-scope`, `requires-experiment`, or
`metaphor-preserved` — never `proven`.

## Hard boundaries (asserted nowhere in this lab)

- Ozone is **not** alive and is **not** life itself.
- Ozone alone does **not** prove life (it is produced abiotically — Venus, Mars).
- Ozone alone does **not** create or retain water (habitability is multivariate).
- Atmospheric pressure does **not** replace gravity. The pressure-weight model `g = k·P`,
  calibrated on Earth, is *shown by the test suite to fail* on every other body.
- Active inference does **not** prove any physical mechanism. It frames model comparison.
- Protons are **not** shown to be a soul. That reading is preserved only as metaphor.
- Humans are **not** asserted to be non-terrestrial. No such claim is in scope.
- There is **no** unlimited energy. Vacuum is an incremental engineering gain; the radiative
  loss term and the Shockley–Queisser limit are not erased.
- A simulation does **not** prove reality.

## Model-fidelity limits of what IS implemented

- **`SP.Lab.Radiation`** is a single-absorber Beer–Lambert toy: no scattering, no
  multi-species absorption, no solar-zenith-angle or altitude structure. It shows the
  *direction and rough magnitude* of ozone shielding, not a radiative-transfer solution.
- **`SP.Lab.PlanetaryData`** values are agency measurements (evidence class B), read as data.
  Surface gravity carries small rotation/oblateness effects the `GM/R²` model omits (this is
  why the test tolerance is 2%, not exact).
- **`SP.Lab.Bioenergetics`** viability thresholds (water 0.6, PMF 50 mV, radiation 1.0) are
  **engineering choices (evidence class C)**, declared in `thresholds/0`. They set the toy
  cell's behaviour; they are not measured biological constants.
- **`SP.Lab.ModelCompare`** weights are a declared **rubric (class C)**, a bookkeeping aid.
  The load-bearing quantity is the *measured* failure count, not the rubric score.
- **`SP.Lab.SolarEnergy`** is a steady-state lumped heat balance: no transient dynamics, no
  spectral detail, no real device geometry.

## Specified but NOT yet implemented (owed, not hidden)

- Full ozone **Chapman kinetics** (rate equations) — only the shield layer is coded.
- **Diffusion-limited hydrogen escape** (Hunten flux) — `escape_velocity` is coded; the full
  flux is documented in `lab/proofs/water_escape.md` and not yet a tested module.
- **Generational DNA/inheritance** lab layer — specified; the host repo's `SP.Genome` exists,
  a lab-specific inheritance experiment does not.
- **The UI/UX experience** — `lab/ui/` is a spec + static stub, not a finished interface.
- **A live active-inference agent loop in the lab** — the host system implements active
  inference (`SP.*`); the lab only documents the bound discipline.

## The one most important open question

Whether any of these toy models, assembled, can make a *novel, pre-registered, out-of-sample
prediction* that a mainstream baseline cannot — rather than re-describing known values. Until
such a prediction is registered before its test and survives, the lab's status is: a faithful,
falsifiable re-derivation of established science, in which one fringe thesis (pressure-gravity)
is contradicted and one (ozone-as-shield) survives only in its narrowed form.
