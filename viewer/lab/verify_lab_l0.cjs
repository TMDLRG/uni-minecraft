// verify_lab_l0.cjs — THE L0 GATE (Phase 9 step 4.6, build 0).
//
// L0's acceptance is "he opens /lab and walks around", with ZERO NODES. Two things can go wrong
// and only one of them is obvious:
//
//   1. it does not render — visible immediately, and nobody needs a gate to notice;
//   2. IT RENDERS SOMETHING IT HAS NOT EARNED — a node, a colour that means a truth_class, a
//      liveness dot. That is invisible in a screenshot and fatal to L2, whose whole job is to
//      FAIL on swapped materials. A gate cannot prove a swap is caught against a renderer that
//      already assumed the materials.
//
// So this gate mostly checks what is ABSENT. It is the same shape as F31's guard: the interesting
// property is a refusal, and an absence is what you probe for.
//
// It also enforces the release contract mechanically: CPU-ONLY. CLAUDE.md forbids WebGL, WebGPU
// and Three.js in the released product, and a rendered surface is exactly where that rule gets
// broken by convenience.
//
// PASS — the room renders from a 2D context, claims zero nodes, names no truth_class or material,
// and reaches nothing that could actuate.
// Usage: node viewer/lab/verify_lab_l0.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const PAGE = path.join(HERE, "lab.html");
const SERVER = path.join(HERE, "lab_server.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const page = fs.existsSync(PAGE) ? fs.readFileSync(PAGE, "utf8") : null;
const server = fs.existsSync(SERVER) ? fs.readFileSync(SERVER, "utf8") : null;

if (!page || !server) {
  bad("the lab exists", `${!page ? "lab.html" : ""} ${!server ? "lab_server.cjs" : ""} missing`);
} else {
  ok("the lab exists", `lab.html ${page.length} bytes · lab_server.cjs ${server.length} bytes`);
}

// ---- CPU-ONLY, enforced rather than intended ---------------------------------------------------
// USE vs MENTION, for the eighth time in this programme: both files DISCUSS these words at length
// in their headers, because saying what is forbidden is how the rule survives. Whole-line comments
// are mention; anything else is use.
// USE, NOT MENTION — and the first version of this gate got it wrong, which makes EIGHT times in
// this programme. It searched for the bare words "webgl", "webgpu", "three.js" and convicted:
//   * lab.html's HTML block comment, whose inner lines start with none of the markers I stripped;
//   * lab_server.cjs's /api/lab response, which HONESTLY DECLARES "no WebGL, no WebGPU, no
//     Three.js" as its own contract.
// A fence that punishes a file for stating the rule it obeys is a fence that teaches people to
// stop stating the rule. So the check is now API-SHAPED: a bare word is mention; a context
// request, an import, or a constructor is USE.
const FORBIDDEN = [
  /getContext\(\s*['"]webgl/i,
  /getContext\(\s*['"]webgpu/i,
  /navigator\s*\.\s*gpu\b/,
  /require\(\s*['"]three/i,
  /from\s+['"]three/i,
  /new\s+THREE\./,
  /<script[^>]+three(\.min)?\.js/i,
];

// Whole-line `//` comments AND HTML block comments. The block-comment case is what caught me.
function codeOnly(src) {
  const noBlocks = src.replace(/<!--[\s\S]*?-->/g, "");
  return noBlocks
    .split(/\r?\n/)
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("#"));
    })
    .join("\n");
}

// lab.html's <script> body — where the rendering actually happens, and the only place a forward
// claim could be made in code rather than in prose.
function scriptOnly(src) {
  const m = /<script>([\s\S]*?)<\/script>/.exec(src || "");
  return m ? codeOnly(m[1]) : "";
}

{
  const hits = [];
  for (const [label, src] of [["lab.html", page], ["lab_server.cjs", server]]) {
    if (!src) continue;
    const code = codeOnly(src);
    for (const f of FORBIDDEN) if (f.test(code)) hits.push(`${label}: ${f}`);
  }
  hits.length
    ? bad("CPU-ONLY: no WebGL, no WebGPU, no Three.js", hits.join("; "))
    : ok("CPU-ONLY: no WebGL, no WebGPU, no Three.js",
        "a 2d context and arithmetic. The release contract forbids all three, and a rendered " +
        "surface is exactly where that rule gets broken by convenience.");
}

{
  page && page.includes('getContext("2d")')
    ? ok("it renders from a 2D context", "isometric projection done in arithmetic, no library")
    : bad("it renders from a 2D context", "no 2d context found — what is drawing this?");
}

// ---- ZERO NODES, which is the whole discipline of L0 -------------------------------------------

{
  // The words L1 and later introduce. If any appears in L0's code, this build has reached forward
  // into a claim it has not earned, and L2's swap test is compromised before it is written.
  // Scanned in the SCRIPT BODY only. The page's header comment explains at length why L0 names no
  // truth_class, and convicting that sentence would be the same mention-for-use error as above —
  // it caught me here too, in the same run.
  const EARLY = ["truth_class", "receipt_ref", "evidence_class", "material(", "fogged", "authorable"];
  const code = scriptOnly(page);
  const reached = EARLY.filter((w) => code.includes(w));

  reached.length === 0
    ? ok("ZERO NODES: L0 reaches forward into nothing",
        "no truth_class, no receipt_ref, no evidence_class, no material — L2 must be able to FAIL " +
        "on swapped materials, and it cannot prove that against a renderer that already assumed them")
    : bad("ZERO NODES: L0 reaches forward into nothing",
        `L0 already names ${reached.join(", ")} — the swap test is compromised before it is written`);
}

{
  // And it must SAY zero rather than merely be zero. A surface showing nothing should state that
  // it shows nothing, so a reader can tell an empty room from a broken feed.
  server && /nodes:\s*0\b/.test(server)
    ? ok("it declares its own census, and the honest number is zero",
        "/api/lab reports nodes: 0 with the reason — an empty room and a broken feed look identical " +
        "from outside unless one of them says so")
    : bad("it declares its own census, and the honest number is zero", "/api/lab does not report nodes: 0");
}

// ---- the geometry L0 promised ------------------------------------------------------------------

{
  const promised = { floor: /drawFloorAndGrid/, walls: /function wall\(/, shells: /SHELLS/,
                     arches: /ARCHES/, dome: /DOME/, you: /drawYou/ };
  const missing = Object.entries(promised).filter(([, re]) => !re.test(page || "")).map(([k]) => k);
  missing.length
    ? bad("floor, walls, three shells, five arches, the dome", `missing: ${missing.join(", ")}`)
    : ok("floor, walls, three shells, five arches, the dome", "all present");

  // Counted from the declarations themselves, tolerant of the alignment whitespace that made the
  // first version of this check report 2 shells where there are 3.
  const shells = (page.match(/\{\s*x:\s*\d+\s*,\s*y:\s*\d+\s*,\s*w:\s*\d+\s*,\s*h:\s*\d+\s*,\s*label/g) || []).length;
  const arches = (page.match(/\{\s*x:\s*\d+\s*,\s*y:\s*\d+\s*\}/g) || []).length;
  shells === 3 && arches === 5
    ? ok("the counts are the ones L0 promised", `${shells} room shells · ${arches} arches`)
    : bad("the counts are the ones L0 promised", `${shells} shells (want 3) · ${arches} arches (want 5)`);
}

{
  const controls = ["w", "a", "s", "d"].every((k) => page.includes(`keys.has("${k}")`));
  controls && /addEventListener\("click"/.test(page)
    ? ok("WASD and click-to-stand", "he opens /lab and walks around — that is L0's whole acceptance")
    : bad("WASD and click-to-stand", "the room cannot be walked");
}

// ---- it cannot change anything by being looked at ----------------------------------------------

{
  // AMENDED 2026-07-28, AND THIS GATE IS THE ONE THAT CAUGHT IT.
  //
  // Through L4 the lab was GET-only BY OMISSION — not a guarded POST branch, an ABSENT one, the same
  // property Gaia holds — and this check asserted exactly that. L5 needed a branch: the desk RUNS a
  // registered gate, which does something, and dressing that as a GET to keep this clause true would
  // have been the dishonest way to preserve it. So the clause is now FALSE and cannot be made true
  // again without deleting a build. It is amended in place rather than deleted, and what it asserts
  // now is the strongest thing that IS true:
  //
  //   there is exactly ONE non-GET route, it is named, it is matched EXACTLY, and it is not L0's.
  //
  // An exact-match set of one is not a prefix and not a wildcard, because a prefix is how one
  // exception becomes a class of them. If a second member ever appears here, this fails.
  const allowed = (server || "").match(/const POST_ALLOWED = new Set\(\[([^\]]*)\]\)/);
  const members = allowed ? allowed[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];
  const exactMatch = /POST_ALLOWED\.has\(url\.pathname\)/.test(server || "");
  const refusesOthers = /req\.method !== "GET"/.test(server || "");
  // Any write branch NOT reached through the named carve-out.
  const strayWrite = /req\.method\s*===\s*"(PUT|DELETE|PATCH)"/.test(server || "");

  members.length === 1 && exactMatch && refusesOthers && !strayWrite
    ? ok("read-only apart from ONE named, exact-match route",
        `the only non-GET path is ${members[0]} — L5's desk, which runs a registered gate in a ` +
        `throwaway worktree and writes nothing. Everything else, every method, is refused before a ` +
        `route is considered. THIS CHECK USED TO SAY "by OMISSION, not by guard" and that stopped ` +
        `being true at L5; the sentence changed rather than the branch being disguised as a GET.`)
    : bad("read-only apart from ONE named, exact-match route",
        `carve-out members=[${members.join(", ")}] exact-match=${exactMatch} ` +
        `refuses-others=${refusesOthers} stray-write-branch=${strayWrite}`);
}

{
  // SCOPED 2026-07-28. This used to scan the WHOLE server file for any mention of real evidence, and
  // it was the right instrument when the server served L0 alone. It is not any more: L3, L4 and L5
  // all read real state through it, and this check kept passing only because their reading lives one
  // `require` away — an accident of file layout, not a property. A green that survives by accident is
  // a false green, and this project treats those as the worst outcome, so the check is narrowed to
  // what it was ever really about: L0'S OWN ROUTE reaches forward into nothing.
  const handler = (server || "").match(/if \(url\.pathname === "\/api\/lab"\) \{[\s\S]*?\n  \}/);
  const l0Handler = handler ? codeOnly(handler[0]) : "";
  const readsState = /control_plane|gates\.ndjson|ledger\.ndjson|phase9_plan|projection\.|rooms\.|desk\./.test(l0Handler);
  const declaresZero = /nodes: 0/.test(l0Handler);

  l0Handler && !readsState && declaresZero
    ? ok("L0's OWN route reads no real state",
        "/api/lab returns a fixed census of nodes: 0 and touches no evidence. The projection is L3's " +
        "build and arriving early would mean showing real gates before anything can say what a " +
        "fogged one looks like. NARROWED FROM A WHOLE-FILE SCAN, which stopped meaning anything once " +
        "L3, L4 and L5 shared this server — it was passing by accident of file layout.")
    : bad("L0's OWN route reads no real state",
        l0Handler ? `reads-state=${readsState} declares-zero=${declaresZero}` : "the /api/lab handler was not found");
}

// ---- verdict -------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l0, ` +
    `${results.length - failed.length}/${results.length} checks`
);
console.log("  Open it: node viewer/lab/lab_server.cjs  ->  http://127.0.0.1:8103/lab");
process.exit(failed.length === 0 ? 0 : 1);
