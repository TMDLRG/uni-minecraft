// verify_deploy_lag_tripwire.cjs — THE IN-PLACE-EDIT TRIPWIRE (Phase 9, step 1.6).
//
// drift.deploy_ref_behind_head.<build> carries relation `lag` (ADR-0002 Amendment 1, Decision 6). Its
// pre-registered falsifier is exact and is the whole reason this file exists:
//
//     "a tolerance that swallows the in-place-edit case"
//
// So the signal contains NO TOLERANCE. It rests on a structural fact instead: evidence/gates.ndjson is
// APPEND-ONLY, therefore a deployment honestly N rows behind must be a BYTE-EXACT PREFIX of canonical.
// Clean lag => the prefix digest matches. Any edit to a row the replica already holds => it cannot match,
// no matter how far behind the replica is. This gate proves exactly that, by mutation (M1).
//
// It is deliberately the harshest case: the mutation edits ONE BYTE deep inside the retained prefix while
// leaving the row COUNT identical — the precise shape a tolerance keyed on "how far behind" would wave
// through, and the one thing this family exists to catch.
//
// Fixtures only; the real ledger is never touched (S4 forbids any write to evidence/gates.ndjson).
// Usage: node viewer/gaia/verify_deploy_lag_tripwire.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const crypto = require("crypto");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const sha = (s) => crypto.createHash("sha256").update(Buffer.from(s, "binary")).digest("hex");

// THE SHIPPED RULE, NOT A COPY OF IT — corrected 2026-07-28.
//
// This file used to carry its own `NORMS` table and its own `verdict()` under the comment "the rule
// under test, rebuilt here exactly as the collector applies it", and then tested only that rebuild.
// It required no module and opened no file. Its check names assert runtime properties of Gaia, so
// THE WHOLE PREFIX COMPARISON COULD HAVE BEEN DELETED FROM collectors.cjs WITH EVERY CHECK BELOW
// STILL GREEN. The normalization table existed twice and could drift on either side unnoticed.
const COL = require("./collectors.cjs");
const NORMS = COL._rule.PREFIX_NORMS;
const verdict = COL._rule.prefixVerdict;

const CANON = Array.from({ length: 20 }, (_, i) => `{"name":"gate-${i}","verdict":"PASS"}\n`);

// ---- 1. a clean lag reads CLEAN, and the lag is reported ------------------------------------------------
function checkCleanLag() {
  const rows = 12;
  const d = sha(CANON.slice(0, rows).join(""));
  const v = verdict(CANON, rows, d);
  if (!v.clean) bad("clean-lag-reads-clean", "a deployment that is a byte-exact prefix was NOT recognised as a clean lag — the signal would cry wolf on every healthy deployment");
  else if (v.lag !== 8) bad("clean-lag-reads-clean", `lag miscounted: ${v.lag}, expected 8`);
  else ok("clean-lag-reads-clean", `a byte-exact prefix ${rows}/${CANON.length} reads CLEAN with lag=8 reported (negative control: no false alarm)`);
}

// ---- 2. THE FALSIFIER: an in-place edit inside the retained prefix must NOT be swallowed ----------------
function checkInPlaceEditCaught() {
  const rows = 12;
  const edited = CANON.slice();
  edited[3] = `{"name":"gate-3","verdict":"FAIL"}\n`; // one row, flipped verdict — same row COUNT
  const replicaDigest = sha(edited.slice(0, rows).join(""));
  const v = verdict(CANON, rows, replicaDigest);
  if (v.clean) bad("in-place-edit-is-not-swallowed", "AN IN-PLACE EDIT WAS SWALLOWED — a replica whose retained rows differ from canonical still read as a clean lag. THE PRE-REGISTERED FALSIFIER FIRED.");
  else ok("in-place-edit-is-not-swallowed", "a single edited row inside the retained prefix (row count unchanged) breaks the prefix match — reported, not absorbed into 'it is just behind'");
}

// ---- 3. one flipped BYTE, at maximum lag — the hardest case for a tolerance ------------------------------
function checkOneByteAtDeepLag() {
  const rows = 2; // 18 rows behind: a tolerance keyed on lag size would be most permissive here
  const edited = CANON.slice();
  edited[0] = edited[0].replace("PASS", "PASSx");
  const v = verdict(CANON, rows, sha(edited.slice(0, rows).join("")));
  if (v.clean) bad("one-byte-at-deep-lag-is-caught", "a one-byte edit was swallowed at lag=18 — the tripwire weakens as the lag grows, which is exactly the tolerance the falsifier names");
  else ok("one-byte-at-deep-lag-is-caught", "a one-byte edit is caught at lag=18 — detection does NOT weaken as the deployment falls further behind");
}

// ---- 4. truncation is not mistaken for lag when content diverges -----------------------------------------
function checkDivergentLineageCaught() {
  const other = CANON.map((l) => l.replace("gate-", "other-"));
  const v = verdict(CANON, 10, sha(other.slice(0, 10).join("")));
  if (v.clean) bad("divergent-lineage-is-caught", "a deployment from a different ledger lineage read as a clean lag");
  else ok("divergent-lineage-is-caught", "a deployment whose rows come from a different lineage does not read as a clean lag");
}

// ---- 5. the rule is normalization-selective, never normalization-blind ----------------------------------
// It tries candidate normalizations so a CRLF deployment of identical content matches; but a candidate must
// match BYTE-EXACTLY. Selecting a like-for-like comparison is not widening it.
function checkNormalizationIsExact() {
  const rows = 10;
  const crlf = CANON.slice(0, rows).join("").replace(/\n/g, "\r\n");
  const same = verdict(CANON, rows, sha(crlf));
  const editedCrlf = CANON.slice(0, rows).join("").replace("gate-2", "gate-X").replace(/\n/g, "\r\n");
  const diff = verdict(CANON, rows, sha(editedCrlf));
  if (!same.clean || same.normalization !== "all-crlf") bad("normalization-is-exact", `identical content under CRLF was not matched (normalization=${same.normalization})`);
  else if (diff.clean) bad("normalization-is-exact", "an EDITED CRLF deployment still matched — normalization tolerance is swallowing content changes");
  else ok("normalization-is-exact", "identical content under CRLF matches (reported as all-crlf); edited content under CRLF does NOT — the candidate must match byte-exactly");
}

// ---- THE MUTATION THAT WOULD HAVE CAUGHT THIS GATE BEING A COPY -----------------------------------
//
// Defang the SHIPPED comparison — declare every replica a clean prefix — and require the tripwire to
// stop firing. Before 2026-07-28 this file tested a rebuild of the rule, so the real one could have
// been deleted without a single check moving. This is the probe that tells "the rule holds" apart
// from "a rule I typed here holds".
function checkTheComparisonIsLoadBearing() {
  const path = require("path");
  const { compileMutated } = require("./mutate.cjs");

  let mutant;
  try {
    // `compileMutated` THROWS when a pattern matches nothing — a mutation that quietly matched no
    // text becomes "this string is absent", which passes forever while proving nothing.
    mutant = compileMutated(path.join(__dirname, "collectors.cjs"), [[
      /if \(!matched && digests\[k\] === String\(replicaDigest \|\| ""\)\) matched = k;/,
      'if (!matched) matched = k;',
    ]], "always-clean");
  } catch (e) {
    bad("the comparison is load-bearing", e.message);
    return;
  }

  const mutated = mutant.exports._rule.prefixVerdict;
  // A genuinely divergent replica: right length, wrong bytes.
  const forged = CANON.slice(0, 12).map((l) => l.replace("PASS", "FAIL"));
  const forgedDigest = sha(forged.join(""));

  const realSays = verdict(CANON, 12, forgedDigest);
  const mutantSays = mutated(CANON, 12, forgedDigest);

  if (mutantSays.clean !== true) {
    bad("the comparison is load-bearing",
      "the defanged module still refused a forged replica — the mutation did not take, so this proves nothing");
  } else if (realSays.clean !== false) {
    bad("the comparison is load-bearing",
      "THE REAL RULE ACCEPTED A FORGED REPLICA — a ledger with the same row count and different bytes " +
      "read as a clean lag. That is the tripwire's whole falsifier.");
  } else {
    ok("the comparison is load-bearing",
      `with the digest test removed from the REAL collectors.cjs (compiled in place, ` +
      `${mutant.sha256.slice(0, 12)}), a replica whose rows say FAIL where canonical says PASS reads ` +
      `CLEAN; with the shipped code it is caught. The checks above therefore test the rule that ` +
      `SHIPS — which this file did not do until 2026-07-28, when it required no module at all.`);
  }
}

(function main() {
  checkCleanLag();
  checkInPlaceEditCaught();
  checkOneByteAtDeepLag();
  checkDivergentLineageCaught();
  checkNormalizationIsExact();
  checkTheComparisonIsLoadBearing();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(32)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nDEPLOY-LAG TRIPWIRE GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(A clean prefix proves the retained rows are byte-identical; it says nothing about the rows not yet received, and attributes nothing to anyone.)\n");
  process.exit(fails ? 1 : 0);
})();
