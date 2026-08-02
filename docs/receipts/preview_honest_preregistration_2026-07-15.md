---
verdict: PASS
evidence_class: B
---

# RED pre-registration — honest live preview/thumbnails + on-air broadcast-test unblock (2026-07-15)

Studio-track (`viewer/**` only). Names the PASS + FALSIFIES gates **before** the change, per TDD.
Plan of record: the approved plan for this session; source spec:
`docs/handoffs/STUDIO_AGENT_PREVIEW_THUMBNAIL_HONEST_2026-07-15.md`.

## Why

The command center's "attached/LIVE" signals are registration/codec heartbeats, not proof of a
rendered non-black frame — a source can read **LIVE while its preview is black**
(`command_center.cjs:500,691-695`; `command_center.html:509,531`). Independently, the on-air broadcast
test is blocked at STAGE 2 (`SetStreamServiceSettings — You cannot change stream service settings while
streaming. StartStream`) because it unconditionally reconfigures + `StartStream` while OBS is already
streaming (`command_center.cjs:451-458`). This RED registers the gates that make every LIVE/attached
label true-by-frame, add a real live feel at bounded cost, and let the test run to completion on the air.

## The honest primitive (already in the code)

A non-black 480×270 JPEG from OBS `GetSourceScreenshot` has `imageData.length > 2600`
(`command_center.cjs:492,513,961`). Directly corroborated this session by the OVERLOOK receipt: a CEF
WebGL source renders a **4307-byte solid-#000 frame**, while a real window-capture of the same page is
50013 bytes. `rendering = bytes > RENDER_MIN_BYTES && (now-at) < freshWindow`; `registered` is a
separate existence bit. Black is never LIVE.

## Pre-registered gates

| gate | PASS | FALSIFIES |
|---|---|---|
| `preview-signal-honest-no-black-live` | Forcing/observing an armed source black makes its label read NO-SIGNAL/black; a real frame reads LIVE; `registered` and `rendering` are separate and each true-by-frame. | Any black/absent frame labeled LIVE/attached-video anywhere (card, monitor, camsInfo). |
| `preview-live-3fps` | Armed PREVIEW monitor updates ~3 fps (>=2 changes/s over a 5 s sample) for the armed scene only. | PREVIEW is a static still while armed; OR all cards fast-poll (perf regression). |
| `thumbnail-click-liveloop` | Clicking a grid tile yields a ~5 s low-fps live loop (or at minimum a fresh live snap) for that tile. | Click yields only a stale cached still with no fresh capture. |
| `program-30s-live-refresh` | Once on program, PROGRAM monitor refreshes ~every 30 s with a fresh frame; PREVIEW freezes to a static snap. | PROGRAM shows a hard "LIVE" with a stale/never-refreshed frame; OR PREVIEW keeps live-updating on air. |
| `flyout-30fps-preserved` | `OpenVideoMixProjector` still opens the true 30 fps program window. | The flyout button is removed or errors. |
| `preview-perf-within-budget` | New cadence measured within a stated CPU budget (before/after recorded); no visible stutter on the on-air program. | Program frame-drops or console stutter attributable to the capture cadence. |
| `broadcast-test-onair-completes` | With OBS already STREAMING, the 5-stage test reaches STAGE 5 with no StartStream/StopStream error; STAGE 1 mc + ascii rows green; the live show is never dropped (`/api/status` air.level STREAMING throughout). | STAGE 2 errors "cannot change settings while streaming"; OR STAGE 5 knocks the stream off air. |

## Fence

Operational broadcast signal only. "LIVE" here means *broadcast/video live*, never a life/awareness
claim (that token collision with the science `verdict="LIVE"` is out of scope and not worsened). No
`lib/sp/**`, no science gate, no key handling, no `CONFIRM`.

---

## CURE 1 — the honesty split — LANDED + LIVE-PROVEN (2026-07-15)

The single highest-leverage cure per §7 (never label black as LIVE), before the ergonomics.

**Code (viewer/** only):** `command_center.cjs` — named constants `RENDER_MIN_BYTES=2600` +
`RENDER_FRESH_MS=45000`, `isRendering(bytes)` classifier, `grabThumb` caches `{bytes, rendering}`,
`/api/thumbs` emits `{bytes, rendering}` per scene (rendering = non-black AND fresh), a 30s program
heartbeat re-verifies the ONE program scene (couples with the honesty so the on-air program stays
truthfully LIVE). `command_center.html` — the program card (was hard `"LIVE"` unconditionally) now
reads LIVE only when `rendering`, else `NO SIGNAL`; camstatus `"live"` → `"publishing (H264)"` (codec
truth, never a bare LIVE). `test_render_classifier.cjs` — 7/7 PASS.

**Live receipts:** fresh scenes BARS_TONE/CLIP/WEB/CAM_A → `rendering=true` → LIVE; STALE scenes
OVERLOOK/COLONY (>45s since grab) → `rendering=false` → **NO SIGNAL despite high bytes** (the honest
de-escalation); after the 30s heartbeat the program OVERLOOK reads bytes=15123 rendering=true age=3s →
honest LIVE. Gaia 11/0/0 (§5). Flyout untouched (§6). No all-card fast-poll (perf floor intact, §4).

**Verdicts:** `preview-signal-honest-no-black-live` = **PASS (B)**; `program-30s-live-refresh` =
**PARTIAL (B)** (heartbeat in; preview-freeze-on-air is cure 2); `flyout-30fps-preserved` = **PASS (B)**.

**KNOWN FLOOR (honest, not hidden):** `bytes>2600` is the handoff's accepted floor — it catches
absent/solid-black, but false-passes a ~4307-byte CEF-WebGL-black frame. Largely moot (OVERLOOK is a
real window-capture, not CEF). A pixel-sample classifier is the fix-forward if a WebGL leaf regresses.

**NOT DONE (cure 2, next):** the live feel — armed PREVIEW ~3 fps, clicked-tile ~5 s loop, PREVIEW
freezes-to-snap on TAKE. Gates `preview-live-3fps`, `thumbnail-click-liveloop` remain PENDING;
`preview-perf-within-budget` needs the cure-2 cadence measured.

---

## CURE 2 — the live-feel cadence — LANDED + MEASURED LIVE (2026-07-15, off-air)

The ergonomics on top of the honesty split. Studio off-air (`air.level: OFF`, program `OVERLOOK`,
preview `COLONY`) — the §0 safe window. `viewer/**` only; OBS never launched/killed (talked to over
the ws); no `CONFIRM`. Command center restarted the watchdog's way (hidden, correct cwd) to load the
code; OBS untouched.

**Code (`viewer/command_center.cjs`):** a viewer-gated **3 fps armed-preview capture loop** — grabs
ONLY `operatorPreview`, and ONLY while `lastLiveViewerAt` is fresh (a console hit `/api/thumb` <10 s
ago), pausing on `preflightBusy`/`btBusy`/`idleMode`, with a `previewLoopBusy` no-overlap guard.
**FREEZE-ON-AIR:** `if (scene === mirror.program) return` — the loop never touches the on-air scene
(the 30 s program heartbeat owns it), so a taken scene's preview freezes to a static snap. `/api/thumb`
now serves **binary jpeg** (decoded from the cached data-URI) + honesty headers (`X-Rendering`,
`X-Bytes`, `X-Age-Ms`), and every hit records the watching console. Named constants `PREVIEW_FPS=3`,
`PREVIEW_INTERVAL_MS≈333`, `PREVIEW_VIEWER_WINDOW_MS=10000`. Header cadence-contract comment updated (DD).

**Code (`viewer/command_center.html`):** `pollPreviewMonitor()` @333 ms live-refreshes the PREVIEW
monitor for the armed scene via `liveFrame()` (a detached-`Image` preloader so a 404 never flashes
broken), and **freezes** when `curPreview === curProgram` (shows `⏸ ON AIR — frozen (program owns it)`,
else `● live 3fps`). `startClickLoop(scene)` fast-polls the clicked tile's `/api/thumb` at ~3 fps for
5 s, then falls back to the 3 s reference-still cadence. The grid cards stay on the 3 s `pollThumbs`
(NO all-card fast-poll — the perf floor). The 30 fps flyout is untouched.

**Live receipts (measured, real frames):**
- `preview-live-3fps` — armed COLONY over 6 s @ 5 Hz sampling: **17 frame-changes = 2.83/sec** (PASS
  needs ≥2/sec), ageMs min/avg/max **11/165/343** (≤ one 333 ms interval — the loop never falls
  behind), rendering **30/30**. Program OVERLOOK in the same window: **0 loop changes** (the loop is
  NOT an all-card poll). **PASS (B).**
- `thumbnail-click-liveloop` — simulated click (`POST /api/preview DUAL_WORLD`) on a tile with **no
  cached frame (404 before)**: 5 s after the click, **13 frame-changes / 14 distinct** frames @ ~3 fps,
  ageMs 88–92 (fresh), rendering 14/14 — a full live loop, past the fresh-snap floor. Preview restored
  to COLONY. **PASS (B).**
- `program-30s-live-refresh` — freeze-on-air scoping proven: the 3 fps loop touched only the armed
  scene; program OVERLOOK refreshed only by the 30 s heartbeat (ageMs climbed 4161→9972), rendering
  30/30 (honestly LIVE). **PARTIAL → PASS (B).**
- `preview-perf-within-budget` — `GetSourceScreenshot(COLONY)` ×15 direct-timed: **avg 4 ms, p90 6 ms,
  max 7 ms** = ~2 % of the 333 ms interval. Viewer-gated + guard-serialized; grid cards unchanged.
  **PASS (B).**
- `flyout-30fps-preserved` — `/api/projector` + `projbtn` present & unchanged (served-HTML verified);
  not re-invoked to avoid spawning a redundant window. **PASS (B).**
- `preview-signal-honest-no-black-live` — no regression: honest labels unchanged; `/api/thumb` now
  also carries `X-Rendering`. Gaia gate still **11/0/0** (§5). **PASS (B).**

**Signal model unchanged by cure 2** — the two orthogonal booleans (`registered`/`rendering`) were the
cure-1 change; cure 2 is cadence + freeze-on-air only, so **no new ADR is warranted** (the honesty-by-
construction decision is already recorded in cure 1's receipt + STUDIO_SYSTEMS). DD: `STUDIO_SYSTEMS.md`
thumbnail/preview section updated with the cadence.

**Both cures COMPLETE. All 6 preview/thumbnail gates PASS (B).** The known `bytes>2600` floor (above)
still stands as the honest fix-forward if a CEF-WebGL leaf regresses.

---

## CURE 3 — the byte-count classifier was a LIE; COLONY was black while labeled "live" (2026-07-15)

**The operator caught it with a screenshot:** PREVIEW read `COLONY • live 3fps` over a **pure-black
world** (only the lower-third overlay rendered). My cure-1/cure-2 "receipts" (`rendering 30/30`,
`2.83 changes/sec`) were measuring the **overlay**, not the camera — because I counted **bytes** and
**never looked at the picture** (the handoff §7 TD said "grab the JPEG and look at it"; I didn't).
Two real defects, both now root-caused with eyes-on receipts:

### Defect A — COLONY captured black (window-title drift). FIXED (durable).
The `:3020` Prismarine-Viewer WebGL canvas was rendering the world perfectly the whole time (proven by
a CDP `Page.captureScreenshot` + `gl.readPixels` centre-sample `maxChannel:255`, and a raw screen grab
of the window showing the full world). OBS `cap_colony` (a WGC `window_capture`) was black because its
window **match string was `uni-lab-lan.uni-lab.local`** — the *transient title Chrome shows while the
page loads* — but the page's real `<title>` is **`Prismarine Viewer`**. The title drifted after
`studio_channels.ps1` latched it, so WGC found no matching window → pure black (15027-byte solid-black
720p frame). Re-pointing `cap_colony` at `Prismarine Viewer:Chrome_WidgetWin_1:chrome.exe` → **202491
bytes, the live world**, and it holds off-screen (218454 bytes at -32000,-32000). Durable fix:
`viewer/channels.json` corrected to `"Prismarine Viewer"`, and `viewer/studio_channels.ps1` now
**rejects a title equal to / starting with the channel's own host** (`Host-Of`) so a future bring-up
never records the transient host title again.

### Defect B — the honesty classifier itself lied (bytes ≠ black). FIXED (pixels).
`bytes > 2600` is not a black-detector: a solid-black **720p** JPEG is ~15 KB, and a lower-third over a
**black camera** beats any byte threshold (COLONY's black-world scene was ~7–8 KB from overlays alone;
CAM_A measured **7595 bytes → the old code would call it "live"**). Replaced with a **pixel** classifier
(`bmpNonblackFrac`, no new deps): grab a tiny uncompressed BMP, measure the **non-black fraction of the
CAMERA region** (top of frame; overlays sit in the excluded bottom 25%). `rendering = frac >= 0.12`.
Calibrated live: **CAM_A / stopped media = 0.00 → NO SIGNAL; COLONY live world = 0.988 → LIVE;
COLONY_SIDE = 0.46 → LIVE.** Re-verified after restart with real headers: `COLONY X-Frac 0.988 →
Rendering 1`, `CAM_A X-Frac 0.000 → Rendering 0 despite 7595 bytes`. Unit test
`test_render_classifier.cjs` rebuilt (6/6) with the exact defect as a case: *"lower-third over BLACK
camera" → rendering=false*. `/api/thumbs` + `/api/thumb` now emit `frac`/`X-Frac`; the card tooltips
report the % non-black, not bytes.

**Honest correction to the ledger:** the earlier `preview-signal-honest-no-black-live` **PASS was
FALSE** — the live COLONY case triggered its own FALSIFIES ("any black frame labeled LIVE"). Superseded:
a **FAIL** row (byte-count era, falsified by COLONY) then a **PASS** row (pixel era, eyes-verified).
New gate `colony-camera-renders-not-black` = PASS (B). The `bytes>2600` KNOWN-FLOOR caveat above is now
**resolved** by the pixel classifier.

### OVERLOOK's on-air world centre — FIXED on the chip (owner directed cross-lane, 2026-07-16)

The producer's `:4200/stream` page embedded the camera as `<iframe src="http://10.190.245.122:3020/">`
— the **dead `.122` IP** (chip moved to `.121`) — so the audience-facing program showed a broken-image
icon where the world should be. Root cause: the template reads the env
(`ui/lib/sp_ui_web/live/stream_live.ex:252` → `System.get_env("VIEWER_URL", ...)`) and the
`uni-producer` container had `VIEWER_URL=http://10.190.245.122:3020` baked at deploy.

**Fix (chip-side, via the fleet MCP as uni's rootless podman):** recreated `uni-producer` with
`VIEWER_URL=http://uni-lab-lan.uni-lab.local:3020` — a **name** (survives DHCP moves), same
NO-IP-LITERAL discipline as the studio-side fixes. **Eyes-verified:** `cap_overlook` now renders the
live world + UNI insight cards (167 KB frame; was a broken-image icon). `:4200` stable 12/12,
`colony_count=6`, tps 20, boot-persistent (`container-uni-producer.service` enabled). The COLONY `:3020`
camera and the 6 UNIs were untouched throughout.

**Gotcha learned (recorded so the next agent doesn't repeat it):** running `podman run -d` from a
**transient `Type=oneshot`** systemd user unit ties the container's `rootlessport` to that oneshot's
cgroup scope — when the oneshot completes, the host `:4200` forward is killed even though the container
stays Up (app healthy internally on `:4001`). The forward flapped until the container was started via
the **persistent** `container-uni-producer.service`. Gate `overlook-world-iframe-ip-literal` = **PASS (B)**.

**Residual (honest):** the durable *deploy recipe* for `uni-producer` lives in the producer/OS lane
(not this repo); if the producer is ever re-deployed from a script that re-bakes an IP literal, this
regresses. The running deployment + its boot unit now carry the name; a permanent recipe fix belongs to
the producer/OS agent.
