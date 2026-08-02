# Reproducibility

Everything in the lab core is pure, offline, and deterministic — no network, no hidden
state, no foreign compute layer (the repository's zero-dependency invariant). Anyone can
re-run it and get identical results.

## Environment

- Elixir 1.19.x / Erlang OTP 28 (BeamAsm JIT), the same toolchain the host repo uses.
- The simulation core has **zero hex dependencies**; `mix deps.get` is not required to test.

## Run the lab tests

```sh
# from the repo root
mix test test/sp/lab/ --seed 0
# => 26 tests, 4 doctests, 0 failures
```

## Reproduce the key results in IEx

```elixir
# Newtonian gravity reproduces every body; the pressure model does not.
SP.Lab.ModelCompare.gravity_model_report(0.02)
# => %{newtonian: %{failures: 0, score: 6.5, ...},
#       pressure:  %{failures: 5, score: -13.0, ...},
#       verdict: :newtonian_dominates}

# Beer–Lambert: a 300 DU ozone column makes UV-C transmission ~0.
tau = SP.Lab.Radiation.ozone_optical_depth_du(300.0)   # ~88.8
SP.Lab.Radiation.transmittance(tau)                    # < 1.0e-30

# Bioenergetics: an anaerobic cell survives without O2 given a valid acceptor.
SP.Lab.Bioenergetics.cell_status(%{
  mode: :anaerobic, water_activity: 0.95, pmf_mV: 150.0,
  electron_donor: true, electron_acceptor: :sulfate,
  membrane_intact: true, radiation_dose: 0.1
})
# => :viable
```

## Provenance of every number

- Planetary values (`SP.Lab.PlanetaryData`): NASA NSSDCA fact sheets + JPL SSD (Titan),
  evidence class B. See module docs and `lab/evidence/parameter_ledger.json`.
- Physical constants: `G` (CODATA 2022), `F` Faraday, `σ` Stefan–Boltzmann, solar constant,
  Dobson unit, O₃ Hartley cross-section — each cited in its module and in the parameter ledger.
- Formulae: each carries a LaTeX statement, variable+unit definitions, a worked example, and a
  dimensional check in `lab/evidence/formula_ledger.json` and `lab/proofs/dimensional_analysis.md`.

## Full host-repo suite (confirm no regression)

```sh
mix test --seed 0          # full suite incl. lab: 410 tests, 4 doctests, 0 failures
mix format --check-formatted
```
