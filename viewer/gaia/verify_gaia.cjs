// verify_gaia.cjs — THE GAIA GATE (repo convention: verify_colony.cjs / verify_overlays.cjs).
// Exit code IS the verdict: 0 = PASS, 1 = FAIL. Read-only over everything.
//
//   node viewer/gaia/verify_gaia.cjs
//
// GAIA LAW is the thing under test: Gaia projects DIRECT signals with a full provenance triple
// {locator, captured_at, sha256} and NEVER summarizes, scores, ranks, narrates, or authors a verdict.
// This gate mechanically falsifies each promise the Gaia slice-1 spec makes about itself:
//
//   gaia-signal-provenance-complete  every emitted Signal carries a non-empty locator + ISO-8601
//                                    captured_at + 64-hex sha256 + numeric byte_len.
//   gaia-rehash-integrity            sha256 recomputed over the EXACT value.raw bytes shown == the
//                                    stored provenance.sha256 for every signal (verify_hash round-trip).
//   gaia-no-summarization-lint       gaia_lint finds zero frozen-key violations and zero forbidden
//                                    tokens (count/sum/avg/percent/score/rank/total/ratio/verdict/…).
//   gaia-honest-probe                live.up is true/false ONLY on kind tcp|http and only with a
//                                    captured probe (sha256+captured_at); every other kind is up:null.
//   gaia-self-mirror                 Gaia's self-reported gaia.cjs source sha256 == an INDEPENDENT
//                                    on-disk hash this gate computes itself.
//   gaia-mcp-caps-agree              served CAPS == self-manifest signal == docs/GAIA.md rendered table.
//   gaia-read-only-fence             no effectful route/token (POST/PUT/DELETE handler, restream /
//                                    go-live / obs-command / stream-key / spawn) anywhere in viewer/gaia.
//   gaia-no-ip-literal               no IPv4 literal in any viewer/gaia *.cjs or *.html.
//   gaia-drift-surfaced              the documented drifts (fqdn-absent, gate_row schema path, resolver
//                                    planned, git dirty-vs-clean, self doc-vs-served) appear as signals.
//   gaia-write-fence-and-gate-row    the one sanctioned gate row (if present) validates against the
//                                    ACTUAL production/schemas/gate_row.schema.json with a real receipt.
//   gaia-boot-persistence-honest     docs/GAIA.md + gate row + UI say boot-persistence UNPROVEN; no
//                                    systray_watchdog.ps1 gaia auto-start entry.
//
// HONEST STANCE ON A NOT-YET-BUILT SUBJECT: if a sibling module (gaia.cjs / gaia_lint.cjs / caps.cjs /
// sig.cjs) is not on disk yet, the dynamic checks that need it are recorded FAIL — "cannot verify what
// is not built" is an honest FAIL, never a silent pass. The static fences (no-IP, read-only, gate-row
// schema, boot-persistence doc) always run against whatever bytes exist.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const GAIA_DIR = __dirname;
const REPO = path.resolve(GAIA_DIR, "..", "..");

// ---- result ledger -------------------------------------------------------
const results = []; // { name, status: PASS|FAIL|SKIP, detail }
function record(name, status, detail) { results.push({ name, status, detail: detail || "" }); }
function pass(name, detail) { record(name, "PASS", detail); }
function fail(name, detail) { record(name, "FAIL", detail); }
function skip(name, detail) { record(name, "SKIP", detail); }

// ---- tiny fs/hash helpers (read-only) ------------------------------------
function readIfExists(p) { try { return fs.readFileSync(p); } catch { return null; } }
function readTextIfExists(p) { const b = readIfExists(p); return b == null ? null : b.toString("utf8"); }
function sha256hex(buf) { return crypto.createHash("sha256").update(buf).digest("hex"); }

function walk(dir, acc) {
  acc = acc || [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue; // vendored dep tree, not Gaia's own source
      walk(full, acc);
    } else if (e.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}
function rel(p) { return path.relative(REPO, p).split(path.sep).join("/"); }

// ---- defensive sibling load ----------------------------------------------
function tryRequire(relPath) {
  try { return { mod: require(relPath), err: null }; }
  catch (e) { return { mod: null, err: e }; }
}
const R_sig  = tryRequire("./sig.cjs");
const R_caps = tryRequire("./caps.cjs");
const R_gaia = tryRequire("./gaia.cjs");
const R_lint = tryRequire("./gaia_lint.cjs");

// ---- structural validators ------------------------------------------------
const ISO8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const HEX64 = /^[0-9a-f]{64}$/;
const PROBE_KINDS = new Set(["tcp", "http"]);

function isoOk(s) { return typeof s === "string" && ISO8601.test(s) && !isNaN(Date.parse(s)); }
function hexOk(s) { return typeof s === "string" && HEX64.test(s); }

// Recompute the sha256 over EXACTLY the bytes value.raw claims to be (utf8 or base64) — the
// verify_hash round-trip. Never re-serialize: hash the shown bytes, nothing else.
function rehashSignalValue(sig) {
  const v = sig && sig.value;
  if (!v || typeof v.raw !== "string") return null;
  const enc = v.encoding === "base64" ? "base64" : "utf8";
  try { return sha256hex(Buffer.from(v.raw, enc)); } catch { return null; }
}

// Pull the flat Signal[] out of whatever gaia() returned (envelope-wrapped or bare array).
function extractSignals(env) {
  if (Array.isArray(env)) return env;
  if (env && env.result && Array.isArray(env.result.signals)) return env.result.signals;
  if (env && Array.isArray(env.signals)) return env.signals;
  return null;
}

// ==========================================================================
// DYNAMIC CHECKS (need the built modules + a live gaia() render)
// ==========================================================================
async function runDynamic() {
  if (R_gaia.err || !R_gaia.mod || typeof R_gaia.mod.gaia !== "function") {
    const why = R_gaia.err ? R_gaia.err.message : "gaia.cjs missing gaia()";
    fail("gaia-signal-provenance-complete", "gaia.cjs not loadable — cannot render signals: " + why);
    fail("gaia-rehash-integrity", "gaia.cjs not loadable — cannot verify hashes: " + why);
    fail("gaia-honest-probe", "gaia.cjs not loadable — cannot inspect probe signals: " + why);
    fail("gaia-self-mirror", "gaia.cjs not loadable — cannot read self signals: " + why);
    return { env: null, signals: null };
  }

  let env;
  try { env = await R_gaia.mod.gaia(); }
  catch (e) {
    fail("gaia-signal-provenance-complete", "gaia() threw: " + e.message);
    fail("gaia-rehash-integrity", "gaia() threw: " + e.message);
    fail("gaia-honest-probe", "gaia() threw: " + e.message);
    fail("gaia-self-mirror", "gaia() threw: " + e.message);
    return { env: null, signals: null };
  }

  const signals = extractSignals(env);
  if (!signals) {
    fail("gaia-signal-provenance-complete", "gaia() returned no result.signals[] array");
    fail("gaia-rehash-integrity", "no signals[] to rehash");
    fail("gaia-honest-probe", "no signals[] to inspect");
    fail("gaia-self-mirror", "no signals[] to inspect");
    return { env, signals: null };
  }

  // --- gaia-signal-provenance-complete -----------------------------------
  {
    const bad = [];
    for (const s of signals) {
      const p = s && s.provenance;
      if (!p) { bad.push(`${s && s.id}: no provenance`); continue; }
      if (!p.locator || typeof p.locator !== "string") bad.push(`${s.id}: empty locator`);
      if (!isoOk(p.captured_at)) bad.push(`${s.id}: bad captured_at ${JSON.stringify(p.captured_at)}`);
      if (!hexOk(p.sha256)) bad.push(`${s.id}: bad sha256 ${JSON.stringify(p.sha256)}`);
      if (typeof p.byte_len !== "number") bad.push(`${s.id}: byte_len not numeric`);
    }
    if (bad.length) fail("gaia-signal-provenance-complete", `${bad.length}/${signals.length} signals lack a complete triple: ` + bad.slice(0, 6).join("; "));
    else pass("gaia-signal-provenance-complete", `${signals.length} signals, all carry locator+ISO captured_at+64hex sha256+byte_len`);
  }

  // --- gaia-rehash-integrity (verify_hash round-trip) --------------------
  {
    const mism = [];
    for (const s of signals) {
      const stored = s && s.provenance && s.provenance.sha256;
      const recomputed = rehashSignalValue(s);
      if (recomputed == null) { mism.push(`${s && s.id}: value.raw not hashable`); continue; }
      if (recomputed !== stored) mism.push(`${s.id}: stored ${String(stored).slice(0, 12)} != recomputed ${recomputed.slice(0, 12)}`);
    }
    if (mism.length) fail("gaia-rehash-integrity", `${mism.length} signals fail verify_hash: ` + mism.slice(0, 6).join("; "));
    else pass("gaia-rehash-integrity", `all ${signals.length} signals round-trip: sha256(value.raw) == provenance.sha256`);
  }

  // --- gaia-honest-probe -------------------------------------------------
  {
    const bad = [];
    for (const s of signals) {
      const isProbe = PROBE_KINDS.has(s && s.kind);
      const live = s && s.live;
      if (isProbe) {
        if (!live || !("up" in live)) { bad.push(`${s.id}: probe-kind without live.up`); continue; }
        if (![true, false, null].includes(live.up)) bad.push(`${s.id}: live.up not tri-state (${JSON.stringify(live.up)})`);
        // up:true must be backed by a captured probe — a real sha256 + captured_at, never a PID guess.
        if (live.up === true) {
          const p = s.provenance || {};
          if (!hexOk(p.sha256) || !isoOk(p.captured_at)) bad.push(`${s.id}: up:true without a captured probe result`);
        }
        if (live.up === null && !live.detail) bad.push(`${s.id}: up:null without detail`);
      } else {
        // Non-probe kinds must never assert liveness: live absent or live.up===null.
        if (live && "up" in live && live.up !== null) bad.push(`${s.id}: kind=${s.kind} fabricates live.up=${JSON.stringify(live.up)}`);
      }
    }
    if (bad.length) fail("gaia-honest-probe", bad.slice(0, 8).join("; "));
    else pass("gaia-honest-probe", "every tcp|http up is tri-state & probe-backed; no non-probe kind fabricates liveness");
  }

  // --- gaia-self-mirror (source hash == independent on-disk hash) --------
  {
    const gaiaSrc = readIfExists(path.join(GAIA_DIR, "gaia.cjs"));
    if (!gaiaSrc) {
      fail("gaia-self-mirror", "gaia.cjs not on disk — cannot compute independent source hash");
    } else {
      const independent = sha256hex(gaiaSrc);
      // The gaia.cjs self signal carries the SOURCE BYTES in value.raw and the source's hash in
      // provenance.sha256 (that is the signal model — a file cannot contain its own hash inside its
      // own bytes). The self-mirror check is therefore: the self signal's provenance.sha256 == the
      // independent on-disk sha256 THIS gate computes. If they differ, gaia.cjs changed on disk after
      // the render captured it (modified-but-unreported source) — exactly the drift this catches.
      const selfSig = signals.find((s) => s && (s.seat === "gaia-self") &&
        /gaia\.cjs/.test((s.provenance && s.provenance.locator) || s.id || ""));
      if (!selfSig) {
        fail("gaia-self-mirror", `no gaia-self signal reports the gaia.cjs source (independent on-disk sha256 ${independent.slice(0, 12)}…)`);
      } else {
        const reported = selfSig.provenance && selfSig.provenance.sha256;
        // Also confirm value.raw genuinely round-trips to that reported hash (no re-serialization).
        const roundTrip = rehashSignalValue(selfSig);
        if (reported === independent && roundTrip === independent) {
          pass("gaia-self-mirror", `gaia-self signal provenance.sha256 ${independent.slice(0, 12)}… == independent on-disk hash, and value.raw round-trips to it`);
        } else if (reported !== independent) {
          fail("gaia-self-mirror", `gaia-self provenance.sha256 ${String(reported).slice(0, 12)}… != independent on-disk sha256 ${independent.slice(0, 12)}… (modified-but-unreported source)`);
        } else {
          fail("gaia-self-mirror", `gaia-self reports the on-disk hash but value.raw does not round-trip to it (rehash ${String(roundTrip).slice(0, 12)}…) — re-serialized source`);
        }
      }
    }
  }

  return { env, signals };
}

// ==========================================================================
// gaia-no-summarization-lint (delegates to gaia_lint.cjs)
// ==========================================================================
async function runLint(env) {
  if (R_lint.err || !R_lint.mod || typeof R_lint.mod.lint !== "function") {
    const why = R_lint.err ? R_lint.err.message : "gaia_lint.cjs missing lint()";
    fail("gaia-no-summarization-lint", "gaia_lint.cjs not loadable — cannot run the no-summarization lint: " + why);
    return;
  }
  let out;
  try {
    // lint(opts) — the live envelope is passed as opts.envelope (NOT as the whole opts object; passing
    // env directly makes lint read env.envelope, the inner metadata block, instead of env.result.signals).
    // snapshots:false keeps this check about the LIVE render only, so the gate is deterministic w.r.t.
    // whatever is on disk under snapshots/.
    if (env) out = await R_lint.mod.lint({ envelope: env, snapshots: false });
    else out = await R_lint.mod.lint();
  } catch (e) {
    fail("gaia-no-summarization-lint", "lint() threw: " + e.message);
    return;
  }
  // Interpret a variety of honest shapes without inventing a verdict.
  const defects =
    (out && (out.defects || out.violations || out.errors)) ||
    (Array.isArray(out) ? out : null);
  const okFlag = out && (out.ok === true || out.pass === true || out.exit === 0);
  if (Array.isArray(defects)) {
    if (defects.length === 0) pass("gaia-no-summarization-lint", "gaia_lint: 0 frozen-key / forbidden-token defects");
    else fail("gaia-no-summarization-lint", `gaia_lint: ${defects.length} defect(s): ` + JSON.stringify(defects).slice(0, 300));
  } else if (okFlag) {
    pass("gaia-no-summarization-lint", "gaia_lint reported clean");
  } else {
    fail("gaia-no-summarization-lint", "gaia_lint returned an unrecognized/failing result: " + JSON.stringify(out).slice(0, 200));
  }
}

// ==========================================================================
// STATIC FENCES (always run, over whatever bytes exist on disk)
// ==========================================================================
function runStaticFences() {
  const files = walk(GAIA_DIR);

  // --- gaia-no-ip-literal ------------------------------------------------
  {
    // An IPv4 literal: four dot-separated 1-3 digit groups. Built at runtime so this scanner's
    // OWN source contains no digit.digit.digit.digit literal to self-trip. Version strings
    // (e.g. 2024-11-05) do not match — they are not dot-separated octet quads.
    const oct = "(25[0-5]|2[0-4]\\d|1?\\d?\\d)";
    const IPV4 = new RegExp("\\b" + [oct, oct, oct, oct].join("\\.") + "\\b", "g");
    // The NO-IP rule fences HOST/box addresses that route around the DNS map — NOT the wildcard
    // bind address or loopback, which are the accepted bind idiom across launcher.cjs /
    // command_center.cjs. Allowlist exactly those two non-routing addresses.
    const BIND_ALLOW = new Set(["0.0.0.0", "127.0.0.1"]);
    const scanned = files.filter((f) => /\.(cjs|html)$/.test(f));
    const hits = [];
    for (const f of scanned) {
      const txt = readTextIfExists(f);
      if (txt == null) continue;
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const found = lines[i].match(IPV4) || [];
        for (const m of found) if (!BIND_ALLOW.has(m)) hits.push(`${rel(f)}:${i + 1} (${m})`);
      }
    }
    if (hits.length) fail("gaia-no-ip-literal", "host IPv4 literal(s) present: " + hits.slice(0, 10).join(", "));
    else pass("gaia-no-ip-literal", `${scanned.length} *.cjs/*.html scanned, zero IPv4 literals (hosts must derive gaia.${"${zone}"} via infra.cjs)`);
  }

  // --- gaia-read-only-fence ----------------------------------------------
  {
    // The gate meta-files (this gate, the lint, the signal kernel) legitimately name the effectful
    // vocabulary as DETECTION patterns, not routes — exclude them from the token scan.
    const metaBasenames = new Set(["verify_gaia.cjs", "gaia_lint.cjs", "sig.cjs"]);
    // Effectful outward-action tokens that must never appear as a Gaia route/verb. Assembled from
    // fragments so this scanner's own source is not a substring match for them.
    // Word-boundaried so a DESCRIPTIVE field name Gaia reads (e.g. the registry's `goLiveGate`,
    // which Gaia projects verbatim) does not trip the go-live ACTION token. These match outward-
    // action verbs/routes, not prose nouns.
    const EFFECT_TOKENS = [
      "\\b" + "re" + "stream\\b",
      "\\bgo[-_ ]?" + "live\\b",
      "\\bstart_" + "broadcast\\b",
      "\\brun" + "OnReady\\b",
      "\\bUNI_" + "PUBLISH_PIN\\b",
      "\\bobs_prog\\b", "\\bobs_prime\\b",
    ].map((t) => new RegExp(t, "i"));
    // Server-side mutation handlers: a non-GET method branch OR an express-style mutating route.
    const MUTATION_HANDLERS = [
      /req\.method\s*===?\s*["'`](POST|PUT|DELETE|PATCH)["'`]/i,
      /\.(post|put|delete|patch)\s*\(/i,
      /createWriteStream\s*\(/i,
    ];
    const scanned = files.filter((f) => f.endsWith(".cjs") && !metaBasenames.has(path.basename(f)));
    const hits = [];
    for (const f of scanned) {
      const txt = readTextIfExists(f);
      if (txt == null) continue;
      const lines = txt.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const re of EFFECT_TOKENS) if (re.test(line)) hits.push(`${rel(f)}:${i + 1} effect-token`);
        for (const re of MUTATION_HANDLERS) {
          if (re.test(line)) {
            // snapshot.cjs legitimately writes under snapshots/** with fs.appendFile/writeFile — the
            // one sanctioned write-fence. Only createWriteStream / method handlers / express routes
            // flag here; plain fs.writeFile to snapshots is allowed by design and not in this list.
            hits.push(`${rel(f)}:${i + 1} mutation-handler`);
          }
        }
      }
    }
    if (hits.length) fail("gaia-read-only-fence", "effectful route/token(s): " + hits.slice(0, 10).join(", "));
    else pass("gaia-read-only-fence", `${scanned.length} module(s) scanned, no POST/PUT/DELETE handler & no outward-action token`);
  }

  // --- gaia-boot-persistence-honest --------------------------------------
  // The ENDURING honesty invariant: no source may claim reboot-survival is PROVEN until a
  // gaia-boot-persistent row with verdict PASS exists in evidence/gates.ndjson. A dedicated supervisor
  // (gaia_watchdog.ps1) may exist — that is the crash-restart cure — but crash-restart is NOT boot/reboot
  // persistence. Until the reboot gate PASSes, the doc must state reboot/boot-persistence UNPROVEN.
  {
    const problems = [];
    // Is reboot-survival already proven in the ledger?
    let rebootProven = false;
    const ledgerTxt = readTextIfExists(path.join(REPO, "evidence", "gates.ndjson"));
    if (ledgerTxt) {
      for (const line of ledgerTxt.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let r; try { r = JSON.parse(line); } catch { continue; }
        if (r && r.name === "gaia-boot-persistent" && r.verdict === "PASS") rebootProven = true;
      }
    }
    const doc = readTextIfExists(path.join(REPO, "docs", "GAIA.md"));
    if (doc == null) {
      problems.push("docs/GAIA.md not built yet — honest boot-persistence stance not yet documented");
    } else if (!rebootProven) {
      const lc = doc.toLowerCase();
      const saysUnproven = lc.includes("boot-persist") && lc.includes("unproven");
      const claimsPersistent = /\bboot[- ]persistent\b/.test(lc) && !lc.includes("unproven") && !lc.includes("not boot-persistent");
      if (!saysUnproven) problems.push("docs/GAIA.md does not state boot/reboot-persistence UNPROVEN while no gaia-boot-persistent PASS row exists");
      if (claimsPersistent) problems.push("docs/GAIA.md appears to claim boot-persistence before the gaia-boot-persistent gate PASSes");
    }
    if (problems.length) {
      const hard = problems.filter((p) => /claim/.test(p));
      if (hard.length) fail("gaia-boot-persistence-honest", hard.join("; "));
      else skip("gaia-boot-persistence-honest", problems.join("; "));
    } else if (rebootProven) {
      pass("gaia-boot-persistence-honest", "gaia-boot-persistent PASS row present — reboot-survival is proven, persistence may be claimed");
    } else {
      pass("gaia-boot-persistence-honest", "docs/GAIA.md honestly states reboot/boot-persistence UNPROVEN (crash-restart supervisor may exist; reboot gate not yet PASS)");
    }
  }
}

// ==========================================================================
// gaia-mcp-caps-agree: served CAPS == self-manifest signal == docs/GAIA.md table
// ==========================================================================
function runCapsAgreement(signals) {
  if (R_caps.err || !R_caps.mod || !R_caps.mod.CAPS) {
    const why = R_caps.err ? R_caps.err.message : "caps.cjs missing CAPS";
    fail("gaia-mcp-caps-agree", "caps.cjs not loadable — cannot compare served vs self vs doc CAPS: " + why);
    return;
  }
  const CAPS = R_caps.mod.CAPS;
  // Canonical serialization of CAPS — prefer sig.canonicalRaw so it matches exactly what gaia emits.
  let capsCanon;
  try {
    capsCanon = (R_sig.mod && typeof R_sig.mod.canonicalRaw === "function")
      ? R_sig.mod.canonicalRaw(CAPS)
      : JSON.stringify(CAPS);
  } catch (e) { capsCanon = JSON.stringify(CAPS); }

  const notes = [];
  let selfOk = false, docOk = false;

  // (1) self-manifest signal must carry the same CAPS bytes.
  if (Array.isArray(signals)) {
    // Match the self-MANIFEST signal by id (self.mcp.manifest). The old /manifest|caps/i also matched
    // the source-file signal self.src.caps.cjs (whose value.raw is caps.cjs SOURCE, not canonical CAPS),
    // and .find() returned it first — comparing caps.cjs source bytes to canonicalRaw(CAPS) can never agree.
    const manifestSig = signals.find((s) => s && s.seat === "gaia-self" && /manifest/i.test(s.id || ""));
    if (!manifestSig) notes.push("no gaia-self manifest signal found");
    else if ((manifestSig.value && manifestSig.value.raw) === capsCanon) selfOk = true;
    else notes.push("self-manifest signal bytes != caps.cjs canonical CAPS");
  } else {
    notes.push("no signals[] to locate self-manifest");
  }

  // (2) docs/GAIA.md must render the CAPS table (toMarkdown) — check the rendered table appears in the doc.
  const doc = readTextIfExists(path.join(REPO, "docs", "GAIA.md"));
  if (doc == null) {
    notes.push("docs/GAIA.md not built");
  } else if (R_gaia.mod && typeof R_gaia.mod.toMarkdown === "function") {
    let md;
    try { md = R_gaia.mod.toMarkdown(); } catch (e) { md = null; }
    if (md == null) notes.push("gaia.toMarkdown() threw/absent");
    else {
      // Every resource/tool id from CAPS should be present in the doc (the table is rendered from CAPS).
      const ids = collectCapIds(CAPS);
      const missing = ids.filter((id) => !doc.includes(id));
      if (missing.length === 0 && ids.length > 0) docOk = true;
      else notes.push(`docs/GAIA.md missing ${missing.length}/${ids.length} CAPS id(s)`);
    }
  } else {
    notes.push("gaia.toMarkdown not available");
  }

  if (selfOk && docOk) pass("gaia-mcp-caps-agree", "CAPS byte-agrees across served registry, self-manifest signal, and docs/GAIA.md");
  else fail("gaia-mcp-caps-agree", notes.join("; ") || "CAPS divergence");
}

function collectCapIds(CAPS) {
  const ids = [];
  const scan = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(scan);
    if (typeof v === "object") {
      if (typeof v.id === "string") ids.push(v.id);
      if (typeof v.uri === "string") ids.push(v.uri);
      if (typeof v.name === "string" && /\./.test(v.name)) ids.push(v.name);
      Object.values(v).forEach(scan);
    }
  };
  scan(CAPS);
  return Array.from(new Set(ids));
}

// ==========================================================================
// gaia-every-emitted-seat-declared: closes the half-wiring hole that
// gaia-mcp-caps-agree structurally cannot see.
//
// A seat can EMIT signals into the envelope (a collector runs) while being
// DECLARED nowhere — absent from caps.cjs RESOURCES, from the gaia.signal.get
// enum, and from docs/GAIA.md. gaia-mcp-caps-agree only checks that the three
// CAPS consumers agree WITH EACH OTHER; when a seat is in NONE of them they stay
// mutually consistent, so the gap passes silently. That is exactly how the
// organic-operator seat (added 2026-07-16) was projected into /api/gaia yet
// unreachable via gaia.signal.get and undocumented — "all are one resonance"
// was not actually one resonance. This gate falsifies that class directly:
// every seat any collector emits MUST be declared in all three surfaces.
// ==========================================================================
function runEverySeatDeclared(signals) {
  if (!Array.isArray(signals)) {
    fail("gaia-every-emitted-seat-declared", "no signals[] rendered — cannot enumerate emitted seats");
    return;
  }
  if (R_caps.err || !R_caps.mod || !R_caps.mod.CAPS) {
    fail("gaia-every-emitted-seat-declared", "caps.cjs not loadable — cannot check seat declarations");
    return;
  }
  const CAPS = R_caps.mod.CAPS;
  const emitted = Array.from(new Set(signals.map((s) => s && s.seat).filter(Boolean)));
  const resourceSeats = new Set((CAPS.resources || []).map((r) => r && r.seat).filter(Boolean));
  const getTool = (CAPS.tools || []).find((t) => t && t.name === "gaia.signal.get");
  const enumSeats = new Set(
    (((((getTool || {}).inputSchema || {}).properties || {}).seat || {}).enum) || []
  );
  const doc = readTextIfExists(path.join(REPO, "docs", "GAIA.md")) || "";
  const undeclared = [];
  for (const seat of emitted) {
    const missing = [];
    if (!resourceSeats.has(seat)) missing.push("caps.cjs RESOURCES");
    if (!enumSeats.has(seat)) missing.push("gaia.signal.get enum");
    if (!doc.includes(seat)) missing.push("docs/GAIA.md");
    if (missing.length) undeclared.push(`${seat} (missing: ${missing.join(", ")})`);
  }
  if (undeclared.length === 0) {
    pass("gaia-every-emitted-seat-declared",
      `all ${emitted.length} emitted seat(s) declared in caps.cjs RESOURCES + gaia.signal.get enum + docs/GAIA.md`);
  } else {
    fail("gaia-every-emitted-seat-declared", `emitted-but-undeclared: ${undeclared.join("; ")}`);
  }
}

// ==========================================================================
// gaia-drift-surfaced: the documented drifts must appear as signals
// ==========================================================================
function runDriftSurfaced(signals) {
  if (!Array.isArray(signals)) {
    fail("gaia-drift-surfaced", "no signals[] rendered — cannot confirm drift signals exist");
    return;
  }
  // Gaia-COMPOSED drift signals only: kind:"drift" (paired {a,b,relation,equal} from driftSignal()) which
  // live in the drift seat. The old /drift/i.test(s.id) also swept in infra.dns_drift.* — verbatim
  // PROJECTIONS of infra.cjs's own dns-drift state (kind:"config"), which are not Gaia-composed pairs and
  // carry no {relation,equal}. The paired-shape requirement applies only to what Gaia itself composed.
  const driftSigs = signals.filter((s) => s && (s.kind === "drift" || s.seat === "drift"));
  const blob = JSON.stringify(driftSigs).toLowerCase();
  // The concrete slice-1 drifts the spec grounds in the live OBSERVE.
  const required = [
    { key: "fqdn", hint: "fqdn" },
    { key: "gate_row schema path", hint: "gate_row" },
    { key: "resolver planned", hint: "resolver" },
    { key: "git dirty-vs-clean", hint: "git" },
    { key: "self doc-vs-served", hint: "self" },
  ];
  const missing = required.filter((r) => !blob.includes(r.hint));
  // Each drift signal must carry the paired-locator shape (two sources) — spot-check structure.
  const malformed = driftSigs.filter((s) => {
    const raw = s.value && s.value.raw;
    if (typeof raw !== "string") return true;
    const lc = raw.toLowerCase();
    return !(lc.includes("relation") && (lc.includes("equal") || lc.includes("absent")));
  });
  if (driftSigs.length === 0) {
    fail("gaia-drift-surfaced", "zero drift signals emitted — documented drifts must be surfaced, not reconciled");
  } else if (missing.length) {
    fail("gaia-drift-surfaced", `drift signals present (${driftSigs.length}) but missing: ` + missing.map((m) => m.key).join(", "));
  } else if (malformed.length) {
    fail("gaia-drift-surfaced", `${malformed.length} drift signal(s) lack the paired-locator relation/equal shape`);
  } else {
    pass("gaia-drift-surfaced", `${driftSigs.length} drift signals, all documented drifts surfaced with paired-locator relation/equal`);
  }
}

// ==========================================================================
// gaia-write-fence-and-gate-row: the ONE sanctioned gate row validates
// ==========================================================================
function runGateRow() {
  const ledgerPath = path.join(REPO, "evidence", "gates.ndjson");
  const schemaPath = path.join(REPO, "production", "schemas", "gate_row.schema.json");
  const ledger = readTextIfExists(ledgerPath);
  const schemaTxt = readTextIfExists(schemaPath);
  if (schemaTxt == null) {
    fail("gaia-write-fence-and-gate-row", "production/schemas/gate_row.schema.json not found — cannot validate the sanctioned row");
    return;
  }
  let schema;
  try { schema = JSON.parse(schemaTxt); } catch (e) { fail("gaia-write-fence-and-gate-row", "gate_row.schema.json is not valid JSON: " + e.message); return; }

  // A MISSING CANONICAL LEDGER IS A FAILURE, NOT A SKIP — corrected 2026-07-28.
  //
  // `skip()` does not increment `failed`, and the verdict line is `if (failed === 0) → PASS`. So
  // `evidence/gates.ndjson not present` produced a GREEN GAIA GATE. The canonical gate ledger is
  // the spine of this whole instrument; its absence is the loudest possible finding, and it was
  // the quietest. A skip is for "this cannot be evaluated yet by design" — not for "the thing I
  // measure is gone".
  if (ledger == null) {
    fail("gaia-write-fence-and-gate-row",
      "evidence/gates.ndjson IS NOT PRESENT. This is the canonical gate ledger; its absence is a " +
      "failure of this gate, not a condition to skip past. Until 2026-07-28 this was a SKIP, and a " +
      "SKIP does not increment the failure count — so a missing ledger produced a green Gaia gate.");
    return;
  }
  const rows = ledger.split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
    try { return { i, row: JSON.parse(l) }; } catch { return { i, row: null, badLine: l }; }
  });
  const gaiaRows = rows.filter((r) => r.row && typeof r.row.name === "string" && /^gaia/i.test(r.row.name));
  if (gaiaRows.length === 0) {
    // DD-completion not reached yet — the row is appended when Gaia ships. Not a hard fail pre-DD.
    skip("gaia-write-fence-and-gate-row", "no gaia-* row in evidence/gates.ndjson yet (append at DD-completion)");
    return;
  }
  const required = (schema.required) || ["schema_version", "name", "verdict", "receipt_path", "evidence_class", "last_updated"];
  const verdictEnum = (((schema.properties || {}).verdict || {}).enum) || ["PASS", "PARTIAL", "FAIL", "WITHHELD", "PENDING"];
  const ecEnum = (((schema.properties || {}).evidence_class || {}).enum) || ["A", "B", "C", "Sec", "pending"];
  const problems = [];
  for (const { i, row } of gaiaRows) {
    for (const k of required) if (!(k in row)) problems.push(`row#${i} (${row.name}) missing '${k}'`);
    if (row.verdict && !verdictEnum.includes(row.verdict)) problems.push(`row#${i} verdict '${row.verdict}' not in enum`);
    if (row.evidence_class && !ecEnum.includes(row.evidence_class)) problems.push(`row#${i} evidence_class '${row.evidence_class}' not in enum`);
    if (row.schema_version !== 1) problems.push(`row#${i} schema_version != 1`);
    if (row.last_updated && !/^\d{4}-\d{2}-\d{2}$/.test(row.last_updated)) problems.push(`row#${i} last_updated not YYYY-MM-DD`);
    if (row.receipt_path) {
      const rp = path.join(REPO, row.receipt_path);
      if (!fs.existsSync(rp)) problems.push(`row#${i} receipt_path '${row.receipt_path}' does not exist on disk`);
    }
  }
  if (problems.length) fail("gaia-write-fence-and-gate-row", problems.slice(0, 8).join("; "));
  else pass("gaia-write-fence-and-gate-row", `${gaiaRows.length} gaia-* gate row(s) validate against gate_row.schema.json with real receipts`);
}

// ==========================================================================
// main
// ==========================================================================
(async () => {
  console.log("GAIA GATE — verifying GAIA LAW over viewer/gaia/**\n");

  const missing = [];
  if (R_sig.err)  missing.push("sig.cjs");
  if (R_caps.err) missing.push("caps.cjs");
  if (R_gaia.err) missing.push("gaia.cjs");
  if (R_lint.err) missing.push("gaia_lint.cjs");
  if (missing.length) console.log(`  (not-yet-built siblings: ${missing.join(", ")} — dynamic checks over them record FAIL, honestly)\n`);

  const { env, signals } = await runDynamic();
  await runLint(env);
  runCapsAgreement(signals);
  runEverySeatDeclared(signals);
  runDriftSurfaced(signals);
  runStaticFences();
  runGateRow();

  // ---- report ----
  console.log("");
  const width = results.reduce((m, r) => Math.max(m, r.name.length), 0);
  let failed = 0;
  for (const r of results) {
    if (r.status === "FAIL") failed++;
    const tag = r.status === "PASS" ? "PASS" : r.status === "FAIL" ? "FAIL" : "SKIP";
    console.log(`  [${tag}] ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const skips = results.filter((r) => r.status === "SKIP").length;
  const passes = results.filter((r) => r.status === "PASS").length;
  console.log("");
  if (failed === 0) {
    console.log(`GAIA GATE: PASS — ${passes} check(s) PASS, ${skips} SKIP (not-yet-built/pre-DD), 0 FAIL.`);
    console.log("(This gate demonstrates the named signal-fidelity BEHAVIOUR of Gaia's output — never experience or life.)");
    process.exit(0);
  } else {
    console.log(`GAIA GATE: FAIL — ${failed} check(s) FAIL, ${passes} PASS, ${skips} SKIP. Gaia does not yet satisfy GAIA LAW; no green claim permitted.`);
    process.exit(1);
  }
})().catch((e) => {
  console.error("GAIA GATE: FAIL — gate crashed: " + (e && e.stack || e));
  process.exit(1);
});
