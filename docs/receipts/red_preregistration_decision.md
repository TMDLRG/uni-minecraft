---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — decision-records-only

- **Gate name (ledger `name`):** `decision-records-only`
- **Registry id:** `decision` — `viewer/gate_registry.json:190-194`
- **Phase:** Phase 3 plan (`viewer/verify_decision.cjs:5-6`: *"the first MUTATING surface built for
  the operator rather than for an agent, and it is the only new one in the Phase 3 plan"*)
- **Pre-registered:** 2026-08-01
- **Runner:** `viewer/verify_decision.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/track/decisions.cjs`, `viewer/track/track_server.cjs`,
  `viewer/verify_decide_page.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`).

Every condition below is **quoted verbatim**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.**

## Motivation (verbatim from the runner)

`viewer/verify_decision.cjs:3-9`

```
// WHAT THIS GATE IS FOR
// ---------------------
// POST /api/decision is the first MUTATING surface built for the operator rather than for an agent,
// and it is the only new one in the Phase 3 plan. A write route on a server that binds 0.0.0.0 is
// exactly where this repository has been bitten before: TRACK's own comment route shipped with a read
// law and no write fence, and its header claimed "a polled READ never spawns anything" while the
// write had nothing at all.
```

## PASS condition (verbatim)

The runner states **no `PASS —` sentence and no usage line**. It states the three questions it asks,
at `viewer/verify_decision.cjs:11-23`:

```
// So this gate asks two different questions, and they fail in opposite directions:
//
//   1. DOES IT REFUSE?  non-loopback peer, rebound Host, missing CSRF header, wrong content-type,
//      oversize body, and a subject the plan never asks about.
//   2. DOES IT ACCEPT?  a same-origin, correctly-fenced, well-formed decision must be RECORDED.
//      Without this positive control the whole gate passes by refusing everything, which is the
//      cheapest possible false green and the one a fence gate is most likely to ship.
//
//   3. AND IS THAT ALL IT DOES?  a real append must leave evidence/gates.ndjson (S4 — the operator's
//      alone), the control-plane ledger, the comment ledger and viewer/.presence/ BYTE-IDENTICAL.
//      Proved by hashing them either side of a live request, not by reading the source and believing
//      it. "It only writes one file" is a claim about behaviour, and this repository has already
//      convicted itself once for evidencing a behavioural claim with three regexes.
```

The mechanical rule is in code only, `viewer/verify_decision.cjs:349` and `:353`:

```
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - decision, ${results.length - failed.length}/${results.length} checks in ${Date.now() - t0} ms`);
...
process.exit(failed.length === 0 ? 0 : 1);
```

For the ledger row's `pass_condition` field:

> The route REFUSES (non-loopback peer, rebound Host, missing CSRF header, wrong content-type, oversize body, and a subject the plan never asks about), it ACCEPTS a same-origin, correctly-fenced, well-formed decision, and THAT IS ALL IT DOES — a real append leaves evidence/gates.ndjson, the control-plane ledger, the comment ledger and viewer/.presence/ BYTE-IDENTICAL.

**Note the header says "two different questions" at line 11 and then enumerates three (1, 2, 3).**
That is the runner's own text, quoted as found; it is not corrected here.

## FALSIFIES condition

**NOT STATED IN THE RUNNER.**

**File read:** `viewer/verify_decision.cjs`, in full. The string `falsif` does not occur anywhere in
it, and no step in `evidence/remediation/phase9_plan.json` declares one for this gate — the gate
post-dates the plan's step list.

## The claim level, and it is checked as a claim

`viewer/verify_decision.cjs:25-31`, verbatim:

```
// THE CLAIM LEVEL IS CHECKED AS A CLAIM. Every row must carry `presence_evident` and a caveat naming
// what was NOT proved. A row that dropped the caveat would read as authentication, and an agent on
// this box can produce every row this endpoint accepts.
//
// NOTHING MAY CONSUME IT AS AUTHORITY. The last check greps the tree: if any file other than the
// writer, the reader and this gate reads decisions.ndjson, an agent has gained the ability to
// authorise itself by writing a file, and that is a fault regardless of what the reader does with it.
```

And the runner prints its own limitation after every verdict,
`viewer/verify_decision.cjs:350-352`:

```
console.log("  WHAT THIS GATE DOES NOT ESTABLISH: that any row was written BY THE OPERATOR. It cannot,");
console.log("  and neither can the endpoint. An agent on this box satisfies every fence. The claim");
console.log("  level is `presence_evident` and the ledger is tamper-EVIDENT, not authentic.");
```

**Any row written for this gate must carry that sentence in `notes`.** Without it a green reads as
authentication, which is precisely the claim the runner refuses to make.

## Protocol

1. Run `node viewer/verify_decision.cjs` from the repository root.
2. It boots `track_server.cjs` as a child on port `DECISION_GATE_PORT` (default 8137) against a
   throwaway decisions path in a temp dir (`viewer/verify_decision.cjs:33-36`, `:50`). Confirm the
   real `evidence/` files are unchanged — the gate hashes them itself, so record its own hashes
   rather than re-deriving them.
3. Record the exit code, the `GATE:` line, and the three limitation lines printed after it.

## Ship-gate discipline

- Evidence class `C` on a first local run.
- A green here is `presence_evident`, never `authenticated`. See above.

## Non-goals

This gate does not establish that any decision was made by the operator, and it says so on every
run. It establishes that the route is fenced, that it accepts a well-formed decision, that it writes
exactly one file, and that nothing else consumes what it writes as authority.
