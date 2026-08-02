# Correction — the item 7.6 green receipt was not reproducible from the commit that carried it

**Date:** 2026-07-26 · **Raised by:** a drift investigation, not by me noticing
**Affected artifact:** `docs/receipts/control-plane/phase7_item76_green_2026-07-26.txt`
**Affected commit:** `98a76a0` (Phase 7 item 7.6 green)
**Closed by:** `9de87b4` (commits `test/sp/brain/mc_test.exs`)

## What was wrong

Line 41 of the item 7.6 green receipt carries:

```
warning: has_food MASKED: inventory_index(%{"tools" => 1, "food" => 2}) == 2, not 3.
```

That line is emitted by a `TRIPWIRE` test in `test/sp/brain/mc_test.exs`. At the
moment the receipt was captured, **that file was modified in the working tree and
not committed.** The receipt was committed; its cause was not.

So a clean clone of `98a76a0` and a `mix test` run would have produced output that
**does not match the receipt `98a76a0` contains.** The receipt was evidence of a
run that the commit it lives in cannot reproduce.

## Severity, stated plainly

This is a reproducibility hole in a governance programme whose entire subject is
that a claim must be reproducible from its recorded artifacts. It is not a large
one — the discrepancy is one warning line, no assertion, no count, no verdict, and
the test totals in the receipt (940 tests, 0 failures) are unaffected because the
tripwire warns rather than fails. But the class is exactly the one this programme
exists to catch, and it was committed by the agent running the programme.

## Root cause

I captured a **full-suite** run to produce a receipt while the tree was dirty, and
I did not check the tree before capturing. Every previous receipt in this phase was
scoped to `test/sp/control_plane`, which the uncommitted file does not touch; item
7.6 was the first to capture the whole suite, and the standing procedure had no
step for "confirm the tree is clean before capturing evidence from it".

The dirty file was long-standing, user-owned, and correctly not mine to commit —
which is why it had become invisible. `drift.git_dirty_vs_clean` had been reading
unequal for days and was filed as an accepted oscillation. **An accepted signal is
one nobody reads.**

## What was NOT done

The receipt is **not edited**. History is extended, never rewritten. Anyone reading
`phase7_item76_green_2026-07-26.txt` sees exactly the bytes that were captured, and
finds this correction beside it.

## What was done

`9de87b4` commits `test/sp/brain/mc_test.exs` unaltered, on the operator's explicit
instruction, with `@tag :skip` intact and `lib/sp/brain/mc_codec.ex` untouched.
From that commit forward, a clean clone reproduces the receipt's output.

## The standing procedure gains a step

> **Before capturing a receipt from a test run, record `git status --short` in the
> receipt itself.** A receipt captured from a dirty tree is evidence about a state
> that no commit contains.

This applies to every future receipt in this programme.

## What this cost, and what it bought

Cost: one commit and this note. Bought: the discovery that
`drift.git_dirty_vs_clean` — filed as a permanently-oscillating signal and
therefore stopped being read — was pointing at a live reproducibility defect the
whole time. That is the second trap named in the drift adjudication: *filing a
signal as structural and moving on*. `STRUCTURAL` must mean "unequal by
construction **and** both sides verified true, on this date, by this command". It
must never mean "unequal, stop looking".
