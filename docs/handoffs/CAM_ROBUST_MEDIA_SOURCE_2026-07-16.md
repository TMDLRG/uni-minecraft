# Kill the fragile WebGL window-capture — move the cameras to a real media stream (scope, 2026-07-16)

## The problem (proven, not theorized)

The colony camera (`:3020` prismarine-viewer, a Chrome **WebGL** page) and the producer's OVERLOOK
page (`:4200/stream`, DOM cards + a `:3020` WebGL iframe) are put on the OBS program by
**`window_capture` (WGC) of off-screen Chrome windows** (`cap_colony`, `cap_overlook`; built by
`viewer/studio_stage.cjs`, windows launched by `viewer/studio_channels.ps1`).

**This capture path is fundamentally unreliable for WebGL.** Verified exhaustively on 2026-07-16:

- The Chrome windows render correctly — a raw Win32 `CopyFromScreen` of the on-screen window shows the
  live world; CDP `Page.captureScreenshot` + `gl.readPixels` (centerMax 255) confirm the canvas paints.
- Yet OBS's WGC capture of the **same** window returns a **4307-byte near-black frame** — even with the
  window **visible and foreground**, even with `--disable-direct-composition`, even after forcing a
  re-acquire (`SetInputSettings window:""` → back).
- A full `studio_stage.cjs` rebuild (RemoveInput/CreateInput) makes a **fresh** source, and the fresh
  source **randomly** either captures live or sticks at 4307-byte black. On the 2026-07-16 rebuild it
  made `cap_colony` live and `cap_overlook` stuck; before the rebuild it was the reverse. Releasing one
  source did **not** free the other — so it is **not** a resource ceiling; individual fresh WGC sources
  just stick at black, unpredictably, and nothing but another dice-roll rebuild changes it.

Conclusion: **no amount of settings-fiddling makes WGC window-capture of these WebGL windows reliable.**
The `--disable-features=CalculateNativeWinOcclusion` off-screen trick keeps them *rendering*, but WGC
still fails to pull the GPU surface for a chunk of the time. This has cost the live window twice.

## The fix — an actual video stream OBS ingests as a Media Source

Stop window-capturing WebGL. Turn each camera into a real H264/MJPEG stream fed by the **proven** CDP
render path, and point OBS at it via `ffmpeg_source` (rock-solid, the same input class as `RemoteCam*`).

### Pieces
1. **`viewer/cam_bridge.cjs` (NEW, supervised).** For each WebGL channel (colony `:9220`, overlook
   `:9221`, glass `:9222`):
   - Connect to the channel's Chrome via CDP (the `--remote-debugging-port` already on each window).
   - `Page.startScreencast({format:"jpeg", everyNthFrame:1, maxWidth:1280, maxHeight:720})` — CDP
     screencast **forces** the compositor to deliver frames (this is exactly why `captureScreenshot`
     always worked where WGC failed). ~15–30 fps.
   - Pipe the JPEG frames into `ffmpeg` (`-f mjpeg -i - -c:v libx264 -preset veryfast -tune zerolatency`)
     and publish to the LOCAL MediaMTX already running on THINKER:
     `rtmp://127.0.0.1:1935/colony_cam`, `/overlook_cam`, `/glass_cam`.
   - Auto-reconnect on Chrome/CDP drop; expose `/health` for the watchdog.
2. **OBS sources.** In `studio_stage.cjs`, change `cap_colony` / `cap_overlook` / `cap_glass` from
   `window_capture` to `ffmpeg_source` with `input = rtsp://127.0.0.1:8554/<path>` (MediaMTX serves the
   same path over RTSP for OBS's ffmpeg reader; `is_local_file:false`, `reconnect:true`, low buffering).
   The off-screen Chrome windows stay (they're the render), but OBS never window-captures them again.
3. **Supervision + boot.** Add `cam_bridge.cjs` to `systray_watchdog.ps1` (restart-if-dead, same as the
   other node services) and to `studio_up.ps1` bring-up ordering (after channels, before stage). Gate:
   `restream.ps1`-style — `path=colony_cam ready=True` on `:9997` + a non-black frame proven by the
   command center's honest pixel classifier.

### Why this is durable
- ffmpeg media-source ingest is the same reliable path the remote cams use — no WGC, no DirectComposition,
  no off-screen-presentation lottery.
- The CDP screencast is the one render path that has been 100% reliable in every test this session.
- It also unlocks: one canonical camera stream that the command-center preview can sample cheaply, and
  that could be recorded / restreamed without a second capture.

### Scope / cost
- New: `viewer/cam_bridge.cjs` (~150 lines) + a `ws`/CDP screencast client + ffmpeg spawn per channel.
- Edit: `studio_stage.cjs` INPUTS block (3 sources window_capture → ffmpeg_source); `systray_watchdog.ps1`
  (+1 service); `studio_up.ps1` (+1 launch step); `mediamtx_local.yml` (3 publish paths, if not `all_others`).
- Test: bring up cold, kill Chrome mid-run (bridge reconnects), confirm both COLONY and OVERLOOK live
  simultaneously (the thing WGC could never do), confirm honest classifier reads them LIVE, confirm
  boot-persistence.
- **Do NOT rush this in a thrash.** It is a clean, self-contained change; land it deliberately with a
  cold bring-up to verify, not on top of a live feed.

## Durable camera-topology changes already made on the chip (2026-07-16)

These landed and are boot-persistent (verified `systemctl --user` enabled/disabled state on the chip):
- **`uni-cam` (the legacy standalone camera bot) RETIRED** — stopped + `container-uni-cam.service`
  **disabled**. The half-finished migration is now finished: `uni-producer` is the sole camera+show-runner.
- **`uni-viewer-cam-fwd` re-pointed** host `:3020` → `uni-producer:3020` (was `uni-cam:3020`),
  recreated + started via its persistent systemd unit (`enabled`).
- **Director "Director"-login kick-fight resolved** — the frozen camera was two bots (`uni-cam` +
  `uni-producer`) fighting for the MC login. With `uni-cam` gone + a fresh producer, the director holds
  its connection (0 disconnects) and flies the camera; the world is live at the source (`:3020`/`:4200`).
- **Producer `VIEWER_URL`** = `http://uni-lab-lan.uni-lab.local:3020` (name, not a dead IP) — the
  OVERLOOK page's camera iframe resolves correctly.
The chip/colony/producer/director are all HEALTHY; the only remaining problem is the OBS WGC capture
path documented above.

## Interim (until the above lands)
Only ONE of the WebGL window-captures is reliably live at a time, and which one is a dice-roll per
rebuild. As of this writing **COLONY (raw camera) is LIVE**; OVERLOOK's capture is stuck black. A working
live broadcast is available NOW by putting **COLONY** on program — it carries the live world plus the
command-center's own lower-third/ticker/on-air overlays. The producer's UNI-insight cards (the OVERLOOK
composition) are unavailable until the media-source fix lands. The colony, producer, director, and camera
render are all healthy — this is purely the OBS capture path.
