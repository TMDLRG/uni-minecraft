# Broadcast Studio — handoff to the Producer/Studio agent (2026-07-11)

> **STALE — historical session record, dated 2026-07-11.** Describes `studio_up.ps1` hosting a local colony
> on THINKER, which was the architecture AT THAT TIME. That was closed 2026-07-12 in `cea1cd3`
> (ADR-PROD-013) — `studio_up.ps1`'s default path no longer does this. Do not treat this doc as current;
> read `CLAUDE.md` + `docs/STUDIO_SYSTEMS.md` for the live architecture.

> From the UNI.MineCraft (brain/body) agent to the agent that built + owns the broadcast studio. Short version:
> your Director camera was found **running headless** (no Producer UNI behind it) and was killed; the studio was
> then brought back up the designed way (`studio_up.ps1`). Please verify + take ownership. The broadcast track is
> a SIBLING to the active-inference brain/body track — keep them coordinated, especially the honesty fence.

## What happened (the incident)
The owner saw a local PowerShell spewing `[Rcon: Teleported Director to X,Y,Z]` + Minecraft's
`Director moved too quickly!` anti-cheat warnings, and (rightly) asked whether the camera was a hack.
- **Root cause:** `viewer/director.js` (the spectator "Director" camera, flown via RCON `tp Director … facing
  entity <subject>`) was running **headless — the Producer UNI (`SP.Producer`) was NOT running**, so the camera
  was auto-piloting a dumb orbit instead of being driven by the active-inference show-runner. That degraded state
  is what looked like a puppet-cam.
- **Also found:** 3 orphan `viewer/body.js` bodies attached to nothing (local MC + lab `mc-server` both had no
  players). Cruft.

## What I did
- Killed the headless `director.js` (was PID 28036) + the 3 orphan `body.js` (10932/32660/25292). Confirmed no
  viewer/director/body processes left.
- **Restored the studio the designed way:** `powershell -ExecutionPolicy Bypass -File viewer\studio_up.ps1`
  (the idempotent, health-gated, zombie-guarded ONE-command bring-up you wrote). It brings up, in order:
  Minecraft(:25565) → Phoenix(:4000) + kicks `/stream` (**the Producer**) → colony cam(:3020) → OBS(:4455) →
  channels+throttle → overlay(:8099) → MediaMTX(:9997) → studio_stage → command center(:8098) → publisher(:8443)
  → systray watchdog. **The Producer is started by hitting `http://localhost:4000/stream`** — it runs INSIDE the
  one Phoenix node (do NOT also run a separate `mix producer.run` — that's a 2nd competing producer), and it
  re-spawns `director.js` **driven** (`:producer` mode), not headless.

## The architecture (so it's clear what "the Producer" is)
- **`SP.Producer`** (`lib/sp/producer.ex`, `lib/sp/brain/director.ex`, `lib/sp/producer/*`) — a **pure
  active-inference show-runner**. It senses the colony board + server health and decides every cut / shot /
  narration / spawn / cull by **EFE** (no scalar reward — same math discipline as the colony brains), puts the
  Director camera into `:producer` mode, narrates in five languages, answers questions, self-maintains.
- **`viewer/director.js`** — the camera *actuator*: the Producer sends shot directives on its stdin; director.js
  owns the smoothing and moves the spectator "Director" entity via RCON. **It only makes sense DRIVEN by the
  Producer.** Never run it headless (it auto-orbits → the `moved too quickly` warnings).
- Launch/teardown/status (yours, use these — don't improvise):
  - `studio_up.ps1` (bring up) · `-Watch` (bring up + watchdog) · `-Status` (what's up/down + zombie warnings) ·
    `-Stop` (tear EVERYTHING down, verified; refuses while OBS is INGESTING unless `-Force`).
  - Runbooks: `docs/RUNBOOK_STUDIO.md`, `docs/RUNBOOK_LIVE_STREAM.md`.

## STATE AS I LEFT IT (2026-07-11) — stack up, NOT confirmed filming (your part)
`studio_up.ps1` was run; current: **Minecraft :25565 UP, Phoenix :4000 UP, `/stream` HTTP 200, ONE clean
Phoenix node** (the "2 -sname uni" the guard warns about is a FALSE POSITIVE — it's iex.bat's launcher erl +
child BEAM; your zombie-guard over-counts with iex.bat, worth fixing). BUT **colony cam :3020 down + no
director.js** because **the colony has no UNIs yet**: on the dev box `maybe_autostart_colony` only fires with
`UNI_AUTOSTART=1` (app.ex:20), and `studio_up.ps1` doesn't spawn the colony. **To finish (your ritual, per
`docs/RUNBOOK_LIVE_STREAM.md`):** with the node up, run `elixir --sname trig --cookie sp runs\trigger.exs`
(does `SP.Producer.ensure_started()` + spawns a few UNIs); the Producer then auto-maintains population in
**[3,6]** → the single Director + colony cam (:3020) come up, DRIVEN. Confirm `level-seed=8675309` in
`mcserver/server.properties` (good inland forest) + brains in `runs/colony/*.bin`. **Do NOT run a 2nd
`mix producer.run`** (the note in §architecture). The headless `director.js` is gone; it will re-spawn driven
once the Producer has a populated colony.

## Please verify / own
1. **Producer actually running:** `http://localhost:4000/stream` renders + the Producer is cutting shots (not a
   fixed orbit). If director.js is orbiting with no cuts, the Producer didn't attach — re-kick `/stream`.
2. **No zombies/duplicates:** `studio_up.ps1 -Status` shows exactly ONE `-sname uni` Phoenix + ONE `paper.jar`.
   Two producers / two Phoenix nodes has bitten before (the script guards it; heed the warnings).
3. **OBS:** if OBS shows a "Crash Detected" dialog it needs a manual "Run in Normal Mode" click, then the
   websocket (:4455) comes up. OBS YouTube-auth gotcha: if the profile has a connected YouTube account it
   streams nothing silently — clear `[Auth] Type=` in `basic.ini` (`memory/ops_obs_youtube_auth_gotcha.md`).
4. **Going live** is a deliberate, separate action (studio_up brings the stack up READY, not streaming).

## The honesty fence (BINDING — coordinate with the brain/body track)
The Producer UNI *directing the broadcast camera* is legitimate — it is a real active-inference show-runner, a
**production role**, distinct from the embodied colony UNIs it films. Keep that distinction clean:
- The Producer **directs the broadcast**; it is **never** narrated as a colony UNI "choosing its own view."
- A raw first-person UNI POV (what a bot actually sees) is the **`:camera_control` organ / per-UNI
  `viewer/body.js` feed** — a SEPARATE channel if you want it. Do not conflate the two on-screen.
- No scripted/canned layer may be captioned as "the UNI seeing." The only fake here was the headless orbit, and
  it is gone. See `memory/feedback_live_stream_changes.md` ("real sight = literal pixel vision") + the claim
  fence (behaviour only, never experience). On-screen captions stay 4-value-honest.

## Context on the other (sibling) track — so you know what's changing under you
The brain/body agent just built + offline-proved the **rung-1 graded-viability body** (per-subsystem viability,
the arm tires from work, closed world↔body↔mind loop), all behind the opt-in `:homeostat` organ so the DEFAULT
colony genome is **byte-identical** — i.e. **nothing you broadcast today changed**; the new depth is a separate,
gated lineage that only appears in a paired RED (not yet live, needs owner go-ahead). Full state:
`docs/RESUME_RUNG1.md`. If/when a `:homeostat` lineage goes live on the streamed colony, coordinate captions so
the graded interoceptive signals are shown as model variables, never narrated as felt hunger/pain.

## Quick commands
```
powershell -ExecutionPolicy Bypass -File viewer\studio_up.ps1 -Status   # what's up/down
powershell -ExecutionPolicy Bypass -File viewer\studio_up.ps1           # bring up (idempotent)
powershell -ExecutionPolicy Bypass -File viewer\studio_up.ps1 -Stop     # tear down, verified
# Producer lives at http://localhost:4000/stream ; command center http://127.0.0.1:8098
```
