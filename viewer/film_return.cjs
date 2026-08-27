#!/usr/bin/env node
// film_return.cjs — bring the world view back when a film ends, and REFUSE to cut to a black frame.
//
//   node viewer/film_return.cjs <secondsFromNow> [targetScene]
//
// WHY. /api/clip only auto-returns when it is given a `secs`; the documentary was rolled without
// one, so at the end of 29m55s the program would have sat on a finished clip — a still frame on a
// live broadcast, which reads as a dead studio. This closes that.
//
// THE FENCE THAT MATTERS. It screenshots the target BEFORE cutting. Twice tonight the world view
// was black (a minimized capture window, a dead WGC handle), and cutting to it blind would have
// replaced a finished film with a black program — worse than the thing it was fixing. If the target
// will not render, it says so and STAYS on the clip, because a stale picture beats no picture.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");

const secs = Math.max(0, parseInt(process.argv[2] || "0", 10));
const TARGET = process.argv[3] || "OVERLOOK";
const SPOOL = path.join(__dirname, "runtime", "broadcast.json");
const MIN_BYTES = 3000;   // a 320x180 PNG below this is a flat/black frame

let ws, id = 0; const pend = {};
const req = (t, d = {}) => new Promise((res, rej) => {
  const i = "r" + (++id); pend[i] = { res, rej };
  ws.send(JSON.stringify({ op: 6, d: { requestType: t, requestId: i, requestData: d } }));
  setTimeout(() => { if (pend[i]) { delete pend[i]; rej(new Error("timeout " + t)); } }, 8000);
});

function say(text, tone) {
  try {
    const j = JSON.parse(fs.readFileSync(SPOOL, "utf8"));
    j.ticker = (j.ticker || []).filter((t) => !t._film);
    j.ticker.unshift({ text, tone, _film: true });
    j.updatedUtc = new Date().toISOString();
    fs.writeFileSync(SPOOL, JSON.stringify(j, null, 2));
  } catch (_) {}
}

function connect() {
  ws = new WebSocket("ws://127.0.0.1:4455");
  ws.on("message", async (b) => {
    let m; try { m = JSON.parse(b); } catch { return; }
    if (m.op === 0) return ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
    if (m.op === 7) { const p = pend[m.d.requestId]; if (p) { delete pend[m.d.requestId]; const s = m.d.requestStatus; s && s.result ? p.res(m.d.responseData || {}) : p.rej(new Error((s && s.comment) || "obs")); } return; }
    if (m.op !== 2) return;
    console.log(`film_return: will bring ${TARGET} back in ${secs}s`);
    await new Promise((r) => setTimeout(r, secs * 1000));

    // Only act if a clip is still what is on program — the operator may have cut away himself, and
    // yanking his shot back would be the studio overriding a human decision.
    let prog;
    try { prog = (await req("GetCurrentProgramScene")).currentProgramSceneName; } catch { process.exit(1); }
    if (!/^CLIP/.test(prog)) { console.log(`program is ${prog}, not a clip — the operator moved on; doing nothing`); process.exit(0); }

    // Verify the target renders BEFORE cutting to it.
    let bytes = 0;
    try { bytes = ((await req("GetSourceScreenshot", { sourceName: TARGET, imageFormat: "png", imageWidth: 320, imageHeight: 180 })).imageData || "").length; } catch {}
    if (bytes < MIN_BYTES) {
      console.log(`${TARGET} renders ${bytes}B — BLACK. Staying on the clip; a stale picture beats no picture.`);
      say(`● The world view is not rendering — holding the last shot rather than cutting to black. Being fixed.`, "crit");
      process.exit(2);
    }
    await req("SetCurrentProgramScene", { sceneName: TARGET });
    console.log(`cut back to ${TARGET} (frame ${bytes}B)`);
    say(`● The film has ended — back to the live colony. Everything you saw being fixed is on the status board.`, "ok");
    process.exit(0);
  });
  ws.on("error", (e) => { console.log("obs err " + e.message); process.exit(3); });
}
connect();
