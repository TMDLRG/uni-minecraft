# RUNBOOK: PANIC (emergency stop) -- read this in the first 10 seconds of an incident

**Status:** design/reference, `pending` (authored, not yet rehearsed on the deployed node). Closes
GAP G-STOP alongside `production/scripts/panic.sh` + the `panic` MCP verb
(`production/mcp/server.py`, `IN_SHOW_VERBS` tier). A rehearsal receipt goes at
`production/docs/receipts/panic_rehearsal_<date>.md` once this has actually been run against the
live system (Phase XII gate).

Three named actions. Each is completable by a trained operator in under 10 seconds once
memorized. Do not read this whole file mid-incident -- go straight to the numbered action.

---

## 1. CUT-TO-STANDBY-AND-STOP (the primary action)

**From an operator shell with `UNI_PROD_MCP_URL` and `UNI_PROD_MCP_TOKEN` set:**

```sh
production/scripts/panic.sh "<short reason>"
```

This calls the `panic` MCP tool, which (in one session-authed call, same tier as `cut_to` --
**no** second approval hop, because speed matters more once something is already going wrong):
1. Cuts the OBS program scene to `STANDBY`.
2. Stops the stream output (`StopStream` over obs-websocket) -- the relay/overlays containers
   keep running, so a resumed mixer comes back cleanly without redeploying anything.
3. Ducks the music bed to -24 dB.
4. Flips the overlay on-air indicator to `STANDBY`.

The script prints the full response envelope and appends a **local** timestamped line to
`./panic.local.log` (override with `OUT=`) -- this is a convenience note for the operator, not the
receipt of record.

**Receipt of record:** the `audit_id` in the returned envelope (server-side, append-only ledger at
`UNI_PROD_MCP_AUDIT`, default `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`, `event:"panic"`).
Write that `audit_id` down (or screenshot it) for the post-incident review.

### Fallback path (MCP unreachable) -- DEGRADED, not the primary action

If `panic.sh` cannot reach the MCP (network/service down), SSH to the node and run:

```sh
systemctl stop uni-bcast-mixer
```

This drops the program **entirely** (no STANDBY card, no output at all) rather than parking on
STANDBY -- it is the degraded fallback, never the first choice, because it takes the feed to black
instead of a controlled card. The relay + overlays containers keep running, so a restarted mixer
resumes cleanly once the underlying issue is fixed.

**Receipt of record (fallback path):** the systemd journal line for the stop
(`journalctl -u uni-bcast-mixer --since "-2min"`), because there is no MCP audit row on this path.

---

## 2. VERIFY

Open the unlisted/private stream URL, or the local status page at `:8099/status/` once that
surface lands (Pillar / Phase XI observability), and **visually confirm** the program shows
`STANDBY` -- not the prior content, and not black. If the fallback path was used, confirm black is
expected (mixer stopped) and note that explicitly in the receipt -- do not mistake it for STANDBY.

---

## 3. RECOVER (deliberately manual -- a human judgment call, never automatic)

Once the underlying issue is fixed, resume with **one** of:

- **Producer queue (preferred, if the producer daemon is running):** send
  `{"cmd":"resume","atBeat":"..."}` via the producer's queue mechanism.
- **Manual rebuild (if the producer is not running, or after the fallback path):**
  ```sh
  python -m production.mixer.build_scenes
  # then, via an MCP client with an open operator session:
  #   cut_to COLONY   (or whichever scene is appropriate for the resumed beat)
  ```

Resuming a broadcast is a judgment call about whether the incident is actually resolved --
this step is intentionally NOT automated.

---

## Receipts checklist (for the post-incident review)

| What happened | Receipt |
|---|---|
| `panic.sh` / `panic` MCP verb used | the `audit_id` from the returned envelope |
| Fallback `systemctl stop uni-bcast-mixer` used | the journalctl line for that stop |
| VERIFY step | what the stream/status page showed, and when |
| RECOVER step | the beat/scene resumed to, and who (human) decided to resume |

Post-incident, file the rehearsal/incident record at
`production/docs/receipts/panic_rehearsal_<date>.md` (or `incident_<date>.md` for a real event).
