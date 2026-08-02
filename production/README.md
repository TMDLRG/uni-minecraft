# UNI Production Platform — `production/`

The buildable design for a containerized, broadcast-grade live production system on UNI.OS. One operator +
guests + the UNI expert (AI) run a 7-day, 4 h x 3/day multilingual broadcast by voice or text, at CNN/BBC/PBS
quality, for the EducateWright nonprofit + the UNI project.

**Read the master design first:** [`../docs/UNI_PRODUCTION_PLATFORM.md`](../docs/UNI_PRODUCTION_PLATFORM.md).
It fixes every contract this tree is built against — the container/port map, the OBS scene names, the
production-MCP tool surface + gating model, the `broadcast.json` overlay schema, the seven justified technology
decisions, the phased roadmap, and the honesty/GAPS posture. Nothing here contradicts it.

**Posture update (2026-07-11): P1 core IS deployed** to `uni-lab-79740c` — overlays, relay, mixer
(headless OBS validated on-node), production-MCP (on :8095, see the port-collision note). The proof
record + every deviation: [`docs/DEPLOYED_STATE.md`](docs/DEPLOYED_STATE.md); re-prove anytime with
`verify_p1.sh`. The original posture below is kept for history:

**Posture (original, superseded above):** this is a *design / reference*. No part of the stack is deployed. Every "runs / does / serves" is
a proposal (status `pending`), not a current-state claim. Foundation + ingest facts were read 2026-06-21 from
the named source files this session (Class-C/B).

---

## The model in one paragraph

ONE external **Director/Producer** cues a **set-once vision mixer** (OBS, headless, containerized); the mixer
passes **ONE program** out over SRT to a **restreamer** (MediaMTX) that copy-fans-out to YouTube + Twitch +
others. Sources are composited *into* OBS: the colony cam (`:3020`, leave-alone), the `/glass` cockpit, remote
guests (LiveKit -> a stage page), transparent **2D-canvas overlay pages** (lower-thirds/ticker/titles/captions/
clocks/on-air, never WebGL so they capture cleanly), pre-recorded clips from the 600-clip `FINAL/` catalog, and
the music bed. The **UNI Producer** (a `production` MCP, mirroring `services/control_mcp`) exposes the show as
gated MCP tools (`cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`, `admit_guest`,
`start_broadcast`, ...). The operator drives it by voice (STT -> intent -> MCP) or text/buttons; an LLM
(Claude) plays the on-air UNI expert and helps run the gallery. Destructive/outward verbs (`start/stop_broadcast`,
`admit_guest`, `schedule`) stay hard human-gated through the shared `/etc/uni-approvals` gate — the producer
agent can never self-approve.

## The container / service map (the fixed contract)

| Unit | Kind | Port(s) | Role |
|------|------|---------|------|
| `uni-bcast-mixer` | quadlet | obs-ws `127.0.0.1:4455` | OBS headless — the set-once vision mixer + encoder. |
| `uni-bcast-relay` | quadlet | RTMP `1935`, SRT `8890/udp`, API `9997` | MediaMTX restreamer — single encode, copy fan-out. |
| `uni-bcast-overlays` | quadlet | `127.0.0.1:8099` | Static server for the transparent overlay pages + `state.json`. |
| `uni-bcast-livekit` | quadlet | `7880`, `7881`, `50000-50200/udp` | LiveKit SFU — guest green-room -> on-air. |
| `uni-bcast-captions` | quadlet | `127.0.0.1:8501` | faster-whisper live captioner -> writes into `broadcast.json`. |
| `uni-production-mcp` | host svc | `127.0.0.1:8095`, nginx `/prod-mcp` | The production MCP (FastMCP, gated tools). |
| `uni-producer` | host svc | — | The show-runner: run-of-show clock + auto-duck + standby; LLM creative. |
| `uni-playout` | host svc | — | Scheduler/playout over `catalog.json`; 7-day grid + fallback. |

Reused, not modified: the **colony source** (`:3020` cam + `:4000/stream`) and the **glass cockpit** (a
browser-source). The encoder targets a **dedicated broadcast node**, not the ERP appliance (GAP G-ENC).

## The tree

```
production/
  README.md                 this index
  schemas/
    broadcast.schema.json    the overlay state contract (draft-07)
  containers/systemd/
    uni-bcast-mixer.container / -relay / -overlays / -livekit / -captions   the quadlets
    mediamtx.yml / livekit.yaml                                             their configs
  systemd/
    uni-production-mcp.service / uni-producer.service / uni-playout.service  host units
  mcp/
    PRODUCTION_MCP_SPEC.md    the MCP extension spec (22 tools, gating, wiring)
    server.py                 reference FastMCP server (importable-shaped)
    help.py                   CORE_PRIMER + TOOL_HELP (bijective, charter-clean)
    adapters/obs.py overlays.py tts.py livekit.py   thin I/O adapters
  overlays/
    ticker / lower-third / title / caption / onair / clock / standby .html   transparent 2D-canvas pages
    assets/overlays.css       the shared glass palette + base styles
    producer-sample.py        writes a sample broadcast.json for local testing
    README.md                 how to add each page as an OBS browser-source
  run-of-show/
    templates/*.yaml          8 templates: news-desk, interview, panel, explainer, colony-live, film-playout, qa-chat, standby
    slot-4h.yaml              a 4-hour slot chaining templates
    weekly-grid.yaml          the 7-day x 3-slot/day grid across time zones + 6 languages
    GUIDE.md                  the run-of-show guide + beat schema
  guest/
    DESIGN.md                 green-room -> on-air flow, auth, layouts (LiveKit)
    join.html                 guest join + green-room cam/mic check
    stage.html                the on-air layout page OBS captures (talking-head / panel)
    token-server.md           how guest tokens are minted + the security posture
  control/
    DESIGN.md                 the operator pedalboard (LiveView) design
    liveview-route.md         how to add live "/control" to the existing ui/ app
    control.html              a standalone reference control surface
    voice-intents.md          the voice command grammar -> MCP tool mapping
  catalog/
    CATALOG_SPEC.md           the catalog.json index schema + playout policy
    build-catalog.mjs         walks FINAL/ + joins manifests + _status -> catalog.json
    standby-policy.md         the fallback/standby selection policy
  docs/
    DEPLOY.md                 end-to-end wiring on the broadcast node (install/enable/nginx/nft/GPU)
    ROADMAP.md                the detailed P0-P5 roadmap
    GAPS_REGISTER.md          G-ENC / G-PA / G-CAP / G-MUSIC / G-9x16 / G-YTLIB
    adr/ADR-PROD-001..010.md  the ten architecture decision records
```

## Quick-start (when a broadcast node exists)

1. Read [`docs/DEPLOY.md`](docs/DEPLOY.md) — it has the copy-pasteable `install -D`/`enable_etc_service`,
   nginx `/prod-mcp` + `/overlays/`, nftables, and GPU/CDI steps, mirroring the appliance's `lab-os` pattern.
2. Build `catalog.json`: `node production/catalog/build-catalog.mjs` (points at the on-host `FINAL/` pool).
3. Bring up the quadlets + host units on the broadcast node; the mixer set-once-builds its scenes; the
   producer/playout run the run-of-show; the operator opens `/control` (or `control.html`) and a live session.
4. Source a music bed first (GAP G-MUSIC — none exists yet; use CC/royalty-free).
5. Local UI test without a node: `python production/overlays/producer-sample.py` writes a sample
   `broadcast.json`, then open the overlay pages against it.

## How this sits on the proven foundation

The foundation (`viewer/director_show.cjs` + `obs_stage.cjs` + the obs-websocket helpers) already runs the
Director model on the dev box. This tree containerizes that model and generalizes the Director's timer into the
Producer's run-of-show beats (the seam `director_show.cjs` already flags). The colony production
(`SP.Producer` / `:3020`) is consumed as one source and left untouched. See
[`../docs/BROADCAST_REARCHITECTURE.md`](../docs/BROADCAST_REARCHITECTURE.md) (the encode-path lineage) and
[`../docs/UNI_OS_COLONY_MIGRATION.md`](../docs/UNI_OS_COLONY_MIGRATION.md) (the colony container split).

---
## Status (honest)

Charter: `UNI.OS/docs/life-no-game/EPISTEMIC_CHARTER.md` Art. VIII (binding) + live `uni://charter`.

- No banned-unqualified word used as a claim (verified / proven / guaranteed / isolated / secure / 100% /
  certified / real). This tree is a **design**; nothing is deployed, and no status is asserted as current.
- Foundation + ingest facts are Class-C/B, as captured 2026-06-21 from the named source files this session.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
  read-only observation, never a mutation target; the encoder is not co-located with it; every mutating MCP
  action routes through the human approval gate; the producer only proposes and cannot self-approve.
- Open gaps tracked in [`docs/GAPS_REGISTER.md`](docs/GAPS_REGISTER.md): G-ENC, G-PA, G-CAP, G-MUSIC, G-9x16,
  G-YTLIB. Security/isolation claims are Class-Sec/pending until captured runs close them.
