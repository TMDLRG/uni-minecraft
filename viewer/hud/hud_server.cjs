// hud_server.cjs -- UNI HUD HTTP host. The third independent surface.
//
// Binds 0.0.0.0:8100 (LAN-visible; reachable at hud.uni-lab.local:8100).
// GET-only surface + ONE allowlisted POST (audience/publish, loopback + header).
// Every other method -> 405 (structural fence).
//
// Polls the upstream truth surfaces every 3s (matches the repo's shared cadence):
//   - launcher :8090 /api/status       (composed door + journey + stack + studio_ports)
//   - gaia     :8096 /api/gaia         (envelope + signals; used for provenance chips)
//   - console  :8098 /api/health       (optional; only when studio is up)
//
// Snapshots are buffered in bounded rings (hud_ring.cjs) so the HUD can serve
// sparklines for feeds/speeds without a database.
//
// Audience receiver: POST /api/hud/audience/publish accepts sanitizer-vouched
// rows and appends them to a bounded ring for the audience feed pane.
// No sanitization happens here -- upstream must vouch (hud-audience-sanitizer-honest gate).
//
// NO IPv4 LITERAL except loopback (127.0.0.1) and bind-any (0.0.0.0) -- the
// hud-no-ip-literal gate scans this file.

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { Ring } = require("./hud_ring.cjs");
const { Audience } = require("./hud_audience.cjs");
const { probeAll } = require("./hud_source_probe.cjs");
const { Stub } = require("./hud_fixtures_stub.cjs");
const enlightened = require("./hud_enlightened.cjs");
const eventlog = require("./hud_eventlog.cjs");

const HUD_PORT = Number(process.env.HUD_PORT || 8100);
const HUD_BIND = process.env.HUD_BIND || "0.0.0.0";
const POLL_MS = Number(process.env.HUD_POLL_MS || 3000);
const RING_CAP = Number(process.env.HUD_RING_CAP || 720); // 60 min at 5s tick
const AUDIENCE_CAP = Number(process.env.HUD_AUDIENCE_CAP || 200);
const INSTRUMENT = "hud_server.cjs@1";

// Upstream probe list. Loopback-only literals per no-IP-literal law
// (127.0.0.1 and 0.0.0.0 are the allowlisted values).
//
// Fanned out DELIBERATELY so no single request cascades. Composing /api/status
// (which itself fetches Gaia's 448 KB envelope) was chaining hops and stalling
// keep-alive sockets. Each of these is small, fast, single-purpose.
const UPSTREAMS = [
  { name: "mission",      host: "127.0.0.1", port: 8090, path: "/api/mission",       timeout: 3000 },
  { name: "door_state",   host: "127.0.0.1", port: 8090, path: "/api/door/state",    timeout: 2500 },
  { name: "door_journey", host: "127.0.0.1", port: 8090, path: "/api/door/journey",  timeout: 2500 },
  { name: "gaia_drift",   host: "127.0.0.1", port: 8096, path: "/api/gaia/drift",    timeout: 12000 },
  { name: "console",      host: "127.0.0.1", port: 8098, path: "/api/health",        timeout: 2500 },
];
// Gates come directly from evidence/gates.ndjson on disk (fast, canonical
// source of truth). Gaia projects the same rows but adds a per-request
// collection cost that stalls the 3-s bus.
//
// Path discipline: when running as a caxa-bundled .exe, __dirname is a temp
// extraction dir (not the repo). Prefer HUD_REPO_ROOT env (set by nssm at
// install time) -> process.cwd() (nssm's AppDirectory) -> __dirname fallback.
function _resolveGatesLedger() {
  const envRoot = process.env.HUD_REPO_ROOT;
  if (envRoot && fs.existsSync(path.join(envRoot, "evidence", "gates.ndjson"))) {
    return path.join(envRoot, "evidence", "gates.ndjson");
  }
  const cwdCandidate = path.join(process.cwd(), "evidence", "gates.ndjson");
  if (fs.existsSync(cwdCandidate)) return cwdCandidate;
  return path.resolve(__dirname, "..", "..", "evidence", "gates.ndjson");
}
const GATES_LEDGER = _resolveGatesLedger();

// --- state --------------------------------------------------------------
const state = {
  started_at: Date.now(),
  git_commit: readGitCommit(),
  poll_count: 0,
  last_poll_at: null,
  last_snapshot: null,      // { launcher, gaia, console } probe results
  audience: new Audience({ cap: AUDIENCE_CAP }),
  last_gates_ok: null,
  last_gates_err: null,
  sight_since: new Map(),   // finding.code -> first-seen ts (persistent across polls)
  last_up_by_upstream: {},  // upstream_name -> last known `up` value (for edge detection)
  last_sight_codes: new Set(),  // codes seen last poll (for new-finding EventLog emissions)
  last_sight: null,             // cached sight from most recent poll
  user_sight_findings: [],      // findings pushed by hud_user_sight.ps1 (user-mode helper)
  user_sight_last_push_at: null,
  user_sight_last_push_from: null,
  rings: {
    stack:              new Ring(RING_CAP),   // 0 DOWN, 1 PARTIAL, 2 UP
    producer_up:        new Ring(RING_CAP),   // 0 or 1
    colony_latency_ms:  new Ring(RING_CAP),   // number
    gaia_latency_ms:    new Ring(RING_CAP),   // number
    launcher_latency_ms:new Ring(RING_CAP),   // number
    audience_count:     new Ring(RING_CAP),   // running total
  },
  stub: null,
};

function readGitCommit() {
  try {
    const repoRoot = path.resolve(__dirname, "..", "..");
    return execSync("git rev-parse HEAD", { cwd: repoRoot, timeout: 1500 }).toString().trim().slice(0, 40);
  } catch (_) { return null; }
}

// Read evidence/gates.ndjson from disk. Returns [{name, verdict, evidence_class, phase, last_updated}]
// with supersede semantics honored: later rows override earlier rows of the same name.
function readGatesLedger() {
  try {
    const raw = fs.readFileSync(GATES_LEDGER, "utf8");
    const bySeen = new Map();
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const row = JSON.parse(t);
        if (row && row.name && row.verdict) {
          bySeen.set(row.name, {
            name: row.name, verdict: row.verdict, evidence_class: row.evidence_class,
            phase: row.phase, last_updated: row.last_updated,
          });
        }
      } catch (_) { /* skip malformed row */ }
    }
    state.last_gates_ok = true;
    state.last_gates_err = null;
    return [...bySeen.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (e) {
    state.last_gates_ok = false;
    state.last_gates_err = e.message || String(e);
    return [];
  }
}

// --- poll loop ----------------------------------------------------------
async function pollOnce() {
  const t0 = Date.now();
  let results = [];
  try { results = await probeAll(UPSTREAMS); }
  catch (_) { results = UPSTREAMS.map((s) => ({ name: s.name, up: null, err: "probe-crashed" })); }

  const byName = Object.fromEntries(results.map((r) => [r.name, r]));

  // Windows Event Log: emit on upstream up<->down edges (not every poll)
  for (const [name, r] of Object.entries(byName)) {
    const prev = state.last_up_by_upstream[name];
    const now_up = (r && r.up === true);
    if (prev !== undefined && prev !== now_up) {
      if (now_up) eventlog.upstreamRecovered(name, `HTTP ${r.status} in ${r.latencyMs}ms`);
      else eventlog.upstreamDegraded(name, r.err || `HTTP ${r.status}`);
    }
    state.last_up_by_upstream[name] = now_up;
  }

  state.last_snapshot = byName;
  state.last_poll_at = Date.now();
  state.poll_count += 1;

  // Sight is gathered EVERY poll (not just on browser hits) so EventLog gets
  // fresh findings even when no one is watching. Merges service-context sight
  // (from enlightened.gather) with user-mode sight (POSTed by hud_user_sight.ps1
  // running in the operator's logon session -- covers OBS sentinel + anything
  // else in the user's profile that a LocalSystem service cannot see).
  try {
    const snap = buildSnapshotInternal();
    const svcSight = enlightened.gather(snap, {
      last_poll_at: state.last_poll_at, poll_interval_ms: POLL_MS, rings: state.rings,
    }, state.last_snapshot && state.last_snapshot.door_journey && state.last_snapshot.door_journey.body || null, state.sight_since);
    // Merge in user-mode findings (drop if last push is older than 90s -- stale)
    const userFresh = state.user_sight_last_push_at && (Date.now() - state.user_sight_last_push_at < 90000);
    const userFindings = userFresh ? (state.user_sight_findings || []) : [];
    // Compute since_ms for user findings via the same sinceMap
    const now = Date.now();
    for (const f of userFindings) {
      if (!state.sight_since.has(f.code)) state.sight_since.set(f.code, now);
      f.since_ms = now - state.sight_since.get(f.code);
    }
    // Drop stale user-code since entries -- align lifetime with the merged output
    const merged = [...svcSight.findings, ...userFindings];
    snap.sight = {
      updated_at: svcSight.updated_at,
      total: merged.length,
      counts: {
        bad:  merged.filter((f) => f.severity === "bad").length,
        warn: merged.filter((f) => f.severity === "warn").length,
        info: merged.filter((f) => f.severity === "info").length,
      },
      findings: merged,
      user_sight: {
        fresh: userFresh,
        last_push_at: state.user_sight_last_push_at,
        last_push_from: state.user_sight_last_push_from,
        count: userFindings.length,
      },
    };
    // EventLog: emit on the FIRST appearance of any (service OR user) finding
    const currentCodes = new Set(merged.map((f) => f.code));
    for (const f of merged) {
      if (state.last_sight_codes.has(f.code)) continue;
      if (f.severity === "bad") eventlog.sightBad(f.code, f.title);
      else if (f.severity === "warn") eventlog.sightWarn(f.code, f.title);
    }
    state.last_sight_codes = currentCodes;
    state.last_sight = snap.sight;
  } catch (e) { /* sight failures never break the poll loop */ }

  // extract sparkline metrics honestly (source-verbatim, no HUD-derived aggregate)
  const mission = byName.mission || {};
  const stack = mission.body && mission.body.stack;
  const stackN = stack === "UP" ? 2 : stack === "PARTIAL" ? 1 : 0;
  state.rings.stack.push(stackN);
  state.rings.launcher_latency_ms.push(typeof mission.latencyMs === "number" ? mission.latencyMs : null);
  const gaia = byName.gaia_drift || {};
  state.rings.gaia_latency_ms.push(typeof gaia.latencyMs === "number" ? gaia.latencyMs : null);
  const tiles = (mission.body && mission.body.tiles) || [];
  const colonyTile = tiles.find((t) => t.key === "colony") || {};
  const colonyDetail = colonyTile.detail || "";
  const producerUp = /verdict=LIVE|driver=producer/.test(colonyDetail) ? 1 : 0;
  state.rings.producer_up.push(producerUp);
  state.rings.colony_latency_ms.push(null);
  state.rings.audience_count.push(state.audience.size);

  return { durationMs: Date.now() - t0 };
}

let pollTimer = null;
function startPolling() {
  if (pollTimer) return;
  pollOnce().catch(() => {});
  pollTimer = setInterval(() => { pollOnce().catch(() => {}); }, POLL_MS);
}
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// --- envelope ------------------------------------------------------------
function envelope(result) {
  return {
    schema_version: 1,
    envelope: {
      server: "uni-hud",
      instrument: INSTRUMENT,
      git_commit: state.git_commit,
      timestamp: new Date().toISOString(),
    },
    result,
  };
}

// --- snapshot builder ---------------------------------------------------
// buildSnapshotInternal returns the composed data (no sight). Called from the
// poll loop (before sight is gathered) AND from buildSnapshotWithSight.
function buildSnapshotInternal() { return _buildComposed(); }

function buildSnapshot() { return _buildComposed(); }

function _buildComposed() {
  const snap = state.last_snapshot || {};
  const mission = snap.mission || {};
  const doorSt = snap.door_state || {};
  const doorJn = snap.door_journey || {};
  const gaiaDrift = snap.gaia_drift || {};
  const console_ = snap.console || {};

  const mb = mission.body || {};
  const stack = mb.stack || null;
  const tiles = mb.tiles || [];
  // studio_ports keyed by tile.key (same shape /api/status uses)
  const studio_ports = Object.fromEntries(tiles.map((t) => [t.key, { up: t.up, detail: t.detail }]));

  // door_open in the /api/status shape: {key: {open, locked, circle_ok, prediction}}
  let door_open = null;
  const doorList = (doorSt.body && doorSt.body.doors) || null;
  if (doorList) {
    door_open = Object.fromEntries(doorList.map((d) => [d.key, {
      open: d.open, locked: d.locked, circle_ok: d.circle_ok, prediction: d.prediction || "",
    }]));
  }

  // journey_current_step from door_journey
  let journey_current_step = null;
  const jSteps = (doorJn.body && doorJn.body.steps) || null;
  if (jSteps) {
    const cur = jSteps.find((s) => s.status === "current");
    if (cur) {
      const nextThree = jSteps.filter((s) => s.status === "pending").slice(0, 3).map((s) => s.id);
      journey_current_step = { id: cur.id, label: cur.label, desc: cur.desc, live: cur.live, predicts_next: nextThree };
    }
  }

  // gates rows read DIRECTLY from evidence/gates.ndjson -- the canonical
  // append-only ledger, same bytes Gaia projects. Direct-read is fast, does
  // not depend on Gaia's poll, and remains honest (this IS the source).
  const gates_rows = readGatesLedger();

  // drift rows from Gaia's drift seat — source-verbatim projection
  const drift_rows = [];
  const dSignals = (gaiaDrift.body && gaiaDrift.body.result && gaiaDrift.body.result.signals) || [];
  for (const s of dSignals) {
    if (s.kind !== "drift") continue;
    try {
      const v = s.value && s.value.raw;
      const parsed = typeof v === "string" ? JSON.parse(v) : v;
      drift_rows.push({ id: s.id, relation: parsed && parsed.relation, equal: parsed && parsed.equal });
    } catch (_) { drift_rows.push({ id: s.id, relation: null, equal: null }); }
  }

  return {
    hud: {
      version: INSTRUMENT,
      port: HUD_PORT,
      bind: HUD_BIND,
      uptime_ms: Date.now() - state.started_at,
      poll_count: state.poll_count,
      poll_interval_ms: POLL_MS,
      last_poll_at: state.last_poll_at,
    },
    upstreams: {
      mission:      { up: mission.up,   status: mission.status || null,   latencyMs: mission.latencyMs || null,   err: mission.err || null, url: "http://127.0.0.1:8090/api/mission" },
      door_state:   { up: doorSt.up,    status: doorSt.status || null,    latencyMs: doorSt.latencyMs || null,    err: doorSt.err || null,  url: "http://127.0.0.1:8090/api/door/state" },
      door_journey: { up: doorJn.up,    status: doorJn.status || null,    latencyMs: doorJn.latencyMs || null,    err: doorJn.err || null,  url: "http://127.0.0.1:8090/api/door/journey" },
      gaia_drift:   { up: gaiaDrift.up, status: gaiaDrift.status || null, latencyMs: gaiaDrift.latencyMs || null, err: gaiaDrift.err || null, url: "http://127.0.0.1:8096/api/gaia/drift" },
      console:      { up: console_.up,  status: console_.status || null,  latencyMs: console_.latencyMs || null,  err: console_.err || null, url: "http://127.0.0.1:8098/api/health" },
      gates_ledger: { up: state.last_gates_ok, status: null, latencyMs: null, err: state.last_gates_err || null, url: `file://${GATES_LEDGER}` },
    },
    stack: stack ? { state: stack, source: "launcher /api/mission .stack" } : { state: null, source: "launcher UNREACHABLE" },
    journey_current_step,
    door_open,
    studio_ports,
    gaia: { drift_rows: drift_rows.length, gates_source: "evidence/gates.ndjson (direct)" },
    gates: gates_rows,
    drift: drift_rows,
    audience: { size: state.audience.size, recent_count: Math.min(20, state.audience.size), cap: AUDIENCE_CAP },
    metrics: {
      producer_up: state.rings.producer_up.sparkline(120),
      stack: state.rings.stack.sparkline(120),
      launcher_latency_ms: state.rings.launcher_latency_ms.sparkline(120),
      gaia_latency_ms: state.rings.gaia_latency_ms.sparkline(120),
      audience_count: state.rings.audience_count.sparkline(120),
    },
    sight: null, // filled by buildSnapshotWithSight -- we don't put sight inside the same object to avoid recursion when buildSnapshot is used inside sight detectors
  };
}

// Convenience: snapshot with sight attached. Uses cached poll-loop sight when
// available (guarantees EventLog fired already) and falls back to on-demand
// gather only for the first request before any poll has run.
function buildSnapshotWithSight() {
  const snap = buildSnapshotInternal();
  if (state.last_sight) {
    snap.sight = state.last_sight;
  } else {
    const doorJourneyBody = state.last_snapshot && state.last_snapshot.door_journey && state.last_snapshot.door_journey.body || null;
    snap.sight = enlightened.gather(snap, {
      last_poll_at: state.last_poll_at, poll_interval_ms: POLL_MS, rings: state.rings,
    }, doorJourneyBody, state.sight_since);
  }
  return snap;
}

// --- routing ------------------------------------------------------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "X-UNI-HUD": INSTRUMENT,
  });
  res.end(body);
}

function sendHtml(res, code, htmlPath) {
  try {
    const body = fs.readFileSync(htmlPath);
    res.writeHead(code, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-UNI-HUD": INSTRUMENT,
    });
    res.end(body);
  } catch (_) {
    sendJson(res, 500, { err: "hud.html unreadable" });
  }
}

function methodNotAllowed(res, method) {
  return sendJson(res, 405, { err: "method_not_allowed", method, note: "HUD is GET-only except POST /api/hud/audience/publish." });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > limit) { reject(new Error("payload-too-large")); try { req.destroy(); } catch (_) {} return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const HUD_HTML = path.join(__dirname, "hud.html");

async function handle(req, res) {
  const u = new URL(req.url, "http://x");
  const pathOnly = u.pathname;
  const method = (req.method || "GET").toUpperCase();

  // page
  if (method === "GET" && (pathOnly === "/" || pathOnly === "/hud" || pathOnly === "/hud.html")) {
    return sendHtml(res, 200, HUD_HTML);
  }

  // health -- cheap, no upstream call. Also surfaces the small amount of
  // service-context detail an operator or supervisor needs to reason about
  // what the service can/cannot see.
  if (method === "GET" && pathOnly === "/api/hud/health") {
    const hasOpHome = !!process.env.HUD_OPERATOR_HOME;
    return sendJson(res, 200, envelope({
      ok: true,
      uptime_ms: Date.now() - state.started_at,
      poll_count: state.poll_count,
      last_poll_at: state.last_poll_at,
      port: HUD_PORT,
      bind: HUD_BIND,
      pid: process.pid,
      operator_home_configured: hasOpHome,
      user_sight_last_push_at: state.user_sight_last_push_at || null,
      user_sight_finding_count: state.user_sight_findings ? state.user_sight_findings.length : 0,
    }));
  }

  // snapshot -- the primary aggregator (includes sight)
  if (method === "GET" && pathOnly === "/api/hud/snapshot") {
    return sendJson(res, 200, envelope(buildSnapshotWithSight()));
  }

  // sight -- the ENLIGHTENED SIGHT panel alone (contradictions + rot + runaway)
  // "The HUD sees and shares with all so all can heal and maintain resonance."
  // Findings only -- HUD never heals; that belongs to a separate seat.
  if (method === "GET" && pathOnly === "/api/hud/sight") {
    const snap = buildSnapshotWithSight();
    return sendJson(res, 200, envelope(snap.sight));
  }

  // timeseries -- one metric's sparkline
  if (method === "GET" && pathOnly === "/api/hud/timeseries") {
    const metric = u.searchParams.get("metric") || "";
    const window = Math.min(720, Math.max(1, Number(u.searchParams.get("window") || 120)));
    const ring = state.rings[metric];
    if (!ring) return sendJson(res, 404, envelope({ err: "unknown-metric", metric, available: Object.keys(state.rings) }));
    return sendJson(res, 200, envelope({ metric, window, values: ring.sparkline(window) }));
  }

  // audience recent
  if (method === "GET" && pathOnly === "/api/hud/audience/recent") {
    const n = Math.min(AUDIENCE_CAP, Math.max(1, Number(u.searchParams.get("n") || 20)));
    return sendJson(res, 200, envelope({ n, rows: state.audience.recent(n) }));
  }

  // sight push -- user-mode helper posts findings the service can't see itself
  // (OBS crash sentinels in operator's %APPDATA%, other per-user shell state).
  // Loopback + x-uni-cc:1 header. Fire-and-drop: last push wins; service
  // merges user findings into its own sight output.
  if (pathOnly === "/api/hud/sight/push") {
    if (method !== "POST") return methodNotAllowed(res, method);
    const remote = req.socket && req.socket.remoteAddress || "";
    const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!isLoopback) return sendJson(res, 403, { err: "loopback-only", remote });
    if (req.headers["x-uni-cc"] !== "1") return sendJson(res, 403, { err: "x-uni-cc-header-required" });
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (!ct.startsWith("application/json")) return sendJson(res, 415, { err: "content-type must be application/json" });
    let buf; try { buf = await readBody(req, 128 * 1024); }
    catch (e) { return sendJson(res, 413, { err: "payload-too-large", detail: e.message }); }
    let obj; try { obj = JSON.parse(buf.toString("utf8")); }
    catch (_) { return sendJson(res, 400, { err: "bad-json" }); }
    if (!obj || !Array.isArray(obj.findings)) return sendJson(res, 400, { err: "expected {findings:[{code,severity,title,detail,source}]}" });
    // Validate + normalize each finding. Reject malformed rows; accept the rest.
    const clean = [];
    const pushedFrom = String(obj.pushed_from || "unknown").slice(0, 120);
    for (const f of obj.findings) {
      if (!f || typeof f !== "object") continue;
      if (typeof f.code !== "string" || f.code.length === 0 || f.code.length > 80) continue;
      const sev = f.severity;
      if (sev !== "bad" && sev !== "warn" && sev !== "info") continue;
      clean.push({
        code: `user.${f.code.replace(/[^\w.-]/g, "_")}`,
        severity: sev,
        title: String(f.title || "").slice(0, 200),
        detail: String(f.detail || "").slice(0, 500),
        source: String(f.source || pushedFrom).slice(0, 200),
        since_ms: 0, // will be computed by the merge pass
        pushed_from: pushedFrom,
      });
    }
    state.user_sight_findings = clean;
    state.user_sight_last_push_at = Date.now();
    state.user_sight_last_push_from = pushedFrom;
    return sendJson(res, 202, { ok: true, accepted: clean.length, dropped: obj.findings.length - clean.length });
  }

  // audience publish -- the ONLY allowlisted POST
  if (pathOnly === "/api/hud/audience/publish") {
    if (method !== "POST") return methodNotAllowed(res, method);
    // Loopback-only enforcement (defense in depth; the ACL is at network layer already)
    const remote = req.socket && req.socket.remoteAddress || "";
    const isLoopback = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    if (!isLoopback) return sendJson(res, 403, { err: "loopback-only", remote });
    // Require the header the launcher's POST branch also requires
    if (req.headers["x-uni-cc"] !== "1") return sendJson(res, 403, { err: "x-uni-cc-header-required" });
    const ct = String(req.headers["content-type"] || "").toLowerCase();
    if (!ct.startsWith("application/json")) return sendJson(res, 415, { err: "content-type must be application/json" });
    let buf;
    try { buf = await readBody(req, 64 * 1024); }
    catch (e) { return sendJson(res, 413, { err: "payload-too-large", detail: e.message }); }
    let obj;
    try { obj = JSON.parse(buf.toString("utf8")); }
    catch (_) { return sendJson(res, 400, { err: "bad-json" }); }
    const r = state.audience.accept(obj);
    if (!r.ok) {
      eventlog.audienceRejected(r.code, req.socket && req.socket.remoteAddress || "?");
      return sendJson(res, 400, { err: r.err, code: r.code });
    }
    return sendJson(res, 202, { ok: true, size: state.audience.size });
  }

  // discovery -- self-describing manifest
  if (method === "GET" && pathOnly === "/api/hud/discovery") {
    return sendJson(res, 200, envelope({
      what: "UNI HUD -- third independent surface next to Door + Gaia",
      version: INSTRUMENT,
      routes: {
        "GET /":                              "the HUD page (hud.html)",
        "GET /hud":                           "alias for /",
        "GET /hud.html":                      "alias for /",
        "GET /api/hud/health":                "cheap liveness -- no upstream call",
        "GET /api/hud/snapshot":              "the composed view: upstreams + door + gates + audience + metrics + sight",
        "GET /api/hud/sight":                 "ENLIGHTENED SIGHT: contradictions, rot, runaway, journey-stuck, user-mode findings (read-only truth-shares; HUD does not heal)",
        "GET /api/hud/timeseries?metric=&window=": "one metric's ring buffer values",
        "GET /api/hud/audience/recent?n=":    "recent audience rows",
        "POST /api/hud/audience/publish":     "accept a sanitizer-vouched audience row (loopback + x-uni-cc:1 header)",
        "POST /api/hud/sight/push":           "user-mode helper (hud_user_sight.ps1) posts findings the service cannot see itself (loopback + x-uni-cc:1)",
        "GET /api/hud/discovery":             "THIS route",
      },
      upstreams: UPSTREAMS.map((u) => ({ name: u.name, host: u.host, port: u.port, path: u.path })),
      poll_interval_ms: POLL_MS,
      ring_cap: RING_CAP,
      audience_cap: AUDIENCE_CAP,
      laws: [
        "GET-only except one loopback + x-uni-cc:1 POST for the audience receiver",
        "Reads never actuate. No upstream mutation. No key held. No CONFIRM ever typed.",
        "NO IPv4 literal outside {127.0.0.1, 0.0.0.0} anywhere in viewer/hud/**.",
        "HUD-computed rollups always show underlying counts alongside (hud-glance-honest gate).",
        "Audience rows without sanitized_by are rejected (hud-audience-sanitizer-honest gate).",
      ],
    }));
  }

  // any other GET -> 404
  if (method === "GET") return sendJson(res, 404, { err: "not_found", path: pathOnly });
  // any other method -> 405
  return methodNotAllowed(res, method);
}

// --- lifecycle ----------------------------------------------------------
const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    try { sendJson(res, 500, { err: "handler-crashed", detail: String(e && e.message || e) }); } catch (_) {}
  });
});

function start() {
  server.listen(HUD_PORT, HUD_BIND, () => {
    const banner = `${HUD_BIND}:${HUD_PORT} (poll ${POLL_MS}ms, ring ${RING_CAP}, audience ${AUDIENCE_CAP}) commit=${state.git_commit || "unknown"} pid=${process.pid}`;
    console.log(`[uni-hud] listening on ${banner}`);
    eventlog.serviceStart(banner);
    startPolling();
    if (process.env.HUD_STUB === "1") {
      state.stub = new Stub({ intervalMs: 1000, push: (row) => state.audience.accept({ ...row, sanitized_by: row.sanitized_by || "stub-fixture" }) });
      try { state.stub.start(); console.log("[uni-hud] stub mode ON"); } catch (e) { console.log("[uni-hud] stub start failed:", e.message); }
    }
  });
}

function stop() {
  stopPolling();
  if (state.stub) { try { state.stub.stop(); } catch (_) {} }
  try { server.close(); } catch (_) {}
}

if (require.main === module) {
  start();
  process.on("SIGINT",  () => { console.log("[uni-hud] SIGINT");  eventlog.serviceStop("SIGINT");  stop(); process.exit(0); });
  process.on("SIGTERM", () => { console.log("[uni-hud] SIGTERM"); eventlog.serviceStop("SIGTERM"); stop(); process.exit(0); });
  process.on("uncaughtException", (e) => { console.error("[uni-hud] UNCAUGHT:", e); try { eventlog.serverCrash(e); } catch (_) {} stop(); process.exit(1); });
  process.on("unhandledRejection", (e) => { console.error("[uni-hud] UNHANDLED REJECTION:", e); try { eventlog.serverCrash(e); } catch (_) {} });
}

module.exports = { start, stop, server, buildSnapshot, buildSnapshotWithSight, envelope, state, HUD_PORT, POLL_MS };
