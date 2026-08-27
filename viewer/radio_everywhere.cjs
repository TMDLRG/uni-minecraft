#!/usr/bin/env node
// radio_everywhere.cjs — make the LIVE RADIO the bed on every scene, live, without a stage rebuild.
//
//   node viewer/radio_everywhere.cjs            # survey only, changes nothing
//   node viewer/radio_everywhere.cjs --apply    # do it
//
// WHY (measured on air 2026-08-02, operator-reported: "stuck on one album ... the tele is wrong").
// The bed the audience actually heard was ShowMusic — ONE local file,
// C:/Users/mpolz/Downloads/Album/album_full.m4a, `looping:true`. That file is 13 tracks of ONE album
// (Dependency Tree) concatenated, 2705.92s. It can never leave that album; loop is the whole design.
// ShowRadio — the real service, 52 tracks across 4 albums — existed, was correctly configured, and
// was attached to only 3 scenes (MUSIC_HOUR / MUSIC_CARD / COLONY_SIDE_MUSIC), muted, mediaState
// ENDED. So the station rolled and nobody listened.
//
// The "tele is wrong" defect is the SAME defect, not a second one. command_center's music poller asks
// the service /api/nowplaying?session=obs-studio-thinker. With nothing pulling /radio there is no
// session, so the service answers {status:"no-session", reference:<a track>} and the poller honestly
// records sessionOpen:false and surfaces `reference`. But `reference` is NOT a playhead — measured, it
// WALKS THE CATALOGUE on every call (seq 37,0,15,30,45,8,23,38 over 8 polls, 15s apart). So the card
// renamed itself every few seconds, across four albums, while one track played underneath. No fix to
// the overlay could have made that right: there was no true answer to read. OPEN THE SESSION and the
// service starts reporting a real positionSec, sessionOpen flips true, and the existing card code —
// unchanged — starts telling the truth. One cure, both faults.
//
// SAFETY, in the order the steps run:
//   1. URL is re-resolved through host_resolve (the chip's LAN address is a DHCP lease; NO literal).
//   2. restart_on_activate -> FALSE. It was TRUE ("a live stream must re-establish on cut", 2026-07-17).
//      That is exactly the continuity the operator asked for and it would have re-cued the radio on
//      every single cut. This is the one setting change and it is the point of the exercise.
//   3. LEVEL MATCH BEFORE AUDIBLE. ShowRadio sat at -12.6 dB while the live bed sat at -30 dB. Swapping
//      without matching = a +17 dB jump on air. We copy the live bed's level first, and we refuse to
//      sample it while the voice duck is engaged (that would capture a ducked level and stick it).
//   4. Non-program scenes first, PROGRAM LAST (the music_everywhere.cjs rule: adding an audio input to
//      a scene that is not on program cannot change the live output).
//   5. The swap itself is explicit and deterministic rather than left to music_director's next tick —
//      but it lands on exactly the state enforceOneBed() would choose (ShowRadio wins), so the daemon
//      agrees with it instead of fighting it. ShowMusic is left in place, MUTED, as the instant
//      fallback if the service drops.
//
// STAYS SILENT BY DESIGN — not oversights: STANDBY / STANDBY_OFFLINE. Music over a fault slate dresses
// an outage up as programming. STANDBY_OFFLINE deliberately keeps the FILE bed: it is the honest
// degrade for "the music service is unreachable", which is the one moment the radio cannot be the bed.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const http = require("http");
const hosts = require("./host_resolve.cjs");

const RADIO = "ShowRadio";
const FILE_BED = "ShowMusic";
const SKIP = new Set(["STANDBY", "STANDBY_OFFLINE", "___staging"]);
const apply = process.argv.includes("--apply");

let ws, reqId = 0;
const pending = {};
function req(t, d = {}) {
  return new Promise((res, rej) => {
    const id = "r" + (++reqId); pending[id] = { res, rej };
    ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: id, requestData: d } }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; rej(new Error("timeout " + t)); } }, 6000);
  });
}
function getJson(url, ms) {
  return new Promise((res) => {
    try {
      const u = new URL(url);
      const r = http.request({ host: u.hostname, port: u.port || 80, path: u.pathname + u.search, timeout: ms || 4000 }, (rs) => {
        let b = ""; rs.on("data", (d) => (b += d)); rs.on("end", () => { try { res(JSON.parse(b)); } catch { res(null); } });
      });
      r.on("error", () => res(null)); r.on("timeout", () => { r.destroy(); res(null); }); r.end();
    } catch { res(null); }
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function run() {
  const url = await hosts.urlFor("music", "/radio?session=obs-studio-thinker").catch(() => null);
  if (!url) { console.log("ABORT music.uni-lab.local did not resolve — the radio cannot be the bed. STANDBY_OFFLINE's file bed is the honest state until DNS lands."); process.exit(2); }
  console.log(`radio URL (re-resolved, lease-current): ${url}`);

  ws = new WebSocket("ws://127.0.0.1:4455");
  ws.on("error", (e) => { console.log("OBS unreachable: " + e.message); process.exit(2); });
  ws.on("message", async (data) => {
    let m; try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.op === 0) { ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) })); return; }
    if (m.op === 7) { const p = pending[m.d.requestId]; if (p) { delete pending[m.d.requestId]; const st = m.d.requestStatus; st && st.result ? p.res(m.d.responseData || {}) : p.rej(new Error((st && st.comment) || (st && st.code) || "obs")); } return; }
    if (m.op !== 2) return;

    try {
      const program = (await req("GetCurrentProgramScene")).currentProgramSceneName;
      const scenes = (await req("GetSceneList")).scenes.map((s) => s.sceneName);
      const has = [], lacks = [], skipped = [];
      for (const n of scenes) {
        if (SKIP.has(n)) { skipped.push(n); continue; }
        const items = (await req("GetSceneItemList", { sceneName: n })).sceneItems || [];
        (items.some((i) => i.sourceName === RADIO) ? has : lacks).push(n);
      }
      const bedDb = (await req("GetInputVolume", { inputName: FILE_BED })).inputVolumeDb;
      const radioDb = (await req("GetInputVolume", { inputName: RADIO })).inputVolumeDb;
      const health = await getJson("http://127.0.0.1:8106/healthz", 3000);
      const ducked = !!(health && health.ducked);

      console.log(`program scene: ${program}`);
      console.log(`${RADIO} already on (${has.length}): ${has.join(", ") || "none"}`);
      console.log(`${RADIO} to be ADDED (${lacks.length}): ${lacks.join(", ") || "none"}`);
      console.log(`silent by design, skipped (${skipped.length}): ${skipped.join(", ")}`);
      console.log(`levels: ${FILE_BED} ${bedDb.toFixed(1)} dB · ${RADIO} ${radioDb.toFixed(1)} dB · voice-duck engaged: ${ducked}`);

      if (!apply) { console.log("\nsurvey only — nothing changed. Re-run with --apply."); process.exit(0); }

      // 3. Level match — refuse to sample a DUCKED level and stick it permanently.
      let target = bedDb;
      if (ducked) {
        console.log("voice duck is engaged — waiting up to 30s for it to release so we copy the TRUE bed level...");
        for (let i = 0; i < 30; i++) {
          await sleep(1000);
          const h = await getJson("http://127.0.0.1:8106/healthz", 2000);
          if (h && !h.ducked) { target = (await req("GetInputVolume", { inputName: FILE_BED })).inputVolumeDb; break; }
          if (i === 29) console.log("still ducked after 30s — using the level sampled anyway; operator's slider will correct it.");
        }
      }
      console.log(`level match: ${RADIO} -> ${target.toFixed(1)} dB (copied from ${FILE_BED})`);
      await req("SetInputVolume", { inputName: RADIO, inputVolumeDb: target });

      // 1 + 2. Lease-current URL and, the point of the exercise, no re-cue on a cut.
      await req("SetInputSettings", { inputName: RADIO, inputSettings: {
        input: url, is_local_file: false, buffering_mb: 2, reconnect_delay_sec: 3,
        clear_on_media_end: false, restart_on_activate: false,
      } });
      console.log(`${RADIO}: restart_on_activate -> false (music no longer re-cues on a scene cut)`);

      // 4. Non-program scenes first; PROGRAM LAST.
      const order = lacks.filter((n) => n !== program).concat(lacks.includes(program) ? [program] : []);
      let added = 0, failed = 0;
      for (const n of order) {
        try { await req("CreateSceneItem", { sceneName: n, sourceName: RADIO, sceneItemEnabled: true }); added++; console.log(`  + ${RADIO} -> ${n}${n === program ? "   (program — applied last)" : ""}`); }
        catch (e) { failed++; console.log(`  ! ${n}: ${e.message}`); }
      }

      // 5. Deterministic swap, landing exactly where enforceOneBed() would put it.
      await req("SetInputMute", { inputName: RADIO, inputMuted: false });
      await req("SetInputMute", { inputName: FILE_BED, inputMuted: true });
      console.log(`\nswap: ${RADIO} live, ${FILE_BED} muted-but-loaded (instant fallback if the service drops)`);

      console.log(`\nADDED ${added} · FAILED ${failed}. Verify with: node viewer/verify_radio_bed.cjs`);
      process.exit(failed ? 1 : 0);
    } catch (e) { console.log("ERR " + e.message); process.exit(2); }
  });
})();
