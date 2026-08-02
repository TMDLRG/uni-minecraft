// capture_minds_loop.cjs — periodic litigation-hold capture so no long window passes without preserving
// the colony minds. Runs capture_minds_run (STREAM tier -> gitignored WORM, never pruned) every
// CAPTURE_INTERVAL_MIN minutes (default 15). Supervised + boot-persistent via gaia_watchdog.ps1. Read-only
// on the colony. This is the cadence half of "never let a mind get wasted"; the acute half is the
// capture-before-destroy checkpoint (capture_minds_run.cjs anchor), run before any colony redeploy/rm.
"use strict";

const fs = require("fs");
const path = require("path");
const { runCapture } = require("./capture_minds_run.cjs");
const { replicate } = require("./replicate_hold.cjs");

const REPO = path.resolve(__dirname, "..", "..");
const LOG = path.join(REPO, "logs", "capture_minds_loop.log");
const INTERVAL_MIN = Math.max(1, Number(process.env.CAPTURE_INTERVAL_MIN || 15));

function log(m) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); } catch (_) {}
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch (_) {}
}

log(`capture loop started (every ${INTERVAL_MIN}m, stream tier)`);

async function tick() {
  try {
    const man = await runCapture("stream");
    log(`tick OK: ${man.count} minds, ${man.distinct_states} distinct`);
  } catch (e) {
    log(`tick FAILED: ${e.message}`); // a failed tick never stops the loop — the next one retries
  }
  // Best-effort off-box replication of the new stream bytes. The capture is already preserved locally, so a
  // replication failure (e.g. the target unreachable) never blocks preservation — the marker makes the next
  // tick retry exactly the unreplicated files.
  try {
    const rep = replicate();
    if (rep.new) log(`replicated: ${rep.verified}/${rep.new} off-box${rep.failed.length ? ` (FAILED ${rep.failed.length})` : ""}`);
  } catch (e) {
    log(`replicate FAILED (will retry next tick): ${e.message}`);
  }
  setTimeout(tick, INTERVAL_MIN * 60 * 1000);
}

tick();
