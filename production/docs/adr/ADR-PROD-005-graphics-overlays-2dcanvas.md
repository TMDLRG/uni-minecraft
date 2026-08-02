# ADR-PROD-005 - Graphics framework: transparent 2D-canvas / CSS overlays + broadcast.json

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 4; unit `uni-bcast-overlays`; the
  `broadcast.json` contract)

## Context

The show needs broadcast-grade graphics: lower-thirds, a ticker, full-screen titles, multilingual captions,
an on-air badge, a world clock, bumpers, a standby card, and the guest stage layout. A hard-won rendering
lesson from P0: **WebGL renders black** in OBS CEF browser-sources and in cross-origin iframes on the
Windows dual-GPU dev box; only real Chrome windows captured via WGC work there. The glass cockpit proves the
escape hatch even on Linux - it renders a rotating globe + live gauges entirely on the **2D canvas** (never
WebGL) under `chromium --disable-gpu` software raster, so it captures cleanly (observed this session,
Class-B/C from `services/glass/*`). State must flow to many small overlay pages with honest staleness and no
build step.

## Decision

Build the graphics package as **transparent 2D-canvas / CSS overlay pages driven by a shared
`broadcast.json`**, served by `uni-bcast-overlays` (`caddy`/`nginx:alpine` static, `127.0.0.1:8099`) and
captured by OBS as browser-sources. **No WebGL/WebGPU anywhere** - so no black-in-capture. The pages copy the
glass cockpit's proven techniques: ticker = doubled-string CSS scroll; clocks = `Intl.DateTimeFormat` +
`tabular-nums`; card/tone styling; rotation/crossfade; alarm-debounce - but with a **transparent
background**, split **one widget per URL**.

State flow: the producer **atomically writes** `/var/lib/uni/broadcast/broadcast.json` (tmp + `os.replace`,
exactly like `glass/collect.py`); nginx **aliases** it to `/overlays/state.json` with
`Cache-Control: no-store`; each page runs a `fetch(..., { cache: 'no-store' })` poll loop and shows
`updatedUtc` staleness honestly. The MCP `set_overlay` / `narrate` / `duck` tools mutate `broadcast.json`.
The schema is fixed in `production/schemas/broadcast.schema.json`. Pages (each transparent, at
`:8099/overlays/<page>.html`): `ticker.html`, `lower-third.html`, `title.html`, `caption.html`,
`onair.html`, `clock.html`, `standby.html` (the bumper card is rendered by `title.html`), and `stage.html` (the LiveKit guest layout).

## Alternatives considered

- **WebGL / WebGPU graphics (e.g. PixiJS, three.js, shader overlays).** Rejected: the P0 lesson shows WebGL
  black-in-capture on the dev box, and even though that is a Windows-dual-GPU artifact expected to relax on
  Linux, the 2D-canvas rule is the **observed-good** path (the glass cockpit already ships it under
  software raster). Choosing 2D removes a whole class of capture risk for **pending** confidence we do not
  have to spend.
- **OBS-native text/image sources for graphics.** Rejected: OBS-native text gives weak typography, no shared
  data contract, no honest staleness, and no clean multilingual caption pipeline; lower-thirds/ticker/clock
  would each be hand-built in OBS rather than data-driven from one `broadcast.json`.
- **A bundled front-end framework (React/Svelte build).** Rejected: it adds an npm build step and toolchain
  for what is plain DOM + canvas; the glass cockpit shows no build step is needed, which keeps the package
  free and trivially served by a static container.

## Consequences

- Free, no build step, no npm; one data contract (`broadcast.json`) drives every widget; honest staleness is
  built in via `updatedUtc`. Atomic write + `no-store` alias avoids torn reads. Honest tradeoff: 2D-canvas
  forgoes GPU-accelerated effects; "broadcast-grade" polish must be achieved with CSS/canvas craft, and the
  CNN/BBC/PBS-par bar is a **pending** judgment until on air (P5).
- The `broadcast.json` schema becomes a hard interface between the producer, the MCP `set_overlay` verb, and
  the pages - it must be versioned with the schema file.
- The vertical-content reality (most catalog clips are 9:16) is a separate graphics concern (GAP G-9x16,
  `heuristic`): a 16:9 broadcast must pillarbox / shorts-wall vertical clips; the overlay package carries the
  pillarbox/standby framing.
- Evidence class: the glass-cockpit 2D-canvas-captures-cleanly behavior is **Class-B/C** as captured; the new
  overlay pages capturing cleanly in the containerized OBS is **pending**.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Pattern source: `services/glass/*` (`glass/collect.py` atomic write; canvas globe/gauges)
- Schema: `production/schemas/broadcast.schema.json`; pages under `production/overlays/`
- Related: ADR-PROD-002 (`set_overlay`), ADR-PROD-006 (caption overlay), ADR-PROD-004 (stage page),
  ADR-PROD-001 (OBS browser-sources)
- Gap: `production/docs/GAPS_REGISTER.md` row G-9x16
- Quadlet: `production/containers/systemd/uni-bcast-overlays.container`

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified word
is used as a claim. The glass-cockpit 2D-canvas behavior is **Class-B/C** as captured 2026-06-21; the new
overlay pages capturing cleanly are **pending**. The business stack (`solutionwright-*`, odoo, jitsi,
cloudflared, portainer) is **never** a mutation target; the producer agent **cannot self-approve** - overlay
mutations route through the MCP and the gating model.
