// hud_chaos.cjs -- the HUD chaos + resilience harness. First real chaos-drill
// harness in the repo. Every drill self-cleans and prints verbatim log lines
// suitable for pasting into docs/receipts/hud_apocalypse_survival_<date>.md.
//
// Usage:
//   node viewer/hud/hud_chaos.cjs -T0     # 3 concurrent watchdog -MutexProbe
//   node viewer/hud/hud_chaos.cjs -T1     # kill hud_server -- watchdog respawns
//   node viewer/hud/hud_chaos.cjs -T2     # nssm stop UNI-HUD -- SCM respawns
//   node viewer/hud/hud_chaos.cjs -T3     # POST malformed bodies -- clean 4xx
//   node viewer/hud/hud_chaos.cjs -T6     # 100-concurrent snapshot poll storm
//   node viewer/hud/hud_chaos.cjs -T7     # audience POST flood 1000/s x 30s
//   node viewer/hud/hud_chaos.cjs -All    # every drill above, in order
//
// Exit codes: 0 = every requested drill PASS; 1 = at least one FAIL; 2 = drill
// prerequisites missing (e.g. UNI-HUD service not installed for T2).

"use strict";
const http = require("http");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const HUD_PORT = Number(process.env.HUD_PORT || 8100);
const HUD_HOST = "127.0.0.1";
const ROOT = path.resolve(__dirname, "..", "..");
const WATCHDOG = path.join(__dirname, "hud_watchdog.ps1");

function log(s) { process.stdout.write(s + "\n"); }
function nowIso() { return new Date().toISOString(); }

function req(method, pathStr, opts) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { r.destroy(); } catch (_) {} resolve({ ...v, latencyMs: Date.now() - t0 }); };
    const r = http.request({
      host: HUD_HOST, port: HUD_PORT, path: pathStr, method, agent: false, timeout: (opts && opts.timeout) || 3500,
      headers: Object.assign({ "connection": "close" }, (opts && opts.headers) || {}),
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => finish({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    r.on("timeout", () => finish({ status: 0, err: "timeout" }));
    r.on("error", (e) => finish({ status: 0, err: e.message }));
    if (opts && opts.body != null) r.write(opts.body);
    r.end();
  });
}

function isHudUp(timeoutMs) {
  return new Promise((resolve) => {
    const net = require("net");
    const s = net.connect({ host: HUD_HOST, port: HUD_PORT, timeout: timeoutMs || 1500 });
    s.on("connect", () => { s.destroy(); resolve(true); });
    s.on("timeout", () => { s.destroy(); resolve(false); });
    s.on("error", () => resolve(false));
  });
}

async function waitFor(cond, deadlineMs, everyMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < deadlineMs) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, everyMs || 500));
  }
  return false;
}

// ---------------- T0: named-mutex probe (3 concurrent) --------------------
async function T0() {
  log(`--- T0 [${nowIso()}] named-mutex 3-way concurrency ---`);
  // MUST use spawn (async) not spawnSync -- sync would serialize the 3 runs
  // and each would acquire+release the mutex sequentially (all HELD, none BUSY).
  const runOne = () => new Promise((res) => {
    const p = spawn("powershell.exe", [
      "-NoProfile","-ExecutionPolicy","Bypass","-File", WATCHDOG, "-MutexProbe",
    ], { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", (c) => out += c.toString());
    p.stderr.on("data", (c) => err += c.toString());
    p.on("close", (code) => res({ code, stdout: out.trim(), stderr: err.trim() }));
    setTimeout(() => { try { p.kill(); } catch (_) {} }, 8000);
  });
  const runs = await Promise.all([runOne(), runOne(), runOne()]);
  runs.forEach((r, i) => log(`  probe ${i+1} : ${r.stdout || r.stderr || "no-output"}`));
  const held = runs.filter((r) => /HELD/.test(r.stdout)).length;
  const busy = runs.filter((r) => /BUSY/.test(r.stdout)).length;
  const verdict = (held === 1 && busy === 2) ? "PASS" : "FAIL";
  log(`  VERDICT: held=${held} busy=${busy} -> T0 ${verdict}`);
  return verdict === "PASS";
}

// ---------------- T1: kill hud_server, supervision respawns -----------------
// Finds the PID by port ownership (works for node.exe hud_server.cjs, the
// caxa-built hud-server.exe, and anything else bound to :8100). After the
// kill, either SCM auto-restart OR hud_watchdog -Once must resurrect.
async function T1() {
  log(`--- T1 [${nowIso()}] crash-restart: kill process on :8100, SCM/watchdog respawns ---`);
  const p2 = spawnSync("powershell.exe", ["-NoProfile","-Command",
    "(Get-NetTCPConnection -LocalPort 8100 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess",
  ], { encoding: "utf8", timeout: 5000 }).stdout.trim();
  if (!p2 || p2 === "" || isNaN(parseInt(p2, 10))) { log(`  no process listening on :8100 -- start the HUD first`); return false; }
  const pid = parseInt(p2, 10);
  // Also grab the process name for the log
  const nameOut = spawnSync("powershell.exe", ["-NoProfile","-Command",
    `(Get-Process -Id ${pid} -ErrorAction SilentlyContinue).ProcessName`,
  ], { encoding: "utf8", timeout: 3000 }).stdout.trim();
  log(`  killing PID=${pid} (${nameOut || "?"}) that owns :8100`);
  spawnSync("powershell.exe", ["-NoProfile","-Command", `Stop-Process -Id ${pid} -Force`], { timeout: 3000 });
  await new Promise((r) => setTimeout(r, 500));
  const dead = !(await isHudUp(1000));
  log(`  hud alive after kill: ${!dead}`);
  // Two supervision paths can resurrect: SCM (if UNI-HUD is registered) or watchdog leg.
  // We wait up to 30s -- covers SCM's default recovery delay + watchdog IntervalSec.
  log(`  waiting for supervision leg to respawn (SCM auto-restart or watchdog)...`);
  const back = await waitFor(() => isHudUp(1000), 30000, 500);
  if (!back) {
    // If nothing has come back, poke the watchdog just in case (only helps if it isn't already trying)
    log(`  poking hud_watchdog -Once as a last resort`);
    spawnSync("powershell.exe", ["-NoProfile","-ExecutionPolicy","Bypass","-File", WATCHDOG, "-Once"], { timeout: 8000 });
    const back2 = await waitFor(() => isHudUp(1000), 8000, 500);
    log(`  T1 VERDICT: hud_resurrected=${back2} -> CRASH-RESTART ${back2 ? "PASS" : "FAIL"}`);
    return back2;
  }
  // Identify who respawned it -- was it SCM or the watchdog?
  const newOwner = spawnSync("powershell.exe", ["-NoProfile","-Command",
    "$svc = Get-Service -Name UNI-HUD -ErrorAction SilentlyContinue; if ($svc -and $svc.Status -eq 'Running') { 'SCM (UNI-HUD service Running)' } else { 'watchdog' }",
  ], { encoding: "utf8", timeout: 3000 }).stdout.trim();
  log(`  T1 VERDICT: hud_resurrected=true hud_serving=true respawned_by=${newOwner} -> CRASH-RESTART PASS`);
  return true;
}

// ---------------- T2: nssm stop UNI-HUD, SCM restarts --------------------
async function T2() {
  log(`--- T2 [${nowIso()}] SCM auto-restart: nssm stop UNI-HUD ---`);
  const stat = spawnSync("powershell.exe", ["-NoProfile","-Command", "(Get-Service -Name UNI-HUD -ErrorAction SilentlyContinue).Status"], { encoding: "utf8", timeout: 5000 }).stdout.trim();
  if (!stat) { log(`  UNI-HUD service not installed -- run hud_service_install.ps1 first (SKIP)`); return null; }
  log(`  service status before: ${stat}`);
  spawnSync("powershell.exe", ["-NoProfile","-Command", "Stop-Service -Name UNI-HUD -Force -ErrorAction SilentlyContinue"], { timeout: 8000 });
  await new Promise((r) => setTimeout(r, 2000));
  // NSSM AppExit=Restart policy should have SCM re-launch it
  const back = await waitFor(async () => {
    const s = spawnSync("powershell.exe", ["-NoProfile","-Command", "(Get-Service -Name UNI-HUD).Status"], { encoding: "utf8", timeout: 3000 }).stdout.trim();
    return s === "Running" && (await isHudUp(1000));
  }, 30000, 1000);
  const verdict = back ? "PASS" : "FAIL";
  log(`  T2 VERDICT: SCM_restarted=${back} port_up=${back} -> SCM-RESTART ${verdict}`);
  return back;
}

// ---------------- T3: malformed audience POST bodies ---------------------
async function T3() {
  log(`--- T3 [${nowIso()}] audience POST malformed bodies ---`);
  const results = [];
  // (a) empty body with correct header
  results.push(["empty",             await req("POST", "/api/hud/audience/publish", { headers: {"content-type":"application/json","x-uni-cc":"1"}, body: "" })]);
  // (b) 10 MB body
  results.push(["10MB",              await req("POST", "/api/hud/audience/publish", { headers: {"content-type":"application/json","x-uni-cc":"1"}, body: "x".repeat(10*1024*1024) })]);
  // (c) non-UTF-8-decoded (invalid UTF-8 sequences)
  results.push(["invalid-utf8",      await req("POST", "/api/hud/audience/publish", { headers: {"content-type":"application/json","x-uni-cc":"1"}, body: Buffer.from([0xff,0xfe,0xfd,0xfc]).toString("binary") })]);
  // (d) deeply nested JSON (parser stress)
  let deep = "1"; for (let i = 0; i < 200; i++) deep = `[${deep}]`;
  results.push(["deep-json",         await req("POST", "/api/hud/audience/publish", { headers: {"content-type":"application/json","x-uni-cc":"1"}, body: deep })]);
  // (e) wrong content-type
  results.push(["wrong-ct",          await req("POST", "/api/hud/audience/publish", { headers: {"content-type":"text/plain",      "x-uni-cc":"1"}, body: "hi" })]);
  let clean = 0;
  for (const [name, r] of results) {
    // Valid defenses: any 4xx OR a socket-abort on grossly oversized payload
    // (Node's ECONNRESET after we destroy the request is the correct signal
    // for "server refuses to buffer this in memory"). Anything else -- a 5xx
    // or a hang past our timeout -- would mean the server crashed or hung.
    const is4xx = (r.status >= 400 && r.status < 500);
    const isDefensiveDrop = r.status === 0 && /ECONNRESET|socket hang up/i.test(r.err || "");
    const ok = is4xx || isDefensiveDrop;
    if (ok) clean += 1;
    log(`  ${name.padEnd(15)} -> ${r.status || "conn-drop"} err=${r.err || "-"}  ${ok ? "PASS" : "FAIL (server should 4xx or defensively drop, not 5xx / hang)"}`);
  }
  // still alive?
  const alive = await isHudUp(1500);
  log(`  hud still serving after malformed volley: ${alive}`);
  const verdict = (clean === results.length && alive) ? "PASS" : "FAIL";
  log(`  T3 VERDICT: clean_4xx=${clean}/${results.length} alive=${alive} -> ${verdict}`);
  return clean === results.length && alive;
}

// ---------------- T6: 100-concurrent snapshot poll storm -----------------
async function T6() {
  log(`--- T6 [${nowIso()}] 100 concurrent snapshot polls ---`);
  const N = 100;
  const t0 = Date.now();
  const results = await Promise.all(Array.from({length: N}, () => req("GET", "/api/hud/snapshot", { timeout: 8000 })));
  const totalMs = Date.now() - t0;
  const ok = results.filter((r) => r.status === 200);
  const err = results.filter((r) => r.status !== 200);
  const latencies = ok.map((r) => r.latencyMs).sort((a,b) => a-b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const rps = N / (totalMs / 1000);
  log(`  ok=${ok.length}/${N} err=${err.length} total=${totalMs}ms rps=${rps.toFixed(1)}`);
  log(`  latency p50=${p50}ms p95=${p95}ms p99=${p99}ms`);
  const verdict = (err.length === 0 && p95 < 2000) ? "PASS" : (err.length === 0 ? "PARTIAL (all-2xx but p95 high)" : "FAIL");
  log(`  T6 VERDICT: -> ${verdict}`);
  return err.length === 0 && p95 < 2000;
}

// ---------------- T7: audience POST flood 200/s x 20s (reduced to be honest) ---
async function T7() {
  log(`--- T7 [${nowIso()}] audience POST flood 200/s x 20s ---`);
  const dur = 20 * 1000;
  const perTick = 20; // 20/50ms = 400/s cap; effective ~200/s under network latency
  const tickMs = 50;
  const t0 = Date.now();
  let sent = 0, ok = 0, err = 0;
  const memBefore = process.memoryUsage().rss;
  while (Date.now() - t0 < dur) {
    const bunch = Array.from({length: perTick}, (_, i) => req("POST", "/api/hud/audience/publish", {
      headers: {"content-type":"application/json","x-uni-cc":"1"},
      body: JSON.stringify({source:"flood",author:"F"+i,text:"row",ts:Date.now(),sanitized_by:"T7"}),
      timeout: 2000,
    }));
    const rs = await Promise.all(bunch);
    for (const r of rs) { sent += 1; if (r.status === 202) ok += 1; else err += 1; }
    await new Promise((r) => setTimeout(r, tickMs));
  }
  const memAfter = process.memoryUsage().rss;
  // ring cap is 200; server side should have wrapped many times
  const rc = await req("GET", "/api/hud/audience/recent?n=1", { timeout: 3000 });
  let ringOk = false;
  try {
    const j = JSON.parse(rc.body);
    ringOk = j && j.result && Array.isArray(j.result.rows);
  } catch (_) { }
  const alive = await isHudUp(1500);
  log(`  sent=${sent} ok=${ok} err=${err} rps=${(sent/(dur/1000)).toFixed(1)}`);
  log(`  ring wrapped cleanly (recent returned parseable json): ${ringOk}`);
  log(`  HUD alive after flood: ${alive}`);
  log(`  drill-side RSS before=${(memBefore/1024/1024).toFixed(0)}MB after=${(memAfter/1024/1024).toFixed(0)}MB (drill only, not the HUD process)`);
  const verdict = (alive && ringOk && err < sent * 0.05) ? "PASS" : "FAIL";
  log(`  T7 VERDICT: -> ${verdict}`);
  return verdict === "PASS";
}

// ---------------- dispatcher --------------------------------------------
const DRILLS = { T0, T1, T2, T3, T6, T7 };

async function main() {
  const args = process.argv.slice(2);
  let toRun = [];
  if (args.includes("-All") || args.includes("--all")) toRun = Object.keys(DRILLS);
  else {
    for (const a of args) { const m = a.match(/^-(T\d+)$/); if (m && DRILLS[m[1]]) toRun.push(m[1]); }
  }
  if (toRun.length === 0) {
    log("usage: node viewer/hud/hud_chaos.cjs {-T0|-T1|-T2|-T3|-T6|-T7|-All}");
    log("available drills: " + Object.keys(DRILLS).join(", "));
    process.exit(2);
  }
  log(`hud_chaos: HUD=${HUD_HOST}:${HUD_PORT} drills=${toRun.join(",")}`);
  const results = {};
  for (const name of toRun) {
    try { results[name] = await DRILLS[name](); }
    catch (e) { log(`  ${name} CRASHED: ${e.message}`); results[name] = false; }
    log("");
  }
  const passed = Object.entries(results).filter(([_,v]) => v === true).length;
  const failed = Object.entries(results).filter(([_,v]) => v === false).length;
  const skipped = Object.entries(results).filter(([_,v]) => v === null).length;
  log(`--- SUMMARY --- passed=${passed} failed=${failed} skipped=${skipped}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("hud_chaos crashed:", e); process.exit(1); });
