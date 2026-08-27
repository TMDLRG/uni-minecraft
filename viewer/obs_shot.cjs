const __obsauth = require("./lib/obs_auth.cjs");
// obs_shot.cjs <sourceName> <outPath>
// Captures what OBS is compositing for a given source/scene and writes a PNG to disk.
const WebSocket = require("ws");
const fs = require("fs");
const source = process.argv[2] || "UNI Show";
const out = process.argv[3] || "obs_out.png";
const ws = new WebSocket("ws://127.0.0.1:4455");
let done = false;
const finish = (code, msg) => { if (done) return; done = true; console.log(msg); try { ws.close(); } catch (_) {} process.exit(code); };
ws.on("message", (data) => {
  let m;
  try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) {
    ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
  } else if (m.op === 2) {
    ws.send(JSON.stringify({ op: 6, d: { requestType: "GetSourceScreenshot", requestId: "s1",
      requestData: { sourceName: source, imageFormat: "png", imageWidth: 1280, imageHeight: 720 } } }));
  } else if (m.op === 7) {
    const st = m.d && m.d.requestStatus;
    if (st && st.result && m.d.responseData && m.d.responseData.imageData) {
      const b64 = m.d.responseData.imageData.replace(/^data:image\/png;base64,/, "");
      fs.writeFileSync(out, Buffer.from(b64, "base64"));
      finish(0, "SAVED " + out + " bytes=" + fs.statSync(out).size);
    } else {
      finish(1, "FAIL " + JSON.stringify(st));
    }
  }
});
ws.on("error", (e) => finish(2, "WSERR " + e.message));
setTimeout(() => finish(3, "TIMEOUT"), 8000);
