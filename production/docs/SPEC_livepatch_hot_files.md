# SPEC — `livepatch_apply` hot-files guard (C-C4c)

**Status:** SPEC. Written by the UNI OS+MIND Deepening Plan for the OS-side to consume.
**Ship gate:** OS-side implementation is out-of-repo (uni-lab MCP router); this spec is the contract.

---

## Purpose

`livepatch_apply` (uni-lab MCP verb) patches a running function in the BEAM without restarting the process. That is safe for pure-function replacement, but NOT safe if the patched function is mid-write to a **hot file** — a file whose atomic tmp+rename semantics the caller depends on. This spec names those files and defines the guard.

## Hot files (as of this SPEC)

- `viewer/runtime/broadcast.json` — sole writer `SP.Show.OverlayPublisher.publish/1` (`lib/sp/show/overlay_publisher.ex:22-105`).
- `runs/colony/kin-*.bin` — sole writer `SP.Brain.MC.save/2` (`lib/sp/brain/mc.ex:552-554`), called inline from `SP.Runtime.Agent`'s save-every ticks (`lib/sp/runtime/agent.ex:185,259,318`), Port-exit/death branches (`:195,251,310`), and `terminate/2` (`:357-358`).
- `/var/lib/uni/broadcast/audit/heartbeat.ndjson` — sole writer `production/scripts/heartbeat.sh`.
- `/var/lib/uni/broadcast/audit/prod-mcp.ndjson` — sole writer `production/mcp/server.py`.

## Guard contract

Before applying a live-patch, the router:

1. Reads `production/docs/SPEC_livepatch_hot_files.md` (this file) OR a machine-readable mirror at `production/schemas/hot_files.json` (queued as a follow-up in the plan).
2. For each hot-file entry:
   a. Inspects the target BEAM node for the writer PID (matches the described module/function).
   b. Sends a `hot_write?` message to the writer (or checks a supervised registry key). If any writer replies "mid-write" or fails to reply within 200ms, ABORT the livepatch.
3. Only if all writers report "idle" does the patch proceed.

## Behaviour on ABORT

- The router returns an envelope with `refused: true, result: {reason: "hot-file write in flight", writer_module: "SP.Show.OverlayPublisher"}`.
- The caller can retry after the writer's next quiet window (typically < 3s per `overlay_publisher.ex` 2s tick).

## Test coverage the plan owes

- `runs/red_team_livepatch_hot_files.exs` — inject a mid-write signal into `SP.Show.OverlayPublisher`, attempt livepatch, expect ABORT with the correct envelope.
- Positive path: injected idle, livepatch proceeds, no torn write observed on `broadcast.json`.

## Non-goals

- This SPEC does NOT define the livepatch mechanism itself (it lives OS-side).
- This SPEC does NOT prohibit livepatches of pure-function modules (e.g. `SP.Brain.Math`). Only patches touching writers of hot files gate.

## Cross-references

- `production/docs/SPEC_mc_codec_versioning.md` — protects the `.bin` files against version drift.
- `production/mcp/SPEC_lineage_snapshot.md` — a manual-trigger `Lineage.snapshot/1` that READS this file's `runs/colony/kin-*.bin` hot-file entry (above). It does **not** introduce a new hot file and does **not** increment the hot-file class — it is a reader, not a writer, of an already-listed file (see that SPEC's "Hot-file interaction" section).
