// obs_cut.cjs <SceneName> — switch the OBS program scene (manual cut / test helper).
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const scene=process.argv[2]||"COLONY";
ws.on("message",d=>{const m=JSON.parse(d.toString());
 if(m.op===0) ws.send(JSON.stringify({op:1,d:{rpcVersion:1}}));
 else if(m.op===2) ws.send(JSON.stringify({op:6,d:{requestType:"SetCurrentProgramScene",requestId:"x",requestData:{sceneName:scene}}}));
 else if(m.op===7){ console.log("program -> "+scene+": "+JSON.stringify(m.d.requestStatus)); try{ws.close();}catch(_){}; process.exit(0); }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),6000);
