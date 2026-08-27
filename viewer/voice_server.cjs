#!/usr/bin/env node
// voice_server.cjs — THE AGENT'S VOICE AS A FIRST-CLASS BROADCAST SOURCE.
//
//   node viewer/voice_server.cjs                      # resident (port 8106)
//   node viewer/voice_server.cjs --say "hello world"   # one-shot from the CLI
//   node viewer/voice_server.cjs --status              # report, change nothing
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS REPLACES THE WINDOWS-AUDIO PATH ENTIRELY
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The operator's directive, live on air 2026-08-02: "stop using windows Audio and make a path so
// that Claude speak is its own dedicated audio source and it fires on its own and manages the duck
// and re level."
//
// The path being replaced captured a whole Windows playback DEVICE ("Desktop Audio") and hoped the
// agent's voice would be on it. Everything about that was fragile, and all of it was measured:
//   * it was bound to a device GUID that no longer exists on this machine (a removed headset), so
//     it captured silence for an unknown length of time while showing a healthy -20.8 dB fader;
//   * the voice was actually playing to the monitor's HDMI audio, a DIFFERENT device, because that
//     is what Windows currently calls default -- and "default" moves when hardware is plugged in;
//   * it captures EVERYTHING that device plays: notification chimes, a browser tab, the music bed.
//     A public broadcast should never carry an open microphone on the whole operating system.
//
// This path has none of that. Piper renders straight to a WAV file, a browser source in OBS fetches
// that file over loopback and plays it through the Web Audio API. No Windows device is captured at
// any point. The chain is: text -> piper.exe -> .wav -> HTTP -> browser source -> OBS audio bus.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// IT FIRES ITSELF, AND IT OWNS THE DUCK
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The page reports back when playback actually STARTS and ENDS -- not when the request was made,
// which is a different and useless moment. Those two edges are the truth about whether a voice is
// on the programme, so this server owns the duck rather than asking another process to infer it
// from a level meter:
//   * on START it drops the music bed to DUCK_FLOOR_DB over DUCK_MS
//   * on END it restores the bed to exactly the level it was at before, over RESTORE_MS
// Because the edges come from the player itself, the duck cannot fire late, hang open on a dropped
// packet, or pump between words -- the three failure modes a meter-threshold duck is prone to.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// LEVEL: THE VOICE SITS WHERE THE MUSIC WAS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The operator's requirement, verbatim: "voice MUST fire at the decible level that music Was
// playing before it ducks, and fade in and out."
//
// So the target is not a fixed number -- it is read from the bed at the moment before ducking.
// TARGET_MATCHES_BED does exactly that: sample the music source's CURRENT dB, and set the voice
// source to it. If the operator moves the music slider, the voice follows on the next utterance,
// which is what "at the level the music was playing" actually means over a four-hour show.
//
// The fade is done in the PAGE, in the Web Audio gain node, not by moving an OBS fader. Moving an
// OBS fader mid-utterance is a stepped, zippery change; a gain-node ramp is sample-accurate.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn, execFileSync } = require("child_process");
const crypto = require("crypto");
const WebSocket = require("ws");

const PORT = 8106;
const OBS = "ws://127.0.0.1:4455";
const SPEAK_DIR = path.join(__dirname, "runtime", "voice");
const LOG = path.join(__dirname, "runtime", "voice_server.ndjson");

// ClaudeSpeak lives outside this repo; its venv holds piper.exe and its models.
const CS = "C:/Users/mpolz/Documents/ClaudeSpeak/claude-voice-connector-stdio";
const PIPER = path.join(CS, "venv", "Scripts", "piper.exe");
const MODELS = path.join(CS, "models");
const DEFAULT_VOICE = "en_GB-jenny_dioco-medium";

// ── the levels ───────────────────────────────────────────────────────────────────────────────────
const MUSIC = ["ShowMusic", "ShowRadio"];
const VOICE_SOURCE = "ovl_voice";        // the browser source this server drives
const TARGET_MATCHES_BED = true;         // voice fires at the bed's pre-duck level (operator's rule)
const VOICE_FALLBACK_DB = -6;            // used only if the bed cannot be read

// ── THE TRIM, AND WHY MATCHING THE FADER IS NOT MATCHING THE LOUDNESS ────────────────────────────
// The operator's rule is that the voice fires "at the decibel level that music WAS playing before
// it ducks". Taking that literally — copying the bed's fader value — produces a voice that is still
// too quiet, and the measurement says exactly why:
//
//   MEASURED 2026-08-02: the music bed's FADER sat at -16.2 dB while its post-fader PEAK metered
//   at -4.5 dB. Music is mastered dense and loud, so it uses nearly all its headroom. A Piper
//   speech waveform at the same fader peaks around the fader value itself, because speech is
//   sparse — long gaps, short transients. Same fader, ~12 dB less perceived loudness.
//
// So "the level the music was playing at" means its LOUDNESS, not its slider position. The trim is
// the difference between those two things, and it is applied on top of the bed's fader so the rule
// still tracks the operator's slider: move the music down and the voice follows it down.
//
// CEILING is a real fence, not a formality. Web Audio does not clip gracefully — pushing a
// normalized speech file above roughly -3 dBFS produces audible distortion on a live broadcast,
// which is worse than being slightly quiet. The trim is clamped, never uncapped.
const VOICE_TRIM_DB = 12;                // how far ABOVE the bed's fader the voice sits
const VOICE_CEILING_DB = -3.5;           // never hotter than this, whatever the arithmetic says
const DUCK_FLOOR_DB = -30;               // where the bed sits while a voice is on
const DUCK_MS = 260;                     // fade the bed DOWN over this
const RESTORE_MS = 700;                  // and back UP over this, slower, so it breathes back in
const KEEP_LAST = 40;                    // how many rendered wavs to retain before pruning

fs.mkdirSync(SPEAK_DIR, { recursive: true });
function record(event, d) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), event, ...d }) + "\n"); } catch (_) {}
}

// ── OBS link (for reading the bed's level and moving it) ─────────────────────────────────────────
let obs = null, obsReady = false, obsId = 0;
const obsPending = {};
function obsReq(requestType, requestData = {}) {
  return new Promise((res, rej) => {
    if (!obsReady) return rej(new Error("obs not ready"));
    const id = "v" + (++obsId);
    obsPending[id] = { res, rej };
    obs.send(JSON.stringify({ op: 6, d: { requestType, requestId: id, requestData } }));
    setTimeout(() => { if (obsPending[id]) { delete obsPending[id]; rej(new Error("timeout " + requestType)); } }, 5000);
  });
}
function obsConnect() {
  obs = new WebSocket(OBS);
  obs.on("message", (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.op === 0) return obs.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
    if (m.op === 2) { obsReady = true; record("obs_connected", {}); return; }
    if (m.op === 7) {
      const p = obsPending[m.d.requestId];
      if (p) { delete obsPending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || "obs error")); }
    }
  });
  obs.on("error", () => {});
  obs.on("close", () => { obsReady = false; setTimeout(obsConnect, 3000); });
}

// Which bed is actually carrying sound right now? The one that is not muted.
async function liveBed() {
  for (const n of MUSIC) {
    try { const r = await obsReq("GetInputMute", { inputName: n }); if (r.inputMuted === false) return n; } catch {}
  }
  return null;
}

let duckState = null;   // { bed, restoreDb } while a duck is held

// ── THE RATCHET, AND WHY READING THE FADER IS NOT ENOUGH (2026-08-02, caught on air) ─────────────
// duckNow() read the bed's CURRENT fader and remembered it as the level to restore to. That is
// correct only if the fader is at rest when it is read. It is not, if the previous utterance's
// RESTORE RAMP is still running: unduck() sets duckState=null BEFORE awaiting its 700ms ramp, so a
// new utterance arriving inside that window sails past the `if (duckState) return` guard and samples
// a fader that is still climbing. Whatever mid-ramp value it happens to catch becomes the new
// restore target — permanently, because the next cycle then restores to THAT.
//
// Caught in the ledger, unambiguously. Eleven consecutive restores read `to: -12.6` (the operator's
// level), then one utterance sent hard on the heels of the previous one produced
// `{"event":"restore","bed":"ShowRadio","to":-27.1}` and the bed stayed at -27.1 — measured stable
// across 10 samples with the duck released. The music sat ~14.5 dB under where the operator put it.
// It needs back-to-back speech to bite, which is exactly what a run of corrections produces, so it
// hides during ordinary use and appears precisely when something is going wrong. Worth saying: the
// first diagnosis of this was right, a hasty retraction called it a false alarm, and the ledger then
// caught it in the act. The evidence is the ledger, not anyone's account of it.
//
// TWO GUARDS, because either alone is insufficient:
//   1. restoreInFlight — if a restore ramp is running, do NOT read the fader; reuse the last level
//      known to be at rest. This is the guard that actually catches this bug (-27.1 is nowhere near
//      the floor, so no floor-based sanity check would have flagged it).
//   2. a floor guard — never adopt a restore target at or below DUCK_FLOOR_DB + 1. A bed sitting at
//      the duck floor is a symptom, not an intent. Secondary net for the case where the process
//      restarts mid-duck and has no remembered level.
let restoreInFlight = false;
let lastRestingDb = null;   // the bed's level last observed with no ramp in flight

async function duckNow() {
  if (duckState) return;                       // already ducked; a second utterance must not stack
  const bed = await liveBed();
  if (!bed) { duckState = { bed: null, restoreDb: null }; return; }
  let db = null;
  if (restoreInFlight) {
    db = lastRestingDb;                        // mid-ramp: the fader is meaningless, use what we knew
    record("duck_used_remembered_level", { bed, remembered: db, why: "restore ramp in flight" });
  } else {
    try { db = (await obsReq("GetInputVolume", { inputName: bed })).inputVolumeDb; } catch {}
    if (db != null && db <= DUCK_FLOOR_DB + 1) {
      record("duck_rejected_floor_level", { bed, read: db, using: lastRestingDb });
      db = lastRestingDb;                      // at/below the duck floor is a symptom, never a target
    }
    if (db != null) lastRestingDb = db;        // a level observed at rest — safe to remember
  }
  duckState = { bed, restoreDb: db };
  // Ramp in steps — OBS has no native fade for an input fader, so we do it ourselves.
  await ramp(bed, db == null ? -16 : db, DUCK_FLOOR_DB, DUCK_MS);
  record("duck", { bed, from: db, to: DUCK_FLOOR_DB });
}

async function unduck() {
  if (!duckState) return;
  const { bed, restoreDb } = duckState;
  duckState = null;
  if (!bed) return;
  restoreInFlight = true;
  try {
    await ramp(bed, DUCK_FLOOR_DB, restoreDb == null ? -16 : restoreDb, RESTORE_MS);
    record("restore", { bed, to: restoreDb });
  } finally {
    restoreInFlight = false;                   // must clear even if the ramp threw, or every later
  }                                            // duck would reuse a stale remembered level forever
}

async function ramp(input, fromDb, toDb, ms) {
  const steps = Math.max(4, Math.round(ms / 40));
  for (let i = 1; i <= steps; i++) {
    const db = fromDb + ((toDb - fromDb) * (i / steps));
    try { await obsReq("SetInputVolume", { inputName: input, inputVolumeDb: db }); } catch {}
    await new Promise((r) => setTimeout(r, ms / steps));
  }
}

// The level the voice should fire at: the bed's own pre-duck level, plus the trim that turns
// "same fader" into "same loudness", clamped so it can never distort.
async function voiceTargetDb() {
  let base = VOICE_FALLBACK_DB;
  if (TARGET_MATCHES_BED) {
    const remembered = duckState ? duckState.restoreDb : null;
    if (remembered != null) base = remembered;
    else {
      const bed = duckState ? duckState.bed : await liveBed();
      if (bed) { try { base = (await obsReq("GetInputVolume", { inputName: bed })).inputVolumeDb; } catch {} }
    }
  }
  return Math.min(base + VOICE_TRIM_DB, VOICE_CEILING_DB);
}

// ── render ───────────────────────────────────────────────────────────────────────────────────────
function render(text, voice) {
  return new Promise((resolve, reject) => {
    const model = path.join(MODELS, (voice || DEFAULT_VOICE) + ".onnx");
    if (!fs.existsSync(model)) return reject(new Error("no model " + path.basename(model)));
    const id = crypto.randomBytes(8).toString("hex");
    const out = path.join(SPEAK_DIR, id + ".wav");
    const p = spawn(PIPER, ["-m", model, "-f", out], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error("piper exit " + code + " " + err.slice(0, 200)));
      resolve({ id, file: out, bytes: fs.statSync(out).size });
    });
    p.stdin.write(text); p.stdin.end();
  });
}

function prune() {
  try {
    const files = fs.readdirSync(SPEAK_DIR).filter((f) => f.endsWith(".wav"))
      .map((f) => ({ f, t: fs.statSync(path.join(SPEAK_DIR, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const x of files.slice(KEEP_LAST)) { try { fs.unlinkSync(path.join(SPEAK_DIR, x.f)); } catch {} }
  } catch {}
}

// ── the page's socket ────────────────────────────────────────────────────────────────────────────
const clients = new Set();
let speaking = false;

function pushToPage(msg) {
  const s = JSON.stringify(msg);
  for (const ws of clients) { try { ws.send(s); } catch {} }
}

async function say(text, voice) {
  const r = await render(text, voice);
  prune();
  const targetDb = await voiceTargetDb();
  // Duck FIRST, then hand the page the clip. The bed is already moving before the first phoneme.
  await duckNow();
  pushToPage({ type: "play", id: r.id, url: "/audio/" + r.id + ".wav", targetDb, fadeInMs: 90, fadeOutMs: 220 });
  record("say", { id: r.id, bytes: r.bytes, targetDb, chars: text.length, clients: clients.size });
  return { id: r.id, bytes: r.bytes, targetDb, delivered_to: clients.size };
}

// ── HTTP ─────────────────────────────────────────────────────────────────────────────────────────
const PAGE = path.join(__dirname, "..", "production", "overlays", "voice.html");

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://127.0.0.1:" + PORT);
  const send = (code, type, body) => { res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };

  if (u.pathname === "/voice.html" || u.pathname === "/") {
    try { return send(200, "text/html; charset=utf-8", fs.readFileSync(PAGE)); }
    catch { return send(500, "text/plain", "voice.html missing at " + PAGE); }
  }
  if (u.pathname.startsWith("/audio/")) {
    const f = path.join(SPEAK_DIR, path.basename(u.pathname));
    if (!fs.existsSync(f)) return send(404, "text/plain", "gone");
    res.writeHead(200, { "Content-Type": "audio/wav", "Content-Length": fs.statSync(f).size, "Cache-Control": "no-store" });
    return fs.createReadStream(f).pipe(res);
  }
  if (u.pathname === "/healthz") {
    return send(200, "application/json", JSON.stringify({ ok: true, clients: clients.size, speaking, ducked: !!duckState, obs: obsReady }));
  }
  if (u.pathname === "/api/say" && req.method === "POST") {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", async () => {
      let j = {}; try { j = JSON.parse(body); } catch {}
      if (!j.text) return send(400, "application/json", JSON.stringify({ err: "text required" }));
      if (!clients.size) return send(503, "application/json", JSON.stringify({ err: "no browser source connected — is ovl_voice on a scene and loaded?" }));
      try { const r = await say(String(j.text), j.voice); send(200, "application/json", JSON.stringify({ ok: true, ...r })); }
      catch (e) { send(500, "application/json", JSON.stringify({ err: String(e.message) })); }
    });
    return;
  }
  send(404, "text/plain", "no");
});

const wss = new WebSocket.Server({ server, path: "/ws" });
wss.on("connection", (ws) => {
  clients.add(ws);
  record("page_connected", { clients: clients.size });
  ws.on("message", async (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    // THE EDGES THAT MATTER. These come from the player, so they are the truth about whether a
    // voice is actually on the programme right now.
    if (m.type === "started") { speaking = true; record("play_started", { id: m.id }); }
    else if (m.type === "ended") {
      speaking = false; record("play_ended", { id: m.id, ms: m.ms });
      await unduck();
    }
  });
  ws.on("close", async () => {
    clients.delete(ws);
    record("page_gone", { clients: clients.size });
    // If the page vanishes mid-utterance the duck would hang open forever. Release it.
    if (!clients.size && duckState) { speaking = false; await unduck(); record("duck_released_on_disconnect", {}); }
  });
});

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes("--status")) {
  http.get("http://127.0.0.1:" + PORT + "/healthz", { timeout: 3000 }, (r) => {
    let s = ""; r.on("data", (d) => (s += d)); r.on("end", () => { console.log(s); process.exit(0); });
  }).on("error", () => { console.log("voice_server not running on " + PORT); process.exit(1); });
} else if (argv.includes("--say")) {
  const text = argv[argv.indexOf("--say") + 1] || "test";
  const body = JSON.stringify({ text });
  const r = http.request({ host: "127.0.0.1", port: PORT, path: "/api/say", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
    let s = ""; res.on("data", (d) => (s += d)); res.on("end", () => { console.log(s); process.exit(res.statusCode === 200 ? 0 : 1); });
  });
  r.on("error", (e) => { console.log("not running: " + e.message); process.exit(1); });
  r.write(body); r.end();
} else {
  obsConnect();
  server.listen(PORT, "127.0.0.1", () => {
    console.log("voice_server on http://127.0.0.1:" + PORT + " — ovl_voice should point at /voice.html");
    console.log("  the voice fires at the bed's own pre-duck level; the bed ducks to " + DUCK_FLOOR_DB + "dB and fades back over " + RESTORE_MS + "ms");
  });
}
