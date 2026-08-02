# ADR-PROD-013 — The colony host is UNI-LAB (the chip); the render host is a portable GPU box

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** owner directive (binding), reconciled with the studio-agent handoff
- **Splits:** ADR-PROD-011 (native Windows OBS on a GPU host is the vision mixer) — that ADR governs the
  RENDER/MIX/ENCODE host only; this ADR governs the COLONY host. The two are different roles on different boxes.
- **Canonical references:** `CLAUDE.md` (the architecture section), `docs/STUDIO_SYSTEMS.md`,
  `docs/UNI_OS_COLONY_MIGRATION.md`.

## Context

ADR-PROD-011 correctly returned the vision mixer/encoder to a real GPU box (THINKER) after three sessions of
headless-OBS-on-a-GPU-less-node black-frame failures. But the same rewrite's consequence framing also bundled
the **colony source** (the Minecraft world + the Phoenix/`SP.Producer` FEP brain + the `body.js` UNI bots) onto
THINKER, and `viewer/studio_up.ps1` began launching a **local** `java -jar paper.jar` (~:178) + a **local**
Phoenix `--sname uni` colony (~:224) on THINKER against loopback.

That is wrong. The colony needs **no GPU** — it is the pure-Elixir active-inference science substrate. Hosting
it on the studio box coupled the science to a portable render machine, and directly caused the 2026-07-12
colony runaway (two competing `--sname uni` nodes when THINKER's WMI-based guards wedged → RCON 20/20 with
`colony_count:0` + 81 orphan `body.js`). The forage-RED science, meanwhile, already runs the colony correctly:
rootless on UNI-LAB, in Podman on `uni-colony-net`.

## Decision

**The colony source ALWAYS runs on UNI-LAB (`10.190.245.122`), rootless under user `uni`, "on the chip"
(UNI-LAB IS UNI-OS).** The Minecraft world (`:25565` / RCON `:25575`, the `mc-server` container), the
Phoenix/`SP.Producer` FEP brain (`--sname uni`, `:4000` + `:4000/stream`), and the `body.js` UNI bots run in
rootless Podman on `uni-colony-net`. This is non-negotiable: UNI lives on the chip so that agents anywhere —
soon open-source, everywhere — ship to and run/build/deploy/do-science on the one canonical UNI-OS.

**THINKER (or ANY GPU box, Mac or Windows) hosts ONLY the portable studio** — OBS render/mix/encode, the
world-view camera(s) that **capture the lab colony over the LAN**, the operator console, local MediaMTX, and
the `:8090` one-screen launcher. THINKER **captures** the colony; it **never hosts** it. It needs no UNI-OS.
Render/encode placement remains as ADR-PROD-011/012 decided (on the GPU box). This ADR changes only where the
COLONY runs.

**Corrected data flow:** UNI-LAB colony (MC + brain + bodies, on the chip) → THINKER captures world-view
(camera → `mc-server@10.190.245.122`) + overlays (`:4000/stream`) over the LAN → OBS renders on the T1000 →
ONE H264/AAC encode → `rtmp://10.190.245.149:1935/uni/program` on node2 → node2 `runOnReady` tee → YouTube +
Twitch. Single-encode → copy fan-out (ADR-PROD-008).

**Camera-capture mechanism (open — decide before the live cut-over):** either the world-view camera bot runs
on the lab beside the brain (lab publishes `:3020`; THINKER's Chrome + OBS capture it over the LAN, preserving
Producer-driven cinematography), OR a standalone capture client runs on THINKER pointed at
`mc-server@10.190.245.122` (loses brain-driven shot grammar unless its control channel crosses the LAN). The
`MC_HOST` env plumbing in `body.js`/`director.js` already supports both. Surface this choice; do not hand-wave.

## Consequences

**Positive:**
- The science substrate is decoupled from the portable render box: a THINKER crash/reboot never kills the colony.
- The single-`--sname uni` invariant holds on the chip; THINKER can never spawn a competing node.
- The colony survives independently and is reproducible on the one canonical UNI-OS, as the vision requires.

**Required changes (some need a live session — do not claim verified until proven):**
- `viewer/studio_up.ps1` must **stop launching a local `java -jar paper.jar` + local Phoenix colony**; instead
  it gates on the UNI-LAB colony being up and captures it over the LAN. **DONE (`cea1cd3`, 2026-07-12):**
  default path (no `-HostColony`) no longer launches locally; it checks `10.190.245.122:4000` and warns if
  unreachable. The old local-spawn code still exists but only runs behind the labeled non-canonical
  `-HostColony` legacy escape hatch. **Still NOT VERIFIED end-to-end** (a live-session camera→OBS
  non-black-frame proof over the LAN has not been captured and recorded).
- The studio's colony gates (`viewer/verify_colony.cjs`, `viewer/rcon.cjs`, `viewer/launcher.cjs` health tiles,
  `viewer/command_center.cjs` health/PREFLIGHT) must probe UNI-LAB (`10.190.245.122`), not `127.0.0.1`.
  **DONE (`cea1cd3` + `84acc36`, 2026-07-12, verified against the live files 2026-07-13):**
  `launcher.cjs`/`command_center.cjs`/`studio_stage.cjs`/`studio_channels.ps1` default to `COLONY_HOST`
  (`10.190.245.122`); `rcon.cjs` takes `RCON_HOST` env (default `127.0.0.1`, override for the chip);
  `verify_colony.cjs` takes the host as a positional CLI arg (default `127.0.0.1`) — call it as
  `node viewer/verify_colony.cjs 10.190.245.122` (or the DNS name) to point it at the chip.
- The colony-robustness lessons (kill the Phoenix supervisor FIRST, headless `elixir` not interactive `iex`,
  guard on `epmd -names`/a lockfile NOT a `Get-CimInstance` process count, bound the populator to Minecraft
  `max-players`) re-home to the **UNI-LAB** colony bring-up, not THINKER.

**Reconciliation with ADR-PROD-003/012 ("zero broadcast on the ERP appliance"):** UNI-LAB (`10.190.245.122`) is
the SAME box that is also the rootful ERP appliance. "Zero broadcast surface, ever" governs the
**broadcast/render/encode** surface only. The rootless UNI colony (no GPU) DOES run there permanently; a render
/ mixer / encoder NEVER does. Do not read "ERP appliance" as "zero UNI surface."
