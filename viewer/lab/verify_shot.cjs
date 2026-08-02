// verify_shot.cjs — THE SCREENSHOT GATE, AND IT MUST BITE. (Phase 9 step 4.6, build L2)
//
//   L2 shows: "the gate passes, then FAILS on swapped materials"
//   4.6's p3:  M1 — `verify_shot --mutate` MUST FAIL
//   4.6's falsifier: "he cannot tell them apart, or CAN FOR A REASON THAT IS NOT truth_class"
//
// A screenshot gate is worth exactly what its mutation is worth. One that only ever compares a
// render to a golden proves the renderer is DETERMINISTIC, which is not the claim — the claim is
// that the five materials are TELLABLE APART, and the only way to test that is to swap two and
// require the picture to change.
//
//     node viewer/lab/verify_shot.cjs             renders, compares to the golden, must PASS
//     node viewer/lab/verify_shot.cjs --mutate    swaps two materials, MUST FAIL
//     node viewer/lab/verify_shot.cjs --bless     writes the golden (deliberate, and it says so)
//
// AND IT CHECKS EVERY PAIR, not just the one it swaps. Ten pairs over five materials: if any two
// render identically, the gate says WHICH two, because "he can tell them apart" has to be true of
// every pair and not just of the ones a test happened to pick.
//
// No browser. No GPU. `viewer/lab/shot.cjs` rasterises on the CPU with nothing but zlib, and takes
// its material rule by EXTRACTING IT FROM l1.html — one statement of the rule, not a third copy.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const S = require("./shot.cjs");

const GOLDEN = path.join(S.HERE, "shots", "l1_materials.png");
const MUTATE = process.argv.includes("--mutate");
const BLESS = process.argv.includes("--bless");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const nodes = S.fixture();

// THE MUTATION. lit_solid and seamed_solid are chosen deliberately: they are the CLOSEST PAIR in
// the contract — both solid, both full height, differing only in whether the body is visibly
// joined. If a swap is going to slip past a screenshot, it slips past here.
const SWAP = { lit_solid: "seamed_solid", seamed_solid: "lit_solid" };

const shot = S.png(S.render(nodes, MUTATE ? SWAP : null));

if (BLESS) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, shot);
  console.log("BLESSED %s (%d bytes, sha %s)", path.relative(S.HERE, GOLDEN), shot.length, sha(shot).slice(0, 16));
  console.log("  A golden is a claim that this is what the contract looks like. Written only when");
  console.log("  asked for by name — never as a side effect of a failing comparison.");
  process.exit(0);
}

// ---- 1: the render matches the golden -----------------------------------------------------------

if (!fs.existsSync(GOLDEN)) {
  bad("a golden exists", `${GOLDEN} is absent — run with --bless, deliberately`);
} else {
  const golden = fs.readFileSync(GOLDEN);
  const same = golden.equals(shot);

  if (MUTATE) {
    // M1, AND THE POLARITY MATTERS. The plan says `verify_shot --mutate` MUST FAIL, so the gate
    // FAILS here — the red IS the proof, and it is what the operator watches.
    //
    // The first version of this reported the caught mutation as a `ok` and exited 0. That was
    // backwards: a mutation gate that goes green when it catches something teaches a reader that
    // green means nothing in particular, and it cannot be watched to bite. The one outcome that
    // would mean the gate is broken — the swap slipping through — must be the one that exits 0
    // nowhere, so BOTH branches below fail and only the reasons differ.
    same
      ? bad("MUTATION SLIPPED THROUGH — 4.6's falsifier has FIRED",
          "swapping lit_solid and seamed_solid changed NOTHING. The two closest materials in the " +
          "contract render identically, so a node drawn SOLID where the contract says JOINED would " +
          "pass this gate unseen. The five are not tellable apart.")
      : bad("EXPECTED FAILURE — the gate bit, which is what --mutate is for",
          `golden ${sha(golden).slice(0, 12)} vs mutated ${sha(shot).slice(0, 12)}. The swap was ` +
          `lit_solid <-> seamed_solid, the CLOSEST pair in the contract, and the screenshot saw it. ` +
          `THIS RED IS THE PROOF: a screenshot gate is worth exactly what its mutation is worth.`);
  } else {
    same
      ? ok("the render matches the golden", `${shot.length} bytes, sha ${sha(shot).slice(0, 16)}`)
      : bad("the render matches the golden",
          `golden ${sha(golden).slice(0, 12)} vs fresh ${sha(shot).slice(0, 12)} — either the ` +
          `contract changed and the golden was not re-blessed, or something changed that should not have`);
  }
}

// ---- 2: EVERY PAIR, because the claim is about all five ------------------------------------------

{
  const MATERIALS = ["lit_solid", "seamed_solid", "translucent", "staged", "fog"];
  const one = (m) => {
    const cv = S.canvas(S.CELL, S.H);
    S.swatch(cv, 0, m);
    return sha(cv.px);
  };
  const digests = Object.fromEntries(MATERIALS.map((m) => [m, one(m)]));

  const collisions = [];
  for (let i = 0; i < MATERIALS.length; i++)
    for (let j = i + 1; j < MATERIALS.length; j++)
      if (digests[MATERIALS[i]] === digests[MATERIALS[j]])
        collisions.push(`${MATERIALS[i]} == ${MATERIALS[j]}`);

  collisions.length
    ? bad("all TEN pairs render differently", collisions.join("; "))
    : ok("all TEN pairs render differently",
        "five materials, ten pairs, ten distinct rasters — 'he can tell them apart' has to be true " +
        "of every pair, not only of the ones a test happened to pick");
}

// ---- 3: and they differ in FORM, so greyscale does not collapse them ------------------------------

{
  // The falsifier's second half: "or CAN for a reason that is NOT truth_class". A hue difference is
  // exactly that reason — it survives a colour screenshot and dies in a greyscale one, and it fails
  // a colour-blind reader outright. So the pairs must still differ with colour thrown away.
  const MATERIALS = ["lit_solid", "seamed_solid", "translucent", "staged", "fog"];
  const grey = (m) => {
    const cv = S.canvas(S.CELL, S.H);
    S.swatch(cv, 0, m);
    // Luminance only, quantised hard, so a mere shade difference cannot carry the distinction.
    const g = Buffer.alloc(S.CELL * S.H);
    for (let i = 0; i < g.length; i++) {
      const l = (cv.px[i * 3] * 0.299 + cv.px[i * 3 + 1] * 0.587 + cv.px[i * 3 + 2] * 0.114) | 0;
      g[i] = l < 40 ? 0 : l < 140 ? 1 : 2;
    }
    return sha(g);
  };
  const d = Object.fromEntries(MATERIALS.map((m) => [m, grey(m)]));
  const collisions = [];
  for (let i = 0; i < MATERIALS.length; i++)
    for (let j = i + 1; j < MATERIALS.length; j++)
      if (d[MATERIALS[i]] === d[MATERIALS[j]]) collisions.push(`${MATERIALS[i]} == ${MATERIALS[j]}`);

  collisions.length
    ? bad("they differ IN GREYSCALE too — form, not hue", collisions.join("; "))
    : ok("they differ IN GREYSCALE too — form, not hue",
        "quantised to three luminance levels with colour thrown away, all ten pairs still differ. " +
        "A hue-only distinction dies in a greyscale screenshot and fails a colour-blind reader.");
}

// ---- verdict --------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l2-shot${MUTATE ? " (--mutate)" : ""}, ` +
    `${results.length - failed.length}/${results.length} checks`
);
if (!MUTATE) {
  console.log("  Now prove it bites:  node viewer/lab/verify_shot.cjs --mutate   (MUST fail)");
}
process.exit(failed.length === 0 ? 0 : 1);
