# PROJECT STATUS — shared tracker (all agents read this first)

> **⚠️ ARCHITECTURE CORRECTION (2026-07-12, owner-set):** the "System 2 on uni-lab-79740c" framing below is
> STALE. Render/mixer/encode = native Windows **OBS on THINKER (portable, any GPU box)**; node2 = **relay
> ONLY**; the **COLONY runs on UNI-LAB (`10.190.245.122`), rootless, on the chip — ALWAYS**, captured by
> THINKER over the LAN. Canonical: `CLAUDE.md`,
> [ADR-PROD-013](../production/docs/adr/ADR-PROD-013-colony-host-placement.md), `docs/UNIVERSE.md`.
>
> **Status update (2026-07-11 late).** Studio/platform state is now owned by `docs/STUDIO_SYSTEMS.md` + `production/docs/DEPLOYED_STATE.md` (System 2 P1 core DEPLOYED + PROVEN on uni-lab-79740c; not WIP). The colony source is DOWN for the emergent-forage rebuild.

> **Canonical cross-agent status.** Updated 2026-07-11 ~10:30 (post-reboot audit). Branch
> `lab/ozone-life-uni-hard-science`, HEAD pushed to `origin` (github TMDLRG/UNI.MineCraft). The live
> master-plan page (`http://10.190.245.122:4100/` — index.html/plan.md/state.json) is generated from this
> repo; where they disagree, **this file + the committed receipts win**. Rules that bind every agent:
> one cure at a time · pre-registered gates · receipts beat rhetoric · claim fence (behaviour only, never
> experience) · live-stream guard (owner go-ahead before any new lineage on the streamed colony).

## OWNER DIRECTIVE (current, 2026-07-11)
1. **Prove the next gate** (rung-1 graded-viability paired RED) — do not weaken bars.
2. **Producer + stream up together**: run the full show **~1 hour WITHOUT remote stream keys** (local-only:
   OBS → MediaMTX, no YouTube/Twitch push) as a stability soak.
3. **If stable → flip live** (attach the remote keys / start the platform push) **and keep working through
   gates while live**.

## Post-reboot audit (2026-07-11 10:29, RE-VALIDATED 10:40 — all green)
> Box up since 10:07:11 (no further reboot as of 10:40). Re-ran the full audit: identical GREEN result below.

- Dev box rebooted 10:07:11. Repo clean at `d6ead4b`+; **`mix test test/sp/brain/` = 315/0** (byte-identity
  mad<1e-12, action-clone, motor posterior 0.75 unchanged); offline gates GREEN
  (`verify_v2_isolation` 8/8 · `verify_rung1_step1` 5/5 · `verify_rung1_dynamics` 4/4 VIABLE).
- Local stack (post-reboot bring-up 10:14): Minecraft :25565 UP · **ONE** Phoenix `-sname uni` node UP
  (`/stream` HTTP 200 — the erl.exe pair is launcher+child, NOT a duplicate; the `-Status` guard over-counts
  iex.bat) · MediaMTX :9997 UP · command center :8098 / overlay :8099 / publisher :8443 UP · **OBS down ·
  colony cam :3020 down — colony not yet populated** (dev box needs the deliberate trigger; see studio handoff).
- Lab box (`uni@10.190.245.122`): only `mc-server` (healthy); gate worlds torn down; master-plan page HTTP 200.
- Secrets guard: root `auto.crt`/`auto.key` (EC private key) now gitignored — **never commit**.

## Track A — brain/body (Stratified Palimpsest engine) — owner: the brain/body agent
| item | status | receipt |
|---|---|---|
| Metabolism activation gate (organ live + death edge, pos/neg/neg/pos) | **PASS WITHDRAWN**: the PASS rested on an RCON food-give now judged a fake-life hack (see `docs/receipts/metabolism_activation_gate_LIVE.md`); mechanism-when-driven holds, survival claim withdrawn; emergent-forage rebuild in commit `f0c789a`, pending a colony survival gate | `docs/receipts/metabolism_activation_gate_LIVE.md` |
| Regulation gate v1 (setpoint vs saturable) | **FALSIFIES** (verified) | `docs/receipts/metabolism_regulation_gate.md` |
| Regulation gate v2 (confound-free, N=12) | **FALSIFIES** (verified; flat setpoint dies 6/12, looser dispersion) | `docs/receipts/metabolism_regulation_gate_v2.md` |
| Full-depth model design (owner depth correction) | **SIGN-WITH-CHANGES** | `docs/specs/generative_model_depth.md` |
| **Rung-1 engine (cures 1+2+3): graded per-subsystem viability + work/fatigue** | **BUILT + offline-proven** (315/0; dynamics 4/4: survives where flat setpoint died, interior reserve, paces, dissociates) | `docs/specs/rung1_graded_viability.md`, `lib/sp/brain/homeostat.ex`, commits `1c49e62..784eabd` |
| Rung-1 paired RED — control-arm FE (setpoint6/saturable6/ablation/severed arms) | **BUILT + lab-team SIGN-WITH-CHANGES + committed `41abd65`** (pushed). 5-persona review caught a real pre-reg bug (PASS-4 backwards → split); default byte-identical, suite 334/0, +19 invariant tests, A6 controls 3/3 | `docs/receipts/rung1_graded_viability_RED.md` (pre-reg + REVISION 1 verdict), `docs/specs/rung1_graded_viability.md` (REVISION 1 spec + ship-gate checklist) |
| Rung-1 paired RED — LIVE burn (the next gate to prove) | **READY — pending owner go-ahead + live-stream guard** (post-reboot: lib/harness sync to lab box → gate containers kin 60 → live smoke on FULL → N=12 → `runs/analyze_rung1_red.py`). Harness `runs/rung1_red.exs` + analyzer committed | `docs/receipts/rung1_graded_viability_RED.md` |

Default colony genome is **byte-identical** throughout — nothing currently streamed changed; the `:homeostat`
depth is a gated lineage that only appears in the RED.

## Track B — broadcast studio / Producer — owner: the studio agent
| item | status | receipt |
|---|---|---|
| Studio Phase-1 hardening + verified -Stop + zombie guards | DONE | commits `a9ea510`, `0a88943` |
| Headless-director incident (puppet cam) | **killed + documented**; never run `director.js` headless | `docs/RESUME_RUNG1.md` open-issue block, `docs/RESUME_2026-07-11_STUDIO.md` |
| Real Producer restore path | stack up post-reboot; **finish = populate colony** (`elixir --sname trig --cookie sp runs\trigger.exs`), Producer then drives the Director in `:producer` mode | **`docs/handoffs/BROADCAST_STUDIO_HANDOFF.md`** (read this) |
| Known gap | `studio_up.ps1` does not start/verify the Producer or colony — add a step or warn loudly | studio resume §1 |
| Phase-2 service-based platform (replace the cmd-window fleet) | WIP committed for continuity (`production/`, `docs/UNI_PRODUCTION_PLATFORM.md`) | studio resume §2 |

## The keyless stability soak → flip-live plan (the directive, operationalized)
1. Studio agent: populate colony (`runs\trigger.exs`) → confirm Producer cutting shots on `/stream`, colony
   cam :3020 up, OBS up (crash-dialog gotcha), **stream to MediaMTX only (no remote keys)**.
2. Soak **≥60 min**: watch `studio_up.ps1 -Status` (no zombies/dupes), MediaMTX `uni` path ready, no
   process restarts (watchdog log), Producer still directing (shots changing), colony alive.
3. Brain/body agent (in parallel): pre-register the rung-1 RED (`docs/receipts/rung1_graded_viability_RED.md`),
   sync lib to the lab box, ready the N-world harness — so gate-proving continues during/after the soak.
4. **Stable ⇒ owner flips live** (remote keys attached) → keep working gates one cure at a time.

## Honesty fence for anything on-stream (binding)
The Producer UNI directs the broadcast (a real active-inference show-runner, a production role); it is never
narrated as a colony UNI choosing its own view. Raw UNI POV = the per-UNI `:camera_control`/`body.js` feed, a
separate labeled channel. No gate result is captioned beyond its recorded verdict (PASS/PARTIAL/FAIL/WITHHELD);
graded interoceptive signals are model variables, never "felt". 4-value fence on every claim
(proven/designed/hypothesized/not-yet-built).

## Read-first map
- This file → `docs/RESUME_RUNG1.md` (brain/body deep state) · `docs/handoffs/BROADCAST_STUDIO_HANDOFF.md` +
  `docs/RESUME_2026-07-11_STUDIO.md` (studio) · `docs/LAB_PROTOCOL.md` (rules) · `docs/DEEPENING_PLAN.md` (plan)
  · master-plan page `http://10.190.245.122:4100/`.
