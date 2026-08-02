# Genome, Development, and Evolution

## Hereditary substrate (`SP.Genome`)

A genome is a **prior structure that parameterises morphogenesis** — explicitly
*not* a symbolic rulebook for the world (Hard constraint #1). Fields:

- `growth_plan` — ordered list of organs the body attempts to grow.
- `maturation_rate` — how fast organs ripen (`0.05..0.5`).
- `thrift` — a metabolic-bias prior (`0..1`).
- `lineage`, `generation`, `parents` — lineage bookkeeping.

## Developmental grammar (`SP.Body.Development`)

Development consumes a **growth budget** that accrues only from energy surplus
(`SP.Body.metabolize/2`). Each developmental tick (`develop/2`):

1. **Maturation** — immature organs ripen by `maturation_rate` (small budget cost).
2. **Growth** — if budget allows, grow the next plan organ whose prerequisites are
   already mature, attached to its deepest prerequisite part (`SP.Body.grow/4`).

Stage (`stage_of/1`, 0–4) is derived from the deepest organ tier present.
Because growth uses `SP.Body.grow/4` (which checks prerequisites and parentage),
**development can never produce an impossible body graph** (Invariant #9, property
test in `SP.Body.DevelopmentTest`).

## Phenotype constraints / viability selection

- Each mature organ adds metabolic upkeep (`0.025 + 0.005·n_organs`), so
  morphology is never free — a body must forage well enough to fund its
  complexity (`SP.Body.step/2`).
- Selection is **through the world itself**: viability (`SP.Body.Viability`) is an
  envelope + preferred-state prior + risk, evaluated only by the eval harness.
  There is no fitness scalar handed to the agent.

## Mutation, recombination, repair (Invariant #10)

- `mutate/2` — point ops on the plan (insert/delete/swap) + parameter jitter.
- `recombine/2` — one-point crossover of plans; averaged parameters.
- `repair/1` — makes ANY genome developable: drop unknown organs → take the
  **prerequisite closure** → topologically order by prerequisite depth.

`valid?/1` holds for every repaired genome, and `mutate`/`recombine`/`random` all
repair their output. Property tests run hundreds of random genomes and assert
validity (`SP.GenomeTest`). So evolution never yields an invalid genome without
rejection/repair.

## Lineage / evolution timescale

Across episodes, `SP.Eval` (and a future evolutionary loop) can:

- branch lineages by `mutate`/`recombine`,
- select survivors by world viability (envelope reached, ticks survived,
  infrastructure built, regions expanded),
- seed the next generation's genomes.

The single-episode core already exercises development end-to-end; the
cross-episode evolutionary controller is a thin loop over `SP.Genome` +
`SP.Eval.episode_metrics/1` (see [eval harness](../validation/eval_harness.md)).
