// probe_world.cjs — ask a prismarine-viewer page what it actually has. Read-only, changes nothing.
//
// WHY: a viewer showing "a UNI floating in empty sky" has TWO very different possible causes and
// they need opposite fixes:
//   (a) DATA — the websocket to the world died, or chunks were never sent. Entities still arrive,
//       so you get a character with no terrain. Fix = restart/reconnect the camera service.
//   (b) VIEW — the world is fine and fully loaded, but the camera is pointed at sky (a bot high in
//       the air, or looking up). Fix = move the camera. Restarting anything would be wrong.
//
// Guessing between them on a live broadcast is how you restart a healthy production service for
// nothing. This asks the page.
//
// Usage: node viewer/probe_world.cjs 9220     (colony)
//        node viewer/probe_world.cjs 9221     (overlook — note its world is inside an IFRAME)

const http = require("http");
const WebSocket = require("ws");
const PORT = Number(process.argv[2] || 9220);

const EXPR = `(() => {
  const out = {};
  // Sockets: prismarine-viewer streams world state over socket.io/websocket.
  out.hasWS = typeof WebSocket !== "undefined";
  try {
    // socket.io exposes io.engine; plain ws apps often stash the socket globally.
    if (window.io && window.io.engine) out.socketio = { readyState: window.io.engine.readyState, transport: window.io.engine.transport && window.io.engine.transport.name };
    else if (window.socket) out.socket = { readyState: window.socket.readyState };
    else out.socketNote = "no window.io / window.socket exposed";
  } catch (e) { out.socketErr = e.message; }

  // THREE.js scene: how many objects are actually in it? A world with terrain has many meshes.
  try {
    const keys = Object.keys(window).filter(k => /viewer|bot|world|scene|three/i.test(k));
    out.globals = keys.slice(0, 15);
    const v = window.viewer || (window.globalThis && globalThis.viewer);
    if (v) {
      out.viewer = {
        hasScene: !!v.scene,
        sceneChildren: v.scene ? v.scene.children.length : null,
        hasWorld: !!v.world,
        loadedChunks: (v.world && v.world.sectionMeshs) ? Object.keys(v.world.sectionMeshs).length : null,
      };
      if (v.camera && v.camera.position) out.camera = { x: Math.round(v.camera.position.x), y: Math.round(v.camera.position.y), z: Math.round(v.camera.position.z) };
    } else out.viewerNote = "no window.viewer";
  } catch (e) { out.viewerErr = e.message; }

  // Canvas pixel sample: is anything but flat sky being drawn?
  try {
    const c = document.querySelector("canvas");
    if (c) { out.canvas = { w: c.width, h: c.height }; }
    else out.canvasNote = "no canvas in this document (world may be in an iframe)";
  } catch (e) {}

  out.title = document.title;
  out.url = location.href;
  out.bodyText = (document.body.innerText || "").slice(0, 200);
  return JSON.stringify(out);
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
  if (!page) { console.log("no page target on " + PORT); process.exit(1); }
  const w = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const P = new Map();
  const cmd = (m, p) => new Promise((r) => { const i = ++id; P.set(i, r); w.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  w.on("message", (d) => { let m; try { m = JSON.parse(d.toString()); } catch (_) { return; } if (m.id && P.has(m.id)) { P.get(m.id)(m.result); P.delete(m.id); } });
  w.on("error", (e) => { console.log("CDP err " + e.message); process.exit(2); });
  await new Promise((r) => w.on("open", r));
  const r = await cmd("Runtime.evaluate", { expression: EXPR, returnByValue: true });
  const v = r && r.result && r.result.value;
  console.log(v ? JSON.stringify(JSON.parse(v), null, 1) : JSON.stringify(r));
  try { w.close(); } catch (_) {}
  process.exit(0);
})();
