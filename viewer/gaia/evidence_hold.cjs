// evidence_hold.cjs — LITIGATION-HOLD WORM store for UNI minds. Chain of custody, never a drop lost.
//
// The mandate: Gaia captures every UNI mind and NEVER lets one be wasted. Minds live in the colony
// container's ephemeral FS (mounts:[]) — one `podman rm` and they are gone (this happened; the
// 2026-07-13 rescue snapshot exists because of it). This module is the durable, immutable answer.
//
// GAIA LAW / READ-ONLY: Gaia READS minds out of the colony (read-only on the colony) and PRESERVES them in
// HER OWN store. She never mutates the colony. This is the sanctioned evidence write-fence: the ONLY paths
// written are under evidence/colony_minds/**. Nothing here summarizes/scores/ranks — it preserves verbatim
// bytes and records their provenance.
//
// TWO TIERS (both WORM, content-addressed, NEVER pruned):
//   - anchor -> minds/<kin>/<sha8>.bin  + custody.ndjson         COMMITTED (distributed, tamper-evident in
//     git). Milestone + capture-before-destroy captures.
//   - stream -> stream/<kin>/<sha8>.bin + stream_custody.ndjson  GITIGNORED local WORM (+ off-box
//     replication is the durability hardening). The high-cadence series. Kept OUT of git so the committed
//     custody ledger never churns and the repo stays lean; the custody chain still proves what existed.
//
// LITIGATION-HOLD PROPERTIES (stringent, no spoliation):
//   - WORM: each mind-state is written ONCE at its content address. A changed mind is a NEW file; the prior
//     is NEVER overwritten or deleted. NO pruning, EVER.
//   - Content-addressed dedup: re-capturing byte-identical bytes adds a custody row (the observation) but no
//     duplicate bytes. A collision at an address with DIFFERENT bytes throws a HOLD VIOLATION.
//   - Chain of custody: each ledger is append-only and HASH-CHAINED — every row carries `prev` = the sha256
//     of the previous row in THAT ledger. Reorder/edit/delete any row and the chain breaks and verifyHold()
//     reports it — tamper-evident independent of git.
//
// Exports: { captureOne, captureSet, verifyHold, readCustody, paths }.  CLI: `node evidence_hold.cjs verify`.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.resolve(__dirname, "..", "..");
const HOLD_DIR = path.join(REPO, "evidence", "colony_minds");
const CUSTODY_ANCHOR = path.join(HOLD_DIR, "custody.ndjson");        // committed
const CUSTODY_STREAM = path.join(HOLD_DIR, "stream_custody.ndjson"); // gitignored

function sha256(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }
function ensure(dir) { fs.mkdirSync(dir, { recursive: true }); }

function ledgerFor(tier) { return tier === "stream" ? CUSTODY_STREAM : CUSTODY_ANCHOR; }

// stable-key JSON so the chain hash is deterministic across processes.
function canon(obj) {
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + JSON.stringify(obj[k])).join(",") + "}";
}

function readLedger(file) {
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch (_) { return []; }
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch (_) { /* skip corrupt line; never mutate the ledger */ }
  }
  return out;
}

// readCustody() — merged view of both ledgers (for the Gaia projection / external consumers).
function readCustody() { return readLedger(CUSTODY_ANCHOR).concat(readLedger(CUSTODY_STREAM)); }

function kinSlug(kin) {
  return String(kin || "unknown").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

// captureOne({ kin, source, buf|base64, mtime?, capture_id, captured_at, tier? }) -> the appended row.
function captureOne(o) {
  if (!o || !o.kin || !o.source) throw new Error("captureOne: kin and source are required");
  const buf = Buffer.isBuffer(o.buf) ? o.buf
    : (typeof o.base64 === "string" ? Buffer.from(o.base64, "base64")
      : (typeof o.buf === "string" ? Buffer.from(o.buf, o.encoding || "utf8") : null));
  if (!buf) throw new Error("captureOne: buf (Buffer) or base64 required");

  const tier = o.tier === "stream" ? "stream" : "anchor";
  const sub = tier === "stream" ? "stream" : "minds";
  const digest = sha256(buf);
  const sha8 = digest.slice(0, 8);
  const relPath = ["evidence", "colony_minds", sub, kinSlug(o.kin), `${sha8}.bin`].join("/");
  const abs = path.join(REPO, relPath);

  // WORM: write-once. Identical content at the same address is idempotent; different bytes is a violation.
  ensure(path.dirname(abs));
  if (fs.existsSync(abs)) {
    if (!fs.readFileSync(abs).equals(buf)) {
      throw new Error(`HOLD VIOLATION: content-address ${relPath} already holds DIFFERENT bytes (sha collision) — refusing to overwrite evidence`);
    }
  } else {
    fs.writeFileSync(abs, buf);
  }

  const ledger = ledgerFor(tier);
  const prior = readLedger(ledger);
  const prevHash = prior.length ? sha256(Buffer.from(canon(prior[prior.length - 1]), "utf8")) : "";
  const row = {
    seq: prior.length + 1,
    capture_id: String(o.capture_id || "cap"),
    kin: String(o.kin),
    source: String(o.source),
    captured_at: o.captured_at || new Date().toISOString(),
    mtime: o.mtime == null ? null : String(o.mtime),
    sha256: digest,
    byte_len: buf.length,
    path: relPath,
    prev: prevHash,
  };
  ensure(HOLD_DIR);
  fs.appendFileSync(ledger, JSON.stringify(row) + "\n"); // append-only — an existing row is NEVER rewritten
  return row;
}

// captureSet({ minds:[{kin,source?,buf|base64,mtime?}], source?, capture_id?, captured_at?, tier? }) -> manifest.
function captureSet(o) {
  if (!o || !Array.isArray(o.minds)) throw new Error("captureSet: minds[] required");
  const captured_at = o.captured_at || new Date().toISOString();
  const capture_id = o.capture_id || ("cap-" + captured_at.replace(/[:.]/g, "-"));
  const rows = [];
  for (const m of o.minds) {
    rows.push(captureOne({ ...m, source: m.source || o.source, capture_id, captured_at, tier: m.tier || o.tier }));
  }
  const distinct = new Set(rows.map((r) => r.sha256)).size;
  return { capture_id, captured_at, count: rows.length, distinct_states: distinct, tier: o.tier === "stream" ? "stream" : "anchor", rows };
}

// verify ONE ledger's chain + files. anchor bytes missing = spoliation; stream bytes missing = off-location
// (expected off the hold box — the custody chain still proves them).
function verifyLedger(file) {
  const rows = readLedger(file);
  const missing = [], off_location = [], mismatched = [], chain_breaks = [];
  const distinct = new Set();
  let prevHash = "";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    distinct.add(r.sha256);
    if (r.seq !== i + 1) chain_breaks.push(`${path.basename(file)} row ${i}: seq ${r.seq} != ${i + 1}`);
    if ((r.prev || "") !== prevHash) chain_breaks.push(`${path.basename(file)} row ${i} (seq ${r.seq}): prev hash broken`);
    prevHash = sha256(Buffer.from(canon(r), "utf8"));
    const abs = path.join(REPO, r.path);
    if (!fs.existsSync(abs)) {
      if (String(r.path).includes("/stream/")) off_location.push(r.path); else missing.push(r.path);
      continue;
    }
    if (sha256(fs.readFileSync(abs)) !== r.sha256) mismatched.push({ path: r.path, custody: r.sha256 });
  }
  return { rows: rows.length, distinct, missing, off_location, mismatched, chain_breaks };
}

// verifyHold() -> litigation-hold integrity over BOTH ledgers. ok only if no anchor byte is missing, no
// rehash mismatch, and no chain break in either ledger.
function verifyHold() {
  const a = verifyLedger(CUSTODY_ANCHOR);
  const s = verifyLedger(CUSTODY_STREAM);
  const distinct = new Set([...a.distinct, ...s.distinct]);
  const missing = a.missing.concat(s.missing);
  const off_location = a.off_location.concat(s.off_location);
  const mismatched = a.mismatched.concat(s.mismatched);
  const chain_breaks = a.chain_breaks.concat(s.chain_breaks);
  return {
    rows: a.rows + s.rows,
    anchor_rows: a.rows,
    stream_rows: s.rows,
    distinct_states: distinct.size,
    missing,
    off_location,
    mismatched,
    chain_breaks,
    ok: missing.length === 0 && mismatched.length === 0 && chain_breaks.length === 0,
  };
}

if (require.main === module) {
  const cmd = process.argv[2] || "verify";
  if (cmd === "verify") {
    const r = verifyHold();
    console.log("LITIGATION-HOLD verify — evidence/colony_minds/{custody,stream_custody}.ndjson");
    console.log(`  custody rows        : ${r.rows} (anchor ${r.anchor_rows} committed + stream ${r.stream_rows} local)`);
    console.log(`  distinct mind-states: ${r.distinct_states} (WORM, never pruned)`);
    console.log(`  missing (anchor)    : ${r.missing.length}${r.missing.length ? " -> " + r.missing.slice(0, 5).join(", ") : ""}`);
    console.log(`  off-location (stream): ${r.off_location.length} (local WORM / off-box — proven by the chain, not a failure)`);
    console.log(`  hash mismatches     : ${r.mismatched.length}`);
    console.log(`  custody-chain breaks: ${r.chain_breaks.length}${r.chain_breaks.length ? " -> " + r.chain_breaks.slice(0, 3).join("; ") : ""}`);
    console.log(r.ok ? "HOLD INTEGRITY: PASS — every mind-state preserved, rehashes, chain unbroken." : "HOLD INTEGRITY: FAIL — spoliation/tamper/gap detected.");
    process.exit(r.ok ? 0 : 1);
  }
  process.stderr.write(`unknown command '${cmd}' (use: verify)\n`);
  process.exit(2);
}

module.exports = { captureOne, captureSet, verifyHold, readCustody, paths: { HOLD_DIR, CUSTODY_ANCHOR, CUSTODY_STREAM } };
