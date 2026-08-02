---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gaia-capture-age-fence

- **Gate name (ledger `name`):** `gaia-capture-age-fence`
- **Registry id:** `capture-age` — `viewer/gate_registry.json:81-85`
- **Phase:** Phase 9, step 1.7 (`viewer/gaia/verify_capture_age_fence.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/gaia/verify_capture_age_fence.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/gaia/collectors.cjs` (`_rule.CAPTURE_MAX_AGE_S`),
  `SP.ControlPlane.Witness` (`bound: 3600s`)

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim from the runner's own header comment**, with
`path:line` locators. **Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/gaia/verify_capture_age_fence.cjs:3-15`

```
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
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence**. Its stated PASS condition is the fence's behaviour at
`viewer/gaia/verify_capture_age_fence.cjs:13-15` (quoted above) plus the mechanical exit-code law at
`viewer/gaia/verify_capture_age_fence.cjs:18`:

```
// Usage: node viewer/gaia/verify_capture_age_fence.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> The fence withholds the stale value rather than deleting the record: the age IS the finding, and the locator still says when the reading was taken and which command retakes it. "We measured this and it is so" and "we have not looked recently enough to say" are different states, and only one is evidence.

**File read:** `viewer/gaia/verify_capture_age_fence.cjs`, lines 1-19 (the whole header) and the
verdict block at 155-165.

## FALSIFIES condition (verbatim)

`viewer/gaia/verify_capture_age_fence.cjs:4-6`

```
// the off-box witness. It is true as of its timestamp and never after. The pre-registered falsifier for 1.7:
//
//     "a capture past its max age rendered as a value"
```

For the ledger row's `falsifies_condition` field:

> a capture past its max age rendered as a value

`evidence/remediation/phase9_plan.json` step 1.7 declares the same words. The runner and the plan
agree verbatim. The runner names the falsifier again as a check heading at
`viewer/gaia/verify_capture_age_fence.cjs:55` and prints
`A 23.7-HOUR-OLD CAPTURE WAS RENDERED AS ITS VALUE — THE PRE-REGISTERED FALSIFIER FIRED` at `:58`
when it fires.

## Protocol

1. Run `node viewer/gaia/verify_capture_age_fence.cjs` from the repository root.
2. Fixtures only — `viewer/gaia/verify_capture_age_fence.cjs:17`: *"no real capture is written, no
   host is contacted."*
3. The bound is read from the shipped collector, not typed into the gate
   (`viewer/gaia/verify_witness_blocked.cjs:28-31` records that three copies of `3600` once existed).
   Record the bound the runner actually used, from its output.
4. Record the exit code and the final `CAPTURE-AGE FENCE GATE:` line
   (`viewer/gaia/verify_capture_age_fence.cjs:162`).

## Ship-gate discipline

- The fence's polarity is the point: it must **withhold**, not delete. A run that shows a stale
  capture simply absent is a different behaviour from one that shows it withheld with its age and
  its retake command. Record which was observed.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not refresh any capture and does not contact any host. It establishes only that a
capture past its max age is withheld rather than rendered as a value.
