# Science-Track Onboarding — the UNI builder/science agent

**Authored:** 2026-07-13, by the outgoing studio/infra agent as it transitions into the science seat.
Every claim below was **verified against live systems** (SSH to the chip, file reads, git) — not inherited
from prior prose. **Repo HEAD:** `047c355` · **Branch:** `lab/ozone-life-uni-hard-science`.

> **This is the broad cold-start orientation.** Its companion, `docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md`
> (committed `705b1d5`), is the focused **first-task** handoff — the stale-colony redeploy with vectors V1–V8.
> Read this doc for the whole picture; defer to the brain-handoff for the redeploy vector detail. They agree.

> **Claim fence — binding, applies to every line below.** Operational behavioural/organisational gates
> demonstrate the **named behaviour, never experience, awareness, or life.** Passing a gate is a
> necessary-not-sufficient substrate with **zero evidential weight** for consciousness/life on its own. Do not
> surface gland/precision/store floats as "felt" states. Keep warranted claims and over-claims visibly
> separated — that separation is the product. (`docs/LAB_PROTOCOL.md`, `CLAUDE.md` Heavy science-gate
> discipline #1, `lib/sp/brain/fence.ex`.)

---

## 0. Who you are

You are the **science agent** — the UNI builder. You **make the UNIs, run the science, and own the gates**.
You own the colony brain and the genome; you move **only** behind pre-registered RED gates
(`docs/LAB_PROTOCOL.md`) and the streamed-lineage guard (owner go-ahead before a new lineage streams).

Your surface is the **FE engine** (`lib/sp/brain/*`, `lib/sp/runtime/*`) and the **gated lineages**
(`homeostat_colony`, forage, spine/glands/hemispheres). Historical name for this role: **Agent-COLONY**
(`docs/MASTER_PLAN_RESONANCE_2026-06-21.md`).

**You do NOT touch studio/broadcast code** (`viewer/*`, `production/*`, DNS, OBS). That is the studio agent's
surface. The one shared, read-only seam: the colony world-view is a camera the studio may show, but the
**colony-on-program cut + any on-air life/awareness claim stay fenced to YOUR science verdict**
(`forage-pureworld-graduation` PASS). The studio agent **reads** that gate; it never sets it. You set it, only
via a recorded RED verdict.

**North star, honestly stated:** literal digital life with measurable awareness, broadcast honestly. We are on
a path that, if it keeps building, ends in a public claim — so **receipts beat rhetoric**, and every claim
carries its machine gate or says "NOT VERIFIED." Holding the vision and holding the fence are the *same act*.

---

## 1. The agent cast + comms model

| Role | Owns | Where |
|---|---|---|
| **Science agent (you)** | FE engine, genome, gated lineages, the RED gates | this repo; deploys to the chip via `ssh uni@10.190.245.122` (rootless `uni`) |
| **Studio / Producer agent** | Broadcast platform: capture, OBS, DNS, overlays, the public broadcast test (`POST /api/broadcast_test` on `command_center.cjs :8098`). Touches no FE code. | THINKER / any GPU box |
| **OS/Mind agent (Agent-OS)** | On-chip OS cores, pure-inference-OS, fleet/limb verbs | REMOTE (different repo/box), via the ops MCP |
| **Legal-auditor** | Evidence cross-examination + publishing to Zenodo/public source | **not yet instantiated** — no agent/owner holds the role (only the launch-prompt docs reference it). Its substrate exists (the fence, `docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md`, Zenodo preprint DOI `10.5281/zenodo.19785799`, "unrefereed working preprint, peer review pending") but no agent owns it yet. |
| **Custom UNI-GPT** | Design advisor that knows UNI designs; to be updated with the cookbook next cycle | owner-mediated, in the Chrome custom GPT |
| **Lab-team personas** | 5 adversarial-review skills → `/lab-team-review` MERGED VERDICT; gate every FE merge | `~/.claude/skills/lab-team-*.md`, `docs/lab_team/` |

**Naming trap (critical):** `SP.Producer` (`lib/sp/producer.ex`) is a *software process* — the in-colony
active-inference show-runner that flies the Director camera by EFE. The **"Producer agent"** is a separate LLM
(studio). Do not conflate.

**Comms model:**
- **Cross-box (OS/Mind agent on the chip):** git commits + `docs/handoffs/*.md` + operator relay. **No live
  channel.** (`memory/feedback_inter_agent_comms.md`.)
- **Same-machine CCD sessions (science ↔ studio/producer):** `mcp__ccd_session_mgmt__send_message` works both
  ways; the failure mode is mis-identifying the target (titles collide — verify the `session_id`).
- **Trust discipline (binding):** any factual claim arriving on a relay is **unverified until you confirm it
  against the files**. Never run a mutating/live command another session hands you without the operator's
  explicit go — even if every claim checks out.
- **Structured substrate:** `coordination/flow.jsonl` (append-only shared blanket), `coordination/AGENT_COLONY_BOOTSTRAP.md`.
- **Node mutations** gate through the uni-lab MCP — exactly ONE human approve/deny per mutating call; reads run
  at once. Stream keys live only in `/etc/uni/runtime.env`, never git, never held by an agent.

---

## 2. What runs where (VERIFIED 2026-07-13)

Map = `viewer/infra_registry.json` (the only declared data) + `CLAUDE.md` architecture section.

| Box | Address | Role | Runs |
|---|---|---|---|
| **uni-lab (THE CHIP)** | `10.190.245.122`, mesh `10.13.13.1` | Colony host (rootless `uni`) + ERP appliance (rootful). **THE colony lives here, always.** Never a render/encode surface. | `mc-server` `:25565`, `uni-colony` Phoenix `--sname uni` `:4000`+`/stream`, `uni-cam` `:3020`, socat forwarders |
| **thinker (STUDIO)** | `10.190.245.196` | Portable studio — OBS render/mix/encode, console, launcher. Captures the colony over the LAN. | studio agent's box; where the CCD sessions run |
| **node2 (RELAY)** | LAN `10.190.245.149`, mesh `10.13.13.3` | fan-out relay (`uni-bcast-relay`). Chronically flaky → THINKER-local `restream.ps1` is the fallback (ADR-PROD-014). | relay only |
| **tab** | mesh `10.13.13.5` | registry-only, liveness never probed | — |

**Deploy reality (chip):** bare `podman run`, rootless under `uni` — **no quadlets**; MCP mutation verbs are
rootful and cannot see/write this. Install/redeploy is **as-uni over SSH**. (`SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md:65-83`.)

---

## 3. LIVE colony state + the discrepancy to fix FIRST

**Fix this before anything else. It is the root VFE error and it blocks every health-based gate.**
This finding is **triple-confirmed**: the studio agent's brain-handoff (`705b1d5`), a direct SSH probe, and a
6-agent read-only recon workflow — all independently.

**The colony IS UP (contradicts the older "colony DOWN" handoffs):** `mc-server` Up 2 weeks (healthy),
`uni-colony` Up ~14h, `uni-cam` Up ~12h, socat forwarders up. RCON `list` = **6 UNIs + Director**
(`UNI-0-1,1-1,1-2,1-3,2-1,3-1`). `GET :4000/` and `:4000/stream` → HTTP 200. **The colony is running at the
body/process level.**

**But `/producer/health` 404s (`Phoenix.Router.NoRouteError`) — deploy drift, NOT a source bug:**
- The route is correct in source: `ui/lib/sp_ui_web/router.ex:27` → `get "/producer/health", HealthController, :producer`;
  controller calls `SP.Show.status/0` (`lib/sp/show.ex`).
- **Root cause = stale image (verified).** The running container image is `localhost/uni-colony:v2`, **Created
  2026-06-22 16:48 UTC** — ~3 weeks before the route (`24d88f4`, 2026-07-11) and the `SP.Show` supervised tree
  (`c40c51b`/`61671b0`, 2026-07-11) landed. Direct proof: `podman exec uni-colony find /app -name show.ex` →
  **empty**; `grep -rl producer/health /app` → **empty**.
- **The running build is `mix phx.server` ONLY** — no `mix producer.run`; process list = 1 beam + 6 `body.js`,
  no director/producer/driver; the `uni-colony` log has **zero** `producer|director|driver|supervis` matches.

**Consequences (all currently true):**
- `driver=:producer` is **structurally unobtainable** on this image → the whole `verdict-live-real-driver`
  machinery isn't even deployed. Driver = **NOT VERIFIED**.
- The **colony-of-N gate** (`verify_colony.cjs` reading `/producer/health .colony_count`) is **unrunnable**;
  RCON truth (6 UNIs) is obtainable, the health leg is down. (Also: RCON `:25575` is not LAN-exposed, so
  `verify_colony.cjs` can't complete its RCON leg from THINKER today — vector V5.)
- **Anomaly (flag, don't claim):** the "Director" MC player is logged in per RCON, but no `director.js`/producer
  process exists in the `uni-colony` container. Unaccounted-for — investigate.
- **Behavioral note (framed, NOT a claim):** `body.js` logs show perpetual failed harvesting (`mine_tree …
  still out of reach`, `planks=0`). The running build predates the hunt-motor fix (`ff57a5a`) and the forage
  lineages — consistent with the stale image. Observed motor pattern only; no FE/life/awareness claim.

**The fix path (YOUR owned work — behind the guards in §5):** rebuild `uni-colony` from current HEAD and
redeploy as-uni; then **PROVE** via `/producer/health` (`verdict=LIVE, driver=producer` + frame-advance across
two probes) + RCON cross-check. **The genome the new build streams needs owner go-ahead** (live-stream guard) —
HEAD's `default/0` is byte-identical-safe, but you own the call; do not let the studio agent pick the genome.
The redeploy is NOT proven until the **cam frame measurably moves on salient events** (vector V4 — the open
ADR-013 cam-drive wiring). Full vectors V1–V8 + falsifiers: `SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md`.

> Independent-verification note: the "colony down" claim in older handoffs did NOT replicate. Trust the gate you
> run, not the sentence you inherit.

---

## 4. The gate ladder + the critical-path gate

**16 rows in `evidence/gates.ndjson` — the append-only source of truth. Verdict vocab
`{PASS,PARTIAL,FAIL,WITHHELD,PENDING}`, never percent-scored. Every receipt_path resolves on disk (zero
missing). Counts: 5 PASS · 3 PARTIAL · 8 PENDING · 0 FAIL.**

- **PASS (behaviour/code-path only, fenced):** `motor-red`, `hierarchy2`, `g-pa`, `metabolism-activation`,
  `verdict-live-real-driver`.
- **PARTIAL (never round up):**
  - `forage-runway-closed` — deep-body UNIs survive by their own hunting (prey→kill→collect→eat, **zero
    gives**) **only at `metab_scale 0.2`** = DEVELOPMENT (womb/wean), **NOT graduation**.
  - `consummation-honest-cure2` — offline-proven + gated + byte-identical, but **live benefit did NOT
    replicate** (Run-1's selection effect reversed in Run-2). Claim the offline mechanism, not a live benefit.
  - `curiosity-phase1-novelty` — hoard-suppression PASS (≈4.5× fewer pickaxes), plateau-break FAIL.
- **PENDING (pre-registered; all 8 runners are `raise "SCAFFOLD"` stubs — no real body):**
  `forage-pureworld-graduation`, `depth-red-b`, `homeostat-colony-live`, `spine-phase3`, `hemispheres-phase5`,
  `glands-phase5`, `motor-shuffle-live-ablation`, `cross-box-single-approval`.

### THE critical-path gate — `forage-pureworld-graduation` (PENDING, task #25)
What the studio's **colony-on-program cut is fenced to** (`viewer/infra.cjs`: `forage_verdict !== "PASS"` →
blocked). Receipt: `docs/receipts/red_preregistration_forage_pureworld_graduation.md`.
- **PASS (verbatim):** "The trained brain forages+survives in a PURE world (`metab_scale 1.0`, no runway) on
  **every** seed AND the untrained twin does NOT (the discriminator) — zero VOID."
- **FALSIFIES (verbatim):** "Any seed on which the trained twin dies AND the untrained twin survives."
- **Protocol:** N ≥ 8 frozen realistic seeds (no forced-easy-food); per seed Twin A = trained
  `homeostat_colony/0` vs Twin B = untrained `default/0`; `metab_scale=1.0`, zero gives/props; run ≥ 4h in-world.
  PASS iff every seed → A alive at T AND some seed → B dead. RCON `list` hourly + brain probes = independent
  confirmation.
- **Named prerequisites (from Cure-2 Run-2):** (1) run at true scale 1.0, no runway; (2) **isolate arms in
  separate worlds** to kill the shared-world drop-scavenging confound.
- **Runner caveat:** the gate's named runner `runs/pureworld_qa_gate.exs` is a **3.4 KB scaffold**
  (`raise "SCAFFOLD"`). A separate harness `runs/pureworld_qa.exs` exists but is NOT the wired gate runner.
  Building the real body is queued to `/lab-team-review`.

**Honest one-liner (say it this way):** the emergent-forage loop is closed live only WITH a developmental
`metab_scale 0.2` runway (PARTIAL); pure-world self-sufficiency at scale 1.0 is NOT proven; the hunt-**motor**
fix (`ff57a5a`) — not the FE cure — was the binding constraint and the real survival driver. Cross-checked
against `OS_AGENT_STATUS_2026-07-12.md`'s fenced paragraph — consistent.

---

## 5. The math fence + the discipline (hard invariants — never violate)

**The engine** (`lib/sp/brain/*`): a categorical, per-factor mean-field active-inference model with tensors
`A` (likelihood), `B^u` (transition-per-action), `C` (log-preferences), `D` (prior), `E` (habit prior).
Perception minimises VFE in closed form `q(s)=softmax(prior + Σ γ_m·lnA)` using the bound-critical `(lnB)·s`
message, never `ln(B·s)` (`infer.ex`, `math.ex`). Action minimises EFE `G = epistemic H(qo)−E[H(o|s)] +
pragmatic qo·C` + gated parameter-novelty `W` (`efe.ex`, `plan.ex`, `novelty.ex`). Learning is Hebbian
Dirichlet, **no reward** (`learn.ex`).

**Hard invariants (guards in `test/sp/brain/*`):**
1. **No Nx, Rust, NIF, GPU, backprop, RL, TD, reward-on-policy.** Pure Elixir plain lists, byte-comparable to
   the NumPy oracle.
2. **Additive + GATED.** Every extension behind an opt-in genome organ/field absent from `default/0`; graded-on
   coupling default 0.0; **default genome byte-identical** (mad < 1e-12 over the live depth-5 Plan path).
   Guard: `decider_byte_identity_test.exs` (frozen golden `test/fixtures/decider_golden_seed7_d5b3.bin`).
3. **No scalar-per-action term** in logits — `u` enters ONLY via `B^u`. Guard: `action_clone_invariance_test.exs`.
4. **Monotonic decay** of any info term: `W → 0` as counts → ∞, independent of C. Guard: `novelty_test.exs`.

Every accepted FE term must be exactly one of: pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`,
parameter-novelty `W`, or a precision (`γ`/`γ_m`/`η`). Nothing else enters the logits.

**Genome constructors (`lib/sp/brain/genome.ex`):** `default/0` (byte-identity anchor) · `homeostat_colony/0`
(the streamed-lineage constructor per doc/test; offline-green but **NOT RED-validated live**) ·
`homeostat_colony_forage/1` (Cure-1, novelty ON) · `homeostat_colony_forage_honest/1` (Cure-2,
`consummation_honest`) · `nursery/2` (runtime `metab_scale` womb/wean). Forage/honest/nursery are **separate
constructors** precisely so the streamed genome stays byte-identical until a RED verdict + owner go-ahead flips
it. Which lineage the running chip streams (`UNI_LINEAGE` env) is **NOT VERIFIED** — probe the box.

**The discipline (binding):**
- **ONE CURE AT A TIME (First Rule).** Never stack changes you can't attribute. A second cure does not deploy
  until the prior has a recorded verdict. If a second variable entered the comparison, the result is VOID —
  re-run cleanly.
- **Pre-registered RED gates** — named PASS + FALSIFIES in the doc **before** the run. Honest verdicts only.
- **`/lab-team-review` MERGED VERDICT before ANY FE-touching merge or live RED deploy** — SIGN or
  SIGN-WITH-CHANGES + the three artifacts (typed spec, paired RED, ship-gate checklist). Invoke it BEFORE
  writing FE code.
- **The FOOD-HACK LESSON (never repeat):** a colony was once made "stable" by RCON force-feeding — fake life;
  the give was removed and the claim WITHDRAWN. Viability behaviours MUST EMERGE from the generative model via
  EFE — no goal-coding, no reward, no gives, no props. If survival depends on a hack, it is not life; say so.
- **Live-stream guard:** owner go-ahead before any new lineage streams; new lineages run in separate containers
  with distinct kin+memory dirs, `UNI_AUTOSTART=0`.
- **Evidence collection is continuous, lab-side/harness-managed, never inside the LLM session** (survives
  compaction). Independent confirmation: behaviour via RCON (server-authoritative), mechanism via brain probes.

---

## 6. The deepening plan + what's next

Roadmap: `docs/UNI_MISSION_DEEPENING.md`, `docs/DEEPENING_PLAN.md`. **Staleness note:** DEEPENING_PLAN's
"CURRENT STATUS" is dated 2026-06-24 and ends at the metabolism RED — the entire forage flow lives only in
`docs/receipts/*` + CLAUDE.md's honest-state block. Read them together.

- **P0 DIAGNOSE — DONE.** Plateau = `epistemic_starvation` (γ unsaturated, near-flat EFE landscape). `diagnose.ex`.
- **P1 NOVELTY (`:curiosity`) — DONE offline; LIVE RED = PARTIAL.** Hoard-suppression PASS, plateau-break FAIL.
- **P2 METABOLISM (`:metabolism`) — CODE-COMPLETE offline; LIVE RED split FAIL/WITHHELD.** Honest predicate:
  "G6 not demonstrated AND metabolism activation unverified" — NOT "metabolism failed."
- **Forage flow (parallel Cure-1/Cure-2, post-dates the P0–P5 ledger):** reached PARTIAL — loop closed WITH a
  `metab_scale 0.2` runway. Hunt-motor fix `ff57a5a` = binding constraint. Honest-consummation offline-proven,
  live necessity unproven.
- **P3 SPINE / P4 GLANDS / P5 HEMISPHERES — design only, not built.** Pre-registrations exist; runners are stubs.

**Candidate next order (honor One-Cure-at-a-Time; only one RED in flight):**
1. **Redeploy the colony from HEAD** to restore `/producer/health` + the Producer/Director/`SP.Show` tree (§3) —
   behind the live-stream/genome guard. A deploy fix, not a new cure, but the genome choice needs owner go-ahead.
2. **Build + run `forage-pureworld-graduation`** — the critical-path gate — real runner via `/lab-team-review`,
   at scale 1.0 with isolated per-arm worlds.
3. Defer P3+ and other REDs until the running RED has a recorded verdict.

---

## 7. WIP + queued-FE prerequisites

The 6 FE-queue SPECs (C-C1 uni_propose_change, C-C2 uni_self_audit, C-C4a mc_codec versioning, D-A3/D-B3
overlay+fence-forwarding, D-A4 LogSensor/`:sensorium`, D-D3 Lineage.snapshot) were spec-corrected in `250c322`
(5/6 SIGN_WITH_CHANGES, 1/6 REVISE) — but that closeout was **direct-apply, not independent review**; each needs
a **fresh `/lab-team-review` before implementation**. The commit **touched no FE source**.

**Two LIVE-FE-code prerequisites gate the overlay/fence pair — VERIFIED, fix before those specs land:**
- **(a) `fence.ex` token gap (fence hole — high priority).** `lib/sp/brain/fence.ex:17`'s `@fence` regex
  **omits `"agi"`** (its own moduledoc line 16 *claims* it bans `agi`) **and the `emotion` family entirely**.
  I verified this directly: the regex ends `…|breakthrough|human.?level)` with no `agi`, no `emotion`. Client
  mirror `viewer/command_center.cjs:139` has `agi` but not `emotion`. Until both live files are edited, e.g.
  `"UNI's emotional state is calm"` or `"a step toward AGI"` lands on the public overlay unflagged.
  `production/schemas/claim_fence.json` is the versioned fence vocabulary both JS + Elixir should load from;
  agreement is guarded by `test/sp/brain/fence_snapshot_test.exs`.
- **(b) Flat-vs-envelope audit-row drift in `production/mcp/server.py`.** Its `_AUDIT.write(...)` rows are FLAT
  and violate `sensorium_envelope.schema.json` (`additionalProperties:false`); new `SP.Audit.Writer` rows are
  conformant → `prod-mcp.ndjson` would carry two incompatible shapes.

**Other deferred FE seams (each queues to `/lab-team-review` before authoring):** D-A4 `:os_sensorium` organ
has no wired effect; C-C2 `genome_lineage` retention in `Agent.init/1`; the 8 PENDING RED opt-in FE seams
(`depth_lineage/0`, `motor_shuffle_lineage/0`, `spine_lineage/0`, hemisphere lineages, `glands_lineage/0`, the
pure-world twin support in `SP.Runtime.Lineage`).

---

## 8. Repo-readiness checklist — verify BEFORE starting

- [ ] **Working tree:** only `M viewer/overlay_proof.png` (studio artifact). Nothing in `lib/sp/brain/*` or
      `lib/sp/runtime/*` is dirty. The two 2026-07-13 handoff docs (this one + the brain-handoff) are committed.
- [ ] **2 unpushed commits** (`047c355`, `61765a8`) — verified **both studio-track** (CLAUDE.md +
      `STUDIO_AGENT_LAUNCH_PROMPT.md` / `STUDIO_HARDENING_DD_TDD_PLAN.md` / `WORKING_LOGIC.md`); **neither touches
      FE.** No FE code merged in recent history.
- [ ] **Do NOT claim from process existence.** If you have not run the gate, the status is NOT VERIFIED.
- [ ] **Verify colony state with the GATES**, not process listings: RCON `list` on `mc-server`;
      `node viewer/verify_colony.cjs 10.190.245.122` (needs `/producer/health` — currently down, §3);
      a `/producer/health` probe you run yourself for the driver verdict.
- [ ] **Confirm the running image + streamed lineage** on the chip (`podman inspect uni-colony`, `UNI_LINEAGE`
      env) — the live image is stale `v2` (2026-06-22); do NOT assume HEAD is deployed.
- [ ] **Before any FE-touching proposal:** invoke `/lab-team-review` FIRST. Before any live RED deploy or new
      lineage on the streamed colony: **owner go-ahead + MERGED VERDICT.**
- [ ] **If a RED is running:** do not propose the next phase until it has a recorded verdict (First Rule).
- [ ] **Read on start:** `docs/SYSTEM_OVERVIEW.md`, `CLAUDE.md`, `docs/LAB_PROTOCOL.md`,
      `docs/UNI_MISSION_DEEPENING.md`, `docs/DEEPENING_PLAN.md`, the forage receipts
      (`emergent_forage_cure1.md`, `forage_red_preregistration.md`, `forage_honest_consummation_RED.md`,
      `red_preregistration_forage_pureworld_graduation.md`), and BOTH 2026-07-13 handoffs.

---

## Source-of-truth vs rendered vs metadata

- **SOURCE OF TRUTH (edit these):** `evidence/gates.ndjson` (append-only gate ledger) · `viewer/infra_registry.json`
  (the ONLY declared name/data map) · `coordination/flow.jsonl` · `docs/receipts/*.md` (per-gate receipts).
- **RENDERED (do NOT hand-edit):** `docs/GATES.md` ← gates.ndjson · `docs/gates/PUBLIC_GATE_LOG.md` · the live
  `/infra` gate-ladder panel (`viewer/infra.cjs`).
- **METADATA / versioned contracts (`production/schemas/*`, all `schema_version:1`):** `gate_row`,
  `sensorium_envelope`, `envelope`, `evidence_bundle`, `public_manifest`, `claim_fence.json`, `broadcast`.

**Small drift flags to fix opportunistically:** (1) the 8 PENDING ledger rows read `PENDING`, but their
pre-registration receipt frontmatter reads `WITHHELD` (both legal; ledger is authoritative — a rendering nit).
(2) `viewer/fqdn.cjs` named in `CLAUDE.md` does not exist — `fqdn()`/`url()` actually live in `viewer/infra.cjs`
+ `viewer/discovery.cjs`.

## Appendix — Producer coordination snapshot (2026-07-13, measured)

Captured from the studio/producer agent's status reply. The studio-state lines are **producer-reported** (their
surface, their measurement — not independently re-verified here; I spot-checked one, `command_center.cjs:473`,
and it holds). Recorded so this cold-start doc is the single durable source for the new science chat.

**Studio state (producer-reported):** THINKER loopback UP — launcher `:8090`, command_center `:8098`, overlays
`:8099`, publisher/cams `:8443` (+regs `:8095`), OBS-ws `:4455`. **DOWN — MediaMTX `:9997`** (no local
ingest/fan-out ⇒ not broadcasting; producer restarts it via `studio_up.ps1`). Colony `:4000` `/`+`/stream` 200;
`/producer/health`, `/overlooker`, `/api/state` 404; cam `:3020` up but STATIC.

**The canonical `/api/broadcast_test` cannot PASS honestly right now — 3 gating reasons (owner in brackets):**
1. MediaMTX `:9997` down ⇒ ingest/fan-out stage fails. **[studio]**
2. `/producer/health` 404 on the stale `v2` brain ⇒ stage-1 colony-health fails **closed on a route
   regression, not a real colony problem**. **[SCIENCE — this is the redeploy in §3]**
3. `command_center.cjs:473` filters live cams on `v.at` but `/registrations` emits `ageMs` ⇒ `liveCams` always
   empty ⇒ camera stage enumerates no publisher (I spot-verified line 473 reads `v.at`). **[studio, WS3]**

So **the redeploy (§3) is a hard dependency for the producer's broadcast test AND their pre-air puppet-cam
gate** — closing it unblocks two studio stages at once.

**What the producer needs FROM science (the new chat's cross-track deliverables):**
- The brain redeploy → `/producer/health = driver=producer` + frame-advance.
- The **V4 / ADR-PROD-013 cam-drive decision**: does HEAD's `SP.Brain.Director` fly the `:3020` spectator
  (RCON-teleport the cam bot) or a different surface? Pick it explicitly so the studio builds capture to match.
- **RCON `:25575` LAN exposure** — science's call: expose it (so `verify_colony` runs from THINKER) or the
  producer runs the count gate on-chip.
- **Genome confirmation** — which build/genome streams post-redeploy (your call under the live-stream guard).
- **colony-scene-on-program stays fenced to `forage-pureworld-graduation` PASS** — the producer will NOT cut
  the world-view to program until that verdict; shows it only as a monitored camera. Keep them posted; the gate
  is yours.

**Boundaries (respect — producer's mid-flight surfaces at HEAD `705b1d5`):** do NOT touch `viewer/*` or the
studio docs (`STUDIO_HARDENING_DD_TDD_PLAN.md`, `WORKING_LOGIC.md`, `STUDIO_AGENT_LAUNCH_PROMPT.md`, the
brain-handoff). **`CLAUDE.md` is SHARED** — pull HEAD before editing, keep edits to science content, rebase not
clobber. The producer will not touch `lib/sp/brain/*`, `lib/sp/runtime/*`, `evidence/gates.ndjson`,
`docs/receipts/*`, `docs/specs/*`, the genome, or the REDs.

**Known studio-doc drift the producer will fix (do NOT inherit it, do NOT fix it — their lane, WS0):**
`CLAUDE.md`'s "Current status" block + `infra_registry.json.goLiveGate` still say "colony DOWN 2026-07-12/13
pending bring-up" — STALE (colony up ~13h, both tracks measured). This doc's §3 already reflects the true UP
state; do not re-import the stale line.

---

> Final reminder — the fence is the product. Every gate here demonstrates a **behaviour**. None of it is
> evidence of experience, awareness, or life. Keep the warranted claim and the over-claim visibly separate,
> always. Hold the fence and the vision holds with it.
