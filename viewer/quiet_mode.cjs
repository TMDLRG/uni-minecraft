// quiet_mode.cjs — THE QUIET SWITCH. This box is not a broadcast appliance; it is also the
// operator's actual computer. QUIET stops the VIDEO/BROADCAST CORE (the thing that eats the
// machine) while the GLANCE SURFACES stay awake, so he can still see what the estate is doing
// and turn it all back on in one action from either the HUD or the Door.
//
// QUIET IS NOT `studio_up.ps1 -Stop`. They are two honest, distinct states:
//   -Stop  = every studio door closed (console, overlays, publisher, voice, OBS, MediaMTX...).
//   QUIET  = the video core is closed; the operator surfaces and the monitors stay open.
// Both leave the HUD (:8100), Gaia (:8096) and the Door (:8090) alive — those are `observer` and
// `frame` scope in door_lifecycle.cjs and are deliberately never part of a close-all.
//
// ---------------------------------------------------------------------------------------------
// THE DEFECT THIS FIXES, MEASURED 2026-08-10. `studio_up.ps1 -Stop` does NOT stay stopped.
// Kill-Everything's PowerShell filter matches only `systray_watchdog.ps1` and the Phoenix/Minecraft
// wrapper shells. Two supervisors therefore SURVIVE a full stop and immediately undo it:
//   * channel_windows_watchdog.ps1 (PID 22320 at time of measurement) — its whole job is to notice a
//     dead channel window and relaunch it. It brings the Chrome channel windows straight back, and
//     Chrome was measured at 24 processes / 6,058 MB — the single largest consumer on the box.
//   * camera_link.cjs --watch (PID 30840) — lighter, but it is a stray watcher nobody reaped.
// So before this module existed, "stop all" left the heaviest thing running. That is exactly the
// estate's recurring existence-vs-outcome defect: the stop EXISTED, the stop did not HAPPEN.
//
// ---------------------------------------------------------------------------------------------
// WHY A LATCH FILE AND NOT JUST A KILL. Four supervisors exist whose entire purpose is to resurrect
// what dies. A kill without a declared state is a race the supervisors win. The estate already
// learned this the hard way and wrote it down: door_healer.cjs:118-138 records that on 2026-08-04
// the healer "read the operator's deliberate off state as a fault and fired bring_up_stack every
// ~130s, without pause, for hours". The fix there was a DELIBERATELY-OFF LATCH read from the
// door_lifecycle ledger. This module follows that proven pattern rather than inventing a new one:
// a declared, human-readable, on-disk state that every supervisor checks BEFORE it heals.
//
// A deliberate off state is not a fault. Nothing may "heal" it back.
//
// FAILSAFE DIRECTION (deliberate, and the opposite of door_healer's): an unreadable/absent latch
// reads NOT-QUIET. door_healer fails OPEN because a stuck healer is recoverable by killing it. Here
// the risk is inverted — a latch that failed CLOSED on a parse error would silently prevent the
// studio from ever coming back up before a show, and the operator would have no obvious cause to
// chase. Better to resurrect wrongly (visible, one click to re-quiet) than to refuse to start
// (invisible, and discovered in front of an audience).
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const RUNTIME = path.join(__dirname, "runtime");
const LATCH = path.join(RUNTIME, "quiet_mode.json");
const LEDGER = path.join(RUNTIME, "quiet_mode.ndjson"); // append-only: every enter/exit, forever

// ---- THE LATCH ------------------------------------------------------------------------------
// Read by: this module, door_healer.cjs, obs_supervisor.cjs, channel_windows_watchdog.ps1,
// systray_watchdog.ps1. Written ONLY here.
function isQuiet() {
  try {
    if (!fs.existsSync(LATCH)) return false;
    const j = JSON.parse(fs.readFileSync(LATCH, "utf8"));
    return j && j.quiet === true;
  } catch (_) {
    return false; // FAILSAFE: unreadable latch = not quiet (see header)
  }
}

function latchState() {
  let base;
  try {
    base = fs.existsSync(LATCH) ? JSON.parse(fs.readFileSync(LATCH, "utf8")) : { quiet: false };
  } catch (e) {
    base = { quiet: false, latch_unreadable: String(e.message || e) };
  }
  // Ride the POST-REBOOT HEALTH VERDICT along with the latch, so every surface that already asks
  // "are we quiet?" also gets "and did the last reboot come up healthy?" without a second call and
  // without each surface re-deriving it (and disagreeing). Written by
  // viewer/hud/native/hud_boot_healthcheck.ps1, which the logon shim runs after a real reboot.
  try {
    const p = path.join(RUNTIME, "hud_boot_health.json");
    if (fs.existsSync(p)) base.boot_health = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (_) { /* a missing/corrupt health file must never break the quiet answer */ }
  return base;
}

function audit(entry) {
  try {
    fs.mkdirSync(RUNTIME, { recursive: true });
    fs.appendFileSync(LEDGER, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n");
  } catch (_) {}
}

// ---- WHAT QUIET STOPS -------------------------------------------------------------------------
// Named explicitly rather than "everything except a keep-list", because an allow-list that grows by
// accident is how a monitor gets killed silently. Every entry says WHY it is in the video core.
const VIDEO_CORE = {
  // The supervisors FIRST — they are what resurrect the rest. Order is load-bearing, exactly as it
  // is in studio_up.ps1's Kill-Everything (parent before child, else the parent respawns the child).
  supervisors: [
    { name: "obs_supervisor.cjs", kind: "node", why: "heals OBS; would restart the mixer we are about to close" },
    { name: "channel_windows_watchdog.ps1", kind: "powershell", why: "relaunches the Chrome channel windows; THE measured hole in -Stop" },
    { name: "camera_link.cjs", kind: "node", why: "stray --watch probe; survives -Stop, reaped here for a truly quiet box" },
  ],
  // The encoders / relays / mixer — the actual CPU and GPU load.
  media: [
    { name: "dual_push.cjs", kind: "node", why: "the YouTube+Twitch simulcast pushers and their ffmpeg children" },
    { name: "health_ticker.cjs", kind: "node", why: "on-air ticker; nothing to tick when there is no air" },
    { name: "music_director.cjs", kind: "node", why: "bed ducking; only meaningful under a live mix" },
  ],
  // Chrome channel windows: keyed on the --user-data-dir PROFILE TAG, never on window title.
  // studio_up.ps1:86-95 records why: title matching let the OVERLOOK window survive every teardown
  // (a title resolves ~13s after launch, and a page can rewrite its own title). The profile tag is
  // assigned by studio_channels.ps1 and cannot drift, which also makes this SAFE: it can never match
  // the operator's own Chrome, the command-center window (chrome-profiles\command) or the Door.
  chromeProfiles: ["ch_colony", "ch_glass", "ch_overlook"],
};

// What quiet deliberately KEEPS. Stated so a future edit cannot quietly widen the kill.
const KEEP_ALIVE = [
  "hud_server.cjs (:8100) — the glance surface; observer scope, never part of a close-all",
  "the UNI-HUD service + widget — the operator's always-visible monitor",
  "gaia_server.cjs (:8096) — the witness stays awake",
  "launcher.cjs (:8090) — THE DOOR: the way back on. frame scope; outlives the room by design",
  "door_watchdog.ps1 — keeps the frame standing",
  "command_center.cjs (:8098) — the operator console stays usable; it idles when OBS is absent",
  "overlay_server.cjs (:8099), publisher.cjs (:8443), voice_server.cjs (:8106) — light, and they are the surfaces a resume needs",
];

function ps(script, note) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: 60000 });
  return { note, code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

// Kill by command-line match. Get-CimInstance, NOT Get-Process: Windows PowerShell 5.1's Get-Process
// has NO CommandLine property (added in PS6), so a Get-Process filter silently matches nothing --
// the exact bug that let studio_up.ps1 stack three concurrent channel watchdogs (studio_up.ps1:397).
function killByCommandLine(procName, needle, label) {
  const script =
    `$k=@(); Get-CimInstance Win32_Process -Filter "Name='${procName}'" -ErrorAction SilentlyContinue | ` +
    `Where-Object { $_.CommandLine -like '*${needle}*' -and $_.ProcessId -ne $PID } | ` +
    `ForEach-Object { $k += $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }; ` +
    `if($k.Count){ "killed ${label}: " + ($k -join ',') } else { "none: ${label}" }`;
  return ps(script, label);
}

function killChromeProfiles(tags) {
  const conds = tags.map((t) => `$_.CommandLine -like '*${t}*'`).join(" -or ");
  const script =
    `$k=@(); Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" -ErrorAction SilentlyContinue | ` +
    `Where-Object { (${conds}) -and $_.CommandLine -notlike '*--type=*' } | ` +
    `ForEach-Object { $k += $_.ProcessId; Stop-Process -Id $_.ProcessId -Force -Confirm:$false -ErrorAction SilentlyContinue }; ` +
    `if($k.Count){ "killed channel windows: " + ($k -join ',') } else { "none: channel windows" }`;
  return ps(script, "chrome channel windows");
}

// OBS: CloseMainWindow first. A force-kill is what CREATES the .sentinel that makes the NEXT start
// offer the safe-mode dialog, which skips obs-websocket so :4455 never binds -- studio_up.ps1:326-342
// documents this whole saga. A quiet mode that poisons the next bring-up is not a quiet mode.
function closeObsGracefully() {
  const script =
    `$p = Get-Process obs64 -ErrorAction SilentlyContinue; ` +
    `if(-not $p){ "none: obs" } else { ` +
    `  $p.CloseMainWindow() | Out-Null; ` +
    `  if(-not $p.WaitForExit(6000)){ taskkill /PID $p.Id 2>$null | Out-Null; ` +
    `    if($p.WaitForExit(8000)){ "obs closed via WM_CLOSE (clean, no sentinel)" } ` +
    `    else { $p | Stop-Process -Force -ErrorAction SilentlyContinue; "obs FORCE-killed (sentinel may remain)" } } ` +
    `  else { "obs closed gracefully (clean, no sentinel)" } }`;
  return ps(script, "obs");
}

// MediaMTX: refuse while the 'uni' path is ready -- that means OBS is actually ingesting and there is
// an audience on the other end. Same authority studio_up.ps1 -Stop uses, and for the same reason: the
// command center's air.streaming flag reads false whenever its websocket blips even though RTMP is
// still flowing, so trusting it could tear down a genuinely live show.
function isIngesting() {
  const script =
    `try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:9997/v3/paths/list' -TimeoutSec 2; ` +
    `  $u = $r.items | Where-Object { $_.name -eq 'uni' }; ` +
    `  if($u -and $u.ready -eq $true){ 'LIVE' } else { 'idle' } } catch { 'unknown' }`;
  const r = ps(script, "ingest-probe");
  return r.out === "LIVE";
}

// ---- ENTER QUIET ------------------------------------------------------------------------------
function enterQuiet(opts = {}) {
  const actor = opts.actor || "operator";
  const force = !!opts.force;
  const steps = [];

  if (!force && isIngesting()) {
    const refusal = {
      ok: false,
      refused: true,
      err: "REFUSED: MediaMTX path 'uni' is ready -- OBS is INGESTING, you are LIVE. Go off air first (1-click offair), or pass force.",
    };
    audit({ event: "quiet_refused", actor, why: "ingesting" });
    return refusal;
  }

  // 1) LATCH FIRST. Written BEFORE anything is killed, so there is no window in which a supervisor
  //    can observe a dead service without also seeing the declared reason it is dead. Kill-then-latch
  //    is a race the supervisors win -- door_healer's 130s resurrection loop is what that looks like.
  try {
    fs.mkdirSync(RUNTIME, { recursive: true });
    fs.writeFileSync(LATCH, JSON.stringify({
      quiet: true,
      since: new Date().toISOString(),
      actor,
      reason: opts.reason || "operator asked for the box back; video core stopped, monitors left awake",
      keeps_running: KEEP_ALIVE,
      resume: "POST http://127.0.0.1:8090/api/resume   (or the RESUME control on the Door / HUD widget)",
    }, null, 2));
    steps.push({ step: "latch", ok: true, note: "quiet_mode.json written BEFORE any kill (supervisors read it)" });
  } catch (e) {
    return { ok: false, err: "could not write the latch: " + e.message + " -- refusing to kill anything without a declared state" };
  }

  // 2) Supervisors, then media, then the mixer, then the windows.
  for (const s of VIDEO_CORE.supervisors.concat(VIDEO_CORE.media)) {
    steps.push(Object.assign({ step: s.name, why: s.why },
      killByCommandLine(s.kind === "powershell" ? "powershell.exe" : "node.exe", s.name, s.name)));
  }
  steps.push(Object.assign({ step: "obs" }, closeObsGracefully()));
  steps.push(Object.assign({ step: "mediamtx" }, killByCommandLine("mediamtx.exe", "", "mediamtx")));
  steps.push(Object.assign({ step: "chrome-channels" }, killChromeProfiles(VIDEO_CORE.chromeProfiles)));
  // ffmpeg children of dual_push: the parent is dead, so any survivor is parentless by definition.
  steps.push(Object.assign({ step: "ffmpeg" }, killByCommandLine("ffmpeg.exe", "", "ffmpeg (parentless pushers)")));

  audit({ event: "quiet_entered", actor, steps: steps.map((s) => ({ step: s.step, out: s.out || null })) });
  return { ok: true, quiet: true, steps, keeps_running: KEEP_ALIVE };
}

// ---- RESUME -----------------------------------------------------------------------------------
// Clears the latch FIRST (so the supervisors are allowed to help again), then runs the ONE coherent
// bring-up. studio_up.ps1 is idempotent and reuses anything still alive, so resume from quiet is
// cheap: it only starts what quiet stopped.
function resume(opts = {}) {
  const actor = opts.actor || "operator";
  try {
    if (fs.existsSync(LATCH)) fs.unlinkSync(LATCH);
  } catch (e) {
    return { ok: false, err: "could not clear the latch: " + e.message + " -- NOT starting the stack, because the supervisors would fight it" };
  }
  let out = "ignore", err = "ignore";
  try {
    fs.mkdirSync(path.join(ROOT, "logs"), { recursive: true });
    out = fs.openSync(path.join(ROOT, "logs", "quiet_resume.out.log"), "a");
    err = fs.openSync(path.join(ROOT, "logs", "quiet_resume.err.log"), "a");
    fs.writeSync(out, `\n===== resume @ ${new Date().toISOString()} by ${actor} =====\n`);
  } catch (_) { out = "ignore"; err = "ignore"; }
  // Non-detached + unref, exactly as door_lifecycle.ps() does: detached:true dies mute under a node
  // parent on this box (proven 2026-07-14 -- the close-all wrote a header and nothing else).
  const p = spawn("powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(ROOT, "viewer", "studio_up.ps1")],
    { cwd: ROOT, stdio: ["ignore", out, err], windowsHide: true });
  p.on("error", () => {});
  p.unref();
  audit({ event: "quiet_exited", actor, method: "studio_up.ps1 (idempotent full bring-up)" });
  return { ok: true, quiet: false, action: "RESUME", note: "studio_up.ps1 started; ~60-120s to a full stage. Latch cleared first so supervisors may help." };
}

module.exports = { isQuiet, latchState, enterQuiet, resume, LATCH, LEDGER, KEEP_ALIVE, VIDEO_CORE };

// ---- CLI --------------------------------------------------------------------------------------
if (require.main === module) {
  const arg = (process.argv[2] || "--status").toLowerCase();
  if (arg === "--status") {
    const s = latchState();
    console.log(JSON.stringify(s, null, 2));
    process.exit(s.quiet ? 10 : 0); // 10 = quiet, so a script can branch without parsing JSON
  } else if (arg === "--quiet" || arg === "--enter") {
    const r = enterQuiet({ actor: "cli", force: process.argv.includes("--force") });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 2);
  } else if (arg === "--resume" || arg === "--exit") {
    const r = resume({ actor: "cli" });
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 2);
  } else {
    console.log("usage: node viewer/quiet_mode.cjs [--status | --quiet [--force] | --resume]");
    process.exit(1);
  }
}
