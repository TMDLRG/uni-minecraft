// reinventory_gates.cjs — STAGE 1'S PROOF 2 (Phase 9, step 1.9).
//
// The four-proof cycle's second proof is NOT "run the same test again". It is the INSTRUMENT re-run and
// diffed against Stage 0's frozen census, with this warning attached: "An unexpected second improvement is
// as suspicious as a failure." So this re-measures what evidence/remediation/0.2_instrument_inventory.json
// measured — every gate's file sha256, its real exit code, and the verdict line it printed — and diffs the
// two, SHOWING UNCHANGED ROWS TOO. A diff that only lists what moved cannot show you what held still.
//
// M2, INDEPENDENT REIMPLEMENTATION: this shares no code with viewer/gate_runner.cjs (step 1.2). It does not
// import it, does not read gate_registry.json, and re-derives the gate list from the Stage 0 artifact plus
// its own filesystem walk. If the runner and this file disagree about a gate's verdict, that disagreement is
// the finding — an oracle that imports the code under test is worthless.
//
// THE STAGE 0 LESSON IS HONOURED: each gate is spawned with stdout captured to a BUFFER and the child's own
// exit status read from the process. NEVER through a pipe. Reading `tail`'s status through a pipe is how a
// false "exits 0 on FAIL" report was produced and retracted in Stage 0, and the harness that produced that
// artifact was rebuilt so the mistake is structurally unrepeatable. So is this one.
//
// Usage: node viewer/reinventory_gates.cjs [--json] [--out <path>]
//   exit 0 = the diff is fully explained; 1 = an UNEXPLAINED change (including an unexpected improvement).
"use strict";

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const BASELINE = path.join(REPO, "evidence/remediation/0.2_instrument_inventory.json");
const VERDICTS = ["PASS", "FAIL", "PARTIAL", "WITHHELD", "PENDING", "INCONCLUSIVE"];
const VERDICT_RE = new RegExp(`(?:GATE|RESULT|PROOF):\\s*(${VERDICTS.join("|")})\\b`, "g");

// EXPECTED CHANGES, declared BEFORE the run and justified one by one. Anything outside this list is
// UNEXPLAINED and fails — including an improvement. A change that is merely welcome is still unexplained.
const EXPECTED = {
  gaia_lint: "step 1.6 added `lag` to the drift relation vocabulary (ADR-0002 Amd 1 Decision 6); step 1.4 made a missing golden manifest a hard violation",
  schema_pointers: "step 1.5 removed a now-STALE exclusion for collectors.cjs (its ghost-path probe is gone), so the scan covers 5 more cited paths",
  gaia: "step 1.5/1.6/1.7/1.8 changed collectors.cjs, which verify_gaia.cjs reads; the gate file itself is unchanged",
};

const sha256File = (p) => { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch (_) { return null; } };

function parseVerdict(out) { let m, last = null; while ((m = VERDICT_RE.exec(out)) !== null) last = m[1]; return last; }

function runGate(rel) {
  const abs = path.join(REPO, rel);
  if (!fs.existsSync(abs)) return { present: false, file_sha256: null, exit_code: null, verdict: null };
  // stdout to a BUFFER; the child's own status. No shell, no pipe, no tail.
  const r = spawnSync(process.execPath, [abs], { encoding: "utf8", timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const out = (r.stdout || "") + "\n" + (r.stderr || "");
  return { present: true, file_sha256: sha256File(abs), exit_code: r.status, verdict: parseVerdict(out) };
}

function main() {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const rows = [];
  let unexplained = 0;

  for (const b of baseline.invoked) {
    const now = runGate(b.file);
    const shaChanged = now.file_sha256 !== b.file_sha256;
    const exitChanged = now.exit_code !== b.exit_code;
    const verdictChanged = (now.verdict || null) !== (b.verdict_is_pass ? "PASS" : (b.verdict_line || "").match(/(FAIL|PARTIAL|PENDING|WITHHELD|INCONCLUSIVE)/)?.[1] || null);
    const changed = shaChanged || exitChanged;
    let status, note;
    if (!changed) { status = "UNCHANGED"; note = `exit ${now.exit_code}, verdict ${now.verdict}, file byte-identical to Stage 0`; }
    else if (EXPECTED[b.id]) { status = "CHANGED (declared)"; note = EXPECTED[b.id]; }
    else { status = "CHANGED — UNEXPLAINED"; note = "not in the pre-declared expected set; an unexpected improvement is as suspicious as a failure"; unexplained++; }

    // The verdict itself moving is the sharpest case: it means the WORLD changed, not just the file.
    if (exitChanged) {
      const dir = (b.exit_code !== 0 && now.exit_code === 0) ? "IMPROVED" : "REGRESSED";
      note += ` | VERDICT MOVED ${b.exit_code}->${now.exit_code} (${dir}) — this is a change in the WORLD, not the file`;
      if (dir === "IMPROVED") { status = "VERDICT IMPROVED — MUST BE EXPLAINED"; unexplained++; }
    }
    rows.push({ id: b.id, file: b.file, status, note, stage0: { exit: b.exit_code, sha: b.file_sha256 }, now: { exit: now.exit_code, sha: now.file_sha256, verdict: now.verdict } });
  }

  for (const r of rows) {
    process.stdout.write(`  [${r.status.padEnd(30)}] ${r.id.padEnd(16)} exit ${String(r.stage0.exit)}->${String(r.now.exit)}  sha ${String(r.stage0.sha).slice(0, 8)}->${String(r.now.sha).slice(0, 8)}\n`);
    process.stdout.write(`       ${r.note}\n`);
  }
  const unchanged = rows.filter((r) => r.status === "UNCHANGED").length;
  process.stdout.write(`\nRE-INVENTORY: ${unexplained ? "FAIL" : "PASS"} — ${rows.length} gate(s) re-measured · ${unchanged} UNCHANGED · ${rows.length - unchanged} changed · ${unexplained} UNEXPLAINED.\n`);
  process.stdout.write("(Proof 2 re-runs the INSTRUMENT, not the test. Unchanged rows are shown deliberately: a diff that lists only what moved cannot show what held still.)\n");

  const outArg = process.argv.indexOf("--out");
  if (outArg !== -1 && process.argv[outArg + 1]) {
    fs.writeFileSync(process.argv[outArg + 1], JSON.stringify({ schema: "uni.remediation.reinventory.v1", baseline: "evidence/remediation/0.2_instrument_inventory.json", rows }, null, 1) + "\n");
  }
  process.exit(unexplained ? 1 : 0);
}

if (require.main === module) main();
