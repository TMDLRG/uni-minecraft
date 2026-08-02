// verify_golden_pins.cjs — THE GOLDEN-PIN GATE (Phase 9, step 1.4).
//
// WHAT THIS PROVES, AND WHY IT IS SHAPED THIS WAY:
//   gaia_lint's check (e) pins the on-disk bytes of Gaia's core sources (gaia.cjs, sig.cjs, gaia_server.cjs)
//   against a committed manifest, viewer/gaia/goldens.json — the byte-identity idiom. Before Phase 9 step 1.4
//   that manifest DID NOT EXIST, so all three read "unpinned" and the check could not fire at all.
//
//   The pre-registered falsifier for 1.4 is: "AN EDIT WITHOUT A RE-PIN PASSES." That has THREE distinct
//   routes, not one, and pinning alone only closes the first:
//     (1) edit a pinned file            -> "mismatch"  -> already a hard violation
//     (2) edit it AND delete goldens.json -> "unpinned" -> PASSED, by default, before this step
//     (3) edit it AND drop just its entry -> "unpinned" -> PASSED, by default, before this step
//   Routes 2 and 3 make the pin self-erasing: the guard could be removed by deleting the guard. The lint's
//   `requireGolden` flag existed for the honest PRE-pin era ("golden not yet established"), but once the
//   manifest is committed, a MISSING pin is not an honest pre-pin state — it is a removed guard, and this
//   gate treats it as such.
//
// EVERY MUTATION RUNS ON A DISPOSABLE SANDBOX COPY. gaia_lint.cjs resolves its paths from __dirname, so a
// copy in a temp dir lints THAT dir — the real viewer/gaia/ is never edited, never re-pinned, never touched.
// (Stub contents suffice: check (e) hashes bytes and cares about nothing else.)
//
// PASS — the real tree is fully pinned AND all three evasion routes are refused.
// Usage: node viewer/gaia/verify_golden_pins.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const GAIA_DIR = __dirname;
const REAL_LINT = path.join(GAIA_DIR, "gaia_lint.cjs");
const REAL_GOLDEN = path.join(GAIA_DIR, "goldens.json");
const PINNED_FILES = ["gaia.cjs", "sig.cjs", "gaia_server.cjs"];

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// ---- sandbox helpers -------------------------------------------------------------------------------------
// Build a miniature viewer/gaia/: the REAL gaia_lint.cjs (so we test the real logic, not a re-implementation)
// plus stub pinned files and a manifest generated here by an INDEPENDENT hash (never by the code under test).
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-goldenpin-"));
  fs.copyFileSync(REAL_LINT, path.join(dir, "gaia_lint.cjs"));
  const golden = {};
  for (const f of PINNED_FILES) {
    const body = `"use strict"; // stub for ${f}\nmodule.exports = {};\n`;
    fs.writeFileSync(path.join(dir, f), body);
    golden[f] = sha256(Buffer.from(body));
  }
  fs.writeFileSync(path.join(dir, "goldens.json"), JSON.stringify(golden, null, 2) + "\n");
  return dir;
}

// Lint the sandbox with the sandbox's own copy of the module (its __dirname == the sandbox).
function lintSandbox(dir) {
  const modPath = path.join(dir, "gaia_lint.cjs");
  delete require.cache[require.resolve(modPath)];
  const mod = require(modPath);
  const fn = mod.lint || mod;
  const res = fn({ live: false, snapshots: false });
  const goldenViolations = (res.violations || []).filter((v) => v.code === "GOLDEN");
  const byFile = {};
  for (const g of res.goldens || []) byFile[g.file] = g.status;
  return { res, goldenViolations, byFile };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

// ---- 1. the REAL tree is pinned, and every pin matches ---------------------------------------------------
function checkRealTreePinned() {
  if (!fs.existsSync(REAL_GOLDEN)) {
    bad("real-tree-is-pinned", `viewer/gaia/goldens.json does not exist — all ${PINNED_FILES.length} core sources are UNPINNED, so check (e) cannot fire at all`);
    return;
  }
  let golden;
  try { golden = JSON.parse(fs.readFileSync(REAL_GOLDEN, "utf8")); }
  catch (e) { bad("real-tree-is-pinned", `goldens.json is not parseable JSON: ${e.message}`); return; }

  const problems = [];
  for (const f of PINNED_FILES) {
    const abs = path.join(GAIA_DIR, f);
    if (!fs.existsSync(abs)) { problems.push(`${f}: pinned file is not on disk`); continue; }
    const actual = sha256(fs.readFileSync(abs));
    const expected = golden[f] ? String(golden[f]) : null;
    if (expected == null) problems.push(`${f}: UNPINNED — no entry in goldens.json`);
    else if (expected !== actual) problems.push(`${f}: MISMATCH — on-disk ${actual.slice(0, 12)}… != pinned ${expected.slice(0, 12)}… (re-pin deliberately with --write-golden, or revert the edit)`);
  }
  if (problems.length) bad("real-tree-is-pinned", problems.join("\n      "));
  else ok("real-tree-is-pinned", `all ${PINNED_FILES.length} core sources pinned and byte-identical to goldens.json (${PINNED_FILES.join(", ")})`);
}

// ---- 2. NEGATIVE CONTROL (M6): an untouched pinned sandbox must be silent --------------------------------
function checkNoFalseAlarm() {
  const dir = makeSandbox();
  try {
    const { goldenViolations, byFile } = lintSandbox(dir);
    const allMatch = PINNED_FILES.every((f) => byFile[f] === "match");
    if (!allMatch || goldenViolations.length) bad("negative-control-untouched-tree-is-silent", `an UNTOUCHED pinned tree produced ${goldenViolations.length} violation(s), statuses ${JSON.stringify(byFile)} — the gate cries wolf`);
    else ok("negative-control-untouched-tree-is-silent", "an untouched, correctly-pinned tree yields status=match on every file and zero violations");
  } finally { cleanup(dir); }
}

// ---- 3. TEETH route 1 (M1): edit a pinned file, do not re-pin -> MUST FAIL -------------------------------
function checkEditIsCaught() {
  const dir = makeSandbox();
  try {
    const victim = path.join(dir, "gaia.cjs");
    fs.writeFileSync(victim, fs.readFileSync(victim, "utf8") + "\n// an edit that was never re-pinned\n");
    const { goldenViolations, byFile } = lintSandbox(dir);
    if (byFile["gaia.cjs"] !== "mismatch" || !goldenViolations.length) bad("edit-without-repin-is-caught", `edited gaia.cjs without re-pinning: status=${byFile["gaia.cjs"]}, ${goldenViolations.length} violation(s) — THE PRE-REGISTERED FALSIFIER FIRED`);
    else ok("edit-without-repin-is-caught", `an edit without a re-pin reads "mismatch" and raises a GOLDEN violation`);
  } finally { cleanup(dir); }
}

// ---- 4. TEETH route 2 (M1): delete the whole manifest -> MUST FAIL ---------------------------------------
// The guard must not be removable by deleting the guard.
function checkDeletedManifestIsCaught() {
  const dir = makeSandbox();
  try {
    const victim = path.join(dir, "gaia.cjs");
    fs.writeFileSync(victim, fs.readFileSync(victim, "utf8") + "\n// edited AND the manifest deleted\n");
    fs.rmSync(path.join(dir, "goldens.json"), { force: true });
    const { goldenViolations, byFile } = lintSandbox(dir);
    if (!goldenViolations.length) bad("deleted-manifest-is-caught", `deleting goldens.json made an edited file read "${byFile["gaia.cjs"]}" with ZERO violations — the pin is self-erasing: remove the guard and the edit passes. THE PRE-REGISTERED FALSIFIER FIRED.`);
    else ok("deleted-manifest-is-caught", `deleting the whole manifest raises ${goldenViolations.length} GOLDEN violation(s) — a removed guard is a failure, not an honest "unpinned"`);
  } finally { cleanup(dir); }
}

// ---- 5. TEETH route 3 (M1): drop just the edited file's entry -> MUST FAIL -------------------------------
function checkDroppedEntryIsCaught() {
  const dir = makeSandbox();
  try {
    const victim = path.join(dir, "gaia.cjs");
    fs.writeFileSync(victim, fs.readFileSync(victim, "utf8") + "\n// edited AND its pin entry removed\n");
    const gp = path.join(dir, "goldens.json");
    const golden = JSON.parse(fs.readFileSync(gp, "utf8"));
    delete golden["gaia.cjs"];
    fs.writeFileSync(gp, JSON.stringify(golden, null, 2) + "\n");
    const { goldenViolations, byFile } = lintSandbox(dir);
    const forVictim = goldenViolations.filter((v) => v.signal_id === "gaia.cjs");
    if (!forVictim.length) bad("dropped-pin-entry-is-caught", `removing gaia.cjs's entry made an edited file read "${byFile["gaia.cjs"]}" with no violation for it — a pin can be erased one line at a time. THE PRE-REGISTERED FALSIFIER FIRED.`);
    else ok("dropped-pin-entry-is-caught", `dropping a single file's pin entry raises a GOLDEN violation for that file`);
  } finally { cleanup(dir); }
}

(function main() {
  checkRealTreePinned();
  checkNoFalseAlarm();
  checkEditIsCaught();
  checkDeletedManifestIsCaught();
  checkDroppedEntryIsCaught();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(38)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nGOLDEN-PIN GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(Pins bind BYTES, not behaviour: a matching pin says the file is what was committed, never that it is correct.)\n");
  process.exit(fails ? 1 : 0);
})();
