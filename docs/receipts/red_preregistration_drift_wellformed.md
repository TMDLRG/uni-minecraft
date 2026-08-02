---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gaia-drift-wellformed

- **Gate name (ledger `name`):** `gaia-drift-wellformed`
- **Registry id:** `drift-wellformed` — `viewer/gate_registry.json:36-40`
- **Phase:** Phase 9, step 1.5 (`viewer/gaia/verify_drift_wellformed.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/gaia/verify_drift_wellformed.cjs`
- **CI:** `ci: true`
- **Related:** ADR-0002 Amendment 1 (Decisions 5 and 8), `viewer/gaia/collectors.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/gaia/verify_drift_wellformed.cjs:3-9`

```
// Amendment 1, Decision 5: both sides of a drift signal MUST be the same kind under the same normalization —
// a comparison is well-formed only if `equal: true` is REACHABLE, i.e. some achievable state of the world
// makes the two byte-sets identical. Five signals failed that: prose against a path (fqdn_cjs,
// gate_row_schema_path), a label against an array (resolver_planned), a JSON blob against a 54 KB document
// (self_caps_doc_vs_served). They stayed red through a day of real corrections and would have stayed red had
// every correction been perfect. The cost is not the red pixel — an inequality nobody can act on stops being
// read, which is how drift.git_dirty_vs_clean sat unread while pointing at a live defect.
```

## PASS condition (verbatim)

`viewer/gaia/verify_drift_wellformed.cjs:3-5` — Decision 5, quoted by the runner as the property it
holds every repaired signal to:

```
// Amendment 1, Decision 5: both sides of a drift signal MUST be the same kind under the same normalization —
// a comparison is well-formed only if `equal: true` is REACHABLE, i.e. some achievable state of the world
// makes the two byte-sets identical.
```

Mechanical form, `viewer/gaia/verify_drift_wellformed.cjs:19`:

```
// Usage: node viewer/gaia/verify_drift_wellformed.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> both sides of a drift signal MUST be the same kind under the same normalization — a comparison is well-formed only if `equal: true` is REACHABLE, i.e. some achievable state of the world makes the two byte-sets identical.

## FALSIFIES condition (verbatim)

The runner does **not** use the word "falsifier". It states its FAIL condition in its own words at
`viewer/gaia/verify_drift_wellformed.cjs:15-17`:

```
// SO EVERY REPAIRED SIGNAL IS MUTATED HERE (M1). Each mutation runs against a REBUILT comparison using the
// same rule the collector uses, on FIXTURE INPUTS — the real repository is never edited, and no signal is
// re-pointed at anything on disk. A repair that cannot be shown to bite fails this gate.
```

and quotes Decision 8 at `viewer/gaia/verify_drift_wellformed.cjs:11-13`:

```
// Decision 8 is why this file is MANDATORY, not optional: "Every repaired comparison must be proved to still
// bite — point its declared side at a bad value and watch `equal` go false. A comparison repaired without
// that proof is indistinguishable from a comparison loosened."
```

For the ledger row's `falsifies_condition` field:

> A repair that cannot be shown to bite fails this gate. — "A comparison repaired without that proof is indistinguishable from a comparison loosened." (ADR-0002 Amendment 1, Decision 8)

`evidence/remediation/phase9_plan.json` step 1.5 declares the same in the plan's own words:
`"a comparison repaired without a bite-proving mutation is indistinguishable from one loosened"`.
**The runner never labels either sentence "the falsifier"** — that word does not appear anywhere in
the file. The quotes above are its stated FAIL condition, not an agent's reading of one.

## Protocol

1. Run `node viewer/gaia/verify_drift_wellformed.cjs` from the repository root.
2. Fixtures only — `viewer/gaia/verify_drift_wellformed.cjs:16-17`: *"the real repository is never
   edited, and no signal is re-pointed at anything on disk."*
3. Record the exit code and the final `DRIFT WELL-FORMEDNESS GATE:` line
   (`viewer/gaia/verify_drift_wellformed.cjs:326`).

## Ship-gate discipline

- Every check must report **both** convergence and bite. A signal that converges but cannot be made
  to go unequal is the loosened comparison Decision 8 names; the runner already fails on that
  (`viewer/gaia/verify_drift_wellformed.cjs:42`). Record which arm failed, not just that one did.
- This file must itself avoid writing literal ghost schema paths — `verify_schema_pointers.cjs`
  caught it twice on its first two runs, once for a fixture and once for the comment describing the
  fixture (`viewer/gaia/verify_drift_wellformed.cjs:55-59`). Any edit to this runner must be
  re-checked against that sibling gate.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not assert that any drift signal currently reads `equal: true`. It establishes only
that each repaired comparison is **well-formed** — that equality is reachable — and that each still
bites when a side is pointed at a bad value.
