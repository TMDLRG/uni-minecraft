# SP.Lab remediation log (append-only)

Records every fix-forward change made during the QA / science-validation pass. Honest by
policy: where a change was tried and reverted, both are recorded.

## 2026-06-11 — QA / science-validation pass (branch `lab/ozone-life-uni-hard-science`)

### Built: the cross-check harness
- Added `SP.Lab.Validate` (`lib/sp/lab/validate.ex`) + `mix sp.lab.validate`
  (`lib/mix/tasks/sp.lab.validate.ex`). It re-derives every code-backed number the ledgers,
  proofs, and dossier assert (G envelope, failure counts, ozone τ, Nernst slope, PMF, ATP,
  radiative floor, escape velocity, viability, vocabulary), and exits non-zero on any delta.
- This makes "the prose matches the code" itself falsifiable — the same discipline as the
  repo's `mix sp.verify`.

### Tried, then reverted: "upgrade to exact SI constants" (spill → cleanup)
- **Attempt:** raised `G` 6.674e-11→6.6743e-11, Faraday 96485.0→96485.33212, gas constant
  8.314→8.31446, Stefan–Boltzmann 5.670e-8→5.670374419e-8 (the exact/defined SI values).
- **What the cross-check caught:** the "upgrade" *desynced the evidence corpus* — the Moon
  Newtonian residual moved 0.360%→0.366% (breaking the documented "≤0.36%" envelope), and the
  Nernst slope moved 59.16→59.17 mV/pH. A ~0.0045% precision gain would have required editing
  ~10 evidence files and risked new mismatches.
- **Decision (reverted):** keep the documented **4-significant-figure roundings** the entire
  corpus is already consistent with (they are accurately labelled "CODATA 2022" / exact-SI in
  the moduledocs, with the exact value cited alongside). The roundings are immaterial to every
  verdict. Modules touched: `physics.ex`, `bioenergetics.ex`, `solar_energy.ex` (+ its test) —
  all returned to the documented values, with a comment citing the exact SI value.

### Kept: genuine fixes
- **`radiation.ex` — O₃ Hartley cross-section attribution.** Kept the declared rounded value
  `1.1e-17`, but corrected the moduledoc: the Hodges-2019 consensus at 253.65 nm is
  `1.1329e-17` (not the AMT-2015 single-lab `1.127e-17` it had been conflated with), and using
  the consensus only *strengthens* the shield (τ ~88.8 → ~91). Value unchanged; attribution fixed.
- **`lab/evidence/source_notes.md` — stale "≤0.26%" assertion.** One bullet still asserted the
  gravity envelope as "≤0.26%". Corrected to "≤0.36% (binding residual Moon 0.360%; the tighter
  ≤0.26% holds only at full-precision NSSDCA masses)", matching the dossier and proofs (which
  already used ≤0.36%). The `adversarial_reviews.json` entries that *document* the 0.26%→0.36%
  correction were left as the audit trail.

### Kept: Nernst slope → canonical 59.16 mV/pH
- The cross-check surfaced a sub-decimal artifact: `nernst_slope_mv(298.15)` returned **59.17**
  (because the code used the literal `2.303`), while the dossier and every textbook cite the
  canonical **59.16 mV/pH**. Fixed `bioenergetics.ex` to use `ln(10)` exactly (`2.303` is its
  rounding); the slope now returns 59.156 → **59.16**, matching the prose and the textbook. All
  tests/doctests still pass; the cross-check tolerance was tightened to ±0.01.

### Result
- `mix sp.lab.validate` → **24 checks, 0 failed, ALL GREEN.**
- `mix test` (full) → **413 tests, 4 doctests, 0 failures.**
- `mix compile --warnings-as-errors --force` → clean.
- No verdict moved. The pressure-replaces-gravity thesis stays **contradicted-by-test**;
  ozone-as-shield stays **Class B / supported-within-model**; nothing is labelled "proven".
