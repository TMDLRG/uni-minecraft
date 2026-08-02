# Ground-Collector Brief — RCON + BEAM-probe read paths for the paired curiosity RED

**Scope.** This is an OPS/design brief for a lab-side, harness-managed evidence collector that polls
**both arms of the curiosity RED in lock-step every 10 min**. It documents the exact read surfaces (RCON
behavioural + BEAM-probe mechanism), the host/port/password source, and the JSONL schema. It changes no
`lib/**` code, deploys nothing, and asserts nothing about the verdict — it specifies how to *gather* the
receipts the verdict will be argued from.

The two arms (per `runs/curiosity_lineage.exs:23-24,49-50`):
- **CURIOSITY** — kin **10**, `Genome.curiosity_primary(gain)` with `novelty_gain>0` (default 0.5).
- **CONTROL** — kin **11**, `Genome.default()` with `novelty_gain=0` (byte-identical body, drive off).
Usernames are `UNI-<kin>-<i>` for `i in 1..n` (default n=3): `UNI-10-1..3`, `UNI-11-1..3`.

---

## 0. ClaimFence (binding)

Everything this collector logs is an **operational behavioural / organisational** measure: blocks placed,
distinct block types, inventory counts, curriculum phase, action-habit entropy, Dirichlet count growth,
novelty term W. Per `docs/LAB_PROTOCOL.md`, these are **necessary-not-sufficient substrates with ZERO
evidential weight for awareness / consciousness / life on their own.** A passed gate demonstrates the named
*behaviour* (placing/using distinct blocks; bounded hoard), **never experience**. No field in the JSONL is
a "felt" state; `novelty_gain`, `W`, action-entropy and γ/precision floats are **mechanism telemetry**, not
sensation. Do not narrate them as such in any artifact built from this log.

---

## 1. Host / port / password source (cite file:line)

| Param | Value | Source |
|---|---|---|
| Lab host (SSH) | `uni@10.190.245.122` (key `~/.ssh/uni-lab_ed25519`) | `memory/ops_colony_lab_rootless.md` |
| MC server container | `mc-server` on rootless `uni-colony-net` (`itzg/minecraft-server:java11`, Paper 1.16.5, seed 8675309) | `memory/ops_colony_lab_rootless.md:10` |
| MC game port | `25565` | `mcserver/server.properties:28` (`server-port=25565`); brain spawn `lib/sp/brain/colony.ex:104` |
| **RCON port** | **`25575`** | `mcserver/server.properties:4` (`rcon.port=25575`); producer default `lib/sp/producer.ex:301` (`opts[:rcon_port] \|\| 25_575`); `mix sp.minecraft` default `lib/mix/tasks/sp.minecraft.ex:7`; `lib/sp/minecraft/runner.ex:29` |
| **RCON password** | **`sp`** | `mcserver/server.properties:35` (`rcon.password=sp`); producer default `lib/sp/producer.ex:301` (`opts[:rcon_pass] \|\| "sp"`); director env `lib/sp/brain/director.ex:491` (`RCON_PASS … "sp"`); runner default `lib/sp/minecraft/runner.ex:31` |
| `enable-rcon` | `true` | `mcserver/server.properties:29` |
| MC_HOST (inside colony container) | `mc-server` | `memory/ops_colony_lab_rootless.md:16`; resolved at `lib/sp/brain/colony.ex:103`, `lib/sp/brain/bridge.ex:158`, `lib/sp/runtime/lineage.ex:135` via `System.get_env("MC_HOST")` |

> **Note — RCON port disambiguation.** `server.properties` puts game traffic on **25565** and RCON on
> **25575**. The brain/body connect for *gameplay* on 25565 (`colony.ex:104`, `lineage.ex:135`,
> `curiosity_lineage.exs:36`); the collector connects for *RCON* on **25575**. Do not point the collector at
> 25565. From a lab-side collector that is NOT inside `uni-colony-net`, reach RCON via the host published
> port of the `mc-server` container, or run the collector inside the network (`podman exec`/sidecar) and use
> `mc-server:25575`. Confirm the published mapping with `podman port mc-server` before the first poll.

The colony image is **headless** (`UNI_CAM=0`), so the Producer's own RCON socket
(`lib/sp/producer.ex:154,300-305`) is the only in-process RCON consumer; it polls `tps` every `@tps_every`
beats (`lib/sp/producer.ex:311-313`). The collector opens its **own, independent** RCON connection so it
never contends with or perturbs the Producer's.

---

## 2. RCON read surface — the authoritative BEHAVIOURAL view

### 2a. Client surface (cite file:line)
`lib/sp/minecraft/rcon.ex` is a complete dependency-free Source-RCON client:
- `SP.Minecraft.Rcon.connect(host, port, password, opts \\ [])` → `{:ok, sock}` / `{:error, reason}`
  (`rcon.ex:39`; auth handshake `rcon.ex:43-52`).
- `SP.Minecraft.Rcon.command(sock, cmd, opts \\ [])` → `{:ok, body}` (`rcon.ex:57`).
- `SP.Minecraft.Rcon.commands(sock, [cmd], opts)` → `:ok` until first error (`rcon.ex:68`).
- `SP.Minecraft.Rcon.close(sock)` (`rcon.ex:78`). Default `timeout: 5000` ms.

A collector written in Elixir can `alias SP.Minecraft.Rcon` and use these directly. A non-Elixir collector
can use any Source-RCON client or `mcrcon`/`rcon-cli` against `mc-server:25575` pw `sp`
(`podman exec mc-server rcon-cli <cmd>` is the in-container path used for health in
`memory/ops_colony_lab_rootless.md:10`).

### 2b. Why RCON is the *independent* channel (cite file:line)
The brain's curriculum-advance gate reads inventory from the **body's σ self-report**, NOT from the server:
`lib/sp/brain/mc.ex:230` `inv(s, k) = get_in(s, ["inv", k])`, fed by the bridge parse
`lib/sp/brain/bridge.ex:42` (`"inv" => %{"wood"=>…, "tools"=>…, "food"=>…}` from the `;`-delimited σ line
`bridge.ex:11,29`). So `phase_goal_met?/2` (`mc.ex:223-227`: phase1 wood≥3, phase2 tools≥1, phase3 wood≥8
AND tools≥1) is **self-reported**. RCON is the server's authoritative counter — the *only* view that
hoarding cannot fake — which is exactly why R1's PASS metric (placed/used blocks > 0 + distinct types)
must be read here, not from the brain.

### 2c. Objective registration (run ONCE, at collector start, before the first poll)
Register persistent scoreboard objectives on the criteria stats. These are server-side counters that
accumulate as each player mines/places/crafts, readable per-player every poll. Block/item ids are Paper
1.16.5. Run via `Rcon.commands(sock, [...])`:

```
# placed / used blocks — the R1 plateau-break metric (placed-or-used > 0)
scoreboard objectives add place_total minecraft.used:minecraft.cobblestone
scoreboard objectives add place_dirt  minecraft.used:minecraft.dirt
scoreboard objectives add place_plank minecraft.used:minecraft.oak_planks
scoreboard objectives add place_log   minecraft.used:minecraft.oak_log
scoreboard objectives add place_table minecraft.used:minecraft.crafting_table
# mined blocks (gathering breadth → distinct mined types)
scoreboard objectives add mine_log   minecraft.mined:minecraft.oak_log
scoreboard objectives add mine_stone minecraft.mined:minecraft.stone
scoreboard objectives add mine_cobble minecraft.mined:minecraft.cobblestone
scoreboard objectives add mine_dirt  minecraft.mined:minecraft.dirt
# crafted items (tool chain → phase-2/3 substrate)
scoreboard objectives add craft_planks minecraft.crafted:minecraft.oak_planks
scoreboard objectives add craft_stick  minecraft.crafted:minecraft.stick
scoreboard objectives add craft_table  minecraft.crafted:minecraft.crafting_table
scoreboard objectives add craft_wpick  minecraft.crafted:minecraft.wooden_pickaxe
scoreboard objectives add craft_waxe   minecraft.crafted:minecraft.wooden_axe
```

Notes on the criteria:
- `minecraft.used:<item>` increments on **place/use** (placing a block counts as "using" the held item) —
  this is the placed-block signal R1 needs. `minecraft.mined:<block>` increments on **break**.
  `minecraft.crafted:<item>` increments on **craft**. These map directly to the body's behaviour repertoire
  (`viewer/body.js:477-537` craft chain logs→planks→table→sticks→wooden tool; place at
  `body.js:460-468`; harvest/mine at `body.js:539+`).
- The wood species the body actually touches depends on the biome (seed 8675309). The list above covers
  oak; on the first manual read, if oak counters stay 0 while the body is clearly chopping, add the matching
  species objectives (`spruce_log`, `birch_log`, …) — the criterion id must match the exact block. A
  belt-and-suspenders alternative is to read raw stats per item without objectives via
  `data get entity <player> ...` is NOT available for stats; the scoreboard-objective path above is the
  supported per-player stat read.
- Distinct-block-types (the R1 anti-hoard half) is **computed by the collector**: count how many of the
  `mine_*` / `place_*` objectives are > 0 for a player this poll. The metric is RCON-authoritative because
  every counter is the server's.

### 2d. Per-poll reads (every 10 min, both arms, lock-step)

For each player `p in {UNI-10-1, UNI-10-2, UNI-10-3, UNI-11-1, UNI-11-2, UNI-11-3}`:

```
# (i) per-objective counts — placed / mined / crafted
scoreboard players get <p> place_total      # → "<p> has N [place_total]"  (parse the integer)
scoreboard players get <p> mine_log
… (one get per objective above)

# (ii) liveness / roster (which UNIs are actually on the server this poll)
list                                          # → "There are K of max 20 players online: <names>"

# (iii) inventory cross-check (server-authoritative item counts, to compare vs the brain's self-report)
#   Paper 1.16.5: use the data path for a held/iterated slot, or the clear-count probe which reports
#   matches WITHOUT removing when count 0 is used as a dry query is NOT reliable — prefer the scoreboard
#   stat counters above for accumulation, and use:
clear <p> minecraft.crafting_table 0          # → "Found N matching items on player <p>" (dry, removes nothing at count 0)
clear <p> minecraft.wooden_pickaxe 0
clear <p> minecraft.oak_log 0
```

- `scoreboard players get` returns `"<player> has <N> [<objective>]"`; if the player has no score yet it
  returns `"Can't get value of <obj> for <player>; none is set"` → log as **0**.
- `clear <player> <item> 0` is the standard non-destructive inventory probe on 1.16.5: it reports the count
  of matching items and removes none (max 0). Use it to read the **current held quantity** (hoard size) of
  `wooden_pickaxe` (the R1 hoard attractor — control reproduced Σ=25 per `docs/DEEPENING_PLAN.md:15`),
  `oak_log`, `crafting_table`, etc. Verify the "removes none" behaviour once manually before trusting it
  in the loop. The scoreboard `*_total` objectives give **cumulative** activity; `clear … 0` gives the
  **instantaneous inventory** — log both; the hoard claim needs the inventory snapshot, the plateau-break
  claim needs the cumulative placed/used + distinct-types.

> RCON robustness: `Rcon.command` has a 5 s timeout and the colony swallows send failures
> (`lib/sp/minecraft/runner.ex:13`). The collector must treat any `{:error, …}` or timeout as a **gap**
> (log `rcon_ok=false` for that poll) and **reconnect** on the next cycle (mirror
> `lib/sp/producer.ex:321` `rcon_connect` on socket drop) — never crash the loop, never drop the cadence.

---

## 3. BEAM-probe surface — the MECHANISM view (cite file:line)

The probe attaches to the **live colony BEAM** and reads brain state via distributed Erlang. The reference
implementation is `runs/probe_curiosity.exs`; the collector should run the same logic on the 10-min cadence.

### 3a. Attach (node / cookie / connect) — `runs/probe_curiosity.exs:8-11`
- **Cookie:** `:sp` — `Node.set_cookie(node, :sp)` (`probe_curiosity.exs:9`).
- **Target node:** passed as `argv[0]`; inside the container the launcher uses `unicur@$(hostname)`
  (`probe_curiosity.exs:3` header). For the colony container the node sname is `unicur` (the curiosity
  lineage) — confirm with `podman exec uni-colony epmd -names` / the running `iex --sname`. The collector's
  own node must start distributed (`--sname pc --cookie sp`) and `Node.connect(node)` must return `true`
  (`probe_curiosity.exs:10`, halts `CONNECT_FAIL` otherwise).
- **Registry:** `reg = SP.Runtime.Supervisor.registry()` → `SP.Runtime.Registry`
  (`probe_curiosity.exs:11`; `lib/sp/runtime/supervisor.ex:20,92`).

### 3b. Per-UNI lookup + state read — `runs/probe_curiosity.exs:26-38`
For each `u = "UNI-<kin>-<i>"`:
```elixir
[{pid, _} | _] = :rpc.call(node, Registry, :lookup, [reg, u])   # probe:31
st = :rpc.call(node, :sys, :get_state, [pid])                   # probe:32  (the Agent GenServer state)
b  = st.brain                                                    # probe:33  (%SP.Brain.MC{})
```
`SP.Runtime.Agent` is the GenServer (`lib/sp/runtime/agent.ex:22`); `:sys.get_state/1` returns its state,
whose `:brain` is the `%MC{}`. (Read-only: `:sys.get_state` does not perturb the process.)

### 3c. Mechanism fields to log — `runs/probe_curiosity.exs:33-34,13-24`
- **Curriculum phase:** `b.dna.phase` (`probe:34`). The R1/R2 phase claim; advanced by
  `mc.ex:220` / `phase_goal_met?` (`mc.ex:223-227`).
- **novelty_gain (arm tag, mechanism-confirmed):** `Map.get(b.dna, :novelty_gain, 0.0)` (`probe:34`).
  Confirms kin-10 carries gain>0 and kin-11 carries 0 — proves the only between-arm difference is the drive
  (the paired-design integrity check). Field origin: `genome.ex` `curiosity_primary(g)=%{default()|novelty_gain:g}`.
- **Action-habit ENTROPY (exploration):** `entropy(b.model.e)` (`probe:13-16,34`) — Shannon entropy of the
  habit/E vector. HIGH = diverse acting; LOW = fixation. This is the prospective-exploration signal the
  novelty term is meant to lift (validation anchor (6): `curiosity_primary(0.5)` action-entropy >
  control + 0.2).
- **Learned transition cells (breadth experienced):** `learned_cells(b.model.subs)` (`probe:20-24,34`) —
  count of per-factor transition-Dirichlet `pb` cells grown clearly above the seed prior (`>2.5`,
  seed pb ∈ [1,2]). A proxy for distinct experienced transitions = breadth of behaviour actually sampled.
  This is where novelty W bites: W is computed over these counts (`lib/sp/brain/novelty.ex` `w_a`/`w_b`),
  decays to ~0 as counts→∞ (`@floor=1.0`), and the cell growth is the count-trajectory the decay rides.
- **Tick:** `Map.get(st, :tick, 0)` (`probe:34`) — per-UNI logical age, for normalising rates between arms.

### 3d. Optional deeper mechanism reads (same `b` = `%MC{}`; add to the collector if cheap)
- **Per-action novelty W trajectory:** with `b.model.subs` (each sub's `pa`, `pb`, `qs`, `qo`) the collector
  can recompute `SP.Brain.Novelty.w_a(pa_m, qs, qo)` / `w_b(pb_u, qs, qs1)` (`lib/sp/brain/novelty.ex`) to log
  the live W per arm and confirm the **monotonic-decay** invariant against the growing counts (the
  no-smuggled-reward receipt). Read-only recomputation; logs W as mechanism telemetry, NOT a felt drive.
- **Per-factor confidence:** mirror the Producer's `Brain.factor_confidence/1` (`lib/sp/producer.ex:174`) if
  a confidence series is wanted. Optional; not required for the R1 gate.

Arm aggregation is the mean over each arm's live UNIs (`probe_curiosity.exs:41-49`): `mean_phase`,
`mean_action_entropy`, `mean_learned_cells`, `mean_tick`, plus `live` = count present.

---

## 4. The lock-step 10-min cadence (harness-managed, survives compaction)

Per `docs/LAB_PROTOCOL.md:18` ("RCON inventories + brain probes every 10 min … both arms in lock-step")
and the project rule that **evidence collection is continuous, lab-side/harness-managed, never inside the
LLM session**: this collector runs as a lab-side loop (a `cron`/systemd-timer/`run_in_background` script on
the lab, or a small supervised Elixir task), NOT as anything the chat session holds open. Each cycle, in
order, for the SAME wall-clock tick:

1. Open (or reuse) the RCON socket to `mc-server:25575` pw `sp`; on first cycle register §2c objectives.
2. `list` → roster; for every `UNI-10-*` and `UNI-11-*`: read all §2d objective `get`s + `clear … 0`
   inventory probes. Record `rcon_ok`.
3. Open (or reuse) the BEAM probe connection (node `unicur@…`, cookie `:sp`); for every UNI run §3b/§3c.
   Record `probe_ok`.
4. Emit **one JSONL line per UNI per poll** (both arms) with a shared `poll_ts` and `cycle` index so the
   arms are paired by row. Append-only; never overwrite. Flush per line (crash-safe).
5. On any partial failure, still emit rows with the failed side's fields null and the `*_ok` flag false —
   a gap is data, not a silent hole.

Both arms are read inside the same cycle so the pairing is tight; a cycle that can read only one arm is
flagged (`live_cur` / `live_ctrl`) so asymmetric attrition is visible in the series.

---

## 5. JSONL schema (one object per UNI per poll)

```jsonc
{
  "poll_ts": "2026-06-24T00:10:00Z",   // ISO-8601 UTC, identical for all rows in a cycle
  "cycle": 7,                          // monotonic cycle index (lock-step pairing key)
  "arm": "curiosity",                  // "curiosity" (kin10) | "control" (kin11)
  "kin": 10,
  "uni": "UNI-10-1",
  "online": true,                      // from RCON `list`

  // --- RCON behavioural (server-authoritative) ---
  "rcon_ok": true,
  "placed_used": {                     // cumulative minecraft.used:* (place/use) per block
    "cobblestone": 0, "dirt": 4, "oak_planks": 1, "oak_log": 0, "crafting_table": 1
  },
  "mined": {                           // cumulative minecraft.mined:*
    "oak_log": 12, "stone": 0, "cobblestone": 0, "dirt": 6
  },
  "crafted": {                         // cumulative minecraft.crafted:*
    "oak_planks": 8, "stick": 4, "crafting_table": 1, "wooden_pickaxe": 1, "wooden_axe": 0
  },
  "inv_now": {                         // instantaneous held counts via `clear <p> <item> 0`
    "wooden_pickaxe": 1, "oak_log": 3, "crafting_table": 0
  },
  "placed_used_total": 6,              // Σ placed_used values  (R1: plateau-break needs > 0)
  "distinct_block_types": 3,           // # of (mined ∪ placed_used) ids with count > 0  (R1 anti-hoard half)
  "pickaxe_hoard": 1,                  // inv_now.wooden_pickaxe  (the hoard attractor; control reproduced ~25)

  // --- BEAM-probe mechanism (registry, read-only) ---
  "probe_ok": true,
  "phase": 2,                          // b.dna.phase
  "novelty_gain": 0.5,                 // Map.get(b.dna,:novelty_gain,0.0)  (arm-integrity tag)
  "action_entropy": 1.41,             // entropy(b.model.e)
  "learned_cells": 37.0,              // learned_cells(b.model.subs)  (pb cells > 2.5)
  "tick": 5120,                        // st.tick
  "novelty_W_a": 0.083,               // OPTIONAL recomputed Novelty.w_a (mechanism telemetry, not a "drive")
  "novelty_W_b": 0.051,               // OPTIONAL recomputed Novelty.w_b

  // --- collector bookkeeping ---
  "live_cur": 3,                       // live curiosity UNIs this cycle
  "live_ctrl": 3,                      // live control UNIs this cycle
  "note": ""                           // free text for anomalies (e.g. "rcon timeout, reconnected")
}
```

Field provenance recap: `placed_used`/`mined`/`crafted` ← §2c objectives via `scoreboard players get`
(`rcon.ex:57`); `inv_now`/`pickaxe_hoard` ← `clear … 0`; `phase`/`novelty_gain`/`action_entropy`/
`learned_cells`/`tick` ← `runs/probe_curiosity.exs:34` over `:rpc.call/:sys.get_state`
(`agent.ex:22`, `supervisor.ex:92`); `novelty_W_*` ← optional recompute via `lib/sp/brain/novelty.ex`.

**Derived series the analysis (NOT this collector) will compute** from the raw JSONL: per-arm means
(mirror `probe_curiosity.exs:41-49`), Δ(cur−ctrl) for phase / action_entropy / learned_cells
(`probe:56`), placed_used_total > 0 incidence and distinct_block_types distribution (R1 PASS), and the
pickaxe_hoard distribution (R1 anti-hoard / the Σ=25 control attractor from `DEEPENING_PLAN.md:15`). The
collector's job is faithful raw capture; it makes no verdict.

---

## 6. Operating notes / gotchas (cite source)

- **Connect for RCON on 25575, gameplay on 25565** — do not conflate (`server.properties:4` vs `:28`).
- **Paper `connection-throttle: -1`** must already be set or bots drop from the shared container IP
  (`memory/ops_colony_lab_rootless.md:17`); irrelevant to RCON but relevant to why a UNI may be missing
  from `list` (log it as `online:false`, do not infer death).
- **Headless image** (`UNI_CAM=0`) means the Producer holds the only other RCON socket and only for `tps`
  (`producer.ex:154,311-313`) — the collector's separate socket is safe.
- **Block-id/biome check:** verify oak vs spruce/birch on the first manual poll (seed 8675309 biome) and
  extend §2c objectives to the species the body actually mines; criterion ids must match exactly or the
  counter silently stays 0.
- **`clear … 0` non-destructive assumption** must be confirmed once on 1.16.5 before trusting in-loop; if it
  ever removes items, fall back to per-slot `data get entity <player> SelectedItem`/inventory iteration for
  the inventory snapshot and keep using the scoreboard objectives for cumulative activity.
- **Reconnect, never crash** on RCON/probe error; a gap row (`*_ok:false`) preserves the cadence
  (mirror `producer.ex:321`).
- **Node sname / cookie**: cookie is `:sp` (`probe:9`); confirm the live colony node's sname before the
  first probe (`unicur@<hostname>` is the documented curiosity-lineage launcher form, `probe:3`).
