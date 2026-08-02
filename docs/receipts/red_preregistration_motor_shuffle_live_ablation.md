---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — motor-shuffle-live-ablation

- **Gate name:** `motor-shuffle-live-ablation`
- **Phase:** Motor P4 → live control
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/motor_shuffle_live_ablation.exs`
- **Related:** `runs/motor_lineage.exs`, `docs/MOTOR_RED_TEST.md:89`

## Motivation

Motor RED offline PASS + LIVE mechanism PASS both landed. `MOTOR_RED_TEST.md:89` names the missing step: the LIVE ablation with a shuffled control. Without it, LIVE mechanism could be explained by non-motor confounds; the shuffle isolates the motor spine.

## PASS condition

Live paired shuffled-control run: trained motor closes the reach-and-strike gap (kill events observed, RCON-confirmed drop attribution) AND shuffled-control collapse matches the 700× offline collapse signature (near-zero kill rate under matched exposure).

## FALSIFIES condition

Shuffled control matches or exceeds trained motor in live conditions (per-bot drop rate not distinguishable).

## Protocol

1. Paired lineage: kin K1 trained motor (frozen from Motor RED lineage), kin K2 = same genome with `motor_control.shuffle=true` (control-inference weights permuted per action step).
2. Same seed, same spawn, same 4 h in-world window.
3. Independent RCON polling for drop events (`data get entity` per prey) — the authoritative attribution.
4. Verdict:
   - PASS: K1 kill rate > K2 kill rate by ≥ 5× under matched exposure.
   - PARTIAL: K1 > K2 but ratio < 5×.
   - FAIL: K1 ≤ K2.

## Ship-gate

- Byte-identity of `default_genome` must hold — the shuffle organ is behind an opt-in genome flag (`motor_shuffle_lineage/0`, absent from `default/0`).
- MERGED VERDICT required before merging any lib/sp/brain/motor_control.ex changes.
