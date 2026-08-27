const __obsauth = require("./lib/obs_auth.cjs");
// obs_refresh.cjs — refresh (no-cache) the browser sources so they reload their pages after the
// service behind them went away and came back (a colony/node restart, or a firewall flush that
// dropped :3020 / :4000 / :4200 to policy=drop).
//
// WHY THIS IS NEEDED AT ALL: a Chrome browser source whose page died does NOT recover on its own.
// It sits on the crash page ("Aw, Snap!") indefinitely, and OBS still reports the source as present
// and ENABLED — so every enablement-based signal stays green while the pixels are a crash screen.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// CORRECTED 2026-08-03, two defects.
//
// 1. STALE TARGETS. It refreshed ["Colony Cam", "Glass HUD", "Mind Cockpit View"] — source names
//    from an older stage build that no longer exist. The current names are cap_*. So the tool
//    reliably refreshed NOTHING.
//
// 2. IT EXITED 0 ANYWAY. The old version printed a per-source "ERR" line, which is to its credit,
//    but then printed "REFRESH DONE" and `process.exit(0)` regardless of how many failed. Any
//    caller checking the exit code — a script, a supervisor, a runbook step — saw success. Human
//    eyes on stdout were the only thing standing between that and a silent no-op.
//
// Found while recovering from exactly the thing it was written for: cap_overlook was showing the
// Chrome crash page and went to air, because `pictureOnProgram` reports source ENABLEMENT, not
// pixels. command_center's own /api/thumbs comment says it plainly:
//   "rendering is true ONLY when a recent frame is non-black. Downstream must read `rendering`
//    for any LIVE claim -- never assume LIVE from a scene merely being on program."
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node viewer/obs_refresh.cjs                 # refresh every browser source below
//   node viewer/obs_refresh.cjs cap_overlook    # refresh only the named source(s)
//
// AFTER RUNNING, VERIFY PIXELS. Do not assume this worked:
//   curl -s http://127.0.0.1:8098/api/thumbs    # read .rendering and .frac per scene
// A refresh that was ACCEPTED is not a page that came BACK. Only a non-black frame is that.

const WebSocket = require("ws");

// The browser sources in the current stage build (viewer/studio_stage.cjs INPUTS). If a name here
// stops existing, this tool now FAILS LOUDLY rather than quietly skipping it — divergence between
// this list and the stage build is precisely what made the old version useless.
const ALL = ["cap_overlook", "cap_colony", "cap_glass", "cap_web", "cap_clip"];

const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const sources = args.length ? args : ALL;

const ws = new WebSocket("ws://127.0.0.1:4455");
const results = [];
let i = 0;

function sendNext() {
  if (i >= sources.length) return finish();
  ws.send(JSON.stringify({
    op: 6,
    d: {
      requestType: "PressInputPropertiesButton",
      requestId: "f" + i,
      requestData: { inputName: sources[i], propertyName: "refreshnocache" },
    },
  }));
}

function finish() {
  for (const r of results) {
    console.log((r.ok ? "  refreshed  " : "  FAILED     ") + r.name + (r.ok ? "" : "  -- " + r.comment));
  }
  const bad = results.filter((r) => !r.ok);
  console.log("");
  if (bad.length) {
    console.log("REFRESH INCOMPLETE: " + bad.length + " of " + results.length + " source(s) could not be refreshed.");
    console.log("Exiting NONZERO on purpose. A source that cannot be found is not a no-op to shrug at —");
    console.log("it means this list and the stage build have diverged, which is the defect that made");
    console.log("this tool refresh nothing at all until 2026-08-03.");
    try { ws.close(); } catch (_) {}
    process.exit(1);
  }
  console.log("REFRESH SENT for " + results.length + " source(s): " + results.map((r) => r.name).join(", "));
  console.log("NOW VERIFY PIXELS — a sent refresh is not a rendered page:");
  console.log("  curl -s http://127.0.0.1:8098/api/thumbs   # read .rendering and .frac per scene");
  try { ws.close(); } catch (_) {}
  process.exit(0);
}

ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch (_) { return; }
  if (m.op === 0) { ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) })); return; }
  if (m.op === 2) { sendNext(); return; }
  if (m.op === 7) {
    const st = (m.d && m.d.requestStatus) || {};
    results.push({ name: sources[i], ok: !!st.result, comment: st.comment || ("code " + st.code) });
    i += 1;
    sendNext();
  }
});

ws.on("error", (e) => { console.log("OBS unreachable on ws://127.0.0.1:4455 — " + e.message); process.exit(2); });
setTimeout(() => { console.log("TIMEOUT waiting for OBS"); process.exit(3); }, 20000);
