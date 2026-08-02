---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — plan-does-not-contradict-itself

- **Gate name (ledger `name`):** `plan-does-not-contradict-itself`
- **Registry id:** `plan-consistency` — `viewer/gate_registry.json:168-172`
- **Phase:** Phase 9 remediation, Wave 3 (`viewer/verify_plan_consistency.cjs:1-2`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_plan_consistency.cjs`
- **CI:** `ci: true`
- **Subject under test:** `evidence/remediation/phase9_plan.json`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/verify_plan_consistency.cjs:5-20`

```
// WHY THIS EXISTS
// ----------------
// `evidence/remediation/phase9_plan.json` is not a document — it is the artifact UNI TRACK renders
// live and Gaia projects verbatim. On 2026-07-28 a sweep read it end to end and found:
//
//   · `recommended_next_act` still said "Open the next pass with L0 ALONE ... ZERO NODES", SIX
//     build-commits after L0 shipped, while its sibling `next_build` correctly said L6. THE SINGLE
//     SOURCE OF TRUTH CONTAINED TWO DIFFERENT NEXT ACTS. A reader trusting the first would have
//     rebuilt a finished build from scratch.
//   · build L6 carried an id and a title and NO `status` KEY AT ALL — the only object in the file
//     like that. Absent is not PLANNED; a consumer testing `status == "PLANNED"` gets undefined.
//   · a key named `status` held a prose paragraph, outside the plan's own declared vocabulary — the
//     precise thing step 3.3's `status_correction` field warns against.
//   · two path strings lacked their `hierarchical-aif/` prefix and resolved from neither repository.
//
// None of that was catchable, because nothing read the plan except humans and renderers. A file that
// everything downstream trusts and nothing checks is the definition of an unguarded claim.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence**. Its only stated PASS condition is the mechanical
exit-code law at `viewer/verify_plan_consistency.cjs:27`:

```
// Usage: node viewer/verify_plan_consistency.cjs      exit 0 = PASS, 1 = FAIL.
```

The substantive statement of scope is at `viewer/verify_plan_consistency.cjs:22-25`:

```
// WHAT THIS DOES NOT DO: it does not judge whether a status is CORRECT. Whether 4.6 is really
// IN_PROGRESS is a matter of fact about the world, and no scan can settle it. This checks that the
// file is INTERNALLY COHERENT and that everything it points at exists — which is the part a machine
// can hold, stated as exactly that much.
```

For the ledger row's `pass_condition` field:

> This checks that the file is INTERNALLY COHERENT and that everything it points at exists — which is the part a machine can hold, stated as exactly that much. exit 0 = PASS, 1 = FAIL.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/verify_plan_consistency.cjs`, in full. The string `falsif` does not occur
anywhere in it, and no step in `evidence/remediation/phase9_plan.json` declares one for this gate —
the gate post-dates the plan's step list, and it is in any case the gate that *reads* that file.

The runner does state a self-falsification requirement for its **own predicates**, at
`viewer/verify_plan_consistency.cjs:348-349`:

```
        `clean-on-truth=${cleanOnTruth} — a predicate that cannot be made to fire guards nothing, and ` +
        `one that cannot be made to stay quiet guards nothing either`);
```

That is a bite-proof for the checks, not a declared falsifier for the gate, and it is not promoted
to one here.

## Protocol

1. Run `node viewer/verify_plan_consistency.cjs` from the repository root.
2. Read-only over the plan. If the plan does not parse, the runner exits 1 with a single check
   (`viewer/verify_plan_consistency.cjs:42-48`) — record that as a distinct outcome from a coherence
   failure; the `GATE:` line reports `0/1 checks` in that case.
3. Record the exit code and the final `GATE:` line
   (`viewer/verify_plan_consistency.cjs:357`), **with the two lines printed after it** (`:359-360`):
   *"(Internal coherence only. Whether a status is TRUE of the world is not checkable here, and this
   gate never claims it is.)"*

## Ship-gate discipline

- The status vocabulary is read from the plan itself, not restated in the runner
  (`viewer/verify_plan_consistency.cjs:50-56`: *"A second copy is a second thing to drift"*). If the
  plan ever loses its vocabulary block, `VOCAB` is `null` — establish what the gate does in that
  case before reading its verdict.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not judge whether any status in the plan is true of the world. It establishes
internal coherence and that the plan's pointers resolve.
