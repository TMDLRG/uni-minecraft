---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gate-attempts-sidecar

- **Gate name (ledger `name`):** `gate-attempts-sidecar`
- **Registry id:** `gate-attempts` — `viewer/gate_registry.json:111-115`
- **Phase:** Phase 9, step 4.2 (`viewer/verify_gate_attempts.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_gate_attempts.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/gate_attempts.cjs`, `viewer/classify_gate_attempts.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim from the runner's own header comment**, with
`path:line` locators. **Appending the ledger row is S4 — the operator's alone**, and this gate
is unusually direct about why: see the Motivation.

## Motivation (verbatim from the runner)

`viewer/verify_gate_attempts.cjs:5-14`

```
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
```

## PASS condition (verbatim)

`viewer/verify_gate_attempts.cjs:16-17`

```
// PASS — the sidecar matches a fresh classification, the distinction is real and still bites, the
// canonical gate ledger is untouched, and the same distinction is derivable from HISTORY.
```

Mechanical form, `viewer/verify_gate_attempts.cjs:18`:

```
// Usage: node viewer/verify_gate_attempts.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> PASS — the sidecar matches a fresh classification, the distinction is real and still bites, the canonical gate ledger is untouched, and the same distinction is derivable from HISTORY.

## FALSIFIES condition (verbatim)

`viewer/verify_gate_attempts.cjs:3` — the runner carries step 4.2's falsifier as its second line:

```
//   falsifier: "'never attempted' and 'attempted and blocked' still collapse into one word"
```

For the ledger row's `falsifies_condition` field:

> 'never attempted' and 'attempted and blocked' still collapse into one word

The plan carries the same words at `evidence/remediation/phase9_plan.json`, step 4.2. The runner
and the plan agree verbatim.

## Protocol

1. Run `node viewer/verify_gate_attempts.cjs` from the repository root.
2. Check 3 asserts the canonical ledger is untouched. **Read the runner's note at
   `viewer/verify_gate_attempts.cjs:32-38` before interpreting it** — the hash pin that used to
   live there was deleted rather than advanced, because *"it turned the operator's own permitted
   append into a tamper alarm on 2026-07-29. Advancing it would have re-armed the same trap for
   the next legitimate row."* Appending the row this document exists to enable is a legitimate
   append.
3. Record the exit code and the final `GATE:` line (`viewer/verify_gate_attempts.cjs:307`).

## Ship-gate discipline

- This gate reads `evidence/gates.ndjson`. Appending the row it needs changes what it reads. Run
  it **after** the operator's append and record the post-append result, so the receipt describes
  the world the row lives in.
- The comparison is EOL-normalised (`viewer/verify_gate_attempts.cjs:47-52`) because a byte-identity
  check on a generated file failed 7/8 from a clean Windows checkout. Note that when reading a red.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not reduce the pending backlog, and it does not attempt any pending gate. It
establishes only that "never attempted" and "attempted and blocked" are recorded as two different
states, that the distinction can change, and that the canonical ledger was not written by it.
