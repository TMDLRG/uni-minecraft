// crop the colony-cam window title bar out of the left slot
const WebSocket=require("ws");const ws=new WebSocket("ws://127.0.0.1:4455");
const SCENE="Broadcast Live"; let id=null, phase=0;
function step(){
 if(phase===0) ws.send(JSON.stringify({op:6,d:{requestType:"GetSceneItemId",requestId:"a",requestData:{sceneName:SCENE,sourceName:"ColonyCam"}}}));
 else if(phase===1) ws.send(JSON.stringify({op:6,d:{requestType:"SetSceneItemTransform",requestId:"b",requestData:{sceneName:SCENE,sceneItemId:id,
     sceneItemTransform:{positionX:44,positionY:206,boundsType:"OBS_BOUNDS_STRETCH",boundsWidth:896,boundsHeight:504,alignment:5,cropTop:34}}}}));
 else { try{ws.close();}catch(_){}; process.exit(0); }
}
ws.on("message",d=>{const m=JSON.parse(d.toString());
 if(m.op===0) ws.send(JSON.stringify({op:1,d:{rpcVersion:1}}));
 else if(m.op===2) step();
 else if(m.op===7){ if(phase===0){ id=m.d.responseData.sceneItemId; console.log("camId="+id); } else console.log("crop: "+JSON.stringify(m.d.requestStatus)); phase++; step(); }});
ws.on("error",e=>{ console.log("ERR "+e.message); process.exit(2); });
setTimeout(()=>process.exit(3),8000);
