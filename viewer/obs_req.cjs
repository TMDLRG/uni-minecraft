const __obsauth = require("./lib/obs_auth.cjs");
// obs_req.cjs <requestFile.json> [outImagePath]
// Sends one obs-websocket v5 request read from a JSON file: {requestType, requestData}.
// Prints requestStatus + responseData (imageData truncated). Saves imageData to outImagePath if present.
const WebSocket = require("ws");
const fs = require("fs");
const reqFile = process.argv[2];
const outImg = process.argv[3] || null;
const spec = JSON.parse(fs.readFileSync(reqFile, "utf8"));

// F31 (Phase 9 step 3.3). This file sends an ARBITRARY obs-websocket request read from a JSON
// file named on argv. It contains the word "StartStream" nowhere, and it is a complete path to
// air: write {"requestType":"StartStream"} to a file and run it. Guard the ACTUATION, not the
// spelling -- the same lesson obs_ctl.cjs taught.
if (/^(StartStream|StartOutput|StartVirtualCam|StartRecord)$/i.test(String(spec.requestType || ""))) {
  const guard = require("./golive_guard.cjs");
  try {
    guard.requireHumanOrThrow("obs_req.cjs " + spec.requestType);
  } catch (e) {
    console.log("REFUSED (F31): " + e.message);
    process.exit(4);
  }
}
const ws = new WebSocket("ws://127.0.0.1:4455");
let done = false;
const finish = (code, msg) => { if (done) return; done = true; console.log(msg); try { ws.close(); } catch (_) {} process.exit(code); };
ws.on("message", (data) => {
  let m;
  try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) {
    ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
  } else if (m.op === 2) {
    ws.send(JSON.stringify({ op: 6, d: { requestType: spec.requestType, requestId: "q1", requestData: spec.requestData || {} } }));
  } else if (m.op === 7) {
    const st = m.d && m.d.requestStatus;
    let rd = m.d && m.d.responseData ? m.d.responseData : {};
    if (outImg && rd.imageData) {
      const b64 = rd.imageData.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(outImg, Buffer.from(b64, "base64"));
      rd = Object.assign({}, rd, { imageData: "[saved " + outImg + " " + fs.statSync(outImg).size + "B]" });
    }
    finish(st && st.result ? 0 : 1, "STATUS " + JSON.stringify(st) + "\nDATA " + JSON.stringify(rd).slice(0, 600));
  }
});
ws.on("error", (e) => finish(2, "WSERR " + e.message));
setTimeout(() => finish(3, "TIMEOUT"), 8000);
