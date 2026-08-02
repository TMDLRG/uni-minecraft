# Lab-team review — hunt motor reachability fix: MERGED VERDICT **REJECT** (2026-07-19)

**Protocol:** `~/.claude/skills/lab-team-review.md` (fork → break → repair → vote → RED).
**Step 1 halt rule invoked:** Math-Breaker returned REJECT ⇒ MERGED VERDICT = REJECT, no matter what;
the remaining four personas were **not** run, per the protocol's own instruction.
**Ship gate held: NO code was changed.** `viewer/body.js` is untouched.

---

## MERGED VERDICT: REJECT

Both candidate fixes rejected:
- **Fix 1** (bound `huntTarget()` to pursuit range) — fails the sign check. Under the measured world
  state (nearest prey 24.7–46.2 blocks) the bound returns `null` on every hunt, and the
  `entityAtCrosshair(p, 4, …)` fallback needs prey within 4 blocks. The outcome kernel
  `p(o | s, :attack)` stays a point mass on null. It **cannot satisfy its own registered PASS
  condition** (`kills > 0`).
- **Fix 2** (raise pursuit ceiling + step budget) — the food-hack in motor clothing. Pursuing 46
  blocks puts search, approach, target-selection, pursuit, strike and collect inside JavaScript,
  reducing the brain's contribution to emitting one token when `prey ≠ 0`. Since `preyDir` is itself
  unbounded, `prey ≠ 0` is nearly always true, so the learned policy collapses to **one bit**. That
  trips the proposal's own NO-GO clause and the FOOD-HACK precedent this project already withdrew a
  survival claim over.

## The proposal's central causal claim was FALSE — and the repo falsifies it

The packet (written by me, the studio agent) asserted that unbounded selection and the `d > 11`
pursuit abort "were introduced together in `ff57a5a`". **They were not.** Independently re-verified
against the repo after the review:

| commit | time | what it contained |
|---|---|---|
| `ff57a5a` | 2026-07-11 20:32 | `huntTarget()` unbounded; approach loop `i < 6`; **strike cap 4 swings**; **no `d > 11`** |
| `11013f7` | 2026-07-11 22:22 | introduced **both** `for (step < 14)` **and** `if (d > 11) break` |

The lab-side forage RED (2026-07-12, `~uni/.claude-evidence/forage_red/`) records `struck=10`,
`struck=11`, `struck=14`. Those counts are **arithmetically impossible** under `ff57a5a`'s 4-swing
cap, so that evidence was produced by `11013f7` — **the version that already contained `d > 11`** —
which also produced **19 confirmed `killed=true`**.

**Therefore the guard blamed as root cause was present in the code that hunted successfully.**
Unbounded-selection-plus-bounded-pursuit is demonstrably *compatible* with kills. It is not a
sufficient explanation for the 2449/2449 zero-strike regression seven days later.

The real signal is the **distance floor**: across 2449 hunts `bot.nearestEntity` never once found an
animal inside 24.7 blocks. That is an **ecology/placement signature**, not a code signature — prey
density collapsed, animals despawned or wandered, the populator is not running, or the UNIs' own
locomotion parked them off any prey-bearing biome. **Shipping a motor fix against an unmeasured world
variable would have violated LAB_PROTOCOL rule 1 (one cure at a time) before the first tick.**

## The finding neither the proposer nor the packet reasoned to

B is Dirichlet. For the prey-context state under `u = :attack`, with `n` consecutive null outcomes:

```
E[p(o = null | s, :attack)] = (α_null + n) / (Σα + n) → 1
deviation from certainty     = (Σα − α_null) / (Σα + n) = O(1/n)
```

At **n = 2449** the posterior is within `O(1/2449)` of a **degenerate point mass on "attack yields
nothing."** And by hard invariant 4 (monotonic decay), parameter-novelty `W^attack → 0` over the same
counts. So **all three EFE terms now agree on never attacking again**: pragmatic says null, epistemic
says null is well-known, novelty has decayed to zero.

Consequence, and it is a trap: **any RED run on this colony's inherited counts will false-FAIL arm B
regardless of how correct the motor fix is.** Recovery would need ~10³ food outcomes, which cannot
accumulate because `:attack` is exactly what the poisoned posterior suppresses. A paired RED **must**
start from **fresh Dirichlet counts** and **must** report `:attack` selection rate alongside kills.

## Other defects the review surfaced

- **The `killed` observable is corrupt.** `!bot.entities[tid] || !bot.entities[tid].isValid`
  conflates death with despawn and with exit from client entity-tracking. A cow wandering out of
  range scores `killed=true` with `struck=0`. The registered PASS condition is gameable by the
  measurement itself. LAB_PROTOCOL requires independent confirmation — **RCON server-side kills** and
  **inventory delta**, not a body-side flag.
- **The FALSIFIES clause was not decidable** — "struck counts implying no real pursuit" is a vibe,
  not a numeric predicate stated before the run.
- **Model-expressiveness gap the packet's "no model change needed" framing missed:** `preyDir` is fed
  by `nearestAnimal()`, also unbounded. So the brain has **bearing without range** and cannot
  represent "prey near" vs "prey far" at all. Bounding only the selection would leave `B^attack`
  marginalising over an **unobserved confounder**.
- **Lockstep hazard:** a 46-block pursuit is ~12 s inside one action, against a `STEP_MS` tick — it
  would stall the strict 1:1 σ/α lockstep and corrupt timing-sensitive telemetry.

## What the Math-Breaker said would earn SIGN (recorded, NOT implemented)

1. Bound the **SENSE and the SELECTION to the same radius R** — `maxDistance: R` on **both**
   `nearestAnimal()` and `huntTarget()` — so `preyDir` comes to *mean* "prey within R" and the
   contingency becomes learnable. Note this changes the live observation stream, invalidating prior
   `B^prey` learning; the RED must start fresh regardless.
2. **Derive R from the measured closure rate**, don't assert it: 14 steps × ~1.1 blocks ≈ 15 blocks,
   minus ~5 steps spent striking ⇒ ~10–11 blocks *achievable*. R must sit **below** the demonstrated
   closable distance, not at the abort threshold.
3. **Measure the world before measuring the motor** — prey density within R on both dates. Until the
   24.7-block floor is explained, no motor result is attributable.
4. **Scope the claim** to a terminal motor competence plus learned consummation — **not** emergent
   foraging, since at 25+ blocks `preyDir` is 0 and there is no prey signal to search under.

## Follow-on artifacts

Per the ship gate, a REJECT produces none of the three (typed spec / paired RED / ship-gate
checklist) and **no code may merge**. None was written. `viewer/body.js` is unchanged.
