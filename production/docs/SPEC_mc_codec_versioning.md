# SPEC — `kin-<n>.bin` version header on `SP.Brain.MC.save/2` / `load/2` (C-C4a)

**Status:** SPEC. Awaits `/lab-team-review`. Touches `lib/sp/brain/mc.ex` (FE-adjacent).
**Ship gate:** MERGED VERDICT + paired RED — the byte-identity regression test named explicitly in
"Ship-gate byte-identity regression test" under Test coverage below, with its PASS/FALSIFIES pair
pre-registered there. **Not** `test/sp/brain/decider_byte_identity_test.exs` — that is a different,
pre-existing golden (a `Plan.action_values/3` determinism/regression anchor) that never calls
`SP.Brain.MC.save/2` or `load/2` and cannot exercise the header/version path this SPEC adds.

> **Correction note (re-verified against live repo, 2026-07-12):** an earlier draft of this SPEC
> targeted `SP.Brain.MC.Codec.encode/1` / `decode/1` in a file it called `lib/sp/brain/mc_codec.ex`.
> The real file at that path defines `SP.Brain.MCCodec` (no dot — a distinct module name), whose only
> `encode` is **arity-2** (`encode(senses, dna)`), a real-time sense→observation discretiser unrelated
> to file persistence. It has no `decode/1` and no header/magic/version logic. There is a *separate*
> `SP.Brain.Codec` module too (`lib/sp/brain/codec.ex`) — also unrelated. The actual persistence path
> this SPEC's purpose requires is `SP.Brain.MC.save/2` / `SP.Brain.MC.load/2` in `lib/sp/brain/mc.ex`
> (currently lines 552 and 563). This revision retargets the whole Contract to those functions.

## Purpose

The kin memory files at `runs/colony/kin-<n>.bin` (path built in `lib/sp/runtime/lineage.ex:133`) are
loaded/saved through two independent call paths, both going through the public
`SP.Brain.MC.load/2` / `SP.Brain.MC.save/2` API only — neither reaches into the private `safe_read/1`
or assumes the raw on-disk shape (grep-verified against every `MC.load`/`MC.save` call site in the
repo):

- `SP.Runtime.Agent` — the primary runtime path. Load: `lib/sp/runtime/agent.ex:110`. Save (7 sites):
  `lib/sp/runtime/agent.ex:185,195,251,259,310,318,358`.
- `SP.Brain.Bridge` — a parallel live-body module on the same API. Load: `lib/sp/brain/bridge.ex:94`.
  Save (5 sites): `lib/sp/brain/bridge.ex:141,149,180,185,200`.

That is 14 call sites total (8 in `agent.ex`, 6 in `bridge.ex`). Because this SPEC changes neither
`save/2`'s nor `load/2`'s public arity or return type (see Non-goals), every one of them keeps working
unchanged regardless of which module invokes them. Today:

- `save/2` (`lib/sp/brain/mc.ex:552-554`) does a direct, non-atomic `File.write!(path,
  :erlang.term_to_binary({brain.dna, brain.model}))` — no header, no version tag.
- `load/2` (`lib/sp/brain/mc.ex:563-585`) reads via the private `safe_read/1` (`:587-594`), which does
  `File.read! |> :erlang.binary_to_term()` and turns *any* raised error into `:error`, at which point
  `load/2` falls back to `new(opts)` (a fresh brain). This fail-open behavior already protects against
  a **corrupt** file crashing the agent.

What it does **not** protect against: a raw `:erlang.term_to_binary/1` payload whose *internal shape
still coincidentally matches* `{%Genome{}, %Factors{}}` after a semantics-changing (not
shape-changing) edit to the persisted terms — `binary_to_term` succeeds, `load/2` returns a brain that
looks valid, and the agent runs on silently-wrong state. This is orthogonal to the existing
`reconcile/2` + `compatible?/2` + `adopt/2` machinery (`lib/sp/brain/mc.ex:596-643`), which already
guards against **struct-shape** drift (factor count / observation / action cardinality) by grafting or
discarding — it operates on the *decoded* Elixir terms, not on the raw bytes, so it cannot see a
raw-format change. A magic + version header closes that gap: it lets `load/2` refuse to *interpret*
bytes it did not itself write in the current format, before `binary_to_term` ever runs on them.

Confirmed empirically: `:erlang.term_to_binary/1` output always starts with byte `0x83` (the fixed
ERTS external-term-format version tag — verified against `test/fixtures/decider_golden_seed7_d5b3.bin`,
first byte `0x83`). The 4-byte ASCII magic `"MCV1"` (`0x4D 0x43 0x56 0x31`) chosen below can never
collide with a legacy (headerless) file's first byte, so magic-sniffing is an unambiguous discriminator
between "written by this SPEC" and "pre-SPEC raw term" — no false positives are possible in either
direction.

## Contract

### Header

Every `.bin` written by `SP.Brain.MC.save/2` MUST start with:

```
[0..3]  magic       = "MCV1"
[4..5]  major       = u16 big-endian (bump on breaking change)
[6..7]  minor       = u16 big-endian (bump on additive change)
[8..15] reserved    = zeroed
[16..]  payload     = :erlang.term_to_binary({dna, model})   (unchanged encoding)
```

### `SP.Brain.MC.save/2` — NEW behavior (signature unchanged: `save(%__MODULE__{}, path) :: :ok`)

Note: `lib/sp/brain/mc.ex` has no `require Logger` today (grep-verified — no file under `lib/` uses
`Logger` yet in this codebase). This SPEC is what introduces it; add `require Logger` at the top of
the module alongside the existing `alias` line (`lib/sp/brain/mc.ex:12`).

**Path-relativization requirement:** every `Logger.warning` call below MUST interpolate
`Path.basename(path)`, never raw `path`. `path` traces to
`Path.join(@repo_root, "runs/colony/kin-#{state.kin}.bin")` (`lib/sp/runtime/lineage.ex:25,133`) — an
absolute host filesystem path — and this codebase already has an established convention against
logging or returning one for this exact file family: `production/mcp/SPEC_uni_self_audit.md:184`
relativizes the same `memory_bin_path` field via `Path.relative_to(abs_path, @repo_root)` and states
as a binding Non-goal (`:260`) "Does NOT return an absolute host filesystem path under any field,
ever." `SP.Brain.MC` has no `@repo_root` of its own (that attribute lives on `SP.Runtime.Lineage`), so
`Path.basename(path)` (e.g. `"kin-3.bin"`) is the self-contained equivalent here — sufficient to
identify which kin's file logged the event without depending on or leaking the caller's repo layout.

```elixir
defmodule SP.Brain.MC do
  require Logger

  @magic "MCV1"
  @major 1
  @minor 0

  def save(%__MODULE__{} = brain, path) do
    header = @magic <> <<@major::16, @minor::16, 0::64>>
    File.write!(path, header <> :erlang.term_to_binary({brain.dna, brain.model}))
  end
end
```

Routine `save/2` calls remain **non-atomic** direct writes, same as today (see Non-goals — atomicity
is scoped only to the migration rewrite below, per the original SPEC intent).

### `SP.Brain.MC.load/2` — NEW behavior (signature unchanged: `load(path, opts \\ []) :: %__MODULE__{}`)

`load/2` MUST keep its existing fail-open contract — it always returns a usable `%SP.Brain.MC{}`,
never an `{:error, _}` tuple — so every existing call site (`lib/sp/runtime/agent.ex:110`,
`lib/sp/brain/bridge.ex:94`) keeps working with zero call-site changes. Version-mismatch and
magic-mismatch are folded into the *same* "fall back to `new(opts)`" branch `load/2` already uses for
an unreadable file — they become **loud** (logged) instead of silent, not a new return shape:

```elixir
defp safe_read(path, now) do
  magic = @magic

  case File.read!(path) do
    <<^magic::binary-size(4), major::16, minor::16, _reserved::64, payload::binary>> ->
      cond do
        major != @major ->
          Logger.warning("kin.bin version mismatch at #{Path.basename(path)}: got major=#{major}, current=#{@major} — starting fresh")
          :error

        minor > @minor ->
          Logger.warning("kin.bin has newer minor=#{minor} (current=#{@minor}) at #{Path.basename(path)} — decoding anyway (forward-compat)")
          decode_payload(payload)

        true ->
          decode_payload(payload)
      end

    raw ->
      legacy_read(path, raw, now)
  end
rescue
  _ -> :error
catch
  _, _ -> :error
end

defp decode_payload(bin) do
  {dna, model} = :erlang.binary_to_term(bin)
  {:ok, dna, model}
rescue
  _ -> :error
catch
  _, _ -> :error
end
```

`load/2` itself gains one line to source "now" (defaulting to real wall-clock, overridable so tests
never depend on the system clock):

```elixir
def load(path, opts \\ []) do
  now = Keyword.get(opts, :now, Date.utc_today())

  case safe_read(path, now) do
    {:ok, file_dna, model} -> ...unchanged reconcile/init_runtime path...
    :error -> new(opts)
  end
end
```

`minor` forward-compat and the reconcile/compatible?/adopt path below `{:ok, ...}` are **unchanged**
from current `load/2` (`lib/sp/brain/mc.ex:565-580`).

## Migration (legacy, headerless files)

`legacy_read/3` handles a file whose first 4 bytes are not `"MCV1"` — i.e., every `.bin` that exists
today:

```elixir
defp legacy_read(path, raw, now) do
  if Date.compare(now, @legacy_cutover_date) == :lt do
    case decode_payload(raw) do
      {:ok, dna, model} = ok -> migrate!(path, dna, model); ok
      :error -> :error
    end
  else
    Logger.warning("kin.bin at #{Path.basename(path)} has no version header and the legacy window (cutover #{@legacy_cutover_date}) has closed — starting fresh")
    :error
  end
end

defp migrate!(path, dna, model) do
  tmp = path <> ".migrate.tmp"
  header = @magic <> <<@major::16, @minor::16, 0::64>>
  File.write!(tmp, header <> :erlang.term_to_binary({dna, model}))
  File.rename!(tmp, path)
end
```

Migration rewrite is atomic (tmp+rename), matching the `SP.Show.OverlayPublisher` pattern
(`lib/sp/show/overlay_publisher.ex:25,99-100`: own `.tmp` file, `File.write!` then `File.rename!`).

### Exact removal mechanism (this is the field the earlier draft left unnamed)

The legacy path is gated by a single hardcoded module attribute on `SP.Brain.MC`:

```elixir
@legacy_cutover_date ~D[2026-08-11]   # = PR-merge date + 30 calendar days
```

`load/2`'s `now` (`Date.utc_today()` by default, overridable via `opts[:now]` for tests — see Test
coverage) is compared against `@legacy_cutover_date` at legacy-decode time. At or after the cutover,
`legacy_read/3` refuses to run `binary_to_term` on a headerless file at all and falls back to
`new(opts)`, same as any other unreadable file — the legacy code path becomes dead weight that a
follow-up SPEC can delete outright.

**`@legacy_cutover_date` is a placeholder the implementer MUST set precisely to (actual PR-merge date
+ 30 days) at merge time** — `~D[2026-08-11]` above is only correct if this SPEC merges on
2026-07-12 (today, per repo context). This is a `Date.t()` literal, not a runtime config key or env
var: this app ships with zero dependencies and no `config/config.exs` (`mix.exs:35-37` — `deps: []`;
only `ui/` has a config.exs, for the separate Phoenix app), so a hardcoded, reviewable constant is the
option consistent with the existing codebase, not a new config-loading mechanism.

**Re-scope on the archived-corpus clause:** the earlier draft additionally gated removal on "the
178-file archived corpus (`runs/colony_archive/`) is either migrated or explicitly discarded,
whichever is later." Re-verified against the live repo: `runs/colony_archive/` does not exist, no
`runs/colony/*.bin` corpus exists yet either (both are runtime-generated, gitignored paths), and "178"
is not a figure this pass could observe or verify anywhere. **Dropped from v1 as code-enforced logic**
— it is not falsifiable against anything in the repo today and inventing an automated check against an
unverified count would be exactly the kind of false citation this correction pass exists to remove.
It is re-scoped to an **operator checklist item**: before the `@legacy_cutover_date` cutover takes
effect in a given deployment, an operator confirms (manually, outside code) that any archived corpus
that exists by then has been migrated or explicitly discarded. A future SPEC MAY promote this to a
code-enforced second gate once `runs/colony_archive/` is a real, inventoried directory with a defined
manifest to check against — that is new work this SPEC does not attempt.

## Bind-mount contract (paired with C-C4b)

The migration path (this SPEC's `migrate!/3`, and any future `git archive`-based deploy/rollback of
`broadcast-src`) is only safe if the persistent kin `.bin` files under `runs/colony/` survive an
unpack undisturbed.

**Correction (re-verified against live repo, this pass):** an earlier draft of this section claimed
this was "guaranteed" by a bind-mount "documented in `production/docs/RUNBOOK_DR.md` extension." That
claim does not check out. `production/docs/RUNBOOK_DR.md` (read in full — DR redeploy/rollback/
failover content) contains zero mentions of `colony-memory`, `bind-mount`, or `C-C4b`. A repo-wide grep for `C-C4b` finds exactly two hits: this SPEC itself, and a bare inline
comment in `production/scripts/colony_archive.sh:7`
(`#   /var/lib/uni/colony-memory/       -> the bind-mounted kin .bin files (per C-C4b)`) — with no
accompanying `SPEC_*.md` or runbook section defining it, unlike C-C4a (this SPEC) or C-C4c
(`SPEC_livepatch_hot_files.md`). `production/docs/OS_SPOOL_POLICY.md` documents only the
destination-side backups/colony sole-writer rule, not any source-side bind-mount.

**Status: PENDING, not guaranteed.** This SPEC's own Contract (header/version/migration in
`SP.Brain.MC`) does not depend on the bind-mount existing — `save/2`/`load/2`/`migrate!/3` operate
purely on whatever bytes are actually at the given `path` at call time. But the separate claim that a
`git archive` unpack of `broadcast-src` can never shadow live `runs/colony/*.bin` files is currently
unverified anywhere in this repo. **Falsifier:** before relying on this migration path across any
deploy/rollback that involves a `git archive` unpack, an operator must verify live (e.g. `findmnt
/var/lib/uni/colony-memory` or equivalent on the target host) that `/var/lib/uni/colony-memory/` is
actually bind-mounted onto `broadcast-src`'s `runs/colony/`. C-C4b itself needs its own SPEC, or a real
`RUNBOOK_DR.md` section, before it can be cited as "documented" again. Until then, this SPEC does not
claim its migration path is safe against a `git archive` unpack — only that header/version handling is
correct given whatever bytes are actually on disk at `load/2` time, independent of how they got there.

## Test coverage the plan owes

`test/sp/brain/mc_versioning_test.exs` (new file, alongside the existing `test/sp/brain/mc_test.exs`
which already covers plain save/load round-trip and struct-shape reconcile — see
`test/sp/brain/mc_test.exs:147-194` — this file covers only the header/version/migration behavior).

### Ship-gate byte-identity regression test (named, per line 4's promise)

**Correction (re-verified against live repo):** this repo's one existing byte-identity golden,
`test/sp/brain/decider_byte_identity_test.exs`, does its own raw `:erlang.term_to_binary`/
`binary_to_term` round-trip directly on `Plan.action_values/3` output (lines 33-38) and never calls
`SP.Brain.MC.save/2` or `load/2` — it is not, and cannot be, the "paired RED (a byte-identity
regression test)" line 4's Ship gate promises, because it doesn't exercise the header/version code
path this SPEC adds.

The test that satisfies the Ship gate is the first bullet below. Naming it explicitly, with the
PASS/FALSIFIES pair pre-registered here (before the RED test is authored), per this repo's gate
discipline:

- **PASS condition:** for a brain saved via `MC.save/2` at a fresh path, (a) the first 16 bytes on
  disk equal `"MCV1" <> <<1::16, 0::16, 0::64>>` exactly, and (b) `MC.load/2` on that same path
  returns a brain whose `.model` is *identical* (`==`) to the pre-save brain's `.model` — not merely
  reconciled-compatible — extending `mc_test.exs:147-156`'s existing round-trip assertion with a
  `File.read!`-based header-bytes check.
- **FALSIFIES condition:** the test fails, and this SPEC's Contract is falsified, if either (i) the
  on-disk header bytes ever differ from the exact 16-byte layout above for a freshly-saved file, or
  (ii) `revived.model != brain.model` for any brain round-tripped through `save/2` then `load/2` with
  no intervening genome change. The header layer must be perfectly transparent to the existing
  payload encoding — it must never alter what `load/2` returns for a file this SPEC's own `save/2`
  wrote.

The remaining bullets below cover the rest of the header/version/migration behavior; only the one
above is the Ship gate's byte-identity anchor.

- A file with `"MCV1"` header but `major` ≠ current `@major` makes `MC.load/2` return a **fresh**
  brain (`revived.model == MC.new(seed: ...).model`'s shape, i.e. it does not error/crash) and logs a
  `:warning`-level message containing `"version mismatch"` (captured via `ExUnit.CaptureLog`).
  Byte-identity anchor: this test also asserts the on-disk bytes at the mismatched-version path are
  left untouched (no silent rewrite of a file the code refused to interpret).
- A file with `"MCV1"` header, current `major`, but `minor` > current `@minor` decodes successfully
  (forward-compat) and logs a `:warning` mentioning `"newer minor"`.
- A file with `"MCV1"` header but an unparseable payload (e.g. truncated mid-`term_to_binary`) makes
  `MC.load/2` return a fresh brain via the same `safe_read` → `:error` → `new(opts)` fail-open branch.
  **Correction (re-verified against live repo):** this is NOT already covered by
  `mc_test.exs:158-174` — that existing test ("loading a STALE memory file (older shape) starts fresh
  instead of crashing") writes a fully well-formed `:erlang.term_to_binary` payload that
  `binary_to_term` decodes successfully; its fallback is driven by `reconcile/2` + `compatible?/2`
  (`mc.ex:596-643`) rejecting the decoded STRUCT SHAPE, not by `decode_payload/1`'s rescue/catch
  seeing genuinely-unparseable bytes. A repo-wide grep of `test/` for corrupt/garbage/truncated-byte
  coverage of `MC.load/2` finds none — this bullet is net-new coverage with no prior precedent to
  extend, not a repeat of an existing case.
- A legacy (no-header, raw `term_to_binary({dna, model})`) file loaded with `opts: [now:
  ~D[2026-07-15]]` (before the illustrative cutover) decodes successfully AND is rewritten in place
  with a valid header — verified by re-reading the file after `load/2` and checking its first 4 bytes
  equal `"MCV1"` and that a second `load/2` (now via the fast header path) round-trips identically.
- The same legacy file loaded with `opts: [now: ~D[2026-09-01]]` (at/after the illustrative cutover)
  falls back to a fresh brain, logs a `:warning` mentioning `"legacy window"` / `"closed"`, and leaves
  the on-disk legacy file byte-for-byte unmodified (no partial/half migration).
- **New (closes a gap the prior review pass left untested):** a genuinely-**corrupt** legacy file —
  first 4 bytes not `"MCV1"` AND the full contents fail `binary_to_term` (e.g. truncated raw bytes,
  no valid header at all) — loaded pre-cutover (`opts: [now: ~D[2026-07-15]]`) must fall back to a
  fresh brain via `legacy_read/3`'s `decode_payload(raw)` returning `:error` **without ever calling
  `migrate!/3`**, and must leave the corrupt file byte-for-byte unmodified on disk (verified by
  re-reading it after `load/2`). Without this test, a subtly wrong `legacy_read/3` (e.g. a
  pattern-match slip that calls `migrate!/3` regardless of `decode_payload`'s outcome) would silently
  write a "successfully migrated" `MCV1` header on top of unrecoverable garbage — and pass every other
  test named above.

## Non-goals

- This SPEC does NOT change the on-wire brain protocol. Only the on-disk kin memory format.
- This SPEC does NOT change the encoding of any single field. It adds a header prefix.
- This SPEC does NOT change `save/2`'s or `load/2`'s public arity or return type. `save/2` still
  returns whatever `File.write!/2` returns (`:ok`, raising on failure); `load/2` still always returns
  a bare `%SP.Brain.MC{}`, never an `{:ok, _} | {:error, _}` tuple — a version/magic mismatch is
  folded into the SAME fail-open branch `load/2` already uses for a corrupt file (now logged, not
  silent), not a new external contract. Every existing call site is untouched.
- This SPEC does NOT replace or duplicate `reconcile/2` / `compatible?/2` / `adopt/2`
  (`lib/sp/brain/mc.ex:596-643`). Those remain exactly as-is and continue to run, unchanged, on
  whatever `{dna, model}` the header/version layer above successfully decodes — the two mechanisms
  guard different layers (raw bytes vs. decoded struct shape) and are complementary.
- This SPEC does NOT make routine (non-migration) `save/2` writes atomic. `save/2` keeps today's
  direct `File.write!` for the common case; only the one-time legacy→header migration rewrite is
  required to be atomic (tmp+rename), per the original SPEC's intent for that specific path.
- This SPEC does NOT code-enforce the archived-corpus (`runs/colony_archive/`) clearance condition —
  re-scoped to an operator checklist item; see Migration section above for why and what a follow-up
  SPEC would need (a real, inventoried archive directory to check against).

## Cross-references

- `production/docs/SPEC_livepatch_hot_files.md` — the paired OS-side guard for hot-file writes during livepatch.
- `production/mcp/SPEC_lineage_snapshot.md` — the BEAM-triggered atomic snapshot that reads/writes these files.
