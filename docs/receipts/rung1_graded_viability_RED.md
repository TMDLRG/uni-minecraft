# Rung-1 graded-viability paired RED — PRE-REGISTRATION (before T0)

**Status: PRE-REGISTERED, NOT YET RUN.** Registered BEFORE any run (Lab Protocol II: pinned PASS + FALSIFIES +
numerals + VOID conditions before T0; no post-hoc retuning). The engine is BUILT + offline-proven (typed spec
`docs/specs/rung1_graded_viability.md`; commits `1c49e62..784eabd`; brain suite 315/0). This doc is the
experimentalist artifact for the **live** gate. It does **not** authorize a live burn: the live run requires
(a) the FE-surface blocking items below closed, (b) a `/lab-team-review` MERGED SIGN on those FE deltas, and
(c) owner go-ahead + the live-stream guard (separate containers / distinct kin / distinct memory dirs).

This gate follows and is motivated by the recorded **v2 FALSIFIES** verdict
(`docs/receipts/metabolism_regulation_gate_v2.md`): the reserve-blind flat fixed-setpoint homeostat is
**maladaptive** — it died 6/12 (thin-buffer self-drain, food reachable) and was *looser* in dispersion than the
hoarding saturable foil. That measured death IS the missing depth. Rung-1 (cures 1+2+3) adds graded
per-subsystem viability + an interior-peak reserve C + work/fatigue. This RED asks whether that depth **earns
its place behaviourally**, not just whether it survives.

---

## Question (one line)
Does the rung-1 graded body — interior-peak **reserve** C over 6-state per-subsystem viability factors, with
work→fatigue→motor coupling — produce **allostatic, two-ended, cross-subsystem-dissociated, work-rest-paced
self-maintenance** that (i) survives where the flat setpoint died AND (ii) is behaviourally distinguishable from
BOTH a 6-state flat-setpoint baseline AND a 6-state monotone-appetite (saturable) foil — with each surviving
advantage attributable to a NAMED coupling via per-mechanism ablation?

**Why survival-alone cannot be the gate (the key lesson from the offline pre-check).** Under a reserve-following
hand policy the body survives AND a saturable proxy also survives (both hold food); the offline dynamics roll
(`runs/verify_rung1_dynamics.exs`, reproduced 2026-07-11: 4/4 VIABLE) shows the RESERVE structure survives, holds
an interior reserve (energy mean 0.816, 80% of post-warmup ticks in [0.6,0.95]), paces (eat 93 / mine 233 /
rest 374), and dissociates (energy↔fatigue corr 0.314 while energy↔gut 0.99). So the discriminators MUST be
behavioural, or a "just eat more" foil banks the same survival. This is the same trap v2 pre-registered against.

---

## Arms (one cure-bundle, ABLATION-DECOMPOSED so a bundled win stays attributable — Lab Protocol I)

All arms are GENOME-level lineages sharing A/B/D/E/policies/precision **byte-identical**; they differ ONLY in the
gated `:homeostat`/`drive_shape` surface named per arm. One arm per world (never co-resident); paired by seed.

| arm | lineage | the ONE thing that differs | purpose |
|---|---|---|---|
| **FULL** (treatment) | `Genome.homeostat_l1_phase0` (`drive_shape: :reserve`) | interior-peak reserve C + all 4 factors + fatigue→`Motor.pi` | the cure under test |
| **SETPOINT-6** (baseline) | `homeostat_l1_phase0` w/ `drive_shape: :setpoint6` | flat-peak 6-state setpoint C (the death shape, at 6-state cardinality) | "is the reserve SHAPE doing work, vs a flat peak?" |
| **SATURABLE-6** (foil) | `homeostat_l1_phase0` w/ `drive_shape: :saturable6` | monotone-to-surplus 6-state C (eat-to-full, no interior peak) | "is this more than 'just eat more'?" |
| **ABL-C-only** | FULL minus fatigue coupling (fatigue factor present + felt, but `Motor.pi` pinned 1.0 AND fatigue C flat) | reserve C only, no work-rest pacing mechanism | isolates the reserve-C survival contribution |
| **ABL-fatigue-π** | FULL minus reserve edge (reserve C → setpoint6) but fatigue→`Motor.pi` LIVE | fatigue-motor coupling only | isolates the pacing/aim-degradation contribution |

**FE-surface decision that gates this RED (flagged, NOT silently added — see Blocking item B1).** `drive_c(:setpoint,6)`
and `drive_c(:saturable,6)` today merely expand the 4-key metabolism maps
(`[-8,-2,3,0,0,0]` and `[-8,-2,2,4,0,0]`, `lib/sp/brain/curriculum.ex:65-66`), which are MALFORMED as true 6-state
baseline/foil shapes (peak stranded in the lower third; the "saturable" isn't monotone to the ceiling). The
baseline/foil arms therefore need proper 6-state C vectors defined — e.g. `setpoint6` peaked at the interior
center bin with symmetric falloff, `saturable6` monotone non-decreasing to bin 5. That is NEW gated FE surface
(additive; absent from `default/0`; byte-identical default preserved) and **must pass `/lab-team-review` before
the launcher is written** (CLAUDE.md ship gate). Until then the launcher is scaffolded against FULL only.

---

## Isolation — applied IDENTICALLY to every arm (so nothing but the named per-arm surface confounds)
- **Strategist dropped** (no standing `:forage` task-C), **phase pinned 0** via the gated `max_phase: 0` cap (so
  no auto-advance re-imports the phase-1 wood/tree curriculum C). Both already baked into `homeostat_l1_phase0`.
- **`novelty_gain = 0`** in ALL arms (the state-epistemic term `efe.ex:97` stays live in both — pre-registered as
  why the control is not a strawman; the parameter-novelty term is gated OFF in all).
- **`:motor_cortex` present in ALL arms** (so the fatigue→`Motor.pi` coupling is a genuine world consequence, not
  a per-arm structural difference). Only the fatigue *coupling strength* / C differs between FULL and the ablations.
- Food provisioning schedule byte-identical across all sessions of a given world-class (see run params).
- Fresh minds + a kin group **unused by any prior lineage** (NOT kin 55 from the v2 run). Factor indices resolved
  **BY NAME** via `Genome.active_modalities/1`, never a positional `Enum.at`.

---

## Metrics (behavioural discriminators — pinned NOW, computed post-warmup, per the typed spec §Paired RED)
Raw body stores (`SP.Brain.Homeostat` `energy/gut/soma/fatigue` ∈ [0,1]) are the authoritative probe (NOT the
`bin6` posterior). Beliefs (`energy_reserve`/`gut_satiety`/`muscle_fatigue` posteriors) probed alongside for the
allostasis + dissociation measures. All indices computed per agent, collapsed to one datum per world, bootstrap
resampled at the WORLD/seed level (10,000×, analyzer RNG seed pinned).

1. **survival fraction** — in-world bot persistence (RCON `list`) over the scored window; death = store edge
   (`Homeostat.dead?`: `energy<=0 OR soma<=0`) confirmed by RCON removal.
2. **allostasis_index** — believed reserve (`energy_reserve` posterior expectation) at eat-onset; `FULL − SETPOINT-6`.
   Positive ⇒ FULL eats *before* the edge (anticipatory), not reactively at critical.
3. **two-ended satiation** — a paired contrast across two WORLD-CLASSES on matched seeds:
   *scarce* (food metered thin) ⇒ FULL fights harder near critical (higher `:eat` share at low reserve);
   *rich* (food abundant) ⇒ FULL STOPS eating at the interior reserve band, does NOT hoard to surplus (median
   store < 0.95, IQR non-degenerate) while SATURABLE-6 pins to the ceiling.
4. **cross-subsystem dissociation Δ** — `1 − |corr(energy_belief, fatigue_belief)|` (energy↔fatigue is the
   cleanest per the offline roll, corr 0.314). CI must exclude 0 ⇒ the 2nd factor is measurably decoupled, not
   a renamed bin.
5. **fatigue_pacing_index** — `corr(believed fatigue, P(non-arm action | just-mined))`. > 0 for FULL, ≈ 0 for
   ABL-fatigue-π-with-flat-C; AND `MotorControl` target_error rises with fatigue within a mining bout, falls
   after rest (the aim-degradation world consequence).

---

## PASS — named gate **"RESERVE-EARNS-ITS-DEPTH"**, pinned NOW, no post-hoc retuning. PASS requires ALL of:
1. **Survival ≥ 11/12** for FULL (vs the measured flat-setpoint **6/12**, `metabolism_regulation_gate_v2.md`).
2. **allostasis_index** paired 95% bootstrap CI **excludes 0 (lower bound > 0)** — FULL eats anticipatorily.
3. **two-ended satiation holds BOTH ends:** in scarce worlds FULL's low-reserve `:eat` share > SATURABLE-6's
   (CI-separated), AND in rich worlds FULL median store < 0.95 with non-degenerate IQR while SATURABLE-6 pins
   > 0.95 (CI-separated). Fails if FULL hoards to the ceiling like the foil, OR fasts into starvation.
4. **Beats BOTH controls on survival** — FULL survival-count CI excludes SETPOINT-6 AND excludes SATURABLE-6
   (an improvement over the death shape that is ALSO not merely the foil's eat-to-full survival).
5. **cross-subsystem dissociation Δ** CI **excludes 0** (energy and fatigue beliefs measurably decouple).
6. **fatigue_pacing_index > 0 for FULL and ≈ 0 for ABL-fatigue-π-flat**, AND target_error rises-with-fatigue /
   falls-after-rest within bouts — the pacing is caused by the NAMED coupling, not a coincidence.
7. **Every invariant anchor GREEN** (regardless of survival): default depth-5 Plan `mad<1e-12`;
   action-clone + action-history invariance; no scalar-per-action; monotonic decay W→0; no compounding.

**Locked constants (not re-derivable post-hoc):** N=12 paired seeds; survival bar 11/12 (vs 6/12); bootstrap
10,000× at world/seed level; 900 s run / 15 s probe / 120 s warm-up; interior-band ceiling 0.95; rich-world
hoard threshold 0.95; scarce/rich feed schedules pinned in the launcher.

## FALSIFIES — named gate **"DEPTH-DOESN'T-PAY"** (fires BEFORE any cure is credited). REJECT if ANY of:
- Survival not improved over SETPOINT-6 (≤ its count, CI-overlapping); OR
- FULL is **indistinguishable from SATURABLE-6** on survival AND the two-ended/allostasis discriminators (it is
  "just eat more" with extra factors) — collapse to Cure-1 or reject; OR
- FULL **rests/hoards into starvation** (over-brake: rich-world hoard, or scarce-world fasting death); OR
- **dissociation Δ CI includes 0** (dead depth — the 2nd/3rd factors rename bins; collapse to Cure 1); OR
- **allostasis_index CI includes 0** (reactive, not anticipatory — no allostasis); OR
- any invariant anchor trips (voids the whole run regardless of behaviour).

## Per-subsystem SEVERED-LIMB falsifiers (each factor independently — embodiment, non-decorative check)
For each of `energy_reserve / gut_satiety / soma_integrity / muscle_fatigue`: a twin whose factor **drains +
forms beliefs + emits C but whose world-coupling is CUT** must, on the LIVE world, differ (KS / CI) from the
intact FULL. If indistinguishable ⇒ that factor is a preference-hack with no world limb ⇒ reject/rewire THAT
factor (not the whole cure).
- **fatigue F4 (per-limb):** an all-`:noop` twin must RECOVER freshness while an actor ACCRUES fatigue — else the
  fatigue-B advances with no action-consequence (already offline-checked in `homeostat_test.exs`).
- **soma honesty:** soma is FLAT in a peaceful world (no damage). Its severed-limb twin is only meaningful in a
  world where the MC health channel varies (hostiles/fall). In a peaceful RED world soma is scored DECORATIVE
  (declared, not claimed) — do not credit a soma discriminator absent health variance.

## VOID-AND-RERUN (not PASS, not FALSIFY)
(a) any arm's live energy/fatigue C deviates from its registered map at any probe (`c_ok` false — a
C-restoration leak); OR (b) any arm's mean `:eat` ≈ 0 (degenerate/vacuous drive); OR (c) the offline invariant
gate is not green before deploy; OR (d) food-provisioning failure caused a provisioning- (not policy-) starve,
arm-asymmetric; OR (e) phase advanced past 0 or task-C shows a wood/tree pull on any arm at any probe; OR
(f) fewer than 10 analyzable paired seeds survive VOID/death drops (underpowered); OR (g) SATURABLE-6 degenerates
to trivially-pinned-full in a way that makes it a strawman (median > 0.98 with IQR < 0.02 in BOTH scarce and
rich) — retune the foil, not the treatment.

---

## N + replication unit + run parameters
- **N = 12 distinct-seed worlds per arm, PAIRED by seed, FIXED before T0** (no optional stopping / no peeking).
  One **independent mc-server WORLD/SESSION** = separate container, distinct kin, distinct memory dir
  (live-stream guard), **exactly one arm per world**. Bootstrap resampled at the WORLD level, 10,000×, analyzer
  seed pinned. Co-resident agents are REJECTED (pseudo-replication). Retain ≥10 analyzable paired seeds/arm.
- Two-ended satiation adds a **world-class** factor (scarce vs rich feed schedule), each seed-paired; the launcher
  runs FULL + SATURABLE-6 in both classes; the pinned schedules are byte-identical across arms within a class.
- **900 s/agent**, probe every **15 s** (~60), **discard first 120 s (8 probes) as warm-up** (~52 scored).
- **Feasibility batching:** waves of ≤4 concurrent world-sessions (each Paper world ~1–1.5 GB); pairing by seed
  ⇒ temporal batching does not break the pair. Run params byte-identical across all sessions.
- **Per-probe log (per agent):** raw `energy/gut/soma/fatigue` stores; the 3 posteriors; the live energy+fatigue
  **C vector** (leak detector) + phase + task-C (wood/tree leak); `:eat` count; chosen action (pacing); RCON
  `list` presence + cause-of-death; `MotorControl` target_error (aim); food-give timestamps + `inv.food`
  presence; seed, arm, world-class, container, kin, memory dir.

---

## Offline pre-check receipts (reproduced 2026-07-11, `mix run runs/verify_rung1_dynamics.exs`)
`4/4 STRUCTURE VIABLE` under a reserve-following hand policy (proves the BODY is survivable/pace-able before the
live RED tests whether the BRAIN learns it):
- **SURVIVES** the full 800-tick roll (the flat fixed-setpoint died ~50% of live v2 worlds).
- **Interior reserve:** energy mean **0.816**, 80% of post-warmup ticks in [0.6,0.95] (a buffer, NOT pinned full
  like the saturable, NOT drained to the edge).
- **Paces:** eat 93 / mine 233 / rest 374; fatigue variance 7e-4 (> 0 ⇒ cycles, not pinned).
- **Dissociates:** energy↔fatigue corr **0.314** (the clean pair) while energy↔gut 0.99 (honestly correlated —
  both eat-driven; the fatigue tier carries the dissociation claim).
Also green at pre-registration: `mix test test/sp/brain/` 315/0 (byte-identity mad<1e-12 + action-clone + motor
posterior 0.75); `runs/verify_rung1_step1.exs` GREEN.

## Blocking changes to satisfy before T0 (all required; FE items gate on `/lab-team-review`)
- **B1 [FE — needs lab-team sign].** Define proper 6-state `setpoint6` + `saturable6` C vectors + wire the
  ablation lineages (ABL-C-only, ABL-fatigue-π) as gated `drive_shape`/coupling variants. Additive, absent from
  `default/0`, default byte-identical. Typed genome/organ spec + validators (default mad<1e-12; both control arms
  byte-identical to FULL on A/B/D/E/policies; action-clone + action-history invariance).
- **B2 [FE — needs lab-team sign].** The severed-limb twins: per-factor world-coupling-cut variants (factor
  drains + believes + emits C, world limb CUT) as gated lineages.
- **B3 [harness, no FE].** World-level launcher (arms × world-classes × 12 seeds, one arm/world, waves ≤4, pinned
  feed schedules, full per-probe log, leak/`c_ok` check) + analyzer (paired bootstrap; allostasis_index;
  two-ended satiation; dissociation Δ; fatigue_pacing_index; severed-limb KS; VOID detectors; PASS/FALSIFIES
  wired to the pinned numerals). Mirrors `runs/regulation_gate_v2.exs` + `runs/analyze_regulation_v2.py`.
- **B4.** Offline invariant gate GREEN + a live smoke on FULL (embodiment + eats + survives + `c_ok` + no
  compounding) before the N=12 burn.
- **B5.** This registration committed before T0 with a harness-managed continuous collector that survives context
  compaction (lab-side, not in the LLM session).
- **B6 [gate].** `/lab-team-review` MERGED SIGN on B1+B2 FE deltas → owner go-ahead → live-stream guard →
  separate containers/kin/memory dirs.

## Claim fence (binding, verbatim discipline)
Every reserve / felt / viability / fatigue float is a **MODEL VARIABLE, never a felt state**. Survival, `:eat`
counts, store MADs, dissociation, pacing are **necessary-not-sufficient operational substrates with ZERO
evidential weight** for awareness / preference / life. A PASS demonstrates graded self-maintenance + work-rest
pacing + allostatic anticipation **as BEHAVIOUR only**. Wording: *"regulated / ate / paced / died (store reached
0, agent removed)"* — never *"wants / feels hunger / feels tired / chose to rest / is-more-alive."* "The arm gets
tired" = a limb-ATP/soreness proxy, never narrated as felt in any stream overlay. External validity: this tests
the L1-only (strategist-free, phase-0) morphology; a PASS does NOT establish the shape survives in the full
strategist-bearing production lineage — that is a SEPARATE generalization gate.

---

## REVISION 1 — post `/lab-team-review`, MERGED VERDICT = **SIGN-WITH-CHANGES** (2026-07-11, before T0)

The B1/B2 control-arm FE surface (proposal packet `scratchpad/red_fe_packet.md`) was put through the full
5-persona lab-team review. **MERGED VERDICT = SIGN-WITH-CHANGES** (Math-Breaker SIGN-WITH-CHANGES → not REJECT;
Architect, Experimentalist, Embodiment all SIGN-WITH-CHANGES; AIF theorist merged). The core generative-model
claim was signed sound: per-factor Preference C + an η-like `Motor.pi` loop-gain + a generative-**process**
severed-limb cut, **no new EFE term, default byte-identical**. The review corrected real defects in THIS
pre-registration; the corrections below **supersede** the affected pre-review clauses. This is a transparent
pre-T0 amendment (no run has happened), not a post-hoc retune.

### Corrections that change the science (supersede the clauses above)
- **PASS item 4 was BACKWARDS — SPLIT (superseded).** v2 showed the saturable hoarder survives 12/12 while FULL
  *by design* holds a thinner interior reserve (energy mean 0.816), so demanding FULL out-survive the hoarder
  would falsely falsify the cure. Corrected:
  - **(4a)** FULL survival-count CI **excludes SETPOINT-6 only** (the reserve *shape* repairs the flat-setpoint death).
  - **(4b)** FULL is **behaviourally distinguishable from SATURABLE-6** on the two-ended / non-hoard discriminators
    (CI-separated) — **NO survival-beat vs the foil required.** FALSIFIES mirrors: fires on behavioural
    indistinguishability from SATURABLE-6, OR survival-not-improved over SETPOINT-6.
- **Dissociation metric was vacuous — REPLACED (superseded metric 4 + PASS 5).** `Δ = 1−|corr(energy,fatigue)|,
  CI>0` is satisfied by any corr<1. Corrected: **`Δ_dissoc = |corr(energy,gut)| − |corr(energy,fatigue)|`**,
  paired-bootstrap CI excludes 0 **AND** a pinned floor **≥ 0.30** (offline anchors: energy↔gut 0.99,
  energy↔fatigue 0.314 ⇒ Δ_dissoc ≈ 0.68 offline). Now FALSIFIES "renamed bin / dead depth" can actually fire.

### Pinned preference vectors (was prose-only; now registered maps — the `c_ok` leak baseline)
Minimal, magnitude-matched (same `−8.0` floor, same peak `2.5`, same span `10.5`):
- **`:reserve`** (FULL, built) = `[-8.0, -3.0, -1.0, 1.0, 2.5, 2.0]` — surplus 2.0 < sated 2.5 ⇒ argmax **bin 4** (interior).
- **`:saturable6`** (foil) = `[-8.0, -3.0, -1.0, 1.0, 2.0, 2.5]` — surplus 2.5 > sated 2.0 ⇒ argmax **bin 5** (ceiling).
  *This is `:reserve` with bins 4,5 SWAPPED — the single-variable isolation of "interior peak vs ceiling peak" is
  a literal permutation ⇒ magnitude-parity is exact by construction.*
- **`:setpoint6`** (baseline / death shape) = `[-8.0, -1.0, 2.5, 2.5, -1.0, -8.0]` — symmetric interior-center peak
  that **disprefers surplus** (bin5 −8) ⇒ won't hold a high reserve ⇒ thin buffer ⇒ reproduces the flat-setpoint
  death. **Subject to the A6 offline validity gate** (must die in the ~6/12 band, NOT 0/12, NOT 12/12; if it dies
  12/12 it is a too-weak strawman ⇒ retune the CONTROL, never the treatment — new VOID(g′)).
- **soma C fix:** `soma_integrity` routes to `:off` (or monotone-non-decreasing-to-full) — **never** the reserve
  interior-peak (which would prefer slightly-injured over full health). `muscle_fatigue` gets its OWN pinned C
  (strong dispref spent bin0, mild anti-over-rest at fresh ceiling), NOT the reused energy vector.

### De-bundled single-variable arms (supersedes the Arms table's ABL rows)
Every ablation arm flips exactly ONE coupling of {K1 = energy-C shape, K2 = fatigue-C, K3 = fatigue→`Motor.pi`}:
| arm | flips | vs FULL |
|---|---|---|
| SETPOINT-6 | K1 → `:setpoint6` | energy-C only; fatigue/gut/soma C = FULL |
| SATURABLE-6 | K1 → `:saturable6` | energy-C only; fatigue/gut/soma C = FULL |
| ABL-fatigue-C-only | K2 flat | fatigue-C only; `Motor.pi` LIVE |
| ABL-fatigue-π-only | K3 pinned 1.0 | `Motor.pi` only; all C = FULL |
Validator: each arm byte-identical to FULL on A/B/D/E/policies AND on the two couplings NOT under test.

### Added VOID + pinned schedules + severed-limb statistics
- **VOID(g′):** a degenerate `:setpoint6` dying 12/12 instantly ⇒ too-weak strawman ⇒ VOID-and-rerun (mirror of
  the saturable-strawman VOID(g)).
- **c_ok / VOID(a) extended:** checks EVERY arm's live **energy AND fatigue** C against its registered map every
  probe (was energy only).
- **Feed schedules pinned in-doc before T0:** scarce = `give @a cooked_beef 8` every 90 s; rich = `give @a
  cooked_beef 64` every 30 s; byte-identical across arms within a world-class. *(Provisional — confirm reachability
  in the live smoke; these are the pinned pre-T0 values.)*
- **Severed-limb statistics (per factor):** "differs" = two-sample **KS α=0.05** on per-world store/action
  distribution; "indistinguishable ⇒ reject factor" = **TOST equivalence** with an explicit margin + a power floor
  (min N/twin to detect the margin at 0.8 power) — so thin-N failure-to-reject cannot convict a live limb. Cuts:
  energy/gut sever the afferent world→store; **muscle_fatigue runs TWO twins** (afferent action→store cut AND
  efferent belief→`Motor.pi` cut). **soma decorative fence is now a COMPUTED guard:** the analyzer SKIPs any soma
  discriminator/severed-soma KS unless measured MC health-channel variance > 0 in that world.

### FE implementation gated behind this verdict (Groups A–G) — the ship gate
No FE code merges and no live burn until the three follow-on artifacts land with ALL of:
- **B (routing seam):** gated `drive_shape_by_factor: %{}` (default empty ⇒ inherit scalar `drive_shape` ⇒
  byte-identical); `card/1` reads per-factor shape only when the factor is present.
- **D (motor gate):** gated `fatigue_motor_coupling: true` (false ⇒ `agent.ex` injects `motor_pi=1.0`); anchor
  `Motor.pi` consumed only in `MotorControl`, never in `Plan`/`efe.ex`.
- **E (severed):** gated `severed_limbs: []` (default [] ⇒ byte-identical); body-only generative-process cut in
  `Homeostat.step`; never persisted; model A/B/C/D/E byte-identical.
- **A (vectors):** `@setpoint6`/`@saturable6` + fatigue-C + soma-monotone literals in `curriculum.ex`; shape +
  magnitude-parity + fatigue-limit-cycle + soma-monotone property tests.
- **A6 (control validity):** offline null-behaviour pre-check in `verify_rung1_dynamics` — setpoint6 ≈ 6/12 death,
  saturable6 hoards-but-survives — BEFORE T0.
- **G (invariant gate, same PR):** default depth-5 Plan mad<1e-12; cross-arm single-surface byte-identity;
  action-clone + **action-history** invariance; no-scalar-per-action; monotonic decay W→0; no-compounding;
  `slow_defaults` `Map.put_new` back-fill with NO new `Det` draws (preserved RNG order).
- **F/B3/B5:** the RED launcher + harness-managed continuous collector committed lab-side; run links the launcher.

### Persona verdicts (for the record)
- **Math-Breaker** SIGN-WITH-CHANGES — FE surface sound; pin vectors, magnitude-parity, de-bundle, per-factor
  routing, anchor `Motor.pi` out of logits, null-behaviour pre-check, wire `c_ok`.
- **Systems Architect** SIGN-WITH-CHANGES — unbuildable as written; add the 3 gated no-op-default fields +
  back-fill + ship the invariant gate in-PR.
- **RED Experimentalist** SIGN-WITH-CHANGES — single-variable arms, PASS-4 split, dissociation reformulation,
  severed KS+TOST, pinned feed schedules, land B3/B5.
- **Embodiment Designer** SIGN-WITH-CHANGES — genuine non-saturable need + closed loop; fix wrong-signed soma C,
  give fatigue its own C, pin the severed cut per-limb, computed decorative-soma guard.

*Ship gate NOT cleared: the corrected typed spec + this corrected RED + the ship-gate checklist must land with
Groups A–G before any FE code merges, and the live burn additionally needs owner go-ahead + the live-stream guard.*

---
*Pre-registered by the brain/body agent 2026-07-11 (before T0); amended once the same day per the lab-team
MERGED VERDICT (SIGN-WITH-CHANGES). Run verdict to be recorded in this same doc beside the registration, per Lab
Protocol VIII.*
