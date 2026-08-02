// obs_cleanup.cjs — retire every scene/input from the old experiments, leaving ONLY the clean stage
// (COLONY / GLASS_OS / PIP + cap_colony / cap_glass / ShowMusic). Mutes Desktop Audio (so only the music
// bed is on air). Idempotent; never removes the live program's sources.
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const OLD_SCENES=["Broadcast Live","Migration Pro","Migration","Colony Live","Mind Cockpit","StreamTest","UNI Show","OVERLOOK"];
const OLD_INPUTS=["UNI Stream","TestColor","Colony Cam","Glass HUD","Mind Cockpit View","Soundtrack","Migration Glass","Migration Card","Feed OS","Feed Colony","Broadcast Frame","Glass","ColonyCam","Soundtrack2","cap_overlook"];
const steps=[];
steps.push({t:"SetInputMute",d:{inputName:"Desktop Audio",inputMuted:true},opt:true});
OLD_SCENES.forEach(s=>steps.push({t:"RemoveScene",d:{sceneName:s},opt:true}));
OLD_INPUTS.forEach(n=>steps.push({t:"RemoveInput",d:{inputName:n},opt:true}));
let i=0;
function next(){ if(i>=steps.length){ console.log("CLEANUP DONE"); try{ws.close();}catch(_){}; process.exit(0); }
  ws.send(JSON.stringify({op:6,d:{requestType:steps[i].t,requestId:"x"+i,requestData:steps[i].d}})); }
ws.on("message",d=>{const m=JSON.parse(d.toString());
  if(m.op===0) ws.send(JSON.stringify({op:1,d:{rpcVersion:1}}));
  else if(m.op===2) next();
  else if(m.op===7){ const st=m.d.requestStatus; console.log((st.result?"ok  ":"--  ")+steps[i].t+" "+JSON.stringify(steps[i].d).slice(0,40)); i++; next(); }});
ws.on("error",e=>{console.log("ERR "+e.message);process.exit(2)});
setTimeout(()=>process.exit(3),20000);
