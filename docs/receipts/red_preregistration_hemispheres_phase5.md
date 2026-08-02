---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — hemispheres-phase5

- **Gate name:** `hemispheres-phase5`
- **Phase:** Phase 5 (lateralised hemispheres)
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/hemispheres_red.exs`
- **Related:** `docs/UNI_MISSION_DEEPENING.md:75-81`

## Motivation

Phase 5 pre-registers the H3 lateralised genome test: H3 (asymmetric hemispheres) explores more + reaches phase-3 faster than baseline; the SYMMETRIC-DUPLICATE control (same parameter count, symmetric hemispheres) does NOT show H3 — proving asymmetry is the cause, not parameter count.

## PASS condition

- **Signature:** H3 lineage shows exploration advantage over baseline (`default/0`) by pre-registered ε.
- **Control:** Symmetric-duplicate lineage (matched parameter count, symmetric hemispheres) does NOT show the H3 signature.

## FALSIFIES condition

- H3 signature also appears in the symmetric-duplicate control (parameter-count confound), OR
- `default_genome` byte-identity breaks with H3 absent.

## Protocol

1. Three lineages:
   - L0 = baseline (`default/0`).
   - L1 = H3 lateralised (asymmetric hemispheres, opt-in genome).
   - L2 = symmetric-duplicate control (same param count as H3, but symmetric).
2. Run each for N ticks in an exploration-quality environment (novelty-weighted).
3. Measure: state-visit entropy, phase-3 reach time.
4. Verdict:
   - PASS: L1 > L0 AND L2 ≈ L0 on both metrics.
   - PARTIAL: L1 > L0 AND L2 > L0 but L1 > L2 by ε.
   - FAIL: L2 ≈ L1 (parameter-count confound).
