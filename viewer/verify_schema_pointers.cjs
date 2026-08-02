#!/usr/bin/env node
"use strict";
/**
 * verify_schema_pointers.cjs — every schema path this platform SERVES or CITES
 * must resolve to a file on disk.
 *
 * WHY THIS EXISTS
 *   /api/discovery serves `_schema: "production/schemas/gate_row.v1.json"` to
 *   consumers. That file has never existed. The real file is gate_row.schema.json,
 *   and it carries "$id": "https://uni-lab/schemas/gate_row.v1.json".
 *
 *   So this is a CONFLATION, not a typo, and the distinction decides the fix. The
 *   schema's versioned IDENTITY really is `gate_row.v1.json`; its PATH is
 *   `production/schemas/gate_row.schema.json`. The served field glued the path
 *   prefix onto the identity and produced a string that is neither. A consumer
 *   resolving the advertised contract pointer gets nothing.
 *
 *   `enumerateSchemas()` in the same file already emits `file` (real path) and
 *   `id` ($id) as two separate fields — so the convention was available and the
 *   hardcoded pointers simply did not follow it.
 *
 *   The repo makes this easy to get wrong: producer_uni_state.v1.json IS genuinely
 *   named that way, so `.v1.json` is a real filename here and a false one there.
 *
 * THE RULE
 *   A string of the form `production/schemas/<name>.json` is a PATH CLAIM. It must
 *   resolve. To reference a schema by identity instead, use its `$id` — which
 *   carries no `production/schemas/` prefix and so is not matched here.
 *
 * WHAT THIS SCAN MUST NOT MATCH (Phase 6: a scan that fires on itself is noise)
 *   - viewer/gaia/collectors.cjs, which probes for `gate_row.v1.json` ON PURPOSE:
 *     its absence IS the drift signal. Repairing that comparison is a separate,
 *     operator-gated change (it alters what the platform measures), so flagging it
 *     here would smuggle that decision in as a typo fix.
 *   - this file, whose whole subject is the bad string.
 *   - a `$id` value, which is a URL and has no repo path prefix.
 *   - A PATH THE LINE ITSELF MARKS AS NOT-YET-BUILT. This is use versus mention,
 *     the distinction claim_guard.py earned in the flagellum, and the first version
 *     of this scanner failed it: SPEC_livepatch_hot_files.md:23 names
 *     `production/schemas/hot_files.json` and says in the same breath "(queued as a
 *     follow-up in the plan)". That is a declaration of INTENT, not a claim that a
 *     file exists — and a scan that cannot tell a plan from a promise punishes the
 *     most honest sentence in the document. That was the fourth time in this
 *     programme a source scan convicted the documentation it was meant to guard.
 *
 *     Exemptions are PRINTED, every one, so a "planned" marker cannot become a
 *     place to hide a real broken pointer.
 */

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const CITATION = /production\/schemas\/[A-Za-z0-9_.-]+\.json/g;

// Stated exclusions. Each needs a reason, or it is just a way to go green.
const EXCLUDED = [
  // REMOVED 2026-07-27 (Phase 9 step 1.5): viewer/gaia/collectors.cjs was excluded because it PROBED for
  // the ghost path on purpose — "its ABSENCE is drift.gate_row_schema_path" — and the note added that
  // repairing that comparison "is operator-gated". That repair has now happened, under the operator-co-signed
  // ADR-0002 Amendment 1 (Decision 5, which MANDATES it) and Phase 9 step 1.5. The comparison no longer
  // probes for a ghost path: it captures the schema paths the docs actually CITE and tests those on disk.
  // So the exclusion's stated reason is no longer true, and this file's own rule is that an exclusion
  // without a live reason "is just a way to go green". collectors.cjs is scanned again, and passes.
  { file: "viewer/verify_schema_pointers.cjs", reason: "this scanner; the bad string is its subject" },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "_build" || e.name === "deps") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(cjs|js|mjs|md|json|ex|exs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// A line that says its own citation is not built yet is stating intent, not
// claiming a file. Narrow on purpose: these are markers about the ARTIFACT, not
// general hedging words, so "the planned rollout uses gate_row.v1.json" is still
// caught — it claims the file, it merely plans the rollout.
const NOT_YET_BUILT = /\((?:[^)]*\b(?:queued|planned|proposed|not yet|to build|follow-up|does not exist|NOT BUILT)\b[^)]*)\)/i;

const excludedPaths = new Set(EXCLUDED.map((e) => path.join(REPO, e.file.replace(/\//g, path.sep))));
const broken = [];
const declaredFuture = [];
let cited = 0;
let scanned = 0;

for (const file of walk(REPO)) {
  if (excludedPaths.has(file)) continue;
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (_) {
    continue;
  }
  if (!text.includes("production/schemas/")) continue;
  scanned++;

  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    // A $id is a URL; it names identity, not a path, and is legitimately .v1.json.
    if (/"\$id"\s*:/.test(line)) return;
    for (const m of line.match(CITATION) || []) {
      cited++;
      if (fs.existsSync(path.join(REPO, m))) continue;
      const where = { file: path.relative(REPO, file).replace(/\\/g, "/"), line: i + 1, cite: m };
      if (NOT_YET_BUILT.test(line)) declaredFuture.push(where);
      else broken.push(where);
    }
  });
}

console.log("SCHEMA POINTER GATE — every cited production/schemas/*.json must resolve");
console.log(`  scanned ${scanned} file(s) containing a citation; ${cited} citation(s) total`);
for (const e of EXCLUDED) console.log(`  EXCLUDED  ${e.file}\n            ${e.reason}`);

// Printed always, pass or fail. An exemption nobody sees is a place to hide.
for (const d of declaredFuture) {
  console.log(`  DECLARED FUTURE  ${d.file}:${d.line}  ${d.cite}\n                   the line marks it not-yet-built; that is intent, not a path claim`);
}

// A ZERO-GUARD, added 2026-07-28. If the walk breaks, `cited` is 0 and this printed
// "PASS — all 0 cited schema paths resolve on disk" and exited 0. A scan that looked at nothing
// is not a scan that found nothing, and the two must never share a verdict. Sibling gates
// (verify_ip_fence, verify_host_tracking, verify_golive_refuses_agents) all carry this guard;
// this one did not.
if (cited === 0) {
  console.log("RESULT: FAIL — 0 schema path claims found anywhere. This gate scans the repository " +
    "for `production/schemas/<name>.json` claims; finding NONE means the walk is broken, not that " +
    "the repository is clean.");
  process.exit(1);
}
if (broken.length === 0) {
  console.log(`\n  RESULT: PASS — all ${cited} cited schema paths resolve on disk.`);
  process.exit(0);
}

console.log(`\n  ${broken.length} citation(s) name a file that does not exist:`);
const byCite = {};
for (const b of broken) (byCite[b.cite] ||= []).push(`${b.file}:${b.line}`);
for (const [cite, where] of Object.entries(byCite)) {
  const real = cite.replace(/\.v1\.json$/, ".schema.json");
  const hint = fs.existsSync(path.join(REPO, real)) ? `  -> did you mean ${real} ?` : "";
  console.log(`\n    ${cite}${hint}`);
  for (const w of where) console.log(`      ${w}`);
}
console.log("\n  RESULT: FAIL — a served contract pointer that does not resolve is a broken promise to a machine.");
process.exit(1);
