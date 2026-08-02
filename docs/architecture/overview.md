# Architecture Overview

THE STRATIFIED PALIMPSEST is a single-application Elixir project with strict
internal module boundaries. We deliberately chose a **single coherent stack with
zero runtime dependencies** over an umbrella or polyglot design, because:

1. The benchmark's core value is a *deterministic, reproducible* world kernel.
   Zero dependencies means `mix test` runs offline and a seed fully determines a
   trace — no hidden state from `:rand`, hex versions, or native sidecars.
2. Module namespaces (`SP.Core`, `SP.World`, `SP.Body`, `SP.Interface`, …) give
   the same separation the spec's umbrella layout asks for; splitting into
   umbrella apps later is a mechanical packaging step (each namespace is already
   dependency-acyclic in the direction below).

## Dependency direction (acyclic)

```
SP.Determinism            (no deps)
   ▲
SP.Core.{Signal,Directive,Schema}
   ▲
SP.World.* ──────────────► SP.World (container)
   ▲                            ▲
SP.Body.* (Sensor reads World)  │
   ▲                            │
SP.Genome (reads Body taxonomy) │
   ▲                            │
SP.Interface.{,.Audit}          │
   ▲                            │
SP.Agent (contract)             │
   ▲                            │
SP.Sim ───────────────────────►┘  (orchestrator: composes World + Body + Agent + Interface)
   ▲
SP.Baselines.*  SP.Eval  SP.Observability  SP.Scenario
```

Nothing below the Interface line may read raw world/body state across the
learner boundary; only `SP.Body.Sensor` (the transducer) and `SP.Sim` (the
runtime) touch both sides, by design — they *are* the Markov blanket.

## The Markov blanket in code

| Blanket role | Spec term | Implementation |
|---|---|---|
| External states | world/body truth | `SP.World`, `SP.Body` structs (never crossed to learner) |
| Sensory states | signals | `SP.Core.Signal` produced by `SP.Body.Sensor`, channelised by `SP.Interface` |
| Active states | executed effects | `SP.Core.Directive.Actuate` interpreted by `SP.Sim` |
| Internal states | learner beliefs | the future agent's own `SP.Agent` state |

The learner couples ONLY through encoded observations (`%{int => float}`) and
opaque action channels. Verified by `SP.Interface.Audit` and the leakage suite.

## Hybrid time

`SP.Sim` runs four nested timescales (see [eval harness](../validation/eval_harness.md)):

- **microstep** — `SP.World.Dynamics.step_region/1`; `micro_per_decision` per tick.
- **decision tick** — metabolise → sense → decide → act.
- **development tick** — every `dev_interval` ticks (`SP.Body.Development.develop/2`).
- **lineage** — across episodes via `SP.Genome` mutation/recombination + `SP.Eval`.

## Determinism strategy

All stochasticity flows through `SP.Determinism` (SplitMix64), threaded as an
explicit immutable value. Regions get *split* sub-generators so adding a region
never perturbs another's stream. Result: identical seed ⇒ identical trace
(`docs/reports/reproducibility_report.md`).

## Effects boundary (Jido invariant)

Agent decision logic is pure (`SP.Agent.decide/3` returns `{directives, state}`).
It never mutates the world. Only `SP.Sim` interprets directives and applies
effects via `SP.World.Actions`. See [jido_alignment.md](../runtime/jido_alignment.md).
