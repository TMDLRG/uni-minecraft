---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — limitations-doc-cannot-drift

- **Gate name (ledger `name`):** `limitations-doc-cannot-drift`
- **Registry id:** `limitations-doc` — `viewer/gate_registry.json:105-109`
- **Phase:** Phase 9, step 3.5 (`viewer/verify_limitations_doc.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_limitations_doc.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/limitations.cjs`, `viewer/generate_limitations.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim from the runner's own header comment**, with
`path:line` locators. **Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/verify_limitations_doc.cjs:6-16`

```
// One check closes both directions at once, and it is the reason the document is derived rather
// than written: REGENERATE IT AND REQUIRE THE BYTES TO MATCH. An annotation added without
// regenerating produces a doc missing a limitation; a doc edited by hand produces a doc claiming
// one that no code declares. Both are the same mismatch. **A derived doc cannot drift.**
//
// M6, NEGATIVE CONTROL, is the point of the second half of this file. A comparison gate is
// satisfied by a generator that has quietly stopped finding anything — regenerate nothing, compare
// nothing to nothing, pass. So the mutations below run on SANDBOX COPIES and require the gate to
// FAIL in each direction, and a further control requires that a file which merely MENTIONS the
// marker in prose is not scraped as a declaration.
```

## PASS condition (verbatim)

`viewer/verify_limitations_doc.cjs:18`

```
// PASS — the committed doc is byte-identical to a fresh generation, and both drift directions bite.
```

Mechanical form, `viewer/verify_limitations_doc.cjs:19`:

```
// Usage: node viewer/verify_limitations_doc.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> PASS — the committed doc is byte-identical to a fresh generation, and both drift directions bite.

## FALSIFIES condition (verbatim)

`viewer/verify_limitations_doc.cjs:3-5` — the runner quotes step 3.5's pre-registered falsifier:

```
// Step 3.5's pre-registered falsifier is bidirectional:
//
//     a limitation in a test absent from the doc, or vice versa
```

For the ledger row's `falsifies_condition` field:

> a limitation in a test absent from the doc, or vice versa

The plan carries the same words at `evidence/remediation/phase9_plan.json`, step 3.5:
`"a limitation in a test absent from the doc, or vice versa"`. The runner and the plan agree
verbatim.

## Protocol

1. Run `node viewer/verify_limitations_doc.cjs` from the repository root.
2. Mutations run on sandbox copies (`viewer/verify_limitations_doc.cjs:13-14`); the committed
   `LIMITATIONS` document is compared, never rewritten. If the gate reports drift, the fix named
   by the runner itself is `node viewer/generate_limitations.cjs`
   (`viewer/verify_limitations_doc.cjs:57`) — regenerate, do not hand-edit.
3. Record the exit code and the final `GATE:` line (`viewer/verify_limitations_doc.cjs:147`).

## Ship-gate discipline

- A byte-identity check on a generated file is EOL-fragile on a Windows checkout; the sibling
  gate `verify_gate_attempts.cjs:48-51` records that exact failure (`FAIL 7/8` from a clean
  checkout). If this gate reports drift, establish whether the difference is content or line
  endings **before** recording a verdict.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not judge whether a declared limitation is *true*, or whether the set of
limitations is complete. It establishes only that the document and the annotations in code
cannot disagree.
