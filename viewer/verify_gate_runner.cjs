// verify_gate_runner.cjs — proves the GATE-OF-GATES has teeth (Phase 9, step 1.2).
//
// gate_runner.cjs asserts, across every registered gate, the law "exit 0 ⟺ verdict PASS", and asserts its own
// completeness. A runner that did neither would still print a reassuring summary — so this gate MUTATES the
// world (M1) and demands the runner bite:
//   • a LIAR gate that prints "FAIL" but exits 0 — the exact Stage-0 defect class — must be caught as a law
//     violation (a runner reading only the exit code, or only the words, would miss it);
//   • a GHOST gate file on disk but absent from the registry — "a registered gate absent from the runner", the
//     pre-registered falsifier — must be caught as incompleteness;
//   • a GOOD gate (PASS/exit 0) and a REAL-FAIL gate (FAIL/exit 1) must both read law-consistent (negative
//     controls — the runner must not cry wolf on an honest gate or an honest failure).
// Then it checks the REAL registry is COMPLETE against filesystem discovery (no runnable gate can hide).
//
// Its only writes are to an OS temp fixture it creates and removes. Usage: node viewer/verify_gate_runner.cjs
//   exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const runner = require("./gate_runner.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// ---- 1. THE TEETH: mutate gates in a sandbox, demand the runner bite ------------------------------------
function checkFixtureBite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-gaterunner-"));
  try {
    const viewerDir = path.join(dir, "viewer");
    fs.mkdirSync(viewerDir, { recursive: true });
    const gate = (name, line, code) => fs.writeFileSync(path.join(viewerDir, name), `"use strict";\nconsole.log(${JSON.stringify(line)});\nprocess.exit(${code});\n`);
    gate("verify_good.cjs", "GOOD GATE: PASS — honest pass", 0);
    gate("verify_liar.cjs", "LIAR GATE: FAIL — says FAIL but exits 0 (the Stage-0 defect)", 0);
    gate("verify_realfail.cjs", "REAL GATE: FAIL — an honest failure", 1);
    gate("verify_ghost.cjs", "GHOST GATE: PASS — present on disk, absent from the registry", 0);

    // A GATE THAT ANNOUNCES FAIL AND THEN HANGS. Until 2026-07-28 this was read as LAW-COMPLIANT:
    // spawnSync's timeout makes `r.status` null, and `(null === 0) === (verdict === "PASS")` is
    // `false === false`, which is true. The `timedOut` flag was computed on that very line and used
    // NOWHERE — not in violations, not in `ok`, not printed. The law underwriting every verdict in
    // this repository had a hole in it, and the flag that would have caught it was sitting unread.
    fs.writeFileSync(path.join(viewerDir, "verify_hangs.cjs"),
      '"use strict";\nconsole.log("HANG GATE: FAIL — announces a verdict, then never exits");\n' +
      "setInterval(() => {}, 1000);\n");

    const registry = { schema: "uni.gate_runner.registry.v1", gates: [
      { id: "good", file: "viewer/verify_good.cjs", ci: true },
      { id: "liar", file: "viewer/verify_liar.cjs", ci: true },
      { id: "realfail", file: "viewer/verify_realfail.cjs", ci: true },
      // A tiny budget, declared, so the check costs a second rather than ninety.
      { id: "hangs", file: "viewer/verify_hangs.cjs", ci: true, timeout_ms: 1200 },
    ] };
    const regPath = path.join(dir, "registry.json");
    fs.writeFileSync(regPath, JSON.stringify(registry));

    const rep = runner.runGates({ repoRoot: dir, registryPath: regPath, includeExternal: true });
    const byId = Object.fromEntries(rep.results.map((r) => [r.id, r]));
    const problems = [];

    if (!(byId.liar && byId.liar.ran && byId.liar.lawOk === false && byId.liar.verdict === "FAIL" && byId.liar.exit === 0))
      problems.push(`the LIAR (exit 0 + verdict FAIL) was not caught as a law violation: ${JSON.stringify(byId.liar)}`);
    if (!(byId.good && byId.good.lawOk === true && byId.good.verdict === "PASS"))
      problems.push(`the GOOD gate was not read as law-consistent: ${JSON.stringify(byId.good)}`);
    if (!(byId.realfail && byId.realfail.lawOk === true && byId.realfail.verdict === "FAIL" && byId.realfail.exit === 1))
      problems.push(`an honest FAIL (exit 1 + verdict FAIL) was not read as law-consistent: ${JSON.stringify(byId.realfail)}`);
    if (!rep.onDiskNotListed.includes("viewer/verify_ghost.cjs"))
      problems.push(`the GHOST gate (on disk, unregistered) was not caught as incompleteness: ${JSON.stringify(rep.onDiskNotListed)}`);
    if (rep.ok !== false)
      problems.push(`the runner reported ok=true despite a liar and a ghost — it did not bite`);

    // THE HANGING GATE. It must get its OWN state — not a verdict, not a law violation, because the
    // law was never evaluated — and it must make the runner not-ok, since a runner that could not
    // see a gate's answer has not covered it.
    if (!(byId.hangs && byId.hangs.timedOut === true))
      problems.push(`a gate killed by its timeout was not marked timedOut: ${JSON.stringify(byId.hangs)}`);
    if (!(byId.hangs && byId.hangs.verdict === "DID_NOT_FINISH"))
      problems.push(`a killed gate must read DID_NOT_FINISH, not a verdict: ${byId.hangs && byId.hangs.verdict}`);
    if (!(byId.hangs && byId.hangs.lawOk === null))
      problems.push(`a killed gate's lawOk must be null — the law was never evaluated — got ${byId.hangs && byId.hangs.lawOk}`);
    if (rep.violations.some((v) => v.id === "hangs"))
      problems.push("a killed gate was counted as a LAW VIOLATION; it is neither compliant nor violating");
    if (!(rep.unfinished || []).some((v) => v.id === "hangs"))
      problems.push("a killed gate was not reported in `unfinished`");

    if (problems.length) bad("runner-bites-liar-ghost-and-hang", problems.join("\n      "));
    else ok("runner-bites-liar-ghost-and-hang",
      "a FAIL-but-exit-0 liar is a law violation; an unregistered file is incompleteness; an honest " +
      "PASS and an honest FAIL are law-consistent; AND A GATE THAT HANGS gets DID_NOT_FINISH with " +
      "lawOk=null — until 2026-07-28 that case was silently read as law-compliant, because exit=null " +
      "made (exit === 0) === (verdict === 'PASS') come out true for a gate that had printed FAIL");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 2. negative control: the verdict parser ties exit⟺verdict correctly across the real grammars ------
function checkVerdictParser() {
  const cases = [
    ["BOOT-IDENTITY GATE: PASS — 7 checks", "PASS"],
    ["  RESULT: FAIL — a broken promise", "FAIL"],
    ["OVERLAY PROOF: FAIL — down", "FAIL"],
    ["  RESULT: PARTIAL — the lint bites but…", "PARTIAL"],
    ["progress line\nGAIA GATE: PASS — 12 checks\ntrailing", "PASS"],
    ["no verdict marker at all", null],
  ];
  const problems = [];
  for (const [txt, want] of cases) {
    const got = runner.parseVerdict(txt);
    if (got !== want) problems.push(`parseVerdict(${JSON.stringify(txt.slice(0, 30))}…) = ${got}, expected ${want}`);
  }
  if (problems.length) bad("verdict-parser-covers-the-real-grammars", problems.join("\n      "));
  else ok("verdict-parser-covers-the-real-grammars", `${cases.length} verdict-line forms (GATE:/RESULT:/PROOF:, last-wins, none) parse correctly`);
}

// ---- 3. the REAL registry is complete against filesystem discovery (no runnable gate hides) -------------
function checkRealRegistryComplete() {
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "gate_registry.json"), "utf8"));
  const listed = registry.gates.map((g) => g.file).sort();
  const discovered = runner.discoverGateFiles(path.join(__dirname, ".."));
  const onDiskNotListed = discovered.filter((f) => !listed.includes(f));
  const listedNotOnDisk = listed.filter((f) => !fs.existsSync(path.join(__dirname, "..", f)));
  const problems = [];
  if (onDiskNotListed.length) problems.push(`gate file(s) on disk but not registered (would never be run): ${onDiskNotListed.join(", ")}`);
  if (listedNotOnDisk.length) problems.push(`registry entr(y/ies) with no file: ${listedNotOnDisk.join(", ")}`);
  if (problems.length) bad("real-registry-complete-vs-discovery", problems.join("\n      "));
  else ok("real-registry-complete-vs-discovery", `all ${discovered.length} discovered gate files are registered; no phantom entries`);
}

// ---- 4. --require-pass is CI policy layered ON, not INSIDE, the proven law — real subprocess (M1) ---------
// Exercises the actual CLI (spawnSync on gate_runner.cjs itself), not the library function, so this proves
// the flag as users/CI actually invoke it. A real, honest, law-consistent FAIL must: (a) leave the DEFAULT
// exit at 0 (protects 1.2's already-proven contract — the flag must be opt-in, never a silent behaviour
// change), and (b) flip the exit to 1 under --require-pass (CI must go red on a real gate failure).
function checkRequirePassIsAdditive() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-gaterunner-rp-"));
  try {
    const viewerDir = path.join(dir, "viewer");
    fs.mkdirSync(viewerDir, { recursive: true });
    fs.writeFileSync(path.join(viewerDir, "verify_honestfail.cjs"), '"use strict";\nconsole.log("HONEST GATE: FAIL -- a real, law-consistent failure");\nprocess.exit(1);\n');
    const regPath = path.join(dir, "registry.json");
    fs.writeFileSync(regPath, JSON.stringify({ schema: "uni.gate_runner.registry.v1", gates: [{ id: "honestfail", file: "viewer/verify_honestfail.cjs", ci: true }] }));

    const runnerPath = path.join(__dirname, "gate_runner.cjs");
    const base = [runnerPath, `--repo=${dir}`, `--registry=${regPath}`];
    const withoutFlag = spawnSync(process.execPath, base, { encoding: "utf8" });
    const withFlag = spawnSync(process.execPath, [...base, "--require-pass"], { encoding: "utf8" });

    const problems = [];
    if (withoutFlag.status !== 0) problems.push(`default (no flag) exited ${withoutFlag.status} on a law-consistent FAIL — the law-only contract regressed`);
    if (withFlag.status !== 1) problems.push(`--require-pass exited ${withFlag.status} on a real FAIL — CI policy did not fire`);
    if (problems.length) bad("require-pass-is-additive-ci-policy", problems.join("\n      "));
    else ok("require-pass-is-additive-ci-policy", "a law-consistent FAIL leaves the default exit at 0 (1.2's contract untouched) and --require-pass flips it to 1 (CI policy, opt-in)");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

(function main() {
  checkFixtureBite();
  checkVerdictParser();
  checkRealRegistryComplete();
  checkRequirePassIsAdditive();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(38)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nGATE-RUNNER META-GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.exit(fails ? 1 : 0);
})();
