# UNI Production Platform - Detailed Roadmap (P0-P5)

- **Status:** Proposed (design). Nothing in P1-P5 is deployed; every "build / runs / cues" below is a
  **proposal**, status `pending`, not current fact. P0 is the captured foundation.
- **Authored:** 2026-06-21
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (this roadmap expands its phase table; it does not
  contradict it). ADR references: `production/docs/adr/`. Gaps: `production/docs/GAPS_REGISTER.md`.

This roadmap expands the master doc's 6-row phase table into per-phase deliverables, the exact units /
containers built, the exit check, and the dependency edges between phases. The container/service names and
ports are the fixed contract from the master doc's service map; do not rename.

---

## Dependency graph (phase edges)

```
P0 (done) ──► P1 ──► P2 ──► P3 ──► P4 ──► P5
                │      │             ▲
                │      └─────────────┘  (P4 standby/playout reuses P2 overlays + P1 mixer/relay)
                └─ provides the OBS mixer + MCP that every later phase drives
```

- **P1 depends on P0** (the Director seam + clean scenes + one-RTMP foundation).
- **P2 depends on P1** (overlays + captions + control all drive the P1 OBS mixer via the P1 MCP).
- **P3 depends on P1 + P2** (LiveKit stage page is captured by the P1 mixer and laid out with P2's
  2D/CSS graphics).
- **P4 depends on P1 + P2 + P3** (scheduler cues the P1 mixer, rolls catalog clips, uses P2 STANDBY/bumper
  overlays, and can place guest segments from P3; relay fan-out extends P1's relay).
- **P5 depends on all of P1-P4** (full producer autonomy + the UNI-expert persona + GAPS closure).

---

## P0 - Proven foundation (done; build on it, do not relitigate)

- **Deliverable:** Director + clean stage + `/glass` + WGC capture foundation on the dev box.
- **Units (existing, reused not modified):** `viewer/director_show.cjs` (cues OBS over obs-websocket; carries
  the "replace the timer with cues from SP.Producer beats" seam), `viewer/obs_stage.cjs` (clean scenes),
  `viewer/launch_channels.ps1` (source windows); the colony source (`:3020` + `:4000/stream`) and the glass
  cockpit (`/glass`).
- **Exit check (captured):** One RTMP to YouTube, observed; COLONY / GLASS_OS / PIP channels on air with fade
  transitions + a looping music bed.
- **Evidence:** Class-B/C as captured this session from the named files.
- **Dependencies:** none (this is the floor).

---

## P1 - Containerize the mixer + relay + MCP on a broadcast node

- **Deliverable:** move the proven 3-channel show into containers on a **dedicated broadcast node**
  (ADR-PROD-003), and put music + narration control behind the production MCP.
- **Units / containers built:**
  - `uni-bcast-mixer` quadlet - OBS headless (`obsproject/obs` + xvfb/wayland + obs-websocket on
    `127.0.0.1:4455`); scenes COLONY / GLASS / GUESTS / CLIP / NEWSDESK / TITLE / STANDBY / PIP; ONE program
    out over SRT/RTMP; encoder param x264 / nvenc / vaapi (ADR-PROD-001, ADR-PROD-003).
  - `uni-bcast-relay` quadlet - MediaMTX (`bluenviron/mediamtx`; RTMP `:1935`, SRT `:8890`, API
    `127.0.0.1:9997`); single ingest from the mixer, one destination (YouTube program) at P1 (ADR-PROD-008).
  - `uni-production-mcp` host svc - FastMCP on `127.0.0.1:8095`, nginx `/prod-mcp`; mirrors
    `services/control_mcp`; shares `/etc/uni-approvals` + `uni-approvald` (ADR-PROD-002). P1 tool subset:
    read-only `get_show_state` / `list_scenes` / `list_sources`; mutating `cut_to`, `set_music_volume`,
    `duck`, `narrate` (Piper).
  - The `director_show.cjs` cue seam is re-pointed at the MCP (the producer/operator drives cuts via tools).
- **Exit check:** the **same** 3-channel show, now from quadlets; ONE program to YouTube; music level +
  narration controllable via the MCP (a `narrate` call auto-ducks the music bed).
- **Dependencies:** P0 (the Director seam + clean scenes). Needs the broadcast node (G-ENC; x264 floor if no
  GPU yet).
- **Gaps touched:** G-ENC (`pending_hardware`) - node/GPU choice; x264 720p30 `faster` is the floor.

---

## P2 - Graphics package + multilingual captions + operator control

- **Deliverable:** the transparent 2D-canvas overlay graphics + the `broadcast.json` spool + live captions +
  the operator's voice/text control surface.
- **Units / containers built:**
  - `uni-bcast-overlays` quadlet - static server (`caddy` / `nginx:alpine`, `127.0.0.1:8099`) serving the
    transparent pages `ticker.html`, `lower-third.html`, `title.html`, `caption.html`, `onair.html`,
    `clock.html`, `standby.html` (the bumper card is rendered by `title.html`) and aliasing `broadcast.json` -> `/overlays/state.json`
    (`no-store`) (ADR-PROD-005).
  - `broadcast.json` spool + producer writer (atomic tmp + `os.replace`) under `/var/lib/uni/broadcast/`;
    schema fixed in `production/schemas/broadcast.schema.json`.
  - MCP `set_overlay` verb (mutates `broadcast.json`: lower-third / ticker / title / caption / on-air).
  - `uni-bcast-captions` quadlet/svc - faster-whisper (CTranslate2); transcribes program/mic audio ->
    `broadcast.json.caption` (+ translations); read-only `caption_status` MCP verb (ADR-PROD-006).
  - Operator control: the `/control` Phoenix LiveView route in the existing `ui/` app (`:4000`) -
    scene/cut buttons, music fader + duck toggle, narrate box + language picker, overlay editors; plus the
    voice path (mic -> STT (whisper) -> intent -> production-MCP call) and the text command box (LLM -> MCP).
- **Exit check:** lower-thirds / ticker / clock / captions on air (rendered from `broadcast.json`); the
  operator cuts the show and rides music / narration by **voice or text**, every action audited + session-
  gated.
- **Dependencies:** P1 (overlays are captured by the P1 OBS mixer; control drives the P1 MCP).
- **Gaps touched:** G-CAP (`pending_hardware`) - real-time multilingual caption latency/quality unmeasured;
  G-9x16 (`heuristic`) - pillarbox framing in the overlay package.

---

## P3 - Guest ingest (green room) + multi-cam + talking-head/panel

- **Deliverable:** remote guests join, land in a green room, and are admitted to a panel; multi-cam + the
  stage layout.
- **Units / containers built:**
  - `uni-bcast-livekit` quadlet - LiveKit server (ws/http `:7880`, rtc-tcp `:7881`, rtc-udp
    `50000-50200`); a green-room room + an on-air room (ADR-PROD-004).
  - `production/guest/` - the UNI.OS-hosted green-room join app (LiveKit JS; token/link auth; cam/mic check
    off-air).
  - `production/overlays/stage.html` - the on-air stage page (subscribes to the on-air room; talking-head
    for one guest, panel for N; 2D/CSS layout; captured by OBS).
  - MCP verbs: `list_guests` (read), `admit_guest` (**human-gated**, green-room -> on-air), `remove_guest`
    (session-gated), `set_layout` (talking-head / panel / PIP).
- **Exit check:** a remote guest joins, lands in the green room (host sees them, off-air), and is admitted to
  a panel on air via `admit_guest` (human-gated).
- **Dependencies:** P1 (OBS captures the stage page) + P2 (2D/CSS graphics for the stage layout + lower-
  thirds for guests).
- **Gaps touched:** the WebRTC UDP range firewall/NAT surface (a P3 deploy concern; not a charter gap).

---

## P4 - Scheduler / playout + restream fan-out + standby resilience

- **Deliverable:** the 7-day 4h x 3/day grid runs; `catalog.json` builder; restream to Twitch/others;
  standby/fallback resilience.
- **Units / containers built:**
  - `uni-playout` host svc (`python -m production.playout.run`) - executes the per-slot run-of-show across
    the weekly grid; cues live segments; rolls catalog clips from FINAL (ADR-PROD-007).
  - `production/catalog/build-catalog.mjs` - walks `content/media/streets-shorts/FINAL/` (+ investigation +
    music video), joins each short's `manifest.json` / `meta.json` / `_status/*.json` -> `catalog.json`.
  - `production/run-of-show/` - the 8 templates + the 4h-slot template + the weekly grid.
  - Standby/fallback policy - on a source/encoder glitch, cut to STANDBY and loop catalog content (last-frame
    hold -> standby reel); watchdog `Restart=always` + a health probe.
  - Relay fan-out extended - the P1 relay (MediaMTX) now copy-fans-out to YouTube + Twitch + others
    (ADR-PROD-008).
  - MCP verbs: `list_clips` / `list_segments` (read), `roll_clip`, `start_segment` (session-gated),
    `schedule` (**human-gated**).
- **Exit check:** the 24/7 grid runs across time zones; a deliberately killed source cuts to STANDBY and
  recovers.
- **Dependencies:** P1 (mixer + relay) + P2 (STANDBY / bumper overlays) + P3 (guest segments can be placed
  in a slot).
- **Gaps touched:** G-9x16 (`heuristic`) - vertical clips pillarboxed / shorts-walled into 16:9; G-YTLIB
  (`pending`) - library source confirmation; G-MUSIC (`pending`) - the music bed asset must be sourced
  (CC/royalty-free) before a clean 24/7 grid.

---

## P5 - Full producer autonomy + UNI-expert persona + polish + GAPS closure

- **Deliverable:** a slot runs largely producer-driven; the UNI-expert Claude persona on cam/voice; polish to
  CNN/BBC/PBS par; close the open gaps with captured evidence.
- **Units / changes built:**
  - `uni-producer` host svc (`python -m production.producer.run`) - the deterministic run-of-show clock +
    auto-duck + standby/watchdog emitting "beats"; an LLM (Claude over the MCP) handles
    creative/narration/guest decisions + the operator's voice/text commands (the generalized
    `director_show.cjs` seam).
  - The **UNI-expert Claude persona** (ADR-PROD-009) - seeded with `02_FACT_SHEET.md` + `UNI_CHAT.md`, fenced
    by `05_CLAIMS_AND_FENCES.md`; speaks via `narrate`; `uni-deep-chat` only as labeled microscope B-roll.
  - Polish pass - timing, transitions, typography, multilingual slots, CNN/BBC/PBS-par judgment.
- **Exit check:** a slot runs largely producer-driven; **G-PA / G-ENC / G-CAP closed by captured evidence**
  (a logged red-team run for G-PA; the encode load observed on the broadcast node and off the ERP for G-ENC;
  measured caption latency/quality for G-CAP).
- **Dependencies:** all of P1-P4.
- **Gaps touched / closed:** G-PA (`pending_external` -> closed by a logged red-team run), G-ENC
  (`pending_hardware` -> closed by a captured encode-load run on the node), G-CAP (`pending_hardware` ->
  closed by a measured caption run).

---

## Cross-phase invariants (hold in every phase)

- ONE program out of the mixer; the relay copies (encode once).
- All mutations route through the **shared human-approval gate**; the producer agent **cannot self-approve**;
  outward/irreversible verbs (`start_broadcast`, `stop_broadcast`, `admit_guest`, `schedule`) are always
  human-gated (ADR-PROD-010).
- The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never** a mutation
  target; the encoder is **not** co-located with the ERP appliance (ADR-PROD-003).
- Persistent state lives under `/var/lib/uni/broadcast/` or named Podman volumes - never `/tmp` or `/run`.
- No WebGL/WebGPU in graphics; 2D-canvas / CSS only (ADR-PROD-005).
- Every status claim carries timestamp + source + evidence class.

---

## Status (honest)

This roadmap is a **design**; only P0 is captured. No banned-unqualified word is used as a claim (no
verified / proven / guaranteed / isolated / secure / 100% / certified / real). P0 is **Class-B/C** as
captured 2026-06-21; P1-P5 are **proposals**, status `pending`, with exit checks to be closed by captured
runs. Open gaps (G-ENC `pending_hardware`, G-PA `pending_external`, G-CAP `pending_hardware`, G-MUSIC
`pending`, G-9x16 `heuristic`, G-YTLIB `pending`) are tracked in `production/docs/GAPS_REGISTER.md` and
closed only by linked evidence. The business stack is **never** a mutation target and the producer agent
**cannot self-approve**.
