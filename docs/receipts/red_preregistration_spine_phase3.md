---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — spine-phase3

- **Gate name:** `spine-phase3`
- **Phase:** Phase 3
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/spine_red.exs`
- **Related:** `docs/UNI_MISSION_DEEPENING.md:75-81`

## Motivation

Phase 3 in `docs/UNI_MISSION_DEEPENING.md` pre-registers Gate A (byte-identity of default preserved) and Gate B (distal-entropy signature observable in the spine lineage). This is the paired RED harness.

## PASS condition

- **Gate A (byte-identity):** `test/sp/brain/decider_byte_identity_test.exs` PASSES with the spine organ present in a `spine_lineage/0` genome (absent from `default/0`, coupling 0.0).
- **Gate B (distal-entropy):** In `spine_lineage/0`, distal-entropy signature (H(distal states) > baseline by pre-registered ε) is observable in the diagnostic window.

## FALSIFIES condition

- `decider_byte_identity_test.exs` FAILS, OR
- `spine_lineage/0` shows no distal-entropy signature above baseline in the diagnostic window.

## Protocol

1. Author `spine_lineage/0` genome (segmental spine organ + coupling 0.0 default).
2. Run byte-identity test (Gate A).
3. Run `spine_lineage/0` for N ticks in a fixed diagnostic environment.
4. Measure H(distal states) vs baseline (`default/0` in the same env).
5. Verdict:
   - PASS: Gate A PASS + Gate B PASS.
   - PARTIAL: Gate A PASS + Gate B ambiguous.
   - FAIL: Gate A FAIL (regardless of Gate B) OR Gate B REFUTED.

## Ship-gate

Additive+gated invariant preserved. FE code touching `lib/sp/brain/motor.ex`/`motor_control.ex` requires this RED PASS before merge.
