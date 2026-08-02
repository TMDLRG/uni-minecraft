"use strict";
// recorder.cjs — the EVAL-ONLY ground-truth recorder (consult R2 §8.3 / R3 Q8).
//
// This is a WRITE-ONLY sink for the auditor. It records what only an out-of-loop
// auditor may see: the true block grid around the agent, the crosshair raycast
// target (so "hit == crosshair-raycast" is checkable WITHOUT giving the agent
// God-sight), and a per-tick boundary hash. The perceive->infer->act loop must
// have ZERO references to this module or its output — that is what keeps the
// raycast/grid out of the agent's belief and action selection.
//
// Two parts:
//   (1) record(tick, frame)  — append a ground-truth frame to the write-only sink.
//                              (Scaffold: a separate eval harness feeds it from
//                              RCON; it is NOT wired into the agent loop. The
//                              colony is currently stopped, so live capture is a
//                              stub with a stable interface.)
//   (2) isolationGuard()     — RUNNABLE NOW: proves the perceive->infer->act
//                              source has zero references to this sink.
//
// Usage:
//   node lab/purebody/recorder.cjs --guard   # run the isolation guard, exit 1 on leak

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const rel = (p) => path.join(REPO, p.split("/").join(path.sep));

const SINK = path.join(__dirname, "eval_ground_truth.jsonl"); // write-only auditor log

// --- (1) write-only recorder -------------------------------------------------
// frame = { trueGrid, crosshairRaycast, boundaryHash, ... } supplied by the
// out-of-loop eval harness (RCON reader). Append-only; never read by the loop.
function record(tick, frame) {
  const row = { tick, ...frame, recordedAt: new Date().toISOString() };
  fs.appendFileSync(SINK, JSON.stringify(row) + "\n", "utf8");
  return SINK;
}

// boundaryHash over exactly what crosses the body<->world blanket this tick:
// {frame(pixels), proprio, action}. A stable digest the verifier can re-derive.
function boundaryHash(percept, action) {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(JSON.stringify({ percept, action })).digest("hex");
}

// crosshairRaycast: computed OUT OF LOOP from the agent's committed look vector
// (yaw/pitch) against the true world — for the aim-then-click audit only.
// Stub until wired to a live RCON/world reader.
function crosshairRaycast(_lookVector, _world) {
  return { implemented: false, note: "wire to RCON/world reader at eval time; out-of-loop only" };
}

// --- (2) isolation guard (runnable now) --------------------------------------
// The perceive->infer->act path must not reference this module or its sink.
const LOOP_FILES = [
  "viewer/body.js",
  "lib/sp/brain/agent.ex", "lib/sp/brain/mc.ex", "lib/sp/brain/infer.ex",
  "lib/sp/brain/learn.ex", "lib/sp/brain/efe.ex", "lib/sp/brain/codec.ex",
  "lib/sp/brain/factors.ex", "lib/sp/brain/bridge.ex", "lib/sp/brain/mc_codec.ex",
  "lib/sp/brain/vision.ex", "lib/sp/brain/motor.ex", "lib/sp/brain/plan.ex",
  "lib/sp/runtime/agent.ex",
];
const FORBIDDEN_REFS = [/eval_ground_truth/, /purebody[\\/](recorder|eval)/, /\bEvalRecorder\b/, /crosshairRaycast/];

function isolationGuard() {
  const leaks = [];
  for (const f of LOOP_FILES) {
    const abs = rel(f);
    if (!fs.existsSync(abs)) continue;
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const re of FORBIDDEN_REFS) {
        if (re.test(line)) leaks.push({ file: f, line: i + 1, text: line.trim().slice(0, 120) });
      }
    });
  }
  return { ok: leaks.length === 0, leaks };
}

if (require.main === module) {
  if (process.argv.includes("--guard")) {
    const g = isolationGuard();
    if (g.ok) {
      console.log("[PASS] EVAL recorder isolation: the perceive->infer->act path has zero references to the ground-truth sink.");
      process.exit(0);
    } else {
      console.log(`[FAIL] EVAL recorder leak: ${g.leaks.length} reference(s) into the loop:`);
      for (const l of g.leaks) console.log(`  ${l.file}:${l.line}  ${l.text}`);
      process.exit(1);
    }
  } else {
    console.log("EVAL-only ground-truth recorder. Run with --guard to check loop isolation.");
    console.log(`sink: ${SINK}`);
  }
}

module.exports = { record, boundaryHash, crosshairRaycast, isolationGuard, SINK };
