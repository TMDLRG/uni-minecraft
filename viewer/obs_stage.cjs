// ⛔ SUPERSEDED (marked 2026-08-01) — THIS IS NOT THE STAGE BUILDER. Use viewer/studio_stage.cjs,
// which builds 33 templates in 11 groups plus 3 camera roles. This file predates it and builds FOUR
// scenes, and it does so by REMOVING them first — so running it against the live "UNI" collection
// tears down four of the operator's scenes and rebuilds them in an older shape.
//
// The banner exists because nothing else marked it: it calls itself "the CLEAN broadcast stage", a
// human or an agent grepping for the stage builder lands here, and docs/work_orders/producer_golive.md
// still points at it (that document is itself superseded and says so at line 1). Kept rather than
// deleted because the four-scene path is referenced by dated receipts, and deleting it would make
// those records unreadable.
//
// obs_stage.cjs — build the CLEAN broadcast stage (idempotent). Scenes COLONY / GLASS_OS / OVERLOOK / PIP,
// each a WGC window-capture (method:2, GPU swapchain — correct for WebGL Chrome) + continuous looping music.
// Does NOT switch the program scene (verify first) and does NOT touch the rtmp output. Reads channels.json
// for exact window titles. Run AFTER launch_channels.ps1.
const WebSocket=require("ws");const fs=require("fs");const path=require("path");
const ch=JSON.parse(fs.readFileSync(path.join(__dirname,"channels.json"),"utf8"));
const CE=":Chrome_WidgetWin_1:chrome.exe";
const WIN={colony:ch.colony+CE, glass:ch.glass+CE, overlook:ch.overlook+CE};
const AUDIO="C:/Users/mpolz/Downloads/Album/album_full.m4a";
const CROP=32;                       // trim the slim Chrome --app title bar
const capKind=(w)=>({inputKind:"window_capture", inputSettings:{window:w, method:2, cursor:false}});
const music ={inputKind:"ffmpeg_source", inputSettings:{local_file:AUDIO, is_local_file:true, looping:true, restart_on_activate:false}};

const steps=[];
const rmInput=n=>steps.push({t:"RemoveInput",d:{inputName:n},opt:true});
const rmScene=n=>steps.push({t:"RemoveScene",d:{sceneName:n},opt:true});
const mkScene=n=>steps.push({t:"CreateScene",d:{sceneName:n}});
const mkInput=(s,n,k,key)=>steps.push({t:"CreateInput",d:Object.assign({sceneName:s,inputName:n},k),cap:key});
const addItem=(s,n,key)=>steps.push({t:"CreateSceneItem",d:{sceneName:s,sourceName:n},cap:key});
const fit=(s,key,x,y,w,h)=>steps.push({t:"__fit",scene:s,id:key,x,y,w,h});

["cap_colony","cap_glass","cap_overlook","ShowMusic"].forEach(rmInput);
["COLONY","GLASS_OS","OVERLOOK","PIP"].forEach(rmScene);

mkScene("COLONY");
mkInput("COLONY","cap_colony",capKind(WIN.colony),"c1"); fit("COLONY","c1",0,0,1920,1080);
mkInput("COLONY","ShowMusic",music,null);

mkScene("GLASS_OS");
mkInput("GLASS_OS","cap_glass",capKind(WIN.glass),"g1"); fit("GLASS_OS","g1",0,0,1920,1080);
addItem("GLASS_OS","ShowMusic",null);

mkScene("OVERLOOK");
mkInput("OVERLOOK","cap_overlook",capKind(WIN.overlook),"o1"); fit("OVERLOOK","o1",0,0,1920,1080);
addItem("OVERLOOK","ShowMusic",null);

mkScene("PIP");
addItem("PIP","cap_colony","p1"); fit("PIP","p1",0,0,1920,1080);
addItem("PIP","cap_glass","p2"); fit("PIP","p2",1232,56,624,351);
addItem("PIP","ShowMusic",null);

let i=0; const ids={};
const ws=new WebSocket("ws://127.0.0.1:4455");
function reqOf(s){
  if(s.t==="__fit") return {requestType:"SetSceneItemTransform",requestId:"s"+i,requestData:{
    sceneName:s.scene, sceneItemId:ids[s.id],
    sceneItemTransform:{positionX:s.x,positionY:s.y,boundsType:"OBS_BOUNDS_STRETCH",boundsWidth:s.w,boundsHeight:s.h,alignment:5,cropTop:CROP}}};
  return {requestType:s.t,requestId:"s"+i,requestData:s.d||{}};
}
function next(){ if(i>=steps.length){ console.log("STAGE BUILT (COLONY/GLASS_OS/OVERLOOK/PIP) — not switched"); try{ws.close();}catch(_){}; process.exit(0); }
  ws.send(JSON.stringify({op:6,d:reqOf(steps[i])})); }
ws.on("message",d=>{const m=JSON.parse(d.toString());
  if(m.op===0) ws.send(JSON.stringify({op:1,d:{rpcVersion:1}}));
  else if(m.op===2) next();
  else if(m.op===7){ const s=steps[i], st=m.d.requestStatus;
    if(st.result && s.cap) ids[s.cap]=m.d.responseData.sceneItemId;
    console.log((st.result?"OK  ":"ERR ")+s.t+" "+(st.result?(s.cap||""):st.code+":"+(st.comment||"")));
    i++; next(); }});
ws.on("error",e=>{console.log("WSERR "+e.message);process.exit(2)});
setTimeout(()=>{console.log("TIMEOUT");process.exit(3);},25000);
