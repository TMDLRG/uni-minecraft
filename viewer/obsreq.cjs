const __obsauth = require("./lib/obs_auth.cjs");
// obsreq.cjs <requestType> [jsonData] -- send one obs-websocket v5 request (no auth) and print the
// response. Reusable studio tool. Uses node's global WebSocket (node 22+); no deps.
//   node viewer/obsreq.cjs GetInputSettings '{"inputName":"cap_overlook"}'
const RT = process.argv[2];
let RD = {};
try { if (process.argv[3]) RD = JSON.parse(process.argv[3]); } catch (e) { console.error("bad json: " + e.message); process.exit(2); }
if (!RT) { console.error("usage: obsreq.cjs <requestType> [jsonData]"); process.exit(2); }
const ws = new WebSocket("ws://127.0.0.1:4455");
const send = (op, d) => ws.send(JSON.stringify({ op, d }));
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.op === 0) send(1, __obsauth.identifyD(m.d));
  else if (m.op === 2) send(6, { requestType: RT, requestData: RD, requestId: "r" });
  else if (m.op === 7) {
    const ok = m.d.requestStatus && m.d.requestStatus.result;
    console.log(JSON.stringify({ ok, comment: m.d.requestStatus && m.d.requestStatus.comment, data: m.d.responseData }, null, 1));
    try { ws.close(); } catch (_) {}
    process.exit(ok ? 0 : 1);
  }
});
ws.addEventListener("error", () => { console.error("WS_ERROR :4455"); process.exit(3); });
setTimeout(() => { console.error("TIMEOUT"); process.exit(4); }, 10000);
