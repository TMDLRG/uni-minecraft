# RESUME — Producer expert build DONE; go-live after reboot (2026-07-11)

> **STATUS (2026-07-11 late): SUPERSEDED as the go-live path. Read [STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md)
> FIRST.** The bring-up sequence below is System 1 (dev studio) and remains valid for the colony
> SOURCE; public broadcasting now goes through System 2 (`production/` per P1-BRINGUP.md). The
> overlay proof gate (`viewer\verify_overlays.cjs`) is binding on any bring-up claim.

> Read this first on resume. The Producer "expert show-host" build is complete, committed, and
> PUSHED (origin at `e310a76`). This doc is the validated go-live sequence for after the reboot.

## What is done (all committed + pushed, covenant-green)
The Producer is now a durable, deep, honest, self-running show-host. Commits `c40c51b`→`e310a76`
on `lab/ozone-life-uni-hard-science`:
- **Durable** — `SP.Show.Supervisor` (`lib/sp/show/`) supervises Colony→Director→Producer→
  OverlayPublisher (`:rest_for_one`). A Director crash restarts the Producer WITH it (re-asserts
  `:producer`) — the puppet-cam state is structurally impossible. `/producer/health` reports
  LIVE/PARTIAL/DOWN.
- **Sees deep + world** — viability body (energy/gut/soma/fatigue) + phase + focus on the cards;
  `SP.Producer.WorldSensor` narrates day/night + colony size over RCON (Markov-safe, no coords).
- **Story + honesty** — four distinct beats (crisis/social/mind/recap via `SP.Brain.Narrator`);
  per-UNI phase-climb + survival arcs; `SP.Brain.Fence` on EVERY on-air path (narration + Q&A);
  in-app supervised `SP.Show.OverlayPublisher` (the hand-launched `broadcast_bridge.exs` is retired).
- Covenant at every step: gates 14/17/18 PASS, brain suite 334/0, motor posterior 0.75,
  byte-identity mad<1e-12. All narration pure-Elixir/5-language; FE decision math untouched.

## GO-LIVE sequence (after the reboot)
ONE node only. The show auto-starts supervised with the node (`UNI_AUTOSTART=1`).

```powershell
# 1) full studio bring-up (Minecraft -> supervised Phoenix show -> camera -> OBS -> studio).
#    studio_up.ps1 launches Phoenix with UNI_AUTOSTART=1 (supervised show + design colony) and a
#    puppet-cam guard that reads /producer/health.
powershell -File viewer\studio_up.ps1

# 2) confirm the REAL Producer is running the show (not the headless puppet):
Invoke-RestMethod http://localhost:4000/producer/health   # want: verdict=LIVE, driver=producer, colony_count>0
# also open http://localhost:4000/stream — camera + narration + per-agent cards + Q&A

# 3) (optional) design colony override: set UNI_KIN before studio_up, e.g. $env:UNI_KIN='0,1,1,2,3'
#    (default). Forest seed / world is the mcserver world.

# 4) to STREAM to YouTube/Twitch (the OBS path): keys + restream.ps1 + command center GO LIVE
#    (unchanged; see docs/RUNBOOK_STUDIO.md + docs/STUDIO_OPERATOR_MANUAL.md).

# 5) full stop (kills EVERYTHING, verified clean):
powershell -File viewer\studio_up.ps1 -Stop
```

## Puppet-cam guard (the recurring failure, now impossible)
If you ever see the camera orbiting with no narration / "Director moved too quickly", the Producer
is not running. With this build that can't persist: the supervisor restarts it, and
`/producer/health` will show verdict != LIVE. `studio_up.ps1` warns on bring-up if the camera is up
without a live Producer. NEVER run a second `--sname uni` node (studio_up guards against it) and
NEVER run `director.js` standalone.

## Validation receipts (pre-reboot, this session)
See the commit chain + the session log. A live bring-up on the dev-box MC confirmed the supervised
Producer drives the real camera, narrates real UNIs, /producer/health=LIVE, and the OverlayPublisher
writes broadcast.json — then torn down clean for the reboot.

## Coordination
The rung-1 (brain/body) agent runs a SEPARATE track (lib/sp/brain homeostat RED, default genome
byte-identical, gated `:homeostat` lineage in lab containers @10.190.245.122 — NOT the dev-box
stream MC). felt_* field names confirmed unchanged. See `memory/feedback_agent_coordination.md`.
Before reboot: confirm the rung-1 agent committed + pushed its RED work.
