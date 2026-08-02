# THINKER Studio — Handoff / Status (2026-07-12)

> **STALE — historical session record.** The architecture table below lists THINKER as running "Phoenix
> `--sname uni` :4000 (+ colony)" and Minecraft — accurate to this session's snapshot, but the local-colony
> default was closed later the same day in `cea1cd3` (ADR-PROD-013). `studio_up.ps1`'s default path no
> longer hosts a colony on THINKER. Do not treat this doc as current; read `CLAUDE.md` +
> `docs/STUDIO_SYSTEMS.md` for the live architecture.

**From:** the THINKER studio agent (native-Windows-OBS correction + P1–P8 remediation + Mission Control launcher).
**For:** the Ultracode finalize pass (consolidated CLAUDE.md + clean repo + complete docs).
**Read with:** `production/docs/adr/ADR-PROD-011` + `ADR-PROD-012` (the architecture correction), `docs/STUDIO_SYSTEMS.md`.

---

## TL;DR

- The ~1000-line uncommitted diff (CLAUDE.md, docs/*, production/docs/*, viewer/*, the two new ADRs) **is mine and is real completed work** — the native-Windows-OBS architecture correction (ADR-011/012) + the P1–P8 remediation + the P4/P5/P6 studio features + boot-persistence/orphan fixes + the new Mission Control launcher. **Good to fold into the finalize commit.**
- **Architecture is corrected**: THINKER = render + operator studio + colony source; **node2 `uni-lab-79740c` = fan-out relay ONLY**; **L1 `uni-lab` = ERP appliance, ZERO broadcast**.
- **Proven this session (machine healthy):** the 5-stage BROADCAST TEST passed end-to-end (all 24 templates + BARS_TONE rendered real pixels on program); overlay proof gate PASS; headless-Phoenix boot-persistence verified with a live 5-UNI colony.
- **NOT proven / blocked:** public GO LIVE (node2 was mesh-unreachable all session); launcher START→full-stack-up on a healthy box (a WMI wedge blocked the last attempt); the one-console feature-merge and colony/glass-Chrome elimination (designed, not built).
- **A colony runaway occurred and was cleaned by the UNI MineCraft agent** (see "Incident"). THINKER is clean now, seed `8675309` preserved.

---

## Corrected architecture (binding — ADR-PROD-011 / ADR-PROD-012)

| Box | Role | Runs |
|---|---|---|
| **THINKER** (Win11, LAN `10.190.245.196`, NVIDIA T1000 + Intel UHD 630, non-ERP) | Render + operator studio + colony source | Native OBS (mixer), `viewer/command_center.cjs` :8098, `viewer/overlay_server.cjs` :8099, `viewer/publisher.cjs` :8443/:8095, local MediaMTX :1935/:8554/:8889/:9997, Phoenix `--sname uni` :4000 (+ colony), Minecraft :25565/RCON :25575, colony+glass Chrome (WGC), `viewer/launcher.cjs` :8090, `viewer/systray_watchdog.ps1` |
| **node2 `uni-lab-79740c`** (mesh `10.13.13.3`, LAN `10.190.245.149`) | Fan-out relay ONLY | `uni-bcast-relay` (MediaMTX): accepts THINKER's single encode on `rtmp://10.190.245.149:1935/uni/program` (publish authorized ONLY from `10.190.245.196/32`) and `runOnReady`-tees to YouTube + Twitch. Keys in `/etc/uni/runtime.env`. |
| **L1 `uni-lab`** (mesh `10.13.13.1`, LAN `10.190.245.122`) | ERP business appliance | SolutionWright/Odoo, Jitsi, mail, lab-os. **Zero broadcast surface, ever.** |

**Data flow:** cameras → THINKER `:8443` publisher → THINKER local MediaMTX → **THINKER OBS renders on T1000** → ONE H264/AAC encode → `rtmp://10.190.245.149:1935/uni/program` on node2 → node2 `runOnReady` tee → YouTube + Twitch. Single-encode → copy fan-out (ADR-PROD-008).

**⚠️ node2 was UNREACHABLE over the mesh the entire session** (`podman_ps limb=uni-lab-79740c` → timeout, twice). The **private/loopback** BROADCAST TEST (`rtmp://127.0.0.1:1935/uni`) does not need it. **Public GO LIVE is BLOCKED until node2 is back** and `uni-bcast-relay` is confirmed accepting THINKER's publish.

---

## What changed in the uncommitted diff (by area)

**Docs / ADRs (P7):**
- `CLAUDE.md` — "two studio systems" section + status rewritten to THINKER-primary; node2=relay-only; L1=ERP-zero-broadcast. (This was the highest-value conflict: CLAUDE.md is loaded every session and still asserted the old "System 2 containerized OBS = one true path".)
- 7 docs banner-corrected: `docs/{STUDIO_SYSTEMS,SYSTEM_OVERVIEW,RUNBOOK_STUDIO,STUDIO_OPERATOR_MANUAL,UNI_PRODUCTION_PLATFORM}.md`, `production/docs/{DEPLOYED_STATE,GAPS_REGISTER}.md`.
- **NEW** `ADR-PROD-011-native-windows-obs-on-render-host.md` (native Win OBS on GPU host is the mixer; container OBS deferred). **NEW** `ADR-PROD-012-encoder-placement-policy.md` (encoder = any host with a real GPU AND not the ERP appliance; x264 720p30 floor + never-on-ERP preserved).
- `ADR-PROD-001` + `ADR-PROD-003` — SUPERSEDED-IN-PART banners.
- ⚠️ Body-level rewrites of `STUDIO_SYSTEMS.md`/`SYSTEM_OVERVIEW.md` still contain some stale "one true broadcast path"/`uni-bcast-mixer` prose below the banner (flagged by audit; **finalize should scrub these**). Also `docs/RELEASE_READINESS.md`, `docs/PROJECT_STATUS.md`, `docs/RUNBOOK_LIVE_STREAM.md` have NO banner yet and still assert the old architecture.

**Studio features (P4/P5/P6):**
- `viewer/command_center.cjs` — P4 `/api/broadcast_test` (5-stage: PREFLIGHT→ENCODER→SEEN SWEEP→CAMERAS+FANOUT→PARK) + GET poll + `/api/cue` + `httpPostJson`. Two bug fixes (see landmines): GET/POST routing guard on `/api/broadcast_test`; `writeState` EPERM retry+fallback.
- `viewer/command_center.html` — BROADCAST TEST button + PRIVATE toggle + 1s-poll progress panel with thumbnails.
- `viewer/publisher.cjs` + `viewer/pub.html` — P6 unified source mixer: mute, cam toggle, PTT, level meter, 1kHz test tone, mid-session device swap, LIVE/PREVIEW/IDLE strip, WS exponential-backoff reconnect, OverconstrainedError modal, cue-from-studio overlay.
- `viewer/studio_stage.cjs` + `viewer/assets/bars_tone.mp4` (NEW) + `viewer/runtime/templates.json` (regen) — BARS_TONE scene/asset for the test's SEEN sweep.

**Lifecycle / persistence (this session's hard-won fixes):**
- `viewer/studio_up.ps1` — (a) Kill-Everything kills the **Phoenix supervisor FIRST**, then its body.js children (was reversed → supervisor respawned bodies → orphans); (b) count==0 **orphan pre-clean** before starting Phoenix; (c) Phoenix launched **headless `elixir.bat --no-halt`** instead of interactive `iex.bat` (iex reads stdin → dies on a headless/boot/transient launcher → orphans the colony). These three are the fix for the recurring phantom-`body.js` class.
- **NEW** `viewer/launcher.cjs` + `viewer/launcher.html` — **Mission Control launcher** (:8090, always-on, survives `-Stop`): honest health of every system (real gates), every link, and START/STOP/RESTART lifecycle. The operator's single "one point" entry (per owner's directive to stop the two-UI confusion).

---

## Proven vs NOT proven

| Claim | Status | Evidence |
|---|---|---|
| 5-stage BROADCAST TEST passes end-to-end | **PARTIAL** (passed in-memory this session; NO durable receipt) | Live polling showed `go:true`, all 5 stages green, SEEN SWEEP 24 scenes incl BARS_TONE all `bytes>2600` (real pixels). BUT `btState` is an in-memory `let` served only via GET `/api/broadcast_test` — it is **never written to disk**. There is NO `broadcast_test_<UTC>.json` receipt. **Finalize TODO:** persist `btState` to `viewer/runtime/broadcast_test_<UTC>.json` on completion (was in the P4.3 plan; not wired). |
| Overlay proof gate | **PROVEN** | `studio_up.ps1` printed `OVERLAY PROOF: PASS` + `viewer/overlay_proof.png`. |
| Headless Phoenix boot-persistence | **PROVEN** | After a foreground bring-up whose launcher shell exited, `:4000` stayed up; `/producer/health` colony_count=5, driver=producer, frame advancing; 5 live body.js. |
| Orphan-reap on teardown | **PROVEN** | `-Stop` reaped 131 body.js + dup erl + director; re-bring-up "PRE-CLEAN reaped 6 parentless colony nodes". |
| Launcher health honesty | **PROVEN** | Launcher correctly reported STACK DOWN during the outage (proof-over-process working). |
| Launcher START → full stack up | **PENDING** | START correctly spawns `studio_up.ps1`, but the last attempt hung on a wedged WMI before Minecraft. Needs a healthy machine to validate. |
| Public GO LIVE (YT+Twitch) | **PENDING / BLOCKED** | node2 mesh-unreachable all session. |
| One-console feature-merge; colony/glass Chrome elimination | **PENDING** | Designed + planned, not built. |

---

## Incident: colony runaway (reconciled with the UNI MineCraft agent)

- Mid-session the whole THINKER stack died at once (mass process death — external/machine event; this box has documented power/load/sleep issues). The launcher correctly caught it (all-red honest health).
- My launcher **START** attempts then spawned `studio_up.ps1` while **WMI was wedged** (`Get-CimInstance` hangs; `Get-Process`/`Test-NetConnection` fine). `studio_up.ps1`'s zombie/colony guards are **`Get-CimInstance`-based**, so with WMI hung they could not detect existing state → a **colony runaway**: the UNI MineCraft agent found colony_count=0 while RCON showed 20/20 at cap and **81 orphaned body.js** (4× the RCON count) — the exact `colony_count==RCON` claim-fence signature.
- **My earlier miss:** I saw two `erl -sname uni` (PIDs 33128/26172) and concluded "healthy launcher+beam pair" from producer's self-reported colony_count=5 — I **did not run the `colony_count==RCON list − Director` gate** my own memory demands. The MineCraft agent's RCON cross-check caught the real runaway. Lesson: producer self-report is not the gate; RCON is.
- **Cleanup (by MineCraft agent):** `studio_up.ps1 -Stop`, verified zero processes + all 6 studio ports closed, archived 178 brain files (`runs/colony_archive/runaway-20260712-093611/`) and the world (`mcserver/uni_world*.bak.20260712-093611`), **seed `8675309` preserved** for identical regeneration. THINKER is clean, zero UNIs, readied (nothing started).

---

## Landmines / gotchas for the next agent

1. **WMI can wedge on this box.** `Get-CimInstance` hangs while `Get-Process`/`Test-NetConnection` work. `studio_up.ps1` leans on `Get-CimInstance` (guards, Kill-Everything) → hangs bring-up + can cause runaways. **Finalize fix:** make the single-node/colony guard WMI-resilient — use `epmd -names` (authoritative node registry) or a Phoenix lockfile instead of a `Get-CimInstance` process COUNT; a reboot clears a wedge.
2. **Single-`--sname uni` invariant + colony bound.** The count-based guard also mislabels the normal Windows launcher+beam **2-erl pair** as a duplicate. And the colony populator can exceed Minecraft `max-players` ("The server is full!" rejects) — **check `max-players` ≥ intended colony size** and bound the populator; reap orphan body.js on a heartbeat, not only on `-Stop`.
3. **Phoenix must be headless (`elixir.bat`), never interactive `iex`** for boot-persistence. Don't revert.
4. **`broadcast.json` has ONE authoritative writer** (`SP.Show.OverlayPublisher`); command_center's `writeState` also writes it → Windows EPERM rename races (now retried+fallback, but the two-writer tension remains — a finalize could route command_center overlay writes through the producer).
5. **node2 down = no public go-live.** Confirm mesh + `uni-bcast-relay` publish-accept before any GO LIVE.
6. **Stream keys** live ONLY in node2 `/etc/uni/runtime.env` — never git, never an agent. The YT/Twitch keys the owner pasted in an earlier chat transcript **should be rotated**.
7. **Two operator UIs existed** (command_center :8098 vs retired node2 `/control`). Owner's directive: **ONE console = union of both**; `/control`'s backend (production-MCP) is gone. See "Open work".

---

## Open work (owner-directed, post-finalize)

1. **One console with ALL features.** Fold the genuinely-missing `/control` features into command_center against THINKER's live backend: run-of-show/segments rundown, guest green room (named admit→on-air mapped to publisher slots), narrate (Piper/ClaudeSpeak TTS box), clip browser (`catalog.json`), world clock. Then **retire `/control`** (redirect to the console). command_center already has ~80% (overlays lower-third/caption/ticker, music/voice, scene cut, web/clip/window-share, broadcast, health, preflight, broadcast-test).
2. **Mission Control launcher** — wire it to auto-start (Startup shortcut + tray watchdog supervise it) so it's the always-on cold-start surface; add a HOME anchor in command_center linking to it; validate START→up on a healthy box.
3. **Eliminate colony/glass Chrome** (owner chose "invest now"): route the two WebGL sources into the studio via a local capture (unified with the cam-slot source model) instead of always-on WGC-captured Chrome. The WebGL-black-in-OBS-CEF constraint is real → needs a real local capture, not a browser source.
4. **WMI-resilient guards** (see landmine 1) + colony bound (landmine 2).
5. **Doc body scrub** (landmine in P7): remove residual "one true broadcast path"/`uni-bcast-mixer` prose; banner the 3 un-bannered docs.
6. **Send the colony a chat update via RCON** (was queued; interrupted).
7. **Public go-live rehearsal** once node2 is back.

---

## Verification addendum (independent read-only workflow, 2026-07-12)

An independent 3-agent verification confirmed the diff + cleanliness + a proven matrix. Results:
- **All named changes CONFIRMED present** and matching intent (CLAUDE.md, 7 doc banners, 2 new ADRs + 2 superseded, command_center.cjs/.html, publisher.cjs, pub.html, studio_stage.cjs, bars_tone.mp4, studio_up.ps1, launcher.cjs/.html).
- **Proven matrix:** headless-Phoenix, orphan-reap ordering + count==0 pre-clean, launcher endpoints, GET/POST fix, writeState EPERM retry+fallback, BARS_TONE registration, bars_tone.mp4 spec, overlay_proof.png — **all PROVEN** against source. BROADCAST TEST — **PARTIAL** (see matrix above).
- **THINKER cleanliness CONFIRMED:** all 8 studio ports down, java/obs64/mediamtx/erl = 0 (the MineCraft agent's `-Stop` held). The Mission Control launcher (:8090) has since been **stopped** — THINKER is fully clean for the finalize; it will come back via the Startup wiring (open work #2).
- **Additional uncommitted files NOT in my original map (for the finalize to handle):**
  - `viewer/studio_channels.ps1` (P3.4 off-screen colony/glass Chrome), `viewer/systray_watchdog.ps1` (P3.1 hidden auto-restart + Show Logs + chrome --app) — **mine**, part of the P3 tray-only work, good to commit.
  - `production/containers/systemd/uni-bcast-pubgate.container` + `production/overlays/status/live.html` — PublishPort `8443→8444` (host :8443 held by the aion stack on node2). **NOT mine** (earlier/other work); pubgate is RETIRED per P1 cleanup, so this file change may be moot — **finalize should reconcile**.
  - `viewer/overlay_proof.png` (NEW) — proof-gate screenshot; commit as evidence or gitignore.
  - `chrome-profiles/` (NEW dir) — Chrome `--app` user-data-dir runtime byproduct — **gitignore, do NOT commit**.
- **templates.json:** currently CONTAINS BARS_TONE (verified L72/L109); git dirty-state read ambiguous between two checks — non-issue, just `grep BARS_TONE viewer/runtime/templates.json` and commit whatever git shows.

## Critical files

- Bring-up/teardown/lifecycle: `viewer/studio_up.ps1` (one coherent up/down), `viewer/launcher.cjs`+`launcher.html` (:8090), `viewer/systray_watchdog.ps1`.
- Console: `viewer/command_center.cjs`+`.html` (:8098). Sources: `viewer/publisher.cjs`+`pub.html` (:8443). Overlays: `viewer/overlay_server.cjs` (:8099). Stage: `viewer/studio_stage.cjs`.
- Gates: `viewer/verify_overlays.cjs` (overlay proof). Colony: `/producer/health` + RCON `list` (colony_count == RCON − Director).
- Retired reference UI: `production/control/control.html` (feature source for the merge).
- Architecture truth: `production/docs/adr/ADR-PROD-011`, `ADR-PROD-012`, `docs/STUDIO_SYSTEMS.md`.

## Bring-up / verify quickstart
```
powershell -File viewer\studio_up.ps1 -Stop      # verified teardown (reaps colony)
powershell -File viewer\studio_up.ps1            # one coherent bring-up (world → UNI → studio)
# then: http://127.0.0.1:8090/  (Mission Control — health/links/START)  ·  http://127.0.0.1:8098/  (run the show)
# gates: OVERLAY PROOF PASS in bring-up log; colony_count==RCON list−Director; BROADCAST TEST (PRIVATE) all 5 green
```
