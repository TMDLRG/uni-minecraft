// gaia_lint.cjs — THE no-summarization LINT (first-class slice-1 deliverable of the Gaia seat).
//
// GAIA LAW: Gaia projects DIRECT signals with provenance and NEVER summarizes, scores, ranks, narrates,
// or authors a verdict. A source's OWN computed boolean/verdict (infra dnsDrift state, a gate row's
// PASS/PARTIAL/FAIL/WITHHELD/PENDING, a source's own "count 3" bytes) carried verbatim with the source as
// locator is PROJECTION, not derivation — allowed. Any value Gaia itself computes across signals (a
// pass-count, a percent, a rollup verdict) is a BUILD DEFECT. This lint fails the build (exit != 0) when
// any signal path violates that law.
//
// It checks, over BOTH the live /api/gaia envelope AND the on-disk snapshots:
//   (a) any Signal key outside sig.FROZEN_KEYS
//   (b) any sig.FORBIDDEN_TOKENS (count/sum/avg/percent/score/rank/total/ratio/health-%/gaia-verdict/
//       narration) in an emitted key or a Gaia-AUTHORED string (value.raw source bytes are EXEMPT —
//       a source-verbatim "count 3" passthrough is allowed)
//   (c) any signal missing a complete provenance triple (locator | captured_at | sha256 | byte_len)
//   (d) rehash mismatch: sha256 recomputed over EXACTLY value.raw bytes != provenance.sha256
//   (e) gaia.cjs (and its siblings) on-disk source hash != committed golden (the byte-identity idiom)
//   (f) a Gaia-authored drift `equal` boolean not backed by a mechanical two-source byte-equal
//       (distinguishes a source-projected verdict from a Gaia-derived one)
//
// READ-ONLY: this module reads envelopes, snapshot files, and (optionally) a committed golden manifest.
// It mutates nothing in normal operation. The only write path is the explicit, operator-invoked
// `--write-golden` CLI flag, which writes goldens.json under viewer/gaia/ (inside the Gaia write-fence).
//
// Exports: { lint }.  Also runnable: `node viewer/gaia/gaia_lint.cjs` (exit code = verdict).
//
// Depends on: node builtins (crypto, fs, path); ./gaia.cjs (the envelope assembler); ./sig.cjs
// (FROZEN_KEYS + FORBIDDEN_TOKENS — the single source of truth for the allowlist and the token blocklist).
// Sibling modules are required LAZILY so this file loads, `node -c`-checks, and lints on-disk snapshots
// even before gaia.cjs/sig.cjs exist on disk; when a sibling is absent the lint says so honestly rather
// than fabricating a pass.

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const GAIA_DIR = __dirname;
const SNAP_DIR = path.join(GAIA_DIR, "snapshots");
const GOLDEN_PATH = path.join(GAIA_DIR, "goldens.json");

// Files whose on-disk bytes are pinned against a committed golden (check (e)). gaia.cjs is the one the
// spec names explicitly; sig.cjs + gaia_server.cjs are pinned too per the self-mirror discipline.
const PINNED_FILES = ["gaia.cjs", "sig.cjs", "gaia_server.cjs"];

// The neutral relation vocabulary a drift signal may carry (drift_design). Anything else is a
// Gaia-authored editorial label and is a defect.
// `lag` added 2026-07-27 (Phase 9 step 1.6) on the authority of ADR-0002 Amendment 1 Decision 6, which
// names it explicitly: where two things legitimately differ forever — a deployment lagging its source —
// that belongs in a signal with its OWN relation, classified and dated, rather than left looking like an
// unresolved fault. It is a neutral structural word, not a Gaia-authored judgment: no severity, no score.
const DRIFT_RELATIONS = new Set(["declared_vs_observed", "absent", "snapshot_vs_live", "self", "lag"]);

// ---- sibling loading (lazy + honest) -------------------------------------------------------------------
function tryRequire(rel) {
  try {
    return { mod: require(rel), err: null };
  } catch (e) {
    return { mod: null, err: e };
  }
}

// Fallback FROZEN_KEYS / FORBIDDEN_TOKENS used ONLY when sig.cjs is not yet on disk, so the lint can still
// run standalone against snapshots. sig.cjs is authoritative; when present its exports win outright.
//
// The canonical sig.FROZEN_KEYS is an OBJECT of per-level allowlists:
//   { signal:[...top-level...], value:[...], provenance:[...], live:[...], truncated:[...] }
// (not a flat array). This fallback mirrors that shape so nested-allowlist enforcement still works
// standalone; a flat-array export is also tolerated (treated as the top-level `signal` list).
const FALLBACK_FROZEN_KEYS = {
  signal: ["id", "seat", "kind", "value", "provenance", "live", "evidence_class"],
  value: ["raw", "encoding"],
  provenance: ["locator", "captured_at", "sha256", "byte_len", "truncated", "truncation_note", "instrument", "reverify"],
  live: ["up", "detail"],
  truncated: ["of", "complete"],
};
const FALLBACK_FORBIDDEN_TOKENS = [
  "count", "sum", "avg", "average", "mean", "median", "percent", "score", "rank", "total", "ratio",
  "health-%", "gaia-verdict", "summary", "summarize", "narrate", "narration", "aggregate", "rollup",
];

// Normalize FROZEN_KEYS (object-of-lists OR a bare top-level array) into { top:[...], nested:{name->[...]} }.
function normalizeFrozen(fk) {
  if (Array.isArray(fk)) return { top: fk.slice(), nested: {} };
  if (fk && typeof fk === "object") {
    const top = Array.isArray(fk.signal) ? fk.signal.slice() : [];
    const nested = {};
    for (const name of ["value", "provenance", "live", "truncated"]) {
      if (Array.isArray(fk[name])) nested[name] = fk[name].slice();
    }
    return { top, nested };
  }
  return null;
}

function loadSig() {
  const { mod, err } = tryRequire("./sig.cjs");
  if (mod && mod.FROZEN_KEYS && Array.isArray(mod.FORBIDDEN_TOKENS)) {
    const norm = normalizeFrozen(mod.FROZEN_KEYS);
    if (norm && norm.top.length) return { frozen: norm.top, nested: norm.nested, forbidden: mod.FORBIDDEN_TOKENS.slice(), source: "sig.cjs", err: null };
  }
  const fb = normalizeFrozen(FALLBACK_FROZEN_KEYS);
  return { frozen: fb.top, nested: fb.nested, forbidden: FALLBACK_FORBIDDEN_TOKENS.slice(), source: "fallback", err: err };
}

// ---- token matching ------------------------------------------------------------------------------------
function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Build one case-insensitive RegExp per forbidden token. A token may already be a RegExp (sig.cjs may
// export compiled patterns) — used as-is. For string tokens the boundary is LETTER-only, not \w: we do NOT
// treat "_", ".", or "-" as part of a word. This is deliberate — the tokens hide in snake_case ids and keys
// ("repo.pass_count", "score_field"), and a \b boundary (where "_" is a word char) would miss exactly those.
// A leading letter gets a (?<![A-Za-z]) guard so we still do not match inside larger words ("account" is not
// "count", "subtotal" is not "total"); a trailing letter gets an optional plural + a (?![A-Za-z]) guard
// ("count"/"counts" match, "summary" does not match "sum"). Symbol-bearing tokens like "health-%" match
// literally with no letter guards.
function buildForbiddenRegexes(tokens) {
  const out = [];
  for (const t of tokens) {
    if (t instanceof RegExp) { out.push({ token: t.source, re: new RegExp(t.source, t.flags.includes("i") ? t.flags : t.flags + "i") }); continue; }
    const raw = String(t);
    const esc = escapeRe(raw);
    const lead = /^[A-Za-z]/.test(raw) ? "(?<![A-Za-z])" : "";
    const tail = /[A-Za-z]$/.test(raw) ? "(?:s)?(?![A-Za-z])" : (/[0-9]$/.test(raw) ? "(?![A-Za-z])" : "");
    out.push({ token: raw, re: new RegExp(lead + esc + tail, "i") });
  }
  return out;
}

function firstForbidden(text, regexes) {
  const s = String(text == null ? "" : text);
  for (const { token, re } of regexes) {
    if (re.test(s)) return token;
  }
  return null;
}

// ---- hashing -------------------------------------------------------------------------------------------
function sha256OfRaw(value) {
  // Recompute sha256 over EXACTLY value.raw bytes, honoring the declared encoding. This is the mechanical
  // truth the provenance.sha256 must equal; we compute it here independently of sig.cjs so the lint can
  // catch a re-serialized / tampered value even if sig's own hasher agreed with the emitter.
  const enc = value && value.encoding;
  const raw = value && value.raw;
  let buf;
  if (enc === "base64") buf = Buffer.from(String(raw == null ? "" : raw), "base64");
  else buf = Buffer.from(String(raw == null ? "" : raw), "utf8");
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function sha256File(p) {
  const buf = fs.readFileSync(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---- provenance / shape helpers ------------------------------------------------------------------------
const HEX64 = /^[0-9a-f]{64}$/;

function isIso8601(s) {
  if (typeof s !== "string" || !s.length) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

// ---- per-signal linter ---------------------------------------------------------------------------------
// Pushes zero or more violation objects into `out`. `where` identifies the containing render (live | a
// snapshot filename) so a defect is locatable.
function lintSignal(sig, ctx, out, where) {
  const id = (sig && typeof sig === "object" && "id" in sig) ? String(sig.id) : "<no-id>";
  const at = (code, check, detail) => out.push({ code, check, where, signal_id: id, detail });

  if (!sig || typeof sig !== "object" || Array.isArray(sig)) {
    at("SHAPE", "signal-object", "signal is not an object");
    return;
  }

  // (a) frozen-key allowlist — every TOP-LEVEL key present must be in FROZEN_KEYS.signal, and every key of
  // each nested block (value/provenance/live/truncated) must be in that block's allowlist.
  for (const k of Object.keys(sig)) {
    if (!ctx.frozenSet.has(k)) at("FROZEN_KEY", "a", `top-level key "${k}" is outside sig.FROZEN_KEYS.signal [${ctx.frozen.join(",")}]`);
  }
  for (const [name, allow] of Object.entries(ctx.frozenNested)) {
    const block = name === "truncated" ? (sig.provenance && sig.provenance.truncated) : sig[name];
    if (block && typeof block === "object" && !Array.isArray(block)) {
      for (const k of Object.keys(block)) {
        if (!allow.has(k)) at("FROZEN_KEY", "a", `${name} key "${k}" is outside sig.FROZEN_KEYS.${name} [${[...allow].join(",")}]`);
      }
    }
  }

  // (c) complete provenance triple.
  const p = sig.provenance;
  if (!p || typeof p !== "object") {
    at("PROVENANCE", "c", "missing provenance object");
  } else {
    if (!p.locator || !String(p.locator).length) at("PROVENANCE", "c", "provenance.locator missing/empty");
    if (!isIso8601(p.captured_at)) at("PROVENANCE", "c", `provenance.captured_at not ISO-8601-parseable: ${JSON.stringify(p.captured_at)}`);
    if (!HEX64.test(String(p.sha256 || ""))) at("PROVENANCE", "c", `provenance.sha256 not 64-hex: ${JSON.stringify(p.sha256)}`);
    if (typeof p.byte_len !== "number" || !Number.isFinite(p.byte_len) || p.byte_len < 0) at("PROVENANCE", "c", `provenance.byte_len not a non-negative number: ${JSON.stringify(p.byte_len)}`);
  }

  // (d) rehash — sha256(value.raw bytes) === provenance.sha256. When the source itself truncated (the
  // provenance says truncated), the hash covers ONLY the shown tail, which is exactly what value.raw holds,
  // so the rehash still applies verbatim.
  const v = sig.value;
  if (!v || typeof v !== "object" || !("raw" in v)) {
    at("VALUE", "d", "missing value.raw");
  } else if (p && HEX64.test(String(p.sha256 || ""))) {
    const recomputed = sha256OfRaw(v);
    if (recomputed !== String(p.sha256)) {
      at("REHASH", "d", `sha256(value.raw) ${recomputed} != provenance.sha256 ${p.sha256} (a derived/re-serialized/tampered value leaked into a signal path)`);
    }
    // byte_len sanity: must equal the actual byte length of value.raw (else provenance lies about size).
    if (p && typeof p.byte_len === "number") {
      const enc = v.encoding === "base64" ? "base64" : "utf8";
      const actualLen = Buffer.from(String(v.raw == null ? "" : v.raw), enc).length;
      if (actualLen !== p.byte_len) at("PROVENANCE", "c", `provenance.byte_len ${p.byte_len} != actual value.raw byte length ${actualLen}`);
    }
  }

  // (b) forbidden tokens in any emitted KEY or Gaia-AUTHORED string. value.raw (and everything nested under
  // it) is source-verbatim and EXEMPT; provenance.sha256 is hex and skipped to avoid spurious hits.
  scanForbidden(sig, [], ctx, at);

  // live is only meaningful for probe kinds; when present, up must be a real tristate and (for the honest
  // -probe guarantee) never a bare truthy string. This lint asserts the shape; the gaia-honest-probe gate
  // asserts the semantics (no up:true absent a captured probe).
  if ("live" in sig && sig.live != null) {
    if (typeof sig.live !== "object") at("LIVE", "shape", "live is present but not an object");
    else if (!(sig.live.up === true || sig.live.up === false || sig.live.up === null)) {
      at("LIVE", "shape", `live.up must be true|false|null, got ${JSON.stringify(sig.live.up)}`);
    }
  }

  // (f) drift signals: the `equal` boolean must be a mechanical byte-equal of the two carried sources —
  // never a Gaia-derived judgement. Detect drift by kind === "drift".
  if (sig.kind === "drift") lintDrift(sig, out, where, id);
}

// Recursively scan for forbidden tokens, skipping the source-verbatim value.raw subtree and the hex
// provenance.sha256. Checks BOTH object keys and Gaia-authored string values.
function scanForbidden(node, pathKeys, ctx, at) {
  const lastKey = pathKeys[pathKeys.length - 1];
  const parentKey = pathKeys[pathKeys.length - 2];
  // EXEMPT: the entire value.raw payload is source-verbatim (a "count 3" passthrough is allowed).
  if (lastKey === "raw" && parentKey === "value") return;
  // Skip the hash digest (hex; not Gaia prose) to avoid coincidental matches.
  if (lastKey === "sha256") return;
  // EXEMPT: provenance.locator / reverify / instrument are the mechanical RE-VERIFICATION surface —
  // verbatim commands / paths / tool names a consumer runs to REPRODUCE the signal (e.g.
  // `git rev-list --left-right --count …`, `sha256sum …`). A tool or flag name that happens to contain
  // a forbidden substring ("--count", "sha256sum") is a citation of the real command, NOT Gaia
  // summarization. Their VALUE is exempt like value.raw; a rogue forbidden KEY name under provenance is
  // still caught by the key scan below (this only skips the string value at these three keys).
  if ((lastKey === "locator" || lastKey === "reverify" || lastKey === "instrument") && parentKey === "provenance") return;

  if (node == null) return;
  if (typeof node === "string") {
    const hit = firstForbidden(node, ctx.forbiddenRe);
    if (hit) at("FORBIDDEN_TOKEN", "b", `forbidden token "${hit}" in Gaia-authored string at path "${pathKeys.join(".") || "<root>"}": ${JSON.stringify(node).slice(0, 120)}`);
    return;
  }
  if (typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((el, i) => scanForbidden(el, pathKeys.concat(String(i)), ctx, at));
    return;
  }
  for (const k of Object.keys(node)) {
    // A forbidden token appearing as an emitted KEY name is itself a defect (e.g. a rogue "score" field).
    const kHit = firstForbidden(k, ctx.forbiddenRe);
    if (kHit) at("FORBIDDEN_TOKEN", "b", `forbidden token "${kHit}" in emitted key name at path "${pathKeys.concat(k).join(".")}"`);
    scanForbidden(node[k], pathKeys.concat(k), ctx, at);
  }
}

// (f) A drift signal's value.raw is a canonicalRaw serialization of { a, b, relation, equal }. The lint
// re-derives the mechanical byte-equal of the two carried sources and asserts it matches the emitted
// `equal`. If it does not, Gaia authored a boolean not backed by the comparison — a build defect.
function lintDrift(sig, out, where, id) {
  const at = (code, detail) => out.push({ code, check: "f", where, signal_id: id, detail });
  let parsed;
  try {
    parsed = JSON.parse(String(sig.value && sig.value.raw));
  } catch (e) {
    at("DRIFT", `drift value.raw is not parseable JSON: ${e.message}`);
    return;
  }
  const { a, b, relation, equal } = parsed || {};
  if (!DRIFT_RELATIONS.has(relation)) {
    at("DRIFT", `drift relation "${relation}" is outside the neutral vocabulary [${[...DRIFT_RELATIONS].join(",")}] (a Gaia-authored editorial label)`);
  }
  if (typeof equal !== "boolean") {
    at("DRIFT", `drift.equal must be a boolean, got ${JSON.stringify(equal)}`);
    return;
  }
  // Mechanical byte-equal: compare the two carried sources' bytes. Prefer the carried sha256 triples
  // (each side is itself a full Signal with provenance); fall back to hashing value.raw. An "absent" side
  // (relation:'absent') has no bytes -> the pair can never be byte-equal.
  const sideHash = (side) => {
    if (!side || typeof side !== "object") return null;
    // full Signal side: hash lives in provenance.sha256 / bytes in value.raw
    if (side.provenance && HEX64.test(String(side.provenance.sha256 || ""))) return String(side.provenance.sha256);
    if (side.value && "raw" in side.value) return sha256OfRaw(side.value);
    // flat FIELD side {raw, sha256, encoding?} — the shape driftSignal() actually emits for a/b. Recompute
    // sha256 over the raw bytes (the mechanical truth) rather than trusting the carried side.sha256.
    if (typeof side.raw === "string") return sha256OfRaw(side);
    return null;
  };
  const ha = sideHash(a);
  const hb = sideHash(b);
  let mechanical;
  if (relation === "absent") {
    mechanical = false; // one side is absent; there is nothing to be byte-equal to.
  } else if (ha == null || hb == null) {
    at("DRIFT", "drift carries no re-verifiable bytes on at least one side (cannot mechanically confirm `equal`)");
    return;
  } else {
    mechanical = ha === hb;
  }
  if (equal !== mechanical) {
    at("DRIFT", `drift.equal=${equal} is NOT backed by the mechanical two-source byte-equal (a:${ha}, b:${hb} => ${mechanical}); Gaia may not derive this boolean`);
  }
}

// ---- envelope linter -----------------------------------------------------------------------------------
function lintEnvelope(env, ctx, out, where) {
  if (!env || typeof env !== "object") { out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: "envelope is not an object" }); return 0; }
  if (env.schema_version !== 1) out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: `schema_version must be 1, got ${JSON.stringify(env.schema_version)}` });
  const e = env.envelope;
  if (!e || typeof e !== "object") out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: "missing envelope block" });
  else {
    for (const k of ["server", "instrument_version", "timestamp", "evidence_class"]) {
      if (!(k in e)) out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: `envelope.${k} missing` });
    }
    if (e.timestamp != null && !isIso8601(e.timestamp)) out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: `envelope.timestamp not ISO-8601: ${JSON.stringify(e.timestamp)}` });
  }
  const sigs = env.result && env.result.signals;
  if (!Array.isArray(sigs)) { out.push({ code: "ENVELOPE", check: "shape", where, signal_id: "<envelope>", detail: "result.signals is not an array" }); return 0; }
  for (const s of sigs) lintSignal(s, ctx, out, where);
  return sigs.length;
}

// ---- golden pin (check (e)) ----------------------------------------------------------------------------
function checkGoldens(requireGolden) {
  const results = [];
  let golden = null;
  try { golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8")); } catch (_) { golden = null; }
  for (const f of PINNED_FILES) {
    const abs = path.join(GAIA_DIR, f);
    let actual = null;
    try { actual = sha256File(abs); } catch (_) { actual = null; }
    const expected = golden && golden[f] ? String(golden[f]) : null;
    let status;
    if (actual == null) status = "absent";              // sibling not on disk yet
    else if (expected == null) status = "unpinned";     // golden not yet established (DD-completion pins it)
    else if (expected === actual) status = "match";
    else status = "mismatch";
    results.push({ file: f, status, expected, actual });
  }
  return { goldenPresent: !!golden, results, requireGolden };
}

// A golden result is a hard violation on a mismatch, and — since Phase 9 step 1.4 — on a MISSING pin too.
//
// WHY THAT CHANGED. Before 1.4 the manifest did not exist, so "unpinned" was an honest pre-DD state and only
// a mismatch could fail. That left the pin SELF-ERASING, proven by mutation in verify_golden_pins.cjs: edit a
// pinned file AND delete goldens.json (or just drop that file's entry) and every status fell back to
// "unpinned", which raised nothing — the guard could be removed by removing the guard, and the pre-registered
// falsifier for 1.4 ("an edit without a re-pin passes") held by two routes, not one.
//
// The manifest is now a COMMITTED artifact. Its absence is therefore a removed guard, never an honest
// pre-pin state, and the same is true of a core source that has no entry in it. `requireGolden` is kept for
// callers that set it explicitly; it is now subsumed by the stricter default and no longer the only thing
// standing between a deleted manifest and a green lint.
function goldenViolations(gc) {
  const out = [];
  // The manifest as a whole. Reported ONCE and alone: with no manifest, every per-file "unpinned" below is
  // just a restatement of this same fact, and three copies of one defect is noise, not evidence.
  if (!gc.goldenPresent) {
    out.push({ code: "GOLDEN", check: "e", where: "on-disk", signal_id: "goldens.json", detail: `the committed golden manifest is MISSING — a pin that can be erased by deleting the pin file is not a pin (re-establish with \`node viewer/gaia/gaia_lint.cjs --write-golden\` and commit it)` });
    return out;
  }
  for (const r of gc.results) {
    if (r.status === "mismatch") out.push({ code: "GOLDEN", check: "e", where: "on-disk", signal_id: r.file, detail: `on-disk sha256 ${r.actual} != committed golden ${r.expected} (source changed without re-pinning — surfaced, never hidden)` });
    else if (r.status === "unpinned") out.push({ code: "GOLDEN", check: "e", where: "on-disk", signal_id: r.file, detail: `${r.file} has NO entry in the committed golden manifest — an unpinned core source is a removed guard, not an honest pre-pin state` });
    else if (r.status === "absent") out.push({ code: "GOLDEN", check: "e", where: "on-disk", signal_id: r.file, detail: `${r.file} is pinned but NOT ON DISK — a core source cannot be made compliant by deleting it` });
  }
  return out;
}

// ---- public API ----------------------------------------------------------------------------------------
// lint(opts) -> { ok, checked, violations, goldens, notes }
//   opts.envelope        : an in-memory Gaia envelope to lint (from gaia_server /api/gaia/lint, verify_gaia,
//                          or a caller). When omitted, the live envelope is produced by requiring ./gaia.cjs
//                          and calling gaia() (unless opts.live === false).
//   opts.live            : false to skip producing/linting the live envelope entirely.
//   opts.snapshots       : false to skip on-disk snapshots; a dir path to override; default SNAP_DIR.
//   opts.requireGolden   : true to fail when a golden pin is missing (default false — honest pre-pin state).
function lint(opts) {
  opts = opts || {};
  const sig = loadSig();
  const nestedSets = {};
  for (const [name, list] of Object.entries(sig.nested || {})) nestedSets[name] = new Set(list);
  const ctx = {
    frozen: sig.frozen,
    frozenSet: new Set(sig.frozen),
    frozenNested: nestedSets,
    forbidden: sig.forbidden,
    forbiddenRe: buildForbiddenRegexes(sig.forbidden),
  };
  const violations = [];
  const notes = [];
  if (sig.source === "fallback") notes.push(`sig.cjs not loadable (${sig.err ? sig.err.code || sig.err.message : "absent"}); using built-in FROZEN_KEYS/FORBIDDEN_TOKENS fallback — pin sig.cjs to make this authoritative.`);

  let liveSignals = 0;
  let liveLinted = false;
  if (opts.live !== false) {
    let env = opts.envelope;
    if (!env) {
      const g = tryRequire("./gaia.cjs");
      if (g.mod && typeof g.mod.gaia === "function") {
        try { env = g.mod.gaia(); } catch (e) { notes.push(`gaia() threw while producing the live envelope: ${e.message}`); }
        // gaia() may be async; handle a returned promise defensively is out of scope here (callers pass a
        // resolved envelope). If it is a promise, note and skip rather than mis-lint a thenable.
        if (env && typeof env.then === "function") { notes.push("gaia() returned a promise; pass a resolved envelope via opts.envelope to lint the live render."); env = null; }
      } else {
        notes.push(`gaia.cjs not loadable (${g.err ? g.err.code || g.err.message : "absent"}); live envelope not linted — on-disk snapshots still checked.`);
      }
    }
    if (env) { liveSignals = lintEnvelope(env, ctx, violations, "live"); liveLinted = true; }
  }

  // On-disk snapshots.
  let snapFiles = 0;
  let snapSignals = 0;
  if (opts.snapshots !== false) {
    const dir = typeof opts.snapshots === "string" ? opts.snapshots : SNAP_DIR;
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (_) { entries = null; }
    if (entries) {
      for (const f of entries) {
        if (!f.endsWith(".json")) continue;
        const abs = path.join(dir, f);
        let env;
        try { env = JSON.parse(fs.readFileSync(abs, "utf8")); }
        catch (e) { violations.push({ code: "SNAPSHOT", check: "shape", where: f, signal_id: "<file>", detail: `unparseable snapshot JSON: ${e.message}` }); continue; }
        snapFiles += 1;
        snapSignals += lintEnvelope(env, ctx, violations, f);
      }
    }
  }

  // (e) golden pins.
  const gc = checkGoldens(!!opts.requireGolden);
  for (const gv of goldenViolations(gc)) violations.push(gv);

  return {
    ok: violations.length === 0,
    checked: {
      live_linted: liveLinted,
      live_signals: liveSignals,
      snapshot_files: snapFiles,
      snapshot_signals: snapSignals,
      frozen_keys_source: sig.source,
      forbidden_tokens: ctx.forbidden.map((t) => (t instanceof RegExp ? t.source : String(t))),
    },
    violations,
    goldens: gc.results,
    notes,
  };
}

// ---- golden writer (operator-invoked only) -------------------------------------------------------------
function writeGolden() {
  const golden = {};
  for (const f of PINNED_FILES) {
    const abs = path.join(GAIA_DIR, f);
    try { golden[f] = sha256File(abs); } catch (_) { /* skip files not yet on disk */ }
  }
  golden._note = "Committed golden sha256 pins for Gaia source files (byte-identity idiom). Regenerate with `node viewer/gaia/gaia_lint.cjs --write-golden` at DD-completion, then commit.";
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + "\n");
  return golden;
}

module.exports = { lint };

// resolveLiveEnvelope — the live gaia() envelope may be SYNC or ASYNC (the canonical gaia.cjs returns a
// promise). It may also THROW/reject if a collector emits a malformed signal. The sync lint() API cannot
// await, so the CLI resolves it here and passes it in via opts.envelope; any failure becomes an honest note
// (never a fabricated pass). Returns { env, note }.
async function resolveLiveEnvelope() {
  const g = tryRequire("./gaia.cjs");
  if (!g.mod || typeof g.mod.gaia !== "function") return { env: null, note: `gaia.cjs not loadable (${g.err ? g.err.code || g.err.message : "absent"}); live envelope not linted.` };
  try {
    let env = g.mod.gaia();
    if (env && typeof env.then === "function") env = await env;
    return { env, note: null };
  } catch (e) {
    return { env: null, note: `gaia() failed to produce a live envelope: ${e.message} — live not linted (on-disk snapshots + goldens still checked).` };
  }
}

// ---- CLI ------------------------------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);

  if (has("--write-golden")) {
    const g = writeGolden();
    process.stdout.write(`GAIA LINT: wrote golden pins to ${GOLDEN_PATH}\n` + JSON.stringify(g, null, 2) + "\n");
    process.exit(0);
  }

  const wantLive = !has("--snapshots-only");
  let liveEnv = null;
  let liveNote = null;
  if (wantLive) {
    const r = await resolveLiveEnvelope();
    liveEnv = r.env;
    liveNote = r.note;
  }

  // The CLI already resolved the (async) live envelope; tell lint() to lint it only when we actually hold
  // it, so lint() does not re-require gaia() and re-hit the same promise/throw.
  const opts = {
    live: !!liveEnv,
    envelope: liveEnv || undefined,
    snapshots: has("--live-only") ? false : undefined,
    requireGolden: has("--require-golden"),
  };
  const res = lint(opts);
  if (liveNote) res.notes.unshift(liveNote);

  if (has("--json")) {
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  } else {
    const c = res.checked;
    process.stdout.write(`GAIA LINT — no-summarization + provenance integrity\n`);
    process.stdout.write(`  live: ${c.live_linted ? c.live_signals + " signals" : "not linted"} · snapshots: ${c.snapshot_files} file(s), ${c.snapshot_signals} signal(s) · frozen-keys source: ${c.frozen_keys_source}\n`);
    for (const n of res.notes) process.stdout.write(`  note: ${n}\n`);
    for (const g of res.goldens) process.stdout.write(`  golden ${g.file}: ${g.status}\n`);
    if (res.violations.length === 0) {
      process.stdout.write(`  RESULT: PASS — 0 violations\n`);
    } else {
      process.stdout.write(`  RESULT: FAIL — ${res.violations.length} violation(s):\n`);
      for (const v of res.violations) process.stdout.write(`    [${v.check}] ${v.code} (${v.where} · ${v.signal_id}): ${v.detail}\n`);
    }
  }

  // Exit code: 0 pass; 1 violations found; 2 could-not-evaluate (no live envelope AND no snapshots seen).
  if (!res.ok) process.exit(1);
  if (!res.checked.live_linted && res.checked.snapshot_files === 0) {
    process.stdout.write(`  RESULT: INCONCLUSIVE — no live envelope and no on-disk snapshots to lint.\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((e) => { process.stderr.write(`GAIA LINT: unexpected error — ${e && e.stack ? e.stack : e}\n`); process.exit(3); });
}
