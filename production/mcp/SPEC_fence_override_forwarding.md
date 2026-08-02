# SPEC — Fence-override audit forwarding (D-B3)

**Status:** SPEC. Touches `viewer/command_center.cjs` (non-FE) + Phoenix `POST /overlay/update` handler (per SPEC_command_center_overlay_update).
**Ship gate:** MERGED VERDICT — this changes the security-audit surface.

---

## Purpose

Today when an operator marks `force=true` on an overlay write, `viewer/command_center.cjs:143-146` writes to a local `fence_overrides.log`. The fleet audit ledger (`/var/lib/uni/broadcast/audit/prod-mcp.ndjson`) does NOT see it. So force-overrides are invisible to the auditor. D-B3 fixes this.

**Confirmed live (2026-07-12 re-check):** `SP.Audit.Writer` has **zero references anywhere in the codebase** — no `.ex`/`.exs` file defines it, nothing imports it; it exists only as a name in this spec and in `production/docs/OS_SPOOL_POLICY.md`. It must be designed from scratch (exact contract below, under "NEW code this spec introduces"). It is also a **second writer** to `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`: `production/mcp/server.py`'s `_AUDIT`/`_LocalAudit` (confirmed live at `production/mcp/server.py:124-156`) already appends every mutating-tool-call row to that same file today. `production/docs/OS_SPOOL_POLICY.md` named both writers without reconciling the overlap — a direct violation of its own "one supervised sole writer per spool" rule. This spec resolves that explicitly (see "Reconciling the two writers" below), and `OS_SPOOL_POLICY.md`'s ledger entry is corrected to match.

## Contract

Whenever a caller (currently `command_center.cjs`, in future also `POST /overlay/update` with `force=true`) applies an override:

1. The write proceeds (existing behaviour).
2. A `Sec`-class row is appended to `prod-mcp.ndjson` conforming to `production/schemas/sensorium_envelope.schema.json`:

```json
{
  "schema_version": 1,
  "source": "prod_mcp",
  "ts": "2026-07-13T…",
  "kind": "event",
  "payload": {
    "action": "fence_override",
    "layer": "lowerThird",
    "flagged_token": "prov",
    "forced_text": "This proves that UNI is alive",
    "operator": "mpolzin",
    "source_surface": "command_center"
  },
  "provenance": {
    "server": "thinker",
    "git_commit": "<HEAD sha>",
    "evidence_class": "Sec",
    "audit_id": ""
  }
}
```

3. In addition to the ndjson row, the existing `fence_overrides.log` continues to be written locally (double-write is intentional: local log for operator visibility, ndjson for fleet audit).

## Field-level allowlist for any future public reader (binding)

This row (via `payload.operator` and `provenance.server`) is the first row shape in `prod-mcp.ndjson`
to carry an operator identity and an internal box hostname together, concretely, for the first
time — worth naming explicitly per the same discipline as `SPEC_uni_self_audit.md`'s "Claim-fence
field allowlist" section, even though (per the corrected `OS_SPOOL_POLICY.md` Readers entry — see
that file) **no public reader of `prod-mcp.ndjson` exists today**, so there is no live exposure to
close. Binding for any future one:

**`payload.operator` and `provenance.server` (and `provenance.audit_id` once populated) MUST NEVER
be exposed to any public-facing reader without an explicit, reviewed redaction/allowlist step.** If
a public-facing proxy over this file is ever built (e.g. a rate-limited summary tool on
`uni-public-mcp`, per `SPEC_uni_public_mcp.md`), it MUST allowlist fields the same way
`SPEC_uni_self_audit.md` does for `kins[]` — not inherit raw row access by default. Until such a
proxy exists and is reviewed, this file stays operator/red-team-internal only.

## `command_center.cjs` implementation

- After a successful force-override write, HTTP POST to `http://COLONY_HOST:4000/audit/fence_override` (new tiny endpoint on Phoenix, forwards to `prod-mcp.ndjson` writer). Non-blocking (fire-and-forget with a 2s timeout).
- If the POST fails, log a WARN locally but do NOT unwind the override write.
- **`payload.operator`'s source, named explicitly (was unspecified in the reviewed draft):**
  confirmed live, `viewer/command_center.cjs` has NO login/session/identity capture anywhere today
  (its only `operator*`-named variable, `operatorPreview`, is unrelated UI state holding a scene
  name, not a person's identity) — there is no real per-request operator identity to read yet. This
  is a genuine, narrow, single-operator-system placeholder, not a full identity design: a NEW
  environment variable, `UNI_OPERATOR_NAME`, set once per box/deploy (same pattern as
  `UNI_GIT_COMMIT` above); `command_center.cjs` reads `process.env.UNI_OPERATOR_NAME || "unset"`
  and includes it verbatim as `payload.operator` in both the `/overlay/update` force write and the
  `/audit/fence_override` POST. Phoenix does NOT invent or infer an operator value on its own —
  `SP.Audit.Writer.write/1`'s doc comment already says the caller "MUST already carry" the field;
  this is that source, named. Real per-request identity (a login/session system) is a separate,
  larger design this spec does not attempt.

## Phoenix implementation

- New endpoint `POST /audit/fence_override` that accepts the `payload` field and writes the full row through a supervised `SP.Audit.Writer` (NEW — see below). `SP.Audit.Writer` is scoped as the sole writer for `fence_override`-kind rows ONLY, not for `prod-mcp.ndjson` as a whole — the sub-scoped ownership split is recorded in `production/docs/OS_SPOOL_POLICY.md`'s `prod-mcp.ndjson` ledger entry (updated by this spec).

## Registration in `ui/lib/sp_ui_web/router.ex`

Not built by the reviewed draft — named explicitly here so the controller is reachable. Confirmed
live: `router.ex` today has exactly two pipelines, `:browser` and `:api` (`plug :accepts, ["json"]`
only, no CSRF plug), and zero references to `fence_override` anywhere. Add:

```elixir
scope "/", SpUiWeb do
  pipe_through :api
  post "/audit/fence_override", AuditController, :fence_override
end
```

under the **`:api`** pipeline (same reasoning as `SPEC_command_center_overlay_update.md`'s
registration note: this is a server-to-server JSON call from `command_center.cjs`, and `:browser`'s
`plug :protect_from_forgery` would reject it outright with no CSRF token).

## Reconciling the two writers (resolves the sole-writer overlap)

`production/mcp/server.py`'s `_AUDIT`/`_LocalAudit` and the new `SP.Audit.Writer` both append to `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`. Two options were available; this spec picks **sub-scoped ownership by row kind** over routing Phoenix through an HTTP call into the Python side, because `server.py` is a `FastMCP` tool-call surface (bearer-authed, session-negotiated `streamable_http_path="/prod-mcp"`) with no existing lightweight "write one audit row" HTTP endpoint to route through — building one would be at least as much new Python-side work as `SP.Audit.Writer` itself, plus it would make every fence-override write depend on the Python MCP server being up (that server is explicitly "DESIGN / REFERENCE only -- not deployed" per its own module docstring today).

**The split:**

- `production/mcp/server.py`'s `_AUDIT`/`_LocalAudit` — sole writer for every row EXCEPT `kind == "event"` rows where `payload.action == "fence_override"`. In practice: every MCP-tool-call audit row (`cut_to`, `set_music_volume`, `narrate`, `set_overlay`, `panic`, `open_session`, `close_session`, `command`, `remove_guest`, `admit_guest`, `schedule`, `start_broadcast`, `stop_broadcast` — the full set audited via `_AUDIT.write({"event": ...})` in `server.py`). Unchanged by this spec.
- `SP.Audit.Writer` — sole writer for rows where `kind == "event"` AND `payload.action == "fence_override"`. Nothing else calls it; it is wired ONLY into the `POST /audit/fence_override` handler.

**Row-shape honesty (named, not silently resolved):** this split resolves WHO writes WHEN, not
WHAT SHAPE every row already in the file is. Re-checked live against `production/mcp/server.py`:
every existing `_AUDIT.write(...)` call (e.g. `server.py:557`,
`_AUDIT.write({"event": "cut_to", "scene": scene, "transition": transition, "ms": ms})`) plus
`_LocalAudit.write()` (`server.py:136-150`, which only adds top-level `audit_id`/`server`/`ts`)
produces a FLAT row shaped `{event, ...fields, audit_id, server, ts}` — no `schema_version`, no
`kind`, no `payload` wrapper, no nested `provenance` object — and does **NOT** satisfy
`sensorium_envelope.schema.json`'s `required: [schema_version, source, ts, kind, payload,
provenance]` + `additionalProperties: false` (`production/schemas/sensorium_envelope.schema.json:8`).
`SP.Audit.Writer`'s own new rows ARE correctly shaped per that schema. So today, `prod-mcp.ndjson`
carries two structurally incompatible row shapes: legacy flat Python rows (pre-existing, this
spec does not touch `server.py` and cannot fix this without editing that live file, which is out of
scope for a spec-only pass) and new nested `SP.Audit.Writer` rows. Any reader built against
`sensorium_envelope.schema.json` (e.g. a future `get_evidence_bundle`-style tool) would mis-parse
every pre-existing MCP-tool-call row. `OS_SPOOL_POLICY.md`'s ledger entry for this file states this
plainly rather than implying full reconciliation (see that file).

**Concurrency safety** (the real question a "sub-scoped ownership split" has to answer — two independent OS processes are still appending to the same inode): each row MUST be written as exactly one line via exactly one `write()`/append syscall — never assembled with more than one file operation per row.
- Python side already does this: `server.py:145-146`, `fh.write(json.dumps(row, ensure_ascii=False) + "\n")` inside a single `open(..., "a")` call.
- `SP.Audit.Writer` MUST do the same: encode the full row to one string, then a single `File.write(path, line, [:append])` call — never `File.open` + multiple `IO.write`s for one row.

POSIX `O_APPEND` makes a single `write()` syscall atomic against other appenders on the same file (the kernel serializes the seek-to-end + write), so two processes each honoring "one row = one syscall" cannot interleave and produce a torn line, even though they share one inode. This is a stronger, narrower claim than "single sole writer" — it is the specific, falsifiable condition that makes a *sub-scoped* dual-writer safe, and it is why the split is by disjoint row-kind rather than, say, alternating writers or a shared lock file (neither of which exists nor is needed if the one-syscall-per-row rule holds).

## NEW code this spec introduces: `SP.Audit.Writer`

Does not exist today (see "Confirmed live" note above). Proposed home: `lib/sp/audit/writer.ex` (mirrors `lib/sp/show/overlay_publisher.ex`'s placement and the `SP.Show.OverlayPublisher` naming convention). Runs only in the Phoenix node (needs `Jason`, same constraint `OverlayPublisher` documents for itself), started as a new child of the existing `SP.Show.Supervisor` (`lib/sp/show/supervisor.ex`), `restart: :permanent`.

```elixir
defmodule SP.Audit.Writer do
  use GenServer

  @path System.get_env("UNI_PROD_MCP_AUDIT") || "/var/lib/uni/broadcast/audit/prod-mcp.ndjson"

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: __MODULE__)

  # Box identity, matching `production/scripts/colony_archive.sh:84`'s existing
  # `$(hostname 2>/dev/null || echo uni-lab)` convention (OS hostname, honest fallback) —
  # `:inet.gethostname/0` is the pure-OTP equivalent, no shell-out.
  defp node_server_name do
    case :inet.gethostname() do
      {:ok, h} -> to_string(h)
      _ -> "unknown"
    end
  end

  # Reuses the SAME env var `production/mcp/server.py:58` already reads
  # (`GIT_COMMIT = os.environ.get("UNI_GIT_COMMIT", "unknown")` — a plain env lookup with a
  # literal "unknown" fallback; there is no `git rev-parse` call anywhere in that file, so this
  # does not shell out either). Setting `UNI_GIT_COMMIT` once per deploy makes both writers' rows
  # carry the SAME value on the same box, which is the actual comparability this spec needs — not
  # independently re-deriving it two different ways.
  defp git_commit, do: System.get_env("UNI_GIT_COMMIT", "unknown")

  @doc "payload MUST already carry action: \"fence_override\" plus the fields shown in the Contract row example."
  @spec write(payload :: map()) :: :ok | {:error, term()}
  def write(payload) when is_map(payload), do: GenServer.call(__MODULE__, {:write, payload})

  @impl true
  def init(_opts), do: {:ok, %{}}

  @impl true
  def handle_call({:write, payload}, _from, state) do
    row = %{
      "schema_version" => 1,
      "source" => "prod_mcp",
      "ts" => DateTime.utc_now() |> DateTime.to_iso8601(),
      "kind" => "event",
      "payload" => Map.put(payload, "action", "fence_override"),
      "provenance" => %{
        "server" => node_server_name(),
        "git_commit" => git_commit(),
        "evidence_class" => "Sec",
        "audit_id" => ""
      }
    }

    # Jason via dynamic dispatch — matches EVERY OTHER Jason-touching line in `lib/sp/`
    # (`grep -rn "Jason\." lib/sp/` -> every hit is `apply(Jason, ...)`, zero exceptions),
    # including `lib/sp/show/overlay_publisher.ex`, whose placement this module mirrors and whose
    # `@moduledoc` documents WHY: the root `stratified_palimpsest` app has zero deps (`mix.exs`
    # `deps: []`, offline `mix test`), so `Jason` only exists as a compiled dependency inside `ui`;
    # a direct `Jason.encode/1` call would be an undefined-function compile warning/crash risk in
    # any context that loads this module without `ui`'s deps present.
    case apply(Jason, :encode, [row]) do
      {:ok, line} ->
        case safe_append(line <> "\n") do
          :ok -> {:reply, :ok, state}
          _ -> {:reply, {:error, :write_failed}, state}
        end

      _ ->
        {:reply, {:error, :encode_failed}, state}
    end
  end

  # ONE write() syscall for the whole line — the concurrency-safety condition above.
  defp safe_append(line) do
    File.write(@path, line, [:append])
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end
end
```

- `write/1` is a synchronous `GenServer.call` so the Phoenix controller gets a real `:ok | {:error, reason}` before answering the fire-and-forget POST from `command_center.cjs` (which itself does not block on the response — see "`command_center.cjs` implementation" above).
- Enforces `payload.action == "fence_override"` unconditionally (`Map.put(payload, "action", "fence_override")` — the caller cannot override it), which is what keeps `SP.Audit.Writer` mechanically unable to write any row kind other than the one it owns, independent of what the `POST /audit/fence_override` handler passes in.
- `node_server_name/0` and `git_commit/0` (defined above, in the module body) resolve the same TWO
  provenance fields `server.py`'s `metadata()` resolves on the Python side — box identity and
  `git_commit` — but not by the same mechanism the earlier draft of this spec claimed:
  `server.py:58`'s `GIT_COMMIT` is a plain `os.environ.get("UNI_GIT_COMMIT", "unknown")` env lookup
  with a literal fallback, NOT a `git rev-parse` call (grep-confirmed: no `git rev-parse` anywhere
  in that file); `git_commit/0` above reuses that exact same env var for a genuinely comparable
  value on the same box, rather than independently re-deriving it.

## FALSIFIES

Per CLAUDE.md's science-gate discipline #4 (pre-registered PASS + FALSIFIES before the run,
matching the pattern already landed in `SPEC_uni_self_audit.md`'s "FALSIFIES" section): this spec's
concurrency-safety claim is falsified by —

> Any torn or malformed JSON line appearing in `prod-mcp.ndjson` under concurrent
> `server.py`'s `_LocalAudit.write` and `SP.Audit.Writer.write/1` writers — i.e. any line that
> fails to parse as complete JSON, or any line that is a byte-level splice of two different rows.

A hit means the "one `write()`/append syscall per row is atomic under `O_APPEND`" claim this
sub-scoped dual-writer design rests on does not actually hold on the deployed filesystem, and the
split must not ship as safe until root-caused. This is exactly what the concurrency regression test
below exercises pre-ship.

## Test coverage the plan owes

- `ui/test/sp_ui_web/audit_fence_override_test.exs`: submit an override, assert a Sec-class row appears in prod-mcp.ndjson with the correct payload. (Corrected from `test/ui/audit_fence_override_test.exs` — no `test/ui/` directory exists in this repo. The Phoenix app's real tests live under `ui/test/sp_ui_web/`, confirmed live alongside the existing `ui/test/sp_ui_web/overlooker_live_test.exs` and `ui/test/sp_ui_web/stream_qa_test.exs`.)
- Negative path: submit malformed payload → 400 + no row written.
- NEW — unit coverage for `SP.Audit.Writer` itself, at `ui/test/sp/audit/writer_test.exs` (named
  path — the reviewed draft left this suite unnamed; placed under `ui/test/` for the same `Jason`-
  availability reason as `SPEC_command_center_overlay_update.md`'s `OverlayPublisher` test, since
  `SP.Audit.Writer` is proposed to live at `lib/sp/audit/writer.ex`, in the zero-dep root app, and
  needs `Jason`): `write/1` appends a well-formed row (`action` forced to `"fence_override"` even if
  the caller's payload tries to set something else); `{:error, :write_failed}` on a simulated append
  failure. No suite exercises it today (it does not exist).
- NEW — a concurrency regression test at `ui/test/sp/audit/writer_concurrency_test.exs` (named path
  — the reviewed draft named neither a path nor a harness, and no existing test anywhere in
  `test/` or `ui/test/` spawns a Python process, confirmed via a repo-wide `System.cmd` grep, so
  there is no existing precedent to point at instead): spawn several `Task.async` workers that each
  call `SP.Audit.Writer.write/1` with distinct payloads against a temp file. Note `@path` (above,
  in "NEW code this spec introduces") is a compile-time module attribute reading
  `UNI_PROD_MCP_AUDIT` — setting that env var from inside the test via `System.put_env/2` is too
  late (the module is already compiled by then), so this test suite requires `UNI_PROD_MCP_AUDIT`
  to be exported in the shell BEFORE `mix test` is invoked (document this precondition in the test
  file's moduledoc), never the real `/var/lib/uni/...` path. Concurrently with a
  `System.cmd("python3", ["-c", "..."])` call whose inline snippet reproduces
  `_LocalAudit.write`'s exact single-`open(path, "a")` + one `fh.write(json.dumps(row) + "\n")`
  call byte-for-byte (matching `server.py:145-146`) — NOT an import of `production/mcp/server.py`
  itself, which pulls in the `mcp` FastMCP package and is documented "DESIGN / REFERENCE only — not
  deployed," so importing it would make this test's pass/fail depend on a dependency this repo does
  not install. After both finish, read the resulting file and assert every line parses as valid,
  complete JSON — the executable check for the "one syscall per row" claim in "Reconciling the two
  writers" above, and the FALSIFIES condition immediately above.

## Cross-references

- `production/mcp/SPEC_command_center_overlay_update.md` — the paired overlay-update endpoint.
- `production/schemas/sensorium_envelope.schema.json` — the row schema.
