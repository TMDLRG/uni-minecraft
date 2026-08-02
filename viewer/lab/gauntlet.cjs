// gauntlet.cjs — THE GAUNTLET, THEN THE CO-SIGN. (Phase 9 step 4.6, build L6)
//
// L0 through L5 each proved one thing. L6 proves they hold together AS ONE LAB, and then stops at
// the one threshold an agent may not cross.
//
// TWO PARTS, AND THE SECOND IS NOT MINE
// --------------------------------------
//   THE GAUNTLET — every lab gate, run in sequence, all green or the walk is not finished. This is
//                  "welcome everyone into the lab": the surface is complete and it holds end to end.
//   THE CO-SIGN  — the last step before AIR, and it DEFAULTS TO HOLD. Going live needs a presence
//                  token that no process can mint (F31), a mint that does not exist (S6), and an
//                  ADR that is not adopted (S5). So the co-sign holds, for the operator, and nothing
//                  here can lift it. Checkpoint E — two images, the lab he can walk around,
//                  distinguishable-or-not with no text read — is his.
//
// This module RUNS gates and READS the guard. It cannot go live: there is no path from here to
// spend(), to a mint, or to any actuator. A surface that draws the co-sign must not be able to sign it.
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const guard = require("../golive_guard.cjs");

// The six builds, in the order they were built, each named by the gate that proves it. L2's gate is
// `verify_shot.cjs` (the screenshot rasteriser), not a `verify_lab_l2.cjs` — that is correct, not a
// missing file, and the gauntlet says so rather than looking like a gap.
const BUILDS = [
  { id: "L0", title: "THE EMPTY ROOM", gate: "viewer/lab/verify_lab_l0.cjs" },
  { id: "L1", title: "THE FIVE MATERIALS", gate: "viewer/lab/verify_lab_l1.cjs" },
  { id: "L2", title: "THE SCREENSHOT GATE", gate: "viewer/lab/verify_shot.cjs" },
  { id: "L3", title: "THE PROJECTION", gate: "viewer/lab/verify_lab_l3.cjs" },
  { id: "L4", title: "ROOMS, AIRLOCKS, PORTALS", gate: "viewer/lab/verify_lab_l4.cjs" },
  { id: "L5", title: "THE DESK", gate: "viewer/lab/verify_lab_l5.cjs" },
];

// The seven paths to air, the same list F31's prover walks. The co-sign is CLEAR only if every one
// of them would let a human through — which requires a presence token nothing here can produce.
const PATHS = ["api/golive", "api/broadcast_test", "studio.cjs golive", "obs_golive.cjs",
  "obs_streamtest.cjs", "obs_ctl.cjs StartStream", "obs_req.cjs StartStream"];

/**
 * Run every lab gate in sequence and report each honestly. `onStep` is called as each finishes, so a
 * surface can light the stations one by one rather than waiting for the whole walk.
 *
 * Runs in the WORKING TREE — fast, and each gate that needs to prove committed bytes (L5's worktree
 * runs) already does its own HEAD isolation internally. The gauntlet proves the lab as it stands
 * passes end to end; it does not re-litigate each gate's own commit-vs-tree contract.
 */
function runGauntlet(onStep = () => {}, builds = BUILDS) {
  // `builds` is overridable ONLY so the gate can point the sequence at a KNOWN-RED gate and prove
  // "all_green" actually goes false — a gauntlet that reports green no matter what is a green light
  // wired to nothing. It is never overridable from a request.
  const results = [];
  for (const b of builds) {
    const started = Date.now();
    const r = spawnSync(process.execPath, [b.gate], { cwd: REPO, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
    const out = (r.stdout || "") + "\n" + (r.stderr || "");
    // Parse the gate's own last verdict line and its N/N tally.
    const verdict = /GATE:\s*(PASS|FAIL)/i.exec(out.split(/\r?\n/).reverse().join("\n"));
    const tally = /(\d+)\/(\d+)\s+checks/.exec(out);
    const killed = (!!r.error && /ETIMEDOUT|timed/i.test(String(r.error))) || (r.status === null && r.signal);
    const step = {
      ...b,
      passed: !killed && r.status === 0 && verdict && verdict[1].toUpperCase() === "PASS",
      exit: r.status,
      killed: !!killed,
      checks: tally ? `${tally[1]}/${tally[2]}` : null,
      ms: Date.now() - started,
    };
    results.push(step);
    onStep(step);
  }
  const passed = results.filter((s) => s.passed).length;
  return {
    builds: results,
    passed,
    of: results.length,
    all_green: passed === results.length,
    // A gauntlet that reports "all green" while a gate was KILLED rather than passed is the runner's
    // own defect (fixed 2026-07-28); the gauntlet carries the distinction too.
    killed: results.filter((s) => s.killed).map((s) => s.id),
  };
}

// The co-sign DECISION, as a pure function — so the gate can prove HOLD is COMPUTED from the paths'
// refusals and not hardcoded: feed it a path that would admit a human and it reads CLEAR. A HOLD
// nobody has watched turn to CLEAR is a red light painted on.
function coSignStateFrom(paths) {
  return paths.some((p) => p.allowed) ? "CLEAR" : "HOLD";
}

/**
 * The co-sign state — READ from F31's guard, never decided here. HOLD unless every path to air would
 * admit a human, which requires a presence token no process can mint.
 */
function coSign(now = Date.now()) {
  const paths = PATHS.map((p) => ({ path: p, ...guard.mayGoLive(p, now) }));
  const presence = guard.presence(now);
  return {
    state: coSignStateFrom(paths),
    // The lattice is honest about what it is: presence_evident, NOT unforgeable.
    claim_level: guard.CLAIM_LEVEL,
    paths: paths.map((p) => ({ path: p.path, refused: !p.allowed, code: p.code })),
    presence: presence.allowed ? "a presence token is live" : `${presence.code} — ${presence.why}`,
    why_hold:
      "GO-LIVE DEFAULTS TO HOLD, and this cannot lift it. Every path to air refuses for want of a " +
      "presence token, and NOTHING IN THIS REPOSITORY CAN MINT ONE — minting is what opens the door, " +
      "and opening the door is S6, the operator's. ADR-0008, which would authorise a mint, is " +
      "PROPOSED and not adopted (S5). And F31 binds THIS codebase's paths, not the box: the OBS " +
      "WebSocket on 127.0.0.1:4455 still has no authentication (S2, his studio).",
    the_operators_move:
      "CHECKPOINT E — two images, and the lab he can walk around. He says whether the two fixtures " +
      "are distinguishable with NO TEXT READ, and if so, whether it is FOR A REASON THAT IS truth_class " +
      "(the material) rather than anything else. That is the step's falsifier, and it is M8 — the " +
      "operator's eye — which no gate can stand in for.",
  };
}

// Run directly, it STREAMS each step as NDJSON and exits — so the lab server can run the ~28s
// gauntlet in a background child and light the stations one by one WITHOUT blocking its event loop.
// spawnSync inside a request handler would freeze every other poll for the whole run.
if (require.main === module) {
  runGauntlet((step) => process.stdout.write(JSON.stringify({ step }) + "\n"));
  process.stdout.write(JSON.stringify({ done: true }) + "\n");
}

module.exports = { runGauntlet, coSign, coSignStateFrom, BUILDS, PATHS, REPO };
