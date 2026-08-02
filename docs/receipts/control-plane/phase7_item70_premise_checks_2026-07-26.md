# Phase 7 item 7.0 — premises checked, blind spots named, and the open failure **reproduced**

**Date:** 2026-07-26 · **Repo:** `UNI.Minecraft` @ `d524ad1`
**Plan:** `docs/control-plane/phases/PHASE-7.md` §0.1 (UNI-FLAGELLUM)

**Headline: the Phase 6 "unnamed failure" reproduced on the second run of three,
and it was MY OWN TEST — not the suite's documented flake band, which is what I
said it was likely to be. That attribution was wrong.**

---

## Premise 1 — "the unnamed Phase 6 failure is a known flake"

### FALSE. It was mine, and it reproduced.

Three full runs at fixed seeds, output captured this time:

```
seed 1000 → 840 tests, 0 failures
seed 2000 → 840 tests, 1 FAILURE
seed 3000 → 840 tests, 0 failures
```

The failure:

```
1) test EVERY commit named in the ledger exists in git — invented history fails here
   (SP.ControlPlane.ControlPlaneLedgerIsRealTest)
   47d0ef9 is not a commit in this repository — the ledger is asserting a history that does not exist
```

**`47d0ef9` is a real commit.** It is Phase 2's red commit, in this repository,
reachable right now.

### Root cause — mine, and structural rather than incidental

The test I wrote for Phase 5 item 5.2 ran `async: true` and spawned **one `git`
subprocess per sha**. With 33 concurrent cases competing for process slots, a
spawn intermittently failed — and **a failed spawn is indistinguishable from "no
such commit" if you only check the exit code.**

The test that exists to prove the ledger is not asserting an invented history was
itself asserting an invented failure.

### Fixed at the root, not retried

- `async: false` — a file that shells out has no business racing 32 other cases.
- **One** `git rev-parse` call for the whole set instead of *N*.

A retry would have hidden it. The point of this test is to be believed when it
fails.

### And I got the fix wrong once, at the shell, before shipping it

The first attempt used `git rev-parse --quiet --verify <shas…>`. `--verify`
takes **exactly one** argument, so it failed for every input. Rather than assume
twice in one item, I checked the semantics directly:

```
$ git rev-parse "47d0ef9^{commit}" "75e2fc4^{commit}"   → exit 0
$ git rev-parse "47d0ef9^{commit}" "deadbee^{commit}"   → exit 128, echoes "deadbee^{commit}"
```

Plain `rev-parse` resolves every argument, exits non-zero on the first that does
not, and names it. That is exactly the check wanted.

### The blind spot, honoured

The check's stated blind spot was: *"N runs that pass do not prove absence —
record the count and call it not-reproduced-in-N, never fixed."*

**Post-fix: 4 runs at seeds 4000–7000, all 840/0.**

So the honest claim is: **reproduced once in 3 pre-fix runs; not reproduced in 4
post-fix runs, after a root-cause fix.** Not "fixed".

## Premise 2 — "`ui/` can render without the Control Plane writing"

### CONFIRMED by contract, with its blind spot standing.

`ui/mix.exs`, as amended 2026-07-25 (ADR-0007):

> The UI still NEVER writes engine state and NEVER writes `evidence/gates.ndjson`
> or any receipt. It gained exactly one new ability: it may SUBMIT a command to
> `SP.ControlPlane`… **The UI proposes; the Control Plane authors.**
> …a polled read still actuates NOTHING (the Door's law, inherited).

**The blind spot was "check for spawn, not just for writes"** — and it found
something real: `ui/` **already** mounts processes and writes, in
`application.ex`, `producer_uni_controller.ex`, `overlooker_live.ex` and
`stream_live.ex`.

That is not a contract violation — those are the *broadcast* surfaces, and the
contract forbids writing **engine state and evidence**, not all IO. But it means
**"`ui/` does not spawn" is false as a blanket statement**, so Phase 7's lab-view
tests cannot assert it globally. They must scope to the lab view's own module,
exactly as Phase 4 had to narrow the disk-IO scan from a blanket to an allowlist.

Recorded now so that scan is written correctly the first time.

## Premise 3 — "a screenshot can distinguish simulated from observed with no text read"

### NOT CHECKED, deliberately, and it is not mine to check.

The blind spot was stated as: *"'distinguishable to me' is not 'distinguishable
to a tired operator at hour three' — this needs `/organic-operator`, not my own
eye."*

I have not built the fixtures yet, and when I do, **my judgement of them is not
evidence.** The acceptance bar in `PHASE-7.md` §3 is explicit that this item is
reviewed by `/organic-operator` and not only by me.

Marking a premise `NOT CHECKED — requires a review I cannot perform on myself` is
a complete and correct answer, not an omission.

---

## Disposition

| premise | state |
|-|-|
| 1 — the Phase 6 failure was a known flake | **FALSE.** Reproduced; it was my own test. Root-caused and fixed; not reproduced in 4 runs since. |
| 2 — `ui/` can render without writing | **CONFIRMED by contract** — and the blind spot found that `ui/` already spawns elsewhere, so the lab-view scan must be scoped, not blanket. |
| 3 — a screenshot distinguishes simulated from observed | **NOT CHECKED.** Requires `/organic-operator`; my own eye is not evidence. |

**Three phases running, item N.0 has found something.** This time it found that
a previous phase's honest-sounding attribution — *"likely the documented flake"* —
was wrong, and that the test which exists to catch invented history was inventing
a failure.
