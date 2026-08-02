# THE STRATIFIED PALIMPSEST

> **Orientation (2026-07-11):** this README describes the original pure-core active-inference substrate. For the CURRENT whole system (the Minecraft colony + the live broadcast platform), start with **`docs/SYSTEM_OVERVIEW.md`**, then `CLAUDE.md`, `docs/STUDIO_SYSTEMS.md`, and `production/docs/DEPLOYED_STATE.md`.

A production-grade, partially-observable, morphology- and sense-gated, open-ended
**benchmark world** for embodied, developmental, Active-Inference-style agents —
built in Elixir/OTP with **Jido-aligned runtime boundaries**.

The environment is deliberately built *before* any learning agent exists. It
exposes only an **opaque signal/action interface**: no symbolic rulebook, no
true coordinates, no material IDs, no scalar reward. An agent must grow a body,
evolve senses, and infer the world's hidden structure to act consequentially.

> Status: **implementation-complete pure core**, `mix test` green (100 tests),
> reproducible, leakage-audited, with a validation evidence bundle in
> [`docs/reports/`](docs/reports/). See [Limitations](docs/limitations.md) for the
> honest scope boundary (notably: the live Jido GenServer adapter is specified as
> a thin documented bridge over the pure runtime — see below).

---

## Why this world is hard (by design)

| Commitment | How it is enforced in code |
|---|---|
| No symbolic rulebook | The learner only ever sees `%{channel_id => float}` observations (`SP.Interface`). |
| Strictly partially observable | Sensors emit a layer's data only if the body has the mature organ (`SP.Body.Sensor`). |
| Requires morphology | Actions are gated by appendages (`SP.Body.can_do?/2`); a seed body cannot excavate/build/expand. |
| Requires evolving senses | Five discoverability layers L0–L4; each needs a distinct organ to perceive. |
| No reward oracle | Viability is an *envelope + prior + risk* used only by the eval harness (`SP.Body.Viability`); never sent to the learner. |
| Open-ended | Seam engineering unlocks new regions with **mutated law vectors** (`SP.World.open_seam/2`). |

## The five layers (ontology)

- **L0 contact** — nutrient, temperature, solvent, toxin (proximal/interoceptive).
- **L1 material** — eight material classes (manipulable; `SP.World.Material`).
- **L2 hidden causal** — cavities, strain, transport conduits (needs tomography).
- **L3 spectral** — field bands (needs field/spectral sensing).
- **L4 seam/topology** — seam readiness & adjacency (needs seam-coherence sensing).

The same surface (L0) reading can have multiple hidden causes — e.g. a *mimic*
inflates the apparent nutrient reading while depositing reactive (toxic) material
on L1. Only the **meta sense** surfaces that conflict.

## Architecture (single coherent Elixir stack, zero runtime deps)

```
SP.Determinism        Splittable SplitMix64 PRNG (pure, seed-threaded)
SP.Core.{Signal,Directive,Schema}   Jido-aligned primitives
SP.World{,.Field,.Material,.Law,.Region,.Dynamics,.Actions}   the simulator
SP.Body{,.Sensor,.Development,.Viability}   morphology, senses, homeostasis
SP.Genome             hereditary substrate + mutation/recombination/repair
SP.Interface{,.Audit} opaque learner-facing channel layer + leakage auditor
SP.Agent              pure decision contract (the learner-facing seam)
SP.Sim                hybrid-time orchestrator + directive interpreter (the runtime)
SP.Baselines.*        six non-omniscient validation agents
SP.Eval               metrics + ablation suites
SP.Observability      provenance, JSON, CLI tables
SP.Scenario           schema-validated benchmark configs
```

The pure core has **no hex dependencies**, so `mix test` runs fully offline and
deterministically. See [docs/architecture/overview.md](docs/architecture/overview.md).

## Quick start

```bash
mix compile                 # zero deps to fetch
mix test                    # full QA suite (unit/property/integration/leakage-probe/soak/golden/blanket)
mix run scripts/benchmark.exs        # operator baseline table
mix run scripts/demo.exs             # live proof of the core guarantees
mix run scripts/evidence.exs         # regenerate validation evidence numbers
mix run scripts/gen_golden.exs       # regenerate the golden regression artifact
```

### Overlooker UI + falsifiable blanket evidence

A third-party **omniscient overlooker** (Phoenix LiveView) shows the whole world
every tick, with a per-tick **Markov-blanket monitor** whose no-leak verdict is
re-derived independently (green = intact, red = violation). The headless,
falsifiable counterpart is a JSON evidence log + a verifier:

```bash
mix run scripts/record_run.exs 314 morphology_seeking 250   # -> runs/*.jsonl + meta
mix sp.verify runs/seed314-morphology_seeking.jsonl         # re-derive verdict (exit non-zero on leak)

cd ui && mix deps.get && mix phx.server                      # http://localhost:4000
```

The UI lives in an isolated `ui/` app (the only part of the repo with hex deps);
the pure core stays zero-dependency. See
[docs/ui/overlooker.md](docs/ui/overlooker.md) and
[docs/observability/evidence_log.md](docs/observability/evidence_log.md).

Run a single named scenario from `config/scenarios/`:

```elixir
{:ok, scenario} = SP.Scenario.load("config/scenarios/open_ended.json")
sim = scenario |> SP.Scenario.to_sim_opts() |> SP.Sim.new() |> SP.Sim.run()
SP.Observability.episode_report(sim)
```

## What an agent sees and does

```elixir
# An agent implements the pure SP.Agent contract:
#   decide(observation, state, context) :: {[%SP.Core.Directive.Actuate{}], state}
# observation is %{channel_id => float}; actions are opaque channel ids.
# It can never read the world or body. The runtime (SP.Sim) owns all effects.
```

The opaque channel map is per-seed (so channel ids carry no fixed meaning) and
versioned (`SP.Interface.catalogue_version/0`). The inverse map exists only in
engineering/debug tooling (`SP.Interface.reveal_*`, used by the *scripted*
validation baselines), never on the learner path.

## Documentation map

- Architecture: [docs/architecture/overview.md](docs/architecture/overview.md)
- World ontology & dynamics: [docs/world-spec/ontology.md](docs/world-spec/ontology.md)
- Runtime boundary & Jido alignment: [docs/runtime/jido_alignment.md](docs/runtime/jido_alignment.md)
- Signal catalog: [docs/runtime/signal_catalog.md](docs/runtime/signal_catalog.md)
- Action catalog: [docs/runtime/action_catalog.md](docs/runtime/action_catalog.md)
- Genome / development / evolution: [docs/world-spec/genome_development_evolution.md](docs/world-spec/genome_development_evolution.md)
- Scenario authoring: [docs/validation/scenario_authoring.md](docs/validation/scenario_authoring.md)
- Eval harness: [docs/validation/eval_harness.md](docs/validation/eval_harness.md)
- QA methodology: [docs/validation/qa_methodology.md](docs/validation/qa_methodology.md)
- Operator runbook: [docs/runbooks/operator.md](docs/runbooks/operator.md)
- Overlooker UI: [docs/ui/overlooker.md](docs/ui/overlooker.md)
- Blanket evidence log & verification: [docs/observability/evidence_log.md](docs/observability/evidence_log.md)
- Deployment: [docs/runbooks/deployment.md](docs/runbooks/deployment.md)
- Reproducibility: [docs/reproducibility.md](docs/reproducibility.md)
- Security / leakage boundary: [docs/security_leakage_boundary.md](docs/security_leakage_boundary.md)
- Limitations & future work: [docs/limitations.md](docs/limitations.md)
- Assumptions log: [ASSUMPTIONS.md](ASSUMPTIONS.md)
- **Validation evidence bundle:** [docs/reports/](docs/reports/)
- **Production readiness checklist:** [docs/PRODUCTION_READINESS_CHECKLIST.md](docs/PRODUCTION_READINESS_CHECKLIST.md)

## License / provenance

The Jido reference repository (`agentjido/jido`) is cloned under `vendor/` for
study of the binding runtime contract; it is not a build dependency of the pure
core. See [docs/runtime/jido_alignment.md](docs/runtime/jido_alignment.md).
