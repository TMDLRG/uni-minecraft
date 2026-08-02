---
verdict: WITHHELD
evidence_class: pending
---

# RED pre-registration — glands-phase5

- **Gate name:** `glands-phase5`
- **Phase:** Phase 5 (endocrine / persistent glands)
- **Pre-registered:** 2026-07-13
- **Runner:** `runs/glands_red.exs`
- **Related:** `docs/UNI_MISSION_DEEPENING.md`, `lib/sp/brain/hormones.ex`

## Motivation

Persistent-gland-state organ biases policy through satiety-attenuated positive C on a whitelist. The risk: this is the classic place reward can be smuggled. The RED asserts NO scalar-per-action leakage AND byte-identity preserved.

## PASS condition

- Gland lineage engages: satiety trajectory shows attenuation of positive C on the whitelist over the pre-registered window.
- **No-smuggled-reward:** the `action_clone_invariance_test.exs` PASSES with gland organ present.
- Byte-identity of `default_genome` PASSES with gland organ absent.

## FALSIFIES condition

- Any evidence of scalar-per-action leakage into policy logits (clone/inject-cost/perturb-one guards fail); OR
- `default_genome` byte-identity breaks; OR
- The gland attenuation signature is not observable (organ inert).

## Protocol

1. `glands_lineage/0` genome with the endocrine organ; coupling 0.0 default.
2. Full invariant suite: `decider_byte_identity`, `action_clone_invariance`, `novelty`.
3. Live diagnostic: satiety trajectory + policy logits under matched-vs-satiated conditions.
4. Verdict:
   - PASS: all invariants pass AND attenuation signature observable.
   - FAIL: any invariant fails OR attenuation not observable.

## Ship-gate

This is a Phase 5 organ. Absolutely no FE code changes to `hormones.ex` / `precision.ex` before the RED PASS + MERGED VERDICT.
