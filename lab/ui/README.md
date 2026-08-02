# Lab UI — status: SPEC + STATIC VIEWER STUB (not a finished interface)

This directory is **honestly incomplete**. It contains:

- `index.html` — a self-contained, zero-dependency **static snapshot** of the lab's computed
  results (the pressure-vs-gravity falsification and the "Ozone = Life" decomposition). It is
  *not* a live simulation; it displays numbers produced by `mix test test/sp/lab/` and the
  `SP.Lab.*` modules, each tagged with its evidence class. Open it in any browser.

The full interactive experience described in the build prompt (star→atmosphere→ozone→water→
cell→generations, with live state inspection and a falsification dashboard) is **specified
below, not built**. Marking it `not-yet-shown` is the honest status.

## Intended panels (specification only)

1. Star energy reaching the planet (irradiance) — backed by `SP.Lab.SolarEnergy`.
2. Atmosphere/ozone filtering UV — backed by `SP.Lab.Radiation` (Beer–Lambert).
3. Water state (form / persist / escape) — `escape_velocity` exists; full escape flux owed.
4. Cell energy: proton flow → ATP proxy → viability — backed by `SP.Lab.Bioenergetics`.
5. Gravity vs pressure model comparison — backed by `SP.Lab.ModelCompare` (implemented).
6. Inheritance / generations — host repo `SP.Genome`; lab layer not built.
7. Falsification dashboard + "what is proven / hypothesis / failed" panel — partially shown
   in `index.html`.

Every panel, when built, must label each element `Evidence-backed`, `Toy model`,
`Assumption`, `Speculative`, `Failed test`, or `Out of model scope`, and must never display a
claim the math does not support. See `lab/docs/SCIENTIFIC_LIMITS.md`.
