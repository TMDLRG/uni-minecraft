// studio.cjs — THE OPERATOR CONSOLE. Drive the live show from one prompt, working WITH the
// autonomous SP.Producer (colony feed) rather than replacing it.
//
//   node viewer\studio.cjs
//
// What it controls:
//   - program cuts across the studio templates (see studio_stage.cjs / STUDIO_OPERATOR_MANUAL §4 for the full role suite)
//   - the owner's webcam(s)  -> `cams` / `cam <n>`
//   - any open window as a share -> `windows [filter]` / `share1|share2|share3 <n|substring>`
//   - the WEB feed channel   -> `web <url>` (navigates the dedicated Chrome via CDP :9223)
//   - the CLIP channel       -> `clip <youtube-url> [secs]` (CDP :9224, autoplay, auto-return)
//   - honest lower-third / ticker / on-air overlays (writes viewer/runtime/broadcast.json,
//     served by overlay_server.cjs; the claim fence is enforced with a lint)
//   - auto rotation (director beats), music bed, screenshots, stream status
//   - `feed uni on` mirrors SP.Producer's live colony narration into ticker+caption
//
// GO-LIVE STAYS HUMAN: `golive CONFIRM` (typed by the operator) is the outward trigger (G-PA) —
// but this is System-1 DEV preview only; the worldwide go-live is System 2 start_broadcast.
// Stream keys are NEVER touched here — OBS pushes to the local restreamer (viewer\restream.ps1).
const WebSocket = require("ws");
const http = require("http");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { spawn } = require("child_process");
const golive_guard = require("./golive_guard.cjs");   // F31: the one chokepoint to air

const SPOOL = path.join(__dirname, "runtime", "broadcast.json");
const REPO = path.resolve(__dirname, "..");
// LAN_IP resolved from infra_registry (the declared source), so it follows the chip/box lease
// rather than pinning a literal — the same pattern command_center.cjs uses. Remote cams open the
// picker at https://<LAN_IP>:8443/ (handles /camN/whip).
const LAN_IP = (((require("./infra_registry.json").boxes || []).find((b) => b.name === "thinker") || {}).ips || [])[0] || "thinker.uni-lab.local";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------- obs-websocket v5 client (auto-reconnect) ----------------
const obs = {
  ws: null, connected: false, rid: 0, pending: new Map(),
  connect() {
    const w = new WebSocket("ws://127.0.0.1:4455");
    this.ws = w;
    w.on("message", (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.op === 0) w.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
      else if (m.op === 2) { this.connected = true; console.log("  [obs connected]"); }
      else if (m.op === 7) {
        const p = this.pending.get(m.d.requestId);
        if (!p) return;
        this.pending.delete(m.d.requestId);
        p({ ok: m.d.requestStatus.result, comment: m.d.requestStatus.comment, data: m.d.responseData || {} });
      }
    });
    const drop = () => {
      if (this.connected) console.log("  [obs disconnected — retrying]");
      this.connected = false;
      for (const p of this.pending.values()) p({ ok: false, comment: "obs disconnected", data: {} });
      this.pending.clear();
      setTimeout(() => this.connect(), 3000);
    };
    w.on("close", drop);
    w.on("error", () => {});
  },
  req(type, data) {
    return new Promise((resolve) => {
      if (!this.connected) return resolve({ ok: false, comment: "OBS not connected", data: {} });
      const id = "s" + this.rid++;
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId: id, requestData: data || {} } }));
    });
  },
};

// ---------------- HTTP (MediaMTX API + publisher registrations) ----------------
// (CDP helpers removed: cap_web / cap_clip are OBS browser sources now — the `web` and `clip`
// commands below navigate them directly via SetInputSettings.)
function httpJson(port, p) {
  return new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, timeout: 3000 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(JSON.parse(b || "null")); } catch (_) { resolve(null); } });
    });
    r.on("error", () => resolve(null)); r.on("timeout", () => { r.destroy(); resolve(null); }); r.end();
  });
}

// ---------------- honest overlay state (broadcast.json contract) ----------------
function readState() {
  try { return JSON.parse(fs.readFileSync(SPOOL, "utf8")); }
  catch (e) { return e.code === "ENOENT" ? {} : null; } // null = torn/locked file: do NOT clobber it
}
function writeState(mut) {
  const st = readState();
  if (st === null) return; // preserve-on-parse-failure: skip this cycle, next writer heals it
  mut(st); st.updatedUtc = new Date().toISOString();
  const tmp = SPOOL + ".studio.tmp"; fs.writeFileSync(tmp, JSON.stringify(st, null, 2)); fs.renameSync(tmp, SPOOL);
}
// heartbeat: overlays hide themselves ~8s after the console (the producer) dies — honest liveness
setInterval(() => { try { writeState(() => {}); } catch (_) {} }, 3000).unref();

const FENCE = /\b(prov(e[sd]?|en|ing)|proof|conscious\w*|sentien\w*|self.?aware\w*|aware(ness)?|alive|living|life.?form\w*|digital\s+life|new\s+life|experienc\w*|feel(s|ings?)?|felt|suffer\w*|first.?ever|world.?s?.?first|breakthrough|agi|human.?level)\b/i;
// returns {text, ok}: '!'-prefix bypasses the fence (operator owns the claim); otherwise lint
function fenced(raw) {
  if (raw.startsWith("!")) {
    const text = raw.slice(1);
    console.log("  ================ FENCE OVERRIDDEN — GOING ON AIR ================");
    console.log("  " + text);
    console.log("  You own this claim; it must have a committed receipt. Logged to runtime/fence_overrides.log");
    try { fs.appendFileSync(path.join(__dirname, "runtime", "fence_overrides.log"), JSON.stringify({ utc: new Date().toISOString(), text }) + "\n"); } catch (_) {}
    return { text, ok: true };
  }
  const m = FENCE.exec(raw);
  if (!m) return { text: raw, ok: true };
  console.log(`  CLAIM FENCE: "${m[0]}" — on-air text must not outrun the receipts (P1=PARTIAL, P2=PROVISIONAL).`);
  console.log(`  UNI demonstrates BEHAVIOUR / viability-learning, never experience. Reword, or prefix with ! only if this exact claim has a committed receipt.`);
  return { text: raw, ok: false };
}
// ---------------- show state ----------------
// WS1-H: BEATS live in viewer/runtime/beats.json (shared with command_center.cjs).
const BEATS_FILE = path.join(__dirname, "runtime", "beats.json");
const DEFAULT_BEATS = [["COLONY", 28], ["CAM_PIP", 18], ["PIP", 16], ["GLASS_OS", 20]];
function loadBeats() {
  try {
    const raw = JSON.parse(fs.readFileSync(BEATS_FILE, "utf8"));
    if (!Array.isArray(raw)) return DEFAULT_BEATS.slice();
    const clean = raw.filter((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && typeof r[1] === "number" && r[1] > 2)
                      .map(([s, t]) => [s.toUpperCase(), Math.round(t)]);
    return clean.length ? clean : DEFAULT_BEATS.slice();
  } catch (_) { return DEFAULT_BEATS.slice(); }
}
function saveBeats() { try { fs.writeFileSync(BEATS_FILE, JSON.stringify(BEATS)); } catch (_) {} }
let BEATS = loadBeats();
let autoTimer = null, prevScene = "COLONY", clipTimer = null, bridge = null;
// bridge.kill() would only kill the cmd.exe shim on Windows; taskkill /T reaps the erl.exe tree
function killBridge() {
  if (!bridge) return;
  try { spawn("taskkill", ["/pid", String(bridge.pid), "/T", "/F"], { stdio: "ignore" }); } catch (_) {}
  bridge = null;
}

async function currentScene() { return (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName; }
async function cutTo(name, silent) {
  const scenes = (await obs.req("GetSceneList")).data.scenes || [];
  const hit = scenes.find((s) => s.sceneName.toUpperCase() === name.toUpperCase());
  if (!hit) return console.log(`  no scene "${name}" — try: ` + scenes.map((s) => s.sceneName).reverse().join(" "));
  if (clipTimer && hit.sceneName !== "CLIP") { clearTimeout(clipTimer); clipTimer = null; } // manual cut disarms clip auto-return
  prevScene = await currentScene();
  const r = await obs.req("SetCurrentProgramScene", { sceneName: hit.sceneName });
  if (!silent) console.log(r.ok ? `  CUT -> ${hit.sceneName}` : `  ERR ${r.comment}`);
}
function stopAuto(say) { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; if (say) console.log("  auto rotation OFF"); } }
function autoStep(i) { const [sc, secs] = BEATS[i % BEATS.length]; cutTo(sc, false); autoTimer = setTimeout(() => autoStep(i + 1), secs * 1000); }

async function listProps(input, prop) {
  const r = await obs.req("GetInputPropertiesListPropertyItems", { inputName: input, propertyName: prop });
  return r.ok ? r.data.propertyItems || [] : [];
}
let winCache = [];
async function pick(list, arg) {
  const n = parseInt(arg, 10);
  if (!isNaN(n) && list[n]) return list[n];
  const q = arg.toLowerCase();
  return list.find((i) => (i.itemName || "").toLowerCase().includes(q));
}
const ytId = (u) => { const m = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})(?![\w-])/.exec(u) || /^([\w-]{11})$/.exec(u.trim()); return m ? m[1] : null; };

// ---------------- commands ----------------
const HELP = `
  TEMPLATES  scenes | live <name>            templates: see studio_stage.cjs / STUDIO_OPERATOR_MANUAL §4
             auto on|off | beats C:28,PIP:16 for the full role suite
  FEEDS      cams | cam <n|remote1|remote2>  local webcams AND the LAN cams from the other
                                             computer (remote cams: open the picker at https://${LAN_IP}:8443/ — handles /camN/whip)
             mics | mic <n>                  pick the local voice mic (remote cams carry their own)
             windows [filter]                list capturable windows
             share1|share2|share3 <n|text>   bind a window into a share slot
             web <url> | webprep <url>       navigate the WEB channel (+cut / no cut)
             clip <yt-url> [secs] | back     play a YouTube clip in CLIP, auto-return after secs
  OVERLAYS   lt <kicker>|<title>|<sub>       lower-third (claim-fenced)
             ticker <a> | <b> | <c>          ticker items (claim-fenced)
             caption <text> | caption off    caption band
             onair on|off                    ON-AIR pill
             feed uni on|off                 DEPRECATED: spawns the RETIRED runs/broadcast_bridge.exs
                                             (SP.Show.OverlayPublisher already mirrors narration)
  SOUND      music <0-100|on|off>            music bed level / mute
  SHOW       status | shot | golive CONFIRM | offair CONFIRM | quit
             golive = System-1 DEV preview only — worldwide go-live is System 2 start_broadcast
`;

async function handle(line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(" ").trim();
  if (!cmd) return;
  switch (cmd.toLowerCase()) {
    case "help": console.log(HELP); break;
    case "scenes": {
      const r = await obs.req("GetSceneList");
      console.log("  program: " + r.data.currentProgramSceneName);
      console.log("  " + (r.data.scenes || []).map((s) => s.sceneName).reverse().join("  "));
      break;
    }
    case "live": case "cut": stopAuto(true); await cutTo(arg); break;
    case "auto":
      if (arg === "on") { stopAuto(); console.log("  auto rotation ON: " + BEATS.map(([s, t]) => `${s}:${t}`).join(" ")); autoStep(0); }
      else stopAuto(true);
      break;
    case "beats": {
      const b = arg.split(",").map((p) => p.trim().split(":")).filter((p) => p.length === 2).map(([s, t]) => [s.toUpperCase(), parseInt(t, 10)]).filter(([, t]) => t > 2);
      if (b.length) { BEATS = b; saveBeats(); console.log("  beats = " + BEATS.map(([s, t]) => `${s}:${t}`).join(" ")); } else console.log("  usage: beats COLONY:28,PIP:16,CAM_PIP:20");
      break;
    }
    case "cams": {
      console.log("  DEPRECATED here: cameras are ROLE-based now (stage v2). Use the COMMAND CENTER");
      console.log("  (http://127.0.0.1:8098) Camera roles panel — this console no longer touches cams/mutes.");
      break;
    }
    case "cam": {
      // stage v2 is ROLE-based; this console must never fight the command center's mute matrix
      console.log("  DEPRECATED here: use the COMMAND CENTER (http://127.0.0.1:8098) Camera roles + Voice panels.");
      break;
    }
    case "mics": {
      (await listProps("MicHost", "device_id")).forEach((i, n) => console.log(`  [${n}] ${i.itemName}`));
      break;
    }
    case "mic": {
      const it = await pick(await listProps("MicHost", "device_id"), arg);
      if (!it) return console.log("  no match — `mics` to list");
      const r = await obs.req("SetInputSettings", { inputName: "MicHost", inputSettings: { device_id: it.itemValue }, overlay: true });
      console.log(r.ok ? `  mic -> ${it.itemName}` : "  ERR " + r.comment);
      break;
    }
    case "windows": {
      winCache = await listProps("cap_share1", "window");
      const q = arg.toLowerCase();
      winCache.forEach((i, n) => { if (!q || (i.itemName || "").toLowerCase().includes(q)) console.log(`  [${n}] ${i.itemName}`); });
      break;
    }
    case "share1": case "share2": case "share3": {
      if (!winCache.length) winCache = await listProps("cap_share1", "window");
      const it = await pick(winCache, arg);
      if (!it) return console.log("  no match — `windows` to list");
      const r = await obs.req("SetInputSettings", { inputName: "cap_" + cmd.toLowerCase(), inputSettings: { window: it.itemValue }, overlay: true });
      console.log(r.ok ? `  ${cmd} -> ${it.itemName}` : "  ERR " + r.comment);
      break;
    }
    case "web": case "webprep": {
      if (!/^https?:\/\//i.test(arg)) return console.log("  usage: web <https://...>");
      // cap_web is an OBS browser source (per WS1) — navigate directly, no Chrome window.
      const r = await obs.req("SetInputSettings", { inputName: "cap_web", inputSettings: { url: arg }, overlay: true });
      if (!r.ok) return console.log("  ERR " + r.comment);
      console.log("  WEB channel -> " + arg);
      if (cmd.toLowerCase() === "web") { stopAuto(true); await cutTo("WEB"); }
      break;
    }
    case "clip": {
      const parts = arg.split(/\s+/); const url = parts[0] || ""; const secs = parseInt(parts[1], 10);
      const id = ytId(url);
      if (!id && !/^https?:\/\//i.test(url)) return console.log("  usage: clip <youtube-url-or-id> [secs]");
      // full watch URLs pass through RAW (autoplay flag is on) — the escape hatch for embed-refusing
      // videos; everything else plays via the local clip.html wrapper (a real embedding origin —
      // top-level embed loads die with YouTube Error 153). cap_clip is an OBS browser source
      // (reroute_audio:true) so we navigate via SetInputSettings, no Chrome window.
      const isWatch = /youtube\.com\/watch\?/i.test(url);
      const target = isWatch ? url : (id ? `http://127.0.0.1:8099/clip.html?v=${id}` : url);
      const r = await obs.req("SetInputSettings", { inputName: "cap_clip", inputSettings: { url: target }, overlay: true });
      if (!r.ok) return console.log("  ERR " + r.comment);
      stopAuto(true);
      await cutTo("CLIP");
      if (clipTimer) clearTimeout(clipTimer);
      if (secs > 2) { clipTimer = setTimeout(async () => { if ((await currentScene()) === "CLIP") { console.log(""); await cutTo(prevScene || "COLONY"); rl.prompt(); } }, secs * 1000); console.log(`  auto-return in ${secs}s (or type \`back\`)`); }
      else console.log("  type `back` to return");
      if (!isWatch) console.log("  (if the clip refuses embedding, retry with the full watch URL: clip https://www.youtube.com/watch?v=" + (id || "<id>") + " — it passes through raw, autoplay is on)");
      break;
    }
    case "back": if (clipTimer) clearTimeout(clipTimer); await cutTo(prevScene || "COLONY"); break;
    case "lt": {
      const f = fenced(arg);
      if (!f.ok) return;
      const [k = "", t = "", s = ""] = f.text.split("|").map((x) => x.trim());
      writeState((st) => { st.lowerThird = { visible: !!(k || t || s), kicker: k, title: t, subtitle: s, tone: "ok" }; });
      console.log("  lower-third set");
      break;
    }
    case "ticker": {
      const f = fenced(arg);
      if (!f.ok) return;
      const items = f.text.split("|").map((x) => x.trim()).filter(Boolean);
      if (!items.length) return console.log("  usage: ticker first item | second | third");
      writeState((st) => { st.ticker = items.map((text) => ({ text, tone: "ok" })); });
      console.log(`  ticker set (${items.length} items)`);
      break;
    }
    case "caption": {
      if (arg === "off") { writeState((st) => { st.caption = { visible: false, lang: "en", text: "" }; }); return console.log("  caption off"); }
      const f = fenced(arg);
      if (!f.ok) return;
      writeState((st) => { st.caption = { visible: true, lang: "en", text: f.text }; });
      console.log("  caption set");
      break;
    }
    case "onair":
      writeState((st) => { st.onAir = { value: arg === "on", text: "LIVE" }; });
      console.log("  onAir " + (arg === "on" ? "ON" : "off"));
      break;
    case "feed":
      if (rest[0] === "uni" && rest[1] === "on") {
        if (bridge) return console.log("  bridge already running");
        const sname = "bridge" + (Date.now() % 100000); // unique: a stale zombie can never block a fresh start
        bridge = spawn("cmd", ["/c", "elixir", "--sname", sname, "--cookie", "sp", "runs\\broadcast_bridge.exs"], { cwd: REPO, stdio: "ignore" });
        bridge.on("exit", (c) => { console.log(`  [uni feed bridge exited ${c}]`); bridge = null; });
        console.log("  UNI narration feed ON (SP.Producer lines -> ticker/caption, ~2s cadence)");
      } else if (rest[0] === "uni") {
        killBridge();
        console.log("  UNI narration feed OFF (ticker/caption stay as last written — override with `ticker`/`caption`)");
      } else console.log("  usage: feed uni on|off");
      break;
    case "music": {
      if (arg === "off") { await obs.req("SetInputMute", { inputName: "ShowMusic", inputMuted: true }); return console.log("  music muted"); }
      if (arg === "on") { await obs.req("SetInputMute", { inputName: "ShowMusic", inputMuted: false }); return console.log("  music on"); }
      const n = parseInt(arg, 10);
      if (isNaN(n) || n < 0 || n > 100) return console.log("  usage: music <0-100|on|off>");
      await obs.req("SetInputMute", { inputName: "ShowMusic", inputMuted: false });
      // percent -> dB bed range: 0 -> -60dB (inaudible), 50 -> -15dB (stage default-ish), 100 -> 0dB
      const db = n === 0 ? -60 : -30 + 0.3 * n;
      const r = await obs.req("SetInputVolume", { inputName: "ShowMusic", inputVolumeDb: db });
      console.log(r.ok ? `  music ${n}% (${db.toFixed(1)} dB)` : "  ERR " + r.comment);
      break;
    }
    case "status": {
      const st = await obs.req("GetStreamStatus");
      const sc = await currentScene();
      console.log(`  program: ${sc}   auto: ${autoTimer ? "ON" : "off"}   uni-feed: ${bridge ? "ON" : "off"}`);
      console.log(`  stream: active=${st.data.outputActive} congestion=${st.data.outputCongestion} skipped=${st.data.outputSkippedFrames}/${st.data.outputTotalFrames} ${st.data.outputTimecode || ""}`);
      const paths = await httpJson(9997, "/v3/paths/list");
      if (paths && paths.items) paths.items.forEach((p) => console.log(`  restream: path=${p.name} ready=${p.ready} readers=${(p.readers || []).length} (need 1 per platform)`));
      else console.log("  restream: mediamtx API not reachable (run viewer\\restream.ps1)");
      break;
    }
    case "shot": {
      const sc = arg || (await currentScene());
      const r = await obs.req("GetSourceScreenshot", { sourceName: sc, imageFormat: "png", imageWidth: 1280, imageHeight: 720 });
      if (!r.ok) return console.log("  ERR " + r.comment);
      const out = path.join(__dirname, "studio_check.png");
      fs.writeFileSync(out, Buffer.from(r.data.imageData.split(",")[1], "base64"));
      console.log("  " + out);
      break;
    }
    case "golive": {
      // F31 (Phase 9 step 3.3). `arg !== "CONFIRM"` was a STRING COMPARISON ON ARGV -- one word
      // any script can supply. The typed word is kept because it stops a slip of the hand, and it
      // is now the SECOND condition, not the only one.
      if (arg !== "CONFIRM") return console.log("  OUTWARD CUT IS HUMAN-TRIGGERED (G-PA). Type exactly: golive CONFIRM");
      try {
        golive_guard.requireHumanOrThrow("studio.cjs golive");
      } catch (e) {
        console.log("  REFUSED (F31): " + e.message);
        return console.log("  " + (e.refusal && e.refusal.remedy || ""));
      }
      const paths = await httpJson(9997, "/v3/paths/list");
      if (!paths) return console.log("  restreamer not up — run viewer\\restream.ps1 (keys from env, never disk) and retry");
      await obs.req("SetStreamServiceSettings", { streamServiceType: "rtmp_custom", streamServiceSettings: { server: "rtmp://127.0.0.1:1935", key: "uni", use_auth: false } });
      const r = await obs.req("StartStream");
      console.log(r.ok ? "  StartStream sent -> local restreamer" : "  ERR " + r.comment);
      if (!r.ok) return console.log("  NOT flipping the on-air pill — stream did not start.");
      writeState((st) => { st.onAir = { value: true, text: "LIVE" }; });
      await sleep(12000);
      const p2 = await httpJson(9997, "/v3/paths/list");
      if (p2 && p2.items) p2.items.forEach((p) => console.log(`  path=${p.name} ready=${p.ready} readers=${(p.readers || []).length} (YouTube + Twitch => 2)`));
      console.log("  VERIFY VISUALLY on both platform dashboards before announcing.");
      break;
    }
    case "offair": {
      if (arg !== "CONFIRM") return console.log("  type exactly: offair CONFIRM");
      const r = await obs.req("StopStream");
      writeState((st) => { st.onAir = { value: false, text: "LIVE" }; });
      console.log(r.ok ? "  stream stopped, on-air pill off" : "  StopStream ERR " + r.comment + " — pill off anyway; verify OBS manually");
      break;
    }
    case "quit": case "exit": stopAuto(); killBridge(); process.exit(0);
    default: console.log("  ? " + cmd + "   (`help` for commands)");
  }
}

// ---------------- boot ----------------
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "studio> " });
obs.connect();
(async () => {
  console.log("UNI STUDIO CONSOLE — the show runs itself inside this operator-opened session.");
  console.log("CLAIM FENCE: on-air text describes behaviour/viability-learning only; P1=PARTIAL, P2=PROVISIONAL.");
  console.log("             No headline outruns its committed receipt. `help` for commands.\n");
  // honest reset: never resurrect a previous session's captions/ticker as fresh
  writeState((st) => {
    st.caption = { visible: false, lang: "en", text: "" };
    st.onAir = { value: false, text: "LIVE" };
    st.lowerThird = { visible: true, kicker: "UNI COLONY — LIVE EXPERIMENT", title: "Active-inference agents in a real Minecraft world", subtitle: "This demonstrates behaviour and viability-learning — never experience or consciousness", tone: "ok" };
    st.ticker = [
      { text: "UNI = categorical active-inference agents (pure Elixir), embodied as bots on a live Minecraft server", tone: "ok" },
      { text: "Science ledger: P1 novelty drive = PARTIAL · P2 metabolism = PROVISIONAL — no stronger claim is made", tone: "warn" },
      { text: "Claim fence: passing a behavioural gate demonstrates the named behaviour, never experience", tone: "ok" },
      { text: "Built in public — receipts beat rhetoric", tone: "accent" },
    ];
  });
  for (let i = 0; i < 20 && !obs.connected; i++) await sleep(250);
  if (obs.connected) {
    await obs.req("SetCurrentSceneTransition", { transitionName: "Fade" });
    await obs.req("SetCurrentSceneTransitionDuration", { transitionDuration: 400 });
    const cs = await obs.req("GetInputSettings", { inputName: "CamHost" });
    if (cs.ok && !(cs.data.inputSettings || {}).video_device_id) {
      const cams = await listProps("CamHost", "video_device_id");
      if (cams.length) { await obs.req("SetInputSettings", { inputName: "CamHost", inputSettings: { video_device_id: cams[0].itemValue, active: true }, overlay: true }); console.log("  cam auto-bound -> " + cams[0].itemName + "   (`cams` to switch)"); }
    }
  }
  rl.prompt();
})();
rl.on("line", async (l) => { try { await handle(l); } catch (e) { console.log("  ERR " + (e.message || e)); } rl.prompt(); });
rl.on("close", () => { stopAuto(); killBridge(); process.exit(0); });