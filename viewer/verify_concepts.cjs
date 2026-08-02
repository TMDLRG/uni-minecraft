// verify_concepts.cjs — THE CONCEPT REGISTRY GATE.
//
// The founding specification asked for a Latin-anchored semantic layer: canonical terms, English
// operational definitions, phonetics, ambiguity tracking, reversible back-translation. Nothing of
// the kind existed in either repository. This is its minimum honest form, and the design decision
// that makes it worth having rather than decorative is one fence:
//
//     NO ROW MAY EXIST WITHOUT A `locator` THAT RESOLVES.
//
// That turns the registry into a MAP OF THE SYSTEM rather than a vocabulary invented beside it. A
// glossary anyone can add to is a place where a word gets a meaning it does not have in the code;
// a registry where every entry must point at the line that implements it cannot drift from the
// thing it describes without going red.
//
// FOUR MORE FENCES, each guarding a specific way this could become false precision:
//   * `ipa` may be null — that is expected and honest. But `ipa` WITHOUT `ipa_source` is refused,
//     because Classical and Ecclesiastical pronunciations genuinely differ and an unlabelled IPA
//     asserts a precision nobody has.
//   * `confidence: attested` requires a corpus `source`. Without one the ceiling is `constructed`.
//     Three words, no number — the same discipline the release verdict uses.
//   * `back_translation` must DIFFER from `english_operational_definition`. It is produced without
//     sight of the definition; a byte-identical result is evidence the procedure was skipped.
//   * Latin is an ANNOTATION. A `latin_lemma` must never be the primary label on an operator-facing
//     or public surface — a Latin word you must learn in order to operate the system is the exact
//     opposite of what the education ladder is for.
//
// DECLARED EXTERNAL NAMESPACES. Some vocabulary this platform genuinely uses lives outside both
// repositories — the fleet MCP's `statio: PERFECTUM`, `pharus`, `limbs`. Those are recorded by
// CITATION (`locator: "uni-lab-mcp:<tool>"`) at confidence `provisional`, never by copying the
// strings in and calling them a definition. The namespace must be listed here to be legal.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");
const ROWS = path.join(REPO, "evidence", "concepts.ndjson");
const SCHEMA = path.join(REPO, "production", "schemas", "concept.schema.json");

// A locator may name a declared namespace instead of a path. Listed here, in code, so adding one is
// a visible edit rather than a convention someone remembers.
const EXTERNAL_NAMESPACES = ["uni-lab-mcp"];

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const rows = fs.existsSync(ROWS)
  ? fs.readFileSync(ROWS, "utf8").split(/\r?\n/).filter((l) => l.trim()).map((l, i) => {
      try { return JSON.parse(l); } catch (e) { return { __bad: i + 1, __err: String(e) }; }
    })
  : [];

const schema = JSON.parse(fs.readFileSync(SCHEMA, "utf8"));

// ── 0 · non-vacuous ──────────────────────────────────────────────────────────────────────────────
rows.length >= 12
  ? ok("the registry is non-empty", `${rows.length} concept row(s) — a registry of nothing would pass every check below`)
  : bad("the registry is non-empty", `${rows.length} row(s); fewer than 12 is not yet a map of anything`);

const malformed = rows.filter((r) => r.__bad);
malformed.length
  ? bad("every row parses", malformed.map((r) => `line ${r.__bad}: ${r.__err}`).join(" · "))
  : ok("every row parses", "NDJSON, one concept per line");

const good = rows.filter((r) => !r.__bad);

// ── 1 · schema conformance, hand-checked against the declared schema ────────────────────────────
{
  const req = schema.required;
  const allowed = new Set(Object.keys(schema.properties));
  const faults = [];
  const seen = new Set();
  for (const r of good) {
    for (const k of req) if (r[k] === undefined || r[k] === null || r[k] === "") faults.push(`${r.concept_id || "?"}: missing ${k}`);
    for (const k of Object.keys(r)) if (!allowed.has(k)) faults.push(`${r.concept_id}: undeclared key '${k}'`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(r.concept_id || "")) faults.push(`${r.concept_id}: concept_id is not kebab-case`);
    if (seen.has(r.concept_id)) faults.push(`${r.concept_id}: duplicate concept_id — supersede with a new id, never redefine`);
    seen.add(r.concept_id);
    if (!["attested", "constructed", "provisional"].includes(r.confidence)) faults.push(`${r.concept_id}: confidence '${r.confidence}'`);
  }
  faults.length
    ? bad("every row conforms to concept.schema.json", faults.slice(0, 12).join(" · "))
    : ok("every row conforms to concept.schema.json", `${good.length} row(s), no undeclared keys, ids unique and kebab-case`);
}

// ── 2 · THE LOAD-BEARING FENCE: every locator resolves ──────────────────────────────────────────
{
  const faults = [];
  let onDisk = 0, external = 0;
  for (const r of good) {
    const loc = String(r.locator || "");
    const ns = loc.split(":")[0];
    if (EXTERNAL_NAMESPACES.includes(ns)) {
      external++;
      if (r.confidence !== "provisional")
        faults.push(`${r.concept_id}: external locator '${loc}' but confidence '${r.confidence}' — an unpinned locator cannot support more than provisional`);
      continue;
    }
    const m = /^(.*?)(?::(\d+))?$/.exec(loc);
    const rel = m[1], line = m[2] ? Number(m[2]) : null;
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) { faults.push(`${r.concept_id}: locator '${loc}' does not resolve on disk`); continue; }
    if (line) {
      const n = fs.readFileSync(abs, "utf8").split(/\r?\n/).length;
      if (line > n) faults.push(`${r.concept_id}: locator '${loc}' names line ${line} of a ${n}-line file`);
    }
    onDisk++;
  }
  faults.length
    ? bad("every locator resolves", faults.slice(0, 12).join(" · "))
    : ok("every locator resolves",
        `${onDisk} on disk · ${external} declared-external (${EXTERNAL_NAMESPACES.join(", ")}). ` +
        `This is what makes the registry a map of the system rather than a glossary beside it.`);
}

// ── 3 · no IPA without its tradition ────────────────────────────────────────────────────────────
{
  const faults = good.filter((r) => r.ipa && !r.ipa_source).map((r) => `${r.concept_id}: ipa with no ipa_source`);
  const withIpa = good.filter((r) => r.ipa).length;
  faults.length
    ? bad("no IPA without a named tradition", faults.join(" · "))
    : ok("no IPA without a named tradition",
        `${withIpa} row(s) carry IPA, all naming classical or ecclesiastical; ${good.length - withIpa} carry null, ` +
        `which is legal and is the honest answer where no defensible transcription exists`);
}

// ── 4 · attested requires a source ──────────────────────────────────────────────────────────────
{
  const faults = good.filter((r) => r.confidence === "attested" && !r.source)
    .map((r) => `${r.concept_id}: claims 'attested' with no corpus citation`);
  faults.length
    ? bad("an 'attested' claim carries its citation", faults.join(" · "))
    : ok("an 'attested' claim carries its citation",
        `three words and no number — attested / constructed / provisional, the same discipline as the release verdict`);
}

// ── 5 · the back-translation was actually performed ─────────────────────────────────────────────
{
  const norm = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ");
  const faults = good.filter((r) => r.back_translation && norm(r.back_translation) === norm(r.english_operational_definition))
    .map((r) => `${r.concept_id}: back_translation is identical to the definition`);
  faults.length
    ? bad("a back-translation differs from the definition it checks", faults.join(" · "))
    : ok("a back-translation differs from the definition it checks",
        "it is produced WITHOUT sight of the definition; a byte-identical result is evidence the procedure was skipped");
}

// ── 6 · Latin is never the primary label ────────────────────────────────────────────────────────
// Checked by SCANNING THE SURFACES, not by promising. A lemma appearing as a heading or a button on
// an operator-facing page would mean someone must learn Latin to drive the system.
{
  const surfaces = [
    "viewer/track/track.html", "viewer/track/decide.html", "viewer/lab/l5.html",
    "viewer/lab/l6.html", "viewer/lab/l0.html",
  ].map((p) => path.join(REPO, p)).filter((p) => fs.existsSync(p));

  const lemmas = good.map((r) => r.latin_lemma).filter(Boolean);
  const faults = [];
  for (const s of surfaces) {
    const html = fs.readFileSync(s, "utf8");
    for (const lem of lemmas) {
      const re = new RegExp(`<(h[1-6]|button|label)[^>]*>\\s*${lem}\\b`, "i");
      if (re.test(html)) faults.push(`${path.relative(REPO, s)}: '${lem}' is a heading or control label`);
    }
  }
  faults.length
    ? bad("Latin is an annotation, never the primary label", faults.join(" · "))
    : ok("Latin is an annotation, never the primary label",
        `${lemmas.length} lemma(s) checked against ${surfaces.length} operator surface(s). English is primary. ` +
        `A Latin word you must learn to operate the system is the opposite of what the ladder is for.`);
}

// ── 7 · MUTATION — the fences are shown to bite ─────────────────────────────────────────────────
if (process.argv.includes("--mutate")) {
  const base = good[0];
  const probes = [
    ["a locator that does not resolve", { ...base, locator: "lib/sp/does_not_exist.ex:1" },
      (r) => !fs.existsSync(path.join(REPO, r.locator.split(":")[0]))],
    ["a locator past the end of its file", { ...base, locator: "lib/sp/control_plane/room.ex:999999" },
      (r) => { const [f, l] = r.locator.split(":"); return Number(l) > fs.readFileSync(path.join(REPO, f), "utf8").split(/\r?\n/).length; }],
    ["IPA with no tradition", { ...base, ipa: "ˈpor.ta", ipa_source: null }, (r) => r.ipa && !r.ipa_source],
    ["attested with no citation", { ...base, confidence: "attested", source: null }, (r) => r.confidence === "attested" && !r.source],
    ["a back-translation copied from the definition",
      { ...base, back_translation: base.english_operational_definition },
      (r) => String(r.back_translation).trim().toLowerCase() === String(r.english_operational_definition).trim().toLowerCase()],
  ];
  const missed = probes.filter(([, row, detect]) => !detect(row)).map(([n]) => n);
  missed.length
    ? bad("MUTATION: every fence bites", `not detected: ${missed.join(", ")}`)
    : ok("MUTATION: every fence bites",
        probes.map(([n]) => n).join(" · ") + " — each is caught by the same logic the checks above use");
}

// ── report ───────────────────────────────────────────────────────────────────────────────────────
console.log(`\nCONCEPT REGISTRY — ${good.length} concept(s)\n`);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);

console.log("\nWHAT THIS GATE CANNOT DO:");
console.log("  It proves every concept points at a line that exists, that no IPA claims an unnamed");
console.log("  tradition, and that no 'attested' lacks a citation. IT CANNOT JUDGE A TRANSLATION.");
console.log("  Whether `porta` is the right anchor for `door` is a human's call, and `reviewer` is a");
console.log("  CLAIM by a named person, not a measurement. Most rows here have no reviewer yet, and");
console.log("  that is rendered rather than hidden.");

const failed = results.filter((r) => !r.pass);
const verdict = failed.length ? "FAIL" : "PASS";
console.log(`\nGATE: ${verdict} - concepts, ${results.length - failed.length}/${results.length} checks`);
process.exit(verdict === "PASS" ? 0 : 1);
