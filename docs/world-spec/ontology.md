# World Ontology and Dynamics

## Topology

The world (`SP.World`) is a chunked, expandable graph of **regions**
(`SP.World.Region`), each a `w × h` cell grid (default 6×6). Regions connect via:

- **ordinary adjacency** — fixed at generation (a chain of `regions`),
- **seam edges** — created at runtime by `SP.World.open_seam/2`.

Each region carries a **law-parameter vector** (`SP.World.Law`): diffusion,
reaction rate, thermal coupling/baseline, strain threshold/gain, field
decay/coupling, nutrient regen, toxin decay, seam gain. Opening a seam mutates
the parent's law to produce a **new regime** (not just new coordinates).

## The five discoverability layers

| Layer | Contents (Region fields) | Perceiving organ |
|---|---|---|
| L0 contact | `nutrient`, `temperature`, `solvent`, `toxin` | interoception / chemotactile |
| L1 material | `materials` (per-cell composition) | chemotactile (coarse), plume (distal) |
| L2 hidden causal | `cavity`, `strain`, `conduits` | tomography |
| L3 spectral | `bands` (3 spectral fields) | spectral |
| L4 seam/topology | `seam_readiness`, `seam_seed` | seam_coherence |

Observability barriers are enforced in `SP.Body.Sensor`: a layer emits a signal
only if the body has the mature organ. The same L0 reading routinely has
multiple hidden causes (e.g. high `nutrient` may be a real deposit *or* a mimic's
deception masking reactive material on L1).

## Resource economy (material classes)

`SP.World.Material` defines eight classes with physical properties
(`energy, structural, conductive, catalytic, toxicity, solvent, persistent,
feedstock`):

`labile_nutrient`, `fibrous_biomass`, `structural_mineral`, `conductive_crystal`,
`catalytic_gel`, `volatile_solvent`, `reactive_compound`, `memory_substrate`.

These are simulator metadata; the learner never sees the atoms (Markov blanket).

## Dynamics kernel (microstep)

`SP.World.Dynamics.step_region/1` applies, deterministically and boundedly:

1. **Diffusion** of L0 fields (conservative for nutrient/solvent/toxin); thermal
   coupling + relaxation toward the law baseline.
2. **Reaction network** — reactive compound + solvent/catalyst → toxin + heat,
   consuming the material (material→hazard transformation); toxin decay.
3. **Reactive discharge** — stochastic thermal spike + toxin burst.
4. **Ecology** — grazers consume nutrient; decomposers convert biomass→nutrient;
   **mimics** inflate the L0 nutrient reading while depositing reactive material
   (the deceptive analog).
5. **Strain & collapse** — strain accrues under unsupported cavities; when it
   exceeds the region's `strain_threshold` the cavity collapses, damaging
   infrastructure and creating rubble.
6. **Spectral bands** — relaxation/diffusion with field instability.
7. **Seam readiness** — relaxes toward an equilibrium driven by conductive
   material + field coherence + (dominantly) **resonator** infrastructure; the
   max target without resonators is below the open threshold, so seam
   engineering is a genuine late-stage capability.

### Hazards (all implemented)

toxin plumes; collapse under strain; thermal spikes; reactive discharge;
ecological **mimicry**; spectral field instability; seam instability (readiness
is consumed on opening and must be re-accrued).

## Conservation / boundedness (declared)

- `SP.World.Field.diffuse/2` conserves field mass exactly (tested).
- `SP.World.Actions.transport/4` conserves region material mass exactly (tested).
- Reactions/collapse are explicit transformations; global material is **not**
  claimed conserved under dynamics (documented, not a bug).
- Every field is clamped to a documented cap each microstep (no runaway growth);
  verified over 500–2000-step soak runs.

## Local-to-global causal scaling

Local actions alter global structure: excavation opens cavities (→ strain →
collapse → transport change); building resonators raises seam readiness (→
expansion); field shaping changes L3 geometry; depositing/repairing changes
structural stability and ecological succession (nutrient redistribution).

## Open-ended expansion

`open_seam/2` requires `seam_readiness ≥ SP.World.seam_threshold/0` (0.8). It
derives a child region deterministically from the parent's `seam_seed`, mutates
the law (regime distance > 0), and connects a seam edge. The map never
"finishes": each new region presents a new law regime and fresh engineering
problems. Validated unforced by the Infrastructure baseline (see
[open_endedness_validation.md](../reports/open_endedness_validation.md)).
