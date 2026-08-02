// obs_golive.cjs — set the YouTube ingest (rtmp_custom server + stream key) and start streaming.
// The key comes from the OBS_KEY env var or the clipboard; it is NEVER printed or written to disk.
const WebSocket = require("ws");
const { execSync } = require("child_process");
const guard = require("./golive_guard.cjs");

// F31 (Phase 9 step 3.3). This script existed to go live and asked nobody anything. It is a path
// to air, so it passes the one chokepoint like every other path. Refusal throws before the socket
// is opened -- nothing is configured, nothing is contacted, nothing partially happens.
try {
  guard.requireHumanOrThrow("obs_golive.cjs");
} catch (e) {
  console.log("REFUSED (F31): " + e.message);
  console.log("  " + (e.refusal && e.refusal.remedy || ""));
  process.exit(4);
}

let key = (process.env.OBS_KEY || "").trim();
if (!key) {
  try { key = execSync('powershell -NoProfile -Command "Get-Clipboard -Raw"', { encoding: "utf8" }).trim(); } catch (_) {}
}
const looksKey = /^[a-z0-9]{4}(-[a-z0-9]{4}){3,4}$/i.test(key);
if (!looksKey) {
  console.log("NO_STREAM_KEY — pass OBS_KEY env or copy the key to the clipboard. (got len=" + key.length + ")");
  process.exit(1);
}
const server = (process.env.OBS_SERVER || "rtmp://a.rtmp.youtube.com/live2").trim();
console.log("stream key loaded (len=" + key.length + ") — never printed.  server=" + server);

const ws = new WebSocket("ws://127.0.0.1:4455");
const reqs = [
  { t: "SetStreamServiceSettings", d: { streamServiceType: "rtmp_custom", streamServiceSettings: { server: server, key: key, use_auth: false } } },
  { t: "StartStream" },
  { t: "GetStreamStatus" },
];
let i = 0;
function sendNext() {
  if (i >= reqs.length) { console.log("GOLIVE SEQUENCE DONE"); try { ws.close(); } catch (_) {} process.exit(0); }
  const r = reqs[i];
  ws.send(JSON.stringify({ op: 6, d: { requestType: r.t, requestId: "g" + i, requestData: r.d || {} } }));
}
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } }));
  else if (m.op === 2) sendNext();
  else if (m.op === 7) {
    const r = reqs[i], st = m.d.requestStatus;
    const safe = r.t === "SetStreamServiceSettings" ? "(server+key set)" : JSON.stringify(m.d.responseData || {});
    console.log((st.result ? "OK  " : "ERR ") + r.t + " " + (st.result ? safe : st.code + ":" + (st.comment || "")));
    i++; sendNext();
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 15000);
