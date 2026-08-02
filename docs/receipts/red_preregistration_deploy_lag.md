---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gaia-deploy-lag-tripwire

- **Gate name (ledger `name`):** `gaia-deploy-lag-tripwire`
- **Registry id:** `deploy-lag` — `viewer/gate_registry.json:75-79`
- **Phase:** Phase 9, step 1.6 (`viewer/gaia/verify_deploy_lag_tripwire.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/gaia/verify_deploy_lag_tripwire.cjs`
- **CI:** `ci: true`
- **Related:** ADR-0002 Amendment 1, Decision 6; signal `drift.deploy_ref_behind_head.<build>`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim from the runner's own header comment**, with
`path:line` locators. **Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/gaia/verify_deploy_lag_tripwire.cjs:8-15`

```
// So the signal contains NO TOLERANCE. It rests on a structural fact instead: evidence/gates.ndjson is
// APPEND-ONLY, therefore a deployment honestly N rows behind must be a BYTE-EXACT PREFIX of canonical.
// Clean lag => the prefix digest matches. Any edit to a row the replica already holds => it cannot match,
// no matter how far behind the replica is. This gate proves exactly that, by mutation (M1).
//
// It is deliberately the harshest case: the mutation edits ONE BYTE deep inside the retained prefix while
// leaving the row COUNT identical — the precise shape a tolerance keyed on "how far behind" would wave
// through, and the one thing this family exists to catch.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence**. Its stated PASS condition is the structural rule at
`viewer/gaia/verify_deploy_lag_tripwire.cjs:9-11` (quoted above) plus the mechanical exit-code law
at `viewer/gaia/verify_deploy_lag_tripwire.cjs:18`:

```
// Usage: node viewer/gaia/verify_deploy_lag_tripwire.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> a deployment honestly N rows behind must be a BYTE-EXACT PREFIX of canonical. Clean lag => the prefix digest matches. Any edit to a row the replica already holds => it cannot match, no matter how far behind the replica is.

**File read:** `viewer/gaia/verify_deploy_lag_tripwire.cjs`, lines 1-19 (the whole header) and the
verdict block at 145-155.

## FALSIFIES condition (verbatim)

`viewer/gaia/verify_deploy_lag_tripwire.cjs:3-6`

```
// drift.deploy_ref_behind_head.<build> carries relation `lag` (ADR-0002 Amendment 1, Decision 6). Its
// pre-registered falsifier is exact and is the whole reason this file exists:
//
//     "a tolerance that swallows the in-place-edit case"
```

For the ledger row's `falsifies_condition` field:

> a tolerance that swallows the in-place-edit case

`evidence/remediation/phase9_plan.json` step 1.6 declares the same words. The runner and the plan
agree verbatim.

## Protocol

1. Run `node viewer/gaia/verify_deploy_lag_tripwire.cjs` from the repository root.
2. Fixtures only — `viewer/gaia/verify_deploy_lag_tripwire.cjs:17`: *"the real ledger is never
   touched (S4 forbids any write to evidence/gates.ndjson)."*
3. Record the exit code and the final `DEPLOY-LAG TRIPWIRE GATE:` line
   (`viewer/gaia/verify_deploy_lag_tripwire.cjs:152`). If the tripwire is swallowed, the runner
   prints `THE PRE-REGISTERED FALSIFIER FIRED` (`:59`) — quote it verbatim.
4. The deep-lag case at `:69` (one byte at lag=18) is the harshest arm. Record it separately: a gate
   that bites at lag=1 and not at lag=18 *"weakens as the lag grows, which is exactly the tolerance
   the falsifier names"*.

## Ship-gate discipline

- This gate proves the *rule*, on fixtures. It does not measure any live replica's lag. A green says
  the tripwire cannot be swallowed; it says nothing about whether any deployment is currently behind.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not read, compare or repair any deployed ledger. It establishes only that the lag
comparison carries no tolerance that could swallow an in-place edit.
