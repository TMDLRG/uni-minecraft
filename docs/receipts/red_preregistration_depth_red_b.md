---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — depth-red-b

- **Gate name:** `depth-red-b`
- **Phase:** Phase 2b (Sensorium)
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/depth_red.exs`
- **Related:** `docs/specs/sensorium.md:5-40`

## Motivation

`docs/specs/sensorium.md` pre-registers RED-B for the `:depth` factor with `init_a: :diagonal` — the identifiability gate. The RED must run AFTER RED-A has a verdict (one-cure-at-a-time; RED-A is the vision factor).

## PASS condition

Under `init_a: :diagonal` for the `:depth` factor, posterior separates the depth prior from the vision prior on the pre-registered ablation set: the posterior over depth-states is distinguishable from the posterior over vision-states at every tick of the diagnostic window.

## FALSIFIES condition

- Depth-factor identifiability collapses (posteriors indistinguishable, KL(depth‖vision) < ε on the ablation set), OR
- `default_genome` byte-identity breaks with `:depth` absent (`test/sp/brain/decider_byte_identity_test.exs` fails).

## Protocol

1. Genome: `depth_lineage/0` (new lineage, absent from `default/0`). Coupling 0.0 by default.
2. `depth.a` seeded with `init_a: :diagonal`; `vision.a` unchanged.
3. Ablation set: pre-registered N=100 scene tuples with independent depth/vision ground truth.
4. Run inference for K=1024 ticks. Sample posteriors every 128 ticks.
5. Verdict:
   - PASS: KL(depth ‖ vision) > threshold (pre-registered ε = 0.5 nats) on all sampled ticks.
   - PARTIAL: PASS on a majority of sampled ticks.
   - FAIL: any decider byte-identity test failure, OR posteriors indistinguishable.
