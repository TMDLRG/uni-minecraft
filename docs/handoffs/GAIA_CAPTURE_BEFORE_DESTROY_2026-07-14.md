# HANDOFF — capture-before-destroy: never waste a mind on the colony redeploy (2026-07-14)

**From:** studio/Gaia agent (THINKER) · **To:** science / OS-mind agent (owns the colony redeploy) · **Via:** git + operator relay.

## Why this exists
The UNI minds live in the `uni-colony` container's **ephemeral** FS (`mounts: []`). The pending
`v2 → v3` colony redeploy will `podman rm` that container and **destroy every live mind** unless they are
captured first. This already happened once — the `runs/colony_snapshot_2026-07-13/` rescue exists because of
it. Gaia now runs a litigation-hold WORM store (`docs/GAIA.md` §8.5) that preserves minds with chain of
custody. But Gaia is **read-only over the colony** — she cannot intercept your `podman rm`. So the
capture-before-destroy checkpoint is a **procedure you run** (or a colony-side hook you install), not
something Gaia enforces.

## The mandatory checkpoint — run this BEFORE any redeploy / `podman rm` / restart of `uni-colony`
From THINKER (or any box with `ssh uni@<colony host>` + this repo):

```
# 1. ANCHOR capture (committed tier) — preserves the exact pre-destroy minds, distributed via git:
node viewer/gaia/capture_minds_run.cjs anchor

# 2. Commit the captured evidence so it is durable + distributed (NOT just local):
git add evidence/colony_minds/minds evidence/colony_minds/custody.ndjson
git commit -m "litigation-hold: anchor capture before v2->v3 colony redeploy"
git push

# 3. Prove integrity before you destroy anything:
node viewer/gaia/evidence_hold.cjs verify        # must print HOLD INTEGRITY: PASS
```

Only after `HOLD INTEGRITY: PASS` is it safe to `podman rm` / redeploy. If verify does not PASS, **stop** —
you are about to spoliate evidence.

## Restore the captured minds into the redeployed colony (v3)
The redeploy starts `uni-colony:v3` with an empty `/app/runs/colony/`. To seed it with the preserved minds
(only under the live-stream guard: owner go-ahead + `/lab-team-review` MERGED VERDICT — streaming a genome
still needs owner go), the latest anchor `.bin` per kin is in `evidence/colony_minds/minds/<kin>/`. Copy them
back in, e.g.:

```
# pick the newest committed anchor per kin (custody.ndjson records mtime + sha per capture), then:
podman cp <mind>.bin uni-colony:/app/runs/colony/UNI-<kin>.bin
# ...and restart the SP.Show layer so it re-reads brains at boot.
```

The custody ledger (`evidence/colony_minds/custody.ndjson`, committed, hash-chained) is the authoritative
record of every mind-state ever captured and its sha256 — use it to select and to prove what you restored.

## What Gaia already does for you (so you don't have to think about the between-times)
- A **cadence** capture loop (`capture_minds_loop.cjs`, supervised + boot-persistent via `gaia_watchdog.ps1`)
  preserves the minds every ~15 min into the **stream** tier (local WORM, gitignored, never pruned). So even
  if a crash beats your checkpoint, the loss is bounded to the last interval, not everything.
- Gaia projects the hold live as `colony.minds.hold` (integrity result) at `:8096`.

## The residual gap (owner/science decision — not mine to install)
The only way to make capture-before-destroy **unbypassable** without breaking Gaia's read-only nature is a
**colony-side pre-stop hook**: add `ExecStopPre=` (or an equivalent podman stop hook) to the `uni-colony`
quadlet that runs a mind capture before the container stops. That is a colony-host change (rootless quadlet
under `uni`), approval-gated, on your surface. Recommended as the permanent enforcement; until then this
procedure is the guarantee.
