# Benchmark Integrity Report

## Purpose

Establish that the environment is a sound benchmark: it is not trivially solvable
or impossibly hard, simple baselines do not collapse it, no shortcut/oracle
exists, conservation/boundedness hold, and seeded golden traces guard against
silent drift.

## Method

- Survival difficulty across the reference seed batch for all baselines.
- Anti-shortcut: confirm no reward/oracle channel; confirm random can't reliably
  win; confirm scripted skill helps.
- Conservation/boundedness checks.
- Golden regression artifact + CI diff.

## Artifacts used

- `scripts/evidence.exs`, `SP.GoldenTest`, `SP.SoakTest`, `SP.EvalTest`,
  `config/golden/reference_episode.json`.

## Result summary

**Difficulty band (reference batch 101–112, 400-tick horizon, in-episode development):**

```
Random             mean=265.00  horizon=6/12
Homeostatic        mean=289.58  horizon=8/12
ProbeFirst         mean=286.83  horizon=8/12
MorphologySeeking  mean=258.50  horizon=7/12
Infrastructure     mean=262.25  horizon=7/12
```

Survival is neither trivial nor impossible: no baseline reaches the horizon on
all seeds, and sense-using policies (Homeostatic/ProbeFirst) lead. With a fixed
developed body, the sense-using agent beats blind random by **+24.3%** (see
[sensory_ablation_report](sensory_ablation_report.md)). Simple baselines do not
collapse the benchmark.

**Anti-shortcut / no oracle:**

- No `reward`/`score`/`return`/`fitness` field anywhere on the learner path or in
  eval metrics (Invariant #15; `SP.EvalTest`, `SP.InvariantsTest`).
- The learner cannot read world state, coordinates, materials, or hidden layers
  (see [interface_leakage_audit](interface_leakage_audit.md)).
- Morphology/sense gating means there is no action that bypasses the capability
  ladder.

**Conservation / boundedness:**

```
transport material-mass delta: 0.0
after 500 microsteps, region maxima: %{nut: 4.74 (cap 5), tox: 0.01 (cap 3)}
```

Field diffusion conserves mass exactly (property test); all fields stay within
documented caps over 500–2000 microstep runs.

**Regression guard:**

The golden artifact pins a seeded episode (structural metrics exact, floats within
`1e-6`); `SP.GoldenTest` re-derives it and CI diffs `config/golden/` to catch
unintended dynamics/interface changes.

## Pass/Fail

**PASS.**

## Residual risks

- Difficulty is seed-dependent; difficulty claims should use batches (done here).
- The golden band is a single reference episode; broaden to a multi-seed band if
  stricter regression coverage is desired.
