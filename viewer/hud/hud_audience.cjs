// hud_audience.cjs -- audience-row receiver + sanitizer-vouched validation.
//
// Contract (structural):
//   const a = new Audience({cap:200})
//   a.accept({source, author, text, ts, sanitized_by})  -> {ok, row?} | {ok:false, err, code}
//   a.recent(n)                                          -> [rows, newest last]
//   a.size                                               -> current count
//
// Validation is intentionally strict:
//   - source, author, text: non-empty strings, each <= 200 UTF-8 bytes
//   - ts: number (unix ms) or ISO-8601 string parseable to a Date
//   - sanitized_by: non-empty string. The HUD does NOT sanitize itself;
//     upstream MUST vouch. This is the hud-audience-sanitizer-honest gate.
//   - text is checked for well-formed UTF-8 (bytes -> string round-trip)
//
// Rows are trimmed HTML-hostile (no bare < > &) before storage as a defense
// against a sanitizer that vouched wrongly, but the HUD's own gate remains
// "we accept the vouch"; this is belt-and-braces only.

"use strict";

const { Ring } = require("./hud_ring.cjs");

const MAX_FIELD_BYTES = 200;

function bytelen(s) {
  return Buffer.byteLength(String(s), "utf8");
}

function isNonEmptyString(v, cap) {
  if (typeof v !== "string") return false;
  if (v.length === 0) return false;
  if (cap && bytelen(v) > cap) return false;
  return true;
}

function isValidUtf8(s) {
  if (typeof s !== "string") return false;
  try {
    const buf = Buffer.from(s, "utf8");
    const back = buf.toString("utf8");
    return back === s;
  } catch (_) { return false; }
}

function normalizeTs(ts) {
  if (typeof ts === "number" && Number.isFinite(ts)) return ts;
  if (typeof ts === "string") {
    const n = Date.parse(ts);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

function scrubHtml(s) {
  // Defense-in-depth: strip angle brackets and ampersand-entities. Sanitizer
  // upstream must still do the real work; this only reduces blast if it lies.
  return String(s).replace(/[<>]/g, "").replace(/&(?![a-z]+;|#\d+;|#x[0-9a-f]+;)/gi, "&amp;");
}

class Audience {
  constructor(opts) {
    const cap = (opts && opts.cap) || 200;
    this._ring = new Ring(cap);
  }

  get size() { return this._ring.size; }

  accept(input) {
    if (!input || typeof input !== "object") {
      return { ok: false, code: "shape", err: "row must be an object" };
    }
    const { source, author, text, ts, sanitized_by } = input;

    if (!isNonEmptyString(source, MAX_FIELD_BYTES)) {
      return { ok: false, code: "source", err: "source: non-empty string <=200 utf8 bytes" };
    }
    if (!isNonEmptyString(author, MAX_FIELD_BYTES)) {
      return { ok: false, code: "author", err: "author: non-empty string <=200 utf8 bytes" };
    }
    if (!isNonEmptyString(text, MAX_FIELD_BYTES)) {
      return { ok: false, code: "text", err: "text: non-empty string <=200 utf8 bytes" };
    }
    if (!isValidUtf8(text)) {
      return { ok: false, code: "text-not-utf8", err: "text must be valid utf8" };
    }
    const tsN = normalizeTs(ts);
    if (tsN === null) {
      return { ok: false, code: "ts", err: "ts: number (unix ms) or ISO-8601 string" };
    }
    if (!isNonEmptyString(sanitized_by, MAX_FIELD_BYTES)) {
      return { ok: false, code: "sanitized_by", err: "sanitized_by required: the HUD does not sanitize itself; upstream must vouch (hud-audience-sanitizer-honest gate)" };
    }

    const row = {
      source: scrubHtml(source),
      author: scrubHtml(author),
      text: scrubHtml(text),
      ts: tsN,
      sanitized_by: String(sanitized_by),
      received_at: Date.now(),
    };
    this._ring.push(row);
    return { ok: true, row };
  }

  recent(n) {
    return this._ring.recent(n).map((e) => e.value);
  }

  clear() { this._ring.clear(); }
}

module.exports = { Audience };
