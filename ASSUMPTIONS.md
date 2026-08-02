# Implementation Assumptions

Strong best-fit assumptions made during the build (per Hard constraint #9), with
rationale. Each is reflected in code and docs.

## Stack

- **Single Elixir app, zero hex deps** instead of an umbrella. Rationale: a
  deterministic, offline-testable world kernel is the core asset; module
  namespaces preserve the spec's separation; umbrella split is mechanical later.
  (See [architecture/overview.md](docs/architecture/overview.md).)
- **Built-in OTP `:json`** (OTP 27+) for serialization rather than a hex JSON lib,
  to keep zero deps.
- **`SP.Determinism` SplitMix64** instead of `:rand`, for cross-process,
  version-stable reproducibility.
- **No `Nx`** — grids are small; pure data structures suffice. Documented as an
  extension point.

## World model

- Region grid default **6×6**, **2 regions** initial; spectral **3 bands**;
  **8 material classes**. Chosen for tractable soak tests while exhibiting all
  required phenomena.
- Seam open **threshold 0.8**; readiness relaxes to an equilibrium that **cannot**
  cross the threshold without resonators ⇒ seam engineering is late-stage.
- Conservation claimed/tested for **field diffusion** and **transport**; reactions
  and collapse are explicit transformations (not globally conserved) — documented.
- Field **caps**: nutrient 5, temperature 2, solvent 2, toxin 3, strain 2, band 3
  (clamped each microstep).

## Body / viability

- Seed body = **core + interoception + chemotactile** (the spec's "homeostatic +
  proximal sensing"). All else must develop.
- Homeostatic set-point **0.5** with a **±0.25 comfort dead-zone**; stress damages
  integrity only outside the band. Upkeep `0.025 + 0.005·n_organs` (morphology is
  never free). Energy intake gated to cells with nutrient `> 0.1`, capped `0.14`.
- These constants calibrate difficulty to "hard but possible"; they are tuning
  knobs, documented in `SP.Body` and the ablation reports.

## Interface

- Observation schema **`obs-v1`**, 29 features; per-seed channel permutation +
  optional per-channel affine value scramble (default on).
- Action params are **relative only**; absolute coordinates rejected.

## Hybrid time

- Defaults: **3 microsteps/decision**, **development every 5 decision ticks**,
  **400-tick** reference horizon. Lineage is cross-episode via `SP.Genome` +
  `SP.Eval`.

## Evolution

- Genome `growth_plan` + `maturation_rate` + `thrift`; `repair/1` guarantees
  developability via prerequisite closure + topological order. Selection is
  through world viability, not a fitness scalar.

## Validation baselines

- Six baselines; `Random`/`LeakageProbe` are **blind** (opaque interface only);
  the four scripted ones use the debug `Lens` and are **validation-only**, never
  learners.
