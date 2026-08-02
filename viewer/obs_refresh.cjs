// obs_refresh.cjs — refresh (no-cache) the colony browser sources so they reload the
// pages after a colony/node restart (the cam :3020 + HUD :4000 went down and came back).
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:4455");
const sources = ["Colony Cam", "Glass HUD", "Mind Cockpit View"];
const reqs = sources.map((s) => ({ t: "PressInputPropertiesButton", d: { inputName: s, propertyName: "refreshnocache" }, optional: true }));
let i = 0;
function sendNext() {
  if (i >= reqs.length) { console.log("REFRESH DONE"); try { ws.close(); } catch (_) {} process.exit(0); }
  const r = reqs[i];
  ws.send(JSON.stringify({ op: 6, d: { requestType: r.t, requestId: "f" + i, requestData: r.d || {} } }));
}
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
  else if (m.op === 2) sendNext();
  else if (m.op === 7) {
    const r = reqs[i], st = m.d.requestStatus;
    console.log((st.result ? "OK  " : "ERR ") + r.t + " " + (r.d.inputName) + " " + (st.result ? "" : st.code + ":" + (st.comment || "")));
    i++; sendNext();
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 12000);
