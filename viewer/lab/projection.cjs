// projection.cjs — THE REAL GATES, projected. (Phase 9 step 4.6, build L3)
//
// L3 is the first build that reads anything live. L0 was an empty room, L1 stood the five
// materials on it from a fixture, L2 proved a screenshot can tell them apart. This puts the actual
// gate ledger on the floor.
//
// WHAT THE PLAN EXPECTED, AND WHAT IS ACTUALLY THERE
// ---------------------------------------------------
// The plan says L3 shows "the real gates on his floor, and the ones with missing receipts standing
// in fog." Measured 2026-07-28 before a line was written:
//
//     109 unique gates · 109 receipts PRESENT on disk · 0 missing
//
// So the half of the promise about missing receipts has nothing to show. Good news, and it is
// said rather than quietly skipped.
//
// AND YET EVERY GATE RENDERS AS FOG, FOR A DIFFERENT REASON ENTIRELY
// -------------------------------------------------------------------
// A gate row carries `evidence_class`. It does NOT carry `truth_class`, and it CANNOT:
// `production/schemas/gate_row.schema.json` declares `additionalProperties: false`, so a row
// bearing one would fail its own schema and F5 would refuse it.
//
// F24 says a node lacking `truth_class` renders as fog. So the honest projection of this ledger is
// a floor entirely in fog — not because the evidence is weak, and not because a receipt is
// missing, but because THE RENDER CONTRACT AND THE GATE LEDGER WERE BUILT WITH DIFFERENT
// VOCABULARIES AND NOTHING HAS EVER CONNECTED THEM.
//
//     truth_class     OBSERVED · STRUCTURAL_RECONSTRUCTION · REDUCED_MODEL · DERIVED · SIMULATED · UNKNOWN
//     evidence_class  A · B · C · Sec · pending
//
// THESE ARE DIFFERENT AXES AND THE TEMPTATION IS TO MAP THEM. A gate with `evidence_class: "A"`
// is NOT thereby `OBSERVED`: one says how strong the evidence is, the other says what KIND of
// thing the node is — measured, reconstructed, reduced, derived, simulated. Inventing
// `A -> OBSERVED` would relabel a strength as a kind, which is truth laundering, which is the
// precise thing the truth contract forbids. So nothing here maps them, and the fog is the finding.
//
// Closing it needs a `truth_class` in the gate row schema, and that is a contract amendment: S5,
// the operator's, not an agent's.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const GATES = path.join(REPO, "evidence", "gates.ndjson");

// The same rule as l1.html and Scene.material/1, and it is not restated for a third time: the L1
// gate cross-checks that JS against the Elixir, and this reuses that same shape deliberately.
function materialOf(n) {
  const r = n.receipt_ref;
  if (typeof r !== "string" || r.trim() === "") return "fog";
  switch (n.truth_class) {
    case "OBSERVED": return "lit_solid";
    case "STRUCTURAL_RECONSTRUCTION": return "seamed_solid";
    case "REDUCED_MODEL":
    case "DERIVED": return "translucent";
    case "SIMULATED": return "staged";
    default: return "fog";
  }
}

/**
 * Read the canonical gate ledger and project it as scene nodes. A READ: it opens one file and
 * writes nothing, ever.
 *
 * One node per gate NAME, not per row. A gate revised three times is one gate; counting rows
 * would put the same thing on the floor three times and call it three things.
 */
function project(gatesPath = GATES) {
  // The path is overridable ONLY so a test can point at a modified COPY and prove a real change
  // gets through diff suppression. Without it the mutation can only reset the cache, which proves
  // the cache clears - not that a changed world is seen. That is a weaker claim than the name.
  let raw;
  try {
    raw = fs.readFileSync(gatesPath, "utf8");
  } catch (e) {
    return { error: "the gate ledger could not be read: " + e.message, nodes: [] };
  }

  const rows = raw
    .split(/\r?\n/)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);

  const byName = [...new Map(rows.filter((r) => r.name).map((r) => [r.name, r])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  // Laid out in a grid on the floor. Position is presentation and carries NO meaning — it is not
  // ordered by verdict, strength or age, because a reader who infers a ranking from a layout has
  // been told something nobody measured.
  const COLS = 12;
  const nodes = byName.map((r, i) => {
    const receiptRel = r.receipt_path || "";
    const receiptOnDisk = receiptRel !== "" && fs.existsSync(path.join(REPO, receiptRel));

    const node = {
      id: r.name,
      // ABSENT, not guessed. The ledger has no truth_class and its schema forbids one, so this
      // stays undefined and F24 does the rest.
      truth_class: r.truth_class,
      // F24's other half: a receipt the ledger NAMES but which is not on disk is not a receipt.
      receipt_ref: receiptOnDisk ? receiptRel : "",
      evidence_class: r.evidence_class,
      verdict: r.verdict,
      phase: r.phase || null,
      captured_at: r.last_updated || null,
      receipt_named: receiptRel || null,
      receipt_on_disk: receiptOnDisk,
      x: 4 + (i % COLS) * 3.2,
      y: 4 + Math.floor(i / COLS) * 3.4,
    };
    node.material = materialOf(node);
    // F26: nothing here probed anything, so nothing claims liveness. A projection of a ledger is
    // not a probe of a service, and drawing a liveness dot would say it was.
    node.liveness = "not_probed";
    return node;
  });

  const fogged = nodes.filter((n) => n.material === "fog");
  const missingReceipt = nodes.filter((n) => !n.receipt_on_disk);

  return {
    build: "L3",
    read_at: new Date().toISOString(),
    source: "evidence/gates.ndjson",
    rows: rows.length,
    nodes,
    // THE FINDING, carried in the payload so every surface that renders this also has to face it.
    why_fog: {
      fogged: fogged.length,
      of: nodes.length,
      missing_receipt: missingReceipt.length,
      reason:
        missingReceipt.length === fogged.length
          ? "receipts named by the ledger are absent from disk"
          : "THE GATE LEDGER CARRIES NO truth_class, AND ITS SCHEMA FORBIDS ONE. " +
            "production/schemas/gate_row.schema.json declares additionalProperties: false, so a row " +
            "bearing a truth_class would fail its own schema and F5 would refuse it. F24 renders a " +
            "node without one as fog. This is not weak evidence and not a missing receipt: it is " +
            "two vocabularies that were never connected. evidence_class (A/B/C/Sec/pending) says how " +
            "STRONG the evidence is; truth_class (OBSERVED/STRUCTURAL_RECONSTRUCTION/REDUCED_MODEL/" +
            "DERIVED/SIMULATED) says what KIND of thing it is. Mapping one onto the other would " +
            "relabel a strength as a kind, which is truth laundering. Nothing here does it.",
      closing_it: "add truth_class to the gate row schema — a contract amendment, S5, the operator's",
    },
  };
}

// 1 Hz, DIFF-SUPPRESSED. A surface that re-sends an unchanged world once a second teaches its
// reader that motion means nothing, and then real motion goes unnoticed. The projection is hashed;
// identical payloads answer `unchanged` and the client keeps what it has.
let lastHash = null;
let lastAt = 0;
const MIN_MS = 1000;

function poll(now = Date.now(), gatesPath = GATES) {
  if (now - lastAt < MIN_MS) return { unchanged: true, throttled: true, since: lastAt };
  lastAt = now;
  const p = project(gatesPath);
  const h = require("crypto")
    .createHash("sha256")
    .update(JSON.stringify(p.nodes) + JSON.stringify(p.why_fog))
    .digest("hex");
  if (h === lastHash) return { unchanged: true, hash: h };
  lastHash = h;
  return { ...p, hash: h, changed: true };
}

module.exports = { project, poll, materialOf, GATES, REPO, _reset: () => { lastHash = null; lastAt = 0; } };
