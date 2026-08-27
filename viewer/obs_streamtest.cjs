const __obsauth = require("./lib/obs_auth.cjs");
// obs_streamtest.cjs — minimal stream test: a solid color source scene + StartStream.
// Isolates whether OBS can stream at all (no browser sources / no UI-thread hang).
const WebSocket = require("ws");
const guard = require("./golive_guard.cjs");

// F31. "Minimal stream test" still reaches StartStream, and a test that goes to air is going to
// air. Guarded before the socket opens.
try {
  guard.requireHumanOrThrow("obs_streamtest.cjs");
} catch (e) {
  console.log("REFUSED (F31): " + e.message);
  process.exit(4);
}
const ws = new WebSocket("ws://127.0.0.1:4455");
const reqs = [
  { t: "SetVideoSettings", d: { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920, outputHeight: 1080 }, optional: true },
  { t: "CreateScene", d: { sceneName: "StreamTest" }, optional: true },
  { t: "CreateInput", d: { sceneName: "StreamTest", inputName: "TestColor", inputKind: "color_source_v3",
      inputSettings: { color: 4278409690, width: 1920, height: 1080 } }, optional: true },
  { t: "SetCurrentProgramScene", d: { sceneName: "StreamTest" } },
  { t: "StartStream" },
  { t: "GetStreamStatus" },
];
let i = 0;
function sendNext() {
  if (i >= reqs.length) { console.log("STREAMTEST DONE"); try { ws.close(); } catch (_) {} process.exit(0); }
  const r = reqs[i];
  ws.send(JSON.stringify({ op: 6, d: { requestType: r.t, requestId: "s" + i, requestData: r.d || {} } }));
}
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
  else if (m.op === 2) sendNext();
  else if (m.op === 7) {
    const r = reqs[i], st = m.d.requestStatus;
    console.log((st.result ? "OK  " : "ERR ") + r.t + " " + (st.result ? JSON.stringify(m.d.responseData || {}).slice(0, 90) : st.code + ":" + (st.comment || "")));
    i++; sendNext();
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 20000);
