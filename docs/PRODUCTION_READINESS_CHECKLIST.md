# Production Readiness Checklist

Legend: ✅ done · ⬛ specified/extension (see [limitations.md](limitations.md))

## Code completeness
- ✅ Hybrid-time world simulator (microstep dynamics, regions, graph, seams)
- ✅ Layered discoverability L0–L4 with enforced observability barriers
- ✅ Hidden causal structure (cavities, strain, conduits) + collapse
- ✅ Ecology (grazer/decomposer/mimic deceptive analog)
- ✅ Resource economy (8 material classes) + reaction network + hazards
- ✅ Morphology-gated actions; appendage ladder
- ✅ Evolving senses unlocking layers; 8 sensor modalities
- ✅ Developmental transitions (stages 0–4) + growth budgeting
- ✅ Genome + mutation/recombination/repair; lineage fields
- ✅ Seam-based open-ended expansion with mutated law vectors
- ✅ Opaque learner-facing interface (per-seed channels, versioned schema)
- ✅ Six non-omniscient validation baselines
- ✅ Eval harness (metrics, ablations, layer-visibility)
- ✅ Observability (provenance, JSON, CLI table, trace)
- ✅ Scenario loader with schema validation
- ⬛ Live `Jido.AgentServer`/`Sensor` adapter (specified; pure `SP.Sim` is the runtime)
- ⬛ Memory-read-back as a sensor channel (functional ops present)

## Runtime boundary (Jido)
- ✅ Signals primary unit; sensors transduce; pure `decide/3`; directive-only effects
- ✅ Internal state ops never mutate world; baselines interface-constrained
- ✅ No `Process.sleep`; logical time only

## Tests & QA
- ✅ `mix test` — 100 tests, 0 failures
- ✅ Property tests (determinism, conservation, genome/dev validity, leakage)
- ✅ Integration tests (`SP.Sim` episodes, reset, fuzz, no-mutation)
- ✅ Leakage-probe/leakage suite; 15-invariant checklist
- ✅ Soak tests (2000 steps, 8× expansion, bounded trace)
- ✅ Golden regression artifact + test

## Reproducibility
- ✅ Pure seed-threaded PRNG; same seed ⇒ identical trace
- ✅ Provenance capture; versioned schema
- ✅ Zero deps ⇒ hermetic offline tests

## Engineering
- ✅ `@spec` + moduledocs on public API
- ✅ `mix format` config; `--warnings-as-errors` clean
- ✅ GitHub Actions CI (compile/format/test/golden-diff)
- ✅ Multi-stage Dockerfile; `.gitignore`/`.dockerignore`
- ✅ Operator runbook + deployment guide + scripts

## Documentation & evidence
- ✅ 14 docs (architecture, world, runtime, signal/action catalogs, genome, scenario, eval, QA, runbooks, deployment, reproducibility, security, limitations)
- ✅ ASSUMPTIONS log
- ✅ 8 validation reports in `docs/reports/`
- ✅ This checklist + production readiness report

## Acceptance gates (spec)
- ✅ 1 `mix test` clean · ✅ 2 property/integration · ✅ 3 deterministic · ✅ 4 leakage
- ✅ 5 ablations (senses/morphology/hidden-layers) · ✅ 6 soak · ✅ 7 CI · ✅ 8 docs
- ✅ 9 production interface hides semantics · ✅ 10 reports stored
