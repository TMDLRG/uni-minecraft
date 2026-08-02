// generate_limitations.cjs — write docs/control-plane/LIMITATIONS.md from the source. (Step 3.5)
//
//     node viewer/generate_limitations.cjs
//
// Run this after adding, editing or removing an `@limitation` annotation. The `limitations-doc`
// gate regenerates the same bytes and refuses any difference, so forgetting to run it is caught
// rather than shipped.
"use strict";

const fs = require("fs");
const path = require("path");
const { scan, render, DOC } = require("./limitations.cjs");

const scanned = scan();

// A duplicate id or a block missing a required field is a HALT, not a warning. Two different
// limits filed under one name is how one of them disappears; a limitation with no `claim` is a
// worry rather than a statement, and this document is not a place for worries.
let bad = false;
for (const d of scanned.duplicates) {
  console.log("DUPLICATE id %s at %s", d.id, d.at.join(" and "));
  bad = true;
}
for (const m of scanned.missing) {
  const have = Object.keys(m.fields).join(",") || "none";
  console.log("INCOMPLETE %s at %s:%d — needs what/why/claim, has: %s", m.id, m.file, m.line, have);
  bad = true;
}
if (bad) process.exit(1);

fs.mkdirSync(path.dirname(DOC), { recursive: true });
// Explicit LF: this file is regenerated and byte-compared, and a CRLF checkout would make the
// comparison fail everywhere except the machine that wrote it. That lesson was expensive.
fs.writeFileSync(DOC, render(scanned), { encoding: "utf8" });

console.log("wrote %s", path.relative(path.dirname(__dirname), DOC).replace(/\\/g, "/"));
console.log("%d limitations, from: %s", scanned.entries.length, scanned.roots.join(", "));
for (const e of scanned.entries) console.log("  %s  %s:%d", e.id.padEnd(38), e.file, e.line);
