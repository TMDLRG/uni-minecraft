# Changelog

All notable changes to THE STRATIFIED PALIMPSEST.

## [0.1.0] — Release Candidate

Initial benchmark-class implementation.

### Added
- **World simulator** (`SP.World*`): chunked region graph, 5 discoverability
  layers (L0–L4), 8 material classes, microstep dynamics (diffusion, reactions,
  ecology with deceptive mimics, strain/collapse, spectral bands), per-region law
  vectors, and seam-based open-ended expansion with mutated law regimes.
- **Body & development** (`SP.Body*`): morphology graph with appendage and
  sensory ladders, organ-gated actions, 8 sensor modalities, homeostatic
  metabolism with a viability envelope (no reward oracle), and budget-driven
  development through stages 0–4.
- **Genome & evolution** (`SP.Genome`): hereditary growth plans with
  mutation/recombination and a `repair/1` that guarantees developable genomes.
- **Opaque interface** (`SP.Interface`, `SP.Interface.Audit`): per-seed channel
  permutation + optional value scramble, versioned schema (`obs-v1`), relative-only
  actions, and a structural + token-scan leakage auditor.
- **Runtime** (`SP.Sim`, `SP.Agent`): hybrid-time orchestrator and directive
  interpreter preserving the pure-decision / runtime-effect boundary.
- **Baselines** (`SP.Baselines.*`): six non-omniscient validation agents.
- **Eval** (`SP.Eval`): episode metrics, ablation suites, structural
  layer-visibility evidence.
- **Observability/Scenario**: provenance, JSON (OTP `:json`), CLI table, and
  schema-validated scenario configs.
- **QA**: 100 ExUnit tests (unit/property/integration/leakage-probe/invariants/
  soak/golden), GitHub Actions CI, multi-stage Dockerfile, 14 docs, and an
  8-report validation evidence bundle.

### Reproducibility
- Pure SplitMix64 PRNG (`SP.Determinism`); zero hex dependencies; offline,
  deterministic tests.
- Fixed canonical material ordering and genome plan ordering to guarantee
  **cross-VM** reproducibility (atom-keyed map iteration order is unstable across
  BEAM instances); guarded by the cross-VM golden regression test.

### Known scope boundaries
- Live Jido `AgentServer`/`Sensor` adapter is specified (documented bridge) but
  not compiled into the offline core. See `docs/limitations.md`.
