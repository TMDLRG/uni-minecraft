# Spec: Phase-2 RED Evidence Collector (ARTIFACT #2 — hardened, self-surviving)

> **Status:** DESIGN ONLY. No `lib/**` edited; nothing deployed. Deploy/approval
> steps are written for owner go-ahead (live-stream guard applies).
>
> **Why this exists:** the P1 RED bash collector died at ~100 min because it
> lived inside the LLM session and died with it — silently. The Phase-2 RED runs
> ≥6 UNIs per arm over many hours; it needs a collector that survives session
> death, SSH disconnect, context compaction, container restarts, and whole-box
> failure. The owner ruling: **defense-in-depth — redundant INDEPENDENT
> collectors so a single death is itself a visible signal.**
>
> **Companion files (this artifact):**
> - `ops/phase2_collector/collect.exs` — the actual read-only probe (RCON +
>   BEAM brain-probe, one JSONL line per arm per tick + heartbeat).
> - `ops/phase2_collector/uni-collector.service` / `.timer` — L1 systemd user units.
> - `ops/phase2_collector/collector.container` — L2 podman quadlet sidecar.
> - `ops/phase2_collector/harness_task.md` — L3 control-plane task + L4 remote node.

---

## 0. ClaimFence (binding)

This collector measures **behaviour** (server-authoritative RCON counters:
mined / used / crafted / inventory) and **mechanism** (brain-internal model
floats: curriculum phase index, action-habit entropy, learned Dirichlet cell
counts, the novelty information term `W`). Per the binding claim fence
(`CLAUDE.md`; `docs/UNI_MISSION_DEEPENING.md`): these are **necessary-not-
sufficient** operational substrates with **ZERO evidential weight** for
awareness / consciousness / life. **No field is a "felt" state.** When Phase-2
energy/satiety factors exist, their logged values are factor posteriors and
log-preference dot-products — never hunger, comfort, or want. Passing a Phase-2
gate demonstrates the named **behaviour** (allostatic foraging, limit-cycle
homeostasis, placed/used blocks), **never experience**, and only once that gate
has its own registered RED verdict (Lab Protocol attribution fence).

---

## 1. The four layers (defense-in-depth)

The cadence is owned by **four independent schedulers**, none of which can take
the others down. Each writes its own JSONL stream tagged with a unique
`collector_id`. A heartbeat gap from any one layer, while the others keep
writing, is itself the "this collector died" signal — the failure mode that made
the P1 single-collector silent is converted into an observable event.

| Layer | Host | Scheduler | Survives | `collector_id` | File |
|---|---|---|---|---|---|
| **L1** | colony box (`uni@10.190.245.122`, rootless) | `systemd --user` timer (`OnCalendar=*:0/10`) | LLM session end, SSH disconnect, context compaction, repo edits | `L1-systemd@colony` | `uni-collector.{service,timer}` |
| **L2** | colony box, podman sidecar on `uni-colony-net` | in-container `while sleep 600` + `Restart=always` | host user-session loss, repo-checkout breakage, single crash | `L2-sidecar@uni-colony-net` | `collector.container` |
| **L3** | control plane (this harness) | harness scheduled task | the colony BOX entirely (reboot loop, podman wedge) | `L3-harness@control` | `harness_task.md` |
| **L4** | remote mesh node `uni-lab-79740c` (10.13.13.3) | remote systemd user timer (via `uni-lab` MCP) | the colony box AND the control plane | `L4-remote@uni-lab-79740c` | `harness_task.md` |

L4 additionally acts as a **heartbeat-of-heartbeats**: it reads L1/L2 heartbeats
over the mesh and emits a `collector_down` event when a layer's heartbeat is
stale (> 2× interval), so even the death of an on-box collector is recorded
off-box. See `harness_task.md` for the L3/L4 deploy + approval steps and the
liveness escalation ladder.

All four sample the **same 10-minute cadence anchored to wall-clock boundaries**
(00,10,20,…) so their rows reconcile by a shared `cycle` window. L1/L4 use
`OnCalendar=*:0/10` with a small `RandomizedDelaySec`; L3 anchors to the boundary
in the harness cron; L2 (loop-based) is allowed to drift — it only needs to be
INDEPENDENTLY alive, not phase-locked (exact alignment is L1's job).

---

## 2. The two read channels (both written every tick, lock-step)

Each tick reads **both arms of the paired RED** and **both channels**, so the
treatment and control arms are always sampled at the same `poll_ts`/`cycle` — the
lock-step pairing key that makes the paired comparison valid.

### (a) BEHAVIOUR — Source-RCON (server-authoritative)

Reuses the dependency-free Source-RCON client `SP.Minecraft.Rcon`:
`connect/4` (`lib/sp/minecraft/rcon.ex:39`), `command/3` (`:57`), `commands/3`
(`:68`), `close/1` (`:78`). Config (`lib/sp/producer.ex:301`): host =
`MC_HOST || "127.0.0.1"`, port `25_575`, password `"sp"`; confirmed by
`mcserver/server.properties:4` (`rcon.port=25575`), `:29` (`enable-rcon=true`),
`:35` (`rcon.password=sp`). **Gameplay is port `25565` (`server.properties:28`);
RCON is `25575` — pointing the collector at 25565 silently fails.**

Per tick, once at boot the collector registers scoreboard objectives
(idempotent), then every tick reads, per UNI:

- **`scoreboard objectives add <name> minecraft.used:minecraft.<id>`** → placed/
  used blocks. **This is the R1 PASS substrate** — placed/used > 0 and distinct
  block types, server-authoritative, so **hoarding cannot satisfy it**.
- **`…minecraft.mined:minecraft.<id>`** → gathering breadth (distinct mined types).
- **`…minecraft.crafted:minecraft.<id>`** → tool-chain progress.
- **`scoreboard players get <UNI> <obj>`** → the per-player count; parses
  `"<p> has N [<obj>]"`; "none is set" → 0.
- **`clear <UNI> minecraft.<item> 0`** → the **non-destructive** instantaneous
  inventory probe (max=0 reports matches, removes nothing) — the hoard snapshot
  (e.g. `wooden_pickaxe`, the control's Σ≈25 attractor, `DEEPENING_PLAN.md:14`).

`distinct_block_types` is computed **collector-side** = count of place/use
objectives with score > 0 (RCON-authoritative).

> **WHY RCON is the independent channel (load-bearing):** the brain's phase gate
> reads inventory from the body's own σ self-report, not the server
> (`mc.ex phase_goal_met?/2`). RCON scoreboard stats are the server's OWN
> counters — the only view the agent cannot fake by hoarding — which is exactly
> why R1's PASS metric must be read over RCON, not from the brain.

### (b) MECHANISM — BEAM brain-probe (over distributed Erlang)

Reuses `runs/probe_curiosity.exs` verbatim: cookie `:sp` (`probe:9`); attach
`Node.connect`; `reg = SP.Runtime.Supervisor.registry()` (== `SP.Runtime.Registry`,
`supervisor.ex:20/92`); per UNI `:rpc.call(node, Registry, :lookup, [reg, u])`
→ `pid` → `:rpc.call(node, :sys, :get_state, [pid]).brain` (`probe:30-34`).
Roster is taken robustly from `SP.Runtime.Supervisor.list_agents/0`
(`supervisor.ex:84-89`, returns `[%{username, kin, mode}]`) filtered by `kin`,
falling back to the `UNI-<kin>-<i>` convention only if the registry roster is
empty — so N≥6 per arm needs no code change.

Fields per UNI:
- `phase` — `b.dna.phase` (curriculum stage).
- `novelty_gain` — `Map.get(b.dna, :novelty_gain, 0.0)` — the **arm-integrity tag**
  (treatment vs control must differ exactly here; a drift is a corrupted RED).
- `action_entropy` — `entropy(b.model.e)` (action-habit diversity; the P1
  exploration signal that decayed to 0 as `W→0`).
- `learned_cells` — `pb` Dirichlet cells > 2.5 (`probe:20-24`) — breadth of
  experienced transitions.
- `tick` — `st.tick` (liveness / progress).
- `novelty_W_a` / `novelty_W_b` — OPTIONAL recompute via `lib/sp/brain/novelty.ex`
  (`NOVELTY_W=1`; heavier).

### Read-only guarantee

RCON: only `scoreboard players get`, `scoreboard objectives add` (one-time,
idempotent), `list`, and `clear … 0` (documented non-destructive). BEAM: only
`Registry.lookup` + `:sys.get_state` — no cast, no call into agent logic. **The
collector cannot perturb the experiment.**

---

## 3. JSONL schema

Two append-only files per collector under `OUT_DIR` (the memory dir on-box, or a
named volume / control-plane path off-box): `phase2_red.jsonl` (data) and
`heartbeat.jsonl` (liveness). One data object **per UNI per arm per tick**; one
heartbeat object **per tick** (always written, even on total channel failure).
Per-line flush, append-only, never crashes the scheduler (mirrors the
reconnect-never-crash discipline of `producer.ex:321`).

### 3a. Data line — `phase2_red.jsonl`

```jsonc
{
  "schema": "phase2_red/1",
  "poll_ts": "2026-06-24T18:40:00.123Z",   // ISO-8601 UTC — lock-step pairing key
  "cycle": 1750790400,                       // os_time(:second) at tick start — reconciliation window key
  "collector_id": "L1-systemd@colony",       // WHICH layer wrote this row (L1/L2/L3/L4)
  "arm": "treatment",                         // RED arm label (treatment | control)
  "kin": 10,                                  // kin id for the arm
  "uni": "UNI-10-3",                          // the individual

  "rcon": {                                   // (a) BEHAVIOUR — server-authoritative
    "placed_used":   {"crafting_table": 2, "cobblestone": 14, "oak_planks": 0, "dirt": 3, "torch": 1},
    "mined":         {"oak_log": 9, "spruce_log": 0, "stone": 21, "cobblestone": 21, "coal_ore": 2, "iron_ore": 0},
    "crafted":       {"wooden_pickaxe": 1, "stone_pickaxe": 0, "crafting_table": 1},
    "inv_now":       {"wooden_pickaxe": 1, "stone_pickaxe": 0, "oak_log": 4},  // non-destructive snapshot
    "placed_used_total": 20,                  // Σ placed/used — R1 numerator
    "distinct_block_types": 4,                // # place/use objectives > 0  — R1 PASS metric (hoarding can't fake)
    "distinct_mined_types": 4,                // # mined objectives > 0      — gathering breadth
    "rcon_ok": true                           // false + "error" on a failed read (gap row)
  },

  "probe": {                                  // (b) MECHANISM — brain-internal
    "phase": 3,                               // b.dna.phase
    "novelty_gain": 0.5,                      // arm-integrity tag (treatment≠control)
    "action_entropy": 2.29,                   // entropy(b.model.e)
    "learned_cells": 41,                      // pb cells > 2.5
    "tick": 18044,                            // st.tick
    "novelty_W_a": 0.013,                     // OPTIONAL (NOVELTY_W=1)
    "novelty_W_b": 0.004,                     // OPTIONAL
    "probe_ok": true                          // false + "error" (not_registered | node_down | get_state_failed)
  }
}
```

**Partial failure:** if one channel fails, its block carries `*_ok=false` + an
`error` string and the row is STILL written (a gap row), so the reconciler sees a
"present-but-empty" measurement, not a missing one. If a UNI is dead/unregistered,
`probe_ok=false, error="not_registered"` and the RCON block may still report its
last server-side counters.

### 3b. Heartbeat line — `heartbeat.jsonl` (ALWAYS written)

```jsonc
{
  "schema": "phase2_heartbeat/1",
  "poll_ts": "2026-06-24T18:40:00.123Z",
  "cycle": 1750790400,
  "collector_id": "L1-systemd@colony",
  "node_attached": true,                      // BEAM node reachable this tick
  "rcon_connected": true,                     // RCON socket opened this tick
  "arms": {                                   // per-arm liveness summary
    "treatment": {"probed": 6, "rcon_ok": 6, "n": 6},
    "control":   {"probed": 6, "rcon_ok": 6, "n": 6}
  },
  "rows_written": 12
  // on a fatal tick: {"node_attached": false, "rcon_connected": false, "rows_written": 0, "fatal": "<msg>"}
}
```

The heartbeat is the **liveness primitive**: a layer is "alive" iff it has
written a heartbeat within the last `2 × interval` (20 min). A missing heartbeat
is the death signal (§4).

---

## 4. Cross-collector reconciliation rule

The four layers produce four overlapping evidence streams. The reconciler (a
read-only offline pass over the collected JSONL — NOT part of `collect.exs`)
merges them into the single authoritative RED record:

1. **Pairing key.** Group rows by `cycle` rounded to the 10-min boundary (the
   `poll_ts` wall-clock bucket). Within a bucket, the treatment and control rows
   are the lock-step paired sample for that tick.

2. **Dedupe.** The unit of truth is `(cycle_bucket, arm, uni)`. Multiple layers
   will report the same `(cycle_bucket, arm, uni)`; collapse to one record.

3. **Value precedence (RCON / behaviour).** RCON counters are
   server-authoritative and should AGREE across layers (they read the same
   server). On agreement, take the value. **On disagreement** between two layers'
   RCON counter for the same `(cycle_bucket, arm, uni)`, emit a
   `reconcile_conflict` for manual review and prefer the **on-box** reading
   (L1/L2) over off-box (L3/L4), since off-box reads can lag a tick over a slow
   route. A conflict is a real signal (clock skew, a missed objective
   registration, or a forwarded-port reading a stale server) — never silently
   averaged.

4. **Value precedence (probe / mechanism).** Brain floats are read from the live
   registry; the layer with the freshest `tick` for that UNI wins (highest
   `st.tick`), since a laggy off-box probe may read an older `:sys.get_state`.
   If layers disagree on `novelty_gain` for the same UNI, that is an
   **arm-integrity alarm** (the RED is corrupted) — surface it, do not reconcile.

5. **Liveness / death signals (from `heartbeat.jsonl` across all four):**
   - One layer's heartbeat gap, others writing → THAT layer/host/route died; the
     record is intact. Investigate that layer; the RED is NOT compromised.
   - L1 + L2 gap, L3/L4 writing → colony BOX in trouble; process may be up.
     Escalate.
   - L1 + L2 + L3 gap, L4 writing → colony box AND control plane dark; L4 is the
     sole witness. Page the owner.
   - All four gap → total outage; the LAST heartbeat from any layer bounds the
     time of death. (The exact failure the P1 N=1 collector had — defeated by N=4.)

6. **Completeness check.** For each `cycle_bucket`, assert ≥1 layer wrote ≥
   `N_PER_ARM` rows per arm. A bucket below that on ALL layers is a genuine data
   gap and is annotated in the RED record, not silently dropped.

---

## 5. RED-readiness checklist this collector must satisfy

- **N ≥ 6 per arm** (DEEPENING_PLAN artifact #2): roster from `list_agents/0`,
  `N_PER_ARM=6`. ✓
- **Survives session/box death:** L1 systemd, L2 sidecar, L3 harness, L4 remote —
  four independent cadence owners. ✓
- **Both arms, both channels, lock-step every 10 min:** single tick reads
  treatment+control × RCON+probe at one `poll_ts`. ✓
- **R1 metric is RCON-authoritative** (`distinct_block_types` / `placed_used` from
  the server, not the brain's self-report). ✓
- **Read-only:** no colony mutation on any channel. ✓
- **Heartbeat liveness:** a death is a visible heartbeat gap, not silence. ✓

---

## 6. Deploy / approval steps (LEFT FOR OWNER GO-AHEAD — do not auto-deploy)

The live-stream guard (`CLAUDE.md`) requires owner go-ahead before anything
points at the public-streamed colony. The collector is read-only, but it still
attaches to the live RED, so:

1. **Owner confirms the Phase-2 RED is deployed** and the arm kins (`ARMS=…`) and
   `N_PER_ARM` match the actual lineages (treatment = metabolism-on, control =
   metabolism-off, distinct kin + memory dirs per the live-stream guard).
2. **Verify the wood-species objective ids** for biome seed 8675309 on the FIRST
   manual poll (oak vs spruce/birch — a wrong id silently logs 0). Set `WOOD_IDS`
   / `MINE_IDS` accordingly.
3. **Confirm `clear … 0` is non-destructive** on this Paper 1.16.5 build before
   trusting it in-loop (manual one-shot, check inventory unchanged).
4. **L1:** scp `collect.exs` + units to the box; `loginctl enable-linger uni`;
   `systemctl --user enable --now uni-collector.timer` (see
   `uni-collector.service` header).
5. **L2:** scp `collector.container` to `~/.config/containers/systemd/`;
   `systemctl --user daemon-reload && systemctl --user start collector.service`
   (see `collector.container` header).
6. **L3 / L4:** owner approves the RCON route off-box; register the harness task
   (L3) and the remote-node timer + watcher (L4) per `harness_task.md`. Each
   mutating remote-limb call passes the shared approval queue.
7. **Smoke test:** confirm every enabled layer writes (a) a heartbeat and (b)
   ≥1 data row per arm before trusting the cadence; record each layer's
   `collector_id` + first-heartbeat timestamp in the RED evidence log.

---

## 7. Files (this artifact)

- `docs/specs/collector.md` — this spec (design, schema, reconciliation, deploy).
- `ops/phase2_collector/collect.exs` — the read-only probe (RCON + BEAM, JSONL + heartbeat).
- `ops/phase2_collector/uni-collector.service` — L1 systemd user service.
- `ops/phase2_collector/uni-collector.timer` — L1 systemd user timer (10 min).
- `ops/phase2_collector/collector.container` — L2 podman quadlet sidecar.
- `ops/phase2_collector/harness_task.md` — L3 control-plane task + L4 remote-node vantage.
```
