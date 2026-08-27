const __obsauth = require("./lib/obs_auth.cjs");
// obs_prog.cjs — screenshot whatever is CURRENTLY on the live program (the actual YouTube feed frame).
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");let scene=null;
ws.on("message",d=>{const m=JSON.parse(d.toString());
 if(m.op===0) ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d)}));
 else if(m.op===2) ws.send(JSON.stringify({op:6,d:{requestType:"GetCurrentProgramScene",requestId:"a"}}));
 else if(m.op===7){
   if(m.d.requestType==="GetCurrentProgramScene"){ scene=m.d.responseData.currentProgramSceneName;
     ws.send(JSON.stringify({op:6,d:{requestType:"SaveSourceScreenshot",requestId:"b",requestData:{sourceName:scene,imageFormat:"png",imageFilePath:require("path").join(__dirname,"program_live.png"),imageWidth:1280,imageHeight:720}}})); }
   else { console.log("LIVE program = "+scene+": "+JSON.stringify(m.d.requestStatus)); try{ws.close();}catch(_){}; process.exit(0); }
 }});
ws.on("error",e=>{console.log("ERR "+e.message);process.exit(2)});
setTimeout(()=>process.exit(3),8000);
