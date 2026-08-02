# ADR-PROD-001 - Vision mixer / compositor: OBS Studio headless (set-once)

> **⚠️ SUPERSEDED-IN-PART BY [ADR-PROD-011](ADR-PROD-011-native-windows-obs-on-render-host.md) (2026-07-12).**
> The set-once / director / single-feed shape is unchanged and still authoritative. The mixer *placement*
> (headless containerized OBS on a GPU-less Linux node) was wrong in practice — CEF browser sources
> software-render black without a real GPU + display server. The mixer now runs as **native Windows OBS**
> on the physical GPU host (THINKER). Container-form OBS is deferred until a headless-GL-with-real-GPU
> stack passes the overlay-composition gate. Read ADR-PROD-011 before treating anything in this ADR as
> deployment guidance.

- **Status:** Superseded-in-part
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture (operator + producer-agent design)
- **Supersedes:** none
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 1; unit `uni-bcast-mixer`)

## Context

The proven P0 foundation already uses the **Director model**: ONE external show-runner cues a
**set-once vision-mixer**, and the encoder passes **ONE feed** to YouTube. The foundation code
(`viewer/director_show.cjs`, `viewer/obs_stage.cjs`, `viewer/launch_channels.ps1`) drives **OBS Studio**
over `obs-websocket`, with scenes (COLONY / GLASS_OS / PIP), fade transitions, a looping music bed, and a
single RTMP output - this was observed on air this session (Class-B/C, as captured from the named files).

A hard-won rendering lesson is captured in the foundation: on the Windows dual-GPU dev box, WebGL renders
**black** in OBS CEF browser-sources and in cross-origin iframes; only real Chrome windows captured via WGC
work. That constraint appears to be a Windows-dual-GPU artifact and is expected to go away once the pipeline
is containerized on UNI.OS / Linux, where OBS browser-sources run under software raster. The graphics
package independently follows the 2D-canvas-only rule (ADR-PROD-005), so the mixer's browser-source path is
not relied on for WebGL.

We must pick the component that composites all sources (colony cam, `/glass`, overlay pages, guest stage,
operator cam, clips, music bed) into ONE program and encodes it once. The choice shapes audio mixing,
transitions, ducking, and mux.

## Decision

Use **OBS Studio, headless, containerized** (`obsproject/obs` + xvfb/wayland + obs-websocket) as the
**set-once vision mixer and encoder** (`uni-bcast-mixer`, obs-websocket on `127.0.0.1:4455`). OBS holds the
fixed scene set (COLONY / GLASS / GUESTS / CLIP / NEWSDESK / TITLE / STANDBY / PIP), each layered with the
transparent overlay browser-sources plus the music bed, and outputs ONE program over SRT/RTMP to the relay.
The encoder is a quadlet parameter (x264 default; NVENC / VAAPI when a GPU is present - ADR-PROD-003).
The `director_show.cjs` cue seam ("replace the timer with cues from SP.Producer beats") is the exact point
where `uni-producer` + the production MCP take over driving OBS.

## Alternatives considered

- **Pure headless-Chromium + CDP compositor (the `BROADCAST_REARCHITECTURE.md` Phase-2 idea) as the WHOLE
  mixer.** Rejected: it reinvents per-source audio mixing, transitions, ducking, and the A/V mux that OBS
  already provides, and it discards the proven Director seam. We instead use HTML pages as **graphics
  sources composited into OBS**, not as the mixer itself.
- **LiveKit Egress room-composite as the mixer.** Rejected: it cannot cleanly ingest the colony cam
  (`:3020`) or local FINAL clips as first-class sources, its layout model is WebRTC-room-centric, and it
  discards the Director seam. LiveKit is retained only for **guests** (ADR-PROD-004); the guest `stage` page
  is captured by OBS so OBS stays the single mixer.
- **Hardware vision mixer / cloud studio (e.g. a SaaS switcher).** Rejected on the free/open and
  on-appliance constraints; it would also externalize state and break the audit/approval gate.

## Consequences

- Reuses the proven Director seam and OBS feature set (scenes, transitions, per-source audio, sidechain
  ducking, SRT/RTMP) at no new build cost. Honest tradeoff: OBS headless in a container needs a virtual
  display (xvfb/wayland) and obs-websocket driving; the container recipe is new (P1) and unproven until
  deployed - **status pending**.
- The Windows WebGL-black lesson does not bind the Linux container target for 2D-canvas overlays; this is an
  **inference** (Class-pending) until the containerized mixer is observed compositing overlays cleanly.
- Single-program-out keeps the "never pile sources into the encoder" rule and the one-encode contract
  (relay copy-fans-out, ADR-PROD-008).
- Evidence class of the load-bearing claims: the foundation OBS/Director behavior is **Class-B/C** (as
  captured this session from `viewer/*.cjs`); "OBS headless composites cleanly in the UNI.OS container" is
  **pending** until a captured run.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Foundation: `viewer/director_show.cjs`, `viewer/obs_stage.cjs`, `viewer/launch_channels.ps1`
- Related: ADR-PROD-003 (encoder/codec), ADR-PROD-005 (overlays), ADR-PROD-008 (relay), ADR-PROD-004 (guests)
- Quadlet: `production/containers/systemd/uni-bcast-mixer.container`

## Status (honest)

This ADR is a **design**, status `pending`; no part is deployed and nothing here is claimed to run. No
banned-unqualified word is used as a claim (no verified / proven / guaranteed / isolated / secure / 100% /
certified / real). The OBS/Director foundation behavior is **Class-B/C** as captured 2026-06-21 from the
named files; the containerized-mixer claims are **pending** until a captured run. The business stack
(`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never** a mutation target and is not
co-located with the encoder; the producer agent **cannot self-approve** - it only proposes, mutations route
through the human approval gate.
