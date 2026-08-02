// verify_lab_l6.cjs — THE L6 GATE (Phase 9 step 4.6, build 6): the gauntlet holds, and the co-sign
// holds too — for the operator, not for me.
//
// L6 is the last build of the lab, and it is the first that is partly NOT MINE. The gauntlet is
// mine to prove: every lab gate green, in sequence, as one lab. The co-sign is the operator's to
// give: it DEFAULTS TO HOLD, and this gate proves nothing in the repository can lift it — the one
// property that makes "default HOLD" a fact rather than a label.
//
// WHAT THIS GATE MUST NOT LET SHIP
// ---------------------------------
//   1. A gauntlet that reports green while a gate FAILED or was KILLED. Proved to bite by pointing
//      the sequence at a KNOWN-RED gate and requiring all_green to go false.
//   2. A co-sign that reads HOLD as a hardcoded string rather than a measured refusal. Proved by the
//      pure decision reading CLEAR when a path would admit a human, and HOLD when none would.
//   3. Any path from this build to going live. The module writes nothing and never touches spend().
//
// Usage: node viewer/lab/verify_lab_l6.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const path = require("path");

const G = require("./gauntlet.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const src = fs.readFileSync(path.join(__dirname, "gauntlet.cjs"), "utf8");
const uncommented = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
const page = fs.readFileSync(path.join(__dirname, "l6.html"), "utf8");

// ---- THE GAUNTLET RUNS EVERY LAB GATE, AND ALL SIX ARE GREEN ---------------------------------------

const run = G.runGauntlet();

{
  const expected = ["L0", "L1", "L2", "L3", "L4", "L5"];
  const got = run.builds.map((b) => b.id);
  const missing = expected.filter((id) => !got.includes(id));

  run.builds.length === 6 && missing.length === 0 && run.all_green && run.killed.length === 0
    ? ok("the gauntlet runs every lab build, and all six are green",
        run.builds.map((b) => `${b.id}=${b.checks}`).join(" · ") + ` — ${run.passed}/${run.of} green in ` +
        `sequence, none killed. This is the whole lab proven AS ONE, which is what "welcome everyone ` +
        `into the lab" means: the surface is complete and it holds end to end.`)
    : bad("the gauntlet runs every lab build, and all six are green",
        `builds=${run.builds.length} missing=[${missing.join(",")}] all_green=${run.all_green} ` +
        `killed=[${run.killed.join(",")}] · ${run.builds.filter((b) => !b.passed).map((b) => b.id).join(",")} not green`);
}

{
  // MUTATION: point the sequence at a gate that is RED and require all_green to go false. A gauntlet
  // that cannot report a failure is a green light wired to nothing. This used to borrow `ip-fence`
  // ("RED BY ACCEPTANCE"), but that coupling broke on 2026-08-01 when the IP->DNS remediation turned
  // ip-fence GREEN — a mutation proof must OWN its red, not depend on another gate's state. So it now
  // points at viewer/lab/_gauntlet_red_probe.cjs, a fixture that exists only to fail deterministically.
  const red = G.runGauntlet(() => {}, [{ id: "RED", title: "a known-red gate", gate: "viewer/lab/_gauntlet_red_probe.cjs" }]);
  !red.all_green && red.passed === 0 && red.builds[0] && red.builds[0].passed === false
    ? ok("the gauntlet REPORTS a failure — it is not wired green",
        `pointed at the deterministic red probe (exit ${red.builds[0].exit}), the gauntlet reads ` +
        `all_green=false and passed=0. A sequence that reports green no matter what is a light with no ` +
        `bulb; this one goes dark when a gate goes red.`)
    : bad("the gauntlet REPORTS a failure — it is not wired green",
        `red run: all_green=${red.all_green} passed=${red.passed} first-passed=${red.builds[0] && red.builds[0].passed}`);
}

{
  // L2's gate is verify_shot.cjs, and the gauntlet must NAME that rather than look like a gap. A
  // reader who expects verify_lab_l2.cjs and finds a shot gate should be told it is correct.
  const l2 = run.builds.find((b) => b.id === "L2");
  l2 && /verify_shot\.cjs/.test(l2.gate)
    ? ok("L2 is proved by the screenshot gate, and the gauntlet names it",
        "verify_shot.cjs — the CPU rasteriser whose --mutate MUST FAIL. Not a missing verify_lab_l2.cjs, " +
        "and said so rather than leaving a gap a reader has to explain.")
    : bad("L2 is proved by the screenshot gate, and the gauntlet names it", `L2 gate = ${l2 && l2.gate}`);
}

// ---- THE CO-SIGN DEFAULTS TO HOLD, AND IT IS COMPUTED --------------------------------------------------

const co = G.coSign();

{
  co.state === "HOLD" && co.paths.length === 7 && co.paths.every((p) => p.refused)
    ? ok("the co-sign DEFAULTS TO HOLD — every path to air refuses",
        `all 7 paths refused (${[...new Set(co.paths.map((p) => p.code))].join(", ")}), claim level ` +
        `${co.claim_level}. Going live needs a presence token nothing here can mint. This is not a ` +
        `verdict this gate reached — it is F31's refusal, read.`)
    : bad("the co-sign DEFAULTS TO HOLD — every path to air refuses",
        `state=${co.state} paths=${co.paths.length} refused=${co.paths.filter((p) => p.refused).length}`);
}

{
  // COMPUTED, not hardcoded. The pure decision reads CLEAR the instant a path would admit a human,
  // and HOLD when none would — so today's HOLD is a measurement of the guard's refusals, not a
  // string. A HOLD that cannot become CLEAR is a red light painted on, and says nothing.
  const allHold = G.coSignStateFrom([{ allowed: false }, { allowed: false }]);
  const oneClear = G.coSignStateFrom([{ allowed: false }, { allowed: true }]);
  allHold === "HOLD" && oneClear === "CLEAR"
    ? ok("the co-sign is COMPUTED from the refusals, not hardcoded",
        "all-refused → HOLD, one-admitted → CLEAR. So the HOLD reported above is the guard actually " +
        "refusing all seven, and the day a presence mint exists and admits a human, this reads CLEAR " +
        "on its own — which is the whole point of measuring rather than asserting.")
    : bad("the co-sign is COMPUTED from the refusals, not hardcoded", `all-refused=${allHold} one-admitted=${oneClear}`);
}

{
  // The HOLD must name WHOSE it is and WHY, in the payload — a threshold with no account of who may
  // cross it teaches the reader it is just broken.
  const namesStops = /S6/.test(co.why_hold) && /S5/.test(co.why_hold) && /S2/.test(co.why_hold);
  const namesCheckpointE = /CHECKPOINT E/i.test(co.the_operators_move) && /truth_class/.test(co.the_operators_move) && /NO TEXT READ/i.test(co.the_operators_move);
  namesStops && namesCheckpointE
    ? ok("the co-sign names whose it is: the operator's, at Checkpoint E",
        "the HOLD names S6 (the mint does not exist), S5 (ADR-0008 not adopted) and S2 (the OBS " +
        "WebSocket has no auth), and the operator's move is CHECKPOINT E — two images, distinguishable " +
        "with NO TEXT READ, for a reason that is truth_class. That is M8, the operator's eye, which no " +
        "gate can stand in for.")
    : bad("the co-sign names whose it is: the operator's, at Checkpoint E",
        `stops-named=${namesStops} checkpoint-E-named=${namesCheckpointE}`);
}

// ---- NOTHING HERE CAN GO LIVE, OR LIFT THE CO-SIGN ----------------------------------------------------

{
  // ENUMERATED, not word-matched — the same fix L4's "nothing here can open anything" needed. A
  // regex for `4455` or `StartStream` convicts the PROSE that explains the S2 hazard (this check's
  // first version did exactly that). What matters is which guard members the code CALLS: reads only,
  // never spend() or requireHumanOrThrow(), which are the two that could lift the co-sign.
  const READ_ONLY = new Set(["mayGoLive", "presence", "CLAIM_LEVEL"]);
  const touched = [...new Set([...uncommented.matchAll(/\bguard\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]))];
  const reachableActuators = touched.filter((m) => !READ_ONLY.has(m));
  const doesPost = /method:\s*["']POST["']|https?\.request\(|\.write\(.*StartStream/i.test(uncommented);
  const writes = /writeFileSync|appendFileSync|createWriteStream|mkdirSync|fs\.write\b/.test(uncommented);

  reachableActuators.length === 0 && !doesPost && !writes
    ? ok("the gauntlet cannot go live, and writes nothing",
        `it touches guard.{${touched.join(", ")}} — every one a READ — and nothing else. No spend(), no ` +
        `requireHumanOrThrow(), no POST, no write. A surface that draws the co-sign must not be able to ` +
        `sign it: the co-sign is the operator's, and code that could lift it would be lifting it.`)
    : bad("the gauntlet cannot go live, and writes nothing",
        `reachable actuators: ${reachableActuators.join(", ") || "none"} · posts=${doesPost} · writes=${writes}`);
}

// ---- THE PAGE PRESENTS HOLD, NOT GO ---------------------------------------------------------------------

{
  const saysHold = /HOLD/.test(page) && !/>\s*GO\s*</.test(page.replace(/<!--[\s\S]*?-->/g, ""));
  const saysCheckpointE = /Checkpoint E/i.test(page);
  const hasNoLiveButton = !/method=["']POST["']|golive|StartStream|:8098/i.test(page.replace(/<!--[\s\S]*?-->/g, ""));
  saysHold && saysCheckpointE && hasNoLiveButton
    ? ok("the page presents HOLD and names Checkpoint E, with no way to go live from it",
        "the walk ends at a threshold that reads HOLD and says the next move is the operator's — there " +
        "is no button, no POST, no path to air on the page. He crosses it; the page cannot.")
    : bad("the page presents HOLD and names Checkpoint E, with no way to go live from it",
        `says-hold=${saysHold} names-checkpoint-E=${saysCheckpointE} no-live-button=${hasNoLiveButton}`);
}

// ---- CHECKPOINT E IS DELIVERABLE: the two images are on the surface, and they differ ----------------------
//
// The organic-operator co-sign HELD and found this: L6 told the operator "look at two images,
// distinguishable with no text read" while the page showed NONE — his one move was homework. The two
// images are now rendered from L2's own rasteriser (golden vs the canonical material swap), so the
// move is one glance. A Checkpoint E with nothing to look at is not a co-sign; it is a dead end.
{
  const twoImages = (page.match(/\/api\/lab\/shot\?swap=[01]/g) || []);
  const bothVariants = twoImages.some((s) => /swap=0/.test(s)) && twoImages.some((s) => /swap=1/.test(s));

  let differ = false, err = null;
  try {
    const shot = require("./shot.cjs");
    const nodes = shot.fixture();
    const golden = shot.png(shot.render(nodes, null));
    const swapped = shot.png(shot.render(nodes, { lit_solid: "seamed_solid", seamed_solid: "lit_solid" }));
    differ = !golden.equals(swapped) && golden.length > 100 && swapped.length > 100;
  } catch (e) { err = e.message; }

  bothVariants && differ
    ? ok("Checkpoint E is deliverable — the two images are on the surface and they DIFFER",
        "the co-sign panel renders L2's golden fixture and its canonical material swap side by side, " +
        "unlabelled, and the two PNGs are not byte-identical — so the operator's one move (do these " +
        "differ, and is it the material?) is a glance, not homework. The organic-operator co-sign held " +
        "on exactly this gap; it is closed, and the HOLD it names stays the operator's to lift.")
    : bad("Checkpoint E is deliverable — the two images are on the surface and they DIFFER",
        `both-variants-on-page=${bothVariants} images-differ=${differ}${err ? " render-error=" + err : ""}`);
}

// ---- verdict ---------------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l6, ${results.length - failed.length}/${results.length} checks`
);
console.log(`  THE GAUNTLET: ${run.passed}/${run.of} green.  THE CO-SIGN: ${co.state} — the operator's, at Checkpoint E.`);
process.exit(failed.length === 0 ? 0 : 1);
