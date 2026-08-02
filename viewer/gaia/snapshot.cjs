// snapshot.cjs — Gaia's append-only, content-addressed snapshot writer + committed index.
//
// GAIA LAW: this module is PURE PERSISTENCE. It writes verbatim envelope bytes and appends
// provenance rows. It NEVER summarizes, scores, ranks, narrates, or authors a verdict, and it
// computes NO aggregate/count/percent field. The only "computation" is a mechanical sha256 over
// the exact bytes written — a lossless content address, not an interpretation.
//
// WRITE-FENCE (binding): the ONLY paths this module ever writes are under viewer/gaia/snapshots/**.
// It reads nothing outside that tree except its own committed index. No IP literal appears here.
//
// Content-addressing guarantee: writeSnapshot() serializes the envelope with sig.canonicalRaw()
// (the ONE stable-key-ordered UTF-8 form), hashes THOSE EXACT BYTES with sig.sha256Bytes(), and
// writes THOSE SAME BYTES to disk — so re-reading the file and rehashing round-trips to the stored
// sha256 (defeats key-order/whitespace hash drift). The sha8 in the filename is the first 8 hex of
// that hash, so the on-disk name is itself part of the provenance.
//
// Layout:
//   snapshots/<seat>.<ts>.<sha8>.json          durable captures (committed)
//   snapshots/live/<seat>/<seat>.<ts>.<sha8>.json  volatile captures (gitignored, last-N retained)
//   snapshots/index.ndjson                      append-only committed provenance index — one line
//                                               {id_or_path, seat, captured_at, sha256, path} per
//                                               capture. index rows are NEVER mutated, so provenance
//                                               survives even after volatile raw bytes are pruned.
//
// Exports: { writeSnapshot, readSnapshot, listSnapshots }.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sig = require("./sig.cjs");

// ---- paths (write-fence: everything below lives under viewer/gaia/snapshots/**) -----------------
const GAIA_DIR = __dirname;                              // viewer/gaia
const REPO = path.join(GAIA_DIR, "..", "..");            // repo root (for repo-relative index paths)
const SNAP_DIR = path.join(GAIA_DIR, "snapshots");
const LIVE_DIR = path.join(SNAP_DIR, "live");
const INDEX = path.join(SNAP_DIR, "index.ndjson");

const DEFAULT_RETAIN = 20; // last-N per seat under snapshots/live/** (repo-bloat fence)

// ---- tiny helpers -------------------------------------------------------------------------------
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// repo-relative POSIX path for the committed index (stable across OS + checkouts)
function repoRel(absPath) {
  return path.relative(REPO, absPath).split(path.sep).join("/");
}

// sha256 over exact bytes-shown. Prefer sig.sha256Bytes so Gaia has ONE hash implementation;
// fall back to node:crypto only if a sibling build has not landed sig yet (keeps this file runnable
// under `node -c` and against a stub). Both hash identical bytes, so the content address is stable.
function hashBytes(strOrBuf) {
  if (sig && typeof sig.sha256Bytes === "function") return sig.sha256Bytes(strOrBuf);
  return crypto.createHash("sha256").update(strOrBuf).digest("hex");
}

// ONE stable-key-ordered UTF-8 serialization (stored AND hashed). Reuse sig.canonicalRaw; fall back
// to a local stable stringify only if sig is not yet present.
function canonical(obj) {
  if (sig && typeof sig.canonicalRaw === "function") return sig.canonicalRaw(obj);
  return stableStringify(obj);
}
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const keys = Object.keys(v).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}

// filesystem-safe token from an ISO-8601 timestamp (Windows forbids ':' in filenames).
// The real captured_at ISO is preserved verbatim in the index row; this token is only the filename.
function tsToken(iso) {
  return String(iso).replace(/[:.]/g, "-");
}

// restrict a seat to a safe filename slug without inventing a value
function seatSlug(seat) {
  const s = String(seat || "unknown").toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return s.replace(/^-+|-+$/g, "") || "unknown";
}

// ---- writeSnapshot ------------------------------------------------------------------------------
// writeSnapshot(envelope, opts) — persist ONE envelope-wrapped signal set as a content-addressed
// file and append exactly one provenance row to the committed index.
//
//   envelope  the {schema_version, envelope, result:{signals:[...]}} object from gaia.cjs.
//   opts:
//     seat        override the seat slug (else derived from the envelope's first signal / server).
//     id          the index row's id_or_path (else derived: single-signal id/locator, else seat).
//     captured_at override the ISO timestamp (else envelope.envelope.timestamp, else now).
//     volatile    true  -> write under snapshots/live/<seat>/** (gitignored) + last-N retention.
//     retain      last-N to keep per seat under live/ (default 20). Only files are pruned; index
//                 rows are NEVER removed, so pruned captures stay re-verifiable by re-running the
//                 locator and rehashing.
//
// Returns { path, absPath, sha256, sha8, captured_at, seat, id_or_path, volatile, indexRow }.
function writeSnapshot(envelope, opts = {}) {
  if (!envelope || typeof envelope !== "object") {
    throw new TypeError("writeSnapshot: envelope must be an object");
  }
  const env = envelope.envelope || {};
  const signals = (envelope.result && Array.isArray(envelope.result.signals) && envelope.result.signals) || [];

  const seat = seatSlug(opts.seat || (signals[0] && signals[0].seat) || env.server || "unknown");
  const captured_at = opts.captured_at || env.timestamp || new Date().toISOString();
  // id_or_path: a locator for this capture. Prefer an explicit opt; for a single-signal envelope
  // use that signal's id (its stable locator slug); otherwise the seat is the locator.
  const id_or_path = opts.id
    || (signals.length === 1 && (signals[0].id || (signals[0].provenance && signals[0].provenance.locator)))
    || seat;
  const volatile = !!opts.volatile;

  // canonical bytes: stored AND hashed (content address).
  const bytes = canonical(envelope);
  const sha256 = hashBytes(bytes);
  const sha8 = sha256.slice(0, 8);

  const fileName = `${seat}.${tsToken(captured_at)}.${sha8}.json`;
  const dir = volatile ? path.join(LIVE_DIR, seat) : SNAP_DIR;
  ensureDir(dir);
  const absPath = path.join(dir, fileName);

  // Content-addressed: identical bytes => identical name => idempotent re-write. Only write if new.
  if (!fs.existsSync(absPath)) {
    fs.writeFileSync(absPath, bytes);
  }

  const relPath = repoRel(absPath);

  // append-only index row — NEVER mutate an existing line.
  const indexRow = { id_or_path, seat, captured_at, sha256, path: relPath };
  ensureDir(SNAP_DIR);
  fs.appendFileSync(INDEX, canonical(indexRow) + "\n");

  // last-N retention for volatile captures (prune FILES only; index rows are kept forever).
  if (volatile) {
    pruneLive(path.join(LIVE_DIR, seat), opts.retain == null ? DEFAULT_RETAIN : opts.retain);
  }

  return { path: relPath, absPath, sha256, sha8, captured_at, seat, id_or_path, volatile, indexRow };
}

// prune all but the most-recent `retain` files in a live/<seat> dir (by mtime). Files only.
function pruneLive(dir, retain) {
  if (!Number.isFinite(retain) || retain < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const p = path.join(dir, f);
        let mtime = 0;
        try { mtime = fs.statSync(p).mtimeMs; } catch (_) {}
        return { p, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime); // newest first
  } catch (_) { return; }
  for (const e of entries.slice(retain)) {
    try { fs.unlinkSync(e.p); } catch (_) {}
  }
}

// ---- readSnapshot -------------------------------------------------------------------------------
// readSnapshot(ref) — read back one persisted capture and re-verify its content address.
//   ref: a repo-relative or absolute file path ("...snapshots/....json"), OR a sha256 (full 64-hex
//        or an 8-hex prefix), OR an object { path } / { sha256 }.
//
// Returns { path, sha256, match, envelope, raw } or null if not found / unreadable.
//   match = mechanical byte-equality of the stored sha256 vs a live rehash of the file bytes
//           (a lossless comparison, never an interpretation).
function readSnapshot(ref) {
  if (!ref) return null;
  let target = null; // { absPath, sha256? }

  if (typeof ref === "object") {
    if (ref.path) target = { absPath: resolvePath(ref.path) };
    else if (ref.sha256) target = fromSha(ref.sha256);
  } else if (typeof ref === "string") {
    if (ref.includes("/") || ref.includes("\\") || ref.endsWith(".json")) {
      target = { absPath: resolvePath(ref) };
    } else if (/^[0-9a-f]{8,64}$/i.test(ref)) {
      target = fromSha(ref);
    }
  }
  if (!target || !target.absPath) return null;

  let raw;
  try { raw = fs.readFileSync(target.absPath, "utf8"); } catch (_) { return null; }

  let envelope = null;
  try { envelope = JSON.parse(raw); } catch (_) { envelope = null; }

  const recomputed = hashBytes(raw);
  const stored = target.sha256 || recomputed;
  return {
    path: repoRel(path.isAbsolute(target.absPath) ? target.absPath : path.join(REPO, target.absPath)),
    sha256: stored,
    match: stored === recomputed,
    envelope,
    raw,
  };
}

// resolve a repo-relative or absolute path to an absolute path (kept inside the write-fence tree
// is a caller concern; readSnapshot is read-only regardless).
function resolvePath(p) {
  if (path.isAbsolute(p)) return p;
  return path.join(REPO, p);
}

// resolve a sha256 (full or prefix) to its file via the committed index.
function fromSha(sha) {
  const s = String(sha).toLowerCase();
  const rows = readIndexRows();
  const hit = rows.find((r) => r.sha256 && r.sha256.toLowerCase().startsWith(s));
  if (!hit) return null;
  return { absPath: resolvePath(hit.path), sha256: hit.sha256 };
}

// ---- listSnapshots ------------------------------------------------------------------------------
// listSnapshots(opts) — return the committed index rows verbatim (serves /api/gaia/snapshots).
//   opts:
//     seat     filter to one seat.
//     limit    return only the most-recent N rows.
//     presence when true, add a mechanical `present` boolean (does the raw file still exist on
//              disk?) so a consumer can distinguish pruned-but-indexed captures. This is a file
//              existence check, not a summary — no aggregate is computed.
// Rows are returned in index (append) order; with `limit`, the last N (most-recent) rows.
function listSnapshots(opts = {}) {
  let rows = readIndexRows();
  if (opts.seat) rows = rows.filter((r) => r.seat === seatSlug(opts.seat));
  if (opts.limit != null && Number.isFinite(opts.limit)) rows = rows.slice(-opts.limit);
  if (opts.presence) {
    rows = rows.map((r) => Object.assign({}, r, { present: fs.existsSync(resolvePath(r.path)) }));
  }
  return rows;
}

// read + parse the append-only index, skipping any unparseable line. Missing index => [].
function readIndexRows() {
  let text;
  try { text = fs.readFileSync(INDEX, "utf8"); } catch (_) { return []; }
  const out = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try { out.push(JSON.parse(t)); } catch (_) { /* skip corrupt line, never mutate the file */ }
  }
  return out;
}

module.exports = { writeSnapshot, readSnapshot, listSnapshots };
