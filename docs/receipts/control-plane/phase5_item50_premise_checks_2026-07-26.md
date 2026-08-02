# Phase 5 item 5.0 — the three premise checks, run before anything was built on them

**Date:** 2026-07-26 · **Repo:** `UNI.Minecraft`, `gen2-runtime` @ `e6a0529`
**Plan:** `docs/control-plane/phases/PHASE-5.md` §0.1 (UNI-FLAGELLUM)

Item 5.0 exists because four pre-registered premises have been wrong on contact,
one per phase. This time the checking came first.

**Result: two confirmed, one FALSE — and the plan's own fallback for the false
one is false too.**

---

## Premise 1 — "a second machine on the mesh can hold an anchor the writer cannot reach"

### FALSE. And `docs/GAIA.md` already said so, in its own words.

The fleet is reachable — `replica_ledger_probe.cjs` ran clean, three chip
replicas captured. That is not the problem. The problem is what THINKER can
**write**.

`docs/GAIA.md:443-450`, verbatim, written before this phase existed:

> **Caveat (honest):** the default target is the colony host — **the only box
> THINKER can ssh-write unattended** (node2 is chronically unreachable; MCP
> writes are approval-gated). That is a **second failure domain, not a fully
> independent custodian** (it is the source host). A truly independent target
> (node2 / an immutable object store) is the further hardening.

And on the existing WORM tier, `docs/GAIA.md:438`:

> **Enforcement is procedural.** Gaia (read-only) cannot intercept another
> agent's `podman rm`; the unbypassable form is a colony-side pre-stop hook…
> Until then the handoff procedure is the guarantee.

So on this fleet, today:

| candidate custodian | reachable? | writable by THINKER unattended? | verdict |
|-|-|-|-|
| the colony host | yes | **yes** — direct ssh key on THINKER | same failure domain; not a witness |
| node2 | **chronically unreachable** | — | unavailable |
| the existing WORM tier | yes | yes — its immutability is **procedural**, by its own docs | not a witness |
| any MCP-mediated write | yes | **no — approval-gated, one human co-sign** | see below |

**There is no location on this fleet that the writer cannot reach unattended,
except one gated by a human.**

### The plan's pre-registered fallback is ALSO false

`PHASE-5.md §0.1` said: *"if false → fall back to a signed anchor and record
why."* A signed anchor is only as good as the custody of its key. The key would
live on THINKER, with the writer. **A signature the writer can produce is not a
witness — it is theatre with extra steps.**

That is a **fifth** pre-registered premise wrong on contact, and the first one
where the *fallback* was wrong too.

### What is actually available, and what it can honestly claim

Two things exist that the writer cannot do **unilaterally**:

1. **An approval-gated MCP write.** Every mutating call pauses for exactly one
   human approve/deny. THINKER cannot produce that approval. This is a genuine
   second party — the same shape as the two-party rule Phase 3 already built.
2. **A git-distributed anchor.** Committed and pushed, the anchor exists in a
   remote and in every clone. THINKER *can* force-push — but a force-push is
   **visible**, and other clones retain the prior history. `GAIA.md:449` notes
   this pattern is already in use: *"Anchor + pre-redeploy captures + the anchor
   custody chain are already git-distributed regardless."*

Neither is **tamper-proof**. Both are **tamper-evident**, which is a different
and weaker claim, and the difference must be stated wherever the witness is
described.

**This is an operator decision** and item 5.1 does not start without it. It
changes what the witness can honestly claim, and building the wrong one produces
a component whose name asserts something it does not do — the exact failure this
programme exists to prevent.

## Premise 2 — "`gaia_lint.cjs` will actually fail a summarizing seat"

### CONFIRMED, decisively. The lint is not decorative.

A deliberately summarizing fixture — one signal carrying `total`,
`health_percent` and `rank`, with `total` also in its id — was written and linted
**before any real seat exists**:

```
$ node -e 'require("./viewer/gaia/gaia_lint.cjs").lint({live:false, snapshots:"<fixture dir>"})'
ok: false | snapshot files: 1 | signals: 1
violations: 10
```

Ten violations across **five independent checks**:

| check | what caught it |
|-|-|
| `shape` | envelope missing `schema_version` |
| `(a) FROZEN_KEY` ×3 | `total`, `health_percent`, `rank` are outside `sig.FROZEN_KEYS.signal` |
| `(b) FORBIDDEN_TOKEN` ×4 | `total` in the **id**, `total`/`percent`/`rank` as emitted **key names** |
| `(c) PROVENANCE` | declared `byte_len` ≠ actual |
| `(d) REHASH` | `sha256(value.raw)` ≠ `provenance.sha256` |

Notably it catches a forbidden token in the signal **id**, not only in a field —
so a seat cannot smuggle a rollup in by naming it.

**GAIA LAW is mechanically enforced, not aspirational.** Item 5.4 may proceed.

## Premise 3 — "Gaia's seat pattern admits a new source without changing GAIA LAW"

### CONFIRMED.

`organic-operator` (added 2026-07-16) is the worked example, and the pattern is
enforced rather than conventional. A seat must be declared in **three** places:

- `viewer/gaia/caps.cjs` `RESOURCES` (with `seat:`),
- the `gaia.signal.get` tool enum,
- `docs/GAIA.md`.

And `verify_gaia.cjs`'s `gaia-every-emitted-seat-declared` check exists
specifically to close the half-wiring hole that `gaia-mcp-caps-agree`
structurally cannot see — a seat that *emits* while being declared nowhere. A new
seat therefore cannot be added quietly.

Its moduledoc also states the law in the form item 5.4 must follow: *"Gaia carries
the persona TEXT so any reader can run the gauntlet; she never runs it, scores it,
or authors its verdict."*

**No `STOP_PROTOCOL_CHANGE_REQUIRED`.** Items 5.4 and 5.5 may proceed.

---

## Disposition

| item | state |
|-|-|
| 5.0 | **DONE.** Two premises confirmed, one false with its fallback also false. |
| 5.1 | **BLOCKED — operator decision.** No unattended-unreachable target exists on this fleet. |
| 5.2–5.6 | **UNBLOCKED.** Proceed. |

Nothing was built on an unchecked premise. That is what item 5.0 was for, and it
earned its place on the first attempt.
