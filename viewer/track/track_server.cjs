// UNI TRACK — the operator's project-tracking surface. Port 8102.
//
// WHAT THIS IS: a persistent, live projection of where the work came from, where it is,
// where it is going, and what is predicted next — read from the REAL artifacts on every
// request. It is a communication surface for the organic operator, not a test dump.
//
// WHAT THIS IS NOT: it is not Gaia (:8096), not the HUD (:8100), not the Door (:8090),
// and not the Control Plane lab view. Those four bodies are not collapsed into this one.
//
// THE LAW IT INHERITS (from the Door, verbatim): a polled READ never spawns anything.
// Every route here except POST /api/comment is a pure read. Nothing is actuated by looking.
//
// AND THE WRITE NOW HAS A LAW TOO, which it did not until 2026-07-28: loopback peer, `x-uni-cc: 1`,
// and a JSON content-type. Stating the read law while the single write route had no fence at all is
// exactly the shape of dishonesty this instrument exists to catch, and it survived here for months
// because nothing ever probed it. See the route itself for the full account.
//
// NO COMPETING TRUTH STORE: this server owns NOTHING. Every value is read live, per request,
// from its real source and carries that source's path so the operator can go check it:
//   phases + architecture + ADRs  ->  UNI-FLAGELLUM/docs/control-plane/**
//   gate ledger                   ->  UNI.Minecraft/evidence/gates.ndjson (canonical)
//   live signals + drift          ->  Gaia http://127.0.0.1:8096/api/gaia
//   voice log                     ->  ClaudeSpeak http://127.0.0.1:5858/api/transcripts
//   history                       ->  git log of both repos
// IT WRITES EXACTLY TWO FILES, both append-only and neither ever edited:
//   evidence/track_comments.ndjson   the agent's notes against a target        (POST /api/comment)
//   evidence/decisions.ndjson        THE OPERATOR'S ANSWER, hash-chained       (POST /api/decision)
// This line said "the ONLY thing it writes is track_comments.ndjson" until 2026-07-31, and the
// second route made that false the moment it landed. A header sentence about what a server writes is
// exactly the hand-written claim resonance L5 exists to catch, so it is corrected here in the same
// commit rather than left to be found.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const buildIdentity = require("../build_identity.cjs"); // BOOT IDENTITY — the commit+module-set THIS process runs
// NOT `decisions` — this file already has a `function decisions()` at the ADR reader below, which
// lists docs/control-plane/decisions/*.md. Two different senses of the word: those are ARCHITECTURAL
// decision records written as prose and reviewed; this is THE OPERATOR ANSWERING A STOP. Node caught
// the collision as a redeclaration; the naming keeps them apart for the next reader too.
const decisionLedger = require("./decisions.cjs");      // THE OPERATOR'S ANSWER — append-only, hash-chained

const PORT = Number(process.env.TRACK_PORT || 8102);
const MC = path.resolve(__dirname, "..", "..");
const FLAG = process.env.FLAG_REPO ||
  path.resolve("C:/Users/mpolz/Documents/UNI-Flagellum/UNI-FLAGELLUM");
const CP = path.join(FLAG, "docs", "control-plane");
// TRACK_COMMENTS exists so the gate can boot this server against a THROWAWAY ledger and prove the
// accept path really accepts — a fence gate with no positive control passes by refusing everything,
// and a positive control that appends to the real evidence file is a gate that writes evidence.
const COMMENTS = process.env.TRACK_COMMENTS || path.join(MC, "evidence", "track_comments.ndjson");

// THE TWO WRITE-FENCE DECISIONS, AS PURE FUNCTIONS — extracted 2026-07-28 so the gate can test the
// DECISION rather than grep the source for a variable name. verify_track.cjs used to assert the peer
// fence by `/remoteAddress/.test(source)`, which every loopback probe satisfied while the refusal
// branch was never exercised — a source regex standing in for a security property. These are
// exported and unit-tested directly, with `10.190.245.5` and `evil.test` among the inputs.
function isLoopbackPeer(addr) {
  const a = String(addr || "");
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
function isLoopbackHost(hostHeader) {
  // The port is the client's business; the NAME is what must be loopback. An attacker-controlled
  // hostname that resolves to 127.0.0.1 arrives here carrying its own name, and this is where it dies.
  const host = String(hostHeader || "").toLowerCase().replace(/:\d+$/, "");
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}
const GAIA = "http://127.0.0.1:8096/api/gaia";
const VOICE = "http://127.0.0.1:5858/api/transcripts";

const readMaybe = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

function git(repo, args) {
  try { return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8", timeout: 8000 }).trim(); }
  catch { return ""; }
}

// Gaia serves ~845 KB and takes ~6.5s locally — a real upstream cost, surfaced not hidden.
function fetchJson(url, ms = 25000) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: ms }, (res) => {
      let b = ""; res.setEncoding("utf8");
      res.on("data", (d) => (b += d));
      res.on("end", () => { try { const j = JSON.parse(b); if (j && typeof j === "object") j.__ms = Date.now() - t0; resolve(j); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}


// ── live service probes: the diagram's status must come from a real connect, never a claim ──
function probe(host, port, ms = 1200) {
  return new Promise((resolve) => {
    const net = require("net");
    const sock = new net.Socket();
    let done = false;
    const fin = (up) => { if (!done) { done = true; try { sock.destroy(); } catch {} resolve(up); } };
    sock.setTimeout(ms);
    sock.once("connect", () => fin(true));
    sock.once("timeout", () => fin(false));
    sock.once("error", () => fin(false));
    sock.connect(port, host);
  });
}
const SERVICES = [
  { key: "door",   name: "The Door",       port: 8090, url: "http://127.0.0.1:8090/door" },
  { key: "gaia",   name: "Gaia",           port: 8096, url: "http://127.0.0.1:8096/" },
  { key: "hud",    name: "The HUD",        port: 8100, url: null, note: "loopback-only by design" },
  { key: "track",  name: "UNI TRACK",      port: 8102, url: "http://127.0.0.1:8102/" },
  { key: "voice",  name: "Voice log",      port: 5858, url: "http://127.0.0.1:5858/" },
  { key: "phoenix",name: "Colony UI",      port: 4000, url: "http://127.0.0.1:4000/" },
];
async function services() {
  return Promise.all(SERVICES.map(async (s) => ({ ...s, up: await probe("127.0.0.1", s.port) })));
}

// ── the build map. Each part's state is a LIVE READ of whether its module exists
//    on disk — never a hand-transcribed status that can drift from the code.
const CP_PARTS = [
  { name: "Ledger",       phase: "2", src: "lib/sp/control_plane/ledger.ex",       detail: "append-only, hash-chained" },
  { name: "GateRow",      phase: "2", src: "lib/sp/control_plane/gate_row.ex",     detail: "validate against the schema" },
  { name: "Command",      phase: "2", src: "lib/sp/control_plane/command.ex",      detail: "the only writer" },
  { name: "Drift",        phase: "2", src: "lib/sp/control_plane/drift.ex",        detail: "like-for-like, or refused" },
  { name: "Registry",     phase: "3", src: "lib/sp/control_plane/registry.ex",     detail: "register a gate before its run" },
  { name: "Verdict",      phase: "3", src: "lib/sp/control_plane/verdict.ex",      detail: "PASS/PARTIAL/FAIL/WITHHELD" },
  { name: "Anchor",       phase: "3", src: "lib/sp/control_plane/anchor.ex",       detail: "holds the head the chain cannot" },
  { name: "Store",        phase: "4", src: "lib/sp/control_plane/store.ex",        detail: "durable, or it cannot record itself" },
  { name: "Run + Pair",   phase: "4", src: "lib/sp/control_plane/run.ex",          detail: "one variable, or VOID" },
  { name: "Witness",      phase: "5", src: "lib/sp/control_plane/witness.ex",      detail: "node2 refuses the writer's key" },
  { name: "Rooms + Keys", phase: "6", src: "lib/sp/control_plane/room.ex",         detail: "two parties, receipts on disk, no override" },
  { name: "Scene",        phase: "7", src: "lib/sp/control_plane/scene.ex",        detail: "unbacked renders as fog" },
  { name: "Lab View",     phase: "7", src: "ui/lib/sp_ui_web/live/lab_live.ex",    detail: "the immersive room" },
];

function buildMap(ph) {
  const plans = (ph.phases || []).filter((p) => !p.isResult);
  const nextPlan = plans[plans.length - 1] || null;
  const nextMatch = nextPlan ? /PHASE-(\d+)/.exec(nextPlan.file || "") : null;
  const nextPhaseNo = nextMatch ? nextMatch[1] : null;

  const parts = CP_PARTS.map((p) => {
    const built = fs.existsSync(path.join(MC, p.src));
    return {
      name: p.name,
      phase: p.phase,
      detail: p.detail,
      src: p.src,
      state: built ? "BUILT" : p.phase === nextPhaseNo ? "NEXT" : "PLANNED",
    };
  });

  const builtCount = parts.filter((p) => p.state === "BUILT").length;
  const cpState = builtCount === 0 ? "NOT_BUILT" : builtCount === parts.length ? "BUILT" : "PARTLY_BUILT";

  return {
    next_phase: nextPlan ? nextPlan.title : null,
    next_items: nextPlan ? nextPlan.items.map((i) => ({ id: i.id, item: i.item })) : [],
    bodies: [
      { name: "The Door", state: "BUILT", detail: "admission, release, keys, journey" },
      { name: "Gaia", state: "BUILT", detail: "read-only witness, 8 drift signals" },
      { name: "The HUD", state: "BUILT", detail: "sees and carries, authors nothing" },
      {
        name: "The Control Plane",
        state: cpState,
        detail: `${builtCount} of ${parts.length} parts built — no verdict authored yet`,
      },
    ],
    control_plane_parts: parts,
  };
}

// ── the gate ledger, canonical, read fresh ──────────────────────────────────────
function ledger() {
  const raw = readMaybe(path.join(MC, "evidence", "gates.ndjson"));
  if (!raw) return { ok: false, source: "evidence/gates.ndjson", error: "NOT_LOCATED" };
  const rows = raw.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const byName = new Map();
  for (const r of rows) byName.set(r.name, r);           // last row per name wins (append-only revisions)
  const latest = [...byName.values()];
  const tally = {};
  for (const r of latest) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
  return {
    ok: true, source: "UNI.Minecraft/evidence/gates.ndjson (canonical)",
    rows: rows.length, unique: latest.length, tally,
    fails: latest.filter((r) => r.verdict === "FAIL").map((r) => ({ name: r.name, phase: r.phase, receipt: r.receipt_path, falsifies: r.falsifies_condition, notes: (r.notes || "").slice(0, 400) })),
    partial: latest.filter((r) => r.verdict === "PARTIAL").map((r) => ({ name: r.name, receipt: r.receipt_path })),
    pending: latest.filter((r) => r.verdict === "PENDING").map((r) => ({ name: r.name, receipt: r.receipt_path })),
  };
}

// ── phases: parse the pre-registered plans + results ────────────────────────────
function phases() {
  const dir = path.join(CP, "phases");
  if (!exists(dir)) return { ok: false, source: "docs/control-plane/phases", error: "NOT_LOCATED" };
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort()) {
    const body = readMaybe(path.join(dir, f)) || "";
    const status = (body.match(/\*\*Status:\*\*\s*([^\n·]+)/) || [, "?"])[1].trim();
    const title = (body.match(/^#\s*(.+)$/m) || [, f])[1].trim();
    const isResult = /RESULTS/i.test(f);
    // pre-registered table rows: | 1.2 | item | expected | falsifier |
    const items = [...body.matchAll(/^\|\s*(\d+\.\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/gm)]
      .map((m) => ({ id: m[1], item: m[2], expected: m[3], falsifier: m[4] }));
    // disposition rows in a RESULTS doc
    const disp = [...body.matchAll(/^\|\s*(\d+\.\d+)\s*\|\s*([^|]+?)\s*\|\s*\*\*([A-Z_]+)[^|]*\|$/gm)]
      .map((m) => ({ id: m[1], item: m[2], disposition: m[3] }));
    out.push({ file: f, title, status, isResult, items, disp, bytes: body.length, source: `docs/control-plane/phases/${f}` });
  }
  return { ok: true, phases: out };
}

function decisions() {
  const dir = path.join(CP, "decisions");
  if (!exists(dir)) return [];
  return fs.readdirSync(dir).filter((x) => x.endsWith(".md")).sort().map((f) => {
    const b = readMaybe(path.join(dir, f)) || "";
    return {
      file: f,
      title: (b.match(/^#\s*(.+)$/m) || [, f])[1].trim(),
      status: (b.match(/\*\*Status:\*\*\s*(.+)/) || [, "?"])[1].trim(),
      falsifier: (b.split(/##\s*Falsifier/i)[1] || "").split(/\n##/)[0].trim().slice(0, 300),
      source: `docs/control-plane/decisions/${f}`,
    };
  });
}

function history(repo, name, n = 12) {
  const log = git(repo, ["log", `-${n}`, "--format=%h%x1f%cI%x1f%s"]);
  return {
    repo: name,
    head: git(repo, ["rev-parse", "--short", "HEAD"]),
    branch: git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]),
    dirty: git(repo, ["status", "--short"]).split("\n").filter(Boolean),
    ahead: git(repo, ["rev-list", "--count", "@{u}..HEAD"]) || "0",
    commits: log ? log.split("\n").map((l) => { const [h, d, s] = l.split("\x1f"); return { h, d, s }; }) : [],
  };
}

function comments() {
  const raw = readMaybe(COMMENTS);
  if (!raw) return [];
  return raw.split("\n").filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

// ── the calibration block: VFE / EFE, stated honestly as a MODEL, never a measurement ──
function calibration(led, ph, gaia) {
  const drift = gaia ? (gaia.result?.signals || []).filter((s) => s.seat === "drift") : [];
  const unequal = drift.filter((s) => { try { return JSON.parse(s.value.raw).equal === false; } catch { return false; } }).length;
  const done = ph.ok ? ph.phases.filter((p) => p.isResult).length : 0;
  const planned = ph.ok ? ph.phases.filter((p) => !p.isResult).length : 0;
  return {
    note: "VFE and EFE here are a PLANNING MODEL over the project's own state, not a physical measurement and not the colony's free energy. They carry ZERO evidential weight for any scientific claim.",
    surprise_terms: [
      { term: "unresolved drift", value: unequal, of: drift.length, reading: unequal ? `${unequal} of ${drift.length} drift signals unequal — Phase 1 established 4 of 5 CANNOT converge by construction, so this term does not fall by working harder` : "no drift" },
      { term: "gates not PASS", value: (led.tally?.FAIL || 0) + (led.tally?.PARTIAL || 0) + (led.tally?.PENDING || 0), of: led.unique, reading: "PENDING is registered-not-run; FAIL is a real falsified result and must ride visibly" },
      { term: "phases executed", value: done, of: done + planned, reading: "a phase is complete only when its successor plan exists" },
    ],
    efe_next: "Phase 2 minimises expected surprise by making the FIRST programmatic writer to gates.ndjson exist. Today no module appends it (NOT_LOCATED) — the instruction in docs/GATES.md:4 has no implementation, so every append is a hand-edit no test can catch.",
    ambiguity_reduced: "Phase 2's seven red tests each name the failure mode BEFORE the code exists. Ambiguity falls only where a test can fail for the correct reason.",
    risk_not_reduced: "Nothing in Phase 2 touches P4 transfer. The flagellum ladder stays P8 = FULL_PARITY = false, first unsatisfied rung P4, irreducibly external.",
  };
}

async function snapshot() {
  const led = ledger();
  const ph = phases();
  // MEASURED 2026-08-02, LIVE, and it is why the operator called his own tracking surface "broken":
  // these two reads were awaited SEQUENTIALLY at fetchJson's 25-SECOND default. So /api/track could
  // not answer for half a minute, the page shell loaded, the data never arrived, and it read as dead
  // software rather than as slow software. Two independent faults, both fixed here:
  //
  //   1. THEY ARE INDEPENDENT, so they run in parallel. Neither read feeds the other.
  //   2. THE BUDGET IS HUMAN-SCALED. This is a polled read for a page a person is watching; a probe
  //      that takes longer than a person will wait has already failed, whatever it returns.
  //
  // AND THE FIRST DIAGNOSIS OF *WHY* GAIA WAS SLOW WAS WRONG, WHICH IS THE MORE IMPORTANT NOTE.
  // The first version of this comment said Gaia "accepts the SYN and never answers" — a hung process.
  // Measured directly: Gaia is UP and SLOW. `GET /api/gaia` returns 1,232,014 bytes in 19.1 s, while
  // its own HTML root answers in 0.3 s. NO page-load budget can contain a 19-second read, so a short
  // timeout here does not make Gaia readable — it only makes TRACK fast. That distinction has to
  // survive into what the page SAYS, because "Gaia is unreachable" and "Gaia did not answer inside
  // this page's budget" are different facts about the world, and reporting the second as the first
  // would be this surface telling the operator a service is absent when it is merely slow. The gaia
  // branch below therefore probes the port and reports which of the two actually happened.
  //
  // Deliberately NOT "fixed" by caching: a stale panel that looks live is the failure mode this
  // estate exists to refuse, and the law printed at the top of this very snapshot forbids it.
  const GAIA_BUDGET_MS = 2500;
  const [gaia, voice, gaiaPortOpen] = await Promise.all([
    fetchJson(GAIA, GAIA_BUDGET_MS),
    fetchJson(VOICE, 4000),
    probe("127.0.0.1", Number(new URL(GAIA).port) || 80),
  ]);
  const sigs = gaia ? (gaia.result?.signals || []) : [];
  const seats = {};
  for (const s of sigs) seats[s.seat] = (seats[s.seat] || 0) + 1;
  const drift = sigs.filter((s) => s.seat === "drift").map((s) => {
    let v = {}; try { v = JSON.parse(s.value.raw); } catch {}
    return { id: s.id, relation: v.relation, equal: v.equal, a: (v.a || {}).locator, b: (v.b || {}).locator };
  });
  return {
    generated_at: new Date().toISOString(),
    law: "A polled read never spawns anything. Every value below is read live from its named source.",
    // BOOT IDENTITY of THIS TRACK process — commit + module-set frozen at boot (distinct from `history`, which
    // is the repositories' LIVE state). If self_identity.boot_git_commit lags history[].head, TRACK itself is
    // running stale bytes — the operator's own surface, which the 2026-07-26 census found 20 commits behind.
    self_identity: buildIdentity.identity(),
    ledger: led,
    phases: ph,
    decisions: decisions(),
    // THREE OUTCOMES, NOT TWO. A read that timed out and a service that is absent are different
    // facts, and collapsing them is how a surface comes to report a slow dependency as a missing one.
    gaia: gaia
      ? { up: true, signals: sigs.length, seats, drift, source: GAIA, git_commit: gaia.envelope?.git_commit, fetch_ms: gaia.__ms }
      : gaiaPortOpen
        ? {
            up: false, reachable: true, timed_out: true, budget_ms: GAIA_BUDGET_MS, source: GAIA,
            note: `Gaia is RUNNING and did not answer within this page's ${GAIA_BUDGET_MS}ms budget. Measured 2026-08-02: a full /api/gaia read is ~1.2 MB and takes ~19 s, so no page-load budget can contain it — this panel is empty because Gaia is SLOW, not because Gaia is absent. Read it directly if you need the signals.`,
          }
        : { up: false, reachable: false, source: GAIA, note: "Gaia unreachable — nothing is listening. This is a true signal, not a defect. Nothing is fabricated." },
    voice: voice ? { up: true, count: Array.isArray(voice) ? voice.length : (voice.entries || []).length, entries: (Array.isArray(voice) ? voice : voice.entries || []).slice(0, 25), source: VOICE } : { up: false, source: VOICE },
    history: [history(FLAG, "UNI-FLAGELLUM"), history(MC, "UNI.Minecraft")],
    comments: comments(),
    calibration: calibration(led, ph, gaia),
    services: await services(),
    build: buildMap(ph),
    plan: plan(),
  };
}

// ── PHASE-9: the plan, read LIVE from its single source of truth ──────────────
//
// evidence/remediation/phase9_plan.json is authoritative. TRACK renders it and
// Gaia projects it; none of the three may state a status the others do not. The
// file is read on every request and cached nowhere, so this surface cannot drift
// from it — the same law as every other value on this page.
//
// `resonance` below is the only thing computed here, and it is computed over
// TRACK's own render, not over Gaia's. Gaia is forbidden to compute (GAIA LAW);
// TRACK is not, and counting its own rows is arithmetic a reader can redo.
function plan() {
  const p = path.join(MC, "evidence", "remediation", "phase9_plan.json");
  const raw = readMaybe(p);
  if (!raw) return { ok: false, source: "evidence/remediation/phase9_plan.json", note: "plan file absent — not fabricated" };
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { ok: false, source: p, note: "plan file unparseable: " + e.message }; }

  const steps = (j.stages || []).flatMap((s) => (s.steps || []).map((x) => ({ ...x, stage: s.id })));
  const tally = {};
  for (const s of steps) tally[s.status] = (tally[s.status] || 0) + 1;

  // Every step claiming DONE must name an artifact that is actually on disk.
  // A plan that says done while the artifact is absent is the drift this whole
  // phase exists to end, so it is checked here rather than asserted.
  const missing = steps
    .filter((s) => s.status === "DONE" && s.artifact)
    .filter((s) => !exists(path.join(MC, s.artifact)))
    .map((s) => ({ step: s.id, artifact: s.artifact }));

  return {
    ok: true,
    source: "evidence/remediation/phase9_plan.json",
    sha256: require("crypto").createHash("sha256").update(raw).digest("hex"),
    phase: j.phase,
    law: j.law,
    stages: j.stages,
    road_to_air: j.road_to_air,
    stops: j.stops,
    not_mine: j.not_mine,
    proof_methods: j.proof_methods,
    proof_artifacts: j.proof_artifacts,
    step_count: steps.length,
    tally,
    resonance: {
      done_steps_with_missing_artifacts: missing,
      equal: missing.length === 0,
      note: "equal=true means every step claiming DONE names an artifact that exists on disk. Reachable by construction, per ADR-0002 Amendment 1.",
    },
  };
}


// ── minimal markdown -> HTML. No dependency (the platform takes none lightly). ──
function mdToHtml(src) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, a, b) => `<a href="${/^https?:/.test(b) ? b : "/doc/" + b.replace(/^\.\//, "")}">${a}</a>`);
  const out = []; let inCode = false, inTable = false;
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (/^```/.test(line)) { out.push(inCode ? "</pre>" : "<pre>"); inCode = !inCode; continue; }
    if (inCode) { out.push(esc(line)); continue; }
    if (/^\|/.test(line)) {
      if (/^\|[\s:|-]+\|?$/.test(line)) continue;
      const cells = line.split("|").slice(1, -1).map((c) => `<td>${inline(c.trim())}</td>`).join("");
      if (!inTable) { out.push("<table>"); inTable = true; }
      out.push(`<tr>${cells}</tr>`); continue;
    }
    if (inTable) { out.push("</table>"); inTable = false; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+/.test(line)) { out.push(`<li>${inline(line.replace(/^\s*[-*]\s+/, ""))}</li>`); continue; }
    if (/^>\s?/.test(line)) { out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    if (/^---+$/.test(line)) { out.push("<hr>"); continue; }
    out.push(line.trim() ? `<p>${inline(line)}</p>` : "");
  }
  if (inTable) out.push("</table>");
  return out.join("\n");
}
const DOC_CSS = `<style>
body{background:#0d1017;color:#dfe5ee;font:15px/1.7 ui-sans-serif,Segoe UI,Roboto,sans-serif;max-width:920px;margin:0 auto;padding:28px 22px 80px}
h1{font-size:23px} h2{font-size:18px;margin-top:34px;border-bottom:1px solid #242c3a;padding-bottom:6px} h3{font-size:15px}
h1,h2,h3,h4{color:#f2f4f7;font-weight:600} a{color:#7f77dd} code{background:#141923;padding:1px 5px;border-radius:3px;font:13px ui-monospace,Consolas,monospace;color:#9fb4d0}
pre{background:#141923;border:1px solid #242c3a;border-radius:7px;padding:12px 14px;overflow-x:auto;font:12.5px ui-monospace,Consolas,monospace;color:#b9c6d6;white-space:pre}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:13px} td{border:1px solid #242c3a;padding:6px 9px;vertical-align:top}
tr:first-child td{background:#141923;font-weight:600} blockquote{border-left:3px solid #534ab7;margin:12px 0;padding:4px 14px;color:#a8b3c4;background:#12141c}
li{margin:3px 0} hr{border:0;border-top:1px solid #242c3a;margin:24px 0} del{color:#8b97a8}
.nav{position:sticky;top:0;background:#0d1017ee;padding:10px 0;border-bottom:1px solid #242c3a;margin:-28px -22px 20px;padding-left:22px}
.nav a{margin-right:14px;font-size:12.5px}
</style>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (code, type, body) => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(body); };

  // THE ONE WRITE IN THIS SERVER, AND UNTIL 2026-07-28 IT HAD NO LAW AT ALL.
  //
  // Found by an adversarial sweep. This route had no `x-uni-cc`, no Origin or Referer check, no
  // peer-address check and NO CONTENT-TYPE CHECK — while the server binds 0.0.0.0. Two consequences,
  // both real:
  //
  //   ANYTHING ON THE LAN could append arbitrary rows to the comment ledger.
  //   ANY PAGE IN THE OPERATOR'S BROWSER could fire it as a CORS-SIMPLE request — `text/plain`, or a
  //   JS-free auto-submitting <form>, which CORS does not govern at all — with no preflight.
  //
  // This file's own header claims "THE LAW IT INHERITS (from the Door, verbatim): a polled READ never
  // spawns anything." The read law held. The write had nothing.
  //
  // The fence is not invented here — it is the house standard this repository already mandates and
  // this file simply never adopted: `viewer/command_center.cjs:1579` and ADR-PROD-015. A custom
  // header AND a JSON content-type each force a CORS preflight. The peer check is additional and
  // necessary BECAUSE THIS SERVER IS NOT LOOPBACK-BOUND: a bind comment is not a fence, and the other
  // servers that reasoned "loopback means only this box can ask" were wrong about the browser.
  if (req.method === "POST" && url.pathname === "/api/comment") {
    const peer = req.socket.remoteAddress || "";
    if (!isLoopbackPeer(peer)) {
      return send(403, "application/json", JSON.stringify({
        error: "comments are written from this box only",
        why: "TRACK binds 0.0.0.0 so the operator can read it from anywhere on the LAN. Reading is " +
             "not writing. The comment ledger is evidence and is appended from here.",
        peer,
      }));
    }
    // HOST PIN — added 2026-07-28, and its absence was a DNS-REBINDING HOLE the sibling fix on
    // lab_server.cjs already closed for exactly this reason and this file did not carry over. The
    // peer check above does NOT stop rebinding: an attacker page on evil.test rebound to 127.0.0.1
    // reaches this route SAME-ORIGIN (so it sets x-uni-cc and the JSON content-type with no
    // preflight) AND over loopback (so remoteAddress is 127.0.0.1). Only the Host header still
    // carries the attacker's name, so pinning it to a loopback name is the one check that refuses.
    if (!isLoopbackHost(req.headers.host)) {
      return send(403, "application/json", JSON.stringify({
        error: "POST /api/comment is reachable only as 127.0.0.1 or localhost",
        why: "a header fence stops CSRF but not DNS rebinding, where a hostname resolving to loopback " +
             "is same-origin to the browser and arrives over loopback. The Host header is the only " +
             "place the rebound request still carries the attacker's name.",
        host: String(req.headers.host || ""),
      }));
    }
    if (req.headers["x-uni-cc"] !== "1" ||
        !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return send(403, "application/json", JSON.stringify({
        error: "POST /api/comment requires header `x-uni-cc: 1` and `content-type: application/json`",
        why: "the house CSRF fence (command_center.cjs, ADR-PROD-015). Both force a CORS preflight, " +
             "which a cross-site simple request or a plain <form> cannot satisfy.",
      }));
    }
    let body = ""; req.on("data", (d) => { body += d; if (body.length > 65536) req.destroy(); });
    req.on("end", () => {
      let c; try { c = JSON.parse(body); } catch { return send(400, "application/json", '{"error":"bad json"}'); }
      if (!c.target || !c.text) return send(400, "application/json", '{"error":"target and text required"}');
      // Every field String()-wrapped. `kind` was not, so an object or array serialised straight into
      // an append-only evidence file that is never edited afterwards.
      const entry = { utc: new Date().toISOString(), author: String(c.author || "claude"), target: String(c.target), text: String(c.text), kind: String(c.kind || "note") };
      fs.mkdirSync(path.dirname(COMMENTS), { recursive: true });
      fs.appendFileSync(COMMENTS, JSON.stringify(entry) + "\n", "utf8");   // append-only, never edited
      send(200, "application/json", JSON.stringify({ ok: true, entry }));
    });
    return;
  }

  // ── THE OPERATOR'S ANSWER ─────────────────────────────────────────────────────────────────────
  //
  // Every surface here can SHOW him a decision and none could RECORD one. All 85 rows of the comment
  // ledger are `author: claude`; every co-sign in the 32-entry control-plane ledger is
  // `actor: claude, role: agent`. His answers lived in a chat window, which is not an artifact.
  //
  // THE FENCES ARE THE SAME FOUR AS /api/comment, DELIBERATELY IDENTICAL — loopback peer, Host pin,
  // `x-uni-cc: 1` + JSON content-type, 64 KB cap. They are copied rather than shared because the
  // failure mode worth avoiding is a refactor that loosens both routes at once, and because the
  // comment route's own comment above explains each one at the point of use.
  //
  // AND THEY DO NOT PROVE A HUMAN. An agent on this box satisfies every one of them. That is why the
  // claim level is `presence_evident` and why it is stamped into the row AND into this response:
  // whoever reads it gets the caveat attached to the number, not filed somewhere else.
  //
  // IT WRITES ONE FILE. It cannot mint presence (never touches viewer/.presence/), cannot go live,
  // and cannot write evidence/gates.ndjson — which is S4 and the operator's alone. verify_decision.cjs
  // proves each of those refusals by running a real append and comparing bytes.
  if (req.method === "POST" && url.pathname === "/api/decision") {
    const peer = req.socket.remoteAddress || "";
    if (!isLoopbackPeer(peer)) {
      return send(403, "application/json", JSON.stringify({
        error: "decisions are written from this box only",
        why: "TRACK binds 0.0.0.0 so the operator can READ it from anywhere on the LAN. Reading is not " +
             "writing, and the decision ledger is evidence.",
        peer,
      }));
    }
    if (!isLoopbackHost(req.headers.host)) {
      return send(403, "application/json", JSON.stringify({
        error: "POST /api/decision is reachable only as 127.0.0.1 or localhost",
        why: "the peer check does not stop DNS rebinding — a hostname resolving to loopback is " +
             "same-origin to the browser AND arrives over loopback. The Host header is the only place " +
             "the rebound request still carries the attacker's name.",
        host: String(req.headers.host || ""),
      }));
    }
    if (req.headers["x-uni-cc"] !== "1" ||
        !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return send(403, "application/json", JSON.stringify({
        error: "POST /api/decision requires header `x-uni-cc: 1` and `content-type: application/json`",
        why: "the house CSRF fence (command_center.cjs, ADR-PROD-015). Both force a CORS preflight, " +
             "which a cross-site simple request or a plain <form> cannot satisfy.",
      }));
    }
    let body = ""; let over = false;
    req.on("data", (d) => { body += d; if (body.length > 65536) { over = true; req.destroy(); } });
    req.on("end", () => {
      if (over) return;
      let c; try { c = JSON.parse(body); } catch { return send(400, "application/json", '{"error":"bad json"}'); }
      // The witness is written by the SERVER, from what it actually observed, and is not accepted
      // from the caller — a caller-supplied witness is a caller telling you what to believe about it.
      const witness = `peer ${peer} · host ${String(req.headers.host || "")} · x-uni-cc + application/json`;
      const r = decisionLedger.append({ ...c, witness }, {});
      if (!r.ok && (r.code === "UNKNOWN_SUPERSEDES" || r.code === "SUPERSEDES_OTHER_SUBJECT")) {
        return send(400, "application/json", JSON.stringify(r));
      }
      if (!r.ok) return send(r.code === "CHAIN_BROKEN" ? 409 : 400, "application/json", JSON.stringify(r));
      send(200, "application/json", JSON.stringify({
        ok: true, row: r.row,
        recorded: "evidence/decisions.ndjson — append-only, hash-chained",
        claim_level: decisionLedger.CLAIM_LEVEL,
        caveat: decisionLedger.CLAIM_CAVEAT,
      }));
    });
    return;
  }

  // Reading them back is a READ, and reads are open — the same law the rest of this server keeps.
  if (url.pathname === "/api/decisions") {
    const rows = decisionLedger.readRows();
    const chain = decisionLedger.verify(rows);
    return send(200, "application/json", JSON.stringify({
      ok: true,
      count: rows.length,
      // "chain verifies" on an EMPTY file is a green nobody earned — a chain of zero rows verifies
      // trivially. The surface must not offer reassurance it has not measured.
      chain_says: rows.length === 0 ? "nothing to verify yet" : (chain.ok ? "chain verifies" : "CHAIN DOES NOT VERIFY"),
      chain,
      claim_level: decisionLedger.CLAIM_LEVEL,
      caveat: decisionLedger.CLAIM_CAVEAT,
      decidable: decisionLedger.subjects(),
      rows: decisionLedger.standing(rows),   // each row carries `stands` and `superseded_by`, computed
    }, null, 1));
  }

  // ── the FULL architecture, served live from the real files (no copies, no hacks) ──

  // ── docs rendered IN the page, not served raw ──
  if (url.pathname.startsWith("/doc/")) {
    const rel = decodeURIComponent(url.pathname.slice("/doc/".length));
    if (rel.includes("..")) return send(400, "text/plain", "bad path");
    for (const r of [CP, path.join(CP, "decisions"), path.join(CP, "phases")]) {
      const f = path.join(r, rel);
      if (exists(f) && fs.statSync(f).isFile()) {
        const nav = `<div class="nav"><a href="/">&#8592; TRACK</a><a href="/doc/ARCHITECTURE.md">architecture</a><a href="/doc/DATA-SPEC.md">data spec</a><a href="/doc/FAILURE-MODES.md">failure modes</a><a href="/doc/RESUME.md">resume</a><a href="/arch/${encodeURIComponent(rel)}">raw</a></div>`;
        return send(200, "text/html; charset=utf-8", `<!doctype html><meta charset="utf-8"><title>${rel}</title>${DOC_CSS}${nav}${mdToHtml(fs.readFileSync(f, "utf8"))}`);
      }
    }
    return send(404, "text/plain", `no such doc: ${rel}`);
  }
  if (url.pathname.startsWith("/arch/")) {
    const rel = decodeURIComponent(url.pathname.slice("/arch/".length));
    if (rel.includes("..")) return send(400, "text/plain", "bad path");
    const roots = [path.join(CP, "generated"), CP, path.join(CP, "decisions"), path.join(CP, "phases")];
    for (const r of roots) {
      const f = path.join(r, rel);
      if (exists(f) && fs.statSync(f).isFile()) {
        const ext = path.extname(f).toLowerCase();
        const type = ext === ".svg" ? "image/svg+xml" : ext === ".png" ? "image/png"
          : ext === ".md" || ext === ".dsl" || ext === ".mmd" || ext === ".puml" ? "text/plain; charset=utf-8"
          : "application/octet-stream";
        return send(200, type, fs.readFileSync(f));
      }
    }
    return send(404, "text/plain", `not found in control-plane docs: ${rel}`);
  }
  if (url.pathname === "/api/arch") {
    // Parse the model of record LIVE so the page can show the graph, not just the pictures.
    const dslRaw = readMaybe(path.join(CP, "workspace.dsl")) || "";
    const elements = [...dslRaw.matchAll(/^\s*(\w+)\s*=\s*(container|component|person|softwareSystem)\s+"([^"]+)"\s+"([^"]*)"(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?/gm)]
      .map((m) => ({ ref: m[1], kind: m[2], name: m[3], description: m[4], technology: m[5] || null, tag: m[6] || null }));
    const relations = [...dslRaw.matchAll(/^\s*([\w.]+)\s*->\s*([\w.]+)\s+"([^"]+)"/gm)]
      .map((m) => ({ from: m[1], to: m[2], label: m[3] }));
    // Falsifiers, read live from each ADR — surfaced next to what they would falsify.
    const decDir = path.join(CP, "decisions");
    const falsifiers = (exists(decDir) ? fs.readdirSync(decDir).filter((f) => f.endsWith(".md")) : []).map((f) => {
      const b = readMaybe(path.join(decDir, f)) || "";
      return {
        file: f,
        title: (b.match(/^#\s*(.+)$/m) || [, f])[1].trim(),
        falsifier: (b.split(/##\s*Falsifier/i)[1] || "").split(/\n##/)[0].trim(),
      };
    }).filter((x) => x.falsifier);
    const gen = path.join(CP, "generated");
    const views = exists(gen) ? fs.readdirSync(gen).filter((f) => f.endsWith(".svg")).sort() : [];
    const docs = exists(CP) ? fs.readdirSync(CP).filter((f) => f.endsWith(".md")).sort() : [];
    const adrs = exists(path.join(CP, "decisions")) ? fs.readdirSync(path.join(CP, "decisions")).filter((f) => f.endsWith(".md")).sort() : [];
    const phs = exists(path.join(CP, "phases")) ? fs.readdirSync(path.join(CP, "phases")).filter((f) => f.endsWith(".md")).sort() : [];
    return send(200, "application/json", JSON.stringify({
      source: CP, model: exists(path.join(CP, "workspace.dsl")) ? "workspace.dsl" : null,
      views, docs, adrs, phases: phs, elements, relations, falsifiers,
    }, null, 2));
  }
  if (url.pathname === "/api/track") return send(200, "application/json", JSON.stringify(await snapshot(), null, 2));
  if (url.pathname === "/api/identity") return send(200, "application/json", JSON.stringify(buildIdentity.identity(), null, 2));
  if (url.pathname === "/healthz") return send(200, "text/plain", "ok");
  // WHERE HE ANSWERS. A SEPARATE PAGE, not a panel on the main one, and the reason is mechanical:
  // track.html rewrites app.innerHTML wholesale every ten seconds, so a textarea inside it would have
  // his half-typed answer erased mid-sentence with nothing recoverable. Nothing on /decide polls.
  if (url.pathname === "/decide") {
    const html = readMaybe(path.join(__dirname, "decide.html"));
    return html ? send(200, "text/html; charset=utf-8", html) : send(500, "text/plain", "decide.html missing");
  }

  if (url.pathname === "/" || url.pathname === "/track") {
    const html = readMaybe(path.join(__dirname, "track.html"));
    return html ? send(200, "text/html; charset=utf-8", html) : send(500, "text/plain", "track.html missing");
  }
  send(404, "text/plain", "Not Found");
});

// Guarded so the gate can `require` this file to unit-test the fence decisions WITHOUT booting a
// server. Run directly (`node track_server.cjs`) it still listens; required as a module it does not.
if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`UNI TRACK serving on http://0.0.0.0:${PORT}  (flag repo: ${FLAG})`);
  });
}

module.exports = { isLoopbackPeer, isLoopbackHost };
