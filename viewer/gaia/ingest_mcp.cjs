// ingest_mcp.cjs — agent-driven ingest for the seats a headless collector cannot reach.
//
// GAIA LAW holds: this persists a source's OWN output VERBATIM (an ssh `podman ps`, an MCP read) as a
// content-addressed Gaia snapshot + one projected Signal, with provenance = the exact re-runnable command
// and the capture time. It summarizes / scores / narrates NOTHING; value.raw is the source bytes verbatim
// (truncation-labeled when the source truncated). The colony (rootless, ssh uni@<host>) and fleet (uni-lab
// MCP) seats read `up:null` from gaia.cjs because a headless Node server is not an ssh/MCP client — an AGENT
// that IS one runs the read and hands the result here. Gaia then mirrors the capture; it never fabricates it.
//
// WRITE-FENCE: writes ONLY via snapshot.cjs (under viewer/gaia/snapshots/**). Reads only a caller-supplied
// result (string or object) or a JSON file named on the CLI. No IP literal — the caller derives the host
// from viewer/infra_registry.json and passes the command in as `source`/`reverify`.
//
//   const { ingest } = require("./ingest_mcp.cjs");
//   ingest({ seat:"colony", id:"colony.containers", source:"ssh uni@<host> podman ps --format json",
//            reverify:"ssh uni@<host> 'podman ps --format json'", result:<obj-or-string>, truncated:null });
//
//   node viewer/gaia/ingest_mcp.cjs <seat> <id> <sourceCmd> <resultJsonFile> [reverifyCmd]
//     -> reads the captured result from <resultJsonFile> and writes the snapshot. Prints the ref.
//
// Exports: { ingest }.
"use strict";

const fs = require("fs");
const sig = require("./sig.cjs");
const snapshot = require("./snapshot.cjs");

// ingest(opts) -> snapshot ref { path, sha256, captured_at, seat, id_or_path, ... }
//   seat      a valid Gaia seat (e.g. "colony").
//   id        stable signal id / index locator (e.g. "colony.containers").
//   source    the re-runnable command that produced `result` (becomes provenance.locator).
//   reverify  command to re-capture (defaults to source).
//   result    the captured output: a string (kept verbatim) or an object (canonicalRaw-serialized).
//   kind      Signal kind (default "mcp" — a non-probe agent capture; no live block).
//   truncated if the SOURCE truncated, a short "of" description -> provenance.truncated {of, complete:false}.
//   captured_at / git_commit  optional overrides.
function ingest(opts) {
  if (!opts || typeof opts !== "object") throw new TypeError("ingest: opts object required");
  const { seat, id, source } = opts;
  if (!seat || !id || !source) throw new Error("ingest: seat, id, and source are required");

  const raw = typeof opts.result === "string" ? opts.result : sig.canonicalRaw(opts.result);
  const provenance = {
    locator: String(source),
    reverify: String(opts.reverify || source),
    captured_at: opts.captured_at || new Date().toISOString(),
    instrument: "ingest_mcp.cjs@1",
  };
  if (opts.truncated) provenance.truncated = { of: String(opts.truncated), complete: false };

  const s = sig.signal({
    id: String(id),
    seat: String(seat),
    kind: opts.kind || "mcp",
    value: { raw, encoding: "utf8" },
    provenance,
  });
  const env = sig.envelope([s], {
    server: "uni-gaia-ingest",
    instrument_version: "ingest_mcp.cjs@1",
    git_commit: opts.git_commit == null ? null : String(opts.git_commit),
  });
  // Volatile: agent captures live under snapshots/live/<seat>/** (gitignored, last-N retained); the
  // committed index.ndjson row keeps the provenance forever even after the raw bytes are pruned.
  return snapshot.writeSnapshot(env, { seat, id, volatile: true });
}

// ---- CLI ----
if (require.main === module) {
  const [seat, id, source, resultFile, reverify] = process.argv.slice(2);
  if (!seat || !id || !source || !resultFile) {
    process.stderr.write("usage: node ingest_mcp.cjs <seat> <id> <sourceCmd> <resultJsonFile> [reverifyCmd]\n");
    process.exit(2);
  }
  let result;
  try { result = fs.readFileSync(resultFile, "utf8"); }
  catch (e) { process.stderr.write(`ingest_mcp: cannot read ${resultFile}: ${e.message}\n`); process.exit(1); }
  try {
    const ref = ingest({ seat, id, source, reverify, result });
    process.stdout.write(`ingested -> ${ref.path}\n  seat=${ref.seat} id=${ref.id_or_path} sha256=${ref.sha256.slice(0, 12)}... captured_at=${ref.captured_at}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`ingest_mcp: ${e.message}\n`);
    process.exit(1);
  }
}

module.exports = { ingest };
