const __obsauth = require("./lib/obs_auth.cjs");
// read-only OBS inventory: current program scene, all scenes, all inputs, stream status
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const reqs=[
 {requestType:"GetCurrentProgramScene",requestId:"a"},
 {requestType:"GetSceneList",requestId:"b"},
 {requestType:"GetInputList",requestId:"c"},
 {requestType:"GetStreamStatus",requestId:"d"},
];
let i=0;
function send(){ if(i>=reqs.length){ try{ws.close();}catch(_){}; process.exit(0); } ws.send(JSON.stringify({op:6,d:reqs[i]})); }
ws.on("message",d=>{const m=JSON.parse(d.toString());
 if(m.op===0) ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d)}));
 else if(m.op===2) send();
 else if(m.op===7){
   const rd=m.d.responseData||{};
   if(reqs[i].requestType==="GetSceneList") console.log("SCENES: "+(rd.scenes||[]).map(s=>s.sceneName).join("  |  "));
   else if(reqs[i].requestType==="GetInputList") console.log("INPUTS: "+(rd.inputs||[]).map(x=>x.inputName+" ["+x.inputKind+"]").join("  |  "));
   else console.log(reqs[i].requestType+": "+JSON.stringify(rd));
   i++; send();
 }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),8000);
