# STUDIO SYSTEMS — the canonical map (read this FIRST, it overrides every older studio doc)

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](../production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](../production/docs/adr/ADR-PROD-012-encoder-placement-policy.md) first.**
> After three days of failed attempts to run headless containerized OBS on GPU-less Linux (CEF software-
> renders black), the mixer returns to where it worked: **THINKER** (Windows 11, NVIDIA T1000 4 GB, LAN
> 10.190.245.196) is the render + mixer + operator studio — **PORTABLE (any GPU box, Mac/Win)**. **node2
> `uni-lab-79740c`** (mesh 10.13.13.3) is fan-out relay ONLY (`uni-bcast-relay` copies THINKER's single encode
> to YouTube + Twitch via mediamtx `runOnReady` tee). **L1 `uni-lab`** (mesh 10.13.13.1) is the ERP appliance
> with ZERO broadcast surface (invariant preserved from ADR-PROD-003; restated in ADR-PROD-012).
>
> **⚠️ SECOND CORRECTION (2026-07-12, owner-set — supersedes any "colony source on THINKER" in this doc): the
> COLONY (Minecraft world + Phoenix/`SP.Producer` FEP brain + `body.js` bots) runs on UNI-LAB
> (`10.190.245.122`), ROOTLESS, "on the CHIP" (UNI-LAB IS UNI-OS) — ALWAYS, NEVER on THINKER. THINKER
> CAPTURES the colony over the LAN and never hosts it.** Canonical: `CLAUDE.md`,
> [ADR-PROD-013](../production/docs/adr/ADR-PROD-013-colony-host-placement.md), `docs/UNIVERSE.md`,
> `docs/UNI_OS_COLONY_MIGRATION.md`. Any reference in this doc's older body to a "System 2 mixer" on node2/L1,
> "the one true broadcast path", or a "colony source on THINKER" is **STALE** — trust the banner + those four.

**Status: CANONICAL, 2026-07-11.** Written after a night of repeated bring-up failures caused by two
studio systems being conflated and overlay claims being made from process existence. If any other doc
(RUNBOOK_STUDIO, STUDIO_OPERATOR_MANUAL, RESUME_*, RUNBOOK_LIVE_STREAM) contradicts this file, THIS
file wins. Agents: the CLAIM RULES at the bottom are binding.

---

## There are TWO studio systems. Never conflate them again.

| | **System 1 — the v1 dev studio (`viewer/`)** | **System 2 — the Production Platform (`production/`)** |
|---|---|---|
| **What it is** | A fleet of loose Node/PowerShell processes in visible windows, launched by `viewer\studio_up.ps1` on the Windows dev box (THINKER) | A containerized broadcast platform: 5 Podman quadlets + 3 host systemd services on a UNI.OS node |
| **Status** *(row STALE — see top banner + ADR-PROD-013)* | Corrected: the COLONY runs on **UNI-LAB (the chip), rootless** — not here; THINKER is the portable studio (native OBS, not "dev-preview"). | Corrected: node2 = **relay ONLY**; the mixer/overlays stack there is RETIRED (`verify_p1.sh` is STALE against relay-only node2). Scenes/program (**G2**) HELD pending the colony survival gate. |
| **Design docs** | `docs/RUNBOOK_STUDIO.md`, `docs/STUDIO_OPERATOR_MANUAL.md` | `docs/UNI_PRODUCTION_PLATFORM.md` (master) + `production/docs/adr/ADR-PROD-001..010` |
| **Role going forward** *(row STALE — see the top banner + ADR-PROD-013)* | Old framing: "colony source + deprecated broadcast half on Windows." **Corrected:** the COLONY runs on **UNI-LAB, rootless, on the chip**; THINKER is the **portable render/studio** that captures it (native OBS, NOT deprecated). | Old framing: "one true broadcast path = containerized OBS mixer on node2." **Corrected:** node2 is the **fan-out relay ONLY** (`uni-bcast-relay`); the mixer/overlays there are RETIRED — render is native OBS on THINKER. |

### System 1 service map (what `studio_up.ps1` starts, in order — this is the "million cmd windows")
| service | what | port |
|---|---|---|
| Minecraft `paper.jar` | the world | `:25565` (RCON `:25575`) |
| Phoenix `--sname uni` (`UNI_AUTOSTART=1`) | supervised SP.Show: Colony→Director→Producer→OverlayPublisher + `/stream` | `:4000` |
| `director.js` (child of the beam — NEVER standalone) | colony cam, raw 3D world feed | `:3020` |
| OBS (profile UNI) | the dev vision mixer / compositor | ws `:4455` |
| `overlay_server.cjs` | serves overlay HTML pages + `state.json` | `:8099` |
| MediaMTX | local restream ingest | rtmp `:1935`, api `:9997` |
| `studio_stage.cjs` | **builds the OBS scenes and puts the overlays INTO OBS** | one-shot |
| `command_center.cjs` | operator console | `:8098` (air-status `:8097`) |
| `publisher.cjs` | remote-source gateway | `:8443` |
| `systray_watchdog.ps1` | restarts dead node services | — |

### The command-center preview/thumbnails — HONEST signals + a bounded live-feel (2026-07-15)
> Canonical receipt: `docs/receipts/preview_honest_preregistration_2026-07-15.md` (both cures PASS).
> Governing spec: `docs/handoffs/STUDIO_AGENT_PREVIEW_THUMBNAIL_HONEST_2026-07-15.md`.

Every "attached/LIVE" signal on the console is **true-by-frame**, and the live feel is delivered at a
deliberately cheap cadence — never an all-card fast-poll.

- **Honesty split (cure 1) + PIXEL truth (cure 3).** Two orthogonal booleans, never collapsed into
  one green "LIVE": `registered` (a source/slot heartbeats — may be true while black) and `rendering`.
  **`rendering` is measured by PIXELS, not bytes** (cure 3, 2026-07-15): byte-count was a lie — a
  solid-black 720p JPEG is ~15 KB and a lower-third over a black camera beats any byte threshold (it
  labelled a black COLONY "live 3fps"). The honest test grabs a tiny uncompressed BMP and measures the
  **non-black fraction of the camera region** (top of frame; overlays sit in the excluded bottom 25%);
  `rendering = frac >= 0.12` within `RENDER_FRESH_MS=45000`. Calibrated live: dead camera 0.00, live
  world 0.99. **Only `rendering` may read LIVE.** `registered && !rendering` → **"NO SIGNAL"**, never
  LIVE. `/api/thumbs` + `/api/thumb` emit `frac`/`X-Frac`; camstatus reads "publishing (H264)" (codec
  truth), never a bare LIVE.
- **COLONY world capture** = OBS `cap_colony` window-captures the `:3020` Prismarine-Viewer Chrome
  window (WGC, off-screen). **Match it by the page title `Prismarine Viewer`, never the transient host
  title Chrome shows mid-load** (`uni-lab-lan.uni-lab.local`) — the title drifts after load and a stale
  match makes WGC capture pure black. `studio_channels.ps1` rejects host-titles (`Host-Of`).
- **The cadence (cure 2) — one scene live at a time, viewer-gated:**
  - every OTHER grid card = a **reference still** (`pollThumbs`, 3 s) refreshed on demand / on
    program-change / by the 20-min safety sweep. **Never fast-poll all cards.**
  - armed **PREVIEW** = a **~3 fps live loop** — the server grabs ONLY `operatorPreview`, and ONLY
    while a console polled `/api/thumb` in the last 10 s (dormant otherwise). Measured 2.83 changes/sec.
  - clicked tile = the client fast-polls that ONE tile's `/api/thumb` for **~5 s**, then falls back
    to the still.
  - **PROGRAM** = a **30 s heartbeat** re-verifies the one on-air scene (a program going black flips to
    NO SIGNAL within ~30 s).
  - **FREEZE-ON-AIR:** when the armed scene == program, the 3 fps loop skips it (the heartbeat owns it);
    the preview monitor holds its last snap and shows `⏸ ON AIR — frozen`.
  - the true **30 fps** view stays OBS's own projector window (the `OpenVideoMixProjector` flyout,
    untouched). `GetSourceScreenshot` costs ~4–6 ms (≈2 % of the 333 ms interval).

### Gaia — an INDEPENDENT surface, not part of System 1 (added 2026-07-14, do not conflate)
`viewer/gaia/**` (`gaia_server.cjs`, port `:8096/gaia`) is a read-only, signal-only mirror of ALL tracks
(repo/git, gate ledger, infra registry, science-source excerpts, studio/colony probes, sessions, its own
code+MCP) — GAIA LAW: every output is a direct signal with provenance, never a summary/score/verdict; see
`docs/GAIA.md`. **It is NOT started by `studio_up.ps1`** (that script has no reference to it) and is **NOT
restarted by `systray_watchdog.ps1`** (the studio System-1 watchdog every row in the table above relies on).
It has its own fully independent lifecycle: a dedicated `gaia_watchdog.ps1` supervises `gaia_server.cjs` +
the mind-capture loop, and boot-persistence is a separate per-user Startup-folder `.vbs`
(`gaia_boot_install.ps1`). Conflating Gaia's lifecycle with System 1's is exactly the class of error this
doc exists to prevent — keep them apart.

### The Door — one-click triage entry, INDEPENDENT like Gaia (added 2026-07-14)
`viewer/door.html`, served by `launcher.cjs` at `http://127.0.0.1:8090/door` — the operator's one-click
entry: live flight check (every surface honestly probed, incl. a Gaia tile), self-diagnostic with
known-good remediations + a RESTORE (START STUDIO) action, recent lifecycle history, and the
Operator ⇄ UNI ⇄ Gaia resonance/drift panel with the next EFE correction. **It survives an apocalypse
by construction:** `launcher.cjs` is deliberately absent from `studio_up.ps1 -Stop`'s kill lists; a
dedicated `door_watchdog.ps1` (named-mutex self-dedup, `UNI_DOOR_WATCHDOG`) crash-restarts it;
boot-persistence is a per-user Startup `.vbs` (`door_boot_install.ps1`, proven only by the autonomous
arbiter `door_boot_proof.ps1` after a real power-cycle); and the desktop/Start-menu icon targets
`door_open.vbs` → `door_open.ps1`, which cold-starts the whole chain (watchdog → launcher → door
window) from fully dead — falling back to the static `door_offline.html` triage page if node itself
is broken, so the door never dead-ends. Gate: `door-boot-persistent` in `evidence/gates.ndjson`
(crash-restart + dedup + one-click cold resurrection PROVEN 2026-07-14; reboot leg PENDING).
**The lifecycle circle (added 2026-07-14, gate `door-lifecycle-circle`):** `viewer/door_lifecycle.cjs`
gives every door a full state machine (open/closed x locked/unlocked + the HOW of all four
transitions), a circle invariant (open ⇒ ready-to-close, closed ⇒ ready-to-open), per-door
predictions, an append-only audit ledger, and ONE KEY open-all/close-all (`/api/door/*`). Close is
GRACEFUL everywhere on THINKER (`/shutdown` verbs + systray-first ordering + OBS WM_CLOSE-then-force;
OBS starts always self-heal `.sentinel` + `--disable-shutdown-check`, so the safe-mode dialog can
never block a bring-up). Remote doors (colony/world/cam/relay) are OBSERVE-ONLY by mandate — the
studio never impacts the UNIs; only Organic Operator Michael Polzin directs them. Gaia projects the
register verbatim as `studio.doors.register`. Receipt: `docs/receipts/door_lifecycle_circle_2026-07-14.md`.
**Storm-breaker law (2026-07-14, after the OBS/cc-window spawn storm — gate `door-storm-breakers`,
Class A):** (1) *reads never actuate* — polled endpoints (journey/state) are pure observers;
(2) *one bring-up at a time* — `studio_up.ps1` self-guards with the OS mutex `UNI_STUDIO_UP`
(`-MutexProbe` drills it side-effect-free); (3) *idempotent windows* — the command-center Chrome
window opens only if none exists on its profile. Full message-flow diagrams incl. the incident:
`docs/DOOR_LIFECYCLE_SEQUENCES.md`; live view: the living map on `/door`. Both boot gates
(`door-boot-persistent`, `gaia-boot-persistent`) flipped to **PASS** on the real 2026-07-14 12:26
power-cycle — receipts in `docs/receipts/stability_audit_2026-07-14.md`.

### The HUD — third INDEPENDENT surface, NATIVE .NET architecture (added 2026-07-14, rewritten native same day)
**No HTML, no browser page.** Two binaries: `UNI.Hud.Service`
(`viewer/hud/native/UNI.Hud.Service/`) — a genuine `ServiceBase` Windows Service (via
`Microsoft.Extensions.Hosting.WindowsServices`, **no NSSM wrapper**), JSON-only HTTP API on
loopback `127.0.0.1:8100` (**not LAN-reachable** — narrower than first drafted) — and
`UNI.Hud.Widget` (`viewer/hud/native/UNI.Hud.Widget/`) — the actual visible surface: a WPF
always-on-top panel, docks to a screen edge, tray-minimizable, `Ctrl+Shift+H` hotkey toggle.
The original NSSM/Node/`hud.html` design (ADR-PROD-015) was rejected by the operator as a
category error — a Windows Service runs in Session 0, which cannot paint pixels on the
interactive desktop; serving a browser page from a service conflated "headless backend" with
"visible always-on surface." See ADR-PROD-016 for the full rationale and the retirement.
Refreshes on the shared 3-second poll bus. Composes upstream truth: `:8090/api/mission` +
`:8090/api/door/state` + `:8090/api/door/journey` + `:8096/api/gaia/drift` + direct disk read
of `evidence/gates.ndjson` (`HUD_REPO_ROOT` env).
**FIRST-OF-ITS-KIND in the repo:** (a) real `ServiceBase` Windows Service `UNI-HUD` with zero
wrapper dependency, registered via `sc.exe create` directly
(`viewer/hud/native/_swap_service_elevated.ps1`); (b) first native WPF desktop app in the repo.
Runs as **`NT AUTHORITY\NetworkService`** — least privilege, genuinely deployed. The first
attempt failed (`HttpListener` returned Access-Denied under that account) because HTTP.SYS
requires an explicit URL ACL reservation for any non-admin account before it will bind a
prefix, even a loopback-only one; fixed same day via `netsh http add urlacl` plus a repo-root
ACL grant (`viewer/hud/native/_urlacl_and_networkservice_elevated.ps1`) — no rollback, live
StartName confirmed as `NT AUTHORITY\NetworkService`.
**Two-leg supervision, no watchdog process for either binary:** (1) SCM auto-restart
(`sc.exe failure` recovery policy) for the service; (2) per-user Startup `.vbs`
(`hud_widget_boot_install.ps1`) for the widget. Reboot-survival gate `hud-boot-persistent` is
a **5-clause AND** on `viewer/hud/native/hud_native_boot_proof.ps1` (native ImagePath
registered, real reboot post-dates current config, running+port-up, JSON envelope confirms
native instrument string, widget Startup entry present) — the OLD
`viewer/hud/hud_boot_proof.ps1` checks watchdog-era artifacts and can never PASS for this
architecture; do not cite it.
**GAIA-LAW positioning:** the HUD lives OUTSIDE `viewer/gaia/**` (downstream reader, not inside the
write-fence). Voluntarily honors receipts-beat-rhetoric: any HUD-computed rollup shows underlying
counts alongside. **Audience feed:** endpoint-only staging — receiver
(`POST /api/hud/audience/publish`, sanitizer-vouched) + widget panel; YT/Twitch adapters land
in a later cure. This endpoint was completely broken (dynamic-binding bug on a JsonElement) from
first native ship until a 2026-07-14 ultracode review caught it — now fixed and
regression-tested (`UNI.Hud.Service.Tests`). **Two-tier user-scope fix:**
`viewer/hud/native/hud_user_sight.ps1` runs in the operator's own logon session (never the
service, never a password) to see what a machine account structurally cannot (e.g. OBS crash
sentinels — live-confirmed invisible to a service account even with FullControl ACLs) and POSTs findings
to `POST /api/hud/sight/push`. Canonical doc: `docs/HUD.md`; ADRs:
`production/docs/adr/ADR-PROD-015-uni-hud-independent-surface.md` (original decision, partially
superseded) + `ADR-PROD-016-uni-hud-native-dotnet-rewrite.md` (the native pivot, current).
Conflating the HUD's lifecycle with System 1's is the same class of error
`docs/STUDIO_SYSTEMS.md` exists to prevent — keep them apart.

### System 2 service map (the fixed contract — see UNI_PRODUCTION_PLATFORM.md)
`uni-bcast-mixer` (OBS headless, ws `:4455`) · `uni-bcast-relay` (MediaMTX `:1935`/`:8890`/`:9997`) ·
`uni-bcast-overlays` (static overlay pages + state, `:8099`) · `uni-bcast-livekit` (`:7880/7881`,
`50000-50200/udp`) · `uni-bcast-captions` (`:8501`) · host services `uni-production-mcp` (designed `:8094`; **DEPLOYED `:8095`** on this node — `:8094` is `uni-glass-configure`, answers 404),
`uni-producer`, `uni-playout`. **Placement rule (binding, ADR-PROD-003): never on the ERP appliance
(`uni-lab` @10.190.245.122).** Target: a non-ERP UNI.OS node.

**P1 target decision (2026-07-11):** `uni-lab-79740c` (mesh `10.13.13.3`) — the only non-ERP x86
UNI.OS box on the mesh. Deviation from "dedicated" documented honestly: it also hosts the
`aion-*`/`orchestrate-api` workload; encode floor is **720p30 x264 `faster`** until a GPU is
confirmed (GAP G-ENC stays open).

**P1 deploy log (2026-07-11, via uni-lab MCP, approval-gated):**
- ✅ Phase C payload: `production/` tree shipped to `/var/lib/uni/broadcast-src/production` (sha256-verified
  tarball over LAN); spool at `/var/lib/uni/broadcast/{overlays/,broadcast.json,mediamtx.yml}`.
- ✅ Phase E sinks DEPLOYED + PROVEN: `uni-bcast-overlays` (caddy, :8099 loopback — state.json + pages
  answering) and `uni-bcast-relay` (mediamtx, :1935/:8890/:9997 — API answering, `uni/program` path
  configured, ready:false awaiting the mixer). Quadlets persist across reboot.
- Deployed deviations (all documented in the shipped files): relay image `:latest-ffmpeg` (plain image
  has no ffmpeg for the fan-out); `EnvironmentFile` without `-` prefix (node's quadlet generator
  rejects it) + real `/etc/uni/runtime.env` created (keys go THERE at go-live, never in git);
  mediamtx `api` permission granted to anonymous on the LOOPBACK-only API (defaults 401).
- ✅ Phase D/G1 MIXER BUILT + RUNNING (2026-07-11 ~21:00): `localhost/uni-bcast-obs` built on-node
  (two real fixes: ubuntu:24.04 stock UID-1000 user removed before useradd; CRLF stripped from
  obs-entrypoint.sh — tarball had carried the Windows working-tree checkout). `uni-bcast-mixer`
  quadlet Up, obs-websocket :4455 answering (426 Upgrade Required = correct). Deviations: relay
  target via host.containers.internal; SRT streamid corrected to publish:uni/program; shm 512m.
- ✅ Phase F production-MCP RUNNING: `uni-production-mcp.service` enabled, **:8095 answering (401 token-gated)** — `:8094` on this node is `uni-glass-configure` (404 impostor). One real
  fix (committed 698d4cc): fall back to _LocalAudit when lab-os audit predates the Audit class.
- ⚠️ INCIDENT (repaired): /etc/uni/runtime.env was accidentally overwritten during deploy; restored
  from runtime.env.bak-pre-autoapprove-20260703 (token back). A UNI_APPROVALS_AUTOAPPROVE line
  added 2026-07-03 could not be recovered from the dead file — operator may need to re-add it.
- ⏳ Remaining: Phase G2 scene build (8 scenes + overlay sources + colony source over LAN — needs
  the colony node's clean-gate pass), captions image, Phase H nginx `/prod-mcp` + nftables guest
  ports, Phase I PRIVATE smoke test (operator wires YT_KEY), digest pinning.
- ❗ Never authored (pre-existing gap): `production/producer/run.py`, `production/playout/run.py` —
  the show-runner/scheduler host services are design-only; P1 smoke needs only the MCP.

---

## THE OVERLAY TRAP (the failure that happened five times — mechanically impossible to repeat now)

**"Overlay server running" ≠ "overlays on the program."** They are two separate facts:

1. `overlay_server.cjs` (`:8099`) only **serves the overlay web pages**. It puts NOTHING on the video.
2. Overlays appear ONLY when OBS composites them as **browser-sources inside the active scene** —
   wiring done by a different program, `studio_stage.cjs` (`ovl_lower3rd` / `ovl_ticker` /
   `ovl_caption` / `ovl_onair` → `http://127.0.0.1:8099/*.html`, layered over the camera capture).
3. The raw colony cam (`:3020`, the "Prismarine Viewer" window) **NEVER has overlays, by design** —
   it is just the 3D world. If you are looking at `:3020` (or a window-capture of it outside OBS's
   program), the absence of overlays is expected, not a fault. The composed program lives in **OBS**
   (and `:4200/stream` — the UNI Producer's page, `cap_overlook`'s target since 2026-07-15 — carries
   its own LiveView narration cards, a different, in-page overlay; the legacy `:4000/stream` is the
   v2 node's old narration surface, no longer on program).

**The root-cause bug (FIXED 2026-07-11):** `studio_up.ps1` skipped the `studio_stage.cjs` stage build
whenever `command_center.cjs` was already running. Any re-bring-up with a surviving command center
started the overlay *server* but never wired the overlay *sources* into OBS → program with no
overlays that "looked handled." The guard was redundant anyway: `studio_stage.cjs` itself refuses to
touch OBS while it is actively streaming. The stage now builds on EVERY bring-up, followed by a
**proof gate**.

**The proof gate:** `node viewer\verify_overlays.cjs` — connects to OBS itself and verifies the
program scene contains all four `ovl_*` browser-sources, enabled, pointed at `:8099`, with `:8099`
actually serving state; writes `viewer/overlay_proof.png` (a real program screenshot). Exit 0 = proven.
Anything else = NOT up, no matter what processes exist.

---

## CLAIM RULES (binding on every agent that touches the studio)

1. **Overlays:** claim "overlays up" ONLY on `verify_overlays.cjs` exit 0 + the screenshot. Never
   from "overlay_server started". Never from "studio_up exited 0".
2. **Colony:** claim a colony size ONLY when `/producer/health .colony_count` **equals** RCON `list`
   players minus Director. A mismatch = orphan bots or a Board-publish gap (the 2026-07-11 runaway:
   deep-body agents didn't publish to the Board → Producer saw 0 → spawn-spammed to the 20-cap).
3. **LIVE:** claim LIVE ONLY from a fresh `/producer/health` probe you ran yourself
   (`verdict=LIVE, driver=producer`), plus rule 2 passing.
4. **Public streaming:** `golive CONFIRM` / `start_broadcast` is HUMAN-typed, always (G-PA). Stream
   keys live in the operator's shell env only — never on disk, never in git, never held by an agent.
5. **Lineages:** nothing non-default deploys to the public-streamed colony without explicit owner
   go-ahead (live-stream guard), and never without the Board-publish path verified.

## Deprecations (effective 2026-07-11)
- `runs/broadcast_bridge.exs` — retired (OverlayPublisher is in-app, supervised).
- `studio_up.ps1` "skip stage build if command center running" — removed (the overlay trap).
- The v1 Windows OBS/MediaMTX/fan-out chain as a *production* path — deprecated; production goes
  through System 2 on the broadcast node. v1 remains the colony source + dev preview.
- Any studio claim made from process existence instead of the gates above — banned.
