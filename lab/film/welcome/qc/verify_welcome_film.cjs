#!/usr/bin/env node
// verify_welcome_film.cjs — THE QC GATE FOR "WELCOME TO UNI LABS".
// (lab/film/welcome. Zero dependencies. Node only. Reads; writes nothing.)
//
//   node lab/film/welcome/qc/verify_welcome_film.cjs            check the film
//   node lab/film/welcome/qc/verify_welcome_film.cjs --prove    + mutate the REAL spine, six ways
//   node lab/film/welcome/qc/verify_welcome_film.cjs --list     print every registry this gate holds
//
// WHY THIS GATE EXISTS
// --------------------
// `lab/film/QC.md` is the QC sheet for TRAVELERS, and it is the honest ancestor of this file. It is
// also HAND-TYPED, and it contradicts itself: its probe table says `Total scenes 143` while its own
// segment table sums to 40+36+35+26+20 = 157. Nobody lied. A person typed a number twice.
// `welcome/TOOLCHAIN.md` names that as the reason the Welcome film's QC sheet is GENERATED FROM THIS
// GATE'S OUTPUT rather than written.
//
// QC.md also carries the line this whole gate is built to keep true:
//
//     | Word "proven" anywhere in 67 min of narration? | never |
//
// That was checked by a human reading. This is the same claim, mechanised — and mechanising it is
// not a small thing, because a film is the most persuasive surface this project has. A picture with
// a voice over it is believed before it is checked. Everything else in this repository is read by
// someone who can go and look; a film is watched by someone who cannot.
//
// WHAT IT CHECKS, AND THE ONE RULE THAT MATTERS MOST
// -------------------------------------------------
// Words, receipts, coverage and numbers. Six lints over narration and caption text, honest-state
// coverage, spine integrity, and the rule that no numeral in the narration is typed by hand.
//
// THE SINGLE MOST IMPORTANT DESIGN RULE IN THIS FILE: the truth classes are EXTRACTED AT RUNTIME
// from lib/sp/control_plane/scene.ex. They are never a list written here. A copied vocabulary is a
// claim with a half-life — this project has measured that half-life at six hours in its own banner
// — and a film that classifies its claims against a stale copy of the vocabulary is worse than one
// that does not classify them at all, because it looks classified. If a seventh class is added
// upstream, THIS GATE GOES RED (check 2), and a human re-reads the film against the new class before
// it can go green again. It does not silently pass, and it does not silently keep six.
//
// WHAT IT CANNOT DO IS PRINTED ON EVERY RUN, at the foot, in as many words. It reads words and
// re-executes receipts. It has no opinion about whether the film is honest in spirit, and none at
// all about whether a viewer will understand it.
//
// USE vs MENTION: this file names every banned token and every forbidden noun constantly, because a
// registry has to be written down somewhere. It scans the SPINE, never itself. The same distinction
// viewer/ip_fence.cjs had to learn after convicting honest documentation six times.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const HERE = path.resolve(__dirname); // lab/film/welcome/qc
const FILM = path.resolve(HERE, "..");
const REPO = path.resolve(HERE, "..", "..", "..", ".."); // UNI.Minecraft
const FLAG = path.resolve(REPO, "..", "UNI-Flagellum");
const ROOT_PATH = { REPO, FLAG };

const SCENE_EX = path.join(REPO, "lib", "sp", "control_plane", "scene.ex");
const CLAIM_FENCE = path.join(REPO, "production", "schemas", "claim_fence.json");

// The spine is looked for in a DECLARED order and the winner is printed, so "which file did it
// read" is never a guess. Another agent authors it; this gate must be unambiguous about where.
const SPINE_CANDIDATES = [path.join(FILM, "SPINE.json"), path.join(HERE, "SPINE.json")];
const HONEST_STATE = path.join(HERE, "honest_state.json");

const PROVE = process.argv.includes("--prove");
const LIST = process.argv.includes("--list");

const t0 = Date.now();

// 30 s, and it is mostly ONE cost: re-deriving every figure the film budgets, from the real
// artifacts, by calling tokens.cjs. Roughly forty expressions that walk the gate ledger, the plan,
// the control-plane ledger, the viewer tree and the cookbook corpus. That is the gate doing its
// work, not the gate being slow, and the alternative is trusting a cached number — which is the one
// thing this whole film refuses to do.
const BUDGET_MS = 30000;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// =================================================================================================
// THE REGISTRIES. All closed, all here, all printable with --list.
//
// Nothing in this block is ever read from the spine. A film that could define its own lint has no
// lint. `viewer/verify_claims.cjs` puts it exactly: a document may NAME a scope; it may never
// define one, and nothing read from a document is executed.
// =================================================================================================

// A. BANNED OUTRIGHT. Overridable ONLY by a `quotation` beat with a receipt whose bytes hash to the
// sha it declares — so the film may quote the estate saying it never used the word "proven", and
// may not say it. Every override granted is PRINTED, never counted.
//
// THIS IS HALF THE VOCABULARY. The other half is EXTRACTED from
// production/schemas/claim_fence.json at runtime (check 3a) and unioned in, for the same reason the
// truth classes are extracted: the estate already has a versioned, machine-checked fence, and a
// second copy of it here would be a claim with a half-life. The film's own outline
// (script/MASTER_SCRIPT_EN.md) binds the narration to that fence by name; this makes the binding real
// rather than stated.
const SPEC_BANNED = [
  { token: "proven", re: /\bproven\b/gi },
  { token: "proves", re: /\bproves\b/gi },
  { token: "proof", re: /\bproofs?\b/gi },
  { token: "guaranteed", re: /\bguarantee[ds]?\b/gi },
  { token: "unhackable", re: /\bunhackable\b/gi },
  { token: "bulletproof", re: /\bbullet[- ]?proof\b/gi },
  { token: "100%", re: /\b100\s*%/g },
  { token: "certainly", re: /\bcertainly\b/gi },
  { token: "obviously", re: /\bobviously\b/gi },
  { token: "solved", re: /\bsolved\b/gi },
  { token: "world-first", re: /\bworld[- ]first\b/gi },
  { token: "the only", re: /\bthe only\b/gi },
].map((b) => ({ ...b, from: "this gate's brief" }));

// The estate's fence, read at runtime. NOT PINNED, and the asymmetry with the truth classes is
// deliberate and worth saying: adding a truth class LOOSENS the grading — a beat may now be
// something the film was never read against, so the pin makes a human go back. Adding a fenced
// token TIGHTENS — the sweep below simply starts convicting it, immediately, with no re-pin. One
// needs a human; the other enforces itself. Pinning both would produce a red that means "somebody
// made the rules stricter", which teaches people to stop making the rules stricter.
function buildFence(fenceText) {
  let doc;
  try { doc = JSON.parse(fenceText); } catch (e) { return { ok: false, why: `unreadable: ${e.message}`, patterns: [] }; }
  const classes = doc.classes || {};
  const names = Object.keys(classes);
  if (!names.length) return { ok: false, why: "no `classes` in the fence", patterns: [] };
  const flags = "g" + (doc.case_insensitive === false ? "" : "i");
  const patterns = [];
  for (const cls of names) {
    for (const pat of classes[cls] || []) {
      const body = doc.word_boundary === false ? pat : `\\b(?:${pat})\\b`;
      try { patterns.push({ token: `${cls}:${pat}`, re: new RegExp(body, flags), from: "claim_fence.json" }); }
      catch (e) { return { ok: false, why: `pattern ${JSON.stringify(pat)} in class ${cls} does not compile: ${e.message}`, patterns: [] }; }
    }
  }
  return { ok: true, version: doc.version || "(none)", classes: names, patterns, digest: sha256(JSON.stringify(classes)) };
}

// FORBIDDEN NOUNS. NO OVERRIDE EVER, not even a quotation with a perfect receipt. These are the
// studio's plumbing: a port with no authentication on it, the control protocol that speaks to it,
// the verb that starts a broadcast, an address that cannot follow a lease, a private hostname, a
// mesh. A film is published; these do not go with it. There is no receipt that makes a viewer
// knowing the OBS control port safe, so there is no way to earn one.
// THE LITERALS ARE NOT WRITTEN HERE, and that is honest_state.json's rule, not mine:
//
//   "Neither this file nor SPINE.json holds the forbidden strings, because A LIST OF WHAT MUST NOT
//    BE SHOWN IS ITSELF A LIST OF EXACTLY THE THING. The gate reads them from the repository at gate
//    time and never writes them anywhere."      (honest_state.json → prohibitions.obs.token_source)
//
// It is right, and the first version of this file was wrong: it carried the control port as a
// literal in its own registry and then PRINTED every match into the QC report — which that same
// clause names as a rendered artifact the prohibition applies to. So:
//
//   · the SHAPES stay here (a regex for "any IPv4", a protocol name) — a shape is not a locator;
//   · the VALUES are extracted from viewer/golive_guard.cjs at gate time by the rule that file
//     specifies, and never written to disk or to stdout;
//   · a match is reported BY CLASS AND BEAT ID. The offending text is never echoed.
//
// AND AN EXTRACTION THAT FINDS NOTHING IS A FAILURE, not a quiet pass — otherwise renaming the
// limitation block upstream would silently un-ban the control port.
const FORBIDDEN_SHAPES = [
  { token: "obs control protocol", re: /\bobs[-\s]?websocket\b/gi },
  { token: "stream-start verb", re: /\bStartStream\b/g },
  { token: "stream url scheme", re: /\brtmp:\/\//gi },
  { token: "IPv4 literal", re: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
  { token: "lab hostname", re: /[A-Za-z0-9_-]*\.?uni-lab\.local\b/gi },
  { token: "mesh name", re: /\btailnet\b/gi },
  { token: "mesh domain", re: /\bts\.net\b/gi },
];

// honest_state.json → prohibitions.obs.token_source.extract, implemented literally.
function extractProhibitedLocators(guardSource) {
  const lines = String(guardSource).replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((l) => /^\/\/ @limitation f31\.obs-unauthenticated$/.test(l));
  if (start < 0) return { ok: false, why: "the @limitation f31.obs-unauthenticated block is not in viewer/golive_guard.cjs", tokens: [] };
  const block = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\/\/ @limitation/.test(lines[i])) break;
    if (!/^\s*\/\//.test(lines[i])) break;
    block.push(lines[i]);
  }
  const text = block.join("\n");
  const found = new Set();
  for (const m of text.matchAll(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g)) found.add(m[0]);
  for (const m of text.matchAll(/:(\d{4,5})\b/g)) { found.add(":" + m[1]); found.add(m[1]); }
  for (const m of text.matchAll(/%APPDATA%\S+/g)) found.add(m[0]);
  // "THEN REMOVE THE LOOPBACK ADDRESS ... from the set" — measured, not assumed: a film that says
  // the studio runs on this machine is not leaking a locator.
  found.delete("127.0.0.1");
  const tokens = [...found];
  return tokens.length
    ? { ok: true, tokens, blockLines: block.length }
    : { ok: false, why: "the block was found but yielded no locators — the extraction rule and the block have drifted apart", tokens: [] };
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// "unforgeable" is not banned — it is the most important word in the anchor's honest sentence,
// "tamper-evident, NOT unforgeable". It is permitted only in a sentence that takes it away again.
const UNFORGEABLE = /\bunforgeable\b/i;
const NEGATION = /\b(not|never|no|non|cannot|can't|isn't|aren't|without|rather than|far from|stops short of|nothing)\b/i;

// OBSERVED MISUSE. These four say a person watched a thing happen. They belong to one truth class.
const OBSERVED_TOKENS = [
  { token: "observed", re: /\bobserv(e|ed|ing|ation|ations)\b/gi },
  { token: "we saw", re: /\bwe\s+saw\b/gi },
  { token: "we watched", re: /\bwe\s+watched\b/gi },
  { token: "we measured", re: /\bwe\s+measured\b/gi },
];

// SPECIES. The truth contract: E. coli behavioural evidence and Salmonella/Bacillus structural
// evidence never came from one measured specimen, and a film that names both in a breath implies
// they did.
const ECOLI = /\b(e\.?\s*coli|escherichia\s+coli)\b/i;
const OTHER_SPECIES = [
  { name: "Salmonella", re: /\bsalmonella\b/i },
  { name: "Bacillus", re: /\bbacillus\b/i },
];
const SPECIES_SEPARATORS = [
  /\bdifferent (organism|species|bacteri(um|a)|specimen)/i,
  /\bnot the same (organism|species|bacteri(um|a)|specimen|cell|measurement)/i,
  /\bseparate (organism|species|specimen|measurement|evidence|stud(y|ies))/i,
  /\btwo different\b/i,
  /\bnever from one (specimen|cell|culture|measurement)\b/i,
];
const EVIDENCE_KIND_BEHAVIOUR = /\bbehaviou?r(al|ally|s)?\b/i;
const EVIDENCE_KIND_STRUCTURE = /\bstructur(e|al|ally|es)\b/i;

// UNITS. Thermodynamic work and variational free energy are different quantities in different
// units, and the film may put them in one sentence only while saying so.
const FREE_ENERGY = /\bfree[-\s]energy\b/i;
const WORK_TORQUE = [
  { name: "work", re: /\bwork\b/i },
  { name: "torque", re: /\btorque\b/i },
  { name: "tau", re: /(\btau\b|τ)/i },
];
const UNIT_SEPARATORS = [
  /\bdifferent (quantit(y|ies)|units|things|kinds?)\b/i,
  /\bnot the same (quantity|thing|units?)\b/i,
  /\bdistinct (quantit(y|ies)|units)\b/i,
  /\bis not free[-\s]energy\b/i,
  /\bnever (adds?|mixes?|combines?) them\b/i,
  /\bkept (separate|apart)\b/i,
];

// An `intent` beat says what the laboratory MEANS to do. It is honest only if the viewer is told
// that is what they are hearing — so either the beat declares `intent_marked: true`, or its own
// words do the marking.
const INTENT_PHRASES = [
  /\bwe intend\b/i, /\bwe plan\b/i, /\bwe mean to\b/i, /\bwe want to\b/i, /\bwe hope\b/i,
  /\bnot yet\b/i, /\bhas not been built\b/i, /\bis planned\b/i, /\bwill be\b/i, /\baims? to\b/i,
  /\bthe intention\b/i, /\bone day\b/i, /\bwhat we are trying\b/i,
];

// The keys whose strings are the FILM'S VOICE. Prose in any other key is refused by check 12 —
// a film cannot smuggle a sentence past the lint by naming the field something new.
const TEXT_KEYS = [
  "narration", "caption", "captions", "vo", "voiceover", "voice_over",
  "on_screen", "onscreen", "text", "subtitle", "subtitles", "line", "quote", "quotation",
  "on_screen_quote", "card", "title", "on_screen_marker",
];

// THE QUOTATION CHANNEL — the only keys a receipted override can reach.
//
// This is narrower than the beat, deliberately, and the film's own outline is the authority:
// "on-screen quotation is exempt while the voice is not", and W-M6-03 / W-M7-03 both SHOW a fenced
// token and PARAPHRASE it aloud. An override that released the whole beat would let the narrator say
// the word out loud on the strength of a card that quotes someone else saying it.
const QUOTE_KEYS = ["quote", "quotation", "on_screen_quote", "card", "text"];

// A receipt in this spine is `<root>/<relpath>:<a>-<b>` or `…:<n>`, optionally followed by prose.
// It is parsed rather than treated as a path, because a receipt that carries its re-execution
// command in the same string is MORE useful than a bare path and should not be punished for it.
function parseReceipt(s, roots) {
  const head = String(s || "").trim().split(/\s+—\s+|\s+--\s+|\s*;\s*|\s+and\s+:/)[0].trim();
  const m = /^(\S+?)(?::(\d+)(?:-(\d+))?)?$/.exec(head.replace(/[,;]$/, ""));
  if (!m) return null;
  let rel = m[1], root = "minecraft";
  // A receipt MAY name a root ("flagellum/UNI-FLAGELLUM/…") and MAY be plain repo-relative
  // ("docs/control-plane/LIMITATIONS.md:1-9"). Both are in SPINE.json v1, and refusing the second
  // convicted eighteen honest receipts on this gate's first real run.
  const first = rel.split("/")[0];
  if (roots && roots[first] && rel.includes("/")) { root = first; rel = rel.slice(first.length + 1); }
  if (!/[\\/]/.test(rel) && !/\.[A-Za-z0-9]{1,6}$/.test(rel)) return null;
  return { root, rel, a: m[2] ? Number(m[2]) : null, b: m[3] ? Number(m[3]) : (m[2] ? Number(m[2]) : null) };
}
// Declared NON-VOICE keys. Production prose the viewer never hears. Counted and reported, never linted.
const META_KEYS = [
  "id", "register", "truth_class", "receipt", "receipt_ref", "sha256", "sha", "numbers",
  "honest_state", "covers", "facts", "fact_ids", "intent_marked", "evidence_class", "captured_at",
  "cue", "cues", "shot", "shots", "asset", "assets", "duration_s", "duration", "voice", "section",
  "act", "index", "note", "notes", "why", "comment", "production_note", "source", "sources", "tags",
  "root", "lines", "operator_ruling", "movement", "visual", "intent",
  // SPINE.json v1's own annotation vocabulary. These are production prose — the reasoning behind a
  // beat, not a word the viewer ever hears — and they are read, counted and deliberately not linted.
  "covers", "covers_prose", "why_null", "quotation_support", "numeric_mention_archived",
  "prohibition", "quotation_forbidden", "receipt_detail", "reprove", "must_also_state",
  "placement", "one_line", "beat", "mandatory",
];

// A token id is `@` plus the shape tokens.cjs uses (`n.ledger.rows`) or a bare upper-case name.
const TOKEN_RE = /@([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)/g;

const REGISTERS_WITH_LAW = { claim: "truth_class + non-empty receipt", intent: "marked as intent", quotation: "receipt + byte sha" };

// NUMBER SOURCES. A closed registry of things this gate knows how to RE-EXECUTE. An unknown kind is
// a FAIL, never a skip — otherwise a typo in a spine becomes a way to go green.
const NUMBER_SOURCES = {
  "file-bytes": (s) => String(fs.statSync(resolveIn(s)).size),
  "line-count": (s) => {
    const lines = fs.readFileSync(resolveIn(s), "utf8").replace(/\r\n/g, "\n").split("\n");
    const re = s.match ? new RegExp(s.match) : null;
    const keep = lines.filter((l) => (re ? re.test(l) : l.length > 0));
    return String(keep.length);
  },
  "ndjson-rows": (s) => String(fs.readFileSync(resolveIn(s), "utf8").split(/\r?\n/).filter((l) => l.trim()).length),
  "file-count": (s) => {
    const dir = resolveIn(s, "dir");
    const ext = s.ext || "";
    return String(fs.readdirSync(dir).filter((f) => (ext ? f.endsWith(ext) : true)).length);
  },
  json: (s) => {
    const doc = JSON.parse(fs.readFileSync(resolveIn(s), "utf8"));
    const parts = String(s.pointer || "").split("/").filter((p) => p !== "");
    let cur = doc;
    for (const p of parts) {
      if (cur === null || cur === undefined) throw new Error(`pointer ${s.pointer} died at ${p}`);
      cur = Array.isArray(cur) ? cur[Number(p)] : cur[p];
    }
    if (cur === null || cur === undefined) throw new Error(`pointer ${s.pointer} resolved to nothing`);
    return String(cur);
  },
  // A numeral inside a QUOTATION is still re-executed: the receipt is hashed, the hash must match,
  // and the value must actually appear in those bytes. A quote is not an exemption from arithmetic.
  quotation: (s, want) => {
    const p = resolveIn(s);
    const bytes = fs.readFileSync(p);
    const got = sha256(bytes);
    if (!s.sha256) throw new Error("quotation source carries no sha256");
    if (got !== s.sha256) throw new Error(`receipt sha mismatch: declared ${String(s.sha256).slice(0, 12)}, on disk ${got.slice(0, 12)}`);
    if (!bytes.toString("utf8").includes(String(want))) throw new Error(`the value ${JSON.stringify(String(want))} does not appear in the receipt`);
    return String(want);
  },
};

function resolveIn(s, key) {
  const root = ROOT_PATH[s.root || "REPO"];
  if (!root) throw new Error(`unknown root ${JSON.stringify(s.root)} — declared roots are ${Object.keys(ROOT_PATH).join(", ")}`);
  const rel = s[key || "file"];
  if (!rel) throw new Error(`source names no ${key || "file"}`);
  const p = path.resolve(root, rel);
  // A spine is data. It may name a path; it may not escape the tree with one.
  if (!p.startsWith(root)) throw new Error(`path escapes its declared root: ${rel}`);
  return p;
}

// =================================================================================================
// B. THE TRUTH-CLASS VOCABULARY — EXTRACTED, NEVER WRITTEN
// =================================================================================================
//
// One name IS written below: "OBSERVED". That is deliberate and it is not a list. Rule A names
// OBSERVED as a ROLE — the class that licenses the words "we saw" — so the gate has to be able to
// ask for it by name. It asks the EXTRACTED set; if the extracted set stops containing it, check 2
// goes red rather than assuming which of the new names took over.
const OBSERVED_ROLE = "OBSERVED";

// THE PIN. Not the vocabulary — a fingerprint OF the vocabulary, measured 2026-08-01 against
// lib/sp/control_plane/scene.ex:40. Its whole job is to make an upstream change LOUD. When it goes
// red the repair is never "update the number": it is to read the film against the class that
// appeared or vanished, decide what it means for every beat, then re-pin with the reason.
const PINNED_VOCAB = {
  sha256: "032bfb1b9122186c86286cabb8902b4ff641db425448b98d0fec82ce73ac5c16",
  count: 6,
  measured: "2026-08-01",
  at: "lib/sp/control_plane/scene.ex:40",
};

function extractTruthClasses(sourceText) {
  const m = /@truth_classes\s*\[([^\]]*)\]/.exec(sourceText);
  if (!m) return { ok: false, why: "no `@truth_classes [...]` attribute found in the source", names: [] };
  const names = [...m[1].matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((x) => x[1]);
  if (!names.length) return { ok: false, why: "the `@truth_classes` attribute parsed to zero atoms", names: [] };
  return { ok: true, names, digest: sha256(names.join(",")) };
}

// =================================================================================================
// SPINE READING
// =================================================================================================

function beatsOf(spine) {
  if (Array.isArray(spine)) return spine;
  for (const k of ["beats", "spine", "scenes"]) {
    if (Array.isArray(spine && spine[k])) return spine[k];
    if (spine && spine[k] && Array.isArray(spine[k].beats)) return spine[k].beats;
  }
  return null;
}

function stringsUnder(v, out) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringsUnder(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => stringsUnder(x, out));
  return out;
}

// The film's voice for one beat: every string under a DECLARED text key, and nothing else. Each
// carries the key it came from, because the quotation override is scoped to the channel, not the beat.
function voiceOf(beat) {
  const out = [];
  for (const k of TEXT_KEYS) {
    if (!(k in beat)) continue;
    for (const s of stringsUnder(beat[k], [])) if (s && s.trim()) out.push({ key: k, text: s });
  }
  return out;
}

// THE QUOTATION RECEIPT. Verified through tokens.cjs's own `quote()` whenever the beat cites a line
// range, so there is ONE statement of the rule (read utf8, split on /\r?\n/, take [a-1..b-1], join
// with "\n", sha256 the utf8) rather than a second implementation here that could drift from it.
// A whole-file sha is still accepted for a beat that cites a whole file.
function verifyQuotation(beat, tokens) {
  const receipt = beat.receipt || beat.receipt_ref;
  const declared = beat.sha256 || beat.sha;
  if (!receipt) return { ok: false, why: "quotation carries no receipt" };
  if (!declared) return { ok: false, why: "quotation carries no byte sha" };

  // Either the beat spells the range out, or — as SPINE.json v1 does — it lives in the receipt.
  let root = beat.root, rel = String(receipt), a = null, b = null;
  if (Array.isArray(beat.lines) && beat.lines.length === 2) { a = beat.lines[0]; b = beat.lines[1]; }
  if (!root || a === null) {
    const p = parseReceipt(receipt, tokens && tokens.ROOTS);
    if (p && p.a !== null) { root = root || p.root; rel = p.rel; a = a === null ? p.a : a; b = b === null ? p.b : b; }
  }

  if (root && a !== null) {
    const lines = [a, b];
    if (!tokens) return { ok: false, why: "cites a line range but tokens.cjs could not be loaded to apply the estate's quotation rule" };
    if (!tokens.ROOTS[root]) return { ok: false, why: `unknown root ${JSON.stringify(root)}; tokens.cjs declares ${Object.keys(tokens.ROOTS).join(", ")}` };
    let q;
    try { q = tokens.quote(root, rel, lines[0], lines[1]); }
    catch (e) { return { ok: false, why: `quote(${root}, ${rel}, ${lines.join("-")}) failed: ${e.message}` }; }
    if (q.sha256 !== String(declared)) return { ok: false, why: `sha mismatch over ${rel}:${lines.join("-")} (declared ${String(declared).slice(0, 12)}, measured ${q.sha256.slice(0, 12)})` };
    // AND THE WORDS MUST BE THERE. A matching hash over a line range the quote does not appear in
    // proves the range exists, not that it says this.
    const said = QUOTE_KEYS.map((k) => stringsUnder(beat[k] === undefined ? "" : beat[k], []).join(" ")).join(" ").trim();
    const norm = (s) => s.replace(/[\s ]+/g, " ").replace(/[""]/g, '"').trim();
    if (said && !norm(q.text).includes(norm(said).replace(/^"|"$/g, ""))) {
      return { ok: false, why: `the quoted words do not appear in ${rel}:${lines.join("-")} — the hash matches a range that does not say this` };
    }
    return { ok: true, sha: q.sha256, receipt: `${root}/${rel}:${lines.join("-")}`, verbatim: true };
  }

  let p = path.resolve(REPO, String(receipt));
  if (!fs.existsSync(p)) p = path.resolve(FILM, String(receipt));
  if (!fs.existsSync(p)) return { ok: false, why: `receipt ${receipt} is not on disk` };
  const got = sha256(fs.readFileSync(p));
  if (got !== String(declared)) return { ok: false, why: `whole-file sha mismatch (declared ${String(declared).slice(0, 12)}, on disk ${got.slice(0, 12)})` };
  return { ok: true, sha: got, receipt: String(receipt), verbatim: false };
}

function sentences(text) {
  return String(text).split(/(?<=[.!?…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}

const idOf = (beat, i) => String((beat && (beat.id || beat.beat_id)) || `#${i} (NO id FIELD)`);

function coveredFactsOf(beat) {
  const out = [];
  for (const k of ["honest_state", "covers", "facts", "fact_ids"]) {
    if (!(k in beat)) continue;
    const v = beat[k];
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((x) => { if (typeof x === "string") out.push(x); else if (x && x.id) out.push(String(x.id)); });
  }
  return out;
}

function factIdsOf(honest) {
  if (!honest) return null;
  const pull = (arr) => arr.map((f) => (typeof f === "string" ? f : f && (f.id || f.fact || f.key))).filter(Boolean).map(String);
  if (Array.isArray(honest)) return pull(honest);
  for (const k of ["facts", "honest_state", "items", "states"]) if (Array.isArray(honest[k])) return pull(honest[k]);
  const keys = Object.keys(honest).filter((k) => honest[k] && typeof honest[k] === "object");
  return keys.length ? keys : null;
}

// Every beat a cue file points at, wherever it points from.
function beatRefsIn(node, out) {
  if (Array.isArray(node)) node.forEach((n) => beatRefsIn(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (/^(beat|beat_id|beat_ref|beats|ref|refs)$/i.test(k)) stringsUnder(v, out);
      else beatRefsIn(v, out);
    }
  }
  return out;
}

function findCueFiles(spine) {
  const declared = (spine && (spine.cue_files || spine.cues)) || null;
  const out = [];
  if (Array.isArray(declared) && declared.every((d) => typeof d === "string")) {
    for (const rel of declared) out.push({ file: path.resolve(FILM, rel), declared: true });
    return out;
  }
  const walk = (dir) => {
    let e = [];
    try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const x of e) {
      const p = path.join(dir, x.name);
      if (x.isDirectory()) { if (x.name !== "qc" && x.name !== "node_modules" && x.name[0] !== ".") walk(p); }
      else if (/cue/i.test(x.name) && x.name.endsWith(".json")) out.push({ file: p, declared: false });
    }
  };
  walk(FILM);
  return out;
}

// =================================================================================================
// THE CHECK ENGINE — a pure function of what it is handed, so `--prove` can re-run it on a clone.
// =================================================================================================

function runChecks(ctx) {
  const R = [];
  const ok = (name, detail) => R.push({ pass: true, name, detail });
  const bad = (name, detail) => R.push({ pass: false, name, detail });
  const exceptions = [];

  // ---- 0. THE GATE CANNOT PASS BY FINDING NOTHING ----------------------------------------------
  if (!ctx.spine) {
    bad("the spine is on disk and parses",
      `no spine read. Looked, in order: ${ctx.searched.join(" · ")}. ` +
      `A QC gate with no film in front of it has checked nothing, and this is a clean red rather ` +
      `than a green with an empty set behind it. EXPECTED SHAPE: {"beats":[{"id":…,"register":` +
      `"claim"|"intent"|"quotation"|…,"truth_class":<one of the extracted classes>,"receipt":…,` +
      `"narration":…,"caption":…,"numbers":[{"token":"X","value":"…","source":{"kind":…}}],` +
      `"honest_state":["fact.id"]}]}`);
    return { results: R, exceptions };
  }

  const beats = beatsOf(ctx.spine);
  if (!beats) {
    bad("the spine is on disk and parses",
      `${ctx.spinePath} parsed, but no beat array found. Looked at the top level for an array, and ` +
      `at keys: beats, spine, scenes.`);
    return { results: R, exceptions };
  }

  const voices = beats.map((b, i) => {
    const keyed = voiceOf(b || {});
    return { id: idOf(b, i), beat: b, i, keyed, texts: keyed.map((x) => x.text) };
  });
  const chars = voices.reduce((n, v) => n + v.texts.join(" ").length, 0);
  const silent = voices.filter((v) => v.texts.length === 0);

  chars > 0 && beats.length > 0
    ? ok("this gate read something",
        `${beats.length} beat(s), ${chars} character(s) of narration and caption under declared ` +
        `text keys, ${silent.length} beat(s) with no voice at all. A lint over zero characters is a ` +
        `lint that looked at nothing.`)
    : bad("this gate read something",
        `${beats.length} beat(s) but ${chars} characters of voice. Either the film is silent or the ` +
        `text lives under a key this gate does not know. Declared text keys: ${TEXT_KEYS.join(", ")}.`);

  // ---- 1. THE VOCABULARY WAS EXTRACTED, NOT WRITTEN --------------------------------------------
  const vocab = extractTruthClasses(ctx.vocabSource || "");
  vocab.ok
    ? ok("the truth classes were EXTRACTED from the source at runtime",
        `${vocab.names.length} class(es) read out of ${path.relative(REPO, SCENE_EX).replace(/\\/g, "/")}: ` +
        `${vocab.names.join(", ")}. This gate holds no list of its own; it holds a fingerprint of ` +
        `the one upstream (check 2).`)
    : bad("the truth classes were EXTRACTED from the source at runtime",
        `${vocab.why} — and this gate REFUSES to fall back to a list of its own. A film graded ` +
        `against a copied vocabulary looks graded and is not.`);

  // ---- 2. AND THE VOCABULARY HAS NOT MOVED UNDER THE FILM --------------------------------------
  if (vocab.ok) {
    vocab.digest === PINNED_VOCAB.sha256 && vocab.names.length === PINNED_VOCAB.count
      ? ok("the extracted vocabulary is the one this film was graded against",
          `${vocab.names.length} classes, digest ${vocab.digest.slice(0, 16)}… — matches the pin ` +
          `taken ${PINNED_VOCAB.measured} at ${PINNED_VOCAB.at}. The pin is a FINGERPRINT, not a copy: ` +
          `it cannot be used to grade a beat, only to notice that the upstream vocabulary moved.`)
      : bad("the extracted vocabulary is the one this film was graded against",
          `upstream now has ${vocab.names.length} class(es) (${vocab.names.join(", ")}), digest ` +
          `${vocab.digest.slice(0, 16)}…; the pin says ${PINNED_VOCAB.count} and ` +
          `${PINNED_VOCAB.sha256.slice(0, 16)}…. THE REPAIR IS NOT TO UPDATE THE PIN. A class was ` +
          `added, removed or renamed in scene.ex, and every beat in this film was classified before ` +
          `that happened. Re-read the film against the new vocabulary, decide what each beat is now, ` +
          `THEN re-pin with the reason.`);

    const observedClass = vocab.names.find((n) => n === OBSERVED_ROLE);
    observedClass
      ? ok(`the class that licenses "we saw" exists in the extracted set`,
          `${OBSERVED_ROLE} is present. Rule A names it as a ROLE, so this gate asks the extracted ` +
          `set for it by name rather than assuming its position.`)
      : bad(`the class that licenses "we saw" exists in the extracted set`,
          `no class named ${OBSERVED_ROLE} upstream. This gate will not guess which of ` +
          `${vocab.names.join(", ")} inherited the role of "a person watched this happen".`);

    const known = new Set(vocab.names);
    const wrong = voices.filter((v) => v.beat && v.beat.truth_class && !known.has(String(v.beat.truth_class)))
      .map((v) => `${v.id} → ${JSON.stringify(v.beat.truth_class)}`);
    wrong.length === 0
      ? ok("every truth_class in the spine is a class the source declares",
          `checked ${voices.filter((v) => v.beat && v.beat.truth_class).length} classified beat(s) ` +
          `against the extracted set.`)
      : bad("every truth_class in the spine is a class the source declares", wrong.join(" · "));
  }

  // ---- 3a. THE FENCE WAS EXTRACTED TOO -----------------------------------------------------------
  const fence = buildFence(ctx.fenceSource || "");
  fence.ok
    ? ok("the estate's claim fence was extracted at runtime and unioned into the sweep",
        `v${fence.version}, ${fence.classes.length} class(es) (${fence.classes.join(", ")}), ` +
        `${fence.patterns.length} pattern(s), digest ${fence.digest.slice(0, 12)}… — read out of ` +
        `production/schemas/claim_fence.json, never copied here. The film's outline binds the ` +
        `narration to this fence by name; this is what makes that binding real. It is NOT pinned, ` +
        `unlike the truth classes: a token added upstream tightens the sweep and enforces itself, ` +
        `while a truth class added upstream loosens the grading and needs a human.`)
    : bad("the estate's claim fence was extracted at runtime and unioned into the sweep",
        `${fence.why} — and this gate REFUSES to fall back to its own copy of the fence. The film ` +
        `outline says the narration corpus is run through this fence before any audio is synthesised; ` +
        `if the fence cannot be read, that sentence is not true and the gate says so.`);

  const BANNED = [...SPEC_BANNED, ...fence.patterns];

  // ---- 3b. THE NUMBER REGISTER IS LOADABLE AND MEASURES -------------------------------------------
  //
  // tokens.cjs is the film's number source: every number is an EXPRESSION there, never a literal in
  // the spine. This gate does not reimplement it — it CALLS it. A register that cannot be loaded, or
  // whose expressions have stopped measuring, means the film's numbers cannot be re-derived, and a
  // number that cannot be re-derived is a hand-typed number wearing a token's clothes.
  if (!ctx.tokens || !ctx.register) {
    bad("the number register loads and every token still measures",
      `lab/film/welcome/qc/tokens.cjs could not be required${ctx.tokensError ? `: ${ctx.tokensError}` : ""}. ` +
      `Every number in this film is defined there as an expression; without it nothing can be re-derived.`);
  } else {
    ok("the number register loads",
      `${ctx.register.ids.length} token(s) declared in lab/film/welcome/qc/tokens.cjs. This gate CALLS ` +
      `that file rather than reimplementing it, and measures only the tokens this film actually says — ` +
      `lazily, once each per process. WHETHER ALL ${ctx.register.ids.length} STILL MEASURE IS NOT ` +
      `CHECKED HERE and is not claimed: \`node lab/film/welcome/qc/tokens.cjs\` measures the whole ` +
      `register and exits non-zero if any expression fails. That is its gate, not this one's, and a ` +
      `second derivation would be a second place to be wrong.`);
  }

  // ---- 3. OVERCLAIM LINT, and every override PRINTED --------------------------------------------
  //
  // The override is a real power, so it is expensive: `register: "quotation"`, a receipt that is on
  // disk, and a sha over its bytes that matches. An override standing on a receipt nobody can read
  // is not an override, and this gate says so by convicting the word anyway.
  {
    const offenders = [];
    for (const v of voices) {
      const b = v.beat || {};
      const isQuote = String(b.register || "").toLowerCase() === "quotation";
      const q = isQuote ? verifyQuotation(b, ctx.tokens) : null;
      for (const { key, text } of v.keyed) {
        // THE OVERRIDE IS SCOPED TO THE CHANNEL. A valid receipt releases the CARD, never the voice.
        const releasable = isQuote && QUOTE_KEYS.includes(key);
        for (const w of BANNED) {
          w.re.lastIndex = 0;
          if (!w.re.test(text)) continue;
          if (releasable && q && q.ok) {
            exceptions.push(`${v.id}.${key} — "${w.token}" [${w.from}] allowed: register=quotation, ` +
              `${q.verbatim ? "VERBATIM from " : "whole file "}${q.receipt}, sha ${q.sha.slice(0, 16)}…`);
          } else {
            const why = releasable ? ` (quotation override REFUSED: ${q.why})`
              : isQuote ? ` (this is the ${key} channel, not the card — a quotation override releases ${QUOTE_KEYS.join("/")} and never the voice)`
              : "";
            offenders.push(`${v.id}.${key} — "${w.token}" [${w.from}]${why} in: ${text.slice(0, 90)}`);
          }
        }
      }
    }
    offenders.length === 0
      ? ok("no overclaiming word survives outside a receipted quotation",
          `${BANNED.length} banned pattern(s) — ${SPEC_BANNED.length} from this gate's brief, ` +
          `${fence.patterns.length} extracted from the estate's fence — swept over ${chars} characters. QC.md's own line — ` +
          `'the word "proven" anywhere in 67 min of narration? never' — was a human reading. This is ` +
          `that claim mechanised, with ${exceptions.length} override(s) granted and every one printed below.`)
      : bad("no overclaiming word survives outside a receipted quotation", offenders.join(" · "));
  }

  // ---- 4. "unforgeable" ONLY IN A SENTENCE THAT TAKES IT BACK ------------------------------------
  {
    const offenders = [];
    for (const v of voices) for (const text of v.texts) for (const s of sentences(text)) {
      if (UNFORGEABLE.test(s) && !NEGATION.test(s)) offenders.push(`${v.id} — ${s.slice(0, 110)}`);
    }
    offenders.length === 0
      ? ok(`"unforgeable" appears only where it is negated`,
          `the word is not banned, because the anchor's honest sentence NEEDS it: tamper-evident, ` +
          `NOT unforgeable. The off-box witness accepts the writer's key and there are zero ` +
          `independent custodians. A film that drops the "not" says the opposite of the truth with ` +
          `one word removed.`)
      : bad(`"unforgeable" appears only where it is negated`, offenders.join(" · "));
  }

  // ---- 5. OBSERVED MISUSE — FAILS BY BEAT ID -----------------------------------------------------
  {
    const offenders = [];
    for (const v of voices) {
      const tc = String((v.beat || {}).truth_class || "");
      if (tc === OBSERVED_ROLE) continue;
      for (const text of v.texts) for (const w of OBSERVED_TOKENS) {
        w.re.lastIndex = 0;
        if (w.re.test(text)) offenders.push(`${v.id} [truth_class=${tc || "ABSENT"}] says "${w.token}": ${text.slice(0, 80)}`);
      }
    }
    const observedBeats = voices.filter((v) => String((v.beat || {}).truth_class || "") === OBSERVED_ROLE);
    offenders.length === 0
      ? ok(`"we saw" belongs to ${OBSERVED_ROLE} and to nothing else`,
          `${observedBeats.length} beat(s) carry ${OBSERVED_ROLE} and may say it; ` +
          `${voices.length - observedBeats.length} may not. Only a source-pinned recorded measurement ` +
          `is observed — a reconstruction, a simulation or a model output may never be relabelled by ` +
          `narrating it in the past tense.`)
      : bad(`"we saw" belongs to ${OBSERVED_ROLE} and to nothing else`, offenders.join(" · "));
  }

  // ---- 6. SPECIES CONFLATION ---------------------------------------------------------------------
  {
    const offenders = [];
    for (const v of voices) {
      const all = v.texts.join(" \n ");
      if (!ECOLI.test(all)) continue;
      const others = OTHER_SPECIES.filter((s) => s.re.test(all)).map((s) => s.name);
      if (!others.length) continue;
      const missing = [];
      if (!SPECIES_SEPARATORS.some((re) => re.test(all))) missing.push("a separator phrase");
      if (!EVIDENCE_KIND_BEHAVIOUR.test(all)) missing.push("the evidence kind for E. coli (behaviour)");
      if (!EVIDENCE_KIND_STRUCTURE.test(all)) missing.push(`the evidence kind for ${others.join("/")} (structure)`);
      if (missing.length) offenders.push(`${v.id} names E. coli and ${others.join("/")} but lacks ${missing.join(" + ")}`);
    }
    offenders.length === 0
      ? ok("no beat implies E. coli and Salmonella came from one specimen",
          `a beat naming both must carry a separator phrase AND name the evidence kind for each. ` +
          `The behaviour is E. coli's and the structure is Salmonella's and Bacillus's, and they ` +
          `were never one measured specimen — a film that puts them in a breath says they were.`)
      : bad("no beat implies E. coli and Salmonella came from one specimen", offenders.join(" · "));
  }

  // ---- 7. UNITS ----------------------------------------------------------------------------------
  {
    const offenders = [];
    for (const v of voices) for (const text of v.texts) for (const s of sentences(text)) {
      if (!FREE_ENERGY.test(s)) continue;
      const hit = WORK_TORQUE.find((w) => w.re.test(s));
      if (!hit) continue;
      if (!UNIT_SEPARATORS.some((re) => re.test(s))) offenders.push(`${v.id} — free energy + ${hit.name}, no separator: ${s.slice(0, 100)}`);
    }
    offenders.length === 0
      ? ok("free energy and mechanical work are never left in one sentence unseparated",
          `tau·delta-theta is joules of work turned by a motor; variational free energy is a bound on ` +
          `surprise. They are different quantities in different units and a sentence holding both ` +
          `must say so.`)
      : bad("free energy and mechanical work are never left in one sentence unseparated", offenders.join(" · "));
  }

  // ---- 8. FORBIDDEN NOUNS — NO OVERRIDE EVER ------------------------------------------------------
  {
    const loc = extractProhibitedLocators(ctx.guardSource || "");
    const dynamic = loc.tokens.map((t) => ({ token: "extracted locator", re: new RegExp(esc(t), "g") }));
    const offenders = [];
    for (const v of voices) for (const { key, text } of v.keyed) for (const w of [...FORBIDDEN_SHAPES, ...dynamic]) {
      w.re.lastIndex = 0;
      // THE VALUE IS NEVER ECHOED. prohibitions.obs says the QC report is itself a rendered artifact.
      if (w.re.test(text)) offenders.push(`${v.id}.${key} — ${w.token} (value withheld: this report is a rendered artifact under prohibition.obs)`);
    }
    !loc.ok
      ? bad("the studio's plumbing is not in the film, and cannot be receipted into it",
          `THE LOCATOR LIST COULD NOT BE EXTRACTED: ${loc.why}. This gate will not report a film clean ` +
          `of locators it was unable to look for — that would silently un-ban the control port the ` +
          `moment somebody renamed a comment block upstream.`)
      : offenders.length === 0
        ? ok("the studio's plumbing is not in the film, and cannot be receipted into it",
            `${FORBIDDEN_SHAPES.length} forbidden shape(s) plus ${loc.tokens.length} locator(s) EXTRACTED ` +
            `at gate time from the f31.obs-unauthenticated block (${loc.blockLines} comment lines), never ` +
            `written here and never printed. NO override path exists in this gate at all — not even a ` +
            `quotation with a perfect receipt. The control port is bound to all interfaces with ` +
            `auth_required false; there is no receipt that makes a viewer knowing where it is safe, so ` +
            `there is no way to earn one.`)
        : bad("the studio's plumbing is not in the film, and cannot be receipted into it", offenders.join(" · "));
  }

  // ---- 9. HONEST-STATE COVERAGE ------------------------------------------------------------------
  {
    const facts = factIdsOf(ctx.honest);
    if (!facts) {
      bad("every honest-state fact is carried by at least one beat",
        ctx.honest
          ? `${ctx.honestPath} parsed but no fact ids found — expected an array, or a "facts" array, ` +
            `of {id: …} or of id strings.`
          : `${ctx.honestPath} is absent. The honest state is the list of things this film MUST say ` +
            `about itself; with no list, "the film is honest" is a claim over an empty set.`);
    } else {
      const covered = new Set();
      for (const v of voices) for (const f of coveredFactsOf(v.beat || {})) covered.add(f);
      const missing = facts.filter((f) => !covered.has(f));
      const unknown = [...covered].filter((c) => !facts.includes(c));
      const mandatory = Array.isArray(ctx.honest && ctx.honest.facts)
        ? ctx.honest.facts.filter((f) => f && f.mandatory).map((f) => String(f.id)) : [];
      const missingMandatory = mandatory.filter((f) => !covered.has(f));
      missing.length === 0 && unknown.length === 0
        ? ok("every honest-state fact is carried by at least one beat",
            `${facts.length} fact(s), all covered, ${mandatory.length} of them mandatory:true — the ones ` +
            `the cut contract says every cut must carry ("a cut that shortens M6 is not a shorter film; ` +
            `it is a different claim"). An adverse fact that no beat carries is a fact the viewer never ` +
            `hears, and a hole in a film is invisible: you cannot notice what was never shown.`)
        : bad("every honest-state fact is carried by at least one beat",
            [
              missingMandatory.length ? `MANDATORY AND NOT COVERED: ${missingMandatory.join(", ")}` : null,
              missing.length ? `NOT COVERED BY ANY BEAT: ${missing.join(", ")}` : null,
              unknown.length ? `beats claim to cover fact(s) that do not exist: ${unknown.join(", ")}` : null,
            ].filter(Boolean).join(" · "));
    }

    // ---- 9b. THE PER-FACT WORD RULES ------------------------------------------------------------
    //
    // honest_state.json → facts[].must_use_the_word / must_not_use_the_words. These are the sharpest
    // rules in the whole contract and they are the film's, not this gate's: honest.golive must say
    // `presence_evident` and must NEVER say secure, locked, unforgeable, airtight or impossible,
    // "because a film that upgrades that word overstates a guard past what it can carry".
    //
    // They bind THE RENDERED CUT. Applied here to whatever text the covering beats already carry —
    // which in a prose-free spine is often none, and that is reported as PENDING rather than passed.
    const withRules = Array.isArray(ctx.honest && ctx.honest.facts)
      ? ctx.honest.facts.filter((f) => f && (f.must_use_the_word || (f.must_not_use_the_words || []).length)) : [];
    if (withRules.length) {
      const faults = [];
      let exercised = 0, pending = 0;
      for (const f of withRules) {
        const carriers = voices.filter((v) => coveredFactsOf(v.beat || {}).includes(String(f.id)));
        const text = carriers.flatMap((v) => v.texts).join("\n");
        if (!text.trim()) { pending++; continue; }
        exercised++;
        for (const w of f.must_not_use_the_words || []) {
          if (new RegExp(`\\b${esc(String(w))}\\b`, "i").test(text)) {
            faults.push(`${f.id} — the word "${w}" appears in a beat that carries it (${carriers.map((c) => c.id).join(", ")}); the fact forbids it`);
          }
        }
        if (f.must_use_the_word && !new RegExp(`\\b${esc(String(f.must_use_the_word))}\\b`, "i").test(text)) {
          faults.push(`${f.id} — the required word "${f.must_use_the_word}" is absent from the text of ${carriers.map((c) => c.id).join(", ")}`);
        }
      }
      faults.length === 0
        ? ok("the honest state's own per-fact word rules hold",
            `${withRules.length} fact(s) declare a word rule; ${exercised} had text to check and passed; ` +
            `${pending} are PENDING because the beats that carry them hold no prose yet — this spine is ` +
            `a truth ledger and the words are authored in a cut. That is stated, not counted as a pass.`)
        : bad("the honest state's own per-fact word rules hold", faults.join(" · "));
    }
  }

  // ---- 10. SPINE INTEGRITY -----------------------------------------------------------------------
  {
    const ids = new Set(voices.map((v) => v.id));
    const dupes = [];
    const seen = new Set();
    for (const v of voices) { if (seen.has(v.id)) dupes.push(v.id); seen.add(v.id); }

    const unresolved = [];
    let refCount = 0;
    for (const c of ctx.cues) {
      if (!c.json) { unresolved.push(`${path.relative(REPO, c.file).replace(/\\/g, "/")} — ${c.error || "unreadable"}`); continue; }
      for (const r of beatRefsIn(c.json, [])) { refCount++; if (!ids.has(r)) unresolved.push(`${path.basename(c.file)} → ${r}`); }
    }

    const claimFaults = [];
    const intentFaults = [];
    for (const v of voices) {
      const b = v.beat || {};
      const reg = String(b.register || "").toLowerCase();
      if (!b.id && !b.beat_id) claimFaults.push(`beat ${v.i} has NO id`);
      if (reg === "claim") {
        if (!b.truth_class) claimFaults.push(`${v.id} is register:claim with no truth_class`);
        const rcpt = b.receipt || b.receipt_ref;
        if (!rcpt || !String(rcpt).trim() || String(rcpt).trim() === "null") claimFaults.push(`${v.id} is register:claim with an empty receipt`);
        else {
          // A receipt may be `<root>/<path>:<lines>` FOLLOWED BY ITS RE-EXECUTION COMMAND AND WHY.
          // The first version treated the whole string as a filename and convicted four honest
          // receipts for being informative. A receipt that carries its own re-execution is better
          // than a bare path and must not be punished for it.
          const p = parseReceipt(rcpt, ctx.tokens && ctx.tokens.ROOTS);
          if (p) {
            const base = ctx.tokens && ctx.tokens.ROOTS[p.root];
            if (base && !fs.existsSync(path.resolve(base, p.rel))) claimFaults.push(`${v.id} cites ${p.root}/${p.rel}, which is not on disk`);
          } else if (/^[a-z]+\/\S+\.[a-z0-9]{1,6}/i.test(String(rcpt).trim())) {
            claimFaults.push(`${v.id} cites a receipt this gate cannot parse: ${String(rcpt).slice(0, 60)}`);
          }
        }
      }
      if (reg === "intent") {
        // SPINE.json's own register contract: an intent beat "MUST carry the marker INTENT, NOT A
        // MEASURED CLAIM. A cut that renders an intent beat without it is a failing cut."
        const marker = typeof b.on_screen_marker === "string" ? b.on_screen_marker.trim() : "";
        const marked = marker.length > 0 || b.intent_marked === true || INTENT_PHRASES.some((re) => v.texts.some((t) => re.test(t)));
        if (!marked) intentFaults.push(`${v.id} is register:intent but nothing marks it as intent — give it on_screen_marker, or set intent_marked:true, or let the words say it`);
        if (b.truth_class) intentFaults.push(`${v.id} is register:intent and carries truth_class ${JSON.stringify(b.truth_class)}; the spine's own contract says it is "null, always — an intent is not a claim about the world and must never be given one"`);
      }
    }

    // fails_if: "SPINE.json's beat_count_by_movement disagrees with SPINE.json's own beats array".
    const declaredCounts = ctx.spine && ctx.spine.beat_count_by_movement;
    if (declaredCounts && typeof declaredCounts === "object") {
      const actual = {};
      for (const v of voices) { const mv = String((v.beat || {}).movement || "?"); actual[mv] = (actual[mv] || 0) + 1; }
      for (const [mv, n] of Object.entries(declaredCounts)) {
        if (typeof n !== "number") continue;
        // `total` is the count of beats, not of a movement named "total".
        const got = mv === "total" ? voices.length : (actual[mv] || 0);
        if (got !== n) claimFaults.push(`beat_count_by_movement says ${mv}=${n}, the beats array has ${got}`);
      }
      for (const mv of Object.keys(actual)) if (!(mv in declaredCounts)) claimFaults.push(`movement ${mv} has beats but no entry in beat_count_by_movement`);
    }

    const faults = [...dupes.map((d) => `duplicate beat id ${d}`), ...unresolved.map((u) => `cue reference does not resolve: ${u}`), ...claimFaults, ...intentFaults];
    faults.length === 0
      ? ok("the spine holds together",
          `${voices.length} beat(s), ids unique; ` +
          (ctx.cues.length
            ? `${refCount} beat reference(s) across ${ctx.cues.length} cue file(s), all resolving; `
            : `NO CUE FILE FOUND under ${path.relative(REPO, FILM).replace(/\\/g, "/")} — the ` +
              `reference-resolution half of this check is ARMED AND UNEXERCISED, which is stated ` +
              `rather than counted as a pass; `) +
          `every register:claim beat carries a truth_class and a receipt; every register:intent beat ` +
          `is marked. A claim without a receipt is an assertion with a citation-shaped hole in it.`)
      : bad("the spine holds together", faults.join(" · "));
  }

  // ---- 10b. EVERY QUOTATION IN THE SPINE STILL HASHES ---------------------------------------------
  //
  // The honest state's own gate_contract fails_if: "any quotation's rendered bytes hash differently
  // from its beat's sha256". Checked here for BOTH kinds the spine carries — a register:quotation
  // beat, and the `quotation_support` block a claim beat hangs its evidence on. The second is the
  // one that would rot quietly: it is not the beat's headline, so nobody would look.
  {
    const faults = [];
    let checked = 0;
    for (const v of voices) {
      const b = v.beat || {};
      if (String(b.register || "").toLowerCase() === "quotation") {
        checked++;
        const q = verifyQuotation(b, ctx.tokens);
        if (!q.ok) faults.push(`${v.id} — ${q.why}`);
      }
      const qs = b.quotation_support;
      for (const s of (Array.isArray(qs) ? qs : qs ? [qs] : [])) {
        checked++;
        const q = verifyQuotation({ ...s, register: "quotation" }, ctx.tokens);
        if (!q.ok) faults.push(`${v.id}.quotation_support — ${q.why}`);
      }
    }
    checked === 0
      ? ok("every quotation in the spine still hashes to the bytes it cites",
          `no quotation beats and no quotation_support blocks in this spine. Stated rather than counted ` +
          `as a pass: this check is armed and unexercised.`)
      : faults.length === 0
        ? ok("every quotation in the spine still hashes to the bytes it cites",
            `${checked} quotation(s) re-read from disk and re-hashed through tokens.cjs's own quote() ` +
            `rule — the cited line range, CRLF-normalised, sha256 of the utf8. AND THE WORDS MUST BE ` +
            `THERE: a hash that matches a range which does not say this is a receipt for the wrong ` +
            `sentence, and would pass a hash check alone.`)
        : bad("every quotation in the spine still hashes to the bytes it cites", faults.join(" · "));
  }

  // ---- 11. NUMBERS ARE GENERATED, AND THE SOURCE IS RE-EXECUTED -----------------------------------
  //
  // QC.md is the argument for this check in one line: it says 143 scenes in one table and sums to 157
  // in the next. Nobody lied; a person typed a number twice. So no numeral of two or more digits is
  // typed into this film's narration at all — it is a @TOKEN, and the gate goes and gets the value.
  {
    const faults = [];
    const operatorOwned = [];
    const verbatimNumerals = [];
    let resolved = 0, fromRegister = 0, fromInline = 0, unsaid = 0;

    for (const v of voices) {
      const b = v.beat || {};
      // A VERBATIM QUOTATION MAY CARRY ITS OWN NUMERALS, and this is not a loophole — it is the
      // strongest source in the file. You cannot tokenise somebody else's sentence and still call it
      // verbatim. The numeral is released only when the cited LINE RANGE hashes to the declared sha
      // through tokens.cjs's own rule AND the quoted words are actually in that range, and every
      // numeral so released is printed. The voice of the same beat gets no such release.
      const qv = String(b.register || "").toLowerCase() === "quotation" ? verifyQuotation(b, ctx.tokens) : null;
      const verbatim = !!(qv && qv.ok && qv.verbatim);
      const declared = Array.isArray(b.numbers) ? b.numbers : [];
      const byToken = new Map();
      for (const n of declared) {
        // `numbers` may be a bare list of token ids — the register already holds everything else.
        const entry = typeof n === "string" ? { token: n } : n;
        const tok = String((entry && (entry.token || entry.id || entry.name)) || "").replace(/^@/, "");
        if (!tok) { faults.push(`${v.id} — a numbers[] entry with no token`); continue; }
        byToken.set(tok, entry);
      }
      const used = new Set();

      for (const { key, text } of v.keyed) {
        const released = verbatim && QUOTE_KEYS.includes(key);
        // A VERBATIM QUOTATION IS SOMEBODY ELSE'S BYTES. `@truth_classes` inside a quoted line of
        // Elixir is a module attribute, not a film token, and demanding the beat "declare" it would
        // force the film to either mangle the quote or lie about what it is.
        if (!released) {
          for (const m of text.matchAll(TOKEN_RE)) {
            used.add(m[1]);
            if (!byToken.has(m[1])) faults.push(`${v.id}.${key} — text uses @${m[1]}, which the beat's numbers[] does not declare`);
          }
        }
        // Strip the tokens first: @n.ledger.rows is a NAME, not a hand-typed number.
        const stripped = released ? text : text.replace(TOKEN_RE, "");
        for (const m of stripped.matchAll(/[0-9][0-9.,]*/g)) {
          const digits = (m[0].match(/[0-9]/g) || []).length;
          if (digits < 2) continue;
          if (released) verbatimNumerals.push(`${v.id}.${key} — ${m[0]} (verbatim, ${qv.receipt})`);
          else faults.push(`${v.id}.${key} — hand-typed numeral ${JSON.stringify(m[0])}: every numeral of two or more digits is a @TOKEN resolved from tokens.cjs, because QC.md typed one twice and got 143 and 157`);
        }
      }

      for (const [tok, n] of byToken) {
        // DECLARED-BUT-UNSAID IS NOT A FAULT HERE, and that is a correction the spine taught this
        // gate. SPINE.json v1 holds NO PROSE at all — "a cut is a PROJECTION of beats" — so a beat's
        // numbers[] is the BUDGET OF FIGURES a cut may render from it, not a list of things this file
        // says. The rule "every numeral spoken is a declared token" belongs to the cut and is applied
        // to cut files below. What belongs here is that every budgeted figure still RESOLVES.
        if (!used.has(tok)) unsaid++;

        // PREFERRED PATH: the estate's own register, re-executed now. Not read from a cache, not
        // trusted from the spine — `expr()` is CALLED and reads the real artifact.
        const reg = ctx.tokens && ctx.tokens.TOKENS && ctx.tokens.TOKENS[tok];
        if (reg) {
          const measured = ctx.register ? ctx.register.get(tok) : { ok: false, why: "no register" };
          if (!measured.ok) { faults.push(`${v.id} @${tok} — tokens.cjs could not measure it: ${measured.why}`); continue; }
          const got = measured.value;
          if (got === null || got === undefined) { faults.push(`${v.id} @${tok} — tokens.cjs measured null; the film may not say a number nobody could read`); continue; }
          if (reg.operator_owned) {
            // tokens.cjs: "It must be re-ruled by the operator BEFORE ANY CUT RENDERS IT." A spine is
            // not a cut — it is the budget of figures a cut may draw from — so declaring the token
            // here is an OBLIGATION RECORDED, not a violation. It becomes a fault the moment a cut
            // file actually says it, and the first version of this check failed the spine for
            // carrying a number it had not yet spoken.
            const rendered = ctx.cues.length > 0 && ctx.cues.some((c) => c.json && JSON.stringify(c.json).includes("@" + tok));
            operatorOwned.push(`${v.id} @${tok}${rendered ? " RENDERED IN A CUT" : " (budgeted, not yet rendered)"}`);
            if (rendered && (!n.operator_ruling || !String(n.operator_ruling).trim())) {
              faults.push(`${v.id} @${tok} — OPERATOR-OWNED TOKEN RENDERED BY A CUT WITHOUT A RULING. ` +
                `tokens.cjs says of it: "It must be re-ruled by the operator before any cut renders it." ` +
                `Add "operator_ruling" to this numbers[] entry, in his words, or take the number out of the cut`);
              continue;
            }
          }
          if ("value" in n) {
            const same = String(got) === String(n.value) ||
              (Number.isFinite(Number(got)) && Number.isFinite(Number(n.value)) && Number(got) === Number(n.value));
            if (!same) { faults.push(`${v.id} @${tok} — MISMATCH: the spine caches ${JSON.stringify(String(n.value))}, tokens.cjs measures ${JSON.stringify(String(got))} right now`); continue; }
          }
          resolved++; fromRegister++;
          continue;
        }

        // FALLBACK: an inline source, from this gate's closed registry. For a number the estate's
        // register does not carry. An unknown kind is refused, never skipped.
        const src = n.source;
        if (!src || !src.kind) {
          faults.push(`${v.id} @${tok} — not in tokens.cjs and no inline source. A number with no source ` +
            `is a hand-typed number with extra steps. Either add it to tokens.cjs (preferred — one ` +
            `register, one place to be wrong) or give it a source of kind ${Object.keys(NUMBER_SOURCES).join("/")}`);
          continue;
        }
        const fn = NUMBER_SOURCES[src.kind];
        if (!fn) { faults.push(`${v.id} @${tok} — UNKNOWN source kind ${JSON.stringify(src.kind)}; declared kinds are ${Object.keys(NUMBER_SOURCES).join(", ")}. An unknown kind is refused, never skipped — a typo must not become a way to go green`); continue; }
        let got;
        try { got = fn(src, n.value); } catch (e) { faults.push(`${v.id} @${tok} — source did not re-execute: ${e.message}`); continue; }
        const same = String(got) === String(n.value) ||
          (Number.isFinite(Number(got)) && Number.isFinite(Number(n.value)) && Number(got) === Number(n.value));
        if (!same) faults.push(`${v.id} @${tok} — MISMATCH: the film says ${JSON.stringify(String(n.value))}, the source now says ${JSON.stringify(String(got))}`);
        else { resolved++; fromInline++; }
      }
    }

    if (verbatimNumerals.length) {
      exceptions.push(`NUMERALS RELEASED AS VERBATIM QUOTATION (${verbatimNumerals.length}): ${verbatimNumerals.join(", ")} — ` +
        `each one is inside a line range whose sha256 was recomputed through tokens.cjs's quote() just now.`);
    }
    if (operatorOwned.length) {
      exceptions.push(`OPERATOR-OWNED TOKEN(S) IN THE FILM: ${operatorOwned.join(", ")} — declared constants, ` +
        `not measurements. tokens.cjs marks them and this gate will not let one render silently.`);
    }

    faults.length === 0
      ? ok("every numeral in the film is generated, and its source was re-executed just now",
          `${resolved} token(s) re-derived — ${fromRegister} by CALLING tokens.cjs's own expr() ` +
          `(${ctx.register ? ctx.register.measured().length : 0} distinct token(s) measured this process) and ` +
          `${fromInline} through this gate's inline source kinds; zero hand-typed numerals of two or ` +
          `more digits anywhere in the voice; ${operatorOwned.length} operator-owned token(s), each ` +
          `carrying a ruling; ${unsaid} budgeted figure(s) declared by a beat and not yet said by ` +
          `anything, which is the normal state of a spine that holds no prose. TRAVELERS' QC sheet ` +
          `says 143 scenes in one table and sums to 157 in the next — one person, one file, two ` +
          `numbers. That is the entire argument for this check.`)
      : bad("every numeral in the film is generated, and its source was re-executed just now", faults.join(" · "));
  }

  // ---- 12. NO UNDECLARED PROSE CHANNEL ------------------------------------------------------------
  //
  // The lint is only worth the completeness of the key registry. Without this check, a beat that put
  // its narration under `speech:` would sail past every rule above and the gate would go green
  // having read nothing — the worst possible failure, because it looks like the best possible one.
  {
    const suspects = [];
    let metaChars = 0;
    for (const v of voices) {
      for (const [k, val] of Object.entries(v.beat || {})) {
        if (TEXT_KEYS.includes(k)) continue;
        if (META_KEYS.includes(k)) { metaChars += stringsUnder(val, []).join("").length; continue; }
        for (const s of stringsUnder(val, [])) {
          if (s.length >= 40 && /\s/.test(s)) suspects.push(`${v.id}.${k} — ${s.slice(0, 60)}…`);
        }
      }
    }
    suspects.length === 0
      ? ok("no prose is hiding in an undeclared field",
          `${TEXT_KEYS.length} declared voice key(s), ${META_KEYS.length} declared production key(s) ` +
          `(${metaChars} characters of production note read and deliberately NOT linted — the viewer ` +
          `never hears them). Any other key holding a sentence is refused: a lint is worth exactly ` +
          `the completeness of its key list, and this is how that stays true.`)
      : bad("no prose is hiding in an undeclared field",
          suspects.join(" · ") + " — declare the key in TEXT_KEYS so it is linted, or in META_KEYS if the viewer never hears it");
  }

  // ---- THE WORDS A VIEWER ACTUALLY HEARS ---------------------------------------------------------
  //
  // THE HOLE THIS CLOSES, FOUND BY INJECTION AND NOT BY READING.
  //
  // Every word rule above walks the SPINE. The spine is a truth ledger and holds NO PROSE — it says
  // so itself. The narration a viewer hears lives in the cue files, and this gate opened those only
  // to resolve beat REFERENCES. So the film's actual spoken words were never linted at all.
  //
  // Measured: the banned word "proves" was injected into a rendered cut's narration and this gate
  // returned PASS, 19/19, 17/17 mutations caught. A perfect score over a film saying a forbidden
  // thing out loud. Same shape as every other instrument defect in this build — the check was
  // correct about the artifact it read, and was reading the wrong artifact.
  //
  // A cue scene need not reference a beat to be linted. That was the loophole: unreferenced prose
  // was invisible prose. Now every declared voice key in every cue file is swept, whatever it points
  // at, because what matters is not where a sentence is filed but whether it will be spoken.
  {
    const spoken = [];
    for (const c of ctx.cues || []) {
      const scenes = Array.isArray(c.json && c.json.scenes) ? c.json.scenes
        : Array.isArray(c.json) ? c.json : [];
      scenes.forEach((s, i) => {
        if (!s || typeof s !== "object") return;
        for (const k of TEXT_KEYS) {
          if (typeof s[k] === "string" && s[k].trim()) spoken.push({ file: path.basename(c.file), id: s.id || `#${i}`, key: k, text: s[k] });
          else if (Array.isArray(s[k])) s[k].forEach((t, j) => { if (typeof t === "string" && t.trim()) spoken.push({ file: path.basename(c.file), id: s.id || `#${i}`, key: `${k}[${j}]`, text: t }); });
        }
      });
    }

    const hits = [];
    for (const u of spoken) {
      for (const b of BANNED) {
        // Drop the global flag (a /g regex carries lastIndex between .test() calls and would skip
        // hits) and ensure exactly one `i` — several fence patterns already declare it.
        const re = new RegExp(b.re.source, b.re.flags.includes("i") ? b.re.flags.replace(/g/g, "") : b.re.flags.replace(/g/g, "") + "i");
        if (re.test(u.text)) hits.push(`${u.file} ${u.id}.${u.key}: "${b.token}" (${b.from})`);
      }
      // A bare numeral in spoken text is the TRAVELERS defect exactly: a figure rendered once and
      // watched for a year, with nothing re-deriving it. Numbers must be token ids.
      const bare = u.text.match(/(?<![\w@.\-:/])\d{2,}(?![\w.\-:/])/g);
      if (bare) hits.push(`${u.file} ${u.id}.${u.key}: hand-typed numeral(s) ${bare.join(", ")} — use a token id`);
    }

    // NO CUE FILES AT ALL is a different thing from CUE FILES WITH NOTHING IN THEM, and conflating
    // them is how the fixture failed its own control. A spine with no cut authored yet has nothing
    // to lint and says so; a cut whose voice keys have been renamed out from under TEXT_KEYS is a
    // real hole wearing the same silence. The first is reported and not counted as a pass; the
    // second is a failure.
    const noCutAuthored = (ctx.cues || []).length === 0;
    hits.length
      ? bad("the words a viewer actually HEARS are linted",
          `${hits.length} in ${spoken.length} spoken string(s):\n      ` + hits.slice(0, 10).join("\n      "))
      : noCutAuthored
        ? ok("the words a viewer actually HEARS are linted",
            "NO cue file exists, so no cut is authored and there is nothing a viewer could hear yet. " +
            "Stated rather than counted: this check is armed and currently unexercised.")
      : spoken.length === 0
        ? bad("the words a viewer actually HEARS are linted",
            `${(ctx.cues || []).length} cue file(s) exist and NOT ONE carries a declared voice key. Either the ` +
            `keys were renamed out from under TEXT_KEYS, or the prose moved somewhere nothing reads — and a ` +
            `lint over nothing is not a pass.`)
        : ok("the words a viewer actually HEARS are linted",
            `${spoken.length} spoken string(s) across ${(ctx.cues || []).length} cue file(s) swept for ` +
            `${BANNED.length} fenced token(s) and for hand-typed numerals. The spine holds no prose; ` +
            `until this check existed, the narration was the one artifact nothing read.`);
  }

  // ---- EVERY @TOKEN THE BUILDER WILL RENDER MUST RESOLVE -----------------------------------------
  //
  // THE GAP THIS CLOSES: this gate checked that tokens are DECLARED where a beat declares them. It
  // never checked that a token written into a CUE — the string the builder actually substitutes —
  // exists in the register. So a cut could pass 20/20 and be unbuildable, and the failure would
  // surface as a render crash rather than as a red gate.
  //
  // That is the same shape as this file's own header defect and the stale-export defect before it: a
  // check correct about the artifact it read, reading the wrong artifact. A lint that cannot tell you
  // the film will not build is not checking the film.
  //
  // It sweeps every key the builder renders, not just the spoken ones — `note`, `source`, `asks` and
  // `why` all reach the screen, and an unknown token in any of them stops the build just as dead.
  {
    const RENDERED_KEYS = ["narration", "asks", "source", "note", "why", "line1", "line2",
                           "kicker", "lines", "runs", "prints_literal"];
    // Segments joined by dots — NOT [\w.]*, which is greedy over the dot and swallows a sentence's
    // full stop into the id. build_cut.cjs made exactly that mistake; all three files now agree.
    const TOKEN = /@([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)/g;
    let known;
    try { known = new Set(Object.keys(require(path.join(FILM, "qc", "tokens.cjs")).TOKENS)); }
    catch (e) { known = null; }

    if (!known) {
      bad("every @token a cue renders resolves in the register",
        "tokens.cjs could not be loaded, so this check cannot run — and a check that cannot run is not a pass");
    } else {
      const faults = [];
      let seen = 0;
      for (const c of ctx.cues || []) {
        const scenes = Array.isArray(c.json && c.json.scenes) ? c.json.scenes
          : Array.isArray(c.json) ? c.json : [];
        scenes.forEach((s, i) => {
          if (!s || typeof s !== "object") return;
          const where = `${path.basename(c.file)} ${s.id || `#${i}`}`;
          for (const k of RENDERED_KEYS) {
            const vals = typeof s[k] === "string" ? [s[k]] : Array.isArray(s[k]) ? s[k].filter((x) => typeof x === "string") : [];
            for (const v of vals) {
              for (const m of v.matchAll(TOKEN)) {
                seen++;
                if (!known.has(m[1])) faults.push(`${where}.${k}: @${m[1]} is not in the register — the build would stop here`);
              }
            }
          }
        });
      }
      faults.length
        ? bad("every @token a cue renders resolves in the register",
            `${faults.length} of ${seen} token use(s):\n      ` + faults.slice(0, 10).join("\n      "))
        : ok("every @token a cue renders resolves in the register",
            `${seen} token use(s) across ${(ctx.cues || []).length} cue file(s), every one present in ` +
            `tokens.cjs. Until this check existed, a cut could lint 20/20 and still be unbuildable.`);
    }
  }

  return { results: R, exceptions };
}

// =================================================================================================
// THE FIXTURE — a small, deliberately clean spine, used ONLY to prove the checks bite.
//
// It is MEASURED at build time (the receipt sha and the byte count are read off disk), which is
// exactly right for its job and exactly wrong for anything else: it proves the instrument, and it
// says nothing whatsoever about the real film. Every mutation below is applied to this, in memory.
// =================================================================================================

function fixture(tokens) {
  const receiptRel = "lab/film/QC.md";
  const receiptAbs = path.join(REPO, receiptRel);
  const bytes = fs.readFileSync(receiptAbs);
  // QC.md:56 is the line that carries the boast this whole gate mechanises. Quoted through the
  // estate's own rule, by calling it — so the fixture exercises the SAME path a real quotation beat
  // takes, line range and all, rather than a simplified one that would prove less.
  const q = tokens ? tokens.quote("minecraft", receiptRel, 55, 55) : null;
  return {
    film: "FIXTURE — not the film",
    beats: [
      { id: "fx.open", register: "intent", intent_marked: true,
        narration: "We intend to show you a laboratory that says out loud what it does not know." },
      { id: "fx.cpu", register: "claim", truth_class: "REDUCED_MODEL", receipt: receiptRel,
        narration: "The vocabulary a claim may declare has @n.truth.classes classes in it, and the sheet that records this film is @QC_BYTES bytes on disk.",
        numbers: [
          { token: "n.truth.classes" },
          { token: "QC_BYTES", value: String(bytes.length), source: { kind: "file-bytes", root: "REPO", file: receiptRel } },
        ],
        honest_state: ["fx.fact.cpu"] },
      { id: "fx.seen", register: "claim", truth_class: "OBSERVED", receipt: receiptRel,
        narration: "We measured the render on this machine and we watched it finish.",
        honest_state: ["fx.fact.measured"] },
      { id: "fx.quote", register: "quotation", root: "minecraft", receipt: receiptRel,
        lines: [55, 55], sha256: q ? q.sha256 : "",
        quote: q ? q.text : "",
        narration: "The earlier film made a boast about a word, and kept it.",
        honest_state: ["fx.fact.quoted"] },
      { id: "fx.species", register: "claim", truth_class: "STRUCTURAL_RECONSTRUCTION", receipt: receiptRel,
        narration: "E. coli gives us behaviour and Salmonella gives us structure; these are different organisms, and no one specimen gave us both.",
        honest_state: ["fx.fact.species"] },
      { id: "fx.units", register: "claim", truth_class: "DERIVED", receipt: receiptRel,
        narration: "Free energy and torque are different quantities in different units, and this film never adds them together.",
        honest_state: ["fx.fact.units"] },
      { id: "fx.anchor", register: "claim", truth_class: "UNKNOWN", receipt: receiptRel,
        narration: "The anchor is tamper-evident, and it is not unforgeable.",
        honest_state: ["fx.fact.anchor"] },
    ],
  };
}

const FIXTURE_HONEST = {
  facts: [
    { id: "fx.fact.cpu" }, { id: "fx.fact.measured" }, { id: "fx.fact.quoted" },
    { id: "fx.fact.species" }, { id: "fx.fact.units" }, { id: "fx.fact.anchor" },
  ],
};

const clone = (o) => JSON.parse(JSON.stringify(o));
const firstTextKey = (b) => TEXT_KEYS.find((k) => typeof b[k] === "string" && b[k].trim());
const regOf = (b) => String((b && b.register) || "").toLowerCase();
const tokenOf = (n) => String((n && (n.token || n.name)) || "").replace(/^@/, "");

// THE MUTATION SUITE. Each entry PICKS ITS OWN TARGET out of whatever spine it is handed, breaks ONE
// thing, and names the check that must catch it.
//
// The picking is not a detail — it is a correction. The first version of this suite named fixture
// beat ids (`fx.cpu`, `fx.open`) directly. It caught all ten on the fixture and then, run against a
// real spine with `--prove`, reported ALL TEN AS "NOT APPLICABLE" and printed a clean sweep: every
// `apply` threw on an undefined beat and was quietly filed as not-applicable. A sweep that skips
// everything and reports success is worse than no sweep, because it produces a receipt. So a
// mutation now names the SHAPE it needs; if a spine has no beat of that shape the sweep says NO
// TARGET, loudly, and the headline counts it against itself.
const MUTATIONS = [
  { id: "M1", what: `insert "proven" into a beat that is not a receipted quotation`,
    needs: "any beat with voice that is not a quotation",
    pick: (bs) => bs.find((b) => firstTextKey(b) && regOf(b) !== "quotation"),
    apply: (s, b) => { b[firstTextKey(b)] += " This is proven."; },
    expect: /overclaiming word/ },
  { id: "M2", what: `put "we observed" on a beat that is not ${OBSERVED_ROLE}`,
    needs: `any beat with voice whose truth_class is not ${OBSERVED_ROLE}`,
    pick: (bs) => bs.find((b) => firstTextKey(b) && String(b.truth_class || "") !== OBSERVED_ROLE),
    apply: (s, b) => { b[firstTextKey(b)] += " We observed it directly."; },
    expect: /belongs to/ },
  { id: "M3", what: "delete the beat that carries an honest-state fact",
    needs: "any beat covering at least one honest-state fact",
    pick: (bs) => bs.find((b) => coveredFactsOf(b).length > 0),
    apply: (s, b) => { const bs = beatsOf(s); bs.splice(bs.indexOf(b), 1); },
    expect: /honest-state fact/ },
  { id: "M4", what: "rename a beat's truth class to PROVEN",
    needs: "any classified beat",
    pick: (bs) => bs.find((b) => b.truth_class),
    apply: (s, b) => { b.truth_class = "PROVEN"; },
    expect: /truth_class in the spine/ },
  { id: "M5", what: "hardcode a number instead of a @TOKEN",
    needs: "any beat whose text uses a @TOKEN it declares",
    pick: (bs) => bs.find((b) => Array.isArray(b.numbers) && b.numbers.some((n) => TEXT_KEYS.some((k) => typeof b[k] === "string" && b[k].includes("@" + tokenOf(n))))),
    apply: (s, b) => {
      const n = b.numbers.find((x) => TEXT_KEYS.some((k) => typeof b[k] === "string" && b[k].includes("@" + tokenOf(x))));
      // A LITERAL, not `n.value` — which is optional in this spine's shape, and when it was absent
      // this mutation substituted the string "undefined", contained no digits, and was reported as
      // MISSED by a check that was working perfectly. The mutation was broken, not the rule.
      for (const k of TEXT_KEYS) if (typeof b[k] === "string") b[k] = b[k].split("@" + tokenOf(n)).join("12345");
    },
    expect: /numeral in the film is generated/ },
  { id: "M6", what: "add a forbidden noun to the narration",
    needs: "any beat with voice",
    pick: (bs) => bs.find((b) => firstTextKey(b)),
    apply: (s, b) => { b[firstTextKey(b)] += " The studio speaks obs-websocket on the loopback."; },
    expect: /studio's plumbing/ },
  { id: "M7", what: "corrupt a quotation's receipt sha, so the override must be REFUSED",
    needs: "a register:quotation beat",
    pick: (bs) => bs.find((b) => regOf(b) === "quotation"),
    apply: (s, b) => { b.sha256 = "0".repeat(64); b.sha = "0".repeat(64); },
    // Either the override is refused and the quoted word convicted, OR the hash check bites first.
    // Both are the gate working; the first version demanded the former and reported MISSED when the
    // latter fired on a quotation whose text happens to carry no banned word.
    expect: /overclaiming word|numeral in the film is generated|quotation in the spine still hashes/ },
  { id: "M8", what: "change a generated number's value away from its source",
    needs: "any beat declaring a number",
    pick: (bs) => bs.find((b) => Array.isArray(b.numbers) && b.numbers.length),
    // `numbers` entries may be bare token-id STRINGS — SPINE.json v1 writes them that way, because
    // the register already holds everything else. Assigning `.value` to a string silently did
    // nothing under a non-strict read and threw here, and the suite filed it as NO TARGET on a spine
    // that had fifty of them.
    apply: (s, b) => { b.numbers[0] = { token: tokenOf(typeof b.numbers[0] === "string" ? { token: b.numbers[0] } : b.numbers[0]), value: "12345" }; },
    expect: /numeral in the film is generated/ },
  { id: "M9", what: "hide narration under an undeclared key",
    needs: "any beat at all",
    pick: (bs) => bs[0],
    apply: (s, b) => { b.speech = "A sentence the lint would never see, hidden under a key nobody declared."; },
    expect: /undeclared field/ },
  { id: "M11", what: `say "proven" in the VOICE of a beat whose CARD is a receipted quotation`,
    needs: "a register:quotation beat",
    pick: (bs) => bs.find((b) => regOf(b) === "quotation"),
    apply: (s, b) => { b.narration = (b.narration || "") + " And that is proven."; },
    expect: /overclaiming word/ },
  { id: "M10", what: "strip the receipt off a register:claim beat",
    needs: "a register:claim beat",
    pick: (bs) => bs.find((b) => regOf(b) === "claim"),
    apply: (s, b) => { b.receipt = ""; b.receipt_ref = ""; },
    expect: /spine holds together/ },
];

// Run one mutation against one spine, in memory. Returns a verdict that distinguishes CAUGHT from
// MISSED from NO TARGET — three outcomes, because collapsing the third into either of the others is
// exactly how the first version of this suite lied.
function sweepOne(m, spine, base) {
  const s = clone(spine);
  const bs = beatsOf(s) || [];
  let target;
  try { target = m.pick(bs); } catch { target = null; }
  if (!target) return { id: m.id, state: "no-target", note: `${m.what} → NO TARGET (needs ${m.needs})` };
  const id = idOf(target, bs.indexOf(target));
  try { m.apply(s, target); } catch (e) { return { id: m.id, state: "no-target", note: `${m.what} → could not be applied to ${id}: ${e.message}` }; }
  const out = runChecks({ ...base, spine: s });
  const caught = out.results.filter((r) => !r.pass).map((r) => r.name);
  return {
    id: m.id,
    state: caught.some((n) => m.expect.test(n)) ? "caught" : "missed",
    note: `${m.what} [on ${id}] → ${caught.length ? caught.join("; ") : "NOTHING CAUGHT IT"}`,
  };
}

// UPSTREAM mutations act on the scene.ex SOURCE TEXT, not the spine. This is design rule B under
// test: a seventh class must turn the gate red rather than passing silently.
const SOURCE_MUTATIONS = [
  { id: "U1", what: "a SEVENTH truth class is added upstream",
    apply: (src) => src.replace(/(@truth_classes\s*\[)/, "$1:PROVEN, "),
    expect: /vocabulary is the one this film was graded against/ },
  { id: "U2", what: `${OBSERVED_ROLE} is renamed upstream`,
    apply: (src) => src.replace(/@truth_classes\s*\[[^\]]*\]/, (m) => m.replace(":OBSERVED", ":WITNESSED")),
    expect: /vocabulary is the one this film was graded against|licenses/ },
  { id: "U3", what: "the @truth_classes attribute disappears entirely",
    apply: (src) => src.replace(/@truth_classes\s*\[[^\]]*\]/, "# removed"),
    expect: /EXTRACTED from the source/ },
];

// FENCE mutations act on production/schemas/claim_fence.json. They prove the fence is LIVE — that a
// token added to the estate's vocabulary binds this film in the same run, with nothing re-typed here.
// They run on the fixture only: F1 needs a word the corpus actually contains, and the fixture is the
// only corpus this gate can know the contents of.
const FENCE_MUTATIONS = [
  { id: "F1", what: `a token added to the estate's fence binds the film in the same run`,
    apply: (src) => { const d = JSON.parse(src); d.classes.probe_family = ["anchor"]; return JSON.stringify(d); },
    expect: /overclaiming word/ },
  { id: "F2", what: "the fence becomes unreadable",
    apply: () => "{ not json",
    expect: /claim fence was extracted/ },
];

// =================================================================================================
// LOAD, RUN, REPORT
// =================================================================================================

if (LIST) {
  const f = buildFence((() => { try { return fs.readFileSync(CLAIM_FENCE, "utf8"); } catch { return ""; } })());
  console.log("BANNED, from this gate's brief (overridable only by a receipted quotation):", SPEC_BANNED.map((b) => b.token).join(", "));
  console.log("BANNED, EXTRACTED from production/schemas/claim_fence.json at runtime:",
    f.ok ? `v${f.version}, ${f.patterns.length} pattern(s) — ${f.patterns.map((p) => p.token).join(", ")}` : `UNREADABLE (${f.why})`);
  const loc = extractProhibitedLocators((() => { try { return fs.readFileSync(path.join(REPO, "viewer", "golive_guard.cjs"), "utf8"); } catch { return ""; } })());
  console.log("FORBIDDEN SHAPES (no override, ever):", FORBIDDEN_SHAPES.map((b) => b.token).join(", "));
  console.log("FORBIDDEN LOCATORS: %s — extracted at gate time from the f31.obs-unauthenticated block, NEVER printed.",
    loc.ok ? `${loc.tokens.length} value(s) in hand` : `NOT EXTRACTABLE (${loc.why})`);
  console.log("OBSERVED-ONLY TOKENS:", OBSERVED_TOKENS.map((b) => b.token).join(", "));
  console.log("DECLARED VOICE KEYS:", TEXT_KEYS.join(", "));
  console.log("DECLARED PRODUCTION KEYS (read, never linted):", META_KEYS.join(", "));
  console.log("NUMBER SOURCE KINDS:", Object.keys(NUMBER_SOURCES).join(", "));
  console.log("REGISTERS WITH LAW:", Object.entries(REGISTERS_WITH_LAW).map(([k, v]) => `${k} → ${v}`).join(" · "));
  console.log("TRUTH CLASSES: extracted at runtime from", path.relative(REPO, SCENE_EX).replace(/\\/g, "/"), "— never listed here");
  process.exit(0);
}

let vocabSource = "";
try { vocabSource = fs.readFileSync(SCENE_EX, "utf8"); } catch { vocabSource = ""; }

let guardSource = "";
try { guardSource = fs.readFileSync(path.join(REPO, "viewer", "golive_guard.cjs"), "utf8"); } catch { guardSource = ""; }

let fenceSource = "";
try { fenceSource = fs.readFileSync(CLAIM_FENCE, "utf8"); } catch { fenceSource = ""; }

// The film's number register, REQUIRED rather than reimplemented. If it is not there yet the gate
// says so and every number becomes unresolvable — which is the correct red, not a reason to invent
// a second register here.
let tokens = null, tokensError = null;
try { tokens = require(path.join(HERE, "tokens.cjs")); }
catch (e) { tokensError = e.message; }

// LAZY AND MEMOISED, and that is TWO corrections in one.
//
// The first version called `expr()` inside the checks, so every mutation in the sweep re-walked the
// cookbook corpus, the viewer tree and the gate ledger — 49 expressions times seventeen check runs,
// and the gate stopped finishing. Measuring all 49 once fixed that and still cost 12.5 s of a 15 s
// budget, nearly all of it on tokens this film does not say.
//
// So: a token is measured the FIRST time the film asks for it, and never again in this process. The
// whole register is not this gate's business — `node lab/film/welcome/qc/tokens.cjs` measures all of
// it and exits non-zero if any expression fails, which is that file's own gate. One register, one
// place to be wrong, and this gate does not build a second opinion about it.
function makeRegister(t) {
  if (!t || !t.TOKENS) return null;
  const values = {}, why = {}, order = [];
  return {
    ids: Object.keys(t.TOKENS),
    at: new Date().toISOString(),
    measured: () => order.slice(),
    errors: () => Object.entries(why).map(([k, v]) => `${k} threw: ${v}`),
    get(id) {
      if (id in values) return { ok: true, value: values[id] };
      if (id in why) return { ok: false, why: why[id] };
      try { values[id] = t.TOKENS[id].expr(); order.push(id); return { ok: true, value: values[id] }; }
      catch (e) { why[id] = e.message; order.push(id); return { ok: false, why: e.message }; }
    },
  };
}
const register = makeRegister(tokens);

let spine = null, spinePath = null, spineError = null;
for (const cand of SPINE_CANDIDATES) {
  if (!fs.existsSync(cand)) continue;
  spinePath = cand;
  try { spine = JSON.parse(fs.readFileSync(cand, "utf8")); } catch (e) { spineError = e.message; }
  break;
}

let honest = null;
try { honest = JSON.parse(fs.readFileSync(HONEST_STATE, "utf8")); } catch { honest = null; }

const cues = findCueFiles(spine).map((c) => {
  try { return { ...c, json: JSON.parse(fs.readFileSync(c.file, "utf8")) }; }
  catch (e) { return { ...c, json: null, error: e.message }; }
});

const ctx = {
  vocabSource,
  fenceSource,
  tokens,
  tokensError,
  register,
  guardSource,
  spine,
  spinePath: spinePath ? path.relative(REPO, spinePath).replace(/\\/g, "/") : null,
  honest,
  honestPath: path.relative(REPO, HONEST_STATE).replace(/\\/g, "/"),
  cues,
  searched: SPINE_CANDIDATES.map((p) => path.relative(REPO, p).replace(/\\/g, "/") + (fs.existsSync(p) ? " (FOUND)" : " (absent)")),
};

// --fixture prints the built-in clean spine and the checks it passes. It is the answer to "what
// does a beat that satisfies this gate actually look like", which a list of rules does not answer.
if (process.argv.includes("--fixture")) {
  const fx = fixture(tokens);
  console.log(JSON.stringify(fx, null, 2));
  const out = runChecks({ vocabSource, fenceSource, guardSource, tokens, tokensError, register, spine: fx, spinePath: "(fixture)", honest: FIXTURE_HONEST, honestPath: "(fixture)", cues: [], searched: [] });
  console.log("");
  for (const r of out.results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
  for (const e of out.exceptions) console.log("  exception: " + e);
  process.exit(out.results.every((r) => r.pass) ? 0 : 1);
}

const run = runChecks(ctx);
const results = run.results;

if (spineError) {
  results.unshift({ pass: false, name: "the spine parses as JSON", detail: `${ctx.spinePath} — ${spineError}` });
}

// ---- the header a human reads first ---------------------------------------------------------------
console.log("");
console.log("WELCOME TO UNI LABS — QC");
console.log("  spine          %s", spinePath ? ctx.spinePath : "NOT FOUND");
console.log("  honest state   %s", honest ? ctx.honestPath : ctx.honestPath + "  (absent)");
console.log("  cue files      %s", cues.length ? cues.map((c) => path.basename(c.file)).join(", ") : "none found");
console.log("  vocabulary     %s%s", path.relative(REPO, SCENE_EX).replace(/\\/g, "/"), vocabSource ? "" : "  (UNREADABLE)");
console.log("  claim fence    %s%s", path.relative(REPO, CLAIM_FENCE).replace(/\\/g, "/"), fenceSource ? "" : "  (UNREADABLE)");
console.log("");

for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);

// ---- every exception granted, printed --------------------------------------------------------------
console.log("");
if (run.exceptions.length) {
  console.log("EXCEPTIONS GRANTED (%d) — a quotation may say what the film may not:", run.exceptions.length);
  for (const e of run.exceptions) console.log("  · " + e);
} else {
  console.log("EXCEPTIONS GRANTED: none. (An override needs register:quotation, a receipt on disk, and a");
  console.log("  matching byte sha. Every one that is granted is printed here, never counted.)");
}

// ---- the in-band proof: these checks bite, on a fixture, on every single run -------------------------
//
// NOT behind --prove, and that is a correction this project already paid for once:
// viewer/hud/verify_sight_blind.cjs:251 records the same move, for the same reason. The gate runner
// invokes gates with no flags, so a mutation suite that only runs under a flag never runs in CI, and
// a gate nobody has watched fail is decoration.
const proofs = [];
{
  const fx = fixture(tokens);
  var FIXTURE_BASE = { vocabSource, fenceSource, guardSource, tokens, tokensError, register, spinePath: "(fixture)", honest: FIXTURE_HONEST, honestPath: "(fixture)", cues: [], searched: [] };
  const control = runChecks({ ...FIXTURE_BASE, spine: fx });
  const controlClean = control.results.every((r) => r.pass);

  if (!controlClean) {
    proofs.push({ id: "CONTROL", pass: false, note: "THE FIXTURE ITSELF FAILS — the sweep below proves nothing. " + control.results.filter((r) => !r.pass).map((r) => r.name).join("; ") });
  } else {
    proofs.push({ id: "CONTROL", pass: true, note: `the unmutated fixture passes all ${control.results.length} checks — a sweep whose control is red proves nothing at all` });
    for (const m of MUTATIONS) {
      // The fixture is BUILT to carry a beat of every shape, so NO TARGET here is a fault in the
      // fixture, not an excuse — it counts as a failure.
      const v = sweepOne(m, fx, FIXTURE_BASE);
      proofs.push({ id: v.id, pass: v.state === "caught", note: v.note });
    }
    for (const m of SOURCE_MUTATIONS) {
      const out = runChecks({ vocabSource: m.apply(vocabSource), fenceSource, guardSource, tokens, tokensError, register, spine: clone(fx), spinePath: "(fixture)", honest: FIXTURE_HONEST, honestPath: "(fixture)", cues: [], searched: [] });
      const caughtBy = out.results.filter((r) => !r.pass).map((r) => r.name);
      proofs.push({ id: m.id, pass: caughtBy.some((n) => m.expect.test(n)), note: `${m.what} → ${caughtBy.length ? caughtBy.join("; ") : "NOTHING CAUGHT IT"}` });
    }
    for (const m of FENCE_MUTATIONS) {
      const out = runChecks({ vocabSource, fenceSource: m.apply(fenceSource), guardSource, tokens, tokensError, register, spine: clone(fx), spinePath: "(fixture)", honest: FIXTURE_HONEST, honestPath: "(fixture)", cues: [], searched: [] });
      const caughtBy = out.results.filter((r) => !r.pass).map((r) => r.name);
      proofs.push({ id: m.id, pass: caughtBy.some((n) => m.expect.test(n)), note: `${m.what} → ${caughtBy.length ? caughtBy.join("; ") : "NOTHING CAUGHT IT"}` });
    }
  }
}

const proofFailed = proofs.filter((p) => !p.pass);
console.log("");
console.log("MUTATION SWEEP (in-band, on the fixture, every run) — %d/%d", proofs.length - proofFailed.length, proofs.length);
for (const p of proofs) console.log(`  ${p.pass ? "caught" : "MISSED"}  ${p.id}  ${p.note}`);

// ---- --prove: the same sweep, against the REAL spine ------------------------------------------------
let proveFailed = 0;
if (PROVE) {
  console.log("");
  console.log("--prove: THE SAME SWEEP AGAINST THE REAL SPINE");
  const controlClean = results.every((r) => r.pass);
  if (!spine) {
    console.log("  CONTROL: no spine on disk. The sweep is NOT RUN. Mutating a film that is not there");
    console.log("  would produce ten confident reds that mean nothing — a mutation suite with no control");
    console.log("  is a machine for manufacturing confidence.");
    proveFailed = 1;
  } else if (!controlClean) {
    console.log("  CONTROL: THE REAL SPINE ALREADY FAILS %d check(s), so the sweep proves NOTHING —", results.filter((r) => !r.pass).length);
    console.log("  every mutation would be 'caught' by the failure that was already there. Fix the film,");
    console.log("  then prove the gate. Failing checks: %s", results.filter((r) => !r.pass).map((r) => r.name).join("; "));
    proveFailed = 1;
  } else {
    console.log("  CONTROL: the real spine passes all %d checks. Now break it, one thing at a time.", results.length);
    const verdicts = MUTATIONS.map((m) => sweepOne(m, spine, ctx));
    for (const v of verdicts) {
      console.log(`  ${v.state === "caught" ? "caught" : v.state === "missed" ? "MISSED" : "NO TARGET"}  ${v.id}  ${v.note}`);
      if (v.state === "missed") proveFailed++;
    }
    const noTarget = verdicts.filter((v) => v.state === "no-target");
    if (noTarget.length) {
      // NOT counted as caught, and said in as many words, because the first version of this file
      // filed all ten here and printed a clean sweep over a spine it had not touched.
      console.log("  %d mutation(s) found NO BEAT OF THE SHAPE THEY BREAK in this spine: %s.",
        noTarget.length, noTarget.map((v) => v.id).join(", "));
      console.log("  They are NOT counted as caught. A film with no quotation beat has not proved the");
      console.log("  quotation override bites; it has proved it was never exercised.");
      if (noTarget.length * 2 >= MUTATIONS.length) {
        console.log("  MORE THAN HALF THE SUITE HAD NO TARGET. This sweep is weak evidence about this film.");
        proveFailed++;
      }
    }
    for (const m of SOURCE_MUTATIONS) {
      const out = runChecks({ ...ctx, vocabSource: m.apply(vocabSource) });
      const caught = out.results.filter((r) => !r.pass).map((r) => r.name);
      const good = caught.some((n) => m.expect.test(n));
      if (!good) proveFailed++;
      console.log(`  ${good ? "caught" : "MISSED"}  ${m.id}  ${m.what} → ${caught.length ? caught.join("; ") : "NOTHING CAUGHT IT"}`);
    }
  }
}

// ---- WHAT THIS GATE CANNOT DO. PRINTED EVERY RUN, PASS OR FAIL. ---------------------------------------
console.log("");
console.log("WHAT THIS GATE CANNOT DO — printed every run, so nobody reads its green as more than it is:");
console.log("  · It checks WORDS AND RECEIPTS. It has no way to tell whether the film is honest IN SPIRIT.");
console.log("    A beat can pass every lint here and still leave a viewer believing something untrue, and");
console.log("    the surest way to do that is with a true sentence in the wrong place.");
console.log("  · It cannot tell whether a viewer will UNDERSTAND the film. Comprehension is not a string.");
console.log("  · It cannot tell whether a truth_class is the RIGHT one — only that it is one the source");
console.log("    declares. A SIMULATED beat labelled REDUCED_MODEL passes here and is a lie.");
console.log("  · It never watches the render. Duration, loudness, pixel format, whether the captions are");
console.log("    legible or the Devanagari conjuncts shaped — none of that is in this file.");
console.log("  · A caption in a language this gate cannot read is a hole. TRAVELERS' Marathi captions were");
console.log("    machine-authored and QC.md calls a native-speaker review the largest editorial risk; that");
console.log("    is still true, and no regex closes it.");
console.log("  · It measures only the tokens THE FILM SAYS, lazily. A broken expression in tokens.cjs that");
console.log("    no beat uses will not turn this gate red — run `node lab/film/welcome/qc/tokens.cjs`,");
console.log("    which measures the whole register and is that file's own gate.");
console.log("  · It cannot check whether the honest_state list is COMPLETE. It checks that every fact on");
console.log("    the list is said, not that the list names everything the film should admit. The list is a");
console.log("    human's judgement and this gate inherits it whole.");
console.log("  · IT CHECKS THE SPINE, NOT A CUT, and the difference is the whole of the film. SPINE.json is");
console.log("    a truth ledger holding NO PROSE: 'a cut is a PROJECTION of beats'. The narration and");
console.log("    captions a viewer actually hears do not exist yet. Every word rule above is therefore");
console.log("    armed over beat text where there is any, and PENDING everywhere else.");
console.log("  · IT DOES NOT DISCHARGE `film-welcome-honest-state`. That gate — specified in");
console.log("    qc/honest_state.json → gate_contract — runs against every RENDERED CUT, and that file");
console.log("    says of it: 'this gate is PENDING and must be recorded as PENDING — registered but not");
console.log("    run — and never as PASS.' A PASS here does not move it. It is still PENDING.");
console.log("  · `invitation` beats are NOT exercised. Their contract is that the URL or command shown");
console.log("    must work at render time; nothing here opens a socket or runs one.");
console.log("  · These are the operator's, and no gate stands in for them.");

// ---- verdict -------------------------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
const ms = Date.now() - t0;
// `proofFailed` is a LIST and `proveFailed` is a COUNT, and the first version of this line compared
// the list to 0. An array is never === 0, so the gate could not report PASS under any circumstances
// — 16/16 checks, 16/16 mutations caught, GATE: FAIL. It was found by running the thing rather than
// by reading it, which is the whole argument for the sweep above.
const pass = failed.length === 0 && proofFailed.length === 0 && proveFailed === 0 && ms <= BUDGET_MS;

console.log("");
console.log(`  elapsed ${ms} ms (budget ${BUDGET_MS})`);
console.log(
  `GATE: ${pass ? "PASS" : "FAIL"} - welcome-film-qc, ${results.length - failed.length}/${results.length} checks, ` +
  `${proofs.length - proofFailed.length}/${proofs.length} mutations caught${PROVE ? `, --prove ${proveFailed === 0 ? "clean" : `${proveFailed} MISSED`}` : ""}`
);
if (!spine) {
  console.log("  THE SPINE IS NOT ON DISK. This is a clean refusal, not a broken gate: it looked in");
  console.log("  " + SPINE_CANDIDATES.map((p) => path.relative(REPO, p).replace(/\\/g, "/")).join(" and "));
  console.log("  and found no film to check. The mutation sweep above still ran, on the fixture, so the");
  console.log("  instrument is proved even though the film is absent.");
}
if (!PROVE) console.log("  Prove it against the real film:  node lab/film/welcome/qc/verify_welcome_film.cjs --prove");
process.exit(pass ? 0 : 1);
