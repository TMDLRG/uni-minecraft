const __obsauth = require("./lib/obs_auth.cjs");
// director_show.cjs — THE DIRECTOR. The only thing that runs the show. Switches the OBS program scene
// between the clean channels on a schedule, with a fade. OBS is never touched otherwise. Run in background.
// (Future: replace the timer with cues from SP.Producer beats.)
const WebSocket=require("ws");

// --- SHOW CONFIG (edit here only) -------------------------------------------
const SHOW=[
  {scene:"COLONY",   secs:28},   // the UNI Minecraft colony (live cam) — hero
  {scene:"PIP",      secs:16},   // two-up: colony + the /glass cockpit corner
  {scene:"GLASS_OS", secs:22},   // the UNI.OS /glass cockpit (self-rotates its 12 server UIs)
];
const TRANSITION="Fade"; const TRANS_MS=700;
// ----------------------------------------------------------------------------

let idx=0;
const ws=new WebSocket("ws://127.0.0.1:4455");
const send=(t,d)=>ws.send(JSON.stringify({op:6,d:{requestType:t,requestId:"d"+idx+"_"+t,requestData:d||{}}}));
function cut(){
  const step=SHOW[idx%SHOW.length];
  send("SetCurrentProgramScene",{sceneName:step.scene});
  console.log("CUT -> "+step.scene+" hold "+step.secs+"s");
  idx++;
  setTimeout(cut, step.secs*1000);
}
ws.on("message",d=>{const m=JSON.parse(d.toString());
  if(m.op===0) ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d)}));
  else if(m.op===2){
    send("SetCurrentSceneTransition",{transitionName:TRANSITION});
    send("SetCurrentSceneTransitionDuration",{transitionDuration:TRANS_MS});
    cut();
  }});
ws.on("error",e=>{console.log("WSERR "+e.message); process.exit(2);});
ws.on("close",()=>{console.log("director ws closed"); process.exit(0);});
