#!/usr/bin/env node
// claudespeak_source.cjs — make ClaudeSpeak a FIRST-CLASS BROADCAST SOURCE.
//
//   node viewer/claudespeak_source.cjs              # create/repair the source on every scene
//   node viewer/claudespeak_source.cjs --status      # report only, change nothing
//   node viewer/claudespeak_source.cjs --remove      # take it off every scene and delete it
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS, AND WHAT IT REPLACES
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The operator's directive, given live on air 2026-08-02: "make claudespeak a direct source and
// integrate fully with the suite and stop the hacked layering."
//
// The hacked layering was this: the agent's voice (Piper TTS, rendered by the ClaudeSpeak connector)
// was going to be picked up by OBS's global "Desktop Audio" source — a WASAPI *output* capture of an
// entire playback device. That approach is wrong for three independent reasons, and each one alone
// would justify replacing it:
//
//   1. IT CAPTURES EVERYTHING. Desktop Audio takes the whole device: notification chimes, a YouTube
//      tab the operator opens to check something, a Windows error ding, the music bed itself if it
//      shares the device. Putting that on a public broadcast is not a voice channel, it is a
//      microphone pointed at the whole computer.
//   2. IT WAS BOUND TO A DEVICE THAT NO LONGER EXISTS. Measured 2026-08-02: Desktop Audio's
//      device_id was {0.0.0.00000000}.{c82f74c2-1f6a-4ca1-a06a-201f64120b93}, which is absent from
//      the machine's current device list (Realtek, Odyssey HDMI, and Default are all that remain).
//      So the source was unmuted, sat at a healthy -20.8 dB, showed a level slider, and captured
//      SILENCE. Its meter frames came back as empty arrays 78 times in 4 seconds.
//   3. IT DEPENDS ON WHERE WINDOWS HAPPENS TO BE PLAYING. Windows' default render device here is the
//      monitor's HDMI audio, not the speakers. So even "default" is a moving target that the
//      operator can change by plugging in a headset, and the broadcast would silently follow it.
//
// wasapi_process_output_capture solves all three at once: it captures the audio of ONE NAMED
// PROCESS, wherever that process routes it. The agent's voice, and nothing else, on the programme.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// IT LIVES ON EVERY SCENE, DELIBERATELY
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// OBS has no true "global" audio source for a process capture — it is a scene item like any other.
// The music bed had exactly this problem and was solved the same way (music_everywhere.cjs added
// ShowMusic to 34 scenes). The agent's voice must be audible whatever shot is on programme, because
// the whole point is that the audience hears what is happening while it happens. So this adds the
// source to EVERY scene, with two deliberate exceptions declared in SILENT_BY_DESIGN below.
//
// It is idempotent. Run it as often as you like: it creates the input only if absent, and adds a
// scene item only to scenes that do not already carry one.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT THIS DOES NOT DO
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// It does not touch Desktop Audio. Turning that off is a separate, reversible operator decision and
// it is left exactly as found — this script's job is to make the RIGHT source exist, not to remove
// the wrong one behind the operator's back. `--status` reports both so the choice is visible.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const OBS = "ws://127.0.0.1:4455";
const SOURCE = "ClaudeSpeak";
const KIND = "wasapi_process_output_capture";
const LOG = path.join(__dirname, "runtime", "claudespeak_source.ndjson");

// The ClaudeSpeak connector runs Piper inside its own venv. Measured 2026-08-02: two python.exe
// processes under C:\Users\mpolz\Documents\ClaudeSpeak\claude-voice-connector-stdio\venv\Scripts\.
// The process capture matches on EXECUTABLE NAME, so we try the specific candidates in order and
// take the first that OBS's own property list offers. Never guess a name OBS did not offer.
const CANDIDATES = ["python.exe", "piper.exe", "pythonw.exe"];

// Scenes that must stay silent whatever else is true. STANDBY is what goes out when the studio is
// deliberately not presenting; an agent talking over a standby card is worse than silence.
const SILENT_BY_DESIGN = new Set(["STANDBY", "STANDBY_OFFLINE", "___staging"]);

const statusOnly = process.argv.includes("--status");
const doRemove = process.argv.includes("--remove");

function record(event, d) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), event, ...d }) + "\n"); } catch (_) {}
}

let ws, reqId = 0;
const pending = {};
function req(requestType, requestData = {}) {
  return new Promise((res, rej) => {
    const id = "c" + (++reqId);
    pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: id, requestData } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout " + requestType)); } }, 8000);
  });
}
const tryReq = async (t, d) => { try { return await req(t, d); } catch { return null; } };

async function run() {
  // ── 1. does the input already exist, and what is it bound to? ─────────────────────────────────
  const inputs = ((await req("GetInputList")).inputs) || [];
  const existing = inputs.find((i) => i.inputName === SOURCE);

  if (statusOnly) {
    console.log("=== ClaudeSpeak source ===");
    if (!existing) {
      console.log("  ABSENT — the agent's voice has no dedicated source. Run without --status to create it.");
    } else {
      const s = await tryReq("GetInputSettings", { inputName: SOURCE });
      const m = await tryReq("GetInputMute", { inputName: SOURCE });
      const v = await tryReq("GetInputVolume", { inputName: SOURCE });
      console.log("  kind      :", existing.inputKind);
      console.log("  executable:", s && s.inputSettings ? (s.inputSettings.window || s.inputSettings.priority || JSON.stringify(s.inputSettings)) : "?");
      console.log("  muted     :", m ? m.inputMuted : "?");
      console.log("  volume    :", v ? v.inputVolumeDb.toFixed(1) + "dB" : "?");
      const scenes = ((await req("GetSceneList")).scenes) || [];
      let on = 0;
      for (const sc of scenes) {
        const items = ((await tryReq("GetSceneItemList", { sceneName: sc.sceneName })) || {}).sceneItems || [];
        if (items.some((i) => i.sourceName === SOURCE)) on++;
      }
      console.log("  on scenes :", on, "of", scenes.length);
    }
    // Report the thing it replaces, so the operator can see both and decide.
    const desk = inputs.find((i) => i.inputName === "Desktop Audio");
    if (desk) {
      const ds = await tryReq("GetInputSettings", { inputName: "Desktop Audio" });
      const dm = await tryReq("GetInputMute", { inputName: "Desktop Audio" });
      console.log("=== Desktop Audio (the broad capture this replaces) ===");
      console.log("  device_id :", ds && ds.inputSettings ? ds.inputSettings.device_id : "?");
      console.log("  muted     :", dm ? dm.inputMuted : "?");
      console.log("  NOTE: left exactly as found. Muting it is the operator's call, not this script's.");
    }
    process.exit(0);
  }

  if (doRemove) {
    if (!existing) { console.log("nothing to remove"); process.exit(0); }
    await tryReq("RemoveInput", { inputName: SOURCE });
    record("removed", {});
    console.log("removed " + SOURCE + " (scene items go with it)");
    process.exit(0);
  }

  // ── 2. create the input if absent, bound to a process OBS actually offers ──────────────────────
  if (!existing) {
    const scenes = ((await req("GetSceneList")).scenes) || [];
    const host = scenes.length ? scenes[0].sceneName : null;
    if (!host) { console.log("REFUSING: no scenes exist to host the input"); process.exit(1); }

    // Create with an empty binding first so we can ask OBS for its real property list. Asking
    // before creating is not possible — the property list is a property OF an input.
    await req("CreateInput", { sceneName: host, inputName: SOURCE, inputKind: KIND, inputSettings: {}, sceneItemEnabled: true });
    record("created", { host });

    const props = await tryReq("GetInputPropertiesListPropertyItems", { inputName: SOURCE, propertyName: "window" });
    const offered = (props && props.propertyItems) || [];
    // OBS returns entries like "python.exe" or a fuller "[pid] name" — match on our candidates.
    let pick = null;
    for (const cand of CANDIDATES) {
      const hit = offered.find((o) => String(o.itemValue || o.itemName || "").toLowerCase().includes(cand.toLowerCase()));
      if (hit) { pick = hit; break; }
    }
    if (!pick) {
      console.log("REFUSING to guess: OBS offered " + offered.length + " capturable processes and none matched " + CANDIDATES.join("/") + ".");
      console.log("  Offered (first 15): " + offered.slice(0, 15).map((o) => o.itemName).join(" | "));
      console.log("  The source has been created but is UNBOUND. Speak once so the process is running, then re-run.");
      record("unbound", { offered: offered.length });
      process.exit(2);
    }
    await req("SetInputSettings", { inputName: SOURCE, inputSettings: { window: pick.itemValue }, overlay: true });
    record("bound", { to: pick.itemName, value: pick.itemValue });
    console.log("bound " + SOURCE + " -> " + pick.itemName);
  } else {
    console.log(SOURCE + " already exists (" + existing.inputKind + ") — leaving its binding alone");
  }

  // ── 3. put it on every scene that should carry it ─────────────────────────────────────────────
  const scenes = ((await req("GetSceneList")).scenes) || [];
  let added = 0, already = 0, skipped = 0, failed = 0;
  for (const sc of scenes) {
    const name = sc.sceneName;
    if (SILENT_BY_DESIGN.has(name)) { skipped++; continue; }
    const items = ((await tryReq("GetSceneItemList", { sceneName: name })) || {}).sceneItems || [];
    if (items.some((i) => i.sourceName === SOURCE)) { already++; continue; }
    const r = await tryReq("CreateSceneItem", { sceneName: name, sourceName: SOURCE, sceneItemEnabled: true });
    if (r) added++; else failed++;
  }
  record("spread", { added, already, skipped, failed, total: scenes.length });
  console.log("scenes: " + added + " added, " + already + " already had it, " + skipped + " silent-by-design, " + failed + " failed (of " + scenes.length + ")");
  console.log("ClaudeSpeak is now a first-class source. music_director ducks the bed under it.");
  process.exit(0);
}

ws = new WebSocket(OBS);
ws.on("message", async (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch { return; }
  if (m.op === 0) return ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
  if (m.op === 7) {
    const p = pending[m.d.requestId];
    if (p) { delete pending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || "obs error")); }
    return;
  }
  if (m.op === 2) { try { await run(); } catch (e) { console.log("FAILED: " + e.message); process.exit(1); } }
});
ws.on("error", (e) => { console.log("OBS unreachable: " + e.message); process.exit(3); });
