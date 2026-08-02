# Phase-2 metabolism RED — committed receipt + honest verdict (2026-07-11)

**This is the committed receipt that `docs/specs/metabolism.md` §16 and `docs/DEEPENING_PLAN.md` were holding
open as PROVISIONAL.** The verdict below is the **corrected** reading after adversarial verification (4
independent skeptics, workflow `wf_61b43ee9-68d`); it is materially more conservative than the pre-verification
draft. Where this receipt and any earlier prose disagree, **this receipt wins.**

## Provenance (raw evidence)
- Source: the live collector output on the rootless colony box (`uni@10.190.245.122`),
  `~/.claude-evidence/phase2/phase2_red.jsonl`, pulled 2026-07-11.
- Committed here gzipped: `phase2_metabolism_red.jsonl.gz` (raw 18,293,470 B, **26,244 rows**, schema
  `phase2_red/1`) + `phase2_metabolism_red.heartbeat.jsonl.gz` (2,187 heartbeats).
- SHA256 (raw): `957aafd6f406f7852376a6a49a9c18d12102eb16cee87a1a55f74c1ec86a2b27` (phase2_red.jsonl);
  `212c6d31b9d31351f1d0693c724b9df59e6fdfb3e0dd6dd0324cfe8daf8391b3` (heartbeat.jsonl).
- SHA256 (gz committed): `42bb66129ab972d8e0e31a709414d428ec28f047bffaa89f542639ec82c90a05` (phase2_red.jsonl.gz);
  `fe5290e7ced43f06113482935c318a74e7277cdd69da80cffd7e1666bd12b11c` (heartbeat.jsonl.gz).
- Instruments: launcher `runs/metabolism_lineage.exs`; collector `ops/phase2_collector/{collect.exs,
  collector.container,uni-collector.{service,timer},harness_task.md}` (already tracked).

## Design (what ran)
Paired RED, **N=6/arm**, ~15 days (`2026-06-25T22:31Z → 2026-07-11T02:30Z`), container
`uni-colony-metabolism` (started 2026-06-26 01:23Z) against `mc-server` (Paper, seed 8675309):
- **kin-12 = TREATMENT** = `Genome.metabolism_primary()` (the `:metabolism` organ ON), pinned `phase: 1`.
- **kin-13 = CONTROL** = `Genome.default()` (organ OFF), pinned `phase: 1`. Same code/world/body; differs
  ONLY in the organ.
- **`novelty_gain = 0.0` in BOTH arms** (the epistemic term was OFF everywhere by construction).
- Heartbeat: `node_attached` + `rcon_connected` true throughout; `rows_written=12`/cycle; 100% probe/rcon health.

## The numbers (final per-UNI, RCON-authoritative)

**G6 plateau-break metric = `placed_used_total` + `distinct_mined_types` (pre-registered, above control).**

| arm | per-UNI `placed_used_total` | Σ placed | Σ distinct_mined | Σ stone+cobble mined | mean action_entropy |
|---|---|---|---|---|---|
| TREATMENT (kin-12) | 8, 10, 20, 12, 14, 8 | **72** | 13 | 83 (UNI-12-3 alone; others 0) | 1.089 |
| CONTROL (kin-13) | 16, 2, 14, 3, 34, 14 | **83** | 15 | 64 (13-5=53, 13-6=10, 13-1=1) | 1.152 |

**Cumulative `placed_used_total` by day (freeze):** treatment 7→70 (06-26)→**72 by 06-27, flat for 14 days**;
control 9→76→…→**83 by 07-01, flat for 10 days**. **Nobody in either arm mined cobblestone or built shelter
(0/12); `distinct_block` stayed 1–3.**

## Verdict — split (corrected, adversarially verified)

**1. G6 plateau-break (the pre-registered PASS gate: treatment must EXCEED control; behavioural target =
reach cobblestone/shelter) → FAIL.** This is the only firm, noise-immune conclusion. Treatment did **not**
exceed control on `placed_used` (72<83) or `distinct_mined` (13<15), and **0/12 UNIs in either arm reached
cobblestone or built shelter.** The cure did not break the plateau. (A narrow FAIL of the directional gate +
the absolute-target miss — both robust to the noise below.)

**2. The metabolism HYPOTHESIS itself (did the organ help/hurt?) → WITHHELD.** Two independent reasons:
- **Arms are statistically indistinguishable at N=6.** Control `placed_used` ranges 2–34 (SD≈11.6, ~2.5× the
  treatment SD); Welch t≈−0.36 (p≈0.73); the difference 95% CI ≈ **[−14.3, +10.6]** straddles zero and does
  not exclude either threshold. Per the protocol's own rule ("verdict = the CI bound that excludes the
  threshold, never the point estimate"), the 72-vs-83, 13-vs-15, and entropy 1.089-vs-1.152 gaps are
  **within noise** — "treatment did worse / explored less / froze harder" is **not supported**. The sign is
  not even robust: leave-one-out on control UNI-13-5 (=34) flips it to treatment-leads.
- **Organ activation is UNVERIFIED.** The pre-registered *mechanism* falsifier — **G5b, the action-severed
  energy-axis twin** — was never passed (`metabolism.md` §16 says so). The RED collected only G6 behavioural
  RCON metrics; there is **no energy-posterior / twin-survival receipt** showing the internal energy/satiety
  store depleted, refilled, and modulated action selection in the deployed containers. We therefore cannot
  say metabolism "failed" — only that this run licenses **no** metabolism claim.

**Struck from the earlier draft as over-reach (do not restate):**
- ❌ "metabolism produced a sustained foraging/mining homeostat that is itself a new plateau" — the
  organ-**free** control froze identically, so the freeze is **baseline / a shared world-or-observation-bin
  ceiling**, not an organ effect. A flat line is not a regulated set-point.
- ❌ "consistent with epistemic starvation (no epistemic drive)" as *mechanism* — `novelty_gain=0` in **both**
  arms is a fixed background condition of the whole rig, not a finding of this RED; this run cannot adjudicate
  the epistemic drive.
- ❌ the stone flip (treatment 83 > control 64) as any kind of win — reported here for completeness, then
  **rejected**: it is entirely one UNI (12-3=83, the other five treatment UNIs = 0), not the pre-registered
  metric, and never converted to placement or the shelter target. A per-arm sum dominated by n=1 is a lucky
  forager, not a plateau break.

## Claim fence (binding)
Every number here is a behavioural/model observable with **zero evidential weight** for awareness / experience
/ life. A **null / indistinguishable** behavioural result carries *even less* such weight than a positive one:
this run demonstrates **no distinctive behaviour attributable to the organ**, let alone experience.

## What this run does — and does NOT — license for the next design
- It licenses: **"the metabolism organ, as deployed at curriculum-phase-1 with novelty off, did not
  demonstrate a plateau-break, and both arms hit a shared low ceiling."**
- It does **NOT** license: "metabolism failed," "metabolism causes a homeostat," or "the plateau is epistemic
  starvation." The Track-B reframe (true-signal vision + a natural epistemic drive) remains a **hypothesis
  this RED neither confirms nor refutes.** The shared arm-independent freeze is itself a signal that a
  **world/observation-bin ceiling** (task affordance) may be as load-bearing as any drive deficit — a
  world-ceiling control ("can ANY configured agent reach cobblestone in this world?") is now a prerequisite.

## Blockers to upgrade this from WITHHELD to a real metabolism verdict
1. ✅ Commit this receipt from the lab-box JSONL (done).
2. The **G5b energy-axis twin / energy-posterior receipt** proving the organ modulated action in the live run.
3. Per-UNI CIs (not arm means), given single-UNI dominance.
4. A **world-ceiling control** separating task-affordance failure from any drive failure.

## Adversarial verification
Verdict corrected via workflow `wf_61b43ee9-68d` (4 lenses: metric-validity, statistical-robustness,
confound-hunt, claim-fence). The pre-verification draft ("PARTIAL/FAIL; metabolism homeostat; epistemic
starvation") was rejected as (a) adjudicating on point estimates the protocol forbids, (b) imposing a
mechanism narrative on a null with an unverified organ, (c) using an invalid verdict token. This receipt is
the surviving verdict.
