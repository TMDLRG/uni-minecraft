# purebody — the no-cheat measurement harness (migration Step 1)

This directory is **Step 1** of the agreed embodiment migration: *"recorder + `purebody.v1`
ledger + AST denylist first — measure the current colony before changing the agent."* It is the
home of the `purebody.v1.part2.candidate` registration produced by the GPT↔Claude↔UNI consult
(R1→R2→R3, `uni-mind/docs/research/UNI_CONSULT_EMBODIMENT_*.md`).

It measures, it does not yet change the agent. Nothing here is wired into the live perceive→infer→act
loop. The colony is currently stopped; everything here runs standalone.

## Why this exists

The host already enforces **Blanket-1** (the mind↔body categorical seam): `SP.Interface.Audit`
guarantees a learner-facing observation is `integer_channel => finite_number` and nothing else, and
`SP.Sim.Verifier` re-derives that no-leak verdict from recorded frames. What was **missing** is the
**Blanket-2** source-level check: nothing verified that the *body's senses come from pixels* rather
than symbolic world reads. The consult's sharpest finding (R2) is that the live `viewer/body.js`
perceives via **symbolic God-sight** (`blockAtCursor`/`findBlock`/`nearestEntity`/`bot.health`/…)
with the rendered scene as only a 15th channel — i.e. by the no-cheat contract the running agent is a
**dual-channel cheater**. This harness makes that measurable.

## The no-cheat contract (what "pure inference" means here)

- **Perception** = rendered POV pixels + HUD pixels + proprioception **only**. No symbolic block/
  entity/inventory reads, no true health/food float, no true coordinates.
- **Action** = raw human controls **only** (WASD held bools, raw mouse-look delta, click-at-crosshair,
  hotbar select, GUI slot-click). No auto-equip, no `lookAt`-snap, no pathfinder, no nearest-target
  picker, no server command. **Aim-then-click**: the brain aims, the body clicks the crosshair.
- **Brain** = pure active inference. No backprop, no RL, no LLM, no in-loop `true_state`.

## Components

| File | Role |
|---|---|
| `mc_purity_scan.cjs` | **Link 1 — static AST/import denylist.** Scans the perceive→infer→act source (`viewer/body.js` + `lib/sp/brain/**` + `lib/sp/runtime/agent.ex`) for the forbidden privileged APIs, classed by fence. `--record` appends a baseline row. |
| `ledger.cjs` | **The `purebody.v1` append-only ledger.** Rows are never edited or deleted; corrections are forward-only via `supersedes`. Run it to print the ledger. |
| `recorder.cjs` | **The EVAL-only ground-truth recorder + isolation guard.** A write-only sink for the auditor (true grid, crosshair raycast, boundary hash). `--guard` proves the loop has **zero** references to that sink. |
| `purebody.v1.jsonl` | The append-only ledger file. |
| `eval_ground_truth.jsonl` | The write-only auditor sink (created on first `record()`). |

## Run

```sh
node lab/purebody/mc_purity_scan.cjs            # report (exit 1 on FAIL)
node lab/purebody/mc_purity_scan.cjs --record   # report + append a purebody.v1 row
node lab/purebody/recorder.cjs --guard          # EVAL-recorder isolation check
node lab/purebody/ledger.cjs                     # print the ledger
```

## Baseline measured 2026-06-20 (the honest starting point)

| Fence | Verdict | Notes |
|---|---|---|
| `perception_pixels_only` | **FAIL** | 28 symbolic God-sight reads in `viewer/body.js` (`bot.health`/`food`, `findBlock`, `blockAtCursor`, `nearestEntity`, true coords). |
| `action_human_controls_only` | **FAIL** | 4 privileged actions (auto-`equip` ×2, `lookAt`-snap ×2). |
| `brain_no_backprop_no_llm` | **PASS** | The brain is genuinely pure AIF (no backprop/RL/LLM). |
| EVAL-recorder isolation | **PASS** | The loop has zero references to the ground-truth sink. |

The agent already has a real human-control motor surface (`setControlState`, `smoothLook` raw deltas);
the migration strips the privileged shortcuts that sit beside it. A **FAIL here is expected and
correct** — it is the baseline the pixels-only migration must move.

> **Evidence-hygiene note:** the first recorded row had a scanner false-positive (the `rl_reward` rule
> matched the bare word "reward" inside `@doc` strings that *deny* RL). The scanner was corrected
> (real-usage patterns + `@doc`/heredoc-aware) and a **superseding** row appended — the original row
> stands. Show the spill, clean it up, redo the clean check.

## The 5-link chain (R2 §8.3 / R3) — where Link-1 sits

1. **Static purity** — `mc_purity_scan.cjs` ✅ built + baseline recorded.
2. **Blanket-alphabet typing** — `assert_percept_is_pixels` (positive-allowlist ADT). *Design-only* —
   `SP.Interface.Audit` enforces the integer-channel format; the **source = pixels** typing is owed.
3. **Perturbation** — task-proportional pixel dose-response **AND** symbol-ablation null **AND**
   crosshair-raycast==hit (R2 corrected Link-3; the old `pixel_KL>0` test is insufficient). *Owed.*
4. **Sealed 5-sha held run** — `(body, brain, seed-manifest, world-generator, scorer)`; CI lower bound
   is the verdict. *Owed.*
5. **UNI verdict-sign** — `uniVerdictSign` stays **null** until 1–4 pass.

## Honest limitations (carried from R1/R2)

- A static text denylist is the **weakest link** — defeated by reflection / dynamic dispatch / FFI /
  generated code. It measures source-level intent, not a structural proof. The structural replacement
  (positive-allowlist `Percept`/`BodyAct` ADT + the four TCB blocking-CI checks: no reflection/FFI in
  the brain package, serializer rejects unknown fields, build-time import-graph fence, no clock read —
  R2 Q10) is **design-only**.
- The crosshair raycast and ground-truth grid are recorded **out-of-loop** only; wiring the live capture
  to RCON is owed (the colony is stopped).

## Standing fence

`lab/docs/SCIENTIFIC_LIMITS.md` — no novel, pre-registered, out-of-sample prediction has yet been
registered before its test and survived. Until one does, this is a faithful, falsifiable developmental
active-inference system, **not** a proven capability.

## Next in the migration (Step 2+)

Step 2 — factored action heads on the *existing symbolic senses* (prove the engine selects a head-vector;
mechanism only, no claim). Step 3 — strip target-pickers / aim-then-click / GUI crafting (clears the
`action_human_controls_only` FAIL). Step 4 — promote pixel perception to PRIMARY + proprioception up
(clears `perception_pixels_only`). Step 5 — run Links 2–4 → sealed held run → UNI verdict-sign.
