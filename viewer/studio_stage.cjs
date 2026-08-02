// studio_stage.cjs — build the FULL broadcast studio (idempotent). Professional suite:
//
// CAMERA ROLES (real-switcher model): helper scenes ROLE_A / ROLE_B / ROLE_C each hold all
// three cameras (PC + two LAN) with exactly ONE enabled. Templates reference roles, never raw
// cameras — reassigning a role (command center "Camera roles" panel) updates EVERY template
// that uses it, live. Defaults: A=RemoteCam1 (host), B=RemoteCam2 (guest), C=CamHost (PC cam,
// ALWAYS video-only by rule).
//
// TEMPLATES favour ONE presenter + content (the owner's ask: not two of himself). Grouped by
// show mode, written with human descriptions to viewer/runtime/templates.json for the console.
//
// THE CATALOG IS **GROUPS** AND **SCENES** BELOW. IT IS NOT RESTATED HERE, DELIBERATELY.
//
// This header used to carry a hand-maintained copy of it — 9 groups and 26 scenes — sitting ~190
// lines above the arrays that actually define 11 and 33. It had gone stale: no CAMERAS group (GRID),
// no MUSIC group at all (MUSIC_HOUR · MUSIC_CARD · COLONY_SIDE_MUSIC), no PIP_AB, and UTILITY listed
// as STANDBY alone when BARS_TONE and STANDBY_OFFLINE are also in it.
//
// That mattered far beyond this file. Corrected 2026-08-01, every downstream doc that was wrong had
// been copied from HERE — command_center.cjs said 20 templates, RUNBOOK_STUDIO.md said 12 in one
// section and 20 in another, STUDIO_OPERATOR_MANUAL.md §4 listed 9 groups, build_scenes.py said 25.
// A restated catalog is a thing that drifts, and this one was the source the others trusted. So the
// count now lives in exactly one place and is checkable in one line from the repo root:
//
//   node -e "console.log(Object.keys(require('./viewer/studio_stage.cjs').SCENES).length)"
//
// The build prints its own tally on every run for the same reason (see the STUDIO BUILT line).
// 32 of the scenes are in a group; PIP_AB is in none, which is why /api/preview 400s on it — see
// the note beside its definition.
//
// Honest overlay stack (lower-third + caption + ticker + on-air, 2D-CSS from :8099) on every
// template except STANDBY. Music bed only on WORLD/CONTENT templates; voice sources ride the
// talk templates. Requires OBS (ws :4455), studio_channels.ps1 done, overlay_server running.
// Refuses to run while streaming (--force overrides). Leaves program on COLONY.
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const ch = JSON.parse(fs.readFileSync(path.join(__dirname, "channels.json"), "utf8"));
const CE = ":Chrome_WidgetWin_1:chrome.exe";
// OBS window-match strings encode '#' -> #22 and ':' -> #3A (libobs window-helpers encode_dstr)
const winEsc = (s) => (s || "").replace(/#/g, "#22").replace(/:/g, "#3A");
// empty channel title -> empty window string (binds nothing) — NEVER bare ":class:exe"
const winOf = (title) => (title ? winEsc(title) + CE : "");
const AUDIO = "C:/Users/mpolz/Downloads/Album/album_full.m4a";
const OVL = "http://127.0.0.1:8099";
// THE COLONY HOST = UNI-LAB, "the chip" (ADR-PROD-013): the colony (Minecraft + Phoenix + bodies) runs there.
// The COLONY scene captures the colony's world-view + Phoenix overlay FROM this host over the LAN — never local.
// Browser-source URLs are REGISTRY-DERIVED IPs — never DNS names, never literals. OBS renders these in
// its own CEF (a Chromium engine), and Chromium-engine consumers on this box measurably do NOT resolve
// .uni-lab.local (2026-07-15: Chrome error-paged on producer/masterplan names while nslookup, node
// getaddrinfo and Resolve-DnsName all answered via NRPT — Chromium's own resolver + RFC6762 ".local"
// special-casing bypass the OS path). Node-side PROBES elsewhere use the DNS names; anything a browser
// engine LOADS derives its declared IP from infra_registry.json (the ONE allowed IP source). Unify to
// names only after the pre-planned .local -> .internal zone flip (production/dns/README.md escape
// hatch) or a bring-up whose stage-3 SEEN sweep PROVES CEF resolves the zone.
// FIXED 2026-07-16: regUrl read the hand-declared infra_registry.json `ips[0]`. The chip's LAN address
// is a DHCP lease, so that literal went stale in place when it moved .122 -> .121 and this file would
// have staged cap_web against a dead host. The Chromium/CEF constraint above is unchanged — these URLs
// must still be IPs — but the IP is now LIVE-RESOLVED from the name at BRING-UP time (see
// host_resolve.cjs). Resolving in main() rather than at module load is also strictly safer: a DNS
// hiccup while merely requiring this file can no longer throw.
const hosts = require("./host_resolve.cjs");
// P5 (2026-07-12): bars+tone reference video used by the BROADCAST TEST 5-stage loop.
const BARS = path.join(__dirname, "assets", "bars_tone.mp4").replace(/\\/g, "/");
const CROP = 32; // slim Chrome --app title bar

const winCap = (w) => ({ inputKind: "window_capture", inputSettings: { window: w, method: 2, cursor: false } });
// overlays: always-visible browser sources (never shut down).
// 2026-07-17 PRODUCTION HARDENING: restart_when_active:true so every cut to a scene using this
// source freshly re-inits CEF — the durable answer to the class of bug where a stale CEF page or a
// dropped fetch renders BLACK on program because the source never got a chance to refresh. Not
// optional for a live broadcast: a source that only loads once will silently rot across a show.
const browser = (url) => ({ inputKind: "browser_source", inputSettings: { url, width: 1920, height: 1080, restart_when_active: true, shutdown: false } });
// A browser source renders at a FIXED canvas size, then OBS scales that render into the scene slot.
// For a full-frame overlay that's 1:1 and fine. For a HALF-SLOT card it is not: a 1920x1080 render
// squeezed into 924x780 is a NON-UNIFORM 0.48x/0.72x scale — it distorts type and pushes content
// off the bottom (measured on the first live MUSIC_CARD frame 2026-07-16). Render the card at its
// NATIVE slot size instead: no scaling, no distortion, and the CSS can design for the real box.
const browserSized = (url, w, h) => ({ inputKind: "browser_source", inputSettings: { url, width: w, height: h, restart_when_active: true, shutdown: false } });
// CHANNEL browser sources (web/clip/overlook): OBS renders these in its own process on the idle
// NVIDIA. WS1-I flipped `shutdown: false` (was true) so these render CONTINUOUSLY — the WS1-J /
// multi-view inspection panel can screenshot cap_web / cap_clip / cap_overlook off-air and get a
// REAL frame instead of black. Measured cost: <2% on the idle NVIDIA, comfortably absorbed. The
// no-more-always-on-Chrome-windows perf win from the original WS1 conversion is preserved (the
// browser render happens in OBS's own CEF, not on the saturated Intel iGPU). `chVidA` reroutes
// audio through the OBS mixer so a clip's sound is on the program (replaces the old ClipAudio).
const chVid = (url) => ({ inputKind: "browser_source", inputSettings: { url, width: 1920, height: 1080, restart_when_active: true, shutdown: false } });
const chVidA = (url) => ({ inputKind: "browser_source", inputSettings: { url, width: 1920, height: 1080, restart_when_active: true, shutdown: false, reroute_audio: true } });

const INPUTS = {
  // colony = WebGL hero, must stay a real window (Intel iGPU, irreducible).
  cap_colony: winCap(winOf(ch.colony)),
  // glass = self-signed HTTPS + WebGL globe → stays a window capture (CEF can't accept the cert).
  cap_glass: winCap(winOf(ch.glass)),
  // web/clip/overlook → OBS browser sources (render on NVIDIA, only when on air).
  // OVERLOOK = THE UNI PRODUCER'S VIEW — uni-producer, the fenced HEAD show-runner on the chip
  // (:4200/stream: the :3020 WebGL camera iframe + the live per-UNI insight/health cards + narration,
  // ONE mind; gate producer-camera-attached PASS 2026-07-15).
  // RESTORED to a WINDOW-CAPTURE 2026-07-15 (was chVid/browser_source, was black): /stream's picture
  // is the :3020 prismarine WebGL camera, and OBS's CEF renders WebGL to a BLACK frame (measured:
  // GetSourceScreenshot on cap_overlook returned pure #000; the HTML cards rendered but the camera
  // did not). This is EXACTLY the WS1 fallback studio_channels.ps1 predicted: re-add the overlook
  // real-Chrome channel + rebind cap_overlook to winCap. Real Chrome renders the WebGL camera AND the
  // cards, so the window-capture is the whole composed frame — camera + insights, the way it worked
  // through commit c14aa6d. The channel URL is the IP (CEF/Chromium doesn't resolve .local, 73bd89c).
  cap_overlook: winCap(winOf(ch.overlook)),
  // cap_web's URL is resolved from the name in main() (stageWebUrl) before any CreateInput runs —
  // module-load time is too early to ask DNS, and a declared literal is what went stale on 2026-07-16.
  cap_web: chVid("about:blank"), // master-plan board; navigable via SetInputSettings(url)
  cap_clip: chVidA("about:blank"),                         // navigated on roll; carries its own audio
  cap_share1: winCap(""), // bound live from the command center
  cap_share2: winCap(""),
  cap_share3: winCap(""),
  CamHost: { inputKind: "dshow_input", inputSettings: {} }, // PC camera — video only by rule
  // 2026-07-17 PRODUCTION HARDENING: restart_on_activate:true so every cut to a scene using this
  // camera forces a fresh RTSP handshake. Was `false` — that let a stalled/idle ffmpeg pull sit
  // "connected but not decoding" and render BLACK on program even though MediaMTX was serving fine
  // (caught LIVE 2026-07-17: cam1 publishing H264, MediaMTX bytesReceived climbing, OBS source
  // videoActive=true, but CAM_A scene at 0.1% non-black). The fix that had to happen at runtime is
  // the fix that must persist: any future rebuild of the scene collection carries it.
  RemoteCam1: { inputKind: "ffmpeg_source", inputSettings: { input: "rtsp://127.0.0.1:8554/cam1", is_local_file: false, buffering_mb: 1, reconnect_delay_sec: 2, clear_on_media_end: false, restart_on_activate: true } },
  RemoteCam2: { inputKind: "ffmpeg_source", inputSettings: { input: "rtsp://127.0.0.1:8554/cam2", is_local_file: false, buffering_mb: 1, reconnect_delay_sec: 2, clear_on_media_end: false, restart_on_activate: true } },
  MicHost: { inputKind: "wasapi_input_capture", inputSettings: { device_id: "default" } },
  ShowMusic: { inputKind: "ffmpeg_source", inputSettings: { local_file: AUDIO, is_local_file: true, looping: true, restart_on_activate: false } },
  // P5: SMPTE bars + 1kHz tone reference — cut to BARS_TONE for the SEEN-sweep stage of the BROADCAST
  // TEST. looping+restart_on_activate so each cut restarts the 60s clip cleanly.
  BarsTone: { inputKind: "ffmpeg_source", inputSettings: { local_file: BARS, is_local_file: true, looping: true, restart_on_activate: true, hw_decode: true, clear_on_media_end: false } },
  bg_desk: { inputKind: "color_source_v3", inputSettings: { color: 4279769112, width: 1920, height: 1080 } },
  ovl_lower3rd: browser(OVL + "/lower-third.html"),
  ovl_ticker: browser(OVL + "/ticker.html"),
  ovl_onair: browser(OVL + "/onair.html"),
  ovl_caption: browser(OVL + "/caption.html"),
  ovl_standby: browser(OVL + "/standby.html"),
  ovl_watermark: browser(OVL + "/watermark.html"),
  // MUSIC OVERLAYS 2026-07-16 — poll the studio's own spool (broadcast.json nowPlaying.*)
  // populated by command_center.cjs's music-service poller. These are LOCAL overlays, they do
  // NOT hit the music service directly, so no .local/CEF resolution issue for these three.
  // ovl_nowplaying = lower-third strip (title / artist / progress).
  // ovl_musicbug   = corner station bug + listener count.
  // ovl_music_hero = full cover + up-next + store QR codes (for MUSIC_HOUR/MUSIC_CARD).
  ovl_nowplaying: browser(OVL + "/nowplaying.html"),
  ovl_musicbug: browser(OVL + "/musicbug.html"),
  // TWO music-card sources, same page, different composition (?mode=). A browser_source is a fixed
  // 1920x1080 render that OBS then SCALES into its slot — so a layout tuned for a full frame turns
  // to mush at ~0.48x in a half-slot (measured: the first live MUSIC_CARD frame was unreadable).
  //   ovl_music_hero => full-frame two-column hero   (MUSIC_HOUR)
  //   ovl_music_card => stacked, ~2x type, no store URLs (MUSIC_CARD / COLONY_SIDE_MUSIC half-slot)
  ovl_music_hero: browser(OVL + "/musichero.html"),
  // Rendered at the EXACT half-slot size the scenes place it at (924x780) => 1:1, no scale, no
  // distortion. Keep this in sync with the transform in MUSIC_CARD / COLONY_SIDE_MUSIC below.
  ovl_music_card: browserSized(OVL + "/musichero.html?mode=card", 924, 780),
  ovl_lyrics: browser(OVL + "/lyrics.html"),
  // ShowRadio = the /radio MP3 stream from the music service. HTTP URL is resolved in main()
  // (stageMusicUrl below) before CreateInput runs; here we stage with a placeholder that either
  // gets rewritten to the resolved URL, or falls back to about:blank if the service is down
  // (same "did not resolve -> staged unbound" honest-degrade pattern as cap_web).
  // 2026-07-17 PRODUCTION HARDENING: restart_on_activate:true — a live stream must re-establish on
  // cut. Was `false` — that let a stalled connection linger silently across cuts.
  ShowRadio: { inputKind: "ffmpeg_source", inputSettings: { input: "", is_local_file: false, buffering_mb: 2, reconnect_delay_sec: 3, clear_on_media_end: false, restart_on_activate: true } },
};
// up to 10 LAN source slots (cam1..cam10) — the unified launcher (pub.html) publishes a
// Camera / Screen / Video into any slot; MediaMTX re-serves each on loopback RTSP for OBS. Idle
// slots aren't decoded (OBS only runs a source that's visible in program/preview), so unused
// slots cost nothing; RemoteCam1/2 are the primary mic'd cameras (voice-anchored below).
// 2026-07-16: idle slots (RemoteCam3..10) reconnect at 30s instead of 2s. The rehearsal's mediamtx
// log grew ~2.9MB/h from a retry storm — 8 unpublished slots each trying every 2s (Sweep #35
// finding). At 30s the storm calms to a trickle without breaking cold-attach when a publisher
// arrives; the primary slots (RemoteCam1/2) keep the 2s cadence so a mic'd cam attaches instantly.
for (let i = 3; i <= 10; i++) {
  INPUTS["RemoteCam" + i] = { inputKind: "ffmpeg_source", inputSettings: { input: "rtsp://127.0.0.1:8554/cam" + i, is_local_file: false, buffering_mb: 1, reconnect_delay_sec: 30, clear_on_media_end: false, restart_on_activate: true } };
}

// camera role scenes: every camera present, ONE enabled (the command center flips these live)
const CAMS = ["CamHost", ...Array.from({ length: 10 }, (_, i) => "RemoteCam" + (i + 1))];
const F = { x: 0, y: 0, w: 1920, h: 1080 };
const ROLES = {
  ROLE_A: "RemoteCam1", // host
  ROLE_B: "RemoteCam2", // guest
  ROLE_C: "CamHost",    // PC camera (video-only)
};

// template scene -> ordered items (bottom -> top).
// fit: x/y/w/h, inner=keep aspect, crop=cropTop px, disabled=start hidden.
const chromeFull = { ...F, crop: CROP };
const corner = { x: 1458, y: 784, w: 426, h: 240, inner: true };
// VOICE ANCHORS: OBS mixes a source's audio only while it is ACTIVE in the program scene.
// Without these, cutting to a template that omits a role would silence that role's mic
// mid-sentence while the console still shows it live. Tiny enabled items parked OFFSCREEN
// keep every remote cam active in every talk template — the mute matrix (voice picker)
// becomes the single audio truth. (PC cam carries no audio by rule; MicHost has its own item.)
// Extended (WS1-D) from 2 -> 10 so the console can pick voice from ANY slot and can screenshot
// any slot on demand (invisible items are elided in the compositor -- cost is negligible).
const VOICE_ANCHORS = Array.from({ length: 10 }, (_, i) => [
  "RemoteCam" + (i + 1),
  { x: -30, y: -30, w: 4, h: 4 },
]);
// PRESENTER = whichever camera role the operator maps to himself (default ROLE_A). Templates
// favour ONE presenter + content over two cameras of the owner (those live in MULTICAM, demoted).
// Shared layout fragments (reused across templates):
const heroL = { x: 0, y: 60, w: 1400, h: 788, inner: true };            // big left hero (cam/content)
const railTop = { x: 1416, y: 60, w: 480, h: 270 };                    // right rail, 3 tiles 480x270
const railMid = { x: 1416, y: 354, w: 480, h: 270 };
const railBot = { x: 1416, y: 648, w: 480, h: 270 };
const wideL = { x: 32, y: 180, w: 1152, h: 648 };                       // content left ~60%
const talkR = { x: 1216, y: 300, w: 640, h: 360, inner: true };        // presenter right, aspect
const halfL = { x: 64, y: 264, w: 832, h: 468, inner: true };          // left half (cam)
const halfR = { x: 960, y: 264, w: 896, h: 504 };                      // right half (content)
const pipTR = { x: 1232, y: 56, w: 624, h: 351 };                      // PIP top-right
const pipBR = { x: 1372, y: 736, w: 512, h: 288, inner: true };        // PIP bottom-right (cam)
const newsHero = { x: 0, y: 96, w: 1088, h: 612, inner: true };        // news-desk presenter hero
const newsTop = { x: 1120, y: 96, w: 768, h: 432 };                    // news-desk monitor 1
const newsBot = { x: 1120, y: 552, w: 768, h: 432 };                   // news-desk monitor 2
const cropOf = (f) => ({ ...f, crop: CROP });                          // window-capture variant (trims title bar)

const GROUPS = [
  { name: "SOLO", scenes: ["CAM_A"] },
  { name: "COLONY", scenes: ["COLONY", "CAM_PIP", "COLONY_SIDE", "PIP"] },
  { name: "TEACH / DEMO", scenes: ["SHARE", "DESK", "GLASS_TALK", "SHARE_MULTI", "TEACH"] },
  { name: "WEB", scenes: ["WEB_HOST", "WEB_SIDE"] },
  { name: "VIDEO CLIP", scenes: ["CLIP_HOST", "CLIP_SIDE", "CLIP_PIP"] },
  { name: "DESK / MULTI", scenes: ["NEWSDESK", "ANCHOR"] },
  { name: "FULL SCREEN", scenes: ["GLASS_OS", "OVERLOOK", "WEB", "CLIP"] },
  { name: "MULTI-CAM (demoted)", scenes: ["DUAL_AB", "TRIO", "DUAL_WORLD", "CAM_B"] },
  { name: "CAMERAS", scenes: ["GRID"] },
  { name: "MUSIC", scenes: ["MUSIC_HOUR", "MUSIC_CARD", "COLONY_SIDE_MUSIC"] },
  { name: "UTILITY", scenes: ["BARS_TONE", "STANDBY", "STANDBY_OFFLINE"] },
];
const SCENES = {
  // SOLO
  CAM_A: [["ROLE_A", { ...F, inner: true }], ["MicHost"]],
  // COLONY (world hero + presenter)
  COLONY: [["cap_colony", chromeFull], ["ShowMusic"]],
  CAM_PIP: [["cap_colony", chromeFull], ["ROLE_A", pipBR], ["MicHost"]],
  COLONY_SIDE: [["bg_desk", F], ["cap_colony", cropOf(wideL)], ["ROLE_A", talkR], ["MicHost"]],
  PIP: [["cap_colony", chromeFull], ["cap_glass", cropOf(pipTR)], ["ShowMusic"]],
  // TEACH / DEMO (presenter + screen/data)
  SHARE: [["cap_share1", { ...F, inner: true }], ["ROLE_A", corner], ["MicHost"]],
  DESK: [["bg_desk", F], ["ROLE_A", halfL], ["cap_share1", { ...halfR, inner: true }], ["MicHost"]],
  GLASS_TALK: [["cap_glass", chromeFull], ["ROLE_A", pipBR], ["MicHost"]],
  SHARE_MULTI: [["bg_desk", F], ["cap_share1", { x: 24, y: 64, w: 924, h: 460, inner: true }], ["cap_share2", { x: 972, y: 64, w: 924, h: 460, inner: true }], ["cap_share3", { x: 24, y: 556, w: 924, h: 460, inner: true }], ["ROLE_A", { x: 972, y: 556, w: 924, h: 460, inner: true }], ["MicHost"]],
  TEACH: [["bg_desk", F], ["cap_share1", heroL], ["ROLE_A", railTop], ["cap_colony", cropOf(railMid)], ["cap_clip", railBot], ["MicHost"]],
  // WEB (presenter + web page / master plan)
  WEB_HOST: [["cap_web", F], ["ROLE_A", corner], ["MicHost"]],
  WEB_SIDE: [["bg_desk", F], ["ROLE_A", halfL], ["cap_web", halfR], ["MicHost"]],
  // VIDEO CLIP (presenter + played video — full / side-by-side / PIP)
  CLIP_HOST: [["cap_clip", F], ["ROLE_A", corner], ["MicHost"]],
  CLIP_SIDE: [["bg_desk", F], ["cap_clip", wideL], ["ROLE_A", talkR], ["MicHost"]],
  CLIP_PIP: [["ROLE_A", { ...F, inner: true }], ["cap_clip", pipTR], ["MicHost"]],
  // DESK / MULTI (one presenter + multiple content panels)
  NEWSDESK: [["bg_desk", F], ["ROLE_A", newsHero], ["cap_colony", cropOf(newsTop)], ["cap_clip", newsBot], ["MicHost"]],
  ANCHOR: [["bg_desk", F], ["ROLE_A", heroL], ["cap_clip", railTop], ["cap_colony", cropOf(railMid)], ["cap_glass", cropOf(railBot)], ["MicHost"]],
  // FULL SCREEN (single source)
  // 2026-07-17 PRODUCTION HARDENING: MicHost added to the full-screen content scenes so the
  // presenter can talk over the content without a scene cut. The classic broadcast policy is
  // "mic always available on program, muted by default (talent-hot rule enforced elsewhere)" —
  // requiring a scene switch to speak is the wrong contract for a live show, and the operator
  // was caught by it 2026-07-17 (cut to OVERLOOK, tried to speak, no audio). ShowMusic stays
  // for the background music bed; both can be muted independently via the mixer.
  GLASS_OS: [["cap_glass", chromeFull], ["MicHost"], ["ShowMusic"]],
  OVERLOOK: [["cap_overlook", F], ["MicHost"], ["ShowMusic"]],
  WEB: [["cap_web", F], ["MicHost"], ["ShowMusic"]],
  CLIP: [["cap_clip", F]],
  // MULTI-CAM (demoted — two/three cameras; kept for real interviews/panels only)
  DUAL_AB: [["bg_desk", F], ["ROLE_A", { x: 24, y: 150, w: 924, h: 520, inner: true }], ["ROLE_B", { x: 972, y: 150, w: 924, h: 520, inner: true }], ["MicHost"]],
  TRIO: [["bg_desk", F], ["ROLE_A", { x: 24, y: 180, w: 616, h: 347, inner: true }], ["ROLE_B", { x: 652, y: 180, w: 616, h: 347, inner: true }], ["ROLE_C", { x: 1280, y: 180, w: 616, h: 347, inner: true }], ["MicHost"]],
  DUAL_WORLD: [["cap_colony", chromeFull], ["ROLE_A", { x: 1372, y: 420, w: 512, h: 288, inner: true }], ["ROLE_B", pipBR], ["MicHost"]],
  CAM_B: [["ROLE_B", { ...F, inner: true }], ["MicHost"]],
  // Dynamic picker — any of the 10 slots into these, chosen at select via /api/camlayout.
  //
  // ONLY GRID IS IN THE `CAMERAS` GROUP. PIP_AB is in NO group, and that is load-bearing rather than
  // an oversight in the grouping: allTemplates() is built from GROUPS, so /api/preview 400s on
  // PIP_AB and the only route to it is /api/camlayout {layout:"pip"}, whose default branch cuts
  // STRAIGHT TO AIR. The one scene you cannot preview is reachable only by putting it on air.
  // verify_rundown.cjs check 2 fails if any rundown row names it. Pass {preview:true} to arm it
  // instead of cutting. (This comment said "CAMERAS" over both scenes until 2026-08-01, which read
  // as though PIP_AB were grouped and previewable like GRID.)
  PIP_AB: [["ROLE_A", { ...F, inner: true }], ["ROLE_B", pipBR], ["MicHost"]],
  GRID: [["bg_desk", F], ...Array.from({ length: 10 }, (_, i) => ["RemoteCam" + (i + 1), { x: (i % 5) * 384, y: 108 + Math.floor(i / 5) * 456, w: 384, h: 432, inner: true }])],
  // UTILITY
  BARS_TONE: [["BarsTone", { ...F, inner: true }]],
  // HONESTY FIX 2026-07-16 (Sweep #27): STANDBY WAS playing music, contradicting its own DESC
  // (":248 Honest 'please stand by' slate. No overlays.") and this file's own :22 header rule
  // ("Music bed only on WORLD/CONTENT templates"). Dropped ShowMusic — the slate is truly silent
  // now, matching the operator's expectation and every documented invariant.
  STANDBY: [["ovl_standby", F]],
  // MUSIC scenes 2026-07-16 (operator DMCA policy: full on-air, owned/licensed). Dedicated music
  // segments the operator opts into per segment. ShowRadio is the /radio MP3 stream (ffmpeg_source)
  // pointed at the music service, resolved to an IP at bring-up via host_resolve — CEF cannot
  // resolve .local so hard-coding a name would air a black frame instead of the cover.
  MUSIC_HOUR: [["bg_desk", F], ["ovl_music_hero", F], ["ShowRadio"]],
  // Half-slot scenes use ovl_music_card (?mode=card) — the stacked, big-type composition that
  // survives OBS's ~0.48x downscale. Using the full-frame hero here was unreadable (fixed 2026-07-16).
  MUSIC_CARD: [["bg_desk", F], ["ROLE_A", { x: 24, y: 150, w: 924, h: 780, inner: true }], ["ovl_music_card", { x: 972, y: 150, w: 924, h: 780 }], ["ShowRadio"], ["MicHost"]],
  COLONY_SIDE_MUSIC: [["bg_desk", F], ["cap_colony", { x: 24, y: 150, w: 924, h: 780, inner: true }], ["ovl_music_card", { x: 972, y: 150, w: 924, h: 780 }], ["ShowRadio"]],
  // Fallback when music service is unreachable — file-backed ShowMusic. Honest degrade.
  STANDBY_OFFLINE: [["ovl_standby", F], ["ShowMusic"]],
};
// human descriptions — single source of truth for the console card tooltips AND the operator
// manual (written into runtime/templates.json). Keep each to one line: what's on screen + when.
const DESC = {
  CAM_A: "Solo presenter, full frame. Talking head / desk read / answering chat.",
  COLONY: "The Minecraft colony world, full frame — the hero shot. No camera.",
  CAM_PIP: "Colony hero + you as a small picture-in-picture, bottom-right. Narrate the world.",
  COLONY_SIDE: "You and the colony side-by-side. Explain while the world runs.",
  PIP: "Colony hero + the live glass cockpit data inset, top-right. World + telemetry, no camera.",
  SHARE: "A shared window full-frame + you in the corner. Demo an app / site.",
  DESK: "You on the left, a shared screen on the right. Teach or walk through something.",
  GLASS_TALK: "The live UNI.OS cockpit full-frame + you as a PIP. Explain the dashboard.",
  SHARE_MULTI: "Up to three shared windows + you, in a 2x2 wall. Multi-window demo.",
  TEACH: "A shared screen as the hero + a rail of you / colony / clip. Deep teaching segment.",
  WEB_HOST: "A web page (defaults to the master-plan board) full-frame + you in the corner.",
  WEB_SIDE: "You and a web page side-by-side. Walk the roadmap / a site together.",
  CLIP_HOST: "A YouTube clip full-frame + you in the corner. Clip carries its own audio.",
  CLIP_SIDE: "A YouTube clip and you side-by-side. React to a video as it plays.",
  CLIP_PIP: "You full-frame + the clip as a small PIP, top-right. The classic react-to-a-video shot.",
  NEWSDESK: "You as the anchor + a right column of two monitors (colony + clip/web). News-desk look.",
  ANCHOR: "You big on the left + a rail of clip / colony / glass. The monitor-wall anchor desk.",
  GLASS_OS: "The UNI.OS glass cockpit, full frame. A pure data beat.",
  OVERLOOK: "THE UNI PRODUCER'S VIEW (/stream) — the unique UNI that directs the camera and reports the show. On the stale v2 mind the Producer is MISSING (health 404) — shown honestly until the science redeploy.",
  WEB: "A web page (or the master-plan board), full frame.",
  CLIP: "A YouTube clip, full frame. Carries its own audio.",
  DUAL_AB: "Two cameras side-by-side (host + guest). A real interview two-shot — demoted.",
  TRIO: "Three cameras across. A panel — demoted; lowest value for a solo show.",
  DUAL_WORLD: "Colony hero + two camera PIPs (host + guest over the world) — demoted.",
  CAM_B: "The B-camera (guest) full frame. For a guest solo — demoted.",
  PIP_AB: "Camera A full-frame + camera B as a picture-in-picture. Pick both in the camera picker.",
  GRID: "Up to 10 remote cameras at once — a 5x2 monitor wall.",
  STANDBY: "Honest 'please stand by' slate. Silent (no music bed, no overlays).",
  BARS_TONE: "SMPTE bars + 1kHz reference tone. Sound check + the SEEN-sweep opener for BROADCAST TEST.",
  MUSIC_HOUR: "The Collected Packages Radio, full-screen cover + up-next + store QR codes. Dedicated music segment; no camera. Owned/licensed per operator attestation.",
  MUSIC_CARD: "Presenter on the left, music card on the right — talk over the track. Mic + music both on program.",
  COLONY_SIDE_MUSIC: "Colony hero on the left, music card on the right. World runs, music airs, no camera.",
  STANDBY_OFFLINE: "Fallback slate when the music service is unreachable — uses the local file bed. Honest degrade.",
};
// honest overlays on every template except the standby slate.
// 2026-07-16: ovl_musicbug + ovl_nowplaying JOIN the stack. Both self-hide when
// spool.nowPlaying is absent/err (they check `n.title`), so a scene with no music showing costs
// nothing visually — but the moment a track is playing, every template carries attribution. That
// is the point of the operator's "full on-air (owned/licensed)" DMCA policy: music that airs is
// music that is CREDITED, automatically, on every scene.
// NOTE (bug found live 2026-07-16): OBS only CREATES an input when a SCENE references it. These
// three were declared in INPUTS but appeared in no scene, so the first rebuild silently skipped
// them — GetInputSettings returned "No source was found by the name of `ovl_nowplaying`". A
// declaration is not an instantiation. Anything in INPUTS must land in a scene or it does not exist.
const OVERLAY_STACK = ["ovl_watermark", "ovl_musicbug", "ovl_nowplaying", "ovl_lower3rd", "ovl_caption", "ovl_ticker", "ovl_onair"];
// THE MUSIC SCENES ARE THEIR OWN CHROME (fixed 2026-07-16 after seeing the first live MUSIC_HOUR
// frame). The generic stack FOUGHT the music card three ways at once:
//   1. ovl_nowplaying (lower-third strip) + ovl_musicbug (corner chip) + the hero card ALL said the
//      same track — the same sentence three times on one frame. Broadcast chrome must not repeat
//      itself; the hero IS the now-playing surface on a music scene.
//   2. ovl_lyrics is a right-side FIXED panel and musichero's metadata is a right column — they
//      overlapped, and the lyrics panel clipped the track title mid-word.
//   3. ovl_lower3rd carried a STALE colony lower-third ("Active-inference agents…") over a music
//      scene, because the spool's lowerThird persists across cuts.
// So: music scenes get watermark + onair (station identity, always) and NOTHING that duplicates or
// collides with the card. MUSIC_CARD keeps the lower-third because a presenter there DOES need a
// name strap; it has no lyrics panel and no hero-vs-panel collision.
const MUSIC_SCENES = new Set(["MUSIC_HOUR", "COLONY_SIDE_MUSIC"]);
const MUSIC_CHROME = ["ovl_watermark", "ovl_onair"];
for (const s of Object.keys(SCENES)) {
  if (s === "STANDBY") continue;
  if (MUSIC_SCENES.has(s)) { SCENES[s].push(...MUSIC_CHROME.map((o) => [o, F])); continue; }
  if (s === "MUSIC_CARD") { SCENES[s].push(...["ovl_watermark", "ovl_lower3rd", "ovl_onair"].map((o) => [o, F])); continue; }
  SCENES[s].push(...OVERLAY_STACK.map((o) => [o, F]));
}
// ovl_lyrics is NOT in any default stack — it is a per-segment operator choice, and on MUSIC_HOUR
// it would collide with the hero's right column. It exists as an input so the operator can enable
// it by hand on MUSIC_HOUR for a lyrics segment; it is created here DISABLED so it never surprises.
SCENES.MUSIC_HOUR.push(["ovl_lyrics", { ...F, disabled: true }]);
// voice anchors on every talk template (any scene carrying MicHost)
for (const s of Object.keys(SCENES)) if (SCENES[s].some(([n]) => n === "MicHost")) SCENES[s].push(...VOICE_ANCHORS.map(([n, t]) => [n, { ...t }]));

// ---- EXPORTED POLICY (single source of truth for the overlay gate) -------------------------
// Which ovl_* sources a given scene is SUPPOSED to carry is decided above, per scene: the generic
// OVERLAY_STACK for most templates, MUSIC_CHROME for the music scenes (which deliberately drop the
// duplicate now-playing chrome), a bespoke set for MUSIC_CARD, and NOTHING for STANDBY. Before
// 2026-07-19 verify_overlays.cjs hard-coded a single four-source list and asserted it against
// whatever scene happened to be on program, so it reported a FALSE FAILURE on every music scene
// ("ovl_lower3rd is NOT in program scene 'COLONY_SIDE_MUSIC'") even though that scene is correct by
// design. The gate now asks THIS module what the current scene should carry, so the expectation and
// the build can never drift apart again.
//
// Derived from the BUILT SCENES object rather than from the source lists, so anything appended
// above (music chrome, voice anchors, the deliberately-disabled ovl_lyrics) is accounted for.
// A scene item declared `disabled: true` is excluded: it is created intentionally dark and must not
// be demanded on air.
function expectedOverlaysFor(sceneName) {
  const spec = SCENES[sceneName];
  if (!spec) return null; // unknown scene -> caller must fail honestly, not silently pass
  return spec
    .filter(([n, t]) => /^ovl_/.test(n) && !(t && t.disabled))
    .map(([n]) => n);
}
module.exports = { SCENES, OVERLAY_STACK, MUSIC_SCENES, MUSIC_CHROME, expectedOverlaysFor };

// Everything BELOW this line MUTATES OBS: it rebuilds every scene and ends by cutting program to
// COLONY. That must never happen merely because another module required this file for its policy.
// CommonJS wraps modules in a function, so a top-level return is legal and is the smallest possible
// guard — no reindentation of the build code, no behaviour change when run directly.
if (require.main !== module) return;

// ---- obs-websocket v5 minimal async client ------------------------------------------------
const ws = new WebSocket("ws://127.0.0.1:4455");
let rid = 0;
const pending = new Map();
function req(type, data) {
  return new Promise((resolve) => {
    const id = "q" + rid++;
    pending.set(id, { resolve });
    ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
  });
}
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
  else if (m.op === 2) main().catch((e) => { console.log("FATAL " + (e.stack || e)); process.exit(1); });
  else if (m.op === 7) {
    const p = pending.get(m.d.requestId);
    if (!p) return;
    pending.delete(m.d.requestId);
    p.resolve({ ok: m.d.requestStatus.result, code: m.d.requestStatus.code, comment: m.d.requestStatus.comment, data: m.d.responseData || {} });
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
ws.on("close", () => { console.log("OBS websocket closed mid-build — stage may be incomplete; re-run when OBS is back"); process.exit(2); });

async function main() {
  const live = (await req("GetStreamStatus")).data;
  if (live.outputActive && !process.argv.includes("--force")) {
    console.log("REFUSING: OBS is STREAMING — rebuilding would put black frames on air. Re-run with --force to override.");
    process.exit(1);
  }
  const vid = (await req("GetVideoSettings")).data;
  console.log(`canvas ${vid.baseWidth}x${vid.baseHeight} -> output ${vid.outputWidth}x${vid.outputHeight} @${vid.fpsNumerator}/${vid.fpsDenominator}`);
  if (vid.baseWidth !== 1920 || vid.baseHeight !== 1080) console.log("WARN canvas is not 1920x1080 — layouts assume it");
  for (const k of ["colony", "glass", "overlook", "web", "clip"]) {
    if (!ch[k]) console.log(`WARN channels.json has NO title for "${k}" — its capture is created UNBOUND; run studio_channels.ps1 and re-run`);
  }

  // Resolve the chip-hosted browser-source URL from its NAME, now, at bring-up. OBS's CEF cannot
  // resolve .uni-lab.local (see the header), so it needs a literal — but a literal that is resolved
  // live, never one hand-declared in the registry. Staging an unresolvable name would silently put a
  // dead page on a source, so say so loudly and leave it about:blank rather than fake it.
  const stageWebUrl = await hosts.urlFor("masterplan", "/").catch(() => null);
  if (stageWebUrl) { INPUTS.cap_web = chVid(stageWebUrl); console.log(`cap_web -> ${stageWebUrl} (resolved from masterplan.uni-lab.local)`); }
  else console.log("WARN masterplan.uni-lab.local did NOT resolve — cap_web staged as about:blank, NOT the master-plan board. Check uni-dns on the chip.");

  // ShowRadio (music service) — same discipline as cap_web: session-pinned so audio and the
  // /api/nowplaying?session=obs-studio-thinker feed stay in lock-step across OBS restart.
  // Session identity is stable; only the URL's IP moves as the chip's lease moves.
  const stageMusicUrl = await hosts.urlFor("music", "/radio?session=obs-studio-thinker").catch(() => null);
  if (stageMusicUrl) {
    INPUTS.ShowRadio.inputSettings.input = stageMusicUrl;
    console.log(`ShowRadio -> ${stageMusicUrl} (resolved from music.uni-lab.local)`);
  } else {
    console.log("WARN music.uni-lab.local did NOT resolve — ShowRadio staged unbound. STANDBY_OFFLINE (ShowMusic file bed) is the honest fallback until DNS lands.");
  }

  // park program so everything can be rebuilt
  await req("CreateScene", { sceneName: "___staging" });
  await req("SetCurrentProgramScene", { sceneName: "___staging" });

  // legacy scene names from earlier stage versions are torn down too
  const LEGACY = ["CAM", "CAM_PIP", "DESK", "SHARE", "SHARE_MULTI", "WEB", "CLIP", "STANDBY", "COLONY", "PIP", "GLASS_OS", "OVERLOOK"];
  for (const s of new Set([...Object.keys(SCENES), ...LEGACY])) await req("RemoveScene", { sceneName: s });
  for (const r of Object.keys(ROLES)) await req("RemoveScene", { sceneName: r });
  for (const n of Object.keys(INPUTS)) await req("RemoveInput", { inputName: n });
  // input/scene removal is async in OBS — wait until none of ours remain
  for (let tries = 0; tries < 25; tries++) {
    const names = ((await req("GetInputList")).data.inputs || []).map((i) => i.inputName);
    const scenes = ((await req("GetSceneList")).data.scenes || []).map((s) => s.sceneName);
    if (!Object.keys(INPUTS).some((n) => names.includes(n)) && !Object.keys(ROLES).some((r) => scenes.includes(r))) break;
    await new Promise((r) => setTimeout(r, 400));
  }

  // 1) camera role scenes (created first — templates embed them as sources)
  const created = new Set();
  for (const [role, activeCam] of Object.entries(ROLES)) {
    const mk = await req("CreateScene", { sceneName: role });
    if (!mk.ok) { console.log(`ERR CreateScene ${role}: ${mk.comment}`); continue; }
    for (const cam of CAMS) {
      let itemId;
      if (!created.has(cam)) {
        const r = await req("CreateInput", { sceneName: role, inputName: cam, ...INPUTS[cam] });
        if (!r.ok) { console.log(`ERR CreateInput ${cam}: ${r.comment}`); continue; }
        created.add(cam); itemId = r.data.sceneItemId;
      } else {
        const r = await req("CreateSceneItem", { sceneName: role, sourceName: cam });
        if (!r.ok) { console.log(`ERR item ${cam} in ${role}: ${r.comment}`); continue; }
        itemId = r.data.sceneItemId;
      }
      await req("SetSceneItemTransform", { sceneName: role, sceneItemId: itemId, sceneItemTransform: { positionX: 0, positionY: 0, alignment: 5, boundsType: "OBS_BOUNDS_SCALE_INNER", boundsAlignment: 0, boundsWidth: 1920, boundsHeight: 1080 } });
      await req("SetSceneItemEnabled", { sceneName: role, sceneItemId: itemId, sceneItemEnabled: cam === activeCam });
    }
    console.log(`ROLE ${role} -> ${activeCam}`);
  }

  // 2) template scenes
  for (const [scene, items] of Object.entries(SCENES)) {
    const mk = await req("CreateScene", { sceneName: scene });
    if (!mk.ok) { console.log(`ERR CreateScene ${scene}: ${mk.comment}`); continue; }
    for (const [name, fitTo] of items) {
      let itemId = null;
      const isRole = name.startsWith("ROLE_");
      if (!isRole && !created.has(name)) {
        const r = await req("CreateInput", { sceneName: scene, inputName: name, ...INPUTS[name] });
        if (!r.ok) { console.log(`ERR CreateInput ${name} in ${scene}: ${r.comment}`); continue; }
        created.add(name); itemId = r.data.sceneItemId;
      } else {
        const r = await req("CreateSceneItem", { sceneName: scene, sourceName: name });
        if (!r.ok) { console.log(`ERR CreateSceneItem ${name} in ${scene}: ${r.comment}`); continue; }
        itemId = r.data.sceneItemId;
      }
      if (fitTo && itemId != null) {
        const t = {
          positionX: fitTo.x, positionY: fitTo.y, alignment: 5,
          boundsType: fitTo.inner ? "OBS_BOUNDS_SCALE_INNER" : "OBS_BOUNDS_STRETCH",
          boundsAlignment: 0, boundsWidth: fitTo.w, boundsHeight: fitTo.h,
          cropTop: fitTo.crop || 0,
        };
        const tr = await req("SetSceneItemTransform", { sceneName: scene, sceneItemId: itemId, sceneItemTransform: t });
        if (!tr.ok) console.log(`ERR fit ${name} in ${scene}: ${tr.comment}`);
        if (fitTo.disabled) await req("SetSceneItemEnabled", { sceneName: scene, sceneItemId: itemId, sceneItemEnabled: false });
      }
    }
    console.log("SCENE " + scene + " built (" + items.length + " items)");
  }

  // audio defaults 2026-07-16 (talent-hot policy per operator): EVERY cam + MicHost boot MUTED.
  // Operator must pick a voice on the console before audio can air. Was: RemoteCam1 booted
  // UNMUTED (studio_stage.cjs:372, sweep #28) — a mic on the air by default is a real leak risk.
  // Music beds live at -14dBFS as before.
  await req("SetInputVolume", { inputName: "ShowMusic", inputVolumeDb: -14 });
  await req("SetInputVolume", { inputName: "ShowRadio", inputVolumeDb: -14 });
  await req("SetInputMute", { inputName: "MicHost", inputMuted: true });
  await req("SetInputMute", { inputName: "RemoteCam1", inputMuted: true });
  await req("SetInputMute", { inputName: "RemoteCam2", inputMuted: true });
  for (let i = 3; i <= 10; i++) await req("SetInputMute", { inputName: "RemoteCam" + i, inputMuted: true });

  // OUTPUT-CAPTURE hard-mute 2026-07-16 (sweep #8). Was: literal-name "Desktop Audio" only,
  // best-effort log if it failed. Now: enumerate every audio-output input kind (wasapi_output_capture,
  // any *_output_*), mute each, and emit a RED gate line if any remains unmuted. This closes the
  // "system sounds air silently" class.
  const inputList = (await req("GetInputList")).data.inputs || [];
  const outputAudios = inputList.filter((i) => /output_capture|desktop_audio|monitor/i.test(i.inputKind));
  const stillHot = [];
  for (const i of outputAudios) {
    const r = await req("SetInputMute", { inputName: i.inputName, inputMuted: true });
    if (!r.ok) stillHot.push(i.inputName);
  }
  if (stillHot.length) {
    console.log(`ERR OUTPUT-CAPTURE HOT: could not mute [${stillHot.join(", ")}] — system sounds WILL air. Refuse to arm until fixed manually in OBS Advanced Audio.`);
  } else if (outputAudios.length) {
    console.log(`output-capture muted (${outputAudios.map((i) => i.inputName).join(", ")})`);
  }

  // CamHost auto-bind 2026-07-16 (sweep #B1/#B2). CamHost boots as dshow_input with an empty
  // video_device_id, so a fresh stage silently ships a black PC-cam scene. Fix: read the persisted
  // device from runtime/camhost.json (written by /api/camhost/bind in command_center); fall back to
  // the first enumerated dshow device. Only sets a device if CamHost currently has none — an
  // operator's active pick is not overwritten by a stage rebuild.
  try {
    const cur = (await req("GetInputSettings", { inputName: "CamHost" })).data?.inputSettings || {};
    if (!cur.video_device_id) {
      const persistPath = path.join(__dirname, "runtime", "camhost.json");
      let persisted = null;
      try { persisted = JSON.parse(fs.readFileSync(persistPath, "utf8")).video_device_id || null; } catch (_) {}
      let deviceId = persisted;
      if (!deviceId) {
        const props = await req("GetInputPropertiesListPropertyItems", { inputName: "CamHost", propertyName: "video_device_id" });
        const items = (props.data && props.data.propertyItems) || [];
        const real = items.filter((it) => it.itemEnabled !== false && it.itemValue && it.itemValue.length > 4);
        deviceId = real[0] && real[0].itemValue;
      }
      if (deviceId) {
        const r = await req("SetInputSettings", { inputName: "CamHost", inputSettings: { video_device_id: deviceId } });
        console.log(r.ok ? `CamHost auto-bound (${persisted ? "persisted" : "first enumerated"})` : `WARN CamHost auto-bind failed: ${r.comment}`);
      } else {
        console.log("WARN CamHost: no DirectShow devices enumerated. Operator must pick one in the command center when hardware attaches.");
      }
    }
  } catch (e) { console.log(`WARN CamHost auto-bind threw: ${e.message}`); }

  await req("SetCurrentProgramScene", { sceneName: "COLONY" });
  await req("RemoveScene", { sceneName: "___staging" });

  // single source of truth for the command center UI
  const manifest = { updated: new Date().toISOString(), groups: GROUPS, roles: ROLES, desc: DESC };
  fs.mkdirSync(path.join(__dirname, "runtime"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "runtime", "templates.json"), JSON.stringify(manifest, null, 2));

  const list = (await req("GetSceneList")).data.scenes.map((s) => s.sceneName).reverse();
  console.log("STUDIO BUILT (" + Object.keys(SCENES).length + " templates + 3 camera roles). scenes: " + list.join(" / "));
  console.log("program -> COLONY. Drive from the command center (http://127.0.0.1:8098).");
  try { ws.close(); } catch (_) {}
  process.exit(0);
}

setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 120000);