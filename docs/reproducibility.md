# Reproducibility Guide

Reproducibility is a first-class invariant (#13): identical inputs reproduce
identical traces, bit-for-bit, offline.

## Sources of determinism

1. **Explicit PRNG** — `SP.Determinism` (SplitMix64) is threaded as an immutable
   value through every stochastic step. We never use `:rand` (process-local,
   version-dependent).
2. **Splitting, not sharing** — regions and children get *split* sub-generators,
   so adding a region/probe never perturbs another stream.
3. **No wall-clock** — time is logical (ticks/microsteps). No `System.*` time, no
   `Process.sleep`.
4. **No external deps** — nothing to version-drift; `mix test` is hermetic.
5. **Seed-derived interface** — the opaque channel map is a pure function of the
   scenario seed (`SP.Interface.channel_map/2`).

## What a seed determines

`(seed, regions, w, h, micro_per_decision, dev_interval, agent, scramble)` fully
determines: the world generation, all dynamics, the body's development (given the
genome), the channel map, and therefore the entire episode trace.

## Reproducing a run

```elixir
# from a captured provenance block:
SP.Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking,
           max_ticks: 250, micro_per_decision: 3, dev_interval: 5,
           world_opts: [regions: 2, w: 6, h: 6])
|> SP.Sim.run()
```

## Verification

- `SP.SimTest` — same seed ⇒ identical `points/1`; different seed ⇒ differs.
- `SP.World.DynamicsTest` — same seed ⇒ identical world after N steps.
- `SP.GoldenTest` — a stored episode reproduces exactly (ints) / within `1e-6`
  (floats); CI diffs the regenerated artifact.
- `mix run scripts/evidence.exs` prints the reproducibility checks live.

## Declared tolerance

- Integer/structural metrics: **exact**.
- Float metrics: reproduced exactly within a process; the golden test allows
  `1e-6` to absorb only formatting/serialization rounding, not dynamics drift.

## Maintenance constraint: never iterate atom-keyed maps for ordered/float work

Erlang map iteration order for **atom keys** is not stable across BEAM instances
(it depends on atom-table indices, which differ with how many modules are
loaded — e.g. `mix run` vs the full `mix test` suite). Two pitfalls follow:

1. **`Map.keys` on an atom-keyed map** returns a VM-dependent order. `Material`
   classes are therefore defined as a fixed literal list (`@class_order`), with a
   compile-time guard, so `Determinism.choice/2` over them generates identical
   worlds everywhere.
2. **Float reductions over atom-keyed maps** (`Material.weighted/2`, `mass/1`)
   iterate in canonical class order, not map order. Tiny float-summation
   differences would otherwise be amplified into macroscopic divergence by the
   agent's threshold/argmax decisions.

Integer-keyed maps (fields, region cells, body parts) are atom-table-independent
and safe. The cross-VM golden regression test (`SP.GoldenTest`) is what catches
violations of this constraint — it compares a `mix run`-generated artifact against
a `mix test`-computed run. **When adding code, never let trajectory-affecting
output depend on atom-keyed map iteration order.**

## Caveats

- Cross-Erlang/Elixer-version float bit-identity is not guaranteed by the BEAM in
  general; our float operations are simple arithmetic and reproduce within
  tolerance across the supported matrix (OTP 27, Elixir 1.17/1.18). Integer/PRNG
  state is exact everywhere.
