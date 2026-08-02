// resonance.cjs — THE RESONANCE LATTICE. Seven layers, root to crown, and it is CONJUNCTIVE.
//
// WHAT THIS IS FOR
// ----------------
// The operator asked for evidence that this universe is fully resonant. It is not, and a tool that
// said it was would be the single worst defect in the system — CLAUDE.md's own words: "Do not
// create apparent harmony by weakening tests, retuning a holdout, changing labels, suppressing
// adverse results, or rewriting history."
//
// So this is not a reassurance. It is a RULER. It measures the distance to full resonance, names
// the FIRST layer that is not satisfied, and refuses to report a whole it has not earned.
//
// THE LATTICE IS CONJUNCTIVE, AND THAT IS THE WHOLE DESIGN
// --------------------------------------------------------
// Exactly like the P0..P8 parity ladder this repository already lives under: any single unsatisfied
// level makes the whole false, and the report NAMES THE FIRST UNSATISFIED LEVEL. A crown claim
// standing on a broken root is the precise failure this programme exists to prevent — the system
// that says "all green" while the ground under it does not reproduce.
//
// Layers are ordered because they DEPEND on each other. A document cannot be true (L5) about code
// that does not run (L2). A guard cannot be trusted to bite (L3) if the bytes it guards are not the
// bytes that ship (L1). Reading upward is reading in order of what has to be true first.
//
//   L1 ROOT     the ground reproduces        what git stores IS what the instruments hash
//   L2 FLOW     the instruments run          every registered gate invokes and reaches a verdict
//   L3 WILL     the guards bite              every gate has a mutation proving it can fail
//   L4 HEART    the surfaces agree           every body serves HEAD; the drift signals reconcile
//   L5 VOICE    the documents match          derived docs regenerate identically; no stale claim
//   L6 SIGHT    the unseen is NAMED          no DONE step unrecorded; every blind spot declared
//   L7 CROWN    the claim is licensed        nothing claims more than its evidence supports
//
// L6 IS NOT "EVERYTHING IS MEASURED". That would be unreachable and pretending otherwise is how a
// system starts lying. It is "everything unmeasured is NAMED" — a known blind spot is a limitation;
// an unknown one is a hazard, and the difference is whether anyone wrote it down.
//
// L7 IS NOT "THE CLAIM IS TRUE". It is "the claim does not exceed the evidence". A system correctly
// reporting P3 with P4 unsatisfied is at FULL resonance on this layer. Resonance is honesty about
// altitude, never altitude itself.
"use strict";

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..");

const sh = (cmd, opts = {}) => {
  const r = cp.spawnSync(cmd, { cwd: REPO, encoding: "utf8", shell: true, timeout: 600000, ...opts });
  return { out: (r.stdout || "") + (r.stderr || ""), code: r.status };
};
const read = (rel) => {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch {
    return null;
  }
};
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// A layer reports one of four words, and the vocabulary is deliberate.
//   FULL        measured, and satisfied
//   PARTIAL     measured, and short by a named amount
//   BROKEN      measured, and failing
//   UNMEASURED  NOT measured — and this is NOT a pass. A layer nobody looked at is a layer nobody
//               can vouch for, and collapsing it into FULL is exactly how a green board lies.
const WORDS = ["FULL", "PARTIAL", "BROKEN", "UNMEASURED"];

function layer(id, name, why, probe) {
  return { id, name, why, probe };
}

const LAYERS = [
  layer("L1", "ROOT — the ground reproduces",
    "What git stores must BE what the instruments hash. This has bitten three times: .cjs, .ex/.exs, " +
    "and the canonical gate ledger itself, whose pin was of bytes git had never stored.",
    () => {
      const notes = [];

      // THE PIN IS GONE, AND DELETING IT IS THE REPAIR FOR A FALSE RED THIS LAYER PUBLISHED.
      //
      // Until 2026-07-30 this read `const PIN = "964ea25c…"` and asked `sha(bytes) === PIN`. That
      // literal was the ledger's hash on 2026-07-28. On 2026-07-29 commit 2dcbfd2 — the OPERATOR'S
      // OWN legitimate append of one probe row, which S4 reserves to him — moved the ledger to
      // 1daac912…, and the literal stayed behind. So the layer whose charter is "what git stores
      // must BE what the instruments hash" reported BROKEN about a tree in which git's bytes and
      // the instrument's bytes were BYTE-IDENTICAL. It failed at the one thing it exists to say.
      //
      // The charter is an IDENTITY question, and an identity question needs no pin: compare the
      // working tree to the committed blob. That is literally what the sentence above means, it
      // stays true across every legitimate append, and it still goes red the instant the two
      // diverge — which is the only condition this layer was ever able to detect.
      //
      // "HAS AN AGENT WRITTEN TO gates.ndjson?" IS A DIFFERENT QUESTION and does not live here. It
      // is S4, it belongs to viewer/verify_gate_attempts.cjs, and a hash literal cannot answer it
      // either — a hash cannot tell an agent's write from the operator's. That file carries the
      // same repair and the reasoning is written out there.
      //
      // RAW BYTES, still. An earlier version read this as utf8 and re-encoded it as "binary",
      // corrupting every byte above 0x7f and reporting a FALSE RED against a correct file. A false
      // red in a resonance meter is not harmless: it is the fastest way to teach a reader that the
      // meter is noise, and a meter nobody reads is worse than none. Hashes get Buffers.
      let gatesBuf = null;
      try {
        gatesBuf = fs.readFileSync(path.join(REPO, "evidence/gates.ndjson"));
      } catch { /* absent is its own answer below */ }
      const treeSha = gatesBuf === null ? null : sha(gatesBuf);

      // The blob, which is what any OTHER machine gets. This comparison did not exist anywhere in
      // the programme until 2026-07-27, and when it was first made it failed.
      const blobR = cp.spawnSync("git", ["show", "HEAD:evidence/gates.ndjson"],
        { cwd: REPO, encoding: "buffer", maxBuffer: 1 << 26 });
      const blobSha = blobR.status === 0 ? sha(blobR.stdout) : null;

      const treeOk = treeSha !== null;
      const blobOk = blobSha !== null;
      const identical = treeOk && blobOk && treeSha === blobSha;

      const ev = sh("node viewer/verify_control_plane_evidence.cjs");
      const evOk = ev.code === 0;

      // THE QUESTION THIS PROBE DID NOT ASK, AND IT WAS THE ONE THAT MATTERED.
      //
      // The first version checked that gates.ndjson reproduces and that the Control Plane can
      // produce its own evidence. Both were true, so it printed FULL. An adversarial audit then
      // took a clean worktree of the same commit and RAN THE GATES FROM IT — and two gates I had
      // committed green that day reported FAIL from their own commit. My meter had reported a
      // FALSE GREEN on the root layer, which is the exact failure it was written to prevent.
      //
      // So the root now asks the root question: DOES THIS TREE REPRODUCE ITS OWN VERDICTS? It is
      // expensive — a worktree and a full gate run — and it is the root, which is where expense
      // belongs. Set UNI_RESONANCE_SHALLOW=1 to skip it, and it will report UNMEASURED rather than
      // FULL, because a layer nobody looked at is not a layer that passed.
      let verdictsReproduce = null;
      let verdictDetail = "not checked";
      if (process.env.UNI_RESONANCE_SHALLOW === "1") {
        verdictDetail = "SKIPPED (UNI_RESONANCE_SHALLOW=1) — this is the root question, and it is unanswered";
      } else {
        const wt = path.join(require("os").tmpdir(), "uni-resonance-root");
        sh(`git worktree remove --force "${wt}"`);
        const add = sh(`git worktree add -q --detach "${wt}" HEAD`);
        if (add.code !== 0) {
          verdictDetail = "could not create a clean worktree to compare against";
        } else {
          const here = sh("node viewer/gate_runner.cjs");
          const there = sh("node viewer/gate_runner.cjs", { cwd: wt });
          const tally = (o) => (/(Verdict tally: .+?)\./.exec(o) || [, "?"])[1];
          verdictsReproduce = tally(here.out) === tally(there.out);
          verdictDetail = verdictsReproduce
            ? `verdicts reproduce from a clean checkout (${tally(here.out)})`
            : `WORKING TREE ${tally(here.out)} vs CLEAN CHECKOUT ${tally(there.out)}`;
          sh(`git worktree remove --force "${wt}"`);
        }
      }

      if (verdictsReproduce === false)
        notes.push("THE GATES DO NOT GIVE THE SAME ANSWER FROM A CLEAN CHECKOUT — a gate that cannot reproduce its own verdict is worse than no gate, because it is trusted");
      if (verdictsReproduce === null)
        notes.push("whether the gates reproduce their own verdicts was NOT MEASURED — and unmeasured is not a pass");

      if (!treeOk) notes.push("evidence/gates.ndjson is NOT READABLE in the working tree");
      if (!blobOk) notes.push("evidence/gates.ndjson has NO COMMITTED BLOB at HEAD — no other machine can get these bytes at all");
      if (treeOk && blobOk && !identical)
        notes.push(`THE WORKING TREE AND THE COMMITTED BLOB DISAGREE — tree ${treeSha.slice(0, 16)}… vs blob ${blobSha.slice(0, 16)}… · what this machine hashes is not what git stores, so no other machine reproduces it`);
      if (!evOk) notes.push("the Control Plane cannot produce evidence it has attested");

      return {
        state: notes.length === 0 ? "FULL" : verdictsReproduce === null && identical && evOk ? "UNMEASURED" : "BROKEN",
        notes,
        detail: `gates ledger: ${identical ? `tree == blob (${treeSha.slice(0, 16)}…)` : "TREE/BLOB DISAGREE"} · control-plane evidence=${evOk ? "clean" : "FAULTS"} · ${verdictDetail}`,
      };
    }),

  layer("L2", "FLOW — the instruments run",
    "A registry entry with no runnable file, or a runnable file in no registry, is a census that " +
    "counts a ghost. The runner asserts exit<=>verdict and its own completeness.",
    () => {
      const r = sh("node viewer/gate_runner.cjs");
      const complete = /registry complete/.test(r.out);
      const violations = /(\d+) law violation/.exec(r.out);
      const tally = /Verdict tally: (.+?)\./.exec(r.out);
      const ran = /law holds for (\d+)\/(\d+) run/.exec(r.out);
      const notes = [];
      if (!complete) notes.push("the gate registry is INCOMPLETE — a gate exists that nothing invokes, or vice versa");
      if (violations && violations[1] !== "0") notes.push(`${violations[1]} gate(s) whose exit code contradicts their own verdict`);
      return {
        state: notes.length === 0 ? "FULL" : "BROKEN",
        notes,
        detail: `${ran ? ran[0] : "?"} · registry ${complete ? "complete" : "INCOMPLETE"} · ${tally ? tally[1] : "?"}`,
      };
    }),

  layer("L3", "WILL — the guards bite",
    "A guard nobody has shown can FAIL is decoration. Every gate must carry a mutation that proves " +
    "it fires, and the proof must live in the gate rather than in a memory of having checked once.",
    () => {
      const reg = JSON.parse(read("viewer/gate_registry.json"));

      // CORRECTED 2026-07-28. THIS LAYER WAS PUBLISHING A FALSE NUMBER TO THE OPERATOR.
      //
      // The detector was a word list — MUTATION|mutate|bites|falsifier|caught|… — matched against
      // the whole source, and it reported 23/25. At least four matched ON PROSE ALONE:
      // `schema-pointers` on the word "caught" while containing no mutation at all; `host-tracking`
      // on its own sentence "MUTATEs nothing, actuates nothing"; `lab-l0` on a comment about the
      // author being caught; `overlays` on prose. The paragraph it replaced warned about the
      // opposite failure — a false ACCUSATION — and over-corrected into a detector that acquits
      // everything. Both directions teach the reader that the needle means nothing.
      //
      // AND A REGEX CANNOT FIX THIS. The replacement attempt over-accused `host-tracking`, which
      // stubs `dns.lookup` to simulate a lease move, and `track`, which fires a hostile cross-site
      // request and asserts 403 — both real mutations that no pattern recognised. Whether a gate
      // has been shown to bite is a JUDGEMENT, and a judgement pretending to be a pattern match is
      // the thing this whole lattice exists to catch.
      //
      // So it is DECLARED, in the open, one line per gate — the same shape as FORWARDER_CLASS in
      // verify_golive_refuses_agents.cjs. `null` means "this gate has never been shown to fire",
      // stated rather than inferred. A gate with NO ENTRY fails the layer, so a new gate cannot
      // join the registry and be quietly counted as proven.
      const MUTATION_EVIDENCE = {
        "build-identity": "mkdtempSync", // rebuilds the module set in a temp tree and re-hashes
        gaia: "MUTATION_HANDLERS",
        "gaia-lint": null,               // the lint itself; `lint-bites` is its bite proof
        "lint-bites": "gaia_lint.cjs",   // exists solely to prove gaia-lint fires
        "golden-pins": "mkdtempSync",    // sandboxes the REAL lint, three evasion routes
        "drift-wellformed": "compileMutated",
        "schema-pointers": null,         // a pure scan — no mutation, no negative control
        "host-tracking": "dns.lookup =", // stubs the resolver to simulate a lease move
        hud: "audience-refuses-cross-site",
        overlays: null,
        colony: null,
        "deploy-lag": "compileMutated",
        "capture-age": "compileMutated",
        "witness-blocked": "compileMutated",
        "control-plane-evidence": "function sandbox()",
        "golive-refuses-agents": "function sandbox()",
        "limitations-doc": "function sandbox()",
        "gate-attempts": "MUTATION: the state follows the runner",
        "ip-fence": "NEGATIVE CONTROL: versions, wildcards and loopback are not addresses",
        "lab-l0": null,
        "lab-l1": null,
        "lab-l2-shot": "--mutate",
        "lab-l3": "MUTATION: a REAL change gets through",
        "lab-l4": "MUTATION: plant a minter",
        "lab-l5": "NO VERDICT WITHOUT A RUN",
        track: "hostile",
        "plan-consistency": "TOTALLY_MADE_UP_STATUS",   // injects an out-of-vocab status into a plan clone
        "lab-l6": "a known-red gate",   // points the gauntlet at ip-fence and requires all_green to go false
        // RULED 2026-07-30. Both were registered the same day and arrived here UNRULED, which is this
        // layer working as designed: "A new gate must be ruled on, not counted by default." Both carry
        // real, targeted, negative-controlled mutations, so both get a string anchor rather than null.
        claims: "MUTATION: every check bites",          // 5 mutations + a negative control, in-band every run
        "sight-blind": "NEGATIVE CONTROL: the unmutated page passes",
        // The operator's write route. Two chain mutations (a row edited after the fact; a row
        // renumbered or removed) and THREE negative controls — a correctly-fenced decision is still
        // recorded, the hash is key-order independent, and it still distinguishes different content.
        decision: "MUTATION: a row edited after the fact is CAUGHT",
        // The operator's SURFACE. Its bite proof is the claim-level drift check: change the level the
        // page declares and it goes red naming both sides. Proved by mutation, both directions.
        "decide-page": "CANNOT DRIFT apart",
      };

      const unruled = reg.gates.filter((g) => !(g.id in MUTATION_EVIDENCE)).map((g) => g.id);
      const declared = [];
      const missing = [];   // declared, but the anchor is no longer in the file
      const none = [];      // declared as having none
      // The anchor must appear in CODE, not merely in a comment — strengthened 2026-07-28. A gate
      // that gutted its real mutation while leaving the anchor word in a comment explaining the
      // mutation would otherwise still count as "declared present". Whole-line comments are stripped
      // before the check, so a surviving anchor is executable text.
      const codeOnly = (src) =>
        src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*")).join("\n");
      for (const g of reg.gates) {
        if (!(g.id in MUTATION_EVIDENCE)) continue;
        const anchor = MUTATION_EVIDENCE[g.id];
        if (anchor === null) { none.push(g.id); continue; }
        const src = read(g.file);
        if (src === null || !codeOnly(src).includes(anchor)) missing.push(`${g.id} (anchor "${anchor}" gone from code)`);
        else declared.push(g.id);
      }

      const notes = [];
      if (unruled.length) {
        notes.push(`${unruled.length} gate(s) have NO RULING in MUTATION_EVIDENCE: ${unruled.join(", ")}. ` +
          `A new gate must be ruled on, not counted by default.`);
      }
      if (missing.length) {
        notes.push(`${missing.length} declared mutation(s) can no longer be found: ${missing.join(", ")}. ` +
          `The gate changed and the ruling did not follow it.`);
      }
      if (none.length) {
        notes.push(`${none.length} gate(s) DECLARED as having no mutation proof: ${none.join(", ")}. ` +
          `These have never been shown to fire, and that is stated rather than inferred from a word search.`);
      }

      return {
        state: unruled.length === 0 && missing.length === 0 && none.length === 0 ? "FULL" : "PARTIAL",
        notes,
        // STRUCTURED, so L7 reads a field and not this layer's prose. Added 2026-07-28: L7 used to
        // scrape `/DECLARED as having no mutation proof: ([^.]+)\./` out of the note above, so a
        // reword of a human sentence would have flipped the CROWN toward FULL. A sibling layer's
        // verdict must not depend on another layer's wording.
        unlicensed: none,
        unruled,
        missing,
        detail: `${declared.length}/${reg.gates.length} gates carry a DECLARED mutation whose anchor is ` +
          `still present · ${none.length} declared to have none · ${unruled.length} unruled`,
      };
    }),

  layer("L4", "HEART — the surfaces agree",
    "The Door, Gaia, TRACK and the lab each claim a boot commit. A body serving code older than HEAD " +
    "is the 'running, but not the committed bytes' failure nothing used to detect.",
    () => {
      const head = sh("git rev-parse HEAD").out.trim();
      const bodies = [
        ["Door", 8090, "/api/identity"],
        ["TRACK", 8102, "/api/identity"],
        ["LAB", 8103, "/api/identity"],
      ];
      const notes = [];
      const seen = [];
      for (const [name, port, route] of bodies) {
        const r = sh(`curl -s -m 5 http://127.0.0.1:${port}${route}`);
        if (r.code !== 0 || !r.out.trim()) { seen.push(`${name}:down`); notes.push(`${name} is not answering`); continue; }
        let boot = null;
        try { boot = JSON.parse(r.out).boot_git_commit; } catch { /* not identity-shaped */ }
        if (!boot) { seen.push(`${name}:?`); notes.push(`${name} serves no boot identity`); continue; }
        seen.push(`${name}:${boot.slice(0, 7)}`);
        if (boot !== head) notes.push(`${name} is serving ${boot.slice(0, 7)}, HEAD is ${head.slice(0, 7)} — it is running code nobody committed to`);
      }
      return {
        state: notes.length === 0 ? "FULL" : "PARTIAL",
        notes,
        detail: `HEAD ${head.slice(0, 7)} · ${seen.join(" · ")}`,
      };
    }),

  layer("L5", "VOICE — the documents match the code",
    "A derived doc cannot drift, so any drift is a doc somebody wrote by hand about code that has " +
    "since moved. The generated ones are checked by regeneration; the hand-written ones are the risk.",
    () => {
      const notes = [];
      const lim = sh("node viewer/verify_limitations_doc.cjs");
      if (lim.code !== 0) notes.push("LIMITATIONS.md has drifted from its @limitation annotations");
      const att = sh("node viewer/verify_gate_attempts.cjs");
      if (att.code !== 0) notes.push("the gate-attempts sidecar has drifted from the gate ledger");
      return {
        state: notes.length === 0 ? "FULL" : "BROKEN",
        notes,
        detail: `derived docs: LIMITATIONS ${lim.code === 0 ? "current" : "DRIFTED"} · gate_attempts ${att.code === 0 ? "current" : "DRIFTED"}`,
      };
    }),

  layer("L6", "SIGHT — the unseen is NAMED",
    "NOT 'everything is measured' — that is unreachable, and pretending otherwise is how a system " +
    "starts lying. A known blind spot is a limitation; an unknown one is a hazard, and the only " +
    "difference is whether anyone wrote it down.",
    () => {
      const notes = [];
      const t = sh("mix test test/sp/control_plane/ledger_has_not_fallen_out_of_practice_test.exs");
      if (t.code !== 0) notes.push("a step marked DONE in the plan is accounted for NOWHERE in the ledger — work continued and the record did not");

      const lim = read("docs/control-plane/LIMITATIONS.md") || "";
      const declared = (lim.match(/^## `/gm) || []).length;
      if (declared === 0) notes.push("no limitation is declared anywhere — a system that admits no blind spot has not looked");

      // The plan declares a status vocabulary and nothing enforces it. Named here BECAUSE it is
      // exactly this layer's subject: an unenforced declaration is a blind spot with a label.
      const plan = JSON.parse(read("evidence/remediation/phase9_plan.json"));
      const vocab = new Set(plan.status_vocabulary);
      const rogue = [];
      for (const st of plan.stages) {
        if (!vocab.has(st.status)) rogue.push(`stage ${st.id}=${st.status}`);
        for (const s of st.steps || []) if (!vocab.has(s.status)) rogue.push(`step ${s.id}=${s.status}`);
      }
      if (rogue.length) notes.push(`${rogue.length} plan status(es) outside the declared vocabulary: ${rogue.join(", ")}`);

      return {
        state: notes.length === 0 ? "FULL" : "PARTIAL",
        notes,
        detail: `${declared} limitation(s) declared · plan statuses ${rogue.length === 0 ? "all in vocabulary" : "OUT OF VOCABULARY"} · ledger coverage ${t.code === 0 ? "complete" : "INCOMPLETE"}`,
      };
    }),

  layer("L7", "CROWN — the claim is licensed by the evidence",
    "NOT 'the claim is true'. 'The claim does not EXCEED the evidence.' A system correctly reporting " +
    "P3 with P4 unsatisfied is fully resonant here. Resonance is honesty about altitude, never altitude.",
    () => {
      const notes = [];
      // Every gate that reports PASS must be a gate that COULD HAVE reported otherwise, and every
      // gate reporting FAIL must be visible rather than suppressed. The runner already asserts the
      // law; what this layer adds is that a RED IS ALLOWED TO STAY RED.
      const r = sh("node viewer/gate_runner.cjs");
      const fails = /(\d+) FAIL/.exec(r.out);
      const failCount = fails ? Number(fails[1]) : 0;
      const unfinished = /(\d+) DID_NOT_FINISH/.exec(r.out);
      const unfinishedCount = unfinished ? Number(unfinished[1]) : 0;

      // CORRECTED 2026-07-28: THIS PROBE USED TO `return { state: "PARTIAL" }` UNCONDITIONALLY.
      // It computed a fail count and the returned state did not depend on it — L7 could never read
      // FULL and never BROKEN, so the CROWN of a seven-layer conjunctive lattice was a constant. A
      // layer whose charter is "nothing claims more than its evidence supports" was itself claiming
      // a fixed altitude with nothing measured against it.
      //
      // What IS measurable, and is exactly the charter: a gate reporting PASS while nothing has ever
      // shown it could report otherwise is a claim exceeding its evidence. L3 rules on that, gate by
      // gate, in the open. So this layer reads L3's ruling and asks which PASSING gates are unlicensed.
      // READ L3's STRUCTURED field, not its prose. Until 2026-07-28 this scraped
      // `/DECLARED as having no mutation proof: ([^.]+)\./` out of L3's human note, so rewording that
      // sentence would have emptied `unlicensed` and flipped the CROWN toward FULL with no change to
      // any guarantee. L3 now returns `unlicensed` as an array; a wording change cannot move it.
      const l3 = LAYERS.find((L) => L.id === "L3").probe();
      const unlicensed = Array.isArray(l3.unlicensed) ? l3.unlicensed : [];

      // BROKEN would be an adverse result that has been made to disappear. The one form of that this
      // probe CAN see: the runner announcing a law violation, which means a gate's exit and its
      // spoken verdict disagree — the mechanical shape of a red dressed as a green.
      const violations = /(\d+) law violation/.exec(r.out);
      const violationCount = violations ? Number(violations[1]) : 0;

      notes.push(
        `${failCount} gate(s) RED and VISIBLE — a red that stays red is this layer working.` +
        (unfinishedCount ? ` ${unfinishedCount} DID NOT FINISH, which is neither.` : "")
      );
      if (unlicensed.length) {
        notes.push(
          `${unlicensed.length} gate(s) report a verdict while nothing has ever shown they could report ` +
          `otherwise: ${unlicensed.join(", ")}. Their greens are not licensed by evidence — that is what ` +
          `this layer means, and it is why the state below is not FULL.`
        );
      }
      notes.push(
        "WHAT THIS PROBE CANNOT SEE: a red made green by changing the question rather than the answer. " +
        "That is what L3's mutation proofs exist to make expensive, and it is stated here rather than " +
        "assumed away."
      );

      return {
        state: violationCount > 0 ? "BROKEN" : unlicensed.length === 0 ? "FULL" : "PARTIAL",
        notes,
        detail: `${failCount} visible red · ${unlicensed.length} unlicensed green · ` +
          `${violationCount} law violation(s)`,
      };
    }),
];

function measure() {
  const layers = LAYERS.map((L) => {
    let r;
    try {
      r = L.probe();
    } catch (e) {
      r = { state: "UNMEASURED", notes: [`the probe itself failed: ${e.message}`], detail: "probe error" };
    }
    if (!WORDS.includes(r.state)) r.state = "UNMEASURED";
    return { id: L.id, name: L.name, why: L.why, ...r };
  });

  // CONJUNCTIVE. The first layer that is not FULL is the answer, and everything above it is
  // reported but NOT credited — a crown standing on a broken root is the failure this exists to
  // prevent, and averaging the two would hide exactly that.
  const first = layers.find((l) => l.state !== "FULL") || null;

  return {
    schema: "uni.resonance.v1",
    conjunctive: true,
    resonant: first === null,
    first_unsatisfied: first ? `${first.id} ${first.name}` : null,
    layers,
  };
}

module.exports = { measure, LAYERS, WORDS, REPO };
