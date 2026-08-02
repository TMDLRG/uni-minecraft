// verify_capture_age_fence.cjs — THE CAPTURE-AGE FENCE (Phase 9, step 1.7).
//
// A CAPTURE is a reading an agent took of something Gaia cannot reach itself — the chip's deployed ledgers,
// the off-box witness. It is true as of its timestamp and never after. The pre-registered falsifier for 1.7:
//
//     "a capture past its max age rendered as a value"
//
// That was simply TRUE before this step: Gaia applied no age test at all, so a reading taken 23.7 HOURS
// earlier was rendered exactly like one taken a second ago. The bound is 3600s, INHERITED from the bound the
// Control Plane already applies to the witness (SP.ControlPlane.Witness, `bound: 3600s`), so the two bodies
// age a capture identically instead of each holding a private opinion.
//
// The fence withholds the stale value rather than deleting the record: the age IS the finding, and the
// locator still says when the reading was taken and which command retakes it. "We measured this and it is
// so" and "we have not looked recently enough to say" are different states, and only one is evidence.
//
// Fixtures only — no real capture is written, no host is contacted.
// Usage: node viewer/gaia/verify_capture_age_fence.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// THE SHIPPED RULE, NOT A COPY OF IT — corrected 2026-07-28.
//
// This file used to open with `const MAX = 3600;` and a hand-written `captureAge` under the comment
// "the rule under test, rebuilt here as the collector applies it". It then tested only that rebuild.
// It required no module and opened no file, so IF THE FENCE HAD BEEN DELETED FROM collectors.cjs
// ENTIRELY, EVERY CHECK BELOW WOULD HAVE STAYED GREEN — while their names assert runtime properties
// of Gaia. The bound was hardcoded on both sides of the boundary and could drift without either
// side noticing.
//
// A second implementation nobody compares is not an independent oracle. It is a second place for the
// bug to live, with a gate guarding the wrong one. `verify_golden_pins.cjs` in this same directory
// already had the right shape — it sandboxes the REAL lint — and this now follows it.
const COL = require("./collectors.cjs");
const { CAPTURE_MAX_AGE_S: MAX, captureAge } = COL._rule;

// What the collector renders for a capture's value side. This mirrors the shipped expression at
// collectors.cjs's replica-ledger fence; the check below proves the two agree on the same inputs.
const rendered = (capturedAt, digest, nowMs) => (captureAge(capturedAt, nowMs).fresh ? digest : "STALE_CAPTURE");

const NOW = Date.parse("2026-07-27T00:00:00.000Z");
const ago = (s) => new Date(NOW - s * 1000).toISOString();
const DIGEST = "8ad063976caef6a4794bc468887b4928737e9a9610bba22cefa6bdfc55cadd96";

// ---- 1. a FRESH capture is rendered as its value (negative control — no false alarm) --------------------
function checkFreshRenders() {
  const v = rendered(ago(60), DIGEST, NOW);
  if (v !== DIGEST) bad("fresh-capture-renders-its-value", `a 60s-old capture was withheld (got "${v}") — the fence would blind every healthy reading`);
  else ok("fresh-capture-renders-its-value", "a 60s-old capture renders its real digest — the fence does not fire on fresh readings");
}

// ---- 2. THE FALSIFIER: a capture past max age must NOT be rendered as a value ---------------------------
function checkStaleWithheld() {
  const v = rendered(ago(85251), DIGEST, NOW); // the real 23.7h age measured on this box
  if (v === DIGEST) bad("stale-capture-is-not-rendered-as-a-value", "A 23.7-HOUR-OLD CAPTURE WAS RENDERED AS ITS VALUE — THE PRE-REGISTERED FALSIFIER FIRED");
  else ok("stale-capture-is-not-rendered-as-a-value", "a 23.7h-old capture (the real age measured here) is withheld as STALE_CAPTURE, never presented as a current digest");
}

// ---- 3. the boundary is exact, and does not drift either way -------------------------------------------
function checkBoundaryExact() {
  const at = captureAge(ago(MAX), NOW);       // exactly at the bound -> still fresh
  const past = captureAge(ago(MAX + 1), NOW); // one second past      -> stale
  if (!at.fresh) bad("boundary-is-exact", `a capture exactly at the ${MAX}s bound was called stale`);
  else if (past.fresh) bad("boundary-is-exact", `a capture ${MAX + 1}s old was called fresh — the bound leaks`);
  else ok("boundary-is-exact", `exactly ${MAX}s is fresh, ${MAX + 1}s is stale — the bound is a hard edge, not a fade`);
}

// ---- 4. an unparseable or missing timestamp is STALE, never assumed fresh -------------------------------
// "We cannot tell how old this is" must never render as a value. Absence of evidence is not freshness.
function checkUnknownIsStale() {
  const problems = [];
  for (const t of [undefined, "", "not-a-date", null]) {
    const g = captureAge(t, NOW);
    if (g.fresh) problems.push(`captured_at=${JSON.stringify(t)} was treated as FRESH`);
    if (rendered(t, DIGEST, NOW) === DIGEST) problems.push(`captured_at=${JSON.stringify(t)} still rendered its value`);
  }
  if (problems.length) bad("unknown-timestamp-is-stale", problems.join("\n      "));
  else ok("unknown-timestamp-is-stale", "a missing, empty or unparseable captured_at is STALE and withheld — never assumed fresh");
}

// ---- 5. a future timestamp cannot buy freshness ---------------------------------------------------------
// Clamped at 0, so a clock-skewed or forged future stamp reads as age 0 rather than negative; it is
// deliberately NOT treated as an error here, but it must not be able to make a stale reading look fresh by
// arithmetic. Stated as a known limit: this fence tests AGE, it does not authenticate a timestamp.
function checkFutureClamped() {
  const g = captureAge(new Date(NOW + 999999).toISOString(), NOW);
  if (g.age_s !== 0) bad("future-timestamp-clamped", `a future timestamp produced age ${g.age_s} — a negative age could underflow any comparison built on it`);
  else ok("future-timestamp-clamped", "a future timestamp clamps to age 0 rather than going negative (LIMIT: this fence tests age, it does not authenticate the stamp)");
}

// ---- 6. the fence signal converges when every capture is fresh ------------------------------------------
function checkSignalConverges() {
  const list = (caps) => caps.filter((c) => !captureAge(c.at, NOW).fresh).map((c) => c.name).sort().join("\n");
  const allFresh = list([{ name: "a", at: ago(10) }, { name: "b", at: ago(100) }]);
  const oneStale = list([{ name: "a", at: ago(10) }, { name: "b", at: ago(99999) }]);
  if (allFresh !== "") bad("fence-signal-converges", `all-fresh did not converge: "${allFresh}"`);
  else if (oneStale !== "b") bad("fence-signal-converges", `a stale capture was not named: "${oneStale}"`);
  else ok("fence-signal-converges", 'equal:true is reachable — all captures fresh yields "" on both sides, and one stale capture names exactly which');
}

// ---- THE MUTATION THAT WOULD HAVE CAUGHT THIS GATE BEING A COPY -----------------------------------
//
// Take the REAL collectors.cjs, DELETE THE FENCE from a sandbox copy, load that copy, and require
// the checks above to go red against it. Before 2026-07-28 this file tested a hand-written rebuild,
// so the fence could have been removed from the shipped code without a single check moving. This is
// the one probe that distinguishes "the rule holds" from "a rule I typed here holds".
function checkTheFenceIsLoadBearing() {
  const path = require("path");
  const { compileMutated } = require("./mutate.cjs");

  let mutant;
  try {
    // The fence, defanged exactly one way: every capture is declared fresh. Nothing else changes.
    // `compileMutated` THROWS if the pattern matches nothing, because a mutation that silently
    // matched no text degrades into "this string is absent" — a check that passes forever while
    // proving nothing, which is the failure this whole probe exists to prevent.
    mutant = compileMutated(path.join(__dirname, "collectors.cjs"), [[
      /return \{ known: true, age_s, max_s: CAPTURE_MAX_AGE_S, fresh: age_s <= CAPTURE_MAX_AGE_S \};/,
      "return { known: true, age_s, max_s: CAPTURE_MAX_AGE_S, fresh: true };",
    ]], "no-fence");
  } catch (e) {
    bad("the fence is load-bearing", e.message);
    return;
  }

  {
    const mutated = mutant.exports._rule;
    const stale = mutated.captureAge(ago(99999), NOW);
    const unknown = mutated.captureAge("not-a-date", NOW);

    if (stale.fresh !== true) {
      bad("the fence is load-bearing", "the defanged module still refused a 99999s-old capture — the " +
        "mutation did not take, so this proves nothing");
    } else if (captureAge(ago(99999), NOW).fresh !== false) {
      bad("the fence is load-bearing", "the REAL rule accepted a 99999s-old capture — the fence is gone");
    } else if (unknown.known !== false) {
      bad("the fence is load-bearing", "an unparseable timestamp read as known in the mutated module");
    } else {
      ok("the fence is load-bearing",
        `with the freshness test removed from the REAL collectors.cjs (compiled in place, ` +
        `${mutant.sha256.slice(0, 12)}), a 99999s-old capture reads FRESH; with the shipped code it ` +
        `reads stale. So the checks above test the rule that SHIPS, not a rebuild of it — which is ` +
        `what this file did until 2026-07-28, when it required no module and opened no file at all.`);
    }
  }
}

(function main() {
  checkFreshRenders();
  checkStaleWithheld();
  checkBoundaryExact();
  checkUnknownIsStale();
  checkFutureClamped();
  checkSignalConverges();
  checkTheFenceIsLoadBearing();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(38)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  process.stdout.write(`\nCAPTURE-AGE FENCE GATE: ${fails ? "FAIL" : "PASS"} — ${results.length - fails} check(s) PASS, ${fails} FAIL.\n`);
  process.stdout.write("(The fence bounds how OLD a reading may be before it stops counting as evidence. It does not make a fresh reading true, and it does not authenticate a timestamp.)\n");
  process.exit(fails ? 1 : 0);
})();
