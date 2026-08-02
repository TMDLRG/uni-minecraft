// gate_runner.cjs — THE GATE-OF-GATES (Phase 9, step 1.2).
//
// WHAT THIS EXISTS TO PROVE, AND WHY:
//   Stage 0's instrument inventory found that every node gate carries its verdict in its exit code — and that
//   NOTHING INVOKES THEM. A gate whose exit code silently disagreed with its printed verdict (the exact false
//   "exits 0 on FAIL" report that was retracted in Stage 0) would pass a pipeline that reads only the exit code
//   while its own words say FAIL. This runner closes that: it invokes every registered gate and asserts the law
//
//       exit == 0   IF AND ONLY IF   the printed verdict is PASS
//
//   and it asserts its own COMPLETENESS: a gate file present on disk but absent from the registry (a "registered
//   gate absent from the runner") fails the runner, so no gate can dodge the law by being left out.
//
// THE STAGE-0 LESSON, HONOURED: gates are spawned with stdout captured to a buffer and the REAL child exit code
// read from the process — NEVER through a pipe (piping is how tail's status was misread as the gate's).
//
// Read-only w.r.t. the repo (it runs gates, which are themselves read-only). Usage:
//   node viewer/gate_runner.cjs            run the CI-safe registered gates, assert the law + completeness
//   node viewer/gate_runner.cjs --all      also run gates marked external (needs live resources)
//   exit 0 = the law holds for every gate run AND the registry is complete; 1 = a violation or a gap.
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const DEFAULT_REGISTRY = path.join(__dirname, "gate_registry.json");
// A registry entry may declare `timeout_ms` when it is honestly slower than this. A gate that boots
// the BEAM and two HTTP servers is not a hanging gate, and one global number cannot tell them apart.
const DEFAULT_TIMEOUT_MS = 90000;

const VERDICTS = ["PASS", "FAIL", "PARTIAL", "WITHHELD", "PENDING", "INCONCLUSIVE"];
// A gate announces its verdict on a line like "<NAME> GATE: PASS — …", "RESULT: FAIL — …", "… PROOF: FAIL — …".
// The LAST such line wins (a gate may print progress then its final verdict). No marker ⇒ UNKNOWN, itself a fault.
const VERDICT_RE = new RegExp(`(?:GATE|RESULT|PROOF):\\s*(${VERDICTS.join("|")})\\b`, "g");

function parseVerdict(output) {
  let m, last = null;
  while ((m = VERDICT_RE.exec(output)) !== null) last = m[1];
  return last; // null ⇒ the gate never announced a verdict
}

// Independent discovery: every runnable gate file by convention (verify_*.cjs / *_lint.cjs) under viewer/, so the
// registry's completeness is checked against the FILESYSTEM, not against itself. The runner and its own meta-gate
// are excluded — a runner that ran itself would recurse.
const EXCLUDE = new Set(["gate_runner.cjs", "verify_gate_runner.cjs"]);
function discoverGateFiles(repoRoot) {
  const root = path.join(repoRoot, "viewer");
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|runtime|snapshots|chrome-profiles|publish|obj|bin/.test(e.name)) walk(p); }
      else if ((/^verify_.*\.cjs$/.test(e.name) || /_lint\.cjs$/.test(e.name)) && !EXCLUDE.has(e.name)) {
        out.push(path.relative(repoRoot, p).replace(/\\/g, "/"));
      }
    }
  };
  walk(root);
  return out.sort();
}

function runGates({ repoRoot = REPO, registryPath = DEFAULT_REGISTRY, includeExternal = false } = {}) {
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const listed = registry.gates.map((g) => g.file).sort();
  const discovered = discoverGateFiles(repoRoot);

  // COMPLETENESS — the falsifier "a registered gate absent from the runner", both directions:
  const onDiskNotListed = discovered.filter((f) => !listed.includes(f)); // a gate the runner would never run
  const listedNotOnDisk = listed.filter((f) => !fs.existsSync(path.join(repoRoot, f))); // a phantom registry entry

  // AND A THIRD DIRECTION: a gate_row NO ROW CAN EVER BEAR. production/schemas/gate_row.schema.json
  // requires a kebab-case `name`, so an entry whose gate_row contains "*" points at a row that is
  // unwritable BY CONSTRUCTION — while that same schema's description says every gate the project
  // claims MUST be represented in evidence/gates.ndjson. Two entries carried globs, and between them
  // they made a stated requirement impossible to satisfy: the row was owed and its shape was refused.
  // That is a defect in the REGISTRY, not in the ledger, so it is refused here — where the entry is
  // written — rather than left for whoever eventually tries to author the row to discover.
  // A gate with NO gate_row at all is not caught here: this check is about a row that cannot exist,
  // not about a missing declaration, and the synthetic registries in verify_gate_runner.cjs omit it.
  const globGateRows = registry.gates
    .filter((g) => typeof g.gate_row === "string" && g.gate_row.includes("*"))
    .map((g) => `${g.id} → gate_row "${g.gate_row}"`);

  const results = [];
  for (const g of registry.gates) {
    if (!g.ci && !includeExternal) { results.push({ id: g.id, file: g.file, ran: false, note: `external — needs ${g.external_needs || "live resources"}; listed, not run` }); continue; }
    const abs = path.join(repoRoot, g.file);
    if (!fs.existsSync(abs)) { results.push({ id: g.id, file: g.file, ran: false, note: "FILE MISSING" }); continue; }
    // Per-gate, because a gate that boots a BEAM and two HTTP servers legitimately takes longer than
    // one that reads a file, and a single global number turns "slow" into "broken".
    const budget = Number(g.timeout_ms) > 0 ? Number(g.timeout_ms) : DEFAULT_TIMEOUT_MS;
    const r = spawnSync(process.execPath, [abs], { encoding: "utf8", timeout: budget, maxBuffer: 32 * 1024 * 1024 });
    const output = (r.stdout || "") + "\n" + (r.stderr || "");
    const exit = r.status; // the REAL child exit code — not read through a pipe
    const verdict = parseVerdict(output);

    // A GATE THAT WAS KILLED DID NOT ANSWER, AND THAT IS NOT A LAW VIOLATION.
    //
    // CORRECTED 2026-07-28. `timedOut` was computed on this line and then USED NOWHERE — not in
    // `violations`, not in `ok`, not printed. On a spawnSync timeout `r.status` is null, so
    // `(null === 0) === (verdict === "PASS")` evaluated to `lawOk = true` for a killed gate that had
    // already printed `GATE: FAIL`. The law that underwrites every other verdict in this repository
    // had a hole in it, and the flag that would have caught it was sitting right there unread.
    //
    // The distinction is the same one the L5 desk had to learn on the same day: a question that was
    // asked and not answered is not an answer of no. A timeout therefore gets its OWN state — it
    // cannot satisfy the law and it cannot violate it, because the law was never evaluated — and it
    // makes the runner NOT ok, because a runner that cannot see a gate's answer has not covered it.
    const timedOut = (!!r.error && /ETIMEDOUT|timed/i.test(String(r.error))) || (exit === null && r.signal);
    if (timedOut) {
      results.push({ id: g.id, file: g.file, ran: true, exit, verdict: "DID_NOT_FINISH", lawOk: null,
        timedOut: true, budget_ms: budget,
        note: `killed after ${budget}ms (${r.signal || "timeout"}) — the law was never evaluated` });
      continue;
    }

    // THE LAW: exit 0 ⟺ verdict PASS. UNKNOWN verdict cannot satisfy the law (the gate must announce one).
    const lawOk = verdict !== null && ((exit === 0) === (verdict === "PASS"));
    results.push({ id: g.id, file: g.file, ran: true, exit, verdict: verdict || "UNKNOWN", lawOk, timedOut: false, budget_ms: budget });
  }

  const violations = results.filter((r) => r.ran && r.lawOk === false);
  const unfinished = results.filter((r) => r.timedOut);
  const complete = onDiskNotListed.length === 0 && listedNotOnDisk.length === 0 && globGateRows.length === 0;
  return { results, violations, unfinished, onDiskNotListed, listedNotOnDisk, globGateRows, complete,
    ok: violations.length === 0 && unfinished.length === 0 && complete };
}

function main() {
  const includeExternal = process.argv.includes("--all");
  // --require-pass is CI's own policy, layered on top of (never inside) the proven runGates() contract: the
  // runner's own `ok` means "the exit⟺verdict LAW holds and the registry is complete" — a gate legitimately
  // announcing its own FAIL is law-consistent and does not violate it (host-tracking currently does this
  // honestly). CI additionally wants to know a red gate at all, so this flag is opt-in and computed here in
  // main(), never inside runGates(), so the already-proven law+completeness contract is untouched.
  const requirePass = process.argv.includes("--require-pass");
  const registryArg = (process.argv.find((a) => a.startsWith("--registry=")) || "").split("=")[1];
  const repoArg = (process.argv.find((a) => a.startsWith("--repo=")) || "").split("=")[1];
  const rep = runGates({ repoRoot: repoArg || REPO, registryPath: registryArg || DEFAULT_REGISTRY, includeExternal });

  for (const r of rep.results) {
    if (!r.ran) { process.stdout.write(`  [ -- ] ${String(r.id).padEnd(18)} ${r.note}\n`); continue; }
    if (r.timedOut) {
      process.stdout.write(`  [KILLED] ${String(r.id).padEnd(17)} ${r.note} ← NOT a verdict; the gate never answered\n`);
      continue;
    }
    const tag = r.lawOk ? "LAW OK" : "LAW!! ";
    process.stdout.write(`  [${tag}] ${String(r.id).padEnd(18)} exit=${String(r.exit).padEnd(4)} verdict=${r.verdict.padEnd(12)} ${r.lawOk ? "" : "← EXIT DISAGREES WITH VERDICT"}\n`);
  }
  if (rep.unfinished.length) {
    process.stdout.write(
      `\n  ${rep.unfinished.length} gate(s) DID NOT FINISH: ${rep.unfinished.map((r) => `${r.id} (${r.budget_ms}ms)`).join(", ")}\n` +
      `      A killed gate is not a passing one and not a failing one — the law was never evaluated,\n` +
      `      so this runner has NOT covered it. Raise that gate's timeout_ms in the registry if it is\n` +
      `      honestly slow, or find out why it hangs. Until 2026-07-28 this state was silently read as\n` +
      `      law-compliant, because exit=null made (exit === 0) === false come out true.\n`);
  }
  if (rep.onDiskNotListed.length) process.stdout.write(`\n  INCOMPLETE — gate file(s) on disk but not in the registry (a registered gate absent from the runner):\n      ${rep.onDiskNotListed.join("\n      ")}\n`);
  if (rep.listedNotOnDisk.length) process.stdout.write(`\n  INCOMPLETE — registry entr(y/ies) with no file on disk:\n      ${rep.listedNotOnDisk.join("\n      ")}\n`);
  if (rep.globGateRows.length) process.stdout.write(
    `\n  REFUSED — registry entr(y/ies) whose gate_row is a GLOB, which no ledger row can ever bear:\n      ` +
    `${rep.globGateRows.join("\n      ")}\n` +
    `      production/schemas/gate_row.schema.json requires a kebab-case name, so a row bearing "*"\n` +
    `      cannot be written — while that schema also says every gate the project claims MUST be\n` +
    `      represented in evidence/gates.ndjson. The entry owes a row and forbids its shape.\n` +
    `      FIX IT IN THE REGISTRY, NOT IN THE SCHEMA (changing gate_row.schema.json is the operator's):\n` +
    `      name the ONE umbrella row this gate's single exit code would be recorded as, and list the\n` +
    `      real rows that verdict covers under "gate_row_family" — a registry-only key, never a\n` +
    `      ledger field. A gate that prints one verdict has one row; it does not have a pattern.\n`);

  const ran = rep.results.filter((r) => r.ran);
  const tally = {};
  for (const r of ran) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  const tallyStr = Object.keys(tally).map((v) => `${tally[v]} ${v}`).join(" · ") || "none run";
  process.stdout.write(`\nGATE RUNNER: ${rep.ok ? "PASS" : "FAIL"} — law holds for ${ran.length - rep.violations.length}/${ran.length} run · ${rep.violations.length} law violation(s) · registry ${rep.complete ? "complete" : "INCOMPLETE"}. Verdict tally: ${tallyStr}.\n`);
  process.stdout.write(`(This runner asserts the exit⟺verdict LAW and its own completeness. A gate's own FAIL is law-consistent and does not fail the runner — it fails that gate.)\n`);

  if (requirePass) {
    const notPassing = ran.filter((r) => r.verdict !== "PASS");
    if (notPassing.length) process.stdout.write(`\n  --require-pass: ${notPassing.length} gate(s) not PASS (this is CI policy, separate from the law): ${notPassing.map((r) => `${r.id}=${r.verdict}`).join(", ")}\n`);
    process.exit(rep.ok && notPassing.length === 0 ? 0 : 1);
  }
  process.exit(rep.ok ? 0 : 1);
}

if (require.main === module) main();
module.exports = { runGates, parseVerdict, discoverGateFiles };
