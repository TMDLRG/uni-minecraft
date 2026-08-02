# SPEC — `SP.Runtime.SpoolSensor` + `:os_sensorium` genome organ (D-A4)

**Status:** SPEC. Touches `lib/sp/runtime/spool_sensor.ex` (**NEW** file) + `lib/sp/brain/genome.ex`
(adds an opt-in organ; existing code paths unchanged). Awaits `/lab-team-review`.
**Ship gate:** MERGED VERDICT + byte-identity guard PASS.

**Re-verified against live repo 2026-07-12 (pass 3).** Pass 2 corrected five defects a prior independent
review found in the original draft (module-name collision, a fabricated `Genome` API, a test-file
collision, a name collision with an unrelated in-flight effort, and — found during that re-verification
pass — a `Board` API mismatch and a fabricated test helper); see "Corrections from prior draft" near the
bottom for that full list, including one item flagged but explicitly out of this spec's file scope. Pass
3 (this revision) is a direct-apply pass closing the ten named concerns from the 5-persona
`SIGN`/`SIGN_WITH_CHANGES` re-review of pass 2 — see "Refinements from the 5-persona re-review" at the
very bottom.

---

## Purpose

The Mind receives OS state today ONLY through `SP.Brain.Bridge` (Minecraft senses) and internal
metabolism/homeostat injects. It cannot ingest OS facts like "node2 down", "heartbeat.fails=2", "backup
snapshot stale" — even as passive exteroception.

D-A4 adds an opt-in `:os_sensorium` genome organ + a `SP.Runtime.SpoolSensor` process that tails
read-only OS NDJSON spools and holds parsed rows in its own bounded in-memory ring, readable via a
query API. **v1 ships the tailer module + the organ's presence/absence on the genome only** — it does
NOT yet fold any row into the Mind's observation vector (`qo`), and it does NOT yet auto-start a
`SpoolSensor` for any agent whose genome carries `:os_sensorium` (that wiring is unspecified — see
"Process wiring (future work, not in v1)" below). See "Coupling (future work, not in v1)" below for
exactly why the `qo` path is deferred, and what a follow-up spec must add for each.

**Disambiguation (read before touching either doc):** this is **not** the same "sensorium" as
`docs/specs/sensorium.md` (Part II of the separate, already in-flight A4 binocular-vision effort — the
`uni-sensorium` Python `Eye` pipeline, stereo fusion, the `:depth` factor). That effort already carries
its own SIGN-WITH-CHANGES verdict and a `depth-red-b` gate (`evidence/gates.ndjson`, verdict `PENDING`
as of 2026-07-13, pre-registered at `docs/specs/sensorium.md:5-40`). To avoid the two efforts being
conflated by name, this spec's genome organ atom is `:os_sensorium` (OS-log exteroception), never
`:sensorium`.

**The existing `SP.Runtime.LogSensor` (`lib/sp/runtime/log_sensor.ex`) is a completely different,
already-live component and is UNTOUCHED by this spec.** It is a `:logger` handler that counts
error/warning events via `:counters` (`install/0`, `log/2`, `drain/0`) and is wired into
`lib/sp/producer.ex:151` (`install()` in `init/1`) and `lib/sp/producer.ex:227` (`drain()` feeding the
Producer's `error_rate` modality, `lib/sp/producer/genome.ex:65` / `lib/sp/producer/codec.ex:139`). That
is a different active-inference system (`SP.Producer.*`, the Minecraft show-director AI) from the one
this spec extends (`SP.Brain.*`, the embodied agent). Nothing in this spec renames, wraps, or reroutes
`SP.Runtime.LogSensor` — it must keep working unmodified, verified by its own existing, untouched test
file `test/sp/runtime/log_sensor_test.exs`.

## Signatures

### `SP.Runtime.SpoolSensor` (NEW module — renamed from the prior draft's `SP.Runtime.LogSensor` to
avoid colliding with the real, live `SP.Runtime.LogSensor` described above)

```elixir
defmodule SP.Runtime.SpoolSensor do
  @moduledoc """
  Tail read-only NDJSON spools (heartbeat.ndjson, prod-mcp.ndjson, fleet_status.ndjson) and hold parsed,
  schema-validated rows in a bounded in-memory ring per source. Rows are validated against
  production/schemas/sensorium_envelope.schema.json.

  Distinct from, and does not touch, SP.Runtime.LogSensor (lib/sp/runtime/log_sensor.ex) — that module
  keeps counting error/warning events for the Producer's error_rate modality unchanged.
  """
  use GenServer

  @spec start_link(opts :: keyword()) :: GenServer.on_start()

  # opts:
  #   :spools => [%{path: String.t(), source: String.t()}]   default: heartbeat + prod-mcp
  #   :poll_ms => integer                                    default: 2000
  #   :max_rows_in_flight => integer                         default: 128 (bounded ring, PER SOURCE)

  @doc "The most recent (up to `n`) validated rows for one source, newest last. `nil` source = all sources merged, sorted by ts."
  @spec recent(source :: String.t() | nil, n :: pos_integer()) :: [map()]
end
```

**Why the ring lives in the process's own state, not `SP.Runtime.Board`:** the prior draft's Row
lifecycle called `Board.put(key: {:sensorium, source, i}, row)`. Re-checked against the live
`lib/sp/runtime/board.ex`: `Board.put/2` takes exactly `(username :: String.t(), row :: map())` — two
positional args, no `:key` option — and semantically it is a **per-agent single-row snapshot table**
(`:ets.insert(@table, {username, row})`, one row per key, always overwritten; `SP.Runtime.Supervisor`
lists it as one of exactly three children: a `Registry`, a `PartitionSupervisor`, and `Board`). It has no
concept of a composite `{source, i}` key or a bounded historical ring — every `put/2` on the same key
replaces the prior row outright. That call would not compile (wrong arity/shape) and would not behave as
described (no ring) even if patched to compile. `SpoolSensor` therefore owns its bounded ring directly in
its own `GenServer` state and exposes it via `recent/2` above; it does not read or write `Board` at all.

### `SP.Brain.Genome`

`SP.Brain.Genome.add_organ/2` does not exist anywhere in the codebase (confirmed by repo-wide search —
it appeared only in the prior draft of this spec). The real mechanism this codebase uses for opt-in
organs, used by every existing opt-in organ (`:metabolism` via `Genome.metabolism_primary/0`,
`lib/sp/brain/genome.ex:271-274`; `:homeostat` via `Genome.homeostat_l1_phase0/0`,
`lib/sp/brain/genome.ex:298-316`; `:sight_cortex` via `Genome.vision_primary/0`; `:motor_cortex` via
`Genome.motor_primary/0`), is:

1. Add the organ atom as a key in the `@prereqs` map (`lib/sp/brain/genome.ex:19-39`) — this is what
   populates `@organs`/`organs/0` (`@organs = Map.keys(@prereqs)`), so no separate registration step
   exists or is needed.
2. Add a constructor that starts from `default()`, appends the new atom to `growth_plan`, sets whatever
   struct fields the organ owns, and calls `repair/1` (prerequisite closure + topological sort) — the
   shape `homeostat_l1_phase0/0` (`genome.ex:298-316`) uses. (Correction: `metabolism_primary/0`,
   `genome.ex:271-274`, re-read directly, does **not** call `repair/1` — it's a plain
   `%{d | growth_plan: d.growth_plan ++ [:metabolism]}` update. That's harmless only because
   `:metabolism`'s sole prerequisite, `:interoception`, is already earlier in `default()`'s plan.
   `:os_sensorium` likewise has no prerequisites, so skipping `repair/1` would also be harmless — but
   this spec's constructor below calls it anyway, matching the safer general pattern that
   `homeostat_l1_phase0/0` and this constructor both follow.)
3. (Only if the organ is meant to add a sensory factor to the compiled model) add an entry to
   `@modalities` (`lib/sp/brain/genome.ex:49-130`) naming `organ: :os_sensorium`, which is what makes
   `active_modalities/1` (`genome.ex:490-494`) and thus `card/1`'s `mods` list include it.

This spec's v1 does **step 1 and 2 only**. Step 3 is explicitly **not** done in v1 — see "Coupling
(future work, not in v1)" for why and what step 3 would require.

```elixir
defmodule SP.Brain.Genome do
  # NEW @prereqs entry (mirrors :chemotaction, :vision — no prerequisite; this alone is what
  # registers the atom into `organs/0`, exactly like every other entry in the existing map):
  #   os_sensorium: []

  @doc """
  An OS-SENSORIUM lineage (D-A4, opt-in): the default UNI plus the `:os_sensorium` organ atom on
  `growth_plan` and an `os_sensorium_spools` list of configured sources. Like every constructor above
  (`metabolism_primary/0`, `homeostat_l1_phase0/0`, `vision_primary/0`, `motor_primary/0`) this is a
  PURE DNA-builder — it does not start, link, or supervise any process. Whether/how a
  `SP.Runtime.SpoolSensor` actually gets started for an agent carrying this organ is unspecified in v1
  — see "Process wiring (future work, not in v1)" below. v1: presence-only — no `@modalities` entry
  names `organ: :os_sensorium`, so `active_modalities/1` returns the SAME list as `default/0` and
  `card/1`'s compiled output is UNCHANGED. Byte-identical to `default/0` over the depth-5 Plan path
  (see "Byte-identity invariant"). Modeled on `homeostat_l1_phase0/0`'s `repair/1`-calling shape above
  (see the note under Signatures §2 on why `metabolism_primary/0` is the one exemplar that skips it).
  """
  def os_sensorium_primary(opts \\ []) do
    d = default()

    repair(%{
      d
      | growth_plan: d.growth_plan ++ [:os_sensorium],
        os_sensorium_spools: Keyword.get(opts, :spools, [
          %{path: "/var/lib/uni/broadcast/audit/heartbeat.ndjson", source: "heartbeat"},
          %{path: "/var/lib/uni/broadcast/audit/prod-mcp.ndjson",  source: "prod_mcp"}
        ])
    })
  end
end
```

**NEW defstruct field:** `os_sensorium_spools: []` (renamed from an earlier draft's `sensorium_spools` —
kept `os_`-prefixed for the same disambiguation reason the organ atom and module already are, so no
struct field in this codebase carries the bare, collision-prone word `sensorium`), parallel to the
existing `nursery: nil` field — runtime-only (read by whatever process-supervision code starts an
agent's `SpoolSensor`, once that wiring exists — see "Process wiring" below; not read by `card/1`),
back-filled via `Map.put_new(:os_sensorium_spools, [])` in `slow_defaults/1` (`genome.ex:604-620`) so a
genome serialized before this field existed never raises on a missing key. This mirrors how
`nursery`/`severed_limbs`/`max_phase` are handled today — not every heritable field is read in `card/1`;
some (like this one) are read only by runtime/supervision code.

## Byte-identity invariant

The `:os_sensorium` organ MUST be absent from `default_genome`. Two things must hold, both re-verified
against live code:

```elixir
test "default_genome remains byte-identical without :os_sensorium" do
  refute Enum.member?(SP.Brain.Genome.default().growth_plan, :os_sensorium)
end
```

(The prior draft asserted `SP.Brain.Genome.default().organs` — `%SP.Brain.Genome{}` has no `:organs`
field; `organs/0` is a *module* function listing every known organ atom across the whole system, not a
genome's own developed plan. The field that actually varies per genome is `growth_plan`, checked above.
The prior draft also called a helper `assert_frozen/1`, which does not exist anywhere in the codebase —
removed.)

Second, and stronger than the prior draft's claim: because v1 adds **zero** `@modalities` entries gated
on `:os_sensorium` (see Signatures §3 above), `SP.Brain.Genome.os_sensorium_primary/1`'s compiled model
is identical to `default/0`'s **unconditionally** — not merely "at coupling 0.0," since there is no
coupling knob wired into `card/1` in v1 at all.

This is **two separate claims with two separate tests**, and this spec must not conflate them:

- **Organ ABSENT ⇒ default stays byte-identical.** This is verified the same way every other opt-in
  organ's default-off byte-identity is verified in this codebase: the existing, untouched
  `test/sp/brain/decider_byte_identity_test.exs` golden-file comparison (`Plan.action_values(...)` vs.
  `test/fixtures/decider_golden_seed7_d5b3.bin`, MAD `< 1e-12`) already covers this, exactly as it does
  for `:metabolism` (see that file's moduledoc and `test/sp/brain/metabolism_organ_test.exs`'s comment
  "Byte-identity with the organ OFF is gated by DeciderByteIdentityTest"). No new byte-identity test
  file is needed for this half.
- **Organ PRESENT-but-zero-wired ⇒ still byte-identical to default.** This is a *different* claim
  (`decider_byte_identity_test.exs` never constructs `os_sensorium_primary()`, `metabolism_primary()`,
  or `homeostat_l1_phase0()` — it only ever runs `Genome.default()` / the implicit default). It is
  almost certainly true by inspection of `active_modalities/1`/`card/1` (`genome.ex:438-494`): with no
  `@modalities` entry naming `organ: :os_sensorium`, `active_modalities/1`'s filter of the fixed
  `@modalities` list is content-identical regardless of `growth_plan`'s order or the organ's presence.
  But "true by code-reading" is not the same as this codebase's own falsifiable MAD `< 1e-12` bar for
  byte-identity claims. This half is covered by a NEW, explicit value-level assertion in
  `test/sp/brain/os_sensorium_organ_test.exs` — see "Test coverage" below; a factor-count check alone
  (12 == 12) is necessary but not sufficient (two models can share a factor count with different
  A/B/C/`pb` contents), so it does not by itself close this half of the invariant.

## Row lifecycle (v1: tailer only, no genome/Mind wiring)

1. `SpoolSensor` opens each configured spool file, seeks to end.
2. Every `poll_ms`, reads new bytes (tolerates torn last-line).
3. Parses each complete line as JSON via `apply(Jason, :decode, [line])` — dynamic dispatch, the exact
   precedent already live in this codebase at `lib/sp/show/overlay_publisher.ex:107-113`
   (`json_decode/1`), for the identical reason: the root `stratified_palimpsest` app is deliberately
   dependency-free (`mix.exs`'s own comment: "so `mix test` is fully offline and deterministic") and
   takes no compile-time dependency on `Jason`; `jason` is a real dependency only of the `ui` (Phoenix)
   app (`ui/mix.exs:36`). Re-verified: `ui/lib/sp_ui/application.ex`'s `SpUi.Application` is the
   **only** module anywhere in this repo with a `mod:` OTP-application-start callback
   (repo-wide `grep "mod: {"` confirms it); the root app's own `mix.exs` `application/0` declares no
   `mod:`, i.e. it never self-boots a supervision tree. So any live BEAM node actually running
   `SP.Runtime.*` code today is necessarily booted via the `ui` release, which loads `Jason`. (This is a
   structural fact about how the app boots, not a claim about which specific line of `ui` code calls
   `SP.Runtime.Supervisor.ensure_started/1` — an earlier draft of this note named a specific LiveView
   call site; re-checked and that citation was wrong, so it is stated at the level that's actually
   verified.) A decode failure (malformed JSON, or `Jason` not loaded because this code is somehow
   reached outside the `ui` node) is treated identically to a schema-invalid row: dropped, step 4.
4. Validates against the four constraint families `sensorium_envelope.schema.json` actually declares:
   `schema_version == 1` (`const`), `kind` ∈ `["row", "event", "snapshot"]` (`enum`), the top-level
   `required` keys (`schema_version, source, ts, kind, payload, provenance`) are present, and
   `provenance`'s own `required` keys (`server, git_commit, evidence_class`) are present. This is a
   **hand-rolled check against those four named constraints**, not a general JSON-Schema engine — no
   JSON-Schema validation library exists anywhere in this codebase (grep-confirmed) and this spec adds
   none. `payload` itself declares no `additionalProperties` restriction in the schema (an intentionally
   open object — the schema's own description: "consumers should tolerate unknown keys"), so this
   validation step does not, and should not, inspect `payload`'s contents. Malformed or schema-invalid
   rows are dropped
   silently (logs a Sec-class warning) — see "Test coverage" below for the explicit test this owes.
5. Appends to its own per-source bounded ring (`max_rows_in_flight`, oldest dropped first) — held in
   `GenServer` state, not published anywhere else.
6. Readers call `SpoolSensor.recent(source, n)` directly. **v1 ships no reader.** Nothing in
   `SP.Brain.*` — not `Learn`, not a policy, not `card/1` — consumes these rows yet. That consumer is
   the subject of the "Coupling" section below, and is out of scope for this spec.

**Test-location boundary this creates (named, not silently absorbed):** because step 3 needs `Jason`,
`test/sp/runtime/spool_sensor_test.exs` (living under the root app's dependency-free `test/`, matching
`log_sensor_test.exs`'s location) is the **first** file in that directory whose JSON-decode-path tests
require `Jason` to be loaded — true today only when `Jason` is loaded, i.e. when tests run in a way
that pulls in the `ui` app's dependency graph. `SP.Show.OverlayPublisher` (the precedent) carries the
same fact and resolves it by simply having no test file under root `test/`. This spec does not repeat
that silently: the ring/poll/torn-line/bounded-size/`recent/2`-ordering tests (all of "Test coverage"
below except the malformed/schema-invalid-row test) exercise `SpoolSensor` by feeding it **already-
decoded maps** (bypassing step 3 entirely — e.g. via a test-only injection point, or by testing the
post-decode ring/validate logic as a separate pure function), so they stay true to the root app's
offline-test invariant; only the malformed/schema-invalid-row test below exercises the real `Jason`
decode path and must run where `Jason` is actually loaded.

## Coupling (future work, not in v1)

The prior draft claimed a `sensorium_lineage/0` policy already read rows via `Board.get/1` "into `qo` at
coupling 0.0." Re-checked against live `card/1` (`genome.ex:438-488`) and `Designer.compile/1`
(`designer.ex:31-65`): there is **no** existing generic mechanism for folding exteroceptive rows into
`qo` at a scalar weight. The closest real precedent for "an OS-derived signal reduced to a discrete
outcome and fed into an active-inference model" is `SP.Producer.Codec.error_rate/1`
(`lib/sp/producer/codec.ex:139`, `0 clean · 1 warnings · 2 erroring`) — but that lives in the separate
`SP.Producer` system (see Purpose) and reduces the untouched `SP.Runtime.LogSensor`'s counters, not
`SpoolSensor`'s NDJSON rows. There is no equivalent in `SP.Brain`.

This spec explicitly re-scopes that capability out of v1 rather than citing a mechanism that doesn't
exist. A follow-up spec (D-A4b) is the named prerequisite and must define, as genuinely NEW work:

1. A discretization function mapping the freshest `SpoolSensor.recent/2` rows for a source to a bounded
   `no`-outcome index each tick (no such row→outcome reducer exists today for OS spool rows — this is
   new, unlike `error_rate/1` which already exists for logger counts).
2. One new `@modalities` entry with `organ: :os_sensorium`, `factor: :os_sensorium_event` (or similar),
   wired to that reducer — this is what would make `active_modalities/1` and `card/1` actually include
   it, and is the mechanism finding #3 above shows does not exist pre-D-A4b.
3. A heritable `os_sensorium_coupling: 0.0` defstruct field (named consistently with the `os_`-prefix
   discipline this spec already applies to the organ atom, module, test files, and
   `os_sensorium_spools`; precedent: `slow_context_coupling`,
   `novelty_gain` — both already use exactly this "0.0 ⇒ value-gated short-circuit ⇒ byte-identical"
   pattern) gating step 2's contribution, so that `coupling 0.0` reproduces v1's current byte-identity
   invariant exactly, and `coupling > 0.0` is the first genome that actually differs.

Only once D-A4b lands does "coupling 0.0 preserves byte-identity" become an operative, tested claim
about a real code path; until then it is simply true that the organ has no wired effect at any coupling
value, because there is nothing yet to couple.

**Redaction prerequisite for D-A4b (named now, while the data shape is in scope):** the rows
`SpoolSensor` reads are confirmed host/path-shaped and stored fully unredacted in v1 —
`sensorium_envelope.schema.json:34-36`'s `provenance.server` is a literal internal box name, and
`payload` is an open, unredacted object. `qo` itself is structurally safe (a bounded categorical `no`
slot cannot hold a hostname string), but D-A4b's discretization function (item 1 above) is not the only
surface this data could reach: `SP.Runtime.Mind.of/2`'s free-text `report` field
(`lib/sp/runtime/mind.ex:29`) is published to the public Board/`/stream` surface every publish tick
(`lib/sp/runtime/agent.ex:404-416` merges the whole `mind` map into the row `Board.put/2` writes,
unlike the row's other fields which are a hand-curated named-scalar allowlist). D-A4b MUST NOT let any
future `Awareness.report/1`-style explanation text echo `provenance.server` or a raw `payload` field
verbatim — this is a prerequisite for D-A4b, not an open question, mirroring the field-level-allowlist
discipline this codebase already practices at `agent.ex:404-414`/`mind.ex:19-31` (DNA/state is never
dumped wholesale onto the Board; only specific named scalars are).

## Process wiring (future work, not in v1)

`os_sensorium_primary/1` (Signatures above) is a pure DNA-builder, exactly like `metabolism_primary/0`
and `homeostat_l1_phase0/0` — it sets `growth_plan`/`os_sensorium_spools` and starts nothing. **v1 does
not auto-start a `SP.Runtime.SpoolSensor` for any agent whose genome carries `:os_sensorium`.** This is
a genuine, currently-unspecified gap (not a hand-wave papered over): every existing opt-in organ
(`:metabolism`, `:homeostat`, `:motor_cortex`) is consumed via an inline `Genome.active_organs(dna)`
check inside `SP.Runtime.Agent`'s own GenServer step logic (`lib/sp/runtime/agent.ex:132,136,444`) —
none of them spawns a child process. `SpoolSensor` would be the **first** organ requiring a genuinely
new OTP process, and `SP.Runtime.Supervisor`'s children (`lib/sp/runtime/supervisor.ex:50-54`) are
fixed at exactly `[Registry, PartitionSupervisor, Board]` with no per-organ dynamic-child hook today —
confirmed live, re-read directly.

In v1, the only way a `SpoolSensor` runs is an explicit, unsupervised `SP.Runtime.SpoolSensor.start_link/1`
call — e.g. from a test, or a manual ops script — never from genome opt-in. A follow-up spec is the
named prerequisite before "opting an agent into `:os_sensorium` gives it a running tailer" can be an
operative v1-style claim, and must define, as genuinely NEW work:

1. **The start site.** Either (a) an inline check in `SP.Runtime.Agent.init/1` mirroring the
   `metabolic?`/`homeostatic?` pattern — but `SpoolSensor` is a real child process, not inline state, so
   this would still need a supervised child, not just a boolean flag — or (b) a new dynamic child
   spawned alongside the agent, e.g. via `SP.Runtime.Supervisor.spawn_agent/1`'s `DynamicSupervisor`
   shard (`lib/sp/runtime/supervisor.ex:60-69`) or a sibling `PartitionSupervisor`. Neither exists today
   for any organ; this spec does not invent one.
2. **A per-agent registration/naming scheme**, via `SP.Runtime.Registry` (mirroring how
   `SP.Runtime.Agent` itself registers by username) — needed so a future reader can address "this
   agent's `SpoolSensor`" and so two opted-in agents' processes cannot collide.
3. **Cardinality.** Whether `SpoolSensor` should be one process *per opted-in agent* (the `os_sensorium_primary/1`
   moduledoc's "for this agent" phrasing implies this) — which is redundant work if multiple agents opt
   in and all tail the SAME global fleet-wide spool files — or one *shared, fleet-wide* tailer that many
   agents' organs merely gate read-access to via `recent/2`. This spec does not decide it; the follow-up
   must.

Until that follow-up lands, "v1 ships the tailer" means "ships a tailer module that compiles and passes
its own unit tests," not a tailer that runs for any real agent — and no test in this spec claims
otherwise (see "Test coverage" below: no supervision/auto-start test is owed by v1).

## FALSIFIES

Per this repo's science-gate discipline (mirroring `production/mcp/SPEC_uni_self_audit.md`'s
"FALSIFIES" section — every registered claim needs both a pre-registered PASS condition and a named
falsifier, judged only against what was registered): this spec's two testable claims are falsified by —

> **Byte-identity (organ PRESENT, zero-wired):** `mad(Plan.action_values(MC.new(seed: 7, dna:
> Genome.os_sensorium_primary()).model, depth: 5, beam: 3), Plan.action_values(MC.new(seed: 7, dna:
> Genome.default()).model, depth: 5, beam: 3)) >= 1.0e-12` — i.e. the organ-present lineage's compiled
> depth-5 decider output measurably differs from `default/0`'s, despite v1 wiring zero `@modalities`
> entries to it.

> **Schema conformance:** a row that is valid JSON but violates one of the four named constraints
> (`schema_version != 1`; `kind` not in `["row","event","snapshot"]`; a missing top-level `required`
> key; a missing `provenance.required` key) appears in `SpoolSensor.recent/2`'s output instead of being
> dropped.

A hit on either falsifier means the corresponding claim in "Byte-identity invariant" / "Row lifecycle"
above is false and must not ship as stated. This is exactly what the two new tests below (in
`os_sensorium_organ_test.exs` and `spool_sensor_test.exs` respectively) pre-register and exercise.

**Explicitly not a falsifiable v1 claim (see "Process wiring" above):** whether an agent whose genome
carries `:os_sensorium` actually gets a running `SpoolSensor`. v1 makes no such claim, so there is
nothing to falsify here yet — that becomes a testable claim only once the follow-up wiring work lands.

## Test coverage this spec owes

- `test/sp/runtime/log_sensor_test.exs` — **UNCHANGED.** Continues to test the existing, live
  `SP.Runtime.LogSensor.install/0`, `.log/2`, `.drain/0`. This spec adds no test to this file and no
  code to `lib/sp/runtime/log_sensor.ex`.
- `test/sp/runtime/spool_sensor_test.exs` (**NEW** file, matching the renamed module):
  - Torn last-line tolerance (fed pre-decoded rows — see "Test-location boundary" in Row lifecycle).
  - Bounded ring size honored, per source (fed pre-decoded rows).
  - `recent/2` returns newest-last, respects `n` (fed pre-decoded rows).
  - Malformed-row drop (does NOT crash the sensor) — exercises the real `Jason` decode path (step 3),
    so this test must run where `Jason` is loaded (see "Test-location boundary" above).
  - **Schema-invalid-but-JSON-valid row drop** (the FALSIFIES condition above): a syntactically-valid
    JSON line that violates one of the four named schema constraints (e.g. `"kind": "bogus"`, or a
    payload missing `provenance`) does NOT appear in `recent/2`'s output. This is the test the prior
    pass's plan omitted — a decoder that merely JSON-parses without checking any of the four
    constraints would have passed every other named test here while this one catches it.
- `test/sp/brain/os_sensorium_organ_test.exs` (**NEW** file, naming convention matches the existing
  `test/sp/brain/metabolism_organ_test.exs`):
  - `SP.Brain.Genome.default().growth_plan` does not contain `:os_sensorium`.
  - `SP.Brain.Genome.os_sensorium_primary().growth_plan` does contain `:os_sensorium`.
  - Arm integrity: `MC.new(seed: 7, dna: Genome.os_sensorium_primary()).model.subs` has the SAME length
    as `MC.new(seed: 7, dna: Genome.default()).model.subs` (12) — unlike `:metabolism` (14 vs 12), this
    organ adds zero factors in v1, which is the point being asserted. Necessary but NOT sufficient for
    byte-identity (see next bullet).
  - **Value-level byte-identity** (the FALSIFIES condition above, closing the gap the length-only check
    above leaves open), mirroring `decider_byte_identity_test.exs`'s own
    `mad/2` helper and its "explicit `Genome.default()` matches the implicit default genome" pattern:
    ```elixir
    defp mad(a, b), do: a |> Enum.zip_with(b, fn x, y -> abs(x - y) end) |> Enum.max()

    test "os_sensorium_primary()'s depth-5 decider output is byte-identical to default/0's" do
      organ_on  = Plan.action_values(MC.new(seed: 7, dna: Genome.os_sensorium_primary()).model, depth: 5, beam: 3)
      organ_off = Plan.action_values(MC.new(seed: 7, dna: Genome.default()).model, depth: 5, beam: 3)
      assert mad(organ_on, organ_off) < 1.0e-12
    end
    ```
  - `default_genome` byte-identity itself (organ absent) is left to the existing, untouched
    `test/sp/brain/decider_byte_identity_test.exs` — not duplicated here (see "Byte-identity invariant").

## Cross-references

- `production/schemas/sensorium_envelope.schema.json` — the row shape (verified present, unchanged by
  this spec).
- `production/docs/OS_SPOOL_POLICY.md` — the writer contract (verified present, unchanged by this spec).
  **Known stale line, NOT fixed here (out of this spec's file scope):** line 28 lists
  `SP.Runtime.LogSensor (planned per D-A4)` as a reader of `heartbeat.ndjson`; per this spec that reader
  is `SP.Runtime.SpoolSensor`, not `SP.Runtime.LogSensor`. Needs a one-line follow-up edit to
  `OS_SPOOL_POLICY.md` when this spec ships.
- `docs/specs/sensorium.md` + `evidence/gates.ndjson` (`depth-red-b`, verdict `PENDING`) — the unrelated,
  separately in-flight A4 binocular-vision effort. See "Disambiguation" in Purpose. Do not conflate.

---

## Corrections from prior draft

Re-verified against the live repo (2026-07-12) before this rewrite. All five findings from the prior
independent review confirmed and fixed, plus two additional citation defects found during
re-verification and fixed in the same pass:

1. **Module collision (CONFIRMED, fixed).** `lib/sp/runtime/log_sensor.ex` is live: `SP.Runtime.LogSensor`
   (`install/0`, `log/2`, `drain/0`), wired into `lib/sp/producer.ex:151` and `:227` for the Producer's
   `error_rate` modality. Citations still accurate at those exact lines. New process renamed to
   `SP.Runtime.SpoolSensor`; explicit untouched-module note added to Purpose.
2. **`add_organ/2` fabrication (CONFIRMED, fixed).** Repo-wide search: appears only in the prior spec
   draft. Replaced with the real growth_plan-append + `@prereqs` + `repair/1` pattern, citing the real
   constructors it's modeled on (`metabolism_primary/0`, `homeostat_l1_phase0/0`). Also confirmed no
   generic "exteroceptive rows into qo at a coupling" mechanism exists in `card/1`/`Designer.compile`
   today — that capability is now explicitly named as NEW work (D-A4b), out of v1, with an exact
   proposed signature rather than a fake citation.
3. **Test-file collision (CONFIRMED, fixed).** `test/sp/runtime/log_sensor_test.exs` exists and tests
   the current install/log/drain API exactly as described. New tests moved to
   `test/sp/runtime/spool_sensor_test.exs`; the existing file is explicitly called out as unchanged.
4. **`:sensorium` name collision with the A4 binocular-vision effort (CONFIRMED, fixed).** Verified
   `docs/specs/sensorium.md` exists (binocular/stereo vision, `uni-sensorium` Eye pipeline) and
   `evidence/gates.ndjson` carries a `depth-red-b` gate (verdict `PENDING`, pre-registered at
   `docs/specs/sensorium.md:5-40`). Organ atom renamed `:os_sensorium`; disambiguation note added to
   Purpose.
5. **Byte-identity invariant (re-confirmed under corrected names).** Section kept per the review
   instruction. Organ-absence check fixed to the real struct field (`growth_plan`, not the nonexistent
   `.organs`) and the real, existing test mechanism (`decider_byte_identity_test.exs`'s golden-file
   comparison, not the nonexistent `assert_frozen/1` helper). Strengthened: v1's invariant holds
   unconditionally (no modality wired yet), not merely "at coupling 0.0" — the coupling-gated version of
   the claim is deferred to D-A4b along with the mechanism it would gate.
6. **Found during re-verification, not in the original five (fixed).** `SP.Runtime.Board.put/2`
   (`lib/sp/runtime/board.ex:17-21`) is `(username, row)` — a per-agent single-row overwrite table, not
   a keyed multi-row ring — so the prior draft's `Board.put(key: {:sensorium, source, i}, row)` call
   neither compiles nor behaves as described. `SpoolSensor` now owns its ring in its own process state
   instead.
7. **Found during re-verification, not in the original five (fixed).** `assert_frozen/1`, used in the
   prior draft's byte-identity test, does not exist anywhere in the codebase. Replaced with the real,
   existing byte-identity mechanism (see point 5).

**Not fixed here, flagged only (genuinely out of this spec's given file scope):** `production/docs/OS_SPOOL_POLICY.md:28`'s
"`SP.Runtime.LogSensor` (planned per D-A4)" reader citation is now stale under the rename in this spec
and needs a follow-up one-line edit; this task's file list authorized editing only
`SPEC_log_sensor_organ.md`, so that edit is not made in this pass.

## Refinements from the 5-persona re-review (this revision, pass 3)

The `SIGN_WITH_CHANGES`/`SIGN` re-review (`docs/receipts/lab_team_review_log_sensor_organ_85b0e8c_v2.md`)
confirmed the seven corrections above are genuine, then named ten further concerns across its five
personas. All ten are addressed directly in this revision (see that receipt's own pass-3 addendum for
the concern-by-concern accounting):

- Strengthened the byte-identity invariant to name it as TWO separate claims and added the missing
  value-level `mad < 1e-12` test for the organ-PRESENT lineage (a length-only check was insufficient).
- Corrected the `metabolism_primary/0` "exact shape of every constructor" overclaim — it does not call
  `repair/1`; `homeostat_l1_phase0/0` is the accurate model.
- Re-scoped per-agent process auto-start OUT of v1 (new "Process wiring" section) instead of letting the
  `os_sensorium_primary/1` moduledoc overclaim it as settled v1 behavior with no named start site,
  supervision strategy, registration scheme, or cardinality decision.
- Renamed the new defstruct field `sensorium_spools` → `os_sensorium_spools` (and the proposed D-A4b
  `sensorium_coupling` → `os_sensorium_coupling`) for consistency with the `os_`-prefix disambiguation
  discipline already applied to the organ atom and module.
- Named the concrete JSON-decode mechanism (`Jason` via dynamic dispatch, precedent
  `lib/sp/show/overlay_publisher.ex:107-113`) and the concrete schema-validation mechanism (a hand-rolled
  check against the schema's four named constraint families, not a JSON-Schema library), and named the
  resulting root-app-vs-`ui`-app test-location boundary explicitly instead of leaving it implicit.
- Added a `## FALSIFIES` section (mirroring `SPEC_uni_self_audit.md`'s convention) and a schema-invalid-
  but-JSON-valid-row test, closing the "fabricated-but-schema-valid" gap the red-experimentalist persona
  is specifically chartered to catch.
- Added the redaction-prerequisite sentence to "Coupling" naming that `Mind.report` must never echo
  `provenance.server`/`payload` fields verbatim, as a named prerequisite for D-A4b.
