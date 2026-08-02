# Production Deployment Guide

## Build artifacts

The pure core has no hex dependencies, so there is nothing to vendor or fetch.
Two deployment shapes are supported:

### 1. Library / embedded

Add this app as a path or git dependency and call `SP.Sim` / `SP.Scenario`
directly from your harness. The learner couples only through `SP.Interface`
(encoded observations + opaque action channels) and the `SP.Agent` behaviour.

### 2. Container

```bash
docker build --target test    -t sp:test .     # runs the QA suite during build
docker build --target runtime  -t sp:run  .     # operator image
docker run --rm sp:run                          # default: baseline benchmark
docker run --rm sp:run run scripts/evidence.exs # any mix entrypoint
```

The `Dockerfile` uses `elixir:1.18-otp-27-alpine`. `MIX_ENV=prod` for the runtime
stage; the `test` stage runs `mix test`.

## Configuration & provenance

- Scenarios live in `config/scenarios/*.json`; seed sets in `config/seeds.json`.
- Always capture `SP.Observability.provenance/1` alongside any run — it records
  the seed, cadence, world dims, and the observation **catalogue version**, which
  together reproduce the run exactly.
- The observation/action schema is versioned (`SP.Interface.catalogue_version/0`).
  Bump it if you change the catalogue, and regenerate golden artifacts.

## Serving a future learner safely

1. Run the agent against `SP.Interface`-encoded observations only.
2. Never expose `SP.Interface.reveal_*`, `SP.Baselines.Lens`, or raw
   `SP.World`/`SP.Body` structs to the learner process.
3. Keep `debug?: false` for serving; enable it only for validation.
4. Pin the channel-map seed per scenario for reproducibility; vary it across
   scenarios so channel ids cannot be memorised across worlds.

## Scaling

Episodes are pure functions; run them concurrently with `Task.async_stream`
across seeds/agents (no shared mutable state). For the live Jido runtime, each
agent/probe is a supervised process — see [jido_alignment](../runtime/jido_alignment.md).

## Upgrades / migration

- Dynamics or interface changes → regenerate `config/golden/` and review the diff
  (CI guards against accidental drift).
- Adding a sensor/action → update `SP.Body.Sensor` / `SP.Body` gating AND
  `SP.Interface` catalogues together, bump `catalogue_version`, extend the
  signal/action catalog docs and tests.
