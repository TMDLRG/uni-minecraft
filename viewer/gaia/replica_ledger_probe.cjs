// replica_ledger_probe.cjs — agent-driven capture of the gate ledger's identity on every replica.
//
// WHY THIS EXISTS: the chip carries its own copies of evidence/gates.ndjson. On 2026-07-25 an audit
// found build_9e6cee1 four rows behind canonical (missing a FAIL row), build_producer_08fa60d in an
// older schema, and build_producer 142 rows behind. NOTHING detected that. An agent read a replica,
// believed it was canonical, and reported "191 rows, no FAIL" when canonical was 195 with one FAIL.
// This probe makes that class of mistake visible instead of silent.
//
// GAIA LAW HOLDS. Gaia is not an ssh client and must never become one (docs/GAIA.md §13). So an AGENT
// runs the reach and hands the result here verbatim; Gaia mirrors the capture and never fabricates it.
// What is captured is the source's OWN bytes: `sha256sum` output and `wc -l` output. Nothing is scored,
// ranked or summarized. The comparison Gaia later performs is a mechanical byte-equal of two hex
// digests — like-for-like, which is exactly what the five slice-1 drifts are NOT (see PHASE-1-RESULTS).
//
// NO IP LITERALS: hosts come from viewer/infra_registry.json, per the standing rule.
//
//   node viewer/gaia/replica_ledger_probe.cjs            # capture every configured replica
//
// Writes viewer/gaia/replica_ledgers.json (committed — a capture record with per-replica timestamps)
// and one Gaia snapshot per replica via ingest_mcp.cjs. Both carry the exact re-runnable command.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { ingest } = require("./ingest_mcp.cjs");

const REPO = path.resolve(__dirname, "..", "..");
const OUT = path.join(__dirname, "replica_ledgers.json");
const LEDGER_REL = "evidence/gates.ndjson";

// Replicas to probe. Host is a NAME resolved from the registry — never an IP literal here.
const REPLICAS = [
  { name: "chip:build_9e6cee1", host: "colony", user: "uni", dir: "/home/uni/build_9e6cee1" },
  { name: "chip:build_producer_08fa60d", host: "colony", user: "uni", dir: "/home/uni/build_producer_08fa60d" },
  { name: "chip:build_producer", host: "colony", user: "uni", dir: "/home/uni/build_producer" },
];

function registryHost(name) {
  try {
    const reg = JSON.parse(fs.readFileSync(path.join(REPO, "viewer", "infra_registry.json"), "utf8"));
    const zone = reg.zone || "uni-lab.local";
    const s = (reg.services || reg.hosts || []).find((x) => x.name === name);
    return s && s.fqdn ? s.fqdn : `${name}.${zone}`;
  } catch { return null; }
}

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function capture(r) {
  const host = registryHost(r.host);
  if (!host) return { ...r, ok: false, error: "HOST_NOT_IN_REGISTRY" };
  // The source's own bytes: sha256sum + wc -l, run on the replica. Verbatim, not re-derived here.
  const cmd = `sha256sum ${r.dir}/${LEDGER_REL}; wc -l < ${r.dir}/${LEDGER_REL}`;
  const key = process.env.UNI_LAB_SSH_KEY || path.join(process.env.USERPROFILE || process.env.HOME || "", ".ssh", "uni-lab_ed25519");
  const argv = [];
  if (fs.existsSync(key)) argv.push("-i", key);
  argv.push("-o", "BatchMode=yes", "-o", "ConnectTimeout=8", `${r.user}@${host}`, cmd);
  let out;
  try { out = execFileSync("ssh", argv, { encoding: "utf8", timeout: 20000 }); }
  catch (e) { return { ...r, ok: false, error: "UNREACHABLE_OR_ABSENT", detail: String(e.message || e).slice(0, 160), source: `ssh ${r.user}@${host} '${cmd}'` }; }

  const lines = out.trim().split("\n");
  const digest = (lines[0] || "").trim().split(/\s+/)[0] || "";
  const rows = Number((lines[1] || "").trim());
  const rec = {
    ...r, ok: true, host,
    sha256: digest,
    rows: Number.isFinite(rows) ? rows : null,
    captured_at: new Date().toISOString(),
    source: `ssh ${r.user}@${host} '${cmd}'`,
    raw: out,
  };
  // Mirror the verbatim capture into Gaia's snapshot store, per the sanctioned agent-ingest path.
  try {
    const ref = ingest({ seat: "drift", id: `replica.ledger.${r.name}`, source: rec.source, reverify: rec.source, result: out });
    rec.snapshot = ref && ref.path ? path.basename(ref.path) : null;
  } catch (e) { rec.snapshot_error = String(e.message || e).slice(0, 120); }
  return rec;
}

function main() {
  const canonPath = path.join(REPO, LEDGER_REL);
  const canonBuf = fs.readFileSync(canonPath);
  const canonical = {
    path: LEDGER_REL,
    sha256: sha256(canonBuf),
    rows: canonBuf.toString("utf8").split("\n").filter((l) => l.trim()).length,
    read_at: new Date().toISOString(),
    source: `sha256sum ${LEDGER_REL} (on the canonical repo)`,
  };
  const replicas = REPLICAS.map(capture);
  const doc = {
    schema_version: 1,
    note: "Capture record only. Gaia compares canonical.sha256 (read LIVE) against each replica.sha256 (a CAPTURE, with its own timestamp). A stale capture is labelled, never treated as current. Gaia is not an ssh client; an agent runs this and Gaia mirrors it.",
    canonical,
    replicas: replicas.map(({ raw, ...keep }) => keep),
  };
  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n", "utf8");

  process.stdout.write(`canonical  ${canonical.sha256.slice(0, 16)}  ${canonical.rows} rows\n`);
  for (const r of replicas) {
    if (!r.ok) { process.stdout.write(`  ${r.name.padEnd(30)} ${r.error}\n`); continue; }
    const same = r.sha256 === canonical.sha256;
    process.stdout.write(`  ${r.name.padEnd(30)} ${r.sha256.slice(0, 16)}  ${String(r.rows).padStart(4)} rows  ${same ? "IDENTICAL" : "DIFFERS"}\n`);
  }
  process.stdout.write(`\nwrote ${path.relative(REPO, OUT)}\n`);
}

if (require.main === module) main();
module.exports = { capture, REPLICAS };
