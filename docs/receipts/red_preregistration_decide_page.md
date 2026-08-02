---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — decide-page-records-never-acts

- **Gate name (ledger `name`):** `decide-page-records-never-acts`
- **Registry id:** `decide-page` — `viewer/gate_registry.json:197-201`
- **Phase:** NOT STATED IN THE RUNNER. `viewer/verify_decide_page.cjs` names no phase or step in its
  header (lines 1-34). The registry's `_why` for the sibling gate places the surface in the Phase 3
  plan (`viewer/gate_registry.json:194`).
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_decide_page.cjs`
- **CI:** `ci: true`
- **Subject under test:** `viewer/track/decide.html`
- **Related:** `viewer/verify_decision.cjs` (the endpoint), `viewer/track/decisions.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## PASS condition (verbatim)

The runner states no `PASS —` sentence and no usage line. It enumerates the four properties it
checks, and those are its pass condition. `viewer/verify_decide_page.cjs:10-34`:

```
// THE FOUR THINGS IT CHECKS, AND WHY EACH IS HERE
//
// 1. IT DOES NOT POLL. track.html rewrites `app.innerHTML` wholesale on a 10-second `setInterval`.
//    A textarea living inside that would have a half-typed answer to "the writer's key on node2"
//    destroyed mid-sentence, repeatedly, with nothing recoverable. So /decide is a separate page and
//    must contain NO timer. This is the check most likely to be broken later by someone adding a
//    harmless-looking auto-refresh.
//
// 2. IT TALKS TO EXACTLY TWO ENDPOINTS. GET /api/decisions and POST /api/decision. It must not be
//    able to go live, take a scene, mint presence, or write the gate ledger.
//
//    AND THE SCAN STRIPS COMMENTS FIRST, BECAUSE THIS IS THE TRAP THIS REPOSITORY KEEPS FALLING
//    INTO. A page-endpoint check written earlier in this programme reported `/api/golive: True`
//    against the run-of-show page — the string was in a COMMENT BLOCK explaining what the page must
//    never call. Use versus mention, inside the check written to catch it, at least the eighth
//    instance in one session. This file's own header names `/api/golive` for exactly that reason, so
//    a scan that did not strip comments would convict THIS FILE too.
//
// 3. NOTHING IS WRITTEN UNTIL HE PRESSES. No autosave, no draft POST, no sendBeacon on unload. He
//    must be able to close the tab mid-sentence and leave the ledger untouched.
//
// 4. THE IRREVERSIBILITY AND THE CAVEAT ARE SAID BEFORE THE ACT, NOT AFTER. The ledger is
//    append-only: there is no undo, and a page that reveals that in the receipt has told him too
//    late. And `presence_evident` must appear on the page, because a UI that drops the caveat turns
//    a record into an authentication.
```

Mechanical form, `viewer/verify_decide_page.cjs:321`:

```
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - decide-page, ${results.length - failed.length}/${results.length} checks`);
```

For the ledger row's `pass_condition` field:

> The page does not poll (no timer); it talks to exactly two endpoints, GET /api/decisions and POST /api/decision; nothing is written until he presses (no autosave, no draft POST, no sendBeacon on unload); and the irreversibility and the `presence_evident` caveat are said BEFORE the act, not after.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/verify_decide_page.cjs`, in full. The string `falsif` does not occur anywhere
in it, and no step in `evidence/remediation/phase9_plan.json` declares one for this gate — the gate
post-dates the plan's step list.

The registry's `_why` for this gate does name the failure it is most worried about
(`viewer/gate_registry.json:201`): *"the check most likely to be broken later by someone adding a
harmless-looking auto-refresh."* That is a risk note, not a declared falsifier, and it is not
promoted to one here.

## The limitation the runner declares about itself

`viewer/gate_registry.json:201`, verbatim, and it belongs in the row's `notes`:

> WHAT IT CANNOT ESTABLISH, and says so every run: that the page is USABLE. It measures structure,
> not experience. Whether it is survivable at hour three is the operator's eye and the
> organic-operator review, and no gate stands in for either.

## Protocol

1. Run `node viewer/verify_decide_page.cjs` from the repository root.
2. Read-only: it reads `viewer/track/decide.html`, `viewer/track/track.html` and
   `viewer/track/track_server.cjs` (`viewer/verify_decide_page.cjs:41-43`) and boots nothing.
3. The irreversibility check is **positional** — the declaration must appear above the button. Record
   the measured positions, not just pass/fail, so a later reflow is visible in the receipt.
4. Record the exit code and the final `GATE:` line (`viewer/verify_decide_page.cjs:321`).

## Ship-gate discipline

- Structure only. A green here is not evidence that the page works for a tired human at hour three.
  That is the operator's eye and the `organic-operator` review, and this gate must never be cited
  as standing in for either.
- Evidence class `C` on a first local run.

## Non-goals

This gate does not test the endpoint (that is `decision-records-only`), and it does not establish
usability. It establishes four structural properties of the page.
