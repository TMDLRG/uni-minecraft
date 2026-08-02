// classify_gate_attempts.cjs — write evidence/gate_attempts.ndjson. (Phase 9, step 4.2)
//
//     node viewer/classify_gate_attempts.cjs
//
// Run this after a gate row changes or a runner is written. The `gate-attempts` gate regenerates
// the same bytes and refuses any difference, so forgetting is caught rather than shipped.
//
// IT WRITES ONE FILE AND ONE FILE ONLY: evidence/gate_attempts.ndjson. It does not touch
// evidence/gates.ndjson (S4), it does not amend a schema (S5), and it does not run a gate (S10).
"use strict";

const fs = require("fs");
const path = require("path");
const { classify, render, SIDECAR, REPO } = require("./gate_attempts.cjs");

const result = classify();

fs.mkdirSync(path.dirname(SIDECAR), { recursive: true });
fs.writeFileSync(SIDECAR, render(result), { encoding: "utf8" });

console.log("wrote %s", path.relative(REPO, SIDECAR).replace(/\\/g, "/"));
console.log("%d gates are PENDING NOW. %d have EVER been PENDING. Nothing was run.\n",
  result.pending_now, result.ever_pending);

const states = [...new Set([...Object.keys(result.tally_pending_now), ...Object.keys(result.tally_ever_pending)])].sort();
console.log("        NOW   EVER");
for (const state of states) {
  console.log(
    "  " + String(result.tally_pending_now[state] || 0).padStart(5) +
    String(result.tally_ever_pending[state] || 0).padStart(7) + "  " + state
  );
}

console.log("\nTHE TWO COLUMNS ARE DIFFERENT QUESTIONS, and this file reported only the right-hand");
console.log("one until 2026-07-28, under the left-hand one's name. NOW is the backlog: the last row");
console.log("for each gate still says PENDING. EVER is the history of that backlog — %d gates wore",
  result.ever_pending);
console.log("the word and %d of them were decided afterwards. Reading EVER as NOW made the queue",
  result.ever_pending - result.pending_now);
console.log("look %sx longer than it is.\n", Math.round(result.ever_pending / Math.max(result.pending_now, 1)));

console.log("The original point stands and is unaffected: before this file existed, all of them");
console.log("read PENDING, and 'nobody has written a runner' was indistinguishable from");
console.log("'the runner exists and refuses by construction'.");
