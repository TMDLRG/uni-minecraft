#!/usr/bin/env node
// music_everywhere.cjs — put the music bed (ShowMusic) on EVERY scene, live, without a stage rebuild
// (a rebuild refuses while streaming and would black the program). Idempotent, and it never adds a
// second copy.
//
//   node viewer/music_everywhere.cjs --dry      # survey only: which scenes have music, which lack it
//   node viewer/music_everywhere.cjs --apply     # add ShowMusic to every scene that lacks any music
//
// SAFETY. Adding an audio input to a scene that is NOT on program cannot change the live output.
// The current program scene is surveyed but only touched if it genuinely lacks music (it should not
// — OVERLOOK/COLONY/WEB/GLASS_OS/PIP already carry ShowMusic). Scenes that already have ShowMusic OR
// ShowRadio are LEFT ALONE (adding a second bed = double audio). The deliberately-silent slates
// (STANDBY, STANDBY_OFFLINE) and internal ___staging are skipped by name and reported, so the
// honest "please stand by" silence is preserved rather than broken.
//
// This is the LIVE half. The durable half is the matching edit to studio_stage.cjs, so a future
// rebuild produces the same thing; without that, the next bring-up would drop these additions.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");

const BED = "ShowMusic";
const MUSIC_SOURCES = new Set(["ShowMusic", "ShowRadio"]);   // either counts as "already has music"
const SKIP = new Set(["STANDBY", "STANDBY_OFFLINE", "___staging"]);   // deliberate silence / internal
const apply = process.argv.includes("--apply");

let ws, identified = false, reqId = 0;
const pending = {};
function req(t, d = {}) {
  return new Promise((res, rej) => {
    const id = "e" + (++reqId); pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: id, requestData: d } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout " + t)); } }, 5000);
  });
}

(async function run() {
  ws = new WebSocket("ws://127.0.0.1:4455");
  ws.on("message", async (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.op === 0) { ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) })); return; }
    if (m.op === 7) { const p = pending[m.d.requestId]; if (p) { delete pending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || "obs")); } return; }
    if (m.op !== 2) return;
    identified = true;
    try {
      const program = (await req("GetCurrentProgramScene")).currentProgramSceneName;
      const scenes = (await req("GetSceneList")).scenes.map((s) => s.sceneName).filter((n) => !SKIP.has(n));
      const has = [], lacks = [], skipped = [];
      for (const name of (await req("GetSceneList")).scenes.map((s) => s.sceneName)) {
        if (SKIP.has(name)) { skipped.push(name); continue; }
        const items = (await req("GetSceneItemList", { sceneName: name })).sceneItems || [];
        (items.some((i) => MUSIC_SOURCES.has(i.sourceName)) ? has : lacks).push(name);
      }
      console.log(`program scene: ${program}`);
      console.log(`HAS music (${has.length}): ${has.join(", ")}`);
      console.log(`LACKS music (${lacks.length}): ${lacks.join(", ") || "none"}`);
      console.log(`skipped, silent by design (${skipped.length}): ${skipped.join(", ")}`);

      if (!apply) { console.log("\n--dry: no changes made. Re-run with --apply to add ShowMusic to the LACKS list."); process.exit(0); }

      let added = 0, failed = 0;
      // Do the program scene LAST so any (unexpected) live audio change is the final, deliberate act.
      const order = lacks.filter((n) => n !== program).concat(lacks.includes(program) ? [program] : []);
      for (const name of order) {
        try { await req("CreateSceneItem", { sceneName: name, sourceName: BED, sceneItemEnabled: true }); added++; console.log(`  + ${BED} -> ${name}${name === program ? "  (program — applied last)" : ""}`); }
        catch (e) { failed++; console.log(`  ! ${name}: ${e.message}`); }
      }
      console.log(`\nADDED ${added} · FAILED ${failed}. ShowMusic now on ${has.length + added} scene(s).`);
      process.exit(failed ? 1 : 0);
    } catch (e) { console.log("ERR " + e.message); process.exit(2); }
  });
  ws.on("error", (e) => { console.log("OBS unreachable: " + e.message); process.exit(2); });
})();
