// verify_drift_wellformed.cjs — ADR-0002 AMENDMENT 1 ENFORCED (Phase 9, step 1.5).
//
// Amendment 1, Decision 5: both sides of a drift signal MUST be the same kind under the same normalization —
// a comparison is well-formed only if `equal: true` is REACHABLE, i.e. some achievable state of the world
// makes the two byte-sets identical. Five signals failed that: prose against a path (fqdn_cjs,
// gate_row_schema_path), a label against an array (resolver_planned), a JSON blob against a 54 KB document
// (self_caps_doc_vs_served). They stayed red through a day of real corrections and would have stayed red had
// every correction been perfect. The cost is not the red pixel — an inequality nobody can act on stops being
// read, which is how drift.git_dirty_vs_clean sat unread while pointing at a live defect.
//
// Decision 8 is why this file is MANDATORY, not optional: "Every repaired comparison must be proved to still
// bite — point its declared side at a bad value and watch `equal` go false. A comparison repaired without
// that proof is indistinguishable from a comparison loosened."
//
// SO EVERY REPAIRED SIGNAL IS MUTATED HERE (M1). Each mutation runs against a REBUILT comparison using the
// same rule the collector uses, on FIXTURE INPUTS — the real repository is never edited, and no signal is
// re-pointed at anything on disk. A repair that cannot be shown to bite fails this gate.
//
// Usage: node viewer/gaia/verify_drift_wellformed.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// The mechanical comparison every drift signal performs: a raw byte-compare of the two declared sides.
const equalOf = (a, b) => a === b;

// ---- 1. fqdn_cjs — the cited PATH vs the path on disk ---------------------------------------------------
function checkFqdn() {
  const extract = (line) => (line.match(/viewer\/fqdn\.cjs/) || [""])[0];

  // convergent: when the cited path exists, the comparison reads equal
  const citedGood = extract("declared map `viewer/infra_registry.json` via `viewer/fqdn.cjs` (`fqdn(name)`)");
  const converges = equalOf(citedGood, "viewer/fqdn.cjs");
  // BITE (M1): the doc cites a path that is not on disk -> unequal
  const bites = !equalOf(citedGood, "");
  // BITE (M1): the doc stops citing it at all while the file exists -> unequal
  const bites2 = !equalOf(extract("no citation here"), "viewer/fqdn.cjs");

  if (!converges) bad("fqdn-cjs-wellformed", `equal:true is NOT reachable — extracted "${citedGood}" cannot equal an on-disk "viewer/fqdn.cjs"`);
  else if (!bites || !bites2) bad("fqdn-cjs-wellformed", `repaired but does NOT bite (absent-file=${bites}, dropped-citation=${bites2}) — indistinguishable from loosened (Decision 8)`);
  else ok("fqdn-cjs-wellformed", "path-vs-path: converges when the cited path exists, and bites on an absent file AND on a dropped citation");
}

// ---- 2. gate_row_schema_path — cited schema PATHS vs those paths on disk --------------------------------
function checkGateRowSchema() {
  const RE = /production\/schemas\/gate_row[A-Za-z0-9._-]*\.json/g;
  const cite = (text) => [...new Set((text.match(RE) || []))].sort();
  const compare = (text, onDisk) => {
    const cited = cite(text);
    return { cited, equal: equalOf(cited.join("\n"), cited.filter((p) => onDisk.includes(p)).sort().join("\n")) };
  };

  // Fixture paths are ASSEMBLED at runtime, never written as literals — INCLUDING in these comments.
  // viewer/verify_schema_pointers.cjs scans the repository for `production/schemas/<name>.json` path
  // CLAIMS and requires each to resolve on disk. A literal ghost path here, even inside a comment
  // explaining why it must not be here, is indistinguishable from a real citation. That gate caught this
  // file twice on its first two runs — once for the fixture, once for the comment describing the fixture.
  const DIR = "production/schemas/";
  const REAL = DIR + "gate_row" + ".schema" + ".json";
  const GHOST = DIR + "gate_row" + ".v1" + ".json";
  const disk = [REAL];
  // convergent: every cited path resolves
  const good = compare("schema `" + REAL + "`.", disk);
  // BITE (M1): a doc cites a schema path that does not exist
  const mutated = compare("see `" + GHOST + "` for the row shape.", disk);
  // USE vs MENTION (M6 negative control): a line RECORDING that the bare $id is not a real path must NOT
  // be captured as a citation — CLAUDE.md:581 is documentation OF the fix, and convicting it was the defect.
  const mention = compare("`$id` reads `gate_row" + ".v1" + ".json`, which is not a real path; corrected", disk);

  if (!good.equal) bad("gate-row-schema-wellformed", `equal:true not reachable on a correct doc: cited=${JSON.stringify(good.cited)}`);
  else if (mutated.equal) bad("gate-row-schema-wellformed", "repaired but does NOT bite — a doc citing a nonexistent schema path still read equal (Decision 8)");
  else if (mention.cited.length !== 0) bad("gate-row-schema-wellformed", `USE vs MENTION regression — a line documenting that the $id is NOT a path was captured as a citation: ${JSON.stringify(mention.cited)}`);
  else ok("gate-row-schema-wellformed", "path-list vs path-list: converges when every cited path resolves, bites on a nonexistent citation, and does not convict the prose that records the fix");
}

// ---- 3. self_caps_doc_vs_served — served NAMES vs documented NAMES --------------------------------------
function checkSelfCaps() {
  const compare = (names, docText) => {
    const served = [...names].sort();
    const documented = served.filter((n) => docText.includes(n));
    return equalOf(served.join("\n"), documented.join("\n"));
  };

  const names = ["gaia.probe", "gaia://drift/index", "gaia.self.manifest"];
  const fullDoc = "manifest: gaia.probe, gaia://drift/index, gaia.self.manifest — all documented";
  // convergent: the doc covers every served name
  const converges = compare(names, fullDoc);
  // BITE (M1): a capability is served but the manifest never mentions it
  const bites = !compare(names.concat("gaia.newly_added_tool"), fullDoc);

  if (!converges) bad("self-caps-wellformed", "equal:true not reachable even when the doc covers every served name");
  else if (!bites) bad("self-caps-wellformed", "repaired but does NOT bite — an undocumented served capability still read equal (Decision 8)");
  else ok("self-caps-wellformed", "name-list vs name-list: converges when the manifest covers what is served, bites on an undocumented capability");
}

// ---- 4. resolver_planned — expectation vs names that failed to resolve ----------------------------------
function checkResolver() {
  const failedOf = (rows) => rows
    .filter((r) => !Array.isArray(r.resolved) || r.resolved.length === 0)
    .map((r) => `${r.name}:${r.state}`).sort().join("\n");

  // NO IP LITERALS: viewer/gaia/** may contain none (the gaia-no-ip-literal fence — hosts derive from the
  // infra registry, never from a hard-coded address). This comparison only asks whether `resolved` is
  // NON-EMPTY, so an opaque marker carries the fixture exactly as well as an address would. This file
  // failed that fence on its first run for using real chip addresses here.
  const ADDR = "<resolved-address>";
  const healthy = [
    { name: "mc.uni-lab.local", state: "fresh", resolved: [ADDR] },
    { name: "dns.uni-lab.local", state: "tracking", resolved: [ADDR] },
  ];
  // convergent: everything resolves -> "" === ""
  const converges = equalOf("", failedOf(healthy));
  // BITE (M1): a declared name stops answering
  const broken = healthy.concat([{ name: "colony.uni-lab.local", state: "unresolved", resolved: [] }]);
  const bites = !equalOf("", failedOf(broken));
  // NEGATIVE CONTROL (M6): "tracking" is the DESIGNED DHCP-follow behaviour, not a fault — it must not fire
  const noFalseAlarm = equalOf("", failedOf([{ name: "dns.uni-lab.local", state: "tracking", resolved: [ADDR] }]));

  if (!converges) bad("resolver-wellformed", "equal:true not reachable even when every name resolves");
  else if (!bites) bad("resolver-wellformed", "repaired but does NOT bite — a name that failed to resolve still read equal (Decision 8)");
  else if (!noFalseAlarm) bad("resolver-wellformed", "false alarm — a healthy DHCP-tracking name was reported as a resolve failure");
  else ok("resolver-wellformed", "expectation vs live failures: converges when DNS is healthy, bites on a name that stops answering, silent on designed DHCP tracking");
}

// ---- 5. the repaired signals are still PRESENT (Amendment 1 forbids deleting them) ----------------------
// "Delete the malformed signals. Rejected, and already mechanically prevented: verify_gaia.cjs:513-518
// requires the hints fqdn, gate_row, resolver, git, self to exist." Repair must never become removal.
const REQUIRED_SIGNALS = [
  "drift.fqdn_cjs", "drift.gate_row_schema_path", "drift.resolver_planned",
  "drift.self_caps_doc_vs_served", "drift.git_dirty_vs_clean",
];

// EMITTED, not MENTIONED — corrected 2026-07-28.
//
// This used to read the source and ask `src.includes('"drift.fqdn_cjs"')`. A substring. The id
// appears in this very sentence, and a `collectors.cjs` that carried the five ids only in a comment
// explaining that the signals had been removed would have satisfied it exactly. "Amendment 1 forbids
// deleting them" was therefore enforced against the text of the file rather than its behaviour.
//
// Now the REAL `driftSignals()` runs and the emitted ids are counted — and each one must carry two
// declared sides and a relation, because a signal present in name with nothing to compare is a
// deletion that kept its label.
/** The two declared sides of a drift signal, which live inside its canonical `value.raw`. */
function sidesOf(sig) {
  try {
    const v = JSON.parse(sig.value.raw);
    return v && v.a && v.b ? v : null;
  } catch {
    return null;
  }
}

async function checkNoneDeleted() {
  let emitted;
  try {
    emitted = await require("./collectors.cjs").driftSignals();
  } catch (e) {
    bad("no-signal-was-deleted", `driftSignals() threw: ${e.message}`);
    return;
  }
  const byId = new Map(emitted.map((s) => [s.id, s]));
  const missing = REQUIRED_SIGNALS.filter((id) => !byId.has(id));
  const malformed = REQUIRED_SIGNALS.filter((id) => {
    const s = byId.get(id);
    return s && !sidesOf(s);
  });

  if (missing.length) {
    bad("no-signal-was-deleted",
      `repair became REMOVAL for: ${missing.join(", ")} — Amendment 1 rejects deleting a malformed signal`);
  } else if (malformed.length) {
    bad("no-signal-was-deleted",
      `${malformed.join(", ")} are emitted but carry no comparable sides — a label without a comparison ` +
      `is a deletion that kept its name`);
  } else {
    ok("no-signal-was-deleted",
      `all ${REQUIRED_SIGNALS.length} named signals are EMITTED BY THE REAL COLLECTOR (${emitted.length} ` +
      `signals total), each carrying two declared sides. This check used to be ` +
      `src.includes('"drift.fqdn_cjs"') — a substring that a comment about having removed the signal ` +
      `would have satisfied.`);
  }
}

// ---- THE MUTATION: deleting a signal must be caught ----------------------------------------------------
//
// The one probe that distinguishes "the signals are emitted" from "the ids appear in the file".
async function checkDeletionIsCaught() {
  const path = require("path");
  const { compileMutated } = require("./mutate.cjs");

  let mutant;
  try {
    // Drop ONE signal at the point of emission, leaving its id in the source everywhere else — which
    // is exactly the shape the old substring check could not see.
    mutant = compileMutated(path.join(__dirname, "collectors.cjs"), [[
      /out\.push\(driftSignal\("drift\.git_dirty_vs_clean"/,
      'void 0 && out.push(driftSignal("drift.git_dirty_vs_clean"',
    ]], "one-signal-deleted");
  } catch (e) {
    bad("deleting a signal is caught", e.message);
    return;
  }

  let mutatedIds;
  try {
    mutatedIds = new Set((await mutant.exports.driftSignals()).map((s) => s.id));
  } catch (e) {
    bad("deleting a signal is caught", `the mutated collector threw: ${e.message}`);
    return;
  }
  const realIds = new Set((await require("./collectors.cjs").driftSignals()).map((s) => s.id));

  if (mutatedIds.has("drift.git_dirty_vs_clean")) {
    bad("deleting a signal is caught", "the mutation did not remove the signal — this proves nothing");
  } else if (!realIds.has("drift.git_dirty_vs_clean")) {
    bad("deleting a signal is caught", "the REAL collector no longer emits drift.git_dirty_vs_clean");
  } else {
    ok("deleting a signal is caught",
      `with one emission suppressed in the REAL collectors.cjs (compiled in place, ` +
      `${mutant.sha256.slice(0, 12)}), drift.git_dirty_vs_clean disappears from the output while its ` +
      `id still appears in the source — the exact shape the old substring check could not see.`);
  }
}

// ---- THE SHIPPED SIGNALS ARE WELL-FORMED, not just the rebuilds ------------------------------------------
//
// Corrected 2026-07-28, found by a re-audit of this same day's work. Checks 1–4 above test that the
// RULE is well-formed — on LOCAL fixtures, with a local `equalOf` and local extractors. They never
// touch collectors.cjs. So a regression of a SHIPPED comparison back to mismatched kinds (side a
// prose, side b a path — the pre-Amendment-1 defect) would leave every one of them green while the
// shipped signal is malformed: exactly the "tests a rebuild, not the shipped rule" class the sibling
// gaia gates were corrected away from that morning, and which this gate was left carrying.
//
// This ties well-formedness to the REAL emitted signals. A well-formed comparison has both sides
// drawn from the same value space; the four repaired signals each have a per-signal grammar every
// non-empty line of both sides must satisfy. `git_dirty_vs_clean` is the convergent REFERENCE — it
// was never malformed — so it is the control, not a subject.
const SIDE_GRAMMAR = {
  "drift.fqdn_cjs": /^[\w./-]*$/,                                  // a repo path, or empty — never a prose line
  "drift.gate_row_schema_path": /^(production\/schemas\/[\w.-]+\.json)?$/, // path-list lines
  "drift.self_caps_doc_vs_served": /^[\w.:/-]*$/,                  // a capability token, or empty — never a document
  "drift.resolver_planned": /^([\w.-]+:[\w-]+)?$/,                 // name:state, or empty — never a bare label
};

function wellFormednessViolations(sigs) {
  const byId = new Map(sigs.map((s) => [s.id, s]));
  const bad = [];
  for (const [id, grammar] of Object.entries(SIDE_GRAMMAR)) {
    const s = byId.get(id);
    const v = s && sidesOf(s);
    if (!v) { bad.push(`${id}: not emitted with comparable sides`); continue; }
    for (const which of ["a", "b"]) {
      const lines = String(v[which].raw).split(/\r?\n/);
      const offending = lines.find((l) => l.trim() !== "" && !grammar.test(l));
      if (offending !== undefined) bad.push(`${id}.${which} has a line that is not ${grammar}: ${JSON.stringify(offending.slice(0, 50))}`);
    }
  }
  return bad;
}

async function checkShippedSignalsAreWellFormed() {
  const path = require("path");
  const { compileMutated } = require("./mutate.cjs");

  let real;
  try {
    real = await require("./collectors.cjs").driftSignals();
  } catch (e) {
    bad("the SHIPPED signals are well-formed", `driftSignals() threw: ${e.message}`);
    return;
  }
  const realViolations = wellFormednessViolations(real);
  if (realViolations.length) {
    bad("the SHIPPED signals are well-formed",
      `the REAL collector emits a malformed comparison — a side drawn from a different value space than ` +
      `its partner, so equal:true is unreachable: ${realViolations.join(" · ")}`);
    return;
  }

  // THE BITE: regress the shipped fqdn comparison to carry the whole prose LINE on side a (the
  // pre-Amendment-1 shape) and require the predicate to catch it. Without this, "the shipped signals
  // are well-formed" could be true today by luck and stop meaning anything the moment the code moved.
  let mutant;
  try {
    mutant = compileMutated(path.join(__dirname, "collectors.cjs"), [[
      'const cited = doc ? (doc.line.match(/viewer\\/fqdn\\.cjs/) || [""])[0] : "";',
      'const cited = doc ? doc.line : "";',
    ]], "fqdn-prose-regression");
  } catch (e) {
    bad("the SHIPPED signals are well-formed", `the fqdn-regression mutation is stale: ${e.message}`);
    return;
  }

  let mutantViolations;
  try {
    mutantViolations = wellFormednessViolations(await mutant.exports.driftSignals());
  } catch (e) {
    bad("the SHIPPED signals are well-formed", `the mutated collector threw: ${e.message}`);
    return;
  }

  mutantViolations.some((m) => m.startsWith("drift.fqdn_cjs"))
    ? ok("the SHIPPED signals are well-formed",
        `all four repaired signals emit both sides within their per-signal grammar, checked against the ` +
        `REAL driftSignals() — and regressing the shipped fqdn comparison to carry a prose line ` +
        `(compiled in place, ${mutant.sha256.slice(0, 12)}) is CAUGHT. Checks 1–4 above test the rule ` +
        `on fixtures; this is the one that tests the rule that SHIPS, which is what they were missing.`)
    : bad("the SHIPPED signals are well-formed",
        `the fqdn-prose regression was NOT caught — the well-formedness predicate does not bite on the ` +
        `shipped signal, so a real regression would ship green. violations seen: ${mutantViolations.join(" · ") || "none"}`);
}

(async function main() {
  checkFqdn();
  checkGateRowSchema();
  checkSelfCaps();
  checkResolver();
  await checkNoneDeleted();
  await checkDeletionIsCaught();
  await checkShippedSignalsAreWellFormed();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(30)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nDRIFT WELL-FORMEDNESS GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(Well-formed means equal:true is REACHABLE and the comparison still bites — never that the world is currently correct.)\n");
  process.exit(fails ? 1 : 0);
})();
