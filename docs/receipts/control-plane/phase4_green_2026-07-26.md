# Phase 4 — the green run, two canaries firing, and one limit that stays open

**Date:** 2026-07-26 · **Repo:** `UNI.Minecraft`, `gen2-runtime` · **Red:** `f9c5167`
**Plan:** `docs/control-plane/phases/PHASE-4.md` (UNI-FLAGELLUM)
**Raw:** [`phase4_red_2026-07-26.txt`](phase4_red_2026-07-26.txt) · [`phase4_green_2026-07-26.txt`](phase4_green_2026-07-26.txt)

```
$ mix test test/sp/control_plane
211 tests, 82 failures      # red, f9c5167
211 tests,  0 failures      # green
```

Test count identical across red and green. Full suite **765 tests, 0 failures**
(was 681).

---

## 1. The gap that mattered most is closed: the Control Plane can record its own writes

`SP.ControlPlane.Store` — durable, append-only, two plain files a human can open:

```
<dir>/ledger.ndjson   one canonical entry per line
<dir>/anchor.json     the head and length, held outside the chain
```

**Append-only is enforced before the write, not detected after.** `persist/2`
refuses unless the bytes already on disk are an exact prefix of the ledger being
persisted, and a refused write writes nothing at all. A shorter ledger, a
divergent history, or a file that grew behind its back all refuse — and the
refusal names the `seq` where the histories part company.

The premise this phase rested on was checked **before** anything was built on it,
as the plan required: `File`, `:crypto` and stdlib `JSON` carry durable
persistence in the zero-dep app. `git diff mix.exs` is empty. No
`STOP_PROTOCOL_CHANGE_REQUIRED`.

## 2. BOTH CANARIES FIRED, exactly as they were written to

Phase 3 left two tests whose job was to fail the moment persistence landed. They
did. Neither was deleted.

| canary | written in | what happened |
|-|-|-|
| `anchor_detects_truncation_test` — *"STATED LIMIT: nothing persists an anchor yet"* | Phase 3, item 3.6 | **FIRED.** Replaced by the assertion it pointed at: the limit is lifted, `Store.attest/1` exists, and the in-practice behaviour is proven in `store_anchor_in_practice_test.exs`. The residual stays asserted separately. |
| `read_never_actuates_test` — *"no Phase 2 module performs disk IO"* | Phase 2, F11 | **FIRED.** Narrowed from a blanket to an allowlist — see §3. |

Deleting a canary that fires is how a limit quietly stops being tracked. Both
were replaced with what they were guarding, and both replacements were
mutation-tested.

## 3. A guard was deliberately WEAKENED, and here is the exact trade

`read_never_actuates_test` asserted that **no** module in the namespace performs
disk IO. That was always a **proxy** for the real rule — *a read never actuates*
— and it was only true while nothing persisted anything.

- **Weaker:** one module may now touch disk.
- **Stronger:** it is an **allowlist of exactly one**. A second writer, or a
  writer appearing inside a module that reads, now fails — which the blanket form
  could never distinguish.
- **Unchanged:** the purity of every read is asserted directly, function by
  function, and never depended on this scan.

Mutation-tested: appending `File.write` to `pair.ex` fails both this test and the
store's own allowlist. Reverted; diff empty.

## 4. ADVERSE — two of my own tests contradicted each other

`run_status_refusals_test` asserted the status vocabulary was **five** words.
`run_failure_refusals_test` asserted `:FAILED_RUN` is **in** the vocabulary, "so
it cannot be a surprise value nothing renders".

Both were mine, written an hour apart, and they cannot both hold. The failure
test is right — a status the vocabulary does not admit is exactly the kind of
value that gets rendered as blank or dropped. The status test was corrected to
six, on the merits, not by loosening whichever assertion was easier to move.

## 5. ADVERSE — two real defects in `Store`, caught by my own new tests

1. **`store.ex`'s moduledoc named `evidence/gates.ndjson`.** The Phase 4 test
   *"no Control Plane module names the canonical gate ledger"* failed on the very
   module it was written to watch. A module that names the canonical evidence
   file is one edit away from writing to it. The reference is now indirect, and
   the moduledoc says why.
2. **An empty store did not create its ledger file**, so `load/1` reported
   `not_a_store` for a store that had been correctly initialised. An initialised
   store with no entries is a real state, not an absent one.

## 6. A FOURTH pre-registered phrase was imprecise, corrected before it was built on

Item 4.3 said *"the same run twice produces byte-identical canonical bytes"*.
Taken literally that is **false and must stay false**: a run record carries
wall-clock start and end, and two executions happen at different moments. A
record that hid that would be lying.

Split into two things that are now tested separately:

- **identity** — code, env, inputs, params, seeds, `planned_n`, `stopping_rule`,
  hashed into `run_id`. Two runs of the same thing share it.
- **record** — times, exit code, outputs, `actual_n`. These differ, and must.

**`planned_n` and `stopping_rule` are inside the identity on purpose.**
`CLAUDE.md`: *"never increase replicates after seeing a width."* If either were a
free field, a short run could be relabelled `COMPLETE`, or a stopping rule
declared once the numbers were in. Because both are hashed, doing either
**changes what run this is** — the laundering leaves a mark. That is asserted.

## 7. Item 3.6: upgraded, with the residual asserted rather than footnoted

**What is now true:** the anchor persists beside the ledger, so a reload that has
lost its tail fails to attest. Truncation is caught **in practice**, across
restarts, against loss, corruption and accident. Losing a single entry is caught.
A stale anchor no longer attests a grown chain. An absent anchor is a refusal,
never a pass.

**What is still not true:** it does **not** stop a tamperer with write access to
the store directory, who truncates `ledger.ndjson` and rewrites `anchor.json` to
match. Nothing local can. It needs an anchor the ledger's writer cannot reach.

`store_anchor_in_practice_test.exs` **performs that attack and asserts it
succeeds**, so the limit cannot quietly stop being true. It is `PHASE-5.md`'s
first item.

## 8. Item 4.7: the rollback lesson is now mechanical

The mixed-EOL trap that cost a rolled-back write on 2026-07-25 is a test:
`appender_takes_last_line_terminator_test.exs`. It asserts the terminator comes
from the **last line** in both directions, that appending *n* rows adds exactly
*n* lines, that no blank line appears, and that the file ends with exactly one
newline. A final test reads the canonical ledger **live** and asserts it really
is mixed — 58 `CRLF` among 206 lines, ending on the minority terminator — so the
premise is checked, not remembered.

## 9. What was built

| module | file | what |
|-|-|-|
| `SP.ControlPlane.Store` | `store.ex` | durable append-only persistence; the **only** module that touches disk |
| `SP.ControlPlane.Run` | `run.ex` | immutable run identity, six statuses, three refusals from real defects |
| `SP.ControlPlane.Pair` | `pair.ex` | exactly one differing variable, or `VOID` |
| `SP.ControlPlane.Ledger` | amended | `from_entries/1` — reconstruction, named as the trust boundary it is |

Failure modes covered: **F12–F18**, on top of F1–F11 and F23.

`Run`'s three refusals come from defects that are still live in the flagellum:
`fit.py` storing `res.success` and never reading it; `score.py`'s bare `zip`
truncating silently; and a crash being recordable as a scientific negative.
`aggregate/2` additionally refuses a repeated unit id, because frames are not
independent replicates.

## 10. Verification

| command | result |
|-|-|
| `mix test` | PASS — **765 tests**, 4 doctests, 0 failures (was 681) |
| `mix test test/sp/control_plane` | PASS — 211 tests, 0 failures (82 red at `f9c5167`) |
| `mix compile --warnings-as-errors --force` | PASS — 127 files |
| `mix format --check-formatted` — Control Plane files | PASS |
| `mix format --check-formatted` — repo-wide | **FAIL, standing known-fail** (`lib/sp/brain/language.ex`, PHASE-3-RESULTS §3) |
| `git diff mix.exs` | empty — no hex dependency |
| `evidence/gates.ndjson` sha256 | `964ea25c…1d8a4c44` unchanged — this phase wrote no row |
| `node viewer/gaia/verify_gaia.cjs` | PASS — 12 checks, 0 FAIL |
| `node viewer/gaia/gaia_lint.cjs` | PASS — 0 violations |
| `test/sp/brain/mc_test.exs` | untouched |

## 11. What this phase did NOT do

No row written to the canonical ledger. No rooms, airlocks or keys. No Gaia seat.
No lab view. No Phoenix. No `ui/` change. No P-level moved —
`P8 = FULL_PARITY = false`, first unsatisfied rung `P4`.
`nursery-fenced-red-stocked` remains **FAIL**, falsified 2026-07-19.
**No verdict has been authored about any real scientific claim.**

**Rollback:** delete `lib/sp/control_plane/{store,run,pair}.ex` and the eight new
test files, and revert `Ledger.from_entries/1`. The two canary transitions should
**not** be rolled back — they record that a limit moved.
