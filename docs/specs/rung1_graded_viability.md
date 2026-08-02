# Rung-1 typed spec — graded per-subsystem viability + work/fatigue (cures 1+2+3)

> **The first buildable rung** of `generative_model_depth.md` (owner chose the deepest first rung). Design +
> offline only; the live paired RED needs owner go-ahead (live-stream guard). One opt-in organ `:homeostat`
> (absent from `default/0` ⇒ byte-identical). Motivated by the measured death: `metabolism_regulation_gate_v2.md`
> (FALSIFIES — the flat fixed-setpoint dies 6/12, no reserve). STEP 0 blocker (motor_config by name) = DONE (`1c49e62`).

## StateSpace — the graded viability factors (all L1, mean-field, per-factor A/B/C/D)
Owner gradient, **ns = no = 6**: `{0 critical · 1 depleted · 2 tired · 3 nominal · 4 sated · 5 surplus}`.
`init_a: :diagonal` (self-sensing — breaks the no==ns uniform-A degeneracy). All under the `:homeostat` organ.

| factor | subsystem | B (transition) | body store | world coupling |
|---|---|---|---|---|
| `energy_reserve` | organism ATP | `:emptying` (drain) / `:filling` on `:eat` | `energy` | eat refill, upkeep+work drain |
| `gut_satiety` | gut buffer | `:filling` on `:eat`, `:emptying` via gut→energy transfer | `gut` | food in, digestion out |
| `soma_integrity` | health | `:emptying` on damage / slow `:filling` | `soma` (MC health) | **gated on measured health-channel variance** |
| `muscle_fatigue` | per-limb (arm first) | `:fatiguing` (work→spent, rest→recover, two-signed action-partitioned) | `arm_fatigue` | mine/attack accrue; `→ Motor.pi` |

`pb_seed ≈ 50` on each B (durable point-estimate; W_b→0 *faster*, not a term that erases). Semantics of
`muscle_fatigue` bins run the SAME gradient but read as fresh(5)…spent(0) (surplus=fresh, critical=spent).

## PreferenceModel — interior-peak reserve-holding C (the fix)
`drive_c(:reserve, 6) = [-8.0, -3.0, -1.0, +1.0, +2.5, +2.0]` — keyed by the heritable `drive_shape` gene
(default `:setpoint` ⇒ byte-identical; `:reserve` is opt-in). Positive gradient nominal→sated (refill pressure
returns the instant belief slips below sated) with **surplus(+2.0) < sated(+2.5)** ⇒ argmax at an INTERIOR
buffer bin, never the ceiling: bounded, non-hoarding, non-saturable-at-the-edge. `muscle_fatigue` C prefers
fresh/nominal (a rest pull), same interior-peak discipline. **NOT** a monotone ramp (that IS the saturable foil
= reward-smuggling) and **NOT** the flat setpoint (that is the death). Anticipation is FREE from the existing
depth-5 Plan rollout applying the emptying-B forward under this C — no new EFE term.

## Coupling / seams (each named; organ-gated, never the default path)
- **C routing:** replace the hardcoded `[:energy,:satiety]` dispatch in `genome.ex card/1` with a
  name→shape map so each homeostat factor gets its interior-peak/`:reserve` C; every other modality keeps
  curriculum C. Default genome has no homeostat factors ⇒ identical `Designer.compile`.
- **Body stores + attribution:** `metabolism.ex` gains per-subsystem stores advanced by wall-clock `dt` with
  **acted-subsystem attribution** (mine/attack→arm fatigue+arm-ATP; move→legs; `@upkeep` on core every tick
  incl. `:noop`). `gut→energy` digestion transfer each tick. All in the BODY store → `felt_*` observation →
  belief; **never a policy logit** (no scalar-per-action).
- **Fatigue→motor:** `muscle_fatigue` belief lowers `Motor.pi` loop-gain (fresh 1.0 → spent ~0.35) → weaker
  servo → degraded aim reafference. `:motor_cortex`-gated (mining consequence); honest scope (leg fatigue is
  cost+C only until a locomotion servo exists).
- **Timescales:** fatigue on a faster clock (~3 s) than energy (~8 s) — the first per-factor timescale split.

## PrecisionSchedule
No affect→precision in rung-1 (that is cure-4). γ/γ_m stay as-is. (Keeps rung-1 attributable: viability +
fatigue only.)

## Invariant anchors (each a REJECT-on-fail property test, run BEFORE any live deploy)
1. **Byte-identity:** `default/0` depth-5 Plan `mad < 1e-12` vs the frozen golden; AND per-seam over every
   touched non-default lineage (`:metabolism`, `:motor_cortex`, `:sight_cortex`, WS-B slow_context).
   Gate every step-path edit on `:homeostat in active_organs`, **not** `l2==nil`.
2. **Action-clone-invariance** (extended): clone a drive-action's full B stack; identical depth-5 Plan values.
   **NEW action-history-invariance:** permuting realised action history at fixed beliefs must leave every C /
   demand estimate unchanged (any demand estimate is a fn of a hidden-state posterior only — no action-tally→C).
3. **No scalar-per-action:** every cost enters via that action's own B column → felt obs → belief.
4. **Monotonic decay:** info terms use the floored `wnorm` kernel ⇒ W→0 as counts→∞, C- and state-independent.
5. **No compounding:** transient γ/lr re-based each tick, stores→beliefs round-trip clean, C restored on persist.
6. **Do NOT** lift `@factor_cap` globally, re-derive `@l2_period`, or use the positional motor index (fixed).

## Paired RED (pre-registered; per-mechanism ablation so a bundled win stays attributable)
- **Arms (one cure-bundle, but ablation-decomposed):** FULL (reserve C + per-subsystem + fatigue) vs the
  `:setpoint` baseline vs the `:saturable` foil; PLUS mechanism-ablation arms — C-only (reserve, no fatigue),
  fatigue-inefficiency-only, fatigue-pi-only — so any survival/pacing delta is attributable to a NAMED coupling.
- **PASS (all):** (a) N≥12 survival **≥ 11/12** (vs measured 6/12); (b) `allostasis_index` (believed reserve at
  eat-onset, `:reserve`−`:setpoint`) CI-excludes-0 positive; (c) **two-ended satiation** — fights harder near
  critical in a scarce world AND stops eating / does not hoard in a rich world; (d) beats BOTH `:setpoint` and
  `:saturable`, survival-count CI excluding each; (e) **cross-subsystem dissociation Δ** CI-excludes-0 (energy
  and gut beliefs measurably decouple — the 2nd factor is not renaming bins); (f) `fatigue_pacing_index` =
  corr(believed fatigue, P(non-arm action | just-mined)) > 0 for FULL, ≈ 0 for pi-ablated, AND MotorControl
  target_error rises with fatigue within a bout, falls after rest.
- **Per-subsystem SEVERED-LIMB falsifier (each factor independently):** a twin whose factor drains + forms
  beliefs + emits C but whose world-coupling is CUT must, on the LIVE world, differ (KS/CI) from intact; if
  indistinguishable it is a preference-hack with no world limb ⇒ reject/rewire THAT factor. Per-limb F4: an
  all-`:noop` twin must RECOVER while an actor ACCRUES (else fatigue-B advances with no action-consequence).
- **FALSIFIES / REJECT if:** survival not improved; OR indistinguishable from `:saturable` (just "eat more");
  OR rests/hoards into starvation (over-brake); OR dissociation Δ includes 0 (dead depth — collapse to Cure 1);
  OR any invariant anchor trips (regardless of survival).

## ClaimFence
Every reserve/felt/viability/fatigue float is a MODEL VARIABLE, never a felt state. Passing demonstrates graded
self-maintenance / work-rest pacing as BEHAVIOUR only — necessary-not-sufficient, ZERO weight for
awareness/life. "The arm gets tired" = a limb-ATP/soreness proxy, never narrated as felt in any stream overlay.

## Build order (each step: implement → offline byte-identity + suite green → commit)
0. ✅ motor_config by name (`1c49e62`).
1. `:homeostat` organ + graded `energy_reserve` factor (6-state) + `drive_c(:reserve)` + name→shape C routing.
2. Body: graded `energy` store + acted-subsystem attribution; wire `energy_reserve` felt obs.
3. Per-subsystem: `gut_satiety` + `soma_integrity` + gut→energy transfer.
4. `muscle_fatigue` factor + arm attribution + `→ Motor.pi`.
5. Paired RED launcher + analyzer (ablation arms, allostasis/dissociation/pacing indices, severed-limb twins).
6. Offline invariant gate GREEN + two-ended/dissociation offline pre-checks → `/lab-team-review` sign → owner
   go-ahead → live RED.

---

## REVISION 1 — control-arm FE surface (lab-team MERGED VERDICT = SIGN-WITH-CHANGES, 2026-07-11)
The RED control/foil/ablation/severed arms were reviewed by the full 5-persona lab team and signed
SIGN-WITH-CHANGES. This section is the **typed model spec + validators** follow-on artifact; the paired RED
design is `docs/receipts/rung1_graded_viability_RED.md` (REVISION 1). All BUILT + suite-green (334/0).

### PreferenceModel — pinned control shapes (`lib/sp/brain/curriculum.ex`, magnitude-matched to `:reserve`)
| shape | vector | argmax | role |
|---|---|---|---|
| `:reserve` (built) | `[-8.0,-3.0,-1.0,1.0,2.5,2.0]` | bin 4 (interior) | FULL energy/gut treatment |
| `:saturable6` | `[-8.0,-3.0,-1.0,1.0,2.0,2.5]` | bin 5 (ceiling) | eat-to-full foil (= `:reserve` w/ bins 4,5 swapped ⇒ exact magnitude parity) |
| `:setpoint6` | `[-8.0,-1.0,2.5,2.5,-1.0,-8.0]` | bins 2,3 (symmetric) | death-shape baseline (disprefers surplus ⇒ thin buffer) |
| `:fatigue_reserve` | `[-8.0,-3.0,-1.0,1.0,2.5,2.0]` | bin 4 | muscle_fatigue own rest-pull (interior peak) |
| `:soma_monotone` | `[-8.0,-4.0,-2.0,0.0,1.0,2.0]` | bin 5 | soma monotone-to-full (fixes the wrong-signed interior-peak) |

All share floor `-8.0`, peak `2.5`, span `10.5` (shape-only; no smuggled precision). FULL (`homeostat_l1_phase0`)
routes soma→`:soma_monotone`, fatigue→`:fatigue_reserve` via `drive_shape_by_factor`; energy_reserve + gut inherit
the scalar `:reserve`.

### Gated fields (all additive, no-op default ⇒ default genome byte-identical; back-filled via `slow_defaults`)
- **`drive_shape_by_factor: %{}`** — name→shape map overriding the scalar `drive_shape` per homeostat factor.
  Read in `card/1`'s drive-C branch only. Empty ⇒ inherit ⇒ byte-identical. The per-factor C routing seam.
- **`fatigue_motor_coupling: true`** — false ⇒ `agent.ex` pins `motor_pi = 1.0` (K3 ablation / fatigue-efferent
  severed twin). Read only on the homeostatic step path.
- **`severed_limbs: []`** — factors whose afferent world→store coupling is cut in `Homeostat.step/5` (a
  generative-PROCESS edit; the compiled model A/B/C/D/E is byte-identical to the intact twin).

### RED arm builders (`lib/sp/brain/genome.ex`; each flips EXACTLY ONE coupling vs FULL — Lab-Protocol-I)
`homeostat_setpoint6` (K1) · `homeostat_saturable6` (K1 foil) · `homeostat_abl_fatigue_c` (K2, fatigue C→`:off`)
· `homeostat_abl_fatigue_pi` (K3, pin Motor.pi) · `homeostat_severed(limb)` (afferent cut; `:muscle_fatigue_efferent`
= efferent cut).

### ValidationAnchors (same-PR invariant gate — `test/sp/brain/rung1_red_arms_test.exs`, 19/19 + suite 334/0)
1. Default depth-5 Plan `mad < 1e-12` (existing `decider_byte_identity`, unchanged).
2. **Cross-arm single-surface byte-identity:** each RED arm's compiled A/B/D identical to FULL; C differs in
   EXACTLY the named factor (SETPOINT-6/SATURABLE-6 → energy_reserve only; ABL-fatigue-C → muscle_fatigue only;
   ABL-fatigue-π + severed → C identical to FULL).
3. **Shape + magnitude parity:** setpoint6 symmetric/interior-argmax; saturable6 monotone/ceiling-argmax;
   soma_monotone monotone-to-full; all share floor/peak/span.
4. **`motor_pi` out of policy logits:** `MCCodec.encode` invariant to `motor_pi` in senses (no `:motor_pi`
   modality ⇒ never scored ⇒ no scalar-per-action).
5. **Severed-limb generative-process:** `Homeostat.step/5` with `[]` byte-identical to `step/4`; a real
   afferent world-cut when set.
6. **Back-fill / RNG order:** the 3 fields via `Map.put_new` in `slow_defaults`; NO new `Det` draws in
   `mutate`/`recombine` (existing lineages' draw order preserved).
7. **A6 offline control-validity** (`runs/verify_rung1_controls.exs`, 3/3): setpoint6 death-prone, saturable6
   hoards-deepest, reserve interior between — controls VALID before the live burn.

### Ship-gate checklist (ship-gate follow-on artifact — ALL green before owner go-ahead + live burn)
- [x] `/lab-team-review` MERGED VERDICT = SIGN-WITH-CHANGES (recorded in the RED doc REVISION 1).
- [x] Typed spec + validators (this section).
- [x] Paired RED design updated (RED doc REVISION 1: de-bundled arms, PASS-4a/4b split, Δ_dissoc floor,
      severed KS+TOST, pinned feed schedules, VOID(g′)).
- [x] Same-PR invariant gate green: `mix test test/sp/brain/` **334/0**; new arms test **19/19**.
- [x] Default byte-identity `mad<1e-12` + action-clone + motor posterior 0.75 intact.
- [x] A6 control-validity **3/3**; `verify_rung1_step1` **5/5**; `verify_rung1_dynamics` **4/4**.
- [x] Launcher `runs/rung1_red.exs` (parse-clean) + analyzer `runs/analyze_rung1_red.py` (runs) committed.
- [ ] **Owner go-ahead + live-stream guard** (separate container / distinct kin 60 / distinct memory dir) — PENDING.
- [ ] Live smoke on FULL (embodiment + eats + survives + `c_ok` + no-compounding) before the N=12 burn — PENDING.
- [ ] Lab-side harness-managed continuous collector committed with the run — PENDING (lab box).

*The FE surface is BUILT + signed + offline-green. The remaining unchecked items are the LIVE prerequisites,
which require owner go-ahead per the live-stream guard.*
