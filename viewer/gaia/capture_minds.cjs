// capture_minds.cjs — agent-driven UNI mind capture into the litigation-hold store (evidence_hold.cjs).
// ASCII only. Read-only on the colony: an agent runs `ssh uni@<host> podman exec uni-colony tar cf -
// -C /app/runs colony` (reads the brain dir), extracts it locally, and hands the .bin files here. This
// WORM-stores every mind with chain-of-custody. Gaia never mutates the colony.
//
//   node viewer/gaia/capture_minds.cjs <dir-of-bin-files> <source-command>
//
// <dir> is a local directory holding the extracted UNI-*.bin brain files; <source-command> is the exact
// re-runnable command that produced them (recorded verbatim as custody provenance).
"use strict";

const fs = require("fs");
const path = require("path");
const hold = require("./evidence_hold.cjs");

// ingestDir(dir, source) — WORM-store every UNI-*.bin brain file in `dir` into the litigation-hold store,
// stamping each custody row with the verbatim `source` command. Returns the capture manifest. Reusable by
// the CLI and by capture_minds_run.cjs (the ssh->tar->ingest runner).
function ingestDir(dir, source, tier) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".bin"));
  if (!files.length) throw new Error(`no .bin brain files in ${dir}`);
  const minds = files.map((f) => {
    const abs = path.join(dir, f);
    const st = fs.statSync(abs);
    return { kin: f.replace(/\.bin$/, ""), buf: fs.readFileSync(abs), mtime: st.mtime.toISOString() };
  });
  return hold.captureSet({ minds, source, tier: tier || "anchor" });
}

if (require.main === module) {
  const [dir, source] = process.argv.slice(2);
  if (!dir || !source) {
    process.stderr.write("usage: node capture_minds.cjs <dir-of-bin-files> <source-command>\n");
    process.exit(2);
  }
  try {
    const man = ingestDir(dir, source);
    process.stdout.write(`LITIGATION-HOLD capture ${man.capture_id}: ${man.count} minds preserved (distinct states ${man.distinct_states})\n`);
    for (const r of man.rows) {
      process.stdout.write(`  ${r.kin.padEnd(12)} sha ${r.sha256.slice(0, 12)}  ${String(r.byte_len).padStart(7)}B  mtime ${r.mtime}  -> ${r.path}\n`);
    }
    process.exit(0);
  } catch (e) {
    process.stderr.write(`capture_minds: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { ingestDir };
