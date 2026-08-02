# L3 (control-plane scheduled task) + L4 (remote-node cross-box vantage)

> Phase-2 RED collector defense-in-depth, layers 3 and 4. Layers 1 (rootless
> `uni` systemd user-timer) and 2 (podman quadlet sidecar) live ON the colony
> box. Layers 3 and 4 live OFF it, so a whole-box failure is still observed.
> Full design + JSONL schema + reconciliation rule: `docs/specs/collector.md`.
>
> CLAIMFENCE: every layer measures BEHAVIOUR (server-authoritative RCON counters)
> and MECHANISM (brain-internal floats). Zero experiential weight. A passing gate
> demonstrates the named behaviour, never experience. Nothing here mutates the
> colony — all four layers are read-only.

---

## Why four layers (the P1 lesson)

The P1 bash collector died at ~100 min because it lived inside the LLM session:
when the session compacted/ended, the collector died with it, silently. The
Phase-2 RED (≥6 UNIs per arm, multi-hour to multi-day) cannot tolerate that.
**Redundant independent collectors mean a single death is itself a visible
signal** (a heartbeat gap from one layer while the others keep writing), not a
silent loss of the whole record. No single point of failure owns the cadence.

| Layer | Where it runs | Independent of | Cadence owner | Heartbeat id |
|---|---|---|---|---|
| L1 | `uni` systemd **user timer** on colony box | LLM session, SSH, repo edits | `systemd --user` timer | `L1-systemd@colony` |
| L2 | podman **sidecar container** on `uni-colony-net` | host user session, repo checkout | in-container `while sleep` + `Restart=always` | `L2-sidecar@uni-colony-net` |
| L3 | **control-plane scheduled task** (this harness) | the colony box ENTIRELY | harness cron | `L3-harness@control` |
| L4 | **remote mesh node `uni-lab-79740c` (10.13.13.3)** | the colony box AND the control plane | remote-node timer | `L4-remote@uni-lab-79740c` |

---

## L3 — control-plane scheduled task

A scheduled task on the control plane (this harness machine) that, every 10 min,
reaches the colony from OUTSIDE and runs the same read-only probe. Because it
runs off-box, it survives a colony-box reboot loop, a rootless-podman wedge, or a
systemd-user-session loss — and its heartbeat gap is the signal for exactly those
failures.

### What it does each fire (read-only)

1. **RCON behaviour (off-box):** open Source-RCON to the colony's RCON endpoint
   and read the scoreboard + inventory exactly as `collect.exs` does. From the
   control plane the host is the colony box's reachable address, not the
   in-network container name:
   - host = `10.190.245.122` (or the WireGuard address), **port `25575`**
     (`server.properties:4`; gameplay is `25565` — do NOT use it), password `sp`
     (`server.properties:35`). The RCON port must be reachable from the control
     plane (SSH local-forward `-L 25575:mc-server:25575` if it is not published).
2. **BEAM mechanism (off-box):** attach distributed Erlang with cookie `:sp` to
   the RED node (via the same forward / mesh route) and run the
   `Registry.lookup` + `:sys.get_state` probe (`runs/probe_curiosity.exs:30-34`).
   If distributed Erlang is not routable from the control plane, L3 runs RCON-only
   and records `probe_ok=false` with `error:"node_unreachable_offbox"` — the RCON
   arm alone still gives the server-authoritative R1 metric, and L1/L2 carry the
   mechanism arm.
3. **Write** one JSONL line per arm per UNI to the control-plane evidence path
   with `collector_id = L3-harness@control`, plus a heartbeat line.

### How to register it (this harness)

Use the harness scheduled-task facility (the `schedule` / scheduled-tasks tool).
Register a task with:

- **Cadence:** every 10 minutes, anchored to the wall-clock 10-min boundary so it
  reconciles with L1/L2/L4 (`cycle` window).
- **Command (run from a checkout of this repo on the control plane):**
  ```sh
  COLLECTOR_ID=L3-harness@control \
  SP_NODE=unicur@<red-node-or-forwarded-host> \
  MC_HOST=127.0.0.1 RCON_PORT=25575 RCON_PASS=sp \
  ARMS=treatment:10,control:11 N_PER_ARM=6 \
  OUT_DIR=$HOME/.claude-evidence/phase2-l3 \
  elixir --sname uc_l3 --cookie sp -S mix run --no-start ops/phase2_collector/collect.exs
  ```
  (When using an SSH local-forward, `MC_HOST=127.0.0.1` points at the forwarded
  RCON port; `SP_NODE` points at the forwarded EPMD/dist route or is left
  RCON-only as above.)
- **Owner go-ahead:** the task is REGISTERED but the live-stream guard applies —
  the owner approves before it points at the public-streamed colony.

### Approval / deploy steps (left for owner go-ahead)

1. Owner confirms the RED is deployed and the arm kins (`ARMS`) are correct.
2. Owner approves opening the RCON route (forward or firewall) from the control
   plane to the colony box.
3. Register the scheduled task (above). Verify the first fire writes a heartbeat
   AND ≥1 data row per arm before trusting the cadence.
4. Record the task id + first-heartbeat timestamp in the RED's evidence log.

---

## L4 — remote mesh node `uni-lab-79740c` (10.13.13.3) as an independent vantage

The second mesh node is a SEPARATE physical box reachable through the `uni-lab`
MCP one-platform mesh (`limbs_list()` → add `limb=<id>` to any tool). It runs the
same MCP instrument, so it can host an independent collector that watches the
colony box across the network — independent of BOTH the colony box (L1/L2) and
the control plane (L3). If the colony box AND the control plane both go dark, L4
is the witness that records the gap.

### What L4 provides

- **A cross-box heartbeat-of-heartbeats.** L4's primary job is to **watch the
  other collectors' liveness**, not just re-collect: it reads the colony's
  evidence (the L1 `OUT_DIR` and/or the L2 volume) over the mesh and asserts that
  L1 and L2 have written a heartbeat within the last `2 × interval` (20 min). A
  missing L1/L2 heartbeat → L4 records a `collector_down` event for that layer.
- **An independent data collector** (optional, recommended): L4 also runs
  `collect.exs` itself against the colony's RCON + RED node over the mesh route,
  with `collector_id = L4-remote@uni-lab-79740c`, so even a total colony-box-plus-
  control-plane outage leaves L4's own rows + heartbeat as the surviving record.

### How to stand it up (read-only; owner go-ahead)

Via the `uni-lab` MCP, targeting the remote limb:

1. `limbs_list()` → confirm `uni-lab-79740c` (10.13.13.3) is reachable.
2. Place `collect.exs` + a tiny watcher script on the remote node:
   `os_file_write(limb="uni-lab-79740c", path=..., ...)` (mutating → approval).
3. Install a remote systemd **user** timer there (same units as L1, with
   `COLLECTOR_ID=L4-remote@uni-lab-79740c` and the mesh route to the colony's
   RCON + RED node), via `os_file_write` + `os_systemctl_action(limb=...)`
   (each mutating call passes the shared approval queue — a human approves).
4. The watcher reads L1/L2 heartbeats over the mesh (`os_file_read` /
   `podman_logs` against the colony limb) and appends `collector_down` events to
   L4's own evidence path when a layer's heartbeat is stale.

### Approval / deploy steps (left for owner go-ahead)

1. Owner approves the mesh route from `uni-lab-79740c` to the colony box's RCON
   (`25575`) and the RED BEAM node (or accepts RCON-only on L4).
2. Each `os_file_write` / `os_systemctl_action` / `podman_*` on the remote limb
   waits on a HUMAN approve in the shared approval queue (`approvals_pending()`).
3. Verify L4 writes (a) its own heartbeat and (b) the first `collector_down`
   check result before trusting it as a vantage.

---

## Liveness / death-signal summary (what a gap MEANS)

- **One layer's heartbeat gap, others writing** → that layer (or its host/route)
  died; the record is intact via the others. Investigate that layer; do NOT
  treat the RED as compromised.
- **L1 + L2 both gap, L3/L4 writing** → the colony BOX is in trouble (reboot
  loop, podman wedge) but the colony PROCESS may still be up (L3/L4 still reach
  RCON). Escalate to the owner.
- **L1 + L2 + L3 gap, L4 writing** → colony box AND control plane dark; L4 is the
  sole witness. Page the owner.
- **All four gap** → total outage; the LAST heartbeat from any layer bounds the
  time of death. (This is the failure mode the P1 single bash collector had with
  N=1 — defeated here by N=4 independent layers.)

The reconciler (`docs/specs/collector.md` → cross-collector reconciliation rule)
consumes all four evidence streams, dedupes by `(cycle, arm, uni)`, prefers the
server-authoritative RCON values, and flags any `(cycle, arm, uni)` where two
layers DISAGREE on an RCON counter as a `reconcile_conflict` for manual review.
