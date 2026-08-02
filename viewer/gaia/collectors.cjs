// collectors.cjs — Gaia's READ-ONLY direct-signal collectors, one function per seat.
//
// GAIA LAW (enforced by construction here): every function reads a real source
// (git / files / registry / FE source / transcripts) or runs an HONEST probe and
// returns VERBATIM Signals via sig.signal(). NO rollups, NO counts, NO averages,
// NO percents, NO scores, NO ranks, NO Gaia-authored verdicts, NO narration. A
// boolean/verdict the SOURCE itself computed (a gate row's verdict, infra.cjs's
// dnsDrift state) is carried verbatim as a raw signal with the source as locator —
// that is projection, not derivation. The only booleans Gaia itself computes are
// (a) live.up straight off a real probes.tcp()/httpJson() result, and (b) the
// mechanical byte-equality in driftSignals (a===b). Both are lossless projection.
//
// READ-ONLY over every source. NO IP LITERAL lives in this file — hosts are read
// from the sanctioned data map viewer/infra_registry.json (data, not code) and the
// zone-derived name `gaia.${zone}`. Reuses viewer/probes.cjs {tcp,httpJson} and
// viewer/infra.cjs snapshot() rather than duplicating a probe/registry module.
//
// ── sig.signal() CONTRACT (the sibling sig.cjs builds to the same spec) ──────────
// sig.signal({
//   id, seat, kind,               // locator slug, seat name, kind enum
//   raw,                          // REQUIRED verbatim source string (utf8 text or base64)
//   encoding = "utf8",            // "utf8" | "base64"
//   locator, reverify,            // re-runnable source + the command to re-capture it
//   captured_at,                  // ISO-8601 UTC (we always pass it)
//   live,                         // {up:true|false|null, detail}; up!=null ONLY from a real probe
//   evidence_class = "C",         // carried from the source when it declares one, else "C"
//   truncated = false,            // or {of:"stdout_tail", complete:false}
//   truncation_note,              // optional string, only when the SOURCE truncates
// }) => Signal {
//   id, seat, kind,
//   value:{ raw, encoding },
//   provenance:{ locator, captured_at, sha256:sha256Bytes(raw), byte_len, truncated,
//                truncation_note?, instrument:"gaia.cjs@1", reverify },
//   live, evidence_class
// }
// sig.canonicalRaw(obj) => the ONE stable-key-ordered UTF-8 serialization stored-AND-hashed
//                          for assembled JSON (defeats key-order hash drift).
// sig.sha256Bytes(str)   => 64-hex sha256 over exactly those bytes.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const { tcp, httpJson } = require("../probes.cjs");
const { snapshot } = require("../infra.cjs");
const gaiaSnap = require("./snapshot.cjs");   // Gaia's own snapshot store (distinct from infra.cjs snapshot())
const { signal, canonicalRaw, sha256Bytes } = require("./sig.cjs");

// ── paths ───────────────────────────────────────────────────────────────────────
const HERE = __dirname;                          // ...\viewer\gaia
const VIEWER = path.resolve(HERE, "..");         // ...\viewer
const REPO = path.resolve(HERE, "..", "..");     // repo root
const nowIso = () => new Date().toISOString();

// The sanctioned IP map (DATA, not code — this file holds no IPv4 literal). Read the
// same way infra.cjs does. If it is unreadable we degrade honestly, never fabricate.
let REG = {};
try { REG = require("../infra_registry.json"); } catch (_) { REG = { zone: "uni-lab.local", services: [], resolver: {} }; }
const ZONE = REG.zone || "uni-lab.local";

// The declared source-locator registry (audit spine). Optional — used to enrich a
// locator when a source id is declared there. Robust to an unknown/partial shape.
let SOURCES = null;
try { SOURCES = require("./sources.json"); } catch (_) { SOURCES = null; }
function declaredLocator(id, fallback) {
  try {
    const list = Array.isArray(SOURCES) ? SOURCES : (SOURCES && SOURCES.sources) || [];
    const hit = list.find((s) => s && s.id === id);
    return (hit && hit.locator) || fallback;
  } catch (_) { return fallback; }
}

// ── tiny read-only helpers (never throw, never hang, never fabricate) ─────────────
function safeRequire(rel) { try { return require(rel); } catch (_) { return null; } }

function sh(cmd, args, timeout) {
  try {
    const out = execFileSync(cmd, args, {
      encoding: "utf8", timeout: timeout || 8000, windowsHide: true,
      maxBuffer: 16 * 1024 * 1024, cwd: REPO,
    });
    return { ok: true, out: out == null ? "" : String(out) };
  } catch (e) {
    return { ok: false, out: e && e.stdout ? String(e.stdout) : "", err: e && (e.stderr || e.message) ? String(e.stderr || e.message) : "" };
  }
}
const git = (args) => sh("git", ["-C", REPO].concat(args));

function readFileMaybe(abs) {
  try { return { ok: true, content: fs.readFileSync(abs, "utf8") }; }
  catch (e) { return { ok: false, err: e && e.message ? String(e.message) : "read failed" }; }
}
function existsFile(abs) { try { return fs.statSync(abs).isFile(); } catch (_) { return false; } }
const rel = (abs) => path.relative(REPO, abs).split(path.sep).join("/");

const NOT_PROBED = { up: null, detail: "not probed" };

// ── per-probe outer ceiling (fixed 2026-07-14 — closes "a dead probe target can wedge GET /api/gaia") ──
// probes.cjs's tcp()/httpJson() already accept + honor their own inner timeout (default 1500/2000ms; the
// sole registry-declared override, "relay", is 1800ms — see viewer/infra_registry.json), and NEITHER ever
// rejects — both always resolve, even on failure. So this is defense-in-depth, not the primary fix: it
// bounds a probe call from OUTSIDE the library, via Promise.race, so a single stalled probe can never hold
// a collector open past PROBE_CEILING_MS even if a probe's own inner timer somehow failed to fire (a
// stalled DNS lookup before the socket timer starts, a future probes.cjs regression, etc.) — the same
// Promise.race idiom gaia.cjs's withCeiling() already uses one layer up, applied per-probe instead of
// per-collector. `fallback` must be the SAME shape the probe itself returns on a normal down/timeout
// result (httpJson: {ok:false,status:0,body:null}; tcp: false) so the caller's existing down-handling code
// path runs unchanged whichever one wins the race — this changes ONLY how long a caller can be made to
// wait, never what a down result looks like.
const PROBE_CEILING_MS = 2500;
function raceProbe(promise, fallback) {
  let timer;
  const ceiling = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), PROBE_CEILING_MS); });
  return Promise.race([promise, ceiling]).then((v) => { clearTimeout(timer); return v; });
}

// Convenience: build a verbatim signal. Adapts this flat call shape into the nested Signal spec
// that sig.signal() requires: { value:{raw,encoding}, provenance:{locator,reverify,captured_at,
// truncated,truncation_note}, live?, evidence_class }. `live` is passed ONLY for probe kinds
// (tcp|http) — sig.signal() rejects a live block on any other kind.
function sig(o) {
  const provenance = {
    locator: o.locator,
    reverify: o.reverify,
    captured_at: o.captured_at || nowIso(),
  };
  if (o.truncated != null && o.truncated !== false) provenance.truncated = o.truncated;
  if (o.truncation_note != null) provenance.truncation_note = o.truncation_note;
  const spec = {
    id: o.id, seat: o.seat, kind: o.kind,
    value: { raw: o.raw == null ? "" : o.raw, encoding: o.encoding || "utf8" },
    provenance,
    evidence_class: o.evidence_class || "C",
  };
  if (o.kind === "tcp" || o.kind === "http") spec.live = o.live || NOT_PROBED;
  return signal(spec);
}

// latestIngest(seat, id) — the most-recent agent-ingested Signal for this seat/id (from ingest_mcp.cjs via
// snapshot.cjs), verbatim, or null if none / unreadable / pruned. The signal was built with sig.signal(), so
// re-emitting it preserves rehash-integrity (the gate re-checks sha256(value.raw)==provenance.sha256).
function latestIngest(seat, id) {
  try {
    const rows = gaiaSnap.listSnapshots({ seat });          // append order (oldest -> newest)
    let hit = null;
    for (const r of rows) if (r && r.id_or_path === id) hit = r;   // keep the last match = most recent
    if (!hit) return null;
    const snap = gaiaSnap.readSnapshot(hit.path);
    if (!snap || !snap.match || !snap.envelope || !snap.envelope.result) return null;
    const sigs = snap.envelope.result.signals;
    return (Array.isArray(sigs) && sigs.find((s) => s && s.id === id)) || null;
  } catch (_) { return null; }
}

// ── 1. repo / commits ─────────────────────────────────────────────────────────────
async function gitSignals() {
  const out = [];
  const cmds = [
    { id: "git.head", args: ["rev-parse", "HEAD"], loc: "git -C <repo> rev-parse HEAD" },
    { id: "git.status", args: ["status", "--short"], loc: "git -C <repo> status --short" },
    { id: "git.log", args: ["log", "--oneline", "-20"], loc: "git -C <repo> log --oneline -20" },
    { id: "git.pushstate", args: ["rev-list", "--left-right", "--count", "origin/gen2-runtime...HEAD"], loc: "git -C <repo> rev-list --left-right --count origin/gen2-runtime...HEAD" },
  ];
  for (const c of cmds) {
    const r = git(c.args);
    // A clean tree yields the empty string verbatim; a failure carries git's own
    // stderr bytes verbatim (source bytes, not Gaia narration).
    const raw = r.ok ? r.out : (r.out || r.err || "");
    out.push(sig({ id: c.id, seat: "repo", kind: "git", raw, locator: c.loc, reverify: c.loc }));
  }
  return out;
}

// ── 2. gate ledger (science verdicts) — one hashed signal per ndjson line ──────────
async function gateLedgerSignals() {
  const out = [];
  const ledgerAbs = path.join(REPO, "evidence", "gates.ndjson");
  const f = readFileMaybe(ledgerAbs);
  if (f.ok) {
    const lines = f.content.split("\n");
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      n++;
      const lineNo = i + 1;
      // carry the row's OWN evidence_class verbatim if it declares one
      let ec = "C";
      try { const row = JSON.parse(line); if (row && row.evidence_class) ec = String(row.evidence_class); } catch (_) {}
      out.push(sig({
        id: `gates.ndjson.row.${n}`, seat: "gates", kind: "file", raw: line,
        locator: `evidence/gates.ndjson:${lineNo}`,
        reverify: `sed -n '${lineNo}p' evidence/gates.ndjson`,
        evidence_class: ec,
      }));
    }
  } else {
    out.push(sig({ id: "gates.ndjson", seat: "gates", kind: "file", raw: f.err || "",
      locator: "evidence/gates.ndjson", reverify: "cat evidence/gates.ndjson" }));
  }
  // schema + rendered ladder, verbatim (gaia://gates/schema)
  for (const p of ["production/schemas/gate_row.schema.json", "docs/GATES.md"]) {
    const abs = path.join(REPO, p);
    const g = readFileMaybe(abs);
    if (g.ok) out.push(sig({ id: `gates.file.${path.basename(p)}`, seat: "gates", kind: "file",
      raw: g.content, locator: p, reverify: `cat ${p}` }));
  }
  return out;
}

// ── 3. infra / DNS — reuse infra.cjs snapshot() (zone + dnsDrift rows) ─────────────
async function infraSignals() {
  const out = [];
  // the registry file verbatim (the one sanctioned IP map + goLiveGate)
  const regAbs = path.join(VIEWER, "infra_registry.json");
  const rf = readFileMaybe(regAbs);
  if (rf.ok) out.push(sig({ id: "infra.registry", seat: "infra", kind: "config", raw: rf.content,
    locator: "viewer/infra_registry.json", reverify: "cat viewer/infra_registry.json" }));

  // zone + resolver, carried verbatim from the registry (declared, not observed)
  out.push(sig({ id: "infra.zone", seat: "infra", kind: "config",
    raw: canonicalRaw({ zone: ZONE, resolver: REG.resolver || null }),
    locator: "viewer/infra_registry.json .zone/.resolver", reverify: "node -e \"console.log(require('./viewer/infra_registry.json').zone)\"" }));

  // infra.cjs snapshot(): dnsDrift rows + source-computed goLiveGates, carried verbatim
  let snap = null;
  try { snap = await snapshot(); } catch (e) { snap = null; }
  const result = snap && snap.result ? snap.result : null;

  // infra.cjs snapshot().result.drift is a plain array (the dnsDrift() return); older
  // callers wrap it as a Field {value:[...]}. Accept BOTH shapes so no drift row is dropped.
  const driftRows = result
    ? (Array.isArray(result.drift) ? result.drift
      : (result.drift && Array.isArray(result.drift.value) ? result.drift.value : []))
    : [];
  if (driftRows.length) {
    for (const row of driftRows) {
      // row.state ("drift"|"fresh"|"not_verified") is infra.cjs's OWN computation —
      // projected verbatim with infra.cjs as locator. Gaia does NOT recompute or judge it.
      // kind:"config" (NOT "drift"): this is a PROJECTION of a source-computed value, the
      // same idiom as infra.golive_gates below. kind:"drift" is RESERVED for Gaia-COMPOSED
      // paired {a,b,relation,equal} signals from driftSignal() that the lint mechanically
      // re-verifies (a===b). Tagging a verbatim projection "drift" would make the lint try to
      // mechanically re-derive an `equal` boolean that Gaia never authored.
      out.push(sig({
        id: `infra.dns_drift.${row.name}`, seat: "infra", kind: "config",
        raw: canonicalRaw(row),
        locator: "viewer/infra.cjs snapshot().result.drift.value[] (dns.Resolver against chip :53)",
        reverify: "node -e \"require('./viewer/infra.cjs').snapshot().then(s=>console.log(JSON.stringify(s.result.drift.value)))\"",
      }));
    }
  }
  if (result && result.goLiveGates) {
    // infra.cjs's OWN live-derived gate object — a source-computed value, carried verbatim.
    out.push(sig({ id: "infra.golive_gates", seat: "infra", kind: "config",
      raw: canonicalRaw(result.goLiveGates),
      locator: "viewer/infra.cjs snapshot().result.goLiveGates",
      reverify: "node -e \"require('./viewer/infra.cjs').snapshot().then(s=>console.log(JSON.stringify(s.result.goLiveGates)))\"" }));
  }
  return out;
}

// ── 4. science / math — verbatim FE kernel snippets + RED receipt front-matter ─────
function extractSnippet(seat, id, relPath, matcher, before, after) {
  const abs = path.join(REPO, relPath);
  const f = readFileMaybe(abs);
  if (!f.ok) return null;
  const lines = f.content.split("\n");
  let anchor = -1;
  for (let i = 0; i < lines.length; i++) { if (matcher.test(lines[i])) { anchor = i; break; } }
  if (anchor < 0) return null;
  const a = Math.max(0, anchor - before);
  const b = Math.min(lines.length - 1, anchor + after);
  const raw = lines.slice(a, b + 1).join("\n");
  return sig({
    id, seat, kind: "file", raw,
    locator: `${relPath}:L${a + 1}-L${b + 1}`,
    reverify: `sed -n '${a + 1},${b + 1}p' ${relPath}`,
  });
}
async function scienceSignals() {
  const out = [];
  const snips = [
    ["science.infer.softmax", "lib/sp/brain/infer.ex", /softmax/, 1, 6],
    ["science.efe.terms", "lib/sp/brain/efe.ex", /epistemic\s*=/, 1, 5],
    ["science.learn.dirichlet", "lib/sp/brain/learn.ex", /Dirichlet/, 1, 8],
    ["science.novelty.decay", "lib/sp/brain/novelty.ex", /MISSING THIRD|parameter information gain/, 1, 12],
  ];
  for (const [id, p, m, b, a] of snips) {
    const s = extractSnippet("science", id, p, m, b, a);
    if (s) out.push(s);
  }
  // RED receipt front-matter (behaviour-only framing; verbatim, never narrated as experience)
  const receipts = [
    "docs/receipts/red_preregistration_forage_pureworld_graduation.md",
    "docs/receipts/forage_red_preregistration.md",
    "docs/receipts/forage_honest_consummation_RED.md",
  ];
  for (const p of receipts) {
    const abs = path.join(REPO, p);
    const f = readFileMaybe(abs);
    if (!f.ok) continue;
    const lines = f.content.split("\n");
    // front-matter: YAML block between --- fences, else the first 20 lines
    let end = 20;
    if (lines[0] && lines[0].trim() === "---") {
      const close = lines.slice(1).findIndex((l) => l.trim() === "---");
      if (close >= 0) end = close + 2;
    }
    end = Math.min(end, lines.length);
    out.push(sig({
      id: `science.receipt.${path.basename(p, ".md")}`, seat: "science", kind: "file",
      raw: lines.slice(0, end).join("\n"),
      locator: `${p}:L1-L${end}`, reverify: `sed -n '1,${end}p' ${p}`,
    }));
  }
  return out;
}

// ── 5. studio ports (THINKER) — HONEST tcp/http probes, up ONLY from a real probe ──
// PARALLELIZED (fixed 2026-07-14): each service's probe is independent (no shared state), so this
// was a needless sequential for-loop — with N declared thinker services each up to 2000ms, a fully
// unreachable studio stack cost up to N x 2000ms in series. Promise.all runs them concurrently
// (worst case ~2000ms total regardless of N), the same fix already applied to infra.cjs's dnsDrift().
// HARDENED (fixed 2026-07-14, second pass): each probe call is now additionally raced against
// PROBE_CEILING_MS (defense-in-depth outer bound, see raceProbe() above), and the outer aggregation is
// Promise.allSettled (not Promise.all) — per GAIA LAW, an unreachable service must surface as its own
// honest down signal, never let a bug in ONE task's collector code silently cancel every other still-
// collectible service's signal the way a bare Promise.all would.
async function studioProbeSignals() {
  const services = (REG.services || []).filter((s) => s.box === "thinker" && s.probe);
  const settled = await Promise.allSettled(
    services.map(async (s) => {
      const p = s.probe;
      const at = nowIso();
      let up = false, detail = "", raw;
      if (p.kind === "http") {
        const r = await raceProbe(httpJson(p.host, p.port, p.path || "/", p.timeout || 2000), { ok: false, status: 0, body: null });
        up = !!r.ok;
        detail = `http ${p.host}:${p.port}${p.path || "/"} -> status ${r.status} (${up ? "reachable" : "down"})`;
        // probes.httpJson parses the body; project the honest probe OUTCOME (status+parsed body).
        raw = canonicalRaw({ target: `${p.host}:${p.port}${p.path || "/"}`, kind: "http", status: r.status, up, body: r.body });
      } else {
        up = await raceProbe(tcp(p.host, p.port, p.timeout || 1500), false);
        detail = `tcp ${p.host}:${p.port} (${up ? "reachable" : "down"})`;
        raw = canonicalRaw({ target: `${p.host}:${p.port}`, kind: "tcp", up });
      }
      return sig({
        id: `studio.${s.name}.port.${s.port}`, seat: "studio", kind: p.kind === "http" ? "http" : "tcp",
        raw, captured_at: at, live: { up, detail },
        locator: `probes.${p.kind === "http" ? "httpJson" : "tcp"}(${p.host},${p.port}${p.kind === "http" ? "," + JSON.stringify(p.path || "/") : ""})`,
        reverify: `node -e "require('./viewer/probes.cjs').${p.kind === "http" ? `httpJson('${p.host}',${p.port},'${p.path || "/"}')` : `tcp('${p.host}',${p.port})`}.then(r=>console.log(JSON.stringify(r)))"`,
      });
    })
  );
  const out = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") { out.push(r.value); continue; }
    // tcp()/httpJson() never reject (both always resolve, even on failure) — so a rejection here is a
    // genuine collector-code bug, not a probe result. Surface it as its own honest down signal for this
    // one service rather than letting it silently drop the whole studio seat.
    const s = services[i];
    const p = s && s.probe;
    const reason = String((r.reason && r.reason.message) || r.reason || "collector error");
    out.push(sig({
      id: `studio.${s ? s.name : "unknown"}.port.${s ? s.port : "?"}`, seat: "studio",
      kind: p && p.kind === "http" ? "http" : "tcp",
      raw: canonicalRaw({ target: p ? `${p.host}:${p.port}${p.path || ""}` : "unknown", kind: p ? p.kind : "tcp", up: false, error: reason }),
      captured_at: nowIso(), live: { up: false, detail: `collector task error: ${reason}` },
      locator: p ? `probes.${p.kind === "http" ? "httpJson" : "tcp"}(${p.host},${p.port})` : "unknown",
      reverify: "n/a (collector threw before probe completed)",
    }));
  }
  // THE DOORS REGISTER — the lifecycle circle's state-of-all (open/locked, the four vectors,
  // predictions of future openings/closings, audit tail) as WRITTEN by door_lifecycle.cjs.
  // Carried verbatim (the predictions are the SOURCE's declarations). Absent file (cold clone /
  // register never computed) => no signal, honestly — never synthesized.
  const doorsAbs = path.join(REPO, "viewer/runtime/door_state.json");
  const df = readFileMaybe(doorsAbs);
  if (df.ok) out.push(sig({
    id: "studio.doors.register", seat: "studio", kind: "file",
    raw: df.content, locator: declaredLocator("studio.doors.register", "viewer/runtime/door_state.json"),
    reverify: "cat viewer/runtime/door_state.json",
  }));
  // THE JOURNEY — the reboot-surviving vector sequence (door_journey.cjs), carried verbatim.
  // Step statuses/predictions/live-detail are the SOURCE's own computation; Gaia never scores
  // "how far along" the operator is — it shows the plan exactly as the door itself sees it.
  const journeyAbs = path.join(REPO, "viewer/runtime/door_journey.json");
  const jf = readFileMaybe(journeyAbs);
  if (jf.ok) out.push(sig({
    id: "studio.doors.journey", seat: "studio", kind: "file",
    raw: jf.content, locator: declaredLocator("studio.doors.journey", "viewer/runtime/door_journey.json"),
    reverify: "cat viewer/runtime/door_journey.json",
  }));
  return out;
}

// ── 6. colony (chip) — LAN probes; MCP-only container seat honestly up:null ────────
// PARALLELIZED (fixed 2026-07-14): producer_health, /stream, mc:25565, and rcon:25575 are four
// independent probes that were being awaited one after another (up to ~2000+2000+1500+1500 =
// 7000ms in series against a fully unreachable chip). None depends on another's result, so they
// now run concurrently via Promise.all — worst case drops to ~2000ms (the slowest single probe).
// HARDENED (fixed 2026-07-14, second pass): the "mc" service (Minecraft :25565 on the colony host,
// per viewer/infra_registry.json — no IP literal here) is the one target observed to fail by packet-
// level silence (no RST, no refusal) rather than a fast refuse/reachable — exactly the shape that most
// needs an OUTER bound in case probes.cjs's own inner timeout ever fails to fire.
// Every probe call is now additionally raced against PROBE_CEILING_MS (see raceProbe() above), and the
// four tasks are deferred {label,kind,locator,run} descriptors invoked together via Promise.allSettled
// (not Promise.all) — per GAIA LAW, a probe that cannot be reached must surface as its own honest down
// signal, never let one task's collector-code bug silently cancel the other three colony probes.
// AIM CORRECTED 2026-07-16 (two independent defects, found together, fixed together):
//   (1) WRONG SURFACE. Both Producer signals read svc("colony") — the LEGACY v2 Phoenix node on :4000,
//       which per CLAUDE.md has NO /producer/health route at all. The signal named
//       `colony.producer_health` was really probing :4000/stream (the registry's colony probe path),
//       so it could never have carried a Producer health verdict no matter what was running. The
//       Producer's health + stream live on the uni-producer HEAD node at :4200 (gate
//       producer-camera-attached). Both Producer signals now read svc("producer").
//   (2) STALE ADDRESS. Those probes addressed a hand-declared IP literal that went stale when the
//       chip's DHCP lease moved .122 -> .121, so they reported DOWN against a demonstrably LIVE
//       colony. Probes are BY NAME now (getaddrinfo follows uni-dns on the chip), so a lease move
//       is followed automatically and never again reads as a dead colony.
// The legacy :4000 node keeps its own honestly-labeled signal below — it is a real, separate surface
// (its own in-container narration), not a synonym for the Producer.
async function colonyProbeSignals() {
  const svc = (name) => (REG.services || []).find((s) => s.name === name);
  const producer = svc("producer");
  const colony = svc("colony");
  const mc = svc("mc");

  const tasks = [];
  // THE UNI PRODUCER — the unique UNI living inside UNI.Minecraft that flies the camera and
  // reports the show (distinct from the colony UNIs in the world). Its living surface is /stream;
  // its pulse is /producer/health. When the Producer is MISSING (health 404, camera unflown,
  // narration silent) that is projected VERBATIM, never masked.
  if (producer && producer.probe) {
    const p = producer.probe;
    const hp = p.path || "/producer/health";
    tasks.push({
      label: "producer_health", kind: "http",
      locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(hp)})`,
      run: async () => {
        const at = nowIso();
        const r = await raceProbe(httpJson(p.host, p.port, hp, p.timeout || 2000), { ok: false, status: 0, body: null });
        const up = !!r.ok;
        return sig({
          id: "colony.producer_health", seat: "colony", kind: "http",
          raw: canonicalRaw({ target: `${p.host}:${p.port}${hp}`, kind: "http", status: r.status, up, body: r.body }),
          captured_at: at, live: { up, detail: `http ${p.host}:${p.port}${hp} -> status ${r.status} (${up ? "reachable" : "down"})` },
          locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(hp)})`,
          reverify: `node -e "require('./viewer/probes.cjs').httpJson('${p.host}',${p.port},'${hp}').then(r=>console.log(JSON.stringify(r)))"`,
        });
      },
    });
    tasks.push({
      label: "producer.stream", kind: "http",
      locator: `probes.httpJson(${p.host},${p.port},"/stream")`,
      run: async () => {
        const atStream = nowIso();
        const rs = await raceProbe(httpJson(p.host, p.port, "/stream", p.timeout || 2000), { ok: false, status: 0, body: null });
        return sig({
          id: "colony.producer.stream", seat: "colony", kind: "http",
          raw: canonicalRaw({ target: `${p.host}:${p.port}/stream`, kind: "http", status: rs.status, up: !!rs.ok }),
          captured_at: atStream, live: { up: !!rs.ok, detail: `http ${p.host}:${p.port}/stream -> status ${rs.status} (the UNI Producer's own live surface)` },
          locator: `probes.httpJson(${p.host},${p.port},"/stream")`,
          reverify: `node -e "require('./viewer/probes.cjs').httpJson('${p.host}',${p.port},'/stream').then(r=>console.log(JSON.stringify(r)))"`,
        });
      },
    });
    // PER-UNI OBSERVATION ROUTES (v1a, producer commit 08fa60d, deployed 2026-07-18). These are the
    // first surfaces that expose the colony's per-UNI substrate to a reader outside the chip. Gaia
    // projects the response body VERBATIM — the routes compute their own values and carry their own
    // `disclaimer` ("substrate observation only; no evidence for awareness/experience") plus an
    // x-uni-claim-fence header, so the claim fence rides along with the data and Gaia adds NOTHING.
    // No score, no rank, no aggregate: carrying a source's own computed value with the source as
    // locator is a projection; anything Gaia derived would be a build defect (GAIA LAW, sig.cjs).
    //
    // NOTE (plane, measured 2026-07-18): :4200 answers on the chip's LAN plane
    // (producer.uni-lab.local -> DHCP-current address) but NOT on the tailscale overlay. These probe
    // BY NAME via the registry, so a lease move is followed automatically — never an address literal.
    for (const route of [
      { id: "uni_roster", path: "/producer/uni_roster", what: "every UNI on SP.Runtime.Board with kin/index/mode/action/phase/ticks" },
      { id: "generations", path: "/producer/generations", what: "the kin-group and lineage fields exactly as the producer reports them, including its own kin-vs-generation note" },
    ]) {
      tasks.push({
        label: `producer.${route.id}`, kind: "http",
        locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(route.path)})`,
        run: async () => {
          const at = nowIso();
          const r = await raceProbe(httpJson(p.host, p.port, route.path, p.timeout || 2000), { ok: false, status: 0, body: null });
          const up = !!r.ok;
          return sig({
            id: `colony.producer.${route.id}`, seat: "colony", kind: "http",
            // body carried VERBATIM — including the route's own disclaimer field
            raw: canonicalRaw({ target: `${p.host}:${p.port}${route.path}`, kind: "http", status: r.status, up, body: r.body }),
            captured_at: at,
            live: { up, detail: `http ${p.host}:${p.port}${route.path} -> status ${r.status} (${up ? "reachable" : "down"}) — ${route.what}` },
            locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(route.path)})`,
            reverify: `node -e "require('./viewer/probes.cjs').httpJson('${p.host}',${p.port},'${route.path}').then(r=>console.log(JSON.stringify(r)))"`,
          });
        },
      });
    }
  }
  // The LEGACY v2 colony node (:4000) — an honestly-labeled SECOND surface with its own in-container
  // narration and no health route. Kept as its own signal so "the legacy node answers" and "the
  // Producer is alive" can never be confused for one another again (they were, until 2026-07-16).
  if (colony && colony.probe) {
    const p = colony.probe;
    const lp = p.path || "/stream";
    tasks.push({
      label: "legacy_v2.stream", kind: "http",
      locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(lp)})`,
      run: async () => {
        const at = nowIso();
        const r = await raceProbe(httpJson(p.host, p.port, lp, p.timeout || 2000), { ok: false, status: 0, body: null });
        return sig({
          id: "colony.legacy_v2.stream", seat: "colony", kind: "http",
          raw: canonicalRaw({ target: `${p.host}:${p.port}${lp}`, kind: "http", status: r.status, up: !!r.ok }),
          // Wording note: this string is Gaia-AUTHORED, so it must carry no FORBIDDEN_TOKEN (sig.cjs).
          // It states what was probed and what answered — never a characterisation of the surface.
          captured_at: at, live: { up: !!r.ok, detail: `http ${p.host}:${p.port}${lp} -> status ${r.status} (legacy v2 colony node's own :4000 surface; NOT the Producer — no health route exists here)` },
          locator: `probes.httpJson(${p.host},${p.port},${JSON.stringify(lp)})`,
          reverify: `node -e "require('./viewer/probes.cjs').httpJson('${p.host}',${p.port},'${lp}').then(r=>console.log(JSON.stringify(r)))"`,
        });
      },
    });
  }
  if (mc && mc.probe) {
    const p = mc.probe;
    tasks.push({
      label: "mc.port.25565", kind: "tcp",
      locator: `probes.tcp(${p.host},${p.port})`,
      run: async () => {
        const at = nowIso();
        const up = await raceProbe(tcp(p.host, p.port, p.timeout || 1500), false);
        return sig({
          id: "colony.mc.port.25565", seat: "colony", kind: "tcp",
          raw: canonicalRaw({ target: `${p.host}:${p.port}`, kind: "tcp", up }),
          captured_at: at, live: { up, detail: `tcp ${p.host}:${p.port} (${up ? "reachable" : "down"})` },
          locator: `probes.tcp(${p.host},${p.port})`,
          reverify: `node -e "require('./viewer/probes.cjs').tcp('${p.host}',${p.port}).then(r=>console.log(r))"`,
        });
      },
    });
    // RCON :25575 — no registry service; derive the host from the colony probe (a NAME, never an IP
    // literal, so it follows the chip's DHCP lease like every other chip probe).
    // HONEST NOTE (verified 2026-07-16): :25565 and :25575 are NOT LAN-published — mc-server binds the
    // COLNET address only (zone NV-HOLD: needs a proven host port-forward), so these two probes are
    // structurally unreachable from THINKER and read DOWN even against a healthy, LIVE colony. That
    // DOWN is correct and pre-existing; it is NOT address drift, and fixing the address does not and
    // must not turn it green. Colony liveness is carried by the Producer signals above.
    const rconHost = (colony && colony.probe && colony.probe.host) || p.host;
    tasks.push({
      label: "rcon.port.25575", kind: "tcp",
      locator: `probes.tcp(${rconHost},25575)`,
      run: async () => {
        const at2 = nowIso();
        const rconUp = await raceProbe(tcp(rconHost, 25575, 1500), false);
        return sig({
          id: "colony.rcon.port.25575", seat: "colony", kind: "tcp",
          raw: canonicalRaw({ target: `${rconHost}:25575`, kind: "tcp", up: rconUp }),
          captured_at: at2, live: { up: rconUp, detail: `tcp ${rconHost}:25575 (${rconUp ? "reachable" : "down"})` },
          locator: `probes.tcp(${rconHost},25575)`,
          reverify: `node -e "require('./viewer/probes.cjs').tcp('${rconHost}',25575).then(r=>console.log(r))"`,
        });
      },
    });
  }

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const out = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === "fulfilled") { out.push(r.value); continue; }
    // tcp()/httpJson() never reject — a rejection here is a genuine collector-code bug for THIS one
    // probe. Surface it as its own honest down signal rather than letting it cancel the other colony
    // probes the way a bare Promise.all would.
    const t = tasks[i];
    const reason = String((r.reason && r.reason.message) || r.reason || "collector error");
    out.push(sig({
      id: `colony.${t.label}.error`, seat: "colony", kind: t.kind,
      raw: canonicalRaw({ error: reason }),
      captured_at: nowIso(), live: { up: false, detail: `collector task error: ${reason}` },
      locator: t.locator, reverify: "n/a (collector threw before probe completed)",
    }));
  }
  // Colony container presence (mc-server / uni-colony) is an ingest-only seat: a headless collector is NOT
  // an ssh/MCP client, so it cannot probe it live. If an AGENT has run ingest_mcp.cjs, the latest capture
  // is projected VERBATIM (a real, hashed, provenance-stamped snapshot). If not, it stays honestly up:null —
  // never faked present/absent.
  const ingested = latestIngest("colony", "colony.containers.mcp");
  if (ingested) {
    out.push(ingested);
  } else {
    out.push(sig({
      id: "colony.containers.mcp", seat: "colony", kind: "mcp",
      raw: canonicalRaw({ seat: "colony-containers", source: "ssh uni@<colony host from registry> podman ps (rootless)", probed: false }),
      locator: "ssh uni@<colony host> podman ps (not callable from headless collector)",
      reverify: "agent: run `ssh uni@<host> podman ps --format json` then `node viewer/gaia/ingest_mcp.cjs colony colony.containers.mcp <cmd> <file>`",
    }));
  }

  // Litigation-hold status for the colony's minds — the evidence_hold TOOL's own integrity computation,
  // projected VERBATIM (a source-computed value, the same idiom as infra.golive_gates). Gaia shows what is
  // preserved; she never computes an aggregate of her own signals. If a mind were lost/tampered, ok:false
  // and missing/mismatched/chain_breaks name it — surfaced, never hidden.
  try {
    const held = require("./evidence_hold.cjs").verifyHold();
    out.push(sig({
      id: "colony.minds.hold", seat: "colony", kind: "config",
      raw: canonicalRaw(held),
      locator: "viewer/gaia/evidence_hold.cjs verifyHold() over evidence/colony_minds/custody.ndjson",
      reverify: "node viewer/gaia/evidence_hold.cjs verify",
    }));
  } catch (_) { /* evidence_hold absent -> no hold signal (honest omission) */ }

  return out;
}

// ── 7. sessions — project .jsonl transcript listing (name+size+mtime+sha256) ───────
function transcriptDir() {
  const base = path.join(require("os").homedir(), ".claude", "projects");
  const slug = REPO.replace(/[:.\\/]/g, "-");
  const direct = path.join(base, slug);
  if (existsFile(direct) || (() => { try { return fs.statSync(direct).isDirectory(); } catch (_) { return false; } })()) return direct;
  // fallback: scan for a folder that looks like this repo
  try {
    const wanted = path.basename(REPO).replace(/[.]/g, "-");
    for (const d of fs.readdirSync(base)) if (d.indexOf(wanted) >= 0) return path.join(base, d);
  } catch (_) {}
  return direct;
}
async function sessionSignals() {
  const out = [];
  const dir = transcriptDir();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")); } catch (_) { files = []; }
  for (const name of files) {
    const abs = path.join(dir, name);
    let st, contentHash;
    try { st = fs.statSync(abs); } catch (_) { continue; }
    try { contentHash = sha256Bytes(fs.readFileSync(abs, "utf8")); } catch (_) { contentHash = null; }
    // Project only the listing metadata (privacy-preserving); the transcript's OWN
    // byte-hash is carried as data (closes the 'no content hash on sync' gap).
    out.push(sig({
      id: `sessions.transcript.${name}`, seat: "sessions", kind: "file",
      raw: canonicalRaw({ name, size: st.size, mtime: new Date(st.mtimeMs).toISOString(), sha256: contentHash }),
      locator: abs.split(path.sep).join("/"),
      reverify: `sha256sum "${abs.split(path.sep).join("/")}"`,
    }));
  }
  if (files.length === 0) {
    out.push(sig({
      id: "sessions.transcripts", seat: "sessions", kind: "file",
      raw: canonicalRaw({ dir: dir.split(path.sep).join("/"), jsonl_files: [] }),
      locator: dir.split(path.sep).join("/"),
      reverify: `ls "${dir.split(path.sep).join("/")}"/*.jsonl`,
    }));
  }
  return out;
}

// ── 8. running config — verbatim studio config-file bytes ──────────────────────────
async function runningConfigSignals() {
  const out = [];
  const configs = [
    "viewer/mediamtx_local.yml",
  ];
  for (const p of configs) {
    const abs = path.join(REPO, p);
    const f = readFileMaybe(abs);
    if (!f.ok) continue;
    out.push(sig({ id: `config.${path.basename(p)}`, seat: "studio", kind: "config",
      raw: f.content, locator: p, reverify: `cat ${p}` }));
  }
  return out;
}

// ── 9. gaia-self — Gaia mirrors its OWN code + CAPS + runtime, same discipline ─────
async function selfSignals() {
  const out = [];
  // (a) CODE — git HEAD + live sha256 of Gaia's own on-disk source bytes
  const head = git(["rev-parse", "HEAD"]);
  out.push(sig({ id: "self.git_head", seat: "gaia-self", kind: "git",
    raw: head.ok ? head.out : (head.err || ""), locator: "git -C <repo> rev-parse HEAD", reverify: "git rev-parse HEAD" }));

  const srcFiles = ["sig.cjs", "sources.json", "caps.cjs", "collectors.cjs", "gaia.cjs",
    "gaia_lint.cjs", "snapshot.cjs", "gaia_server.cjs", "gaia_mcp.cjs", "verify_gaia.cjs", "gaia.html"];
  for (const name of srcFiles) {
    const abs = path.join(HERE, name);
    if (!existsFile(abs)) continue;
    const f = readFileMaybe(abs);
    if (!f.ok) continue;
    // value.raw = the file bytes; provenance.sha256 == `sha256sum viewer/gaia/<name>` (self-mirror gate)
    out.push(sig({ id: `self.src.${name}`, seat: "gaia-self", kind: "file", raw: f.content,
      locator: `viewer/gaia/${name}`, reverify: `sha256sum viewer/gaia/${name}` }));
  }

  // (b) MCP SURFACE — the CAPS projection (byte-comparable to initialize + docs/GAIA.md)
  const caps = safeRequire("./caps.cjs");
  if (caps && caps.CAPS) {
    out.push(sig({ id: "self.mcp.manifest", seat: "gaia-self", kind: "mcp",
      raw: canonicalRaw(caps.CAPS), locator: "viewer/gaia/caps.cjs CAPS",
      reverify: "node -e \"console.log(JSON.stringify(require('./viewer/gaia/caps.cjs').CAPS))\"" }));
  }

  // (c) RUNTIME — advertised host is gaia.${zone} (NO IP literal), pid, uptime, node — real self-reads
  out.push(sig({ id: "self.runtime", seat: "gaia-self", kind: "config",
    raw: canonicalRaw({ host: `gaia.${ZONE}`, pid: process.pid, uptime_s: process.uptime(), node: process.version }),
    locator: "process.pid / process.uptime() / `gaia.${zone}` from infra_registry.json",
    reverify: "node -e \"console.log(process.pid, process.uptime())\"" }));

  // (d) CALIBRATION — instrument + envelope contract path+hash + verify-gate names (carried, not scored)
  const envAbs = path.join(REPO, "production/schemas/envelope.schema.json");
  const env = readFileMaybe(envAbs);
  out.push(sig({ id: "self.calibration", seat: "gaia-self", kind: "config",
    raw: canonicalRaw({
      instrument: "gaia.cjs@1",
      envelope_schema: "production/schemas/envelope.schema.json",
      envelope_schema_sha256: env.ok ? sha256Bytes(env.content) : null,
      verify_gates: ["gaia-signal-provenance-complete", "gaia-no-summarization-lint", "gaia-rehash-integrity",
        "gaia-honest-probe", "gaia-mcp-handshake", "gaia-self-mirror", "gaia-read-only-fence",
        "gaia-no-ip-literal", "gaia-drift-surfaced", "gaia-write-fence-and-gate-row", "gaia-boot-persistence-honest"],
    }),
    locator: "production/schemas/envelope.schema.json + viewer/gaia verify gates",
    reverify: "sha256sum production/schemas/envelope.schema.json" }));
  return out;
}

// ── 10. drift — documented-vs-observed as paired-locator signals (never a verdict) ─
// Each side is a mini-provenance {locator, captured_at, sha256, byte_len, raw}. Gaia
// adds ONLY the fixed-vocab relation and the mechanical byte-equality boolean — never
// a severity, a "bug", a fix, or a diff-%.
function side(locator, raw) {
  const r = raw == null ? "" : String(raw);
  return { locator, captured_at: nowIso(), sha256: sha256Bytes(r), byte_len: Buffer.byteLength(r, "utf8"), raw: r };
}
function driftSignal(id, a, b, relation) {
  const equal = a.raw === b.raw;
  return sig({
    id, seat: "drift", kind: "drift",
    raw: canonicalRaw({ a, b, relation, equal }),
    locator: `A::${a.locator} | B::${b.locator}`,
    reverify: `compare A(${a.locator}) vs B(${b.locator})`,
  });
}
function grepFirst(relPath, re) {
  const abs = path.join(REPO, relPath);
  const f = readFileMaybe(abs);
  if (!f.ok) return null;
  const lines = f.content.split("\n");
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return { line: lines[i], no: i + 1 };
  return null;
}
// ---- CAPTURE-AGE FENCE (Phase 9, step 1.7) --------------------------------------------------------------
// A CAPTURE is a reading an agent took of something Gaia cannot reach itself (the chip's deployed ledgers,
// the off-box witness). It is true as of its timestamp and never after. Before this fence Gaia rendered a
// capture's digest as a plain value with no age test at all, so a reading taken 23.7 HOURS earlier was
// presented exactly like one taken a second ago — the pre-registered falsifier for 1.7, "a capture past its
// max age rendered as a value", was simply TRUE for every capture on the platform.
//
// THE BOUND is 3600s, inherited rather than invented: it is the bound the Control Plane already applies to
// the witness capture (`bound: 3600s`, SP.ControlPlane.Witness), so both bodies now age a capture the same
// way instead of each holding a private opinion. A capture older than that is not a value; it is a record of
// a past reading, and the honest states are distinct — "we measured this and it is so" versus "we have not
// looked recently enough to say". This mirrors the HUD's own law: stale renders SYNCING, because "we do not
// know" is not "off".
// THE CANDIDATE NORMALIZATIONS for a deployed-ledger prefix comparison, and the verdict built on
// them. Lifted to module scope 2026-07-28 so `verify_deploy_lag_tripwire.cjs` can call the SHIPPED
// rule — it used to carry its own `NORMS` and its own `verdict()` under the comment "rebuilt here
// exactly as the collector applies it", and tested only the rebuild. It required no module and
// opened no file, so this logic could have been deleted outright with the gate still green.
const PREFIX_NORMS = {
  "as-is": (s) => s,
  "all-lf": (s) => s.replace(/\r\n/g, "\n"),
  "all-crlf": (s) => s.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"),
};

/**
 * Is a replica a byte-exact PREFIX of canonical, and how far behind?
 *
 * `clean` means every row the replica holds is byte-identical to canonical's and the only difference
 * is rows it has not received yet. A replica that differs in CONTENT is not lagging; it is wrong,
 * and the two must not read the same.
 */
function prefixVerdict(canonLines, replicaRows, replicaDigest) {
  const prefix = canonLines.slice(0, replicaRows).join("");
  const digests = {};
  let matched = null;
  for (const [k, fn] of Object.entries(PREFIX_NORMS)) {
    digests[k] = crypto.createHash("sha256").update(Buffer.from(fn(prefix), "binary")).digest("hex");
    if (!matched && digests[k] === String(replicaDigest || "")) matched = k;
  }
  return { clean: matched !== null, normalization: matched, digests, lag: Math.max(0, canonLines.length - replicaRows) };
}

/**
 * WHY THE OFF-BOX WITNESS DOES NOT CORROBORATE — every condition, named.
 *
 * Lifted out of `controlPlaneSignals` 2026-07-28 so `verify_witness_blocked.cjs` can call the SHIPPED
 * rule. That gate carried its own `blockingConditions()` under "rebuilt exactly as the collector
 * applies it", and its only tie to this file was `src.includes("independent_custodians")` — a
 * substring, satisfied by a comment saying the field is no longer read.
 *
 * An empty list means nothing blocks corroboration. It does NOT mean the witness is sound; that is a
 * claim about custodians in failure domains the writer cannot reach, and no function here can make it.
 */
function witnessBlockingConditions(w, nowMs) {
  const blocking = [];
  if (!w) {
    blocking.push("witness.json: NO CAPTURE on disk — absence is not corroboration");
    return blocking;
  }
  const g = captureAge(w.captured_at, nowMs);
  if (!g.fresh) {
    blocking.push(`capture stale: age ${g.known ? g.age_s + "s" : "unparseable"} > max ${g.max_s}s — ` +
      "re-measure: node viewer/gaia/witness_probe.cjs");
  }
  const n = Number(w.independent_custodians);
  if (!Number.isFinite(n)) {
    blocking.push("independent_custodians: absent or non-numeric — unreadable is not zero-risk, it is unknown");
  } else if (n < 1) {
    blocking.push(`independent_custodians=${n} — no custodian sits in a failure domain the writer cannot ` +
      `reach; the anchor stands on git alone (claim_level=${JSON.stringify(w.claim_level)})`);
  }
  return blocking;
}

const CAPTURE_MAX_AGE_S = 3600;
function captureAge(capturedAt, nowMs) {
  const t = Date.parse(capturedAt || "");
  if (!Number.isFinite(t)) return { known: false, age_s: null, max_s: CAPTURE_MAX_AGE_S, fresh: false };
  const age_s = Math.max(0, Math.round((nowMs - t) / 1000));
  return { known: true, age_s, max_s: CAPTURE_MAX_AGE_S, fresh: age_s <= CAPTURE_MAX_AGE_S };
}

async function driftSignals() {
  const out = [];
  const NOW_MS = Date.now();

  // (0) The Control Plane's anchor, across its custodians. LIKE FOR LIKE: both
  // sides are the anchor's JSON object bytes — object against object, never a
  // digest against a count. Phase 1 found four signals comparing different KINDS
  // of thing, which can never converge; this one can.
  //
  // The off-box custodian is deliberately shown as ABSENT rather than faked.
  // Placing the anchor on node2 needs an approval-gated MCP write — a human
  // co-sign the writer cannot produce, which is exactly what makes node2 a
  // witness. Until that co-sign happens, "not yet placed" IS the honest state.
  {
    const local = readFileMaybe(path.join(REPO, "evidence", "control_plane", "anchor.json"));
    const committed = git(["show", "HEAD:evidence/control_plane/anchor.json"]);
    const a0 = side("evidence/control_plane/anchor.json (working tree)", local.ok ? local.content.trim() : "");
    const b0 = side("git show HEAD:evidence/control_plane/anchor.json", committed.ok ? committed.out.trim() : "");
    out.push(driftSignal("drift.control_plane_anchor_git", a0, b0, "snapshot_vs_live"));

    const wit = readFileMaybe(path.join(__dirname, "witness.json"));
    let placed = "";
    if (wit.ok) {
      try {
        const w = JSON.parse(wit.content);
        const off = (w.custodians || []).find((c) => c.qualifies_as_witness === true);
        placed = off && off.anchor ? canonicalRaw(off.anchor) : "";
      } catch { placed = ""; }
    }
    const a1 = side("evidence/control_plane/anchor.json (working tree)", local.ok ? local.content.trim() : "");
    const b1 = side("viewer/gaia/witness.json .custodians[offbox].anchor", placed);
    out.push(driftSignal("drift.control_plane_anchor_offbox", a1, b1, "absent"));
  }

  // (0b) PHASE-9 plan vs the artifacts it claims — THE RESONANCE SIGNAL.
  //
  // Both sides are the SAME KIND under the SAME NORMALIZATION: a sorted, newline-
  // joined list of the artifact paths named by steps whose status is DONE. Side a
  // is what the plan CLAIMS; side b is which of those paths EXIST on disk.
  // `equal: true` is therefore reachable whenever the plan tells the truth — which
  // is the whole requirement of ADR-0002 Amendment 1, and the reason four of this
  // file's older comparisons cannot converge in any repository state.
  //
  // It compares CLAIM against DISK, not plan against plan. A plan that marks a step
  // DONE while its artifact is absent goes unequal immediately, and that is the
  // failure mode this phase exists to end.
  {
    const pf = readFileMaybe(path.join(REPO, "evidence", "remediation", "phase9_plan.json"));
    let claimed = [];
    if (pf.ok) {
      try {
        const p = JSON.parse(pf.content);
        claimed = (p.stages || [])
          .flatMap((s) => s.steps || [])
          .filter((s) => s.status === "DONE" && s.artifact)
          .map((s) => s.artifact)
          .sort();
      } catch { claimed = []; }
    }
    const present = claimed.filter((rel) => existsFile(path.join(REPO, rel))).sort();
    const a = side("evidence/remediation/phase9_plan.json — artifacts named by DONE steps", claimed.join("\n"));
    const b = side("the same paths, tested on disk", present.join("\n"));
    out.push(driftSignal("drift.remediation_plan_vs_artifacts", a, b, "declared_vs_observed"));
  }

  // (0c) THE CAPTURE-AGE FENCE, as a signal (Phase 9 step 1.7).
  //
  // The withholding above stops a stale reading being rendered as a value; this makes the staleness itself
  // VISIBLE and ACTIONABLE rather than merely absent. Same shape as drift.git_dirty_vs_clean, which
  // Amendment 1's own table certifies as well-formed: side a is the expectation (no capture past its max
  // age), side b the captures that are. It converges the moment every capture is re-taken, and it names
  // exactly which capture is old, by how much, and the command that refreshes it.
  {
    const stale = [];
    const check = (name, capturedAt, how) => {
      const g = captureAge(capturedAt, NOW_MS);
      if (!g.fresh) stale.push(`${name}: age ${g.known ? g.age_s + "s" : "unparseable"} > max ${g.max_s}s — ${how}`);
    };
    const rlf = readFileMaybe(path.join(REPO, "viewer/gaia/replica_ledgers.json"));
    if (rlf.ok) {
      try {
        const d = JSON.parse(rlf.content);
        for (const r of (d.replicas || [])) if (r && r.ok) check(`replica_ledgers/${r.name}`, r.captured_at, "node viewer/gaia/replica_ledger_probe.cjs");
      } catch (_) {}
    }
    const wf = readFileMaybe(path.join(__dirname, "witness.json"));
    if (wf.ok) {
      try { check("witness", JSON.parse(wf.content).captured_at, "node viewer/gaia/witness_probe.cjs"); } catch (_) {}
    }
    const a = side(`expected: every capture within max age (${CAPTURE_MAX_AGE_S}s)`, "");
    const b = side("captures past their max age, live", stale.sort().join("\n"));
    out.push(driftSignal("drift.capture_age_fence", a, b, "snapshot_vs_live"));
  }

  // (0d) WITNESS INDEPENDENCE — independent_custodians:0 forces BLOCKED (Phase 9 step 1.7/1.8).
  //
  // THE DEFECT THIS CLOSES: viewer/gaia/witness_probe.cjs:169 COMPUTES `independent_custodians` and writes
  // it to witness.json on every capture — and nothing anywhere read it. The single number that says whether
  // the off-box witness is real was measured, stored, and never consulted by any consumer. It reads 0 today:
  // node2 answers the WRITER'S OWN KEY, so no custodian sits in a failure domain the writer cannot reach,
  // and the anchor therefore stands on git alone — tamper-EVIDENT, not unforgeable.
  //
  // A ZERO HERE IS NOT A VALUE, IT IS A BLOCK. Gaia does not author that verdict (GAIA LAW: it may not score
  // or judge); it projects the source's own computed number verbatim and reports the blocking CONDITIONS as
  // the source states them. Side a is the expectation — nothing blocking — and side b lists what is. Same
  // convergent shape as drift.git_dirty_vs_clean, so `equal: true` is reachable the moment a genuinely
  // independent custodian exists and the capture is fresh.
  //
  // WHAT THIS DELIBERATELY DOES NOT DO: it does not repair the witness. Removing the writer's key from node2
  // is STOP S1 — "the one repair the agent must not perform" — because using write access to erase the
  // evidence of write access destroys the last proof rather than restoring a witness. This builds the
  // REFUSAL and leaves the repair to the operator.
  {
    const wf = readFileMaybe(path.join(__dirname, "witness.json"));
    let blocking = [];
    if (!wf.ok) blocking.push("witness.json: NO CAPTURE on disk — absence is not corroboration");
    else {
      try {
        // The rule itself lives at module scope so the gate can exercise it — see
        // `witnessBlockingConditions`.
        blocking = witnessBlockingConditions(JSON.parse(wf.content), NOW_MS);
      } catch (e) {
        blocking.push(`witness.json: unparseable (${e.message})`);
      }
    }
    const a = side("expected: a fresh capture with at least one independent custodian", "");
    const b = side("viewer/gaia/witness.json — blocking conditions, projected from the source's own fields", blocking.join("\n"));
    out.push(driftSignal("drift.witness_independence", a, b, "declared_vs_observed"));
  }

  // (1) fqdn.cjs — the PATH the doc cites vs the path on disk.
  //
  // REPAIRED, Phase 9 step 1.5 (ADR-0002 Amendment 1, Decisions 5 + 7). Side a used to carry the whole PROSE
  // LINE from CLAUDE.md and side b a filename, so `equal: true` was unreachable in every state of the
  // repository — prose against a path is a category error reported forever in the vocabulary of a measurement.
  // Decision 7: pulling the cited PATH out of the prose is CAPTURE, not judgment (the same class as the regex
  // that finds the line at all), so `equal` stays a mechanical byte-compare and GAIA LAW holds.
  // It now converges: it reads equal the moment the cited path exists, or the citation goes.
  {
    const doc = grepFirst("CLAUDE.md", /viewer\/fqdn\.cjs/);
    const cited = doc ? (doc.line.match(/viewer\/fqdn\.cjs/) || [""])[0] : "";
    const a = side(doc ? `CLAUDE.md:${doc.no} — the path it cites, extracted` : "CLAUDE.md (no citation found)", cited);
    const ls = git(["ls-files", "viewer/fqdn.cjs"]);
    const b = side("git ls-files viewer/fqdn.cjs", ls.ok ? ls.out.trim() : "");
    out.push(driftSignal("drift.fqdn_cjs", a, b, "absent"));
  }
  // (2) the gate-row schema PATHS the docs cite vs those same paths on disk.
  //
  // REPAIRED, Phase 9 step 1.5 (ADR-0002 Amendment 1, Decisions 5 + 7). Side a used to carry a prose LINE and
  // side b a list of filenames — prose against paths, never convergent. Worse, the line it caught was
  // CLAUDE.md:581, which exists to RECORD that `$id` reads `gate_row.v1.json` and that this "is not a real
  // path; corrected 2026-07-14". The comparison was convicting the documentation OF the fix as though it were
  // the fault — use vs mention, the trap that has convicted honest prose on this platform repeatedly.
  //
  // So only strings that are actually PATHS are captured: they carry their directory. A bare `$id` URI
  // basename mentioned in prose is not a path citation and is deliberately not extracted. (A JSON Schema
  // `$id` is a URI identifier and is under no obligation to match a filename — treating it as a path was
  // the original category error.) Same kind, same normalization, sorted: it converges whenever every cited
  // schema path resolves, and goes unequal the moment a doc cites one that does not exist.
  {
    const cites = new Set();
    for (const f of ["docs/GATES.md", "docs/GAIA.md", "CLAUDE.md"]) {
      const c = readFileMaybe(path.join(REPO, f));
      if (!c.ok) continue;
      for (const m of c.content.matchAll(/production\/schemas\/gate_row[A-Za-z0-9._-]*\.json/g)) cites.add(m[0]);
    }
    const cited = [...cites].sort();
    const present = cited.filter((rel) => existsFile(path.join(REPO, rel))).sort();
    const a = side("docs/{GATES,GAIA}.md + CLAUDE.md — the gate_row schema paths they cite", cited.join("\n"));
    const b = side("the same paths, tested on disk", present.join("\n"));
    out.push(driftSignal("drift.gate_row_schema_path", a, b, "declared_vs_observed"));
  }
  // (3) the resolver: names the registry expects to resolve vs names that FAILED to resolve live.
  //
  // REPAIRED LAST, deliberately (Phase 9 step 1.5; ADR-0002 Amendment 1, Decision 5) — this signal is the
  // live demonstration of the stale-module defect that opened Phase 9. Side a used to carry
  // `.resolver.kind`, a 236-character PROSE SENTENCE, and side b a JSON array of 21 live tracking rows: a
  // label against an array, never convergent. It was also the field that exposed the stale Gaia — the
  // process served the pre-91ab10b 17-byte string "dnsmasq (planned)" while its envelope claimed a commit
  // that had already rewritten it. Both sides of that are now fixed: the body reports the bytes it is
  // really running (step 1.1), and this comparison can actually converge.
  //
  // The comparable question is not "what KIND of resolver was planned" — that is prose, and its own text
  // says to stop reading "(planned)" after 2026-07-26. It is: DOES DNS ACTUALLY RESOLVE? Side a is the
  // expectation (no name fails), side b the names that did fail, live. This is exactly the shape of
  // drift.git_dirty_vs_clean below — the pattern Amendment 1's own table certifies as well-formed and
  // convergent — and it bites the moment any declared name stops answering.
  {
    const a = side("expected: every registry name resolves (uni-dns authoritative for uni-lab.local)", "");
    let failed = "not probed";
    try {
      const snap = await snapshot();
      const dr = snap && snap.result ? snap.result.drift : null;
      const rows = Array.isArray(dr) ? dr : (dr && Array.isArray(dr.value) ? dr.value : null);
      if (Array.isArray(rows)) {
        // A row is a failure only when the name did not resolve at all. "fresh" (matches the declared
        // stable planes) and "tracking" (a DHCP-dynamic LAN plane followed by name, which is the DESIGNED
        // behaviour the host-tracking gate exists to enforce) are both healthy and are not faults.
        failed = rows
          .filter((r) => !Array.isArray(r.resolved) || r.resolved.length === 0)
          .map((r) => `${r.name}:${r.state}`)
          .sort()
          .join("\n");
      }
    } catch (_) { failed = "not probed"; }
    const b = side("viewer/infra.cjs snapshot().result.drift[] — names that did NOT resolve (live via chip :53)", failed);
    out.push(driftSignal("drift.resolver_planned", a, b, "declared_vs_observed"));
  }
  // (4) working tree: DD-expected clean vs live git status --short
  {
    const a = side("expected: clean working tree (DD rule — done only when committed+pushed)", "");
    const st = git(["status", "--short"]);
    const b = side("git -C <repo> status --short", st.ok ? st.out : (st.err || ""));
    out.push(driftSignal("drift.git_dirty_vs_clean", a, b, "snapshot_vs_live"));
  }
  // (5) self: the NAMES Gaia serves vs the same names as documented.
  //
  // REPAIRED, Phase 9 step 1.5 (ADR-0002 Amendment 1, Decision 5). Side a used to carry the whole CAPS JSON
  // blob (~11 KB) and side b the whole of docs/GAIA.md (~54 KB of markdown) — a JSON object against a
  // document. No achievable state of the repository makes those two byte-sets identical, so the signal could
  // only ever read false, and an inequality nobody can act on stops being read.
  //
  // The comparable thing is the NAME SET: every tool, resource and prompt Gaia actually serves, against
  // which of those same names the manifest documents. Same kind, same normalization, sorted and
  // newline-joined. It converges when the doc covers what is served, and goes unequal the moment a
  // capability is added or renamed without the manifest following — which is what this signal is FOR.
  {
    const caps = safeRequire("./caps.cjs");
    const C = (caps && caps.CAPS) || {};
    const names = [
      ...(C.tools || []).map((t) => t && t.name),
      ...(C.resources || []).map((r) => r && (r.uri || r.name)),
      ...(C.prompts || []).map((p) => p && p.name),
    ].filter(Boolean).sort();
    const gaiaDoc = readFileMaybe(path.join(REPO, "docs/GAIA.md"));
    const docText = gaiaDoc.ok ? gaiaDoc.content : "";
    const documented = names.filter((n) => docText.includes(n));
    const a = side("viewer/gaia/caps.cjs CAPS — the tool/resource/prompt names served", names.join("\n"));
    const b = side("docs/GAIA.md — the same names, each tested for presence", documented.join("\n"));
    out.push(driftSignal("drift.self_caps_doc_vs_served", a, b, "self"));
  }
  // (6) replica gate ledgers — canonical digest read LIVE vs each replica's digest as CAPTURED.
  // The only like-for-like drift comparison here: hex digest against hex digest, so `equal` actually
  // means what a reader thinks it means. The other five compare unlike things and can never converge
  // (see docs/control-plane/phases/PHASE-1-RESULTS.md). Gaia is not an ssh client — an agent runs
  // viewer/gaia/replica_ledger_probe.cjs and Gaia mirrors the capture, never fabricating it.
  {
    const rl = readFileMaybe(path.join(REPO, "viewer/gaia/replica_ledgers.json"));
    let doc = null;
    if (rl.ok) { try { doc = JSON.parse(rl.content); } catch (_) {} }
    const canonDigest = (() => {
      const f = readFileMaybe(path.join(REPO, "evidence/gates.ndjson"));
      return f.ok ? crypto.createHash("sha256").update(f.content).digest("hex") : "";
    })();
    for (const rep of (doc && Array.isArray(doc.replicas) ? doc.replicas : [])) {
      const a = side("sha256 evidence/gates.ndjson (canonical, read live)", canonDigest);
      // THE FENCE: a capture past CAPTURE_MAX_AGE_S is NOT rendered as a value. Its digest is withheld and
      // replaced by an explicit STALE_CAPTURE marker carrying the age, so nothing downstream can mistake a
      // day-old reading for the deployment's current state. The reading is not deleted — its age is the
      // finding, and the locator still names exactly when it was taken and how to retake it.
      const age = captureAge(rep.captured_at, NOW_MS);
      const b = side(
        rep.ok
          ? (age.fresh
              ? `${rep.source} [captured ${rep.captured_at}, age ${age.age_s}s <= ${age.max_s}s]`
              : `STALE CAPTURE — ${rep.name} captured ${rep.captured_at} (age ${age.known ? age.age_s + "s" : "unparseable"} > max ${age.max_s}s); value WITHHELD, not rendered. Re-measure: node viewer/gaia/replica_ledger_probe.cjs`)
          : `${rep.name}: ${rep.error || "NOT_CAPTURED"}`,
        rep.ok && age.fresh ? String(rep.sha256 || "") : (rep.ok ? "STALE_CAPTURE" : "")
      );
      out.push(driftSignal(`drift.replica_ledger.${String(rep.name).replace(/[^a-zA-Z0-9_.]/g, "_")}`, a, b, "snapshot_vs_live"));
    }

    // (6b) drift.deploy_ref_behind_head.<build> — relation `lag` (Phase 9 step 1.6).
    //
    // ADR-0002 Amendment 1 Decision 6: where two things legitimately differ forever — a deployment lagging
    // its source — that fact belongs in a signal with its OWN relation, classified and dated, rather than
    // left looking like an unresolved fault. (6) above cannot do that: it compares a full-file digest to a
    // full-file digest, so a deployment that is merely BEHIND is indistinguishable from one that has been
    // EDITED IN PLACE. Both just read "digests differ", and that is how a real divergence hides inside an
    // expected lag.
    //
    // THE TRIPWIRE, AND WHY IT IS NOT A TOLERANCE. The pre-registered falsifier for 1.6 is "a tolerance that
    // swallows the in-place-edit case", so there is no tolerance here at all. It uses an EXACT structural
    // property instead: evidence/gates.ndjson is APPEND-ONLY, therefore a deployment that is honestly N rows
    // behind must be a BYTE-EXACT PREFIX of canonical. Hash canonical's first `rep.rows` lines and compare to
    // the replica's captured digest:
    //   equal  -> a CLEAN lag: every row the replica holds is byte-identical to canonical's, and the only
    //             difference is rows it has not received yet. The lag count rides in the locator, dated.
    //   unequal-> the append-only relation DOES NOT HOLD between canonical and that deployment. Something was
    //             changed rather than merely not-yet-appended.
    // A single edited byte in any row the replica holds flips it, which is precisely what (6) could not see.
    //
    // NORMALIZATION (Decision 5, "computed the same way"): the deployed copies do not share this working
    // tree's mixed line endings, so the prefix is hashed under each candidate normalization and the signal
    // reports which one matched. That is selecting the like-for-like comparison, never widening it — a
    // candidate matches byte-exactly or it does not match.
    //
    // HONEST LIMIT: unequal locates the divergence, it does not attribute it. Canonical having been rewritten
    // and the chip having been edited both break the prefix relation, and telling them apart needs the chip
    // (S2). The signal says which, never who.
    {
      // Read the TRUE FILE BYTES, not a utf8-decoded string. The ledger carries non-ASCII (em-dashes in
      // detail fields), so decoding to utf8 and re-encoding as latin1 — or vice versa — changes the bytes
      // and every candidate normalization then misses. Latin1 ("binary") round-trips each byte exactly,
      // which is what a byte-identity comparison requires. This is not a detail: on the first live run it
      // reported "no candidate normalization matched" for a replica that IS a clean prefix.
      let canonLines = [];
      try {
        canonLines = fs.readFileSync(path.join(REPO, "evidence/gates.ndjson")).toString("binary").split(/(?<=\n)/);
      } catch (_) { canonLines = []; }
      // NORMS and the prefix verdict now live at module scope (see `prefixVerdict` below) so the
      // gate can exercise THE SHIPPED RULE instead of a copy typed into itself.
      const NORMS = PREFIX_NORMS;
      for (const rep of (doc && Array.isArray(doc.replicas) ? doc.replicas : [])) {
        if (!rep.ok || !rep.rows) continue;
        // Same fence (step 1.7): a stale capture cannot support a claim about the deployment NOW. The
        // prefix verdict is withheld rather than computed, because "this was a clean lag 23.7 hours ago"
        // and "this is a clean lag" are different statements and only one of them is evidence.
        const cage = captureAge(rep.captured_at, NOW_MS);
        if (!cage.fresh) {
          const aS = side(`canonical prefix rows 1..${rep.rows} — verdict WITHHELD, capture is stale`, "STALE_CAPTURE");
          const bS = side(`STALE CAPTURE — ${rep.name} captured ${rep.captured_at} (age ${cage.known ? cage.age_s + "s" : "unparseable"} > max ${cage.max_s}s). Re-measure: node viewer/gaia/replica_ledger_probe.cjs`, "STALE_CAPTURE_" + rep.rows);
          out.push(driftSignal(`drift.deploy_ref_behind_head.${String(rep.name).replace(/[^a-zA-Z0-9_.]/g, "_")}`, aS, bS, "lag"));
          continue;
        }
        const { matched, digests, lag } = (() => {
          const v = prefixVerdict(canonLines, rep.rows, rep.sha256);
          return { matched: v.normalization, digests: v.digests, lag: v.lag };
        })();
        // Side a is the canonical prefix digest under the normalization that matched; when none matches there
        // is no like-for-like candidate, so `as-is` is carried and the sides differ — which IS the finding.
        const a = side(
          `sha256 of evidence/gates.ndjson rows 1..${rep.rows} (canonical prefix, ${matched || "no candidate normalization matched"}) — lag ${lag} row(s) behind ${canonLines.length}`,
          digests[matched || "as-is"]
        );
        const b = side(`${rep.source} [captured ${rep.captured_at}]`, String(rep.sha256 || ""));
        out.push(driftSignal(`drift.deploy_ref_behind_head.${String(rep.name).replace(/[^a-zA-Z0-9_.]/g, "_")}`, a, b, "lag"));
      }
    }
  }
  return out;
}

// ── 11. organic-operator — the HUMAN-FLOW seat (added 2026-07-16) ─────────────────
// The operator asked to "pull Organic Operator in Gaia so all are one resonance". This seat
// projects the persona's own doc + skill VERBATIM, so every agent and every surface reads the
// SAME words from ONE place — never a paraphrase, never a second copy that drifts.
//
// GAIA LAW compliance (this seat is the easiest one to get wrong):
//   * Every signal is a VERBATIM byte range of a file on disk, carrying its own locator + sha256.
//   * Gaia does NOT judge whether the studio is flyable. She does not run the gauntlet, score a
//     verdict, or summarize the persona. She carries the persona's TEXT so the reader can run it.
//     The verdict belongs to whoever invokes /organic-operator — never to the mirror.
//   * The five needs are projected as the doc's own table rows, not as anything Gaia computed.
// Mirrors scienceSignals()'s discipline exactly: excerpt + locator + reverify, nothing derived.
async function organicOperatorSignals() {
  const out = [];
  const docRel = "docs/lab_team/06_organic_operator.md";
  const f = readFileMaybe(path.join(REPO, docRel));
  if (!f.ok) {
    // Honest omission: an absent persona yields NO signal rather than a fabricated one.
    return out;
  }
  const lines = f.content.split("\n");

  // (a) the whole persona, verbatim — the one canonical text.
  out.push(sig({
    id: "organic-operator.persona", seat: "organic-operator", kind: "file",
    raw: f.content,
    locator: docRel,
    reverify: `sha256sum ${docRel}`,
  }));

  // (b) the named sections, each as its own signal, so a consumer can project just the gauntlet or
  //     just the five needs without re-parsing the whole doc. Ranges are computed from the file's
  //     OWN headings — never hardcoded line numbers, which would rot on the next edit.
  const sections = [
    ["organic-operator.five_needs", "## The five needs"],
    ["organic-operator.gauntlet", "## The gauntlet"],
    ["organic-operator.verdicts", "## Verdicts"],
    ["organic-operator.guards", "## Guarded failure mode"],
    ["organic-operator.claim_fence", "## Relationship to the claim fence"],
    ["organic-operator.live_findings", "## Live findings"],
  ];
  for (const [id, heading] of sections) {
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) continue;
    let end = lines.slice(start + 1).findIndex((l) => /^## /.test(l));
    end = end < 0 ? lines.length : start + 1 + end;
    out.push(sig({
      id, seat: "organic-operator", kind: "file",
      raw: lines.slice(start, end).join("\n"),
      locator: `${docRel}:L${start + 1}-L${end}`,
      reverify: `sed -n '${start + 1},${end}p' ${docRel}`,
    }));
  }

  // (c) the invokable skill — so an agent reading Gaia learns the persona EXISTS and how to call it.
  //     Lives outside the repo (the skills dir), so its absence is projected honestly rather than
  //     silently skipped: a persona documented but not invokable is a real gap worth seeing.
  const skillAbs = path.join(process.env.USERPROFILE || require("os").homedir(), ".claude", "skills", "organic-operator.md");
  const sk = readFileMaybe(skillAbs);
  out.push(sig({
    id: "organic-operator.skill", seat: "organic-operator", kind: "file",
    raw: sk.ok ? sk.content : "",
    locator: sk.ok ? "~/.claude/skills/organic-operator.md" : "~/.claude/skills/organic-operator.md (ABSENT — persona documented but not invokable)",
    reverify: "cat ~/.claude/skills/organic-operator.md",
  }));
  return out;
}

// ── 12. control-plane — the Control Plane's OWN ledger, projected VERBATIM ────
//
// GAIA LAW, restated because this seat is the one most tempting to break: Gaia
// carries the ledger's BYTES. She does not count its entries, does not summarise
// what the phases did, and does not say whether the chain is sound. The Control
// Plane authors; Gaia projects. A reader who wants a verdict runs
// SP.ControlPlane.Store.attest/1 themselves — the locator says how.
//
// Every entry is one signal whose value.raw is the exact stored line. The anchor
// is one more. Nothing here is derived from them.
async function controlPlaneSignals() {
  const out = [];
  const dir = path.join(REPO, "evidence", "control_plane");

  // ── PHASE-9 remediation plan, projected VERBATIM ───────────────────────────
  //
  // One signal per stage, each carrying that stage's own JSON bytes unchanged —
  // the same shape as the gate ledger's line-per-row projection above. Gaia
  // COUNTS NOTHING here: no step tallies, no percent complete, no "on track".
  // A reader who wants a count reads the stages and counts them, and owns that
  // arithmetic (GAIA LAW; the same reason Scene.fogged/1 returns nodes, not a count).
  //
  // The seat is `control-plane`, which already exists and is already declared in
  // caps.cjs, the gaia.signal.get enum and docs/GAIA.md — so this adds no seat and
  // cannot break `gaia-every-emitted-seat-declared`.
  //
  // Resonance: TRACK renders this same file and the plan document cites it. Three
  // surfaces, one source of bytes. None can state a status the others do not.
  const plan = readFileMaybe(path.join(REPO, "evidence", "remediation", "phase9_plan.json"));
  if (plan.ok) {
    let parsed = null;
    try {
      parsed = JSON.parse(plan.content);
    } catch {
      /* an unparseable plan is projected as-is below; Gaia does not repair it */
    }

    out.push(sig({
      id: "control-plane.remediation.plan",
      seat: "control-plane",
      kind: "file",
      raw: plan.content,
      locator: "evidence/remediation/phase9_plan.json",
      reverify: "sha256sum evidence/remediation/phase9_plan.json",
    }));

    if (parsed && Array.isArray(parsed.stages)) {
      parsed.stages.forEach((stage) => {
        out.push(sig({
          id: `control-plane.remediation.stage.${stage.id}`,
          seat: "control-plane",
          kind: "file",
          raw: JSON.stringify(stage),
          locator: `evidence/remediation/phase9_plan.json .stages[id=${stage.id}]`,
          reverify: `node -e "const p=require('./evidence/remediation/phase9_plan.json');console.log(JSON.stringify(p.stages.find(s=>s.id==='${stage.id}')))"`,
        }));
      });
    }

    if (parsed && parsed.road_to_air) {
      out.push(sig({
        id: "control-plane.remediation.road_to_air",
        seat: "control-plane",
        kind: "file",
        raw: JSON.stringify(parsed.road_to_air),
        locator: "evidence/remediation/phase9_plan.json .road_to_air",
        reverify: "node -e \"console.log(JSON.stringify(require('./evidence/remediation/phase9_plan.json').road_to_air))\"",
      }));
    }
  }

  const led = readFileMaybe(path.join(dir, "ledger.ndjson"));
  if (led.ok) {
    const lines = led.content.split(/\r?\n/).filter((l) => l.trim());
    lines.forEach((line, i) => {
      const seq = i + 1;
      out.push(sig({
        id: `control-plane.ledger.entry.${seq}`, seat: "control-plane", kind: "file",
        raw: line,
        locator: `evidence/control_plane/ledger.ndjson:L${seq}`,
        reverify: `sed -n '${seq}p' evidence/control_plane/ledger.ndjson`,
      }));
    });
  }

  const anc = readFileMaybe(path.join(dir, "anchor.json"));
  if (anc.ok) {
    out.push(sig({
      id: "control-plane.anchor", seat: "control-plane", kind: "file",
      raw: anc.content.trim(),
      locator: "evidence/control_plane/anchor.json",
      reverify: "cat evidence/control_plane/anchor.json",
    }));
  }

  // The witness capture, carried verbatim — including the REFUSAL that makes the
  // off-box custodian a custodian, and the negative control that makes the
  // refusal evidence rather than a broken probe.
  const wit = readFileMaybe(path.join(__dirname, "witness.json"));
  if (wit.ok) {
    out.push(sig({
      id: "control-plane.witness.capture", seat: "control-plane", kind: "file",
      raw: wit.content.trim(),
      locator: "viewer/gaia/witness.json",
      reverify: "node viewer/gaia/witness_probe.cjs",
    }));
  }

  return out;
}

module.exports = {
  gitSignals, gateLedgerSignals, infraSignals, scienceSignals, studioProbeSignals,
  colonyProbeSignals, sessionSignals, runningConfigSignals, organicOperatorSignals,
  controlPlaneSignals, selfSignals, driftSignals,

  // EXPORTED 2026-07-28 SO THE GATES CAN TEST THE SHIPPED RULE INSTEAD OF A COPY OF IT.
  //
  // Four gates — capture-age, deploy-lag, witness-blocked, drift-wellformed — each declared "the
  // rule under test, rebuilt here exactly as the collector applies it" and then tested only that
  // rebuild. Two of them required no module and opened no file. Their check names assert runtime
  // properties of Gaia, so IF THIS FENCE WERE DELETED FROM THIS FILE ENTIRELY, ALL FOUR WOULD HAVE
  // STAYED GREEN. `CAPTURE_MAX_AGE_S` was separately hardcoded as `MAX = 3600` in two of them, so
  // the bound could drift here without either noticing.
  //
  // A second implementation that is never compared is not an independent oracle; it is a second
  // place for the bug to live, with a gate guarding the wrong one.
  _rule: { CAPTURE_MAX_AGE_S, captureAge, driftSignal, PREFIX_NORMS, prefixVerdict, witnessBlockingConditions },
};
