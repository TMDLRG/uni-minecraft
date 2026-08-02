# SPEC — `uni_self_audit` MCP verb (C-C2)

**Status:** SPEC. Awaits `/lab-team-review` before implementation lands in `production/mcp/server.py`.
**Author of record:** UNI OS+MIND Deepening Plan workstream C-C2.
**Ship gate:** MERGED VERDICT required (adding a new MCP verb, even read-only, is a plan-tier change).
**Revision:** rewritten in full against the REVISE verdict at `docs/receipts/lab_team_review_85b0e8c.md`
(5/5 personas, HEAD `85b0e8c`). Every `file:line` citation below was re-read against the live repo
during this pass; where a citation had shifted or a claim was ungrounded it is corrected, not patched
over. See "What changed" at the bottom for a section-by-section diff against the reviewed draft.
That rewrite was then re-reviewed (5/5 personas, MERGED VERDICT SIGN_WITH_CHANGES, see
`docs/receipts/lab_team_review_uni_self_audit_85b0e8c_v2.md`) and the named concerns from that pass
were applied directly to this file (envelope-conformance exception cross-referenced in
`SPEC_uni_public_mcp.md`, the fabricated `active_organs` example replaced with real organ atoms,
`novelty_gain`'s public annotation, the probe-concurrency/latency budget, the `memory_bin_path`
depth-independent relativization fix, the FALSIFIES/test-coverage gaps) — see that receipt's
"Addendum — named changes applied (pass 3)" section for the concern-by-concern disposition.

---

## Purpose

Today UNI is probed from outside (`/producer/health`, `viewer/verify_colony.cjs`). It has no
first-class way to **attest** its own state through one signed envelope. `uni_self_audit` is that
verb: a machine-readable state attestation — JIT/scheduler facts, live per-kin metadata, a
board-state commitment hash, and the two existing external gates (colony/phoenix), all in one call.

This is a health-check-and-hash dump, not a narration. Per CLAUDE.md's claim-fence discipline
("Do not surface gland/precision/store floats as 'felt' states" — CLAUDE.md, Heavy science-gate
discipline §1), this spec and its help text must never describe the tool as UNI "narrating" or being
"asked" its state in the first person. Use mechanical language only.

## Signature

```python
@mcp.tool(structured_output=True)
@_threaded
def uni_self_audit() -> Dict[str, Any]:
    """
    Read-only self-attestation. Evidence class C. No approval required.
    Rate-limited on the public MCP surface (E-E1, get_self_audit proxy); unlimited on the
    production MCP.
    """
```

`@_threaded` is required, not optional: this tool does a subprocess call (`verify_colony.cjs`), two
blocking HTTP GETs (`/producer/health`, the new `/internal/self_audit` below), and (transitively,
inside the Elixir side) file hashing — all blocking I/O. Every one of the 9 existing read-only tools
in `production/mcp/server.py` follows this exact `@mcp.tool(structured_output=True)` + `@_threaded`
pattern for the same reason (server.py:396–406 defines `_threaded`; server.py:424–539 is every
existing read-only tool using it). A bare `@mcp.tool()` with neither decorator — the draft reviewed
at 85b0e8c — would block the FastMCP event loop on every call.

## Result shape

Follows the SAME envelope every other tool in this file returns: `metadata()` (server.py:91–118),
a flat `{ok, tool, data, evidence_class, provenance, help, docs}` (+ `audit_id`/`how_to_fix` where
applicable). **This does NOT conform to `production/schemas/envelope.schema.json`** (which requires
a nested `{schema_version, envelope, result}` shape with `additionalProperties: false` at both
levels — envelope.schema.json:6–46). That schema is aspirational: none of the 26 existing
`@mcp.tool(structured_output=True)`-decorated tools in `production/mcp/server.py` produce it today
(live count, re-verified: `get_show_state, list_sources, list_scenes, list_clips, list_segments,
list_guests, caption_status, approvals_pending, approvals_status, cut_to, set_music_volume, duck,
narrate, set_overlay, roll_clip, start_segment, set_layout, panic, open_session, close_session,
command, remove_guest, admit_guest, schedule, start_broadcast, stop_broadcast` — 26, not 25),
`metadata()` is the only envelope-builder that exists,
and this spec is not the place to unilaterally migrate the whole server. `uni_self_audit` follows
current precedent (`metadata()`) like every sibling tool; `envelope.schema.json` stays a stated
future migration target, tracked separately, not claimed as met here.

```json
{
  "ok": true,
  "tool": "uni_self_audit",
  "data": {
    "jit_active": true,
    "on_chip": {
      "emu_flavor": "jit",
      "schedulers_online": 16,
      "logical_processors": 16,
      "dirty_cpu_schedulers": 10
    },
    "kins": [
      {
        "id": "UNI-9-2",
        "kin": 9,
        "active_organs": ["interoception", "chemotaction", "proprioception", "vision",
          "social_sense", "camera_control", "locomotion", "strategist", "motor_cortex", "homeostat"],
        "novelty_gain": 0.0,
        "memory_bin_path": "runs/colony/UNI-9-2.bin",
        "memory_bin_sha256": "…",
        "memory_bin_size_bytes": 1234567,
        "last_saved_utc": "2026-07-13T…"
      }
    ],
    "board_snapshot_hash": "sha256:…",
    "colony_gate": {
      "colony_count": 5,
      "rcon_players": 6,
      "director_present": true,
      "verdict": "PASS"
    },
    "phoenix": {
      "producer_up": true,
      "director_up": true,
      "driver": ":producer",
      "verdict": "LIVE"
    },
    "generated_at": "2026-07-13T…"
  },
  "evidence_class": "C",
  "provenance": { "server": "uni-production-mcp", "version": "…", "git_commit": "…", "timestamp": "…" },
  "help": "…",
  "docs": "uni://prod-mcp/guide"
}
```

Corrections from the reviewed draft, with reasons in Sources below:
- `jit_flavor: "jit"` (a string with no producer) → `jit_active: true` (a boolean, sourced from the
  real `OnChip.jit?/0`), kept separate from `on_chip.emu_flavor` so the two never collide in
  name/type again.
- `on_chip` now carries exactly `OnChip.info/0`'s real four keys, with `system_architecture` /
  `erts_version` / `otp_release` / `elixir_version` / `smp_support` dropped (no producer existed for
  any of them).
- `kins[]` drops `genome_lineage` (out of v1 scope — see Sources) and gains `kin` (the real integer
  already present on every board row).
- `memory_bin_path` corrected to the real per-agent naming convention
  (`runs/colony/UNI-9-2.bin`, from `colony.ex:108`'s `#{username}.bin`) and is shown already
  relativized — see Sources for the exact relativization step.
- `active_organs`'s example value is corrected to atoms `Genome.active_organs/1` can actually
  produce. The reviewed draft's `["metabolism", "hormones", "motor_control"]` does not exist in the
  real organ registry (`@prereqs`, `genome.ex:19-39`: `:hormones` is not an organ at all —
  `SP.Brain.Hormones` is a stress-computation module, not a `growth_plan` entry — and the real motor
  organ atom is `:motor_cortex`, not `:motor_control`). The corrected example instead shows the full
  `growth_plan` of the live `homeostat_colony/0` lineage (`genome.ex:353-363`, the lineage named at
  `agent.ex:210`): `default/0`'s 8 base organs (`genome.ex:224-228`) plus `:motor_cortex` and
  `:homeostat`, all 10 verified present in `@prereqs`. **Order caveat, stated honestly because it was
  not re-derived by running the code:** `Genome.active_organs/1` calls `repair/1` (`genome.ex:502-512`),
  which sorts the plan by `depth/1` (prerequisite-chain depth) and de-duplicates via
  `closure/1`'s `MapSet.to_list/1` (`genome.ex:650-653`) — same-depth ties (e.g. `vision` and
  `chemotaction`, both depth 0) resolve via `MapSet`'s internal order, which this spec pass did not
  execute the code to observe and does not claim byte-exact. Field-provenance/flip tests (Test
  coverage below) MUST assert `active_organs` as a **set** (`Enum.sort/1` both sides, or
  `MapSet.equal?/2`), never an exact-order list compare.
- `novelty_gain` carries an explicit semantic annotation wherever this spec or its public proxy
  describes the field (see "Public-surface exposure" below): it is a Dirichlet
  parameter-information-gain / epistemic-value term (`Map.get(brain.dna, :novelty_gain, 0.0)`,
  CLAUDE.md hard invariant #4's information term), not a felt state or a preference signal, and
  callers/docs must not narrate it as "curiosity measured at N" or similar.

## Registration in `production/mcp/server.py`

Registering `uni_self_audit` moves THREE places together, all required — mismatch between any two
of them raises `RuntimeError` at server boot (`_verify_tool_consistency()`, server.py:922–945):

1. Add the `@mcp.tool(structured_output=True)` + `@_threaded` function itself under the READ-ONLY
   TOOLS block (server.py:421–539), alongside `get_show_state` / `list_sources` / etc. Not added to
   `MUTATING_TOOLS`; no approvals wrap.
2. Add the literal string `"uni_self_audit"` to the `read_only = {...}` set inline inside
   `_verify_tool_consistency()` (server.py:928–932). This set is duplicated by hand, not derived —
   omitting this step makes `create_server()` raise `RuntimeError` (`extra_help` mismatch) at boot
   even though the tool itself is correctly decorated.
3. Add a matching `TOOL_HELP["uni_self_audit"]` entry in `production/mcp/help.py` (bijective with
   every tool name per `help.py:4–5, 55–56`) — omitted, `_verify_tool_consistency()` raises the same
   way (`missing_help` mismatch).

## New Elixir/Phoenix work this spec introduces

`production/mcp/server.py` is a separate Python FastMCP process from the Elixir BEAM node that runs
the colony (`SP.Runtime.*`, `SP.Brain.*`). `colony_gate` and `phoenix` already name real, working
bridges for two of the four sources (a subprocess shell-out and an existing HTTP GET). `on_chip`,
`kins`, and `board_snapshot_hash` have no such bridge today — this is not an implementation detail,
it is a missing integration this spec must design, not assume.

**Chosen transport: a new Phoenix HTTP route, `GET /internal/self_audit`, on the SAME router that
already serves `/producer/health`** (`ui/lib/sp_ui_web/router.ex:27`, `scope "/", SpUiWeb do
pipe_through :api`). This is the same app/BEAM VM as `SP.Runtime.*` — `SP.Show.Bootstrap`/
`SpUi.Application` supervises `SP.Show.Supervisor` (which owns Colony/Director) directly inside this
same Phoenix node (`lib/sp/show.ex:9-12`), exactly as `HealthController.producer/2`
(`ui/lib/sp_ui_web/controllers/health_controller.ex:11-19`) already calls `SP.Show.status/0`
in-process with zero RPC. `uni_self_audit`'s Python tool reaches `on_chip`/`kins`/
`board_snapshot_hash` the same way `phoenix` already reaches `producer_up`/`driver`: one plain HTTP
GET to `:4000`. No distributed-Erlang cookie/`Node.connect` is needed (unlike the OFF-node
`runs/probe_colony.exs` / `runs/sample_surface.exs` / COLLECTOR_RCON_BRIEF pattern, which exists
because THAT collector runs as its own separate Erlang node — this controller does not).

**Named exactly, matching the existing `HealthController`/`health_controller.ex` convention
(`router.ex:27`)**: module `SpUiWeb.SelfAuditController`, file
`ui/lib/sp_ui_web/controllers/self_audit_controller.ex`, action `:index`, wired as
`get "/internal/self_audit", SelfAuditController, :index` in the same `scope "/", SpUiWeb do
pipe_through :api` block `HealthController.producer/2` already lives in.

`GET /internal/self_audit` (NEW — not yet built; this spec specifies its exact behavior):

- `jit_active` ← `SP.Runtime.OnChip.jit?/0` (`on_chip.ex:15-17`), verbatim boolean.
- `on_chip` ← `SP.Runtime.OnChip.info/0` (`on_chip.ex:20-28`), verbatim map — no re-keying.
- `kins[]` — one entry per live board row (`SP.Runtime.Board.all/0`, `board.ex:29-34`; EVERY row
  already carries `:username` and `:kin` — agent.ex `publish/1`, agent.ex:398-417 — so "filter kin
  rows" in the reviewed draft was a misnomer; every live agent already is one). For each row:
  - `id` ← `row.username`, `kin` ← `row.kin`. Both real, present today, zero new work.
  - `active_organs` ← `SP.Brain.Genome.active_organs(brain.dna)` (`genome.ex:497`), NOT sourced from
    the board row (Board never carries it). Reachable because this controller runs in-process in
    the same VM as the agent: look the row's `username` up in `SP.Runtime.Registry`
    (`@registry SP.Runtime.Registry`, `supervisor.ex:20`) and call `:sys.get_state(pid)` — the same
    `Registry.lookup(reg, u)` + `:sys.get_state(pid)` two-step already named and used at
    `runs/probe_curiosity.exs:30-32` (there wrapped in `:rpc.call/4` because that script runs as its
    OWN separate Erlang node over distributed Erlang; this in-process controller calls
    `Registry.lookup/2` and `:sys.get_state/1` directly, no `:rpc.call` needed — see
    `docs/observability/COLLECTOR_RCON_BRIEF.md:173-181` for the same pattern narrated) to get
    `brain.dna`, then call `Genome.active_organs/1` on it. This function is already exercised live
    on this exact path today (`agent.ex:132, 136`), just never externally exposed.
  - `novelty_gain` ← `Map.get(brain.dna, :novelty_gain, 0.0)` off the SAME `:sys.get_state(pid)`
    read used for `active_organs` above (one probe, two fields) — the identical mechanism named
    in `docs/observability/COLLECTOR_RCON_BRIEF.md:176-186` ("probe:32"/"probe:34"). **This is a
    blocking synchronous GenServer call, not an O(1) board read** — each live kin costs one message
    round-trip to that agent's own mailbox. **Named concurrency strategy (not left open): probes run
    IN PARALLEL via `Task.async_stream/3` over the snapshot's kin list**, `max_concurrency:
    length(kins)` (bounded by `colony.ex:23`'s `@max_kin 9` ⇒ at most 10 concurrent probes,
    trivial for the BEAM scheduler), each probe's own timeout **500ms**, and an
    **overall-request deadline of 1500ms** for the whole `kins[]` fan-out (`Task.async_stream`'s
    own `:timeout` option set to 1500, not per-task) — chosen to sit safely under the tool's own
    public rate-limit window of 1 req/source/5s (reconciled in both spec files) even stacked with
    `colony_gate`'s subprocess shell-out and the `phoenix` HTTP GET, both of which run BEFORE the
    `kins[]` fan-out in the tool's own call order (Sources below), not concurrently with it. On a
    per-kin 500ms timeout OR the 1500ms overall deadline, that kin's `active_organs`/`novelty_gain`
    degrade to `null` with the row still returned (`id`/`kin` still populated from the Board
    snapshot); the whole `/internal/self_audit` call never fails solely because one probe was slow.
    **Isolation from a dead process (named, not left to the timeout alone):** each kin's probe runs
    in its OWN `Task` (`Task.async_stream`'s per-item isolation already gives this) wrapped in a
    `try/rescue` around the `Registry.lookup/2` + `:sys.get_state/1` pair — `Registry.lookup`
    returning `[]` (agent already dropped from the Registry) or `:sys.get_state` raising/timing out
    because the target process died between `Board.all/0`'s snapshot and this probe reaching it
    (`agent.ex:357-359`'s `terminate/2` calls `Board.drop/1` on ordinary death; `Board.all/0`,
    `board.ex:29-34`, is a point-in-time ETS read taken once before any per-kin probe runs, so a kin
    can be live in the snapshot and already gone by probe time) both degrade that SAME kin's
    `active_organs`/`novelty_gain` to `null`, exactly like the 500ms-timeout case — one dead or
    dying agent can never crash or partially-fail the rest of the `kins[]` fan-out.
  - `memory_bin_path` — **do NOT copy-paste `colony.ex:21`'s private `@repo_root =
    Path.expand("../../..", __DIR__)` idiom into the new controller.** That idiom is only correct
    for a file 3 directory levels below repo root (`lib/sp/brain/colony.ex`), a depth shared by
    every existing user of the pattern — confirmed live: `colony.ex:21`, `director.ex:14`,
    `lineage.ex:25`, `overlay_publisher.ex:23` all define the identical private attribute at the
    identical depth (`lib/sp/<subdir>/*.ex`). The new controller lives at
    `ui/lib/sp_ui_web/controllers/self_audit_controller.ex` — confirmed live, ONE level deeper
    (`ui/lib/sp_ui_web/controllers/`) than every existing `@repo_root` user — so a literal copy of
    `"../../.."` from that file resolves to `ui/lib`, not repo root, and a downstream
    `Path.relative_to/2` against that wrong root silently returns its input UNCHANGED (no error)
    when the prefix doesn't match, leaking the raw absolute host path through the exact field the
    Non-goals section swears never leaks it. **Named fix (new work, part of this spec, not a
    pre-existing-code edit): export a new public function `SP.Brain.Colony.repo_root/0`** (`def
    repo_root, do: @repo_root`, added next to the existing private attribute at `colony.ex:21`)
    and have the new controller call `SP.Brain.Colony.repo_root/0` instead of re-deriving its own
    relative-path arithmetic. Compute the absolute path with it exactly as `colony.ex:99-109` does
    — `Path.join(SP.Brain.Colony.repo_root(), "runs/colony/#{username}.bin")` — then **relativize
    only the value placed in the JSON response**: `Path.relative_to(abs_path,
    SP.Brain.Colony.repo_root())`, yielding `"runs/colony/UNI-9-2.bin"`. The absolute host path is
    never returned by `/internal/self_audit`, never by `uni_self_audit`, and never by the public
    `get_self_audit()` proxy — but the STAT/HASH/READ below runs against the ABSOLUTE path, not the
    relativized string (whose resolution would otherwise depend on the Phoenix process's cwd, not
    guaranteed to equal repo root under the documented `cd ui && iex -S mix phx.server` launch).
  - `memory_bin_sha256` / `memory_bin_size_bytes` / `last_saved_utc` — read the file at the ABSOLUTE
    path above (if it exists) off the SAME host/filesystem this controller runs on (colocated with
    `runs/colony/`; the Python MCP process is NOT colocated — see the Non-goals note on
    `THINKER`/studio-side below — so this hashing MUST happen here, not in Python), then place only
    the relativized path string (never the absolute one) in the JSON response alongside the
    resulting hash/size/mtime. `last_saved_utc` from `File.stat!/1`'s mtime, ISO-8601 UTC. If the
    file is missing (agent alive, never yet saved), these three fields are `null`, not an error.
  - `genome_lineage` — **dropped from v1.** It has no storage representation to source from: the
    resolved lineage name (e.g. `"homeostat_colony"`) is matched once from `UNI_LINEAGE` inside
    `lineage_from_env/0` (`agent.ex:208-217`, the literal string appears at `agent.ex:210`) and
    immediately converted to a `%Genome{}` struct — the STRING itself is never stored on the
    `Agent` GenServer's own state and never published to `Board`. Prerequisite to add it back:
    (a) `SP.Runtime.Agent.init/1` would need to retain the resolved lineage-name string in its own
    state (today only `dna` is kept — `agent.ex:106-111`), and (b) this controller's
    `:sys.get_state(pid)` read (already happening for `novelty_gain`, above) would read that new
    field too. Neither exists today; not built in this pass.
- `board_snapshot_hash` ← `sha256` of `:erlang.term_to_binary(kins, [:deterministic])` (the
  `[:deterministic]` option, OTP 21+, guarantees byte-identical output for a given term regardless
  of map key insertion order — no hand-rolled JSON key-ordering/float-formatting rule needed), hex
  digest, prefixed `"sha256:"`. **Scope: exactly the redacted `kins[]` array this same response
  returns** — not the full unfiltered `Board.all/0` (which still carries Mind fields this spec
  deliberately excludes, per the claim-fence section below; hashing data the caller never receives
  is not a useful self-consistency check). Recompute over the identical `kins` term before encoding
  to JSON, so the hash and the array it claims to fingerprint are provably the same read.
- `colony_gate` and `phoenix` are UNCHANGED from the reviewed draft (correct as originally written):
  - `colony_gate` ← shell out to `node viewer/verify_colony.cjs $COLONY_HOST` and parse.
  - `phoenix` ← HTTP GET `http://$COLONY_HOST:4000/producer/health` (the EXISTING route,
    `router.ex:27`).
- `generated_at` ← ISO-8601 UTC now, generated by `uni_self_audit` at call time (not proxied from
  the Elixir side, so a slow Elixir round-trip is visible as a gap between this and any
  Elixir-side timestamp, honestly).

## Claim-fence field allowlist (binding)

The reviewed draft's Sources section said "iterate `Board.all/0`, filter kin rows" with no
field-level filter. A real board row (`agent.ex:398-417` `publish/1`) merges `SP.Runtime.Mind.of/2`
(`mind.ex:19-31`) VERBATIM: `context`, `stress`, `emotion`, `confidence`, `focus`, `intent`,
`report`. `report` is built by `SP.Brain.Awareness.report/1` (`awareness.ex:52-54`) and contains the
literal substring `"feel:#{emotion}"` — a direct hit on `claim_fence.json`'s `experience_family`
(`"feel(s|ings?)?"`, `claim_fence.json:27`) and a violation of CLAUDE.md's "do not surface floats as
felt states" rule. This spec's redesigned `kins[]` sourcing (above) never reads `Board.all/0` for
anything beyond `username`/`kin`, so this leak is structurally avoided by the new transport — but
the allowlist below is still the BINDING contract, stated explicitly so a future change to the
transport cannot silently reopen it:

**The ONLY fields that may ever appear in a `kins[]` row, internal or public:** `id`, `kin`,
`active_organs`, `novelty_gain` (if kept — it is, per above), `memory_bin_path` (relativized),
`memory_bin_sha256`, `memory_bin_size_bytes`, `last_saved_utc`.

**Explicitly EXCLUDED, internal and public, forever:** `report`, `context`, `stress`, `emotion`,
`confidence`, `focus`, `intent` — the entire `SP.Runtime.Mind.of/2` output. `/internal/self_audit`
must never read `Board.all/0`'s Mind-merged fields into its response; if a future change adds a
Mind-derived field to `kins[]`, that is a claim-fence review, not a routine edit.

## Sources

- `jit_active` ← `SP.Runtime.OnChip.jit?/0` (`on_chip.ex:15-17`), in-process (same as today: this
  spec's Python tool still needs the `/internal/self_audit` bridge to reach it — see above).
- `on_chip` ← `SP.Runtime.OnChip.info/0` (`on_chip.ex:20-28`), via the same bridge.
- `kins` / `board_snapshot_hash` ← HTTP GET `http://$COLONY_HOST:4000/internal/self_audit` (NEW
  route — see "New Elixir/Phoenix work" above for its exact behavior).
- `colony_gate` ← shell out to `node viewer/verify_colony.cjs $COLONY_HOST` and parse (unchanged,
  correct as originally specified).
- `phoenix` ← HTTP GET `http://$COLONY_HOST:4000/producer/health` (unchanged, correct as originally
  specified).
- `generated_at` ← ISO-8601 UTC now, computed in the Python tool.

## Non-goals

- Does NOT mutate anything.
- Does NOT reveal secrets. The result is publishable through cloudflared, subject to the field
  allowlist above.
- Does NOT include per-tick tensor data.
- Does NOT return an absolute host filesystem path under any field, ever (see relativization above).
- `memory_bin_sha256` is **best-effort / eventually-consistent, not a live invariant.**
  `SP.Brain.MC.save/2` (`mc.ex:552-554`) is `File.write!(path, :erlang.term_to_binary({dna, model}))`
  — a direct, non-atomic, in-place write with no temp-file + rename. `/internal/self_audit` reads
  and hashes each `.bin` off disk with nothing serializing that read against a concurrent save on
  the same path from that kin's own tick loop; a read landing mid-write can hash a torn file. This
  spec does not require a write-side fix (out of scope: a source change to `mc.ex`, not a spec
  change) — it requires callers to treat a `memory_bin_sha256` value as "what a snapshot read saw
  at that instant," never as a commitment guaranteed to match a concurrently-running save. See Test
  coverage below for the degraded-mode test this scoping requires.
- `genome_lineage` is out of v1 scope (see "New Elixir/Phoenix work" above for the named
  prerequisite to add it back).

## FALSIFIES

Per CLAUDE.md's science-gate discipline #4 (pre-registered PASS + FALSIFIES before the run — every
registered claim needs both, judged only against what was registered): `uni_self_audit`'s trust
claim is falsified by any of —

> `colony_gate`/`phoenix` as reported by `uni_self_audit` disagrees with a same-moment direct run of
> `viewer/verify_colony.cjs` / `producer/health` against the same host.

> `on_chip`/`jit_active` as reported by `uni_self_audit` disagrees with a same-moment direct read of
> `:erlang.system_info(:emu_flavor)` / `:erlang.system_info(:schedulers_online)` /
> `:erlang.system_info(:logical_processors_available)` / `:erlang.system_info(:dirty_cpu_schedulers)`
> against the same BEAM node — the exact four calls `OnChip.info/0`/`OnChip.jit?/0` wrap
> (`on_chip.ex:15-28`), run independently rather than trusted via the tool's own citation.

> Any `kins[]` row's `active_organs`/`novelty_gain` as reported by `uni_self_audit` disagrees with a
> same-moment, independently-run `Registry.lookup(SP.Runtime.Registry, id) + :sys.get_state(pid)`
> probe against the same agent on the same host (the same two-step read `/internal/self_audit`
> itself performs, executed a second time by the test/falsifier, not merely re-trusted).

A disagreement on any of the three means the tool is not a faithful proxy of the sources it names
and must not ship as `evidence_class: "C"` until the divergence is root-caused. `on_chip`/`kins[]`
are named here explicitly because — unlike `colony_gate`/`phoenix`, which already had
`viewer/verify_colony.cjs` as independent ground truth before this spec existed — they are entirely
NEW data introduced by the not-yet-built `GET /internal/self_audit` endpoint and are the sole
enforcement point of the claim-fence allowlist (above); leaving them un-falsified would be exactly
the "fabricated-but-schema-valid" exposure this discipline exists to catch. This is also exactly
what the Test coverage's cross-check tests (below) exercise pre-ship.

## Test coverage the plan owes

`test/production/mcp/uni_self_audit_test.py` — replacing the reviewed draft's three mechanical
shape-only assertions (which an implementation could pass by hardcoding schema-valid-looking values
while fabricating half of what it claims to observe):

1. **Field-provenance / fixture tests**, one per source: stub `/internal/self_audit`'s HTTP response
   (fixture covering `on_chip`, `jit_active`, `kins`, `board_snapshot_hash`), stub the
   `verify_colony.cjs` subprocess's stdout, stub the `producer/health` HTTP response. Assert every
   field in the tool's output is DERIVED from the matching fixture value, not a literal.
   `active_organs` is a **set-equality** assertion (`Enum.sort/1` or `MapSet.equal?/2` both sides),
   never an exact-order list compare — `Genome.active_organs/1`'s `repair/1`-driven sort/dedup order
   for same-depth organs is not claimed byte-exact by this spec (see the corrected worked example
   above).
2. **Flip test, one per field family** (not a single illustrative example — each of the 5 families
   below gets its own case): (a) `on_chip` — flip a stubbed `:erlang.system_info/1` value in the
   `/internal/self_audit` fixture and assert `on_chip`'s matching key moves; (b) `kins[]` — flip one
   kin's stubbed `active_organs` or `novelty_gain` and assert only that kin's row moves; (c)
   `board_snapshot_hash` — assert it changes when (b)'s fixture changes and stays fixed when nothing
   in `kins[]` changes; (d) `colony_gate` — bump the stubbed `rcon_players` by 1 and assert
   `colony_gate.verdict` moves where the change crosses the PASS/FAIL boundary; (e) `phoenix` — flip
   the stubbed `producer/health` body and assert `phoenix.producer_up`/`driver` move. Each proves its
   field is live-wired, not a constant.
3. **Degraded-source / partial-failure tests**, one per external dependency, matching every other
   read-only tool's `try`/`except` → `ok=False, evidence_class='pending'`, `how_to_fix=...` pattern
   (e.g. `server.py:428-446`, `452-456`, `480-489`):
   - `verify_colony.cjs` subprocess exits non-zero or times out → `colony_gate` degrades honestly.
   - `producer/health` GET times out / connection refused → `phoenix` degrades honestly.
   - `/internal/self_audit` GET unreachable → `on_chip`/`kins`/`board_snapshot_hash` degrade
     honestly (whole-tool `ok=False`, not a partial silent success).
   - A single kin's `.bin` file is missing or unreadable → that kin's `memory_bin_*` fields are
     `null` with the row still present, not a whole-tool failure (exercises the best-effort scoping
     in Non-goals above).
   - A single kin's `:sys.get_state(pid)` probe exceeds its 500ms per-agent timeout, OR the overall
     1500ms `kins[]` fan-out deadline is hit — that kin's `active_organs`/`novelty_gain` degrade to
     `null` with the row still present (`id`/`kin` populated), the REST of `kins[]` unaffected, and
     the whole tool call still returns `ok=True` (exercises the concurrency/timeout design above).
   - A kin is present in the `Board.all/0` snapshot but its `Agent` process has already died by probe
     time (`Registry.lookup` returns `[]`, or `:sys.get_state` raises because the pid is gone) — same
     degrade-to-null treatment as the timeout case, asserted as its own distinct test (a dead-process
     race is not identical to a slow-but-alive process, even though both resolve to `null`).
4. **Cross-check tests** (the FALSIFIES conditions above, exercised pre-ship):
   - `colony_gate`: run `viewer/verify_colony.cjs` directly against the same fixture/mock host and
     assert `uni_self_audit()`'s `colony_gate` section agrees field-for-field with that direct run.
   - `on_chip`: read `:erlang.system_info/1` directly (the same four calls `OnChip.info/0`/
     `OnChip.jit?/0` wrap, `on_chip.ex:15-28`) against the same BEAM node and assert `on_chip`/
     `jit_active` agree field-for-field.
   - `kins[]`: independently run `Registry.lookup(SP.Runtime.Registry, id) + :sys.get_state(pid)`
     against a fixture/mock agent and assert the tool's `active_organs`/`novelty_gain` for that kin
     agree (set-equality for `active_organs`, exact for `novelty_gain`) with that independent probe.
5. **`board_snapshot_hash` determinism test:** same `kins` term, re-encode via
   `:erlang.term_to_binary(kins, [:deterministic])` twice, assert identical hashes; a reordered-map
   (same keys/values, different insertion order) input must ALSO hash identically.
6. **`memory_bin_sha256` degraded-mode test** (not a determinism-of-hash-function test — that part
   is trivially true and was the reviewed draft's actual test): simulate a concurrent write during
   the read (e.g. truncate-then-rewrite the fixture `.bin` mid-test) and assert the tool still
   returns a result (does not crash), with the field documented/labeled as a best-effort read per
   the Non-goals scoping — not asserted as a guaranteed-consistent invariant.
7. **`_verify_tool_consistency()` boot test:** assert `create_server()` does NOT raise once
   `uni_self_audit` is registered per the three-step checklist above (i.e. exercise the actual
   registration mechanism, not just the tool function in isolation).
8. **Elixir-side controller tests** — `test/sp_ui_web/controllers/self_audit_controller_test.exs`
   (NEW, alongside the Python tests above; the Python fixture-based tests above hand-write a "clean"
   `/internal/self_audit` HTTP response and structurally cannot catch a real controller
   implementation bug in the claim-fence allowlist, the path relativization, or the timeout/
   dead-process handling — only an Elixir-side test against the real controller can):
   - **Claim-fence allowlist enforcement:** construct a fixture `Board` row carrying
     `Mind.of/2`-merged fields (`report` containing the literal `"feel:#{emotion}"`, plus `context`/
     `stress`/`emotion`/`confidence`/`focus`/`intent`) and assert NONE of those keys appear anywhere
     in a `kins[]` row the controller emits — even though the current design never reads those
     fields, this test guards the BINDING allowlist against a future edit re-merging them (per the
     Claim-fence section's own warning). Also assert a `kins[]` row contains ONLY the 8 allowlisted
     keys (`id`, `kin`, `active_organs`, `novelty_gain`, `memory_bin_path`, `memory_bin_sha256`,
     `memory_bin_size_bytes`, `last_saved_utc`) — no extra keys.
   - **Path relativization:** assert `memory_bin_path` in the controller's JSON response is never
     absolute (does not start with a drive letter or a leading path separator per the host OS) and
     resolves, joined against `SP.Brain.Colony.repo_root/0`, to the same file the controller actually
     hashed.
   - **Timeout/dead-process degrade:** a fixture agent that never replies within 500ms, and a
     fixture `Board` row whose `Agent` pid is already dead, both produce a `kins[]` row with
     `active_organs`/`novelty_gain` `null` and the controller's overall HTTP response still `200`
     with the rest of `kins[]` intact.

## Public-surface exposure

Under `uni-public-mcp` (E-E1), the tool name is `get_self_audit()`, proxying `uni_self_audit`
(C-C2) with the SAME field allowlist above and the SAME flat `metadata()`-shaped result. Rate-limited
to **1 req / source / 5s** — the SAME window as every other tool on that surface (see
`SPEC_uni_public_mcp.md`; this spec previously stated a different number here and
`SPEC_uni_public_mcp.md` stated yet a third — both now read 5s, see that file's "What changed"
note). This is what `get_self_audit()` returns when a client on the public surface calls it: a
machine-readable state attestation, not a narrated first-person report.

**`novelty_gain` field semantics (binding, both surfaces):** this field is a Dirichlet
parameter-information-gain / epistemic-value term (`Map.get(brain.dna, :novelty_gain, 0.0)` off the
kin's own genome; CLAUDE.md hard invariant #4's information term). It is **not** a felt state, a
preference, a mood, or "curiosity" in the narrated sense — it is a scalar that gates a standing
active-learning drive in the agent's own EFE calculation. Any documentation, help text, or client
built against `get_self_audit()`/`uni_self_audit` MUST NOT describe it as "how curious/interested
UNI is" or similar; the `help` string for both tools must state this field's actual meaning inline
(the Dirichlet information-gain sentence above, or a shorter paraphrase that preserves "information
term, not a felt/preference signal"). This is a naming/documentation control, not a value-transform —
the raw float still ships (dropping it would remove real information a legitimate caller, e.g. this
repo's own dashboards, needs), but it never ships unlabeled.

---

## What changed (against the REVISE verdict, `docs/receipts/lab_team_review_85b0e8c.md`)

1. **on_chip/jit_flavor** — rewritten to `OnChip.info/0`'s real 4-key shape; `jit_flavor` replaced
   by `jit_active` (bool), explicitly sourced from `OnChip.jit?/0`.
2. **kins[] sourcing** — `active_organs` re-sourced to `Genome.active_organs(brain.dna)` via a named
   in-process `:sys.get_state` probe (not `Board.all/0`); `novelty_gain` kept with the exact
   COLLECTOR_RCON_BRIEF probe mechanism named + its blocking-cost tradeoff stated; `genome_lineage`
   dropped from v1 with a named two-part prerequisite; `memory_bin_path` corrected to the real
   per-agent naming convention and given an explicit relativization step (never absolute, never
   crosses the public proxy raw).
3. **Claim-fence leak** — new explicit field-level allowlist section; leak also structurally avoided
   by the redesigned transport (kins[] no longer reads Mind-merged Board fields at all).
4. **envelope.schema.json** — reframed as aspirational/future; the spec now matches the REAL flat
   `metadata()` shape every other tool uses, and says so plainly instead of claiming false
   conformance.
5. **Transport** — named exactly: new `GET /internal/self_audit` on the existing `SpUiWeb` Phoenix
   router (same BEAM VM as `SP.Runtime.*`, modeled on the existing `/producer/health` route), full
   behavior specified.
6. **board_snapshot_hash** — canonicalization named (`:erlang.term_to_binary(kins, [:deterministic])`),
   scope named (the redacted `kins[]` array only), determinism test added.
7. **memory_bin_sha256** — rescoped as best-effort/eventually-consistent in Non-goals (MC.save/2's
   non-atomic write named as the reason); flip + degraded-mode tests added.
8. **Signature** — `@mcp.tool(structured_output=True)` + `@_threaded`, matching the 9 existing
   read-only tools' pattern, since this tool does blocking subprocess/HTTP/hashing work.
9. **Registration** — explicit 3-step checklist (tool decoration, `read_only` literal set at
   server.py:928-932, `help.py` `TOOL_HELP` entry) replacing the one-line note that omitted steps
   2-3 and would have crashed the server at boot.
10. **Rate limit** — reconciled to 1 req / source / 5s in both this file and
    `SPEC_uni_public_mcp.md` (previously 5s here, 30s there, 5s server-wide there — three numbers
    for one tool).
11. **Test coverage** — rewritten from 3 mechanical shape assertions to field-provenance, flip,
    degraded-source (one per dependency), cross-check-against-verify_colony.cjs, and two
    determinism/degraded-mode tests for the two hash fields.
12. **FALSIFIES** — added, matching CLAUDE.md's science-gate discipline #4.
13. **Framing** — "the being narrates its own state" / "ask UNI what is your state right now"
    replaced with "machine-readable state attestation" throughout.

Everything else (Non-goals' no-mutation/no-secrets/no-tensor-data lines, the `colony_gate`/`phoenix`
sourcing, the overall read-only/no-approval registration posture) checked out in the review and is
preserved unchanged.
