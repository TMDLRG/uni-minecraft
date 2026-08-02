# Action Catalog

Actions are requested by the agent as `SP.Core.Directive.Actuate{channel, params}`
where `channel` is an **opaque integer** (per-seed permutation of
`SP.Interface.action_catalogue/0`). `SP.Sim` decodes the channel via
`SP.Interface.decode_action/2`, checks morphology gating (`SP.Body.can_do?/2`),
then applies the effect through `SP.World.Actions`. Ungated requests are recorded
(`trace.ungated_attempts`) and have no effect.

Parameters are **relative only**. Absolute coordinates (`region`, `cell`, `x`,
`y`, …) are rejected at decode time (`:absolute_coordinate_forbidden`).

| action | gating organ(s) | params | effect |
|---|---|---|---|
| `move` | — (locomotion) | `dir: 0..3` | move to neighbour cell in the ring direction |
| `orient` | — | `dir: 0..3` | cheap no-op (hold/observe) |
| `probe` | — | — | cheap no-op (sensing happens each tick) |
| `manipulate` | `manipulator` | — | reserved manipulation no-op |
| `deposit` | `manipulator` | — | deposit held inventory at the current cell |
| `excavate` | `excavator` | `amount` (default 0.3) | remove material → inventory; opens a cavity |
| `transport` | `transporter` | `dir`, `amount` | move material to a neighbour cell (mass-conserving) |
| `build_shelter` | `constructor` | — | build a shelter (thermoregulation aid) |
| `build_buttress` | `constructor` | — | build a buttress (raises support, resists collapse) |
| `build_conduit` | `constructor` | — | build a transport conduit |
| `build_memory_node` | `constructor` | — | build external-memory substrate |
| `build_resonator` | `constructor` | — | build a resonator (drives seam readiness) |
| `repair` | `constructor` | — | restore structure integrity (consumes feedstock) |
| `shape_field` | `field_effector` | `band: 0..2`, `delta` | adjust an L3 spectral band at the cell |
| `mount_instrument` | `instrument_mount` | — | instrument-mount no-op (extension point) |
| `write_memory` | `manipulator` | `payload` | write a payload into a memory_node |
| `read_memory` | `manipulator` | — | read a memory_node payload (recorded in trace) |
| `open_seam` | `seam_engineer` | — | open a ready seam → new region; relocates the body |

## Build costs (feedstock, from inventory)

`shelter 0.5, conduit 0.4, buttress 0.6, resonator 1.0, memory_node 0.7`
(`SP.World.Actions.build_cost/1`). Feedstock is sourced from held material's
`feedstock` property; building fails (no effect) if insufficient.

## The capability ladder (why ordering matters)

Appendage prerequisites (`SP.Body.prereqs/0`):

```
manipulator → excavator → constructor → instrument_mount → field_effector → seam_engineer
manipulator → transporter
```

So the action set unlocks in stages: manipulate/deposit → excavate → build/repair
→ shape_field → seam engineering. A seed body can only `move/orient/probe`.

## Determinism & safety

- Decoding is total: arbitrary/garbage channel integers return `{:error, …}` and
  never raise (fuzz-tested in `SP.LeakageProbeTest`).
- The agent cannot smuggle absolute targets; all targeting is relative to the
  body's current cell and sensorium.
- All world effects go through `SP.World.Actions`; the agent's `decide/3` cannot
  reach them.
