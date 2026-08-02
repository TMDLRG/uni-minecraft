# QA & Validation Methodology

## Test taxonomy (`mix test`, 100 tests, 0 failures)

| suite | file | covers |
|---|---|---|
| Determinism | `determinism_test.exs` | PRNG reproducibility, ranges, split independence |
| Core | `core/signal_test.exs`, `core/directive_test.exs` | schema validation, directive shapes |
| World fields | `world/field_test.exs` | **diffusion mass conservation** (property), neighbours |
| World dynamics | `world/dynamics_test.exs` | **boundedness** over 500 steps, determinism, seam gating |
| World graph | `world_test.exs` | adjacency, **seam-open invariants**, transport conservation |
| Body | `body_test.exs` | **action gating**, graph validity, metabolism/viability |
| Genome | `genome_test.exs` | mutate/recombine/repair **always valid** (property) |
| Development | `body/development_test.exs` | **no impossible graphs** (property), stage transitions |
| Sensors | `body/sensor_test.exs` | organ-gating, **hidden-layer invisibility**, payload cleanliness |
| Interface | `interface_test.exs` | **opacity**, per-seed remap, decode, leakage (property) |
| Sim | `sim_test.exs` | episode determinism, reset, **no world mutation from agent**, fuzz |
| Eval | `eval_test.exs` | senses-matter (behavioral), layer visibility, ablation suite |
| Invariants | `invariants_test.exs` | the **15 mandatory invariants** as a checklist |
| Leakage-probe | `leakage_probe_test.exs` | leakage, malformed signals/directives, channel fuzz |
| Soak | `soak_test.exs` | 2000-step boundedness, repeated expansion, bounded trace |
| Golden | `golden_test.exs` | **benchmark regression** against a stored artifact |

## Property testing without external deps

`SP.Prop.forall/4` (in `test/support`) samples N seeded cases and reports the
failing sample with its iteration index — reproducible, offline, no `StreamData`.

## No-flake discipline

Time is purely logical (decision ticks, microsteps). There is **no
`Process.sleep`** anywhere in the suite. Determinism tests assert byte-identical
traces, so any nondeterminism surfaces immediately rather than flaking.

## The 15 mandatory invariants → tests

`SP.InvariantsTest` maps one test per invariant (#1–#15) for at-a-glance audit;
several are also exercised in depth by the dedicated suites above.

## Leakage-probe / fuzz coverage (spec §D)

- malformed signal payloads → rejected by `SP.Core.Signal` schema;
- malformed/garbage directives → tolerated by `SP.Sim`, counted as
  `decoded_failures`, never executed;
- out-of-range/negative channels → `{:error, …}`, never raise (channel fuzz
  property);
- absolute-coordinate smuggling → `:absolute_coordinate_forbidden`;
- debug reveal separated from the production encode path;
- the leakage-probe baseline runs an episode auditing every observation and asserts
  `leaks == 0`.

## Soak / stability (spec §F)

2000-microstep runs assert every field stays within its documented cap; repeated
seam expansion (8×) keeps every region's law valid and the graph connected; a
1500-tick episode with `keep_points: false` keeps the trace bounded.

## Regression bands (spec §H)

The golden artifact (`config/golden/reference_episode.json`) pins a seeded
episode's structural metrics exactly and its float metrics within `1e-6`.
Regenerate intentionally with `mix run scripts/gen_golden.exs`; CI diffs it.

## Running QA

```bash
mix test                       # everything
mix compile --warnings-as-errors --force
mix format --check-formatted
mix run scripts/evidence.exs   # validation evidence numbers
```
