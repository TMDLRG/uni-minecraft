// hud_no_ip_test.cjs -- structural fence: no IPv4 literal in viewer/hud/**
// outside the allowlist {127.0.0.1, 0.0.0.0}.
//
// This is the hud-no-ip-literal gate.

"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ALLOWLIST = new Set(["127.0.0.1", "0.0.0.0"]);
const EXTS = new Set([".cjs", ".html", ".ps1", ".vbs", ".js", ".json", ".md", ".ndjson"]);
const SKIP_DIRS = new Set(["node_modules", "build", "logs", "tests"]);
// tests dir is skipped because tests may reference IPs as test inputs.
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile() && EXTS.has(path.extname(entry.name).toLowerCase())) out.push(p);
  }
  return out;
}

const files = walk(ROOT, []);
let violations = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const ms = line.match(IPV4_RE);
    if (!ms) continue;
    for (const m of ms) {
      if (ALLOWLIST.has(m)) continue;
      violations.push({ file: path.relative(ROOT, f), line: i + 1, ip: m, text: line.trim().slice(0, 120) });
    }
  }
}

console.log("hud_no_ip_test:");
console.log(`  scanned ${files.length} files under viewer/hud/`);
console.log(`  allowlist: {${[...ALLOWLIST].join(", ")}}`);
if (violations.length === 0) {
  console.log(`  1/1 passed, 0 failed`);
  process.exit(0);
}
console.log(`  0/1 passed, 1 failed`);
console.log(`  ${violations.length} IPv4 literal(s) outside allowlist:`);
for (const v of violations.slice(0, 25)) {
  console.log(`    ${v.file}:${v.line} ip=${v.ip}  << ${v.text}`);
}
if (violations.length > 25) console.log(`    ... and ${violations.length - 25} more`);
process.exit(1);
