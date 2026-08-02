# Sensory Ablation Report

## Purpose

Verify Validation Invariants #5, #7, #8 and Acceptance Gate #5 (senses matter):
new sensory modalities unlock deeper layers, hidden layers are invisible without
their organ, and using senses confers a real survival advantage.

## Method

1. **Structural (deterministic):** `SP.Eval.layer_visibility(seed, omit)` compares
   the number of opaque observation channels available to a full-sensorium body
   vs one missing a deep sense (and its dependents).
2. **Behavioral (statistical):** hold the body fixed (full sensorium) and compare
   a sense-using agent (`Homeostatic`) against a blind agent (`Random`) across the
   reference seed batch.

## Artifacts used

- `SP.Body.SensorTest` (hidden-layer invisibility, unlock), `SP.EvalTest`,
  `SP.InvariantsTest` (#5, #7, #8).
- `scripts/evidence.exs` sensory + hidden-layer sections.

## Result summary

**Structural — each deep sense strictly adds channels:**

| omit | channels with | without | Δ |
|---|---|---|---|
| `[:tomography]` (+meta dependent) | 29 | 23 | 6 |
| `[:spectral]` (+seam_coherence) | 29 | 24 | 5 |
| `[:seam_coherence]` | 29 | 27 | 2 |
| `[:meta]` | 29 | 27 | 2 |

A seed body (interoception + chemotactile only) perceives **10** channels; a
full sensorium perceives **29**. L2–L4 emit nothing without their organ
(`SP.Body.SensorTest`).

**Behavioral — sensing confers survival advantage (same body, 12 seeds, 400 ticks):**

```
Homeostatic (uses senses) mean survival: 264.67
Random      (ignores senses) mean survival: 212.92
relative advantage: 24.3%
```

## Pass/Fail

**PASS.** Senses are necessary to perceive deeper layers (structural, exact) and
materially improve outcomes when used (behavioral, +24.3%).

## Residual risks

- The behavioral margin is seed-dependent; reported over a batch. Run more seeds
  for tighter intervals.
- Proximal chemotaxis already provides a baseline foraging signal, so the
  *incremental* value of plume vs chemotactile is smaller than the value of
  having senses at all; the structural evidence isolates each layer cleanly.
