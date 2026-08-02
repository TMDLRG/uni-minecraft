// sig.cjs — THE GAIA PROVENANCE KERNEL (slice-1).
//
// GAIA LAW (enforced here in code, not by policy): a Gaia Signal is the atomic,
// NON-summarizable unit of direct evidence. It carries the SOURCE bytes verbatim
// plus a provenance triple {locator, captured_at, sha256} — and NOTHING interpreted.
// No count / sum / avg / percent / score / rank / total / ratio / health-% / verdict /
// narration field may EVER be authored by Gaia. This module makes that structurally
// impossible for anything it constructs: the Signal key-set is a FROZEN allowlist, so
// an aggregate/score field cannot be attached. A boolean a SOURCE itself computed
// (an infra dnsDrift state, a gate row's PASS/PARTIAL/FAIL verdict) is carried verbatim
// inside value.raw as source bytes — that is projection, never a Gaia derivation.
//
// This kernel is the SINGLE SOURCE OF TRUTH for the frozen key allowlist and the
// forbidden-token list, so gaia_lint.cjs, gaia.cjs and gaia_mcp.cjs all agree.
//
// Depends on node builtins only (crypto). Read-only: constructs values, mutates nothing.

"use strict";

const crypto = require("crypto");

// ---------------------------------------------------------------------------------------------------
// FROZEN key allowlist — the atomic Signal shape. Any key outside this set is a BUILD DEFECT.
// Exposed so gaia_lint.cjs has ONE source of truth for what a Signal may contain.
// ---------------------------------------------------------------------------------------------------
const FROZEN_KEYS = Object.freeze({
  signal: Object.freeze(["id", "seat", "kind", "value", "provenance", "live", "evidence_class"]),
  value: Object.freeze(["raw", "encoding"]),
  provenance: Object.freeze([
    "locator", "captured_at", "sha256", "byte_len", "truncated", "truncation_note", "instrument", "reverify"
  ]),
  live: Object.freeze(["up", "detail"]),
  truncated: Object.freeze(["of", "complete"]),
});

// The closed vocabularies the signal model declares. Carried, never invented.
// `organic-operator` added 2026-07-16 — the HUMAN-FLOW seat. It projects the Organic Operator
// persona (docs/lab_team/06_organic_operator.md + its skill) VERBATIM so every agent and every
// surface reads the same words from one place ("all are one resonance"). It is a pure file seat:
// no probe, so it may never carry a `live` block (PROBE_KINDS enforces that), and Gaia never runs
// its gauntlet or scores its verdict — she carries the TEXT, the reader runs it. The verdict
// belongs to whoever invokes /organic-operator; a mirror that judged flyability would be exactly
// the summarization GAIA LAW forbids.
// NOTE: this closed list is the reason the first attempt to add the seat FAILED the gate loudly
// (`seat 'organic-operator' not in [...]`) instead of silently admitting an unvouched seat. That
// is the vocabulary doing its job — a seat cannot be smuggled in by a collector alone.
const SEATS = Object.freeze([
  "gaia-self", "repo", "gates", "infra", "studio", "colony", "relay", "sessions", "science", "drift",
  "organic-operator", "control-plane",
]);
const KINDS = Object.freeze([
  "git", "file", "config", "command", "tcp", "http", "mcp", "transcript", "drift",
]);
const PROBE_KINDS = Object.freeze(["tcp", "http"]); // the ONLY kinds that may carry a `live` block
const ENCODINGS = Object.freeze(["utf8", "base64"]);
const EVIDENCE_CLASSES = Object.freeze(["A", "B", "C", "Sec", "pending"]);

// ---------------------------------------------------------------------------------------------------
// FORBIDDEN tokens — the no-summarization allowlist's negative space. If any of these appears as an
// EMITTED KEY or in a Gaia-AUTHORED string, GAIA LAW is broken and gaia_lint fails the build.
// (Source-verbatim occurrences inside value.raw are EXEMPT — projecting a source's own "count 3" or a
// gate verdict is lossless projection, not Gaia summarization. The lint applies these to keys + Gaia
// strings only, never to value.raw.) This is the single source of truth for that list.
// ---------------------------------------------------------------------------------------------------
const FORBIDDEN_TOKENS = Object.freeze([
  "count", "sum", "avg", "average", "mean", "median",
  "percent", "score", "rank", "total", "ratio",
  "health-%", "health_pct", "healthpct",
  "gaia-verdict", "gaia_verdict",
  "summary", "summarize", "summarise",
  "narrate", "narration", "narrative",
  "editorial", "aggregate", "rollup",
]);

// ---------------------------------------------------------------------------------------------------
// sha256Bytes — hash EXACTLY the bytes shown. Accepts a Buffer, or a string with an explicit encoding
// (utf8 default, or base64 for binary sources). Returns 64-hex. This is the one hash primitive; the
// provenance.sha256 of every Signal is produced here over the same bytes stored in value.raw, so
// gaia.verify_hash and gaia_lint always round-trip.
// ---------------------------------------------------------------------------------------------------
function sha256Bytes(input, encoding = "utf8") {
  let buf;
  if (Buffer.isBuffer(input)) {
    buf = input;
  } else if (typeof input === "string") {
    if (encoding !== "utf8" && encoding !== "base64") {
      throw new Error(`sha256Bytes: unsupported encoding '${encoding}' (utf8|base64 only)`);
    }
    buf = Buffer.from(input, encoding);
  } else {
    throw new Error("sha256Bytes: input must be a Buffer or string (never a live object — hash bytes, not a re-serialization)");
  }
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---------------------------------------------------------------------------------------------------
// canonicalRaw — the ONE stable-key-ordered UTF-8 serialization used when Gaia must ASSEMBLE structured
// JSON (e.g. a drift pair). Recursively sorts object keys so key-order/whitespace can never drift the
// sha256. The returned string is what gets BOTH stored in value.raw AND hashed — never a second, freshly
// re-serialized form. For sources read as raw bytes (files, command stdout, probe bodies), do NOT use
// this — store and hash the ORIGINAL bytes verbatim. This is only for Gaia-assembled objects.
// ---------------------------------------------------------------------------------------------------
function canonicalRaw(obj) {
  return JSON.stringify(_canonicalize(obj));
}

function _canonicalize(v) {
  if (v === null || typeof v !== "object") return v; // primitives verbatim
  if (Array.isArray(v)) return v.map(_canonicalize); // arrays keep order (order is signal)
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = _canonicalize(v[k]);
  return out;
}

// ---------------------------------------------------------------------------------------------------
// _assertKeysSubset — structural allowlist guard. Rejects ANY key outside the frozen set for that level.
// This is HOW aggregate/score fields are forbidden by construction: they simply cannot be attached.
// ---------------------------------------------------------------------------------------------------
function _assertKeysSubset(obj, allowed, where) {
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) {
      throw new Error(`GAIA LAW: key '${k}' not permitted in ${where} — frozen allowlist is [${allowed.join(", ")}]`);
    }
    // Defense in depth: even inside the allowlist, a forbidden aggregate token as a key is a defect.
    const lk = k.toLowerCase();
    for (const tok of FORBIDDEN_TOKENS) {
      if (lk === tok || lk.includes(tok)) {
        throw new Error(`GAIA LAW: forbidden aggregate/summary token '${tok}' appears in key '${k}' (${where})`);
      }
    }
  }
}

function _isIso8601(s) {
  if (typeof s !== "string" || s.length === 0) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

// ---------------------------------------------------------------------------------------------------
// signal — construct ONE Signal, validating GAIA LAW by construction.
//
//   spec = {
//     id, seat, kind,
//     value: { raw:<string>, encoding?:"utf8"|"base64" },   // raw = the EXACT bytes-shown, verbatim
//     provenance: {
//       locator:<re-runnable source>, reverify:<re-capture command>,
//       captured_at?:<ISO-8601 UTC>,               // defaults to now()
//       truncated?: false | { of:<string>, complete:false },
//       truncation_note?:<string>, instrument?:<string>
//     },
//     live?: { up:true|false|null, detail:<string> },        // ONLY for kind tcp|http
//     evidence_class?: "A"|"B"|"C"|"Sec"|"pending",          // defaults "C", never invented beyond carry
//   }
//
// sha256 + byte_len are COMPUTED here over value.raw — never accepted from the caller — so a signal's
// provenance can never disagree with the bytes it shows. `live.up` may only be true/false when a probe
// actually ran (the caller passes the probe result); null/"not probed" is the honest default. This
// function fabricates no liveness, no aggregate, and no interpretation.
// ---------------------------------------------------------------------------------------------------
function signal(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new Error("signal: spec must be an object");
  }
  _assertKeysSubset(spec, FROZEN_KEYS.signal, "Signal");

  // --- id ---
  const id = spec.id;
  if (typeof id !== "string" || id.length === 0) throw new Error("signal: id must be a non-empty string (a stable locator slug)");

  // --- seat ---
  const seat = spec.seat;
  if (!SEATS.includes(seat)) throw new Error(`signal[${id}]: seat '${seat}' not in [${SEATS.join(", ")}]`);

  // --- kind ---
  const kind = spec.kind;
  if (!KINDS.includes(kind)) throw new Error(`signal[${id}]: kind '${kind}' not in [${KINDS.join(", ")}]`);

  // --- value { raw, encoding } ---
  const inVal = spec.value;
  if (!inVal || typeof inVal !== "object" || Array.isArray(inVal)) throw new Error(`signal[${id}]: value must be an object { raw, encoding }`);
  _assertKeysSubset(inVal, FROZEN_KEYS.value, `Signal[${id}].value`);
  if (typeof inVal.raw !== "string") throw new Error(`signal[${id}]: value.raw must be a string (verbatim source bytes; base64 for binary) — never a live object`);
  const encoding = inVal.encoding === undefined ? "utf8" : inVal.encoding;
  if (!ENCODINGS.includes(encoding)) throw new Error(`signal[${id}]: value.encoding '${encoding}' not in [${ENCODINGS.join(", ")}]`);
  const value = { raw: inVal.raw, encoding };

  // --- provenance (sha256 + byte_len computed here, over value.raw exactly) ---
  const inProv = spec.provenance;
  if (!inProv || typeof inProv !== "object" || Array.isArray(inProv)) throw new Error(`signal[${id}]: provenance must be an object`);
  _assertKeysSubset(inProv, FROZEN_KEYS.provenance, `Signal[${id}].provenance`);
  if (typeof inProv.locator !== "string" || inProv.locator.length === 0) throw new Error(`signal[${id}]: provenance.locator must be a non-empty re-runnable source string`);
  if (typeof inProv.reverify !== "string" || inProv.reverify.length === 0) throw new Error(`signal[${id}]: provenance.reverify must be a non-empty re-capture command string`);

  const captured_at = inProv.captured_at === undefined ? new Date().toISOString() : inProv.captured_at;
  if (!_isIso8601(captured_at)) throw new Error(`signal[${id}]: provenance.captured_at '${captured_at}' is not a parseable ISO-8601 timestamp`);

  const bytes = Buffer.from(value.raw, encoding);
  const byte_len = bytes.length;
  const sha256 = sha256Bytes(bytes);

  // truncated: false, or { of, complete:false } covering ONLY the shown tail.
  let truncated = false;
  if (inProv.truncated !== undefined && inProv.truncated !== false) {
    const t = inProv.truncated;
    if (!t || typeof t !== "object" || Array.isArray(t)) throw new Error(`signal[${id}]: provenance.truncated must be false or { of, complete:false }`);
    _assertKeysSubset(t, FROZEN_KEYS.truncated, `Signal[${id}].provenance.truncated`);
    if (typeof t.of !== "string" || t.of.length === 0) throw new Error(`signal[${id}]: provenance.truncated.of must be a non-empty string`);
    if (t.complete !== false) throw new Error(`signal[${id}]: provenance.truncated.complete must be false (a truncated source is NEVER presented as complete)`);
    truncated = { of: t.of, complete: false };
  }

  const provenance = {
    locator: inProv.locator,
    captured_at,
    sha256,
    byte_len,
    truncated,
    instrument: inProv.instrument === undefined ? "gaia.cjs@1" : inProv.instrument,
    reverify: inProv.reverify,
  };
  if (inProv.truncation_note !== undefined) {
    if (typeof inProv.truncation_note !== "string") throw new Error(`signal[${id}]: provenance.truncation_note must be a string`);
    provenance.truncation_note = inProv.truncation_note;
  }

  // --- assemble ---
  const out = { id, seat, kind, value, provenance };

  // --- live (ONLY for probe kinds; honest default = not probed) ---
  if (PROBE_KINDS.includes(kind)) {
    const inLive = spec.live;
    if (inLive === undefined) {
      out.live = { up: null, detail: "not probed" };
    } else {
      if (!inLive || typeof inLive !== "object" || Array.isArray(inLive)) throw new Error(`signal[${id}]: live must be an object { up, detail }`);
      _assertKeysSubset(inLive, FROZEN_KEYS.live, `Signal[${id}].live`);
      if (!(inLive.up === true || inLive.up === false || inLive.up === null)) {
        throw new Error(`signal[${id}]: live.up must be true|false|null (true/false ONLY from a real probe result; null = not probed) — never fabricated from a PID`);
      }
      const detail = inLive.detail === undefined ? (inLive.up === null ? "not probed" : "") : inLive.detail;
      if (typeof detail !== "string") throw new Error(`signal[${id}]: live.detail must be a string`);
      out.live = { up: inLive.up, detail };
    }
  } else if (spec.live !== undefined) {
    throw new Error(`signal[${id}]: live block is only permitted for kind tcp|http (got kind '${kind}')`);
  }

  // --- evidence_class (carried; defaults "C"; never invented beyond the default carry) ---
  const ec = spec.evidence_class === undefined ? "C" : spec.evidence_class;
  if (!EVIDENCE_CLASSES.includes(ec)) throw new Error(`signal[${id}]: evidence_class '${ec}' not in [${EVIDENCE_CLASSES.join(", ")}]`);
  out.evidence_class = ec;

  return out;
}

// ---------------------------------------------------------------------------------------------------
// envelope — wrap a Signal[] in the on-disk contract (production/schemas/envelope.schema.json):
//   { schema_version:1, envelope:{ server, instrument_version, git_commit, timestamp, evidence_class },
//     result:{ signals:[...] } }
// The envelope carries no aggregate — signals is a verbatim list, never a count/rollup. server is
// "uni-gaia", instrument_version "gaia.cjs@1", evidence_class "C" (the whole projection is class C).
// ---------------------------------------------------------------------------------------------------
function envelope(signals, opts = {}) {
  if (!Array.isArray(signals)) throw new Error("envelope: signals must be an array of Signals");

  const server = opts.server === undefined ? "uni-gaia" : opts.server;
  const instrument_version = opts.instrument_version === undefined ? "gaia.cjs@1" : opts.instrument_version;
  const git_commit = opts.git_commit === undefined ? null : opts.git_commit;
  const timestamp = opts.timestamp === undefined ? new Date().toISOString() : opts.timestamp;
  const evidence_class = opts.evidence_class === undefined ? "C" : opts.evidence_class;

  if (typeof server !== "string") throw new Error("envelope: server must be a string");
  if (typeof instrument_version !== "string") throw new Error("envelope: instrument_version must be a string");
  if (!(git_commit === null || typeof git_commit === "string")) throw new Error("envelope: git_commit must be a string or null");
  if (!_isIso8601(timestamp)) throw new Error(`envelope: timestamp '${timestamp}' is not ISO-8601`);
  if (!EVIDENCE_CLASSES.includes(evidence_class)) throw new Error(`envelope: evidence_class '${evidence_class}' not in [${EVIDENCE_CLASSES.join(", ")}]`);

  // Light structural check that each entry looks like a Signal (has the frozen id+provenance triple).
  for (let i = 0; i < signals.length; i++) {
    const s = signals[i];
    if (!s || typeof s !== "object" || typeof s.id !== "string" || !s.provenance || typeof s.provenance.sha256 !== "string") {
      throw new Error(`envelope: signals[${i}] is not a well-formed Signal (missing id/provenance.sha256) — construct it with sig.signal()`);
    }
  }

  return {
    schema_version: 1,
    envelope: { server, instrument_version, git_commit, timestamp, evidence_class },
    result: { signals },
  };
}

module.exports = { signal, sha256Bytes, canonicalRaw, envelope, FROZEN_KEYS, FORBIDDEN_TOKENS };
