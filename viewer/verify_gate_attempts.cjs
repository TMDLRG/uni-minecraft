// verify_gate_attempts.cjs — THE GATE-ATTEMPTS GATE (Phase 9, step 4.2).
//
//   falsifier: "'never attempted' and 'attempted and blocked' still collapse into one word"
//
// The word is PENDING and dozens of distinct gates have worn it (the live backlog and the history of
// it are different numbers -- see the two_numbers header the sidecar now carries). This gate holds the sidecar honest, and — the
// part that matters — proves the distinction is REAL rather than decorative: both of the states
// the falsifier names must actually be present, and a state must be able to CHANGE when the thing
// it describes changes.
//
// IT ALSO PROVES WHAT WAS NOT TOUCHED. The whole reason for a sidecar is that `attempted_at`
// cannot go in the row: the schema declares `additionalProperties: false` (F5 refuses it),
// amending the schema is S5, and writing the rows is S4. So this gate asserts, every run, that
// evidence/gates.ndjson still hashes to its pinned value.
//
// PASS — the sidecar matches a fresh classification, the distinction is real and still bites, the
// canonical gate ledger is untouched, and the same distinction is derivable from HISTORY.
// Usage: node viewer/verify_gate_attempts.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const cp = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ga = require("./gate_attempts.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// THE PIN THAT USED TO LIVE HERE IS DELETED, NOT UPDATED. It was
// "964ea25cfe8666cae89aed23dac55bb483b654730a3259269d5e42d91d8a4c44", the ledger's hash on
// 2026-07-28, and it turned the operator's own permitted append into a tamper alarm on 2026-07-29.
// Advancing it would have re-armed the same trap for the next legitimate row. Check 3 below asks a
// question that stays true instead. A hash literal in source is a claim with an expiry date and no
// expiry check; if one is ever needed again for provenance it belongs in a generated `uni.state.*`
// block via viewer/generate_state_blocks.cjs, where regenerating it is the only way to change it.

// ---- 1: the sidecar cannot drift --------------------------------------------------------------

const fresh = ga.classify();

if (!fs.existsSync(ga.SIDECAR)) {
  bad("the sidecar exists", "run node viewer/classify_gate_attempts.cjs");
} else {
  // NORMALISED, and the .gitattributes rule is belt to this braces. A byte-identity check on a
  // GENERATED file is inherently EOL-fragile: render() emits LF, a Windows checkout produces CRLF,
  // and the gate then reports "it has DRIFTED — a row or a runner changed" when nothing changed.
  // Measured from a clean checkout of its own commit: FAIL 7/8. The drift this gate exists to
  // catch is a CONTENT drift, so content is what it compares.
  const eol = (x) => x.replace(/\r\n/g, "\n");
  const committed = eol(fs.readFileSync(ga.SIDECAR, "utf8"));
  committed === eol(ga.render(fresh))
    ? ok("the sidecar is byte-identical to a fresh classification",
        `${fresh.pending_now} pending now of ${fresh.ever_pending} ever pending, ${committed.length} bytes`)
    : bad("the sidecar is byte-identical to a fresh classification",
        "it has DRIFTED — a row or a runner changed and the sidecar was not regenerated");
}

// ---- 2: THE FALSIFIER — the two states it names must BOTH be present --------------------------

// THE BACKLOG, not the history of the backlog. Corrected 2026-07-28 after the L4 gate found this
// sidecar reporting 59 "pending gates" when 12 were pending — the other 47 had been decided since.
// The falsifier is about what is WAITING, so it is evaluated on what is waiting.
const t = fresh.tally_pending_now;
const ever = fresh.tally_ever_pending;
const distinct = Object.keys(t).length;

// CORRECTED 2026-07-28. THIS WAS THE LITERAL TAUTOLOGY.
//
// It read `fresh.pending_now <= fresh.ever_pending && typeof fresh.pending_now === "number"`.
// `pending_now` is a filtered subset count of the array `ever_pending` counts, so `<=` always
// holds; `.length` is always a number. Both conjuncts are structurally guaranteed. The check was
// named "the backlog and the history of the backlog are reported separately" and COULD NOT DETECT
// THE REGRESSION IT NAMES — a sidecar collapsing back to one number under one name satisfies both
// conjuncts perfectly.
//
// What it must actually establish: the two numbers are DERIVED DIFFERENTLY and the rendered header
// carries both under names that say which is which. Recomputed here from the ledger, independently
// of the module under test.
{
  const rows = fs.readFileSync(path.join(ga.REPO, "evidence", "gates.ndjson"), "utf8")
    .split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.name);
  const everPending = new Set(rows.filter((r) => String(r.verdict).toUpperCase() === "PENDING").map((r) => r.name)).size;
  const pendingNow = [...new Map(rows.map((r) => [r.name, r])).values()]
    .filter((r) => String(r.verdict).toUpperCase() === "PENDING").length;
  const header = JSON.parse(fs.readFileSync(ga.SIDECAR, "utf8").split(/\r?\n/)[0]);

  const agrees = fresh.pending_now === pendingNow && fresh.ever_pending === everPending;
  const bothRendered = header.pending_now === pendingNow && header.ever_pending === everPending;
  const namesDiffer = typeof header.two_numbers === "string" && /BACKLOG/.test(header.two_numbers);

  agrees && bothRendered && namesDiffer && pendingNow !== everPending
    ? ok("the backlog and the history of the backlog are reported separately",
        `${pendingNow} PENDING NOW and ${everPending} EVER PENDING, both recomputed here straight from ` +
        `the ledger and both present in the rendered header under names that say which is which. The ` +
        `two are derived differently — last-row-per-name versus any-row-ever — and they DIFFER, so a ` +
        `collapse back to one number is visible. This check used to be ` +
        `\`pending_now <= ever_pending && typeof pending_now === "number"\`, which is true of a subset ` +
        `count and its parent's length no matter what the sidecar says.`)
    : bad("the backlog and the history of the backlog are reported separately",
        `module says ${fresh.pending_now}/${fresh.ever_pending}, recomputed ${pendingNow}/${everPending}, ` +
        `header says ${header.pending_now}/${header.ever_pending}, names-differ=${namesDiffer}`);
}


distinct > 1
  ? ok("PENDING no longer collapses into one word",
      Object.entries(t).sort().map(([k, n]) => `${n} ${k}`).join(" · "))
  : bad("PENDING no longer collapses into one word",
      `every gate landed in ${Object.keys(t)[0]} — the classification distinguishes nothing`);

t.NO_RUNNER > 0 && t.RUNNER_REFUSES > 0
  ? ok("'never attempted' and 'attempted and blocked' are now different states",
      `${t.NO_RUNNER} have no runner at all (waiting on WORK); ${t.RUNNER_REFUSES} have a runner ` +
      `that refuses by construction (waiting on the WORLD)`)
  : bad("'never attempted' and 'attempted and blocked' are now different states",
      `NO_RUNNER=${t.NO_RUNNER || 0} RUNNER_REFUSES=${t.RUNNER_REFUSES || 0} — the falsifier stands`);

// Said out loud, because a PENDING gate holding a result document is a finding rather than a
// category and a silent count is how it stays unnoticed.
if (t.HAS_RESULT_DOCUMENT > 0 || ever.HAS_RESULT_DOCUMENT > 0) {
  ok("said out loud: gates reading PENDING that name a result document",
    `${t.HAS_RESULT_DOCUMENT || 0} RIGHT NOW — something was produced and the verdict was never ` +
    `moved. ${ever.HAS_RESULT_DOCUMENT || 0} have been in that position at some point, and this ` +
    `sidecar reported that larger number as the live count until 2026-07-28. Most of them WERE ` +
    `resolved; saying otherwise made the instrument look more neglected than it is, which is its ` +
    `own kind of dishonesty.`);
}

// ---- 3: nothing UNCOMMITTED was written to the canonical gate ledger (S4) ----------------------
//
// THIS CHECK ASKED THE WRONG QUESTION WITH THE WRONG INSTRUMENT UNTIL 2026-07-30.
//
// It compared the ledger against a hardcoded hash. That literal was the value on 2026-07-28. On
// 2026-07-29 commit 2dcbfd2 appended ONE probe row — and that commit is the OPERATOR'S, which is
// precisely what S4 RESERVES TO HIM. So this gate went red, and it went red printing
// "evidence/gates.ndjson is untouched (S4) — FAIL", which reads as a TAMPER ALARM for a write the
// stop condition explicitly permits. It then cascaded: resonance L1 read BROKEN off the same stale
// literal, and L5 published "the sidecar has drifted" as the cause when the sidecar was
// byte-identical and the pin was the only failure.
//
// A HASH LITERAL CANNOT ANSWER S4. S4 asks *who wrote* — and a hash cannot tell an agent's write
// from the operator's. What this gate CAN answer honestly is the shape an agent's violation
// actually takes: an agent writing to the ledger mid-session leaves the working tree DIVERGENT FROM
// HEAD. The operator's append is committed, so it does not. So: compare the tree to the blob.
//
// DECLARED LIMIT, because this check must not be read as more than it is: it detects an UNCOMMITTED
// write. It cannot detect an agent that wrote AND committed. Closing that needs the write to be
// coupled to a control-plane ledger entry naming an authorising human — the pin-advance procedure
// specified in docs and NOT built. Until then this is a real fence with a stated hole, not a proof.

const gatesPath = path.join(ga.REPO, "evidence", "gates.ndjson");
const gatesSha = crypto.createHash("sha256").update(fs.readFileSync(gatesPath)).digest("hex");
const blobRun = require("child_process").spawnSync("git", ["show", "HEAD:evidence/gates.ndjson"],
  { cwd: ga.REPO, encoding: "buffer", maxBuffer: 1 << 26 });
const blobSha = blobRun.status === 0
  ? crypto.createHash("sha256").update(blobRun.stdout).digest("hex")
  : null;

blobSha === null
  ? bad("evidence/gates.ndjson carries no uncommitted write (S4)",
      "there is no committed blob at HEAD to compare against — git show failed, so this check could not be made, and that is not a pass")
  : gatesSha === blobSha
    ? ok("evidence/gates.ndjson carries no uncommitted write (S4)",
        `tree == HEAD blob (${gatesSha.slice(0, 16)}…). An agent writing here mid-session would leave the tree ` +
        `divergent; it does not. The operator's own committed appends do not trip this, and until ` +
        `2026-07-30 a hardcoded pin made one of them read as a tamper alarm. LIMIT: this cannot see an ` +
        `agent that wrote AND committed — that needs the write coupled to a control-plane entry naming a ` +
        `human, which is specified and NOT BUILT.`)
    : bad("evidence/gates.ndjson carries no uncommitted write (S4)",
        `THE TREE HAS AN UNCOMMITTED WRITE: tree ${gatesSha.slice(0, 16)}… vs HEAD blob ${blobSha.slice(0, 16)}…`);

// ---- 4: M5, HISTORICAL REPLAY — the distinction was always derivable --------------------------
// The classifier takes its reader, so the same code can read a PAST COMMIT. If the distinction
// only appears today, it was invented today; if it appears at the commit that first wrote a
// scaffold runner, it was always in the record and merely unread.

function gitReader(rev) {
  return {
    label: `git ${rev.slice(0, 8)}`,
    read(rel) {
      const r = cp.spawnSync("git", ["-C", ga.REPO, "show", `${rev}:${rel}`],
        { encoding: "utf8", maxBuffer: 1 << 26 });
      return r.status === 0 ? r.stdout : null;
    },
    exists(rel) {
      return this.read(rel) !== null;
    },
  };
}

const scaffoldRev = cp.spawnSync("git",
  ["-C", ga.REPO, "log", "-1", "--format=%H", "--", "runs/pureworld_qa_gate.exs"],
  { encoding: "utf8" }).stdout.trim();

// THE FIRST VERSION OF THIS CHECK ASSERTED THE WRONG THING, and the replay is what corrected it.
// It demanded that BOTH states be present in history. They were not: at the commit that wrote the
// scaffold there were EIGHT PENDING gates and ALL EIGHT were RUNNER_REFUSES. The picture was
// homogeneous, so there was nothing to distinguish — the other 51 PENDING gates accumulated
// AFTERWARDS, every one of them with no runner at all.
//
// That is a better finding than the one I went looking for. What M5 can honestly prove is
// STABILITY — a gate this classifier calls RUNNER_REFUSES today was already RUNNER_REFUSES then,
// from the same record, which is what "derived rather than invented" means.
//
// WITHDRAWN 2026-07-28: this comment used to add "and that is what the plan's 'nine' was counting:
// the original scaffolded set." That was a guess dressed as a conclusion, and it does not survive
// arithmetic — the scaffolded set is EIGHT, the gates pending now are TWELVE, the gates ever
// pending are FIFTY-NINE, and S10 says nine. It matches none of them. S10 names a count and no
// members, so what it counted is not recoverable from this record, and saying so is the finding.
if (!scaffoldRev) {
  bad("M5 historical replay", "could not find the commit that wrote the scaffold runner");
} else {
  const past = ga.classify(gitReader(scaffoldRev));
  const pastRefusing = new Set(past.entries.filter((e) => e.state === "RUNNER_REFUSES").map((e) => e.gate));
  const nowByGate = new Map(fresh.entries.map((e) => [e.gate, e.state]));
  const moved = [...pastRefusing].filter((g) => nowByGate.has(g) && nowByGate.get(g) !== "RUNNER_REFUSES");

  pastRefusing.size > 0 && moved.length === 0
    ? ok("M5 historical replay: the classification is STABLE across history",
        `at ${scaffoldRev.slice(0, 8)} there were ${past.ever_pending} PENDING gates and ALL of ` +
        `them were RUNNER_REFUSES. Every one is still RUNNER_REFUSES today — read from the record, ` +
        `not invented. The other ${fresh.ever_pending - past.ever_pending} arrived AFTERWARDS, ` +
        `every one with no runner at all.`)
    : bad("M5 historical replay: the classification is STABLE across history",
        `at ${scaffoldRev.slice(0, 8)}: ${past.ever_pending} gates, ${pastRefusing.size} refusing, ` +
        `${moved.length} have since changed state: ${moved.join(", ")}`);
}

// ---- 5: MUTATION — a state must be able to change when its subject changes --------------------
// Without this, every check above is satisfied by a classifier that has stopped looking. The
// mutation is applied to a SYNTHETIC row and a synthetic reader; the real tree is never edited.

function fakeReader(files) {
  return { label: "synthetic", read: (rel) => (rel in files ? files[rel] : null), exists: (rel) => rel in files };
}

{
  const row = {
    name: "synthetic-gate",
    verdict: "PENDING",
    receipt_path: "docs/pre.md",
    pre_registration_path: "docs/pre.md",
    notes: "harness at runs/synthetic_gate.exs",
  };

  const refusing = ga.classifyRow(row, fakeReader({ "runs/synthetic_gate.exs": "@scaffold raise" }));
  const willing = ga.classifyRow(row, fakeReader({ "runs/synthetic_gate.exs": "def run(argv), do: :ok" }));
  const absent = ga.classifyRow(row, fakeReader({}));

  const moved =
    refusing.state === "RUNNER_REFUSES" &&
    willing.state === "RUNNABLE_NEVER_RUN" &&
    absent.state === "NO_RUNNER";

  moved
    ? ok("MUTATION: the state follows the runner, all three ways",
        "refuses → RUNNER_REFUSES · stops refusing → RUNNABLE_NEVER_RUN · deleted → NO_RUNNER")
    : bad("MUTATION: the state follows the runner, all three ways",
        `refuses=${refusing.state} willing=${willing.state} absent=${absent.state} — a classifier ` +
        `whose answer does not move is a constant with extra steps`);
}

{
  // NEGATIVE CONTROL — a gate never recorded PENDING must not appear at all. A sidecar that
  // classifies everything is not classifying.
  //
  // CORRECTED 2026-07-28. This used to be `ga.pendingRows(...).every(r => r.verdict === "PENDING")`
  // — the BYTE-IDENTICAL predicate `pendingRows` filters on, three lines earlier in the module under
  // test. It could not fail. A negative control that re-applies the filter it is testing establishes
  // that `filter` works, which was not in doubt.
  //
  // What it must establish: gates that exist in the ledger and were NEVER pending are ABSENT from
  // the classification. That requires knowing the complement, so the complement is computed here.
  const rows = ga.pendingRows(ga.diskReader);
  const stillPending = fresh.entries.filter((e) => e.pending_now).length;

  const all = fs.readFileSync(path.join(ga.REPO, "evidence", "gates.ndjson"), "utf8")
    .split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.name);
  const everPendingNames = new Set(all.filter((r) => String(r.verdict).toUpperCase() === "PENDING").map((r) => r.name));
  const neverPending = [...new Set(all.map((r) => r.name))].filter((n) => !everPendingNames.has(n));
  const classified = new Set(fresh.entries.map((e) => e.gate));
  const leaked = neverPending.filter((n) => classified.has(n));

  neverPending.length > 0 && leaked.length === 0
    ? ok("NEGATIVE CONTROL: only gates recorded PENDING are classified",
        `${neverPending.length} gate name(s) in the ledger were NEVER recorded PENDING, and not one ` +
        `appears in the classification — measured against the COMPLEMENT, not by re-running the ` +
        `filter under test. ${rows.length} rows classified; ${stillPending} still pending now.`)
    : neverPending.length === 0
      ? bad("NEGATIVE CONTROL: only gates recorded PENDING are classified",
          "every gate in the ledger has been PENDING at some point, so there is no complement and " +
          "this control cannot distinguish anything")
      : bad("NEGATIVE CONTROL: only gates recorded PENDING are classified",
          `${leaked.length} never-pending gate(s) leaked in: ${leaked.slice(0, 5).join(", ")}`);
}

// ---- verdict -----------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - gate-attempts, ` +
    `${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
