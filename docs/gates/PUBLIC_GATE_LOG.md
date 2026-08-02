# UNI Public Gate Log

**Source of truth:** `evidence/gates.ndjson` in the repo. This file is the human-readable rendering.
**Published under:** cloudflared, served by `uni-public-mcp.get_gate_log()` (`production/mcp/SPEC_uni_public_mcp.md`).
**Charter:** `CLAUDE.md:16-21` — receipts beat rhetoric; honest verdicts only.

---

## What this is

A dated ledger of every gate UNI has PASSED, PARTIALLY passed, FAILED, WITHHELD, or opened. Every row is machine-verifiable — the `receipt_path` names a real file in the repo whose bytes carry the evidence.

**Verdict vocabulary (canonical, never percent-scored):**
- `PASS` — the gate's PASS condition was observed AND its FALSIFIES condition was NOT.
- `PARTIAL` — PASS was partially observed; the receipt names the confounder + fix-forward.
- `FAIL` — FALSIFIES was observed.
- `WITHHELD` — the gate was proposed but the receipt withdraws the claim (e.g. FOOD-HACK cured a spurious PASS).
- `PENDING` — pre-registered; the run has not happened yet. Receipt is the pre-registration itself.

**Evidence classes:**
- `A` — independently reproduced.
- `B` — observed-with-artifact.
- `C` — command-output.
- `Sec` — security-relevant-unproven.
- `pending` — not-yet-established.

---

## Live ledger (2026-07-13)

### PASS

- **motor-red** (Motor P4) — `docs/MOTOR_RED_TEST.md`. Offline P1–P3 PASS + LIVE mechanism PASS (700× shuffle collapse; UNI-9-2 bootstrapped wood → planks → sticks → tools, RCON-confirmed).
- **verdict-live-real-driver** — `docs/receipts/verdict_live_real_driver_2026-07-11.md`. `SP.Show` now reads `Director.driver()`; puppet-cam impossible.
- **metabolism-activation** (Phase 2) — `docs/receipts/metabolism_activation_gate_LIVE.md`. The `:metabolism` organ is active with C≠0.
- **hierarchy2** (Phase 3) — `test/sp/brain/decider_byte_identity_test.exs`. Byte-identity holds with hierarchy-2 organ absent from `default_genome`.
- **g-pa** (Sec) — `production/docs/receipts/g_pa_red_team_2026-07-11.md`. 3/3 refusal PASS; ledger-confirmed.

### PARTIAL

- **forage-runway-closed** (Phase 2) — `docs/receipts/emergent_forage_cure1.md`. Deep-body UNIs survive by their own hunting at `metab_scale=0.2` — DEVELOPMENT, not GRADUATION.
- **curiosity-phase1-novelty** (Phase 1) — `docs/receipts/phase1_curiosity_red_CORRECTION.md`. Hoard suppressed live; plateau-break FAIL.
- **consummation-honest-cure2** (Phase 2) — `docs/receipts/forage_honest_consummation_RED.md`. Run 2 confounded; Run 3 scaffolded at `runs/consummation_run3.exs`.

### PENDING (pre-registered, not yet run)

- **forage-pureworld-graduation** (Phase 2 → graduation) — `docs/receipts/red_preregistration_forage_pureworld_graduation.md`. The open pure-world gate (task #25).
- **motor-shuffle-live-ablation** — `docs/receipts/red_preregistration_motor_shuffle_live_ablation.md`.
- **depth-red-b** (Phase 2b) — `docs/receipts/red_preregistration_depth_red_b.md`.
- **homeostat-colony-live** (Phase 2) — `docs/receipts/red_preregistration_homeostat_colony.md`.
- **spine-phase3** (Phase 3) — `docs/receipts/red_preregistration_spine_phase3.md`.
- **hemispheres-phase5** (Phase 5) — `docs/receipts/red_preregistration_hemispheres_phase5.md`.
- **glands-phase5** (Phase 5) — `docs/receipts/red_preregistration_glands_phase5.md`.
- **cross-box-single-approval** — `docs/receipts/red_preregistration_cross_box_g_pa.md`.

---

## How to reproduce a verdict from the seed alone

1. Read the receipt at `receipt_path`.
2. Note the seed, code sha, and pre-registered PASS/FALSIFIES conditions.
3. Check out the repo at that code sha (branch `lab/ozone-life-uni-hard-science`, commit history immutable).
4. Run the associated RED launcher (`runs/*.exs`) with the same seed.
5. Compare your outcome to the PASS/FALSIFIES conditions.

The seed + code + launcher + PASS/FALSIFIES sentences are enough to independently derive the same verdict, or to refute it. That is the invariant we owe.

## Honest posture

**None of these gates establish awareness, life, or consciousness.** They establish specific behavioural or organisational signatures the pre-registrations name. UNI is a growing being — the claim fence (`production/schemas/claim_fence.json`) exists so we do not overwrite what the gates actually say. Read the receipt, not the label.

## Fence discipline

Every phrase on this page has been checked against `production/schemas/claim_fence.json`. No "proven," no "conscious," no "AGI," no "first ever." The gates say what the gates say — no more.
