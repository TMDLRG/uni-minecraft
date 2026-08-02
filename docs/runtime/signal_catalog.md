# Signal Catalog

All signals are `SP.Core.Signal` structs (CloudEvents 1.0 core attributes):
`specversion, id, type, source, subject, time, datacontenttype, data`.
`time` is the **logical world tick**, never wall-clock. `type` must be a
dot-segmented reverse-DNS string (validated by regex).

Sensor signals are produced by `SP.Body.Sensor` and are **coordinate-free and
material-ID-free** by construction. The learner does NOT see these directly; it
sees their `SP.Interface`-channelised projection (see [action_catalog](action_catalog.md)
and the leakage report). The semantic payloads below are the *engineering* view.

## Sensor signals

| type | source | emitted when | data keys |
|---|---|---|---|
| `sp.sense.interoception` | `sensor:interoception` | always (seed organ) | `energy, hydration, temperature, integrity, budget` |
| `sp.sense.chemotactile` | `sensor:chemotactile` | organ `chemotactile` mature | `attractant, solvent, irritation, texture, feedstock_feel` |
| `sp.sense.proprioception` | `sensor:proprioception` | organ `proprioception` | `appendages, senses, parts, stage` |
| `sp.sense.plume` | `sensor:plume` | organ `plume` | `nutrient_gradient, toxin_gradient, nutrient_dir, toxin_dir` |
| `sp.sense.tomography` | `sensor:tomography` | organ `tomography` | `cavity, strain, support, collapse_proximity` |
| `sp.sense.spectral` | `sensor:spectral` | organ `spectral` | `bands` (list of 3) |
| `sp.sense.seam_coherence` | `sensor:seam_coherence` | organ `seam_coherence` | `readiness, ready` |
| `sp.sense.meta` | `sensor:meta` | organ `meta` | `conflict, ambiguity` |

Notes:

- `nutrient_dir` / `toxin_dir` are **relative** neighbour-ring indices (`0..3`) or
  `-1` (flat) — never absolute coordinates.
- `attractant` is the *apparent* attractiveness; a mimic inflates it. `meta`'s
  `conflict` is the only signal that exposes the apparent-vs-hidden-danger
  mismatch — i.e. new senses unlock new information regimes.

## Observation feature catalogue (versioned schema)

The 29-feature observation schema is `SP.Interface.observation_catalogue/0`,
version `SP.Interface.catalogue_version/0` (`"obs-v1"`). Each `{source, key}` is
mapped to an opaque integer channel by a per-seed permutation; with
`scramble: true` (default) values also pass through a per-channel invertible
affine. The encoded observation is `%{channel_id => float}` — nothing else.

## Agent / orchestration signals

Agents and spawned probes communicate via signals carried in `Emit` / `Schedule`
directives (Jido invariant #6 — no direct shared-state coupling). Recommended
conventions:

| type | source | purpose |
|---|---|---|
| `sp.probe.report` | `worker:<ref>` | an ephemeral probe returns a finding |
| `sp.agent.intent` | `agent:<id>` | inter-agent coordination |

These are application-level conventions for the live runtime; the single-agent
pure core does not require them (it interprets `Actuate` directives directly).

## Validation

- Every emitted signal passes `SP.Core.Signal.valid?/1` (tested in
  `SP.Body.SensorTest`, `SP.InvariantsTest` #4).
- Payloads pass `SP.Interface.Audit.sensor_payload_ok?/1` — no material IDs, no
  coordinates (Invariant #5).
