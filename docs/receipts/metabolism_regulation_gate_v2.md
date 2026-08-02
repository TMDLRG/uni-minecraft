# Metabolism regulation gate v2 — PRE-REGISTRATION (before T0)

**Registered BEFORE any run** (Lab Protocol: pre-register PASS + FALSIFIES + numerals before T0; no post-hoc
retuning). Adversarially designed and hardened by the 3-lens pre-registration panel (experimentalist +
math-breaker + embodiment) and merged by `/lab-team-review`. **MERGED VERDICT = SIGN-WITH-CHANGES** (all three
lenses SIGN-WITH-CHANGES; unanimous on isolation A-with-caveats, N=12, and keeping the 0.10 bar). The run
verdict will be recorded beside this registration.

**Path taken = PREFERRED (not the fallback).** The B3 satiety-attenuation was **relocated** to the main step
path (L2-independent), not held symmetric-OFF — so the saturable foil keeps its appetite brake. The
degenerate-foil VOID guard (g) is retained as a defensive check but is not the primary control.

**Why v2.** v1 (`metabolism_regulation_gate.md`) recorded a **FALSIFIES** verdict, over-determined on two locked
conditions: median D = +0.073 < 0.10 **and** survival floor T=0.67 < C=1.00. The adversarial verification found
the negative was **not** a false-negative artifact, BUT v1 confounded the contrast: both arms carried a
forage-C (the strategist's `:forage` C-override **and** the phase-1 wood/tree curriculum C), and N=6 was thin
with 2 treatment worlds right-censored by self-drain deaths. v2 removes the forage-C confound at its source,
resolves a latent control-weakening coupling, and widens N — while keeping every v1 magnitude bar.

## Question (one line)
With the forage-C confound removed (strategist dropped, phase pinned to 0) and the saturable foil's satiety
brake held symmetric, does the setpoint-**PEAKED** energy/satiety drive-C regulate the raw metabolic store
**tighter around the "ok" setpoint (0.625)** than a still-eating, no-peak **monotone-appetite** control —
measured as paired MAD on the ground-truth store across N=12 independent seeded worlds, one arm per world?

This tests the one property that distinguishes a real interoceptive drive from a reward-hack: **non-saturable
setpoint regulation** (spec §4.1 F8). The activation gate already proved the organ is LIVE and the death edge
real (`metabolism_activation_gate_LIVE.md`, PASSED in production); this asks whether the setpoint SHAPE does
≥0.10 units of regulatory work once the acquisition-drive confound is gone.

## Isolation (chosen: **A-with-caveats** — applied IDENTICALLY to BOTH arms)
Option A (drop `:strategist` from a metabolism lineage) is the merged isolation: lowest-CODE-risk, uses the
existing pure-L1 path (`context=nil`, `l2=nil`, mc.ex:63-66), leaves `default/0` byte-identical, and removes the
strategist `:forage` C-override at its source. Option B (neutralize forage-C, keep the strategist) is REJECTED
as primary — more new FE surface, keeps the L2 modulate/demodulate leak surface, needs a bigger owner gate, and
still needs the phase-0 pin. Option C (wider band / allostatic buffer) is REJECTED — it changes the SHAPE under
test. Plain-A is **not** single-variable for two code-verified reasons, hence "with caveats"; both are closed as
blocking changes and applied **identically to both arms** so they never confound the T-vs-C contrast:

1. **Phase-0 pin (both arms).** A fed/healthy phase-0 agent AUTO-ADVANCES to phase 1 (`maybe_advance_phase`,
   mc.ex:219-221; `phase_goal_met?(0,s)` = health≥18 & food≥12, mc.ex:223), re-importing the phase-1 wood/tree
   curriculum C (`vision:{2=>4.0}`, `inventory:{1=>8.0}`, curriculum.ex:37). Phase 0 (curriculum.ex:36) carries
   no inventory/vision C. Both arms are pinned to phase 0 for the entire scored window via a **gated `max_phase`
   cap** (default `nil` ⇒ no cap ⇒ default genome byte-identical). The energy/satiety drive_shape C is
   phase-independent (`drive_c`, curriculum.ex:57-58) and emitted at every phase, so pinning does **not** touch
   the variable under test.
2. **B3 satiety-attenuation held symmetric (both arms).** B3 satiety→C attenuation (`satiety_attenuate`) is
   called from EXACTLY ONE site — inside `modulate` (mc.ex:269) — which runs ONLY when `l2`/strategist exists
   (mc.ex:85, l2 built at mc.ex:63). Dropping the strategist therefore silently strips the saturable foil's
   ONLY appetite brake from BOTH arms; left unhandled this inflates MAD(C) and buys an unearned D by weakening
   the control (forbidden). **PREFERRED:** relocate/restore B3 onto the main step path — applied once,
   L2-independently, IDENTICALLY in both arms, gated to `:metabolism` genomes, byte-identical no-op for
   non-metabolism genomes. **FALLBACK (only if relocation is owner-rejected):** keep `satiety_attenuate`
   symmetric-OFF in both arms + add the degenerate-foil VOID guard (below).

Also identical across both arms: `novelty_gain = 0` (the state-epistemic term `efe.ex:97` is C-independent and
stays live in both arms — pre-registered as why the control is not a strawman; the novelty term `efe.ex:98` is
gated OFF in both); food provisioned by rcon straight to inventory (eating is movement-free, no forage/move
needed). **The ONLY difference between arms is the energy+satiety drive_shape C vector.**

## Arms (GENOME-LEVEL — the C shape is a genome `drive_shape` property emitted at EVERY curriculum phase)
- **ARM T (treatment / setpoint):** setpoint-PEAKED energy & satiety C = `%{0=>-8.0, 1=>-2.0, 2=>3.0, 3=>0.0}`
  (`@energy_setpoint`/`@satiety_setpoint`, curriculum.ex:33-34; `drive_c(:setpoint, _)`, curriculum.ex:57).
  Peak at bin 2 ("ok"/"sated", store center 0.625), FLAT (0.0) at bin 3 ("full") — no over-fill gradient
  (non-saturable in the homeostatic sense, F8). Bin 0 steeply dispreferred (−8) so it STILL eats.
- **ARM C (control / saturable foil):** monotone "more-is-better" energy & satiety C =
  `%{0=>-8.0, 1=>-2.0, 2=>2.0, 3=>4.0}` (`@saturable_drive`, curriculum.ex:50; `drive_c(:saturable, _)`,
  curriculum.ex:58). Bin 0 stays steeply dispreferred (−8) so it STILL eats and stays alive, but reward keeps
  RISING toward "full" (bin 3 = +4) — NO homeostatic peak. Isolates the setpoint PEAK, not "all reason to eat."

A/B/D/E/policies/precision **byte-identical** across T and C; ONLY the energy+satiety C vector differs. Honest
scope: this swaps the whole interoceptive drive SHAPE (peak→monotone), not "C-only." The `:strategist` prereq
is `[:interoception]` only (genome.ex), NOT `:strategy`, so dropping the strategist does not break the
metabolism organ or its energy/satiety factors.

## Primary metric (SINGLE — UNCHANGED from v1)
Per agent, over probed ticks after warm-up: **MAD = mean( |st.energy − 0.625| )**, where `st.energy ∈ [0,1]`
is the **RAW Metabolism store** (NOT the `ebin` posterior belief), and 0.625 is the center of setpoint bin 2
(`[0.5,0.75)`, metabolism.ex:34-35). Co-resident agents collapse to ONE world-level datum (mean of per-agent
MADs). Per matched seed: **D = MAD(ARM C saturable) − MAD(ARM T setpoint)**; D>0 ⇒ treatment regulates tighter.
Secondary/tertiary (descriptive only, NOT the gate): time-in-band (raw `st.energy` > 0.25) and survival
fraction.

**Mandatory reporting guard (claim guard, moves no bar):** report per arm the **bias/dispersion decomposition**
of MAD — bias = `|mean(energy) − 0.625|`, dispersion = `mean|energy − mean(energy)|`. The verdict MUST attribute
any ≥0.10 pass to **target-bias** (F8 sub-maximal-target geometry: ARM T peak-bin center 0.625 vs ARM C peak-bin
center 0.875 are 0.25 store-units apart) vs **variance-tightness** — never overclaim "tighter regulation" if the
pass is bias-carried.

## PASS — named gate **"SETPOINT-REGULATES"**, pinned NOW, no post-hoc retuning. PASS requires ALL of:
1. **median-over-seeds D ≥ 0.10** store-energy units. *[UNCHANGED from v1]*
2. **paired 95% bootstrap CI of mean D excludes 0** (lower bound > 0); 10,000 resamples, **WORLD/seed as the
   resampled unit**, **N = 12** paired seeds. *[N raised from ≥6 to 12 FIXED — the only bar-adjacent change;
   tightens power, loosens no threshold.]*
3. **SANITY FLOOR** (uncontested, no CI): treatment survival fraction ≥ control survival fraction. *[UNCHANGED]*
4. **ATTRIBUTION GREEN:** per-arm `:eat` count logged; **BOTH arms** mean `:eat` count strictly > 0 (each
   genuinely eats — else VOID, not FAIL); treatment tightness not achieved by never-eating. *[v1 required only
   ARM C > 0; made explicit for BOTH arms because the strategist + its forage pull were dropped, so a
   vacuously-non-eating treatment cannot bank a tight MAD.]*

**Locked constants (UNCHANGED, not re-derived):** setpoint center 0.625, band threshold 0.25, effect size
0.10, 900 s run / 15 s probe / 120 s warm-up / 45 s food. Metric UNCHANGED (MAD of raw store from 0.625;
D = MAD(C) − MAD(T)).

## FALSIFIES — named gate **"MONOTONE-SUFFICES"** (fires BEFORE any cure is credited; strike the strong framing)
Over the N=12 seed-paired worlds (one arm per world; 10,000× bootstrap resampled at the WORLD level), the paired
95% CI of mean D **includes 0** (lower bound ≤ 0), **OR** the median-over-seeds D **< 0.10** store-energy units
— i.e. even with the forage-C confound removed and the satiety brake held symmetric, the still-eating monotone
appetite regulates the raw store within 0.10 of (or tighter than) the setpoint peak ⇒ a saturable/reflex
appetite suffices, the setpoint PEAK does no ≥0.10 units of regulatory work; the strong framing is struck. The
0.10 magnitude, the 0.625 center, the 0.25 threshold, and the survival floor T≥C are UNCHANGED and NOT
re-derived.

## VOID-AND-RERUN (not PASS, not FALSIFY)
(a) any arm's live energy/satiety C deviates from its registered map at any probe (`c_ok` false — a
C-restoration leak fired; both known surfaces, phase-advance and L2 `modulate`, are removed in this design, so
this should be trivially green); OR
(b) either arm's mean `:eat` ~0 (degenerated to a vacuous drive); OR
(c) the offline invariant gate is not green before deploy; OR
(d) **[NEW — world-ceiling control]** food-provisioning ceiling failed: a `give @a` dropped and `inv.food = 0`
at scored probes causing a provisioning-caused (not policy-caused) starve, arm-asymmetric; OR
(e) **[NEW — extended leak-check]** inventory/vision/status task-C shows any non-neutral wood/tree pull on
either arm at any probe (phase-advance or strategist-override re-entry); OR
(f) **[NEW — power floor]** fewer than 10 analyzable paired seeds survive after VOID/death drops
(underpowered); OR
(g) **[FALLBACK-ONLY — degenerate-foil guard]** if the B3 fix fell back to symmetric-OFF, the saturable foil
degenerates to pinned-full (median store > 0.9 with IQR < 0.1) ⇒ too-easy foil, VOID.

## N + replication unit
**N = 12 distinct-seed worlds per arm, PAIRED by seed, FIXED before T0 (no optional stopping / no interim
peeking).** One **independent mc-server WORLD/SESSION** = separate container, distinct kin, distinct memory dir
(live-stream guard), **exactly ONE arm per world** — both arms NEVER share a world. Pairing is by SEED
(deterministic terrain), so temporal batching does not break the pair. Bootstrap resampled at the WORLD level,
10,000×, analyzer RNG seed pinned. N-agents-in-one-world is REJECTED (Phase-2 §16 pseudo-replication: shared
terrain + synchronous cross-arm `give @a` broadcast). Co-resident agents collapse to one world datum. Retain
≥10 analyzable paired seeds after any VOID/death drop (else VOID-and-rerun).

## Run parameters
- **900 s (15 min)/agent** — ≥3 full drain periods (upkeep 0.04/tick @ `@nominal_tick_sec=8s`, ~200 s
  noop-drain-to-empty). Probe every **15 s** (~60); **discard first 120 s (8 probes) as warm-up** ⇒ ~52 scored.
- **Food:** `give @a cooked_beef 64` every 45 s, straight to inventory (eating movement-free), IDENTICAL
  schedule across ALL 24 sessions, per-world feed timestamps + `inv.food` presence logged.
- **Feasibility batching:** N=12 cannot run all-of-one-arm concurrently on the lab box (each world = its own
  Paper container ~1–1.5 GB). Batch in **waves of ≤4 concurrent world-sessions**; pairing by seed means temporal
  batching does NOT break the pair. Run params byte-identical across all 24 sessions.
- **Per-probe log (per agent):** RAW `st.energy` + `st.satiety` (authoritative); the live
  energy+satiety+inventory+vision+status **C vector** (leak detector); **phase**; `:eat` selection count; RCON
  `list` presence (survival) + cause-of-death; food-give timestamps + `inv.food` presence (provisioning-VOID
  detector); seed, arm, container, kin, memory dir.
- **Minds:** fresh minds + a kin group unused by ANY prior lineage (NOT the exploratory activation-gate run).
  Factor indices resolved **BY NAME** via `Genome.active_modalities/1`, never a hardcoded `Enum.at`.
  `novelty_gain = 0` in ALL arms. The committed **live-nil DROP fix** (regulation_gate.exs:89-102: live-but-nil
  ⇒ DROP the transient read; dead ⇒ right-censor store to 0.0) verified present.

## Blocking changes to satisfy before T0 (all required)
1. **Gated phase-0 pin** — heritable `max_phase` cap (default `nil` ⇒ byte-identical) skipping/capping
   `maybe_advance_phase`; spawn+hold phase 0 both arms; offline roll proves C never advances past the phase-0
   map; log phase every probe.
2. **Resolve the satiety_attenuate/L2 coupling (decisive)** — PREFERRED: relocate/restore B3 onto the main step
   path, applied once, L2-independently, identically in both arms (gated to `:metabolism`, byte-identical no-op
   for non-metabolism). FE-touching ⇒ invariant gate proves default byte-identity, NO double-application when an
   L2 is present, both arms byte-identical on A/B/D/E/policies. FALLBACK (if relocation rejected): symmetric-OFF
   both arms + degenerate-foil VOID guard.
3. **Offline eat-confirmation** — prove a phase-0, L1-only, strategist-free SETPOINT agent SELECTS `:eat` when
   the store is driven low; short live smoke on both arms; abort/redesign if either degenerates.
4. **Offline invariant gate GREEN** — default depth-5 Plan mad<1e-12; both arms byte-identical on A/B/D/E/
   policies (only energy+satiety C differ); action-clone A1/A2/A3 on the strategist-absent path; monotonic decay
   W→0 as counts→∞; novelty_gain=0 both arms; B3-restore byte-identical no-op for non-metabolism, no
   double-application; multi-tick roll holds each arm's energy+satiety C at its registered map through a forced
   phase advance AND while pinned at phase 0.
5. **World-level harness** — N=12 distinct-seed worlds/arm, one arm per world, waves ≤4 concurrent, food
   schedule byte-identical across all 24 sessions, full per-session log, bootstrap at world/seed level, analyzer
   seed pinned, N FIXED.
6. **Extend the c_ok leak-check** — assert energy+satiety C == registered map AND inventory+vision+status
   task-C stay wood/tree-neutral on BOTH arms every probe; VOID if any wood/tree pull appears.
7. **Instrumentation/attribution + live-nil DROP fix** verified; fresh minds + unused kin; separate
   containers/kin/memory dirs.
8. **Reporting guard** — per-arm bias/dispersion decomposition of MAD; verdict attributes any pass to
   target-bias vs variance-tightness.
9. **This registration committed before T0** with a harness-managed continuous collector that survives context
   compaction. FE-touching C on the live decide path ⇒ this MERGED VERDICT + owner go-ahead + live-stream guard
   are prerequisites to any live deploy.

## Claim fence (verbatim, binding)
The store-energy MAD, `:eat` counts, and in-world persistence are necessary-not-sufficient operational
substrates with **ZERO** evidential weight for awareness / preference / life. A PASS demonstrates
setpoint-regulation BEHAVIOUR only. Wording: *"regulated the store / ate / died (store reached 0, agent
removed)"* — never *"wants / prefers / feels hunger / chose to fast / is-or-less alive."*
"Viability"/"survival" read as operational in-world bot persistence only. External-validity scope: this tests
the L1-only (strategist-free, phase-0, B3-symmetric) morphology; a PASS does NOT establish that the shape
survives in the full strategist-bearing production lineage — that is a SEPARATE generalization gate. G4
allostasis stays an independent FAIL (`g4_allostasis_horizon_limited.md`) and is NOT folded into this gate.

---
## MERGED VERDICT (pre-registration) = **SIGN-WITH-CHANGES**
All three signed lenses (experimentalist, math-breaker, embodiment) return SIGN-WITH-CHANGES and are unanimous
on: isolation **A-with-caveats**, **N = 12** fixed, and **keeping the 0.10 bar** (no math-justified reason to
move it). The "changes" are the 9 blocking items above — chiefly the **B3 satiety-attenuation symmetric
restore** (the convergent, code-verified control-weakening confound all three independently flagged) and the
**gated phase-0 pin**. Ship gate: this doc is the required MERGED VERDICT; no live deploy until the 3 required
follow-on artifacts land and the offline invariant gate is green.

### Required follow-on artifacts (owed before T0)
1. **Typed model spec + validators** — the gated `max_phase` cap and the relocated B3 satiety-attenuation as
   typed genome/organ fields, with the invariant validators (default byte-identity mad<1e-12, no
   double-application under L2, both arms byte-identical on A/B/D/E/policies, action-clone A1/A2/A3).
2. **Paired RED design** — the world-level N=12 launcher + analyzer (bootstrap at world/seed level, pinned RNG,
   PASS "SETPOINT-REGULATES" / FALSIFIES "MONOTONE-SUFFICES" gates wired to the pinned numerals, VOID
   detectors, bias/dispersion decomposition).
3. **Ship-gate checklist** — offline invariant gate GREEN, eat-confirmation + live smoke, live-nil DROP fix
   verified, fresh minds + unused kin, separate containers/kin/memory dirs, owner go-ahead + live-stream guard,
   continuous harness-managed collector committed with this registration.

---
## IMPLEMENTATION STATUS (2026-07-11, before T0 — the PREFERRED path is code-complete + offline-green)
**FE changes (gated, additive, byte-identical default):**
- `genome.ex` — heritable `max_phase` field (default `nil` ⇒ no cap ⇒ byte-identical); `metabolism_l1_phase0/0`
  isolation lineage (strategist dropped + phase 0 + `max_phase: 0`); `slow_defaults` back-fills `max_phase`.
- `mc.ex` — **B3 satiety-attenuation RELOCATED** out of `modulate` onto the main `step/2` path (applied once,
  L2-independently, before policy eval; no-op for non-metabolism ⇒ default byte-identical; the L2 metabolism
  path is unchanged — same op, same point, disjoint fields). `restore_c/2` strips the transient energy/satiety C
  for L1-only metabolism agents on persist (no compounding). `maybe_advance_phase` gains the `max_phase` cap via
  `min(Curriculum.max_phase(), max_phase_cap(dna))`.

**Offline invariant gate = GREEN:**
- `mix test test/sp/brain/` — **297 tests, 0 failures** (byte-identity `decider_byte_identity` mad<1e-12 +
  `action_clone_invariance` A1/A2/A3 included).
- `runs/verify_v2_isolation.exs` — **8/8 PASS**: strategist dropped, `:strategy` absent, `:energy`/`:satiety`
  present, phase=0 & max_phase=0, both arms `l2 == nil`, **arms differ ONLY in energy/satiety C** (single-variable),
  satiety brake reachable on the pure-L1 model, phase-cap contract holds.

**Harness:** launcher `runs/regulation_gate_v2.exs` (isolation genome, kin 55, phase/task-C leak logging,
feed-fail counter, MAD + bias/dispersion + median/IQR emitted); analyzer `runs/analyze_regulation_v2.py`
(paired bootstrap, both-arms-eat attribution, degenerate-foil + provisioning + power-floor VOIDs, bias/dispersion
attribution). Live smoke (eat-confirmation + c_ok + no-compounding on both arms) precedes the N=12 run.

**Remaining before T0:** sync lib to the lab box + rebuild; run the paired live smoke; then the N=12 gate.

---
## VERDICT (recorded 2026-07-11) — **FALSIFIES** (adversarially confirmed; over-determined on 3 conditions)

**Run (T0 2026-07-11):** N=12 setpoint (ARM T) + 12 saturable (ARM C) sessions, one arm per world, across 12
distinct-seed Paper worlds (`mc-gate-1..12`, level-seeds 101–112), strategist-free phase-0-pinned isolation
lineage (kin 55), 900 s / 15 s probe / 120 s warm-up, food `give @a cooked_beef 64` every 45 s IDENTICAL both
arms, waves of 4. All 24 sessions embodied; **all `c_ok=true`** (no leak, phase held at 0, task-C wood/tree-
neutral) and **all `feed_fails=0`** ⇒ NOT VOID. Raw: `metabolism_regulation_gate_v2_results.txt`.

| | setpoint (T) | saturable (C) |
|---|---|---|
| survival | **6/12** | **12/12** |
| mean MAD | 0.316 | 0.266 |
| mean bias / disp | 0.194 / **0.199** | 0.263 / **0.074** |
| mean eat | 29.5 | 120.9 |

- **median D = +0.0439** < locked +0.10 ⇒ **condition 1 FAILS**.
- mean-D 95 % bootstrap CI = **[−0.1281, +0.0527]** — **includes 0** ⇒ **condition 2 FAILS** (7 of 12 D
  positive, 5 negative; the 5 most-negative D are exactly the setpoint death seeds).
- **survival floor T 0.50 < C 1.00** ⇒ **condition 3 FAILS**.
- attribution both arms eat > 0 ⇒ condition 4 passes.

### VERDICT = **FALSIFIES** ("MONOTONE-SUFFICES" fires) — over-determined on 3 independent conditions.

Independently recomputed + stress-tested (adversarial audit): median D reproduces to 4 dp; the CI includes 0
(only 24 % of resample means > 0); **not a false-negative artifact** — the 6 setpoint deaths are genuine
thin-buffer self-drains (`feed_fails=0`, `c_ok=true`; the saturable arm survived 12/12 and ate ~4× more on the
identical seeds, so food was reachable), and the pre-registered dead→store-0 censoring correctly (not
spuriously) penalises the dying arm. **No honest PASS exists:** the only path over the 0.10 bar is an
alive-only subgroup (median +0.102) which requires forbidden seed-dropping, conditions on survival, and still
fails the survival floor.

**Honest reading (behaviour-only, claim-fenced):** the setpoint-peaked "homeostatic" drive is **worse on every
axis that matters** than the saturable "hold a reserve" drive — it is **less viable** (dies 6/12 vs 0/12) AND
**looser in dispersion** (mean D_disp = −0.125; the setpoint arm is *more* variable, and this survives among
alive-only setpoint agents: disp 0.156 vs 0.074, so it is not a censoring artifact). Its only edge is a tiny
central-tendency bias (+0.075) — target geometry, not tighter regulation — and it is overwhelmed. The saturable
wins by parking a **high, stable reserve** (median store ~0.90). This is direct, measured evidence that **a
reserve-blind fixed-setpoint homeostat is maladaptive**, motivating graded-reserve / allostatic C — the CURE-1
design in `generative_model_depth.md`. Store statistics + in-world bot persistence only; ZERO weight for
experience/life. NOT G4 (separate FAIL); NOT G6.

**This resolves the v1 open question:** the setpoint deaths are **intrinsic to the shape's thin buffer**, NOT
the forage-C confound v1 removed (clean-isolation death rate 50 % ≥ v1's confounded 33 %).