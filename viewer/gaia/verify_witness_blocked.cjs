// verify_witness_blocked.cjs — independent_custodians:0 FORCES BLOCKED (Phase 9, step 1.8).
//
// THE DEFECT THIS CLOSES. viewer/gaia/witness_probe.cjs:169 computes `independent_custodians` and writes it
// into witness.json on every capture. NOTHING READ IT. The single number that says whether the off-box
// witness is real was measured, stored on disk, and consulted by no consumer anywhere — not Gaia, not the
// Control Plane. It reads 0 today: node2 answers the WRITER'S OWN KEY, so no custodian sits in a failure
// domain the writer cannot reach, and the anchor stands on git alone — tamper-EVIDENT, not unforgeable.
//
// This gate proves the number is now READ and that a zero BLOCKS rather than rendering as a value, with the
// same polarity as the capture-age fence: a claim that cannot be corroborated must say so.
//
// WHAT THIS DOES NOT DO, DELIBERATELY: it does not repair the witness. Removing the writer's key from node2
// is STOP S1 — the one repair an agent must not perform — because using write access to erase the evidence
// of write access destroys the last proof instead of restoring a witness. THIS GATE IS THE REFUSAL, NOT THE
// REPAIR, and it is designed to keep failing until a human makes the witness real.
//
// Fixtures only; the real witness.json is never written and node2 is never touched.
// Usage: node viewer/gaia/verify_witness_blocked.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const path = require("path");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// The bound, read from the shipped collector rather than typed here a second time. It was `3600`
// in this file AND in verify_capture_age_fence.cjs AND in collectors.cjs — three copies of one
// number, any of which could drift without the others noticing.
const MAX = require("./collectors.cjs")._rule.CAPTURE_MAX_AGE_S;
const NOW = Date.parse("2026-07-27T00:00:00.000Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();

// THE SHIPPED RULE, NOT A COPY OF IT — corrected 2026-07-28.
//
// This file used to carry its own `blockingConditions()` under "rebuilt exactly as the collector
// applies it", and its ONLY tie to the shipped code was `src.includes("independent_custodians")` —
// a substring, which a `collectors.cjs` carrying nothing but the comment "// independent_custodians
// is no longer read" would have satisfied. So the refusal could have been deleted outright and every
// check below would have stayed green while asserting a runtime property of Gaia.
const COL = require("./collectors.cjs");
const blockingConditions = COL._rule.witnessBlockingConditions;
const blocked = (w, nowMs = NOW) => blockingConditions(w, nowMs).length > 0;

// ---- 1. THE LIVE STATE: the real capture must be BLOCKED right now --------------------------------------
function checkRealCaptureBlocked() {
  let w = null;
  try { w = JSON.parse(fs.readFileSync(path.join(__dirname, "witness.json"), "utf8")); } catch (_) {}
  if (!w) { bad("real-capture-is-blocked", "witness.json unreadable — cannot evaluate the live state"); return; }
  const why = blockingConditions(w, Date.now());
  if (!why.length) bad("real-capture-is-blocked", `the LIVE witness reports NO blocking condition (independent_custodians=${w.independent_custodians}). If a genuinely independent custodian now exists this gate must be re-read deliberately — it is not supposed to go quiet on its own.`);
  else ok("real-capture-is-blocked", `the live capture is BLOCKED for: ${why.join(" · ")} — the compromise is reported, not absorbed`);
}

// ---- 2. THE FALSIFIER: zero independent custodians must never read as a value ---------------------------
function checkZeroBlocks() {
  const w = { captured_at: ago(60), independent_custodians: 0 };
  if (!blocked(w)) bad("zero-custodians-forces-blocked", "independent_custodians=0 with a FRESH capture did not block — a witness that corroborates nothing was rendered as a working witness");
  else ok("zero-custodians-forces-blocked", "independent_custodians=0 blocks even when the capture is perfectly fresh — freshness cannot substitute for independence");
}

// ---- 3. a real independent custodian + fresh capture must CLEAR (negative control) ----------------------
// Without this the gate could be a constant "no", which proves nothing and would hide the day the witness
// is genuinely fixed.
function checkOneCustodianClears() {
  const w = { captured_at: ago(60), independent_custodians: 1 };
  if (blocked(w)) bad("one-independent-custodian-clears", `a fresh capture with one independent custodian still blocked: ${blockingConditions(w, NOW).join(", ")} — the gate is a constant no and could never show a real repair`);
  else ok("one-independent-custodian-clears", "one independent custodian + a fresh capture clears — equal:true is reachable, so a genuine repair would be visible");
}

// ---- 4. the two conditions are INDEPENDENT — neither can mask the other ---------------------------------
function checkConditionsIndependent() {
  const staleButIndependent = { captured_at: ago(99999), independent_custodians: 3 };
  const freshButZero = { captured_at: ago(1), independent_custodians: 0 };
  const problems = [];
  if (!blocked(staleButIndependent)) problems.push("3 independent custodians made a STALE capture pass — independence cannot vouch for freshness");
  if (!blocked(freshButZero)) problems.push("a fresh capture made ZERO custodians pass — freshness cannot vouch for independence");
  if (problems.length) bad("conditions-are-independent", problems.join("\n      "));
  else ok("conditions-are-independent", "staleness and non-independence block separately — neither can mask the other");
}

// ---- 5. unreadable is BLOCKED, never assumed safe -------------------------------------------------------
function checkUnreadableBlocks() {
  const bads = [
    { captured_at: ago(60) },                                   // field missing entirely
    { captured_at: ago(60), independent_custodians: null },
    { captured_at: ago(60), independent_custodians: "two" },
    null,                                                        // no capture at all
  ];
  const leaks = bads.filter((w) => !blocked(w));
  if (leaks.length) bad("unreadable-is-blocked", `${leaks.length} unreadable/absent capture(s) did NOT block — absence of evidence was treated as evidence of corroboration`);
  else ok("unreadable-is-blocked", "a missing field, null, a non-numeric count and an absent capture all BLOCK — unknown is never assumed safe");
}

// ---- 6. the probe's number actually has a consumer now --------------------------------------------------
// The original defect was not a wrong value; it was a correct value nobody read.
function checkNumberIsRead() {
  const col = fs.readFileSync(path.join(__dirname, "collectors.cjs"), "utf8");
  if (!col.includes("independent_custodians")) bad("the-number-has-a-consumer", "collectors.cjs does not read independent_custodians — the probe would still be computing a number nobody consults, which WAS the defect");
  else ok("the-number-has-a-consumer", "collectors.cjs reads independent_custodians and projects it — the number written by witness_probe.cjs:169 finally has a reader");
}

// ---- THE MUTATION THAT WOULD HAVE CAUGHT THIS GATE BEING A COPY -----------------------------------
//
// Remove the custodian test from the SHIPPED rule and require the refusal to stop firing. Before
// 2026-07-28 this file tested a rebuild, tied to the real code only by a substring search that a
// comment could satisfy — so the refusal could have been deleted with every check still green.
function checkTheRefusalIsLoadBearing() {
  const path = require("path");
  const { compileMutated } = require("./mutate.cjs");

  let mutant;
  try {
    mutant = compileMutated(path.join(__dirname, "collectors.cjs"), [[
      /} else if \(n < 1\) \{\n\s+blocking\.push\(`independent_custodians=\$\{n\}/,
      "} else if (false) {\n    blocking.push(`independent_custodians=${n}",
    ]], "no-custodian-test");
  } catch (e) {
    bad("the refusal is load-bearing", e.message);
    return;
  }

  const mutated = mutant.exports._rule.witnessBlockingConditions;
  const zeroCustodians = { captured_at: new Date(NOW).toISOString(), independent_custodians: 0, claim_level: "tamper_evident" };

  const mutantSays = mutated(zeroCustodians, NOW);
  const realSays = blockingConditions(zeroCustodians, NOW);

  if (mutantSays.length !== 0) {
    bad("the refusal is load-bearing",
      `the defanged module still blocked on zero custodians (${mutantSays.join(" · ")}) — the mutation did not take`);
  } else if (realSays.length === 0) {
    bad("the refusal is load-bearing",
      "THE REAL RULE CLEARED A CAPTURE WITH ZERO INDEPENDENT CUSTODIANS. That is the compromise this " +
      "whole refusal exists to keep visible.");
  } else {
    ok("the refusal is load-bearing",
      `with the custodian test removed from the REAL collectors.cjs (compiled in place, ` +
      `${mutant.sha256.slice(0, 12)}), a capture with independent_custodians=0 CLEARS; with the ` +
      `shipped code it is blocked (${realSays[0].slice(0, 70)}…). Until 2026-07-28 this gate's only ` +
      `tie to the shipped code was a substring search that a comment would have satisfied.`);
  }
}

(function main() {
  checkRealCaptureBlocked();
  checkZeroBlocks();
  checkOneCustodianClears();
  checkConditionsIndependent();
  checkUnreadableBlocks();
  checkNumberIsRead();
  checkTheRefusalIsLoadBearing();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(34)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nWITNESS-BLOCKED GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(This gate proves the REFUSAL works. It does not repair the witness: removing the writer's key from node2 is STOP S1, a human's to do.)\n");
  process.exit(fails ? 1 : 0);
})();
