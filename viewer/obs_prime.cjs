// obs_prime.cjs — verify GLASS_OS/OVERLOOK/PIP render OFF-AIR via studio-mode preview (program stays put),
// screenshot each, then leave studio mode enabled=false. Confirms each window paints before the show.
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const scenes=["GLASS_OS","OVERLOOK","PIP"];
let i=0;
const send=(t,d)=>ws.send(JSON.stringify({op:6,d:{requestType:t,requestId:t+"_"+i,requestData:d||{}}}));
function previewNext(){ if(i>=scenes.length){ send("SetStudioModeEnabled",{studioModeEnabled:false}); setTimeout(()=>{try{ws.close();}catch(_){}; process.exit(0);},400); return; }
  send("SetCurrentPreviewScene",{sceneName:scenes[i]}); }
function shoot(){ send("SaveSourceScreenshot",{sourceName:scenes[i],imageFormat:"png",
  imageFilePath:require("path").join(__dirname,"verify_"+scenes[i]+".png"),imageWidth:960,imageHeight:540}); }
ws.on("message",d=>{const m=JSON.parse(d.toString());
  if(m.op===0){ ws.send(JSON.stringify({op:1,d:{rpcVersion:1}})); return; }
  if(m.op===2){ send("SetStudioModeEnabled",{studioModeEnabled:true}); return; }
  if(m.op===7){ const rt=m.d.requestType||"";
    if(rt==="SetStudioModeEnabled" && m.d.requestId.indexOf("SetStudioModeEnabled_0")===0){ previewNext(); }
    else if(rt==="SetCurrentPreviewScene"){ setTimeout(shoot,2300); }
    else if(rt==="SaveSourceScreenshot"){ console.log(scenes[i]+": "+JSON.stringify(m.d.requestStatus)); i++; previewNext(); }
  }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),25000);
