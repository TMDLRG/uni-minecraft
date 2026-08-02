# Operator Runbook

## Prerequisites

- Elixir `~> 1.17`, Erlang/OTP `>= 27` (for the built-in `:json` module).
- No hex dependencies to fetch (pure core).

## Everyday commands

| task | command |
|---|---|
| Compile | `mix compile` |
| Full QA suite | `mix test` |
| Baseline benchmark table | `mix run scripts/benchmark.exs [max_ticks]` |
| Validation evidence dump | `mix run scripts/evidence.exs` |
| Regenerate golden artifact | `mix run scripts/gen_golden.exs` |
| Run a scenario (IEx) | see [scenario authoring](../validation/scenario_authoring.md) |
| Record a blanket evidence log | `mix run scripts/record_run.exs [seed] [agent] [ticks]` |
| Independently verify a log | `mix sp.verify runs/<run>.jsonl` (exit non-zero on violation) |
| Overlooker UI (god view + blanket monitor) | `cd ui && mix deps.get && mix phx.server` → http://localhost:4000 |

## Overlooker UI & falsifiable evidence

The third-party observer view is the Phoenix LiveView app under `ui/` — the full
world every tick plus a per-tick Markov-blanket verdict. See
[docs/ui/overlooker.md](../ui/overlooker.md). The headless, falsifiable counterpart
is the evidence log + `mix sp.verify`; see
[docs/observability/evidence_log.md](../observability/evidence_log.md). Recording
is opt-in (`record_blanket?: true`) and never affects determinism.

## Inspecting an episode

```elixir
sim = SP.Sim.new(seed: 404, agent: SP.Baselines.Infrastructure, max_ticks: 800) |> SP.Sim.run()

SP.Sim.summary(sim)                 # compact outcome
SP.Observability.episode_report(sim)# provenance + summary + metrics
SP.Sim.points(sim)                  # per-tick viability trajectory (chronological)
sim.trace.signal_type_counts        # sensor modality usage
sim.trace.action_counts             # action usage
sim.trace.build_counts              # infrastructure built (by kind)
sim.trace.expansions                # seam expansion events
```

## Observability surfaces

- **Viability trajectory** — `SP.Sim.points/1` (envelope, risk, prior divergence,
  energy, integrity, stage, region_count per tick).
- **Signal / action audit** — aggregated counts in `sim.trace`.
- **Resource/region state** — `SP.World.region/2`, `SP.World.Region` fields.
- **Provenance** — `SP.Observability.provenance/1` (seed, cadence, catalogue
  version, world dims) for reproducibility capture.
- **JSON export** — `SP.Observability.json/1` / `json_pretty/1`.

## Debug vs production mode

- **Production (learner) mode** — agents receive only `%{int => float}`
  observations. This is the default path through `SP.Interface`.
- **Debug mode** — pass `debug?: true` to `SP.Sim.new/1` to enable the in-loop
  leak trap (raises if any learner-facing observation is ever non-clean). Use in
  CI / development, not for learner serving.
- The semantic inverse (`SP.Interface.reveal_*`) and `SP.Baselines.Lens` are
  engineering-only; never wire them into a learner.

## Failure handling

| symptom | meaning | action |
|---|---|---|
| episode `halted: :dead` early | harsh seed / weak policy | expected on some seeds; check `mean_risk` |
| `decoded_failures > 0` | agent sent malformed/garbage actions | inspect agent; runtime already ignores them safely |
| `ungated_attempts > 0` | agent tried actions its morphology can't do | expected during development; informational |
| golden test fails | dynamics/interface changed | review diff; regenerate intentionally if desired |
| scenario `load` error | malformed config | fix per the returned `{:error, [{field, reason}]}` |

## Health checks

- `mix test` green ⇒ invariants hold.
- `mix run scripts/evidence.exs` ⇒ reproducibility/leakage/conservation pass and
  difficulty bands are in range.
