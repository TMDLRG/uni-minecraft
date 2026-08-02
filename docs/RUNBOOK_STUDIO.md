# Runbook — UNI Broadcast Studio (dev-box production platform v1)

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](../production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](../production/docs/adr/ADR-PROD-012-encoder-placement-policy.md) + [STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) first.**
> Native OBS on THINKER is now the PRODUCTION mixer (not dev/rehearsal preview). Boot flow is **tray-only**:
> `viewer/systray_watchdog.ps1` auto-starts at login; all node processes (Phoenix, overlay_server,
> command_center, publisher, MediaMTX, Minecraft, OBS, colony/glass Chrome) launch **hidden** (no visible
> cmd / PowerShell windows); command_center Chrome auto-opens as the ONE visible operator surface after
> `/api/state` returns 200. OBS Safe Mode is suppressed by clearing `%APPDATA%\obs-studio\.sentinel\` before
> each launch + a `Dismiss-OBSDialogs` watcher in the tray. Any reference below to the "System 2 mixer" on
> node2 or to visible bring-up windows is stale.

> **STATUS (2026-07-11): this is SYSTEM 1 — the v1 dev studio. Interim/dev use only.** Read
> **[STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) FIRST** — the canonical two-systems map, the overlay
> proof gate, and the binding claim rules; it overrides this doc on any conflict. The production
> broadcast path is System 2 (`production/` per `production/docs/P1-BRINGUP.md`), not this chain.

> Runbook = "turn it on" (below). To *operate a show* — templates, roles, remote sources, going
> live — see the **[Operator Manual](STUDIO_OPERATOR_MANUAL.md)** (or the **?** button in the
> command center).

The full multi-feed show: colony world + owner cam + window shares + web feeds + YouTube clips,
dual-pushed to YouTube AND Twitch, driven live from one operator console **working with**
SP.Producer (the autonomous colony show-runner). Extends `docs/RUNBOOK_LIVE_STREAM.md` — read
that first for the world-stack gotchas (ONE Elixir node; WGC window-capture, never OBS browser
sources for WebGL).

Machine: `Thinker` (Windows). Built 2026-07-10.

---

## Start sequence (full studio)

**One command (preferred)** — brings the whole stack up in order, health-gated, idempotent:

```powershell
powershell -File viewer\studio_up.ps1           # bring everything up
powershell -File viewer\studio_up.ps1 -Status   # what's up / down
powershell -File viewer\studio_up.ps1 -Watch    # bring up + watchdog the node servers
```

It starts (reusing anything already running): Minecraft -> Phoenix + /stream -> colony cam ->
OBS -> channel windows + colony 30fps cap -> overlay server -> MediaMTX -> stage build ->
command center -> remote-source gateway. Then open http://127.0.0.1:8098 and press **?**.
(If OBS shows a "Crash Detected" dialog, click **Run in Normal Mode** — the script can't.)

The manual steps below remain for reference / partial restarts.

```powershell
# 1) World stack (as the base runbook; ONE node only)
cd C:\Users\mpolz\Documents\Strings\mcserver ; java -jar paper.jar nogui
cd C:\Users\mpolz\Documents\Strings\ui       ; iex.bat --sname uni --cookie sp -S mix phx.server
#    ⚠ in PowerShell type iex.bat — bare `iex` is PowerShell's Invoke-Expression alias!
start http://localhost:4000/stream            # auto-starts SP.Producer -> Director -> :3020

# 2) OBS (profile UNI, collection UNI) — if the "Crash Detected" dialog appears, Run in Normal Mode
& 'C:\Program Files\obs-studio\bin\64bit\obs64.exe' --profile UNI --collection UNI --disable-shutdown-check

# 3) Studio surfaces
cd C:\Users\mpolz\Documents\Strings
powershell -File viewer\studio_channels.ps1   # 5 Chrome channel windows -> channels.json
Start-Process powershell -ArgumentList '-NoExit','-Command','node C:\Users\mpolz\Documents\Strings\viewer\overlay_server.cjs'
node viewer\studio_stage.cjs                  # builds the 33 scene templates + 3 camera roles (idempotent)

# 4) The operator console — the show is driven from here
node viewer\studio.cjs
```

## The 33 templates ("UNI" collection), in 11 groups

> **Corrected 2026-08-01.** This section said **12 templates** and listed a scene named `CAM` that no
> longer exists — it is `CAM_A` now, and the bare string `CAM` survives only in the LEGACY teardown
> list at `studio_stage.cjs:447`, which is deliberate so an old collection is cleaned up. An operator
> following the old table would have looked for a scene that is not there and would never have found
> the MUSIC, CAMERAS or multi-cam groups at all.
>
> **The authoritative source is the builder, not this page.** `viewer/studio_stage.cjs` defines
> `SCENES` (33) and `GROUPS` (11) and writes `viewer/runtime/templates.json` from them
> (`studio_stage.cjs:571-573`). The build prints its own tally on every run —
> `"STUDIO BUILT (" + Object.keys(SCENES).length + " templates + 3 camera roles)"` — so if this table
> and the console ever disagree again, **the console is right**. Verify in one line from the repo
> root:
>
> ```powershell
> node -e "console.log(Object.keys(require('./viewer/studio_stage.cjs').SCENES).length)"
> ```

Descriptions are the builder's own `DESC` entries, not a paraphrase of them.

| Group | Scene | What it is |
|---|---|---|
| SOLO | CAM_A | Solo presenter, full frame. Talking head / desk read / answering chat. |
| COLONY | COLONY | The Minecraft colony world, full frame — the hero shot. No camera. |
| COLONY | CAM_PIP | Colony hero + you as a small picture-in-picture, bottom-right. Narrate the world. |
| COLONY | COLONY_SIDE | You and the colony side-by-side. Explain while the world runs. |
| COLONY | PIP | Colony hero + the live glass cockpit data inset, top-right. World + telemetry, no camera. |
| TEACH / DEMO | SHARE | A shared window full-frame + you in the corner. Demo an app / site. |
| TEACH / DEMO | DESK | You on the left, a shared screen on the right. Teach or walk through something. |
| TEACH / DEMO | GLASS_TALK | The live UNI.OS cockpit full-frame + you as a PIP. Explain the dashboard. |
| TEACH / DEMO | SHARE_MULTI | Up to three shared windows + you, in a 2x2 wall. Multi-window demo. |
| TEACH / DEMO | TEACH | A shared screen as the hero + a rail of you / colony / clip. Deep teaching segment. |
| WEB | WEB_HOST | A web page (defaults to the master-plan board) full-frame + you in the corner. |
| WEB | WEB_SIDE | You and a web page side-by-side. Walk the roadmap / a site together. |
| VIDEO CLIP | CLIP_HOST | A YouTube clip full-frame + you in the corner. Clip carries its own audio. |
| VIDEO CLIP | CLIP_SIDE | A YouTube clip and you side-by-side. React to a video as it plays. |
| VIDEO CLIP | CLIP_PIP | You full-frame + the clip as a small PIP, top-right. The classic react-to-a-video shot. |
| DESK / MULTI | NEWSDESK | You as the anchor + a right column of two monitors (colony + clip/web). News-desk look. |
| DESK / MULTI | ANCHOR | You big on the left + a rail of clip / colony / glass. The monitor-wall anchor desk. |
| FULL SCREEN | GLASS_OS | The UNI.OS glass cockpit, full frame. A pure data beat. |
| FULL SCREEN | OVERLOOK | The UNI Producer's view (`/stream`) — the UNI that directs the camera and reports the show. |
| FULL SCREEN | WEB | A web page (or the master-plan board), full frame. |
| FULL SCREEN | CLIP | A YouTube clip, full frame. Carries its own audio. |
| MULTI-CAM (demoted) | DUAL_AB | Two cameras side-by-side (host + guest). A real interview two-shot — demoted. |
| MULTI-CAM (demoted) | TRIO | Three cameras across. A panel — demoted; lowest value for a solo show. |
| MULTI-CAM (demoted) | DUAL_WORLD | Colony hero + two camera PIPs (host + guest over the world) — demoted. |
| MULTI-CAM (demoted) | CAM_B | The B-camera (guest) full frame. For a guest solo — demoted. |
| CAMERAS | GRID | Up to 10 remote cameras at once — a 5x2 monitor wall. |
| MUSIC | MUSIC_HOUR | Radio, full-screen cover + up-next + store QR codes. Dedicated music segment; no camera. |
| MUSIC | MUSIC_CARD | Presenter on the left, music card on the right — talk over the track. Mic + music both on program. |
| MUSIC | COLONY_SIDE_MUSIC | Colony hero on the left, music card on the right. World runs, music airs, no camera. |
| UTILITY | BARS_TONE | SMPTE bars + 1kHz reference tone. Sound check + the SEEN-sweep opener for BROADCAST TEST. |
| UTILITY | STANDBY | Honest "please stand by" slate. Silent (no music bed, no overlays). |
| UTILITY | STANDBY_OFFLINE | Fallback slate when the music service is unreachable — uses the local file bed. Honest degrade. |
| **(no group)** | **PIP_AB** | **Camera A full-frame + camera B as a PIP. See the warning below — this one is not previewable.** |

**32 scenes are in a group; PIP_AB is the 33rd and is in none.** Plus three camera-role scenes
(`ROLE_A` host, `ROLE_B` guest, `ROLE_C` PC cam) which are plumbing, not shots you cut to.

### ⚠ PIP_AB — the one scene you cannot preview is reachable only by putting it on air

`PIP_AB` is built and described but belongs to **no group**, so `allTemplates()` excludes it and
`/api/preview` returns **400** for it. The only route to it is `/api/camlayout {layout:"pip"}`, whose
default branch **cuts straight to air** (`command_center.cjs:1641-1653`). An anxious first-time
operator must never be handed a shot they cannot look at first.

This is not a defect to work around during a show — it is fenced. `verify_rundown.cjs` check 2 fails
if any rundown row names a scene that cannot be previewed, and the first show's rundown records the
same finding under `measured_2026_07_29.orphan`. **If you want the A/B picture-in-picture on air,
arm it as a preview first** by passing `{preview:true}` to `/api/camlayout`; the non-preview branch
is a hot cut with no look-before-you-leap.

### Overlays and audio

Overlays are appended **per scene by the builder**, and the function that decides which
(`expectedOverlaysFor`) is *exported and imported by the verifier*, so the expectation and the build
cannot drift apart. Three shapes: the generic stack (`ovl_watermark`, `ovl_musicbug`,
`ovl_nowplaying`, `ovl_lower3rd`, `ovl_caption`, `ovl_ticker`, `ovl_onair`), a reduced
`MUSIC_CHROME` for music scenes, and a bespoke pair for the standby slates. They are 2D-CSS pages
from `production/overlays/` served at `127.0.0.1:8099` — 2D-only is deliberately OBS-CEF-safe on this
dual-GPU box; the WebGL colony cam stays a window capture.

**Every microphone and every camera boots MUTED** (talent-hot policy, `studio_stage.cjs:512-521`).
The operator must pick a voice on the console before any audio can air. Music beds sit at −14 dBFS.
A previous build booted one remote camera unmuted; a live microphone by default is a real leak risk.

## THE COMMAND CENTER (primary control surface)

```powershell
Start-Process powershell -ArgumentList '-NoExit','-Command','node C:\Users\mpolz\Documents\Strings\viewer\command_center.cjs'
# then open http://127.0.0.1:8098/ (its own Chrome window is launched as the "UNI COMMAND CENTER")
```

Visual switcher over the same OBS: template grid (click = PREVIEW, big **TAKE** = put preview on
program, double-click = hot cut), live preview/program monitors, camera picker (PC camera is
**ALWAYS MUTE** by rule; remote LAN cams carry their own mics), voice picker, web-URL loader,
YouTube clip roller (favorites in `viewer/runtime/clip_favorites.json`), claim-fenced text
editors, music, auto-rotation, UNI-narration feed toggle, and CONFIRM-gated GO LIVE / OFF AIR.

**Air truth (top banner + the lab glass badge):** OFF AIR / REHEARSAL (cam-mic hot, NOT
streaming) / LIVE STREAMING (public, operator not on it) / **LIVE LIVE** (public AND operator
visible/audible) — recomputed every second from actual OBS stream + scene-item + mute state.
The same state streams to the UNI-lab glass cockpit badge
(`/opt/uni/services/glass/ui/uni-nav.js` appended block; data over one persistent ssh pipe to
`/glass/live/onair.json`; backup `uni-nav.js.bak-pre-onair-20260711`). If the pusher dies the
badge reads **STALE**, never a false OFF AIR.

## Remote cameras / mics (the other computer — no install)

Open in any browser there (H264 is PINNED in the link — browsers default to AV1, which OBS's
RTSP decode renders BLACK; the health board detects a wrong codec and prints this link):

    https://10.190.245.196:8889/cam1/publish?video-codec=h264/90000
    https://10.190.245.196:8889/cam2/publish?video-codec=h264/90000

Accept the self-signed warning once, pick camera + good mic, publish. MediaMTX re-serves them
loopback-only (`rtsp://127.0.0.1:8554/camN`) into RemoteCam1/RemoteCam2. The LAN may ONLY
publish cam paths — the program path `uni` is loopback-locked (fan-out cannot be hijacked).

## Camera ROLES, and why a template does not name a camera

> **Corrected 2026-08-01.** This section was headed "The 20-template suite" and carried a SECOND,
> different grouping — WORLD / CAMERAS / CAM+WORLD / CAM+CONTENT / CONTENT / UTILITY, six groups over
> twenty scenes. None of those group names exists in the builder, and one of them actively misleads:
> it used `CAMERAS` to mean `CAM_A CAM_B DUAL_AB TRIO`, whereas the real `CAMERAS` group is `GRID`
> alone. Left in place it would have contradicted the corrected catalog earlier in this same file,
> which is worse than either version on its own — a reader cannot tell which half is stale.
>
> **There is one catalog: [The 33 templates](#the-33-templates-uni-collection-in-11-groups) above.**
> Do not restate it here. A second copy is a second thing that drifts, and this section is the proof.

Templates reference camera **ROLES** (`ROLE_A` host, `ROLE_B` guest, `ROLE_C` PC cam), each
reassignable to any camera live from the command center — a role change updates every template that
uses it, at once. That indirection is the reason the catalog is stable while the cameras are not: you
re-point a role, you never rebuild a scene.

`viewer/runtime/templates.json` is the manifest the console reads, and it is **generated output** —
written by `studio_stage.cjs:571-573` from `SCENES` and `GROUPS`. Thumbnails in the command center
are REAL frames from a background preview sweeper, not stills. PREFLIGHT renders and verifies every
template plus all subsystem health, and classifies **pixels, not bytes**, to reach GO / NO-GO.

## Text console (fallback / scripting: `node viewer\studio.cjs`)

- `live CAM_PIP` · `auto on|off` · `beats COLONY:28,PIP:16,CAM_PIP:20`
- `cams` / `cam 1` — pick webcam · `mics` / `mic 0` — pick voice mic (hot only in talk scenes)
- `windows obs` / `share1 2` — bind any open window into a share slot
- `web https://…` — navigate + cut the WEB channel (CDP :9223)
- `clip https://youtu.be/… 45` — play a clip, auto-return after 45 s (CDP :9224, autoplay on)
- `lt KICKER|Title|subtitle` · `ticker item | item | item` · `caption text` · `onair on`
- `feed uni on` — mirror SP.Producer's live colony narration into ticker+caption
  (`runs/broadcast_bridge.exs`; operator commands override any layer at any time)
- `music 25` · `status` · `shot` · `golive CONFIRM` · `offair CONFIRM`

## Dual-target restreamer (YouTube + Twitch)

**⚠️ This restreamer + `golive CONFIRM` is the System-1 DEV/rehearsal preview path, NOT the worldwide go-live.** The worldwide public go-live runs on System 2 (`production/`): human-typed `start_broadcast` on the production MCP (`:8095`); see `production/docs/DEPLOYED_STATE.md` + `docs/SYSTEM_OVERVIEW.md`.

Encode ONCE in OBS (x264 1080p30 @4000 kbps; dual push ≈ 8.3 Mbps up) → local MediaMTX ingest →
one supervised `ffmpeg -c copy` loop per platform (independent: one failing never kills the
other — mirrors `production/containers/systemd/mediamtx.yml`, ADR-PROD-008).

```powershell
$env:YT_KEY = '<paste>'; $env:TWITCH_KEY = '<paste>'   # THIS SHELL ONLY — never disk/git
powershell -File viewer\restream.ps1                    # mediamtx + fan-out loops
powershell -File viewer\restream.ps1 -Status            # want: path=uni ready=True readers=2
# then in studio.cjs:  golive CONFIRM                    (points OBS at rtmp://127.0.0.1:1935 key "uni")
powershell -File viewer\restream.ps1 -Stop               # tear down after the show
```

MediaMTX binary: `C:\Users\mpolz\tools\mediamtx\mediamtx.exe` (config
`viewer/mediamtx_local.yml`, NO keys in any file; keys reach the fan-out children only via
inherited environment).

## The honesty rules (binding — claim fence)

- Overlay copy defaults (seeded by `overlay_server.cjs` into `viewer/runtime/broadcast.json`)
  describe **behaviour / viability-learning only**. Science ledger at build time: P1 novelty =
  PARTIAL, P2 metabolism = PROVISIONAL. Check the master plan (http://10.190.245.122:4100/)
  before strengthening any on-air claim.
- `studio.cjs` lints `lt`/`ticker`/`caption` text against a fence regex (proven / conscious /
  aware / alive / sentient / world-first / …). `!` prefix forces past it — you own that claim
  and it must have a committed receipt.
- Overlays hide themselves ~8 s after the console dies (staleness guard) — no zombie captions.

## Autonomy fence (G-PA)

The show runs itself **inside the operator-opened session** (auto rotation, SP.Producer
narration feed, clip auto-return). The OUTWARD cut — `golive CONFIRM` / `offair CONFIRM` — is
typed by the human operator, always. The producer agent never holds the keys (env/clipboard
only) and never self-approves go-live.

## Shutdown

`offair CONFIRM` → `restream.ps1 -Stop` → base runbook shutdown (save-all, stop MC, Ctrl-C the
iex node, close OBS).
