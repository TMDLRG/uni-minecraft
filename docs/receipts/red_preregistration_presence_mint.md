---
verdict: PENDING
evidence_class: pending
---

# RED pre-registration — f31-presence-mint

- **Gate name (ledger `name`):** `f31-presence-mint`
- **Registry id:** `presence-mint` — `viewer/gate_registry.json:131-136`
- **Phase:** Phase 9. The gate guards F31, which landed 2026-07-27 (`e27ce7e`).
- **Pre-registered:** 2026-08-02
- **Runner:** `viewer/verify_presence_mint.cjs`
- **CI:** `ci: true`
- **Related:** `viewer/mint_presence.cjs`, `viewer/golive_guard.cjs`

## What this document is, and what it is not

**This is a transcription, not a judgement.** The gate is registered in
`viewer/gate_registry.json` and has **no row** in `evidence/gates.ndjson`; the blocker is the
empty `receipt_path` the schema requires (`viewer/lab/desk.cjs:317-322`,
`production/schemas/gate_row.schema.json:8`). Measured before this document existed,
`desk.preRegistration("presence-mint")` returned `writable: false` with the single blocker
*"receipt_path is empty, and the schema requires it"*.

Every condition below is **quoted verbatim from the runner**, with `path:line` locators.
**Appending the ledger row is S4 — the operator's alone.** Nothing here runs the gate, and
nothing here touches `evidence/gates.ndjson`.

**One thing this document deliberately does not do.** The runner states no single labelled
`FALSIFIES` line — a source search for that word returns nothing, and the only line matching
`PASS` is the summary banner at `viewer/verify_presence_mint.cjs:160`. So the falsifier below is
transcribed **from the individual checks' own `bad()` branches**, which are the real failure
conditions, rather than lifted from a labelled block that does not exist. A falsifier invented to
fill the gap would be the exact defect the pre-registration discipline exists to prevent.

## Motivation (verbatim from the runner)

`viewer/verify_presence_mint.cjs:2-12`

```
// verify_presence_mint.cjs — hold viewer/mint_presence.cjs to what it claims.
//
// WHY: for six days this repository had a go-live guard and NO WAY TO SATISFY IT. F31 landed
// 2026-07-27 (e27ce7e) wiring all seven paths to golive_guard.cjs, and shipped without a mint.
// Measured 2026-08-02: viewer/.presence/ had never existed and no nonce had ever been spent, so
// `mayGoLive()` refused the OPERATOR exactly as it refused every agent. Nobody noticed because
// nobody went to air in that window.
//
// A mint is the one thing in this repository that can OPEN the door. It gets a gate.
```

## The scope limit, stated by the runner itself (verbatim)

`viewer/verify_presence_mint.cjs:12-13`

```
// This does NOT check that the person typing is the operator. Nothing can. It checks that the mint
// excludes what it says it excludes, and that the guard still refuses everything it should.
```

This is the load-bearing honesty of the whole claim. The gate's green means the mint refuses what
it says it refuses. It does **not** mean a human minted the token. `presence_evident` is not
authentication and this gate does not upgrade it.

## PASS condition (verbatim, per check)

The gate emits `GATE: PASS` when zero checks failed — `viewer/verify_presence_mint.cjs:160`:

```
console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - presence-mint, ${results.length - failed.length}/${results.length} checks`);
```

The six checks, each with the condition its own code evaluates:

1. **`a mint exists at all`** — `viewer/verify_presence_mint.cjs:30-38`.
   Passes when `fs.existsSync(MINT)` **and** `node --check` on it exits 0.

2. **`a caller with no terminal cannot mint`** — `viewer/verify_presence_mint.cjs:46-57`.
   Passes when a piped-stdin invocation gives `r.status === 3` and stderr matches `/NOT_A_TTY/`,
   **and** stdout does *not* match `/Type this number back/`. The runner states why at `:42-45`:

   ```
   // Every path this guard exists to exclude — a headless agent, a service session, a scheduled task,
   // a remote shell, a CI job, and every script in this repository — reaches the mint without a
   // terminal. If a piped caller can mint, the mint is decorative and F31 is decorative with it.
   ```

   And at `:54-55` it records that the check is self-demonstrating: *"THIS GATE'S OWN RUNNER IS SUCH
   A CALLER: the check is performed by something the mint refuses."*

3. **`the mint has no non-interactive escape hatch`** — `viewer/verify_presence_mint.cjs:65-79`.
   Passes when, after stripping strings and comments, the live code matches **none** of
   `/process\.argv\s*\[/`, `/process\.env\./`, or `/--force|--yes|--no-?prompt|skip/i`. Rationale
   quoted at `:62-64`:

   ```
   // Source-scan, deliberately: a flag, an env var or an argv branch that skips the challenge would
   // re-open every path check 1 closes, and would not show up in a behavioural test that never passes
   // that flag.
   ```

4. **`the guard accepts a well-formed token and refuses every malformed one`** —
   `viewer/verify_presence_mint.cjs:86-123`. Passes when all six shapes at `:95-102` produce the
   expected `guard.presence().allowed`: a well-formed token accepted; and `interactive:false`, a
   short nonce, a missing `minted_at`, a token older than `guard.TTL_MS`, and a future-dated token
   each refused. Driven through `golive_guard.presence()` itself (`:113`), never a copy of its
   rules (`:93-94`), and against a fixture rather than the real token (`:84-85`):

   ```
   // Proved against a token this gate writes to a temp path, never against the real one — a gate that
   // mints into viewer/.presence would leave a live door open behind it.
   ```

5. **`one token opens the door once`** — `viewer/verify_presence_mint.cjs:127-143`.
   Passes when a nonce already present in `spent.ndjson` yields `v.allowed === false` **and**
   `v.code === "ALREADY_SPENT"`.

6. **`the live state is reported, not assumed`** — `viewer/verify_presence_mint.cjs:149-155`.
   **This check always passes.** It is a report, not an assertion, and the runner says so at
   `:148`: *"Reported, never asserted. This is a fact about a moment and it is printed rather than
   gated."* It is recorded here so nobody later counts it as evidence of anything.

## FALSIFIES condition (transcribed from the `bad()` branches)

The gate goes RED — and the claim "the mint excludes what it says it excludes" is falsified — on
any one of:

- **`:38`** — `viewer/mint_presence.cjs` is absent, or present and does not parse.
- **`:56-57`** — a caller with **no terminal** obtains a mint (exit ≠ 3, or no `NOT_A_TTY`), **or**
  a challenge is printed to a non-TTY caller before it is refused. The second is a distinct
  falsifier and is called out by name: `"a challenge was printed to a non-TTY caller before refusing"`.
- **`:79`** — the mint's live code reads `process.argv[…]`, reads `process.env.…`, or carries a
  skip-style flag. Any one hatch is enough.
- **`:123`** — any of the six token shapes is judged wrongly by `golive_guard.presence()`. Note
  both directions falsify: a malformed token being **accepted**, and the well-formed token being
  **refused**.
- **`:143`** — a spent nonce is replayable (`allowed !== false`, or the refusal code is not
  `ALREADY_SPENT`).

## What a PASS here would and would not establish

**Would:** that the only route through the mint is echoing a value printed to a terminal at that
moment; that no argv/env/flag bypass exists in live code; that the guard's own predicate refuses
five named malformed token shapes and accepts the well-formed one; and that a nonce is single-use.

**Would not:** that the person at the terminal is the operator. The runner states this at `:12-13`
and it is restated here because it is the boundary that matters. A TTY is a property of a session,
not of a human, and no check in this file — or anywhere in this repository — closes that gap.
`presence_evident` remains **presence-evident, not unforgeable**, and no gate may read it as
authority.

**Status:** PENDING. The gate has not been run for this receipt, and running it is not required to
pre-register it. Appending the row to `evidence/gates.ndjson` is **S4 — the operator's alone.**
