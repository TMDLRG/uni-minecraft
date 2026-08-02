# SPEC — `uni_housekeeping_status` MCP verb (E-E5)

**Status:** SPEC. Read-only. Awaits `/lab-team-review`.
**Ship gate:** MERGED VERDICT.

---

## Purpose

Aggregate the on-chip housekeeping signals into ONE honest read that the public MCP can serve, so a stranger — and the MineCraft agent's observability panel — can see whether UNI is well-kept.

## Signature

```python
@mcp.tool()
def uni_housekeeping_status() -> dict:
    """Read-only, evidence class C. No approvals."""
```

## Result shape (result payload; envelope per D-B2)

```json
{
  "last_daily_backup": {
    "ok": true,
    "utc": "2026-07-13T04:00:00Z",
    "manifest_sha256": "…"
  },
  "last_colony_snapshot": {
    "ok": true,
    "utc": "2026-07-13T03:30:00Z",
    "dest": "/var/lib/uni/backups/colony/20260713/0330",
    "manifest_sha256": "…"
  },
  "kin_memory": {
    "count": 12,
    "total_bytes": 45678901,
    "oldest_utc": "2026-06-25T00:00:00Z",
    "newest_utc": "2026-07-13T…"
  },
  "colony_gate": {
    "rcon_players": 6,
    "colony_count": 5,
    "director_present": true,
    "verdict": "PASS"
  },
  "disk_free_var_lib_uni": {
    "bytes_free": 12345678901,
    "bytes_total": 98765432100,
    "warn_threshold_hit": false
  },
  "next_scheduled_archive": {
    "utc": "2026-07-14T03:30:00Z",
    "unit": "uni-colony-archive.timer"
  },
  "generated_at": "2026-07-13T…"
}
```

## Sources

- `last_daily_backup`: read latest date under `/var/lib/uni/backups/` + its `manifest.sha256`.
- `last_colony_snapshot`: read latest date under `/var/lib/uni/backups/colony/` + its `manifest.sha256`.
- `kin_memory`: `ls` the kin `.bin` files, count/size/mtime.
- `colony_gate`: shell out to `node viewer/verify_colony.cjs $COLONY_HOST` and parse.
- `disk_free_var_lib_uni`: `statvfs` on `/var/lib/uni`. Warn threshold: 10% free.
- `next_scheduled_archive`: `systemctl list-timers uni-colony-archive.timer --output=json`.

## Non-goals

- Does not expose secrets, kin memory contents, or per-tick brain state.
- Does not include an operator token check — it is read-only + public-safe.

## Public exposure

Proxied by `uni-public-mcp` (E-E1) with unlimited rate on the operator MCP + 1 req / 30s per source on the public MCP.
