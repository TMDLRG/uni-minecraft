// forensic_sweep.cjs — RUN THE CLAIMS. Record what actually happened.
//
// The film may state nothing this file did not measure. Not "we believe", not "as of the last
// session", not anything recalled: a command was executed, at a recorded instant, in a named
// directory, and its exit code and output were hashed.
//
// WHY THIS EXISTS RATHER THAN A LIST OF FACTS
// -------------------------------------------
// A film is rendered once and watched for a year. This estate's own governing banner carried six
// hand-typed numbers that were wrong within six hours, and one — a gate-runner tally — was false
// 176 seconds after it was written. A number in a film has no half-life at all; it simply becomes
// a lie at some unannounced moment. So the film carries no remembered facts. It carries the output
// of this sweep, and the sweep re-runs.
//
// WHAT IT REFUSES TO DO
//   * It does not interpret. A non-zero exit is recorded as a non-zero exit, not as "expected".
//   * It does not retry. A flaky answer is an answer about flakiness.
//   * It does not skip. A command that cannot run is recorded as NOT_RUN with its error, never
//     silently omitted, because an omission reads on screen as a thing that passed.
//   * It hashes RAW BYTES of stdout, never a decoded-and-reserialised string.
//
// USAGE
//   node lab/film/welcome/capture/forensic_sweep.cjs            → run, print, write evidence
//   node lab/film/welcome/capture/forensic_sweep.cjs --quick    → skip the slow suites
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const MC = path.resolve(__dirname, "..", "..", "..", "..");           // UNI.Minecraft
const PUB = path.resolve(MC, "..", "UNI.Public");
const FL = path.resolve(MC, "..", "UNI-Flagellum", "UNI-FLAGELLUM");
const OUT_DIR = path.join(__dirname);
const QUICK = process.argv.includes("--quick");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

// Every probe names WHAT IT IS FOR, so a reader of the evidence file can tell what a number means
// without reading this file. `slow` probes are the full suites.
const PROBES = [
  // ── the refusals, re-proved rather than recalled ──────────────────────────────────────────────
  { id: "golive.refuses_me", cwd: MC, argv: ["node", "viewer/prove_golive_refuses_me.cjs"],
    asks: "Can an agent reach air down any path in this codebase?" },
  { id: "golive.gate", cwd: MC, argv: ["node", "viewer/verify_golive_refuses_agents.cjs"],
    asks: "Does the go-live guard refuse a stale, forged, non-interactive or replayed token?" },
  { id: "witness.blocked", cwd: MC, argv: ["node", "viewer/gaia/verify_witness_blocked.cjs"],
    asks: "Is the off-box witness independent?" },

  // ── the science that does not run ─────────────────────────────────────────────────────────────
  // THE FIRST VERSION OF THIS PROBE WAS WRONG, AND THAT MATTERS MORE THAN THE ANSWER.
  // It tested /raise\s+@scaffold/ and printed `raises_scaffold=false`. The runner DOES raise — it
  // does so through a heredoc, `raise """` on one line and `#{@scaffold}.` on the next — so the
  // module attribute never sits adjacent to the keyword. The probe was one sweep away from carrying
  // "the colony science gate runs" into the film's evidence file, contradicting the artifact it was
  // reading. A probe that mis-reads is worse than no probe: it manufactures a citation.
  // It now prints the raise block VERBATIM, so a reader checks the text instead of trusting a regex.
  { id: "pureworld.scaffold", cwd: MC, argv: ["node", "-e",
      "const L=require('fs').readFileSync('runs/pureworld_qa_gate.exs','utf8').split(/\\r?\\n/);" +
      "const i=L.findIndex(function(l){return /^\\s*raise\\b/.test(l);});" +
      "console.log('raises='+(i>=0));" +
      "console.log('raise_at_line='+(i<0?'NONE':i+1));" +
      "if(i>=0) console.log('block='+JSON.stringify(L.slice(i,i+3)));"],
    asks: "Does the colony science gate actually run, or does its runner refuse?" },

  // ── the gap ───────────────────────────────────────────────────────────────────────────────────
  { id: "gap.registry_ledger", cwd: MC, argv: ["node", "-e",
      "console.log(JSON.stringify(require('./viewer/lab/desk.cjs').theGap(),null,1))"],
    asks: "How many registered gates have a row in the canonical ledger?" },

  // ── the film's own numbers ────────────────────────────────────────────────────────────────────
  { id: "film.tokens", cwd: MC, argv: ["node", "lab/film/welcome/qc/tokens.cjs"],
    asks: "Does every number the film may render resolve from a live artifact?" },
  { id: "film.qc", cwd: MC, argv: ["node", "lab/film/welcome/qc/verify_welcome_film.cjs", "--prove"],
    asks: "Does the film's own QC gate pass, and are its mutations caught?" },

  // ── the suites ────────────────────────────────────────────────────────────────────────────────
  { id: "gates.runner", cwd: MC, argv: ["node", "viewer/gate_runner.cjs"], slow: true,
    asks: "Do the registered gates hold their own law, and what is the tally?" },
  // `mix` is a shell script on this box, so spawnSync WITHOUT a shell returns exit `null` — which
  // this sweep recorded as EXIT_NONZERO with no code, reading on screen exactly like a failing
  // suite. A harness that cannot tell "did not run" from "ran and failed" is not a harness.
  { id: "elixir.suite", cwd: MC, argv: ["mix", "test"], slow: true, shell: true,
    asks: "Does the Elixir suite pass?" },
  { id: "public.gate", cwd: PUB, argv: ["npm", "run", "gate"], slow: true, shell: true,
    asks: "Do the public site's safety, coverage, provenance and reading-lane gates pass?" },
  { id: "public.lens", cwd: PUB, argv: ["node", "generators/verify_lenses.cjs"],
    asks: "Is the Precise lane the document, and did the authored prose reach the shipped pages?" },

  // ── the engine: what it is, and what it deliberately is not ──────────────────────────────────
  // COUNTING FILES WOULD HAVE MISLED. The first version of this probe counted brain files naming
  // "reward" and printed four of them — which reads as "there is reward in the engine". Every
  // occurrence is a NEGATION: "Active inference has NO reward", "pure model-learning, no reward",
  // "the no-smuggled-reward property". Use versus mention, again, and this time it would have put a
  // false impression on screen from a true count. So the probe prints the LINES and lets them speak.
  { id: "engine.no_reward", cwd: MC, argv: ["node", "-e",
      "const cp=require('child_process');" +
      "const r=cp.spawnSync('git',['grep','-nE','\\\\breward\\\\b','--','lib/sp/brain'],{encoding:'utf8'});" +
      "const L=(r.stdout||'').split(/\\r?\\n/).filter(Boolean);" +
      "const neg=L.filter(function(l){return /\\bno\\b[^.]{0,24}reward|reward[- ]smuggl|dispreferred/i.test(l);});" +
      "console.log('lines_naming_reward='+L.length);" +
      "console.log('of_those_saying_there_is_none='+neg.length);" +
      "L.slice(0,5).forEach(function(x){console.log('  '+x.replace(/^lib\\/sp\\/brain\\//,''));});"],
    asks: "Is there a reward signal anywhere in the engine?" },
  { id: "engine.zero_deps", cwd: MC, argv: ["node", "-e",
      "const L=require('fs').readFileSync('mix.exs','utf8').split(/\\r?\\n/);" +
      "const i=L.findIndex(function(l){return /defp?\\s+deps\\b/.test(l);});" +
      "const block=L.slice(i,i+3);" +
      "console.log('deps_declaration:');" +
      "block.forEach(function(l){console.log('  '+l);});"],
    asks: "How many third-party dependencies does the engine carry?" },

  // ── the record ────────────────────────────────────────────────────────────────────────────────
  { id: "ledger.chain", cwd: MC, argv: ["node", "-e",
      "const fs=require('fs'),c=require('crypto');" +
      "const L=fs.readFileSync('evidence/control_plane/ledger.ndjson','utf8').split(/\\r?\\n/).filter(Boolean).map(JSON.parse);" +
      "let broken=0,prev=null;" +
      "for(const e of L){ if(prev&&e.prev_hash!==prev) broken++; prev=e.hash; }" +
      "const a=JSON.parse(fs.readFileSync('evidence/control_plane/anchor.json','utf8'));" +
      "console.log('entries='+L.length);" +
      "console.log('broken_links='+broken);" +
      "console.log('anchor_length='+a.length+' anchor_head='+String(a.head).slice(0,16)+'...');" +
      "console.log('tip_hash='+String(L[L.length-1].hash).slice(0,16)+'...');" +
      "console.log('anchor_agrees='+(a.length===L.length&&a.head===L[L.length-1].hash));"],
    asks: "Does the evidence chain verify, and does its anchor agree with it?" },
  { id: "limitations.declared", cwd: MC, argv: ["node", "-e",
      "const s=require('fs').readFileSync('docs/control-plane/LIMITATIONS.md','utf8');" +
      "const ids=(s.match(/^##\\s+`([^`]+)`/gm)||[]).map(function(x){return x.replace(/^##\\s+`|`$/g,'');});" +
      "console.log('declared_limitations='+ids.length);" +
      "ids.forEach(function(i){console.log('  '+i);});"],
    asks: "What does this project say it cannot do?" },

  // ── the public surface ───────────────────────────────────────────────────────────────────────
  { id: "public.coverage", cwd: PUB, argv: ["node", "safety/verify_coverage.cjs"],
    asks: "Is every declared subsystem, entry point and page covered or explicitly excluded?" },
  { id: "public.provenance", cwd: PUB, argv: ["node", "safety/verify_provenance.cjs"],
    asks: "Do the published bytes match the commit they name?" },
  { id: "public.a11y", cwd: PUB, argv: ["node", "generators/verify_a11y.cjs"],
    asks: "Does the site meet its own contrast, landmark and reduced-motion floor?" },

  // ── the film's other instruments ─────────────────────────────────────────────────────────────
  { id: "bag.roundtrip", cwd: MC, argv: ["node", "viewer/verify_bag.cjs", "--mutate"],
    asks: "Does an evidence pack survive a round trip, and is a forged one caught?" },
  { id: "concepts.locators", cwd: MC, argv: ["node", "viewer/verify_concepts.cjs", "--mutate"],
    asks: "Does every concept in the registry point at a line that exists?" },

  // ── the trees ─────────────────────────────────────────────────────────────────────────────────
  { id: "tree.mc", cwd: MC, argv: ["git", "status", "-sb"], asks: "Is UNI.Minecraft clean, and level with its remote?" },
  { id: "tree.pub", cwd: PUB, argv: ["git", "status", "-sb"], asks: "Is UNI.Public clean, and level with its remote?" },
  { id: "tree.fl", cwd: FL, argv: ["git", "status", "-sb"], asks: "Is UNI-FLAGELLUM clean, and level with its remote?" },
  { id: "head.mc", cwd: MC, argv: ["git", "log", "-1", "--format=%H %cI %s"], asks: "What commit is UNI.Minecraft at?" },
  { id: "head.pub", cwd: PUB, argv: ["git", "log", "-1", "--format=%H %cI %s"], asks: "What commit is UNI.Public at?" },
  { id: "head.fl", cwd: FL, argv: ["git", "log", "-1", "--format=%H %cI %s"], asks: "What commit is UNI-FLAGELLUM at?" },
];

const rows = [];
for (const p of PROBES) {
  if (QUICK && p.slow) {
    rows.push({ id: p.id, asks: p.asks, status: "SKIPPED_BY_FLAG",
      note: "--quick was passed. A skipped probe is NOT a passing probe." });
    continue;
  }
  const startedNs = process.hrtime.bigint();
  const startedUtc = new Date().toISOString();
  let r;
  try {
    r = spawnSync(p.argv[0], p.argv.slice(1), {
      cwd: p.cwd, encoding: "buffer", maxBuffer: 1 << 28, shell: !!p.shell, timeout: 1800000,
    });
  } catch (e) {
    rows.push({ id: p.id, asks: p.asks, status: "NOT_RUN", error: String(e) });
    continue;
  }
  const ms = Number((process.hrtime.bigint() - startedNs) / 1000000n);
  const out = r.stdout || Buffer.alloc(0);
  const err = r.stderr || Buffer.alloc(0);
  const text = out.toString("utf8");
  rows.push({
    id: p.id,
    asks: p.asks,
    command: p.argv.join(" "),
    cwd: path.relative(path.resolve(MC, ".."), p.cwd).split(path.sep).join("/"),
    started_utc: startedUtc,
    elapsed_ms: ms,
    exit_code: r.status,
    timed_out: !!r.error && String(r.error).includes("ETIMEDOUT"),
    stdout_sha256: sha(out),
    stdout_bytes: out.length,
    stderr_bytes: err.length,
    // The verdict line, if the command printed one, taken VERBATIM. Never paraphrased.
    verdict_line: (text.match(/^.*GATE(?:\s+RUNNER)?:.*$/m) || [null])[0],
    tail: text.split(/\r?\n/).filter(Boolean).slice(-4),
    status: r.status === 0 ? "EXIT_0" : "EXIT_NONZERO",
  });
}

const evidence = {
  schema: "uni.film.forensic.v1",
  what_this_is: [
    "The measured substrate for the film WELCOME TO UNI LABS. Every probe below was EXECUTED at the",
    "recorded instant, in the recorded directory, and its exit code and stdout digest recorded.",
    "The film may render nothing that is not here. Nothing here is recalled, inferred, or carried",
    "over from a previous session.",
  ],
  captured_utc: new Date().toISOString(),
  captured_unix_ms: Date.now(),
  host_note: "Measured on the operator's machine. A capture is a fact about ONE run on ONE box.",
  probes: rows,
  limits: [
    "A green probe is a fact about THIS RUN at THIS INSTANT. The gate-runner answer in this estate",
    "has previously been false 176 seconds after it was recorded.",
    "This sweep proves commands ran and what they printed. It does NOT prove the commands ask the",
    "right questions -- that is what the gates' own mutation suites are for, and what a human read is for.",
    "SKIPPED and NOT_RUN are recorded as themselves. Neither is a pass.",
  ],
};

const stamp = evidence.captured_utc.replace(/[:.]/g, "-");
const file = path.join(OUT_DIR, `forensic_${stamp}.json`);
fs.writeFileSync(file, JSON.stringify(evidence, null, 1) + "\n", "utf8");
fs.writeFileSync(path.join(OUT_DIR, "forensic_latest.json"), JSON.stringify(evidence, null, 1) + "\n", "utf8");

const w = (s) => process.stdout.write(s + "\n");
w("");
w(`FORENSIC SWEEP — ${evidence.captured_utc}`);
w("");
for (const r of rows) {
  const mark = r.status === "EXIT_0" ? " ok " : r.status === "EXIT_NONZERO" ? "EXIT" + String(r.exit_code).padStart(2) : "SKIP";
  w(`  ${mark}  ${r.id.padEnd(26)} ${r.verdict_line ? r.verdict_line.trim().slice(0, 88) : (r.tail && r.tail[0] ? r.tail[0].slice(0, 88) : r.status)}`);
}
const nonzero = rows.filter((r) => r.status === "EXIT_NONZERO");
const skipped = rows.filter((r) => /SKIP|NOT_RUN/.test(r.status));
w("");
w(`  ${rows.length} probe(s) · ${rows.filter((r) => r.status === "EXIT_0").length} exited 0 · ` +
  `${nonzero.length} non-zero · ${skipped.length} not run`);
w(`  written: ${path.relative(MC, file).split(path.sep).join("/")}`);
w("");
w("  A non-zero exit here is DATA, not a failure of this sweep. The sweep's job is to record what");
w("  happened, and it exits 0 whenever it successfully recorded it.");
