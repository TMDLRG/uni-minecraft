---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — consummation-honest-cure2 (Run 3)

- **Gate name:** `consummation-honest-cure2` (Run 3 supersedes Run 2)
- **Phase:** Phase 2
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/consummation_run3.exs`
- **Related:** `docs/receipts/forage_honest_consummation_RED.md:87-100`

## Motivation

Run 2 of the honest-consummation Cure-2 RED was CONFOUNDED: aggregated arms + non-isolated per-bot drop attribution meant Cure-2's distinct benefit vs Cure-1 could not be established. Run 3 fixes the confounder.

## PASS condition

- **Isolated arms:** Cure-1 (baseline motor) and Cure-2 (honest-consummation motor: attack only closes the reach gap; kill only when reach + strike land) run in ISOLATED worlds (separate seeds, no shared spawn).
- **Per-bot drop attribution:** every drop event is attributed to a specific body via RCON `data get`, with time-of-death and location.
- **PASS:** Cure-2's per-bot drop rate is distinguishably better than Cure-1's on isolated arms (ε ≥ 2×).

## FALSIFIES condition

Cure-2's per-bot drop rate is NOT distinguishably better than Cure-1's on isolated arms.

## Protocol

1. Two lineages, freshly seeded at identical prior:
   - Cure-1: baseline motor.
   - Cure-2: honest-consummation motor (existing implementation, offline PASS receipts on file).
2. Two isolated MC worlds (different seeds, matched biome mix). One lineage per world.
3. Run T ≥ 4 hours; per-bot drop attribution via RCON.
4. Verdict:
   - PASS: Cure-2 rate ≥ 2× Cure-1 rate under matched attribution.
   - PARTIAL: Cure-2 > Cure-1 but ratio < 2×.
   - FAIL: Cure-2 ≤ Cure-1.

## Ship-gate

The Run-2 receipt (`docs/receipts/forage_honest_consummation_RED.md`) stays as the honest record of the PARTIAL. Run 3 either promotes to PASS or explicitly withdraws Cure-2's distinct-benefit claim.
