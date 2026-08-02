// hud_eventlog.cjs -- writes to the Windows Application Event Log via a
// short-lived PowerShell shell-out to Write-EventLog.
//
// WHY: Real Windows services emit lifecycle + operational events to the
// Application log so eventvwr.msc and any log-shipping tool can pick them up.
// A file-only log (logs/*.log) isn't visible to Windows-native observability.
//
// PRIVILEGE MODEL:
//   - Creating a new event log SOURCE ('UNI-HUD') requires admin (SCM install
//     path does this in hud_service_install.ps1 during elevated install).
//   - WRITING an entry to an existing source needs only write access to that
//     source, which any process gets once the source exists.
//   - If the source doesn't exist yet (dev mode; service never installed),
//     we fall back to source='Application' which always exists and accepts
//     writes from any user. Entries are still real Event Log entries; they
//     just appear under a generic source instead of "UNI-HUD".
//
// ROBUSTNESS: Shell-out is fire-and-forget. If PowerShell isn't on PATH, if
// the entry write fails, or the process is killed mid-write, the HUD keeps
// running. Never blocks the server loop. Never throws upward.
//
// COST: each write spawns a powershell.exe (~30-50ms + ~30MB RSS). Rate-limit
// to prevent flooding: skip a duplicate event within RATE_MS.

"use strict";

const { spawn } = require("child_process");

const SOURCE_PREFERRED = "UNI-HUD";
const SOURCE_FALLBACK  = "Application";
const LOG_NAME = "Application";
const RATE_MS = 1000; // per-eventId-per-source rate limit

let sourceKnown = null;   // null = untested, "UNI-HUD" | "Application"
const lastWrite = new Map(); // key = source+eventId, value = last write ts

function probeSourceOnce() {
  return new Promise((resolve) => {
    // Best-effort: check if the UNI-HUD source exists. This is a READ, no admin needed.
    const p = spawn("powershell.exe", [
      "-NoProfile", "-Command",
      "[System.Diagnostics.EventLog]::SourceExists('UNI-HUD') 2>$null",
    ], { windowsHide: true });
    let out = "";
    p.stdout.on("data", (c) => { out += c.toString(); });
    p.on("close", () => {
      const exists = /True/i.test(out.trim());
      sourceKnown = exists ? SOURCE_PREFERRED : SOURCE_FALLBACK;
      resolve(sourceKnown);
    });
    p.on("error", () => { sourceKnown = SOURCE_FALLBACK; resolve(sourceKnown); });
    // Never wait more than 3s
    setTimeout(() => { if (sourceKnown == null) { sourceKnown = SOURCE_FALLBACK; try { p.kill(); } catch (_) {} resolve(sourceKnown); } }, 3000);
  });
}

// Types: "Information" | "Warning" | "Error" (see Write-EventLog -EntryType)
function write({ eventId, entryType, message }) {
  if (sourceKnown == null) { probeSourceOnce().then(() => write({ eventId, entryType, message })); return; }
  const key = `${sourceKnown}:${eventId}`;
  const now = Date.now();
  const last = lastWrite.get(key) || 0;
  if (now - last < RATE_MS) return; // rate-limited: drop duplicate
  lastWrite.set(key, now);

  // PowerShell arg escaping: single-quote the message and escape internal single quotes.
  const msg = String(message || "").slice(0, 30000).replace(/'/g, "''");
  const type = ({ Information: "Information", Warning: "Warning", Error: "Error" })[entryType] || "Information";
  const cmd = `try { Write-EventLog -LogName ${LOG_NAME} -Source '${sourceKnown}' -EventId ${eventId} -EntryType ${type} -Message '${msg}' -ErrorAction SilentlyContinue } catch {}`;
  const p = spawn("powershell.exe", [
    "-NoProfile", "-NonInteractive", "-Command", cmd,
  ], { windowsHide: true, detached: false, stdio: "ignore" });
  p.on("error", () => {});
  // fire-and-forget; never wait
}

// Convenience helpers wrapping stable event-id catalog.
// Event IDs (kept stable across HUD versions for filter compatibility):
//   1000 = service start          (Information)
//   1001 = service stop           (Information)
//   1002 = poll cycle degraded    (Warning)  -- an upstream flipped from up to down
//   1003 = poll cycle recovered   (Information) -- an upstream flipped from down to up
//   2000 = sight finding: BAD     (Error)    -- new BAD finding surfaced
//   2001 = sight finding: WARN    (Warning)  -- new WARN finding surfaced
//   3000 = audience POST rejected (Warning)  -- a client sent an invalid audience row
//   9000 = server crash / uncaught exception (Error)
function serviceStart(detail) { write({ eventId: 1000, entryType: "Information", message: `UNI-HUD server started: ${detail}` }); }
function serviceStop(detail)  { write({ eventId: 1001, entryType: "Information", message: `UNI-HUD server stopped: ${detail}` }); }
function upstreamDegraded(name, detail) { write({ eventId: 1002, entryType: "Warning", message: `upstream '${name}' went DOWN: ${detail}` }); }
function upstreamRecovered(name, detail) { write({ eventId: 1003, entryType: "Information", message: `upstream '${name}' came back UP: ${detail}` }); }
function sightBad(code, title)  { write({ eventId: 2000, entryType: "Error",   message: `sight BAD [${code}]: ${title}` }); }
function sightWarn(code, title) { write({ eventId: 2001, entryType: "Warning", message: `sight WARN [${code}]: ${title}` }); }
function audienceRejected(code, remote) { write({ eventId: 3000, entryType: "Warning", message: `audience POST rejected: code=${code} from=${remote}` }); }
function serverCrash(err) { write({ eventId: 9000, entryType: "Error", message: `UNI-HUD server crashed: ${err && err.stack || err}` }); }

module.exports = {
  write,
  serviceStart, serviceStop,
  upstreamDegraded, upstreamRecovered,
  sightBad, sightWarn,
  audienceRejected, serverCrash,
  probeSourceOnce, // exposed for tests
  _internals: { get sourceKnown() { return sourceKnown; }, lastWrite },
};
