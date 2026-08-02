---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gaia-witness-blocked

- **Gate name (ledger `name`):** `gaia-witness-blocked`
- **Registry id:** `witness-blocked` — `viewer/gate_registry.json:87-91`
- **Phase:** Phase 9, step 1.8 (`viewer/gaia/verify_witness_blocked.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/gaia/verify_witness_blocked.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/gaia/collectors.cjs`, `viewer/gaia/witness_probe.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/gaia/verify_witness_blocked.cjs:3-10`

```
// THE DEFECT THIS CLOSES. viewer/gaia/witness_probe.cjs:169 computes `independent_custodians` and writes it
// into witness.json on every capture. NOTHING READ IT. The single number that says whether the off-box
// witness is real was measured, stored on disk, and consulted by no consumer anywhere — not Gaia, not the
// Control Plane. It reads 0 today: node2 answers the WRITER'S OWN KEY, so no custodian sits in a failure
// domain the writer cannot reach, and the anchor stands on git alone — tamper-EVIDENT, not unforgeable.
//
// This gate proves the number is now READ and that a zero BLOCKS rather than rendering as a value, with the
// same polarity as the capture-age fence: a claim that cannot be corroborated must say so.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence** in its header. Its only stated PASS condition is the
mechanical exit-code law at `viewer/gaia/verify_witness_blocked.cjs:18`:

```
// Usage: node viewer/gaia/verify_witness_blocked.cjs      exit 0 = PASS, 1 = FAIL.
```

The substantive statement of what a pass means is at
`viewer/gaia/verify_witness_blocked.cjs:9-10` (quoted in Motivation above). For the ledger row's
`pass_condition` field, quoted from there:

> This gate proves the number is now READ and that a zero BLOCKS rather than rendering as a value, with the same polarity as the capture-age fence: a claim that cannot be corroborated must say so.

**File read:** `viewer/gaia/verify_witness_blocked.cjs`, lines 1-19 (the whole header) and the
verdict block at 146-160.

## FALSIFIES condition (verbatim)

The runner names its falsifier as a section heading rather than in the header block.
`viewer/gaia/verify_witness_blocked.cjs:56`:

```
// ---- 2. THE FALSIFIER: zero independent custodians must never read as a value ---------------------------
```

For the ledger row's `falsifies_condition` field:

> zero independent custodians must never read as a value

`evidence/remediation/phase9_plan.json` step 1.8 declares **no** falsifier (`falsifier: null`), so
the runner's own section heading is the only declaration that exists.

## THE ADVERSE RESULT THIS GATE EXISTS TO KEEP VISIBLE

`viewer/gaia/verify_witness_blocked.cjs:12-15`, verbatim:

```
// WHAT THIS DOES NOT DO, DELIBERATELY: it does not repair the witness. Removing the writer's key from node2
// is STOP S1 — the one repair an agent must not perform — because using write access to erase the evidence
// of write access destroys the last proof instead of restoring a witness. THIS GATE IS THE REFUSAL, NOT THE
// REPAIR, and it is designed to keep failing until a human makes the witness real.
```

A green here is **not** a working witness. `independent_custodians` reads 0; the off-box witness is
compromised; the anchor stands on git alone — tamper-evident, not unforgeable. Any row written for
this gate must carry that in `notes`, or the row reads as corroboration it does not have.

## Protocol

1. Run `node viewer/gaia/verify_witness_blocked.cjs` from the repository root.
2. Fixtures only — `viewer/gaia/verify_witness_blocked.cjs:17`: *"Fixtures only; the real
   witness.json is never written and node2 is never touched."*
3. Check 1 evaluates the **live** capture. Note its output verbatim: if it ever reports no blocking
   condition, the runner's own message
   (`viewer/gaia/verify_witness_blocked.cjs:52`) says this gate *"must be re-read deliberately — it
   is not supposed to go quiet on its own."*
4. Record the exit code and the final `WITNESS-BLOCKED GATE:` line
   (`viewer/gaia/verify_witness_blocked.cjs:157`), **together with the line the runner prints
   immediately after it** (`:158`): *"(This gate proves the REFUSAL works. It does not repair the
   witness: removing the writer's key from node2 is STOP S1, a human's to do.)"*

## Non-goals

This gate does not make the witness real, does not touch node2, and does not raise
`independent_custodians` above 0. It establishes only that a zero refuses instead of rendering.
