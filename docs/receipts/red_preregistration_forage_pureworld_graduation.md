---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — forage-pureworld-graduation

- **Gate name:** `forage-pureworld-graduation`
- **Phase:** Phase 2 → graduation
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/pureworld_qa_gate.exs`
- **Related:** `runs/nursery_forage_gate.sh`, `runs/pureworld_qa.exs`

## Motivation

The forage runway (`metab_scale=0.2`) is closed — deep-body UNIs survive by their own hunting at reduced metabolic pressure (development / womb-wean). Pure-world graduation is the discriminator claim: **the trained brain forages+survives in a PURE world (`metab_scale=1.0`, no runway) on every seed AND the untrained twin does NOT — zero VOID.** Verbatim from `docs/receipts/emergent_forage_cure1.md:70-71`. Task #25.

## PASS condition (verbatim)

The trained brain forages+survives in a PURE world (`metab_scale=1.0`, no runway) on every seed AND the untrained twin does NOT (the discriminator) — zero VOID.

## FALSIFIES condition (verbatim)

Any seed on which the trained twin dies AND the untrained twin survives.

## Protocol

1. Seed sweep: N ≥ 8 world seeds (choose ones with realistic biome mix, no forced-easy-food spawns). Freeze the seed list in the receipt before the run.
2. For each seed:
   a. Start a fresh MC world at `metab_scale=1.0`, no gives, no props, kin memory sha-locked from the runway-closure lineage.
   b. Twin A = trained lineage (`homeostat_colony/0` or the closed-runway lineage). Twin B = untrained control (fresh `default/0` genome, no memory).
   c. Run for T ≥ 4 hours in-world (or the pre-registered N ticks).
   d. Record: energy trajectory, food events (killed/collected/eaten), death events, forage-loop closure receipts.
3. Verdict:
   - PASS iff every seed shows Twin A alive at T AND some seed shows Twin B dead by T.
   - PARTIAL iff some seeds PASS the discriminator but not all.
   - FAIL iff any seed shows Twin B alive AND Twin A dead.

## Ship-gate discipline

- Independent confirmation: RCON `list` at 1-hour intervals + brain probes against the live registry.
- Claim fence: no "proven survival," no "life," no "graduation" language in the receipt outside the verdict word.
- One cure at a time: this runs standalone. If concurrent RED (motor-shuffle, consummation-Run3) is in flight, defer.

## Non-goals

This gate does NOT establish self-awareness / experience / life. It establishes ONLY that the trained lineage's foraging behaviour survives full metabolic pressure while a proper untrained control does not.
