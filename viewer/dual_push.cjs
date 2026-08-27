#!/usr/bin/env node
// dual_push.cjs — durable simulcast to YouTube AND Twitch from the local relay.
//
//   node viewer/dual_push.cjs            # start both pushers, supervise forever (auto-restart)
//   node viewer/dual_push.cjs --status   # report each pusher + the relay readers, change nothing
//   node viewer/dual_push.cjs --stop     # stop both pushers
//
// ARCHITECTURE, AND WHY IT IS DURABLE
// -----------------------------------
// OBS encodes ONCE to the local relay rtmp://127.0.0.1:1935/uni. Two independent `ffmpeg -c copy`
// pushers read that one stream and forward it, one to YouTube, one to Twitch. Copy, not re-encode —
// so a pusher costs almost nothing and adds no quality loss.
//
// Durability is the whole point:
//   - If YouTube drops, the Twitch pusher never notices, and vice-versa.
//   - If a pusher dies, THIS process respawns it within 2s, forever.
//   - If OBS drops the relay feed, the pushers wait and reconnect when it returns.
//   - OBS never has to re-encode or change destination when a platform blips.
//
// KEYS come from viewer/runtime/air_destination.json (local-only, gitignored). They are passed to
// ffmpeg as arguments and never written to a log by this file.
"use strict";

const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");

const RELAY = "rtmp://127.0.0.1:1935/uni";
const KEYS_FILE = path.join(__dirname, "runtime", "air_destination.json");
const STATE = path.join(__dirname, "runtime", "dual_push.json");
const LOG = path.join(__dirname, "runtime", "dual_push.ndjson");

function record(event, d) {
  const row = { at: new Date().toISOString(), event, ...d };
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify(row) + "\n"); } catch (_) {}
}
function ffmpegPath() {
  // prefer PATH; fall back to the winget install seen on this box
  try { execFileSync("ffmpeg", ["-hide_banner", "-version"], { stdio: "ignore", timeout: 8000 }); return "ffmpeg"; } catch (_) {}
  const wg = "C:\\Users\\mpolz\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0-full_build\\bin\\ffmpeg.exe";
  if (fs.existsSync(wg)) return wg;
  throw new Error("ffmpeg not found on PATH and not at the known winget location");
}
function targets() {
  const d = JSON.parse(fs.readFileSync(KEYS_FILE, "utf8"));
  const list = [];
  if (d.youtube_key) list.push({ name: "youtube", url: `rtmps://a.rtmps.youtube.com:443/live2/${d.youtube_key}` });
  if (d.twitch_key) list.push({ name: "twitch", url: `rtmp://live.twitch.tv/app/${d.twitch_key}` });
  // back-compat: the single OBS destination key is YouTube's
  if (!d.youtube_key && d.streamServiceSettings && d.streamServiceSettings.key)
    list.push({ name: "youtube", url: `rtmps://a.rtmps.youtube.com:443/live2/${d.streamServiceSettings.key}` });
  return list;
}
const mtx = (p) => new Promise((res) => {
  const req = http.get("http://127.0.0.1:9997" + p, { timeout: 4000 }, (r) => { let s = ""; r.on("data", (d) => s += d); r.on("end", () => { try { res(JSON.parse(s)); } catch { res(null); } }); });
  req.on("error", () => res(null)); req.on("timeout", () => { req.destroy(); res(null); });
});

async function relayReaders() {
  const j = await mtx("/v3/paths/list");
  const u = j && (j.items || []).find((p) => p.name === "uni");
  return { ready: u ? !!u.ready : false, readers: u ? (u.readers || []).length : 0 };
}

// ── supervise one pusher ─────────────────────────────────────────────────────────────────────────
const FF = ffmpegPath();
const procs = {};
function startPusher(t) {
  // -c copy: no re-encode. -reconnect: ride through relay/platform blips. flush + tcp keepalive.
  const args = [
    "-hide_banner", "-loglevel", "warning",
    "-rw_timeout", "15000000",
    "-i", RELAY,
    "-c", "copy", "-f", "flv",
    "-flvflags", "no_duration_filesize",
    t.url,
  ];
  const p = spawn(FF, args, { stdio: ["ignore", "ignore", "pipe"] });
  procs[t.name] = { proc: p, startedAt: Date.now(), restarts: (procs[t.name] ? procs[t.name].restarts : 0) };
  record("pusher_started", { target: t.name });
  let lastErr = "";
  p.stderr.on("data", (d) => { lastErr = String(d).split(/\r?\n/).filter(Boolean).slice(-1)[0] || lastErr; });
  p.on("exit", (code) => {
    record("pusher_exited", { target: t.name, code, lastErr: lastErr.slice(0, 200) });
    if (!stopping) { procs[t.name].restarts++; setTimeout(() => startPusher(t), 2000); }
  });
}

let stopping = false;
function writeState() {
  const s = { at: new Date().toISOString(), pushers: {} };
  for (const [name, p] of Object.entries(procs)) s.pushers[name] = { alive: !p.proc.killed && p.proc.exitCode === null, restarts: p.restarts, up_s: Math.round((Date.now() - p.startedAt) / 1000) };
  try { fs.writeFileSync(STATE, JSON.stringify(s, null, 2)); } catch (_) {}
}

(async () => {
  const argv = process.argv.slice(2);

  if (argv.includes("--stop")) {
    // kill any ffmpeg pushing to youtube/twitch
    try { execFileSync("powershell", ["-NoProfile", "-Command", "Get-CimInstance Win32_Process -Filter \"Name='ffmpeg.exe'\" | Where-Object { $_.CommandLine -like '*rtmps://a.rtmps.youtube*' -or $_.CommandLine -like '*live.twitch.tv*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], { stdio: "ignore", timeout: 20000 }); } catch (_) {}
    console.log("stopped both pushers");
    process.exit(0);
  }

  if (argv.includes("--status")) {
    const r = await relayReaders();
    let st = {}; try { st = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (_) {}
    console.log(`relay uni: ready=${r.ready} readers=${r.readers}`);
    console.log("pushers:", JSON.stringify(st.pushers || {}, null, 0));
    process.exit(0);
  }

  const tg = targets();
  if (!tg.length) { console.error("no keys in " + KEYS_FILE); process.exit(1); }
  console.log("simulcasting to:", tg.map((t) => t.name).join(" + "));

  const r = await relayReaders();
  if (!r.ready) console.log("WARNING: relay 'uni' is not receiving yet — point OBS at " + RELAY + " and start streaming. Pushers will connect when it does.");

  for (const t of tg) startPusher(t);
  setInterval(writeState, 5000);
  console.log("supervising — pushers auto-restart on exit; Ctrl+C or --stop to end.");
  process.on("SIGINT", () => { stopping = true; for (const p of Object.values(procs)) try { p.proc.kill("SIGKILL"); } catch (_) {} process.exit(0); });
})();
