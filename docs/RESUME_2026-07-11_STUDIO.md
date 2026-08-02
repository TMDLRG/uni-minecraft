# RESUME — 2026-07-11 studio session (pre-reboot handoff)

> **Read this first on resume.** Owner initiated a reboot after this session. Below is the
> honest state and the open issues to address.

## Box state at reboot
Everything down, verified clean (`viewer\studio_up.ps1 -Stop` all PASS). No zombies. Safe to
reboot without losing anything committed.

## What was actually delivered this session
`viewer/` broadcast studio hardening. Committed on `lab/ozone-life-uni-hard-science`:
- `a9ea510` — Phase 1 grounding (WS1-A..M): shared OBS client, air-state event mirror,
  publisher schema v2, cert regen, PS 5.1 ASCII, unified BEATS, systray watchdog, idle mode,
  studio_up -Stop. **Plus fixes from an adversarial review** (WS1-V, H1/H2/H3/M1/M2/L2):
  publisher holds quality on empty slotstates, air-state honesty (STALE not fake-OFF),
  -Stop guarded by MediaMTX uni.ready.
- `0a88943` — **critical -Stop / bring-up fix** (see "What went wrong" below).

## What went wrong this session (be honest about this)
1. **`-Stop` did not stop everything.** It only killed the OBS/studio pieces I authored,
   never Minecraft or the Phoenix `ui/` node — even though `studio_up.ps1` launches them.
   Owner was told "Studio is stopped" and it wasn't. Fixed at `0a88943`: -Stop now kills
   Minecraft, Phoenix (all `-sname uni` erl.exe / beam.smp), wrapper shells, plus the
   studio pieces, and VERIFIES each port + process afterward with PASS/FAIL.
2. **Two Phoenix nodes were both claiming `--sname uni`** — the exact "ONE node only"
   hazard from the live-stream runbook. Bring-up only checked whether port 4000 was
   listening; a zombie Phoenix process (BEAM alive, web dead) passed that check as
   "no Phoenix running" and got silently duplicated. Fixed at `0a88943`: bring-up now
   checks the PROCESS. Refuses to start a duplicate; `-Status` warns on zombies.
3. **The camera was not the real Producer UNI.** Owner flagged this at end-of-session:
   "the UNI producers view had more data about the UNI... I am not clear on what you
   were streaming but it is not correct." Prior session (`307b8a1`, same day) had
   documented this exact issue: `viewer/director.js` auto-pilots headless (puppet cam)
   unless the REAL Producer is running via `mix producer.run`. I brought up phx.server
   this session and treated it as "world stack up" — but that alone is NOT the Producer.
   See `docs/RESUME_RUNG1.md` "OPEN ISSUE TO SORT" block and
   `memory/project_producer_vs_director.md`.

## Open, must address on resume
### 1. Restore the REAL Producer UNI
See `docs/RESUME_RUNG1.md` L94–L122 for the full write-up. Short version:
- Paper server up (Minecraft :25565).
- `cd ui && iex.bat --sname uni --cookie sp -S mix phx.server` — camera surface only.
- **`mix producer.run`** — this is what starts `SP.Producer` and puts the Director camera
  in `:producer` mode. Without this the camera is a headless orbit puppet.
- Do NOT run `director.js` standalone.
- **`viewer/studio_up.ps1` does NOT start the Producer.** That is a gap. Any studio-up
  work must either add a Producer step or make the operator run it (and warn loudly if
  Producer is absent while streaming).

### 2. Owner critique of the whole approach — needs a real answer, not more scripts
Owner said the current state is "maybe 5% of the quality and stability needed" and
"there MUST be a better way than ALL these cmd windows." He is right. The broadcast
studio today is a fleet of PowerShell windows launched by studio_up.ps1 with a systray
watchdog stapled on top. That is not durable / professional / service-based. The
approved Phase 2 plan (`~/.claude/plans/ok-and-you-need-eager-pillow.md`) exists to fix
this — podman on the uni-lab, systemd-managed, LAN-reachable control plane, no more
loose windows. Phase 2 has NOT started. On resume, discuss whether the answer is:
- proceed to Phase 2 as-planned (podman split), or
- install the Windows-side services (NSSM / Windows Service) as an intermediate step, or
- something else the owner sketches.

### 3. The stream video route was not what the owner asked for
Owner said: "this is a fucking hack instead of the real UNI providing the video stream
and camera selection." The current pipeline is OBS + Chrome captures + templates. The
owner appears to want the camera view / stream to come directly from the Producer UNI
without OBS as the middleware. Confirm intent before touching. This is separate from
the -Stop fix and separate from Phase 2 podman work.

## Files touched this session (all committed)
- `viewer/lib/obs_client.cjs` NEW
- `viewer/systray_watchdog.ps1` NEW
- `viewer/gen_auto_cert.ps1` NEW
- `viewer/command_center.cjs`, `command_center.html`, `publisher.cjs`, `pub.html`,
  `studio_stage.cjs`, `studio.cjs`, `studio_up.ps1`, `studio_channels.ps1`,
  `restream.ps1`, `launch_channels.ps1`, `mediamtx_local.yml`, `.gitignore`
- `viewer/runtime/beats.json` NEW
- Docs: `docs/STUDIO_OPERATOR_MANUAL.md` (untouched this session, prior),
  `docs/RUNBOOK_STUDIO.md` (untouched this session).

## Sibling track NOT touched this session
The rung-1 graded-viability build (`lib/sp/brain/**`, `runs/verify_rung1_*`) is
green at handoff — see `docs/RESUME_RUNG1.md` for that state.

## Resume commands (Windows, repo root)
```
powershell -File viewer\studio_up.ps1 -Status   # should show all DOWN, no warnings
git log --oneline -8                             # 0a88943 top, a9ea510 below
```
