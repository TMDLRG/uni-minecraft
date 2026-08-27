// door_lifecycle.cjs — THE CIRCLE, written in code. Every door in the studio has a full lifecycle:
// open/closed x locked/unlocked, HOW it opens, HOW it closes, HOW it was locked and unlocked, the
// live state of all, the vectors (declared transition methods), an append-only audit trail where
// every opening knows of every closing, and a prediction of each door's next transition. The circle
// invariant: an OPEN door must be provably ready to close, a CLOSED door provably ready to open —
// otherwise circle_ok=false and the register says exactly why. ONE KEY (door "all") opens or closes
// every studio door through the same coherent path (studio_up.ps1 / graceful -Stop).
//
// THE MANDATE (binding): doors on the chip/relay (colony, world, colonycam, relay) are OBSERVE-ONLY.
// This system never impacts the UNIs — it observes them. Their open/close verbs REFUSE with the
// mandate text; mutation belongs to Organic Operator Michael Polzin via the fleet approval queue /
// science seat. Gaia reads the register file as a signal (she projects; she never actuates).
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(__dirname, "runtime");
const LEDGER = path.join(RUNTIME, "door_lifecycle.ndjson");   // the audit trail of all
const REGISTER = path.join(RUNTIME, "door_state.json");        // the state of all (Gaia's signal source)
// the chip's plane-forced LAN name (NO-IP law; zone fixed + producer record added 2026-07-15).
// Node-side probes resolve it via getaddrinfo/NRPT (proven live). Hrefs the OPERATOR'S CHROME opens
// still need a literal IP — Chromium-engine consumers on this box measurably do not resolve
// .uni-lab.local (2026-07-15; full rationale in studio_stage.cjs at regUrl) — but that IP is now
// LIVE-RESOLVED from the name via host_resolve.cjs, not read from a hand-declared registry field.
// FIXED 2026-07-16: these hrefs were `http://${s.ips[0]}:...` off infra_registry.json. When the chip's
// DHCP lease moved .122 -> .121 the declared literal went stale in place and every remote door linked
// to a dead address while the colony was demonstrably LIVE. Hrefs are resolved per state() call now,
// so a lease move self-heals within one poll. Null-safe: an unresolvable name degrades to a
// non-clickable door (door.html only renders href-bearing nodes as links) — honestly dead, never a
// link to a dead page, and never a crashed lifecycle module.
const COLONY_HOST = process.env.COLONY_HOST || "uni-lab-lan.uni-lab.local";
const hosts = require("./host_resolve.cjs");
const { cachedTcp } = require("./probes.cjs"); // TTL-cached probe for the OFF-BOX relay door only
const MANDATE = "REFUSED - this system never impacts the UNIs; it only observes them. Opening/closing " +
  "this door belongs to Organic Operator Michael Polzin (fleet approval queue / science seat), never to the studio.";

function tcp(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (done) return; done = true; try { s.destroy(); } catch (_) {} resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true)); s.once("timeout", () => fin(false)); s.once("error", () => fin(false));
    s.connect(port, host);
  });
}
function httpJson(host, port, p, timeout = 2000, method = "GET", hdrs = {}) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: p, method, timeout, headers: Object.assign({ "x-uni-cc": "1", "Content-Type": "application/json" }, hdrs) }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: JSON.parse(b || "null") }); } catch (_) { resolve({ ok: res.statusCode < 500, status: res.statusCode, body: null }); } });
    });
    req.on("error", () => resolve({ ok: false, status: 0, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: 0, body: null }); });
    if (method === "POST") req.write("{}");
    req.end();
  });
}
function audit(entry) {
  try {
    fs.mkdirSync(RUNTIME, { recursive: true });
    fs.appendFileSync(LEDGER, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n");
  } catch (_) {}
}
function ledgerTail(n) {
  try { return fs.readFileSync(LEDGER, "utf8").trim().split(/\r?\n/).slice(-n).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); }
  catch (_) { return []; }
}
// NEVER stdio:ignore for lifecycle actions — a silently-failed close/open is undiagnosable (the
// exact failure class launcher.cjs already documents). Every action's output lands in one log.
const ps = (args, note) => {
  let out = "ignore", err = "ignore";
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    out = fs.openSync(path.join(ROOT, "logs", "door_lifecycle.out.log"), "a");
    err = fs.openSync(path.join(ROOT, "logs", "door_lifecycle.err.log"), "a");
    fs.writeSync(out, `\n===== ${note} @ ${new Date().toISOString()} =====\n`);
  } catch (_) { out = "ignore"; err = "ignore"; }
  // detached:true is the bug, not a feature: a detached powershell dies instantly-and-mutely under
  // this node context (proven 2026-07-14 - the close-all wrote a header and nothing else). Non-
  // detached Windows children run to completion regardless; unref keeps the event loop free.
  const p = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args], { cwd: ROOT, stdio: ["ignore", out, err], windowsHide: true });
  p.on("error", (e) => { try { fs.writeSync(err === "ignore" ? 2 : err, "SPAWN ERROR " + e.message + "\n"); } catch (_) {} });
  p.unref(); return note;
};

// ---- THE REGISTRY: every door, its scope, its probe, and its four vectors (open/close/lock/unlock).
// scope: studio = ours to open/close · frame = the door itself (never closed by close-all) ·
//        observer = Gaia (explicit-only) · remote = OBSERVE-ONLY (the mandate) · virtual = a state door.
// href: the browser-openable URL for this door, WHEN one genuinely exists. Deliberately absent for
// non-web protocols (raw Minecraft :25565, RTMP :1935, OBS-websocket :4455, MediaMTX's API :9997) and
// for the native HUD (JSON-only by construction — "no /, /hud, or /hud.html route", see docs/HUD.md) —
// door.html's node() only renders a node as clickable when href is present, so these stay honestly
// non-clickable rather than linking to a dead page. Loopback literals here match the existing pattern
// already used by launcher.cjs's own links[] array; remote hrefs reuse the same COLONY_HOST constant
// the probes above already use (no new IP-literal surface introduced).
const DOORS = [
  { key: "door",      label: "The Door (launcher :8090)", scope: "frame",
    probe: () => tcp("127.0.0.1", 8090), href: "http://127.0.0.1:8090/door",
    how: { open: "icon / door_open.vbs -> door_watchdog -> launcher.cjs (mutex-deduped)", close: "explicit operator kill only; door_watchdog + Startup .vbs reopen it (by design the frame outlives the room)", lock: "never locked - the frame must always answer", unlock: "n/a" } },
  { key: "gaia",      label: "Gaia mirror (:8096)", scope: "observer",
    probe: () => tcp("127.0.0.1", 8096), href: "http://127.0.0.1:8096/gaia",
    how: { open: "viewer/gaia/gaia_watchdog.ps1 (supervises server + mind-capture loop)", close: "explicit only - never part of close-all (the witness stays awake)", lock: "read-only BY LAW (GET-only; non-GET = 405)", unlock: "never - her law is the lock" } },
  { key: "hud",       label: "UNI HUD (native, :8100)", scope: "observer",
    probe: () => tcp("127.0.0.1", 8100),
    how: { open: "backend UNI-HUD service: SCM auto-restart (sc.exe failure recovery); widget: UNI-HUD-WidgetLauncher service triggers Scheduled Task 'UNI\\HUD Widget' (interactive-token, at-logon + restart-on-failure) - no script", close: "explicit only - never part of close-all (the glance surface stays awake)", lock: "read-only JSON API BY LAW (no HTML route exists - GET / and /hud return 404 by construction)", unlock: "never - the API has no mutating route" } },
  { key: "obs",       label: "OBS mixer (:4455)", scope: "studio",
    probe: () => tcp("127.0.0.1", 4455),
    how: { open: "studio_up.ps1 (clears .sentinel + safe-mode markers FIRST, starts with --disable-shutdown-check: self-heals, starts clean, never blocks on the safe-mode dialog)", close: "graceful: CloseMainWindow (clean exit writes no sentinel) -> wait -> force only as fallback", lock: "refuses to close while INGESTING (MediaMTX uni.ready guard)", unlock: "go off air first (offair is 1-click)" } },
  { key: "mediamtx",  label: "MediaMTX (:9997)", scope: "studio",
    probe: () => tcp("127.0.0.1", 9997),
    how: { open: "studio_up.ps1 (idempotent reuse)", close: "kill after the uni-path ingest guard (stateless service)", lock: "refuses to close while path uni is ready (you would drop the audience)", unlock: "stop the stream first" } },
  { key: "console",   label: "Command center (:8098)", scope: "studio", supervised: true,
    probe: () => tcp("127.0.0.1", 8098), href: "http://127.0.0.1:8098/",
    how: { open: "studio_up.ps1 / systray_watchdog auto-restart", close: "graceful POST /api/shutdown (stops fan-out children, flushes, exits 0)", lock: "GO LIVE inside it stays locked behind the human CONFIRM key (G-PA)", unlock: "n/a for the door itself" } },
  { key: "overlays",  label: "Overlay server (:8099)", scope: "studio", supervised: true,
    probe: () => tcp("127.0.0.1", 8099), href: "http://127.0.0.1:8099/",
    how: { open: "studio_up.ps1 / systray_watchdog auto-restart", close: "graceful POST /shutdown", lock: "never locked", unlock: "n/a" } },
  { key: "publisher", label: "Camera gateway (:8443/:8095)", scope: "studio", supervised: true,
    probe: () => tcp("127.0.0.1", 8443), href: "https://127.0.0.1:8443/",
    how: { open: "studio_up.ps1 / systray_watchdog auto-restart", close: "graceful POST /shutdown on :8095", lock: "MediaMTX ACL: off-box may publish cam1..10 only, never the program path", unlock: "by design never (the ACL is structural)" } },
  { key: "stream",    label: "The stream (public air)", scope: "virtual",
    probe: async () => { const r = await httpJson("127.0.0.1", 9997, "/v3/paths/list"); try { return (r.body.items || []).some((x) => x.name === "uni" && x.ready); } catch (_) { return false; } },
    how: { open: "LOCKED to the studio: only the operator's typed CONFIRM opens it (gate G-PA) - the agent can only stage", close: "POST /api/offair (1-click, never blocked)", lock: "always locked; the key is the human word CONFIRM", unlock: "the operator types CONFIRM - that IS the unlock" } },
  { key: "producer",  label: "THE UNI PRODUCER (unique UNI: camera + report)", scope: "remote",
    // :4200 = uni-producer, the fenced HEAD show-runner (gate producer-camera-attached PASS
    // 2026-07-15); the legacy v2 node's :4000 has no health route.
    probe: async () => { const r = await httpJson(COLONY_HOST, 4200, "/producer/health"); return r.status === 200; }, hrefFor: ["producer", "/stream"],
    how: { open: MANDATE + " Restoring the Producer = the science seat's colony-brain redeploy from HEAD, with the MANDATORY capture-before-destroy procedure (docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md) run FIRST.", close: MANDATE, lock: "locked to the studio by the mandate; its life is science-track", unlock: "Organic Operator Michael Polzin directs the science seat; the studio only observes and reports its absence honestly" } },
  // WORLD — the same defect the launcher's world tile carried, reported by the operator on air
  // 2026-08-02: "there is a minecraft paper server and it was and is running look, UNI is on the chip
  // and the world IS running". He was right, and this door was permanently CLOSED against a world
  // that was ticking at 20 TPS with 5 UNIs in it.
  //
  // The probe was `tcp(COLONY_HOST, 25565)`. The colony runs rootless in Podman and 25565 is NOT
  // LAN-published (the name resolves to a podman-internal 10.89.x address), so that probe can never
  // succeed from this box — BY DESIGN. command_center.cjs:1382 and gaia/caps.cjs:218 had both already
  // written that down; this door never got the memo and reported a structural networking fact as a
  // shut door on the world itself. An alarm that can never clear is not an alarm.
  //
  // The world's OWN tick rate is the honest signal: /producer/health carries tps={up,tps}, and a
  // Paper server reporting 20 TPS is definitionally running. Port reachability is still accepted as
  // corroboration if it ever becomes LAN-published, but it is no longer the thing that decides.
  { key: "world",     label: "World @UNI-LAB (Minecraft, by its own tick rate)", scope: "remote",
    probe: async () => {
      const r = await httpJson(COLONY_HOST, 4200, "/producer/health");
      const tps = r && r.body && r.body.tps;
      if (tps && tps.up === true && typeof tps.tps === "number" && tps.tps > 0) return true;
      return tcp(COLONY_HOST, 25565);        // fallback only; :25565 is not LAN-published today
    } },
  { key: "colony",    label: "UNI colony @UNI-LAB (:4000)", scope: "remote", probe: () => tcp(COLONY_HOST, 4000), hrefFor: ["colony", "/"] },
  { key: "colonycam", label: "Colony camera @UNI-LAB (:3020)", scope: "remote", probe: () => tcp(COLONY_HOST, 3020), hrefFor: ["colonycam", "/"] },
  // 2026-07-17 (gate journey-vectors-durable-and-probed, C4): this was a hard-coded node2 IP LITERAL
  // in the tcp() probe, while every other remote door resolves BY NAME. That is the
  // rot-in-place the NO-IP law exists to prevent (the chip's own literal already went .122 -> .121
  // and broke consumers). The relay's address lives in ONE place — infra_registry.json services[]
  // (name "relay", node2) — resolved here via host_resolve (DNS-first, declared-fallback). If neither
  // answers, ip is null and the probe reads DOWN honestly, never against a stale literal.
  { key: "relay",     label: "Fan-out relay node2 (:1935)", scope: "remote",
    // node2 is OFF-BOX; this door is polled every ~3s by the Door page AND the HUD service. Use the
    // shared 8s TTL cache (probes.cjs) so it never contributes to the node2 socket churn — the relay's
    // up/down does not change every 8s and go-live is proven by the publish attempt, not this tile.
    probe: async () => { const r = await hosts.resolve("relay"); return r && r.ip ? cachedTcp(r.ip, 1935, { ttlMs: 8000 }) : false; } },
];
for (const d of DOORS) if (d.scope === "remote" && !d.how) d.how = { open: MANDATE, close: MANDATE, lock: "locked to the studio by the mandate itself", unlock: "only Organic Operator Michael Polzin directs mutation (fleet approval queue)" };

async function isStreaming() {
  const r = await httpJson("127.0.0.1", 9997, "/v3/paths/list");
  try { return (r.body.items || []).some((x) => x.name === "uni" && x.ready); } catch (_) { return false; }
}
function systrayUp() {
  return true; // presence is re-checked by the predictor via port behavior; cheap heuristic (systray has no port)
}

function predict(d, open, streaming) {
  // predictions of future openings/closings — declared from the KNOWN supervisors and guards,
  // recorded into the register so Gaia can project past (ledger) + future (these) together.
  if (d.key === "producer") return open ? "the UNI Producer LIVES: driver=producer, camera flown, reports narrated - keep observing (uni-producer :4200, gate producer-camera-attached PASS)" : "uni-producer container down on the chip - the fenced HEAD show-runner (observe-only) restarts via the science seat / chip supervision; the colony itself is untouched by its absence";
  if (d.scope === "remote") return open ? "stays open independent of the studio - the UNIs continue; we only observe" : "reopens only by the chip's own supervision or the operator's direction";
  if (d.key === "door") return open ? "if killed: door_watchdog reopens it in <=5s; icon/Startup .vbs resurrect from cold" : "watchdog/icon/boot leg will reopen it within seconds";
  if (d.key === "gaia") return open ? "gaia_watchdog restarts her on crash; Startup .vbs on logon" : "reopens on gaia_watchdog start or next logon";
  if (d.key === "hud") return open ? "backend: SCM restart on crash; widget: launcher service re-triggers the task in <=5s, task self-fires at logon" : "reopens on the next SCM restart cycle or next logon";
  if (d.key === "stream") return open ? "closes instantly on offair (1-click) or encoder stop; fan-out children respawn until told to stop" : "opens ONLY when the operator types CONFIRM (G-PA) with plumbing green";
  if (d.supervised) return open ? "if closed individually: systray_watchdog is predicted to reopen it in ~5s (close it via close-all to keep it closed)" : "systray_watchdog (if alive) or open-all reopens it";
  if (d.key === "obs") return open ? (streaming ? "LOCKED against close while ingesting" : "graceful close on demand leaves no sentinel -> next open is clean, no safe-mode dialog") : "open-all starts it with markers cleared + --disable-shutdown-check (self-healing start)";
  if (d.key === "mediamtx") return open ? (streaming ? "LOCKED against close while path uni is ready" : "closes on demand; stateless") : "open-all restarts it in seconds";
  return open ? "ready to close" : "ready to open";
}

async function state() {
  const streaming = await isStreaming();
  // Probes and href resolution are independent — run them together so adding the resolve step costs
  // no extra wall-clock. host_resolve caches for TTL_MS, so a steady state is ~free; a DHCP move is
  // picked up on the first poll after the TTL lapses. A read NEVER actuates (binding law #1): this
  // resolves names and reads ports, nothing more.
  const [opens, hrefs] = await Promise.all([
    Promise.all(DOORS.map((d) => d.probe())),
    Promise.all(DOORS.map((d) => (d.hrefFor ? hosts.urlFor(d.hrefFor[0], d.hrefFor[1]).catch(() => null) : Promise.resolve(d.href || null)))),
  ]);
  const doors = DOORS.map((d, i) => {
    const open = !!opens[i];
    const locked = d.key === "stream" ? true
      : d.key === "obs" || d.key === "mediamtx" ? (open && streaming)
      : d.scope === "remote" ? true
      : false;
    const ready_to_open = !open && (d.scope === "studio" || d.key === "door" || d.key === "gaia" || d.key === "hud" || d.key === "stream");
    const ready_to_close = open && !locked && (d.scope === "studio" || d.key === "gaia" || d.key === "hud" || d.key === "stream");
    // the circle: an open door ready to close, a closed door ready to open. Remote doors are outside
    // our circle by mandate (we observe theirs); the frame refuses closure by design; a LOCKED open
    // door is circle-true because the lock is a declared guard with a declared key, not a defect.
    const circle_ok = d.scope === "remote" ? true
      : d.key === "door" ? true
      : open ? (ready_to_close || locked) : ready_to_open;
    return { key: d.key, label: d.label, scope: d.scope, open, locked, ready_to_open, ready_to_close, circle_ok, how: d.how, href: hrefs[i] || null, prediction: predict(d, open, streaming) };
  });
  const reg = { updatedUtc: new Date().toISOString(), streaming, mandate: MANDATE, doors, audit_tail: ledgerTail(12) };
  try { fs.mkdirSync(RUNTIME, { recursive: true }); fs.writeFileSync(REGISTER, JSON.stringify(reg, null, 2)); } catch (_) {}
  return reg;
}

async function verb(doorKey, action, actor) {
  const d = DOORS.find((x) => x.key === doorKey);
  const pre = await state();
  const cur = doorKey === "all" ? null : (pre.doors.find((x) => x.key === doorKey) || null);
  const entry = { door: doorKey, verb: action, actor: actor || "operator", prior: cur ? { open: cur.open, locked: cur.locked } : { register: "all" } };
  if (doorKey === "all") {
    if (action === "open") { ps(["-File", path.join(ROOT, "viewer", "studio_up.ps1")], "open-all"); entry.method = "ONE KEY: studio_up.ps1 (idempotent coherent bring-up; OBS starts self-healed, markers cleared)"; entry.predicted = "every studio door open within ~120s; remote doors untouched (mandate)"; }
    else { ps(["-File", path.join(ROOT, "viewer", "studio_up.ps1"), "-Stop"], "close-all"); entry.method = "ONE KEY: studio_up.ps1 -Stop (GRACEFUL: /shutdown endpoints + OBS CloseMainWindow first, force only as fallback; refuses while ingesting unless -Force)"; entry.predicted = "every studio door closed; the frame (door) + the witness (gaia) + every remote door stay open; the UNIs continue untouched"; }
    audit(entry); return { ok: true, ledger: entry };
  }
  if (!d) return { ok: false, err: "unknown door: " + doorKey };
  if (d.scope === "remote") { entry.result = "REFUSED (mandate)"; entry.mandate = MANDATE; audit(entry); return { ok: false, refused: true, mandate: MANDATE }; }
  if (d.key === "door" && action === "close") { entry.result = "REFUSED (the frame keeps standing; kill it explicitly and the watchdog answers)"; audit(entry); return { ok: false, refused: true, err: entry.result }; }
  if (d.key === "stream" && action === "open") { entry.result = "REFUSED (G-PA: only the operator's typed CONFIRM opens the stream door)"; audit(entry); return { ok: false, refused: true, err: entry.result }; }
  if (action === "close" && cur && cur.locked) { entry.result = "REFUSED (locked: " + d.how.lock + ")"; audit(entry); return { ok: false, refused: true, err: entry.result }; }
  let method = "";
  if (action === "open") {
    if (d.key === "gaia") method = ps(["-File", path.join(ROOT, "viewer", "gaia", "gaia_watchdog.ps1")], "gaia_watchdog.ps1");
    else method = ps(["-File", path.join(ROOT, "viewer", "studio_up.ps1")], "studio_up.ps1 (idempotent)");
  } else {
    if (d.key === "console") { await httpJson("127.0.0.1", 8098, "/api/shutdown", 3000, "POST"); method = "graceful POST /api/shutdown"; }
    else if (d.key === "overlays") { await httpJson("127.0.0.1", 8099, "/shutdown", 3000, "POST"); method = "graceful POST /shutdown"; }
    else if (d.key === "publisher") { await httpJson("127.0.0.1", 8095, "/shutdown", 3000, "POST"); method = "graceful POST /shutdown (:8095)"; }
    else if (d.key === "obs") method = ps(["-Command", "$p=Get-Process obs64 -ErrorAction SilentlyContinue; if($p){ $p.CloseMainWindow() | Out-Null; if(-not $p.WaitForExit(8000)){ $p | Stop-Process -Force } }"], "CloseMainWindow -> wait 8s -> force fallback");
    else if (d.key === "mediamtx") method = ps(["-Command", "Get-Process mediamtx -ErrorAction SilentlyContinue | Stop-Process -Force"], "stop (guard already passed: not ingesting)");
    else if (d.key === "gaia") method = ps(["-Command", "Get-CimInstance Win32_Process -Filter \"Name='powershell.exe'\" | Where-Object { $_.CommandLine -like '*gaia_watchdog.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*gaia_server.cjs*' -or $_.CommandLine -like '*capture_minds_loop.cjs*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], "explicit witness shutdown (watchdog first, then server + capture loop)");
    else if (d.key === "stream") { await httpJson("127.0.0.1", 8098, "/api/offair", 4000, "POST"); method = "POST /api/offair (1-click)"; }
  }
  entry.method = method; entry.predicted = predict(d, action === "open", pre.streaming);
  audit(entry);
  return { ok: true, ledger: entry };
}

module.exports = { state, verb, LEDGER, REGISTER };
