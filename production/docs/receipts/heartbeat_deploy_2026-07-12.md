# Receipt — Phase XI: observability heartbeat deployed + first row proven

**Status: heartbeat deployed, enabled (boot-persistent), and writing valid ledger rows.** Full
alert-fire closure (G-OBS → corroborated) still needs an operator-supplied `UNI_NOTIFY_URL`.

Node `uni-lab-79740c`. Installed `production/scripts/{heartbeat,notify,colony_gate}.sh` →
`/opt/uni/production/scripts/` (executable), `uni-heartbeat.{service,timer}` →
`/etc/systemd/system/`, `systemctl enable --now uni-heartbeat.timer` (symlink in
`timers.target.wants` — fires every 60s + `OnBootSec=60s`). All via the uni-lab MCP, approval-gated.

## First row (captured — `/var/lib/uni/broadcast/audit/heartbeat.ndjson`)

```json
{"ts":"2026-07-12T00:27:25Z","p1_gate_pass":true,"p1_gate_rc":0,"relay_program_ready":"false",
 "colony_reachable":false,"colony_summary":"","colony_gate_pass":false,"colony_gate_rc":127,"fails":2}
```

- **`p1_gate_pass: true`** — the load-bearing signal works: the heartbeat re-ran `verify_p1.sh`
  (throwaway container, exit 0) and confirmed the platform is genuinely up — not from process
  existence (CLAUDE.md method rule 1). A future platform regression will flip this to false.
- `relay_program_ready: "false"` — **honest idle state** (nothing broadcasting; the relay has no
  program). Correct per docs/STUDIO_SYSTEMS.md. Counted in `fails` but it is an expected-idle
  condition, not a platform fault.
- `colony_reachable: false`, `colony_gate_rc: 127` — colony source is down (forage RED WITHHELD),
  and `verify_colony.cjs`/node are not present on the broadcast node (rc 127). Honest degradation.
- **notify path wired**: `notify.sh` no-ops without `UNI_NOTIFY_URL` but logged exactly what it
  would have sent (`/run/uni-heartbeat.err.log`): `[heartbeat] 2 check(s) failed ... (p1_pass=true
  relay_ready=false colony_gate_pass=false)`. The system `python3` is present and parsed the relay
  JSON (no jq/venv dependency needed).

## To fully close G-OBS (operator + one small follow-up)

1. **`UNI_NOTIFY_URL`** in `/etc/uni/runtime.env` (a webhook the operator watches). Then the plan's
   Phase XI gate can be captured: `systemctl stop uni-bcast-relay` → within 60s the next tick logs a
   real failure and POSTs the webhook → `systemctl start uni-bcast-relay` → next tick clears.
2. **Idle-vs-live cadence / relay-not-ready semantics** (known TODO in `heartbeat.sh`): during idle,
   `relay_program_ready=false` is expected, so it should not count as a fault when no broadcast is
   active. Until refined, idle rows honestly read `fails:2`; this is design noise, not a platform
   alarm (`p1_gate_pass` is the true health signal).
3. **colony_gate on-node**: ship `viewer/verify_colony.cjs` + a node runtime, or point the heartbeat
   at the colony `/producer/health` over WireGuard, so the colony-size gate can actually run here.

The durable artifact is the committed `production/scripts/heartbeat.sh` + the running timer; this
receipt is its first captured row.
