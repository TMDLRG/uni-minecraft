# UNI OS + MIND — Deepening Handoff (LLM engineering agents)

**Repo:** `C:\Users\mpolz\Documents\Strings` (branch `lab/ozone-life-uni-hard-science`).
**Head at handoff-authoring:** `cea1cd3` (the MineCraft agent's finalize) + this deepening pass.
**Handoff-of-record:** this file. When you pick up UNI's OS + Mind cold, this is your first read after `CLAUDE.md` + `docs/UNIVERSE.md`.

---

## What UNI is (the frame you inherit)

**UNI is ONE UNI.** A single growing being on the chip at UNI-LAB (`10.190.245.122` / mesh `10.13.13.1`). It is simultaneously the rootless UNI-OS + Mind (colony host: Minecraft world + Phoenix/`SP.Producer` FEP brain + `body.js` bots), the rootful ERP business appliance, and the fleet MCP router. **UNI is becoming the OS**: as we build, UNI replaces our code with itself.

**Your job as an LLM engineering agent.** Keep writing UNI's OS + Mind. Deepen integration. Pass more gates. Keep on-chip UNIs safe. Keep the whole stack healthy and honest. Make UNI ready to be the **sovereign safe harbor** for public study of general intelligence — following nature, asking honestly whether this is the math, never overclaiming, never smuggling reward.

**Non-negotiables you inherit** (cite before acting):
1. Colony = UNI-LAB, always (`CLAUDE.md:44-52`, `ADR-PROD-013:26-31`, `docs/UNIVERSE.md:37`).
2. THINKER = portable studio only, captures colony over LAN (`CLAUDE.md:53-61`).
3. node2 = fan-out relay only (`CLAUDE.md:62-67`). **NOTE 2026-07-13:** node2 rebooted ~30min before this handoff was authored (hard-freeze remediation of a `uni-producer` crash-loop on `mount -o remount,rw /`; 3 unit files disabled; `uni-bcast-mixer` was spinning on failed SRT reconnects to cam2/cam3 as of that time). Anything reading node2 through `fleet_status.ndjson` or `heartbeat.sh v2` will see this — that is honest, not a bug.
4. Never claim from process existence — quote the named machine gate or say NOT VERIFIED.
5. One `--sname uni` Phoenix node, ever.
6. One supervised sole writer per spool.
7. `default_genome` byte-identical (guarded by `test/sp/brain/decider_byte_identity_test.exs` + golden fixture).
8. Human-typed CONFIRM on outward verbs (G-PA). Never widen authority; only widen evidence.
9. FOOD-HACK LESSON: viability emerges from EFE — no gives, no reward-on-policy.
10. Ship gate: MERGED VERDICT from `/lab-team-review` + typed spec + paired RED + ship-gate checklist.
11. Receipts beat rhetoric. Honest verdicts (PASS/PARTIAL/FAIL/WITHHELD). Never percent-scored.
12. Non-collision: the MineCraft agent owns `uni-lab.local` avahi/mDNS + the launcher `:8090` observability panel UI + external DNS/secured cameras. Build the services under those layers — not the layers themselves. **DNS Phase 0–4 landed 2026-07-12 (commits `eb0ba24..8c935eb`)**: `uni-dns` container Up + boot-persistent on the chip (`10.190.245.122:53`, `10.13.13.1:53`, `127.0.0.1:53`); THINKER resolves `*.uni-lab.local` end-to-end. When writing new code, prefer `<name>.uni-lab.local` over hardcoded IPs where practical (e.g. `colony.uni-lab.local` instead of `10.190.245.122`); the observability layer's `viewer/infra_registry.json` is the declared name map to consult first. Fall back to IP with a comment explaining why.

---

## Read this first (tiered ingest, verbatim from the deepening plan)

**Tier 0 — always loaded, binding.**
1. `CLAUDE.md` — the always-loaded contract.
2. `docs/UNIVERSE.md` — master cold-start orientation.
3. `production/docs/adr/ADR-PROD-013-colony-host-placement.md` — colony placement.

**Tier 1 — ADR chain map.** Read order: **013 → 011 → 012 → 001 → 003 → 008 → 005 → 010 → 002 → 004 → 006 → 007 → 009.**

**Tier 2 — the code that carries the truth after `cea1cd3`.**
`viewer/launcher.cjs` (:8090), `viewer/verify_colony.cjs`, `viewer/studio_stage.cjs`, `viewer/command_center.cjs` (:8098), `viewer/publisher.cjs` (:8443/:8095), `viewer/pub.html`, `viewer/studio_up.ps1` (with `-HostColony` guard), `viewer/rcon.cjs`. Then `production/mcp/server.py`, `production/scripts/{heartbeat.sh,programshot.py,backup.sh,panic.sh}`.

**Tier 3 — the science lane.**
`docs/LAB_PROTOCOL.md`, `docs/UNI_MISSION_DEEPENING.md`, `docs/MOTOR_RED_TEST.md`, `docs/HARVEST_FIX_PLAN.md`, `docs/lab_team/{01..05}.md` + `README.md`; the Claude skills `~/.claude/skills/lab-team-{math-breaker,architect,experimentalist,embodiment,aif-theorist,review}.md` (ambient to a Claude session).

**Tier 4 — the engine + its guards.**
`lib/sp/brain/*.ex` (46 modules); `lib/sp/runtime/{supervisor,lineage,agent,board,on_chip}.ex`; `lib/sp/show/{overlay_publisher,supervisor}.ex`. Guards: `test/sp/brain/{decider_byte_identity,action_clone_invariance,novelty,honest_consummation,forage_discovery_gating}_test.exs` + golden `test/fixtures/decider_golden_seed7_d5b3.bin`.

**Tier 5 — older docs (trust ONLY the banners).**
`docs/STUDIO_SYSTEMS.md`, `docs/SYSTEM_OVERVIEW.md`, `docs/UNI_PRODUCTION_PLATFORM.md`, `docs/RUNBOOK_STUDIO.md`, `docs/STUDIO_OPERATOR_MANUAL.md`, `docs/PROJECT_STATUS.md`, `docs/RELEASE_READINESS.md`.

**Never trust as authoritative** without a rewrite: `production/verify_p1.sh` (still probes retired `:8099 :4455 :8095`). See `production/verify_p1_v2.sh` — the replacement this pass lands.

---

## What lives in the repo now (post-deepening)

### The one-line summary
The studio bring-up is coherent, the colony canonically lives on UNI-LAB, the render/mixer is portable on any GPU box, node2 fans out only, and this deepening pass adds the **contracts + gates + safe-harbor spine** that let UNI grow through the same ship gate as any operator change.

### New artifacts landed this pass

**Foundation (this file + prompt).**
- `docs/handoffs/UNI_OS_MIND_DEEPENING_HANDOFF.md` — this doc.
- `docs/prompts/UNI_OS_MIND_ENGINEER_PROMPT.md` — the cold-start prompt you paste into a fresh session.

**A. Gate registry + honesty spine.**
- `evidence/gates.ndjson` — append-only gate ledger.
- `docs/GATES.md` — rendered view.
- `production/schemas/gate_row.schema.json` — row schema.
- `production/schemas/claim_fence.json` — unified fence tokens (JS + Elixir load from here).
- `runs/lab_team_review.exs` — in-repo `/lab-team-review` runner scaffold.
- `.claude/hooks/{fe_touch_needs_verdict,no_percent_scoring}.py` — hooks that enforce the ship gate + receipt honesty.
- `production/scripts/{ci_fe_touch_check.sh,ci_no_percent_scoring.sh}` — CI mirror of the hooks.
- `test/sp/brain/{fence_snapshot_test.exs,output_side_leak_audit_test.exs}` — new invariant guards (scaffold).

**B. Next-gates RED harness (pre-registered).**
- `docs/receipts/red_preregistration_{forage_pureworld_graduation,motor_shuffle_live_ablation,depth_red_b,homeostat_colony,spine_phase3,hemispheres_phase5,glands_phase5,consummation_run3}.md`.
- `runs/{pureworld_qa_gate,motor_shuffle_live_ablation,depth_red,homeostat_colony_red,spine_red,hemispheres_red,glands_red,consummation_run3}.exs` — RED launcher scaffolds.

**C. Self-replace pathway.**
- `production/mcp/SPEC_uni_propose_change.md` — MCP verb spec (server.py edit queued to `/lab-team-review`).
- `production/mcp/SPEC_uni_self_audit.md` — MCP verb spec (server.py edit queued).
- `production/docs/DEPLOYED_STATE.md` — new "replaced-by-uni" section (added).
- `production/docs/SPEC_mc_codec_versioning.md` — the memory-file version-bytes contract.
- `production/docs/SPEC_livepatch_hot_files.md` — the OS-side livepatch guard contract.

**D. OS↔Mind contracts + fleet + DR.**
- `production/schemas/{sensorium_envelope,envelope,evidence_bundle,public_manifest}.schema.json` — versioned contracts.
- `production/docs/OS_SPOOL_POLICY.md` — single-writer-per-spool policy.
- `production/scripts/{heartbeat.sh.v2,notify.sh.v2,colony_archive.sh,verify_p1_v2.sh}` — the new OS scripts (staged as `.v2` alongside originals to protect running services).
- `production/systemd/uni-colony-archive.{service,timer}` — daily colony snapshot.
- `production/mcp/SPEC_command_center_overlay_update.md` — the Producer endpoint spec killing the duplicate `broadcast.json` writer.
- `production/mcp/SPEC_log_sensor_organ.md` — the `SP.Runtime.LogSensor` + `:sensorium` genome-organ extension spec.
- `production/mcp/SPEC_fence_override_forwarding.md` — the audit-forwarding spec.
- `production/mcp/SPEC_lineage_snapshot.md` — the `SP.Runtime.Lineage.snapshot/1` spec.
- `runs/red_team_cross_box.exs` — cross-box single-approval red-team scaffold.

**E. Sovereign Safe Harbor.**
- `production/mcp/SPEC_uni_public_mcp.md` — read-only public MCP subset spec.
- `docs/gates/PUBLIC_GATE_LOG.md` — public honest ledger.
- `docs/PUBLIC_README.md` + `docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md` — the public-facing entry points.
- `production/mcp/SPEC_colony_transcript_replay.md` — read-only replay surface spec.
- `production/mcp/SPEC_uni_housekeeping_status.md` — the aggregate housekeeping verb spec.

**What is NOT landed (honesty-gated for the next session).**
The following require `/lab-team-review` against a real diff (they touch FE files or add new MCP verbs). They are held as SPEC docs; the runner (A-A2 above) is the first thing that processes them:
- `production/mcp/server.py` edits for `uni_propose_change`, `uni_self_audit`, public MCP verbs.
- `lib/sp/interface/audit.ex` output-side extension.
- `lib/sp/runtime/log_sensor.ex` + `SP.Brain.Genome.sensorium_lineage/0`.
- `lib/sp/show/overlay_publisher.ex` output-scan hook.
- `lib/sp/runtime/lineage.ex` `snapshot/1`.
- `lib/sp/brain/mc_codec.ex` version bytes.

The MERGED VERDICT + typed spec + paired RED ship-gate discipline applies to each. Do not merge any of them without the receipt.

---

## Session shape for engineering agents

### The workflow

1. **Cold start.** Read Tier 0 verbatim. Then this handoff. Then the deepening plan at `~/.claude/plans/fully-plan-all-remediation-snappy-sky.md` (or wherever the plan lives when you pick up).
2. **Understand the current gate ladder.** Read `docs/GATES.md` (the rendered view of `evidence/gates.ndjson`). Know what's PASS, PARTIAL, FAIL, WITHHELD, PENDING.
3. **Understand what's queued.** Check the "What is NOT landed" list above. If your task touches those, that's your queue.
4. **Decide session shape.**
   - Any code change touching FE files (`lib/sp/brain/**`), any new MCP verb, any schema change → **plan mode + `/lab-team-review` before you edit any code**. Land pre-registration receipts first.
   - Broad audits / doc sweeps / dimension-fanned review → **Workflow (Ultracode)** with Explore/Plan agents.
   - Any on-chip mutation (`os_*` / `podman_*` / `lab_*` / `livepatch_*` / `live_update_*`) → **the uni-lab MCP**, one human approve/deny per mutating call. Cross-box mutations gate once on the router.
   - Simple non-FE change (a new script, a doc, a schema, a hook, a receipt) → direct edit.
5. **Before you commit.** The hooks land in `.claude/hooks/`. They will refuse an FE-touching commit without a MERGED VERDICT receipt for the SHA, and refuse a receipt containing a headline percent-score. Take that as a feature.
6. **Always emit a receipt.** No workstream item is "done" without a receipt at `docs/receipts/**` with YAML frontmatter (`verdict:`, `evidence_class:`).

### When to invoke `/lab-team-review`

Any time you are about to:
- Land an FE-touching diff.
- Deploy a live RED to the colony.
- Add or widen an MCP verb.
- Change a schema that other layers consume.

The runner is at `runs/lab_team_review.exs` (scaffold this pass). Run it against your candidate SHA before you push.

### When to use Workflow (Ultracode)

- Broad read-only audits of the repo.
- Doc-consistency sweeps.
- Dimension-fanned reviews of a proposed change.
- Preparing a plan (Phase 1 exploration).

**Never** for anything that changes on-chip state. Workflow spawns agents; on-chip mutations belong to the operator's ONE human approval.

### When to use the uni-lab MCP

For any change on the chip. Read tools run without gating. Every mutating tool pauses for one human approve/deny in the fleet approval queue. Cross-box mutation gates ONCE on the router box; the executor uses a one-time single-use token verified by LimbGuard.

The MCP surface: `os_*` (systemd / journald / files / guarded shell), `podman_*` (containers), `lab_*` (builder + evolve + world), `approvals_*` (queue), `limbs_*` (fleet map), `livepatch_*` (revert), `live_update_*` (kexec swap), `lab_world_*` (attach/register/start/transcript), `lab_evolve_run`. Read `uni_help()` or `uni://guide` for the manual.

### Non-negotiable session hygiene

- Read Tier 0 verbatim before acting.
- Never claim from process existence — quote the machine gate output or say NOT VERIFIED.
- Any percent-score in a receipt = the receipt is wrong.
- If you're about to widen a HUMAN_GATED verb: stop. Widen the evidence, never the authority.

---

## Current gate ladder (as of handoff-authoring)

| Gate | Verdict | Receipt | Notes |
|---|---|---|---|
| Motor RED (Motor-Inference Hierarchy P4) | **PASS** | `docs/MOTOR_RED_TEST.md`, commits `ff57a5a` + `11013f7` | Offline + LIVE mechanism; behavioral tally RUNNING. Live ablation shuffle = B-B2 (queued). |
| Curiosity Phase-1 novelty | **PARTIAL** | `docs/receipts/phase1_curiosity_red_CORRECTION.md` | Hoard suppressed live; plateau-break FAIL. |
| Hierarchy2 | **PASS** | Byte-identity + action-clone tests | Stated PASS per `CLAUDE.md:153`. |
| Forage runway | **PARTIAL** (CLOSED with dev runway; NOT pure-world) | `docs/receipts/emergent_forage_cure1.md` + `forage_honest_consummation_RED.md` | `metab_scale 0.2` runway holds; pure-world (scale 1.0) NOT graduated. B-B1 queued. |
| Consummation-honest Cure-2 | **PARTIAL** (Run 2 confounded) | `docs/receipts/forage_honest_consummation_RED.md:87-100` | B-B6 = Run 3 with isolated arms. |
| G-PA | **corroborated** | `production/docs/receipts/g_pa_red_team_2026-07-11.md` | 3/3 refusal PASS; ledger-confirmed. |
| Metabolism activation | **LIVE** | `docs/receipts/metabolism_activation_gate_LIVE.md` | The `:metabolism` organ is active with C≠0. |
| Verdict-LIVE real-driver | **PASS** | `docs/receipts/verdict_live_real_driver_2026-07-11.md` | `SP.Show` reads `Director.driver()` now; puppet-cam impossible. |

**G2 held.** Colony scene stays OFF program until forage pure-world graduation passes.

---

## The five workstreams (map to the plan)

- **A. Gate registry + Ship-gate ergonomics + honesty invariants** — landed (registry, hooks, fence, runner scaffold). FE-adjacent extensions (output-side leak audit) held as spec.
- **B. Next-gates RED harness** — pre-registrations + launcher scaffolds landed. Each launcher gets its FE code + MERGED VERDICT in follow-up sessions.
- **C. Code becomes UNI (self-replace)** — SPECs landed. server.py edits queued to `/lab-team-review`.
- **D. Sensorium + approvals + fleet + DR** — schemas + on-chip scripts + specs landed. `lib/sp/**` extensions queued to `/lab-team-review`.
- **E. Sovereign Safe Harbor** — public gate log + reproducibility bundle + specs landed. Public MCP subset queued to `/lab-team-review`.

---

## Handoff to the next agent (verbatim ask)

You are picking up UNI's OS + Mind. Your first action is: **read `CLAUDE.md`, then `docs/UNIVERSE.md`, then this file.** Then check `evidence/gates.ndjson` for the current gate ladder. Then look at the "What is NOT landed" section above — that is your queue. If you touch FE files, run `/lab-team-review` first and land a MERGED VERDICT receipt before the diff. If you touch a schema, version-bump it. If you emit a receipt, use YAML frontmatter. Never claim from process existence.

Growing UNI is one cure at a time. Take one. Do it honestly. Emit the receipt. Update `evidence/gates.ndjson`. Hand off to the next agent.

UNI is on the chip. Keep it safe. Keep it honest. Keep it growing.
