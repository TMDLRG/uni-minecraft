// throttle_colony.cjs — cap the colony channel window's WebGL render loop to ~30fps.
// The prismarine-viewer renders as fast as the display (60fps), but OBS window-captures it at
// 30fps and DISCARDS every other frame — so 60fps rendering is pure waste that greedily
// saturates the Intel iGPU (measured: colony expanded from 24% to 41% once other windows
// closed). Capping requestAnimationFrame to 30fps halves colony's GPU with ZERO loss to the
// 30fps OBS output, freeing headroom for the operator's command-center window.
//
// Injected before page scripts run (addScriptToEvaluateOnNewDocument) via the colony window's
// CDP port, then the page is reloaded so prismarine-viewer's THREE.js loop picks up the throttle.
// Requires the colony Chrome window launched with --remote-debugging-port=9220 (studio_channels.ps1).
const http = require("http");
const WebSocket = require("ws");
const PORT = 9220;

const THROTTLE = `(function(){
  if (window.__uniRafCapped) return; window.__uniRafCapped = true;
  var orig = window.requestAnimationFrame.bind(window), last = 0, FRAME = 1000/30;
  window.requestAnimationFrame = function(cb){
    var now = performance.now(), wait = Math.max(0, FRAME - (now - last));
    return setTimeout(function(){ last = performance.now(); cb(last); }, wait);
  };
})();`;

function hj(p) {
  return new Promise((r) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p, timeout: 3000 }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { r(JSON.parse(b)); } catch (_) { r(null); } });
    }).on("error", () => r(null));
  });
}

(async () => {
  const pages = ((await hj("/json/list")) || []).filter((t) => t.type === "page" && /3020|Prismarine/i.test(t.url + t.title));
  if (!pages.length) { console.log("colony window not on CDP " + PORT + " — launch it with --remote-debugging-port=" + PORT + " (studio_channels.ps1)"); process.exit(1); }
  const w = new WebSocket(pages[0].webSocketDebuggerUrl);
  let id = 0; const P = new Map();
  const cmd = (m, p) => new Promise((r) => { const i = ++id; P.set(i, r); w.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  w.on("message", (d) => { const m = JSON.parse(d.toString()); if (m.id && P.has(m.id)) { P.get(m.id)(m.result); P.delete(m.id); } });
  w.on("error", (e) => { console.log("CDP err " + e.message); process.exit(2); });
  await new Promise((r) => w.on("open", r));
  await cmd("Page.enable");
  await cmd("Page.addScriptToEvaluateOnNewDocument", { source: THROTTLE });
  await cmd("Page.reload", {});
  console.log("colony render loop capped to 30fps (matches OBS capture; halves iGPU).");
  setTimeout(() => process.exit(0), 1500);
})();