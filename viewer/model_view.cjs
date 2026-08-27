#!/usr/bin/env node
// UNI MODEL VIEW - what is built, and what is being run, read live from disk.
// Zero deps. CPU-only. Caches nothing. Port 8110.
const http = require('http'), fs = require('fs'), path = require('path'), cp = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SCRATCH = process.env.UNI_SCRATCH ||
  'C:/Users/mpolz/AppData/Local/Temp/claude/C--Users-mpolz-Documents-UNI-Flagellum/df5a6255-aa59-44a0-9008-881908dd45d4/scratchpad';
const STATUS = path.join(SCRATCH, 'horizon_status.json');
const RUNLOG = path.join(SCRATCH, 'horizon_run.log');
const PORT = 8110;

const readJSON = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const readFile = p => { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; } };
function gitLog() {
  try {
    return cp.execSync('git log -8 --pretty=format:%h%x1f%s%x1f%ad --date=short', { cwd: ROOT })
      .toString().trim().split('\n').map(l => { const p = l.split('\x1f'); return { h: p[0], s: p[1], d: p[2] }; });
  } catch (e) { return []; }
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const PAGE = [
'<!doctype html><meta charset="utf-8"><title>UNI MODEL - built &amp; running</title>',
'<style>',
':root{--bg:#0d1017;--pan:#141923;--pan2:#1a2029;--ln:#242c3a;--tx:#dfe5ee;--dim:#8b97a8;',
'--ok:#3fae8c;--warn:#d9a441;--bad:#e0645f;--acc:#7f77dd;--mono:ui-monospace,Consolas,monospace}',
'*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:14px/1.55 ui-sans-serif,Segoe UI,Roboto,sans-serif}',
'header{position:sticky;top:0;z-index:9;background:#0d1017ee;border-bottom:1px solid var(--ln);',
'padding:10px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}',
'h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.4px}',
'.links a{color:var(--dim);text-decoration:none;font-size:12px;margin-right:12px;border-bottom:1px dotted var(--ln)}',
'.links a:hover{color:var(--acc)}',
'.stamp{margin-left:auto;font:11px var(--mono);color:var(--dim)}',
'main{padding:16px 18px;display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:14px;align-items:start}',
'section{background:var(--pan);border:1px solid var(--ln);border-radius:9px;padding:14px 16px}',
'section.wide{grid-column:1/-1}',
'h2{font-size:12.5px;text-transform:uppercase;letter-spacing:.9px;color:var(--dim);margin:0 0 10px;font-weight:600}',
'.row{display:flex;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px solid #1c232e}',
'.row:last-child{border:0}.k{color:var(--dim);font-size:12px;min-width:150px}.v{font:12px var(--mono)}',
'.pill{display:inline-block;padding:1px 8px;border-radius:10px;font:11px var(--mono);border:1px solid}',
'.ok{color:var(--ok);border-color:#1e5c48;background:#12241f}',
'.warn{color:var(--warn);border-color:#5c4a1e;background:#241f12}',
'.bad{color:var(--bad);border-color:#5c2a26;background:#241514}',
'.dim{color:var(--dim);border-color:var(--ln);background:var(--pan2)}',
'table{border-collapse:collapse;width:100%;font:12px var(--mono)}',
'th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #1c232e}',
'th{color:var(--dim);font:11px ui-sans-serif;text-transform:uppercase;letter-spacing:.6px}',
'.bars{display:flex;gap:14px;align-items:flex-end;height:130px;padding:8px 4px;border-bottom:1px solid var(--ln)}',
'.bw{display:flex;flex-direction:column;align-items:center;gap:5px;flex:1;justify-content:flex-end;height:100%}',
'.bar{width:100%;background:linear-gradient(180deg,#7f77dd,#4d47a0);border-radius:3px 3px 0 0;min-height:2px}',
'.bar.neg{background:linear-gradient(180deg,#e0645f,#7a2f2c)}',
'.blab{font:10px var(--mono);color:var(--dim);text-align:center}',
'.note{font-size:12px;color:var(--dim);margin-top:8px}',
'.commit{display:grid;grid-template-columns:62px 1fr 78px;gap:8px;padding:4px 0;border-bottom:1px solid #1c232e;font-size:12px}',
'.commit:last-child{border:0}.sha{font:11px var(--mono);color:var(--acc)}',
'.log{font:11px var(--mono);color:var(--dim);white-space:pre-wrap;max-height:210px;overflow:auto;',
'background:#0b0e14;border:1px solid var(--ln);border-radius:6px;padding:9px}',
'</style>',
'<header><h1>UNI MODEL - what is built, and what is running</h1>',
'<span class="links"><a href="/organism">the whole organism</a><a href="/model">whiteboard</a><a href="/defects">defects &amp; repairs</a>',
'<a href="http://127.0.0.1:8102/" target="_blank">TRACK</a><a href="/api/run">json</a></span>',
'<span class="stamp" id="stamp"></span></header><main id="main">loading...</main>',
'<script>',
'var f=function(x,n){return x==null?"\\u2014":(typeof x==="number"?x.toFixed(n==null?6:n):x);};',
'function vp(v){var m={PROCEED:"ok",RUNNING:"warn",PASS:"ok",FAIL:"bad",STOPPED:"bad",QUEUED:"dim",DONE:"ok",AGITATION:"bad",WORSE:"bad"};',
'return "<span class=\\"pill "+(m[v]||"dim")+"\\">"+(v||"\\u2014")+"</span>";}',
'function sane(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}',
'function tick(){',
'fetch("/api/run?t="+Date.now()).then(function(r){return r.json();}).then(function(d){',
'document.getElementById("stamp").textContent=new Date().toLocaleTimeString()+" \\u00b7 live, never cached";',
'var r=d.run, hs=(r&&r.horizons)||[];',
'var vals=hs.filter(function(h){return h.delta!=null;}).map(function(h){return Math.abs(h.delta);});',
'var maxAbs=Math.max.apply(null,[0.0001].concat(vals));',
'var bars=hs.map(function(h){var v=h.delta==null?0:h.delta;var pc=Math.abs(v)/maxAbs*100;',
'return "<div class=\\"bw\\"><div class=\\"bar"+(v<0?" neg":"")+"\\" style=\\"height:"+(h.delta==null?2:pc)+"%\\"></div>"',
'+"<div class=\\"blab\\">"+h.ticks+"t<br>"+(h.delta==null?(h.state||"queued"):f(h.delta,5))+"</div></div>";}).join("");',
'var rows=hs.map(function(h){return "<tr><td>"+h.ticks+"</td><td>"+f(h.delta,6)+"</td><td>"+f(h.half_width,6)+"</td>"',
'+"<td>"+(h.ratio==null?"\\u2014":f(h.ratio,2)+"\\u00d7")+"</td><td>"+(h.draws_better==null?"\\u2014":h.draws_better+"/"+h.draws)+"</td>"',
'+"<td>"+vp(h.state)+"</td></tr>";}).join("");',
'var commits=(d.commits||[]).map(function(c){return "<div class=\\"commit\\"><span class=\\"sha\\">"+c.h+"</span><span>"+sane(c.s)+"</span><span class=\\"blab\\">"+c.d+"</span></div>";}).join("");',
'document.getElementById("main").innerHTML=',
'"<section class=\\"wide\\"><h2>Long-horizon measurement \\u2014 does the fix get better with time?</h2>"',
'+"<div class=\\"row\\"><span class=\\"k\\">status</span><span class=\\"v\\">"+vp(r?r.state:"QUEUED")+" "+sane(r&&r.note?r.note:"")+"</span></div>"',
'+"<div class=\\"row\\"><span class=\\"k\\">escalation rule</span><span class=\\"v\\">400 \\u2192 800 \\u2192 1600, stop early on FAIL</span></div>"',
'+"<div class=\\"bars\\">"+(bars||"<div class=\\"blab\\">waiting for first horizon\\u2026</div>")+"</div>"',
'+"<table><tr><th>ticks</th><th>\\u0394 predictive (nats/factor-tick)</th><th>null half-width</th><th>ratio</th><th>draws better</th><th>verdict</th></tr>"+rows+"</table>"',
'+"<div class=\\"note\\">Positive \\u0394 = the unpinned agent predicts its next observation better. "',
'+"A \\u0394 below the null half-width is <b>agitation, not inference</b>. \\u0394 negative and material \\u21d2 the original design was right.</div></section>"',
'+"<section><h2>What is built (committed)</h2>"+commits+"</section>"',
'+"<section><h2>Live log</h2><div class=\\"log\\">"+sane(d.log||"(no log yet)")+"</div></section>";',
'}).catch(function(e){});}',
'tick();setInterval(tick,2000);',
'</script>'
].join('\n');

http.createServer((req, res) => {
  const u = (req.url || '/').split('?')[0];
  const send = (code, type, body) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
  if (u === '/') return send(200, 'text/html; charset=utf-8', PAGE);
  if (u === '/api/run') {
    const st = readJSON(STATUS);
    const log = readFile(RUNLOG);
    return send(200, 'application/json', JSON.stringify({
      run: st, commits: gitLog(), log: log ? log.split('\n').slice(-45).join('\n') : null, now: Date.now()
    }, null, 1));
  }
  if (u === '/organism') {
    const f = readFile(path.join(ROOT, 'docs/whiteboard/organism.html'));
    return f ? send(200, 'text/html; charset=utf-8', f) : send(404, 'text/plain', 'organism view not found');
  }
  if (u === '/model') {
    const f = readFile(path.join(ROOT, 'docs/whiteboard/model.html'));
    return f ? send(200, 'text/html; charset=utf-8', f) : send(404, 'text/plain', 'whiteboard not found');
  }
  if (u === '/defects') {
    const md = readFile(path.join(ROOT, 'docs/whiteboard/DEFECTS-AND-REPAIRS.md'));
    if (!md) return send(404, 'text/plain', 'not found');
    return send(200, 'text/html; charset=utf-8',
      '<!doctype html><meta charset="utf-8"><title>Defects and repairs</title>'
      + '<style>body{background:#0d1017;color:#dfe5ee;font:14px/1.6 ui-sans-serif,Segoe UI,sans-serif;max-width:900px;margin:0 auto;padding:26px}'
      + 'pre{white-space:pre-wrap;font:12.5px ui-monospace,Consolas,monospace}a{color:#7f77dd}</style>'
      + '<p><a href="/">&larr; back</a></p><pre>' + esc(md) + '</pre>');
  }
  send(404, 'text/plain', 'not found');
}).listen(PORT, '127.0.0.1', () => console.log('UNI MODEL VIEW on http://127.0.0.1:' + PORT + '/'));
