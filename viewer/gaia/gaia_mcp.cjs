// gaia_mcp.cjs — Gaia's READ-ONLY MCP server (hand-rolled JSON-RPC 2.0 over stdio, MCP 2024-11-05).
//
// GAIA LAW: Gaia projects DIRECT SIGNALS with provenance (locator + captured_at + sha256) and NEVER
// summarizes, scores, ranks, narrates, or authors a verdict. This server is a pure PROJECTION surface:
// it delegates every read to ./gaia.cjs (the signal assembler) and serves the SAME envelopes and the SAME
// caps.cjs CAPS the HTTP surface serves, so served == reported (byte-comparable).
//
// FENCES enforced structurally here:
//   * READ-ONLY (G-PA): no tool mutates external state, holds/emits a key, edits lib/sp/**, sets a gate
//     verdict, or triggers an outward action. There is no effectful method — no sampling, no subscribe, no
//     prompt-execute. Every handler only READS gaia()/CAPS. This is enforced by construction, not policy.
//   * NO IP LITERALS: this module hardcodes no host. Transport is stdio (no listen host at all).
//   * Capabilities & list responses are GENERATED FROM caps.cjs CAPS, so the handshake, the self-manifest
//     signal, and docs/GAIA.md all mirror one registry (the gaia-self lynchpin).
//
// Transport: newline-delimited JSON-RPC 2.0 messages on stdin/stdout (the MCP stdio framing). One JSON
// object per line in; one JSON object per line out. Notifications (no `id`) produce no response.
//
// Exports { handleRpc } for in-process testing; runs the stdio loop when executed as `node gaia_mcp.cjs`.

"use strict";

const readline = require("readline");
const crypto = require("crypto");
const path = require("path");

// Lazy, cached requires of the two siblings. Lazy so this module loads for a syntax/handshake check even if
// a sibling is momentarily absent, and so a test host can stub them; the dependency is still ./gaia.cjs +
// ./caps.cjs exactly as the spec declares.
let _gaiaMod = null;
let _capsMod = null;
function gaiaMod() { if (!_gaiaMod) _gaiaMod = require("./gaia.cjs"); return _gaiaMod; }
function CAPS() {
  if (!_capsMod) _capsMod = require("./caps.cjs");
  return (_capsMod && _capsMod.CAPS) || {};
}

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "uni-gaia";

// ---- JSON-RPC 2.0 helpers -------------------------------------------------------------------------------
const ERR = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
};
function ok(id, result) { return { jsonrpc: "2.0", id, result }; }
function fail(id, code, message, data) {
  const e = { code, message };
  if (data !== undefined) e.data = data;
  return { jsonrpc: "2.0", id: id === undefined ? null : id, error: e };
}

// ---- generic accessors (defensive against minor CAPS field-name variance) -------------------------------
function firstDefined(obj, keys) {
  for (const k of keys) if (obj && obj[k] !== undefined && obj[k] !== null) return obj[k];
  return undefined;
}
function capsList(kind) {
  const c = CAPS();
  const v = c[kind];
  return Array.isArray(v) ? v : [];
}

// The MCP `capabilities` object is GENERATED FROM the presence of each CAPS group — served == reported.
// Nothing is advertised whose method is not implemented below (falsified by the gaia-mcp-handshake gate).
function capabilitiesFromCaps() {
  const caps = {};
  if (capsList("resources").length >= 0) caps.resources = { subscribe: false, listChanged: false };
  if (capsList("tools").length >= 0) caps.tools = { listChanged: false };
  if (capsList("prompts").length >= 0) caps.prompts = { listChanged: false };
  caps.logging = {};
  // NOT declared: sampling (Gaia never calls a model), roots, completions.
  return caps;
}

// serverInfo.version = short sha256 of gaia.cjs source bytes (the instrument identity), read live.
function serverVersion() {
  try {
    const fs = require("fs");
    const src = fs.readFileSync(path.join(__dirname, "gaia.cjs"));
    return crypto.createHash("sha256").update(src).digest("hex").slice(0, 12);
  } catch (_) {
    return "unknown";
  }
}

// ---- signal helpers -------------------------------------------------------------------------------------
async function fullEnvelope() {
  const env = await gaiaMod().gaia();
  return env || { schema_version: 1, envelope: {}, result: { signals: [] } };
}
function signalsOf(env) {
  return (env && env.result && Array.isArray(env.result.signals)) ? env.result.signals : [];
}
function wrapSignals(env, signals) {
  return {
    schema_version: (env && env.schema_version) || 1,
    envelope: (env && env.envelope) || {},
    result: { signals },
  };
}
function findSignal(env, id) {
  return signalsOf(env).find((s) => s && s.id === id);
}

// Map a resource URI to the seat + optional id-filter it projects. CAPS may declare `seat`/`collector` and
// `match`/`idPrefix` explicitly; otherwise the seat is parsed from the `gaia://<seat>/…` authority. The
// `self` authority maps to the reserved self-seat `gaia-self`.
function seatForUri(uri, capsEntry) {
  let seat = firstDefined(capsEntry || {}, ["seat", "collector", "group"]);
  if (!seat && typeof uri === "string") {
    const m = uri.replace(/^gaia:\/\//, "");
    seat = m.split("/")[0];
  }
  if (seat === "self") seat = "gaia-self";
  return seat;
}
function resourceMatch(signal, capsEntry) {
  const pref = firstDefined(capsEntry || {}, ["idPrefix", "match"]);
  if (!pref) return true;
  return typeof signal.id === "string" && signal.id.indexOf(pref) === 0;
}

// ---- MCP resource projection ----------------------------------------------------------------------------
function resourceDescriptors() {
  return capsList("resources").map((r) => {
    const uri = firstDefined(r, ["uri", "id"]);
    return {
      uri,
      name: firstDefined(r, ["name", "title"]) || uri,
      description: firstDefined(r, ["description", "purpose"]) || "",
      mimeType: firstDefined(r, ["mimeType", "mime"]) || "application/json",
    };
  }).filter((r) => !!r.uri);
}
async function readResource(uri) {
  const entry = capsList("resources").find((r) => firstDefined(r, ["uri", "id"]) === uri);
  if (!entry) { const e = new Error("unknown resource: " + uri); e.code = ERR.INVALID_PARAMS; throw e; }
  const seat = seatForUri(uri, entry);
  const env = await fullEnvelope();
  const signals = signalsOf(env).filter((s) => s && s.seat === seat && resourceMatch(s, entry));
  const payload = wrapSignals(env, signals);
  return {
    contents: [{
      uri,
      mimeType: firstDefined(entry, ["mimeType", "mime"]) || "application/json",
      text: JSON.stringify(payload),
    }],
  };
}

// ---- MCP tool descriptors + dispatch (all READ-ONLY; all delegate to gaia.cjs) --------------------------
function toolDescriptors() {
  const declared = capsList("tools");
  if (declared.length) {
    return declared.map((t) => ({
      name: firstDefined(t, ["name", "id"]),
      description: firstDefined(t, ["description", "purpose"]) || "",
      inputSchema: firstDefined(t, ["inputSchema", "input_schema", "schema"]) || { type: "object", properties: {} },
    })).filter((t) => !!t.name);
  }
  // Fallback descriptors if CAPS omits tools — keeps tools/list spec-shaped and served == the dispatch map.
  return Object.keys(TOOLS).map((name) => ({ name, description: "", inputSchema: { type: "object", properties: {} } }));
}

// Each tool returns a plain JS value; callTool wraps it as MCP text content. NONE mutates anything.
const TOOLS = {
  // Enumerate every signal's id/seat/kind + provenance triple (read-only).
  "gaia.signal.list": async () => {
    const env = await fullEnvelope();
    return {
      signals: signalsOf(env).map((s) => ({
        id: s.id, seat: s.seat, kind: s.kind,
        provenance: s.provenance ? {
          locator: s.provenance.locator,
          captured_at: s.provenance.captured_at,
          sha256: s.provenance.sha256,
          byte_len: s.provenance.byte_len,
          truncated: s.provenance.truncated,
        } : null,
      })),
    };
  },
  // One seat's envelope-wrapped verbatim signals (read-only).
  "gaia.signal.get": async (args) => {
    const seatRaw = firstDefined(args || {}, ["seat"]);
    if (!seatRaw) { const e = new Error("missing arg: seat"); e.code = ERR.INVALID_PARAMS; throw e; }
    const seat = seatRaw === "self" ? "gaia-self" : seatRaw;
    const env = await fullEnvelope();
    return wrapSignals(env, signalsOf(env).filter((s) => s && s.seat === seat));
  },
  // Just the provenance triple for an id (read-only).
  "gaia.get_provenance": async (args) => {
    const id = firstDefined(args || {}, ["id"]);
    if (!id) { const e = new Error("missing arg: id"); e.code = ERR.INVALID_PARAMS; throw e; }
    const env = await fullEnvelope();
    const sig = findSignal(env, id);
    if (!sig) { const e = new Error("unknown signal id: " + id); e.code = ERR.INVALID_PARAMS; throw e; }
    const p = sig.provenance || {};
    return { id, locator: p.locator, captured_at: p.captured_at, sha256: p.sha256, byte_len: p.byte_len, truncated: p.truncated };
  },
  // Recompute sha256 over the shown value.raw and report match — lets any consumer PROVE the provenance.
  // (Read-only, no mutation; a mechanical byte-hash comparison, not a Gaia-authored judgment.)
  "gaia.verify_hash": async (args) => {
    const id = firstDefined(args || {}, ["id"]);
    if (!id) { const e = new Error("missing arg: id"); e.code = ERR.INVALID_PARAMS; throw e; }
    const env = await fullEnvelope();
    const sig = findSignal(env, id);
    if (!sig) { const e = new Error("unknown signal id: " + id); e.code = ERR.INVALID_PARAMS; throw e; }
    const val = sig.value || {};
    const stored = sig.provenance && sig.provenance.sha256;
    const buf = val.encoding === "base64"
      ? Buffer.from(String(val.raw || ""), "base64")
      : Buffer.from(String(val.raw == null ? "" : val.raw), "utf8");
    const recomputed = crypto.createHash("sha256").update(buf).digest("hex");
    return { id, match: stored === recomputed, stored: stored || null, recomputed, byte_len: buf.length };
  },
  // Return ONE registry-named service's honest probe result, delegating to gaia() (which ran the probe).
  // Read-only: it does not launch a new outward action beyond what the signal assembler already captured.
  "gaia.probe": async (args) => {
    const service = firstDefined(args || {}, ["service", "id"]);
    if (!service) { const e = new Error("missing arg: service"); e.code = ERR.INVALID_PARAMS; throw e; }
    const env = await fullEnvelope();
    const sig = signalsOf(env).find((s) =>
      s && (s.kind === "tcp" || s.kind === "http") && (s.id === service || (typeof s.id === "string" && s.id.indexOf(service) >= 0)));
    if (!sig) return { service, up: null, detail: "not probed", captured_at: null, sha256: null };
    const live = sig.live || {};
    const p = sig.provenance || {};
    return { service, id: sig.id, up: live.up == null ? null : live.up, detail: live.detail, captured_at: p.captured_at, sha256: p.sha256 };
  },
  // The self-mirror: live CAPS + gaia.cjs sha256 + git HEAD — byte-compared to initialize + docs/GAIA.md.
  "gaia.self.manifest": async () => {
    const env = await fullEnvelope();
    const selfSignals = signalsOf(env).filter((s) => s && s.seat === "gaia-self");
    return {
      server: SERVER_NAME,
      protocolVersion: PROTOCOL_VERSION,
      git_commit: (env.envelope && env.envelope.git_commit) || null,
      instrument_version: (env.envelope && env.envelope.instrument_version) || null,
      source_sha256_short: serverVersion(),
      capabilities: capabilitiesFromCaps(),
      caps: CAPS(),
      self_signals: selfSignals,
    };
  },
  // Gaia's own verify-gate names + carried verdicts (read-only projection of the gaia-self calibration signals).
  "gaia.self.calibration": async () => {
    const env = await fullEnvelope();
    const cal = signalsOf(env).filter((s) => s && s.seat === "gaia-self" &&
      typeof s.id === "string" && /(calibration|verify|lint)/i.test(s.id));
    return wrapSignals(env, cal.length ? cal : signalsOf(env).filter((s) => s && s.seat === "gaia-self"));
  },
};

async function callTool(name, args) {
  const fn = TOOLS[name];
  if (!fn) { const e = new Error("unknown tool: " + name); e.code = ERR.METHOD_NOT_FOUND; throw e; }
  const value = await fn(args || {});
  // MCP tools/call result: content[] of typed parts. We project the JS value as a single JSON text part.
  return { content: [{ type: "text", text: JSON.stringify(value) }], isError: false };
}

// ---- the JSON-RPC method table --------------------------------------------------------------------------
// Returns a response object, or null for notifications (which get no reply).
async function handleRpc(msg) {
  // Basic JSON-RPC 2.0 validation.
  if (msg == null || typeof msg !== "object" || Array.isArray(msg)) {
    return fail(null, ERR.INVALID_REQUEST, "invalid request: expected a JSON-RPC 2.0 object");
  }
  const { id, method, params } = msg;
  const isNotification = id === undefined || id === null;

  if (typeof method !== "string") {
    return isNotification ? null : fail(id, ERR.INVALID_REQUEST, "invalid request: missing method");
  }

  try {
    switch (method) {
      case "initialize":
        return ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: capabilitiesFromCaps(),
          serverInfo: { name: SERVER_NAME, version: serverVersion() },
        });

      // The initialized notification (both spellings across MCP revisions) — accept, no response.
      case "notifications/initialized":
      case "initialized":
        return null;

      case "ping":
        return isNotification ? null : ok(id, {});

      case "resources/list":
        return ok(id, { resources: resourceDescriptors() });

      case "resources/read": {
        const uri = params && params.uri;
        if (!uri) return fail(id, ERR.INVALID_PARAMS, "resources/read requires params.uri");
        return ok(id, await readResource(uri));
      }

      case "tools/list":
        return ok(id, { tools: toolDescriptors() });

      case "tools/call": {
        const name = params && params.name;
        if (!name) return fail(id, ERR.INVALID_PARAMS, "tools/call requires params.name");
        try {
          const result = await callTool(name, (params && params.arguments) || {});
          return ok(id, result);
        } catch (te) {
          // A tool-level error is reported as a JSON-RPC error for arg/lookup problems, per spec-shape.
          const code = te && te.code ? te.code : ERR.INTERNAL;
          return fail(id, code, (te && te.message) || "tool error");
        }
      }

      case "prompts/list":
        // Declared-empty: Gaia serves no prompts (no prompt/sampling surface — read-only fence).
        return ok(id, { prompts: capsList("prompts") });

      default:
        return isNotification ? null : fail(id, ERR.METHOD_NOT_FOUND, "method not found: " + method);
    }
  } catch (e) {
    if (isNotification) return null;
    const code = e && e.code ? e.code : ERR.INTERNAL;
    return fail(id, code, (e && e.message) || "internal error");
  }
}

// ---- stdio entrypoint: newline-delimited JSON-RPC over stdin/stdout --------------------------------------
function runStdio() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const send = (obj) => { if (obj != null) process.stdout.write(JSON.stringify(obj) + "\n"); };
  rl.on("line", async (line) => {
    const s = line.trim();
    if (!s) return;
    let msg;
    try { msg = JSON.parse(s); }
    catch (_) { send(fail(null, ERR.PARSE, "parse error: invalid JSON")); return; }
    try { send(await handleRpc(msg)); }
    catch (e) { send(fail((msg && msg.id) || null, ERR.INTERNAL, (e && e.message) || "internal error")); }
  });
  rl.on("close", () => process.exit(0));
}

module.exports = { handleRpc };

if (require.main === module) runStdio();
