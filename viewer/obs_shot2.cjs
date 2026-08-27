const __obsauth = require("./lib/obs_auth.cjs");
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const out=require("path").join(__dirname,"program_now.png");
ws.on("message",d=>{const m=JSON.parse(d.toString());
 if(m.op===0) ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d)}));
 else if(m.op===2) ws.send(JSON.stringify({op:6,d:{requestType:"SaveSourceScreenshot",requestId:"x",requestData:{sourceName:"Broadcast Live",imageFormat:"png",imageFilePath:out,imageWidth:1280,imageHeight:720}}}));
 else if(m.op===7){ console.log(JSON.stringify(m.d.requestStatus)); try{ws.close();}catch(_){}; process.exit(0); }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),8000);
