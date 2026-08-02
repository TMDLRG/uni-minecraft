# Metabolism regulation gate — PRE-REGISTRATION (2026-07-11, before T0)

**Registered BEFORE any run** (Lab Protocol: pre-register PASS + FALSIFIES + numerals before T0; no post-hoc
retuning). Adversarially designed + hardened by the 5-persona pre-registration panel (workflow
`wf_deef92cb-8b9`: experimentalist + math-breaker + embodiment + merge). The verdict will be recorded beside
this registration.

## Question (one line)
Does the setpoint-**PEAKED** energy/satiety drive-C regulate the raw metabolic store **tighter around the "ok"
setpoint** than a still-eating, no-peak **monotone-appetite** control — measured as paired MAD on the
ground-truth store across ≥6 independent seeded worlds, one arm per world?

This tests the one property that distinguishes a real interoceptive drive from a reward-hack: **non-saturable
setpoint regulation** (spec §4.1 F8). The activation gate already proved the organ is LIVE + the edge real;
this asks whether the setpoint SHAPE does regulatory work.

## Arms (GENOME-LEVEL — the C shape is a genome property emitted at EVERY curriculum phase, not a launcher one-shot)
- **ARM T (treatment):** setpoint-peaked energy & satiety C = `%{0=>-8.0, 1=>-2.0, 2=>3.0, 3=>0.0}`
  (the live shape, `curriculum.ex:33-34`; reachability receipted — `metabolism_activation_gate_LIVE.md`).
- **ARM C (control — the endorsed harder foil):** flattened/**saturable** monotone "more-is-better" energy &
  satiety C = `%{0=>-8.0, 1=>-2.0, 2=>2.0, 3=>4.0}`. Bin-0 stays steeply dispreferred so it STILL eats and
  stays alive, but there is **no homeostatic peak** — reward keeps rising toward "full". Isolates the setpoint
  PEAK, not "all reason to eat."
- **ARM Z (optional sanity, EXCLUDED from PASS):** fully drive-severed C = all-zero. Death is
  construction-forced (C=0 + novelty_gain=0 + `:eat` habit-excluded ⇒ never eats by wiring) → labelled
  construction-forced, excluded from the CI/PASS discriminator.

A/B/D/E/policies/precision **identical** across T and C; ONLY the energy+satiety C vector differs. Honest
scope: this swaps the whole interoceptive drive SHAPE (peak→monotone), not "C-only"; satiety→C attenuation
stays partly live in ARM C (`metabolism.ex:79` no-ops only on non-positive C; ARM C's bin2/3 are positive) —
no smuggled advantage.

## Primary metric (SINGLE)
Per agent, over probed ticks after warm-up: **MAD = mean( |st.energy − 0.625| )**, where `st.energy ∈ [0,1]`
is the **RAW Metabolism store** (NOT the `ebin` posterior belief), and 0.625 is the center of setpoint bin 2
(`[0.5,0.75)`, `metabolism.ex:34-35`). Co-resident agents collapse to ONE world-level datum (mean of MADs).
Per matched seed: **D = MAD(ARM C) − MAD(ARM T)**; D>0 ⇒ treatment regulates tighter.
Secondary/tertiary (descriptive only, NOT the gate): time-in-band (raw st.energy > 0.25) and survival fraction.

## PASS — pinned NOW, no post-hoc retuning. PASS requires ALL of:
1. **median-over-seeds D ≥ 0.10** store-energy units.
2. **paired 95% bootstrap CI of mean D excludes 0** (lower bound > 0); 10,000 resamples, **WORLD/seed as the
   resampled unit**, **N ≥ 6** paired seeds.
3. **SANITY FLOOR** (uncontested, no CI): treatment survival fraction ≥ control survival fraction.
4. **ATTRIBUTION GREEN:** per-arm `:eat` count logged; ARM C mean `:eat` count strictly > 0 (it genuinely
   eats — else VOID, not FAIL); treatment tightness not achieved by never-eating.

**Locked constants:** setpoint center 0.625, band threshold 0.25, effect size 0.10, N≥6, 900s run / 15s probe
/ 120s warm-up / 45s food.

## FALSIFIES (setpoint-peaked C does NO regulatory work; strike the framing)
Paired 95% CI of mean D **includes 0**, OR **median D < 0.10** — the still-eating monotone control regulates
within 0.10 of (or tighter than) the setpoint treatment ⇒ a saturable/reflex appetite suffices, the peak adds
nothing.

## VOID-AND-RERUN (not PASS, not FALSIFY)
(a) any arm's live energy/satiety C deviates from its registered map at any probe (phase-advance C-restoration
leak fired, `mc.ex:487`); OR (b) ARM C mean `:eat` ~0 (degenerated to the vacuous drive-severed case); OR (c)
the offline invariant gate is not green before deploy.

## Replication unit
One **independent mc-server WORLD/SESSION** = separate container, distinct kin, distinct memory dir
(CLAUDE.md live-stream guard), **exactly ONE arm per world**. **N≥6 distinct world-seeds per arm, PAIRED by
seed.** Bootstrap resampled at the WORLD level. N-agents-in-one-world is REJECTED (Phase-2 §16
pseudo-replication: shared terrain + synchronous cross-arm `give @a` broadcast). Co-resident agents collapse
to one world datum; **both arms NEVER share a world.**

## Run parameters
- 900 s (15 min)/agent — ≥3 full drain periods (upkeep 0.04/tick @ `@nominal_tick_sec=8s`, ~200 s
  noop-drain-to-empty). Probe every 15 s (~60); **discard first 120 s (8 probes) as warm-up** ⇒ ~52 scored.
- Food: `give @a cooked_beef 64` every 45 s, IDENTICAL schedule both arms, per-world, feed timestamps logged.
- Each probe records per agent: RAW `st.energy` + `st.satiety` (authoritative); the live energy+satiety **C
  vector** (leak detector); `:eat` selection count; RCON `list` presence (survival) + cause-of-death.
- Fresh minds + a kin group unused by any lineage (NOT the exploratory activation-gate run). Factor indices
  resolved **BY NAME** via `Genome.active_modalities/1` (as `MC.satiety_attenuate`, `mc.ex:281-283`) — never
  a hardcoded `Enum.at(-2)`. `novelty_gain=0` in ALL arms (the state-epistemic term `efe.ex:97` is NOT gated
  and remains live in every arm — pre-registered as why the control is not a strawman).

## Blocking changes to satisfy before T0 (all required)
1. **Close the phase-advance C-restoration leak** — genome-level `:drive_shape` field (energy/satiety C emitted
   at EVERY phase) AND/OR pin phase. Launcher one-shot is NOT genome-equivalent.
2. **World-level replication** (≥6 seeds/arm, one arm per world, bootstrap at world level).
3. **Control = saturable map** `{0=>-8,1=>-2,2=>2,3=>4}` (still eats), not fully-zeroed.
4. **Metric = MAD of raw store from 0.625** (not ebin, not survival/time-in-band).
5. **Factor indices BY NAME** (`Genome.active_modalities/1`).
6. **Offline invariant gate GREEN before deploy:** T/C byte-identical on A/B/D/E/policies (only energy+satiety
   C differ), action_clone A1/A2/A3 pass, novelty_gain=0 all arms, AND a multi-tick offline roll shows each
   arm's energy+satiety C stays at its registered map THROUGH a forced phase advance (proves #1).
7. **Instrumentation/attribution** (eat counts, cause-of-death, live C vector each probe; VOID if ARM C mean
   eat ~0 or C deviates).
8. **This registration committed before T0** with a harness-managed continuous collector.

## Claim fence (verbatim, binding)
The store-energy MAD is a model-variable regulation measure, **never felt hunger/comfort/experience**; a PASS
demonstrates setpoint-regulation BEHAVIOUR only. G4 allostasis stays an independent FAIL
(`g4_allostasis_horizon_limited.md`) and is NOT folded into this gate.

---
## VERDICT (recorded 2026-07-11, after the run) — **FALSIFIES** (confirmed by adversarial verification, not overturned)

**Run (T0 2026-07-11):** 6 setpoint (ARM T) + 6 saturable (ARM C) sessions, **one arm per world**, across 6
distinct-seed Paper 1.16.5 worlds (`mc-gate-1..6`, seeds 1..6), fresh minds, kin 77, 900 s / 15 s probe /
120 s warm-up (53 scored ticks/agent), food `give @a cooked_beef 64` every 45 s **identical both arms**. All
12 sessions embodied (RCON-confirmed exactly one UNI per world), all `c_ok=true` (no C-restoration leak),
ARM C mean `:eat` = 257.2 (attribution green) ⇒ **NOT VOID**. Raw RESULT lines: `metabolism_regulation_gate_results.txt`.
Launcher `runs/regulation_gate.exs`, analyzer `runs/analyze_regulation.py` (`random.seed(20260711)`).

**Data (primary metric = MAD of raw store energy from setpoint 0.625):**

| seed/world | MAD(T setpoint) | surv T | eat T | MAD(C saturable) | surv C | eat C | D = C−T |
|---|---|---|---|---|---|---|---|
| 1 | 0.1663 | alive | 49 | 0.2728 | alive | 174 | +0.1065 |
| 2 | 0.1467 | alive | 44 | 0.3019 | alive | 358 | +0.1552 |
| 3 | 0.1845 | alive | 32 | 0.2578 | alive | 183 | +0.0733 |
| 4 | 0.2688 | **died** | – | 0.3422 | alive | 368 | +0.0734 |
| 5 | 0.2303 | alive | 44 | 0.2800 | alive | 237 | +0.0497 |
| 6 | 0.2454 | **died** | – | 0.2864 | alive | 223 | +0.0410 |

- **median D = +0.0733** < locked **+0.10** ⇒ **condition 1 FAILS** (the pre-registered FALSIFIES trigger fires verbatim).
- mean-D 95 % bootstrap CI = **[+0.0562, +0.1144]** excludes 0 ⇒ condition 2 passes (the direction is real).
- **survival floor T = 0.67 < C = 1.00** ⇒ **condition 3 FAILS** (independent second failure).
- attribution ARM C mean eat = 257.2 > 0 ⇒ condition 4 passes.

### VERDICT = **FALSIFIES** — over-determined on two independent locked conditions (median D < 0.10 **AND** survival floor T < C).

Confirmed by a 4-lens adversarial verification (workflow `wf_66947cb9-c31`, 5 agents, **unanimous
high-confidence, not overturned**): the arithmetic is exact (independent recompute); the negative is **NOT a
false-negative artifact** — the magnitude shortfall holds even among the 4 non-death worlds (survivor-only
median **+0.090 < 0.10**), and the 2 treatment deaths (seeds 4, 6) are **terminal self-drains to store = 0
under the arm's own policy** while world-food was available (the ARM-C agent ate 223–368× and survived on the
very same seeds), NOT a provisioning VOID; the rescue lens found **no honest reading that yields PASS**.

**Honest reading (behaviour-only, claim-fenced):** the setpoint-**PEAKED** drive-C does a **real but
sub-committed** amount of store-regulation work — it held the raw store closer to 0.625 in **6/6** worlds
while eating **~7× less** (32–49 vs 174–368 feeds) — but the effect (~0.073–0.083 store-units) falls **below**
the +0.10 magnitude bar committed before T0, so the strong claim *"the peak does large regulatory work"* is
**struck**. A **second, largely-independent** finding: the tighter-regulating lean eater carries a **viability
cost** — it persisted in 4/6 worlds vs the over-eater's 6/6 — i.e. in this world the buffer-hoarding monotone
appetite is operationally more survivable. Entanglement noted (the same 2 deaths also depress D on seeds 4, 6
via right-censoring), though the magnitude failure stands alone. **Mechanism of the two deaths (adaptive
thin-buffer vs degenerate forage-cessation/stuck-state) is UNDETERMINED from these receipts and is not asserted.**

**Claim fence (binding):** store-MAD, feed counts, and in-world persistence are necessary-not-sufficient
operational substrates with **ZERO** evidential weight for awareness / preference / life. Wording: *"regulated
the store / ate / died (store reached 0, agent removed)"* — never *"wants / prefers / feels hunger / chose to
fast / is-or-less alive."* "Viability"/"survival" read as operational in-world bot persistence only. This
FALSIFIES is **not** a pass, **not** a PARTIAL, **not** a rescue — it is logged as evidence. Scope honesty: the
arms swap the whole interoceptive drive **SHAPE** (peak vs monotone), not a C-only isolate (satiety→C
attenuation stays partly live in ARM C), so the finding is the peaked-vs-monotone contrast.

**Go-live implication:** this gate does **NOT clear**, so the standing *"go full live on a cleared gate"* is
**NOT** triggered by this run — nothing here authorizes deploying the peaked drive-C lineage to the
public-streamed colony. The separately-recorded metabolism **activation** gate (organ live + death edge real,
pos/neg/neg/pos) remains PASSED in production (`metabolism_activation_gate_LIVE.md`); that is the cleared
receipt — this regulation gate is a **falsified** one.

**Carry-forward (evidence, not clearance):** (a) the small-but-consistent directional effect + the
viability-cost finding are real inputs for the next design — they indicate the setpoint peak needs either a
wider preferred band, an allostatic buffer margin, or the epistemic/foraging layer to close the survival gap
**before** the SHAPE can do ≥0.10 units of work; (b) fix the `regulation_gate.exs` live-nil→0.0 coercion (drop
a transient live-nil read rather than score store = 0; arm-symmetric, did **not** change this verdict) before
any re-run; (c) N = 6 is thin — a re-run would widen N and resolve the death mechanism.
