# ADR-PROD-011 - Native Windows OBS on a physical GPU host is the vision mixer

- **Status:** Accepted
- **Date:** 2026-07-12
- **Deciders:** UNI Production architecture (operator + producer-agent design)
- **Supersedes-in-part:** ADR-PROD-001 (headless containerized OBS as the vision mixer) — for the
  render/mixer *placement*, not the set-once / director / single-feed shape
- **Master contract:** `docs/STUDIO_SYSTEMS.md` (canonical corrected architecture), the P1–P8 remediation
  plan `~/.claude/plans/fully-plan-all-remediation-snappy-sky.md`

## Context

Three sessions attempted to run the vision mixer as a headless containerized OBS on `uni-lab-79740c`, a
Linux node with no GPU (Matrox G200 class). Every attempt produced the same failure: OBS's CEF browser
sources — which composite the 2D-canvas overlays (ADR-PROD-005) and the studio browser channels — software-
render to a **black frame** under Mesa/llvmpipe with no accelerated compositor. `--enable-webgl` /
`--use-gl=egl` did not fix it; the missing piece is a real GPU + display server, not a flag. The result: a
public black-frame push to YouTube+Twitch and three days of visible failure.

The set-once, director-driven, single-encode shape of ADR-PROD-001 is not in question — it worked and still
works. What was wrong was the *placement*: assuming a GPU-less headless container could render CEF-composed
scenes. It cannot, today.

Meanwhile THINKER (Windows 11, LAN `10.190.245.196`, NVIDIA T1000 4 GB + Intel UHD 630) already runs the
studio surface (`viewer/`), has a real GPU, and produced a working native OBS mixer ~48 h before this ADR
was written. The path of least regret is to keep the mixer where it already renders, and collapse the Linux
node to fan-out relay only.

## Decision

**The vision mixer is native Windows OBS Studio on the physical GPU render host (THINKER).** Scenes are
built once by `viewer/studio_stage.cjs` (idempotent) and driven by verbs over obs-websocket. The mixer is
minimized to the system tray at boot; the operator sees only the tray traffic-light + the command_center
Chrome window (P3 of the plan).

Container-form OBS is **deferred** until a headless-GL-with-real-GPU stack is available on a non-ERP Linux
node (candidates: X11 + NVENC + hardware CEF acceleration inside a container, or Wayland/EGL surfaceless
with GBM). Until that stack exists and passes a real overlay-composition gate (`viewer/verify_overlays.cjs`
against a container-rendered OBS), production stays on THINKER.

> **Scope note (2026-07-12): this ADR governs the RENDER / MIX / ENCODE host only.** It did not, and must not
> be read to, move the **colony source** onto THINKER. The colony (Minecraft world + Phoenix/`SP.Producer` FEP
> brain + `body.js` bots) runs **rootless on UNI-LAB — "the chip" — always**; THINKER captures it over the LAN
> and never hosts it. Colony placement is governed by **ADR-PROD-013**. `viewer/studio_up.ps1`'s local
> `java -jar paper.jar` (~:178) + local Phoenix (~:224) launch is the KNOWN BUG that ADR-013 reverses.

## Consequences

**Positive:**

- Overlays (2D-canvas via CEF) render correctly — this is the whole point.
- NVENC (T1000) becomes available for the encoder — G-ENC largely closes; x264 `faster` 720p30 stays as the
  documented software floor if NVENC is unavailable.
- The Linux node's role clarifies: single-purpose fan-out relay (`uni-bcast-relay` → YT + Twitch tee).
- Boot flow is tray-only: no visible `cmd` / PowerShell windows anywhere; command_center Chrome auto-opens
  after `/api/state`=200 as the single operator surface.

**Negative:**

- THINKER is now the encoder SPOF. Mitigated by: (a) a documented "cold-standby OBS install on node2"
  runbook step (< 60 min rebuild if THINKER dies mid-show), (b) tray watchdog that auto-restarts
  overlay_server / command_center / publisher on crash, (c) an OBS Safe-Mode / crash-recovery dialog
  watcher (`Dismiss-OBSDialogs` in `viewer/systray_watchdog.ps1`) that dismisses the modal within 5s.
- OBS's `.sentinel` directory (30+ writes a marker file at startup, deletes it on clean shutdown) triggers
  Safe Mode on the next start if the box lost power / was hard-killed. Mitigated by clearing that directory
  in `viewer/studio_up.ps1` before every OBS launch.
- Container-form OBS work is not thrown away — it remains scoped as a future ADR when the surrounding stack
  (headless GL + real GPU passthrough + verified overlay composition) exists.

## Gates preserved

- Never claim overlays-up from process existence — `viewer/verify_overlays.cjs` exit-0 + `overlay_proof.png`
  screenshot remains the gate.
- Never claim LIVE from process existence — the 3-signal machine gate (OBS `GetStreamStatus.outputActive` +
  relay `/v3/paths/list` `readers ≥ 1` + `bytesReceived` growing on node2) is the gate.
- Human-typed `CONFIRM` on GO LIVE / OFF AIR (G-PA) is unchanged.

## What did not change

- The set-once mixer + director model (ADR-PROD-001, spirit).
- Single-encode → copy fan-out (ADR-PROD-008).
- 2D-canvas overlays composited into the program scene as browser sources (ADR-PROD-005).
- Stream keys live only in `/etc/uni/runtime.env` on node2. Never git, never held by an agent.
- The Linux node continues to be non-ERP (`uni-lab-79740c` mesh `10.13.13.3`). L1 (`uni-lab` mesh
  `10.13.13.1` / LAN `10.190.245.122`) is the SAME box that hosts the colony: it is BOTH the rootless UNI-OS
  **colony host** (the colony runs there rootless under `uni` — ADR-PROD-013) AND the rootful **ERP appliance**.
  Its *broadcast / render / encode* surface is zero (ADR-PROD-012); the colony (no GPU) legitimately runs there.
