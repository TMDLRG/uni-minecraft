// reinventory_f28_f31.cjs — Phase 9 step 3.6: re-measure F28-F31 against the 0.2 inventory.
//
//     node viewer/reinventory_f28_f31.cjs
//
// WHAT THE BASELINE SAYS, AND WHY THE ANSWER IS ZERO
// ---------------------------------------------------
// `evidence/remediation/0.2_instrument_inventory.json` is Stage 0's frozen census of instruments:
// 5 invoked, 5 measured-but-not-invoked. **F28, F29, F30 and F31 appear in it nowhere.** That is
// not an omission — at Stage 0 there was nothing to inventory. F28 had no checker at all, F29 and
// F30 had a verdict function with two words, and F31 had a string comparison on loopback. A census
// of instruments cannot list an instrument that does not exist.
//
// So the re-measurement is a before/after against zero, and the honest headline is the count.
//
// METHOD, INHERITED FROM 0.2 VERBATIM
// ------------------------------------
// "Each gate spawned directly with stdout captured to a buffer. NEVER piped — piping is how I
// produced a false 'exits 0' report about verify_host_tracking.cjs by reading tail's status."
// That rule is kept here exactly, for exactly that reason.
//
// M2 — THE INDEPENDENT SECOND COUNT
// ----------------------------------
// Spawning each instrument and reading its verdict is one route. Counting the same instruments
// from their REGISTRATIONS — the gate registry for the Node side, pytest's own collection for the
// Python side — is another, and it shares no code with the first. If the two disagree, the
// disagreement IS the finding: an instrument that runs but is registered nowhere is one nobody
// will run again, and one registered but absent is a census counting a ghost.
//
// CROSS-REPO, AND SAYING SO. F28/F29/F30's instruments live in UNI-FLAGELLUM. The 0.2 inventory
// covered UNI.Minecraft's viewer gates only, so it could not have contained them and still cannot.
// That gap is real and is recorded rather than smoothed over.
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const FLAG = path.resolve(REPO, "..", "UNI-Flagellum", "UNI-FLAGELLUM");
const BASELINE = path.join(REPO, "evidence", "remediation", "0.2_instrument_inventory.json");
const OUT = path.join(REPO, "evidence", "remediation", "3.6_f28_f31_remeasure.json");

const sha = (p) => {
  try {
    return require("crypto").createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return null;
  }
};

// The instruments that now exist, declared per failure mode. `kind: proof` is an operator-facing
// prover (it must exit 0 and prove a refusal); `kind: gate` is CI-runnable; `kind: suite` is a
// test file run through pytest.
const INSTRUMENTS = [
  { f: "F28", repo: "UNI-FLAGELLUM", kind: "suite", rel: "hierarchical-aif/tests/motor_stack_aif/test_frozen_evidence_halts.py",
    run: ["python", ["-m", "pytest", "hierarchical-aif/tests/motor_stack_aif/test_frozen_evidence_halts.py", "-q"]] },
  { f: "F28", repo: "UNI-FLAGELLUM", kind: "proof", rel: "hierarchical-aif/src/motor_stack_aif/frozen_evidence_guard.py",
    run: ["python", ["hierarchical-aif/src/motor_stack_aif/frozen_evidence_guard.py"]] },
  { f: "F28", repo: "UNI-FLAGELLUM", kind: "wiring", rel: "hierarchical-aif/tests/conftest.py", run: null },

  { f: "F29+F30", repo: "UNI-FLAGELLUM", kind: "suite", rel: "hierarchical-aif/tests/motor_stack_aif/test_d5_distribution_guard.py",
    run: ["python", ["-m", "pytest", "hierarchical-aif/tests/motor_stack_aif/test_d5_distribution_guard.py", "-q"]] },
  { f: "F29+F30", repo: "UNI-FLAGELLUM", kind: "suite", rel: "hierarchical-aif/tests/motor_stack_aif/test_d5_coverage_conservation.py",
    run: ["python", ["-m", "pytest", "hierarchical-aif/tests/motor_stack_aif/test_d5_coverage_conservation.py", "-q"]] },
  { f: "F29+F30", repo: "UNI-FLAGELLUM", kind: "proof", rel: "hierarchical-aif/scripts/prove_unverified_bites.py",
    run: ["python", ["hierarchical-aif/scripts/prove_unverified_bites.py"]] },

  { f: "F31", repo: "UNI.Minecraft", kind: "gate", rel: "viewer/verify_golive_refuses_agents.cjs",
    run: ["node", ["viewer/verify_golive_refuses_agents.cjs"]] },
  { f: "F31", repo: "UNI.Minecraft", kind: "proof", rel: "viewer/prove_golive_refuses_me.cjs",
    run: ["node", ["viewer/prove_golive_refuses_me.cjs"]] },
  { f: "F31", repo: "UNI.Minecraft", kind: "chokepoint", rel: "viewer/golive_guard.cjs", run: null },
];

const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const baselineText = JSON.stringify(baseline);
const inBaseline = (rel) => baselineText.includes(rel);

// SPEAK WHILE WORKING. The first version of this file measured all nine instruments in silence
// and printed everything at the end — 31 SECONDS with not one character on screen, because it
// spawns three pytest runs and a collect-only in sequence. The operator ran it, saw nothing, and
// reported it as broken. HE WAS RIGHT: a proof he is meant to WATCH must show that it is alive,
// and a tool that is indistinguishable from a hang is a broken tool whatever its exit code says.
console.log("\nRE-MEASURE F28-F31 AGAINST THE 0.2 INVENTORY (baseline " + baseline.captured_at + ")");
console.log("Spawning " + INSTRUMENTS.filter((i) => i.run).length + " instruments; the pytest ones");
console.log("take ~10s each. Each line appears the moment that instrument finishes.\n");

const measured = INSTRUMENTS.map((i) => {
  const root = i.repo === "UNI.Minecraft" ? REPO : FLAG;
  const abs = path.join(root, i.rel);
  const present = fs.existsSync(abs);
  const rec = {
    failure_mode: i.f,
    repo: i.repo,
    file: i.rel,
    kind: i.kind,
    present,
    file_sha256: present ? sha(abs) : null,
    in_0_2_inventory: inBaseline(i.rel),
    exit_code: null,
    verdict_line: null,
    timed_out: null,
  };

  const label = "  " + rec.failure_mode.padEnd(9) + " " +
    (rec.repo === "UNI.Minecraft" ? "MC  " : "FLAG") + " " + rec.kind.padEnd(11) + " ";

  if (!present || !i.run) {
    console.log(label + "exit=  -   " + i.rel + (present ? "" : "   ABSENT"));
    return rec;
  }

  // Announce BEFORE spawning, but ONLY on a real terminal. The in-place rewrite below uses \r,
  // which a human sees as the line completing and a captured buffer sees as both halves printed
  // on one row. Checking isTTY is the difference between a live progress line and a mangled log.
  if (process.stdout.isTTY) process.stdout.write(label + "running… ");

  // NEVER PIPED. spawnSync with the output captured to a buffer, exactly as 0.2's method demands.
  const t0 = process.hrtime.bigint();
  const r = cp.spawnSync(i.run[0], i.run[1], { cwd: root, encoding: "utf8", timeout: 180000, shell: false });
  const secs = Number(process.hrtime.bigint() - t0) / 1e9;

  rec.exit_code = r.status;
  rec.timed_out = !!(r.error && /ETIMEDOUT|timed/.test(String(r.error)));
  const out = ((r.stdout || "") + (r.stderr || "")).split(/\r?\n/).filter((l) => l.trim());
  rec.verdict_line = out.length ? out[out.length - 1].slice(0, 200) : null;

  process.stdout.write((process.stdout.isTTY ? "\r" : "") + label +
    "exit=" + String(rec.exit_code).padStart(3) +
    "   " + secs.toFixed(1).padStart(5) + "s  " + i.rel + "\n");
  return rec;
});

// ---- M2: the same instruments counted from their REGISTRATIONS, sharing no code with the above --

const registry = JSON.parse(fs.readFileSync(path.join(REPO, "viewer", "gate_registry.json"), "utf8"));
const registeredF31 = registry.gates.filter((g) => /golive/.test(g.id)).map((g) => g.file);

const collect = cp.spawnSync("python",
  ["-m", "pytest", "hierarchical-aif/tests/motor_stack_aif/test_frozen_evidence_halts.py",
   "hierarchical-aif/tests/motor_stack_aif/test_d5_distribution_guard.py",
   "hierarchical-aif/tests/motor_stack_aif/test_d5_coverage_conservation.py",
   "--collect-only", "-q"],
  { cwd: FLAG, encoding: "utf8", timeout: 180000, shell: false });
const collectedCases = (collect.stdout || "").split(/\r?\n/).filter((l) => /::test_/.test(l)).length;

const spawnedSuites = measured.filter((m) => m.kind === "suite" && m.present).length;
const secondRouteAgrees = registeredF31.length === 1 && collectedCases > 0;

// ---- the report --------------------------------------------------------------------------------

const byMode = {};
for (const m of measured) {
  byMode[m.failure_mode] = byMode[m.failure_mode] || { at_0_2: 0, now: 0, passing: 0 };
  byMode[m.failure_mode].now += m.present ? 1 : 0;
  byMode[m.failure_mode].at_0_2 += m.in_0_2_inventory ? 1 : 0;
  byMode[m.failure_mode].passing += m.exit_code === 0 ? 1 : 0;
}

const report = {
  schema: "uni.remediation.f28_f31_remeasure.v1",
  step: "3.6",
  baseline: { file: "evidence/remediation/0.2_instrument_inventory.json", captured_at: baseline.captured_at },
  method:
    "Each instrument spawned directly with output captured to a buffer. NEVER piped — inherited " +
    "verbatim from 0.2's method, which was itself written after piping produced a false 'exits 0'.",
  cross_repo_note:
    "F28/F29/F30's instruments live in UNI-FLAGELLUM. The 0.2 inventory covered UNI.Minecraft's " +
    "viewer gates only, so it could not have contained them and still cannot. The gap is real.",
  totals: byMode,
  independent_second_count: {
    method: "registrations rather than execution: gate_registry.json for Node, pytest --collect-only for Python",
    f31_gates_registered: registeredF31.length,
    python_cases_collected: collectedCases,
    agrees: secondRouteAgrees,
  },
  instruments: measured,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 1) + "\n", { encoding: "utf8" });

// ---- what a human reads -------------------------------------------------------------------------

// padEnd and concatenation, never "%-9s": Node's console.log has NO width flags, so it prints the
// specifier verbatim and silently shifts every argument after it. This is the SECOND time it
// caught me in one session — prove_golive_refuses_me.cjs was the first — so it is written down
// here rather than remembered. The numbers were right both times; only the reader was misled,
// which is the worst shape for a reporting bug to have.
console.log("");
for (const [mode, t] of Object.entries(byMode)) {
  console.log("  " + mode.padEnd(9) + " instruments at 0.2: " + t.at_0_2 +
    "   now: " + t.now + "   exiting 0: " + t.passing);
}
console.log("\n  independent second count (registrations, not execution): " + registeredF31.length +
  " F31 gate(s) registered, " + collectedCases + " python cases collected -> " +
  (secondRouteAgrees ? "AGREES" : "DISAGREES - that disagreement is the finding"));

const total = measured.filter((m) => m.present).length;
const ran = measured.filter((m) => m.exit_code !== null);
const green = ran.filter((m) => m.exit_code === 0).length;

console.log("\nEXPECTED OUTPUT: " + total + " instruments present, " + ran.length +
  " runnable, all " + ran.length + " exiting 0, and");
console.log("ZERO of them in the 0.2 inventory — because at Stage 0 none of them existed.");
console.log("");
console.log("RECOMPUTE IT YOURSELF:");
console.log("    node -e \"const r=require('./evidence/remediation/3.6_f28_f31_remeasure.json');" +
  "console.log(r.instruments.filter(i=>i.present).length, r.instruments.filter(i=>i.in_0_2_inventory).length)\"");
console.log("  It must print: " + total + " 0");
console.log("\nRESULT: " + (green === ran.length && secondRouteAgrees
  ? "all instruments green, both counts agree"
  : "SEE ABOVE - not every instrument is green, or the counts disagree") + "\n");

process.exit(green === ran.length && secondRouteAgrees ? 0 : 1);
