# Colony redeploy v2 → v5-9e6cee1 — the chip stops running 3-week-old bytes (receipt, 2026-07-19)

**Track:** colony/science surface, owner-directed. **Genome: `Genome.default()` (owner-named).**
**Gate:** `colony-v5-producer-in-colony` — `driver=producer` + frame advance + `colony_count` == RCON − Director.
**Verdict: PASS · evidence class B** (observed-with-artifact: live probes either side of the swap).

**CLAIM FENCE:** this demonstrates the named behaviour — a real Director/Producer flying the camera
over a live colony. It is **not** evidence of awareness, experience or life. No such claim is made.

---

## 1. What was wrong

Per `docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md`, the chip ran
`uni-colony:v2`, built **2026-06-22**. The entire Producer / Director / `SP.Show` show-runner layer
landed **2026-07-11** (`24d88f4`, `61671b0`) — 16+ days later. The colony was alive at the body level
and blind at the camera.

**The trap that was avoided.** `uni-colony:v3` and `:v4` exist on the chip and look like the obvious
"next". They are not. Measured build times:

| image | built |
|---|---|
| v1 | 2026-06-22 16:38 |
| **v2** | 2026-06-22 16:47 ← was running |
| v3 | 2026-06-23 17:34 |
| v4 | 2026-06-23 21:30 |
| metabolism | 2026-06-25 22:21 |

All five predate the Producer layer. Deploying v3/v4 would have destroyed live minds for a lateral
move. **The real "next" had never been built.** It was built here from a pushed ref.

## 2. Capture-before-destroy (binding procedure, honoured)

`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`. The container is `mounts: []` — minds live
only in its ephemeral FS.

| capture | when | minds | outcome |
|---|---|---|---|
| `cap-2026-07-19T03-56-50-314Z` | pre-work | 6 | committed `a18b002`, pushed |
| `cap-2026-07-19T05-04-54-680Z` | immediately pre-swap | 6 | committed `2fa59a9`, pushed |
| `cap-2026-07-19T05-12-22-976Z` | before the corrective re-swap | 5 | committed |

`node viewer/gaia/evidence_hold.cjs verify` → **`HOLD INTEGRITY: PASS`** (0 missing, 0 hash
mismatches, 0 custody-chain breaks) confirmed **before** any destructive step. A second capture was
taken right before the swap so the loss window was minutes, not the ~1h since the first.

**The original 6 minds are preserved and NOT restored.** The new colony started with an empty
`/app/runs/colony/` and bred fresh minds (UNI-1-1/1-2/1-3, UNI-2-1, UNI-3-1). Restoring the captured
lineage is a separate, un-taken decision — the handoff fences it behind owner go-ahead plus a
`/lab-team-review` MERGED VERDICT. The bytes are in `evidence/colony_minds/minds/<kin>/` whenever
that call is made.

## 3. Genome — verified, not assumed

Owner named **default**. Verified in code rather than trusted:

```elixir
# lib/sp/runtime/agent.ex — lineage_from_env/0
case System.get_env("UNI_LINEAGE") do
  "homeostat_colony" -> ...
  _ -> nil        # unset/unknown => nil => Genome.default() => byte-identical
end
```

The running container carries **no `UNI_LINEAGE`** (`grep -c` = 0, checked post-swap), and the
Dockerfile sets none. The streamed lineage is the byte-identical default.

## 4. Build — from an immutable pushed ref, not the working tree

Pinned `9e6cee1` (verified docs/gates-only vs the reviewed `a18b002`, touching nothing the image
ships). `git archive 9e6cee1 | ssh … tar -x` into `~/build_9e6cee1`, then
`podman build -t localhost/uni-colony:v5-9e6cee1 -f deploy/uni-os/uni-colony.Dockerfile .` → exit 0,
`b6022720df90`. Shipping from the ref (not the tree) also guaranteed uncommitted local test edits
could not leak into the image.

**Image verified to contain the layer before anything was destroyed** — the whole point of the
redeploy, with v2 as control:

| | v5-9e6cee1 | v2 (control) |
|---|---|---|
| `show.ex` | PRESENT | **MISSING** |
| `/producer/health` route | `health_controller.ex` | **MISSING** |
| compiled `SP.Show.Bootstrap` beam | PRESENT | — |
| compiled `SP.Brain.Director` beam | PRESENT | — |

## 5. The swap — and a mistake worth recording

Sequence: `podman rm -f uni-viewer-in` (shares the colony netns, blocks removal) → `rm uni-colony` →
`run` new → recreate `uni-viewer-in` → restart `uni-producer` (its rpc goes stale when the colony's
erlang node restarts).

**MISTAKE: the first swap omitted `--hostname uni-colony`.** Podman then set the hostname to the
container ID, so `--sname uni` formed **`uni@3435fa92674f`** instead of `uni@uni-colony`. The producer
targets `UNI_COLONY_NODE=uni@uni-colony`, so its `Board.all/0` rpc found nothing:
`colony_count: 0`, `star: null`, only generic `b_roll`. Per CLAUDE.md, *a `colony_count:0` producer
reporting LIVE is an EMPTY colony* — it was, and it is recorded as such rather than glossed. Fixed by
re-running with `--hostname uni-colony`; the env/network/command had been reproduced faithfully but
the hostname was not part of the captured config and should have been.

Restart policy was left at the original `no` rather than "improved" mid-deploy (one cure at a time).
**Recommended follow-up:** it should be a restart policy or a rootless quadlet (handoff V7) — a
crash currently leaves the colony down.

## 6. Proof (probes, not process existence)

```
driver           = producer          (the REAL SP.Brain.Director driver, not :self)
OVERLOOK frame   = 1 -> 3            across two probes 15s apart   => ADVANCE: PASS
colony_count     = 5
RCON list        = 6 (UNI-1-1, UNI-1-2, UNI-1-3, UNI-2-1, UNI-3-1, Director)
                   6 - Director = 5 == colony_count                => COUNT RULE: PASS
studio /api/status = driver=producer verdict=LIVE colony=5 frame=11
colonycam :3020    = up (prismarine)
```

The colony's own `:4000/producer/health` — which **404'd on v2** — now serves, reporting real
cinematography (`widen`, `hold`, `b_roll` with drama scores, star `UNI-1-1`).

**`viewer/verify_colony.cjs` could NOT be used as the gate.** It fails on its RCON leg from THINKER —
the known pre-existing V5 gap (RCON `:25575` is not LAN-exposed), **not** a fault of this deploy. The
count rule was therefore proven chip-side via `podman exec mc-server rcon-cli list`. Closing V5 would
let the canonical gate run end-to-end and is the right follow-up.

## 7. Rollback position

`uni-colony:v2` is untouched on disk — code rolls back in seconds. Minds do not: they return only via
the litigation hold. That asymmetry is exactly why the capture ran immediately before the swap.
