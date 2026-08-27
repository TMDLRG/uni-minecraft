const __obsauth = require("./lib/obs_auth.cjs");
// obs_verify.cjs — save a screenshot of each clean scene so we can confirm it's NOT black before going live.
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const scenes=["COLONY","GLASS_OS","OVERLOOK","PIP"];
let i=0;
function shoot(){ if(i>=scenes.length){ try{ws.close();}catch(_){}; process.exit(0); }
  ws.send(JSON.stringify({op:6,d:{requestType:"SaveSourceScreenshot",requestId:"v"+i,requestData:{
    sourceName:scenes[i], imageFormat:"png",
    imageFilePath:require("path").join(__dirname,"verify_"+scenes[i]+".png"),
    imageWidth:960, imageHeight:540}}})); }
ws.on("message",d=>{const m=JSON.parse(d.toString());
  if(m.op===0) ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d)}));
  else if(m.op===2) shoot();
  else if(m.op===7){ console.log(scenes[i]+": "+JSON.stringify(m.d.requestStatus)); i++; shoot(); }});
ws.on("error",e=>{console.log("ERR "+e.message);process.exit(2)});
setTimeout(()=>process.exit(3),12000);
