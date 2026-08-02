#!/usr/bin/env node
// generate_state_blocks.cjs — fill every declared state block in every declared document from a
// live measurement. (Phase 9. Mirrors generate_limitations.cjs.)
//
//   node viewer/generate_state_blocks.cjs            write
//   node viewer/generate_state_blocks.cjs --check    report drift, write nothing, exit 1 on drift
//   node viewer/generate_state_blocks.cjs --print    print every block to stdout, touch nothing
//
// A document that carries no marker for a block it is declared to carry is reported LOUDLY and is
// NOT silently fixed — inserting a block into prose is an editorial act and belongs to a human.
// What this tool does is keep an EXISTING block true.
//
// EOL: blocks are written with LF. A CRLF checkout would otherwise make the byte-comparison fail
// everywhere except the machine that wrote it, and that lesson has already been paid for twice in
// this repository — once in generate_limitations.cjs and once when a gate reported FAIL 7/8 from a
// clean checkout of its own commit.
"use strict";

const fs = require("fs");
const S = require("./state_blocks.cjs");

const CHECK = process.argv.includes("--check");
const PRINT = process.argv.includes("--print");

const m = S.measure();

if (PRINT) {
  for (const id of Object.keys(S.BLOCKS)) {
    console.log(S.render(id, m));
    console.log("");
  }
  process.exit(0);
}

let wrote = 0, same = 0, drifted = 0, missing = 0, unreachable = 0;
const report = [];

for (const d of S.DOCS) {
  const p = S.docPath(d);
  if (!S.docReachable(d)) {
    unreachable++;
    report.push(`  NOT CHECKED  ${d.root}:${d.rel} — root not present on this machine`);
    continue;
  }

  // Read as text, normalise CRLF to LF for comparison, and write back LF. The file's own EOL style
  // is not preserved on purpose: a generated block must be byte-identical across checkouts.
  const before = fs.readFileSync(p, "utf8");
  let text = before.replace(/\r\n/g, "\n");
  let changedThisDoc = false;

  for (const id of d.blocks) {
    const found = S.findBlock(text, id);
    if (!found) {
      missing++;
      report.push(`  NO MARKER    ${d.root}:${d.rel} — declared to carry ${id}, carries no marker`);
      continue;
    }
    const fresh = S.render(id, m, found.prefix);
    if (fresh === found.current) { same++; continue; }

    drifted++;
    report.push(`  DRIFTED      ${d.root}:${d.rel} — ${id}`);
    if (!CHECK) {
      const lines = text.split("\n");
      lines.splice(found.start, found.end - found.start + 1, ...fresh.split("\n"));
      text = lines.join("\n");
      changedThisDoc = true;
    }
  }

  if (!CHECK && changedThisDoc) { fs.writeFileSync(p, text, "utf8"); wrote++; }
}

console.log(report.length ? report.join("\n") : "  (no drift, no missing markers)");
console.log("");
console.log(
  `state blocks: ${same} already true · ${drifted} drifted · ${missing} missing a marker · ` +
  `${unreachable} unreachable root(s)` + (CHECK ? " · CHECK ONLY, nothing written" : ` · ${wrote} document(s) written`)
);

// --check is for a gate: drift or a missing marker is a failure. A missing marker especially —
// a document declared to carry the next act and carrying no block for it is exactly the state the
// five stale documents were in on 2026-07-29.
if (CHECK && (drifted > 0 || missing > 0)) process.exit(1);
process.exit(0);
