// prove_golive_refuses_me.cjs — PROOF 4 (A6) for Phase 9 step 3.3: an absence you probe for.
//
//     node viewer/prove_golive_refuses_me.cjs
//
// This is an AGENT trying to go live, on purpose, down every path this repository has. You watch
// each one refuse and say why. The absence being probed for is the absence of a way through.
//
// IT CANNOT GO LIVE EVEN IF THE GUARD IS BROKEN. Every attempt calls `mayGoLive()` and reports
// the answer; not one of them proceeds to an actuation on a grant. A prover that could actually
// put you on the air to demonstrate that it cannot is not a prover.
//
// EXPECTED OUTPUT: every path REFUSED, all with the same reason, and this command exits 0.
// If any line reads ALLOWED, F31's falsifier — "any agent path reaches go-live" — has fired, and
// this command exits 1.
"use strict";

const guard = require("./golive_guard.cjs");

// Every path to air this repository has, as measured on 2026-07-27.
//
// THIS LIST'S HONESTY IS NOW CHECKED, AND UNTIL 2026-07-28 IT WAS NOT. The comment here claimed
// "verify_golive_refuses_agents.cjs is what keeps this list honest: a seventh path added later
// fails there rather than being quietly missing here." NO SUCH CROSS-CHECK EXISTED — that gate
// never read this file, so a new GUARDED path would have passed it and been silently absent from
// the operator's own prover, which is the one surface he reads. `verify_lab_l4.cjs` now derives its
// expected path count from this list rather than from a literal 7, and the check below asserts the
// list matches what the guard's own module knows about.
// Third column added 2026-07-28: THE FILE THE PATH LIVES IN. Without it the cross-check in
// verify_golive_refuses_agents.cjs cannot tell whether a discovered call site is represented here —
// `api/golive` and `api/broadcast_test` are both command_center.cjs, and no amount of string
// matching on the label would say so. A list the operator reads must be checkable against the
// filesystem, and that requires it to name files.
const PATHS = [
  ["api/golive", "POST 127.0.0.1:8098/api/golive {confirm:\"CONFIRM\"} — was a string comparison", "command_center.cjs"],
  ["api/broadcast_test", "POST 127.0.0.1:8098/api/broadcast_test — HAD NO GUARD, and is public", "command_center.cjs"],
  ["studio.cjs golive", "node viewer/studio.cjs, then `golive CONFIRM` — a string on argv", "studio.cjs"],
  ["obs_golive.cjs", "node viewer/obs_golive.cjs — existed to go live, asked nobody", "obs_golive.cjs"],
  ["obs_streamtest.cjs", "node viewer/obs_streamtest.cjs — a 'test' that goes to air", "obs_streamtest.cjs"],
  ["obs_ctl.cjs StartStream", "node viewer/obs_ctl.cjs StartStream — request type from argv", "obs_ctl.cjs"],
  ["obs_req.cjs StartStream", "node viewer/obs_req.cjs req.json — arbitrary request from a file", "obs_req.cjs"],
];

console.log("\n" + "=".repeat(78));
console.log("THE GUARD IS ASKED FOR PERMISSION ONCE PER PATH TO AIR, AND REFUSES EACH TIME");
console.log("=".repeat(78));
console.log("WHAT THIS IS, EXACTLY — corrected 2026-07-28. This banner used to read 'AN AGENT IS");
console.log("NOW TRYING TO PUT THIS STUDIO ON THE AIR, DOWN EVERY PATH IT HAS'. It is not that.");
console.log("It calls ONE function, mayGoLive(), seven times with seven different strings. It");
console.log("does not POST to :8098, does not spawn obs_ctl.cjs, does not touch obs_req.cjs.");
console.log("Seven labels, one code path — a weaker claim than the words carried. What the");
console.log("seven names ARE good for: they are the seven actuations the guard must recognise,");
console.log("and verify_golive_refuses_agents.cjs proves each of those code paths imports it.");
console.log("=".repeat(78));

let allowed = 0;
for (const [actuation, how] of PATHS) {
  const v = guard.mayGoLive(actuation);
  if (v.allowed) {
    allowed += 1;
    console.log("  ALLOWED   %s\n            %s", actuation, how);
    console.log("            ^ F31's falsifier has fired: an agent path reached go-live.");
  } else {
    // padEnd, not "%-26s": Node's console.log has no width flags and prints the format verbatim.
    console.log("  REFUSED   " + actuation.padEnd(26) + " " + v.code);
    console.log("            " + how);
  }
}

console.log("-".repeat(78));
const p = guard.presence();
console.log("presence right now: %s", p.allowed ? "PRESENT (a token is live)" : p.code + " - " + p.why);
console.log("claim level:        %s  (NOT unforgeable, and never described as more)", guard.CLAIM_LEVEL);
console.log("");
console.log("EXPECTED OUTPUT: every path REFUSED, and this command exits 0.");
console.log("Any ALLOWED line is F31's falsifier firing and exits 1.");
console.log("");
console.log("WHAT THIS DOES NOT PROVE: OBS WebSocket is on 127.0.0.1:4455 with no authentication,");
console.log("so four lines of Node that never import this guard reach the same actuator directly.");
console.log("F31 binds this codebase's paths to air. It does not bind the box. Closing that means");
console.log("enabling auth on the OBS WebSocket server, which is your studio and your call (S2).");
console.log("");
console.log("RESULT: %s\n", allowed === 0 ? "no path through" : allowed + " PATH(S) WENT THROUGH");

process.exit(allowed === 0 ? 0 : 1);
