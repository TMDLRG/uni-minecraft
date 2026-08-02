// command_center.cjs — THE VISUAL COMMAND CENTER (http://127.0.0.1:8098). One person runs the
// whole broadcast from here; the "broadcast engineer" functions are automated:
//
//  · 33 templates (viewer/runtime/templates.json, built by studio_stage.cjs) with REAL live
//    thumbnails: a background sweeper walks OBS's studio-mode PREVIEW (invisible to the
//    audience) so every template's thumbnail is an actual rendered frame, refreshed ~1/min,
//    program refreshed every cycle. Click = preview, TAKE = program, double-click = hot cut.
//  · CAMERA ROLES like a real switcher: A(host)/B(guest)/C(PC cam) map to any camera; a role
//    change updates every template that uses it, live. PC camera NEVER carries audio; a
//    template whose only camera is the PC cam auto-mutes voice (owner rule).
//  · Feeds: web URLs (CDP), YouTube clips incl. re-airing our own videos (local embed wrapper,
//    favorites+recents), window shares, music bed, UNI-narration ticker feed.
//  · Claim-fenced on-screen text; CONFIRM-gated GO LIVE / OFF AIR (G-PA — outward cut is human).
//  · HEALTH board with one-click fixes + one-button PREFLIGHT (all checks + every template
//    rendered and verified non-blank) => GO / NO-GO.
//  · Air truth: OFF / REHEARSAL / LIVE STREAMING / LIVE LIVE recomputed each second from real
//    OBS state; streamed to the lab glass badge (STALE on feed death, never a false OFF AIR).
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { OBSClient, SUB } = require("./lib/obs_client.cjs");
const golive_guard = require("./golive_guard.cjs");   // F31: the one chokepoint to air
const epStore = require("./endpoints_store.cjs");
const pinStore = require("./pin_store.cjs");

const PORT = 8098;
const RUNTIME = path.join(__dirname, "runtime");
const SPOOL = path.join(RUNTIME, "broadcast.json");
const FAVS = path.join(RUNTIME, "clip_favorites.json");
const RECENT = path.join(RUNTIME, "clip_recent.json");
const MANIFEST = path.join(RUNTIME, "templates.json");
const ROLES_FILE = path.join(RUNTIME, "roles.json"); // persist role assignments across restarts/rebuilds
// LAN_IP was hardcoded "10.190.245.196" until 2026-07-16 (sweep #13). Now derived from the
// `thinker` box in viewer/infra_registry.json. Thinker is static (not DHCP) so a declared literal
// there is honest — but it must be declared ONCE, in ONE place, not scattered across files. If a
// current network interface matches one of thinker's declared ips, that WINS (it means the machine
// is actually reachable on that address right now). Provenance is exposed in /api/state so a stale
// value can be caught. If both fail we fall back to the last-known literal — the CC must start
// even on a network hiccup, but it must SAY that it did so.
const hosts = require("./host_resolve.cjs");
const REG = require("./infra_registry.json");
const os = require("os");
const { lanIp: LAN_IP, provenance: LAN_IP_PROVENANCE } = (function() {
  const t = (REG.boxes || []).find((b) => b.name === "thinker");
  const declared = (t && t.ips) || [];
  const currentAddrs = new Set(
    Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i.address)
  );
  const live = declared.find((ip) => currentAddrs.has(ip));
  if (live) { console.log(`LAN_IP -> ${live} (declared in infra_registry.boxes.thinker AND currently bound on this machine)`); return { lanIp: live, provenance: "registry+live-nic" }; }
  if (declared[0]) { console.log(`LAN_IP -> ${declared[0]} (declared in infra_registry.boxes.thinker; not currently bound — network may be reconfiguring)`); return { lanIp: declared[0], provenance: "registry-declared-not-bound" }; }
  // Last resort: the registry is broken AND no NIC matched. Return the NAME, not a frozen literal —
  // Node resolves thinker.uni-lab.local via the uni-lab zone, so even this degraded path follows the
  // lease rather than pinning an address that cannot. Provenance says plainly that we are here.
  console.log("WARN LAN_IP fallback thinker.uni-lab.local — no thinker declaration and no matching NIC found");
  return { lanIp: "thinker.uni-lab.local", provenance: "fallback-name-no-registry-no-nic" };
})();
// The chip, BY NAME. Its LAN address is a DHCP lease (it moved .122 -> .121 on 2026-07-16) so it can
// never be a literal here; the plane-forced LAN name is the durable handle. ssh/getaddrinfo resolve it
// via the NRPT rule -> uni-dns on the chip. COLONY_HOST env stays the DNS-independent override.
const CHIP_SSH_HOST = process.env.COLONY_HOST || "uni-lab-lan.uni-lab.local";
const CAMS = ["CamHost", ...Array.from({ length: 10 }, (_, i) => "RemoteCam" + (i + 1))];
const VOICE_SOURCES = ["MicHost", ...Array.from({ length: 10 }, (_, i) => "RemoteCam" + (i + 1))];
const GATEWAY = { host: "127.0.0.1", port: 8095 }; // publisher.cjs registrations (which slots are live)
// THE COLONY HOST = UNI-LAB, "the chip" (ADR-PROD-013): the colony (Minecraft/Phoenix/bodies) runs there,
// rootless — never on this studio box. The colony health/PREFLIGHT probes below target it over the LAN.
// Plane-forced LAN name per the NO-IP law (zone + producer record fixed 2026-07-15); env overrides.
const COLONY_HOST = process.env.COLONY_HOST || "uni-lab-lan.uni-lab.local";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, dflt) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (_) { return dflt; } };

// ---- multi-endpoint fan-out (up to 20 targets). Keys are decrypted into memory only on unlock,
// never written to disk, never logged; one respawning `ffmpeg -c copy` per enabled endpoint. ----
let epMem = null;       // { pass, endpoints:[{id,name,url,key,enabled}] } after unlock; null = locked
let fanoutProcs = [];   // [{ name, proc, stop }]
function stopFanout() {
  for (const f of fanoutProcs) { f.stop = true; try { f.proc && f.proc.kill("SIGKILL"); } catch (_) {} }
  fanoutProcs = [];
}
// 2026-07-16 sweep D4b: ARM used to answer {ok:true, count:2} without ever establishing that the
// thing it arms EXISTS. If ffmpeg is not on PATH, ARM still went green, the panel still lit
// "FAN-OUT ON", and the operator learned the truth from a dark platform. Prove the tool runs BEFORE
// claiming to have armed anything — a pre-flight, not a post-mortem.
function ffmpegRunnable() {
  try {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore", timeout: 8000 });
    if (r.error) return { ok: false, err: r.error.code || String(r.error.message || r.error) };
    if (r.status !== 0) return { ok: false, err: "ffmpeg -version exited " + r.status };
    return { ok: true };
  } catch (e) { return { ok: false, err: String(e.message || e) }; }
}
function startFanout() {
  stopFanout();
  if (!epMem) return { ok: false, err: "endpoints locked — unlock with your passphrase first" };
  const ff = ffmpegRunnable();
  if (!ff.ok) return { ok: false, err: "NOT ARMED: ffmpeg is not runnable from this process (" + ff.err + "). Nothing would push. Install ffmpeg / put it on PATH, then arm again." };
  const on = (epMem.endpoints || []).filter((e) => e.enabled && e.url && e.key);
  // 2026-07-17 (88-agent HUD sweep, defect #7): this used to fall through and return
  // {ok:true, count:0} — HTTP 200, no error, the widget's error branch never fires, the button
  // re-enables, and the operator is left believing they armed something. endpoints_store.load()
  // returns {endpoints:[]} for a MISSING file rather than throwing, so "no store at all" took this
  // exact path. ARM must refuse to succeed at nothing, the same way the ffmpeg pre-flight above does.
  if (on.length === 0) {
    const total = (epMem.endpoints || []).length;
    return { ok: false, err: total === 0
      ? "NOT ARMED: there are no saved endpoints — nothing would push. Add your YouTube/Twitch keys in the console (Streaming Endpoints), then arm."
      : `NOT ARMED: ${total} endpoint(s) saved but none is enabled WITH a key — nothing would push. Enable one and give it a key, then arm.` };
  }
  for (const ep of on) {
    const target = String(ep.url).trim() + String(ep.key).trim(); // key in argv only, never logged
    // 2026-07-16 (sweep F1/#22): track respawns + lastExitAt so /api/health can show a per-endpoint
    // row with respawn count. A respawning-every-3s pusher is the signature of a rejected key.
    // `exits` is a RING of recent exit timestamps, not a lifetime counter (2026-07-16 sweep D8):
    // a lifetime average has a monotonically-growing denominator, so a key revoked at hour 3 reads
    // "stable" for ~22 minutes of dead air while the rate dilutes. Health must be judged on a
    // TRAILING WINDOW — a run getting longer must not make an alarm quieter.
    const rec = { name: ep.name || "endpoint", proc: null, stop: false, respawns: -1, lastExitAt: null,
                  startedAt: new Date().toISOString(), platform: derivePlatform(ep.url),
                  exits: [], spawnFailed: null };
    const spawnOne = () => {
      rec.respawns++;
      // 2026-07-18: stderr was `stdio:"ignore"` — that blinds the operator to WHY a pusher fails
      // (auth rejected, wrong keyframe interval, YouTube "no active event", etc.). Now piped through
      // an aggressive redactor to logs/fanout_stderr.log: any full rtmp:// URL is truncated at the
      // stream path, any run of >=12 alnum/dash chars is masked, so a leaked key line is a no-op.
      const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "info", "-i", "rtmp://127.0.0.1:1935/uni", "-c", "copy", "-f", "flv", target], { stdio: ["ignore", "ignore", "pipe"] });
      const logPath = path.join(__dirname, "..", "logs", "fanout_stderr.log");
      try { fs.mkdirSync(path.dirname(logPath), { recursive: true }); } catch (_) {}
      let buf = "";
      const redact = (s) => s
        .replace(/rtmp:\/\/[^\s'"]+/g, (u) => { const m = u.match(/^(rtmp:\/\/[^/]+\/[^/]+\/)/); return (m ? m[1] : "rtmp://") + "<REDACTED>"; })
        .replace(/[A-Za-z0-9_-]{12,}/g, "<REDACTED>");
      p.stderr && p.stderr.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        let idx; while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (!line.trim()) continue;
          try { fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${rec.name}/${rec.platform}] ${redact(line)}\n`); } catch (_) {}
        }
      });
      rec.proc = p;
      const respawn = () => { if (!rec.stop) setTimeout(() => { if (!rec.stop) spawnOne(); }, 3000); };
      p.on("exit", () => {
        rec.lastExitAt = new Date().toISOString();
        rec.exits.push(Date.now());
        if (rec.exits.length > 40) rec.exits.shift();
        rec.spawnFailed = null;          // it started at least; whatever killed it was not a spawn failure
        respawn();
      });
      // 2026-07-16 sweep D4: this was `p.on("error", () => {})` — a silent swallow. Node fires
      // 'error' (NOT 'exit') when the binary cannot be spawned at all, so a missing/renamed ffmpeg
      // meant: no respawn was ever scheduled (the timer hung off the exit path only), respawns
      // stayed 0 forever, the flap detector could never fire, and the health row read a confident
      // green "pushing (0 respawn(s), stable)" with no process behind it. A supervisor that can die
      // without saying so is not a supervisor. Record it, surface it RED, and keep retrying.
      p.on("error", (e) => {
        rec.spawnFailed = e && (e.code || String(e.message || e));
        rec.lastExitAt = new Date().toISOString();
        rec.exits.push(Date.now());
        if (rec.exits.length > 40) rec.exits.shift();
        respawn();
      });
    };
    spawnOne();
    fanoutProcs.push(rec);
  }
  return { ok: true, count: on.length };
}
// The ONE liveness rollup over the fan-out, so ARMED/aliveCount/the egress floor never disagree.
// 2026-07-17 (gates armed-count-is-live-pushers + egress-armed-floor-always-on):
//   armed      = INTENT — how many endpoints we started pushing (records). Correct denominator for
//                the egress floor: an endpoint that SHOULD be receiving but isn't is a real failure,
//                so a spawn-failed/dead pusher must still count toward "how many readers we expect".
//   aliveCount = FUNCTION — pushers actually running right now (the D3 predicate: exitCode/signalCode
//                null and no spawn failure). A corpse never inflates this.
// The two are deliberately separate: "ARMED (2)" that is really 2 corpses is the exact lie B8 fixes.
function fanoutLiveness() {
  const armed = fanoutProcs.length;
  const aliveCount = fanoutProcs.filter(
    (rec) => rec.proc && rec.proc.exitCode === null && rec.proc.signalCode === null && !rec.spawnFailed
  ).length;
  return { armed, aliveCount };
}
function derivePlatform(u) {
  const s = String(u || "").toLowerCase();
  if (s.includes("youtube")) return "YouTube";
  if (s.includes("twitch")) return "Twitch";
  if (s.includes("facebook")) return "Facebook";
  if (s.includes("kick")) return "Kick";
  return "custom";
}
function manifest() {
  return readJson(MANIFEST, { groups: [{ name: "ALL", scenes: ["COLONY"] }], roles: { ROLE_A: "RemoteCam1", ROLE_B: "RemoteCam2", ROLE_C: "CamHost" } });
}
function allTemplates() { return manifest().groups.flatMap((g) => g.scenes); }

// ---------------- obs client (shared OBSClient: per-request timeout, event dispatch,
// re-Identify on reconnect). We subscribe to the low-volume default plus a couple of
// event categories the air-state event mirror (WS1-C) will consume.
const OBS_SUBS = SUB.All | SUB.InputActiveStateChanged; // meters bit is added by WS2-F
const obs = new OBSClient({
  url: "ws://127.0.0.1:4455",
  prefix: "cc",
  subscriptions: OBS_SUBS,
  onConnected: () => { console.log("[obs connected]"); return onConnected(); },
  // L2: mark the mirror unhydrated the instant the socket drops, so airState() returns null
  // (=> STALE) during the reconnect gap instead of serving the pre-drop scene's stale data.
  onDisconnected: () => { console.log("[obs disconnected — retrying]"); if (typeof mirror === "object") mirror.hydrated = false; },
});
let roles = { A: "RemoteCam1", B: "RemoteCam2", C: "CamHost" };
let mirrorWired = false;
async function onConnected() {
  await obs.req("SetStudioModeEnabled", { studioModeEnabled: true });
  await obs.req("SetCurrentSceneTransition", { transitionName: "Fade" });
  await obs.req("SetCurrentSceneTransitionDuration", { transitionDuration: 400 });
  // resync role assignments from OBS truth
  for (const r of ["A", "B", "C"]) {
    const items = (await obs.req("GetSceneItemList", { sceneName: "ROLE_" + r })).data.sceneItems || [];
    const on = items.find((i) => i.sceneItemEnabled && CAMS.includes(i.sourceName));
    if (on) roles[r] = on.sourceName;
  }
  // persistence: a stage rebuild resets role scenes to defaults — restore the operator's last
  // saved assignment on top so a rebuild/restart doesn't lose their camera setup.
  const saved = readJson(ROLES_FILE, null);
  if (saved) for (const r of ["A", "B", "C"]) {
    if (saved[r] && CAMS.includes(saved[r]) && saved[r] !== roles[r]) await setRole(r, saved[r]);
  }
  // event mirror (WS1-C): hydrate the in-process state that airState() reads. Wire event
  // handlers ONCE across reconnects (obs.on registers per-instance; re-wiring would multiply).
  if (!mirrorWired) { wireMirrorEvents(); mirrorWired = true; }
  await hydrateMirror();
}

// ---------------- HTTP (MediaMTX API + publisher registrations) ----------------
function httpJson(port, p) {
  return new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port, path: p, timeout: 3000 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(JSON.parse(b || "null")); } catch (_) { resolve(null); } });
    });
    r.on("error", () => resolve(null)); r.on("timeout", () => { r.destroy(); resolve(null); }); r.end();
  });
}
// P6.11: POST helper for the /api/cue → publisher.cjs :8095/cue forward
function httpPostJson(port, p, obj) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(obj || {}));
    const r = http.request({ host: "127.0.0.1", port, path: p, method: "POST", timeout: 3000, headers: { "Content-Type": "application/json", "Content-Length": body.length } }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(b || "null") }); } catch (_) { resolve({ status: res.statusCode, body: null }); } });
    });
    r.on("error", () => resolve({ status: 0, body: null })); r.on("timeout", () => { r.destroy(); resolve({ status: 0, body: null }); });
    r.end(body);
  });
}

// ---------------- spool (overlay state) ----------------
function readState() {
  try { return JSON.parse(fs.readFileSync(SPOOL, "utf8")); }
  catch (e) {
    if (e.code === "ENOENT") return {};
    // CORRUPT content (torn write -- e.g. the 2026-07-15 power-cut left null bytes in broadcast.json)
    // must RECOVER by rewriting a fresh spool, not deadlock: the old `return null` made writeState bail
    // (line below), so the corrupt file blocked its own 3s-heartbeat repair -> overlays permanently
    // UNVERIFIED -> no go-live. A SyntaxError is garbage content; recover. A real I/O error (transient
    // lock) still returns null so we skip this tick and never clobber good data.
    if (e instanceof SyntaxError) return {};
    return null;
  }
}
// Synchronous sleep (Atomics.wait on a throwaway SAB) — lets the atomic-rename retry below back off
// a few ms so another process's brief open handle on broadcast.json can close.
const _sleepSAB = new Int32Array(new SharedArrayBuffer(4));
function sleepSyncMs(ms) { try { Atomics.wait(_sleepSAB, 0, 0, ms); } catch (_) {} }
// HONESTY FIX 2026-07-16 (sweep C1). The health board's "overlays fresh" row was trivially always
// green because THIS process heartbeats the spool every 3s (line ~200 below), so `updatedUtc` was
// always <15s old regardless of whether real overlay state moved. A stalled Phoenix publisher —
// exactly the class we need to catch in a 4-hour run — was invisible. Fix: split the timestamps.
//   updatedUtc          — total-freshness clock (any write). Kept for compat with other consumers.
//   updatedUtcSelf      — this CC process's last write (heartbeat OR real).
//   updatedUtcExternal  — the last write that MODIFIED anything other than the heartbeat itself.
// The overlay-freshness gate reads External. A CC heartbeat cannot lie for it.
function writeState(mut, opts) {
  const st = readState();
  if (st === null) return;
  const before = JSON.stringify(st);
  mut(st);
  const now = new Date().toISOString();
  st.updatedUtc = now;
  st.updatedUtcSelf = now;
  const externallyChanged = !opts || opts.source !== "cc-heartbeat";
  if (externallyChanged && JSON.stringify(st) !== before) st.updatedUtcExternal = now;
  const data = JSON.stringify(st, null, 2);
  const tmp = SPOOL + ".cc.tmp";
  fs.writeFileSync(tmp, data);
  // Atomic rename. On Windows the rename OVER broadcast.json can transiently fail EPERM/EACCES/EBUSY
  // because another process holds it open (Phoenix's SP.Show.OverlayPublisher writes it; overlay_server
  // reads it). Retry with a short backoff; if it still won't rename, fall back to an in-place overwrite.
  // writeState MUST NOT throw on a transient lock -- a cosmetic lower-third write was aborting the whole
  // BROADCAST TEST (EPERM at broadcast.json rename, observed 2026-07-12). (fix 2026-07-12)
  for (let i = 0; i < 10; i++) {
    try { fs.renameSync(tmp, SPOOL); return; }
    catch (e) {
      if (e.code !== "EPERM" && e.code !== "EACCES" && e.code !== "EBUSY") throw e;
      sleepSyncMs(15);
    }
  }
  // Fallback: in-place overwrite (no rename), then best-effort remove the temp.
  try { fs.writeFileSync(SPOOL, data); } catch (_) { /* next 3s tick retries; never throw */ }
  try { fs.unlinkSync(tmp); } catch (_) {}
}
// Heartbeat marks itself so writeState() doesn't count it as an external change (see 2026-07-16
// honesty fix in writeState).
setInterval(() => { try { writeState(() => {}, { source: "cc-heartbeat" }); } catch (_) {} }, 3000).unref();

const FENCE = /\b(prov(e[sd]?|en|ing)|proof|conscious\w*|sentien\w*|self.?aware\w*|aware(ness)?|alive|living|life.?form\w*|digital\s+life|new\s+life|experienc\w*|feel(s|ings?)?|felt|suffer\w*|first.?ever|world.?s?.?first|breakthrough|agi|human.?level)\b/i;
function fenceCheck(text, force) {
  const m = FENCE.exec(text);
  if (!m) return { ok: true };
  if (force) {
    try { fs.appendFileSync(path.join(RUNTIME, "fence_overrides.log"), JSON.stringify({ utc: new Date().toISOString(), text }) + "\n"); } catch (_) {}
    return { ok: true, forced: true };
  }
  return { ok: false, word: m[0] };
}

// ---------------- show state ----------------
// WS1-H: BEATS live in viewer/runtime/beats.json so command_center.cjs and studio.cjs share a
// single truth. Fallback list if the file is missing/malformed keeps behaviour stable.
const BEATS_FILE = path.join(RUNTIME, "beats.json");
const DEFAULT_BEATS = [["COLONY", 28], ["CAM_PIP", 18], ["PIP", 16], ["GLASS_OS", 20]];
function loadBeats() {
  const raw = readJson(BEATS_FILE, null);
  if (!Array.isArray(raw)) return DEFAULT_BEATS.slice();
  const clean = raw.filter((r) => Array.isArray(r) && r.length === 2 && typeof r[0] === "string" && typeof r[1] === "number" && r[1] > 2)
                    .map(([s, t]) => [s.toUpperCase(), Math.round(t)]);
  return clean.length ? clean : DEFAULT_BEATS.slice();
}
function saveBeats() { try { fs.writeFileSync(BEATS_FILE, JSON.stringify(BEATS)); } catch (_) {} }
let BEATS = loadBeats();
let autoTimer = null, prevScene = "COLONY", clipTimer = null, voice = "RemoteCam1", bridge = null;
let lastProgram = "";
// WS1-L idle mode: when the studio is halted + not streaming + no operator interaction for 15
// minutes, drop into "idle" -- pause the safety thumbnail sweep, and tell the publisher gateway
// to keep all remote sources at the idle profile until an operator POST wakes the studio.
let idleMode = false;
let lastMutation = Date.now();
function killBridge() {
  if (!bridge) return;
  try { spawn("taskkill", ["/pid", String(bridge.pid), "/T", "/F"], { stdio: "ignore" }); } catch (_) {}
  bridge = null;
}
process.on("exit", killBridge);
function stopAuto() { if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; } }
const TRANSIENT = new Set(["CLIP", "CLIP_HOST", "CLIP_SIDE", "CLIP_PIP", "WEB", "WEB_HOST", "WEB_SIDE"]); // never a BACK target
// Scenes whose chrome IS the content — a generic lower-third from a previous segment must not
// ride over them. (Found live 2026-07-16: the first MUSIC_HOUR frame aired a stale colony strap
// "Active-inference agents in a real Minecraft world" over the music card, because the spool's
// lowerThird persists across cuts and nothing cleared it.)
// MUSIC_CARD is included even though it KEEPS ovl_lower3rd: its strap is for a PRESENTER the
// operator introduces, not for whatever segment happened to run before. Clearing on cut means a
// blank strap (which renders nothing — lower-third.html hides on !visible), and the operator sets
// a fresh one. That is strictly better than airing last segment's sentence over a music card.
const SELF_CHROMED = new Set(["MUSIC_HOUR", "MUSIC_CARD", "COLONY_SIDE_MUSIC", "STANDBY", "STANDBY_OFFLINE", "BARS_TONE"]);
async function cutProgram(scene) {
  if (clipTimer && scene !== "CLIP" && scene !== "CLIP_HOST") { clearTimeout(clipTimer); clipTimer = null; }
  const cur = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName;
  if (cur && !TRANSIENT.has(cur)) prevScene = cur; // clip->clip must not make BACK a no-op
  // Clear a stale lower-third when cutting to a self-chromed scene. The operator's strap is for
  // the segment they wrote it for; carrying it onto a music card is a lie about what's on screen.
  if (SELF_CHROMED.has(scene)) {
    try { writeState((st) => { if (st.lowerThird && st.lowerThird.visible) st.lowerThird = { visible: false, kicker: "", title: "", subtitle: "", tone: "ok" }; }); } catch (_) {}
  }
  return obs.req("SetCurrentProgramScene", { sceneName: scene });
}
function autoStep(i) {
  const [sc] = BEATS[i % BEATS.length];
  cutProgram(sc);
  // .unref(): a running auto rotation should not keep the process alive at shutdown.
  autoTimer = setTimeout(() => autoStep(i + 1), BEATS[i % BEATS.length][1] * 1000);
  autoTimer.unref();
}

async function setRole(role, source) {
  if (!["A", "B", "C"].includes(role) || !CAMS.includes(source)) return { ok: false, err: "role A|B|C, source CamHost|RemoteCam1|RemoteCam2" };
  const items = (await obs.req("GetSceneItemList", { sceneName: "ROLE_" + role })).data.sceneItems || [];
  for (const i of items) {
    if (!CAMS.includes(i.sourceName)) continue;
    await obs.req("SetSceneItemEnabled", { sceneName: "ROLE_" + role, sceneItemId: i.sceneItemId, sceneItemEnabled: i.sourceName === source });
  }
  roles[role] = source;
  try { fs.writeFileSync(ROLES_FILE, JSON.stringify(roles)); } catch (_) {} // persist across restarts
  await enforcePcCamRule();
  return { ok: true };
}
async function setVoice(v) {
  // v ∈ "mute" | "MicHost" | "RemoteCam1" .. "RemoteCam10"
  // Extended (WS1-D): the voice picker now covers all 10 slots. A remote cam's mic is
  // only audible in the mixer when its source is ACTIVE in the program scene AND unmuted —
  // WS1-D also extended VOICE_ANCHORS in studio_stage.cjs so every talk template keeps
  // ALL 10 remote cams active off-screen, so the mute matrix is the single audio truth.
  voice = v;
  const promises = [obs.req("SetInputMute", { inputName: "MicHost", inputMuted: v !== "MicHost" })];
  for (let i = 1; i <= 10; i++) {
    const name = "RemoteCam" + i;
    promises.push(obs.req("SetInputMute", { inputName: name, inputMuted: v !== name }));
  }
  await Promise.all(promises);
}
// which cameras are actually visible on the program scene (resolving roles)?
async function programCams(prog) {
  const items = (await obs.req("GetSceneItemList", { sceneName: prog })).data.sceneItems || [];
  const cams = new Set();
  for (const i of items) {
    if (!i.sceneItemEnabled) continue;
    if (CAMS.includes(i.sourceName)) cams.add(i.sourceName);
    const rm = /^ROLE_([ABC])$/.exec(i.sourceName);
    if (rm) cams.add(roles[rm[1]]);
  }
  return cams;
}
// owner rule: when the PC camera is the ONLY camera live, voice goes MUTE automatically
async function enforcePcCamRule() {
  const prog = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName;
  if (!prog) return;
  const cams = await programCams(prog);
  if (cams.size === 1 && cams.has("CamHost") && voice !== "mute") {
    await setVoice("mute");
    console.log("[rule] PC camera is the only camera on program — voice muted");
  }
}

// ---------------- OBS event mirror (WS1-C) ----------------
// Instead of firing 15 GetX requests every time airState() is called (~20/s across UI +
// glass pusher + health checks), we hydrate an in-process mirror once at connect and keep it
// live via op:5 events. airState() then reads the mirror synchronously. Stream stats
// (congestion / skipped / timecode) are NOT eventified in obs-websocket v5, so a 1 Hz
// GetStreamStatus refresh keeps those fresh; everything else follows events.
const mirror = {
  hydrated: false,
  program: null,                             // current program scene name
  streaming: false,                          // stream output active
  streamStats: { congestion: 0, skipped: 0, frames: 0, timecode: "" },
  sceneItems: new Map(),                     // sceneName -> [{ id, sourceName, enabled }]
  audioMute: new Map(),                      // inputName -> bool (true = muted)
  audioActive: new Map(),                    // inputName -> bool (videoActive for non-mic)
};

async function hydrateSceneItems(sceneName) {
  if (!sceneName) return;
  const r = await obs.req("GetSceneItemList", { sceneName });
  if (!r.ok) return;
  const items = (r.data.sceneItems || []).map((i) => ({ id: i.sceneItemId, sourceName: i.sourceName, enabled: !!i.sceneItemEnabled }));
  mirror.sceneItems.set(sceneName, items);
}
async function hydrateMirror() {
  const [sr, pr] = await Promise.all([obs.req("GetStreamStatus"), obs.req("GetCurrentProgramScene")]);
  if (sr.ok) {
    mirror.streaming = !!sr.data.outputActive;
    mirror.streamStats = {
      congestion: sr.data.outputCongestion || 0,
      skipped: sr.data.outputSkippedFrames || 0,
      frames: sr.data.outputTotalFrames || 0,
      timecode: sr.data.outputTimecode || "",
    };
  }
  if (pr.ok) mirror.program = pr.data.currentProgramSceneName || null;
  await hydrateSceneItems(mirror.program);
  // audio state for every VOICE_SOURCE (11 sources). One request pair per source; runs once.
  await Promise.all(VOICE_SOURCES.map(async (src) => {
    const muteR = await obs.req("GetInputMute", { inputName: src });
    if (muteR.ok) mirror.audioMute.set(src, !!muteR.data.inputMuted);
    if (src !== "MicHost") {
      const actR = await obs.req("GetSourceActive", { sourceName: src });
      if (actR.ok) mirror.audioActive.set(src, !!actR.data.videoActive);
    }
  }));
  mirror.hydrated = true;
}
function wireMirrorEvents() {
  obs.on("CurrentProgramSceneChanged", async (d) => {
    const scene = d.sceneName || null;
    if (!scene) return;
    // H2: hydrate the NEW scene's items BEFORE flipping mirror.program to it. Otherwise airState()
    // (which reads synchronously) could see the new program with an empty items list during the
    // GetSceneItemList await and report STREAMING instead of LIVE_LIVE for one beat. By hydrating
    // first, the worst case is ~20ms where airState still reports the OLD (valid, hydrated) scene.
    if (!mirror.sceneItems.has(scene)) await hydrateSceneItems(scene);
    mirror.program = scene;
    // PC-cam-only rule + thumbnail refresh (replaces the old 1 s program-change poll)
    if (scene !== lastProgram) { lastProgram = scene; enforcePcCamRule(); grabThumb(scene); }
  });
  obs.on("SceneItemEnableStateChanged", (d) => {
    const arr = mirror.sceneItems.get(d.sceneName);
    if (!arr) return;
    const it = arr.find((i) => i.id === d.sceneItemId);
    if (it) it.enabled = !!d.sceneItemEnabled;
  });
  obs.on("InputMuteStateChanged", (d) => {
    mirror.audioMute.set(d.inputName, !!d.inputMuted);
  });
  obs.on("InputActiveStateChanged", (d) => {
    mirror.audioActive.set(d.inputName, !!d.videoActive);
  });
  obs.on("StreamStateChanged", (d) => {
    mirror.streaming = !!d.outputActive;
  });
}
// 1 Hz refresh of the stream-stats fields the event bus doesn't cover (congestion, skipped,
// timecode). Also picks up outputActive so a torn/reconnected socket resyncs quickly.
setInterval(async () => {
  if (!obs.connected) return;
  const sr = await obs.req("GetStreamStatus");
  if (!sr.ok) return;
  mirror.streaming = !!sr.data.outputActive;
  mirror.streamStats = {
    congestion: sr.data.outputCongestion || 0,
    skipped: sr.data.outputSkippedFrames || 0,
    frames: sr.data.outputTotalFrames || 0,
    timecode: sr.data.outputTimecode || "",
  };
  // H2 self-heal: if the current program's items never hydrated (a CurrentProgramSceneChanged
  // whose GetSceneItemList hiccuped), airState() reports STALE. Re-hydrate here within 1s so a
  // transient OBS failure can't leave the badge stuck STALE while parked on that scene.
  if (mirror.program && !mirror.sceneItems.has(mirror.program)) await hydrateSceneItems(mirror.program);
}, 1000).unref();

// airState() reads the mirror synchronously. Returns null when the mirror hasn't hydrated
// (fresh boot / mid-reconnect): callers must treat null as unknown — the glass pusher SKIPS
// the push (badge goes honestly STALE), never fabricates OFF. Keeping it async so existing
// `await airState()` callers stay the same.
async function airState() {
  if (!obs.connected || !mirror.hydrated) return null;
  const prog = mirror.program;
  if (!prog) return null;
  // H2: if the current program's items aren't in the mirror yet, we do NOT know what's visible —
  // return null (=> STALE) rather than computing visible=false (which would fabricate STREAMING
  // instead of LIVE_LIVE, or OFF instead of REHEARSAL). The 1 Hz self-heal above re-hydrates it.
  const items = mirror.sceneItems.get(prog);
  if (!items) return null;
  const cams = new Set();
  for (const i of items) {
    if (!i.enabled) continue;
    if (CAMS.includes(i.sourceName)) cams.add(i.sourceName);
    const rm = /^ROLE_([ABC])$/.exec(i.sourceName);
    if (rm) cams.add(roles[rm[1]]);
  }
  const visible = cams.size > 0;
  let audible = false;
  for (const src of VOICE_SOURCES) {
    // MicHost has no video; its liveness is "present + enabled in the program scene".
    const active = src === "MicHost"
      ? items.some((i) => i.sourceName === "MicHost" && i.enabled)
      : !!mirror.audioActive.get(src);
    if (!active) continue;
    if (mirror.audioMute.get(src) === false) { audible = true; break; }
  }
  // ══ 2026-07-17 (88-agent HUD sweep, blocker #1) — THE HERO BADGE MEASURED THE WRONG THING ══════
  // `visible` counts CAMS only — human cameras. But the FLAGSHIP shot is
  // `COLONY: [["cap_colony", chromeFull], ["ShowMusic"]]`, whose own description reads "the hero
  // shot. No camera." So the whole colony broadcast computed visible=false, audible=false =>
  // level "STREAMING" => the widget painted the 32pt badge GREEN (Ok #2ECC71) and left it there,
  // BYTE-IDENTICAL whether the world was rendering or the browser source had died to black. The
  // badge carried ZERO picture information for the show we actually broadcast.
  //
  // Worse, on a CAMERA show the mapping inverted under failure: healthy => LIVE_LIVE => "Bad" red
  // (correct TALLY convention, red = on air), then the camera collapses => visible flips false =>
  // "STREAMING" => Ok GREEN. The tally went OUT and the badge turned GREEN at the exact moment the
  // picture was lost. Green is the reassuring colour; it arrived when the world went black.
  //
  // THE TRAP (this cost three tries in the stage-3 sweep, and the audit warned about it again):
  // "ovl_* is not picture" is WRONG. `STANDBY: [["ovl_standby", F]]` and
  // `MUSIC_HOUR: [..., ["ovl_music_hero", F], ...]` — the slate and the full-screen music card ARE
  // ovl_ sources and ARE the picture. Classifying them as non-content would fire the alarm through
  // every standby and the entire music segment: an alarm that is always on is not an alarm.
  //
  // THE HONEST LINE is studio_stage.cjs's OWN construction rule (:325-330): each scene DECLARES its
  // content, then CHROME is appended to every scene afterward. Chrome is a closed, known set. So:
  // content = enabled program sources MINUS chrome MINUS audio-only. That mirrors the source of
  // truth instead of pattern-matching a prefix that means two different things.
  //
  // FENCE — say this exactly: this is SOURCE-ENABLEMENT, not pixels. `pictureOnProgram` means "a
  // picture-bearing source is enabled on program", NOT "there is a picture". A cap_colony that is
  // enabled but rendering black still reads true. The studio DOES own a real pixel classifier
  // (probeRenderFrac / RENDER_MIN_FRAC, :642) and it is NOT wired here — a GetSourceScreenshot on
  // every 3s air tick is a cost that needs its own measurement first. Until it is, "there is a
  // picture" stays NOT VERIFIED on this surface, and no string here may claim it.
  const CHROME = new Set([
    "ovl_watermark", "ovl_musicbug", "ovl_nowplaying", "ovl_lower3rd", "ovl_caption", "ovl_ticker",
    "ovl_onair",                                   // OVERLAY_STACK + MUSIC_CHROME (studio_stage.cjs:310,324)
    ...Array.from({ length: 10 }, (_, i) => "voice" + (i + 1)),   // VOICE_ANCHORS (:172)
  ]);
  const AUDIO_ONLY = new Set(["MicHost", "ShowMusic", "ShowRadio"]);   // no video track at all
  const pictureSources = [];
  for (const i of items) {
    if (!i.enabled) continue;
    const n = i.sourceName;
    if (CHROME.has(n) || AUDIO_ONLY.has(n)) continue;
    pictureSources.push(n);
  }
  const pictureOnProgram = pictureSources.length > 0;
  const streaming = mirror.streaming;
  // ONLY the STREAMING branch changes. The first cut of this fix keyed BOTH branches off picture,
  // and the live surface caught it within a minute: idle OBS sits on the STANDBY slate, the slate
  // IS a picture, so `pictureOnProgram` was true and the badge read amber REHEARSAL forever. That
  // drains REHEARSAL of the meaning it has always had — "talent is live, we are not broadcasting" —
  // and paints a caution colour on an idle studio permanently. An amber that is always on is not a
  // caution. So:
  //   streaming  -> turns on PICTURE   (the defect being fixed: a dark push must not read green)
  //   !streaming -> turns on PEOPLE    (unchanged: REHEARSAL means humans up, air down)
  const level = streaming
    ? (pictureOnProgram ? "LIVE_LIVE" : "STREAMING_DARK")
    : ((visible || audible) ? "REHEARSAL" : "OFF");
  const st = mirror.streamStats;
  return { streaming, visible, audible, level, program: prog,
    pictureOnProgram, pictureSources,
    pictureNote: pictureOnProgram
      ? `${pictureSources.length} picture source(s) enabled on program: ${pictureSources.join(", ")} — source-enablement, NOT a pixel measurement`
      : "NO picture-bearing source is enabled on program — only chrome/audio. If we are streaming, the world is seeing black.",
    congestion: st.congestion, skipped: st.skipped, frames: st.frames, timecode: st.timecode };
}

// PC-camera device list — enumerating DirectShow every /api/state tick stutters on Windows
// boxes with many capture devices. Cache 30 s; expose via /api/devices.
let _devicesCache = { at: 0, val: [] };
async function pcCamDevices() {
  if (Date.now() - _devicesCache.at < 30000) return _devicesCache.val;
  if (!obs.connected) return [];
  const r = await obs.req("GetInputPropertiesListPropertyItems", { inputName: "CamHost", propertyName: "video_device_id" });
  const list = r.ok ? (r.data.propertyItems || []).map((c) => ({ name: c.itemName, value: c.itemValue })) : [];
  _devicesCache = { at: Date.now(), val: list };
  return list;
}

// ---------------- thumbnails + HONEST rendering signal + the live-feel cadence ---------------------
// CADENCE CONTRACT (superseded by cure 2, 2026-07-15 -- a GetSourceScreenshot is an offscreen render +
// base64 decode, so cost is bounded by capturing ONE scene at a time and only while a console watches):
//   * every OTHER grid card = a reference still, refreshed on demand / on program-change / by the
//     20-min safety sweep. NEVER fast-poll all cards (the perf floor -- that is the falsifier below).
//   * armed PREVIEW = a live loop at ~3fps (PREVIEW_FPS), captured server-side by grabbing ONLY
//     operatorPreview, and ONLY while lastLiveViewerAt is fresh (a console is polling /api/thumb).
//   * clicked tile = the client fast-polls that ONE tile's /api/thumb for ~5s (a live loop on click).
//   * PROGRAM = the 30s heartbeat re-verifies the ONE on-air scene (keeps the honest signal fresh).
//   * FREEZE-ON-AIR: when the armed scene == program, the 3fps loop skips it (the program heartbeat
//     owns it) and the preview monitor holds its last snap -- a live preview of an on-air scene is
//     redundant (§1.3). The true-30fps view stays OBS's own projector window (the flyout, untouched).
// HONESTY (self-net 2026-07-15, cure 1) -- every thumb carries two orthogonal, true-by-frame signals
// the console must never collapse into one green "LIVE":
//   registered — a source/slot exists (heartbeat / codec present). May be true while the frame is black.
//   rendering  — the CAMERA REGION of a recent GetSourceScreenshot is actually non-black, measured by
//                PIXELS (cure 3, 2026-07-15). ONLY `rendering` may read "LIVE"/"attached (video)".
//                registered && !rendering reads "NO SIGNAL (black)", never LIVE.
// WHY PIXELS, NOT BYTES (cure 3): byte-count was a LIE. A solid-black 720p JPEG is ~15KB, and a
// lower-third overlay over a BLACK camera pushes ANY byte threshold over -- exactly the 2026-07-15
// defect where COLONY read "live 3fps" while its world was pure black behind the overlay. The honest
// test grabs a tiny UNCOMPRESSED bmp and measures the non-black fraction of the CAMERA region (the top
// of the frame; the lower-third/ticker/bug overlays sit in the excluded bottom band). Calibrated live:
// dead camera (CAM_A / stopped media) = 0.00; live world (COLONY) = 0.99; world+panel (COLONY_SIDE) = 0.46.
const RENDER_FRESH_MS = 45000;       // a cached rendering bit only counts as "live" within this window
const RENDER_MIN_FRAC = 0.12;        // >=12% of the camera region non-black = a real rendered frame
// SLATE floor (2026-07-16). RENDER_MIN_FRAC is calibrated ON CAMERA/WORLD content (see the note
// above: dead cam 0.00, live world 0.99, world+panel 0.46). A SLATE is not camera content: STANDBY
// is "an honest 'please stand by' slate" (studio_stage.cjs:244) — intentionally dark, and it
// measured 1.3% in the 2026-07-16 rehearsal. Judging it by the camera bar called a correctly-
// rendering slate a BLACK FRAME. For a slate the honest question is only "is it pure black, or is
// the slate actually up?" — so it gets its own, much lower floor.
const SLATE_MIN_FRAC = 0.005;
// STANDBY_OFFLINE added 2026-07-16 — caught by the broadcast test itself. It is the SAME
// ovl_standby slate as STANDBY (just with the local file bed instead of the music service), so it
// renders the same ~1.3% and was being failed as a BLACK/STUCK FRAME by the camera-calibrated
// floor. Any scene whose visual is the standby slate belongs here. The test found my own bug —
// that is exactly what it is for.
const SLATE_SCENES = new Set(["STANDBY", "STANDBY_OFFLINE"]);
const RENDER_BOTTOM_EXCLUDE = 0.25;  // ignore the bottom 25% (lower-third/ticker/bug overlay band)
const RENDER_LUM_THRESH = 24;        // per-pixel luminance above this counts as non-black
const thumbs = {}; // scene -> {img, at, bytes, rendering, frac}
// Parse a tiny uncompressed BMP (no deps) and return the non-black fraction over the camera region.
function bmpNonblackFrac(buf) {
  if (!buf || buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) return null; // "BM"
  const dataOff = buf.readUInt32LE(10), w = buf.readInt32LE(18);
  let h = buf.readInt32LE(22); const bpp = buf.readUInt16LE(28);
  const bottomUp = h > 0; h = Math.abs(h); const bpB = bpp / 8;
  const rowSize = Math.floor((bpp * w + 31) / 32) * 4; // rows padded to 4 bytes
  const yTop = Math.floor(h * (1 - RENDER_BOTTOM_EXCLUDE)); // image rows [0..yTop) = camera region (top)
  let sampled = 0, nonblack = 0;
  for (let y = 0; y < yTop; y++) {
    const sr = bottomUp ? (h - 1 - y) : y, base = dataOff + sr * rowSize;
    for (let x = 0; x < w; x++) {
      const p = base + x * bpB;
      const lum = 0.299 * buf[p + 2] + 0.587 * buf[p + 1] + 0.114 * buf[p];
      sampled++; if (lum > RENDER_LUM_THRESH) nonblack++;
    }
  }
  return sampled ? nonblack / sampled : 0;
}
// Which of a scene's CONTENT inputs are actually present/loaded? (2026-07-16)
// "Content" = a camera, or a browser source with a real URL. Backgrounds, mics, and overlays are
// not content — a scene of nothing-but-background is still a black show.
// THE POINT: a scene that renders black because its input ISN'T THERE is not a black-frame defect.
// The 2026-07-16 rehearsal proved why this matters — a first cut of the sweep failed 4 scenes and
// ALL FOUR were false positives:
//   - WEB/CLIP  : `chVid("about:blank")` — they park on about:blank until the operator NAVIGATES
//                 them to a page/clip (studio_stage.cjs:90-91). Unloaded, not broken.
//   - TRIO      : counted CamHost as live because a DirectShow DEVICE ENUMERATED. Device exists
//                 != device is feeding a picture. Never infer liveness from enumeration.
//   - STANDBY   : judged a dark slate by the camera floor (see SLATE_MIN_FRAC).
// A window_capture IS treated as present-by-assumption on purpose: that is precisely the WGC
// black-stick this sweep exists to catch (COLONY/OVERLOOK), so it must NOT get an excuse.
async function sceneContent(scene, liveCamSrc) {
  const items = (await obs.req("GetSceneItemList", { sceneName: scene })).data?.sceneItems || [];
  const absent = [], present = [];
  for (const i of items) {
    if (!i.sceneItemEnabled) continue;
    let src = i.sourceName;
    const rm = /^ROLE_([ABC])$/.exec(src);
    if (rm) src = roles[rm[1]];
    // CAMERAS are content.
    if (CAMS.includes(src)) { (liveCamSrc.has(src) ? present : absent).push(src); continue; }
    // ONLY `cap_*` sources are content. The studio's naming convention is load-bearing here:
    //   cap_*  = the picture (colony, overlook, glass, web, clip, share)
    //   ovl_*  = overlays (watermark/lower3rd/ticker/onair/caption)  -> NOT content
    //   bg_*   = backgrounds                                          -> NOT content
    //   Mic*/ShowMusic = audio                                        -> NOT content
    // Counting overlays as content was a real bug (2026-07-16 rehearsal #2): ovl_watermark rides
    // EVERY scene at a real URL, so every scene had a "present" input, nothing could ever be
    // excused, and 17 scenes failed. A frame of nothing-but-watermark is still a black show.
    if (!/^cap_/.test(i.sourceName)) continue;
    const s = await obs.req("GetInputSettings", { inputName: i.sourceName });
    if (!s.ok) continue;
    const kind = s.data.inputKind, set = s.data.inputSettings || {};
    if (kind === "browser_source") {
      const url = String(set.url || "");
      // WEB/CLIP park on about:blank until the operator navigates them (studio_stage.cjs:90-91).
      if (!url || /^about:blank/i.test(url)) absent.push(i.sourceName + " (about:blank, not navigated)");
      else present.push(i.sourceName);
    } else if (kind === "window_capture") {
      // cap_share1/2/3 are winCap("") — an EMPTY window spec, "bound live from the command center"
      // (:92). Unbound = nothing to capture = absent, not broken.
      const win = String(set.window || "");
      if (!win) absent.push(i.sourceName + " (no window bound)");
      else present.push(i.sourceName);
    }
  }
  return { absent, present };
}
async function probeRenderFrac(scene) {
  const r = await obs.req("GetSourceScreenshot", { sourceName: scene, imageFormat: "bmp", imageWidth: 160, imageHeight: 90, imageCompressionQuality: -1 });
  if (!r.ok) return null;
  return bmpNonblackFrac(Buffer.from(String(r.data.imageData).replace(/^data:image\/\w+;base64,/, ""), "base64"));
}
// The ONE per-scene picture verdict, shared by the broadcast test's SEEN sweep (inline) and
// /api/preflight (2026-07-17, gate preflight-picture-not-bytes). Given a scene's pixel `frac`
// (from probeRenderFrac; null = grab failed) and the set of live camera sources, classify honestly:
//   pass  -> genuinely rendered (non-black >= floor; slate scenes use the slate floor)
//   skip  -> black BUT a content input is legitimately absent (camera not publishing, browser on
//            about:blank, capture window unbound) — NOT a black-frame defect, says exactly what's missing
//   fail  -> black with EVERY content input present (the WGC/CEF black-stick that puts a black show on
//            air), or the grab failed (fail closed — "cannot verify" is never "fine")
// This is exactly stage 3's proven logic; extracting it kills the byte-count lie on the preflight route
// without re-deriving the absent-input rules that stopped stage 3's four false positives.
async function classifyScenePixels(scene, frac, liveCamSrc) {
  const floor = SLATE_SCENES.has(scene) ? SLATE_MIN_FRAC : RENDER_MIN_FRAC;
  const rendering = frac != null && frac >= floor;
  let content = { absent: [], present: [] };
  try { content = await sceneContent(scene, liveCamSrc); } catch (_) {}
  const slate = SLATE_SCENES.has(scene) ? ", slate" : "";
  if (rendering) return { status: "pass", frac, detail: `non-black ${(frac * 100).toFixed(1)}% (floor ${(floor * 100).toFixed(1)}%${slate})` };
  if (content.absent.length > 0) return { status: "skip", frac, detail: `not judged — content not connected: ${content.absent.join(", ")}${content.present.length ? ` (present: ${content.present.join(", ")})` : ""}` };
  if (frac == null) return { status: "fail", frac, detail: "NOT VERIFIED — screenshot grab failed, cannot prove a frame rendered" };
  return { status: "fail", frac, detail: `BLACK/STUCK FRAME — non-black ${(frac * 100).toFixed(1)}% < ${(floor * 100).toFixed(1)}% with EVERY content input present (${content.present.join(", ") || "none"})` };
}
let operatorPreview = "COLONY", preflightBusy = false;
// cure 2 (2026-07-15) -- the live-feel cadence, viewer-gated so it costs nothing when nobody is watching:
const PREVIEW_FPS = 3;                                        // armed-preview live-loop rate (operator spec)
const PREVIEW_INTERVAL_MS = Math.round(1000 / PREVIEW_FPS);  // ~333ms
const PREVIEW_VIEWER_WINDOW_MS = 10000;                      // run the loop only if a console hit /api/thumb <10s ago
let lastLiveViewerAt = 0;                                    // set on every /api/thumb hit == "a console is watching"
let previewLoopBusy = false;                                 // no-overlap guard (a grab may exceed the interval)

// ---------------- MUSIC + COLONY pollers 2026-07-16 ----------------
// The music service (viewer/infra_registry.services.music, ~5ms /healthz probe) exposes:
//   /api/nowplaying?session=<sid>  -> title/artist/album/artUrl/positionSec/durationSec/next/spotify/etc.
//   /api/telemetry                  -> activeListeners/uptimeSec/bitrateKbps/contractVersion
// The colony (uni-producer HEAD, :4200/producer/health) exposes:
//   driver/verdict/star/frame/tps/colony_count/last_action/director_up/producer_up/show_up
// Both are pulled every 5s into the spool (broadcast.json .nowPlaying / .colony) so overlays
// and the console UI can render them without hitting either upstream themselves. Poll cadence:
//   music     5s   — /api/nowplaying is cheap and the UI needs new-track detection quickly
//   colony    5s   — /producer/health is cheap and the frame counter is used for liveness
// The pollers are FIRE-AND-FORGET across CC restarts: they consume the resolved music/colony
// URLs from host_resolve at boot; if either name doesn't resolve, the spool sub-object records
// {err:"<reason>", updatedUtcExternal:null} so the UI can degrade honestly instead of blank.
const musicPoller = { url: null, err: null };
const colonyPoller = { url: null, err: null };
(async () => {
  const m = await hosts.urlFor("music", "/");
  if (m) { musicPoller.url = m.replace(/\/$/, ""); console.log(`music poller -> ${musicPoller.url}`); }
  else { musicPoller.err = "music.uni-lab.local did not resolve — poller idle, overlays will render 'unbound'"; console.log("WARN " + musicPoller.err); }
  const c = await hosts.urlFor("colony", "/");
  if (c) { colonyPoller.url = c.replace(/:\d+\/?$/, ":4200"); console.log(`colony poller -> ${colonyPoller.url}/producer/health`); }
  else { colonyPoller.err = "colony.uni-lab.local did not resolve — the /producer/health poller is idle"; console.log("WARN " + colonyPoller.err); }
})();
function httpGet(fullUrl, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const u = new URL(fullUrl);
      const req = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: timeoutMs || 5000 }, (res) => {
        let b = ""; res.on("data", (d) => (b += d));
        res.on("end", () => { try { resolve({ ok: res.statusCode < 400, status: res.statusCode, body: JSON.parse(b || "null") }); } catch (_) { resolve({ ok: false, status: res.statusCode, body: null }); } });
      });
      req.on("error", () => resolve({ ok: false, status: 0, body: null }));
      req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, body: null }); });
      req.end();
    } catch (_) { resolve({ ok: false, status: 0, body: null }); }
  });
}
async function pollMusic() {
  if (!musicPoller.url) return;
  const [np, tel] = await Promise.all([
    httpGet(musicPoller.url + "/api/nowplaying?session=obs-studio-thinker", 4000),
    httpGet(musicPoller.url + "/api/telemetry", 3000),
  ]);
  if (!np.ok || !np.body) {
    try { writeState((st) => { st.nowPlaying = Object.assign({}, st.nowPlaying || {}, { updatedUtcExternal: new Date().toISOString(), err: np.status ? `HTTP ${np.status}` : "unreachable" }); }); } catch (_) {}
    return;
  }
  // NO-SESSION (measured 2026-07-16): the service only reports a live position for a session that
  // has actually OPENED /radio?session=<id>. Until OBS's ShowRadio ffmpeg_source pulls the stream,
  // /api/nowplaying?session=obs-studio-thinker returns {status:"no-session", hint, reference:<track>}
  // — a FULL track object (album/title/artist/artUrl/store links/durationSec) for what the station
  // is playing right now, minus positionSec (there is no per-session clock yet).
  // Degrade honestly rather than writing a wall of nulls: surface the reference track, mark
  // sessionOpen:false, and leave positionSec null so the overlays draw NO progress bar (they must
  // not fake a playhead we do not have). When the stage is up and ShowRadio is pulling, the same
  // endpoint starts returning a real positionSec and sessionOpen flips true.
  const noSession = np.body && np.body.status === "no-session";
  // STUCK-TRACK GUARD (2026-07-18, live on-air defect): the music service was reporting Dead Faces
  // with positionSec=7307s while durationSec=94.9s — a track that ended 2 hours before. seq stayed 0
  // and never advanced although the underlying stream WAS rolling through the catalog (telemetry
  // topPlays counters incrementing). The card faithfully rendered the lie. Treat any session-open
  // response where positionSec runs > durationSec + 30s as an untrustworthy report and DEGRADE to the
  // same shape as no-session: surface a reference-track label (title/artist only) with positionSec
  // NULLED so no overlay draws a progress bar past the end. Fix the underlying service on the chip;
  // this is the studio's honesty guard so the overlay never renders a stale playhead.
  const rawPos = (np.body && typeof np.body.positionSec === "number") ? np.body.positionSec : null;
  const rawDur = (np.body && typeof np.body.durationSec === "number") ? np.body.durationSec : null;
  const stalePlayhead = !noSession && rawPos !== null && rawDur !== null && rawDur > 0 && rawPos > rawDur + 30;
  const b = (noSession || stalePlayhead) ? ((np.body && np.body.reference) || np.body || {}) : np.body;
  const telb = (tel && tel.ok && tel.body) || {};
  try {
    writeState((st) => {
      st.nowPlaying = {
        title: b.title || null, artist: b.artist || null, album: b.album || null,
        artUrl: b.artUrl ? (musicPoller.url + b.artUrl) : null,
        // In stalePlayhead we NULL positionSec on purpose so overlays don't render a progress bar.
        positionSec: (!stalePlayhead && typeof b.positionSec === "number") ? b.positionSec : null,
        durationSec: (typeof b.durationSec === "number") ? b.durationSec : null,
        next: b.next || null,
        spotifyUrl: b.spotifyUrl || null, amazonUrl: b.amazonUrl || null, youtubeUrl: b.youtubeUrl || null,
        lyricsUrl: b.lyricsUrl || null, lyricsDocUrl: b.lyricsDocUrl ? (musicPoller.url + b.lyricsDocUrl) : null,
        seq: b.seq || 0,
        listeners: telb.activeListeners || 0,
        uptimeSec: telb.uptimeSec || 0,
        bitrateKbps: telb.bitrateKbps || 0,
        contractVersion: telb.contractVersion || null,
        trackCount: telb.trackCount || null,
        // sessionOpen=false covers BOTH "service told us no-session" AND our staleness guard —
        // in both cases the overlays render as a reference-track label without a playhead.
        sessionOpen: !(noSession || stalePlayhead),
        source: musicPoller.url + (noSession
          ? " (reference — ShowRadio not pulling yet)"
          : stalePlayhead
            ? ` (STALE playhead: position=${rawPos.toFixed(0)}s > duration=${rawDur.toFixed(0)}s — service /api/nowplaying is stuck; showing reference only)`
            : " (session obs-studio-thinker)"),
        // Surface the stall so the operator/HUD can see WHY the card degraded, without lying about it.
        stalePlayhead: stalePlayhead,
        stalePlayheadDetail: stalePlayhead ? { positionSec: rawPos, durationSec: rawDur, ratio: rawDur > 0 ? (rawPos / rawDur) : null, note: "music service /api/nowplaying is not advancing; source-of-truth stream may still be rolling — check music service on the chip" } : null,
        updatedUtcExternal: new Date().toISOString(),
        err: null,
      };
    });
  } catch (_) {}
}
async function pollColony() {
  if (!colonyPoller.url) return;
  const r = await httpGet(colonyPoller.url + "/producer/health", 4000);
  const now = new Date().toISOString();
  if (!r.ok || !r.body) {
    try { writeState((st) => { st.colony = Object.assign({}, st.colony || {}, { updatedUtcExternal: now, err: r.status ? `HTTP ${r.status}` : "unreachable" }); }); } catch (_) {}
    return;
  }
  const c = r.body;
  try {
    writeState((st) => {
      st.colony = {
        driver: c.driver || null, verdict: c.verdict || null, star: c.star || null,
        frame: (typeof c.frame === "number") ? c.frame : null,
        colony_count: (typeof c.colony_count === "number") ? c.colony_count : null,
        tps: (c.tps && typeof c.tps.tps === "number") ? c.tps.tps : null,
        last_action: c.last_action || null,
        director_up: !!c.director_up, producer_up: !!c.producer_up, show_up: !!c.show_up, colony_up: !!c.colony_up,
        source: "producer.uni-lab.local:4200/producer/health",
        updatedUtcExternal: now, err: null,
      };
    });
  } catch (_) {}
}
setInterval(() => { pollMusic().catch(() => {}); }, 5000).unref();
setInterval(() => { pollColony().catch(() => {}); }, 5000).unref();
// Kick both once at startup so the spool has data within ~5s of CC boot (poll cadence starts after
// the first setInterval delay, so this bypasses the initial 5s of empty spool sub-objects).
setTimeout(() => { pollMusic().catch(() => {}); pollColony().catch(() => {}); }, 1500).unref();

// P4 (2026-07-12): broadcast test state (single run at a time; UI polls /api/broadcast_test).
let btBusy = false;
let btState = { running: false, private: true, startedAt: null, finishedAt: null, stages: [] };
function btEmit(stageNum, stageName, row) {
  let s = btState.stages.find((x) => x.stage === stageNum);
  if (!s) { s = { stage: stageNum, name: stageName, rows: [], verdict: null, startedAt: new Date().toISOString() }; btState.stages.push(s); }
  s.rows.push(Object.assign({ at: new Date().toISOString() }, row));
}
function btCloseStage(stageNum, verdict) {
  const s = btState.stages.find((x) => x.stage === stageNum);
  if (s) { s.verdict = verdict; s.finishedAt = new Date().toISOString(); }
}
async function runBroadcastTest(priv) {
  const t0 = Date.now();
  try {
    // Pre-test reality (the test runs ON THE AIR -- owner directive NEVER private): if OBS is already
    // streaming, the test MEASURES the live encoder rather than owning its lifecycle. Capture the live
    // program so STAGE 5 can restore it instead of parking to STANDBY / stopping the stream.
    const wasStreaming = mirror.streaming;
    const preProg = (await obs.req("GetCurrentProgramScene")).data?.currentProgramSceneName || null;
    const preTestProgram = (preProg && !TRANSIENT.has(preProg)) ? preProg : null;

    // --- STAGE 1: PREFLIGHT ---
    btEmit(1, "PREFLIGHT", { name: "start" });
    const checks = await healthChecks();
    let s1critical = true;
    for (const c of checks) {
      btEmit(1, "PREFLIGHT", { name: c.id, label: c.name, status: c.ok ? "pass" : "fail", detail: c.detail });
      if (!c.ok && ["obs","restreamer","phoenix"].includes(c.id)) s1critical = false;
    }
    btCloseStage(1, s1critical ? "PASS" : "FAIL");
    if (!s1critical) throw new Error("stage 1 hard fail (obs/restreamer/phoenix)");

    // --- STAGE 2: ENCODER ---
    btEmit(2, "ENCODER", { name: "start" });
    if (wasStreaming) {
      // ALREADY ON THE AIR: do NOT reconfigure or (re)start. OBS refuses SetStreamServiceSettings
      // "You cannot change stream service settings while streaming" and StartStream while output is
      // active -- that unconditional reconfigure is exactly what blocked the on-air test. Measure the
      // LIVE encoder instead (the poll loop below proves it regardless of who started it).
      btEmit(2, "ENCODER", { name: "already-on-air", status: "pass", detail: "OBS already STREAMING -- measuring the live encoder, not restarting it" });
    } else {
      // COLD path (no stream yet): point OBS at loopback MediaMTX and start it for the test.
      const setSvc = await obs.req("SetStreamServiceSettings", { streamServiceType: "rtmp_custom", streamServiceSettings: { server: "rtmp://127.0.0.1:1935", key: "uni", use_auth: false } });
      btEmit(2, "ENCODER", { name: "SetStreamServiceSettings", status: setSvc.ok ? "pass" : "fail", detail: setSvc.comment });
      const startR = await obs.req("StartStream");
      btEmit(2, "ENCODER", { name: "StartStream", status: startR.ok ? "pass" : "fail", detail: startR.comment });
      if (!startR.ok) { btCloseStage(2, "FAIL"); throw new Error("StartStream failed"); }
    }
    // Poll relay + OBS output status for up to 15s to see bytes climb + frames advance
    let ready = false, bytes0 = 0, bytes1 = 0, framesAdv = false;
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const paths = await httpJson(9997, "/v3/paths/list");
      const p = paths?.items?.find((x) => x.name === "uni");
      if (p?.ready) {
        if (!ready) { ready = true; bytes0 = p.bytesReceived || 0; btEmit(2, "ENCODER", { name: "relay.ready", status: "pass", detail: `bytes=${bytes0}` }); }
        bytes1 = p.bytesReceived || 0;
      }
      const st = (await obs.req("GetStreamStatus")).data || {};
      if (i === 6 || i === 14) btEmit(2, "ENCODER", { name: "obs.output", status: st.outputActive ? "pass" : "fail", detail: `frames=${st.outputTotalFrames} skipped=${st.outputSkippedFrames} bytes=${st.outputBytes}` });
      if (st.outputTotalFrames > 30) framesAdv = true;
      if (ready && bytes1 > bytes0 + 50000 && framesAdv) break;
    }
    const bytesClimbed = bytes1 > bytes0 + 50000;
    btEmit(2, "ENCODER", { name: "bytes.climbing", status: bytesClimbed ? "pass" : "fail", detail: `${bytes0}→${bytes1}` });
    btCloseStage(2, ready && bytesClimbed && framesAdv ? "PASS" : "FAIL");

    // --- STAGE 3: SEEN SWEEP on PROGRAM ---
    btEmit(3, "SEEN SWEEP", { name: "start" });
    stopAuto();
    // Bars+tone first if the scene exists (P5); otherwise skip gracefully
    const allScenes = (await obs.req("GetSceneList")).data?.scenes?.map((s) => s.sceneName) || [];
    const sequence = [];
    if (allScenes.includes("BARS_TONE")) sequence.push({ scene: "BARS_TONE", label: "SOUND CHECK", title: "SMPTE bars + 1kHz reference tone" });
    for (const scene of allTemplates()) sequence.push({ scene, label: "BROADCAST TEST", title: scene });
    // HONESTY FIX (2026-07-16) — this stage was BROKEN TWO WAYS AT ONCE, and it is the test's ONLY
    // picture stage, so both defects pointed the same way: green regardless of what went out.
    //
    // (1) THE VERDICT WAS HARDCODED: `btCloseStage(3, "PASS")`. The per-scene rows below already
    //     computed pass/fail — and the stage verdict THREW THEM AWAY. Every scene could render pure
    //     black and stage 3 still closed PASS, so btState.go (:626 requires every stage PASS) went
    //     true on a black show. A stage that cannot fail is not a test.
    // (2) IT COUNTED BYTES, NOT PIXELS: `bytes > 2600` on a 480x270 q55 JPEG. This is THE discredited
    //     check this project was burned by (operator, 2026-07-15: "you still prefer to not finish
    //     your work and lie about the outcome"). JPEG of a BLACK frame at this size clears 2600
    //     bytes easily — it measures that OBS answered, not that anything rendered.
    // The honest pixel classifier (probeRenderFrac/RENDER_MIN_FRAC, :455-482) already existed 90
    // lines up, tested and in use by the heartbeat — the test just never called it. It does now.
    // frac==null (grab failed) => NOT rendering (fail closed; can't verify is never "fine").
    // AN ABSENT INPUT IS NOT A BLACK-FRAME DEFECT. The sweep walks EVERY scene, and with no camera
    // publishing, CAM_A/CAM_B/GRID/TRIO/... are legitimately black — failing the stage on those would
    // replace "always PASS" with "always FAIL", which is exactly as useless. So classify honestly:
    //   - renders            -> pass
    //   - black, needs a camera that ISN'T publishing -> SKIP (input absent; says so, not a lie)
    //   - black, needs NO absent camera              -> FAIL  <- THE defect that matters: the
    //     WGC/CEF black-stick on COLONY/OVERLOOK/WEB/CLIP, the thing that puts a black show on air.
    //   - cut failed         -> FAIL always (we could not even get it on program)
    // Only PASS/FAIL bind the verdict; SKIP does not (same convention stage 4 already uses for
    // "publishers.enumerated"). A stage of all-SKIP is NOT a pass — it proved nothing.
    // liveCamSrc = slots with a FRESH publisher registration. CamHost is deliberately NOT added from
    // device enumeration: a DirectShow device existing does not mean it is feeding a picture (that
    // exact inference produced the TRIO false positive in the 2026-07-16 rehearsal). A CamHost scene
    // that really renders still PASSes below — `rendering` is checked before the absent test — so
    // omitting it costs nothing and removes a whole class of lie.
    const regs3 = (await httpJson(GATEWAY.port, "/registrations")) || {};
    const liveCamSrc = new Set(
      Object.entries(regs3)
        .filter(([, v]) => v && typeof v.ageMs === "number" && v.ageMs < 30000)
        .map(([k]) => "RemoteCam" + parseInt(String(k).replace("cam", ""), 10))
    );

    const seen = [];
    for (const step of sequence) {
      const cutR = await cutProgram(step.scene);
      writeState((st) => { st.lowerThird = { visible: true, kicker: step.label, title: step.title, subtitle: "", tone: "ok" }; });
      await sleep(6000);
      const frac = await probeRenderFrac(step.scene);                    // PIXEL truth
      const floor = SLATE_SCENES.has(step.scene) ? SLATE_MIN_FRAC : RENDER_MIN_FRAC;
      const rendering = frac != null && frac >= floor;
      const shot = await obs.req("GetSourceScreenshot", { sourceName: step.scene, imageFormat: "jpeg", imageWidth: 480, imageHeight: 270, imageCompressionQuality: 55 });

      // Are this scene's CONTENT inputs actually there? (camera publishing / browser navigated /
      // capture window bound)
      let content = { absent: [], present: [] };
      try { content = await sceneContent(step.scene, liveCamSrc); } catch (_) {}

      // WE ONLY JUDGE WHAT IS FULLY PRESENT. A scene missing ANY content input cannot be judged by
      // a full-frame floor: TEACH (8.3%) and ANCHOR (10.6%) in rehearsal #2 were scenes whose
      // colony rail rendered CORRECTLY while their hero camera + share slots were empty — the frame
      // is dim because the studio isn't wired for them, not because anything is stuck. Calling that
      // a BLACK FRAME is the same cry-wolf that makes an operator ignore the panel.
      // So: all content present -> we can judge (and a black frame here IS the WGC defect we hunt).
      //     any content absent  -> skip, and say exactly what is missing.
      //     no content at all (STANDBY) -> judge at the slate floor.
      const anyAbsent = content.absent.length > 0;

      let status, detail;
      if (!cutR.ok) { status = "fail"; detail = `CUT FAILED - could not put ${step.scene} on program: ${cutR.comment}`; }
      else if (rendering) { status = "pass"; detail = `non-black ${(frac * 100).toFixed(1)}% (floor ${(floor * 100).toFixed(1)}%${SLATE_SCENES.has(step.scene) ? ", slate" : ""})`; }
      else if (anyAbsent) { status = "skip"; detail = `not judged - content not connected: ${content.absent.join(", ")}${content.present.length ? ` (present: ${content.present.join(", ")})` : ""}`; }
      else if (frac == null) { status = "fail"; detail = "NOT VERIFIED - screenshot grab failed, cannot prove a frame rendered"; }
      else { status = "fail"; detail = `BLACK/STUCK FRAME - non-black ${(frac * 100).toFixed(1)}% < ${(floor * 100).toFixed(1)}% with EVERY content input present (${content.present.join(", ") || "none"}) - nothing explains this` ; }

      seen.push({ scene: step.scene, status });
      btEmit(3, "SEEN SWEEP", { name: step.scene, label: step.label, status, detail, thumb: shot.ok ? shot.data.imageData : null });
    }
    writeState((st) => { st.lowerThird = { visible: false, kicker: "", title: "", subtitle: "", tone: "ok" }; });
    // Verdict DERIVED from the rows just emitted — it cannot disagree with them. A sweep in which
    // nothing actually rendered is not a pass, however many rows were skipped.
    const seenFail = seen.filter((s) => s.status === "fail");
    const seenPass = seen.filter((s) => s.status === "pass");
    btEmit(3, "SEEN SWEEP", { name: "sweep.summary", status: seenFail.length === 0 && seenPass.length > 0 ? "pass" : "fail",
      detail: `${seenPass.length} rendered, ${seenFail.length} BLACK/failed, ${seen.length - seenPass.length - seenFail.length} skipped (camera absent)` });
    btCloseStage(3, seenFail.length === 0 && seenPass.length > 0 ? "PASS" : "FAIL");

    // --- STAGE 4: CAMERAS + FANOUT ---
    btEmit(4, "CAMERAS + FANOUT", { name: "start" });
    const regs = (await httpJson(GATEWAY.port, "/registrations")) || {};
    const liveCams = Object.entries(regs).filter(([, v]) => v && typeof v.ageMs === "number" && v.ageMs < 30000).map(([k]) => k);
    btEmit(4, "CAMERAS + FANOUT", { name: "publishers.enumerated", status: liveCams.length > 0 ? "pass" : "skip", detail: `slots: ${liveCams.join(", ") || "(none live)"}` });
    if (liveCams.length > 0) {
      const cutR = await cutProgram("CAM_A");
      btEmit(4, "CAMERAS + FANOUT", { name: "CAM_A", status: cutR.ok ? "pass" : "fail", detail: cutR.comment });
      for (const slot of liveCams) {
        const n = parseInt(slot.replace("cam", ""), 10);
        if (!(n >= 1 && n <= 10)) continue;
        const roleR = await setRole("A", "RemoteCam" + n);
        await sleep(4000);
        // Same byte-count -> pixel fix as stage 3: `bytes > 2600` proved OBS answered, not that the
        // camera rendered. A black CAM_A cleared it every time.
        // These rows only run for slots ALREADY enumerated as live (liveCams), so unlike stage 3
        // there is no absent-input case to excuse: a live publisher that renders black IS a defect.
        const camFrac = await probeRenderFrac("CAM_A");
        const camRendering = camFrac != null && camFrac >= RENDER_MIN_FRAC;
        const shot = await obs.req("GetSourceScreenshot", { sourceName: "CAM_A", imageFormat: "jpeg", imageWidth: 480, imageHeight: 270, imageCompressionQuality: 55 });
        btEmit(4, "CAMERAS + FANOUT", { name: "role_A=RemoteCam" + n, status: camRendering ? "pass" : "fail",
          detail: camFrac == null ? "NOT VERIFIED - grab failed" : `non-black ${(camFrac * 100).toFixed(1)}%${camRendering ? "" : " - BLACK despite a LIVE publisher on this slot"}`,
          thumb: shot.ok ? shot.data.imageData : null });
      }
    }
    // THE ONE WAY (owner directive 2026-07-14: NEVER private): the test always runs the live path -
    // OBS -> local MediaMTX :1935/uni -> the operator's fan-out (endpoints panel / restream.ps1) ->
    // the world. No re-point, no loopback-only mode. Public egress is MEASURED, not configured:
    // each ffmpeg pusher is a reader on the uni path. readers >= 1 while streaming = ON THE AIR.
    // HONESTY FIX (2026-07-16): this sampled readers ONCE and declared "PUBLIC EGRESS LIVE".
    // A rejected key (expired/revoked/wrong) produces the IDENTICAL single-sample PASS: the ffmpeg
    // pusher attaches as a reader, the platform refuses the push, ffmpeg dies, and the respawn loop
    // (:67) reattaches ~3s later. Sampling once lands on a reader that is mid-flap and reads it as
    // healthy. Two samples >=6s apart make a flapping pusher visible: a HEALTHY pusher holds its
    // reader continuously across both; a rejected one is unstable.
    // HONEST LIMIT, stated in the row itself: this measures the LOCAL MediaMTX reader count. It
    // proves an ffmpeg is copying the program OUT of this box. It does NOT and cannot prove that
    // YouTube/Twitch ACCEPTED it — nothing here reads the platform back. Never let this row be
    // read as "we are on the air"; confirm on the platform dashboard.
    const sampleReaders = async () => {
      const p = await httpJson(9997, "/v3/paths/list");
      const u = p?.items?.find((x) => x.name === "uni");
      return u ? (u.readers || []).length : 0;
    };
    const readers1 = await sampleReaders();
    await sleep(6000);
    const readers2 = await sampleReaders();
    const readers = Math.min(readers1, readers2);   // the count we HELD, not the peak we glimpsed
    // 2026-07-16 sweep D6: the bar was `readers >= 1` — which PASSES the realistic partial failure.
    // With 2 endpoints armed and ONE key bad, the healthy pusher pins readers to >=1 at both
    // samples, so the test went green with a platform dark. The honest bar is "every pusher we
    // ARMED is holding a reader". Guarded with max(1, …) because the restream.ps1 path arms via a
    // separate process where fanoutProcs is 0 — without the floor, stage 4 would become a
    // permanent PASS for that path (a worse lie than the one being fixed).
    const armedN = fanoutProcs.length;
    const want = Math.max(1, armedN);
    const stable = readers1 === readers2 && readers1 >= want;
    const pass = readers >= want && stable;
    btEmit(4, "CAMERAS + FANOUT", { name: "fanout.readers", status: pass ? "pass" : "fail",
      detail: readers1 === 0 && readers2 === 0
        ? (armedN > 0
            // 2026-07-16 sweep D7: this said "turn FAN-OUT ON" even when fan-out WAS on — sending
            // the operator to flip a switch that is already flipped, away from the real cause.
            ? `${armedN} pusher(s) ARMED but NO reader ever held the program across 6s — they are dying before they attach. Either the keys are rejected, or there is no program on :1935/uni. The per-endpoint rows on the Health board name which.`
            : "no readers on uni - turn FAN-OUT ON (endpoints panel) or run restream.ps1 with keys; the test is only accepted on the air")
        : !stable
          ? `UNSTABLE: readers ${readers1} -> ${readers2} across 6s (need ${want} held). A pusher is FLAPPING — see the per-endpoint rows on the Health board, which distinguish a rejected key from an absent program. Do NOT re-type keys until that row says the key is implicated.`
          : readers < want
            ? `PARTIAL: only ${readers} of ${armedN} armed pusher(s) held a reader — at least one platform is NOT receiving the program. The per-endpoint Health rows name which.`
            : `${readers}/${armedN} armed pusher(s) held the program for 6s. NOTE: this proves LOCAL egress only - it does NOT prove YouTube/Twitch accepted the push. Confirm on the platform dashboard.` });
    btCloseStage(4, pass ? "PASS" : "FAIL");

    // --- STAGE 5: PARK ---
    // HONESTY FIX (2026-07-16): stage 5's verdict was hardcoded `btCloseStage(5, "PASS")` — the
    // same defect as stage 3. Note the restore path below even emitted status:"pass" WITHOUT
    // checking cutProgram's result, and the cold path could emit a real StopStream "fail" that the
    // hardcoded stage verdict then overwrote with PASS. Park is the stage that puts the studio back
    // the way it found it; a park that silently failed leaves the operator's show on the wrong
    // scene (or still streaming) while the test reports all-green. Derive it.
    btEmit(5, "PARK", { name: "start" });
    let parkOk;
    if (wasStreaming) {
      // The operator was ALREADY ON THE AIR before the test -- never StopStream (that drops the live
      // show) and never park to STANDBY. Restore whatever program was live before the sweep began.
      const restore = preTestProgram || "OVERLOOK";
      const restoreR = await cutProgram(restore);
      parkOk = restoreR.ok;
      btEmit(5, "PARK", { name: "restore-program", status: restoreR.ok ? "pass" : "fail",
        detail: restoreR.ok
          ? `left on air -- restored program ${restore}; stream untouched`
          : `RESTORE FAILED -- program may NOT be back on ${restore}: ${restoreR.comment}` });
    } else {
      // COLD path: the test started the stream, so it parks + stops it.
      const parkR = await cutProgram("STANDBY");
      const stopR = await obs.req("StopStream");
      parkOk = parkR.ok && stopR.ok;
      btEmit(5, "PARK", { name: "StopStream", status: stopR.ok ? "pass" : "fail", detail: stopR.comment });
      if (!parkR.ok) btEmit(5, "PARK", { name: "park-STANDBY", status: "fail", detail: `park to STANDBY failed: ${parkR.comment}` });
    }
    writeState((st) => { st.lowerThird = { visible: false, kicker: "", title: "", subtitle: "", tone: "ok" }; });
    btCloseStage(5, parkOk ? "PASS" : "FAIL");

    btState.durationMs = Date.now() - t0;
    btState.go = btState.stages.every((s) => s.verdict === "PASS");
  } catch (e) {
    btEmit(0, "ERROR", { name: "error", status: "fail", detail: e.message || String(e) });
    btState.durationMs = Date.now() - t0;
    btState.go = false;
  }
}
async function grabThumb(scene) {
  const r = await obs.req("GetSourceScreenshot", { sourceName: scene, imageFormat: "jpeg", imageWidth: 480, imageHeight: 270, imageCompressionQuality: 55 });
  if (!r.ok) return 0;
  const bytes = r.data.imageData.length;
  const frac = await probeRenderFrac(scene);                       // PIXEL truth (null if the bmp grab failed)
  const rendering = frac == null ? false : frac >= RENDER_MIN_FRAC; // can't verify -> NOT live (honest)
  thumbs[scene] = { img: r.data.imageData, at: Date.now(), bytes, rendering, frac: frac == null ? null : +frac.toFixed(3) };
  return bytes;
}
// used by preflight AND the on-demand card refresh (deliberate one-shot render of a template)
async function sweepStep(scene) {
  await obs.req("SetCurrentPreviewScene", { sceneName: scene });
  await sleep(1100); // let captures paint
  return grabThumb(scene);
}
setInterval(async () => {
  // WS1-L: while idle, skip the safety sweep entirely -- the whole point of idle mode is that
  // nothing is watching, so a background render is wasted GPU on the Intel iGPU.
  if (!obs.connected || preflightBusy || idleMode) return;
  try {
    const prog = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName;
    if (prog) await grabThumb(prog);
    if (operatorPreview && operatorPreview !== prog) await grabThumb(operatorPreview);
  } catch (_) {}
}, 1200000).unref(); // 20 min safety sweep
// HONEST program heartbeat (self-net 2026-07-15, couples with cure 1): the program card now reads LIVE
// only from a RECENT non-black frame (rendering within RENDER_FRESH_MS). Re-verify the ONE program scene
// every ~30s so a genuinely-rendering program stays honestly LIVE, and a program that GOES black flips to
// NO SIGNAL within ~30s. One grab of one scene -- never an all-card poll (the perf floor stays intact).
setInterval(async () => {
  if (!obs.connected || preflightBusy || btBusy || idleMode) return;
  try { const prog = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName; if (prog) await grabThumb(prog); } catch (_) {}
}, 30000).unref(); // 30s program heartbeat — keeps the honest rendering signal fresh for the on-air program

// cure 2: the armed-preview LIVE loop (~3fps, ONE scene at a time). Captures ONLY operatorPreview and
// ONLY while a console is actually watching (lastLiveViewerAt fresh) -- dormant otherwise, so it costs
// nothing off-hours. FREEZE-ON-AIR: if the armed scene is what is on program, skip it -- the 30s program
// heartbeat owns the on-air scene and the preview monitor holds its last snap (§1.3). Never all-card.
setInterval(async () => {
  if (previewLoopBusy) return;
  if (!obs.connected || preflightBusy || btBusy || idleMode) return;
  if (Date.now() - lastLiveViewerAt > PREVIEW_VIEWER_WINDOW_MS) return; // nobody watching -> dormant
  const scene = operatorPreview;
  if (!scene || scene === mirror.program) return;                      // freeze-on-air: program heartbeat carries it
  previewLoopBusy = true;
  try { await grabThumb(scene); } catch (_) {} finally { previewLoopBusy = false; }
}, PREVIEW_INTERVAL_MS).unref();

// WS1-L auto-idle: when the studio is halted, off-air, and no operator interaction for 15 min,
// enter idle mode automatically. The publisher gateway will notice via /api/slotstates (which
// forces "idle" for all slots) and ramp every remote source down to the tiny heartbeat profile.
setInterval(() => {
  if (idleMode) return;
  if (autoTimer) return;                     // auto rotation counts as "in use"
  if (mirror.streaming) return;              // never idle while live
  if (Date.now() - lastMutation < 15 * 60 * 1000) return;
  idleMode = true;
  console.log("[idle] auto-entered after 15 min of no operator interaction");
}, 30000).unref();

// ---------------- health board (the broadcast engineer) ----------------
function tcpCheck(port, host) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: host || "127.0.0.1", timeout: 2500 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.on("timeout", () => { s.destroy(); resolve(false); });
  });
}
async function healthChecks() {
  const out = [];
  const add = (id, name, ok, detail, fix) => out.push({ id, name, ok, detail, fix });
  add("obs", "OBS (mixer)", obs.connected, obs.connected ? "websocket connected" : "ws 4455 down — start OBS", null);
  const paths = await httpJson(9997, "/v3/paths/list");
  add("restreamer", "Restreamer (MediaMTX)", !!paths, paths ? "api up" : "not running — viewer\\restream.ps1 (with keys) or start mediamtx", null);
  const pmap = {}; if (paths && paths.items) for (const p of paths.items) pmap[p.name] = p;
  // codec-aware: browsers may default to AV1, which OBS's RTSP decode cannot render — detect
  // it and hand the operator the exact H264-pinned republish link (the engineer's job, automated).
  // Extended (WS1-D): loop over all 10 slots, but emit a row per REGISTERED-OR-PUBLISHING slot
  // only (an idle unpublished slot 8 does not need a red row — it hasn't been used).
  const regs = (await httpJson(GATEWAY.port, "/registrations")) || {};
  const camCheck = (n, label) => {
    const p = pmap[n];
    // HONESTY FIX 2026-07-16: this advertised `https://<LAN>:8889/<cam>/publish` — MediaMTX's WHIP
    // endpoint DIRECTLY. That advice was ALWAYS wrong and is now definitively dead:
    //   (a) publisher.cjs exists precisely because a browser cannot accept the self-signed cert
    //       cross-origin (":8889's cert can't be accepted by the browser" — publisher.cjs:8), which
    //       is why it reverse-proxies /<camN>/whip from :8443 to loopback :8889 same-origin; and
    //   (b) :8889 is now bound 127.0.0.1 (mediamtx_local.yml, the posture fix that survives
    //       retracting the PIN claim), so the LAN address does not answer AT ALL.
    // The operator opens the GATEWAY (:8443 = pub.html), picks a slot, and the page does the WHIP
    // over the proxy. Verified live 2026-07-16: https://<LAN>:8443/ -> 200.
    const url = `https://${LAN_IP}:8443/`;
    if (!p || !p.ready) return add(n, label, false, `not publishing — open ${url} on the camera computer (or phone) and pick slot ${n.replace("cam", "")}`, null);
    const tracks = p.tracks || [];
    const h264 = tracks.some((t) => /h264/i.test(t));
    add(n, label, h264, h264 ? `publishing H264 (${tracks.join("+")})` : `publishing ${tracks.join("+")} — OBS cannot decode that; RE-PUBLISH from ${url}`, null);
  };
  for (let i = 1; i <= 10; i++) {
    const n = "cam" + i;
    // Show a row if the slot is REGISTERED with the gateway OR is showing publishing on MTX.
    // Slot 1 & 2 always get a row (the "primary" slots); others only if in use.
    const registered = !!regs[n];
    const publishing = !!(pmap[n] && pmap[n].ready);
    if (i <= 2 || registered || publishing) {
      const suffix = (regs[n] && regs[n].label) ? ` (${String(regs[n].label).slice(0, 32)})` : "";
      camCheck(n, `Remote camera ${i}${suffix}`);
    }
  }
  const air = obs.connected ? await airState() : null;
  if (air && air.streaming) {
    const readers = pmap.uni ? (pmap.uni.readers || []).length : 0;
    // 2026-07-17 (gate egress-armed-floor-always-on): was `readers >= 1` — with N pushers armed and
    // ONE key dark, the healthy pusher pins readers >=1 and this always-on row read GREEN with a
    // platform dark. The broadcast test's stage 4 already uses readers >= max(1, armed); the panel the
    // operator watches BETWEEN tests did not. Same bar now. armed (intent) is the right denominator —
    // an endpoint that should be receiving but isn't is a real partial failure; max(1,…) keeps the
    // restream.ps1 path (armed==0, pushers elsewhere) from becoming a permanent PASS.
    const { armed: fanoutArmed } = fanoutLiveness();
    const want = Math.max(1, fanoutArmed);
    add("fanout", "Platform fan-out", readers >= want,
      fanoutArmed > 0
        ? `${readers}/${fanoutArmed} armed pusher(s) holding a program reader${readers < want ? " — at least one platform is NOT receiving the program" : ""}`
        : `program readers: ${readers}${readers < 1 ? " — no fan-out on this box (restream.ps1 elsewhere?)" : ""}`,
      null);
    add("streamq", "Stream quality", air.congestion < 0.2 && air.skipped / Math.max(1, air.frames) < 0.03, `congestion ${air.congestion.toFixed(2)}, skipped ${air.skipped}/${air.frames}`, null);
  }
  // Per-endpoint fan-out rows 2026-07-16 (sweep F1/#22). Was only a single "readers>=1" row that
  // couldn't tell if a specific platform was flapping. Each ARMED pusher gets its own row with
  // respawn count. A respawns-in-N-seconds count spikes when a key is REJECTED (attach, refused,
  // die, respawn ~3s later) — the operator sees WHICH platform is unhappy, not just an aggregate.
  const now = Date.now();
  // Is there anything ON the local ingest for a pusher to copy? This is the fact that separates
  // "the platform rejected our key" from "there is no program to push" — and WITHOUT it the row
  // accuses the operator's (good) keys. Straight from the MediaMTX path map already in hand.
  const uniReady = !!(pmap.uni && pmap.uni.ready);
  for (const rec of fanoutProcs) {
    // 2026-07-16 sweep D3: `alive` was `!rec.proc.killed` — but .killed is set ONLY when WE call
    // .kill(). A process that died on its own leaves .killed false forever, so a corpse read a
    // confident green "pushing … stable". exitCode/signalCode stay null only while it is genuinely
    // running. NEVER derive liveness from .killed.
    const alive = !!(rec.proc && rec.proc.exitCode === null && rec.proc.signalCode === null && !rec.spawnFailed);
    // Windowed rate (trailing 60s), not a lifetime average — see the `exits` ring in startFanout.
    const recent = rec.exits.filter((t) => now - t < 60000).length;
    const flapping = recent >= 6;   // 6+ deaths in the last minute == it is not staying up
    const id = "fanout." + rec.name.replace(/\W+/g, "_").toLowerCase();
    const label = `Fan-out: ${rec.name} (${rec.platform})`;

    if (rec.spawnFailed) {
      // The supervisor cannot even start. This is RED and it names the real cause.
      add(id, label, false, `CANNOT START ffmpeg: ${rec.spawnFailed} — the binary is not runnable from this process. No pushing is happening at all.`, null);
      continue;
    }
    if (!flapping && alive) { add(id, label, true, `pushing · ${recent} restart(s) in the last 60s`, null); continue; }
    if (!flapping && !alive) { add(id, label, false, `not running (restarting…) · ${recent} restart(s) in the last 60s`, null); continue; }
    // FLAPPING. 2026-07-16 sweep D5 — THE ROW USED TO ASSERT "rejected key likely" UNCONDITIONALLY,
    // AND THAT ACCUSATION WAS OFTEN FALSE. Measured: with no publisher on :1935/uni, ffmpeg dies AT
    // THE INPUT in ~0.2s ("Error opening input") — the key is NEVER PRESENTED to the platform — and
    // that produces ~11 respawns/46s, statistically indistinguishable from a genuinely rejected key
    // (13/46s). Since G-PA requires ARMing BEFORE the operator types CONFIRM, the prescribed order
    // GUARANTEES a window where perfectly good keys get accused. Sending a live operator to re-type
    // working keys mid-show is a costly lie. So: diagnose only what we can actually distinguish.
    if (!uniReady) {
      add(id, label, false,
        `FLAPPING — but there is NO PROGRAM on the local ingest (:1935/uni is not publishing), so the pushers die at the input before your key is ever sent. YOUR KEY IS NOT IMPLICATED. This is normal when fan-out is armed before the stream starts.`,
        null);
    } else {
      add(id, label, false,
        `FLAPPING — ${recent} restart(s) in the last 60s WHILE the local ingest is publishing, so the program reaches the pusher and the far end drops it. A key ${rec.platform} is REJECTING is the usual cause. Check that key.`,
        null);
    }
  }
  // web/clip/overlook are OBS browser sources now (rendered on-demand on the NVIDIA — no Chrome
  // windows / CDP). Health = the OBS inputs exist; overlay_server (:8099) backs clip.html.
  if (obs.connected) {
    const inputs = ((await obs.req("GetInputList")).data.inputs || []).map((i) => i.inputName);
    for (const [id, name, src] of [["web", "WEB source", "cap_web"], ["clip", "CLIP source", "cap_clip"], ["overlook", "OVERLOOK (UNI Producer view /stream)", "cap_overlook"]]) {
      add(id, name, inputs.includes(src), inputs.includes(src) ? "OBS browser source (on-demand)" : `missing — re-run studio_stage.cjs`, null);
    }
  }
  const spool = readJson(SPOOL, null);
  // HONESTY FIX 2026-07-16: was `updatedUtc` — which the CC bumps every 3s just by heartbeating,
  // so a stalled publisher looked green forever. Now reads `updatedUtcExternal` (only advances on
  // a real write). Fall back to `updatedUtc` only if `updatedUtcExternal` is entirely absent (an
  // older spool version); include "self-only" wording so an operator sees the honest degrade.
  const extAt = spool && spool.updatedUtcExternal;
  const anyAt = spool && (extAt || spool.updatedUtc);
  const fresh = anyAt && Date.now() - new Date(anyAt).getTime() < 15000;
  const externalOnly = !!extAt;
  const ovlUp = await tcpCheck(8099);
  add("overlays", "Overlay server + spool",
    ovlUp && !!fresh && (externalOnly ? true : true),
    ovlUp
      ? (fresh
          ? (externalOnly ? "serving, spool fresh (external write)" : "serving, spool fresh (self-heartbeat only — no external write yet, still valid)")
          : "serving but spool STALE (no external write for 15s+ — publisher may be stalled)")
      : "8099 down",
    "overlay");
  const colonycamUp = await tcpCheck(3020, COLONY_HOST);
  add("colonycam", "Colony camera (:3020 @UNI-LAB)", colonycamUp, `prismarine viewer @${COLONY_HOST}`, null);
  const phoenixUp = await tcpCheck(4000, COLONY_HOST);
  add("phoenix", "Colony node (:4000 @UNI-LAB)", phoenixUp, `Phoenix/SP.Producer @${COLONY_HOST}`, null);
  // The raw Minecraft game port :25565 is NOT reachable from the studio box BY DESIGN -- the colony
  // runs rootless on the chip and is OBSERVED over the LAN via colonycam :3020 + phoenix :4000, never
  // by a direct game-port probe. Probing :25565 from here always reddened honestly-unreachable and
  // (bug) made /api/preflight.go unreachable-true forever. Report the true observe-path instead. This
  // asserts the colony is OBSERVABLE, not that the world/UNIs are alive -- the science claim fence
  // (forage-pureworld-graduation etc.) is untouched.
  add("mc", "Colony observable (@UNI-LAB via :3020/:4000)", colonycamUp && phoenixUp,
      `raw :25565 is not reachable from the studio by design; colony captured via colonycam :3020 + phoenix :4000`, null);
  const pushFresh = pusher && Date.now() - lastPushWrite < 10000;
  // HONESTY FIX 2026-07-16 (sweep #15): was "Glass badge pusher / pushing (badge live)". THIS
  // side can only confirm the local WRITE — the ssh pipe swallows stdout and never observes a
  // remote ack. "Badge live" was asserting a remote receipt we don't measure. Renamed + reworded.
  add("glass", "Glass badge WRITE stream", !!pushFresh, pushFresh ? "writing to lab (remote receipt NOT confirmed by this side)" : "no recent push — lab badge will read STALE (honest)", null);
  // WS1-G ASCII lint: PS 5.1 reads BOM-less .ps1 as ANSI; a UTF-8 em-dash inside a string turns
  // into a smart quote (0x94) that terminates the string. Every .ps1 in viewer/ that declares
  // "ASCII ONLY" must actually be ASCII. Health surfaces filenames when the contract slips.
  try {
    const dir = __dirname;
    const bad = [];
    for (const f of fs.readdirSync(dir)) {
      if (!/\.ps1$/i.test(f)) continue;
      const buf = fs.readFileSync(path.join(dir, f));
      for (let i = 0; i < buf.length; i++) { if (buf[i] > 127) { bad.push(f); break; } }
    }
    add("ascii_lint", "PowerShell ASCII compliance", bad.length === 0,
        bad.length === 0 ? "all .ps1 are ASCII-only" : "non-ASCII bytes in: " + bad.join(", "), null);
  } catch (_) {}
  return out;
}
async function applyFix(what) {
  if (what === "overlay") {
    if (!(await tcpCheck(8099))) {
      const p = spawn("cmd", ["/c", "start", "powershell", "-NoExit", "-Command", `node ${path.join(__dirname, "overlay_server.cjs")}`], { stdio: "ignore", detached: true });
      p.on("error", () => {}); p.unref();
    }
    return "overlay server (re)started";
  }
  throw new Error("unknown fix");
}

// ---------------- HTTP API + UI ----------------
function j(res, code, obj) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); }
function body(req) { return new Promise((r) => { let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { try { r(JSON.parse(b || "{}")); } catch (_) { r({}); } }); }); }
const ytId = (u) => { const m = /(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})(?![\w-])/.exec(u) || /^([\w-]{11})$/.exec(u.trim()); return m ? m[1] : null; };

const server = http.createServer(async (req, res) => {
  const url = (req.url || "/").split("?")[0];
  const q = new URLSearchParams((req.url || "").split("?")[1] || "");
  try {
    if (url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "command_center.html")));
    }
    // THE RUNDOWN, ADDED 2026-07-29. Two GET routes and NOT ONE new mutating surface.
    //
    // It has to be served from HERE. The CSRF fence at :1579 requires x-uni-cc, which forces a CORS
    // preflight; there is no OPTIONS handler, so a cross-origin page cannot drive this console at
    // all. That fence is correct and is not being weakened -- the page is same-origin instead.
    //
    // The rundown drives ONLY /api/preview -> /api/take -> /api/overlay -> /api/back, every one of
    // which the operator already has in the console. It never touches /api/cut (which validates
    // nothing, :1600) and it cannot reach /api/golive. An advance changes what is on PROGRAM. It
    // cannot start a stream.
    if (url === "/rundown") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "rundown.html")));
    }
    if (url === "/api/rundown") {
      // Read per request, never cached: the rundown is a file the operator may edit between takes,
      // and a cached rundown is a rundown that lies about the show it is driving.
      const p = path.join(__dirname, "..", "production", "run-of-show", "first-show.rundown.json");
      try {
        const raw = fs.readFileSync(p, "utf8");
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        return res.end(raw);
      } catch (e) {
        // Absent is reported as absent, never fabricated into an empty show.
        return j(res, 404, { err: "rundown not readable", path: "production/run-of-show/first-show.rundown.json", detail: String(e.message || e) });
      }
    }
    if (url === "/api/state") {
      // M1: distinguish "we don't know yet" (airState null: OBS disconnected or mirror not
      // hydrated) from a real OFF. Fabricating OFF here would make the console show "OFF AIR"
      // during a mid-show resync and could scare the operator into hitting OFF AIR for real.
      // We still send a display fallback so the UI has a program name, but airStale:true tells
      // the UI to render an amber "SYNCING" banner instead of a confident OFF.
      const realAir = obs.connected ? await airState() : null;
      const air = realAir || { level: "OFF", program: "?", streaming: false };
      const airStale = realAir === null;
      const man = manifest();
      const paths = await httpJson(9997, "/v3/paths/list");
      const rc = (n) => {
        const p = paths && paths.items && paths.items.find((x) => x.name === n);
        if (!p || !p.ready) return "off";
        return (p.tracks || []).some((t) => /h264/i.test(t)) ? "live" : "badcodec";
      };
      // pcCamDevices caches 30 s; DirectShow enumeration no longer runs on every 2 s UI poll.
      const cams = obs.connected ? await pcCamDevices() : [];
      // camsInfo ALL 10 (2026-07-16, sweep #14): was only remote1 + remote2, silently ignoring
      // slots 3-10. camsInfo.remotes is now the full slot table with codec + registered + rendering
      // per slot; camsInfo.summary tells the operator "N/10 live" at a glance.
      const regs = (await httpJson(GATEWAY.port, "/registrations")) || {};
      const remotes = {};
      for (let i = 1; i <= 10; i++) {
        const nm = "cam" + i;
        remotes[nm] = { codec: rc(nm), registered: !!regs[nm], ageMs: regs[nm] ? regs[nm].ageMs : null, label: (regs[nm] && regs[nm].label) || null };
      }
      const liveN = Object.values(remotes).filter((r) => r.codec === "live").length;
      // CamHost binding truth from OBS (was NOT exposed — 2026-07-16 sweep B4).
      let pcBound = null;
      if (obs.connected) {
        try {
          const s = await obs.req("GetInputSettings", { inputName: "CamHost" });
          const devId = (s.ok && s.data && s.data.inputSettings && (s.data.inputSettings.video_device_id || s.data.inputSettings.video_device_id_string)) || null;
          const named = devId ? (cams.find((c) => c.value === devId || c.name === devId) || null) : null;
          pcBound = { deviceId: devId, deviceName: named ? named.name : (devId ? "(unrecognized device id)" : null) };
        } catch (_) { pcBound = null; }
      }
      // Mic state 2026-07-16 (sweep B5): the mirror already tracks audioMute; expose it here so the
      // UI can render a MIC pill and a warn if a talk template is armed with mic muted.
      const micMuted = mirror.audioMute && mirror.audioMute.get ? mirror.audioMute.get("MicHost") : null;
      // Music + colony live from the pollers' spool mirrors (source of truth for both overlays and
      // the console UI; single-write, many-read discipline).
      const spool = readJson(SPOOL, {});
      const nowPlaying = spool.nowPlaying || null;
      const colony = spool.colony || null;
      // musicOnAir gate — operator picked "full on-air" for DMCA policy so default is true, but the
      // operator can flip it here at any time. When false, studio_stage's MUSIC_HOUR/CARD scenes
      // still exist but the CC's route-to-music button will refuse to cut them to program.
      const musicOnAir = spool.musicOnAir !== false;   // default true
      // Aggregated GO/HOLD/BLOCK pill (sweep C25). Derived from the same signals the operator uses
      // — never a hardcoded literal.
      const health = await healthChecks().catch(() => []);
      const anyBad = health.some((h) => h.ok === false);
      const camReady = !!(pcBound && pcBound.deviceId);
      const micOk = micMuted === false || micMuted === null;   // muted is only a problem if a talk template needs it — flagged as warn in the UI
      const sightVerdict = anyBad ? "BLOCK" : (!camReady ? "HOLD" : "GO");
      return j(res, 200, {
        obs: obs.connected, air, airStale, preview: operatorPreview, groups: man.groups, desc: man.desc || {},
        roles, voice, auto: !!autoTimer, uniFeed: !!bridge, beats: BEATS.map(([s, t]) => s + ":" + t).join(","),
        camsInfo: { pcDevices: cams.map((c) => c.name), remote1: rc("cam1"), remote2: rc("cam2"), remotes, summary: `${liveN}/10 live` },
        slots: regs,
        restreamer: !!paths, lanIp: LAN_IP, lanIpProvenance: LAN_IP_PROVENANCE, idle: idleMode,
        // 2026-07-17 (gate egress-armed-floor-always-on): ship the armed count so a downstream egress
        // TILE (the HUD) can floor `readers >= max(1, armedCount)` instead of the readers>=1 lie.
        fanoutArmed: fanoutLiveness().armed, fanoutAlive: fanoutLiveness().aliveCount,
        favorites: readJson(FAVS, []), recent: readJson(RECENT, []),
        // NEW 2026-07-16 first-class fields:
        pcBound, mic: { muted: micMuted, source: "MicHost" },
        nowPlaying, colony, musicOnAir,
        // metadata block for pro-broadcast overlays (sweep #19). Everything defaults to null so
        // an absent field renders SYNCING/UNKNOWN, never a fabricated string. Operator fills these
        // in from /api/metadata.
        meta: spool.meta || { showTitle: null, segment: null, segmentId: null, airDateUtc: null, presenter: [], guest: [], dateline: null, kicker: null, rundown: [] },
        bug: spool.bug || { text: null, corner: "br", color: "#3fd2ff", opacity: 0.85, enabled: false },
        sightVerdict,
      });
    }
    if (url === "/api/devices") {
      // On-demand PC-cam device list (cached 30 s). Called by the roles panel when the operator
      // opens the CamHost picker — no longer polled every 2 s.
      const cams = obs.connected ? await pcCamDevices() : [];
      return j(res, 200, { pcCamDevices: cams });
    }
    if (url === "/api/thumbs") {
      const now = Date.now();
      const out = {};
      // HONEST: carry bytes + the two orthogonal signals. `rendering` is true ONLY when a recent
      // (< RENDER_FRESH_MS) frame is non-black. Downstream (the card/monitor labels, Gaia, HUD) must
      // read `rendering` for any LIVE claim -- never assume LIVE from a scene merely being on program.
      for (const [sc, t] of Object.entries(thumbs)) {
        const ageMs = now - t.at;
        out[sc] = { img: t.img, age: Math.round(ageMs / 1000), bytes: t.bytes || (t.img || "").length,
          rendering: !!(t.rendering && ageMs < RENDER_FRESH_MS), frac: (t.frac == null ? null : t.frac) };
      }
      return j(res, 200, out);
    }
    if (url === "/api/thumb") {
      // cure 2: serve the ONE scene's latest frame as BINARY jpeg so a fast <img> live-loop (the preview
      // monitor + the clicked-tile ~5s loop) can poll it cheaply. Hitting this route counts as "a console
      // is watching" -> wakes the viewer-gated 3fps armed-preview capture loop. Honesty rides in headers
      // so the client can de-escalate a black/stale frame without a second round-trip.
      lastLiveViewerAt = Date.now();
      const scene = q.get("scene");
      const t = thumbs[scene];
      if (!t) return j(res, 404, { err: "no thumb yet" });
      const buf = Buffer.from(String(t.img).replace(/^data:image\/\w+;base64,/, ""), "base64");
      const ageMs = Date.now() - t.at;
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "X-Rendering": (t.rendering && ageMs < RENDER_FRESH_MS) ? "1" : "0",
        "X-Bytes": String(t.bytes || buf.length),
        "X-Frac": String(t.frac == null ? "" : t.frac),
        "X-Age-Ms": String(ageMs),
      });
      return res.end(buf);
    }
    if (url === "/api/health") return j(res, 200, { checks: await healthChecks() });
    // P4: current broadcast_test state for the UI progress panel to poll. GET-ONLY guard: this route
    // shares its URL with the POST starter below (L855). Without the method check, a POST to start the
    // test matches HERE first (this block runs before the `method !== "POST"` boundary at L696) and
    // returns the idle state instead of starting the run -- the test never fires. (bug fixed 2026-07-12)
    if (req.method === "GET" && url === "/api/broadcast_test") return j(res, 200, btState);
    if (url === "/api/slotstates") {
      // per-slot adaptive state for the remote-source gateway (publisher.cjs polls this):
      //   live    = cam is visible on the program scene (full quality)
      //   preview = cam is armed in preview OR assigned to a role (ramp/keep full — ready to cut)
      //   idle    = unused slot (tiny heartbeat + thumbnail)
      const out = {};
      if (obs.connected) {
        const prog = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName || "";
        const liveCams = await programCams(prog);
        const prevCams = await programCams(operatorPreview);
        const assigned = new Set(Object.values(roles));
        for (let i = 1; i <= 10; i++) {
          const src = "RemoteCam" + i;
          // WS1-L: force all cams to idle when the studio is in sleep mode -- publisher pushes
          // the tiny heartbeat profile until an operator wakes it.
          out["cam" + i] = idleMode ? "idle" : (liveCams.has(src) ? "live" : (prevCams.has(src) || assigned.has(src)) ? "preview" : "idle");
        }
      }
      return j(res, 200, out);
    }
    if (req.method !== "POST") { res.writeHead(404); return res.end("not found"); }
    // CSRF fence: a custom header forces a CORS preflight, so no third-party page in the
    // operator's browser can fire mutating "simple" POSTs at the console (e.g. offair, web-cut)
    if (req.headers["x-uni-cc"] !== "1") return j(res, 403, { err: "missing x-uni-cc header" });
    const b = await body(req);
    // WS1-L: any operator-driven mutation exits idle mode + resets the auto-idle timer.
    if (idleMode) { idleMode = false; }
    lastMutation = Date.now();
    if (url === "/api/preview") {
      if (!allTemplates().includes(b.scene)) return j(res, 400, { err: "unknown template: " + b.scene });
      operatorPreview = b.scene;
      const r = await obs.req("SetCurrentPreviewScene", { sceneName: b.scene });
      setTimeout(() => grabThumb(b.scene), 1200);
      return j(res, 200, { ok: r.ok, err: r.comment });
    }
    if (url === "/api/take") {
      if (preflightBusy) return j(res, 409, { err: "PREFLIGHT owns the preview right now — wait for it to finish (~30s)" });
      stopAuto();
      const pv = await obs.req("SetCurrentPreviewScene", { sceneName: operatorPreview });
      if (!pv.ok) return j(res, 409, { err: `cannot arm preview "${operatorPreview}" (${pv.comment}) — NOT taking; click a template first` });
      await sleep(700); // let the preview paint before it becomes program
      const r = await obs.req("TriggerStudioModeTransition");
      return j(res, 200, { ok: r.ok, err: r.comment });
    }
    if (url === "/api/cut") { stopAuto(); const r = await cutProgram(b.scene); return j(res, 200, { ok: r.ok, err: r.comment }); }
    if (url === "/api/projector") {
      // open OBS's native GPU program window (true 30fps) — the smooth monitor; -1 = windowed
      const r = await obs.req("OpenVideoMixProjector", { videoMixType: "OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM", monitorIndex: -1 });
      return j(res, 200, { ok: r.ok, err: r.comment });
    }
    if (url === "/api/role") {
      if (b.device !== undefined && b.source === "CamHost") {
        const cams = (await obs.req("GetInputPropertiesListPropertyItems", { inputName: "CamHost", propertyName: "video_device_id" })).data.propertyItems || [];
        if (cams[b.device]) await obs.req("SetInputSettings", { inputName: "CamHost", inputSettings: { video_device_id: cams[b.device].itemValue, active: true }, overlay: true });
      }
      const r = await setRole(b.role, b.source);
      return j(res, r.ok ? 200 : 400, r);
    }
    if (url === "/api/camlayout") {
      // dynamic camera picker: choose a layout + which of the 10 slots (or PC) fill it, at select.
      const norm = (c) => (c === "host" || c === "CamHost") ? "CamHost" : ("RemoteCam" + parseInt(c, 10));
      const picks = (b.cams || []).map(norm);
      const LAY = { full: ["CAM_A", ["A"]], pip: ["PIP_AB", ["A", "B"]], side: ["DUAL_AB", ["A", "B"]], trio: ["TRIO", ["A", "B", "C"]], grid: ["GRID", []] };
      const m = LAY[b.layout];
      if (!m) return j(res, 400, { err: "layout must be full|pip|side|trio|grid" });
      for (let i = 0; i < m[1].length && i < picks.length; i++) { const rr = await setRole(m[1][i], picks[i]); if (!rr.ok) return j(res, 400, { err: `role ${m[1][i]}: ${rr.comment || rr.err || "failed"}` }); }
      stopAuto();
      let r;
      if (b.preview) { operatorPreview = m[0]; r = await obs.req("SetCurrentPreviewScene", { sceneName: m[0] }); }
      else r = await cutProgram(m[0]);
      return j(res, 200, { ok: r.ok, scene: m[0], roles: m[1], cams: picks, err: r.comment });
    }
    if (url === "/api/endpoints") {
      // Up to 20 stream endpoints, AES-256-GCM encrypted at rest. Keys are returned MASKED only.
      // PIN pairing (2026-07-16): a short numeric PIN can unwrap the SAME passphrase (pin_store.cjs)
      // so the operator/HUD never has to retype the long passphrase after one-time setup. "armed"
      // is reported honestly as "fan-out is actually running", never inferred from unlock alone.
      const mask = (list) => (list || []).map((e) => ({ id: e.id, name: e.name, url: e.url, keyMask: epStore.maskKey(e.key), enabled: !!e.enabled }));
      // 2026-07-16 sweep D2: `hasPin` is FILE EXISTENCE — it says a wrapper is on disk, NOT that the
      // wrapper still opens anything. The reset path this panel itself prescribes ("delete
      // endpoints*.enc by hand") can leave an ORPHAN wrapper: hasPin:true, PIN accepted, passphrase
      // unwrapped — and it opens nothing, because the store it belonged to is gone. That failure
      // lands at pin-arm, i.e. seconds before air. It is cheaply detectable NOW, so say it NOW.
      const pinOrphan = pinStore.exists() && !epStore.exists();
      const statusBody = () => ({ ok: true, unlocked: !!epMem, hasStore: epStore.exists(), hasPin: pinStore.exists(),
        pinOrphan,
        pinNote: pinOrphan
          ? "This PIN is ORPHANED: it unwraps a passphrase for a key store that no longer exists. Clear the PIN and set your keys + PIN again."
          : null,
        // 2026-07-17 (gate armed-count-is-live-pushers): `fanout` was fanoutProcs.length — records,
        // including spawn-failed corpses, so "ARMED (2)" could be 2 dead pushers. Now ship aliveCount
        // (pushers actually running) distinct from armed (intent). `armed`/`fanout` keep counting
        // records because ARM/DISARM state is about intent (a corpse is still armed, awaiting respawn);
        // aliveCount is what a health surface reads to say how many are really pushing.
        armed: fanoutProcs.length > 0, endpoints: epMem ? mask(epMem.endpoints) : [],
        fanout: fanoutProcs.length, aliveCount: fanoutLiveness().aliveCount });
      if (b.action === "status") return j(res, 200, statusBody());
      if (b.action === "lock") { epMem = null; return j(res, 200, { ok: true, unlocked: false }); }
      if (b.action === "unlock") {
        try { epMem = { pass: b.pass, endpoints: (epStore.load(b.pass)).endpoints }; }
        catch (e) { return j(res, 401, { err: "wrong passphrase or corrupt store" }); }
        return j(res, 200, { ok: true, unlocked: true, endpoints: mask(epMem.endpoints), fanout: fanoutProcs.length });
      }
      if (b.action === "save") {
        if (!b.pass) return j(res, 400, { err: "passphrase required to save" });
        // ══ THE LOCKOUT FIX (2026-07-16) — this route DESTROYED the operator's keys ══════════════
        // This is almost certainly the mechanism that lost the passphrase/keys on 2026-07-15 and
        // cost a live window. Found by an adversarial sweep, reproduced in an isolated harness.
        //
        // WHAT IT DID: `prev` read `epMem` — the IN-PROCESS unlock cache. When the panel is LOCKED
        // (or the cc restarted), epMem is null, so `prev` was []. The UI renders a locked store as
        // an EMPTY LIST — byte-identical to "nothing saved yet" — which invites the operator to
        // re-add their endpoints. The picker emits key:"" for a row they didn't retype, and the
        // "blank = keep existing" fallback then found nothing to keep (because epMem was null).
        // So it blind-wrote a store of empty keys over the real one. HTTP 200. Toast: "saved +
        // encrypted". And a MISTYPED PASSPHRASE took the exact same path — re-encrypting under the
        // wrong key, after which load() with the CORRECT passphrase throws "unable to authenticate
        // data" forever. The keys are simply gone, and nothing anywhere said so.
        //
        // THE FIX: authenticate against the store ON DISK before merging anything. A wrong
        // passphrase now 401s having written NOTHING, and "blank = keep existing" reads the real
        // previous keys rather than a null cache. First-ever save stays safe: endpoints_store.load()
        // returns {endpoints:[]} when the file is absent, so there is nothing to authenticate.
        let prev = [];
        if (epStore.exists()) {
          try {
            prev = epStore.load(b.pass).endpoints || [];
          } catch (_) {
            return j(res, 401, {
              err: "wrong passphrase — NOTHING was saved. Your existing keys are untouched. " +
                   "(If you meant to start over, delete viewer/runtime/endpoints*.enc by hand.)",
            });
          }
        }
        const byId = Object.fromEntries(prev.map((e) => [e.id, e]));
        const merged = (b.endpoints || []).slice(0, epStore.MAX).map((e) => ({
          id: e.id || ("ep" + Math.random().toString(36).slice(2, 8)),
          name: String(e.name || "").slice(0, 40),
          url: String(e.url || "").slice(0, 300),
          // blank = keep existing — now backed by the ON-DISK store, not a cache that is null
          // exactly when the operator most needs the fallback. An explicit clearKey:true is the
          // ONLY way to blank a key that exists on disk, so a UI that forgot to send one can
          // never silently erase it.
          key: (e.key && e.key.length) ? e.key
             : (e.clearKey === true ? "" : (byId[e.id] ? byId[e.id].key : "")),
          enabled: !!e.enabled,
        }));
        // Refuse a save that would silently blank a key that EXISTS on disk. Belt-and-braces on
        // top of the fallback above: if this ever fires, something upstream is wrong and the
        // honest move is to refuse, not to write.
        const wouldBlank = merged.filter((m) => !m.key && byId[m.id] && byId[m.id].key);
        if (wouldBlank.length) {
          return j(res, 409, {
            err: "refused: this save would ERASE the key for " +
                 wouldBlank.map((m) => m.name || m.id).join(", ") +
                 ". Leave the key box blank to KEEP the saved key, or send clearKey:true to clear it on purpose.",
          });
        }
        try { const saved = epStore.save(b.pass, { endpoints: merged }); epMem = { pass: b.pass, endpoints: saved.endpoints }; }
        catch (e) { return j(res, 500, { err: "encrypt/save failed: " + e.message }); }
        // convenience: SAVE can also (re)set the PIN wrap in the same request if the operator typed one
        if (b.pin) {
          if (!pinStore.validPin(b.pin)) return j(res, 400, { err: "saved OK, but PIN must be 4-8 digits — PIN not set" });
          try { pinStore.setPin(b.pin, b.pass); } catch (e) { return j(res, 500, { err: "saved OK, but PIN wrap failed: " + e.message }); }
        }
        return j(res, 200, Object.assign({ endpoints: mask(epMem.endpoints) }, statusBody()));
      }
      // ── 2026-07-17 (gate endpoints-import-key-blind) — THE SAFE IMPORT ────────────────────────────
      // The whole session's G-PA discipline forbids the agent from holding a stream key. Copy-paste
      // through the agent was the wrong workaround — it made the operator do the work AND still risked
      // exposure. The correct fix: the SERVER reads streaming.txt (default: ~\Desktop\streaming.txt),
      // parses passphrase + optional PIN + endpoints, encrypts straight into endpoints.enc, and returns
      // ONLY masked keys + counts. The agent that triggered this NEVER sees any secret — the POST body
      // carries only {action:"import"} (and an optional path override), and the response echoes only
      // ****suffix masks.
      //
      // File format (delete the file after import):
      //   # comments allowed
      //   passphrase: <REQUIRED — the AES-256-GCM key derivation input>
      //   pin: <OPTIONAL 4-8 digits — wraps the passphrase for one-click ARM>
      //   YouTube #1 | rtmp://a.rtmp.youtube.com/live2/ | live_yourkey
      //   Twitch     | rtmp://live.twitch.tv/app/       | live_yourkey
      //   {"name":"...","url":"...","key":"..."}       ← JSON per line also accepted
      if (b.action === "import") {
        const home = process.env.USERPROFILE || process.env.HOME || "";
        const importPath = b.path ? String(b.path) : path.join(home, "Desktop", "streaming.txt");
        let raw;
        try { raw = fs.readFileSync(importPath, "utf8"); }
        catch (e) { return j(res, 404, { err: `cannot read ${importPath} (${e.code || e.message}) — create the file on your Desktop, or POST {path:"..."}` }); }

        let pass = null, pin = null;
        const endpoints = [];
        const warnings = [];
        const lines = raw.split(/\r?\n/);
        const crypto = require("crypto");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line || line.startsWith("#")) continue;
          const mPass = /^passphrase\s*[:=]\s*(.+)$/i.exec(line);
          const mPin = /^pin\s*[:=]\s*(.+)$/i.exec(line);
          if (mPass) { pass = mPass[1].trim(); continue; }
          if (mPin) { pin = mPin[1].trim(); continue; }
          let ep = null;
          if (line.startsWith("{")) {
            try { ep = JSON.parse(line); }
            catch (_) { warnings.push(`line ${i + 1}: invalid JSON`); continue; }
          } else {
            // Split on the FIRST two pipes only, so keys that contain "|" survive intact.
            const p1 = line.indexOf("|");
            const p2 = p1 >= 0 ? line.indexOf("|", p1 + 1) : -1;
            if (p2 < 0) { warnings.push(`line ${i + 1}: expected 'name | url | key' or JSON`); continue; }
            ep = { name: line.slice(0, p1).trim(), url: line.slice(p1 + 1, p2).trim(), key: line.slice(p2 + 1).trim() };
          }
          if (!ep.name || !ep.url || !ep.key) { warnings.push(`line ${i + 1}: missing name/url/key`); continue; }
          endpoints.push({
            id: ep.id || ("ep" + crypto.randomBytes(3).toString("hex")),
            name: String(ep.name).slice(0, 40),
            url: String(ep.url).slice(0, 300),
            key: String(ep.key),
            enabled: ep.enabled !== false,
          });
        }
        if (!pass) return j(res, 400, { err: "streaming.txt is missing a 'passphrase: ...' line (required — this is the AES-256-GCM key)" });
        if (endpoints.length === 0) return j(res, 400, { err: "streaming.txt contains no endpoints" + (warnings.length ? " — " + warnings.join("; ") : "") });
        if (endpoints.length > epStore.MAX) return j(res, 400, { err: `too many endpoints (${endpoints.length}); MAX is ${epStore.MAX}` });

        // ENCRYPT to disk. epStore.save enforces the D1 lockout guard: if a store already exists and
        // this passphrase does not open it, the write is REFUSED (nothing overwritten).
        try { const saved = epStore.save(pass, { endpoints }); epMem = { pass, endpoints: saved.endpoints }; }
        catch (e) {
          if (e.code === "EP_WRONG_PASS") return j(res, 401, { err: "IMPORT REFUSED: an encrypted store already exists and the passphrase in streaming.txt does not open it. Nothing was written. Delete viewer/runtime/endpoints*.enc by hand if you meant to start over." });
          return j(res, 500, { err: "encrypt/save failed: " + e.message });
        }
        // Wrap the PIN if given (so ARM is a one-PIN click, not a re-typed passphrase). Endpoints stay
        // saved even if the PIN wrap fails — a wrap error is a warning, never a rollback.
        let pinSet = false;
        if (pin) {
          if (!pinStore.validPin(pin)) warnings.push("PIN must be 4-8 digits — PIN NOT set (endpoints ARE saved)");
          else { try { pinStore.setPin(pin, pass); pinSet = true; } catch (e) { warnings.push("PIN wrap failed: " + e.message); } }
        }
        return j(res, 200, Object.assign({
          imported: endpoints.length,
          pinSet,
          warnings,
          endpoints: mask(epMem.endpoints),      // ONLY masks reach the response — the agent sees ****suffix
          source: importPath,
          hint: pinSet
            ? `imported ${endpoints.length} endpoint(s) + PIN wrapped. DELETE ${importPath} — plaintext keys should not linger.`
            : `imported ${endpoints.length} endpoint(s). DELETE ${importPath} — plaintext keys should not linger.`,
        }, statusBody()));
      }
      if (b.action === "setpin") {
        // Requires the REAL passphrase once — proves the operator knows it before wrapping it under
        // a short PIN. After this, the PIN alone (via pin-arm) reconstructs the passphrase.
        if (!pinStore.validPin(b.pin)) return j(res, 400, { err: "PIN must be 4-8 digits" });
        let pass;
        try { epStore.load(b.pass); pass = b.pass; } // throws on wrong passphrase / no store yet
        catch (e) { return j(res, 401, { err: "wrong passphrase (or no endpoints saved yet) — cannot set PIN" }); }
        try { pinStore.setPin(b.pin, pass); } catch (e) { return j(res, 500, { err: "PIN wrap failed: " + e.message }); }
        return j(res, 200, statusBody());
      }
      if (b.action === "clearpin") { pinStore.clear(); return j(res, 200, statusBody()); }
      if (b.action === "pin-arm") {
        // ARM = unlock via PIN + start fan-out in one step (the HUD's one-button "go live ready").
        // Never touches /api/golive — the actual public StartStream+CONFIRM stays the operator's
        // separate, explicit, human-typed action (G-PA). This only readies the copy-out pipe.
        let pass;
        try { pass = pinStore.unwrap(b.pin); }
        catch (e) { return j(res, 401, { err: "wrong PIN or no PIN set" }); }
        try { epMem = { pass, endpoints: (epStore.load(pass)).endpoints }; }
        catch (e) { return j(res, 500, { err: "PIN unwrapped, but the endpoints store itself failed to open: " + e.message }); }
        const r = startFanout();
        return j(res, r.ok ? 200 : 409, Object.assign({}, r, statusBody()));
      }
      if (b.action === "pin-disarm") {
        // DISARM never requires the PIN — "stopping is always allowed", no barrier in an emergency.
        stopFanout(); epMem = null;
        return j(res, 200, statusBody());
      }
      return j(res, 400, { err: "action must be status|unlock|lock|save|import|setpin|clearpin|pin-arm|pin-disarm" });
    }
    if (url === "/api/fanout") {
      if (b.on) { const r = startFanout(); return j(res, r.ok ? 200 : 409, r); }
      stopFanout(); return j(res, 200, { ok: true, count: 0 });
    }
    if (url === "/api/shutdown") {
      // graceful close (the door lifecycle's close vector): stop fan-out children, answer, exit clean.
      stopFanout();
      j(res, 200, { ok: true, closing: true });
      setTimeout(() => process.exit(0), 200);
      return;
    }
    if (url === "/api/voice") {
      const cams = await programCams((await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName || "");
      if (b.which === "MicHost" && cams.size === 1 && cams.has("CamHost"))
        return j(res, 200, { ok: false, note: "PC camera is the only camera on program — it is ALWAYS MUTE (owner rule). Switch templates/roles first." });
      await setVoice(b.which);
      return j(res, 200, { ok: true, voice });
    }
    if (url === "/api/web") {
      if (!/^https?:\/\//i.test(b.url || "")) return j(res, 400, { err: "url must be http(s)" });
      // cap_web is an OBS browser source now — navigate it directly (no Chrome window / CDP)
      await obs.req("SetInputSettings", { inputName: "cap_web", inputSettings: { url: b.url }, overlay: true });
      const scene = { host: "WEB_HOST", side: "WEB_SIDE", full: "WEB" }[b.layout] || (b.host ? "WEB_HOST" : "WEB");
      if (b.cut) { stopAuto(); await cutProgram(scene); }
      else { operatorPreview = scene; await obs.req("SetCurrentPreviewScene", { sceneName: scene }); }
      return j(res, 200, { ok: true });
    }
    if (url === "/api/clip") {
      const id = ytId(b.url || "");
      const isWatch = /youtube\.com\/watch\?/i.test(b.url || "");
      if (!id && !/^https?:\/\//i.test(b.url || "")) return j(res, 400, { err: "youtube url or 11-char id" });
      const target = isWatch ? b.url : (id ? `http://127.0.0.1:8099/clip.html?v=${id}` : b.url);
      // cap_clip is an OBS browser source (carries its own audio via reroute_audio) — navigate directly
      await obs.req("SetInputSettings", { inputName: "cap_clip", inputSettings: { url: target }, overlay: true });
      const clipScene = { full: "CLIP", host: "CLIP_HOST", side: "CLIP_SIDE", pip: "CLIP_PIP" }[b.layout] || (b.host ? "CLIP_HOST" : "CLIP");
      stopAuto(); await cutProgram(clipScene);
      const recent = [{ url: b.url, at: new Date().toISOString() }, ...readJson(RECENT, []).filter((x) => x.url !== b.url)].slice(0, 8);
      try { fs.writeFileSync(RECENT, JSON.stringify(recent, null, 2)); } catch (_) {}
      if (clipTimer) clearTimeout(clipTimer);
      const secs = Math.min(parseInt(b.secs, 10) || 0, 7200); // cap: >32-bit setTimeout would fire instantly
      if (secs > 2) clipTimer = setTimeout(async () => { const cur = (await obs.req("GetCurrentProgramScene")).data.currentProgramSceneName; if (cur && cur.startsWith("CLIP")) await cutProgram(prevScene || "COLONY"); }, secs * 1000);
      return j(res, 200, { ok: true, autoReturn: secs > 2 ? secs : null });
    }
    if (url === "/api/back") { if (clipTimer) { clearTimeout(clipTimer); clipTimer = null; } await cutProgram(prevScene || "COLONY"); return j(res, 200, { ok: true }); }
    if (url === "/api/share") {
      const items = (await obs.req("GetInputPropertiesListPropertyItems", { inputName: "cap_share1", propertyName: "window" })).data.propertyItems || [];
      if (b.list) return j(res, 200, { windows: items.map((i, n) => ({ n, name: i.itemName })) });
      const slot = ["cap_share1", "cap_share2", "cap_share3"][b.slot - 1];
      if (!slot || (typeof b.n !== "number" && !(b.match && b.match.trim())))
        return j(res, 400, { err: "slot 1-3 plus a window index or a non-empty match — never binds blind" });
      const it = typeof b.n === "number" ? items[b.n] : items.find((i) => (i.itemName || "").toLowerCase().includes(b.match.trim().toLowerCase()));
      if (!it) return j(res, 400, { err: "no matching window" });
      const r = await obs.req("SetInputSettings", { inputName: slot, inputSettings: { window: it.itemValue }, overlay: true });
      return j(res, 200, { ok: r.ok, bound: it.itemName });
    }
    if (url === "/api/auto") {
      if (b.beats) {
        const known = allTemplates();
        const nb = String(b.beats).split(",").map((p) => p.trim().split(":")).filter((p) => p.length === 2).map(([s, t]) => [s.toUpperCase(), parseInt(t, 10)]).filter(([s, t]) => t > 2 && known.includes(s));
        if (nb.length) { BEATS = nb; saveBeats(); } else return j(res, 400, { err: "no valid beats — use TEMPLATE:secs with real template names" });
      }
      if (b.on) { stopAuto(); autoStep(0); } else stopAuto();
      return j(res, 200, { ok: true, auto: !!autoTimer, beats: BEATS.map(([s, t]) => s + ":" + t).join(",") });
    }
    if (url === "/api/unifeed") {
      if (b.on) {
        if (!bridge) {
          const sname = "bridge" + (Date.now() % 100000);
          // DEPRECATED: broadcast_bridge.exs is RETIRED (docs/STUDIO_SYSTEMS.md) — the in-app supervised SP.Show.OverlayPublisher already mirrors narration into the broadcast.json spool. Spawning this launches a SECOND competing writer. Do not use in production; kept only for legacy dev.
          bridge = spawn("cmd", ["/c", "elixir", "--sname", sname, "--cookie", "sp", "runs\\broadcast_bridge.exs"], { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });
          bridge.on("error", () => { bridge = null; });
          bridge.on("exit", () => { bridge = null; });
        }
      } else killBridge();
      return j(res, 200, { ok: true, uniFeed: !!bridge });
    }
    if (url === "/api/music") {
      if (b.mute === true) { await obs.req("SetInputMute", { inputName: "ShowMusic", inputMuted: true }); await obs.req("SetInputMute", { inputName: "ShowRadio", inputMuted: true }); return j(res, 200, { ok: true }); }
      const n = Math.max(0, Math.min(100, parseInt(b.pct, 10) || 0));
      await obs.req("SetInputMute", { inputName: "ShowMusic", inputMuted: false });
      await obs.req("SetInputMute", { inputName: "ShowRadio", inputMuted: false });
      await obs.req("SetInputVolume", { inputName: "ShowMusic", inputVolumeDb: n === 0 ? -60 : -30 + 0.3 * n });
      await obs.req("SetInputVolume", { inputName: "ShowRadio", inputVolumeDb: n === 0 ? -60 : -30 + 0.3 * n });
      return j(res, 200, { ok: true });
    }
    // NEW 2026-07-16: CamHost device binding (sweep B1/B3). Called by the console's device picker.
    // Also persists to runtime/camhost.json so studio_stage.cjs's auto-bind at bring-up honors
    // the operator's pick after a rebuild.
    if (url === "/api/camhost/bind") {
      if (!b || !b.video_device_id) return j(res, 400, { ok: false, err: "video_device_id required (a string from /api/devices .value)" });
      const set = await obs.req("SetInputSettings", { inputName: "CamHost", inputSettings: { video_device_id: String(b.video_device_id) } });
      if (!set.ok) return j(res, 500, { ok: false, err: set.comment });
      try { fs.writeFileSync(path.join(__dirname, "runtime", "camhost.json"), JSON.stringify({ video_device_id: b.video_device_id, at: new Date().toISOString() }, null, 2)); } catch (_) {}
      return j(res, 200, { ok: true, video_device_id: b.video_device_id });
    }
    // Music-on-air gate (per-segment DMCA opt-in per operator policy).
    if (url === "/api/music/on-air") {
      const on = b && b.on === true;
      writeState((st) => { st.musicOnAir = on; });
      return j(res, 200, { ok: true, musicOnAir: on });
    }
    // Broadcast metadata (sweep #19). Free-text professional-broadcast fields. Renders into
    // overlays via spool.meta.*; the CC's metadata panel is a plain form.
    if (url === "/api/meta") {
      const clean = (s, n) => (s == null ? null : String(s).slice(0, n));
      const cleanArr = (a) => (Array.isArray(a) ? a.slice(0, 8).map((x) => clean(x, 120)).filter(Boolean) : null);
      writeState((st) => {
        st.meta = Object.assign({}, st.meta || {}, {
          showTitle: b.showTitle !== undefined ? clean(b.showTitle, 120) : (st.meta && st.meta.showTitle),
          segment: b.segment !== undefined ? clean(b.segment, 120) : (st.meta && st.meta.segment),
          segmentId: b.segmentId !== undefined ? clean(b.segmentId, 48) : (st.meta && st.meta.segmentId),
          airDateUtc: b.airDateUtc !== undefined ? clean(b.airDateUtc, 40) : (st.meta && st.meta.airDateUtc),
          presenter: b.presenter !== undefined ? cleanArr(b.presenter) : (st.meta && st.meta.presenter),
          guest: b.guest !== undefined ? cleanArr(b.guest) : (st.meta && st.meta.guest),
          dateline: b.dateline !== undefined ? clean(b.dateline, 80) : (st.meta && st.meta.dateline),
          kicker: b.kicker !== undefined ? clean(b.kicker, 60) : (st.meta && st.meta.kicker),
          rundown: b.rundown !== undefined ? cleanArr(b.rundown) : (st.meta && st.meta.rundown),
        });
      });
      return j(res, 200, { ok: true });
    }
    // Station bug (sweep #21).
    if (url === "/api/bug") {
      writeState((st) => {
        st.bug = {
          text: b.text ? String(b.text).slice(0, 60) : null,
          corner: /^(tl|tr|bl|br)$/.test(b.corner || "") ? b.corner : "br",
          color: /^#?[0-9a-f]{3,8}$/i.test(b.color || "") ? b.color : "#3fd2ff",
          opacity: Math.max(0, Math.min(1, +b.opacity || 0.85)),
          enabled: b.enabled === true,
        };
      });
      return j(res, 200, { ok: true });
    }
    if (url === "/api/overlay") {
      const text = [b.kicker, b.title, b.subtitle, b.caption, ...(b.ticker || [])].filter(Boolean).join(" ");
      const f = fenceCheck(text, !!b.force);
      if (!f.ok) return j(res, 200, { ok: false, fence: f.word, hint: "Behaviour/viability-learning only (P1=PARTIAL, P2=PROVISIONAL). Reword, or tick FORCE only with a committed receipt." });
      writeState((st) => {
        if (b.kicker !== undefined || b.title !== undefined || b.subtitle !== undefined)
          st.lowerThird = { visible: !!(b.kicker || b.title || b.subtitle), kicker: b.kicker || "", title: b.title || "", subtitle: b.subtitle || "", tone: "ok" };
        if (b.caption !== undefined) st.caption = b.caption ? { visible: true, lang: "en", text: b.caption } : { visible: false, lang: "en", text: "" };
        if (b.ticker !== undefined) st.ticker = (b.ticker || []).filter(Boolean).map((t) => ({ text: t, tone: "ok" }));
      });
      return j(res, 200, { ok: true, forced: !!f.forced });
    }
    if (url === "/api/watermark") {
      // up to 3 image watermarks, positioned as % of the canvas, composited via ovl_watermark.
      const wms = (b.watermarks || []).slice(0, 3).filter((w) => w && w.url).map((w) => ({
        url: String(w.url || "").slice(0, 4000), x: +w.x || 0, y: +w.y || 0, w: +w.w || 12,
        opacity: (w.opacity == null ? 0.85 : Math.max(0, Math.min(1, +w.opacity))), enabled: w.enabled !== false,
      }));
      writeState((st) => { st.watermarks = wms; });
      return j(res, 200, { ok: true, watermarks: wms });
    }
    if (url === "/api/fix") {
      try { return j(res, 200, { ok: true, note: await applyFix(b.what) }); }
      catch (e) { return j(res, 400, { err: e.message }); }
    }
    if (url === "/api/idle") {
      // WS1-L: operator-driven idle / active toggle.
      //   { mode: "idle" }   -> enter sleep (publisher gateway ramps clients to idle profile,
      //                          the 20-min thumbnail sweep pauses)
      //   { mode: "active" } -> exit sleep (auto-restore on next slot-state poll cycle)
      // Note: the middleware above already set idleMode = false + refreshed lastMutation, so a
      // POST with mode:"idle" still needs to explicitly re-set idleMode = true after.
      // M2: never idle while streaming -- it would force every guest cam to the 120kbps heartbeat
      // profile ON AIR. The systray "Toggle Idle" menu can reach here, so guard it server-side.
      if (b.mode === "idle" && mirror.streaming) return j(res, 409, { err: "cannot idle while streaming (guest cameras would collapse on air)" });
      if (b.mode === "idle")   { idleMode = true;  return j(res, 200, { ok: true, idle: true }); }
      if (b.mode === "active") { idleMode = false; return j(res, 200, { ok: true, idle: false }); }
      return j(res, 400, { err: "mode must be 'idle' or 'active'" });
    }
    if (url === "/api/preflight") {
      if (preflightBusy) return j(res, 409, { err: "preflight already running" });
      preflightBusy = true;
      try {
        const checks = await healthChecks();
        // 2026-07-17 (gate preflight-picture-not-bytes): this used `ok: bytes > 2600` — a JPEG of a
        // BLACK frame clears 2600 bytes, so PREFLIGHT `go` could be GREEN on a black show. That is the
        // discredited byte-count the project was explicitly burned by, still live on the GO/NO-GO route
        // while the broadcast test was fixed to pixels 900 lines away. Now it uses the SAME pixel
        // classifier + absent-input SKIP logic the SEEN sweep uses (classifyScenePixels), so an absent
        // camera is SKIP (not a false NO-GO) and only a real black-with-inputs-present fails.
        const regsP = (await httpJson(GATEWAY.port, "/registrations")) || {};
        const liveCamSrc = new Set(
          Object.entries(regsP)
            .filter(([, v]) => v && typeof v.ageMs === "number" && v.ageMs < 30000)
            .map(([k]) => "RemoteCam" + parseInt(String(k).replace("cam", ""), 10))
        );
        const templates = [];
        for (const scene of allTemplates()) {
          await sweepStep(scene);                                   // populates thumbs[scene] (img + pixel frac) for the UI
          const frac = thumbs[scene] ? thumbs[scene].frac : null;
          const v = await classifyScenePixels(scene, frac, liveCamSrc);
          templates.push({ scene, status: v.status, ok: v.status !== "fail", frac: v.frac, detail: v.detail });
        }
        await obs.req("SetCurrentPreviewScene", { sceneName: operatorPreview });
        const critical = ["obs", "overlays", "colonycam", "phoenix", "mc"];
        const templatesFail = templates.filter((t) => t.status === "fail");
        const templatesPass = templates.filter((t) => t.status === "pass");
        // GO = critical health ok AND no scene rendered BLACK with all inputs present AND at least one
        // scene GENUINELY rendered (a sweep that only skipped proved nothing — same convention as stage 3).
        const go = checks.filter((c) => critical.includes(c.id)).every((c) => c.ok)
          && templatesFail.length === 0 && templatesPass.length > 0;
        const warnings = checks.filter((c) => !c.ok && !critical.includes(c.id)).length;
        return j(res, 200, { go, warnings, checks, templates });
      } finally { preflightBusy = false; }
    }
    // P4 (2026-07-12): BROADCAST TEST — the 5-stage SEEN-on-PROGRAM loop the operator presses
    // and watches. Runs in the background; UI polls /api/broadcast_test for progress.
    if (url === "/api/broadcast_test") {
      if (btBusy) return j(res, 409, { err: "broadcast test already running" });
      // F31. THIS PATH HAD NO GUARD AT ALL, and it is the one that is public by owner directive
      // ("NEVER private... only accepts with public egress"). It calls StartStream directly at
      // stage 2. A test that goes to air is going to air, and it needs the same presence the
      // front door needs.
      {
        const refused = golive_guard.refusalResponse("api/broadcast_test");
        if (refused) return j(res, refused.status, refused.body);
      }
      const priv = false; // OWNER DIRECTIVE (2026-07-14): NEVER private. b.private is ignored; the test always runs the one live path and only accepts with public egress.
      btState = { running: true, private: priv, startedAt: new Date().toISOString(), stages: [] };
      btBusy = true;
      // Fire-and-forget; UI polls GET /api/broadcast_test for state.
      runBroadcastTest(priv).finally(() => { btBusy = false; btState.running = false; btState.finishedAt = new Date().toISOString(); });
      return j(res, 202, { ok: true, message: "test started; poll GET /api/broadcast_test" });
    }
    // P6.11: send a cue (message + ttl) to a publisher slot — publisher.cjs :8095/cue forwards it
    // over the WSS control channel; the publisher page renders it as a big centered overlay.
    if (url === "/api/cue") {
      const slot = String(b.slot || "");
      if (!/^cam([1-9]|10)$/.test(slot)) return j(res, 400, { err: "slot must be cam1..cam10" });
      const message = String(b.message || "").slice(0, 120);
      const ttl = Math.max(200, Math.min(10000, Number(b.ttl) || 1200));
      const r = await httpPostJson(GATEWAY.port, "/cue", { slot, message, ttl });
      if (r.status === 200) return j(res, 200, { ok: true });
      if (r.status === 404) return j(res, 404, { err: "slot not connected on publisher" });
      return j(res, 502, { err: "publisher unreachable" });
    }
    if (url === "/api/golive") {
      // G-PA: the OUTWARD cut is human-typed. Accept CONFIRM case-insensitively so a lowercase
      // "confirm" does not silently fail.
      if (String(b.confirm || "").trim().toUpperCase() !== "CONFIRM") return j(res, 400, { err: "type CONFIRM — the outward cut is human-triggered (G-PA)" });
      // F31 (Phase 9 step 3.3). The line above is a STRING COMPARISON ON UNAUTHENTICATED LOOPBACK:
      // `curl -X POST 127.0.0.1:8098/api/golive -d '{"confirm":"CONFIRM"}'` satisfied it entirely.
      // It is kept -- it stops a misclick -- but it is no longer the thing standing between an
      // agent and the air. Presence is.
      {
        const refused = golive_guard.refusalResponse("api/golive");
        if (refused) return j(res, refused.status, refused.body);
      }
      const paths = await httpJson(9997, "/v3/paths/list");
      if (!paths) return j(res, 409, { err: "restreamer not running — set keys and run viewer\\restream.ps1 first" });
      await obs.req("SetStreamServiceSettings", { streamServiceType: "rtmp_custom", streamServiceSettings: { server: "rtmp://127.0.0.1:1935", key: "uni", use_auth: false } });
      const r = await obs.req("StartStream");
      if (r.ok) writeState((st) => { st.onAir = { value: true, text: "LIVE" }; });
      return j(res, 200, { ok: r.ok, err: r.comment });
    }
    if (url === "/api/offair") {
      // STOPPING IS ALWAYS ALLOWED — no CONFIRM barrier. You must be able to kill the stream
      // instantly, one click. The human-typed gate belongs on GO LIVE (the outward cut), never
      // on OFF AIR. (Fixed 2026-07-13: the old CONFIRM requirement made OFF AIR silently fail.)
      const r = await obs.req("StopStream");
      // only drop the on-air pill when the stream actually stopped — never a false OFF AIR
      if (r.ok) writeState((st) => { st.onAir = { value: false, text: "LIVE" }; });
      return j(res, 200, { ok: r.ok, err: r.ok ? undefined : r.comment + " — stream may STILL be live; pill unchanged" });
    }
    res.writeHead(404); res.end("unknown api");
  } catch (e) { j(res, 500, { err: e.message || String(e) }); }
});

obs.connect();
server.listen(PORT, "127.0.0.1", () => console.log(`UNI COMMAND CENTER on http://127.0.0.1:${PORT}/`));
server.on("error", (e) => { console.log("SRVERR " + e.message); process.exit(2); });

// GLASS BADGE PUSHER: stream the real air state to the lab box every 2s over ONE persistent
// ssh pipe -> /opt/uni/services/glass/ui/live/onair.json (uni-owned dir; atomic tmp+mv).
// The glass badge polls that file; if this pusher dies the badge honestly reads STALE.
let pusher = null, lastPushWrite = 0;
function startPusher() {
  const remote = "while IFS= read -r l; do printf '%s' \"$l\" > /opt/uni/services/glass/ui/live/onair.json.tmp && mv -f /opt/uni/services/glass/ui/live/onair.json.tmp /opt/uni/services/glass/ui/live/onair.json; done";
  // FIXED 2026-07-16: this was `uni@10.190.245.122`. The chip's LAN address is a DHCP lease; when it
  // moved to .121 this ssh pipe pointed at a dead host, respawning every 5s forever, and the glass
  // badge silently fell back to reading STALE — a live breakage nobody had noticed. The chip is
  // addressed by NAME now (getaddrinfo -> NRPT -> uni-dns on the chip), so it follows the lease. ssh
  // uses the OS resolver, so it needs no host_resolve.cjs indirection — only browser engines do.
  // StrictHostKeyChecking=accept-new: with BatchMode=yes, ssh cannot prompt, so a host key it has
  // never seen is a hard failure — which is exactly what a switch from an IP to a NAME (or a fresh
  // box) produces, and it manifests as this pusher respawn-looping every 5s with the badge stuck on
  // STALE. accept-new trusts a FIRST-CONTACT key only; a key that CHANGES for a known host is still
  // refused, so the MITM protection that matters is intact (this is not StrictHostKeyChecking=no).
  // Addressing by name also makes the known_hosts entry survive lease moves — the entry is the name.
  pusher = spawn("ssh", ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=10", `uni@${CHIP_SSH_HOST}`, remote], { stdio: ["pipe", "ignore", "ignore"] });
  pusher.on("error", () => { pusher = null; setTimeout(startPusher, 5000); }); // ssh missing/spawn fail must not crash the console
  pusher.stdin.on("error", () => {}); // EPIPE lands async — swallow; exit handler restarts
  pusher.on("exit", () => { pusher = null; setTimeout(startPusher, 5000); });
  console.log("glass badge pusher spawned (lab /glass/live/onair.json)");
}
startPusher();
setInterval(async () => {
  if (!pusher || !pusher.stdin.writable || !obs.connected) return;
  try {
    const air = await airState();
    if (!air) return; // OBS truth unavailable — push NOTHING; the badge honestly goes STALE
    pusher.stdin.write(JSON.stringify({ level: air.level, streaming: air.streaming, visible: air.visible, audible: air.audible, program: air.program, utc: new Date().toISOString() }) + "\n");
    lastPushWrite = Date.now();
  } catch (_) {}
}, 2000).unref();

// READ-ONLY air-status listener for anything else on the LAN (same JSON as the glass badge)
const statusServer = http.createServer(async (req, res) => {
  if ((req.url || "").split("?")[0] !== "/api/onair.json") { res.writeHead(404); return res.end(); }
  try {
    const air = await airState();
    // air === null means OBS unavailable OR mirror unhydrated: emit stale=true so LAN
    // consumers (the lab glass badge, dashboards) render STALE, never a fabricated OFF.
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    if (!air) return res.end(JSON.stringify({ stale: true, utc: new Date().toISOString() }));
    res.end(JSON.stringify({ level: air.level, streaming: air.streaming, visible: air.visible, audible: air.audible, program: air.program, utc: new Date().toISOString() }));
  } catch (e) { res.writeHead(500); res.end("{}"); }
});
statusServer.listen(8097, "0.0.0.0", () => console.log("air-status (read-only) on :8097/api/onair.json"));
statusServer.on("error", (e) => console.log("STATUS SRVERR " + e.message));