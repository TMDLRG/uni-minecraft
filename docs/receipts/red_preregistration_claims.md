---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — claims-checked-against-disk

- **Gate name (ledger `name`):** `claims-checked-against-disk`
- **Registry id:** `claims` — `viewer/gate_registry.json:183-188`
- **Phase:** Phase 9 (`viewer/verify_claims.cjs:3`: *"(Phase 9. gate_row: claims-checked-against-disk.)"*)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_claims.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/state_blocks.cjs`, `viewer/generate_state_blocks.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/verify_claims.cjs:13-27`

```
// EVERY SINGLE DEFECT WAS IN HAND-WRITTEN PROSE:
//
//   - five documents at six locations named "build L6" as the next act, six hours after L6 shipped
//     at 6234f3d, while the plan said the next act was Checkpoint E. AGENT-CALIBRATION-PROMPT.md
//     tells every fresh agent to obey the next act BEFORE verifying anything, so a fresh agent
//     would have rebuilt a finished build;
//   - one banner said 25 registered gates in one paragraph and 23 in another (28 on disk);
//   - one file said 23 at one line and 25 at another;
//   - a review marked those counts CORRECTED while the documents still carried them wrong;
//   - a section named the five panels of a page nobody had fetched, on a port held by a different
//     binary than the source file that was read.
//
// Of 28 registered gates at that moment, the three that touched documents pinned a GENERATED file,
// resolved JSON pointers, or checked a JSON vocabulary. NOTHING CHECKED A CLAIM IN PROSE. The
// failure was not random: it landed in the one region the instrument did not cover.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence**. It states what it checks, at
`viewer/verify_claims.cjs:31-32`:

```
// It checks that a citation RESOLVES, that a generated block is FRESH, that an absence claim
// carries a DECLARED SCOPE that still returns nothing, and that no document restates a next act.
```

and its verdict is **conjoined with a time budget**, which is easy to miss and belongs in the row.
`viewer/verify_claims.cjs:437-443`:

```
console.log(`\n  elapsed ${ms} ms (budget 5000)`);
console.log(
  `\nGATE: ${failed.length === 0 && ms <= 5000 ? "PASS" : "FAIL"} - claims, ${results.length - failed.length}/${results.length} checks`
);
console.log("  (Citations, freshness and scoped absences. Whether a SENTENCE IS TRUE is not checkable");
console.log("   here, and this gate never claims it is.)");
process.exit(failed.length === 0 && ms <= 5000 ? 0 : 1);
```

For the ledger row's `pass_condition` field:

> It checks that a citation RESOLVES, that a generated block is FRESH, that an absence claim carries a DECLARED SCOPE that still returns nothing, and that no document restates a next act. — every check passes AND elapsed <= 5000 ms.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/verify_claims.cjs`, in full. The string `falsif` does not occur anywhere in
it. There is no step in `evidence/remediation/phase9_plan.json` that declares one for this gate
either — this gate post-dates the plan's step list.

### The nearest thing the runner does state, and it is narrower than a falsifier

`viewer/verify_claims.cjs:48-50`:

```
// So: a document NAMES a claim with an annotation; it never DEFINES one. The measures and the
// search scopes live here, in code, in closed registries. An unknown id is a FAIL, not a skip —
// otherwise a typo becomes a way to go green.
```

That is a rule about one check, not a falsifier for the gate. It is recorded as such and not
promoted.

## The disclaimer the runner makes about itself — carry it into the row

`viewer/verify_claims.cjs:29-36`, verbatim:

```
// WHAT THIS GATE DOES AND DOES NOT CLAIM
// --------------------------------------
// It checks that a citation RESOLVES, that a generated block is FRESH, that an absence claim
// carries a DECLARED SCOPE that still returns nothing, and that no document restates a next act.
// **It cannot check whether a sentence is true.** viewer/verify_plan_consistency.cjs:22-25 says the
// same of status — "a matter of fact about the world, and no scan can settle it" — and that is the
// most honest line in that file. This gate makes the same disclaimer out loud rather than implying
// a completeness it does not have.
```

A row whose `notes` omits *"It cannot check whether a sentence is true"* reads as prose validation.
It is not that.

## Protocol

1. Run `node viewer/verify_claims.cjs` from the repository root.
2. `--json` emits a machine-readable result for the existing HUD pusher
   (`viewer/verify_claims.cjs:427-433`). The runner never opens a socket itself
   (`viewer/verify_claims.cjs:429`: *"THIS FILE NEVER OPENS A SOCKET"*); do not add one.
3. Record **elapsed ms** alongside the verdict. A run that fails only the budget is a different
   fact from a run that fails a check, and the single `GATE:` word does not distinguish them.

## Ship-gate discipline

- The 5000 ms budget is part of the pass condition. A green obtained on a fast box and a red
  obtained on a loaded one can be the same tree; note the machine.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not verify that any document is truthful. It verifies citations, generated-block
freshness, declared-scope absences, and that no document restates a next act.
