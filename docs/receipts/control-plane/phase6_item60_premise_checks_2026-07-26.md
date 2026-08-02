# Phase 6 item 6.0 — premises checked, and each check's blind spot named

**Date:** 2026-07-26 · **Repo:** `UNI.Minecraft` @ `915bfbb`
**Plan:** `docs/control-plane/phases/PHASE-6.md` §0.1 (UNI-FLAGELLUM)

Phase 5 taught that a premise check can itself be incomplete — it found three
declaration sites where there were four. So this item checks the premises **and
states how each check could be wrong.**

**Result: one confirmed, one confirmed-with-a-correction, one FALSE — and the
false one was caught by the blind spot written for it.**

---

## Premise 1 — "`uni-approvald` can carry a human co-sign for a key"

### CONFIRMED, with its limitation stated.

`approvals_pending` answers live: `ok: true`, `count: 0`, and the envelope says
in its own words:

> these are waiting for a HUMAN at `https://<box>/approvals/` — **you cannot
> approve your own request**

That is a genuine second party. The split is categorical, not per-verb: *"each
mutating call pauses for ONE human approve/deny… read-only tools run at once."*

**How this check could be wrong.** The blind spot named was *"it may gate only
some verbs; enumerate them rather than sampling one."* I did **not** enumerate
every tool and observe each one gate. I read the **stated rule** and observed the
queue exists and refuses self-approval. So the claim is: *the mechanism is real
and categorical by declaration*, not *every mutating tool was individually
verified to gate*. A tool that quietly bypassed the queue would not have been
caught by this check.

## Premise 2 — "a room transition can be recorded with the existing command vocabulary"

### FALSE. The ledger entry has no home for a second key.

The blind spot for this check was *"a transition may need a field the entry has
no home for — check the DATA-SPEC, not just the code."* That is what caught it.

`DATA-SPEC.md` §1:

> `authorization` | object | ✔ | `{kind, granted_by, ref}` — how this was permitted

**One** `granted_by`. And `Command` validates exactly that:

```elixir
missing = Enum.reject(["kind", "granted_by"], &is_binary(Map.get(auth, &1)))
```

An airlock (F20) needs **two valid keys**, and the entry can carry **one
authority**. Grepping `command.ex` for `co_sign|signers|keys` returns **0**.

Had I checked only the command vocabulary — which is genuinely extensible, and
whose extension is legitimate under the standing rule *"the vocabulary grows only
when a guard grows with it"* — I would have concluded the premise held, built the
Room, and discovered at F20 that two keys cannot be recorded.

**Remedy, additive so nothing already written breaks:** `authorization` gains an
optional `co_signers` array. `Command` validates that each is a distinct party
and that none equals the `actor`, reusing the two-party comparison already built
in Phase 3 (case- and whitespace-insensitive). The seven entries already in the
Control Plane ledger remain valid — they carry no `co_signers` and need none.

`DATA-SPEC.md` §1 is amended, which is the **second** correction to that section.
The first was Phase 3's `prior` rule.

## Premise 3 — "no existing surface already models rooms"

### CONFIRMED-WITH-A-CORRECTION. Nothing models a lab room; a gated progression already exists.

Grepping under several names:

```
airlock 0 · sterile 1 · cleanroom 0 · chamber 0 · room 20 · stage 117 · mode 383 · zone 56
```

`stage` and `mode` are too broad to mean anything — which is the blind spot
verbatim: *"a differently-named equivalent (a 'stage', a 'mode') would not match a
grep for 'room'."*

Looking for the **shape** rather than the word found it: `viewer/door_journey.cjs`
already models a gated progression — `studio_ready → feature_test → go_live →
run_of_show → off_air`, each step a `{id, label, check}` whose `check` returns
`{done, detail}`, where `detail` explains *why not yet* in words a reader can act
on:

> `"not yet green — run BROADCAST TEST from the command center"`

**That is the same discipline item 6.1 requires** ("the refusal names the missing
receipt"), already in use on this platform.

**What this changes.** `Room` does not reinvent the shape — it mirrors
`{id, check → {done, detail}}`. It is still a **different body** ([ADR-0001](../../../UNI-Flagellum/UNI-FLAGELLUM/docs/control-plane/decisions/ADR-0001-four-bodies.md)):
the Door governs a **broadcast** threshold and its checks are probes of live
state; a Room governs a **lab** threshold and its conditions are **receipts**.
Same vocabulary, different subject, no collapse.

---

## Disposition

| premise | state |
|-|-|
| 1 — approvals can carry a co-sign | **CONFIRMED**, by declaration not per-tool enumeration |
| 2 — the entry can record a room transition | **FALSE** — no home for a second key. Additive remedy named. |
| 3 — nothing already models rooms | **CONFIRMED-WITH-CORRECTION** — reuse `door_journey`'s shape, do not reinvent it |

Two phases running, item N.0 has found something that would otherwise have been
discovered late and expensively. The blind-spot column earned its place on its
first outing.
