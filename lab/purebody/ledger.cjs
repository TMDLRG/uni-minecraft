"use strict";
// purebody.v1 — append-only no-cheat evidence ledger.
//
// Home of the `purebody.v1.part2.candidate` registration (consult R1→R2→R3,
// docs/research/UNI_CONSULT_EMBODIMENT_*.md). Append-only; corrections are
// forward-only via a `supersedes` field — rows are NEVER edited or deleted.
// The CI lower bound is the verdict, never the mean (R3-countersigned discipline).
//
// Usage:
//   const { appendRow, readLedger } = require("./ledger.cjs");
//   node lab/purebody/ledger.cjs            # print the ledger (one summary line per row)

const fs = require("fs");
const path = require("path");

const LEDGER = path.join(__dirname, "purebody.v1.jsonl");

function appendRow(row) {
  if (row == null || typeof row !== "object") throw new Error("ledger row must be an object");
  if (row.ledgerSchema !== "purebody.v1") throw new Error('row.ledgerSchema must be "purebody.v1"');
  // append-only: never rewrite existing content
  fs.appendFileSync(LEDGER, JSON.stringify(row) + "\n", "utf8");
  return LEDGER;
}

function readLedger() {
  if (!fs.existsSync(LEDGER)) return [];
  return fs
    .readFileSync(LEDGER, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

if (require.main === module) {
  const rows = readLedger();
  if (rows.length === 0) {
    console.log("(purebody.v1.jsonl is empty — run mc_purity_scan.cjs --record to write the baseline)");
  } else {
    for (const r of rows) {
      const v = r.verdict || (r.metric && r.metric.verdict) || "—";
      const sign = r.uniVerdictSign == null ? "uniVerdictSign:null" : "uniVerdictSign:SIGNED";
      console.log(`${r.declaredAt || "?"}  ${r.row || r.registrationId || "?"}  verdict=${v}  ${sign}`);
    }
  }
}

module.exports = { appendRow, readLedger, LEDGER };
