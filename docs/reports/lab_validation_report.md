# SP.Lab — Validation Report (QA / UAT / Science cross-check)

**Branch:** `lab/ozone-life-uni-hard-science` · **Date:** 2026-06-11 · **Toolchain:** Elixir 1.19 / OTP 28

## Purpose

Independently harden the science lab (`SP.Lab.*`) before any downstream artifact is built on its
numbers: run the CI-grade gates, build a falsifiable cross-check that re-derives every documented
number from the code, fix-forward every real delta, map the 20 hard tests to evidence, and capture
the result. The repo's own discipline applies — the math is allowed to say "contradicted," and
nothing is labelled "proven."

## Method

1. **Gates** — `mix compile --warnings-as-errors --force`; `mix format --check-formatted` (lab
   files); `mix test` (full + `test/sp/lab/`).
2. **Cross-check** — new `mix sp.lab.validate` (`SP.Lab.Validate`) re-derives 24 code-backed
   quantities (the constants the modules use + every worked example / dossier figure derived from
   them) and asserts each against its documented value within a declared tolerance; exits non-zero
   on any delta.
3. **Remediation** — fix-forward; see `lab/remediation_log.md` (append-only, including a tried-and-
   reverted change, recorded honestly).
4. **UAT** — `docs/reports/lab_uat_checklist.md` maps the 20 hard tests to evidence.

## Artifacts

| Artifact | Path |
|---|---|
| Gate output | `lab/evidence/captures/a1_gates.txt` |
| Cross-check report | `lab/evidence/captures/lab_validate_report.txt` |
| Computed reports | `lab/evidence/captures/computed_reports.txt` |
| Remediation log | `lab/remediation_log.md` |
| UAT checklist | `docs/reports/lab_uat_checklist.md` |

## Result

| Gate | Result |
|---|---|
| `mix compile --warnings-as-errors --force` | **clean** |
| `mix format --check-formatted` (lab files) | **clean** (pre-existing non-lab drift noted, not touched) |
| `mix test` (full suite) | **413 tests, 4 doctests, 0 failures** |
| `mix sp.lab.validate` | **24 checks, 0 failed, ALL GREEN** |
| UAT (20 hard tests) | **16 PASS, 2 HOST (out of lab scope), 1 NOT-BUILT (flagged), 1 visual PASS — 0 failed** |

**Key numbers, code-confirmed** (from `computed_reports.txt`): Newtonian `g = GM/R²` fails 0/7 at
2% (max residual 0.36% at the Moon); the pressure-weight model `g = k·P` fails 5/5 out-of-sample
(Venus ~100×, Titan ~10.5×, airless bodies ~14 orders); ozone τ(300 DU) = 88.77 → transmittance
2.8×10⁻³⁹; Nernst slope 59.16 mV/pH; PMF(150 mV, 0.5 pH) = 120.42 mV; radiative floor 893 W.

## Tolerances

Each cross-check carries its own tolerance (exact equality for defined constants; ±0.01–±5 for
derived worked examples; band checks for order-of-magnitude claims). The Newtonian 2% test
tolerance reflects rotation/oblateness omitted by `GM/R²`; the gravity-vs-pressure verdict is
decided by a ~14-order-of-magnitude gap, far outside any tolerance.

## Residual risks (honest)

- **Scope of the cross-check:** it recomputes only **code-backed** numbers. ~40 literature-sourced
  ledger entries (Chapman rate constants, biosignature figures, geologic dates) are
  provenance-checked in `lab/evidence/`, **not** recomputed here — stated explicitly, not implied.
- **Two UAT rows are HOST** (#13/#14, active-inference belief updating — lives in the host system,
  not the lab) and **one is NOT-BUILT** (#18, no time-evolution simulator). These are recorded gaps.
- **Declared roundings:** G, Faraday, gas constant, Stefan–Boltzmann are 4-s.f. roundings of the
  exact SI values (cited alongside); immaterial to every verdict, and the cross-check confirms the
  whole corpus is consistent with them.

## Verdict

The lab is **internally consistent and falsifiable**: code, tests, ledgers, proofs, and dossier
agree on every code-backed number, and the gate `mix sp.lab.validate` will break CI if that ever
stops being true. No scientific verdict changed during remediation — pressure-replaces-gravity
remains **contradicted-by-test**, ozone-as-shield remains **Class B / supported-within-model**, and
nothing is labelled "proven."
