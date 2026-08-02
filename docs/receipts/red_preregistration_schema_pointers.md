---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — schema-pointers-resolve

- **Gate name (ledger `name`):** `schema-pointers-resolve`
- **Registry id:** `schema-pointers` — `viewer/gate_registry.json:42-46`
- **Phase:** NOT STATED IN THE RUNNER. `viewer/verify_schema_pointers.cjs` names no phase or step
  anywhere in its header docblock (lines 3-48).
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_schema_pointers.cjs`
- **CI:** `ci: true`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner — with ONE line elided, and the elision is the point)

`viewer/verify_schema_pointers.cjs:7-16`

```
 * WHY THIS EXISTS
 *   /api/discovery serves `_schema: "<ELIDED — see note below>"` to
 *   consumers. That file has never existed. The real file is gate_row.schema.json,
 *   and it carries "$id": "https://uni-lab/schemas/gate_row.v1.json".
 *
 *   So this is a CONFLATION, not a typo, and the distinction decides the fix. The
 *   schema's versioned IDENTITY really is `gate_row.v1.json`; its PATH is
 *   `production/schemas/gate_row.schema.json`. The served field glued the path
 *   prefix onto the identity and produced a string that is neither. A consumer
 *   resolving the advertised contract pointer gets nothing.
```

**ELISION, declared:** one token on `viewer/verify_schema_pointers.cjs:8` — the ghost path itself —
is replaced above by `<ELIDED — see note below>`. Nothing else in the quote is altered. The elided
token is the `production/schemas/` prefix glued to the identity `gate_row.v1.json`; read it at the
locator.

**Why it is elided rather than quoted.** This gate convicts any string of the form
`production/schemas/<name>.json` that does not resolve, **anywhere in the repository, including in a
comment that is only talking about it.** Reproducing line 8 verbatim in this document creates a real
path claim, and on the first run of this receipt it did exactly that:

```
    <the ghost path>  -> did you mean production/schemas/gate_row.schema.json ?
      docs/receipts/red_preregistration_schema_pointers.md:32

  RESULT: FAIL — a served contract pointer that does not resolve is a broken promise to a machine.
```

(The gate's real output names the ghost path in full at that position. It is elided here for the
same reason — a receipt that quotes the failure verbatim reproduces the failure.)

That is the ninth-or-so instance of use-versus-mention in this programme, and the repository already
records the same gate catching `verify_drift_wellformed.cjs` **twice on its first two runs — once
for a fixture, once for the comment describing the fixture**
(`viewer/gaia/verify_drift_wellformed.cjs:55-59`). That file's answer was to assemble the string at
runtime (`viewer/gaia/verify_drift_wellformed.cjs:60-62`); a markdown document cannot assemble, so it
elides and says so. **The verbatim rule is not weakened: the elision is declared, bounded to one
token, and the locator is given so the original can be read.**

## PASS condition (verbatim)

`viewer/verify_schema_pointers.cjs:25-28` — the rule the gate enforces, in its own header:

```
 * THE RULE
 *   A string of the form `production/schemas/<name>.json` is a PATH CLAIM. It must
 *   resolve. To reference a schema by identity instead, use its `$id` — which
 *   carries no `production/schemas/` prefix and so is not matched here.
```

The sentence the runner prints on a pass, `viewer/verify_schema_pointers.cjs:136`:

```
  console.log(`\n  RESULT: PASS — all ${cited} cited schema paths resolve on disk.`);
```

For the ledger row's `pass_condition` field:

> A string of the form `production/schemas/<name>.json` is a PATH CLAIM. It must resolve. — RESULT: PASS — all `<cited>` cited schema paths resolve on disk.

## FALSIFIES condition (verbatim)

The runner does **not** use the word "falsifier" anywhere. It states **two** FAIL conditions in its
own words, and both must be carried, because the second is the zero-guard that stops the first from
passing vacuously.

`viewer/verify_schema_pointers.cjs:149`:

```
console.log("\n  RESULT: FAIL — a served contract pointer that does not resolve is a broken promise to a machine.");
```

`viewer/verify_schema_pointers.cjs:124-132`:

```
// A ZERO-GUARD, added 2026-07-28. If the walk breaks, `cited` is 0 and this printed
// "PASS — all 0 cited schema paths resolve on disk" and exited 0. A scan that looked at nothing
// is not a scan that found nothing, and the two must never share a verdict. Sibling gates
// (verify_ip_fence, verify_host_tracking, verify_golive_refuses_agents) all carry this guard;
// this one did not.
if (cited === 0) {
  console.log("RESULT: FAIL — 0 schema path claims found anywhere. This gate scans the repository " +
    "for `production/schemas/<name>.json` claims; finding NONE means the walk is broken, not that " +
    "the repository is clean.");
```

For the ledger row's `falsifies_condition` field:

> a served contract pointer that does not resolve is a broken promise to a machine; OR 0 schema path claims found anywhere — finding NONE means the walk is broken, not that the repository is clean.

**File read:** `viewer/verify_schema_pointers.cjs` in full. The word "falsifier" does not occur in
it; the two sentences above are the runner's own stated FAIL conditions, transcribed, not inferred.

## Protocol

1. Run `node viewer/verify_schema_pointers.cjs` from the repository root.
2. Record the `DECLARED FUTURE` exemption lines. The runner prints them on every run, pass or fail
   (`viewer/verify_schema_pointers.cjs:119`: *"Printed always, pass or fail. An exemption nobody
   sees is a place to hide."*), so a receipt that omits them omits the gate's own escape hatch.
3. Record `cited` (the count on the PASS line) as well as the verdict — a pass with a suspicious
   `cited` is the failure mode the zero-guard exists for.

## Ship-gate discipline

- The scan must not fire on itself or on honest documentation. The runner names four prior
  convictions of that class in its header (`viewer/verify_schema_pointers.cjs:30-47`), including
  *"the fourth time in this programme a source scan convicted the documentation it was meant to
  guard."* Any new exclusion needs a stated reason — the runner says so at line 56: *"Each needs a
  reason, or it is just a way to go green."*
- Evidence class `C` on a first local run.

## Non-goals

This gate does not validate schema **content**, and it does not check `$id` values. It checks that
strings shaped like repo-relative schema paths resolve to files.
