# Phase 3 — the green run, and the two premises that turned out wrong

**Date:** 2026-07-25 · **Repo:** `UNI.Minecraft`, `gen2-runtime` · **Red:** `219d8b0`
**Plan:** `docs/control-plane/phases/PHASE-3.md` (UNI-FLAGELLUM)
**Raw:** [`phase3_red_2026-07-25.txt`](phase3_red_2026-07-25.txt) · [`phase3_green_2026-07-25.txt`](phase3_green_2026-07-25.txt)

```
$ mix test test/sp/control_plane
127 tests, 56 failures      # at 219d8b0, before Registry / Verdict / Anchor existed
127 tests,  0 failures      # here
```

Test count identical across red and green: **nothing was added to make anything
pass.** Full suite 681 tests, 0 failures (was 621).

---

## 1. ADVERSE — my own DATA-SPEC invariant was wrong, and it shipped in Phase 2

`DATA-SPEC.md` §1 said `prior` may be `null` **"only for `seq = 1`"**, and
`Ledger.check_prior/2` enforced exactly that.

Both were wrong. **Registering a new gate as the fifth ledger entry genuinely has
no prior state.** The rule confused *the ledger's* first entry with *this
subject's* first entry — a category error that reads as rigour.

It survived Phase 2 because **no test covered it.** A rule with no test is a
comment that happens to run. Phase 3 found it on the first attempt to register
anything, before a line of Phase 3 code was written.

Corrected: `prior` may be `nil` at any `seq`. Supplying the right value is the
authoring module's job; chain integrity is the ledger's, and a `nil` prior does
not threaten it. Pinned by *"a NEW gate registered deep in the chain still has a
null prior"*.

## 2. ADVERSE — item 3.7's premise was wrong, and the pre-registered fix is not available

`PHASE-3.md` item 3.7 offered two ways to close the inherited
`mix format --check-formatted` failure on `lib/sp/brain/language.ex`:
**(a)** normalise it to LF in its own commit, or **(b)** record it as a standing
known-fail with its reason.

Option (a) was written on my assumption that the failure was **line endings
only** — because the failure diff renders CRLF markers prominently. Tested
directly:

```
CRLF pairs removed: 333 | bytes 12718 -> 12385
$ mix format --check-formatted lib/sp/brain/language.ex
** (Mix) mix format failed due to --check-formatted.     # STILL FAILS
```

The file is genuinely unformatted. A real reformat is **93 added / 29 removed
lines, 85/21 of them non-whitespace** — substantial restructuring of a file in
the language subsystem, which `CLAUDE.md` names among the invariant-guarded
areas.

**Option (a) is therefore not available as written.** Taking **option (b)**:

> **STANDING KNOWN-FAIL.** `mix format --check-formatted` fails repo-wide on
> `lib/sp/brain/language.ex`, which is genuinely unformatted (not merely
> CRLF-terminated) and predates all Control Plane work. Reformatting it is a
> deliberate style change to another subsystem and belongs in its own commit,
> proposed on its own terms — not inside a Control Plane evidence commit. Every
> Control Plane file passes the same check.

`language.ex` was modified during this investigation and **reverted to
byte-identical HEAD** (`76d0ebec…`) twice. `git status` on it is clean.

**Two pre-registered premises wrong in one phase** (§1 and §2). Both were mine,
both were assumptions written as facts, and both were caught by trying to act on
them. That is the pre-registration working, not failing.

## 3. A conflict between two of my own tests, resolved before either was committed

The receipt cannot live in a verdict entry's `evidence` list.

`Command` requires a real `sha256` on every evidence entry. Producing one means
reading the receipt from disk — which makes **authorship depend on the file
already existing**, contradicting the test that says it must not. The other exit
was weakening `Command`'s evidence rule to admit a hashless entry: a guard traded
for a convenience.

Resolved by putting the pointer in `resulting.receipt_ref`. A reader of the
ledger alone still reaches the receipt; `evidence` stays content-addressed and
carries artifacts only when their digests are already known. Written into the
test's moduledoc so the tension is not rediscovered as a bug.

## 4. What was built

| module | file | what |
|-|-|-|
| `SP.ControlPlane.Registry` | `registry.ex` | registers a gate before anything is observed |
| `SP.ControlPlane.Verdict` | `verdict.ex` | authors five words, refuses everything else |
| `SP.ControlPlane.Anchor` | `anchor.ex` | holds what a hash chain cannot hold about itself |
| `SP.ControlPlane.Command` | amended | `:author_verdict`; **the two-party rule** |
| `SP.ControlPlane.Ledger` | amended | the corrected `prior` rule (§1) |

Failure modes covered: **F1–F4**, on top of Phase 2's F5–F11 and F23.

**Design decisions, recorded rather than left implicit:**

- **Prospectivity is "registration is the FIRST entry mentioning this gate."**
  The guard does not know what a run is, so Phase 4's `Run` needs no change to
  it. The refusal names the `seq` that got there first, so it can be looked at.
- **The two-party rule lives in `Command`, not `Verdict`** — it binds every
  mutation. Compared case- and whitespace-insensitively, because `"Claude"` and
  `"claude "` are one person and an audit trail that disagrees proves nothing.
- **`PENDING` is the one verdict authorable without a receipt.** It asserts
  nothing. **`WITHHELD` still needs one** — a withdrawal is itself a claim about
  evidence.
- **A near-miss is a refusal, not a guess.** `"pass"`, `"PASS "` and `"Pass"` are
  all refused rather than normalised; a near-miss signals something upstream is
  confused, and silently fixing it hides that.
- **There is no `Anchor.attest/1`.** An API that let you claim soundness without
  an anchor would eventually be asked to.

## 5. ITEM 3.6 IS PARTIAL, and the holding sub-claim is named

Item 3.6's pre-registered outcome was *"tail truncation is detected **in
practice**, rather than only in a test."*

**What holds:** the mechanism exists, round-trips through bytes, and catches
truncation by one entry, truncation by many, unexpected growth, and a forged head.

**What does not:** *in practice*. `SP.ControlPlane.Ledger` has **no
persistence**, so nothing holds an anchor across a process boundary and nothing
can compare today's chain against yesterday's head. Truncation is detected
whenever an anchor is held; today, nothing holds one.

A test asserts this limit directly and **fires when it stops being true** —
`"STATED LIMIT — nothing persists an anchor yet"` scans the namespace for any
persistence primitive. Mutation-tested: adding `File.write` makes it fail.

## 6. Four tests passed in red. None vacuously, and two were mutation-tested

| test | why it passed in red | mutation-tested at green |
|-|-|-|
| "two different parties are accepted" | positive control on Phase 2's `Command`; must stay green | — (a positive control, not a guard) |
| "no existing Phase 2 entry was self-authorised" | proves the two-party rule was not introduced by weakening a fixture | **yes — FAILED as required** when a self-authorised fixture was injected |
| "the four PARTIAL rows each say what holds" | the upstream convention the guard encodes | — (an assertion about canonical data) |
| "STATED LIMIT — nothing persists an anchor yet" | a canary on a limit that is currently true | **yes — FAILED as required** when `File.write` was injected |

Both mutations reverted; `git diff` empty; suite returned to 127/0.

## 7. Verification

| command | result |
|-|-|
| `mix test` | PASS — **681 tests**, 4 doctests, 0 failures (was 621) |
| `mix test test/sp/control_plane` | PASS — 127 tests, 0 failures (was 127 / 56 red) |
| `mix compile --warnings-as-errors --force` | PASS |
| `mix format --check-formatted` (Phase 3 files) | PASS |
| `mix format --check-formatted` (repo-wide) | **FAIL — standing known-fail**, §2 |
| `git diff mix.exs` | empty |
| `evidence/gates.ndjson` sha256 | `964ea25c…1d8a4c44` unchanged — this phase wrote no row |
| `node viewer/gaia/verify_gaia.cjs` | PASS — 12 checks, 0 FAIL |
| `node viewer/gaia/gaia_lint.cjs` | PASS — 0 violations |
| `lib/sp/brain/language.ex` | byte-identical to HEAD, `76d0ebec…` |
| `test/sp/brain/mc_test.exs` | untouched |

## 8. A discrepancy in the red commit message, corrected here

`219d8b0`'s message says *"55 of 126 failing"*. The recorded run in
`phase3_red_2026-07-25.txt` is **56 of 127** — one test was added while resolving
§3 between writing the message and the final run. The receipt is the number to
trust. History is not rewritten to hide a stale figure in a commit message.

## 9. What this phase did NOT do

No row written to the canonical ledger. No run executed. No pairing guard. No
rooms, airlocks or keys. No Gaia seat. No lab view. No Phoenix. No `ui/` change.
No P-level moved — `P8 = FULL_PARITY = false`, first unsatisfied rung `P4`.
`nursery-fenced-red-stocked` remains **FAIL**, falsified 2026-07-19.

**Rollback:** delete `lib/sp/control_plane/{registry,verdict,anchor}.ex` and the
four new test files, and revert the two amendments to `command.ex` and
`ledger.ex`. The `prior` correction in `ledger.ex` should survive any rollback —
it fixes a real defect independent of Phase 3.
