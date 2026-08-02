# Evaluation Harness Guide

`SP.Eval` performs **policy consequence evaluation** against the viability priors.
None of these metrics are surfaced to the agent (Invariant #15) — they exist for
reports and regression tests only.

## Episode metrics (`SP.Eval.episode_metrics/1`)

| metric | meaning |
|---|---|
| `survived_ticks`, `halted`, `final_envelope` | survival & viability outcome |
| `final_stage`, `final_organs` | morphological development reached |
| `mean_risk`, `max_risk`, `mean_prior_divergence` | viability trajectory (consequence) |
| `sensor_modalities` | distinct sensory signal types ever emitted (sensor utilisation) |
| `morphology_utilisation` | distinct appendage-gated actions actually used |
| `ungated_attempts`, `decoded_failures` | interface misuse accounting |
| `structures_built`, `structure_kinds` | niche construction / infrastructure complexity |
| `expansions`, `region_count`, `regime_novelty` | open-endedness / world expansion |

## Ablation presets (`SP.Eval.preset_genome/2`, `preset_opts/2`)

| preset | what it removes |
|---|---|
| `:full` | nothing (full appendage + sense ladder) |
| `:no_development` | development disabled (body stays the seed morphology) |
| `:minimal_senses` | appendage ladder only; no senses past the seed pair |
| `:minimal_appendages` | sense ladder only; no appendages |
| `:no_hidden_layers` | appendages + L0/L1 senses only (no tomography/spectral/seam/meta) |

`SP.Eval.ablation_suite(seeds, opts)` runs all presets across `seeds` and returns
per-preset aggregate means plus pairwise deltas vs `:full`.

## Structural (deterministic) evidence

`SP.Eval.layer_visibility(seed, omit)` returns `%{with, without}` opaque-channel
counts for a full body vs one missing `omit` (and its dependents). This is
**non-statistical** evidence that each sense gates a discoverability layer
(Invariant #8). Used by `SP.EvalTest` and `SP.InvariantsTest`.

## Running the harness

```elixir
SP.Eval.run_episode(seed: 101, agent: SP.Baselines.Homeostatic, max_ticks: 400)
|> SP.Eval.episode_metrics()

SP.Eval.ablation_suite([201, 202, 203], max_ticks: 200)
```

Or capture the full evidence bundle: `mix run scripts/evidence.exs`.

## Lineage / evolution loop (composition)

A cross-episode evolutionary controller is a thin loop:

```elixir
# pseudo: select by world viability, then mutate/recombine
genomes
|> Enum.map(fn g -> {g, SP.Eval.run_episode(genome: g, ...) |> SP.Eval.episode_metrics()} end)
|> select_survivors()      # by survived_ticks / structures_built / expansions
|> reproduce()             # SP.Genome.mutate / recombine (always repaired)
```

Selection pressure is the world itself — there is no fitness scalar fed to the
agent.

## Interpreting difficulty

The reference batch (`config/seeds.json`) is calibrated so survival is **neither
trivial nor impossible**: random baselines die well before the horizon on most
seeds, while sense-using agents survive markedly longer. See
[morphology](../reports/morphology_ablation_report.md) and
[sensory](../reports/sensory_ablation_report.md) ablation reports for numbers.
