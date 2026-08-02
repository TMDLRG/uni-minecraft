# OS Spool Policy — one supervised sole writer per spool (D-A2)

**Status:** Proposed. Authored by the UNI OS+MIND Deepening Plan (workstream D-A2).
**Binding:** yes, once landed. No new `/var/lib/uni/**` spool ships without a supervised sole writer entry here.
**Rule of origin:** `lib/sp/show/overlay_publisher.ex:22-105` is the canonical model — atomic `tmp+rename`, torn-read tolerance, single supervised writer, no shared file descriptor.

---

## Why

Multiple writers to the same file on Windows/Linux is a race whose worst manifestation on 2026-07-12 was an EPERM crash of the whole BROADCAST TEST from a rename-over-open-file collision. The plan (D-A2, D-A3) generalizes the sole-writer discipline to EVERY OS spool. This doc is the ledger.

## The spool ledger

### `viewer/runtime/broadcast.json` (overlay spool)

- **Sole writer:** `SP.Show.OverlayPublisher` (`lib/sp/show/overlay_publisher.ex`).
- **Supervisor:** `SP.Show.Supervisor` (`lib/sp/show/supervisor.ex`).
- **Contract:** 2s tick, atomic tmp+rename, torn-read tolerance for readers.
- **Readers:** `overlay_server.cjs`, `command_center.cjs` (planned to read via `POST /overlay/update` per D-A3).
- **Two-writer risk (documented):** `viewer/command_center.cjs` currently writes directly. D-A3 kills this via `SPEC_command_center_overlay_update.md` — **with one named, temporary, audited exception:** `command_center.cjs`'s HTTP client falls back to its OLD direct-file write ONLY if all three `POST /overlay/update` retries fail AND `PROC.env.UNI_OVERLAY_FALLBACK == "1"`. While that flag is set and that fallback fires, the two-writer race this row exists to eliminate is genuinely re-opened, not merely "documented" — see `SPEC_command_center_overlay_update.md`'s "FALSIFIES" section for the exact observable condition. No test in either spec exercises the fallback path itself, and "temporary" has no expiry ticket or removal criterion named yet; both are open, not silently resolved.

### `/var/lib/uni/broadcast/audit/heartbeat.ndjson` (mesh heartbeat)

- **Sole writer:** `production/scripts/heartbeat.sh` (via `uni-heartbeat.timer`).
- **Cadence:** 60s (v1). Idle/live split coming in v2 (`heartbeat.sh.v2`, D-C4).
- **Contract:** append-only NDJSON; each line a row conforming to `production/schemas/sensorium_envelope.schema.json`.
- **Readers:** `production/overlays/status/index.html` (visualizer), `SP.Runtime.LogSensor` (planned per D-A4), any peer's fleet aggregator (D-C1).
- **Torn-line tolerance:** required. Readers MUST skip the last line if it does not end in `\n`.

### `/var/lib/uni/broadcast/audit/prod-mcp.ndjson` (MCP audit ledger)

- **Sub-scoped sole writer, by row kind (two disjoint writers on one file — see `SPEC_fence_override_forwarding.md` § "Reconciling the two writers" for the full justification and the concurrency-safety condition this rests on):**
  - `production/mcp/server.py`'s `_AUDIT`/`_LocalAudit` (`production/mcp/server.py:124-156`) — sole writer for every row EXCEPT `kind == "event"` rows where `payload.action == "fence_override"`. This is every MCP-tool-call audit row (`cut_to`, `set_music_volume`, `narrate`, `set_overlay`, `panic`, `open_session`, `close_session`, `command`, `remove_guest`, `admit_guest`, `schedule`, `start_broadcast`, `stop_broadcast`).
  - `SP.Audit.Writer` (`lib/sp/audit/writer.ex`, NEW — D-B3, `production/mcp/SPEC_fence_override_forwarding.md`) — sole writer for `kind == "event"` rows where `payload.action == "fence_override"` ONLY, called from the Phoenix `POST /audit/fence_override` handler and nowhere else.
  - **Why this is not a sole-writer-per-spool violation:** each writer's row-kind is disjoint and each writer performs exactly one `write()`/append syscall per row (POSIX `O_APPEND` makes that syscall atomic against the other writer), so the two cannot interleave a torn line even though they share one file. A prior version of this ledger entry named both writers without this reconciliation — corrected 2026-07-12.
  - **Row-shape honesty (WHO writes WHEN is resolved; WHAT SHAPE existing rows already carry is NOT):** `server.py`'s pre-existing rows are a FLAT shape (`{event, ...fields, audit_id, server, ts}`, no `schema_version`/`kind`/`payload`/`provenance` nesting) that does not satisfy `sensorium_envelope.schema.json`'s `required` + `additionalProperties: false` contract; `SP.Audit.Writer`'s new rows ARE correctly nested per that schema. This file today carries two structurally different row shapes. See `SPEC_fence_override_forwarding.md`'s "Reconciling the two writers" § "Row-shape honesty" for the full citation — named here rather than left implied-resolved by the ownership-split language above.
- **Contract:** append-only NDJSON, one row per mutating MCP call + one row per fence override.
- **Readers:** operator, red-team (internal only). **No public-MCP reader of this file exists today** — a prior version of this entry named `get_evidence_bundle`, but no tool of that name exists anywhere in this repo (grep-confirmed); `SPEC_uni_public_mcp.md`'s only bundle-shaped tool is `read_evidence_bundle(bundle_sha)`, which is scoped to a whitelist of pre-built files under `docs/receipts/` + `production/docs/receipts/` and explicitly "Refuses arbitrary paths" — it has no path to streaming this raw ndjson file. Corrected 2026-07-12 per this project's honesty rail (a stale/aspirational reader claim reads as PENDING, not asserted as real). If a public-facing proxy over this file is ever built, it MUST carry its own reviewed field-level allowlist — see `SPEC_fence_override_forwarding.md`'s "Field-level allowlist for any future public reader" section — not inherit raw row access by default.

### `/var/lib/uni/status/program.jpg` + `program.json` (program preview)

- **Sole writer:** `production/scripts/programshot.py` (runs every ~2s).
- **Contract:** atomic write to `.tmp` + rename. Never a partial JPEG on disk.
- **Readers:** `production/overlays/status/index.html`, any external panel.

### `/var/lib/uni/status/fleet_status.ndjson` (mesh liveness — D-C1)

- **Sole writer:** `production/scripts/heartbeat.sh.v2` (this one gathers peer heartbeats).
- **Contract:** append-only NDJSON. One row per collection tick.
- **Readers:** OS-side MCP router (for D-C2 stale-limb refusal), MineCraft agent's observability panel.

### `/var/lib/uni/backups/colony/YYYYMMDD/` (colony archive — D-D1)

- **Sole writer:** `production/scripts/colony_archive.sh` (via `uni-colony-archive.timer`, daily 03:30 UTC).
- **Contents:** dated subdir per day; each contains the MC world snapshot + kin `.bin` files + `manifest.sha256`.
- **Readers:** DR flow (`production/docs/RUNBOOK_DR.md`), retention rotator (D-D2).

## Adding a new spool

1. Draft a schema for the row (or reuse `sensorium_envelope.schema.json` payload extension).
2. Author the sole writer as a supervised OTP process (Elixir) OR a systemd-timer'd shell script.
3. Add an entry to this ledger BEFORE the spool starts being written.
4. Add a readers list.
5. Land the change through `/lab-team-review`.

## Enforcement

- The spool-policy integrity test at `test/os_spool_policy_test.exs` (scaffold, D-A2 follow-up) will grep the writer path for a matching entry here and refuse if a new writer surface appears without a ledger entry.
- New writers to a spool with an existing sole-writer entry get REJECTED at review.

## Coordination with the observability layer's `Field<T>`

The UNI MineCraft (colony/infra) agent's live-infra surface at `viewer/infra.cjs` + `/api/infra` uses a per-field wrapper `Field<T>` defined at `viewer/infra.cjs:18`:

```js
const F = (value, source, state, detail) => ({ value, source, readAt: now(), state, detail: detail || "" });
// state ∈ { "fresh" | "stale" | "unreachable" | "denied" | "not_verified" }
```

That shape and this policy are **complementary**, not conflicting:

- **`Field<T>`** is a *per-field LIVE-READ* wrapper. It answers "what did we just probe, from where, when, and with what honesty state." It composes MANY probe results into ONE observability response body. It has no schema versioning and no on-disk contract — it is a wire shape.
- **`sensorium_envelope.schema.json`** (this workstream) is a *per-row SPOOL-WRITE* envelope. It answers "what row landed on disk, at what timestamp, from which supervised sole writer, with what provenance." It is versioned and file-persisted.

**How the two compose:**

- A supervised sole writer (this policy) publishes rows conforming to `sensorium_envelope.schema.json`.
- The observability layer (`viewer/infra.cjs`) READS those rows (or probes directly) and re-wraps individual fields into `Field<T>` for the panel's per-field honesty rendering (fresh/stale/unreachable/denied/not_verified).
- The MineCraft agent will conform `viewer/infra.cjs` fields to `sensorium_envelope.schema.json` provenance where possible in a follow-up. The `Field<T>` state vocabulary maps naturally onto `evidence_class`:
  - `fresh` → `C` (command-output, just-observed)
  - `stale` → `pending` (was C, TTL expired)
  - `unreachable` → `pending` (probe failed)
  - `denied` → `Sec` (approvals-gated read refused)
  - `not_verified` → `pending` (registry-declared, no live probe yet)

**Nothing in either surface is a duplicate writer to the same file.** The observability layer never writes to any `/var/lib/uni/**` spool listed above — it reads them.

**Cross-reference:** `viewer/infra_registry.json` (in the MineCraft agent's `eb0ba24`) is the declared name/service map their observability layer diffs against. Read it before adding a new writer that would surface in any `Field<T>`.
