// obs_ctl.cjs <StartStream|StopStream|GetStreamStatus>
// Minimal obs-websocket v5 client (no auth, localhost). Prints the request status + data.
const WebSocket = require("ws");
const guard = require("./golive_guard.cjs");
const cmd = process.argv[2] || "GetStreamStatus";

// F31. This file is a GENERIC OBS forwarder: the request type comes from argv, so a search for
// the literal "StartStream" cannot see that `node viewer/obs_ctl.cjs StartStream` is a path to
// air. That is exactly how it stayed unguarded. Guard the ACTUATION, not the spelling.
if (/^(StartStream|StartOutput|StartVirtualCam|StartRecord)$/i.test(cmd)) {
  try {
    guard.requireHumanOrThrow("obs_ctl.cjs " + cmd);
  } catch (e) {
    console.log("REFUSED (F31): " + e.message);
    process.exit(4);
  }
}
const ws = new WebSocket("ws://127.0.0.1:4455");
let done = false;
const finish = (code, msg) => {
  if (done) return;
  done = true;
  console.log(msg);
  try { ws.close(); } catch (_) {}
  process.exit(code);
};
ws.on("message", (data) => {
  let m;
  try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) {
    ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1 } })); // Identify, no auth
  } else if (m.op === 2) {
    ws.send(JSON.stringify({ op: 6, d: { requestType: cmd, requestId: "r1" } }));
  } else if (m.op === 7) {
    const ok = m.d && m.d.requestStatus && m.d.requestStatus.result;
    finish(ok ? 0 : 1, "RESP " + JSON.stringify(m.d.requestStatus) + " DATA " + JSON.stringify(m.d.responseData || {}));
  }
});
ws.on("error", (e) => finish(2, "WSERR " + e.message));
setTimeout(() => finish(3, "TIMEOUT"), 8000);
