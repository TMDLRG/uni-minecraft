const __obsauth = require("./lib/obs_auth.cjs");
// obs_soundtrack.cjs — add the album as a looping media source present in both
// "Colony Live" and "Mind Cockpit" so the music continues across cut-scene switches.
const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:4455");
const FILE = "C:/Users/mpolz/Downloads/Album/album_full.m4a";
const reqs = [
  { t: "RemoveInput", d: { inputName: "Soundtrack" }, optional: true },
  { t: "CreateInput", d: { sceneName: "Colony Live", inputName: "Soundtrack", inputKind: "ffmpeg_source",
      inputSettings: { local_file: FILE, is_local_file: true, looping: true, restart_on_activate: false, clear_on_media_end: false } } },
  { t: "SetInputAudioMonitorType", d: { inputName: "Soundtrack", monitorType: "OBS_MONITORING_TYPE_NONE" }, optional: true },
  { t: "CreateSceneItem", d: { sceneName: "Mind Cockpit", sourceName: "Soundtrack" }, optional: true },
];
let i = 0;
function sendNext() {
  if (i >= reqs.length) { console.log("SOUNDTRACK DONE"); try { ws.close(); } catch (_) {} process.exit(0); }
  const r = reqs[i];
  ws.send(JSON.stringify({ op: 6, d: { requestType: r.t, requestId: "m" + i, requestData: r.d || {} } }));
}
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) }));
  else if (m.op === 2) sendNext();
  else if (m.op === 7) {
    const r = reqs[i], st = m.d.requestStatus;
    console.log((st.result ? "OK  " : "ERR ") + r.t + " " + (st.result ? JSON.stringify(m.d.responseData || {}).slice(0, 60) : st.code + ":" + (st.comment || "")));
    i++; sendNext();
  }
});
ws.on("error", (e) => { console.log("WSERR " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(3); }, 15000);
