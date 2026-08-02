# A4 spec — lab-team ship-gate review receipt (2026-07-11)

**Subject:** the A4 design (Survival-C + Full-Human-Binocular True-Signal Vision).
**Mechanism:** 5-persona adversarial review (math-breaker / aif-theorist / architect / experimentalist /
embodiment) + orchestrator merge, workflow `wf_a18fc5d1-eda`, each persona grounded in its mandate doc + the
cited code at file:line.
**MERGED VERDICT: SIGN-WITH-CHANGES** (unanimous; no REJECT). The math and additive+gated bones are sound;
the spec may NOT ship to code until the 15 blocking changes below land AND the 3 follow-on artifacts (typed
model spec, paired RED design, ship-gate checklist) are complete AND owner go-ahead + live-stream guard.
This is a design sign; the mechanistic claims (`:depth` learning, stereo covenant, byte-identity of the new
lineages) remain **unverified** until their activation gates fire at runtime.

## The 15 blocking changes + resolution status
Resolution is folded into `docs/specs/{generative_model,curriculum_removal,sensorium}.md` (this commit).

| # | Blocker (persona) | Resolved in |
|---|---|---|
| 1 | `:depth` honesty — (a) non-identifiable uniform-A (needs `init_a: :diagonal` + activation probe); (b) bin EDGES must be unsupervised-clustered cortex-side, not fixed thresholds | `sensorium.md` §II.3, §II.5, RED-B |
| 2 | RED-A single-variable — bind `:metabolism` (the only emptying-B) into BOTH arms; ONLY `curriculum:` differs | `curriculum_removal.md` §I.4, RED-A |
| 3 | Motor tail fence — reindex `motor_config` by NAME (not `Enum.take(-5)`), SAME PR as `:depth` + regression test | `sensorium.md` §II.6 |
| 4 | Neutralize BOTH task-C channels by viability-provenance (keep status/threat; drop inv/vis/light/sky) | `curriculum_removal.md` §I.3 |
| 5 | RED-B single-variable + un-bundle — pin `curriculum:` both arms; add monocular `:scene`-only intermediate arm | `sensorium.md` RED-B |
| 6 | Qualitative gates → pre-registered NUMERALS; stereo offline held-out gate before RED-B T0 | `sensorium.md` RED-B; `generative_model.md` §RED-discipline |
| 7 | Pseudo-replication — replication unit = distinct world-seed (≥5), NOT 6 UNIs in one seed | `generative_model.md` §RED-discipline |
| 8 | World-ceiling reference coherence — one role per number (ceiling XOR floor), pinned before T0 | `generative_model.md` §RED-discipline |
| 9 | Correct `@energy_setpoint` shape — unimodal (peak bin2=+3, neutral bin3=0), NOT flat-top; restate F8 | `curriculum_removal.md` §I.1 |
| 10 | Demote Spec-0 ladder to MOTIVATION — `precision.ex` global constants, `hierarchy2.ex` not wired live | `generative_model.md` §0 |
| 11 | Restate no-smuggled-reward precisely — C DOES enter `qo·C` (efe.ex:99); C is un-learned + A/B/D-disjoint | `generative_model.md` §no-reward |
| 12 | Cardinality ENFORCED not clamped — `@depth_states` + accessor + raise-on-mismatch | `sensorium.md` §II.4 |
| 13 | Heritable `curriculum:` field discipline — `slow_defaults` back-fill, `Map.get` read, append-last Det draw | `curriculum_removal.md` §I.4 |
| 14 | Bridge wire — `:depth` at a NEW fixed `rest[]` slot after motor + decoder-order test | `sensorium.md` §II.6 |
| 15 | RED scoring — RED-A PASS = non-inferiority + activation, G6 SECONDARY expected-FAIL; activation-miss → WITHHELD; name the continuous collector | `curriculum_removal.md` RED-A; `generative_model.md` §RED-discipline |

## Confirmed-clean (cited for the record; no change needed)
- **C never enters A/B/D tensors or is learned:** `card/1` (`genome.ex:237`) computes preferences via
  `Curriculum.preference`; C read ONLY in the pragmatic EFE term (`efe.ex:93,99`); no `learn_c`/`pc`.
- **Express path uncapped:** `@factor_cap 12` (`factors.ex:22`) gates only runtime `add_factor`; a 13/14-factor
  vision lineage via `Factors.new` is legal; all factors share `nu` (`factors.ex:59-63`).
- **`:scene` port proven offline:** `mc_codec.ex:52-54` + `vision_test.exs`.

**Ship-gate remaining after this commit:** the corrected specs go through the FORMAL `/lab-team-review` skill
for a signed MERGED VERDICT + owner go-ahead + live-stream guard BEFORE any FE-touching code. This workflow
review is a rigorous pre-check, not the signed skill output.
