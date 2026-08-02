// resonance_meter.cjs — THE RESONANCE LATTICE METER. It measures the distance, and refuses to flatter.
//
// IT IS DELIBERATELY NOT NAMED verify_*, AND THAT IS A BUG FIX RATHER THAN A PREFERENCE.
// It was registered as gate 23 under the name verify_resonance.cjs, and IT RECURSED: layer L2
// measures whether the instruments run by invoking gate_runner.cjs, and the runner invokes every
// registered verify_* file — including this one. Each nested meter started another runner. The
// runner reported it UNKNOWN because it timed out, which is the runner being right twice: its law
// caught the contradiction and its timeout stopped the recursion.
//
// THE METER MEASURES THE GATES, SO IT CANNOT BE ONE OF THEM. A ruler that is also among the things
// it measures will eventually measure itself.
//
//     node viewer/resonance_meter.cjs            measure, and name the first unsatisfied layer
//     node viewer/resonance_meter.cjs --prove    prove the instrument cannot report a false FULL
//
// THE OPERATOR ASKED FOR EVIDENCE THAT THIS UNIVERSE IS FULLY RESONANT. It is not. So this gate
// exists to make that measurable rather than arguable, and — far more importantly — TO MAKE A
// FALSE "FULL" IMPOSSIBLE TO PRODUCE BY ACCIDENT.
//
// The dangerous failure here is not a red. It is a GREEN that nobody earned. CLAUDE.md: "Do not
// create apparent harmony by weakening tests, retuning a holdout, changing labels, suppressing
// adverse results, or rewriting history." A resonance meter that reads FULL because a probe threw
// and got swallowed would be that sentence coming true inside the instrument written to prevent it.
//
// So `--prove` is not decoration. It breaks each layer in turn, in memory, and requires the verdict
// to move. A meter whose needle cannot move is a painted dial.
"use strict";

const R = require("./resonance.cjs");

const PROVE = process.argv.includes("--prove");
const JSONOUT = process.argv.includes("--json");

const BAR = { FULL: "████████", PARTIAL: "████░░░░", BROKEN: "██░░░░░░", UNMEASURED: "░░░░░░░░" };

function report(m) {
  console.log("\n  THE RESONANCE LATTICE — seven layers, root to crown, CONJUNCTIVE\n");
  for (const l of m.layers) {
    const mark = l.state === "FULL" ? " " : l.id === (m.first_unsatisfied || "").slice(0, 2) ? "◀" : " ";
    console.log(`  ${l.id}  ${BAR[l.state]}  ${l.state.padEnd(10)} ${l.name} ${mark}`);
    console.log(`      ${l.detail}`);
    for (const n of l.notes) console.log(`      · ${n}`);
    console.log("");
  }

  console.log("  " + "─".repeat(96));
  if (m.resonant) {
    console.log("  RESONANT: every layer FULL.");
    console.log("  Read this with suspicion, not relief — check `--prove` still moves the needle.");
  } else {
    console.log(`  NOT RESONANT. FIRST UNSATISFIED LAYER: ${m.first_unsatisfied}`);
    console.log("");
    console.log("  The lattice is CONJUNCTIVE and ordered by dependency, so everything ABOVE the");
    console.log("  first unsatisfied layer is reported but NOT CREDITED. A crown claim standing on a");
    console.log("  broken root is the precise failure this programme exists to prevent, and averaging");
    console.log("  the two into a percentage would hide exactly that.");
  }
  console.log("  " + "─".repeat(96));
}

// ---- --prove: the needle must move ---------------------------------------------------------------

function prove(real) {
  const results = [];
  const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
  const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

  // `real` is passed in when the caller has already measured, because THE FIRST VERSION OF THIS
  // FUNCTION RE-MEASURED THE WHOLE SYSTEM NINE TIMES. Every injection left six live probes running
  // the full gate runner and `mix test`, so proving the meter took several minutes — and an
  // instrument that slow is an instrument nobody runs, which is the same as not having one.
  //
  // The proof does not need real probes at all: it is testing the LATTICE ARITHMETIC, not the
  // system. So every probe is stubbed first and then broken one at a time, and the whole thing is
  // instant.
  //
  // AND THAT IS EXACTLY AS MUCH AS THE SEVEN CHECKS BELOW ESTABLISH — corrected 2026-07-28.
  // An adversarial sweep read this file's header claim ("TO MAKE A FALSE 'FULL' IMPOSSIBLE TO
  // PRODUCE BY ACCIDENT… a meter whose needle cannot move is a painted dial") against what the
  // checks do, and the verdict was fair: EVERY probe is replaced by a constant BEFORE the break is
  // injected, so what the seven CONJUNCTIVE checks prove is that
  // `layers.find(l => l.state !== "FULL")` returns the first non-FULL element — three lines of
  // arithmetic, seven times. The needle being moved was a painted one. The concession was in the
  // comment; the emitted verdict said `GATE: PASS - resonance-instrument` with no such caveat.
  //
  // The arithmetic still needs proving and these checks still do it. What was missing is the other
  // half — that A REAL PROBE DETECTS A REAL BREAK — and check 3b below now supplies it against L3,
  // unstubbed, on a genuinely altered registry.
  //
  // `real` IS NOW OPTIONAL, AND THAT TOOK --prove FROM 721 SECONDS TO UNDER A SECOND.
  //
  // This line used to read `if (!real) real = R.measure();`, and the --prove entry point at the foot
  // of this file calls prove() with NO ARGUMENT. So the flag whose whole purpose is the stubbed,
  // instant lattice arithmetic ran a FULL REAL MEASUREMENT first: four gate_runner invocations, a
  // git worktree add/remove at L1, and `mix test` at L6. MEASURED 2026-07-30: 721 seconds, twelve
  // minutes, exit 0. And `real` feeds EXACTLY ONE THING — the headline narrator line below, which
  // the comment beside it already declares is NOT a counted check. Twelve minutes of gate runs to
  // print one sentence that proves nothing about the meter.
  //
  // That cost is why nothing runs this instrument. It is in no CI job, no script and no registry
  // entry (deliberately — a ruler among the things it measures would measure itself), so the ONLY
  // way it ever runs is a human typing it, and a twelve-minute command is one nobody types.
  //
  // NOT DELETED, MADE OPTIONAL. The main path at the foot of this file still measures for real and
  // passes the result in, so the full reading is unchanged there. Only `--prove` skips it, and it
  // says so in place of the headline rather than printing a hopeful blank.
  //
  // AND THE OBVIOUS ONE-LINE VERSION OF THIS FIX CRASHES. Deleting the assignment alone is not
  // enough: the headline below dereferences `real.resonant` directly, so on the --prove path it
  // would throw a TypeError and turn the proof into a stack trace. Every read of `real` has to be
  // guarded, not just the one that looks like the culprit.

  const saved = R.LAYERS.map((l) => l.probe);
  const stubAll = (state) =>
    R.LAYERS.forEach((l) => { l.probe = () => ({ state, notes: [], detail: "stub" }); });
  const restore = () => R.LAYERS.forEach((l, i) => { l.probe = saved[i]; });

  // 1. It must be CONJUNCTIVE: one broken layer makes the whole false, wherever it sits.
  for (const victim of R.LAYERS) {
    stubAll("FULL");
    victim.probe = () => ({ state: "BROKEN", notes: ["injected"], detail: "injected" });
    const m = R.measure();
    restore();

    if (m.resonant) {
      bad(`CONJUNCTIVE at ${victim.id}`, "a BROKEN layer still reported the whole as resonant");
    } else if (!m.first_unsatisfied.startsWith(victim.id) &&
               R.LAYERS.findIndex((l) => l.id === victim.id) <
               R.LAYERS.findIndex((l) => m.first_unsatisfied.startsWith(l.id))) {
      bad(`CONJUNCTIVE at ${victim.id}`, `broke ${victim.id} and it named ${m.first_unsatisfied} instead`);
    } else {
      ok(`CONJUNCTIVE at ${victim.id}`, `breaking it makes the whole NOT resonant`);
    }
  }

  // 2. A THROWING probe must be UNMEASURED, never FULL. This is the false-green that would be
  //    easiest to ship and hardest to notice: a check that errors, gets swallowed, and reads clean.
  {
    stubAll("FULL");
    R.LAYERS[0].probe = () => { throw new Error("probe exploded"); };
    const m = R.measure();
    restore();
    const l = m.layers[0];
    l.state === "UNMEASURED" && !m.resonant
      ? ok("A THROWING PROBE IS 'UNMEASURED', NEVER 'FULL'",
          "a layer nobody could look at is a layer nobody can vouch for — collapsing it into FULL " +
          "is precisely how a green board lies")
      : bad("A THROWING PROBE IS 'UNMEASURED', NEVER 'FULL'", `it reported ${l.state}, resonant=${m.resonant}`);
  }

  // 3. It must be able to say FULL — otherwise every red above is vacuous and the meter is just a
  //    pessimist. NEGATIVE CONTROL.
  {
    stubAll("FULL");
    const m = R.measure();
    restore();
    m.resonant && m.first_unsatisfied === null
      ? ok("NEGATIVE CONTROL: it CAN report FULL",
          "a meter that can never read full is a pessimist, not an instrument, and every red it " +
          "prints would mean nothing")
      : bad("NEGATIVE CONTROL: it CAN report FULL", `all-FULL still reported ${m.first_unsatisfied}`);
  }

  // 3b. A REAL PROBE, UNSTUBBED, DETECTING A REAL BREAK.
  //
  // Everything above replaced every probe with a constant before injecting, so it proves the
  // lattice arithmetic and nothing about whether any probe can see anything. This is the other
  // half: L3 runs FOR REAL against a registry that has genuinely been changed, and must notice.
  //
  // The registry is not edited on disk. `resonance.cjs` is compiled in place with its REPO pointing
  // at a scratch tree that carries a modified copy — the same technique the four Gaia gates now use,
  // and for the same reason: the only difference between the module under test and the shipped one
  // must be the thing being tested.
  {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const { compileMutated } = require("./gaia/mutate.cjs");

    const REPO = path.resolve(__dirname, "..");
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "uni-reson-"));
    try {
      // A scratch tree holding ONE file: a registry with an unruled gate added.
      fs.mkdirSync(path.join(scratch, "viewer"), { recursive: true });
      const reg = JSON.parse(fs.readFileSync(path.join(REPO, "viewer", "gate_registry.json"), "utf8"));
      reg.gates.push({ id: "__unruled_probe__", file: "viewer/gate_runner.cjs", ci: true, gate_row: "x" });
      fs.writeFileSync(path.join(scratch, "viewer", "gate_registry.json"), JSON.stringify(reg, null, 2));

      // Fall back to the real repo for every file the scratch tree does not carry, so only the
      // registry differs.
      // `\r?\n`, not `\n`. The literal-string version of this pattern matched nothing on a Windows
      // checkout and `compileMutated` THREW — which is the guard working exactly as intended, and
      // the sixth time the CRLF class has bitten in this repository.
      const mutant = compileMutated(path.join(__dirname, "resonance.cjs"), [[
        /return fs\.readFileSync\(path\.join\(REPO, rel\), "utf8"\);/,
        'const alt = path.join(process.env.UNI_RESONANCE_ALT_ROOT || REPO, rel);\n' +
        '    if (fs.existsSync(alt)) return fs.readFileSync(alt, "utf8");\n' +
        '    return fs.readFileSync(path.join(REPO, rel), "utf8");',
      ]], "alt-root");

      process.env.UNI_RESONANCE_ALT_ROOT = scratch;
      const broken = mutant.exports.LAYERS.find((l) => l.id === "L3").probe();
      delete process.env.UNI_RESONANCE_ALT_ROOT;
      const healthy = R.LAYERS.find((l) => l.id === "L3").probe();

      const sawIt = broken.notes.join(" ").includes("__unruled_probe__");
      sawIt && broken.state !== "FULL"
        ? ok("A REAL PROBE DETECTS A REAL BREAK",
            `L3 ran UNSTUBBED against a registry carrying a gate nobody has ruled on, and named it: ` +
            `"${broken.detail}". Against the real registry it says "${healthy.detail}". Everything ` +
            `above this line stubs every probe before injecting, so it proves the lattice arithmetic ` +
            `and nothing about whether a probe can see. This is the half that was missing.`)
        : bad("A REAL PROBE DETECTS A REAL BREAK",
            `L3 did not notice an unruled gate: state=${broken.state} detail="${broken.detail}"`);
    } catch (e) {
      bad("A REAL PROBE DETECTS A REAL BREAK", e.message);
    } finally {
      delete process.env.UNI_RESONANCE_ALT_ROOT;
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  }

  // 4. And the honest headline: what it says about the REAL system right now. This is a NARRATOR
  //    LINE, not a counted check — corrected 2026-07-28. It was `real.resonant ? ok(...) : ok(...)`,
  //    both branches passing, yet counted in the N/N tally. A line that reports the system's state is
  //    not a proof about the meter, and inflating the check count with a line that cannot fail is the
  //    same both-branches-ok defect this instrument convicts in other gates.
  // GUARDED, because `real` is optional now. An UNMEASURED system must say so — silently printing
  // nothing here would read as "no adverse news", which is the one thing this file exists to prevent.
  const headline = !real
    ? "NOT MEASURED on this run. `--prove` proves THE METER and deliberately does not measure the " +
      "system — that costs four gate runs, a worktree and `mix test`. Run `node viewer/resonance_meter.cjs` " +
      "for the reading. UNMEASURED IS NOT A PASS."
    : real.resonant
      ? "every layer FULL — but run without --prove and believe the needle, not this line"
      : `NOT RESONANT. First unsatisfied: ${real.first_unsatisfied}. That is the honest answer.`;

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
  console.log(`\n  the real system reads: ${headline}`);
  console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - resonance-instrument, ${results.length - failed.length}/${results.length} checks`);
  console.log("  This gate proves THE METER WORKS. It says nothing about whether the system is");
  console.log("  resonant — run without --prove for that, and expect an honest red.");
  return failed.length === 0 ? 0 : 1;
}

// ---- run -----------------------------------------------------------------------------------------

if (PROVE) {
  process.exit(prove());
}

const m = R.measure();
if (JSONOUT) {
  console.log(JSON.stringify(m, null, 1));
  process.exit(0);
}
report(m);

// A RULER AND A GATE ARE DIFFERENT THINGS, AND CONFLATING THEM BROKE THE RUNNER'S LAW.
//
// The first version always exited 0 — correct for a ruler, which reports a DISTANCE, and failing
// the build because the distance is not yet zero would make every CI run red for the whole
// remaining programme and teach everyone to ignore it. But it emitted no verdict word at all, so
// gate_runner.cjs read UNKNOWN and recorded a LAW VIOLATION: an exit code contradicting no verdict.
// The runner was right. The ruler was wrong to be registered as though it were a gate.
//
// Resolved by SEPARATING THE TWO CLAIMS rather than weakening either:
//   THE GATE'S VERDICT is about the INSTRUMENT — can this meter still be trusted to move?
//   THE LATTICE READING is the measurement, printed above, and its distance is not a failure.
//
// So a red here means THE METER IS BROKEN, which is worth failing a build over. A system that is
// not yet resonant is not a broken meter — it is the news the meter exists to carry.
const instrumentOk = prove(m) === 0;

console.log(
  `\nGATE: ${instrumentOk ? "PASS" : "FAIL"} - resonance-instrument ` +
    `(the METER is ${instrumentOk ? "sound" : "BROKEN"}; the system reads ` +
    `${m.resonant ? "RESONANT" : "NOT RESONANT — " + m.first_unsatisfied})`
);
if (instrumentOk && !m.resonant) {
  console.log("  This gate is GREEN and the system is NOT resonant. Both are true: the meter works,");
  console.log("  and it is telling you the distance. Read the lattice above, not this line.");
}
process.exit(instrumentOk ? 0 : 1);
