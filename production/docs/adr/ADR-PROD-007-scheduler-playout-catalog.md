# ADR-PROD-007 - Scheduler / playout: catalog index + standby fallback

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 6; unit `uni-playout`)

## Context

The platform is a **7-day-a-week** broadcast on a **4 h x 3/day** grid across time zones, multilingual. It
must play pre-recorded segments and roll clips, cue live segments, and **never go to dead air** when a source
or the encoder glitches. There is an existing content pipeline output: roughly **600 broadcast-ready vertical
MP4s** in `content/media/streets-shorts/FINAL/` (plus investigation + a music video), and each short carries
its own `manifest.json` (`total_duration_s`), `meta.json` (title / language / `evidence_chip`), and
`_status/*.json` (aired -> YouTube id). **No `catalog.json` exists yet.** We need an index the scheduler can
execute against, and a resilience policy.

## Decision

Build a `production/playout` host service (`uni-playout`, `python -m production.playout.run`) that runs a
**playout over a content-catalog index**:

- **`catalog.json` builder** (`production/catalog/build-catalog.mjs`) walks the FINAL pool (+ investigation +
  music video) and **joins** each short's `manifest.json`, `meta.json`, and `_status/*.json` into one
  `catalog.json` (id, title, language, duration, evidence chip, aired/YouTube id, path, aspect).
- The scheduler executes a **per-slot run-of-show** across the **7-day 4 h x 3/day** grid (the weekly grid
  chains slots; each slot template chains beats - `production/run-of-show/`), cueing live segments and
  rolling catalog clips from the FINAL pool.
- **Standby fallback:** on any source or encoder glitch, cut to **STANDBY** and **loop catalog content**
  (last-frame hold -> standby reel) until recovery.
- **Watchdog:** systemd `Restart=always` + a health probe.

## Alternatives considered

- **A media-asset CMS / database (e.g. a relational catalog service).** Rejected for now: the source of
  truth already lives in the per-short `manifest`/`meta`/`_status` files; a derived `catalog.json` index is
  enough and keeps the FINAL files authoritative. A CMS can be revisited if the library outgrows a flat
  index.
- **Live-only (no fallback reel).** Rejected: dead air on a glitch is unacceptable for a CNN/BBC/PBS-par
  show; the STANDBY loop + last-frame hold is the resilience floor.
- **A general scheduler (cron / a job runner) instead of a playout service.** Rejected: playout needs frame-
  accurate beat cueing, language-aware slot selection, and glitch -> standby cutover, which a generic cron
  does not model; the run-of-show templates are first-class.
- **Point the catalog at a separate YouTube-library repo.** Deferred: whether such a repo exists beyond the
  on-host FINAL pool + known playlists is **GAP G-YTLIB** (`pending`); until the operator confirms, the
  builder points at `FINAL/` + the known playlists.

## Consequences

- One derived `catalog.json` lets the scheduler reason over the whole library (duration, language, aired
  state) without re-walking files each tick; the FINAL per-short files stay authoritative. Honest tradeoff:
  the index can drift from the files - the builder must be re-run (or watched) when FINAL changes; staleness
  is a deploy concern, **pending**.
- The STANDBY policy + watchdog give a defined "killed source cuts to STANDBY and recovers" exit check (P4),
  but that behavior is **pending** until a captured run.
- Most catalog content is vertical 9:16 (GAP G-9x16, `heuristic`); the playout + overlay framing must
  pillarbox / shorts-wall vertical clips into the 16:9 program.
- The source of the library is **GAP G-YTLIB** (`pending`) until the operator confirms FINAL/ + playlists is
  the whole set.
- Evidence class: "~600 FINAL MP4s with manifest/meta/_status" is **Class-C** as captured; the running
  scheduler + standby cutover is **pending**.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Content: `content/media/streets-shorts/FINAL/*` (+ `manifest.json` / `meta.json` / `_status/*.json`),
  `post-uni-day.mjs` (existing publish)
- Builder/spec: `production/catalog/build-catalog.mjs`, `production/catalog/` (spec + standby/playout policy)
- Templates: `production/run-of-show/`
- Related: ADR-PROD-005 (standby/bumper overlays), ADR-PROD-008 (relay)
- Gaps: `production/docs/GAPS_REGISTER.md` rows G-9x16, G-YTLIB

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified word
is used as a claim. The FINAL pool inventory is **Class-C** as captured 2026-06-21; the running scheduler +
standby cutover is **pending**; library completeness is **G-YTLIB (pending)** and aspect is **G-9x16
(heuristic)**. The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never** a
mutation target; the producer agent **cannot self-approve** - `schedule` is human-gated (ADR-PROD-010).
