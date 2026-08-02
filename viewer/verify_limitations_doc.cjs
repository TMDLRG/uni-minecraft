// verify_limitations_doc.cjs — THE DERIVED-DOC GATE (Phase 9, step 3.5).
//
// Step 3.5's pre-registered falsifier is bidirectional:
//
//     a limitation in a test absent from the doc, or vice versa
//
// One check closes both directions at once, and it is the reason the document is derived rather
// than written: REGENERATE IT AND REQUIRE THE BYTES TO MATCH. An annotation added without
// regenerating produces a doc missing a limitation; a doc edited by hand produces a doc claiming
// one that no code declares. Both are the same mismatch. **A derived doc cannot drift.**
//
// M6, NEGATIVE CONTROL, is the point of the second half of this file. A comparison gate is
// satisfied by a generator that has quietly stopped finding anything — regenerate nothing, compare
// nothing to nothing, pass. So the mutations below run on SANDBOX COPIES and require the gate to
// FAIL in each direction, and a further control requires that a file which merely MENTIONS the
// marker in prose is not scraped as a declaration.
//
// PASS — the committed doc is byte-identical to a fresh generation, and both drift directions bite.
// Usage: node viewer/verify_limitations_doc.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const VIEWER = __dirname;
const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const lim = require("./limitations.cjs");

// ---- the real tree ---------------------------------------------------------------------------

const scanned = lim.scan();

scanned.duplicates.length
  ? bad("no duplicate limitation ids", scanned.duplicates.map((d) => `${d.id} at ${d.at.join(" and ")}`).join("; "))
  : ok("no duplicate limitation ids", `${scanned.entries.length} ids, all distinct`);

scanned.missing.length
  ? bad("every limitation states what, why and claim",
      scanned.missing.map((m) => `${m.id} (${m.file}:${m.line})`).join("; "))
  : ok("every limitation states what, why and claim",
      "a limitation with no claim level is a worry, not a statement");

if (!fs.existsSync(lim.DOC)) {
  bad("the derived document exists", `${lim.DOC} is absent — run node viewer/generate_limitations.cjs`);
} else {
  const committed = fs.readFileSync(lim.DOC, "utf8");
  const fresh = lim.render(scanned);
  committed === fresh
    ? ok("the committed doc is byte-identical to a fresh generation",
        `${scanned.entries.length} limitations, ${committed.length} bytes`)
    : bad("the committed doc is byte-identical to a fresh generation",
        "the doc has DRIFTED from the source. Either an annotation changed and the doc was not " +
        "regenerated, or the doc was edited by hand. Run node viewer/generate_limitations.cjs.");
}

// The one the plan names explicitly. It is asserted by id rather than by prose so that renaming
// the limitation is a visible change rather than a silent deletion.
scanned.entries.some((e) => e.id === "cp.anchor.phase5-closure-void")
  ? ok("Phase 5's closure of the anchor residual is recorded as VOID",
      "cp.anchor.phase5-closure-void — required by the remediation plan, step 3.5")
  : bad("Phase 5's closure of the anchor residual is recorded as VOID",
      "the plan requires this limitation to exist and it does not");

// ---- M6: the drift check must bite, in BOTH directions -------------------------------------

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-lim-"));
  const viewer = path.join(dir, "viewer");
  fs.mkdirSync(path.join(viewer), { recursive: true });
  fs.mkdirSync(path.join(dir, "lib"), { recursive: true });
  fs.copyFileSync(path.join(VIEWER, "limitations.cjs"), path.join(viewer, "limitations.cjs"));
  // Its __dirname is now the sandbox, so it scans the sandbox and never the real tree.
  const mod = require(path.join(viewer, "limitations.cjs"));
  return { dir, mod };
}

function seedOne(dir, id) {
  fs.writeFileSync(path.join(dir, "lib", "thing.ex"),
    `# @limitation ${id}\n#   what: a thing\n#   why: a reason\n#   claim: a level\n`);
}

function writeDoc(mod, text) {
  fs.mkdirSync(path.dirname(mod.DOC), { recursive: true });
  fs.writeFileSync(mod.DOC, text, { encoding: "utf8" });
}

{
  // Direction 1 — an annotation exists that the doc does not carry.
  const { dir, mod } = sandbox();
  seedOne(dir, "seed.one");
  writeDoc(mod, mod.render(mod.scan()));
  const before = fs.readFileSync(mod.DOC, "utf8") === mod.render(mod.scan());

  fs.appendFileSync(path.join(dir, "lib", "thing.ex"),
    "\n# @limitation seed.two\n#   what: another\n#   why: another\n#   claim: another\n");
  const after = fs.readFileSync(mod.DOC, "utf8") === mod.render(mod.scan());

  before && !after
    ? ok("MUTATION caught: a new annotation with no regeneration", "the doc no longer matches the source")
    : bad("MUTATION caught: a new annotation with no regeneration",
        `before=${before} after=${after} — a limitation can be declared and never appear`);
}

{
  // Direction 2 — the doc claims something no code declares.
  const { dir, mod } = sandbox();
  seedOne(dir, "seed.one");
  writeDoc(mod, mod.render(mod.scan()));
  writeDoc(mod, fs.readFileSync(mod.DOC, "utf8") + "\n## `invented.limitation`\n\n**not declared anywhere**\n");
  fs.readFileSync(mod.DOC, "utf8") !== mod.render(mod.scan())
    ? ok("MUTATION caught: a doc edited by hand", "a limitation nothing declares does not survive")
    : bad("MUTATION caught: a doc edited by hand", "the doc can claim limits no code carries");
}

{
  // NEGATIVE CONTROL — an unmodified sandbox must MATCH. Without this, both mutations above are
  // satisfied by a generator that never matches anything.
  const { dir, mod } = sandbox();
  seedOne(dir, "seed.one");
  writeDoc(mod, mod.render(mod.scan()));
  fs.readFileSync(mod.DOC, "utf8") === mod.render(mod.scan())
    ? ok("NEGATIVE CONTROL: an untouched tree matches", "the gate is comparing, not merely refusing")
    : bad("NEGATIVE CONTROL: an untouched tree matches", "it refuses a faithful generation");
}

{
  // USE vs MENTION — limitations.cjs's own header discusses `@limitation` at length and declares
  // exactly one. A scraper that cannot tell talking-about from declaring would invent limitations
  // out of documentation, which is the mistake step 1.5 had to unpick in the drift signals.
  const declared = scanned.entries.filter((e) => e.file === "viewer/limitations.cjs");
  declared.length === 1 && declared[0].id === "doc.limitations.single-repo"
    ? ok("USE vs MENTION: prose about the marker is not a declaration",
        "limitations.cjs discusses @limitation throughout and declares exactly one")
    : bad("USE vs MENTION: prose about the marker is not a declaration",
        `scraped ${declared.length} from viewer/limitations.cjs: ${declared.map((d) => d.id).join(", ")}`);
}

// ---- verdict ---------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - limitations-doc, ` +
    `${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
