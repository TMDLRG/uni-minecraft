# RESUME — Rung-1 graded-viability build (pre-reboot handoff, 2026-07-11)

> **POST-REBOOT AUDIT (2026-07-11 10:29): ALL REVALIDATED GREEN** — brain suite 315/0, the three offline
> gates GREEN/GREEN/4-4-VIABLE, lab box clean, ONE Phoenix node. Current cross-agent state + the owner's
> keyless-soak→flip-live directive: **`docs/PROJECT_STATUS.md`** (read that first; this doc is the deep
> brain/body state behind it).

> **Read this first on resume.** Full, deep, self-contained state so work continues cleanly after the dev-box
> reboot. Branch `lab/ozone-life-uni-hard-science`. Everything below is COMMITTED (git); the only uncommitted
> files in `git status` (viewer/*, production/, docs/UNI_PRODUCTION_PLATFORM.md, ui/runs/*.bin) are the
> broadcast/production track — **NOT this work** — leave them.

## Revalidation snapshot (all green at handoff)
- `mix test test/sp/brain/` → **315 tests, 0 failures** (byte-identity `decider_byte_identity` mad<1e-12 +
  `action_clone_invariance` + motor config posterior **0.75** unchanged).
- `mix run runs/verify_v2_isolation.exs` → **GREEN** (8/8).
- `mix run runs/verify_rung1_step1.exs` → **GREEN** (5/5).
- `mix run runs/verify_rung1_dynamics.exs` → **4/4 STRUCTURE VIABLE**.

## The arc this session (what happened, with receipts)
1. **v1 metabolism regulation gate = FALSIFIES** (`docs/receipts/metabolism_regulation_gate.md`, commit
   `61850cd`, adversarially verified `wf_66947cb9`). median D +0.073 < 0.10 bar AND survival floor T<C.
   Setpoint effect real but sub-committed + a viability cost.
2. **v2 (confound-free isolation) regulation gate = FALSIFIES** (`docs/receipts/metabolism_regulation_gate_v2.md`,
   commit `3526f76`, verified). N=12; median D +0.044 < 0.10; CI [-0.128,+0.053] includes 0; **survival T 0.50 <
   C 1.00**. The flat fixed-setpoint homeostat is **maladaptive**: dies 6/12 (thin-buffer self-drains, food
   available), and *looser* in dispersion than the hoarding saturable foil. Resolves v1's open question — the
   deaths are intrinsic to the shape, NOT the forage-C confound.
3. **Owner correction (binding, `memory/feedback_model_depth.md`):** the model was oversimplified — the Minecraft
   body is NOT license to reduce depth. Build graded per-subsystem viability (tired/nominal/critical, down to
   the cells), closed world↔body↔mind loops, allostasis. The v2 death IS the missing depth, measured.
4. **Full-depth design (`docs/specs/generative_model_depth.md`, commit `3526f76`, SIGN-WITH-CHANGES,
   `wf_4cf9ba90` 20 agents):** a 3-tier categorical stack (L0 body / L1 graded 6-state viability factors / L2
   organism viability parent), closed loop, interior-peak reserve C, work/fatigue, affect→precision, yuga
   timescales. 5-cure staged ladder. Owner chose the **deepest first rung = cures 1+2+3**.

## Rung-1 ENGINE (cures 1+2+3) — BUILT + verified (Steps 0–4, + a fix)
Typed contract: `docs/specs/rung1_graded_viability.md`. All behind the opt-in `:homeostat` organ ⇒ default
byte-identical. Commits `1c49e62` (STEP0) → `f0c05dd` (STEP1) → `b6e8005` (STEP2) → `6871abe` (STEP3) →
`19629d7` (STEP4) → `784eabd` (dynamics fix).

**Files:**
- `lib/sp/brain/homeostat.ex` (NEW) — the graded per-subsystem BODY. 4 stores {energy, gut, soma, fatigue}
  advanced by wall-clock dt with acted-subsystem attribution; 6-bin `bin6` {0 critical..5 surplus}; injects
  `felt_*` obs + `motor_pi`. **energy = eat-refilled (direct) + upkeep/work drain; gut = eat-filled +
  slow-passage drain (a satiety buffer, dissociates from energy); soma = health (hurt damages, slow heal —
  flat in a peaceful world, honestly scoped); fatigue = arm actions spend / rest recovers, on a FASTER clock
  (3s vs energy 8s). dead? = energy<=0 OR soma<=0. `motor_pi(freshness)` ∈ [0.35,1.0].**
- `lib/sp/brain/genome.ex` — `:homeostat` organ (`@prereqs homeostat: [:interoception]`); 4 graded factors
  (energy_reserve/gut_satiety/soma_integrity/muscle_fatigue, ns=no=6, init_a :diagonal); `max_phase` field
  (gated phase cap, default nil ⇒ byte-identical); `drive_shape :reserve` routing in `card/1`;
  `Genome.homeostat_l1_phase0/0` = the treatment lineage (strategist dropped + :motor_cortex added + phase-0
  pinned + drive_shape :reserve).
- `lib/sp/brain/curriculum.ex` — `@reserve_ramp [-8,-3,-1,+1,+2.5,+2]` interior-peak (surplus<sated);
  `drive_c(:reserve, no)`.
- `lib/sp/brain/mc.ex` — STEP0 `motor_config` by NAME (not `Enum.take(-5)`); `max_phase` cap in
  `maybe_advance_phase`; B3 satiety-attenuation relocated L2-independent + `restore_c` (from v2); `motor_pi`
  threaded into `motor_ctrl`/`next_primitive` → `MotorControl.step` (a tired arm's servo weakens, `vel=pi·err`).
- `lib/sp/runtime/agent.ex` — `homeostatic?` branch + `handle_homeostatic_step` (metabolic + default paths
  byte-identical); state `body: Homeostat.new()`.
- `lib/sp/brain/mc_codec.ex` — `outcome(:energy_reserve/:gut_satiety/:soma_integrity/:muscle_fatigue)` 6-bin.
- Tests: `test/sp/brain/homeostat_test.exs` (18 tests incl. servo-weakening + dissociation).
- Offline checks (gitignored, force-added): `runs/verify_rung1_step1.exs`, `runs/verify_rung1_dynamics.exs`.

**Offline dynamics proven (`verify_rung1_dynamics.exs`, 4/4):** under a reserve-following policy the body
SURVIVES (the flat setpoint died ~50%), holds an INTERIOR energy reserve (mean 0.816, NOT pinned full like the
saturable), PACES work/rest, and DISSOCIATES (energy↔fatigue corr 0.31; energy↔gut 0.99 honestly correlated —
the fatigue tier is the cleanest per-subsystem dissociation).

**The fix (`784eabd`) — an offline pre-check win:** the original gut→energy digestion pinned energy full,
making the reserve lineage indistinguishable from the saturable foil. Changed to energy-direct-eat + independent
gut so the reserve holds an INTERIOR reserve (≠ saturable). Digestion transfer deferred (needs joint conditioning).

## Invariants — all GREEN (never regressed)
Byte-identical default (mad<1e-12), action-clone-invariance, no scalar-per-action (all costs via body store →
felt obs → belief), monotonic decay preserved. Default genome untouched (no `:homeostat`); the frozen
`:metabolism` organ untouched (its gates hold). Fences respected: `@factor_cap` not lifted, `@l2_period` not
re-derived, step-path edits organ-gated, motor_config name-indexed.

## WHAT'S NEXT — Step 5–6 (the paired RED). NOT yet started. Needs owner go-ahead for the live burn.
- **Step 5 (offline code):** the paired RED harness — arms: reserve (`homeostat_l1_phase0`) vs setpoint-6 vs
  saturable-6 (flip `drive_shape`; needs 6-state `:setpoint`/`:saturable` C — currently `drive_c(:setpoint,6)`
  expands the 4-key map, i.e. peak bin2 flat 3-5; define proper 6-state baseline/foil OR reuse) + per-mechanism
  ablation arms (reserve-C-only / fatigue-only). **Discriminator MUST be behavioral, not survival-alone** (the
  offline check showed reserve AND saturable can both survive): allostasis_index (eats before the edge),
  two-ended satiation (fights near critical in a scarce world; stops eating / does not hoard in a rich world),
  cross-subsystem dissociation Δ (energy↔fatigue cleanest), fatigue_pacing_index, per-subsystem severed-limb
  falsifiers. Pre-register `docs/receipts/rung1_graded_viability_RED.md` BEFORE T0.
- **Step 6:** `/lab-team-review` MERGED SIGN on the FE (typed spec exists) → owner go-ahead + live-stream guard
  → spin gate worlds → live smoke (embodiment + eats + survives + c_ok) → live N=12 RED → analyze →
  adversarial verify → record verdict. PASS iff survival ≥11/12 (vs flat 6/12) AND the behavioral discriminators.

## Honest ceilings (named, not smuggled)
Mean-field (no joint energy×fatigue anticipation — pacing is loop-1-driven); digestion transfer deferred;
soma flat in a peaceful world (validated only where health varies); energy↔gut weakly dissociate (both
eat-driven); short depth-5 horizon. Claim fence: every float is a model variable, never a felt state; passing a
gate demonstrates graded self-maintenance BEHAVIOUR only, never experience.

## ⚠️ OPEN ISSUE TO SORT — restore the REAL Producer UNI; the Director was running HEADLESS (2026-07-11)
While preparing this handoff the owner spotted a local PowerShell spewing `[Rcon: Teleported Director to
X,Y,Z]` + Minecraft's `Director moved too quickly!` anti-cheat warning. **Diagnosis:** `viewer/director.js`
(a `node` process, was PID 28036) runs a spectator entity named **"Director"** flown via RCON
`tp Director … facing entity <subject>`. It is **meant to be driven by the Producer UNI** — `SP.Producer`
(`lib/sp/producer.ex`, `lib/sp/brain/director.ex`), a **pure active-inference show-runner** that senses colony
telemetry + server health and decides every cut / shot / narration / spawn / cull by EFE, putting the camera
into `:producer` mode. **The problem:** the Producer UNI was **NOT running**, so `director.js` was
**auto-piloting headless** — a dumb orbit, not the show-runner. That degraded state is what looked like a
puppet-cam.

**Action taken (2026-07-11):** killed the headless `director.js` (PID 28036) + **3 orphan `viewer/body.js`**
ghost processes (PIDs 10932/32660/25292 — attached to nothing: lab `mc-server` shows 0 players, no local MC
server). Cleaned up so nothing runs headless.

**TO RESTORE — the real Producer working again "as we had" (owner directive):**
1. Bring the **Producer UNI** back up — it is the real (active-inference) show-runner that drives the Director
   intelligently. Launch: **`mix producer.run`** (`Mix.Tasks.Producer.Run`) — it `SP.Producer.ensure_started()`
   and puts the Director camera in `:producer` mode. **Prereqs:** a Paper server up + the Phoenix UI for the
   camera/overlay: `cd ui && mix phx.server` (open `http://localhost:4000/stream`). Do **NOT** run `director.js`
   headless again — it only makes sense driven by the Producer UNI (or it auto-pilots).
2. **Honesty framing (keep it clean):** the Producer UNI directing the broadcast camera is legitimate — it is a
   real AI show-runner, a production role, distinct from the embodied colony UNIs it films. Keep that distinct:
   the Producer *directs the broadcast*; it is never narrated as a colony UNI "choosing" its own view. If a raw
   first-person UNI POV feed is also wanted, that is the `:camera_control` organ / per-UNI `viewer/body.js` feed
   — a separate channel. Neither is a scripted fake; the earlier headless orbit was the only fake, and it is gone.
3. The Producer/broadcast track (`viewer/*`, `production/`, `lib/sp/producer/*`, `ui/`) is a SIBLING track to
   this rung-1 build. See `memory/ops_live_stream_runbook.md` + `ops_broadcast_studio.md` for the known-good
   bring-up ("ONE node; never a 2nd producer.run"); restore per that runbook.

## Resume commands (Windows, repo root)
```
git log --oneline -12
mix test test/sp/brain/                       # expect 315/0, motor posterior 0.75
mix run runs/verify_rung1_dynamics.exs        # expect 4/4 STRUCTURE VIABLE
mix run runs/verify_rung1_step1.exs           # expect STEP 1 GREEN
```
Lab box (colony) is `ssh uni@10.190.245.122` (rootless podman); only `mc-server` runs now (gate worlds torn
down). Live RED will re-spin `mc-gate-1..12`. The colony image `localhost/uni-colony:metabolism` mounts the
lib files from `/home/uni/build_metabolism/lib` — **re-scp the changed lib files before any live run** (STEP2-4
changed homeostat.ex/genome.ex/curriculum.ex/mc.ex/mc_codec.ex/agent.ex; only genome.ex+mc.ex were synced for v2).
