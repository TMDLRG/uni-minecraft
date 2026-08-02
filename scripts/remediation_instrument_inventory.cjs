#!/usr/bin/env node
"use strict";
/**
 * Stage 0.2 — the frozen instrument inventory.
 *
 * For every gate on this platform: its file sha256, its exit code TODAY, its
 * verdict text TODAY, and — the question that matters — **does the exit code
 * carry the verdict?**
 *
 * WHY THIS EXISTS, and it is a correction to my own report.
 *   I told the operator `verify_host_tracking.cjs` "reports FAIL but exits 0".
 *   That was false. I had run it as `node ... | tail -3` and read TAIL's exit
 *   status, not the gate's. Measured unpiped it exits 1, and its source at :237
 *   is `process.exit(fails ? 1 : 0)` and always was.
 *
 *   So this inventory NEVER pipes. Every gate is spawned with its stdout
 *   captured to a buffer and its own exit code read directly. The defect I
 *   invented is structurally unrepeatable here.
 *
 * NOTHING IS REPAIRED BY THIS SCRIPT. It only measures and freezes. Stage 0 is
 * CONSERVE — the frozen baseline every later step is diffed against.
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..");

// Each gate declares the token that means PASS in its own output, so the
// biconditional (exit 0 <=> verdict PASS) can be evaluated per gate rather than
// guessed from a shared convention that does not exist.
const GATES = [
  { id: "gaia", file: "viewer/gaia/verify_gaia.cjs", pass: /GAIA GATE:\s*PASS/, verdict: /GAIA GATE:.*/ },
  { id: "gaia_lint", file: "viewer/gaia/gaia_lint.cjs", pass: /RESULT:\s*PASS/, verdict: /RESULT:.*/ },
  { id: "lint_bites", file: "viewer/gaia/verify_lint_bites.cjs", pass: /RESULT:\s*PASS/, verdict: /RESULT:.*/ },
  { id: "schema_pointers", file: "viewer/verify_schema_pointers.cjs", pass: /RESULT:\s*PASS/, verdict: /RESULT:.*/ },
  { id: "host_tracking", file: "viewer/verify_host_tracking.cjs", pass: /HOST-TRACKING GATE:\s*PASS/, verdict: /HOST-TRACKING GATE:.*/ },
];

// Measured, never invoked: these write files or touch hosts, so running them
// inside a CONSERVE stage would destroy the state being conserved.
const NOT_INVOKED = [
  { id: "witness_probe", file: "viewer/gaia/witness_probe.cjs", why: "writes viewer/gaia/witness.json — running it overwrites the capture Stage 0 is freezing" },
  { id: "render_gates", file: "viewer/render_gates.cjs", why: "writes docs/GATES.md" },
  { id: "replica_ledger_probe", file: "viewer/gaia/replica_ledger_probe.cjs", why: "sshes to the chip — S2, a write to a host" },
  { id: "verify_overlays", file: "viewer/verify_overlays.cjs", why: "requires :8099, which is down; would report BLOCKED not PASS" },
  { id: "verify_colony", file: "viewer/verify_colony.cjs", why: "LAN-dependent" },
];

const sha = (p) => {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(REPO, p))).digest("hex");
  } catch {
    return null;
  }
};

const results = [];

for (const g of GATES) {
  const abs = path.join(REPO, g.file);
  if (!fs.existsSync(abs)) {
    results.push({ id: g.id, file: g.file, present: false });
    continue;
  }

  // NO PIPE. stdout is captured to a buffer; `status` is the gate's own code.
  const r = spawnSync(process.execPath, [abs], { cwd: REPO, encoding: "utf8", timeout: 180000 });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = (out.match(g.verdict) || [""])[0].trim();
  const said_pass = g.pass.test(out);
  const exit = r.status;

  results.push({
    id: g.id,
    file: g.file,
    file_sha256: sha(g.file),
    present: true,
    exit_code: exit,
    verdict_line: line,
    verdict_is_pass: said_pass,
    // THE QUESTION: exit 0 must mean PASS and non-zero must mean not-PASS.
    exit_carries_verdict: (exit === 0) === said_pass,
    timed_out: r.error ? String(r.error.code || r.error.message) : null,
  });
}

const inventory = {
  schema: "uni.remediation.prefix_census.instruments.v1",
  captured_at: new Date().toISOString(),
  method:
    "Each gate spawned directly with stdout captured to a buffer. NEVER piped — piping is how I " +
    "produced a false 'exits 0' report about verify_host_tracking.cjs by reading tail's status.",
  invoked: results,
  measured_but_not_invoked: NOT_INVOKED.map((n) => ({ ...n, file_sha256: sha(n.file) })),
};

fs.writeFileSync(
  path.join(REPO, "evidence/remediation/0.2_instrument_inventory.json"),
  JSON.stringify(inventory, null, 1)
);

console.log("STAGE 0.2 — INSTRUMENT INVENTORY (frozen, nothing repaired)\n");
for (const r of results) {
  if (!r.present) {
    console.log(`  ${r.id.padEnd(18)} ABSENT`);
    continue;
  }
  const bicond = r.exit_carries_verdict ? "exit CARRIES verdict" : "*** EXIT DOES NOT CARRY VERDICT ***";
  console.log(`  ${r.id.padEnd(18)} exit=${String(r.exit_code).padEnd(4)} ${r.verdict_is_pass ? "PASS" : "not-PASS"}   ${bicond}`);
  console.log(`  ${"".padEnd(18)} ${r.verdict_line.slice(0, 96)}`);
}
console.log("\n  not invoked (would destroy conserved state or need a host):");
for (const n of NOT_INVOKED) console.log(`    ${n.id.padEnd(20)} ${n.why}`);
