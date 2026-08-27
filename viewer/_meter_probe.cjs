const __obsauth = require("./lib/obs_auth.cjs");
const WS=require('ws');
const ws=new WS('ws://127.0.0.1:4455');
let peaks=[];
ws.on('message',(b)=>{const m=JSON.parse(b);
 if(m.op===0){ws.send(JSON.stringify({op:1,d:__obsauth.identifyD(m.d,{eventSubscriptions:0x7FF|0x10000})}));return;}
 if(m.op===5&&m.d.eventType==='InputVolumeMeters'){
  const desk=(m.d.eventData.inputs||[]).find(i=>i.inputName==='Desktop Audio');
  if(desk){
   let peak=0;
   for(const ch of (desk.inputLevelsMul||[])) if(Array.isArray(ch)) for(const v of ch) if(typeof v==='number'&&v>peak) peak=v;
   if(peak>0){const db=20*Math.log10(peak); peaks.push({t:Date.now(),db:+db.toFixed(1)});}
  }
 }
});
setTimeout(()=>{
 if(!peaks.length){console.log('NO non-empty Desktop Audio frames — Piper is not routing to the captured device');process.exit(0);}
 const maxP=Math.max(...peaks.map(p=>p.db));
 const minP=Math.min(...peaks.map(p=>p.db));
 console.log('captured',peaks.length,'non-empty frames over 15s window');
 console.log('peak range:',minP+'dB to',maxP+'dB');
 console.log('samples:',peaks.slice(0,3).map(p=>p.db+'dB').join(', '),'... last:',peaks.slice(-3).map(p=>p.db+'dB').join(', '));
 process.exit(0);
},15000);
