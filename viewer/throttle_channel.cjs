// throttle_channel.cjs — cap a channel window's render loop to the OBS capture rate, LIVE,
// WITHOUT reloading the page. Safe to run on a scene that is ON AIR.
//
// ── WHY 30fps IS SMOOTHER THAN 60fps HERE (the counter-intuitive bit) ───────────────────────
// Measured 2026-08-03: colony rendered 46.6fps, overlook 59.9fps, both on the NVIDIA T1000 with
// full hardware acceleration. Neither is a multiple of OBS's 30fps capture. When a source renders
// at a rate that does not divide evenly into the capture rate, the compositor keeps duplicating
// some frames and dropping others on an UNEVEN cadence. Motion micro-stutters. The picture reads
// as "laggy" even though the GPU is comfortable and the fps number looks healthy.
//
// Capping the page to exactly 30fps makes every captured frame a freshly rendered one, evenly
// spaced. The output gets SMOOTHER while the GPU does roughly HALF the work. viewer/
// throttle_colony.cjs already established this ("OBS window-captures it at 30fps and DISCARDS
// every other frame — so 60fps rendering is pure waste").
//
// ── WHY THIS TOOL EXISTS ALONGSIDE throttle_colony.cjs ─────────────────────────────────────
// throttle_colony.cjs registers the cap with addScriptToEvaluateOnNewDocument and then RELOADS
// the page so THREE.js picks it up at construction. That is correct at bring-up and unusable on
// a live scene — a reload puts a blank frame on air.
//
// This one patches window.requestAnimationFrame in the ALREADY-RUNNING document. THREE.js looks
// requestAnimationFrame up on window each frame, so the very next frame honours the cap and no
// reload is needed. It ALSO registers the same script for future navigations, so the cap survives
// the next reload without a second tool run.
//
// Usage:
//   node viewer/throttle_channel.cjs 9220        # colony   -> 30fps
//   node viewer/throttle_channel.cjs 9221        # overlook -> 30fps
//   node viewer/throttle_channel.cjs 9221 24     # explicit target fps
//
// Verify after with:  node viewer/probe_render.cjs <port>   (look at measured fps + rafCapped)

const http = require("http");
const WebSocket = require("ws");

const PORT = Number(process.argv[2] || 9220);
const FPS = Number(process.argv[3] || 30);

// ── WHY FRAME-SKIP AND NOT setTimeout ──────────────────────────────────────────────────────
// The first version of this (and throttle_colony.cjs) capped with
//     setTimeout(cb, frameMs - elapsed)
// Measured 2026-08-03, that UNDERSHOOTS badly: asking for 30fps produced 27.6fps on overlook and
// 22.5fps on colony. setTimeout has a minimum clamp and its own scheduling jitter, and every late
// wake-up compounds. Worse, it DECOUPLES rendering from vsync entirely.
//
// 22.5fps is BELOW OBS's 30fps capture, so it is strictly worse than not capping at all — the
// compositor now has to invent frames. A cap intended to smooth the picture made it choppier.
//
// This version keeps the REAL requestAnimationFrame (so rendering stays vsync-locked) and simply
// SKIPS callbacks until enough time has elapsed. 60fps native halves to a clean 30.
//
// IMPORTANT LIMIT, stated rather than hidden: this can only ever divide the page's NATIVE rate.
// A page already running below 2x the target (colony measured 46.6fps — GPU-limited, not
// vsync-limited) cannot be capped to 30 without landing near 23. For those, capping is the wrong
// tool: they need less work per frame (lower render distance), not fewer frames. Use --off.
// RECOVERING THE NATIVE rAF. An earlier setTimeout-based cap wrapped requestAnimationFrame and
// did NOT keep a reference to the original, so there was no way back — "uncap" could not uncap,
// and re-applying could not replace the bad wrapper. A fresh same-origin iframe gives a pristine
// window object, and therefore a genuine native requestAnimationFrame, whatever the page has done
// to its own. The iframe is removed immediately; only the function reference is kept.
const NATIVE = `
  function __uniNativeRaf(){
    try {
      var f = document.createElement("iframe");
      f.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0";
      document.documentElement.appendChild(f);
      var raf = f.contentWindow.requestAnimationFrame;
      var bound = raf.bind(window);
      f.remove();
      return bound;
    } catch (e) { return window.requestAnimationFrame.bind(window); }
  }`;

const SRC = `(function(){
  ${NATIVE}
  var TARGET = ${FPS};
  // Deliberately NOT returning early when already capped: the whole reason this exists is to be
  // able to REPLACE a previous, worse wrapper. Always rebuild from the native function.
  window.__uniRafTargetFps = TARGET;
  window.__uniRafOrig = __uniNativeRaf();
  window.__uniRafCapped = true;
  var last = -1e9;
  window.requestAnimationFrame = function(cb){
    var frame = 1000 / (window.__uniRafTargetFps || 30);
    function onVsync(t){
      // 1ms slack so a frame arriving a hair early still counts — without it a 60.0Hz display
      // driving a 30fps target drops to 20 by repeatedly missing by microseconds.
      if (t - last >= frame - 1) { last = t; cb(t); }
      else { window.__uniRafOrig(onVsync); }
    }
    return window.__uniRafOrig(onVsync);
  };
  return "capped at " + TARGET + "fps (vsync frame-skip)";
})()`;

// --off restores the GENUINE native rAF via the iframe trick, so it works even against a wrapper
// that saved no reference to the original (which is exactly the state the old cap left pages in).
const OFF_SRC = `(function(){
  ${NATIVE}
  window.requestAnimationFrame = __uniNativeRaf();
  window.__uniRafOrig = null;
  window.__uniRafCapped = false;
  return "cap REMOVED, genuine native requestAnimationFrame restored";
})()`;

function hj(p) {
  return new Promise((r) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p, timeout: 4000 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { r(JSON.parse(b)); } catch (_) { r(null); } });
    }).on("error", () => r(null));
  });
}

(async () => {
  const list = (await hj("/json/list")) || [];
  const page = list.find((t) => t.type === "page");
  if (!page) { console.log("no page target on CDP " + PORT); process.exit(1); }
  console.log("target : " + page.title);
  console.log("url    : " + page.url);

  const w = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const P = new Map();
  const cmd = (m, p) => new Promise((r) => { const i = ++id; P.set(i, r); w.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  w.on("message", (d) => { let m; try { m = JSON.parse(d.toString()); } catch (_) { return; } if (m.id && P.has(m.id)) { P.get(m.id)(m.result); P.delete(m.id); } });
  w.on("error", (e) => { console.log("CDP err " + e.message); process.exit(2); });
  await new Promise((r) => w.on("open", r));

  const OFF = process.argv.includes("--off");

  // 1. LIVE patch — takes effect on the very next frame, no reload, safe on air.
  const live = await cmd("Runtime.evaluate", { expression: OFF ? OFF_SRC : SRC, returnByValue: true });
  console.log("live   : " + ((live && live.result && live.result.value) || JSON.stringify(live)));

  // 2. Persist for future navigations so a later reload does not silently lose the cap —
  //    which is exactly how both windows ended up uncapped and juddering.
  if (!OFF) {
    await cmd("Page.enable", {});
    const persisted = await cmd("Page.addScriptToEvaluateOnNewDocument", { source: SRC });
    console.log("persist: " + (persisted && persisted.identifier ? "registered for future loads" : "NOT registered"));
  } else {
    console.log("persist: skipped (--off applies to the LIVE page only; a reload re-arms any");
    console.log("         previously registered cap — re-run --off after a reload if needed)");
  }

  console.log("");
  console.log("Verify (do not assume): node viewer/probe_render.cjs " + PORT);
  console.log("  expect measured fps ~= " + FPS + " and rafCapped=true");
  try { w.close(); } catch (_) {}
  process.exit(0);
})();
