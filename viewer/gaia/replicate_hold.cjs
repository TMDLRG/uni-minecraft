// replicate_hold.cjs — off-box replication of the litigation-hold STREAM tier to a durable second box.
//
// Why: the anchor tier + both custody chains that matter most are already git-distributed. The high-cadence
// STREAM bytes are gitignored local WORM on THINKER — a THINKER disk loss would waste them. This replicates
// them (content-addressed, incremental) to a second failure domain so not a drop is lost to one disk.
//
// HONEST on independence: the DEFAULT target is the colony host (the only box THINKER can ssh-WRITE to
// unattended; node2 is chronically unreachable and MCP writes are approval-gated so a cadence cannot use
// them). That is a SECOND copy, NOT a fully independent custodian (it is the source host). A truly
// independent target (node2 / an immutable object store) is the further hardening — pass it as the target
// when available. Read-only on the colony; writes only to the replica target + a local .replicated marker.
//
// Verifies: after pushing, it sha256sums the pushed .bin on the REMOTE and compares to the custody sha256 —
// a file is marked replicated ONLY when its off-box copy rehashes. Replication cannot silently lie.
//
//   node viewer/gaia/replicate_hold.cjs [uni@<host>]     # replicate new stream bytes; prints a summary
//   const { replicate } = require("./replicate_hold.cjs");  await? no — sync; replicate() -> summary
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const HOLD = path.join(REPO, "evidence", "colony_minds");
const STREAM_CUSTODY = path.join(HOLD, "stream_custody.ndjson");
const MARKER = path.join(HOLD, ".replicated.ndjson"); // gitignored — which paths are verified off-box
const LOG = path.join(REPO, "logs", "replicate_hold.log");
const REMOTE_DIR = "gaia-evidence-replica"; // under the remote user's home

function log(m) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); } catch (_) {}
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${m}\n`); } catch (_) {}
}
function colonyHost() {
  try { const r = require(path.join(REPO, "viewer", "infra_registry.json")); const s = (r.services || []).find((x) => x.name === "colony") || {}; return (s.probe && s.probe.host) || ""; } catch (_) { return ""; }
}
function readNdjson(f) { try { return fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch (_) { return []; } }
function ssh(target, cmd, opts) { return spawnSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6", target, cmd], Object.assign({ maxBuffer: 1 << 30 }, opts || {})); }

// replicate(target?) -> { new: N, pushed: N, verified: N, failed: [...] }
function replicate(target) {
  const chip = colonyHost();
  target = target || (chip ? `uni@${chip}` : "");
  if (!target) { log("no replication target"); throw new Error("no replication target (registry colony host empty)"); }

  const rows = readNdjson(STREAM_CUSTODY);
  const done = new Set(readNdjson(MARKER).map((r) => r.path));
  // new distinct stream files present locally and not yet verified off-box
  const seen = new Set();
  const todo = [];
  for (const r of rows) {
    if (!r.path || done.has(r.path) || seen.has(r.path)) continue;
    if (!fs.existsSync(path.join(REPO, r.path))) continue;
    seen.add(r.path); todo.push(r);
  }
  if (!todo.length) { return { new: 0, pushed: 0, verified: 0, failed: [] }; }

  // tar the new byte files (repo-relative) + the stream custody ledger; pipe into remote `tar -x`.
  const files = todo.map((r) => r.path).concat(["evidence/colony_minds/stream_custody.ndjson"]);
  ssh(target, `mkdir -p ${REMOTE_DIR}`, { stdio: "ignore" });
  const tar = spawnSync("tar", ["-cf", "-", "-C", REPO, ...files], { maxBuffer: 1 << 30 });
  if (tar.status !== 0) { log("local tar failed: " + String(tar.stderr || "").slice(0, 160)); throw new Error("local tar failed"); }
  const push = ssh(target, `tar -xf - -C ${REMOTE_DIR}`, { input: tar.stdout });
  if (push.status !== 0) { log("remote extract failed: " + String(push.stderr || "").slice(0, 160)); throw new Error("remote extract failed"); }

  // verify each pushed .bin rehashes on the REMOTE, then mark it replicated.
  const remotePaths = todo.map((r) => `${REMOTE_DIR}/${r.path}`);
  const sums = ssh(target, `sha256sum ${remotePaths.map((p) => `'${p}'`).join(" ")}`);
  const remoteSha = {};
  for (const line of String(sums.stdout || "").split("\n")) {
    const m = line.match(/^([0-9a-f]{64})\s+(.+)$/);
    if (m) remoteSha[m[2].replace(`${REMOTE_DIR}/`, "")] = m[1];
  }
  const failed = [];
  let verified = 0;
  const markerRows = [];
  for (const r of todo) {
    if (remoteSha[r.path] === r.sha256) { verified++; markerRows.push({ path: r.path, sha256: r.sha256, target, at: new Date().toISOString() }); }
    else failed.push(r.path);
  }
  if (markerRows.length) { try { fs.appendFileSync(MARKER, markerRows.map((x) => JSON.stringify(x)).join("\n") + "\n"); } catch (_) {} }
  log(`replicate -> ${target}: ${todo.length} new, ${verified} verified off-box, ${failed.length} failed`);
  return { new: todo.length, pushed: todo.length, verified, failed };
}

if (require.main === module) {
  try {
    const r = replicate(process.argv[2]);
    process.stdout.write(`replicated: ${r.verified}/${r.new} new stream files verified off-box${r.failed.length ? " (FAILED: " + r.failed.length + ")" : ""}\n`);
    process.exit(r.failed.length ? 1 : 0);
  } catch (e) { process.stderr.write(`replicate_hold: ${e.message}\n`); process.exit(1); }
}

module.exports = { replicate };
