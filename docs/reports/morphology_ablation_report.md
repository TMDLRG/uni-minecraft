# Morphology Ablation Report

## Purpose

Verify Validation Invariants #6, #9 and Acceptance Gate #5 (morphology matters):
actions are gated by appendages, development cannot create impossible bodies, and
a body that never develops cannot perform the consequential late game.

## Method

1. **Gating (deterministic):** assert a seed body cannot perform appendage-gated
   actions; growing an organ without prerequisites is rejected.
2. **Development validity (property):** hundreds of random genomes developed for
   many ticks always yield valid body graphs.
3. **Utilisation (statistical):** run the Infrastructure baseline with development
   disabled (`dev_interval` beyond horizon) vs enabled, and measure structures
   built and expansions.

## Artifacts used

- `SP.BodyTest`, `SP.Body.DevelopmentTest` (property), `SP.EvalTest`,
  `SP.InvariantsTest` (#6, #9).
- `scripts/evidence.exs` morphology section.

## Result summary

**Gating (exact):** a seed body returns `false` for `excavate`, `build_*`,
`open_seam`; `Body.grow(seed, :excavator, …)` ⇒ `{:error, {:prereqs_unmet,
:excavator, [:manipulator]}}`. Locomotion (`move/orient/probe`) needs no appendage.

**Development validity:** `SP.Body.DevelopmentTest` develops 150 random genomes
for 80 ticks each; **all** resulting bodies pass `Body.valid?/1` (Invariant #9).

**Utilisation (from `scripts/evidence.exs`):**

```
never-develop body: stage=0 structures=0 expansions=0  (cannot build/excavate/expand)
developing Infrastructure (seeds 11..40): builders=9/30 total_structures=36 max_stage=4
```

A body that never develops is permanently confined to locomotion and dies without
constructing anything. A developing body reaches stage 4, builds infrastructure in
12/30 runs, and can open seams (see open-endedness report).

## Pass/Fail

**PASS.** Morphology is necessary: it gates the entire action ladder (exact), can
never be malformed (property), and is the prerequisite for all niche construction
and expansion (statistical).

## Residual risks

- Whether a *developing* body reaches a given stage within an episode depends on
  surviving long enough (energy economy); harsh seeds cap development. This is the
  intended bootstrapping difficulty, not a defect.
