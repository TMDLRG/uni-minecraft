const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
let step=0;const reqs=[{requestType:"GetStreamStatus",requestId:"a"},{requestType:"GetCurrentProgramScene",requestId:"b"}];
function send(){ if(step>=reqs.length){ try{ws.close();}catch(_){}; process.exit(0);} ws.send(JSON.stringify({op:6,d:reqs[step]})); }
ws.on("message",d=>{ const m=JSON.parse(d.toString());
  if(m.op===0) ws.send(JSON.stringify({op:1,d:{rpcVersion:1}}));
  else if(m.op===2) send();
  else if(m.op===7){ console.log(reqs[step].requestType+": "+JSON.stringify(m.d.responseData)); step++; send(); }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),8000);
