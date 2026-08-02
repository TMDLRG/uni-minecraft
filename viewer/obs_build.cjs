// obs_build.cjs — build the UNI colony stream scenes programmatically via obs-websocket v5.
// Scenes: "Colony Live" (Colony Cam :3020 + Glass HUD /stream overlay) and "Mind Cockpit" (/ Overlooker).
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:4455");
const W = 1920, H = 1080;
const reqs = [
  { t: "GetVersion" },
  { t: "SetVideoSettings", d: { baseWidth: W, baseHeight: H, outputWidth: W, outputHeight: H }, optional: true },
  { t: "RemoveScene", d: { sceneName: "Colony Live" }, optional: true },
  { t: "RemoveScene", d: { sceneName: "Mind Cockpit" }, optional: true },
  { t: "RemoveInput", d: { inputName: "Colony Cam" }, optional: true },
  { t: "RemoveInput", d: { inputName: "Glass HUD" }, optional: true },
  { t: "RemoveInput", d: { inputName: "Mind Cockpit View" }, optional: true },
  { t: "CreateScene", d: { sceneName: "Colony Live" } },
  { t: "CreateInput", d: { sceneName: "Colony Live", inputName: "Colony Cam", inputKind: "browser_source",
      inputSettings: { url: "http://127.0.0.1:3020", width: W, height: H } } },
  { t: "CreateInput", d: { sceneName: "Colony Live", inputName: "Glass HUD", inputKind: "browser_source",
      inputSettings: { url: "http://127.0.0.1:4000/stream", width: W, height: H } } },
  { t: "CreateScene", d: { sceneName: "Mind Cockpit" } },
  { t: "CreateInput", d: { sceneName: "Mind Cockpit", inputName: "Mind Cockpit View", inputKind: "browser_source",
      inputSettings: { url: "http://127.0.0.1:4000/", width: W, height: H } } },
  { t: "SetCurrentProgramScene", d: { sceneName: "Colony Live" } },
];
let i = 0;
function sendNext() {
  if (i >= reqs.length) { console.log("BUILD DONE"); try { ws.close(); } catch (_) {} process.exit(0); }
  const r = reqs[i];
  ws.send(JSON.stringify({ op: 6, d: { requestType: r.t, requestId: "r" + i, requestData: r.d || {} } }));
}
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
  else if (m.op === 2) sendNext();
  else if (m.op === 7) {
    const r = reqs[i], st = m.d.requestStatus;
    console.log((st.result ? "OK  " : "ERR ") + r.t + " " + (st.result ? JSON.stringify(m.d.responseData || {}).slice(0, 70) : st.code + ":" + (st.comment || "")));
    if (!st.result && !r.optional) { console.log("FATAL " + r.t); try { ws.close(); } catch (_) {} process.exit(1); }
    i++; sendNext();
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 25000);
