# Runbook — UNI Minecraft Colony Live Stream

> **STATUS (2026-07-11): SYSTEM 1 (v1 dev studio) doc — interim/dev only.** Read
> **[STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) FIRST**; it overrides on conflict. Production
> broadcasting = System 2 (`production/`).
>
> **⚠️ ARCHITECTURE CORRECTION (2026-07-12, owner-set):** the **COLONY** (world + FEP brain + `body.js` bots)
> runs on **UNI-LAB (`10.190.245.122`), rootless, "on the chip" — ALWAYS, never on THINKER**; THINKER is the
> **portable render/studio** that CAPTURES it over the LAN; node2 = **relay ONLY**. Any "colony on THINKER" /
> local `paper.jar` bring-up in this runbook is STALE. Canonical: `CLAUDE.md`,
> [ADR-PROD-013](../production/docs/adr/ADR-PROD-013-colony-host-placement.md), `docs/UNIVERSE.md`.

How to bring the live colony + YouTube stream back up, and the gotchas that cost us hours.
Machine: `Thinker` (Windows). Last verified: 2026-05-31.

---

## TL;DR — start sequence

Three things to start, in order. **Everything runs in ONE Elixir node** (see the critical gotcha below).

```powershell
# 1) Minecraft server (wait for "Done (Ns)!")
cd C:\Users\mpolz\Documents\Strings\mcserver
java -jar paper.jar nogui

# 2) Colony + Phoenix UI — ONE unified, distributed node (wait for :4000)
cd C:\Users\mpolz\Documents\Strings\ui
iex --sname uni --cookie sp -S mix phx.server

# 3) Start the show — open the stream page (this auto-starts the Producer),
#    or trigger it over RPC:
#    elixir --sname trig --cookie sp runs\trigger.exs
start http://localhost:4000/stream
```

Then launch OBS (profile **UNI**, scene collection **UNI**) and Start Streaming.

---

## ⚠️ CRITICAL GOTCHA #1 — ONE node only

Run the whole show in the Phoenix node: `iex -S mix phx.server`. Loading `/stream`
calls `SP.Producer.ensure_started()` (see `ui/lib/sp_ui_web/live/stream_live.ex`),
which starts the Producer → the single Director → the colony, all in that node.

**DO NOT also run `mix producer.run` in a second terminal.** Two nodes each spawn their
own Director; they fight over camera port `:3020` and the `"Director"` Minecraft login
("logged in from another location"), cascading into a crash loop that looks like
*"only 1 UNI / flapping / white video."* This single mistake caused most of the pain.

---

## ⚠️ CRITICAL GOTCHA #2 — OBS dual-GPU browser source

This box has two GPUs (`NVIDIA T1000` + `Intel UHD 630`). The OBS **browser source**
that renders the WebGL camera page behaves badly:

- `BrowserHWAccel=true` → browser source crashes `STATUS_BREAKPOINT` → **white** screen.
- `BrowserHWAccel=false` (current setting) → no crash, but software WebGL renders the UNI
  *entities* yet **cannot stream the terrain chunks** → broadcast shows blue/empty ground
  while a real Chrome on `:3020` renders the full forest.

`BrowserHWAccel` lives in `%APPDATA%\obs-studio\global.ini` under `[General]`.
**Robust fix for full terrain on the broadcast:** window-capture a real (hardware-accelerated)
Chrome window pointed at `http://localhost:3020` instead of using OBS's browser source.

---

## Key facts / coordinates

| Thing | Value |
|---|---|
| Elixir node | `uni@Thinker` · cookie `sp` (hostname is capital-T `Thinker`) |
| Minecraft | `localhost:25565` · survival · `spawn-protection=0` |
| RCON | `:25575` · password `sp` |
| Good forest seed | **`8675309`** (inland; ocean ~1280 blocks away). Set as `level-seed` in `mcserver/server.properties`. |
| Phoenix `/stream` | `http://localhost:4000/stream` |
| Director camera (prismarine-viewer) | `http://localhost:3020` |
| OBS websocket | `127.0.0.1:4455` · no auth |
| Brains (per UNI) | `runs/colony/UNI-<kin>-<n>.bin` — delete all to start fresh |
| World backups | `mcserver/uni_world.bak.<timestamp>` |

---

## Reset the world (fresh forest)

1. Stop MC (`node viewer/rcon.cjs "stop"` or kill `java paper.jar`).
2. Remove/rename `mcserver/uni_world`, `uni_world_nether`, `uni_world_the_end`.
3. Set `level-seed=8675309` in `mcserver/server.properties` (verified-good inland forest).
4. (Optional fresh brains) delete `runs/colony/*.bin`.
5. Start MC; it regenerates. **Verify it's inland** before trusting it:
   `node viewer/rcon.cjs "locatebiome minecraft:ocean"` → want it FAR (>300 blocks).
   A random seed can land you in a coastal/ocean archipelago (kelp + water = looks "mined out").

---

## Populate / manage the colony

- The Producer auto-maintains population in **[3, 6]**.
- Manual spawn (RPC): `SP.Brain.Colony.spawn_agent(kin, "see_all")` where `kin` ∈ 0..9.
- `runs/trigger.exs` does `ensure_started` + spawns a few.

---

## Verify it's healthy (and that they can BUILD)

```powershell
# Per-UNI inventory + senses. GOOD = look=oak_leaves/grass/dirt, tree=1/2/3, wood climbing.
# BAD  = look=bedrock, tree=0, wood=0  (they dug to the bottom — reset/relocate).
elixir --sname diag --cookie sp runs\diag_build.exs

# What OBS is compositing (PNG):
node viewer\obs_shot.cjs "UNI Show" check.png

# Stream health: want outputActive:true, outputBytes climbing, 0 congestion/skipped.
node viewer\obs_ctl.cjs GetStreamStatus
```

The build chain (body.js `doCraft`/`doPlace`): mine wood → planks → crafting table → place →
sticks → wooden tool (phase-2 unlock) → place blocks for shelter (phase-4). It only works if
they're on a **forested surface with reachable trees** — that was the whole "can't build" issue
(they had dug to bedrock with no wood).

---

## Helper scripts (created this session)

- `viewer/rcon.cjs "<cmd>"` — one RCON command (e.g. `locatebiome`, `tp`, `save-all`, `stop`).
- `viewer/obs_ctl.cjs <StartStream|StopStream|GetStreamStatus>` — OBS via websocket.
- `viewer/obs_shot.cjs "<source>" <out.png>` — screenshot what OBS composites.
- `viewer/obs_req.cjs <request.json> [out.png]` — arbitrary obs-websocket v5 request.
- `runs/diag_build.exs`, `runs/trigger.exs`, `runs/boot_verify.exs` — colony RPC helpers.
  (Run Elixir helpers as `elixir --sname X --cookie sp runs\<file>.exs`.)

---

## Graceful shutdown

```powershell
# 1) End the broadcast
node viewer\obs_ctl.cjs StopStream

# 2) Save + stop Minecraft (preserves the world)
node viewer\rcon.cjs "save-all flush"
node viewer\rcon.cjs "stop"

# 3) Stop the colony node cleanly (saves brains via terminate), then kill leftover body/director
#    In the iex window: Ctrl-C twice.  Or over RPC: :rpc.call(:"uni@Thinker", :init, :stop, [])
#    Then: kill any remaining node.exe whose command line matches Strings\viewer\(body|director).js

# 4) Close OBS (it saves config on a normal close)
```

Leave alone: the `produce-uni-shorts-batch.mjs` render (separate project) and unrelated `node`/MCP processes.

---

## Fixes applied (branch `gen2-runtime`)

- `015a522` — `agent.ex` guards `Port.command` when a body dies mid-tick (no crash loop);
  `director.js` closes the prismarine-viewer + clears intervals on reconnect (no `EADDRINUSE`).
- `b693d6c` — `director.js` tighter, down-tilted camera shots (less sky, terrain stays loaded).
- `6d0ba66` — docs (WorldSim build/proof plan).
