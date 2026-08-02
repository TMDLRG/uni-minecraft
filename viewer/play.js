// UNI WORLD — a browser avatar YOU control. An independent, open-source client
// (mineflayer + prismarine-viewer, MIT-licensed) connecting to YOUR OWN offline
// server with just a username — no Microsoft account, no cracked game. It renders
// first-person and takes movement from a simple control page, so you can walk your
// own world and meet UNI + the colony.
//
//   node viewer/play.js   →  open  http://localhost:3011
//   env: MC_HOST MC_PORT MC_VERSION MC_USER VIEW_PORT CTRL_PORT

const mineflayer = require("mineflayer");
const { mineflayer: mineflayerViewer } = require("prismarine-viewer");
const express = require("express");

const HOST = process.env.MC_HOST || "127.0.0.1";
const PORT = parseInt(process.env.MC_PORT || "25565", 10);
const VERSION = process.env.MC_VERSION || "1.16.5";
const USER = process.env.MC_USER || "Player";
const VIEW_PORT = parseInt(process.env.VIEW_PORT || "3010", 10);
const CTRL_PORT = parseInt(process.env.CTRL_PORT || "3011", 10);

let bot = null;

function start() {
  bot = mineflayer.createBot({ host: HOST, port: PORT, username: USER, version: VERSION, auth: "offline" });
  bot.on("error", (e) => console.error("[play] error:", e && e.message ? e.message : e));
  bot.on("kicked", (r) => console.error("[play] kicked:", r));
  bot.on("end", () => { console.error("[play] disconnected; reconnecting in 4s"); setTimeout(start, 4000); });
  bot.once("spawn", () => {
    console.log(`[play] ${USER} spawned; first-person view on :${VIEW_PORT}`);
    mineflayerViewer(bot, { port: VIEW_PORT, firstPerson: true, viewDistance: 6 });
  });
}
start();

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>UNI world — play</title>
<style>
  body { margin:0; background:#0b0e14; color:#cdd6f4; font:13px ui-monospace,Menlo,Consolas,monospace; overflow:hidden }
  iframe { width:100vw; height:calc(100vh - 66px); border:0; display:block }
  .bar { height:66px; display:flex; gap:6px; align-items:center; justify-content:center; background:#11151f; border-top:1px solid #1f2430 }
  button { background:#1e2433; color:#cdd6f4; border:1px solid #313a4e; border-radius:6px; padding:10px 14px; font:inherit; cursor:pointer; min-width:46px }
  button:active { background:#3a4a6a }
  .hint { position:fixed; top:8px; left:8px; background:rgba(17,21,31,.85); padding:6px 10px; border-radius:6px; z-index:9 }
</style></head><body>
<div class="hint">click here first · <b>WASD</b> move · <b>Q/E</b> turn · <b>Space</b> jump · <b>F</b> mine — or use the buttons</div>
<iframe src="http://localhost:${VIEW_PORT}/"></iframe>
<div class="bar">
  <button data-k="forward">W</button><button data-k="back">S</button>
  <button data-k="left">A</button><button data-k="right">D</button>
  <button data-turn="-0.4">turn ↺</button><button data-turn="0.4">turn ↻</button>
  <button data-k="jump">jump</button><button id="mine">mine</button>
</div>
<script>
  const send = (u) => fetch(u).catch(()=>{});
  const ctl = (k,v) => send('/ctl?k='+k+'&v='+(v?1:0));
  const KEY = { KeyW:'forward', KeyS:'back', KeyA:'left', KeyD:'right', Space:'jump' };
  addEventListener('keydown', e => {
    if (KEY[e.code]) { ctl(KEY[e.code],1); e.preventDefault(); }
    if (e.code==='KeyQ') send('/turn?d=-0.4');
    if (e.code==='KeyE') send('/turn?d=0.4');
    if (e.code==='KeyF') send('/mine');
  });
  addEventListener('keyup', e => { if (KEY[e.code]) ctl(KEY[e.code],0); });
  document.querySelectorAll('button[data-k]').forEach(b => {
    const k=b.dataset.k;
    b.addEventListener('mousedown',()=>ctl(k,1));
    b.addEventListener('mouseup',()=>ctl(k,0));
    b.addEventListener('mouseleave',()=>ctl(k,0));
  });
  document.querySelectorAll('button[data-turn]').forEach(b => b.addEventListener('click',()=>send('/turn?d='+b.dataset.turn)));
  document.getElementById('mine').addEventListener('click',()=>send('/mine'));
</script></body></html>`;

const app = express();
app.use((req, res, next) => { res.set("Access-Control-Allow-Origin", "*"); next(); });
app.get("/", (_req, res) => res.send(PAGE));
app.get("/ctl", (req, res) => {
  const { k, v } = req.query;
  if (bot && k) { try { bot.setControlState(k, v === "1"); } catch (_) {} }
  res.json({ ok: true });
});
app.get("/turn", (req, res) => {
  if (bot && bot.entity) {
    const d = parseFloat(req.query.d || "0");
    bot.look(bot.entity.yaw + d, bot.entity.pitch, false).catch(() => {});
  }
  res.json({ ok: true });
});
app.get("/mine", (_req, res) => {
  if (bot) { const b = bot.blockAtCursor(5); if (b && bot.canDigBlock(b)) bot.dig(b).catch(() => {}); }
  res.json({ ok: true });
});
app.listen(CTRL_PORT, () => console.log(`[play] open http://localhost:${CTRL_PORT}`));
