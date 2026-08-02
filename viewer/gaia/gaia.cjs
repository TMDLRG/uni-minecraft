// gaia.cjs — THE STAR core assembler for Gaia (mirrors viewer/discovery.cjs's pure-module discipline).
//
// GAIA LAW (binding, enforced downstream by gaia_lint.cjs / verify_gaia.cjs): Gaia projects ONLY direct
// signals carrying a full provenance triple {locator, captured_at, sha256}. It NEVER summarizes, scores,
// ranks, narrates, aggregates, or authors a verdict. A boolean/verdict a SOURCE itself computed (an infra
// dnsDrift state, a gate row's PASS/PARTIAL/FAIL/WITHHELD/PENDING) is carried verbatim as a raw signal with
// that source as its locator — that is projection, not Gaia derivation. This module therefore does ONE thing:
// it calls every read-only collector, concatenates the raw Signal[] each returns, and wraps the flat list in
// the on-disk envelope contract (production/schemas/envelope.schema.json). It computes NOTHING across signals
// — no count, sum, avg, percent, score, rank, total, ratio, or rollup lives anywhere in this file.
//
//   gaia()          -> Promise<{ schema_version, envelope, result:{ signals:[Signal...] } }>
//   toMarkdown(env) -> string  — renders docs/GAIA.md FROM caps.CAPS + the frozen signal model (a view,
//                                not a second data model; keeps gaia()'s envelope the single source of truth)
//   SIGNALS(x)      -> { <id>: Signal }  — the id index over a rendered envelope (or a raw Signal[])
//
// Read-only over every source. No IP literals (hosts derive from infra_registry.json via infra.cjs, reached
// only through the collectors). The only writes anywhere in Gaia happen in snapshot.cjs, never here.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const sig = require("./sig.cjs");
const collectors = require("./collectors.cjs");
const caps = require("./caps.cjs");
const buildIdentity = require("../build_identity.cjs");

const REPO = path.join(__dirname, "..", "..");

// ---- envelope identity (frozen; byte-compared against docs/GAIA.md + the MCP handshake) -----------------
const SERVER = "uni-gaia";
const INSTRUMENT_VERSION = "gaia.cjs@1";
const EVIDENCE_CLASS = "C";

// The collectors, in a fixed deterministic order so the emitted signal stream and its snapshot hashes are
// stable run-to-run. Source seats first; the two introspective collectors (self + drift) run LAST and are
// handed the already-accumulated Signal[] so self-calibration (verify_hash over the last N) and paired-locator
// drift can reference exactly what was emitted. A collector absent from collectors.cjs is skipped, never
// faked — a missing seat yields no signals, which is itself the honest state.
const SOURCE_COLLECTORS = [
  "gitSignals",
  "gateLedgerSignals",
  "infraSignals",
  "scienceSignals",
  // organic-operator (2026-07-16): the HUMAN-FLOW seat. Projects the persona doc + skill verbatim
  // so every agent and surface reads the SAME words from ONE place ("all are one resonance").
  // Pure file reads — no probe, no network, no derivation; cheap and deterministic.
  "organicOperatorSignals",
  // control-plane (2026-07-26): the Control Plane's OWN append-only ledger + its
  // anchor + the witness capture, each carried VERBATIM. Gaia counts nothing here
  // and judges nothing; the body that authors is the body that decides.
  "controlPlaneSignals",
  "studioProbeSignals",
  "colonyProbeSignals",
  "sessionSignals",
  "runningConfigSignals"
];
const INTROSPECTIVE_COLLECTORS = ["selfSignals", "driftSignals"];

// ---- git HEAD (envelope stamp) — now the FROZEN boot identity, not a per-request read -------------------
// Envelope.git_commit is the commit the running assembler's code sits on. That is exactly build_identity's
// boot_git_commit: `.git/HEAD` read ONCE, at process boot, and served verbatim for the life of the process.
// The reader that used to live here (`readGitHead`) re-read `.git/HEAD` on EVERY gaia() call, so it reported
// the REPOSITORY's head at request time — a stale process advertised the new commit while running old code
// (Phase 9 step 1.1; the pre-registered falsifier "a freshness field recomputed per request"). The read moved
// to build_identity.cjs, captured at boot; gitSignals() still projects LIVE HEAD as a first-class raw signal
// with the `git rev-parse HEAD` locator, which is a deliberate, correctly-labelled repo read — not the stamp.

// ---- envelope wrapper -----------------------------------------------------------------------------------
// Prefer sig.envelope() (the shared provenance kernel's wrapper) so the on-disk contract stays defined in ONE
// place. Fall back to an inline wrap that follows production/schemas/envelope.schema.json exactly, so THE STAR
// always emits the correct shape even if sig.envelope is unavailable. Either way we stamp git_commit (sig.cjs
// is crypto-only and cannot run git, so the commit must be supplied here) without ever overwriting a value
// sig.envelope may already have set.
function wrapEnvelope(signals, gitCommit) {
  const timestamp = new Date().toISOString();
  let out = null;
  if (sig && typeof sig.envelope === "function") {
    out = sig.envelope(signals, {
      server: SERVER,
      instrument_version: INSTRUMENT_VERSION,
      git_commit: gitCommit,
      timestamp,
      evidence_class: EVIDENCE_CLASS
    });
  }
  if (!out || typeof out !== "object" || !out.envelope || !out.result) {
    out = {
      schema_version: 1,
      envelope: {
        server: SERVER,
        instrument_version: INSTRUMENT_VERSION,
        git_commit: gitCommit,
        timestamp,
        evidence_class: EVIDENCE_CLASS
      },
      result: { signals }
    };
  }
  // Fill required envelope fields the kernel may have left unset — never clobber a set value.
  const e = out.envelope;
  if (e.server == null) e.server = SERVER;
  if (e.instrument_version == null) e.instrument_version = INSTRUMENT_VERSION;
  if (e.git_commit == null) e.git_commit = gitCommit;
  if (e.timestamp == null) e.timestamp = timestamp;
  if (e.evidence_class == null) e.evidence_class = EVIDENCE_CLASS;
  if (out.schema_version == null) out.schema_version = 1;
  if (!out.result || !Array.isArray(out.result.signals)) out.result = { signals };
  return out;
}

// ---- collector ceiling (fixed 2026-07-14 — closes the "one hung collector wedges every future
// /api/gaia request forever" defect) -------------------------------------------------------------
// The prior design awaited each collector SEQUENTIALLY with no per-call bound: a single collector
// that never settles (e.g. infraSignals() -> infra.cjs snapshot(), which itself had a poisoned-cache
// hang bug, fixed separately in infra.cjs) blocked every collector after it AND every future request,
// since the whole chain sat inside one `await`. withCeiling races each collector against a hard
// timeout. A genuine SYNCHRONOUS throw still propagates (a real code defect belongs on screen, not
// hidden) — only a HANG (never settling) degrades, and it degrades to "this seat contributes no
// signals this round," the same honest-omission idiom collectors.cjs already uses for an absent seat
// (never a fabricated value dressed up as data).
const COLLECTOR_TIMEOUT_MS = 20000;
function withCeiling(name, fn, arg) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.error(`gaia: collector '${name}' exceeded ${COLLECTOR_TIMEOUT_MS}ms — this seat contributes no signals this round (honest omission, not fabricated)`);
      resolve([]);
    }, COLLECTOR_TIMEOUT_MS);
    Promise.resolve()
      .then(() => fn(arg))
      .then(
        (out) => { if (settled) return; settled = true; clearTimeout(timer); resolve(Array.isArray(out) ? out : []); },
        (err) => { if (settled) return; settled = true; clearTimeout(timer); reject(err); }
      );
  });
}

// ---- MAIN: assemble the envelope ------------------------------------------------------------------------
// Calls every collector and concatenates the RAW Signal[] each returns. Source collectors are independent
// of each other (verified against every current collectors.cjs definition) so they run CONCURRENTLY —
// Promise.all preserves input-array order in its resolved array regardless of completion order, so the
// emitted signal stream stays deterministic run-to-run exactly as the old sequential version was.
// Introspective collectors still run as a second phase AFTER source collectors finish, receiving the
// accumulated signal stream (self-calibration + paired drift reference exactly what was emitted above) —
// collectors written to take no argument simply ignore it, as before. Collector errors are NOT swallowed
// into fabricated signals — a genuine SYNCHRONOUS collector fault is a real defect and propagates; honest
// "down"/"not probed" states are the collectors' own up:false / up:null signals, never a caught exception
// dressed up as data. A collector that HANGS (see withCeiling above) is the one case that degrades instead
// of propagating or blocking — that degrade is what makes the surface as a whole resilient to any single
// stuck source.
async function gaia() {
  const gitCommit = buildIdentity.identity().boot_git_commit;
  const signals = [];

  const sourceOut = await Promise.all(
    SOURCE_COLLECTORS.map((name) => {
      const fn = collectors[name];
      if (typeof fn !== "function") return Promise.resolve([]); // absent seat — no signals, honestly
      return withCeiling(name, fn);
    })
  );
  for (const out of sourceOut) for (const s of out) signals.push(s);

  const priorSnapshot = signals.slice();
  const introOut = await Promise.all(
    INTROSPECTIVE_COLLECTORS.map((name) => {
      const fn = collectors[name];
      if (typeof fn !== "function") return Promise.resolve([]);
      return withCeiling(name, fn, priorSnapshot);
    })
  );
  for (const out of introOut) for (const s of out) signals.push(s);

  return wrapEnvelope(signals, gitCommit);
}

// ---- SIGNALS — the id index (a lookup view, carries no derived field) -----------------------------------
// Accepts a rendered envelope OR a raw Signal[]; returns a plain { id: Signal } map. Last-writer-wins on a
// duplicate id (ids are stable locator slugs and expected unique). This is projection, not aggregation — it
// counts nothing and computes nothing.
function SIGNALS(input) {
  const list = Array.isArray(input)
    ? input
    : (input && input.result && Array.isArray(input.result.signals) ? input.result.signals : []);
  const idx = Object.create(null);
  for (const s of list) {
    if (s && typeof s.id === "string" && s.id) idx[s.id] = s;
  }
  return idx;
}

// ---- toMarkdown — render docs/GAIA.md FROM caps.CAPS + the frozen signal model --------------------------
// A VIEW over the same declarative sources the running server uses (caps.CAPS, sig.FROZEN_KEYS,
// sig.FORBIDDEN_TOKENS), so the doc's manifest table is byte-comparable to the MCP initialize handshake and
// the self-manifest signal. Renders no signal values and no computed rollup — only the frozen contract text,
// the CAPS tables, the fences, the verify-gate names, and the honest boot-persistence stance. The optional
// `env` argument lets a caller stamp the doc with the live envelope's commit/timestamp; the doc BODY is
// independent of any single capture.
function toMarkdown(env) {
  const q = "`";
  const L = [];
  const push = (s) => L.push(s);
  const cell = (s) => String(s == null ? "" : s).replace(/\|/g, "/").replace(/\n/g, " ");

  const CAPS = (caps && caps.CAPS) || {};
  const resources = Array.isArray(CAPS.resources) ? CAPS.resources : [];
  const tools = Array.isArray(CAPS.tools) ? CAPS.tools : [];
  const prompts = Array.isArray(CAPS.prompts) ? CAPS.prompts : [];

  const frozenKeys = (sig && Array.isArray(sig.FROZEN_KEYS)) ? sig.FROZEN_KEYS : [];
  const forbidden = (sig && Array.isArray(sig.FORBIDDEN_TOKENS)) ? sig.FORBIDDEN_TOKENS : [];

  // -- header + provenance stamp of the doc render itself --
  push("# Gaia — the honest signal projector");
  push("");
  const e = env && env.envelope ? env.envelope : {};
  push(`_${e.instrument_version || INSTRUMENT_VERSION} · server ${e.server || SERVER} · commit ${e.git_commit || "?"} · class ${e.evidence_class || EVIDENCE_CLASS}${e.timestamp ? " · " + e.timestamp : ""}_`);
  push("");
  push("> This file is RENDERED from `viewer/gaia/caps.cjs` (the CAPS registry) and the frozen signal model by");
  push("> `gaia.toMarkdown()`. Do not hand-edit the manifest tables — change `caps.cjs` and re-render, so the");
  push("> served MCP capabilities, the `gaia://self/mcp-manifest` signal, and this table stay byte-identical.");
  push("");

  // -- GAIA LAW --
  push("## GAIA LAW (binding)");
  push("");
  push("Gaia shows ONLY direct signals with provenance (source locator + capture time + content hash). It");
  push("NEVER summarizes, represents, editorializes, scores, ranks, narrates, or authors a verdict. A raw");
  push("signal losslessly projected is allowed; any interpretation / derived conclusion / percent is a BUILD");
  push("DEFECT, caught by the first-class no-summarization lint (`gaia_lint.cjs`). A boolean or verdict a");
  push("SOURCE itself computed — an infra `dnsDrift` state, a gate row's PASS/PARTIAL/FAIL/WITHHELD/PENDING —");
  push("is carried verbatim as a raw signal with that source as its locator; that is projection, not Gaia");
  push("derivation. A count Gaia itself computes across signals is forbidden.");
  push("");

  // -- the frozen Signal model --
  push("## The Signal (the atomic, non-summarizable unit)");
  push("");
  push("Every Signal carries exactly this frozen key-set (any extra key is a build defect, enforced by");
  push("`gaia_lint.cjs` against `sig.FROZEN_KEYS`):");
  push("");
  if (frozenKeys.length) {
    push("| key | role |");
    push("|---|---|");
    const KEY_ROLE = {
      id: "stable locator slug (e.g. `git.head`, `gates.ndjson.row.7`, `studio.port.8098`)",
      seat: "gaia-self | repo | gates | infra | studio | colony | relay | sessions | science | drift | organic-operator",
      kind: "git | file | config | command | tcp | http | mcp | transcript | drift",
      value: "{ raw: source bytes verbatim, encoding: utf8|base64 } — NO computed field ever",
      provenance: "{ locator, captured_at, sha256, byte_len, truncated, instrument, reverify }",
      live: "{ up: true|false|null, detail } — populated ONLY for kind tcp|http, only from a real probe",
      evidence_class: "A|B|C|Sec|pending — carried from the source, never invented"
    };
    for (const k of frozenKeys) push(`| ${q}${cell(k)}${q} | ${cell(KEY_ROLE[k] || "")} |`);
  } else {
    push("_(frozen key-set is defined in `viewer/gaia/sig.cjs` — `sig.FROZEN_KEYS`)_");
  }
  push("");
  push("The whole payload is wrapped once in the on-disk envelope contract");
  push("(`production/schemas/envelope.schema.json`): `{ schema_version:1, envelope:{ server:\"uni-gaia\",");
  push("instrument_version:\"gaia.cjs@1\", git_commit, timestamp, evidence_class:\"C\" }, result:{ signals:[...] } }`.");
  push("");

  // -- forbidden tokens (the lint contract) --
  push("## Forbidden by construction (the no-summarization lint)");
  push("");
  push("`gaia_lint.cjs` fails the build if any emitted key or Gaia-authored string contains a forbidden");
  push("token, or if any Signal key falls outside the frozen allowlist. A source-verbatim passthrough (e.g. a");
  push("source's own `count 3` bytes) is exempt — the fence is on Gaia-DERIVED aggregation, not on projection.");
  push("");
  if (forbidden.length) {
    push("Forbidden tokens: " + forbidden.map((t) => `${q}${cell(t)}${q}`).join(", ") + ".");
  } else {
    push("_(forbidden-token list is defined in `viewer/gaia/sig.cjs` — `sig.FORBIDDEN_TOKENS`)_");
  }
  push("");

  // -- CAPS manifest table (the self-mirror lynchpin) --
  push("## MCP manifest (rendered from `caps.cjs` — the single capability registry)");
  push("");
  push("This ONE registry drives three consumers byte-for-byte: the JSON-RPC `initialize` capabilities +");
  push("`resources/list` / `tools/list` / `prompts/list` served by `gaia_mcp.cjs`; the");
  push("`gaia://self/mcp-manifest` self-signal and `gaia.self.manifest()` tool; and this table. Divergence");
  push("between any two surfaces is emitted as a self-drift signal, never silently reconciled.");
  push("");
  push(`### Resources (${resources.length})`);
  push("");
  push("| uri | kind | collector | description |");
  push("|---|---|---|---|");
  for (const r of resources) {
    const uri = r.uri || r.name || r.id || "";
    const kind = r.kind || r.mimeType || "";
    const coll = r.collector || r.source || r.id || "";
    const desc = r.description || r.purpose || r.what || "";
    push(`| ${q}${cell(uri)}${q} | ${cell(kind)} | ${q}${cell(coll)}${q} | ${cell(desc)} |`);
  }
  push("");
  push(`### Tools (${tools.length})`);
  push("");
  push("| name | collector | description |");
  push("|---|---|---|");
  for (const t of tools) {
    const name = t.name || t.id || "";
    const coll = t.collector || t.source || "";
    const desc = t.description || t.purpose || t.what || "";
    push(`| ${q}${cell(name)}${q} | ${q}${cell(coll)}${q} | ${cell(desc)} |`);
  }
  push("");
  if (prompts.length) {
    push(`### Prompts (${prompts.length})`);
    push("");
    push("| name | description |");
    push("|---|---|");
    for (const p of prompts) {
      const name = p.name || p.id || "";
      const desc = p.description || p.purpose || p.what || "";
      push(`| ${q}${cell(name)}${q} | ${cell(desc)} |`);
    }
    push("");
  }

  // -- fences --
  push("## Fences (binding)");
  push("");
  push("- **READ-ONLY** over everything. Gaia never mutates a gate, sets a verdict, edits `lib/sp/**`, or");
  push("  writes outside `viewer/gaia/**` (plus, at DD-completion, `docs/GAIA.md` and exactly one appended row");
  push("  in `evidence/gates.ndjson`).");
  push("- **G-PA** — no route or tool triggers an outward action or holds a stream key. The HTTP surface has no");
  push("  POST/PUT/DELETE branch at all; G-PA is satisfied by structural omission.");
  push("- **No IP literals** — every host derives from `viewer/infra_registry.json` via `viewer/infra.cjs`");
  push("  (`" + q + "${s.name}.${REG.zone}" + q + "`). The documented-but-absent `viewer/fqdn.cjs` helper is");
  push("  surfaced as a drift signal, never worked around with a literal.");
  push("- **Claim fence** — a passed gate demonstrates the named BEHAVIOUR, never experience / awareness / life.");
  push("  Gaia projects gate verdicts verbatim and never converts a PASS into a broader claim.");
  push("");

  // -- verify gates --
  push("## Verify gates");
  push("");
  push("| gate | falsified when |");
  push("|---|---|");
  const GATES = [
    ["gaia-signal-provenance-complete", "any Signal lacks a locator + ISO-8601 captured_at + 64-hex sha256 + byte_len"],
    ["gaia-no-summarization-lint", "any Gaia-derived count/percent/score/rank/rollup/verdict, or a key outside the frozen allowlist"],
    ["gaia-rehash-integrity", "any signal's stored sha256 != a live rehash of its value.raw bytes"],
    ["gaia-honest-probe", "any live.up:true emitted without a captured probe result (a fabricated pass)"],
    ["gaia-mcp-handshake", "malformed JSON-RPC, missing initialize handshake, or a capability with no live method"],
    ["gaia-self-mirror", "the /self gaia.cjs hash != the on-disk file, or served CAPS != self-reported/documented"],
    ["gaia-read-only-fence", "any mutating route/tool, any POST returning 2xx, or a write outside the write-fence"],
    ["gaia-no-ip-literal", "any IPv4 literal present in Gaia source"],
    ["gaia-drift-surfaced", "a measured documented-vs-observed drift is silently reconciled or omitted"],
    ["gaia-write-fence-and-gate-row", "a write outside the fence, or the gate row fails gate_row.schema.json"],
    ["gaia-boot-persistence-honest", "any doc/row/UI claims boot-persistence before its own reboot-survival gate passes"]
  ];
  for (const [name, fals] of GATES) push(`| ${q}${cell(name)}${q} | ${cell(fals)} |`);
  push("");

  // -- honest boot-persistence stance --
  push("## Boot-persistence — honest stance (slice-1)");
  push("");
  push("**Gaia starts on operator command; boot-persistence UNPROVEN.** `gaia.cjs` and every snapshot survive a");
  push("reboot as files, but the live `gaia_server` does not auto-restart until it is registered in");
  push("`viewer/systray_watchdog.ps1` as a supervised auto-start entry AND proven surviving a reboot onto");
  push("canonical bytes. Supervision is the NEXT cure with its own gate (`gaia-boot-persistent`), not folded");
  push("into slice-1 — one cure at a time.");
  push("");

  // -- receipt path for the one sanctioned gate row --
  push("## Receipt");
  push("");
  push("The one sanctioned append to `evidence/gates.ndjson` at DD-completion cites this file (`docs/GAIA.md`)");
  push("as its `receipt_path`, validated against `production/schemas/gate_row.schema.json`");
  push("(schema_version=1, name, verdict ∈ {PASS,PARTIAL,FAIL,WITHHELD,PENDING}, receipt_path, evidence_class,");
  push("last_updated). No existing row is ever mutated.");
  push("");

  return L.join("\n");
}

module.exports = { gaia, toMarkdown, SIGNALS };
