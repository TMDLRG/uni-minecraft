#!/usr/bin/env node
// obs_supervisor.cjs — OBS can never reach safe mode, can never be silently double-started, and
// recovers from a crash without a human.
//
//   node viewer/obs_supervisor.cjs            # one pass: observe, repair if needed, report
//   node viewer/obs_supervisor.cjs --watch    # stay resident and keep it true
//   node viewer/obs_supervisor.cjs --status   # observe only, change nothing
//
// WHAT ACTUALLY BROKE, MEASURED 2026-08-02 DURING A LIVE SHOW
// ----------------------------------------------------------
// Three distinct faults, in the order they bit:
//
//   1. SAFE MODE. %APPDATA%/obs-studio/.sentinel is a DIRECTORY, not a file, and it holds one
//      `run_<uuid>` marker per session. OBS writes one at start and removes it on a clean exit; on
//      start, ANY leftover marker makes it offer safe mode. Four stale markers were found. Every
//      force-kill leaves one, and every force-kill therefore arms the dialog for the next start.
//      Code that "cleared the sentinel" by deleting a FILE never touched them.
//
//   2. THE ZOMBIE LOCK. A crashed obs64 survived Stop-Process AND `taskkill /F` ("no running
//      instance of the task") while still holding the single-instance lock, so every relaunch
//      opened a window titled "OBS is already running" and the websocket never bound. Only
//      Win32_Process.Terminate via WMI cleared it.
//
//   3. THE DIALOG IS INVISIBLE TO A PORT CHECK. Both failures present identically to everything
//      upstream: obs64.exe is running and :4455 is dead. A liveness check that asks "is the process
//      alive" says yes and is wrong.
//
// THE ONE RULE THIS FILE WILL NOT BREAK
// ------------------------------------
// IT NEVER RESTARTS OBS WHILE THE STREAM IS UP. A watchdog that reboots the encoder mid-broadcast
// is worse than the fault it is fixing. When the socket is healthy it asks OBS whether it is
// streaming; if it is, the supervisor reports and does nothing else. Recovery only ever happens
// from a state where there is provably no outbound stream to lose.
//
// WHAT IT CANNOT DO, SAID PLAINLY
// -------------------------------
// It cannot stop OBS from crashing. Nothing outside OBS can. What it removes is every way a crash
// turns into a STUCK studio: the dialog, the zombie lock, the double instance, and the silence.
// It also does not install updates while you are on air — see checkVersion().
"use strict";

const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");   // for relayIngesting() — the MediaMTX on-air answer, see isStreaming()
const quiet = require("./quiet_mode.cjs"); // the QUIET latch — a deliberate off state is not a fault

const OBS_EXE = "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe";
const OBS_DIR = "C:\\Program Files\\obs-studio\\bin\\64bit";
const SENTINEL_DIR = path.join(process.env.APPDATA || "", "obs-studio", ".sentinel");
const WS_PORT = 4455;
const LOG = path.join(__dirname, "runtime", "obs_supervisor.ndjson");

const now = () => new Date().toISOString();
function record(event, detail) {
  const row = { at: now(), event, ...detail };
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, JSON.stringify(row) + "\n"); } catch (_) {}
  return row;
}
const ps = (cmd) => {
  try { return execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", cmd], { encoding: "utf8", timeout: 30000 }).trim(); }
  catch (e) { return ""; }
};

// ── OBSERVE ──────────────────────────────────────────────────────────────────────────────────────

function instances() {
  const out = ps("Get-Process obs64 -EA SilentlyContinue | ForEach-Object { $_.Id.ToString() + '|' + $_.MainWindowTitle }");
  return out.split(/\r?\n/).filter(Boolean).map((l) => {
    const [id, ...t] = l.split("|");
    return { pid: Number(id), title: (t.join("|") || "").trim() };
  });
}

function socketUp(port = WS_PORT, ms = 1500) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    let done = false;
    const fin = (v) => { if (!done) { done = true; try { s.destroy(); } catch (_) {} resolve(v); } };
    s.setTimeout(ms);
    s.once("connect", () => fin(true));
    s.once("timeout", () => fin(false));
    s.once("error", () => fin(false));
    s.connect(port, "127.0.0.1");
  });
}

// The dialog is the failure that looks like health. Detect it by its window title.
const blockingDialog = (list) => list.find((p) => /already running|safe mode/i.test(p.title));

async function observe() {
  const list = instances();
  const sock = await socketUp();
  const dialog = blockingDialog(list);
  const stale = staleMarkers();
  let state = "HEALTHY";
  if (list.length === 0) state = "ABSENT";
  else if (dialog) state = "BLOCKED_BY_DIALOG";
  else if (list.length > 1) state = "MULTIPLE_INSTANCES";
  else if (!sock) state = "NO_WEBSOCKET";
  return { state, instances: list, socket: sock, dialog: dialog ? dialog.title : null, stale_markers: stale.length };
}

// ── THE SAFE-MODE FIX ────────────────────────────────────────────────────────────────────────────
// .sentinel is a DIRECTORY of run_<uuid> markers. Clearing them is what makes safe mode impossible;
// --disable-shutdown-check on the command line is the belt to this file's braces.
function staleMarkers() {
  try { return fs.readdirSync(SENTINEL_DIR).filter((f) => /^run_/i.test(f)); } catch { return []; }
}
function clearSentinel() {
  const marks = staleMarkers();
  let cleared = 0;
  for (const m of marks) { try { fs.unlinkSync(path.join(SENTINEL_DIR, m)); cleared++; } catch (_) {} }
  if (cleared) record("sentinel_cleared", { cleared, of: marks.length });
  return cleared;
}

// ── THE ZOMBIE FIX ───────────────────────────────────────────────────────────────────────────────
// Escalating, because taskkill genuinely failed on a live zombie tonight and WMI did not.
function killAll(why) {
  const before = instances();
  if (!before.length) return 0;
  record("killing", { why, pids: before.map((p) => p.pid) });
  for (const p of before) { try { execFileSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { stdio: "ignore", timeout: 15000 }); } catch (_) {} }
  let left = instances();
  if (left.length) {
    // WMI Terminate — the only thing that cleared the 2026-08-02 zombie.
    for (const p of left) ps(`(Get-CimInstance Win32_Process -Filter 'ProcessId=${p.pid}') | Invoke-CimMethod -MethodName Terminate | Out-Null`);
    left = instances();
  }
  record("killed", { remaining: left.map((p) => p.pid) });
  return before.length - left.length;
}

// ── START, THE ONLY WAY IT IS EVER STARTED ───────────────────────────────────────────────────────
async function startClean() {
  clearSentinel();                                   // safe mode cannot be offered if there is nothing to offer it for
  const child = spawn(OBS_EXE, ["--disable-shutdown-check", "--minimize-to-tray"], { cwd: OBS_DIR, detached: true, stdio: "ignore" });
  child.unref();
  record("started", { flags: ["--disable-shutdown-check", "--minimize-to-tray"] });
  // OBS took 60s to bind on the measured cold start; 120s of headroom, checked every 2s.
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    if (await socketUp()) { record("websocket_up", { after_s: (i + 1) * 2 }); return true; }
    const d = blockingDialog(instances());
    if (d) { record("dialog_on_start", { title: d }); return false; }
  }
  record("websocket_timeout", {});
  return false;
}

// ── IS IT INGESTING TO THE AUDIENCE? Asked of the RELAY, which does not care about the websocket. ─
//
// THE DEFECT THIS CLOSES, found by audit on 2026-08-02 while the estate was two hours live on two
// platforms. isStreaming() below asks OBS over its WEBSOCKET. But every state this supervisor exists
// to repair — BLOCKED_BY_DIALOG, NO_WEBSOCKET — is a state in which that websocket is unavailable, so
// isStreaming() returned {known:false} and ensureHealthy()'s on-air fence (`st.known && st.streaming`)
// fell straight through to killAll(), which escalates to a WMI Terminate. OBS can be pushing RTMP to
// the audience the entire time its websocket is unreachable. The supervisor built to protect the
// broadcast could therefore END it, on a 15-second loop, and the more OBS was struggling the more
// certain it became that nobody was watching.
//
// studio_up.ps1:110-123 already had the right answer and said so in its own words: ask MediaMTX. The
// 'uni' path reads ready:true exactly when OBS is ingesting, INDEPENDENT of the websocket, and that
// is the authoritative "are we actually on air" signal. It is used there to refuse -Stop. It was
// never taught to the supervisor. It is now, and it is asked FIRST, because it is the only one of the
// two answers that stays true while the thing being diagnosed is broken.
function relayIngesting() {
  return new Promise((resolve) => {
    const req = http.get("http://127.0.0.1:9997/v3/paths/list", { timeout: 4000 }, (r) => {
      let s = ""; r.on("data", (d) => (s += d));
      r.on("end", () => {
        try {
          const uni = (JSON.parse(s).items || []).find((x) => x.name === "uni");
          resolve(uni ? uni.ready === true : false);
        } catch { resolve(null); }   // null = COULD NOT TELL, which is not the same as "no"
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

// ── IS IT STREAMING? The question that decides whether repair is allowed at all. ─────────────────
//
// MediaMTX is authoritative in BOTH directions and is therefore asked first and believed. It is a
// separate process from OBS, so it keeps answering while OBS is the thing that is broken — which is
// precisely the moment this question is being asked. `ready:true` means bytes are reaching the
// audience; `ready:false` from a relay that answered is a real "no", not an absence of evidence.
// Only when the relay itself cannot be reached does the websocket get a say, and then it is the
// second opinion rather than the only one.
async function isStreaming() {
  const viaRelay = await relayIngesting();
  if (viaRelay === true) return { known: true, streaming: true, via: "mediamtx" };
  if (viaRelay === false) return { known: true, streaming: false, via: "mediamtx" };

  if (!(await socketUp())) return { known: false, streaming: null, via: "neither — relay unreachable AND websocket down" };
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, "obs_req.cjs"), path.join(__dirname, "runtime", "_sup_ss.json")], { encoding: "utf8", timeout: 20000 });
    const m = /"outputActive":\s*(true|false)/.exec(out);
    if (m) return { known: true, streaming: m[1] === "true", via: "websocket (relay unreachable)" };
  } catch (_) {}
  return { known: false, streaming: null, via: "neither" };
}

// ── VERSION: report staleness, never install behind the operator's back ──────────────────────────
function installedVersion() {
  return ps(`(Get-Item '${OBS_EXE}').VersionInfo.ProductVersion`) || "unknown";
}
// Deliberately NOT an auto-installer. Swapping the encoder's binary is a thing that can end a show,
// and it must never happen because a watchdog woke up. This reports; the operator decides.
function checkVersion() {
  const have = installedVersion();
  let latest = "";
  try {
    latest = ps(`try { (Invoke-RestMethod -Uri 'https://api.github.com/repos/obsproject/obs-studio/releases/latest' -Headers @{'User-Agent'='uni'} -TimeoutSec 10).tag_name } catch { '' }`).replace(/^v/, "");
  } catch (_) {}
  const stale = latest && have !== "unknown" && latest !== have;
  record("version_check", { installed: have, latest: latest || null, stale: !!stale });
  return { installed: have, latest: latest || null, stale: !!stale };
}

// ── THE FENCE, AS A PURE FUNCTION SO IT CAN BE PROVED ────────────────────────────────────────────
// Extracted for one reason: this single boolean decides whether a live broadcast to a real audience
// is force-terminated, and a decision that important must be testable without a running OBS, a
// running relay, and an audience to lose. verify_obs_fence.cjs drives every row of its truth table.
//
// Repair is permitted ONLY on an affirmative, sourced "we are not on air". Every other answer —
// including not knowing — declines.
//
// ONE STATE IS EXEMPT, AND ONLY ONE: ABSENT. Added 2026-08-05 after a reboot of THINKER left the
// studio with NO PICTURE and this supervisor declined to fix it 60+ times in a row.
//
// The measured deadlock: `observe()` sets ABSENT when there are ZERO obs64 processes. With OBS gone,
// `socketUp()` is false; with MediaMTX also gone (the same reboot took both), `relayIngesting()`
// cannot answer either — so `isStreaming()` returns {known:false} by way of "neither — relay
// unreachable AND websocket down", and this fence declined. Forever. The supervisor whose entire job
// is keeping OBS alive was structurally incapable of restoring it from the one state that most needs
// restoring, and the reason it gave — "refusing to kill an encoder that may be live" — was FALSE ON
// ITS FACE, because ABSENT means there is no encoder at all.
//
// The asymmetry the rest of this fence enforces does not exist for ABSENT. Repair from every OTHER
// state runs killAll() against a RUNNING obs64 that may be pushing to an audience, so uncertainty
// must decline. Repair from ABSENT is PURELY ADDITIVE: killAll() has nothing to terminate and
// startClean() only starts a process that is not running. You cannot end a broadcast by starting a
// program that isn't there. (Measured the same day: a freshly started OBS comes up with
// outputActive:false — it does not auto-publish, so it cannot disturb another publisher either.)
//
// This is the identical principle already applied in channel_windows_watchdog.ps1, where a RELOAD is
// fenced under air and a RESTORE is not: an act that can only ADD picture does not need the fence
// that protects picture. Keep the two apart and both stay correct.
//
// `state` is optional. Called with one argument — as every historical call site did — the strict
// original fence applies unchanged. Uncertainty still declines by default; the exemption must be
// asked for explicitly, by name.
function repairAllowed(st, state) {
  if (state === "ABSENT") return true;
  return !!(st && st.known === true && st.streaming === false);
}

// ── REPAIR ───────────────────────────────────────────────────────────────────────────────────────
async function ensureHealthy({ dryRun = false } = {}) {
  const o = await observe();
  if (o.state === "HEALTHY") { record("observed", o); return { ...o, action: "none" }; }

  // ── QUIET-MODE LATCH (added 2026-08-10) ────────────────────────────────────────────────────────
  // A DELIBERATE OFF STATE IS NOT A FAULT. When the operator puts the box in QUIET, OBS is *supposed*
  // to be absent — this machine is his computer, not only a broadcast appliance, and the mixer is the
  // heaviest thing on it. Without this check the supervisor reads "ABSENT" (which repairAllowed()
  // authorises unconditionally, and rightly so for a genuine crash) and starts OBS straight back up
  // within one 15s tick, forever. That is precisely the failure door_healer.cjs:118-138 already
  // recorded against itself: the healer "read the operator's deliberate off state as a fault and
  // fired bring_up_stack every ~130s, without pause, for hours".
  //
  // This is checked BEFORE the streaming fence on purpose: in QUIET there is nothing to be on air
  // with, so asking "are we live?" first would only add a network round-trip to a decision already
  // made. Clearing the latch (resume) re-arms the supervisor with no restart needed — it reads the
  // file every tick, so healing resumes on the very next pass.
  if (quiet.isQuiet()) {
    record("repair_declined_quiet", { ...o, quiet: true });
    return { ...o, action: "declined — QUIET MODE latched (viewer/runtime/quiet_mode.json); a deliberate off state is not a fault. RESUME re-arms healing." };
  }

  // THE RULE, AND ITS DEFAULT DIRECTION — which is the whole fix.
  //
  // This fence used to read `if (st.known && st.streaming)`, so it declined ONLY on a positive,
  // confident "yes, we are live". Every other answer — including "I have no idea" — authorised a
  // force-kill of the encoder. That is fail-DANGEROUS, and it was reachable on the most ordinary
  // failure in this stack: OBS alive and pushing, websocket briefly unreachable.
  //
  // Inverted. Repair now requires an affirmative "we are NOT on air". Uncertainty declines. The cost
  // of declining wrongly is that a broken OBS stays broken for another 15-second tick and the
  // operator is told; the cost of proceeding wrongly is that a live broadcast to a real audience
  // ends. Those are not comparable, so they do not get the same default.
  const st = await isStreaming();
  if (!repairAllowed(st, o.state)) {
    record("repair_declined", { ...o, streaming: st.streaming, known: st.known, via: st.via });
    return {
      ...o,
      action: st.streaming
        ? `declined — ON AIR (via ${st.via}), refusing to restart the encoder mid-broadcast`
        : `declined — CANNOT CONFIRM we are off air (${st.via}); refusing to kill an encoder that may be live`,
    };
  }
  if (dryRun) return { ...o, action: "would repair (dry run)" };

  record("repairing", { from: o.state });
  killAll(o.state);
  clearSentinel();
  await new Promise((r) => setTimeout(r, 3000));
  const ok = await startClean();
  const after = await observe();
  return { ...after, action: ok && after.state === "HEALTHY" ? `repaired from ${o.state}` : `repair INCOMPLETE from ${o.state}` };
}

// Exported so the fence can be driven by its gate. The CLI below is guarded on require.main for the
// same reason: before this, `require`-ing this file to test it STARTED A SUPERVISOR that would go on
// to make real decisions about a real encoder. A test harness must not be able to kill the show.
module.exports = { repairAllowed, isStreaming, relayIngesting };

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────────
if (require.main === module) (async () => {
  // the request file obs_req.cjs reads for the streaming probe
  try {
    fs.mkdirSync(path.join(__dirname, "runtime"), { recursive: true });
    fs.writeFileSync(path.join(__dirname, "runtime", "_sup_ss.json"), JSON.stringify({ requestType: "GetStreamStatus" }));
  } catch (_) {}

  const argv = process.argv.slice(2);
  const watch = argv.includes("--watch");
  const statusOnly = argv.includes("--status");

  if (statusOnly) {
    const o = await observe();
    const v = checkVersion();
    console.log(`OBS: ${o.state} · instances ${o.instances.length} · websocket ${o.socket ? "UP" : "DOWN"} · stale safe-mode markers ${o.stale_markers}`);
    if (o.dialog) console.log(`  BLOCKING DIALOG: "${o.dialog}"`);
    console.log(`version: ${v.installed}${v.latest ? ` · latest ${v.latest}` : ""}${v.stale ? "  <-- UPDATE AVAILABLE (not installed automatically, on purpose)" : ""}`);
    process.exit(o.state === "HEALTHY" ? 0 : 1);
  }

  const v = checkVersion();
  if (v.stale) console.log(`NOTE: OBS ${v.installed} installed, ${v.latest} available. Not installed automatically — swapping the encoder can end a show.`);

  const r = await ensureHealthy();
  console.log(`OBS: ${r.state} · websocket ${r.socket ? "UP" : "DOWN"} · action: ${r.action}`);

  if (!watch) process.exit(r.state === "HEALTHY" ? 0 : 1);

  console.log("watching — OBS will be kept healthy; it will NOT be restarted while streaming.");
  for (;;) {
    await new Promise((r2) => setTimeout(r2, 15000));
    const c = await ensureHealthy();
    if (c.state !== "HEALTHY" || c.action !== "none") console.log(`${now()}  ${c.state} · ${c.action}`);
  }
})();
