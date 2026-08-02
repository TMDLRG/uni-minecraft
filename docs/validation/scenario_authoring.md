# Scenario Authoring Guide

A scenario is a JSON file in `config/scenarios/` validated by `SP.Scenario`
against `SP.Scenario.schema/0` (via `SP.Core.Schema`). Malformed configs are
rejected with structured errors, never run.

## Fields

| field | type | default | meaning |
|---|---|---|---|
| `name` | string | — (required) | scenario id |
| `seed` | integer | 1 | world + channel-map seed (full reproducibility) |
| `regions` | integer | 2 | initial ordinary-adjacency region count |
| `w`, `h` | integer | 6 | region grid dimensions |
| `max_ticks` | integer | 400 | decision-tick horizon |
| `micro_per_decision` | integer | 3 | world microsteps per decision tick |
| `dev_interval` | integer | 5 | decision ticks per development tick |
| `agent` | enum | `homeostatic` | one of `SP.Scenario.agents/0` keys |
| `scramble` | boolean | true | per-channel value affine on the opaque interface |

## Built-in reference scenarios

| file | purpose | agent |
|---|---|---|
| `starter.json` | reference difficulty calibration | homeostatic |
| `epistemic.json` | mimic/ambiguity avoidance via meta sense | probe_first |
| `morphogenesis.json` | morphology utilisation / development | morphology_seeking |
| `open_ended.json` | seam engineering & expansion | infrastructure |
| `leakage_probe.json` | interface fuzz / leakage | leakage_probe |

`SP.Scenario.builtin/0` returns the same set in code.

## Loading and running

```elixir
{:ok, scenario} = SP.Scenario.load("config/scenarios/starter.json")
sim = scenario |> SP.Scenario.to_sim_opts() |> SP.Sim.new() |> SP.Sim.run()
report = SP.Observability.episode_report(sim)
```

## Authoring a new scenario

1. Copy a built-in JSON and edit fields.
2. Validate: `SP.Scenario.load("config/scenarios/mine.json")` should return
   `{:ok, _}`; a typo'd `agent` yields `{:error, [{:agent, {:not_in, [...]}}]}`.
3. For reproducible difficulty bands, run across a seed batch (see
   `config/seeds.json`) and record the survival/expansion distribution.
4. To pin a regression, regenerate the golden artifact for your seed
   (`scripts/gen_golden.exs`) — but prefer the existing reference golden unless
   intentionally changing dynamics.

## Determinism contract

A scenario is reproducible: `(seed, regions, w, h, cadence, agent, scramble)`
fully determines the trace. Re-running yields byte-identical traces (Invariant
#13). Different seeds yield different worlds *and* different opaque channel maps.
