#!/usr/bin/env node
// music_director.cjs — the music bed ducks itself under the operator's voice, and NEVER touches the
// scene.
//
//   node viewer/music_director.cjs            # resident: duck music when the host mic is hot
//   node viewer/music_director.cjs --status    # print the current mic/duck state, change nothing
//
// WHAT THE OPERATOR ASKED FOR, AND THE TRAP THAT WAS THERE.
// The "AUTO" button sat in the Music panel but called /api/auto — SCENE auto-rotate, whose default
// beat list starts with COLONY:28. So pressing it to "turn the music on" yanked the program to the
// COLONY scene instead of keeping the operator's active shot. This process is the real thing that
// button implied: music that manages ITSELF against the microphone and leaves the picture alone.
//
// BEHAVIOR. When MicHost is unmuted (the host is talking), the bed ducks by DUCK_DB so the voice sits
// on top. When the mic goes cold, the bed returns to exactly the level the operator last set with the
// volume slider. It ONLY moves ShowMusic/ShowRadio volume, ONLY at the mic's on/off edges, and NEVER
// mutes, unmutes, or changes a scene — the operator keeps full manual control of the slider and the
// program.
//
// WHY EDGE-ONLY. The operator's volume slider (/api/music) owns the level while the mic is cold; this
// process reads that level at the cold→hot edge and restores it at hot→cold, so the two never fight.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { createEngine, readConfig } = require("./camera_duck_engine.cjs");

const OBS = "ws://127.0.0.1:4455";     // unauthenticated on loopback (operator-accepted, S2)
const MUSIC = ["ShowMusic", "ShowRadio"];
const MIC = "MicHost";
const DESKTOP = "Desktop Audio";       // captures Piper (agent voice) via Windows default output
const DUCK_DB = 15;                    // how far the bed drops under a live mic
const EVERY_MS = 1500;
const LOG = path.join(__dirname, "runtime", "music_director.ndjson");

// ── CAMERA-MIC THREE-STATE DUCK (gate camera-mic-ducking-and-slot-awareness, 2026-08-03) ────────
// Purpose. The mic-duck above watches MicHost ONLY (line 30). When the operator picks a camera as
// voice via command_center.setVoice() (line 402), MicHost is MUTED and one of RemoteCam1..10 is
// unmuted — so micIsHot() reads MicHost as cold and NO duck fires. That is the live symptom
// the operator reported (audio from cameras is no longer ducking).
//
// This block adds a SEPARATE three-state camera duck via the pure viewer/camera_duck_engine.cjs
// module, with two hard rules:
//   1. voice_server owns the fader. Every camera-originated write is preceded by a fresh voice-
//      ownership check consulting BOTH /healthz and viewer/runtime/voice_server.ndjson. Any
//      ambiguity fails closed to CEDE — no write.
//   2. enforceOneBed() and the existing MicHost duck are untouched. The camera duck only writes
//      after both of those had a chance to run and voice_server is not the current writer.
//
// The engine defaults to STUB mode. UNI_CAMERA_DUCK_FULL=1 activates full three-state logic
// including TUCK, 10s trailing, mute filter, and ceding. This is set BELOW so the service always
// runs in full mode when launched by studio_up.ps1 / restart; the flag is a safety valve.
process.env.UNI_CAMERA_DUCK_FULL = process.env.UNI_CAMERA_DUCK_FULL || "1";
const CAMS = Array.from({ length: 10 }, (_, i) => "RemoteCam" + (i + 1));
const camCfg = readConfig(process.env);
const camEngine = createEngine(camCfg);
const VOICE_HEALTHZ = "http://127.0.0.1:8106/healthz";
const VOICE_LEDGER = path.join(__dirname, "runtime", "voice_server.ndjson");
const RAMP_SLACK_MS = 2000;             // voice_server DUCK_MS+RESTORE_MS + slack — treat any
                                        //   non-settled ledger event younger than this as RAMPING
const SETTLED_EVENTS = new Set(["restore", "obs_connected", "page_connected", "page_gone", "duck_released_on_disconnect"]);

// Per-cam mute mirror. Populated at connect + updated by InputMuteStateChanged events.
// Missing / null / undefined here means UNKNOWN — treated as NOT unmuted (fail-closed).
const camMute = new Map();               // 'RemoteCam1' -> boolean OR undefined
// Per-cam meter ring buffer of most recent peak-dB frames.
const camMeterHist = new Map();          // 'RemoteCam1' -> [peakDb, ...]

// ── RATCHET GUARD ────────────────────────────────────────────────────────────────────────────
// Caught LIVE on air 2026-08-03: my first deploy of this camera-duck path ratcheted ShowRadio
// -20.7 → -95.7 dB in 7 seconds. The mechanism: readOperatorLevel() called GetInputVolume every
// tick and treated the CURRENT live fader as the operator level. After the first duck-write
// (fader now sitting at operator-DUCK_DB), the next tick read THAT ducked value as the new
// operator level and ducked DUCK_DB again. Classic feedback loop — the same class as the
// voice_server ratchet I fixed earlier the same day and clearly did not learn from in the design.
//
// Fix: capture the operator level ONCE, at the RESTORED → DUCK/TUCK transition, and reuse it as
// operator_level_db for the DURATION of the duck. Reset on the transition back to RESTORED. While
// a camera-owned duck is active, NEVER read the live fader as the operator level — it is our own
// write.
//
// The mic-duck above solves the same class of problem via its `ceiling[n]` map (line 214 captures
// at cold→hot edge, line 220 restores at hot→cold). The camera-duck now has the same structure
// with `camCeiling`. If the mic-duck is currently active we cede entirely so both ceilings cannot
// race (see the mic_duck_active cede branch in cameraDuckTick).
const camCeiling = { ShowMusic: null, ShowRadio: null };

// Consult voice_server ownership. Returns { status, reason }.
async function consultVoiceOwnership() {
  // 1) /healthz — primary "is currently ducked / speaking" signal.
  let hz = null;
  try {
    hz = await new Promise((res, rej) => {
      const r = http.get(VOICE_HEALTHZ, { timeout: 500 }, (rs) => {
        let b = ""; rs.on("data", (d) => (b += d));
        rs.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
      });
      r.on("error", rej); r.on("timeout", () => { r.destroy(); rej(new Error("timeout")); });
    });
  } catch (e) {
    return { status: "UNKNOWN", reason: "healthz_unreachable:" + e.message };
  }
  if (hz && (hz.ducked === true || hz.speaking === true)) {
    return { status: "OWNS", reason: "healthz_active" };
  }
  // 2) Ledger tail — detect ramp gap. /healthz says "not ducked" but ramp may still be running.
  try {
    const raw = fs.readFileSync(VOICE_LEDGER, "utf8");
    const lines = raw.trim().split("\n");
    if (lines.length === 0) return { status: "IDLE", reason: "ledger_empty" };
    const last = JSON.parse(lines[lines.length - 1]);
    if (SETTLED_EVENTS.has(last.event)) {
      return { status: "IDLE", reason: "settled_" + last.event };
    }
    const ageMs = Date.now() - new Date(last.at).getTime();
    if (Number.isFinite(ageMs) && ageMs < RAMP_SLACK_MS) {
      return { status: "RAMPING", reason: "ledger_" + last.event + "_" + Math.round(ageMs) + "ms" };
    }
    // Old non-settled event AND /healthz says idle → most likely IDLE, but be conservative.
    return { status: "IDLE", reason: "ledger_stale_" + last.event };
  } catch (e) {
    return { status: "UNKNOWN", reason: "ledger_unreadable:" + e.message };
  }
}

// Which bed is currently the audible one? Reuses enforceOneBed's rule: prefer ShowRadio if PLAYING.
// This is best-effort: on failure return null and the camera tick skips this cycle.
async function activeBed() {
  try {
    const rm = await req("GetMediaInputStatus", { inputName: "ShowRadio" }).catch(() => null);
    const radioPlaying = rm && rm.mediaState === "OBS_MEDIA_STATE_PLAYING";
    if (radioPlaying) return "ShowRadio";
    return "ShowMusic";
  } catch { return null; }
}

// Read the OPERATOR-set level for the bed. Ratchet-safe: never returns a value we ourselves wrote.
//   1. If a camera-owned ceiling is already captured for this bed → return the captured ceiling.
//      This is the whole point — during a camera duck, the live fader is OUR write, not the
//      operator's. Reading it would create the feedback loop that ratcheted the fader to silence.
//   2. If the mic-duck is currently active → use its `ceiling[bed]` (its own capture at cold→hot).
//      We cede in that branch anyway, but this makes the read safe as defense in depth.
//   3. Otherwise (RESTORED, no active duck) → the live fader IS the operator level. Read it.
async function readOperatorLevel(bed) {
  try {
    if (camCeiling[bed] != null) return camCeiling[bed];
    if (ducked && ceiling[bed] != null) return ceiling[bed];
    const v = await req("GetInputVolume", { inputName: bed });
    return v.inputVolumeDb;
  } catch { return null; }
}

// One camera-duck tick. Runs AFTER the existing tick()'s work is complete.
async function cameraDuckTick() {
  // Fail-closed: any unknown → cede.
  const own = await consultVoiceOwnership();
  if (own.status !== "IDLE") {
    record("CAM_DUCK_CEDED", { owner: "voice_server", reason: own.status.toLowerCase() + ":" + own.reason });
    return;
  }
  // Also cede if the MIC duck (existing) is currently active — the existing engine already ducked
  // the bed for MicHost; adding a camera write on top would be a second controller on the fader.
  if (ducked) {
    record("CAM_DUCK_CEDED", { owner: "mic_duck", reason: "mic_duck_active" });
    return;
  }
  const bed = await activeBed();
  if (!bed) return;
  const opLevel = await readOperatorLevel(bed);
  if (opLevel == null) return;

  // Build normalized inputs for the engine. Missing per-cam mute → engine treats as NOT unmuted.
  const ui_mute = {};
  const recent_hot = {};
  for (const cam of CAMS) {
    ui_mute[cam] = camMute.has(cam) ? camMute.get(cam) : null;
    const hist = camMeterHist.get(cam) || [];
    recent_hot[cam] = hist.some((p) => p > camCfg.HOT_DB);
  }

  const now = performance.now();
  const decision = camEngine.evaluate({
    ui_mute, recent_hot,
    voice_owned: false,                  // already checked above; engine's own ceding is defense-in-depth
    monotonic_now_ms: now,
    operator_level_db: opLevel,
  });

  if (decision.action === "cede" || decision.action === "nothing") return;
  if (decision.action !== "write") return;

  // Re-consult ownership RIGHT before the write — voice_server may have grabbed the fader
  // during our own evaluation window.
  const own2 = await consultVoiceOwnership();
  if (own2.status !== "IDLE") {
    record("CAM_DUCK_CEDED", { owner: "voice_server", reason: own2.status.toLowerCase() + ":" + own2.reason + ":pre-write" });
    return;
  }

  // ── Ceiling capture / release at state edges ────────────────────────────────────────────────
  // RESTORED → DUCK/TUCK: capture the current opLevel (which came from the LIVE fader per branch
  //   3 of readOperatorLevel, since camCeiling was null and mic-duck was not active). This is the
  //   value we hand to the engine as operator_level_db for the DURATION of the duck.
  if (decision.prevState === "RESTORED" && decision.state !== "RESTORED" && camCeiling[bed] == null) {
    camCeiling[bed] = opLevel;
    record("CAM_DUCK_CEILING_CAPTURED", { bed, opLevelDb: opLevel });
  }
  // Absolute-value sanity clamp before writing. OBS input volume range is [-100, +26] dB. A
  // target below -100 is rejected by OBS anyway; here we clamp to -95 so we never write silence
  // and we log the clamp. This is defence-in-depth for a still-hidden bug that produces an
  // out-of-range target — the on-air ratchet from the first deploy hit exactly this.
  let target = decision.target_db;
  let clamped = false;
  if (target < -95) { target = -95; clamped = true; }
  if (target > 0)   { target = 0;   clamped = true; }
  try {
    await req("SetInputVolume", { inputName: bed, inputVolumeDb: target });
    record("CAM_DUCK_WRITE", {
      state: decision.state, prevState: decision.prevState, targetDb: target,
      clamped, requestedTargetDb: decision.target_db,
      bed, opLevelDb: opLevel, unmutedCams: decision.unmutedCams, anyHot: decision.anyUnmutedHot,
    });
  } catch (e) {
    record("CAM_DUCK_WRITE_ERR", { err: e.message, targetDb: target, bed });
  }

  // any → RESTORED: release the captured ceiling AFTER the restore write succeeded, so the next
  // duck cycle captures a fresh ceiling from the (now-restored) live fader.
  if (decision.state === "RESTORED" && camCeiling[bed] != null) {
    record("CAM_DUCK_CEILING_RELEASED", { bed, releasedCeilingDb: camCeiling[bed] });
    camCeiling[bed] = null;
  }
}

// Hydrate per-cam mute map at connect. Missing / errored inputs are LEFT unset (UNKNOWN).
async function hydrateCamMuteMap() {
  for (const cam of CAMS) {
    try {
      const r = await req("GetInputMute", { inputName: cam });
      camMute.set(cam, !!r.inputMuted);
    } catch { /* leave unset — treated as UNKNOWN, fail-closed */ }
  }
  record("CAM_DUCK_MUTE_HYDRATED", { size: camMute.size });
}

// ── RETIRED 2026-08-02, SAME DAY IT WAS BUILT, AND THE REASON IS WORTH KEEPING ───────────────────
// DESKTOP_VOICE_DUCK is now false. The level-threshold duck below was correct engineering for the
// wrong architecture: it inferred "is the agent speaking" by watching the peak level of a Windows
// DEVICE capture, because at that moment the agent's voice had no source of its own.
//
// It does not any more. viewer/voice_server.cjs renders Piper to a file, plays it through the
// `ovl_voice` browser source inside OBS, and receives `started` / `ended` from the PLAYER ITSELF.
// Those edges are ground truth, not an inference from a meter, so voice_server owns the duck and
// owns it better: it cannot fire late, cannot pump between words, and cannot hang open on a missed
// packet the way a threshold can.
//
// TWO DUCK CONTROLLERS ON ONE BED IS A FAULT, not redundancy. If both ran, each would read a level
// the other had just moved and they would fight — the bed would stair-step or stick at the floor.
// So this one stands down. The code is kept, not deleted, because it is the honest record of how
// the problem was solved before the right source existed, and because if the browser-source path
// ever has to be abandoned this is the fallback that is already known to work.
//
// The MIC duck below is UNTOUCHED and still live. That one has always been edge-triggered off the
// operator's own mute flag, which is ground truth for the same reason.
const DESKTOP_VOICE_DUCK = false;

// LEVEL-BASED DUCKING for Desktop Audio (the agent's own voice), added 2026-08-02.
// The operator's directive on air: "make certain volume is dynamic and test to fade music when you
// speak". Piper renders through Windows default output; Desktop Audio captures it; and neither the
// mute flag nor the volume slider says WHEN audio is actually flowing. So the honest signal is the
// live meter — subscribe to OBS InputVolumeMeters and threshold Desktop Audio's peak. Above
// DESKTOP_HOT_DB for a moment, treat it as a hot voice and duck the bed; below DESKTOP_COLD_DB for
// COLD_MS, restore. Hysteresis is deliberate — a single quiet frame between words must not release
// the duck (that produces the "pumping" artifact everyone knows).
const DESKTOP_HOT_DB = -45;            // above this on any meter tick → the agent is speaking
const DESKTOP_COLD_DB = -55;           // below this for COLD_MS → the agent is silent
const COLD_MS = 900;                   // how long silence must persist before we restore

const statusOnly = process.argv.includes("--status");
function record(event, d) { try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), event, ...d }) + "\n"); } catch (_) {} }

let ws, identified = false, reqId = 0;
const pending = {};
function req(requestType, requestData = {}) {
  return new Promise((res, rej) => {
    if (!identified) return rej(new Error("not identified"));
    const id = "m" + (++reqId);
    pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: id, requestData } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout")); } }, 4000);
  });
}

let ducked = false;
const ceiling = {};   // per-source dB the operator last set (captured at the cold→hot edge)

// Level-based state for the Desktop Audio channel (the agent's voice via Piper). Populated by the
// InputVolumeMeters event handler; consulted in every tick.
let desktopHot = false;               // true when we believe Piper is speaking right now
let lastDesktopHotAt = 0;             // timestamp of the last frame that crossed HOT
let lastDesktopSample = -Infinity;    // debug: last peak we saw

async function micIsHot() {
  const r = await req("GetInputMute", { inputName: MIC });   // hot == not muted
  return r.inputMuted === false;
}

// Peak-picker for one meter frame. OBS v5 sends `inputLevelsMul` as an array of channel arrays,
// each channel a triple [magnitude, peak, inputPeak] in LINEAR units (0..1). We take the loudest
// peak across all channels and convert to dB. A silent frame is 0 → -Infinity, which the threshold
// treats as cold. This is the correct signal for "is there sound on this input right now".
function frameToPeakDb(inputLevelsMul) {
  if (!Array.isArray(inputLevelsMul) || !inputLevelsMul.length) return -Infinity;
  let peak = 0;
  for (const ch of inputLevelsMul) {
    if (!Array.isArray(ch)) continue;
    for (const v of ch) if (typeof v === "number" && v > peak) peak = v;
  }
  if (peak <= 0) return -Infinity;
  return 20 * Math.log10(peak);
}

function onMeters(inputs) {
  // Camera meter path — always active. Populates camMeterHist for the pure engine.
  // Bounded per-cam ring buffer; malformed frames yield -Infinity via frameToPeakDb which never
  // exceeds HOT_DB so a broken payload can never falsely trigger DUCK/TUCK.
  const arr = inputs || [];
  for (const inp of arr) {
    if (!inp || typeof inp.inputName !== "string") continue;
    if (!inp.inputName.startsWith("RemoteCam")) continue;
    if (!CAMS.includes(inp.inputName)) continue;
    const peak = frameToPeakDb(inp.inputLevelsMul);
    const hist = camMeterHist.get(inp.inputName) || [];
    hist.push(peak);
    while (hist.length > camCfg.HOT_WINDOW_FRAMES) hist.shift();
    camMeterHist.set(inp.inputName, hist);
  }
  if (!DESKTOP_VOICE_DUCK) return;   // voice_server.cjs owns the voice duck now — see the note above
  const now = Date.now();
  const me = arr.find((i) => i.inputName === DESKTOP);
  if (!me) return;
  const db = frameToPeakDb(me.inputLevelsMul);
  lastDesktopSample = db;
  if (db > DESKTOP_HOT_DB) {
    if (!desktopHot) record("desktop_hot_edge", { db: +db.toFixed(1) });
    desktopHot = true;
    lastDesktopHotAt = now;
  } else if (desktopHot && db < DESKTOP_COLD_DB && (now - lastDesktopHotAt) > COLD_MS) {
    // Silence has persisted long enough — the agent has stopped speaking.
    desktopHot = false;
    record("desktop_cold_edge", { silent_ms: now - lastDesktopHotAt });
  }
}

// ── ONE BED AT A TIME ────────────────────────────────────────────────────────────────────────────
// Caught live on air 2026-08-02: the operator heard TWO music streams at once. Cause — /api/music
// (command_center.cjs:2025-2028) unmutes ShowMusic AND ShowRadio together, so when the program is a
// music scene carrying the live radio (MUSIC_CARD/MUSIC_HOUR use ShowRadio), the looping bed plays
// UNDERNEATH it. Two beds is not redundancy, it is a fault the audience hears.
//
// The rule: whichever bed the PROGRAM scene actually carries is the one that sounds; the other is
// muted. A scene with neither leaves both alone (nothing to arbitrate). Enforced every tick, so a
// slider move or a scene cut can never leave two running.
// ── AND THE FALLBACK MUST BE REAL (2026-08-02, second pass) ─────────────────────────────────────
// The rule above picked ShowRadio purely because the scene CONTAINED it — never because it was
// actually producing audio. That was survivable while the radio lived on 3 scenes and the file bed
// played everywhere else. Once ShowRadio became THE bed on every scene, it stopped being survivable:
// if the music service died, `keep` would still be ShowRadio, ShowMusic would stay MUTED, and EVERY
// SHOT WOULD GO SILENT and stay silent until a human noticed. Before that change the file bed would
// simply have kept playing. Calling the muted file an "instant fallback" was an overstatement — it
// was loaded, and nothing was ever going to unmute it.
//
// So `keep` is now decided by whether the radio is genuinely PLAYING, not by scene membership.
// HYSTERESIS, deliberately asymmetric: a stream blips in and out on a reconnect
// (reconnect_delay_sec:3), so falling BACK requires DEAD_TICKS consecutive not-PLAYING samples
// (~6s at 1.5s/tick) to avoid flapping the bed mid-song, while returning to the radio is immediate
// on the first healthy sample — the live service should win the moment it can.
const DEAD_TICKS = 4;
let radioDeadFor = 0;
async function radioIsPlaying() {
  try {
    const st = (await req("GetMediaInputStatus", { inputName: "ShowRadio" })).mediaState;
    return st === "OBS_MEDIA_STATE_PLAYING";
  } catch { return null; }                             // OBS blip — unknown, do not count it as dead
}

async function enforceOneBed() {
  let program, names;
  try {
    program = (await req("GetCurrentProgramScene")).currentProgramSceneName;
    names = new Set(((await req("GetSceneItemList", { sceneName: program })).sceneItems || []).map((i) => i.sourceName));
  } catch { return; }
  const onProgram = MUSIC.filter((n) => names.has(n));
  if (!onProgram.length) return;                       // no bed on this shot — not ours to arbitrate

  let keep;
  if (!onProgram.includes("ShowRadio")) keep = "ShowMusic";          // no radio here at all
  else if (!onProgram.includes("ShowMusic")) keep = "ShowRadio";     // nothing to fall back TO
  else {
    const playing = await radioIsPlaying();
    if (playing === true) {
      if (radioDeadFor >= DEAD_TICKS) record("radio_recovered", { program, deadTicks: radioDeadFor });
      radioDeadFor = 0;
      keep = "ShowRadio";                                             // live service wins when it is live
    } else if (playing === false) {
      radioDeadFor++;
      if (radioDeadFor === DEAD_TICKS) record("radio_dead_fallback", { program, ticks: radioDeadFor });
      keep = radioDeadFor >= DEAD_TICKS ? "ShowMusic" : "ShowRadio";  // ride out a reconnect first
    } else {
      keep = radioDeadFor >= DEAD_TICKS ? "ShowMusic" : "ShowRadio";  // unknown: hold current choice
    }
  }
  for (const n of MUSIC) {
    const want = n !== keep;                            // mute everything that is not the chosen bed
    try {
      const cur = (await req("GetInputMute", { inputName: n })).inputMuted;
      if (cur !== want) { await req("SetInputMute", { inputName: n, inputMuted: want }); record("one_bed", { program, keep, muted: n, want }); }
    } catch {}
  }
}
async function tick() {
  await enforceOneBed();                              // never two beds, whatever the slider did
  let micHot;
  try { micHot = await micIsHot(); } catch { return; }   // OBS blip — leave the bed exactly as it is
  // The Desktop Audio HOT edge may be stale — meters can hang. If the last hot sample was more than
  // 3 * COLD_MS ago AND the current sample says cold, force-clear so a missing "end" packet cannot
  // leave the bed ducked forever. Safety net, never the primary path.
  if (desktopHot && (Date.now() - lastDesktopHotAt) > (COLD_MS * 3) && lastDesktopSample < DESKTOP_COLD_DB) {
    desktopHot = false; record("desktop_cold_fallback", {});
  }
  // Either signal triggers the duck. Both must be cold to restore. This is the whole change:
  // the bed now respects the AGENT's voice as well as the operator's, and the audience hears
  // whichever one is speaking cleanly on top of the music.
  const shouldDuck = micHot || desktopHot;
  if (shouldDuck && !ducked) {
    for (const n of MUSIC) {
      let v = null; try { v = (await req("GetInputVolume", { inputName: n })).inputVolumeDb; } catch {}
      ceiling[n] = (v == null || v < -59) ? -8 : v;                       // remember the operator's level
      try { await req("SetInputVolume", { inputName: n, inputVolumeDb: ceiling[n] - DUCK_DB }); } catch {}
    }
    ducked = true; record("duck", { db: DUCK_DB, ceiling, by: micHot ? "mic" : "voice" });
    if (statusOnly) console.log("HOT (" + (micHot ? "mic" : "voice") + ") → bed ducked -" + DUCK_DB + "dB");
  } else if (!shouldDuck && ducked) {
    for (const n of MUSIC) { try { await req("SetInputVolume", { inputName: n, inputVolumeDb: ceiling[n] != null ? ceiling[n] : -8 }); } catch {} }
    ducked = false; record("restore", { ceiling });
    if (statusOnly) console.log("cold → bed restored");
  }
}

// Event subscription bitmask for the Identify op. In OBS-WebSocket v5:
//   General(0)|Config(1)|Scenes(2)|Inputs(3)|Transitions(4)|Filters(5)|Outputs(6)|SceneItems(7)|
//   MediaInputs(8)|Vendors(9)|Ui(10) — bits 0..10 → 0x7FF is the DEFAULT ALL non-high-volume.
// High-volume events must be opted in EXPLICITLY:
//   InputVolumeMeters (bit 16) = 0x10000
//   InputActiveStateChanged / InputShowStateChanged (bits 17,18) also 0x2/0x4 higher.
// We ask for the default set PLUS InputVolumeMeters, which is the one we actually need for ducking.
const EVENT_SUBS = 0x7FF | 0x10000;

function connect() {
  ws = new WebSocket(OBS);
  ws.on("message", async (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d, { eventSubscriptions: EVENT_SUBS }) }));
    else if (m.op === 5 /* Event */) {
      // Only the meter stream matters here; everything else is default subscription noise we ignore.
      if (m.d && m.d.eventType === "InputVolumeMeters") onMeters(m.d.eventData && m.d.eventData.inputs);
      // Camera mute mirror — updated by OBS whenever a RemoteCam input's mute flag flips.
      // This is the authoritative "UI mute" signal the camera engine reads.
      else if (m.d && m.d.eventType === "InputMuteStateChanged") {
        const ed = m.d.eventData || {};
        if (typeof ed.inputName === "string" && CAMS.includes(ed.inputName)) {
          camMute.set(ed.inputName, !!ed.inputMuted);
          record("CAM_MUTE_EVENT", { input: ed.inputName, muted: !!ed.inputMuted });
        }
      }
    }
    else if (m.op === 2) {
      identified = true;
      if (statusOnly) {
        try { const mm = await req("GetInputMute", { inputName: MIC }); console.log("mic muted:", mm.inputMuted, "→", mm.inputMuted ? "cold (no duck)" : "HOT (would duck)"); } catch (e) { console.log("status err:", e.message); }
        try { const dm = await req("GetInputMute", { inputName: DESKTOP }); const dv = await req("GetInputVolume", { inputName: DESKTOP }); console.log("Desktop Audio muted:", dm.inputMuted, "vol:", dv.inputVolumeDb.toFixed(1) + "dB", "(voice ducking watches its peak, not this)"); } catch {}
        for (const n of MUSIC) { try { const v = await req("GetInputVolume", { inputName: n }); console.log(n, "volume:", (v.inputVolumeDb || 0).toFixed(1) + "dB"); } catch {} }
        // Give the meter stream 1500ms to arrive so a status call reports a real peak, not the -Inf floor.
        console.log("waiting 1500ms for meter samples...");
        await new Promise((r) => setTimeout(r, 1500));
        console.log("last Desktop Audio peak:", lastDesktopSample === -Infinity ? "silent" : lastDesktopSample.toFixed(1) + "dB", "| voice hot:", desktopHot);
        process.exit(0);
      }
      record("connected", {});
      // Hydrate camera mute mirror BEFORE the first camera tick so a fresh boot cannot briefly
      // read every cam as UNKNOWN and cede indefinitely without ever seeing a real event.
      await hydrateCamMuteMap();
      tick();
      setInterval(tick, EVERY_MS);
      // Camera duck tick runs on the SAME cadence as the mic duck — but LATER in each cycle
      // (setImmediate) so enforceOneBed + micIsHot ran first. Both live in one process; there is
      // no cross-process race here, only sequencing.
      setInterval(() => { setImmediate(() => { cameraDuckTick().catch(() => {}); }); }, EVERY_MS);
      console.log("music_director: ducking the bed under a live mic every " + (EVERY_MS / 1000) + "s (does NOT change scenes)");
      console.log("music_director: camera-mic duck engine ACTIVE (UNI_CAMERA_DUCK_FULL=" + process.env.UNI_CAMERA_DUCK_FULL + "), cfg=" + JSON.stringify(camCfg));
    } else if (m.op === 7) {
      const p = pending[m.d.requestId];
      if (p) { delete pending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || "obs error")); }
    }
  });
  ws.on("error", (e) => { if (statusOnly) { console.log("OBS unreachable:", e.message); process.exit(2); } });
  ws.on("close", () => { identified = false; if (!statusOnly) { record("obs_disconnected", {}); setTimeout(connect, 3000); } });   // durable: reconnect
}
connect();
