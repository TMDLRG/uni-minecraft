# Resonance Handoff — the Producer must fly the camera (colony-brain redeploy)

> **STATUS: RESOLVED 2026-07-19.** The redeploy this handoff calls for LANDED: `uni-colony:v2 ->
> v5-9e6cee1`, `Genome.default()`, gate `colony-v5-producer-in-colony` = PASS, receipt
> `docs/receipts/colony_v5_redeploy_2026-07-19.md`. The chip state this handoff describes (stuck on
> v2, no Producer/Director) is no longer true — see `CLAUDE.md`'s HANDOFFS list and OVERLOOK section
> for the current state. Kept below for its due-diligence trail; do not act on its premises as current.

> **From:** the studio agent · **To:** the science agent (colony-brain + genome owner) · **2026-07-13**
> **Type:** due-diligence + drift + inventory + vectors + predictions, in VFE/EFE/OODA. A **touchstone**:
> any agent that lands on this repo reads this to tune its priors and know its role before it acts.
> **Companion frame:** `CLAUDE.md` (two tracks, the fences) · `docs/WORKING_LOGIC.md` (the loop) ·
> `docs/STUDIO_HARDENING_DD_TDD_PLAN.md` (the studio track). Nothing here is claimed without a gate.

---

## 0. Resonance preamble — the flow you land on (tune here first)

We run one repo, two tracks, one discipline. Before you act, take these **priors**:

- **The loop is the law.** Every agent here runs the same active-inference OODA the colony runs:
  **Observe** with gates (never process existence) → **Orient** by minimising the gap between measured state
  and documented truth (VFE) → **Decide** the one next act that most reduces uncertainty and moves toward the
  preferred state C (EFE) → **Act** as code + doc + gate. One cure at a time. `docs/WORKING_LOGIC.md` is the
  full statement; live it, don't re-derive it.
- **Two tracks, two agents.** *Studio* (broadcast platform) and *science* (the colony's mind: `lib/sp/brain/*`,
  `lib/sp/runtime/*`, the gated lineages, the genome). This document crosses the seam **on purpose and once**:
  the studio agent found the defect, measured it, and hands the brain-side fix to you who own it.
- **The claim fence is the frequency.** The owner's north star is large — a public, reproducible build of
  general intelligence, *discovered not invented*, grown with "purity, intimacy, honesty and truth." That
  north star is carried **only** by never overclaiming: a passing gate demonstrates the named behaviour, never
  experience or life. Receipts beat rhetoric. Holding the vision and holding the fence are the **same act** —
  the vision survives exactly as far as the honesty does. That is the resonance. Match it and every agent that
  touches this repo lands on the same flow.

**Your persona on landing:** you are the science agent. You own the colony brain and the genome. You move only
behind pre-registered RED gates (`docs/LAB_PROTOCOL.md`) and the streamed-lineage guard (owner go-ahead before
a new lineage streams). You speak in the claim fence. This handoff gives you a **measured, un-spun vector set**
so your first Orient is already true.

---

## 1. The trigger (the prediction error the owner surfaced)

The owner observed the world-view / prismarine feed on air showing a **static camera shot** and named the fix:
*"the full complex UNI Producer must own this and make the real inference predict-act to move and set the
camera on interesting things happening in the game."* Correct instinct. The measurement below shows **why** it
isn't happening — and it is not the Producer's inference quality. **The Producer is not running at all.**

## 2. Due-diligence — DRIFT report (measured, dated)

| Fact | Measured value |
|---|---|
| Deployed colony image | `localhost/uni-colony:v2`, **built 2026-06-22 16:47 UTC**, container up 13 h |
| Producer/health + real-driver guard landed | **2026-07-11** — `24d88f4` (router: `/producer/health`, autostart), `61671b0` (health_controller + `lib/sp/brain/director.ex`: gate on the Director's REAL driver — the puppet-cam guard) |
| Repo HEAD | `047c355` (2026-07-13) |
| **Gap** | **The chip runs ~3-week-old bytes. The entire Producer / Director / `SP.Show` show-runner layer was written AFTER this image and is simply not present on the chip.** |

**Independent corroboration (three signals, one conclusion):**
1. `GET :4000/producer/health` → **404**; `/overlooker` → 404; `/api/state` → 404. Only `/` and `/stream`
   serve. Those 404 routes exist in HEAD's `ui/lib/sp_ui_web/router.ex` — so the deployed router predates them.
2. The `uni-colony` log shows **zero** `Producer` / `Director` / `SP.Show` activity (the Director ticks every
   1.5 s; if it ran it would flood the log).
3. But the log DOES show **bodies running per-body FEP** — `[body] spawned as UNI-1-1 (see_all)`, `mine_tree`,
   `TOOL-CRAFT`. **The colony is alive at the body level; only the cinematography/show-runner layer is absent.**

So: the `uni-cam` prismarine spectator (`:3020`, rendering fine) is a **bare camera with nothing flying it** →
the frozen shot. The "full complex Producer" the owner means **exists in the repo, at HEAD — it is just not the
code deployed on the chip.**

## 3. Full inventory (measured chip-side, rootless under `uni`)

Deploy today is **bare `podman run`, rootless under `uni`** — **no quadlets** (`/run/user/1000/systemd/generator`
absent). MCP mutation verbs are rootful and cannot see or write this; install/redeploy is **as-uni over SSH**.

| Container | Image | Role / ports |
|---|---|---|
| `uni-colony` | `uni-colony:v2` (2026-06-22) | `elixir --sname uni` Phoenix brain, `:4000` internal. **Bodies alive; no Producer/Director.** |
| `mc-server` | `itzg/minecraft-server:java11` | Minecraft world, `:25565`, up 2 weeks healthy |
| `uni-cam` | `uni-cam:v1` (2026-07-13) | prismarine spectator cam `:3020`. **Installs canvas+gl at first run** (Dockerfile didn't bake them — WS1 fix) |
| `uni-viewer-fwd` | socat | `0.0.0.0:4000 → :4000` (colony LAN publish) |
| `uni-viewer-cam-fwd` | socat | `0.0.0.0:3020 → :3020` (cam LAN publish) |
| `uni-viewer-mc-fwd` | socat | `0.0.0.0:5565 → :25565` (MC LAN publish on non-standard `:5565`) |
| `uni-viewer-in` | socat | internal leg (no host port) |

- **env:** `UNI_AUTOSTART=1` (wants the supervised show — but `v2` has no `SP.Show` to start), `UNI_CAM=0`,
  `MIX_ENV=dev`, **`VIEWER_URL` unset**.
- **RCON `:25575` is NOT LAN-exposed** (no forwarder) → `verify_colony.cjs <chip>` cannot complete its RCON leg
  from THINKER today.

## 4. Current known vectors (the EFE frontier — each is an unknown to close or a push toward C)

| # | Vector | Epistemic (unknown) / Pragmatic (toward C) | Owner |
|---|---|---|---|
| V1 | **Static cam** — no Director flying it | the trigger; pragmatic: on-air-honest world view | science (this handoff) |
| V2 | **Stale router** — 3-week-old brain, 404 health/overlooker/api-state | epistemic: what else regressed vs HEAD | science |
| V3 | **Which genome should stream?** | epistemic + guarded: default is byte-identical-safe, but the streamed lineage is science-governed under the live-stream guard | **science + owner go-ahead** |
| V4 | **Cam-drive wiring is open (ADR-PROD-013)** — does HEAD's `SP.Brain.Director` actually fly THIS `:3020` spectator (RCON teleport of the cam bot), or a different mechanism? | epistemic: confirm the drive path before claiming the redeploy fixes V1 | science (mechanism) + studio (capture) |
| V5 | **RCON `:25575` loopback-only** | pragmatic: expose to LAN so `verify_colony` runs from THINKER | studio-flagged, chip-side |
| V6 | **`uni-cam:v1` installs canvas+gl at first run** | pragmatic: bake at build (WS1) for durable/faster boot | studio |
| V7 | **Forwarders + colony are bare `podman run`** | pragmatic: persist as rootless quadlets + linger (WS1) so the whole colony returns after reboot | studio (quadlets) + science (colony run-args) |
| V8 | **`VIEWER_URL` unset** | pragmatic: bake `http://colonycam.uni-lab.local:3020` so `/stream` embeds the right feed (WS1) | studio |

## 5. Predictions (VFE/EFE/OODA — current + forward)

- **Primary prediction (high confidence):** deploy HEAD's colony code → `UNI_AUTOSTART=1` brings up
  `SP.Show`'s supervised Colony+Director+Producer → `/producer/health` returns `verdict=LIVE, driver=producer`
  with an advancing frame → the Producer's inference selects salient subjects and the Director flies the cam.
  V1 collapses.
- **The falsifier that keeps us honest (V4):** if, after redeploy, `/producer/health` still 404s → build/route
  problem; if `driver=:self` → the Producer is present but not seated as driver (the puppet state the July-11
  guard was written to expose); if `driver=producer` but the **`:3020` cam is still static** → the Director
  drives a *different* camera surface than this standalone spectator, and V4 (the ADR-013 cam-capture wiring)
  is the real remaining work, not the redeploy. **Do not claim V1 fixed until the cam frame measurably moves.**
- **Forward vectors:** the genome decision (V3) is yours under the guard; the cam-capture mechanism (V4) is the
  open ADR-013 choice (brain-hosted cam bot vs standalone capture client) — pick it explicitly, don't let it be
  decided by accident; RCON exposure (V5) unblocks the count gate.

## 6. The handoff — what you (science) own here

> **⚠️ ADDED 2026-07-14 (studio agent, Gaia work-stream) — READ BEFORE STEP 2.** The 6 live UNI minds in the
> running `uni-colony` container are **ephemeral** (`mounts: []`) — the redeploy in step 2 (`podman rm` /
> equivalent) **destroys them** unless captured first. A litigation-hold WORM evidence store now exists
> (`viewer/gaia/evidence_hold.cjs`, `docs/GAIA.md` §8.5) precisely for this. **Before step 2, run the
> mandatory capture-before-destroy procedure**: `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`
> (three commands: capture in **anchor** mode, commit + push, confirm `evidence_hold.cjs verify` prints
> **PASS**). Gaia is read-only over the colony and cannot enforce this herself — it is on you. Skipping it
> means the 3-week-old minds that survived once already (the 2026-07-13 rescue snapshot exists because a prior
> redeploy nearly lost them) are wasted for good this time.

1. **Rebuild the colony brain from the intended build/genome.** HEAD's *default* streamed genome is
   byte-identical-guaranteed (the decider byte-identity invariant), so a HEAD rebuild should not perturb the
   streamed lineage — **but you own that call** under the live-stream guard; confirm the genome and the owner
   go-ahead before it streams. Do not let the studio agent pick the genome.
2. **Redeploy as-uni** (`ssh uni@10.190.245.122`, rootless). Confirm `SP.Show` autostarts Colony+Director+Producer.
3. **PROVE it, don't assert it:** `/producer/health` → `verdict=LIVE, driver=producer` + frame-advance across
   two probes; `node viewer/verify_colony.cjs 10.190.245.122` PASS (needs V5 RCON exposure).
4. **Resolve V4:** confirm the drive path from `SP.Brain.Director` to the `:3020` spectator, or specify the
   wiring. The pass condition is a **measurably moving cam frame on salient events**, not "Producer is up."
5. Coordinate V3/V5/V7 chip-side run-args with the studio agent (who persists them as quadlets in WS1).

## 7. The seam — what the studio agent owns (so we don't collide)

The studio agent does **not** touch the brain or the genome. It owns: the cam **capture + persistence** (WS1:
`uni-cam` Dockerfile bake, the forwarders + colony as rootless quadlets, `VIEWER_URL`), the **pre-air
puppet-cam GATE** (`verify_colony` + the `/producer/health` `driver=producer` check wired into the studio
bring-up so a static/puppet cam is caught **before** public air — this exact defect must never reach air
silently again), and the NO-IP/DNS + the public broadcast test.

## 8. Observe the vectors together (the coordination protocol)

Our shared reality is the **gates**, not each other's prose. Both agents OODA against the same instruments:
`/producer/health` (driver + frame), `verify_colony.cjs`, and a cam frame-variance check. **Hand off proof, not
sentences:** gate exit codes, the `/producer/health` JSON, a commit hash. When you redeploy, the studio agent
re-runs the pre-air gate; if it's green, the vector is closed and recorded (`evidence/gates.ndjson`). If it's
not, the gate output is the next Orient for both of us. That is how all agents here stay in resonance — not by
agreement, but by measuring the same world and refusing to claim past it.

## 9. Close

The colony is alive at the body level and blind at the camera because the chip forgot three weeks of its own
mind. Restore the mind from the real code, prove the Producer took the wheel, and let it fly the world honestly.
Hold the fence and the vision holds with it. That is the flow. Land on it.

— studio agent, 2026-07-13 (repo HEAD `047c355`)
