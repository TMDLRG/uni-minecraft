// verify_lab_l5.cjs — THE L5 GATE (Phase 9 step 4.6, build 5): the desk shows the bytes, and cannot
// show a verdict it did not observe.
//
// L5 is the first build that RUNS something, and the first that shows him a row he could paste into
// the canonical ledger. Both of those are ways to be wrong that no previous build had.
//
// THIS GATE WAS 14/14 AND WRONG, AND SAYING SO IS THE POINT
// ----------------------------------------------------------
// An adversarial audit on 2026-07-28 raised 25 findings against L5 and 22 survived refutation, six
// of them high. Every one of them was invisible to this file as it stood, and three of its checks
// were the reason:
//
//   "the lab's one non-GET route is carved out by name"  — counted ROUTES, never CALLERS. True, and
//       answering a different question than a reader takes from it. The route had no CSRF fence, so
//       any page in the operator's browser could spawn gates in his repo. Now checked with LIVE
//       REQUESTS against a booted server, including a hostile cross-site shape that must be refused.
//   "NO VERDICT WITHOUT A RUN"  — proved only "no verdict without a NUMBER NAMED exit_code". A
//       hand-typed {exit_code: 0} produced a clean PASS row, and the very next check did exactly
//       that. Now the row requires a run token minted inside run().
//   "THE GAP IS MEASURED"  — `gap.registered > 0 && typeof gap.in_the_canonical_ledger === "number"`
//       is true for any non-empty registry and any integer. A tautology. It did not notice the
//       headline drifting from 24 to 25. Now the gap is RECOMPUTED here, independently, and compared.
//
// A source regex is evidence about text. Where the claim is about BEHAVIOUR, this gate now measures
// behaviour: it boots a server, issues requests, runs processes, and hashes files before and after.
//
// Usage: node viewer/lab/verify_lab_l5.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const D = require("./desk.cjs");

// Each check is stamped with how long it took. This gate boots the BEAM, checks out worktrees and
// starts HTTP servers, so it is legitimately the slowest in the registry — and a gate that is slow
// without saying WHERE is one nobody can tell apart from a gate that is hanging.
const results = [];
let clock = Date.now();
const stamp = () => { const ms = Date.now() - clock; clock = Date.now(); return ms; };
const ok = (n, d) => results.push({ pass: true, name: n, detail: d, ms: stamp() });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d, ms: stamp() });

const page = fs.readFileSync(path.join(__dirname, "l5.html"), "utf8");
const src = fs.readFileSync(path.join(__dirname, "desk.cjs"), "utf8");
const uncommented = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
const server = fs.readFileSync(path.join(__dirname, "lab_server.cjs"), "utf8");

// Declared here, before the checks run: `const` is hoisted but not initialised, and the memo is
// reached from a function called during the first check.
const RUN_CACHE = new Map();

const ledgerBefore = crypto.createHash("sha256").update(fs.readFileSync(D.GATES)).digest("hex");
const treeBefore = spawnSync("git", ["-C", D.REPO, "status", "--porcelain"], { encoding: "utf8" }).stdout;
const worktreesBefore = worktreePaths();

// PATHS, NOT A COUNT — and the difference is a false accusation this gate used to make.
//
// This was `countWorktrees()`, and the check below required the count to be UNCHANGED. A count
// cannot tell the two directions apart, and BOTH of them happen here:
//   +1  a worktree THIS gate created and could not remove   -> a real leak, and the gate should fail
//   -1  a stray left by somebody else that the unconditional `git worktree prune` in desk.cjs's
//       finish() DELETED during this gate's run             -> the gate CLEANED UP, and it used to
//       report that as "-1 worktree(s) leaked by this gate's own runs" — the exact opposite of what
//       happened, attributed to the wrong actor.
// The old comment said the delta was used precisely so that "a stray left by something else is a
// different fact that must not be laundered into L5's verdict". The delta could not achieve that,
// because this gate's own cleanup removes those strays and moves the delta while doing it.
function worktreePaths() {
  const out = spawnSync("git", ["-C", D.REPO, "worktree", "list", "--porcelain"], { encoding: "utf8" }).stdout;
  return new Set((out.match(/^worktree (.+)$/gm) || []).map((l) => l.replace(/^worktree /, "").trim()));
}

// ---- M2: THE PREVIEW IS THE BYTES, PROVED AGAINST THE ELIXIR -------------------------------------------

function toElixir(rows) {
  const v = (x) =>
    typeof x === "number" ? String(x)
      : Array.isArray(x) ? "[" + x.map(v).join(", ") + "]"
        : x === null ? "nil"
          : typeof x === "boolean" ? String(x)
            : JSON.stringify(x);
  return "[" + rows.map((r) =>
    "%{" + Object.keys(r).map((k) => `${JSON.stringify(k)} => ${v(r[k])}`).join(", ") + "}"
  ).join(", ") + "]";
}

function elixir(script) {
  // Written to a file rather than passed with -e: `shell: true` concatenates argv WITHOUT escaping,
  // so an Elixir map literal full of quotes and braces is mangled by cmd.exe before mix sees it.
  // That failure looks exactly like "the Elixir emitted nothing", which is indistinguishable from
  // drift — the worst possible way for this check to be wrong.
  const p = path.join(os.tmpdir(), `uni-l5-${crypto.randomUUID()}.exs`);
  fs.writeFileSync(p, script);
  const out = spawnSync("mix", ["run", "--no-start", p.replace(/\\/g, "/")],
    { cwd: D.REPO, encoding: "utf8", shell: true, timeout: 180000 });
  fs.rmSync(p, { force: true });
  return { stdout: String(out.stdout || ""), stderr: String(out.stderr || ""), status: out.status };
}

{
  // ROWS THE DESK ACTUALLY BUILDS, not four shapes hand-written in the gate. The first version tested
  // literals, so a change to what preRegistration/afterRun emit would not have changed what M2
  // compared — the comparison and the code under test were not connected.
  const built = [];
  for (const id of ["lab-l0", "lab-l4", "gaia", "control-plane-evidence"]) {
    const b = D.preRegistration(id);
    if (b.row) built.push(b.row);
  }
  // An AFTER row, obtained the only way one can be: from a real run.
  const observed = runInChild("lab-l0");
  if (observed && observed.after && observed.after.row) built.push(observed.after.row);
  // Plus shapes the desk cannot currently reach but the schema allows, so every optional key and the
  // ugly characters are covered too.
  built.push(
    { schema_version: 1, name: "z-gate", phase: "Phase 9", pass_condition: "the bytes agree",
      falsifies_condition: "they do not", receipt_path: "docs/x.txt", pre_registration_path: "docs/p.md",
      verdict: "PARTIAL", evidence_class: "B", last_updated: "2026-07-28",
      supersedes: ["a-gate", "b-gate"], notes: "quotes \" and a backslash \\ and a tab\t" },
    { notes: "keys in reversed order", last_updated: "2026-01-01", evidence_class: "A", verdict: "FAIL",
      receipt_path: "docs/y.txt", name: "reversed-input", schema_version: 1 }
  );

  const out = elixir("rows = " + toElixir(built) + "\n" +
    "Enum.each(rows, fn r -> IO.puts(SP.ControlPlane.GateRow.encode(r)) end)\n");
  const fromElixir = out.stdout.split(/\r?\n/).filter((l) => l.startsWith("{"));
  const fromNode = built.map((r) => D.encode(r));
  const agree = fromElixir.length === built.length && fromElixir.every((l, i) => l === fromNode[i]);

  agree
    ? ok("M2: the desk's bytes ARE SP.ControlPlane.GateRow.encode/1's bytes",
        `${built.length} rows, byte-identical — and ${built.length - 2} of them came out of ` +
        `preRegistration() and afterRun() rather than being written here, so the comparison moves ` +
        `when the desk moves. Includes keys supplied in reversed order, a quote, a backslash and a tab.`)
    : bad("M2: the desk's bytes ARE SP.ControlPlane.GateRow.encode/1's bytes",
        fromElixir.length !== built.length
          ? `the Elixir emitted ${fromElixir.length} lines for ${built.length} rows. stderr: ${out.stderr.slice(-300)}`
          : "DRIFT:\n  elixir: " + fromElixir.find((l, i) => l !== fromNode[i]) +
            "\n  desk:   " + fromNode[fromElixir.findIndex((l, i) => l !== fromNode[i])]);
}

{
  // M2 FOR THE VALIDATOR, WHICH THE FIRST VERSION NEVER COMPARED AT ALL. The page renders this
  // module's `validate` output as "schema-valid", and it was documented as a port of
  // GateRow.validate/1 while running six of its nine checks, two of them weaker. A validator that
  // accepts rows the writer refuses tells him a row is writable when it is not — so this compares
  // ACCEPT/REFUSE against the Elixir on rows the Elixir must REFUSE, which is where a weak port shows.
  const cases = [
    { schema_version: 1, name: "ok-row", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28" },
    { schema_version: 1, name: "bad-date", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-02-31" },
    { schema_version: 1, name: "not-a-string-notes", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28", notes: 7 },
    { schema_version: 1, name: "bad-supersedes", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28", supersedes: [1, 2] },
    { schema_version: 1, name: "not-kebab-CAPS", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28" },
    { schema_version: 2, name: "bad-version", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28" },
    { schema_version: 1, name: "bad-verdict", receipt_path: "d.txt", verdict: "GREEN", evidence_class: "A", last_updated: "2026-07-28" },
    { schema_version: 1, name: "missing-class", receipt_path: "d.txt", verdict: "PASS", last_updated: "2026-07-28" },
    { schema_version: 1, name: "extra-key", receipt_path: "d.txt", verdict: "PASS", evidence_class: "A", last_updated: "2026-07-28", colour: "blue" },
  ];
  const out = elixir("rows = " + toElixir(cases) + "\n" +
    "Enum.each(rows, fn r ->\n" +
    "  IO.puts(case SP.ControlPlane.GateRow.validate(r) do :ok -> \"ACCEPT\"; {:error, _} -> \"REFUSE\" end)\n" +
    "end)\n");
  const theirs = out.stdout.split(/\r?\n/).filter((l) => l === "ACCEPT" || l === "REFUSE");
  const mine = cases.map((r) => (D.validate(r).length === 0 ? "ACCEPT" : "REFUSE"));
  const disagree = theirs.map((t, i) => (t !== mine[i] ? `${cases[i].name}: elixir=${t} desk=${mine[i]}` : null)).filter(Boolean);

  theirs.length === cases.length && disagree.length === 0 && mine.filter((m) => m === "REFUSE").length === cases.length - 1
    ? ok("M2: the desk's validator AGREES WITH THE WRITER on accept and refuse",
        `${cases.length} rows — one legal, eight the Elixir refuses (an impossible date, a numeric ` +
        `notes, a numeric supersedes entry, a non-kebab name, a wrong schema_version, an invented ` +
        `verdict, a missing class, an extra key) and the desk refuses all eight too. The page renders ` +
        `this output as "schema-valid", so a port that accepts what the writer refuses would tell him ` +
        `a row is writable when it is not.`)
    : bad("M2: the desk's validator AGREES WITH THE WRITER on accept and refuse",
        theirs.length !== cases.length
          ? `the Elixir answered ${theirs.length} of ${cases.length}. stderr: ${out.stderr.slice(-300)}`
          : disagree.join(" · ") || "the negative control failed: not every bad row was refused");
}

// ---- THE ONE THAT MATTERS: no verdict without a run -------------------------------------------------------

{
  const nothing = D.afterRun("lab-l0", null);
  const empty = D.afterRun("lab-l0", {});
  const handed = D.afterRun("lab-l0", { verdict: "PASS" });
  // THE ONE THE FIRST VERSION LET THROUGH. A number typed by hand, with no process behind it.
  const typed = D.afterRun("lab-l0", { exit_code: 0 });
  const forged = D.afterRun("lab-l0", { exit_code: 0, run_token: crypto.randomUUID() });

  nothing.error === "NO_RUN_OBSERVED" && empty.error === "NO_RUN_OBSERVED" &&
  handed.error === "NO_RUN_OBSERVED" && typed.error === "NO_RUN_PROVENANCE" && forged.error === "NO_RUN_PROVENANCE"
    ? ok("NO VERDICT WITHOUT A RUN — including a hand-typed exit code",
        "refused with nothing, with an empty observation, with a verdict handed over directly, WITH " +
        "A HAND-TYPED {exit_code: 0}, and with a forged token. The first version accepted the fourth " +
        "of those and its check was still called NO VERDICT WITHOUT A RUN — it proved 'no verdict " +
        "without a number named exit_code', a weaker claim wearing a stronger name.")
    : bad("NO VERDICT WITHOUT A RUN — including a hand-typed exit code",
        `null=${nothing.error} empty=${empty.error} handed=${handed.error} typed=${typed.error || "ACCEPTED"} ` +
        `forged=${forged.error || "ACCEPTED"}`);
}

{
  // The LAW, tested on the pure function rather than by manufacturing a fake run — which is what
  // forced the previous version to accept fake runs in the first place.
  const map = [0, 1, 2, 137, -1].map((c) => `${c}→${D.verdictOf(c)}`).join(" · ");
  D.verdictOf(0) === "PASS" && [1, 2, 137, -1].every((c) => D.verdictOf(c) === "FAIL")
    ? ok("the verdict follows the exit code, both ways", map + ". The runner's law, not a new one.")
    : bad("the verdict follows the exit code, both ways", map);
}

// ---- a run that could not happen is not a run that failed ---------------------------------------------------

{
  // A SYNTHETIC TWIN, because the honest version of this check must not go quiet the moment
  // everything is committed — which is exactly what the first version did. It filtered the registry
  // for uncommitted gates, found none, and `[].every(...)` is `true`, collapsing the whole check to
  // a source regex. The audit asked for a twin by name and the first pass did not add one.
  //
  // So one is constructed: a registry entry naming a file that exists in the WORKING TREE and not in
  // HEAD. That is the exact shape that used to be launched into a checkout without it —
  // MODULE_NOT_FOUND, exit 1, and the runner law turning that into a VERDICT of FAIL about a gate
  // that never ran. L5's own gate was the first victim.
  const twin = path.join(D.REPO, "viewer", "lab", `__l5_synthetic_twin_${process.pid}.cjs`);
  fs.writeFileSync(twin, "// exists in the working tree, never committed\nprocess.exit(0);\n");
  const rel = "viewer/lab/" + path.basename(twin);
  const onDisk = fs.existsSync(twin);
  const atHead = spawnSync("git", ["-C", D.REPO, "cat-file", "-e", `HEAD:${rel}`], { encoding: "utf8" }).status === 0;
  const verdict = D.canRun("__synthetic__", { entryOverride: { id: "__synthetic__", ci: true, file: rel, gate_row: "synthetic-twin" } });
  fs.rmSync(twin, { force: true });

  onDisk && !atHead && verdict.code === "NOT_AT_HEAD"
    ? ok("a gate that is not at HEAD is REFUSED, not FAILED",
        `a file written to the working tree and never committed comes back NOT_AT_HEAD. Constructed, ` +
        `not found: every registered gate is committed right now, and a check that only fires on ` +
        `real orphans goes silent precisely when the tree is clean — which is most of the time. A ` +
        `question that could not be asked must never wear the same word as an answer of no.`)
    : bad("a gate that is not at HEAD is REFUSED, not FAILED",
        `twin-on-disk=${onDisk} twin-at-head=${atHead} verdict=${verdict.code}`);
}

{
  // THE OTHER TWO WAYS A RUN PRODUCES NO RESULT, forced THROUGH THE REAL CODE PATH — a bogus
  // interpreter that genuinely fails to spawn, and a 1ms timeout that genuinely kills a child.
  // Neither existed as a distinct outcome until 2026-07-28 and both used to become `verdict: "FAIL"`.
  const neverStarted = runInChild("lab-l0", null, { execPath: path.join(D.REPO, "no", "such", "interpreter") });
  const didNotFinish = runInChild("lab-l0", null, { timeoutMs: 1 });

  const noRow = (r) => r && r.observed && r.observed.run_token === undefined &&
    r.observed.exit_code === undefined && typeof r.observed.no_verdict_because === "string" &&
    r.after && r.after.error === "NO_RUN_OBSERVED";

  noRow(neverStarted) && noRow(didNotFinish) &&
  neverStarted.observed.outcome === "never_started" && didNotFinish.observed.outcome === "did_not_finish"
    ? ok("A RUN THAT NEVER STARTED IS NOT A GATE THAT FAILED",
        "a child that cannot be spawned and a child killed by the timeout both resolve with NO exit " +
        "code and NO run token, so afterRun refuses them and no row exists to be read as a verdict. " +
        "Both used to coalesce to exit_code -1, mint a token, and produce a schema-clean FAIL row " +
        "whose derivation said 'Nothing chose it' — and adding the timeout made the second more " +
        "reachable than it had been.")
    : bad("A RUN THAT NEVER STARTED IS NOT A GATE THAT FAILED",
        `never_started=${JSON.stringify(neverStarted && neverStarted.observed && neverStarted.observed.outcome)} ` +
        `did_not_finish=${JSON.stringify(didNotFinish && didNotFinish.observed && didNotFinish.observed.outcome)}`);
}

{
  // And the sentence explaining a kill has to survive the trip to the page.
  const killed = runInChild("lab-l0", null, { timeoutMs: 1 });
  const explained = killed && killed.observed && /killed by/.test(killed.observed.note || "") &&
    /DID NOT FINISH/.test(killed.observed.no_verdict_because || "");
  const renders = /no_verdict_because|observed\.note/.test(page);

  explained && renders
    ? ok("the reason a run produced nothing travels to the surface",
        "the note naming the signal survives afterRun's projection and the page renders it. It used " +
        "to be stripped by the projection and discarded again by the page, so a killed run reached " +
        "the operator as a confident FAIL with no trace of the kill anywhere he would look.")
    : bad("the reason a run produced nothing travels to the surface",
        `note-carried=${explained} page-renders-it=${renders}`);
}

// ---- the BEFORE and AFTER rows both say what would stop them ---------------------------------------------------

{
  const b = D.preRegistration("lab-l0");
  b.row.verdict === "PENDING" && b.row.evidence_class === "pending" && b.kind === "BEFORE"
    ? ok("the BEFORE row says PENDING, which is the schema's own word for it",
        `"registered but not run" — quoted from production/schemas/gate_row.schema.json. Everything ` +
        `except the outcome, which is exactly as much as can honestly be known beforehand.`)
    : bad("the BEFORE row says PENDING, which is the schema's own word for it",
        `verdict=${b.row.verdict} evidence_class=${b.row.evidence_class}`);
}

{
  // THE HALF NOBODY REACHED BY PRESSING R. The first version computed blockers for BEFORE and only
  // schema_errors for AFTER, so every after-row the live page could produce came back clean while
  // carrying receipt_path:"" and being unwritable.
  const observed = runInChild("lab-l0");
  const a = observed && observed.after;
  const b = D.preRegistration("lab-l0");

  a && Array.isArray(a.blockers) && typeof a.writable === "boolean" &&
  (a.row.receipt_path !== "" || a.blockers.some((x) => /receipt_path is empty/.test(x))) &&
  b.blockers.some((x) => /receipt_path is empty/.test(x))
    ? ok("the AFTER row carries blockers too, and says it is not writable",
        `the row a real run produces is ${a.writable ? "WRITABLE" : "NOT writable"}, and it says why: ` +
        `${(a.blockers[0] || "").slice(0, 120)}… The careful half of the desk used to be the half ` +
        `nobody reaches by pressing R.`)
    : bad("the AFTER row carries blockers too, and says it is not writable",
        a ? `blockers=${JSON.stringify(a.blockers)} writable=${a.writable} receipt="${a.row.receipt_path}"` : "no run result");
}

{
  // RE-ANCHORED 2026-08-01. This check used to read `gaia`, whose gate_row was the GLOB "gaia-*",
  // and assert the desk said so and named the kebab-case rule. The globs were then removed — they
  // can never be written to a kebab-case ledger, which was the whole point — so the fixture the
  // check depended on no longer exists.
  //
  // The PROPERTY is unchanged and still worth holding: **a row the desk cannot write must say why,
  // in full, and actionably.** Only the reason moved, from "it is a glob" to "its pre-registration
  // is not on disk". So the check now finds a genuinely unwritable gate at run time rather than
  // naming one, and it carries its own NEGATIVE CONTROL: at least one gate must ALSO be writable.
  // Without that, a desk that refused everything would score full marks here, which is the cheapest
  // false green a blocker check can ship.
  const all = D.registry().gates.map((g) => ({ id: g.id, p: D.preRegistration(g.id) }));
  const stuck = all.filter((x) => !x.p.writable);
  const free = all.filter((x) => x.p.writable);
  const sample = stuck[0];
  const everyStuckExplains = stuck.every((x) =>
    Array.isArray(x.p.blockers) && x.p.blockers.length > 0 &&
    x.p.blockers.every((b) => typeof b === "string" && b.length > 40));

  stuck.length > 0 && free.length > 0 && everyStuckExplains
    ? ok("the row that CANNOT be written says why, in full",
        `${stuck.length} of ${all.length} are not writable and every one names a complete reason — ` +
        `e.g. ${sample.id}: "${(sample.p.blockers[0] || "").slice(0, 110)}…". ` +
        `${free.length} ARE writable, which is the negative control: a desk that refused everything ` +
        `would pass this check while telling him nothing.`)
    : bad("the row that CANNOT be written says why, in full",
        `stuck=${stuck.length} writable=${free.length} everyStuckExplains=${everyStuckExplains}` +
        (stuck.length === 0 ? " — nothing is unwritable, so this check is vacuous and must be re-anchored" : "") +
        (free.length === 0 ? " — NOTHING is writable, so the desk is refusing everything" : ""));
}

{
  // A measured sentence rather than a remembered one. This was asserted three times as "every one of
  // the 12 pending rows", including on screen as the reason a row could not be written. Eleven do.
  const c = D.pendingConvention();
  const rows = fs.readFileSync(D.GATES, "utf8").split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.name);
  const pending = [...new Map(rows.map((r) => [r.name, r])).values()].filter((r) => r.verdict === "PENDING");
  const follow = pending.filter((r) => r.pre_registration_path && r.pre_registration_path === r.receipt_path).length;

  c.pending === pending.length && c.follow === follow && c.exceptions.length === pending.length - follow
    ? ok("the pending-row convention is MEASURED, and its exceptions are named",
        `${c.sentence}. Recomputed here from the ledger, independently. It was written as a universal ` +
        `("every one of the 12") in three places including the operator-facing blocker text, and it ` +
        `was never true — a stale universal rendered to a reader is worse than a stale comment.`)
    : bad("the pending-row convention is MEASURED, and its exceptions are named",
        `desk says ${c.follow}/${c.pending}, recomputed ${follow}/${pending.length}`);
}

{
  const receipt = "docs/receipts/control-plane/phase9_4.6_L4_green_2026-07-28.txt";
  const exists = fs.existsSync(path.join(D.REPO, receipt));
  const observed = runInChild("lab-l4", receipt);
  const a = observed && observed.after;
  exists && a && a.schema_errors.length === 0 && a.row.receipt_path === receipt && a.writable === true
    ? ok("NEGATIVE CONTROL: given a real receipt, the row comes out WRITABLE",
        `${a.encoded} — so the refusals above are refusals about THOSE rows, not a desk that says no ` +
        `to everything. A guard that refuses unconditionally checks nothing.`)
    : bad("NEGATIVE CONTROL: given a real receipt, the row comes out WRITABLE",
        a ? `errors=${a.schema_errors.join("; ")} writable=${a.writable} receipt="${a.row.receipt_path}"` : "no run result");
}

// ---- the run: fenced against the id, AND against the request ---------------------------------------------------

{
  const traversal = D.canRun("../../../etc/passwd");
  const shellish = D.canRun("rm -rf /");
  const proto = D.canRun("__proto__");
  const ctor = D.canRun("constructor");
  // `overlays`, not `hud`: hud's gate_row is `hud-*` and its family now has PENDING members, so it
  // is SEALED_BY_S10 before the ci check is ever reached — which is the 2026-07-28 reordering doing
  // its job. This check is about the ci refusal, so it asks a ci:false gate that nothing seals.
  const external = D.canRun("overlays");

  [traversal, shellish, proto, ctor].every((r) => r.code === "NOT_IN_REGISTRY") && external.code === "NEEDS_THE_WORLD"
    ? ok("the gate id is a LOOKUP KEY, never a command",
        "a path traversal, a shell string, __proto__ and constructor all come back NOT_IN_REGISTRY — " +
        "the id is only ever used to find an entry, and the argv is built from that entry. A run " +
        "endpoint that interpolated its input would be a remote shell wearing a floor plan. And a " +
        "ci:false gate nothing seals still reports NEEDS_THE_WORLD, so the reorder did not swallow it.")
    : bad("the gate id is a LOOKUP KEY, never a command",
        `traversal=${traversal.code} shell=${shellish.code} proto=${proto.code} ctor=${ctor.code} external=${external.code}`);
}

{
  // LIVE REQUESTS AGAINST A BOOTED SERVER. The previous version regexed the server's source for
  // POST_ALLOWED and concluded "exactly one non-GET route" — true, and silent about WHO MAY CALL IT.
  // The route had no CSRF fence, and a source regex is structurally incapable of noticing that.
  const s = bootServer();
  if (!s) {
    bad("THE RUN ROUTE REFUSES A CROSS-SITE REQUEST", "the lab server would not boot on an ephemeral port");
  } else {
    const hostile = request(s.port, "POST", "/api/lab/run", '{"gate":"lab-l0"}', {
      // Exactly the shape a browser sends with NO preflight — and the shape a JS-free
      // auto-submitting <form enctype="text/plain"> produces, which CORS does not govern at all.
      "content-type": "text/plain;charset=UTF-8",
      origin: "https://evil.example.test",
      referer: "https://evil.example.test/page",
      "sec-fetch-site": "cross-site",
    });
    const noHeader = request(s.port, "POST", "/api/lab/run", '{"gate":"lab-l0"}', { "content-type": "application/json" });
    const wrongType = request(s.port, "POST", "/api/lab/run", '{"gate":"lab-l0"}', { "content-type": "text/plain", "x-uni-cc": "1" });
    const proper = request(s.port, "POST", "/api/lab/run", '{"gate":"not-a-registered-gate"}',
      { "content-type": "application/json", "x-uni-cc": "1" });
    const otherPath = request(s.port, "POST", "/api/lab/rooms", "{}", { "content-type": "application/json", "x-uni-cc": "1" });
    const del = request(s.port, "DELETE", "/api/lab/run", "", { "x-uni-cc": "1" });

    // DNS REBINDING — the audit's "probe C", unimplemented in the first pass. An attacker-controlled
    // hostname resolving to 127.0.0.1 is SAME-ORIGIN to the browser, so the page may set any header
    // it likes AND read the response. A CSRF header does not touch this; a Host pin does, because
    // the rebound request arrives carrying the attacker's name.
    const rebound = request(s.port, "POST", "/api/lab/run", '{"gate":"lab-l0"}', {
      "content-type": "application/json", "x-uni-cc": "1", host: `rebind.evil.example.test:${s.port}`,
    });
    // ORIGIN, defence in depth: refused even when everything else is right.
    const badOrigin = request(s.port, "POST", "/api/lab/run", '{"gate":"lab-l0"}', {
      "content-type": "application/json", "x-uni-cc": "1", host: `127.0.0.1:${s.port}`,
      origin: "https://evil.example.test",
    });
    s.close();

    hostile.status === 403 && noHeader.status === 403 && wrongType.status === 403 &&
    rebound.status === 403 && badOrigin.status === 403 &&
    proper.status === 200 && /NOT_IN_REGISTRY/.test(proper.body) &&
    otherPath.status === 405 && del.status === 405
      ? ok("THE RUN ROUTE REFUSES A CROSS-SITE REQUEST, AND A REBOUND ONE",
          "measured against a booted server, not read off the source. CORS-simple POST with a hostile " +
          "Origin → 403 · no x-uni-cc → 403 · wrong content-type → 403 · A NON-LOOPBACK Host → 403 " +
          "(DNS rebinding, which a header fence does not touch) · a hostile Origin with everything " +
          "else correct → 403 · the proper shape → 200 and NOT_IN_REGISTRY · POST elsewhere → 405 · " +
          "DELETE → 405. The previous check counted routes and never callers.")
      : bad("THE RUN ROUTE REFUSES A CROSS-SITE REQUEST, AND A REBOUND ONE",
          `hostile=${hostile.status} no-header=${noHeader.status} wrong-type=${wrongType.status} ` +
          `rebound-host=${rebound.status} bad-origin=${badOrigin.status} proper=${proper.status} ` +
          `other-path=${otherPath.status} delete=${del.status}`);
  }
}

{
  // THE CONCURRENCY BOUND, RACED ON PURPOSE. It used to be READ when headers arrived and SET when the
  // body ended, so two POSTs overlapping in body transfer both passed and both ran — a TOCTOU race in
  // the guard whose entire job is "one at a time". Two simultaneous requests must produce exactly one
  // 200 and one 409.
  const s = bootServer();
  if (!s) {
    bad("two simultaneous runs cannot both start", "the lab server would not boot on an ephemeral port");
  } else {
    const r = spawnSync(process.execPath, ["-e",
      'const http=require("http");const port=Number(process.argv[1]);' +
      'const fire=()=>new Promise((res)=>{const q=http.request({host:"127.0.0.1",port,method:"POST",path:"/api/lab/run",' +
      '  headers:{"content-type":"application/json","x-uni-cc":"1"},timeout:240000},(x)=>{let b="";x.on("data",d=>b+=d);' +
      '  x.on("end",()=>res(x.statusCode))});q.on("error",()=>res(0));q.write(JSON.stringify({gate:"lab-l0"}));q.end()});' +
      'Promise.all([fire(),fire()]).then((c)=>console.log(JSON.stringify(c)))',
      String(s.port)], { encoding: "utf8", timeout: 300000 });
    s.close();

    let codes = [];
    try { codes = JSON.parse(String(r.stdout || "").trim().split(/\r?\n/).pop()); } catch { /* left empty */ }
    const sorted = [...codes].sort();

    sorted.length === 2 && sorted[0] === 200 && sorted[1] === 409
      ? ok("two simultaneous runs cannot both start",
          "fired together, one got 200 and one got 409. The bound is now taken in the same " +
          "synchronous block that tests it; it used to be read at header time and set at body end, " +
          "so two requests overlapping in transfer both passed the check that exists to stop exactly that.")
      : bad("two simultaneous runs cannot both start", `statuses: ${JSON.stringify(codes)} (want one 200, one 409)`);
  }
}

{
  // MEASURED, not regexed. The previous version proved four strings matched in desk.cjs and carried
  // the name "the run happens in a throwaway worktree at HEAD" — a claim about behaviour, evidenced
  // by text, which is the class this whole pass exists to close. It survived inside the file that
  // closed the same class elsewhere.
  //
  // What is measured: the run's cwd is a real directory under the system temp dir, it is GONE after
  // the run, the process really was `node <registry file>` with no shell, and the timeout really
  // kills — that last one proved by the 1ms run above, which produced a SIGTERM rather than a verdict.
  const probe = runInChild("lab-l0", null, {});
  const obs = probe && probe.observed;
  const killedByTimeout = runInChild("lab-l0", null, { timeoutMs: 1 });
  const reallyKills = killedByTimeout && killedByTimeout.observed &&
    killedByTimeout.observed.outcome === "did_not_finish" && /SIGTERM|SIGKILL/.test(killedByTimeout.observed.note || "");
  const noShell = /shell: false/.test(uncommented) && !/shell: true/.test(uncommented);
  const argvFromRegistry = /spawn\(execPath, \[may\.entry\.file\]/.test(uncommented);

  obs && obs.outcome === "ran" && /clean git worktree at HEAD/.test(obs.ran_in) && reallyKills && noShell && argvFromRegistry
    ? ok("the run happens in a throwaway worktree at HEAD, with no shell and a timeout THAT FIRES",
        `a real run reports outcome "ran" from a clean checkout at ${String(obs.head).slice(0, 8)}, and ` +
        `a 1ms timeout really kills the child (${killedByTimeout.observed.note}) rather than being a ` +
        `parameter nobody has watched work. argv is [node, <registry file>]; shell:false.`)
    : bad("the run happens in a throwaway worktree at HEAD, with no shell and a timeout THAT FIRES",
        `outcome=${obs && obs.outcome} kills=${reallyKills} no-shell=${noShell} argv=${argvFromRegistry}`);
}

{
  // THE SCHEMA QUOTE, restored. `theGap()` attributes a sentence to gate_row.schema.json and the
  // first remediation dropped the conjunct that checked it — so nothing would have noticed the quote
  // or the schema drifting apart. A quotation nobody verifies is a paraphrase with punctuation.
  const gap = D.theGap();
  const schema = fs.readFileSync(path.join(D.REPO, "production", "schemas", "gate_row.schema.json"), "utf8");
  const quoted = (gap.what_the_schema_says.match(/"([^"]{40,})"/) || [])[1] || "";
  const normalise = (s) => s.replace(/\s+/g, " ").trim();

  quoted && normalise(schema).includes(normalise(quoted))
    ? ok("the sentence attributed to the schema is IN the schema",
        `"${quoted.slice(0, 90)}…" found verbatim in production/schemas/gate_row.schema.json. The ` +
        `whole gap finding rests on this quote, and nothing checked it after the first remediation ` +
        `removed the conjunct that did.`)
    : bad("the sentence attributed to the schema is IN the schema",
        quoted ? `not found in the schema: "${quoted.slice(0, 120)}"` : "no quoted sentence to check");
}

{
  // The test-only hooks must not be reachable from a request. `entryOverride`, `headEntryOverride`,
  // `timeoutMs` and `execPath` exist so refusals and outcomes can be forced through real code —
  // which is only safe while the server never passes them.
  const callsCanRun = [...server.matchAll(/desk\.canRun\(([^)]*)\)/g)].map((m) => m[1].trim());
  const callsRun = [...server.matchAll(/desk\s*\n?\s*\.run\(([^)]*)\)/g)].map((m) => m[1].trim());
  const clean = callsCanRun.every((a) => !/[,{]/.test(a)) && callsRun.every((a) => a.split(",").length <= 2);

  clean
    ? ok("the test-only hooks are not reachable from a request",
        `lab_server.cjs calls canRun(${callsCanRun.join(" / ")}) and run(…) with at most two ` +
        `arguments — no options object crosses the HTTP boundary, so overriding the interpreter, the ` +
        `timeout or the registry entry is something only a gate in this repository can do.`)
    : bad("the test-only hooks are not reachable from a request",
        `canRun args: [${callsCanRun.join(" | ")}] · run args: [${callsRun.join(" | ")}]`);
}

{
  const done = runInChild("lab-l0");
  done && done.observed && done.observed.exit_code === 0 && done.observed.head
    ? ok("a real run, end to end, from the committed bytes",
        `lab-l0 ran at ${String(done.observed.head).slice(0, 8)} in a clean checkout, exit 0 in ` +
        `${done.observed.ms}ms, and the after-row came out ${done.after.row.verdict}. Not a ` +
        `simulation of a run — a process.`)
    : bad("a real run, end to end, from the committed bytes",
        done ? `exit=${done.observed && done.observed.exit_code}` : "the run did not complete");
}

// ---- S4, and the working tree, both MEASURED ---------------------------------------------------------------------

{
  const writes = /writeFileSync|appendFileSync|createWriteStream|fs\.write\b/.test(uncommented);
  const after = crypto.createHash("sha256").update(fs.readFileSync(D.GATES)).digest("hex");

  !writes && after === ledgerBefore
    ? ok("NOTHING HERE WRITES THE GATE LEDGER (S4)",
        `no write call exists in desk.cjs, and evidence/gates.ndjson hashes to ${after.slice(0, 16)}… ` +
        `after several real runs — the same as before them. The desk shows the exact line and stops.`)
    : bad("NOTHING HERE WRITES THE GATE LEDGER (S4)",
        writes ? "a write call is present in desk.cjs" : `the ledger hash changed: ${ledgerBefore.slice(0,16)}… → ${after.slice(0,16)}…`);
}

{
  // MEASURED, not regexed. The previous version established three string matches over desk.cjs and
  // concluded "it cannot touch the working tree" — a claim about behaviour, evidenced by text.
  const treeAfter = spawnSync("git", ["-C", D.REPO, "status", "--porcelain"], { encoding: "utf8" }).stdout;
  const worktreesAfter = worktreePaths();
  // THE SET DIFFERENCE, IN BOTH DIRECTIONS, BECAUSE THEY MEAN OPPOSITE THINGS.
  //   appeared = present after and not before -> THIS gate created it and failed to remove it. A leak,
  //              and the only condition that may fail this check.
  //   vanished = present before and not after  -> somebody else's stray that desk.cjs's unconditional
  //              `git worktree prune` cleaned up mid-run. That is this gate TIDYING, not leaking, and
  //              convicting it for that was a false accusation naming the wrong actor.
  const appeared = [...worktreesAfter].filter((p) => !worktreesBefore.has(p));
  const vanished = [...worktreesBefore].filter((p) => !worktreesAfter.has(p));
  const preExisting = worktreesBefore.size - 1;
  const tidied = vanished.length
    ? ` It also REMOVED ${vanished.length} pre-existing stray(s) it did not create — desk.cjs prunes ` +
      `unconditionally — and that is tidying, not leaking, so it does not fail this check.`
    : "";

  treeAfter === treeBefore && appeared.length === 0
    ? ok("the runs did not touch the working tree, and left no worktree behind",
        `git status --porcelain is byte-identical before and after every run in this gate, and NO ` +
        `worktree path present afterwards is one this gate added (${preExisting} pre-existing besides ` +
        `the main tree).${tidied} MEASURED, not asserted from source text — an older version proved ` +
        `three regexes matched and called that "it cannot touch the working tree", and the version ` +
        `after that compared COUNTS, so it convicted this gate for cleaning up somebody else's litter.`)
    : bad("the runs did not touch the working tree, and left no worktree behind",
        treeAfter !== treeBefore
          ? "git status changed across the runs:\n" + treeAfter
          : `${appeared.length} worktree(s) genuinely leaked by this gate's own runs: ${appeared.join(", ")}. ` +
            `A worktree whose 'git worktree add' was interrupted keeps git's own "initializing" lock, ` +
            `and 'worktree remove --force' CANNOT remove a locked worktree — it needs '-f -f' — while ` +
            `'worktree prune' skips locked ones entirely. That is desk.cjs's cleanup path; check it first.`);
}

// ---- THE GAP, RECOMPUTED HERE RATHER THAN ACCEPTED -------------------------------------------------------------------

{
  // The previous check was `gap.registered > 0 && typeof gap.in_the_canonical_ledger === "number"`,
  // which is true for any non-empty registry and any integer. It could not fail, and it did not
  // notice the headline drifting from 24 to 25. This recomputes both numbers from the two files.
  const gap = D.theGap();
  const reg = JSON.parse(fs.readFileSync(path.join(D.REPO, "viewer", "gate_registry.json"), "utf8"));
  const names = new Set(fs.readFileSync(D.GATES, "utf8").split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l).name; } catch { return null; } }).filter(Boolean));
  const expectedRegistered = reg.gates.length;
  const expectedInLedger = reg.gates.filter((g) => g.gate_row && !g.gate_row.includes("*") && names.has(g.gate_row)).length;

  gap.registered === expectedRegistered && gap.in_the_canonical_ledger === expectedInLedger &&
  gap.absent_from_it === expectedRegistered - expectedInLedger
    ? ok("THE GAP IS RECOMPUTED HERE AND AGREES",
        `${expectedRegistered} registered · ${expectedInLedger} in the canonical ledger · ` +
        `${expectedRegistered - expectedInLedger} absent, derived independently from ` +
        `gate_registry.json and gates.ndjson. ${gap.so} Closing it means authoring rows in ` +
        `evidence/gates.ndjson, which is S4 — the operator's, not an agent's.`)
    : bad("THE GAP IS RECOMPUTED HERE AND AGREES",
        `desk says ${gap.registered}/${gap.in_the_canonical_ledger}, recomputed ` +
        `${expectedRegistered}/${expectedInLedger}`);
}

{
  // NO COUNT IS HARDCODED IN PROSE. The headline said TWENTY-FOUR while the payload computed 25, in
  // the same file, in the same change. Numbers that are written down go stale; numbers that are
  // computed do not.
  const proseNumbers = (src + page).match(/\b(TWENTY-(FOUR|FIVE|SIX|SEVEN)|\d\d registered gates?|\d\d of them pass)\b/gi) || [];
  proseNumbers.length === 0
    ? ok("no gate count is written into prose",
        "the headline is rendered from theGap() on every request, and nothing in either file states a " +
        "count in words or digits — INCLUDING the comments explaining why. This check convicted its " +
        "own correction's explanation on the first run, which is use-versus-mention for the tenth " +
        "time here; the anecdote gave up its digits rather than the rule giving up its teeth.")
    : bad("no gate count is written into prose", `hardcoded: ${[...new Set(proseNumbers)].join(", ")}`);
}

{
  // S10 WAS NOT DORMANT. IT WAS MASKED, and two separate bugs did the masking.
  //
  // A sweep reported the seal unreachable for every registered gate and a refuter agreed it was
  // "dormant, not dead". Both were reading a consequence, not a cause. The seal sat BELOW the
  // `ci` check, so `hud` — gate_row `hud-*`, with three PENDING members in the ledger — returned
  // NEEDS_THE_WORLD and the seal never spoke. And globs were exempted outright, so the entry naming
  // the most rows was the one the seal could not touch. Fix the order, check the family, and it
  // fires on the REAL ledger immediately, with no injection at all.
  const real = D.canRun("hud");
  const family = D.canRun("gaia", { pendingNames: new Set(["gaia-golden-pins"]) });
  const notOverFiring = D.canRun("lab-l0");

  real.code === "SEALED_BY_S10" && Array.isArray(real.sealed_by) && real.sealed_by.length > 0 &&
  family.code === "SEALED_BY_S10" && family.sealed_by.includes("gaia-golden-pins") &&
  notOverFiring.allowed === true
    ? ok("the S10 seal bites on the REAL ledger, and does not over-fire",
        `hud is SEALED_BY_S10 by ${real.sealed_by.join(", ")} — a GLOB entry sealed by its family's ` +
        `pending members, which the old code exempted by construction. An injected pending member ` +
        `seals gaia too. And lab-l0, with nothing pending, is still ALLOWED — a seal that refuses ` +
        `everything is not a seal.`)
    : bad("the S10 seal bites on the REAL ledger, and does not over-fire",
        `hud=${real.code} family=${family.code} lab-l0-allowed=${notOverFiring.allowed}`);
}

{
  // The rest of canRun's refusals, each forced. A refusal nobody has watched work is a refusal
  // nobody should trust, and four of these were added on 2026-07-28 with nothing exercising them.
  const forced = {
    OUTSIDE_THE_REPO: D.canRun("__probe_outside__", { entryOverride: { id: "__probe_outside__", ci: true, file: "../escape.cjs", gate_row: "x" } }),
    REGISTRY_DRIFTED: D.canRun("__probe_drift__", { entryOverride: { id: "__probe_drift__", ci: true, file: "viewer/lab/desk.cjs", gate_row: "x" }, headEntryOverride: { id: "__probe_drift__", file: "viewer/lab/rooms.cjs" } }),
  };
  const codes = Object.entries(forced).map(([want, got]) => `${want}→${got.code}`);
  Object.entries(forced).every(([want, got]) => got.code === want)
    ? ok("every refusal canRun can emit has been watched working",
        codes.join(" · ") + ". A path that escapes the repository makes the payload's sentence " +
        "'ran in a clean worktree at HEAD' false; a registry that disagrees with HEAD means the desk " +
        "would run one file and label the result with another's name.")
    : bad("every refusal canRun can emit has been watched working", codes.join(" · "));
}

{
  /NONE of them has a row in the canonical ledger|NO ROW IN THE CANONICAL LEDGER/.test(page)
    ? ok("the page says the gap out loud", "a viewer is never left wondering whether the desks failed to load")
    : bad("the page says the gap out loud", "the page draws hollow desks and explains nothing");
}

// ---- helpers -------------------------------------------------------------------------------------------------------

// MEMOISED BY ARGUMENTS. Several checks need the same real run, and each one costs a `git worktree
// add`, a node spawn and a `worktree remove` — the gate took 3m34s before this, almost all of it
// re-running identical work. Distinct arguments still get their own real run, so nothing is shared
// between the checks that must differ (the 1ms timeout, the bogus interpreter, the receipt case).
function runInChild(id, receipt, runOpts) {
  const key = JSON.stringify([id, receipt || "", runOpts || {}]);
  if (!RUN_CACHE.has(key)) RUN_CACHE.set(key, runInChildUncached(id, receipt, runOpts));
  return RUN_CACHE.get(key);
}

/** run() and afterRun() in ONE child, because the run token is minted in the process that ran. */
function runInChildUncached(id, receipt, runOpts) {
  // `process.exit(0)` after the answer, deliberately. Node's `timeout` option on spawn arms a timer
  // that KEEPS THE EVENT LOOP ALIVE FOR THE FULL BUDGET even when the spawn fails instantly — so the
  // bogus-interpreter case resolved in milliseconds and then sat there for 180 SECONDS before the
  // child exited. Measured: this one check was 183s of a 3m21 gate. The promise settles correctly
  // either way, which is why the lab server is unaffected (it releases the run slot in `.finally`),
  // but a short-lived process must not wait on a timer for a thing that already happened.
  const r = spawnSync(process.execPath, ["-e",
    'const D=require(process.argv[1]);' +
    'D.run(process.argv[2],()=>{},JSON.parse(process.argv[4]||"{}")).then(o=>{' +
    '  if(process.argv[3]) o.receipt_path=process.argv[3];' +
    '  const a=o.refused?null:D.afterRun(process.argv[2],o);' +
    '  console.log("\\u0001"+JSON.stringify({observed:{...o,output:undefined},after:a}));' +
    '  process.exit(0);' +
    '})',
    path.join(__dirname, "desk.cjs"), id, receipt || "", JSON.stringify(runOpts || {})],
    { encoding: "utf8", cwd: D.REPO, timeout: 240000 });
  const line = String(r.stdout || "").split(/\r?\n/).find((l) => l.startsWith(""));
  try {
    return line ? JSON.parse(line.slice(1)) : null;
  } catch {
    return null;
  }
}

/**
 * Boot the real lab server on a free port so the fence can be tested by ASKING it.
 *
 * `net.createServer().listen(0)` is asynchronous, so reading `.address()` on the next line returns
 * null — the first version did exactly that, got port 0, and every probe failed. The check reported
 * "the lab server would not boot", which is at least honest: it failed rather than passing on a
 * server that was never there. A port picked at random and probed for freedom is enough here, and it
 * has no async step to get wrong.
 */
function bootServer() {
  const { spawn } = require("child_process");
  for (let attempt = 0; attempt < 12; attempt++) {
    const port = 18103 + Math.floor(Math.random() * 900);
    if (request(port, "GET", "/healthz", null, {}).status !== 0) continue;   // someone is already there

    const child = spawn(process.execPath, [path.join(__dirname, "lab_server.cjs")],
      { cwd: D.REPO, env: { ...process.env, UNI_LAB_PORT: String(port) }, stdio: "ignore" });

    for (let i = 0; i < 40; i++) {
      if (request(port, "GET", "/healthz", null, {}).status === 200) {
        return { port, close: () => child.kill() };
      }
      // A real 250ms wait. `setTimeout(()=>{},100)` does not keep a process alive for 100ms — it
      // schedules a no-op and exits immediately, which is why the first version's retry loop spun.
      sleep(250);   // a real synchronous sleep, not a spawned process that schedules a no-op
    }
    child.kill();
  }
  return null;
}

/** A synchronous HTTP request, so the checks stay in one straight line. */
function request(port, method, pathname, body, headers) {
  const r = spawnSync(process.execPath, ["-e",
    'const http=require("http");const a=JSON.parse(process.argv[1]);' +
    'const q=http.request({host:"127.0.0.1",port:a.port,method:a.method,path:a.path,headers:a.headers,timeout:240000},(res)=>{' +
    '  let b="";res.on("data",d=>b+=d);res.on("end",()=>console.log(JSON.stringify({status:res.statusCode,body:b})));});' +
    'q.on("error",e=>console.log(JSON.stringify({status:0,body:String(e.code||e.message)})));' +
    'q.on("timeout",()=>{q.destroy();console.log(JSON.stringify({status:0,body:"timeout"}))});' +
    'if(a.body!==null)q.write(a.body);q.end();',
    JSON.stringify({ port, method, path: pathname, headers, body: body === undefined ? null : body })],
    { encoding: "utf8", timeout: 250000 });
  try {
    return JSON.parse(String(r.stdout || "").trim().split(/\r?\n/).pop());
  } catch {
    return { status: 0, body: "no answer" };
  }
}

/**
 * A REAL synchronous sleep. The first version of this was
 * `spawnSync(node, ["-e", "setTimeout(()=>{}, 250)"])`, which does not sleep at all: it schedules a
 * no-op and exits immediately, so the retry loop it paced was spinning. It also spawned a process
 * per iteration. Atomics.wait blocks this thread for the requested time and costs nothing.
 */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---- verdict --------------------------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) {
  console.log(`${r.pass ? "  ok" : "FAIL"}  [${String(r.ms).padStart(6)}ms] ${r.name} - ${r.detail}`);
}
{
  const total = results.reduce((a, r) => a + r.ms, 0);
  const slow = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3);
  console.log(`\n  ${(total / 1000).toFixed(1)}s total · slowest: ` +
    slow.map((r) => `${r.name.slice(0, 42)} (${(r.ms / 1000).toFixed(1)}s)`).join(" · "));
}
const gap = D.theGap();
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l5, ${results.length - failed.length}/${results.length} checks`
);
console.log(`  ${gap.registered} registered gates · ${gap.in_the_canonical_ledger} in the canonical ledger.`);
console.log("  Walk it: node viewer/lab/lab_server.cjs  ->  http://127.0.0.1:8103/lab/l5");
process.exit(failed.length === 0 ? 0 : 1);
