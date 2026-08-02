// gate_attempts.cjs — classify every PENDING gate by WHETHER IT COULD EVER HAVE BEEN ATTEMPTED.
// (Phase 9, step 4.2. Shared by classify_gate_attempts.cjs and verify_gate_attempts.cjs.)
//
// THE FALSIFIER THIS EXISTS TO CLOSE
// ----------------------------------
//   "'never attempted' and 'attempted and blocked' still collapse into one word"
//
// They do. The word is PENDING, and dozens of distinct gates have worn it. A gate nobody has written a runner
// for, and a gate whose runner exists and REFUSES BY CONSTRUCTION, read identically — so the
// ledger cannot tell you which of them is waiting on work and which is waiting on the world.
//
// WHY A SIDECAR, AND NOT THE FIELD THE PLAN ASKED FOR
// ---------------------------------------------------
// The plan says these gates "get attempted_at". They cannot, and the obstacle is threefold:
// production/schemas/gate_row.schema.json declares `additionalProperties: false`, so a row
// carrying a new key FAILS ITS OWN SCHEMA and F5 refuses it; amending the schema is S5; and
// writing the rows is S4. A sidecar avoids all three, and it is this programme's own idiom —
// S3: "a correction is a new sidecar with a new hash". **NOTHING HERE WRITES gates.ndjson.**
//
// AND IT NEVER RUNS A GATE
// ------------------------
// S10 forbids running the PENDING science gates (it names a count and no members -- see the L4 finding), so this classifies from THE RECORD:
// what the row points at, whether a runner exists, and whether that runner refuses by
// construction. That is p3's declared M5 — historical replay — and it is why `read` is injectable:
// the same classification can be run against a PAST COMMIT to show the distinction was always
// derivable and is not something invented today.
"use strict";

const fs = require("fs");
const path = require("path");

// @limitation gates.attempts.inferred-from-record
//   what: this classifies whether a gate COULD have been attempted, not whether anyone did attempt it
//   why: S10 forbids running the PENDING science gates, so the only evidence available is the record -- the row, the runner, and whether that runner refuses by construction. An attempt that left no trace is invisible here, and so is one made outside this repository.
//   claim: sound about the ROUTE to an attempt (none, blocked, or open). NOT a log of attempts, and never described as one.
//   proof: viewer/verify_gate_attempts.cjs
// @limitation gates.attempts.result-document-is-a-judgment
//   what: HAS_RESULT_DOCUMENT means the row names a receipt distinct from its pre-registration -- it does not mean the receipt contains a result
//   why: reading the receipt to decide whether it reports an outcome would be interpretation, and a classifier that interprets prose will disagree with the next reader. The structural fact is checkable; the semantic one is not.
//   claim: a reliable pointer to the rows worth a human's attention -- the count is printed by the classifier on every run and is NOT written here, because the number this line used to carry (23) was the EVER-PENDING tally and the live figure is 1. NOT a finding that those rows have results.
//   proof: viewer/verify_gate_attempts.cjs says the count out loud on every run
const REPO = path.resolve(__dirname, "..");
const SIDECAR = path.join(REPO, "evidence", "gate_attempts.ndjson");

// A runner named anywhere in the row — `notes` is where they live in practice.
const RUNNER_RE = /(runs\/[A-Za-z0-9_.\/-]+\.(?:exs|py))/;
// A runner that refuses by construction. Both spellings appear in this repository.
const REFUSES_RE = /@scaffold|SCAFFOLD/;

// Reading the working tree. Swap this for a git reader to replay history — see verify's M5 check.
const diskReader = {
  label: "working tree",
  read(rel) {
    try {
      return fs.readFileSync(path.join(REPO, rel), "utf8");
    } catch {
      return null;
    }
  },
  exists(rel) {
    return fs.existsSync(path.join(REPO, rel));
  },
};

/**
 * Four states, and the point is that they are FOUR rather than one.
 *
 *   NO_RUNNER            nothing exists that could run this. It cannot be attempted at all,
 *                        and no amount of waiting changes that — it is waiting on WORK.
 *   RUNNER_REFUSES       a runner exists and halts by construction (@scaffold). The route to
 *                        attempting it exists and is BLOCKED — it is waiting on the WORLD, or on
 *                        the paired code its own header names.
 *   RUNNABLE_NEVER_RUN   a runner exists, does not refuse, and produced no result document.
 *                        This one is genuinely just unrun.
 *   HAS_RESULT_DOCUMENT  a receipt distinct from the pre-registration exists. A PENDING gate with
 *                        a result document is a FINDING, not a category — say so rather than
 *                        smoothing it into the others.
 */
function classifyRow(row, reader) {
  const m = RUNNER_RE.exec(JSON.stringify(row));
  const runner = m ? m[1] : null;
  const runnerSource = runner ? reader.read(runner) : null;

  // A row whose "receipt" IS its pre-registration has no result document: it points at the
  // promise, not at an outcome. That is the sharpest never-produced-anything signal available
  // without running a thing.
  const selfReferential =
    !!row.receipt_path && row.receipt_path === row.pre_registration_path;

  let state;
  if (!runner) state = "NO_RUNNER";
  else if (runnerSource === null) state = "NO_RUNNER";
  else if (REFUSES_RE.test(runnerSource)) state = "RUNNER_REFUSES";
  else if (selfReferential) state = "RUNNABLE_NEVER_RUN";
  else state = "HAS_RESULT_DOCUMENT";

  if (state === "NO_RUNNER" && !selfReferential) state = "HAS_RESULT_DOCUMENT";

  return {
    gate: row.name,
    verdict: row.verdict,
    state,
    runner,
    runner_refuses: state === "RUNNER_REFUSES",
    result_document: selfReferential ? null : row.receipt_path || null,
    why: {
      NO_RUNNER:
        "no runner is named anywhere in this row, and the row points at its own pre-registration " +
        "rather than at a result. Nothing exists that could attempt it: it is waiting on WORK.",
      RUNNER_REFUSES:
        "a runner exists at " + runner + " and REFUSES BY CONSTRUCTION — its own body halts " +
        "rather than running. The route to attempting this gate exists and is blocked.",
      RUNNABLE_NEVER_RUN:
        "a runner exists at " + runner + ", does not refuse by construction, and this row still " +
        "points at its own pre-registration. Genuinely unrun.",
      HAS_RESULT_DOCUMENT:
        "this row names a result document distinct from its pre-registration while still reading " +
        "PENDING. That is a FINDING rather than a category: something was produced and the verdict " +
        "was never moved.",
    }[state],
  };
}

function pendingRows(reader) {
  const raw = reader.read("evidence/gates.ndjson");
  if (raw === null) return [];
  const rows = raw
    .split(/\r?\n/)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // One entry per gate NAME. A gate revised three times is one gate.
  //
  // CORRECTED 2026-07-28, caught by the L4 gate. This function answers "which gates have EVER been
  // recorded PENDING" — 59 of them. It was read, by its own header and by everything downstream, as
  // "which gates ARE pending", and that is 12. The other 47 were decided later and are waiting on
  // nothing at all. A backlog and the history of a backlog are different objects, and reporting the
  // second under the first's name made the queue look five times longer than it is.
  //
  // The 59 entries stay: what waited, and what stopped waiting, is real and worth keeping. What
  // changes is that every entry now carries its CURRENT verdict, and the header reports both
  // numbers under names that say which is which.
  return [...new Map(
    rows.filter((r) => String(r.verdict).toUpperCase() === "PENDING").map((r) => [r.name, r])
  ).values()];
}

/** The last row for each gate name — its verdict today, as opposed to a verdict it once had. */
function currentVerdicts(reader = diskReader) {
  const raw = reader.read("evidence/gates.ndjson");
  if (raw === null) return new Map();
  const rows = raw
    .split(/\r?\n/)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.name);
  return new Map(rows.map((r) => [r.name, String(r.verdict).toUpperCase()]));
}

function classify(reader = diskReader) {
  const rows = pendingRows(reader);
  const now = currentVerdicts(reader);

  const entries = rows
    .map((r) => {
      const e = classifyRow(r, reader);
      const current = now.get(e.gate) || "UNKNOWN";
      return { ...e, current_verdict: current, pending_now: current === "PENDING" };
    })
    .sort((a, b) => a.gate.localeCompare(b.gate));

  const tally = {};
  const tallyNow = {};
  for (const e of entries) {
    tally[e.state] = (tally[e.state] || 0) + 1;
    if (e.pending_now) tallyNow[e.state] = (tallyNow[e.state] || 0) + 1;
  }

  return {
    source: reader.label,
    pending_now: entries.filter((e) => e.pending_now).length,
    ever_pending: entries.length,
    tally_pending_now: tallyNow,
    tally_ever_pending: tally,
    entries,
  };
}

// NDJSON, one gate per line, sorted — the same shape as the ledger it sits beside, and diffable.
function render(result) {
  const header = {
    schema: "uni.gate_attempts.v1",
    note:
      "SIDECAR. Derived from evidence/gates.ndjson and the runners it names; NOTHING HERE WRITES " +
      "gates.ndjson (S4) and NOTHING HERE RUNS A GATE (S10). Regenerate with " +
      "`node viewer/classify_gate_attempts.cjs`; the `gate-attempts` gate refuses any difference.",
    why:
      "PENDING collapses 'nobody has written a runner' and 'the runner exists and refuses' into " +
      "one word, so the ledger cannot say which gates wait on WORK and which wait on the WORLD.",
    two_numbers:
      "pending_now is the BACKLOG: gates whose LAST row still says PENDING. ever_pending is the " +
      "HISTORY of that backlog: every gate that has ever worn the word, most of which were decided " +
      "afterwards. The first version of this sidecar reported the second under the name of the " +
      "first, which made the queue look five times longer than it is. Corrected 2026-07-28, caught " +
      "by the L4 gate. Nothing was removed: each entry now carries current_verdict, so what waited " +
      "and what stopped waiting are both readable.",
    source: result.source,
    pending_now: result.pending_now,
    ever_pending: result.ever_pending,
    tally_pending_now: result.tally_pending_now,
    tally_ever_pending: result.tally_ever_pending,
  };
  return [JSON.stringify(header), ...result.entries.map((e) => JSON.stringify(e))].join("\n") + "\n";
}

module.exports = { classify, render, classifyRow, pendingRows, diskReader, SIDECAR, REPO };
