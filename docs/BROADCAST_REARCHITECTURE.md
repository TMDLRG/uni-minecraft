# Broadcast re-architecture — composition outside OBS (workflow-verified plan)

**Problem:** OBS's dual-GPU CEF can't composite multiple web feeds (renders black/crashes).
**Fix (operator's insight, validated):** composite ALL feeds + frame in ONE real-GPU Chrome page; feed that single composite to a dumb encoder. Scene control lives in HTML/JS, not OBS.

**Validated on the box:** the composite page renders in one real Chrome; the `:8080` UNI.OS appliance
glass (black in OBS CEF) renders fully. Router CSP already patched (`router.ex` →
`content-security-policy: base-uri 'self'`, no `frame-ancestors`) so the HUD `:4000/stream` frames.

## Recommendation — PHASED HYBRID
- **Phase 1 (now, <2-min cutover, stream never stops):** OBS = dumb encoder doing ONE **WGC Window
  Capture** (method:2 — *not* gdigrab, which returns blank for GPU-composited Chrome) of the single
  `/broadcast` Chrome window. Keep the existing rtmp_custom YouTube output + x264 + the looping
  Soundtrack source. Single-source swap on the live scene → instant rollback.
- **Phase 2 (after 24–48h burn-in, portable to the appliance):** drop OBS — headless Chrome
  (`--headless=new`) + CDP `Page.startScreencast` → one ffmpeg (`h264_nvenc`, T1000 NVENC present)
  that loops `album_full.m4a` and pushes RTMP. Window-less, occlusion-proof, ports to headless Linux.
- The `/broadcast` page is **identical** across both phases — build it first.

## The composite page (`/broadcast`, 1920×1080, served same-origin from Phoenix `:4000`)
- `#wa` left 44,206 896×504: **prismarine cam `:3020` (hero)** — iframe 1920×1080 `scale(0.46667)`.
- `#wb` right 980,206 896×504: **UNI.OS appliance `:8080`** — same scale.
- `#wc` full-stage 0,0 1920×1080: **HUD `:4000/stream`** (transparent, `pointer-events:none`) over all.
- Top layer: title / LIVE pulse / feed tabs / lower-third / brand, **inlined** from `broadcast_frame.html`.
- `<title>UNI.OS Broadcast</title>` (matches `obs_capture.cjs` WINDOW string). Scene cuts = in-page JS.

## Build plan
1. Write `ui/priv/static/broadcast.html` (the spec) — same-origin so the HUD LiveView socket carries
   its session, and so Phase-2 headless loads it over http (not file://). Add a `/broadcast` route or
   `Plug.Static` entry (priv/static isn't auto-served unless whitelisted).
2. **Smoke-test in REAL Chrome FIRST — the go/no-go gate for the cam.** Launch:
   `chrome --user-data-dir=...\chrome-broadcast --app=http://127.0.0.1:4000/broadcast.html
   --window-size=1920,1080 --force-device-scale-factor=1 --autoplay-policy=no-user-gesture-required
   --ignore-certificate-errors --allow-running-insecure-content
   --disable-features=CalculateNativeWinOcclusion --enable-gpu-rasterization --ignore-gpu-blocklist`.
   Verify the prismarine cam PAINTS (if black here it's black headless too).
3. **Pin Chrome to the T1000** (Windows Settings → Display → Graphics → chrome.exe → High performance);
   confirm `chrome://gpu` = hardware-accelerated. (Dual-GPU SwiftShader fallback is the cam's #1 risk.)
4. Add audio to the live scene BEFORE cutover: obs-websocket `CreateSceneItem` "Soundtrack" →
   "Migration Pro" and the new "Broadcast" scene (it's currently only on Colony Live / Mind Cockpit).
5. Phase-1 cutover: `viewer/obs_capture.cjs` (WGC capture of the window, stretched 1920×1080, set
   current). No StopStream, same RTMP session. Fallback: pin Chrome+OBS to the same GPU; ddagrab last.
6. Burn-in 24–48h with the old CEF sources hidden (instant rollback); then `RemoveInput` them.
7–10. Phase 2: `broadcaster.cjs` (puppeteer-core headless + CDP screencast) → ffmpeg
   `-c:v h264_nvenc -rc cbr -b:v 5M -g 60 -no-scenecut 1 ... -c:a aac -ar 48000` (album is 48kHz!)
   → `rtmp://a.rtmp.youtube.com/live2/<KEY from env>`; dry-run to a file + ffprobe (≈2s keyframes)
   before cutover; supervise with NSSM/while-loop + nightly restart for the Chrome renderer leak.

## Gotchas the adversarial pass caught (real, on this box)
- **gdigrab is dead** for GPU Chrome (blank GDI DC). WGC (Phase 1) / CDP (Phase 2) read the GPU swapchain.
- **`:8080` is http→https 301 with a self-signed cert** → needs `--ignore-certificate-errors
  --allow-running-insecure-content` (or reverse-proxy through Phoenix).
- **Soundtrack** missing on the live scene — a naive swap drops music; add it first.
- **`-ar 48000`** (album is AAC 48kHz); `-stream_loop -1` on AAC clicks every loop → pre-transcode to WAV.
- ffmpeg 8.0: use `-f mjpeg -framerate 30 -i pipe:0`, not `image2pipe`; add `ffmpeg.stdin.on('error')`.
