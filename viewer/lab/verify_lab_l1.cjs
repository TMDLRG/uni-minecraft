// verify_lab_l1.cjs — THE L1 GATE (Phase 9 step 4.6, build 1): the five materials, cross-checked.
//
// L1 is where F24-F27 stop being DESIGN. The renderer now says, in FORM, how well-backed a thing
// is — and the whole value of that depends on the mapping being RIGHT, so the centre of this gate
// is not a style check. It is this:
//
//   THE PAGE'S OWN materialOf() IS EXTRACTED AND RUN, AND ITS ANSWER IS COMPARED TO THE ELIXIR'S.
//
// l1.html restates SP.ControlPlane.Scene.material/1 in JavaScript because a browser cannot call
// Elixir. A second implementation nobody cross-checks is a second place to be wrong, and the one
// place it would be silently wrong is the one that matters: a node rendering SOLID when the
// contract says FOG is a claim the evidence does not support, drawn convincingly.
//
// The comparison runs the SHIPPED function — not a copy of it in this file, which would only prove
// that two copies I wrote agree with each other.
//
// PASS — every fixture node renders what the Elixir says it renders, all five materials appear,
// the F24/F25/F26 refusals hold, the five differ in FORM rather than only in colour, and the page
// reaches no live state.
// Usage: node viewer/lab/verify_lab_l1.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const cp = require("child_process");
const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const PAGE = path.join(HERE, "l1.html");
const FIXTURE = path.join(HERE, "fixtures", "l1_materials.json");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const page = fs.readFileSync(PAGE, "utf8");
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const nodes = fixture.nodes || [];

// ---- extract the SHIPPED functions and run them ------------------------------------------------

function shipped(name) {
  // Grab `function <name>(...) { ... }` up to its matching close, by brace depth. Crude and
  // adequate, and it fails loudly rather than silently returning something else.
  const start = page.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`l1.html has no function ${name}`);
  let i = page.indexOf("{", start), depth = 0, end = -1;
  for (let j = i; j < page.length; j++) {
    if (page[j] === "{") depth++;
    else if (page[j] === "}" && --depth === 0) { end = j + 1; break; }
  }
  if (end < 0) throw new Error(`unterminated ${name}`);
  // eslint-disable-next-line no-new-func
  return new Function(`${page.slice(start, end)}; return ${name};`)();
}

let materialOf, liveness;
try {
  materialOf = shipped("materialOf");
  liveness = shipped("liveness");
  ok("the page's own render contract is extractable and runnable",
    "materialOf() and liveness() are taken FROM l1.html, not re-typed here — a copy that agrees " +
    "with another copy I wrote proves nothing");
} catch (e) {
  bad("the page's own render contract is extractable and runnable", e.message);
}

// ---- M2: THE ELIXIR IS THE CONTRACT, THE JAVASCRIPT IS A COPY ON TRIAL --------------------------

if (materialOf) {
  const r = cp.spawnSync("mix", ["run", "scripts/lab_l1_materials_from_elixir.exs"],
    { cwd: REPO, encoding: "utf8", timeout: 300000, shell: true });
  const line = (r.stdout || "").split(/\r?\n/).reverse().find((l) => l.trim().startsWith("{"));

  if (!line) {
    bad("M2: every node renders what SP.ControlPlane.Scene says it renders",
      "could not get the Elixir's answer — a cross-check that did not run is not a cross-check");
  } else {
    const elixir = JSON.parse(line).nodes;
    const byId = new Map(elixir.map((e) => [e.id, e]));
    const disagree = [];
    for (const n of nodes) {
      const e = byId.get(n.id);
      if (!e) { disagree.push(`${n.id}: absent from the Elixir's answer`); continue; }
      const js = materialOf(n);
      if (js !== e.material) disagree.push(`${n.id}: js=${js} elixir=${e.material}`);
      const jl = liveness ? liveness(n) : null;
      if (jl && jl !== e.liveness) disagree.push(`${n.id}: liveness js=${jl} elixir=${e.liveness}`);
    }
    disagree.length
      ? bad("M2: every node renders what SP.ControlPlane.Scene says it renders", disagree.join("; "))
      : ok("M2: every node renders what SP.ControlPlane.Scene says it renders",
          `${nodes.length} nodes, cross-checked against the Elixir itself — a node drawn SOLID ` +
          `where the contract says FOG is a claim the evidence does not support, drawn convincingly`);
  }
}

// ---- all five materials, or the fixture is not standing the contract up -------------------------

if (materialOf) {
  const seen = new Set(nodes.map(materialOf));
  const want = ["lit_solid", "seamed_solid", "translucent", "staged", "fog"];
  const missing = want.filter((m) => !seen.has(m));
  missing.length
    ? bad("all FIVE materials appear", `missing: ${missing.join(", ")}`)
    : ok("all FIVE materials appear", want.join(" · "));
}

// ---- F24, F25, F26 ------------------------------------------------------------------------------

if (materialOf) {
  const noReceipt = { id: "x", truth_class: "OBSERVED", receipt_ref: "" };
  const blank = { id: "x", truth_class: "OBSERVED", receipt_ref: "   " };
  const unknown = { id: "x", truth_class: "UNKNOWN", receipt_ref: "docs/r.md" };
  const unreadable = { id: "x", truth_class: "SOMETHING_ELSE", receipt_ref: "docs/r.md" };

  [materialOf(noReceipt), materialOf(blank), materialOf(unknown), materialOf(unreadable)]
    .every((m) => m === "fog")
    ? ok("F24: no receipt, blank receipt, UNKNOWN and unreadable all render FOG",
        "a node CLAIMING to be observed with no receipt is fog — the claim does not survive the " +
        "missing receipt, and the render is where that becomes visible without reading a word")
    : bad("F24: no receipt, blank receipt, UNKNOWN and unreadable all render FOG",
        "one of the four earned a material it cannot support");

  // F25 — and the refusal is an ABSENCE. There is no desk to click, so there is nothing that
  // could refuse you; the drawing simply does not put one there.
  const drawsDeskOnlyWhenAuthorable = /if \(authorable\(n\)\) \{/.test(page);
  // The window has to clear the fog branch's own explanation of itself. The first version capped
  // it at 400 characters and reported false against a branch that is correct — my checker, not the
  // page, for the second time in this build and the ninth in this programme.
  // \r?\n, NOT \n. THE FOURTH INSTANCE OF THE CRLF CLASS, and it was mine, committed the same day.
  // viewer/lab/l1.html had no eol rule, so a fresh Windows clone checks it out as CRLF; the bytes
  // become `return;\r\n` and this pattern matched NOWHERE. The gate reported PASS 8/8 in my working
  // tree and FAIL 7/8 FROM ITS OWN COMMIT. A gate that cannot reproduce its own verdict is worse
  // than no gate, because it is trusted. Found by an adversarial clean-checkout audit, not by me.
  const fogReturnsEarly = /if \(m === "fog"\) \{[\s\S]{0,900}?\r?\n {6}return;\r?\n {4}\}/.test(page);
  drawsDeskOnlyWhenAuthorable && fogReturnsEarly
    ? ok("F25: fog gets no desk, and the absence IS the refusal",
        "the fog branch returns before any desk is drawn — you cannot stand at a desk that is not " +
        "there, and nothing has to say no")
    : bad("F25: fog gets no desk, and the absence IS the refusal",
        `desk-guard=${drawsDeskOnlyWhenAuthorable} fog-returns-early=${fogReturnsEarly}`);

  // F26 — liveness comes from a probe or it is not drawn.
  const notProbed = liveness({ id: "x", truth_class: "OBSERVED", receipt_ref: "r" });
  const up = liveness({ id: "x", truth_class: "OBSERVED", receipt_ref: "r", live: { up: true } });
  const down = liveness({ id: "x", truth_class: "OBSERVED", receipt_ref: "r", live: { up: false } });
  const onlyDrawsProbed = /if \(l === "up" \|\| l === "down"\)/.test(page);

  notProbed === "not_probed" && up === "up" && down === "down" && onlyDrawsProbed
    ? ok("F26: liveness is drawn only where a probe answered",
        "not_probed draws NOTHING, and that silence is the point — absence of a probe is not " +
        "evidence of health")
    : bad("F26: liveness is drawn only where a probe answered",
        `not_probed=${notProbed} up=${up} down=${down} guarded=${onlyDrawsProbed}`);
}

// ---- the five differ in FORM, which is what "no text read" requires -----------------------------

{
  // 4.6's falsifier: "he cannot tell them apart, OR CAN FOR A REASON THAT IS NOT truth_class".
  // Colour alone fails that twice over — it fails a colour-blind reader, and it fails a greyscale
  // screenshot. So each material must differ in SHAPE.
  const forms = {
    fog: /createRadialGradient/,                 // no edge, no floor contact
    staged: /setLineDash\(\[6, 5\]\)/,           // outline only, on a plinth
    translucent: /rgba\(111,150,171,\.28\)/,     // you can see the grid through it
    seamed_solid: /for \(let i = 1; i <= 3; i\+\+\)[\s\S]{0,200}?moveTo\(px - w\/2, yy\)/, // seams
    lit_solid: /m === "lit_solid" \? cssVar\("--lit"\)/,
  };
  const absent = Object.entries(forms).filter(([, re]) => !re.test(page)).map(([k]) => k);
  absent.length
    ? bad("the five differ in FORM, not only in colour", `no distinct form for: ${absent.join(", ")}`)
    : ok("the five differ in FORM, not only in colour",
        "fog has no edge and no floor contact · staged is an outline on a plinth · translucent " +
        "shows the grid through it · seamed is solid but visibly joined · lit is solid and crisp. " +
        "Colour alone would fail a greyscale screenshot and a colour-blind reader both.");
}

// ---- socket-free ---------------------------------------------------------------------------------

{
  const fetches = [...page.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["/api/lab/fixture", "/api/identity"]);
  const stray = fetches.filter((f) => !allowed.has(f));
  stray.length === 0 && fetches.includes("/api/lab/fixture")
    ? ok("SOCKET-FREE: it reads a fixture and its own identity, nothing else",
        `${fetches.join(", ")} — the projection is L3's build, and reaching for real gates before ` +
        `anything can say what a fogged one looks like would be showing a claim it had not earned`)
    : bad("SOCKET-FREE: it reads a fixture and its own identity, nothing else",
        stray.length ? `reaches ${stray.join(", ")}` : "it does not read the fixture at all");
}

// ---- verdict ---------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l1, ${results.length - failed.length}/${results.length} checks`
);
console.log("  Walk it: node viewer/lab/lab_server.cjs  ->  http://127.0.0.1:8103/lab/l1");
process.exit(failed.length === 0 ? 0 : 1);
