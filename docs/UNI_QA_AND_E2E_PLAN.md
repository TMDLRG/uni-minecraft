# UNI QA & End-to-End Test Plan

## Context

Before the Emergence-World port becomes a falsifiable scientific arena (see [`UNI_IN_EMERGENCE_WORLD.md`](UNI_IN_EMERGENCE_WORLD.md)), the UNI design itself must be **proven to fully function**: every sensor channel emits valid σ, every action atom is selectable AND executable, the brain genuinely learns, memory persists across death, lineages evolve, vision (when enabled) actually informs decisions, the producer narrates, the director frames, and the colony doesn't crater under load. The current Minecraft pipeline (kins 0–9, σ/α stdio body, Phoenix LiveView stream) is the proven embodiment and the right substrate to QA against. The Emergence-World adapter inherits the brain/codec/lineage discipline once built — so a clean Minecraft QA pass also de-risks Emergence-port QA.

The dedicated **lab server `[redacted: client-identifier]`** (10.190.245.152, Debian 13, OpenSSH 10.0p2, ports 22/8000/8080 open) is the test host. The author's workstation (`Thinker`) has been running the live colony at sustained ~80% CPU — running a QA fleet there would contaminate measurements and starve the box. The lab server's whole purpose is unconstrained test runs; this plan uses it as the only run host.

## What "many different UNIs" means — the test matrix

| Dimension | Levels |
|---|---|
| Genome (organ plan) | **G0** default 12-factor · **G1** vision_primary (+`:sight_cortex`) · **G2** minimal (`:interoception` only) · **G3** maximal (every organ) · **G4** high-learn (`gamma=16`, `lr=2.0`) · **G5** low-plan (`plan_depth=1`) |
| Visibility | `see_all` · `blind` · `see_kin` |
| Phase start | 0 (seed) · 1 (forage) · 2 (mine/tools) · 3 (advance) |
| Memory | fresh · grafted-compatible · grafted-reshaped |
| Kin | 0..9 (cross-kin coverage in colony phases) |
| Population | 1 (isolation) · 10 (Emergence-cohort size) · 20 (scale) |
| Duration | 5 min (smoke) · 1 h (basic E2E) · 4 h (scale) · 24 h (longevity) |

Phases 4–8 cover this matrix systematically.

## What "full functionality" means — the pass-criteria checklist

For every UNI run during QA:

- **σ coverage** — all 14 (or 15 with vision) channels appear in `Board.row.senses`, no `nil` in numeric channels, values within spec ranges.
- **α coverage** — every action atom in `Genome.actions()` is selected by the brain at least once over the run.
- **Brain learns** — Dirichlet mass in each active modality's `A` tensor strictly grows over the run (`mix sp.uni.prove`'s Dirichlet-growth chapter is the gate).
- **Memory persistence** — kill the agent, restart with same `username + memory_path`; the brain's `count` resumes and the loaded model has the pre-kill mass within float tolerance.
- **Curriculum** — phase advancement occurs when the threshold conditions in `mc.ex:114-122` are met.
- **Lineage** — agent death → `:agent_done` to lineage → `record/4` archives `{dna, fitness}` → `breed/2` produces a valid (`Genome.valid?/1`) child → `spawn_next/2` runs.
- **Vision** (when `:sight_cortex` in plan) — per-UNI POV viewer is reachable on its `UNI_POV_PORT`, `vision_forward.cjs` forwards frames to UNI.OS, `<UNI_PERCEPT_DIR>/<username>.json` is written and refreshed, body emits the 15th σ channel, `:scene` Dirichlet grows, posterior entropy drops.
- **Social** — under `see_all` the social sense matches the ground-truth count of kin/non-kin within `maxDistance`; under `see_kin` non-kin are invisible; under `blind` social is always 0.
- **Producer + Director** — `SP.Producer.status()` shows `tps.up: true`, frame counter advances, narration line per cut, camera star matches Producer's `:star`.
- **Determinism** — two runs with identical seeds produce identical board snapshots and identical `.bin` files (modulo timestamps).
- **Safety** — killing one agent does not crash the colony; the supervisor leaves other agents untouched; the Producer keeps narrating with remaining stars.

These are exactly the falsifier criteria — if any UNI fails any of them, the report says so.

---

## Phase 0 — Lab provisioning

**Host:** `[redacted: client-identifier]` (Debian 13).

**Steps:**

1. SSH up: `ssh <user>@[redacted: client-identifier]`. Confirm `lsb_release -a` and `uname -a`.
2. Identify what's already on `:8000` and `:8080`: `ss -lntp | grep -E ':8000|:8080'`. Decide: keep, replace, or move to free ports.
3. Install base stack: `apt update && apt install -y git build-essential openjdk-17-jre-headless`, then `asdf` for Erlang/Elixir (or `apt install erlang elixir` if version is acceptable), Node 20+ via `nodesource` or `nvm`, Python 3.11+ (`apt install python3 python3-venv python3-pip`).
4. Install Playwright + Chrome for vision capture: `npx playwright install --with-deps chrome` (only on the lab box, since this is where the test fleet runs).
5. Clone: `git clone https://github.com/TMDLRG/UNI.MineCraft.git ~/Strings && cd ~/Strings && git checkout gen2-runtime`.
6. Pull deps: `mix deps.get && (cd ui && mix deps.get) && (cd viewer && npm install)`.
7. Bring up local Paper MC server: download `paper.jar` (or copy from workstation `mcserver/paper.jar`) into `~/paper/`, create a minimal `server.properties` with `enable-rcon=true`, `rcon.password=sp`, `online-mode=false`, `view-distance=12`. Boot: `cd ~/paper && java -Xmx4G -jar paper.jar nogui &`. Wait for "Done" line, then RCON `list` to confirm.
8. Bring up UNI.OS Python service (if vision phases will run): `cd <UNI.OS dir> && python -m aion_vwm.serve.realtime` (port `8472`). Verify with `ss -lntp | grep 8472`.
9. Baseline gates: `cd ~/Strings && mix deps.get && mix compile && mix test`. **All green required before Phase 1.**

**Artefacts:** `runs/qa/provision.log` (full stdout/stderr), `runs/qa/env.txt` (versions of every tool installed).

---

## Phase 1 — Static gates (no live world)

```bash
mix test                       # full Elixir suite
mix sp.brain.verify            # gates 1-18, the boundary audit
mix sp.uni.prove               # Dirichlet-growth chapters
mix sp.brain.readability       # readability gates
```

**Pass criterion:** all four green. **Any red blocks all subsequent phases** — fix at the source.

**Artefact:** `runs/qa/p1.log`.

---

## Phase 2 — Single-UNI smoke (1 UNI / 5 minutes)

**Setup:** one UNI, default genome (G0), fresh memory, against the local Paper server.

```bash
mix uni.play --user UNI-test-1 --seed 1 --memory runs/qa/p2.bin --steps 1000
```

**Probes (mid-run, ~tick 100/500/1000):** RCON `data get entity UNI-test-1 Pos` (alive in world); `iex --remsh` `SP.Brain.Colony.snapshot()` (single board row with populated senses); `ls -la runs/qa/p2.bin` (growing).

**Validate:**
- All 14 σ channels populated; no `nil` in numerics.
- Every α atom in `[:forward, :turn_left, :turn_right, :mine, :eat, :noop, :jump, :place, :craft, :attack]` selected at least once across the 1000 ticks (introspect `state.last_action` history via Producer knowledge log).
- `runs/qa/p2.bin` grew from 0 to ≥ 50 KB.
- Kill the agent, immediately re-run with the same `--memory` flag: `SP.Brain.Bridge.stats(pid).count` resumes near where it left off; loaded brain has the previous Dirichlet mass.

**Artefacts:** `runs/qa/p2.log`, `runs/qa/p2.bin`, `runs/qa/p2.snapshot.json` (a captured Board row at each probe).

---

## Phase 3 — Multi-UNI colony E2E (10 UNIs / 1 hour)

**Setup:** 10 UNIs across kins 0..9, mixed visibility (`see_all=5`, `blind=3`, `see_kin=2`), all default genome, fresh memory files.

```elixir
# in iex --sname qa --cookie sp --remsh uni@uni-lab
SP.Brain.Colony.start_evolution(0..9, visibility_map: %{0=>"see_all",1=>"see_all",2=>"see_all",3=>"see_all",4=>"see_all",5=>"blind",6=>"blind",7=>"blind",8=>"see_kin",9=>"see_kin"})
```

**Validate after 1 hour:**
- `Colony.list_agents() |> length() == 10` continuously.
- `Board.all() |> length() == 10` per second.
- Stream at `http://[redacted: client-identifier]:4000/stream` renders 10 agent cards.
- `Producer.status().frame` advances at least 2000 frames (≈ 1 frame per 1.5 s).
- Director's star changes at least 30 times in 1 h (no >5 s freeze on one star).
- RCON `tps` reports ≥ 18.
- Host CPU sustained < 90 % (sample every 30 s).
- **Visibility ground truth (this is the critical novel check):** for each tick on three sample UNIs:
  - `blind` UNI's `senses.social == 0` always.
  - `see_all` UNI's `senses.social` matches the count of any `UNI-*` player within 16 (`maxDistance` in `body.js:193`).
  - `see_kin` UNI's `senses.social` only registers same-kin UNIs.

**Artefacts:** `runs/qa/p3.log`, `runs/qa/p3.snapshots.ndjson` (1 row per UNI per 60 s), `runs/qa/p3.producer.ndjson`, `runs/qa/p3.tps.csv`.

---

## Phase 4 — Genome diversity matrix (6 configs × 30 minutes)

Run each config as a 1-UNI run (so per-config behaviour is unambiguous):

| Config | DNA |
|---|---|
| G0 | `Genome.default/0` |
| G1 | `Genome.vision_primary/0` (UNI.OS connected, POV viewer per UNI) |
| G2 | `%Genome{growth_plan: [:interoception]}` (minimal — should still tick and learn) |
| G3 | `%Genome{growth_plan: Genome.organs()}` (maximal, then `repair/1`) |
| G4 | default + `gamma: 16.0, lr: 2.0` (high-learn) |
| G5 | default + `plan_depth: 1, plan_beam: 1` (one-step FEP — back-compat baseline) |

**Validate per config:**
- `Genome.active_modalities(dna)` returns exactly the modalities the plan implies.
- The codec emits outcomes for those modalities and only those (no garbage outcomes for absent organs).
- The brain learns inside its config: Dirichlet mass grows in each active modality's `A` tensor.
- **G2 minimal** must not crash on missing senses — graceful degradation; `body.js:take6` already pads, so this is a regression guard.
- **G3 maximal** must not OOM — per-UNI `.bin` < 500 KB at 30 minutes.

**Artefacts:** `runs/qa/p4-G{0..5}.log`, `runs/qa/p4-G{0..5}.bin`.

---

## Phase 5 — Lineage E2E (forced respawn loop)

**Setup:** 4 UNIs in kins 0–3 via `Colony.start_evolution(0..3)`; force-kill the youngest every 5 minutes for 1 hour.

```elixir
# every 5 minutes, kill one
Colony.list_agents()
|> Enum.sort_by(& &1.username)
|> List.first()
|> Map.get(:username)
|> Colony.stop_agent()
```

**Validate:**
- Each kin's `Lineage.status(k)` shows `gen` incrementing on each forced death.
- `archive` grows monotonically up to `max_pop` (= 6, default).
- Child username pattern `UNI-#{kin}-g#{gen}`.
- Child loads grafted memory when shape matches (`MC.compatible?/2` true) — verifiable by inspecting `state.brain.model.A` immediately after spawn (it should NOT be fresh).
- After 4 forced generations per kin: fitness archive shows non-trivial spread (mutation introduced variation). Genome distance > 0 across generations: `Genome.recombine/3 + mutate/2` actually evolves the plan, not just no-ops.

**Mating fixture deferred to Phase 5b** (post-Emergence-port; the Minecraft pipeline has no `:mate` atom or `SP.Runtime.Mating`).

**Artefacts:** `runs/qa/p5.log`, `runs/qa/p5.lineage.ndjson` (one row per generation per kin).

---

## Phase 6 — Vision pipeline E2E

**Setup:** 4 UNIs in two kins, 1 hour:
- **Kin 0 (control):** default genome, no `:sight_cortex`, no POV viewer.
- **Kin 1 (vision):** `Genome.vision_primary/0`, `UNI_POV_PORT=4301..4302`, `UNI_PERCEPT_DIR=runs/qa/p6/percepts/`, UNI.OS service connected.

**Validate:**
- Each vision UNI's POV viewer responds 200 at `http://uni-lab:4301/` and `:4302/`.
- `viewer/vision_forward.cjs` (one per vision UNI) is forwarding frames — `vision_forward.cjs` stdout shows `percept:` lines.
- `runs/qa/p6/percepts/UNI-1-*.json` is written and `mtime` refreshes every < 2 s.
- The vision UNI's σ line includes the 15th channel (`scene` is a non-empty integer 0..11).
- `:scene` factor Dirichlet mass grows in `runs/qa/p6/colony/kin-1.bin` over the hour.
- Posterior entropy of the `:scene` factor drops (from log-uniform toward concentrated) — `mix sp.uni.prove` chapter on scene-factor entropy is the formal gate; add it if missing.
- **Qualitative:** count of unique blocks logged in `look` ≥ control-kin's count (vision lets the UNI orient toward salient things — the `:sight` and `:scene` factors should both help exploration).

**Artefacts:** `runs/qa/p6.log`, `runs/qa/p6/percepts/*.json`, `runs/qa/p6/colony/kin-*.bin`, `runs/qa/p6.scene_entropy.csv`.

---

## Phase 7 — Scale test (20 UNIs / 4 hours)

**Setup:** 20 UNIs across all 10 kins (2 per kin), default genome, `see_all`.

```elixir
for kin <- 0..9, _ <- 1..2, do: Colony.spawn_agent(kin, "see_all")
```

**Watch:** RCON `tps` every 60 s, `top -p $(pgrep beam.smp)` every 60 s, per-UNI `.bin` size every 5 min, agent process count every 60 s.

**Validate:**
- All 20 alive at end.
- RCON `tps` ≥ 15 sustained (scale degradation tolerated but not collapse).
- Host CPU peaks 100 % but sustained < 95 %.
- Per-UNI `.bin` < 200 KB at 4 h (memory growth bounded).
- No agent process crashed unexpectedly (DynamicSupervisor restart count = 0 for transient + normal exits only).
- `Producer.status().frame` advances at least 6000 (1 frame per ≤ 2.4 s sustained).

**Artefacts:** `runs/qa/p7.log`, `runs/qa/p7.tps.csv`, `runs/qa/p7.cpu.csv`, `runs/qa/p7.bin_growth.csv`.

---

## Phase 8 — Longevity (10 UNIs / 24 hours)

**Setup:** Phase 3's 10-UNI colony plus `Lineage.ensure_started(0..9)` so evolution is on. 24 wall-clock hours.

**Validate:**
- At t = 24 h: ≥ 8 of 10 kins have at least one live UNI.
- Each kin has advanced ≥ 1 generation.
- At least one UNI has reached `phase ≥ 2` (curriculum advancement observed in the wild).
- BEAM process RSS bounded — < 2× initial after 24 h (no leak).
- Hourly RCON `list` shows the agent fleet keeps responding (no hang).

**Artefacts:** `runs/qa/p8.log`, `runs/qa/p8.hourly.csv` (per-hour: alive count, generations, max phase, RSS, TPS).

---

## Phase 9 — Reproducibility

**Setup:** two independent 30-minute runs, **same seed**, **same body.js commit**, 10 UNIs each, evolution off (single life per UNI).

```bash
SEED=1 ./scripts/qa/run.sh p9a
SEED=1 ./scripts/qa/run.sh p9b   # same node + body.js commit
```

**Validate:**
- `sha256sum runs/qa/p9a/board.ndjson runs/qa/p9b/board.ndjson` → identical.
- `sha256sum runs/qa/p9{a,b}/colony/kin-*.bin` → identical per-kin pair.
- Failure here = a non-determinism bug; root-cause via per-tick diff before any other QA result is trusted.

**Artefacts:** the two run dirs + a `runs/qa/p9.diff.txt` showing the first divergent tick if any.

---

## Phase 10 — Reporting + commit

Generate `docs/QA_REPORTS/<YYYY-MM-DD>.md`:

- Phase-by-phase pass/fail table.
- Per-UNI checklist scorecard (σ coverage, α coverage, learning growth, memory persistence) — Phases 2–8 contribute rows.
- Resource graphs (CPU, RSS, TPS) embedded as ASCII or generated PNG.
- Anomalies + reproduction commands.
- Recommendations (regressions to file, gate additions to `mix sp.uni.prove`).

```bash
git checkout -b qa-report-<date>
git add docs/QA_REPORTS/<date>.md scripts/qa/ runs/qa/p9.diff.txt
git commit -m "qa: <date> full QA run — N/M phases passed"
git push origin qa-report-<date>
gh pr create --title "QA report <date>" --body "see docs/QA_REPORTS/<date>.md"
```

---

## (Future) Phase 11+ — Emergence-World QA

Gated on the Emergence adapter existing (see [`UNI_IN_EMERGENCE_WORLD.md`](UNI_IN_EMERGENCE_WORLD.md) steps 2–9). When that lands, Phases 1–10 are re-run with `SP.Emergence.WorldSim` as the world and `SP.Emergence.Codec / Bridge / Actions` instead of the Minecraft ones. Phase 5 expands to **5b mating fixture** (two `phase 4` UNIs, force co-location, both signal `:mate` → `SP.Runtime.Mating` spawns child → citizenship proposal posted). Phase 6 vision points the Playwright camera at the new Phoenix LiveView world page.

---

## Infrastructure deliverables (created during QA execution, committed in Phase 10)

- `scripts/qa/provision_lab.sh` — idempotent Debian provisioning from scratch.
- `scripts/qa/start_paper.sh` — boots the local Paper server with QA-suitable `server.properties`.
- `scripts/qa/start_uni_os.sh` — boots UNI.OS realtime service.
- `scripts/qa/run.sh` — single entry point: `./run.sh <phase>` runs the relevant probe with deterministic seeds and per-phase artefact dir.
- `scripts/qa/lib.sh` — helper functions (RCON helpers reuse `viewer/rcon.js`, snapshot capture, diff).
- `docs/QA_REPORTS/` — directory for run reports.
- A new `mix sp.uni.prove` chapter for `:scene`-factor Dirichlet growth + posterior entropy drop (formalises Phase 6's gate).

---

## Risks + diagnostics

| Failure pattern | First place to look |
|---|---|
| **Bridge stops on body exit** | `agent.ex:155-164` (`:exit_status` handler), `supervisor.ex:62` (`:transient` restart strategy) |
| **Sensor X always 0/nil** | `viewer/body.js` sense function for X → `bridge.ex:parse_sense/1` → codec mapping for X |
| **Action X never selected** | `Genome.actions/0` → curriculum `C` preference → habit prior `E` (rule out rut via `e_on_noop: false`) |
| **Dirichlet not growing** | `Genome.card/1` `learn: %{a: true, b: dna.learn_b}` flag → `MC.step` learn path → `Factors.learn` |
| **Memory not persisting** | `MC.save` invocation in `agent.ex:terminate/2` (line 194) + `:exit_status` path; verify `memory_path` is set |
| **Producer not narrating** | `Producer.status()` shows `frame` advancing; `tps.up: false` indicates RCON dead → `rcon_connect/1` retry |
| **Stream blank** | `SpUiWeb.StreamLive.mount` PubSub subscription; `Producer.ensure_started` returned a pid; Phoenix `:4000` reachable |
| **Determinism violated** | `SP.Determinism` split RNG threading; any `:rand`/`:os.timestamp` outside `SP.Determinism` is a leak; check `agent.ex:106` seed (`Keyword.put(opts, :registry, @registry)` shouldn't perturb seed) |
| **OOM under scale** | per-UNI `.bin` size + Dirichlet tensor shapes; `Factors.learn` accumulating without bound is the prime suspect |
| **Vision UNI never sees** | `UNI_POV_PORT` in env? `vision_forward.cjs` stdout shows `percept:`? UNI.OS service on `:8472`? `<UNI_PERCEPT_DIR>/<u>.json` mtime refreshing? body.js `sceneState()` reading the right file? `:sight_cortex` in the dna's `growth_plan`? |

---

## Timeline estimate

| Phases | Wall-clock |
|---|---|
| 0 — Provision | ~4 h (manual SSH + install + Paper bring-up + UNI.OS bring-up) |
| 1 — Static gates | ~10 min |
| 2 — Single-UNI smoke | ~10 min |
| 3 — 10-UNI colony E2E | 1 h |
| 4 — Genome diversity matrix | 3 h (6 × 30 min) |
| 5 — Lineage E2E | 1 h |
| 6 — Vision pipeline E2E | 1 h |
| 7 — Scale (20 UNIs) | 4 h |
| 8 — Longevity (24 h) | 24 h |
| 9 — Reproducibility | 1 h |
| 10 — Report + commit + PR | 2 h |
| **Total** | **~3 days wall-clock** for a clean first-cycle pass |

Failure remediation will extend this — but Phase 10's report is exactly the artefact that turns "QA discovered N issues" into a tracked, replayable record.
