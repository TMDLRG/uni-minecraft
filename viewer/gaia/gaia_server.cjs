// gaia_server.cjs — the persistent HTTP+UI host for Gaia (the one read-only URL).
//
// GAIA LAW: Gaia projects DIRECT signals with a full provenance triple (locator, captured_at, sha256)
// and NEVER summarizes, scores, ranks, narrates, or authors a verdict. This file is a thin GET-ONLY
// transport in front of gaia.cjs — it computes nothing itself; it only serves the envelopes gaia.cjs
// assembles, plus a live self-verify (sha256 rehash of a shown signal) and the no-summarization lint.
//
// FENCES (structural, not policy):
//   * G-PA by OMISSION — there is NO POST / PUT / DELETE / PATCH branch anywhere in this file. Any
//     non-GET method is answered 405. So this surface cannot mutate a gate, hold a key, or trigger an
//     outward action: the capability simply does not exist in the code.
//   * READ-ONLY — the server writes NOTHING. It reads gaia.cjs envelopes and reads existing snapshots
//     via snapshot.cjs (readSnapshot/listSnapshots). It never calls writeSnapshot (capture is a separate
//     path), so an anonymous GET can never cause a disk write.
//   * NO IP LITERAL — the advertised host is derived as `gaia.${zone}` from viewer/infra_registry.json
//     (the one sanctioned name map). Gaia has no registry entry of its own and may not add one (write
//     fence); that gap is surfaced by gaia.cjs as a drift signal, not worked around with a literal here.
//     The socket binds 0.0.0.0 (like launcher.cjs / command_center.cjs's status listener) so the
//     gaia.<zone> DNS name reaches it LAN-wide.
//   * Cache-Control:no-store + Access-Control-Allow-Origin:* on every response (world+operator see the
//     same bytes; nothing is cached/stale).
//
// Routes (all GET):
//   /                      -> gaia.html (alias of /gaia)
//   /gaia                  -> gaia.html
//   /api/gaia              -> full envelope (all signals) from gaia.cjs
//   /api/gaia/self         -> the gaia-self seat's signals only
//   /api/gaia/:seat        -> one seat's signals (envelope-wrapped)
//   /api/gaia/verify/:id   -> {id, match, stored, recomputed, byte_len} — live sha256 rehash of the
//                             shown value.raw for one signal id (lets any consumer prove provenance)
//   /api/gaia/lint         -> the verbatim no-summarization lint result over the live envelope
//   /api/gaia/snapshots    -> the committed append-only hashed-capture index (read-only)
// Any other GET -> 404. Any non-GET -> 405.
//
// Exports { startServer }. Runnable directly: `node gaia_server.cjs` (env GAIA_PORT overrides 8096).

const http = require("http");
const path = require("path");
const crypto = require("crypto");

const DIR = __dirname;
const HTML_PATH = path.join(DIR, "gaia.html");
const PORT = parseInt(process.env.GAIA_PORT, 10) || 8096;
const BIND = "0.0.0.0"; // LAN-wide so gaia.<zone> resolves to us; not an IP literal — see header.

// --- zone (advertised FQDN) from the one sanctioned name map, never an IP literal ----------------------
function zone() {
  try {
    // require cache is fine; the registry is static declared data, not an IP the server contacts.
    return require("../infra_registry.json").zone || "uni-lab.local";
  } catch (_) {
    return "uni-lab.local";
  }
}
const ADVERTISED_HOST = () => `gaia.${zone()}`;

// --- lazy, fault-tolerant sibling loading -------------------------------------------------------------
// The Gaia modules are built by peer agents in this same slice. Load them lazily so this transport can
// start and answer honestly ("module not loaded: <detail>") even before a sibling has landed, rather
// than crashing the whole surface. Each load is cached on success.
const _cache = new Map();
function loadMod(rel) {
  if (_cache.has(rel)) return { mod: _cache.get(rel), err: null };
  try {
    const m = require(rel);
    _cache.set(rel, m);
    return { mod: m, err: null };
  } catch (e) {
    return { mod: null, err: e && e.message ? e.message : String(e) };
  }
}
const getGaia = () => loadMod("./gaia.cjs");
const getSnapshot = () => loadMod("./snapshot.cjs");
const getLint = () => loadMod("./gaia_lint.cjs");

// --- response helpers ---------------------------------------------------------------------------------
const HEADERS_JSON = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};
const HEADERS_HTML = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
};

function j(res, code, obj) {
  res.writeHead(code, HEADERS_JSON);
  res.end(JSON.stringify(obj));
}

// honest failure shape when a sibling module is not yet loadable — no fabricated data.
function moduleUnavailable(res, name, err) {
  j(res, 503, { error: "module_not_loaded", module: name, detail: err, advertised_host: ADVERTISED_HOST() });
}

// honest failure shape when fullEnvelope() hit its own transport-level ceiling (see above) — distinct
// from module_not_loaded so a genuine timeout is never mistaken for a missing/broken sibling module.
function envelopeTimeout(res, err) {
  j(res, 504, { error: "envelope_timeout", detail: err, advertised_host: ADVERTISED_HOST() });
}

// --- envelope helpers (projection only; this file computes no signals) --------------------------------
// TRANSPORT-LEVEL CEILING (fixed 2026-07-14): gaia.cjs and infra.cjs now bound every collector
// individually (see their own fix comments), but this is the last line of defense for the actual
// externally-observed symptom — a client socket (curl, browser, the HUD) that never gets a response
// and sits open forever. If mod.gaia() somehow still doesn't settle within this ceiling (a future
// collector nobody bounded yet, a module-load stall, anything), the REQUEST fails honestly with a
// 504 instead of the connection hanging indefinitely. This does not mask a real hang — it surfaces
// one as a clear, timely error instead of an invisible dead socket.
const ENVELOPE_TIMEOUT_MS = 45000;

// SINGLE-FLIGHT COALESCING (added 2026-07-14): live-measured concurrent load — the UNI-HUD native
// service polls /api/gaia/drift every 12s (PollWorker.cs), and every seat route still computes the
// FULL envelope internally before filtering (see projectSeat below) — so under real always-on
// conditions, multiple full gaia() computations were already overlapping in flight, each paying the
// full collector cost independently and contending for the same child-process/network resources.
// This is a pure efficiency fix, not a freshness change: concurrent requests arriving within the same
// in-flight window represent the same "now" anyway, so they share ONE computation instead of each
// starting a redundant one. The in-flight reference clears the moment it settles (success OR failure),
// so the request immediately after always starts a fresh capture — no stale caching, no GAIA LAW
// concern (this coalesces IDENTICAL concurrent work; it never serves an old result to a later request).
let inFlightEnvelope = null;
async function fullEnvelope() {
  const { mod, err } = getGaia();
  if (!mod || typeof mod.gaia !== "function") {
    throw Object.assign(new Error(err || "gaia.cjs has no gaia()"), { code: "GAIA_UNAVAILABLE" });
  }
  if (inFlightEnvelope) return inFlightEnvelope;
  const p = Promise.race([
    mod.gaia(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error(`gaia() exceeded ${ENVELOPE_TIMEOUT_MS}ms`), { code: "GAIA_TIMEOUT" })),
        ENVELOPE_TIMEOUT_MS
      )
    ),
  ]);
  inFlightEnvelope = p;
  try {
    return await p;
  } finally {
    inFlightEnvelope = null;
  }
}

// Return a shallow projection of the envelope keeping only signals whose seat matches, WITHOUT altering
// any signal bytes or adding any computed field. This is a lossless filter (allowed), not a summary.
function projectSeat(env, seat) {
  const signals = ((env && env.result && env.result.signals) || []).filter((s) => s && s.seat === seat);
  return Object.assign({}, env, { result: Object.assign({}, env && env.result, { signals }) });
}

// --- route handlers -----------------------------------------------------------------------------------
function serveHtml(res) {
  const fs = require("fs");
  fs.readFile(HTML_PATH, (err, buf) => {
    if (err) {
      // honest: the UI asset is not on disk yet (peer agent builds gaia.html). Say so; do not fabricate.
      res.writeHead(404, HEADERS_HTML);
      res.end(
        "<!-- gaia.html not found on disk (" +
          HTML_PATH +
          ") — the API at /api/gaia is authoritative; the UI asset is a separate deliverable. -->"
      );
      return;
    }
    res.writeHead(200, HEADERS_HTML);
    res.end(buf);
  });
}

async function handleApiGaia(res) {
  try {
    const env = await fullEnvelope();
    j(res, 200, env);
  } catch (e) {
    if (e && e.code === "GAIA_TIMEOUT") return envelopeTimeout(res, e.message);
    return moduleUnavailable(res, "gaia.cjs", e.message);
  }
}

async function handleSeat(res, seat) {
  try {
    const env = await fullEnvelope();
    j(res, 200, projectSeat(env, seat));
  } catch (e) {
    if (e && e.code === "GAIA_TIMEOUT") return envelopeTimeout(res, e.message);
    return moduleUnavailable(res, "gaia.cjs", e.message);
  }
}

// Live provenance proof: recompute sha256 over EXACTLY the shown value.raw bytes (decoded per its
// declared encoding) and compare to the stored provenance.sha256. This is the transport half of the
// gaia-rehash-integrity gate — a mechanical byte-comparison, not an interpretation.
async function handleVerify(res, id) {
  let env;
  try {
    env = await fullEnvelope();
  } catch (e) {
    return moduleUnavailable(res, "gaia.cjs", e.message);
  }
  const signals = (env && env.result && env.result.signals) || [];
  const sig = signals.find((s) => s && s.id === id);
  if (!sig) {
    return j(res, 404, { error: "signal_not_found", id });
  }
  const val = sig.value || {};
  const enc = val.encoding === "base64" ? "base64" : "utf8";
  const buf = Buffer.from(val.raw != null ? val.raw : "", enc);
  const recomputed = crypto.createHash("sha256").update(buf).digest("hex");
  const stored = (sig.provenance && sig.provenance.sha256) || null;
  j(res, 200, {
    id,
    match: stored != null && recomputed === stored,
    stored,
    recomputed,
    byte_len: buf.length,
    encoding: enc,
  });
}

function handleLint(res) {
  const { mod, err } = getLint();
  if (!mod || typeof mod.lint !== "function") {
    return moduleUnavailable(res, "gaia_lint.cjs", err || "gaia_lint.cjs has no lint()");
  }
  const g = getGaia();
  if (!g.mod || typeof g.mod.gaia !== "function") {
    return moduleUnavailable(res, "gaia.cjs", g.err || "gaia.cjs has no gaia()");
  }
  // gaia() is ASYNC — resolve the live envelope and pass it in explicitly so lint() actually lints the
  // live signals. lint() with no arg self-fetches gaia(), sees a promise, and skips live linting (which
  // returned a vacuous live_signals:0 / ok:true). Read-only; result carried verbatim.
  Promise.resolve()
    .then(() => g.mod.gaia())
    .then((env) => mod.lint({ envelope: env }))
    .then((result) => j(res, 200, result))
    .catch((e) => j(res, 500, { error: "lint_failed", detail: e && e.message ? e.message : String(e) }));
}

function handleSnapshots(res) {
  const { mod, err } = getSnapshot();
  if (!mod || typeof mod.listSnapshots !== "function") {
    return moduleUnavailable(res, "snapshot.cjs", err || "snapshot.cjs has no listSnapshots()");
  }
  Promise.resolve()
    .then(() => mod.listSnapshots())
    .then((index) => j(res, 200, { advertised_host: ADVERTISED_HOST(), snapshots: index }))
    .catch((e) => j(res, 500, { error: "snapshots_failed", detail: e && e.message ? e.message : String(e) }));
}

// --- the request router (GET-only by construction) ----------------------------------------------------
function route(req, res) {
  // G-PA by structural omission: no non-GET method has ANY handler. Reject them before routing.
  if (req.method !== "GET") {
    res.writeHead(405, Object.assign({ Allow: "GET" }, HEADERS_JSON));
    res.end(JSON.stringify({ error: "method_not_allowed", method: req.method, note: "Gaia is read-only; GET only." }));
    return;
  }

  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch (_) {
    return j(res, 400, { error: "bad_request" });
  }

  if (pathname === "/" || pathname === "/gaia" || pathname === "/gaia.html") {
    return serveHtml(res);
  }
  if (pathname === "/api/gaia") {
    return void handleApiGaia(res);
  }
  if (pathname === "/api/gaia/self") {
    return void handleSeat(res, "gaia-self");
  }
  if (pathname === "/api/gaia/lint") {
    return handleLint(res);
  }
  if (pathname === "/api/gaia/snapshots") {
    return handleSnapshots(res);
  }
  const mVerify = pathname.match(/^\/api\/gaia\/verify\/(.+)$/);
  if (mVerify) {
    return void handleVerify(res, decodeURIComponent(mVerify[1]));
  }
  const mSeat = pathname.match(/^\/api\/gaia\/([^/]+)$/);
  if (mSeat) {
    return void handleSeat(res, decodeURIComponent(mSeat[1]));
  }

  return j(res, 404, { error: "not_found", path: pathname });
}

// --- server factory -----------------------------------------------------------------------------------
function startServer(opts) {
  opts = opts || {};
  const port = opts.port || PORT;
  const bind = opts.bind || BIND;
  const server = http.createServer((req, res) => {
    try {
      route(req, res);
    } catch (e) {
      // never leak a stack to the wire; answer honestly.
      try {
        j(res, 500, { error: "internal", detail: e && e.message ? e.message : String(e) });
      } catch (_) {
        /* headers already sent */
      }
    }
  });
  server.listen(port, bind, () => {
    // Banner uses the DNS-derived FQDN, never an IP literal.
    console.log(
      `Gaia (read-only, GET-only) on http://${ADVERTISED_HOST()}:${port}/gaia  ` +
        `(bound ${bind}; API at /api/gaia; NO POST/PUT/DELETE branch — G-PA by omission)`
    );
  });
  return server;
}

module.exports = { startServer };

// Direct-run entrypoint.
if (require.main === module) {
  startServer();
}
