---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — gaia-golden-pins

- **Gate name (ledger `name`):** `gaia-golden-pins`
- **Registry id:** `golden-pins` — `viewer/gate_registry.json:30-34`
- **Phase:** Phase 9, step 1.4 (`viewer/gaia/verify_golden_pins.cjs:1`)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/gaia/verify_golden_pins.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/gaia/gaia_lint.cjs` check (e), `viewer/gaia/goldens.json`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Both conditions below are **quoted verbatim from the runner's own header comment**, with
`path:line` locators. **Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/gaia/verify_golden_pins.cjs:3-16`

```
// WHAT THIS PROVES, AND WHY IT IS SHAPED THIS WAY:
//   gaia_lint's check (e) pins the on-disk bytes of Gaia's core sources (gaia.cjs, sig.cjs, gaia_server.cjs)
//   against a committed manifest, viewer/gaia/goldens.json — the byte-identity idiom. Before Phase 9 step 1.4
//   that manifest DID NOT EXIST, so all three read "unpinned" and the check could not fire at all.
//
//   The pre-registered falsifier for 1.4 is: "AN EDIT WITHOUT A RE-PIN PASSES." That has THREE distinct
//   routes, not one, and pinning alone only closes the first:
//     (1) edit a pinned file            -> "mismatch"  -> already a hard violation
//     (2) edit it AND delete goldens.json -> "unpinned" -> PASSED, by default, before this step
//     (3) edit it AND drop just its entry -> "unpinned" -> PASSED, by default, before this step
//   Routes 2 and 3 make the pin self-erasing: the guard could be removed by deleting the guard. The lint's
//   `requireGolden` flag existed for the honest PRE-pin era ("golden not yet established"), but once the
//   manifest is committed, a MISSING pin is not an honest pre-pin state — it is a removed guard, and this
//   gate treats it as such.
```

## PASS condition (verbatim)

`viewer/gaia/verify_golden_pins.cjs:22`

```
// PASS — the real tree is fully pinned AND all three evasion routes are refused.
```

Mechanical form, `viewer/gaia/verify_golden_pins.cjs:23`:

```
// Usage: node viewer/gaia/verify_golden_pins.cjs      exit 0 = PASS, 1 = FAIL.
```

For the ledger row's `pass_condition` field:

> PASS — the real tree is fully pinned AND all three evasion routes are refused.

## FALSIFIES condition (verbatim)

`viewer/gaia/verify_golden_pins.cjs:8`

```
//   The pre-registered falsifier for 1.4 is: "AN EDIT WITHOUT A RE-PIN PASSES."
```

For the ledger row's `falsifies_condition` field:

> AN EDIT WITHOUT A RE-PIN PASSES.

`evidence/remediation/phase9_plan.json` step 1.4 declares the same in lower case:
`"an edit without a re-pin passes"`. The runner and the plan agree.

The runner enumerates the three routes the falsifier covers, and the row should not lose them —
`viewer/gaia/verify_golden_pins.cjs:10-12`:

```
//     (1) edit a pinned file            -> "mismatch"  -> already a hard violation
//     (2) edit it AND delete goldens.json -> "unpinned" -> PASSED, by default, before this step
//     (3) edit it AND drop just its entry -> "unpinned" -> PASSED, by default, before this step
```

## Protocol

1. Run `node viewer/gaia/verify_golden_pins.cjs` from the repository root.
2. Sandbox only — `viewer/gaia/verify_golden_pins.cjs:18-19`: *"gaia_lint.cjs resolves its paths from
   `__dirname`, so a copy in a temp dir lints THAT dir — the real viewer/gaia/ is never edited, never
   re-pinned, never touched."*
3. Record the exit code and the final `GOLDEN-PIN GATE:` line
   (`viewer/gaia/verify_golden_pins.cjs:161`). If any of the three routes fires, the runner prints
   `THE PRE-REGISTERED FALSIFIER FIRED` and names which (`:116`, `:130`, `:147`) — quote the line
   verbatim rather than summarising which route it was.

## Ship-gate discipline

- A red here has two very different meanings: the tree is not pinned, or an evasion route is open.
  The runner distinguishes them by check name; the receipt must too.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not verify that the pinned bytes are *correct* — only that they are pinned, that the
pin cannot be erased, and that an edit without a re-pin is refused.
