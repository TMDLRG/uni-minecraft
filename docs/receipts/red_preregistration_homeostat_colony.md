---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — homeostat-colony-live

- **Gate name:** `homeostat-colony-live`
- **Phase:** Phase 2
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/homeostat_colony_red.exs`
- **Related:** `CLAUDE.md:162-164`, `lib/sp/brain/genome.ex:homeostat_colony/0`

## Motivation

`Genome.homeostat_colony/0` ships unproven per `CLAUDE.md:162-164` ("streamed genome ... offline-green but NOT RED-validated live; it ships unproven only per explicit owner go-ahead"). This is the paired-twin RED that either promotes it to PASS or WITHHELDs it.

## PASS condition

Paired-twin live RED against a properly-controlled sibling:
- Twin A: `homeostat_colony/0` lineage.
- Twin B: matched sibling (same organs enabled, matched dirichlet counts at t=0, but `homeostat_colony/0` streaming-parameter disabled).
- PASS: Twin A shows the same runway-closure verdict as Twin B (no regression) AND at least one measurable signature (energy trajectory smoothness, satiety-attenuation of positive C on the whitelist) is distinguishable in favor of Twin A.

## FALSIFIES condition

- Twin comparison shows `homeostat_colony/0` matched or beaten by the properly-controlled sibling; OR
- `default_genome` byte-identity breaks.

## Protocol

1. Freeze the two lineages at identical seeds + memory shas.
2. Same MC world, same spawn.
3. Run T ≥ 4 hours; collect energy/satiety/kill/eat trajectories.
4. Verdict:
   - PASS: no regression + ≥ 1 favorable signature.
   - PARTIAL: no regression but no distinguishable favorable signature.
   - WITHHELD: regression (Twin B beats Twin A) → withdraw `homeostat_colony/0`.

## Ship-gate

- No FE code changes to `lib/sp/brain/genome.ex` before this RED runs.
- MERGED VERDICT required to promote from "ships unproven" → PASS.
