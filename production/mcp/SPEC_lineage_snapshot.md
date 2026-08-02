# SPEC — `SP.Runtime.Lineage.snapshot/1` (D-D3)

**Status:** SPEC. Touches `lib/sp/runtime/lineage.ex` only (FE-adjacent) — no change to `lib/sp/runtime/agent.ex` or `lib/sp/brain/mc.ex` in v1. Awaits `/lab-team-review`.
**Ship gate:** MERGED VERDICT required.
**Revision (2026-07-12):** re-scoped after an independent review (readiness: NEEDS_CLARIFICATION, medium risk) found four gaps between the original draft and the live repo — a claimed atomic-write primitive that doesn't exist, a claimed live-kin enumeration function that doesn't exist, a claimed heartbeat caller that doesn't exist, and a second-writer collision with an already-registered spool. All four are resolved below by re-scoping v1 to what real, composable primitives already support and naming the rest as explicit deferred work. See **"v1 Scope"**.

---

## Purpose

Kin memory files (`runs/colony/kin-*.bin`) are today saved only on a `save_every` tick and at process end, all via `SP.Brain.MC.save/2` (`lib/sp/brain/mc.ex:552-554`) called from inside `SP.Runtime.Agent`:
- the plain save-every tick, `lib/sp/runtime/agent.ex:185` (and the analogous metabolic/homeostatic save-every branches at `:259` and `:318`);
- the plain Port-exit handler, `lib/sp/runtime/agent.ex:195` (and the analogous metabolic/homeostatic death branches at `:251` and `:310`);
- `GenServer.terminate/2`, `lib/sp/runtime/agent.ex:358`.

If UNI-LAB's disk dies between saves, the whole learned Dirichlet history dies with it. The 2026-07-12 runaway cleanup archived 178 kin files ad-hoc; there was no scheduled snapshot mechanism. This spec adds one.

## v1 Scope (read this first)

1. **Atomicity — v1 is NOT atomic on the source side.** No atomic temp-file write primitive exists on `SP.Runtime.Agent` today — it exposes only `stats/1` (`lib/sp/runtime/agent.ex:87`, a `GenServer.call` diagnostics read); every real save goes through `MC.save/2`, a plain `File.write!/2` with no tmp+rename. v1 `snapshot/1` **reads the existing, already-on-disk `kin-*.bin` output of `MC.save/2` as-is** and accepts the small, documented risk of a torn read (see "Snapshot mechanics" step 3). A new `SP.Runtime.Agent` atomic-dump call is real, buildable follow-on work, not built in this pass.
2. **Live-kin enumeration — real, composable primitives, spelled out.** `SP.Runtime.Lineage`'s GenServer state has no agent-pid/username field, and `spawn_next/2` discards its `Supervisor.spawn_agent/1` return value (`lib/sp/runtime/lineage.ex:121-141`) — there is no ready-made "list my live kin" call. v1 composes real, existing functions instead: `SP.Runtime.Lineage.name/1` (registered-name pattern, `lib/sp/runtime/lineage.ex:72`) + `Process.whereis/1`, cross-referenced against `SP.Runtime.Supervisor.list_agents/0` (`lib/sp/runtime/supervisor.ex:85-89`). See "Snapshot mechanics" step 2 for the exact composition.
3. **Trigger — v1 is `:manual` only.** No heartbeat caller exists anywhere in the Elixir codebase (repo-wide, `lib/` has zero hits for "heartbeat"). The only heartbeat in the repo is `production/scripts/heartbeat.sh`, a 60-second systemd-timer **shell script**, not a BEAM process — and its own header marks it `status: pending (authored, not yet run on node hardware)`. Building a new Phoenix-endpoint bridge for a heartbeat mechanism that is not itself live yet is premature. v1 drops `:heartbeat_idle` / `:heartbeat_live` to a named Phase 2 (a BEAM-side heartbeat mechanism, or an HTTP bridge from `heartbeat.sh`, is a prerequisite not built in this pass).
4. **Output path — v1 writes ONLY under `runs/colony/snapshot/YYYYMMDD/HHMM/`.** `production/docs/OS_SPOOL_POLICY.md` already declares `/var/lib/uni/backups/colony/**` sole-writer `production/scripts/colony_archive.sh` (daily, 03:30 UTC) — see that doc's own "Why" section, which documents a real EPERM crash on 2026-07-12 caused by exactly this two-writer pattern. `snapshot/1` does not write into that tree in v1. A bind-mount-shared output path is a named, deferred prerequisite: it requires amending `OS_SPOOL_POLICY.md`'s ledger with a new registered writer entry for `snapshot/1` at the finer, sub-daily `HHMM` granularity it would add alongside `colony_archive.sh`'s own daily entry.

## Signature

```elixir
defmodule SP.Runtime.Lineage do
  @spec snapshot(opts :: keyword()) :: {:ok, snapshot_dir :: String.t()} | {:error, term()}
  def snapshot(opts \\ [])
end
```

## Behaviour

- `opts[:trigger]` — v1 supports `:manual` ONLY (default). Passing `:heartbeat_idle` or `:heartbeat_live` returns `{:error, {:unsupported_trigger, trigger}}` — those are reserved atoms for Phase 2 (see "v1 Scope" item 3), not silently treated as `:manual`.
- `opts[:idle_min_gap_s]` and `opts[:live_gap_ticks]` are Phase-2-only options; v1 does not read them.
- `opts[:kins]` — the candidate kin-id range to probe for live lineages. Default `0..9` (the architectural kin-group range named in `SP.Runtime.Lineage`'s own moduledoc, `lib/sp/runtime/lineage.ex:3-4`: "one per kin group 0..9"); override for a colony run configured with a narrower range (e.g. `SP.Brain.Colony.start_evolution/2`'s own default `0..3`, `lib/sp/brain/colony.ex:76`), or a wider/out-of-band range (e.g. a test fixture). **v1 does not bound `opts[:kins]`:** each candidate id interns a permanent BEAM atom via `Lineage.name/1` (`lib/sp/runtime/lineage.ex:72`), so an unbounded range risks atom-table exhaustion in principle — accepted in v1 only because `:manual`-only triggering keeps `opts[:kins]` operator-typed, never reachable from an automated/public surface (see "v1 Scope" item 3). Bounding it to (or rejecting ranges wider than) the architectural `0..9` range is a named Phase-2 prerequisite, gated on `opts[:kins]` becoming reachable from a less-trusted caller — see "Test coverage" Phase 2 list.
- If `trigger == :manual` (the only v1 case), snapshot runs immediately, synchronously, in the calling process.

## Snapshot mechanics

1. Determine the candidate kin set: `opts[:kins] || 0..9` (see "Behaviour").
2. For each candidate kin id `k`:
   a. Resolve the lineage process: `pid = Process.whereis(SP.Runtime.Lineage.name(k))`. Skip `k` if `pid` is `nil` — no lineage is running for that kin.
   b. Best-effort, diagnostic only in v1 — logged, not written to any manifest artifact (no field-bearing artifact exists in v1; `manifest.sha256` is a plain hash+filename listing, same shape as `colony_archive.sh`'s, with no room for extra fields): cross-reference `SP.Runtime.Supervisor.list_agents/0`'s `[%{username, kin, mode}]` for an entry whose `kin == k` (username pattern `"UNI-#{k}-g<gen>"`, set in `spawn_next/2`, `lib/sp/runtime/lineage.ex:123`). A `manifest.json` sidecar carrying a `live_agent` field (if/when this cross-reference needs to land in a written artifact) is deferred Phase-2 work, not built in this pass.
   c. Compute the source path `path = Path.join(@repo_root, "runs/colony/kin-#{k}.bin")`. Skip `k` if `File.exists?(path)` is false — a lineage can be running before its first `MC.save/2` (e.g. immediately after `spawn_next/2`, before any save-every tick or death has fired).
3. For each surviving `{k, path}` pair: `File.read!/1` the current bytes of `path` and write them into the snapshot directory via a LOCAL tmp+rename (`<dir>/kin-#{k}.bin.tmp` via `File.write!/2`, then `File.rename!/2` to `<dir>/kin-#{k}.bin`). This guarantees the snapshot DIRECTORY never shows a partially-written file. It does **not** guarantee the bytes read from the still-live SOURCE `kin-#{k}.bin` were themselves non-torn, because `MC.save/2` (`lib/sp/brain/mc.ex:552-554`) is a plain `File.write!/2` with no tmp+rename on the source side.
   - **Documented v1 risk:** if `snapshot/1` reads `kin-#{k}.bin` in the same instant `MC.save/2` is mid-write, the copied bytes can be a torn `:erlang.term_to_binary` blob that later fails to deserialize on restore. This is rare — the write is fast relative to the default `save_every` (50 ticks) and to the snapshot cadence — and no worse than the risk every existing reader of `kin-*.bin` already accepts (`MC.load/2`, `lib/sp/brain/mc.ex:563-585`, delegates to `safe_read/1` at `mc.ex:587-594`, whose `rescue`/`catch` both fall through to `:error` — see `load/2`'s own `:error -> new(opts)` branch at `mc.ex:582-583` — so a corrupt file already yields "start fresh" rather than a crash). True source-side atomicity needs a new `SP.Runtime.Agent`-side call (e.g. `Agent.dump_atomic/1` returning `{:ok, tmp_path}`, writing under the Agent's own control) — real, buildable, but new code this spec does not introduce.
4. Compose the dated directory `runs/colony/snapshot/YYYYMMDD/HHMM/` (repo-relative, under `@repo_root`, `lib/sp/runtime/lineage.ex:25`) — **v1's output root is fixed to this path only** (see "v1 Scope" item 4).
5. Write `manifest.sha256` at the directory root: sha256 of every non-`.tmp` file actually written, same shape as `colony_archive.sh`'s own manifest (`find . -type f ! -name manifest.sha256 -print0 | xargs -0 sha256sum > manifest.sha256`, `production/scripts/colony_archive.sh:62-65`).
6. Return `{:ok, dir}`, or `{:error, term()}` — e.g. `{:error, {:unsupported_trigger, trigger}}` for a v1-unsupported trigger, or a filesystem-error tuple the caller converts from any `File.*!` raise.

## Hot-file interaction

`snapshot/1` is a **reader** of the hot file `runs/colony/kin-*.bin` (sole writer: `SP.Brain.MC.save/2`, `lib/sp/brain/mc.ex:552-554`, called from `SP.Runtime.Agent`'s save-every tick and `terminate/2` — see "Purpose" for the exact call sites — per `SPEC_livepatch_hot_files.md`'s existing hot-files entry for this file). *(Correction: the prior revision of this SPEC cited a `SP.Runtime.Agent.save/1` function guarding this file; no such function exists anywhere in the codebase — every save call site goes directly through `SP.Brain.MC.save/2`, called inline from `SP.Runtime.Agent`. Corrected here.)*

`snapshot/1` does not introduce a new hot file. Its own output (`runs/colony/snapshot/**`) is written once per run into a fresh per-run directory with a local tmp+rename (step 3 above) — a private, single-writer-per-run path, not a shared multi-writer spool — so it needs no new entry in `SPEC_livepatch_hot_files.md`'s hot-files list or `OS_SPOOL_POLICY.md`'s spool ledger.

Being a reader (not a writer) of `kin-*.bin`, `snapshot/1` does not participate in the livepatch hot-file WRITER guard (C-C4c): that guard protects the sole writer's atomicity promise, and readers of this particular file already tolerate torn reads today (see the v1 atomicity risk above). `snapshot/1` inherits that same tolerance; it adds no new coordination requirement to the livepatch guard.

## Test coverage the plan owes

`test/sp/runtime/lineage_snapshot_test.exs`:
- **Enumeration:** with lineages started for kin `10` and `12` only (`Lineage.ensure_started/2`) and kin `11` never started — ids chosen outside the architectural `0..9` live/default range, matching the established out-of-band-kin convention this repo already uses to keep tests off real colony data (`test/sp/runtime/lineage_test.exs:38` uses `kin = 8`; the paired-RED convention documented in `docs/lab_team/04_red_experimentalist.md:12` and `runs/curiosity_lineage.exs:2` uses kin `10`/`11`) — `snapshot/1` called with an explicit `opts[:kins]: 10..12` override (required: the default `0..9` would never scan these ids, so this also exercises the override path) includes `kin-10.bin` and `kin-12.bin` in the manifest and never `kin-11.bin`. **Must not** start lineages inside `0..9` for this test: `Lineage.spawn_next/2` hardcodes `memory_path` to `runs/colony/kin-#{kin}.bin` (`lib/sp/runtime/lineage.ex:133`, not opts-overridable) and `Agent.terminate/2` unconditionally saves on `GenServer.stop` (`lib/sp/runtime/agent.ex:357-358`), so an in-range kin id risks overwriting real learned colony data on test cleanup.
- **Enumeration skips pre-save kin:** a lineage started but with zero saves yet (no `kin-N.bin` on disk) is skipped without error.
- **Local atomicity:** killing the snapshot process mid-copy leaves no partially-named `kin-*.bin` file under the dated dir — at most an orphaned `.tmp` file, which `manifest.sha256` never references. v1 defines no reaper/retention mechanism for `runs/colony/snapshot/**`: because each `:manual` run gets its own `YYYYMMDD/HHMM/` directory and there is no automatic recurring cadence in v1, an orphaned `.tmp` is not reliably cleaned up by a later run in the general case — it is harmless (nothing reads it) but persists until an operator or a future Phase-2 mechanism removes it. Since `snapshot/1` runs synchronously in the calling process in v1 (no process of its own to kill — see "Behaviour"), the test wraps the call in its own `Task` and sends the kill at a chosen point inside the per-kin tmp+rename loop (step 3) to trigger this deterministically rather than relying on timing.
- **Manifest integrity:** every non-`.tmp` file in the dir has a matching sha256 line in `manifest.sha256`.
- **Path default:** a `:manual` snapshot writes under `runs/colony/snapshot/YYYYMMDD/HHMM/` and never under `/var/lib/uni/backups/colony/**`.
- **Unsupported trigger:** `snapshot(trigger: :heartbeat_idle)` and `snapshot(trigger: :heartbeat_live)` both return `{:error, {:unsupported_trigger, trigger}}` without touching the filesystem.

**Falsifier:** this SPEC makes no FE/behavioural claim (see "v1 Scope" — `snapshot/1` is pure I/O composition over already-persisted bytes), so the paired PASS/FALSIFIES RED-gate apparatus (`docs/LAB_PROTOCOL.md` §II) is scoped to behavioural claims and does not transplant here; the persona review (§VII) is the applicable gate instead (see the review receipt). This SPEC's own, narrower falsifier: any named test above failing, or a `:manual` snapshot landing anywhere outside `runs/colony/snapshot/**`.

**Phase 2 (not owed by this SPEC — each gated on a named prerequisite above):**
- Idle no-op: two `:heartbeat_idle` triggers within `idle_min_gap_s` produce ONE snapshot dir. Gated on a BEAM-side heartbeat caller (v1 Scope item 3).
- Live cadence: N `:heartbeat_live` triggers with `live_gap_ticks = 4` produce N/4 snapshot dirs. Same gate.
- Source-side atomicity: once an `Agent`-side atomic-dump call exists, a mid-snapshot kill also leaves no torn `kin-*.bin` bytes at the SOURCE (not just the destination). Gated on `Agent.dump_atomic/1` (v1 Scope item 1).
- Bind-mount-shared output: once `OS_SPOOL_POLICY.md`'s ledger carries a registered `snapshot/1` writer entry, snapshots land under `/var/lib/uni/backups/colony/YYYYMMDD/HHMM/` instead of (or alongside) `runs/colony/snapshot/`. Gated on the ledger amendment (v1 Scope item 4).
- `opts[:kins]` bound enforcement: reject (or clamp) candidate ranges wider than the architectural `0..9` kin-group range once `opts[:kins]` is reachable from any less-trusted/automated caller, to prevent BEAM atom-table exhaustion via `Lineage.name/1` (`lib/sp/runtime/lineage.ex:72`). Gated on `opts[:kins]` leaving the `:manual`-only, operator-typed v1 surface (see "Behaviour").
- `live_agent` manifest field: land the diagnostic `Supervisor.list_agents/0` cross-reference (Snapshot mechanics step 2b) in a written `manifest.json` sidecar, once a real consumer needs it. Gated on that consumer existing.

## Cross-references

- `production/scripts/colony_archive.sh` — the daily archive job (D-D1). It does **not** consume `snapshot/1`'s output: it independently archives `/var/lib/uni/colony-memory/` (or its fallback, `/var/lib/uni/broadcast-src/runs/colony/`) into the shared `/var/lib/uni/backups/colony/` tree. `snapshot/1`'s `runs/colony/snapshot/**` output is a separate, unshared tree in v1 — see "v1 Scope" item 4. *(Correction: the prior revision of this SPEC described `colony_archive.sh` as consuming these snapshots; it does not, today.)*
- `production/systemd/uni-colony-archive.timer` — the systemd side of `colony_archive.sh`.
- `production/docs/OS_SPOOL_POLICY.md` — the sole-writer ledger; a bind-mount-shared output path for `snapshot/1` is a deferred prerequisite gated on a new ledger entry there (v1 Scope item 4).
- `production/docs/SPEC_livepatch_hot_files.md` (C-C4c) — the hot-files guard `runs/colony/kin-*.bin` is registered under; see "Hot-file interaction" above.
- `production/scripts/heartbeat.sh` — the only heartbeat mechanism in the repo today (a 60s systemd-timer shell script, `status: pending`, not yet run on node hardware per its own header); not wired to `snapshot/1` in v1 (see "v1 Scope" item 3).
