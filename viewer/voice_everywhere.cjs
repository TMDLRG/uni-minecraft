#!/usr/bin/env node
// voice_everywhere.cjs -- make the AGENT'S VOICE reach the broadcast, on every scene.
//
//   node viewer/voice_everywhere.cjs --status         # report only, change nothing
//   node viewer/voice_everywhere.cjs --create         # create the input on a HOST scene, no spread
//   node viewer/voice_everywhere.cjs --scene OVERLOOK # add it to exactly one named scene
//   node viewer/voice_everywhere.cjs                  # create if absent + add to every scene
//   node viewer/voice_everywhere.cjs --remove         # take it off every scene and delete it
//
// -------------------------------------------------------------------------------------------------
// WHY THIS EXISTS (2026-08-04, hour ~40 of a live public broadcast)
// -------------------------------------------------------------------------------------------------
// Measured today: the agent's voice had NO path to air at all. Three candidate routes, all dead --
//   * `ovl_voice`   the browser source CLAUDE.md documents as THE mechanism -- ABSENT from OBS
//   * `ClaudeSpeak` the wasapi process capture from 2026-08-02             -- ABSENT from OBS
//   * `Desktop Audio`                                                       -- present but MUTED
// So every line spoken was rendered locally and heard only in the room. The broadcast carried
// silence, and nothing anywhere reported a fault, because nothing measures audio LEVELS.
// `viewer/audio_meter.cjs` was written alongside this to close that hole; use it to verify.
//
// THE ROOT CAUSE IS THAT ovl_voice WAS NEVER IN A DECLARED BUILD.
// `studio_stage.cjs` declares eleven ovl_* sources and an OVERLAY_STACK composited on every scene.
// ovl_voice is in NEITHER. It was created by hand at some point, so it existed until something
// reset the scene collection and then it simply did not come back -- silently, because an absent
// source produces no error, only silence. This script is the repeatable repair; the durable fix is
// the matching entry added to studio_stage.cjs so a rebuild recreates it like every other overlay.
//
// -------------------------------------------------------------------------------------------------
// THE THREE SETTINGS THAT ARE LOAD-BEARING, AND WHY
// -------------------------------------------------------------------------------------------------
//   reroute_audio: true       WITHOUT THIS THE WHOLE THING IS SILENT. A browser source's audio
//                             otherwise goes to the Windows playback device and would have to be
//                             picked up by `Desktop Audio` -- which is muted, and which is the very
//                             failure this design replaced. true routes the audio into OBS's own
//                             mixer, where nothing on the machine can drift underneath it.
//   restart_when_active:false The source lives on EVERY scene, so every cut deactivates it in the
//                             old scene and activates it in the new one. true would reload the page
//                             on every single cut -- dropping its websocket and chopping any
//                             utterance in progress. This is the setting the estate's generic
//                             browser() helper gets right for a visual overlay and WRONG for this.
//   shutdown: false           Keep the page alive when not visible, so it holds one persistent
//                             websocket to voice_server rather than reconnecting constantly.
//
// Size is deliberately TINY (160x90). The page renders nothing -- it is a transparent 1px stage
// whose entire contribution is audio -- so compositing it at 1920x1080 on a CPU-saturated live box
// would burn real bandwidth to draw nothing.
//
// Idempotent. Creates the input only if absent; adds a scene item only where one is missing.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const OBS = "ws://127.0.0.1:4455";
const SOURCE = "ovl_voice";
const URL = "http://127.0.0.1:8106/voice.html";
const LOG = path.join(__dirname, "runtime", "voice_everywhere.ndjson");

const SETTINGS = {
  url: URL,
  width: 160,
  height: 90,
  reroute_audio: true,
  restart_when_active: false,
  shutdown: false,
};

// Same convention claudespeak_source.cjs declared: an agent talking over a standby card is worse
// than silence. ___staging is the stage builder's scratch scene and is never on air.
const SILENT_BY_DESIGN = new Set(["STANDBY", "STANDBY_OFFLINE", "___staging"]);

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const statusOnly = has("--status");
const createOnly = has("--create");
const doRemove = has("--remove");
const oneScene = valOf("--scene");

function record(event, d) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), event, ...d }) + "\n"); } catch (_) {}
}

let ws, reqId = 0;
const pending = {};
function req(requestType, requestData = {}) {
  return new Promise((res, rej) => {
    const id = "v" + (++reqId);
    pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: id, requestData } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout " + requestType)); } }, 8000);
  });
}
const tryReq = async (t, d) => { try { return await req(t, d); } catch { return null; } };

async function scenesCarrying(name) {
  const scenes = ((await req("GetSceneList")).scenes) || [];
  const on = [];
  for (const sc of scenes) {
    const items = ((await tryReq("GetSceneItemList", { sceneName: sc.sceneName })) || {}).sceneItems || [];
    if (items.some((i) => i.sourceName === name)) on.push(sc.sceneName);
  }
  return { scenes: scenes.map((s) => s.sceneName), on };
}

async function run() {
  const inputs = ((await req("GetInputList")).inputs) || [];
  const existing = inputs.find((i) => i.inputName === SOURCE);

  if (statusOnly) {
    console.log("=== " + SOURCE + " ===");
    if (!existing) {
      console.log("  ABSENT -- the agent's voice has NO path to air. Run --create then --scene, or run with no flags.");
    } else {
      const s = await tryReq("GetInputSettings", { inputName: SOURCE });
      const m = await tryReq("GetInputMute", { inputName: SOURCE });
      const v = await tryReq("GetInputVolume", { inputName: SOURCE });
      const st = (s && s.inputSettings) || {};
      console.log("  kind        :", existing.inputKind);
      console.log("  url         :", st.url || "?");
      console.log("  reroute_audio:", st.reroute_audio === true ? "true" : String(st.reroute_audio) + "   <-- MUST be true or it is SILENT");
      console.log("  restart_when_active:", String(st.restart_when_active) + (st.restart_when_active ? "   <-- reloads on every cut, chops speech" : ""));
      console.log("  muted       :", m ? m.inputMuted : "?");
      console.log("  volume      :", v ? v.inputVolumeDb.toFixed(1) + "dB" : "?");
      const { scenes, on } = await scenesCarrying(SOURCE);
      console.log("  on scenes   :", on.length, "of", scenes.length);
      const missing = scenes.filter((n) => !on.includes(n) && !SILENT_BY_DESIGN.has(n));
      if (missing.length) console.log("  MISSING from:", missing.join(", "));
    }
    console.log("  NOTE: config is not sound. Prove it with:  node viewer/audio_meter.cjs 6 " + SOURCE);
    process.exit(0);
  }

  if (doRemove) {
    if (!existing) { console.log("nothing to remove"); process.exit(0); }
    await tryReq("RemoveInput", { inputName: SOURCE });
    record("removed", {});
    console.log("removed " + SOURCE + " (scene items go with it)");
    process.exit(0);
  }

  // -- create, on a host scene that is NOT the programme --------------------------------------
  if (!existing) {
    const scenes = ((await req("GetSceneList")).scenes) || [];
    const prog = ((await req("GetCurrentProgramScene")) || {}).currentProgramSceneName;
    // Deliberately host it OFF AIR first. Creating a source puts it on the scene you name, and
    // putting an untested source straight onto the programme is how a bad frame reaches an
    // audience. It gets added to the programme in a later, separate, verified step.
    const host = scenes.map((s) => s.sceneName).find((n) => n !== prog && !SILENT_BY_DESIGN.has(n));
    if (!host) { console.log("REFUSING: no off-air scene to host the input"); process.exit(1); }
    const r = await tryReq("CreateInput", { sceneName: host, inputName: SOURCE, inputKind: "browser_source", inputSettings: SETTINGS, sceneItemEnabled: true });
    if (!r) { console.log("FAILED to create " + SOURCE); process.exit(1); }
    record("created", { host, settings: SETTINGS });
    console.log("created " + SOURCE + " on off-air scene '" + host + "' -> " + URL);
    console.log("  reroute_audio=true restart_when_active=false shutdown=false 160x90");
  } else {
    // Repair the settings even if the input exists -- a present-but-misconfigured source is the
    // exact failure class this whole file is about.
    await tryReq("SetInputSettings", { inputName: SOURCE, inputSettings: SETTINGS, overlay: true });
    await tryReq("SetInputMute", { inputName: SOURCE, inputMuted: false });
    console.log(SOURCE + " already exists -- settings re-asserted, unmuted");
  }

  if (createOnly) {
    console.log("--create: stopping here. Verify the page connected:  curl :8106/healthz  (clients must be >= 1)");
    process.exit(0);
  }

  // -- spread ----------------------------------------------------------------------------------
  const scenes = ((await req("GetSceneList")).scenes) || [];
  const targets = oneScene ? scenes.filter((s) => s.sceneName === oneScene) : scenes;
  if (oneScene && !targets.length) { console.log("no scene named '" + oneScene + "'"); process.exit(1); }

  let added = 0, already = 0, skipped = 0, failed = 0;
  for (const sc of targets) {
    const name = sc.sceneName;
    if (SILENT_BY_DESIGN.has(name)) { skipped++; continue; }
    const items = ((await tryReq("GetSceneItemList", { sceneName: name })) || {}).sceneItems || [];
    if (items.some((i) => i.sourceName === SOURCE)) { already++; continue; }
    const r = await tryReq("CreateSceneItem", { sceneName: name, sourceName: SOURCE, sceneItemEnabled: true });
    if (r) added++; else failed++;
  }
  record("spread", { added, already, skipped, failed, total: targets.length, oneScene: oneScene || null });
  console.log("scenes: " + added + " added, " + already + " already had it, " + skipped + " silent-by-design, " + failed + " failed (of " + targets.length + ")");
  console.log("PROVE IT:  node viewer/audio_meter.cjs 8 " + SOURCE + "   while a line is speaking.");
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
