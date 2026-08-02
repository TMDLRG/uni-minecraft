# SPEC — `POST /overlay/update` on Phoenix (D-A3)

**Status:** SPEC. Touches `ui/` Phoenix + `viewer/command_center.cjs` (both non-FE-file changes but both under `/lab-team-review` because of the sole-writer invariant).
**Ship gate:** MERGED VERDICT required.

---

## Purpose

Today `viewer/command_center.cjs` `writeState` writes `viewer/runtime/broadcast.json` DIRECTLY. `SP.Show.OverlayPublisher` also writes the same file (`lib/sp/show/overlay_publisher.ex:22-105`). This is a two-writer race that was mitigated 2026-07-12 with an EPERM retry+fallback, but the root cause (two writers) remains.

**Confirmed live (2026-07-12 re-check):** `overlay_publisher.ex` today is a pure tick-driven `GenServer` — `init/1` schedules `:tick`, `handle_info(:tick, state)` runs `publish/0` every `@tick_ms` (2000ms), and there is a catch-all `handle_info(_other, state)`. There is **no `handle_call/3` clause of any kind** and **no public write function** — `start_link/1` is the only exported function besides the `handle_info` callbacks. `SP.Show.OverlayPublisher.set/1` does **not exist**.

D-A3 kills the duplicate. `command_center.cjs` becomes an HTTP client to Phoenix; Phoenix routes into `SP.Show.OverlayPublisher.set/2` — a **NEW** synchronous `GenServer.call` this spec introduces from scratch (full signature and behavior below, under "NEW code this spec introduces"). Once built, `OverlayPublisher` remains the sole *file* writer: `set/2` is a second entry point into the same supervised process, not a second writer.

## Endpoint

```
POST http://COLONY_HOST:4000/overlay/update
Content-Type: application/json

{
  "layer": "lowerThird" | "caption" | "ticker" | "onAir",
  "payload": { ... layer-specific ... },
  "force": false,      // optional; if true, bypasses the claim fence (audited per D-B3)
  "source": "command_center"
}
```

Response envelope conforms to `production/schemas/envelope.schema.json` (that schema is
`additionalProperties: false` with `required: ["schema_version", "envelope", "result"]`, and
`envelope` itself is `additionalProperties: false` with `required: ["server", "instrument_version",
"timestamp", "evidence_class"]` — the worked example below names every one of those so it actually
validates, unlike the previous draft's `{envelope:{...}, result:{...}}` placeholder which omitted
the top-level `schema_version`):

```json
{
  "schema_version": 1,
  "envelope": {
    "server": "sp-ui-phoenix",
    "instrument_version": "0.1.0",
    "timestamp": "2026-07-13T00:00:00Z",
    "evidence_class": "C"
  },
  "result": {
    "accepted": true,
    "fence_flag": null | "<flagged token>",
    "written_at": "2026-07-13T..."
  }
}
```

`envelope.server`'s description in the schema lists `uni-production-mcp | uni-public-mcp |
uni-control-mcp` as examples, not an enforced enum (the property is a plain `string` in the
schema) — this new Phoenix HTTP endpoint is none of those three Python MCP servers, so it uses its
own identifier, `"sp-ui-phoenix"`, consistently across every response. This endpoint has no
obligation to match `production/mcp/server.py`'s flat `metadata()` shape — that file's own
nested-vs-flat drift against this same schema is a separate, pre-existing gap already named
honestly in `SPEC_uni_self_audit.md`'s "Result shape" section ("This does NOT conform to
`production/schemas/envelope.schema.json`... That schema is aspirational: none of the 26 existing
`@mcp.tool(...)`-decorated tools in `production/mcp/server.py` produce it today"), not repeated
here — it is new code, free to conform to `envelope.schema.json` for real from the start.

If `fence_flag` is non-null AND `force=false`, the response has `accepted: false` and the write did NOT happen.

## Phoenix implementation

- New controller `SpUiWeb.OverlayController` with action `update`.
- `update/2` validates the payload against the layer's shape (existing `production/schemas/broadcast.schema.json`).
- Runs `SP.Brain.Fence.flag/1` on any text field (`kicker`, `title`, `subtitle`, `text`).
- If flagged AND not `force`, returns 200 with `accepted: false, fence_flag: <token>`.
- If accepted, calls `SP.Show.OverlayPublisher.set(layer, payload)` (arity 2) synchronously via `GenServer.call/2` (default 5000ms timeout).
  - On `:ok` → returns 200 with `accepted: true, written_at: <now>`.
  - On `{:error, reason}` → returns 502 with `accepted: false, error: <reason>` (the write did not happen; nothing was published).
- If `force: true`, `OverlayController.update/2` itself does **NOT** emit the audit row in this
  pass — see `production/mcp/SPEC_fence_override_forwarding.md`'s "Contract": today the
  audit-forwarding `POST /audit/fence_override` call is the CALLER's responsibility, and the only
  caller wired to make it (this pass) is `viewer/command_center.cjs`, which fires it as a second,
  non-blocking HTTP call immediately after receiving `accepted: true` from a `force=true` write to
  this endpoint (see that spec's "`command_center.cjs` implementation" section). Wiring
  `/overlay/update` to call `SP.Audit.Writer` directly — removing the second client-side POST — is
  named there as explicit future work, not built by this spec. Consequence, stated plainly rather
  than left unfalsifiable: a `force=true` write through this endpoint made via `command_center.cjs`
  produces exactly one audit row (via its follow-up call); a `force=true` write made through any
  OTHER caller of `/overlay/update` that never issues that follow-up call produces ZERO audit rows
  for that override — a known gap of this pass's two-call design, not a silently-dropped one.

## Registration in `ui/lib/sp_ui_web/router.ex`

Not built by the reviewed draft — named explicitly here so the controller is reachable. Confirmed
live: `router.ex` today has exactly two pipelines, `:browser` (with `plug :protect_from_forgery`)
and `:api` (`plug :accepts, ["json"]` only, no CSRF plug), and zero references to
`OverlayController` anywhere. Add:

```elixir
scope "/", SpUiWeb do
  pipe_through :api
  post "/overlay/update", OverlayController, :update
end
```

under the **`:api`** pipeline specifically (mirroring the existing `GET /producer/health`
precedent at `router.ex:27`) — **not** `:browser`. `POST /overlay/update` is a server-to-server
JSON call from `command_center.cjs`, not a browser form post; routing it through `:browser` would
hit `plug :protect_from_forgery` and reject every request with no CSRF token, which is not this
endpoint's threat model.

## Prerequisite (pre-existing gap, out of scope for this spec): claim-fence token coverage

`SP.Brain.Fence.flag/1` (`lib/sp/brain/fence.ex:17`) is this endpoint's ONLY safety gate on
free-typed `kicker`/`title`/`subtitle`/`text` fields, and this is the FIRST time that regex becomes
load-bearing against genuinely operator/API-typable text (previously it only filtered
Director-generated narration). Re-verified live, both gaps are real and pre-existing in already-running
`.ex`/`.cjs` files, not introduced by this spec, and fixing them means editing that live code, which
is out of scope for a spec-only pass:

- `lib/sp/brain/fence.ex:17`'s `@fence` regex does not include an `"agi"` alternative, even though
  the module's own moduledoc comment one line above (`fence.ex:16`) claims it bans
  "…/first-ever/agi/…" — the comment and the regex have drifted apart. The client-side mirror at
  `viewer/command_center.cjs:139` DOES include `agi`, so today's masking is accidental (the one live
  caller, `/api/overlay`, still runs the stricter JS check first) and this spec's new endpoint would
  be the first caller that only ever reaches the weaker Elixir-side regex.
- Neither `fence.ex:17` nor `command_center.cjs:139` bans an `emotion`/`emotional`/`emotionally`
  family token (both ban `feel(s|ings?)?`/`felt`/`experienc\w*`, but not `emotion\w*`) — the same gap
  in both copies, so no existing caller masks it either.

Until `lib/sp/brain/fence.ex`'s `@fence` regex (and its `viewer/command_center.cjs:139` mirror, which
the module's own moduledoc says it must stay in agreement with) are extended to cover both token
families, `POST /overlay/update` is NOT audited as a strict subset of what it nominally supersedes,
and a caller can reach it directly with `{"text":"UNI's emotional state is calm"}` / any `agi`-token
text at `force:false` and have it land on the live public broadcast overlay completely unflagged —
no fence trip, no audit row. This spec does not ship that fix; it names it so it is not silently lost.

## NEW code this spec introduces: `SP.Show.OverlayPublisher.set/2`

This does not exist today (see "Confirmed live" note above). This spec adds it as follows.

**Public function** (in `lib/sp/show/overlay_publisher.ex`):

```elixir
@spec set(layer :: String.t(), payload :: map()) :: :ok | {:error, term()}
def set(layer, payload)
    when layer in ["lowerThird", "caption", "ticker", "onAir"] and is_map(payload) do
  GenServer.call(__MODULE__, {:set, layer, payload})
end
```

**New `handle_call/3` clause** (the module has none today):

```elixir
@impl true
def handle_call({:set, layer, payload}, _from, state) do
  case read_spool() do
    cur when is_map(cur) ->
      st =
        cur
        |> Map.put(layer, payload)
        |> Map.put("updatedUtc", DateTime.utc_now() |> DateTime.to_iso8601())

      case safe(fn -> write_spool(st) end) do
        :ok -> {:reply, :ok, note_manual_override(state, layer)}
        _ -> {:reply, {:error, :write_failed}, state}
      end

    _ ->
      {:reply, {:error, :spool_unreadable}, state}
  end
end
```

- Reuses the SAME `read_spool/0` and `write_spool/1` private functions `publish/0` already uses (atomic tmp+rename, same `@out`/`@tmp` paths) — no second write path, no second file handle.
- Wraps the write in the module's EXISTING `safe/1` helper (`overlay_publisher.ex:122-128`: `rescue`/`catch` → `:skip`). This matters: `write_spool/1` uses bang functions (`File.write!`/`File.rename!`) and can raise on exactly the torn-write/EPERM race this whole D-A3 effort exists to eliminate — without `safe/1`, a transient file-system race on a `set/2` call would crash the `OverlayPublisher` GenServer (taking the entire overlay feed down) instead of degrading to an honest `{:error, :write_failed}` reply. `write_spool/1` itself returns `:ok` (from `File.rename!/2`) on success or `:skip` on a JSON-encode failure; both non-`:ok` outcomes collapse to the same `{:error, :write_failed}` reply.
- `layer in ["lowerThird", "caption", "ticker", "onAir"]` matches the four layers named in the `POST /overlay/update` endpoint contract above (the real spool key is `"onAir"`, capital A — confirmed at `production/schemas/broadcast.schema.json`'s own `onAir` property, `lib/sp/show/overlay_publisher.ex:89`'s `read_spool/0` default, and `viewer/command_center.cjs:909/916`; a lowercase `"onair"` guard clause would write a dead key no reader consumes while still returning `accepted: true` — a false-positive success receipt, caught and fixed in this pass); any other value is rejected by the guard clause (`FunctionClauseError`, caught upstream by the controller's schema validation against `broadcast.schema.json` before `set/2` is ever called).
- `note_manual_override/2` is defined in the next section — it only does bookkeeping for `layer in ["caption", "ticker"]`; for `"lowerThird"`/`"onAir"` it is a no-op passthrough, because the tick handler (below) never touches those two keys.

## Write-race precedence: manual `set/2` vs. the 2000ms tick

**The race:** `handle_info(:tick, state)` calls `publish/0` every 2000ms, which unconditionally `Map.put`s the `"caption"` and `"ticker"` keys from `SP.Brain.Director.broadcast()`. Before this spec, an operator's `set/2` write to `"caption"` or `"ticker"` would be silently clobbered by the very next tick, at most 2000ms later, with nothing to prevent it.

**The mechanism this spec introduces — `manual_override_until`, per-layer, N = 10 000 ms:**

- `OverlayPublisher`'s state gains a new field: `manual_override_until :: %{optional(String.t()) => integer()}`, a map from layer name (`"caption"` | `"ticker"`) to a `System.monotonic_time(:millisecond)` deadline. `init/1`'s initial state becomes `%{manual_override_until: %{}}` (was `%{}`).
- `@manual_override_ms 10_000` — a new module attribute. 10 seconds = 5 tick cycles at the current 2000ms cadence: long enough that a manual write visibly sticks against the very next tick (the concrete bug being fixed), short enough that the feed self-heals within one Director-broadcast cycle if the operator does nothing further (no separate "release" step, no operator action required to resume automatic ticker/caption updates).
- `note_manual_override(state, layer)` (called from `handle_call/3` above): for `layer in ["caption", "ticker"]`, sets `manual_override_until[layer] = System.monotonic_time(:millisecond) + @manual_override_ms`. For any other layer, returns `state` unchanged.
- `publish/0` (the tick body) changes from unconditional `Map.put` to a per-key guarded put:

```elixir
defp publish(state) do
  bc = SP.Brain.Director.broadcast()
  lines = if is_map(bc), do: Map.get(bc, :lines, []), else: []
  texts = # ...unchanged extraction...

  if texts != [] do
    case read_spool() do
      cur when is_map(cur) ->
        now = System.monotonic_time(:millisecond)
        cur
        |> maybe_put(state, now, "caption", %{"visible" => true, "lang" => "en", "text" => hd(texts)["text"]})
        |> maybe_put(state, now, "ticker", Enum.drop(texts, 1) ++ [@ledger])
        |> Map.put("source", "uni-producer (in-app)")
        |> Map.put("updatedUtc", DateTime.utc_now() |> DateTime.to_iso8601())
        |> write_spool()

      _ ->
        :skip
    end
  end
end

defp maybe_put(spool, state, now, layer, value) do
  deadline = Map.get(state.manual_override_until, layer)
  if is_integer(deadline) and now < deadline do
    spool  # a manual set/2 owns this layer for now — do not clobber it
  else
    Map.put(spool, layer, value)
  end
end
```

- `handle_info(:tick, state)` is updated to call `publish(state)` (was `publish()`, arity 0) so the guard has the override map to check.
- Scope is intentionally per-key, not "skip the whole tick": if the operator manually sets `"caption"` only, the tick continues updating `"ticker"` normally (and vice versa), and any other spool field the tick never touches (`onAir`/`lowerThird`/`clock`/`music`/`brand`/`evidence`) is unaffected either way.
- `"lowerThird"` and `"onAir"` need no override bookkeeping: the tick handler never writes those keys today (confirmed above — `publish/0` only ever `Map.put`s `"caption"` and `"ticker"`), so there is no clobber risk for `set/2` calls against those two layers.

## `command_center.cjs` change

- `writeState` STOPS calling `fs.writeFileSync`/`renameSync` directly.
- Replaces the file I/O with `httpPostJson(COLONY_HOST, 4000, "/overlay/update", { layer, payload, force, source: "command_center" })`.
- Retries on 5xx with exponential backoff (max 3 tries, 100/300/900ms).
- Falls back to direct-file write ONLY if all three retries fail AND `PROC.env.UNI_OVERLAY_FALLBACK == "1"` (audited, temporary).

## FALSIFIES

Per CLAUDE.md's science-gate discipline #4 (pre-registered PASS + FALSIFIES before the run — every
registered claim needs both, judged only against what was registered; matching the pattern already
landed in `SPEC_uni_self_audit.md`'s "FALSIFIES" section): this spec's two trust claims are
falsified by —

> **Sole-writer claim** — any observed write to `viewer/runtime/broadcast.json` from a process
> other than the supervised `SP.Show.OverlayPublisher` GenServer (via its `write_spool/1`),
> INCLUDING `command_center.cjs`'s own retained direct-file-write fallback path firing while
> `PROC.env.UNI_OVERLAY_FALLBACK == "1"` — see "`command_center.cjs` change" below; that path is a
> known, named, temporary exception to this claim, not a silent one, and this FALSIFIES condition
> applies to it too if it fires without the three-retry precondition being met.

> **Write-race precedence claim** — a `set/2` write to `"caption"` or `"ticker"` that is observably
> overwritten by the very next `:tick` (≤2000ms later) while still inside its 10 000ms
> `manual_override_ms` window; OR a manual override that is NOT self-healed (the tick resumes
> writing that layer) within 10 000ms + one tick cycle (12 000ms) after the deadline passes.

Either disagreement means the corresponding claim is not actually true of the running system and
must not ship as accepted before the root cause is found. This is also exactly what the write-race
unit test in "Test coverage the plan owes" (below) exercises pre-ship.

## Test coverage the plan owes

- `ui/test/sp_ui_web/overlay_controller_test.exs`: accept, reject on fence, force bypasses the fence and returns `accepted: true`. (Corrected from `test/ui/overlay_controller_test.exs` — no `test/ui/` directory exists in this repo. The Phoenix app's real tests live under `ui/test/sp_ui_web/`, confirmed live alongside the existing `ui/test/sp_ui_web/overlooker_live_test.exs` and `ui/test/sp_ui_web/stream_qa_test.exs`. Does NOT assert an audit row appears — per "Phoenix implementation" above, `OverlayController.update/2` does not call `SP.Audit.Writer` in this pass; that path is `command_center.cjs`'s separate follow-up call and is covered by `SPEC_fence_override_forwarding.md`'s `audit_fence_override_test.exs` instead, not duplicated here.)
- Regression test: a synthetic race that would previously trigger EPERM now hits Phoenix cleanly. Passes.
- NEW — unit coverage for `OverlayPublisher.set/2` itself (not just the controller boundary above): `:ok` on a valid layer/payload; `{:error, :write_failed}` when the spool write fails; `{:error, :spool_unreadable}` on a torn read; a `set/2` call for `"caption"` immediately visible in the spool. No suite exercises `OverlayPublisher` today (confirmed: no existing test references the module). This spec places that suite at `ui/test/sp/show/overlay_publisher_test.exs` (corrected from an earlier draft's `test/sp/show/overlay_publisher_test.exs` — that path is picked up ONLY by the root `stratified_palimpsest` app's `mix test`, confirmed live: root `mix.exs` has `deps: []` and no `test_paths` override, `ui/mix.exs` also has none, so `cd ui && mix test` scans `ui/test/**` only and never `test/**`, per `docs/EVIDENCE.md`'s documented two-suite split. `OverlayPublisher` needs `Jason`, which is only a compiled dependency inside `ui` — via its `{:stratified_palimpsest, path: ".."}` path dependency, `ui`'s `mix test` compiles this root-app module too, so a test file physically living under `ui/test/` can `alias SP.Show.OverlayPublisher` and exercise it with `Jason` present. `SP.Show.OverlayPublisher` itself only ever runs inside `ui`'s supervision tree today — `ui/lib/sp_ui/application.ex:23` starts `SP.Show.Supervisor`, which is the ONLY place `SP.Show.OverlayPublisher.start_link/1` is called — confirming the module's own `@moduledoc` claim that the Phoenix node is the only place it runs).
- NEW — unit coverage for the write-race precedence: set `"caption"` via `set/2`, advance the clock (or send `:tick` directly) within the 10s window, assert the tick did NOT overwrite `"caption"`; advance past 10s, send `:tick` again, assert it now DOES overwrite. Same in the same suite as above.

## Non-goals

- This SPEC does NOT change the layer payload shapes. `broadcast.schema.json` continues to be the single source of truth for those.
- This SPEC does NOT remove `SP.Show.OverlayPublisher` — that is the sole writer, unchanged. `set/2` and its `handle_call/3` clause are a new entry point on the same supervised process; they do not add a second writer.

## Cross-references

- `production/mcp/SPEC_fence_override_forwarding.md` — the audit path for force=true.
- `production/docs/OS_SPOOL_POLICY.md` — the enclosing single-writer-per-spool policy.
