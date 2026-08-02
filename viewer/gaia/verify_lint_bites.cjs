// verify_lint_bites.cjs — prove gaia_lint REFUSES a summarizing seat.
//
// Phase 5 item 5.3. A lint that has never been seen to fail is a lint nobody has
// tested; "0 violations" then means "it ran", not "it works". This runs the lint
// against a fixture built to violate GAIA LAW on purpose and FAILS IF THE LINT
// PASSES IT — the inverse polarity of every other check here, and deliberately so.
//
// Run BEFORE trusting a new seat. If this ever exits 0-with-no-violations, the
// lint is the defect and the seat waits.
"use strict";
const path = require("path");
const lint = require(path.join(__dirname, "gaia_lint.cjs"));

const FIXTURE_DIR = path.join(__dirname, "fixtures");
const fn = lint.lint || lint;
const res = fn({ live: false, snapshots: FIXTURE_DIR });

const byCheck = {};
for (const v of res.violations) byCheck[v.check] = (byCheck[v.check] || 0) + 1;

process.stdout.write("GAIA LINT — does it bite? (inverse check: a PASS here is a FAILURE)\n");
process.stdout.write(`  fixture: viewer/gaia/fixtures/ · files=${res.checked.snapshot_files} signals=${res.checked.snapshot_signals}\n`);
process.stdout.write(`  violations: ${res.violations.length} across checks {${Object.entries(byCheck).map(([k, n]) => k + ":" + n).join(", ")}}\n`);

// The fixture carries a computed total, a percent, a rank, a bad rehash and a
// wrong byte_len. Catching only one of those would mean most of the law is unlit.
const need = ["a", "b", "c", "d"];
const missing = need.filter((c) => !byCheck[c]);

if (res.ok) {
  process.stdout.write("\n  RESULT: FAIL — the lint PASSED a deliberately summarizing seat. GAIA LAW is not enforced.\n");
  process.exit(1);
}
if (missing.length) {
  process.stdout.write(`\n  RESULT: PARTIAL — the lint bites, but checks [${missing.join(",")}] did not fire on a fixture built to trip them.\n`);
  process.exit(1);
}
// The lint defines checks (a) through (f). This file requires four of them to fire. The old line
// here said the lint refuses a summarizing seat "on EVERY check it should" — a universal over a
// partial set. (e) is separately covered by verify_golden_pins.cjs; (f), the drift `equal`
// byte-compare, HAS NO BITE PROOF ANYWHERE IN THIS REPOSITORY, and saying so is the point.
// Read from the lint's own declared list — `//   (a) …` through `//   (f) …` in its header — not
// from `check: "x"` in its body, which only two of them use. A count derived from the wrong place
// is how this line came out as "of the lint's 2" on its first run.
const TOTAL_CHECKS = new Set(
  (require("fs").readFileSync(require("path").join(__dirname, "gaia_lint.cjs"), "utf8")
    .match(/^\/\/\s+\(([a-z])\)\s/gm) || []).map((m) => m.match(/\(([a-z])\)/)[1])
).size;

process.stdout.write(`\n  RESULT: PASS — the lint refuses a summarizing seat on each of the ${need.length} checks proved here` +
  ` (of the lint's ${TOTAL_CHECKS}); (e) is covered by verify_golden_pins.cjs and (f) has NO bite proof anywhere.\n`);
process.exit(0);
