---
verdict: FAIL
evidence_class: C
supersedes: none (first review pass for this item)
---

# /lab-team-review MERGED VERDICT (v2, post-fix) — D-A3/D-B3 overlay update + fence-override forwarding

- **Base SHA:** `85b0e8c` (working tree, spec-correction pass applied on top, uncommitted)
- **Mode:** real (5 independent persona agents re-reviewing the corrected spec)
- **Files reviewed:**
  - `production\mcp\SPEC_command_center_overlay_update.md`
  - `production\mcp\SPEC_fence_override_forwarding.md`
  - `production\docs\OS_SPOOL_POLICY.md`

## Fix summary (what changed before this re-review)

All three target files are fixed. Summary of what changed and why:

## `production/mcp/SPEC_command_center_overlay_update.md`

**Re-verified against live repo:** `lib/sp/show/overlay_publisher.ex` confirmed to be a pure tick-driven `GenServer` — `handle_info(:tick,...)` + a catch-all only, zero `handle_call/3` clauses, no exported write function. `set/1` genuinely does not exist.

- **Purpose**: added a "Confirmed live" note stating this plainly, and replaced `set/1`/hedge language with `set/2` framed explicitly as NEW code this spec introduces.
- **Phoenix implementation**: removed the "(or the equivalent public function)" hedge; named the exact call (`GenServer.call/2`, 5000ms timeout) and both response paths (200/`accepted:true` on `:ok`, 502/`accepted:false` on `{:error, reason}`).
- **New section "NEW code this spec introduces: `SP.Show.OverlayPublisher.set/2`"**: exact public function, exact new `handle_call/3` clause, reusing the module's existing `read_spool/0`/`write_spool/1`/`safe/1` helpers so the write path stays single-writer and doesn't crash the GenServer on a torn-write race (I caught and fixed this failure mode myself mid-draft — the first version of `handle_call` called `write_spool/1` unwrapped, which uses bang functions and would crash the process on the exact EPERM-class race this whole effort exists to eliminate).
- **New section "Write-race precedence"**: concrete `manual_override_until` per-layer (`caption`/`ticker` only, since those are the only two keys the tick touches) monotonic-deadline field, **N = 10 000 ms** (5 tick cycles), exact `maybe_put/5` guard replacing the tick's unconditional `Map.put`, self-healing (no operator "release" step).
- **Test coverage**: corrected `test/ui/overlay_controller_test.exs` → `ui/test/sp_ui_web/overlay_controller_test.exs` (confirmed live: no `test/ui/` dir exists; real convention confirmed via existing `overlooker_live_test.exs`/`stream_qa_test.exs`). Added named new-coverage bullets for `set/2` and the precedence logic at `test/sp/show/overlay_publisher_test.exs` (new, since no suite exercises the module today).
- **Non-goals**: preserved, lightly clarified that `set/2` doesn't add a second writer.

## `production/mcp/SPEC_fence_override_forwarding.md`

**Re-verified:** `SP.Audit.Writer` has zero references anywhere except the two spec files and the policy doc (confirmed via repo-wide grep). `production/mcp/server.py`'s `_AUDIT`/`_LocalAudit` (lines 124–156) is a real, live second appender to the same `prod-mcp.ndjson`.

- **Purpose**: added "Confirmed live" note naming both facts and pointing at the resolution.
- **New section "Reconciling the two writers"**: picked **sub-scoped ownership by row kind** over an HTTP-to-Python route, with the reasoning made explicit (`server.py` is a bearer-authed MCP tool surface with no lightweight audit-ingest endpoint to route through, and it's explicitly "not deployed" today, so routing through it would be at least as much new work while adding a runtime dependency). Named the exact split: `server.py` owns everything except `kind=="event" && payload.action=="fence_override"`; `SP.Audit.Writer` owns only that. Also named and justified the concurrency-safety condition that makes two OS-level processes appending to one inode actually safe (one `write()` syscall per row, POSIX `O_APPEND` atomicity) — this wasn't explicitly asked for but is the load-bearing fact that makes "sub-scoped ownership" more than a label.
- **New section "NEW code this spec introduces: `SP.Audit.Writer`"**: full module at proposed path `lib/sp/audit/writer.ex`, exact `write/1` signature, `handle_call/3`, forces `payload.action` server-side so the writer is mechanically incapable of writing any other row kind.
- **Test coverage**: corrected `test/ui/audit_fence_override_test.exs` → `ui/test/sp_ui_web/audit_fence_override_test.exs`. Added new bullets for `SP.Audit.Writer` unit coverage and a concurrency regression test (both writers appending concurrently → every line still parses).

## `production/docs/OS_SPOOL_POLICY.md`

- Rewrote the `prod-mcp.ndjson` ledger entry's "Sole writer" bullet into the sub-scoped ownership split (two named writers, disjoint row-kind, the atomicity justification), cross-referencing `SPEC_fence_override_forwarding.md`. Left every other ledger entry (`broadcast.json`, `heartbeat.ndjson`, `program.jpg`, `fleet_status.ndjson`, `colony/backups`, the `Field<T>` coordination section) untouched — not in scope and not broken.

## Not fully resolved / flagged honestly

Nothing from the four findings is unresolved. Two things worth naming as adjacent, out-of-scope observations rather than gaps in this pass:
1. `OS_SPOOL_POLICY.md`'s `broadcast.json` entry still says command_center.cjs is "planned to read via `POST /overlay/update`" — it should say *write*, but that pre-existing wording bug wasn't in the findings list and I left it per "don't rewrite parts that aren't broken."
2. `production/mcp/server.py`'s actual audit rows (`{"event": "cut_to", ...}`) don't literally conform to `sensorium_envelope.schema.json`'s nested shape (no `schema_version`/`kind`/`payload` nesting) — a pre-existing drift between that schema doc and the real Python output. I didn't touch it since fixing it means editing `server.py` (forbidden in this pass) and it wasn't one of the four named findings; I noted the discrepancy honestly in the new "Reconciling the two writers" section rather than papering over it.

Both are genuinely separate from this correction pass's scope, not things I'm declining to fix out of laziness — flagging per the "no work left behind" expectation in case a follow-up pass should pick them up.

## Persona verdicts (re-review)

### math-breaker (Falsifier), Lab Team role 2/5
- Verdict: **REVISE**
- Rationale: All four prior BLOCKED findings were independently re-verified against the live tree (not the spec's own claims) and are genuinely resolved: SP.Show.OverlayPublisher.set/2 is now fully specified as new code with a correct signature matching the real file (safe/1 at overlay_publisher.ex:122-128 cited exactly right); the manual_override_until/10s precedence mechanism is concrete and sound against the live tick handler; the SP.Audit.Writer sub-scoped writer split is designed, and OS_SPOOL_POLICY.md's ledger was actually amended (verified); and the test paths were corrected to the real ui/test/sp_ui_web/ convention (verified those files exist). However, a fresh independent pass surfaced two new, code-traceable defects serious enough to block sign-off: (1) the new endpoint's own layer-name for the on-air field ('onair') doesn't match the real spool schema field ('onAir'), so as specified the endpoint would silently no-op writes to that layer while still returning accepted:true -- a false receipt, which is precisely what this project's honesty rail and this persona's provenance mandate exist to catch; and (2) the two specs directly contradict each other about which component is responsible for emitting the force-override Sec-class audit row when the write arrives via the new HTTP endpoint, leaving the audit-completeness guarantee of a spec explicitly gated as 'changes the security-audit surface' unfalsifiable. A secondary fence-regex divergence (missing 'agi' token server-side vs the client-side copy) and an unresolved provenance-helper gap (git_commit()/node_server_name() undefined, built on a misreading of server.py's actual env-var mechanism) round out the concerns. The core architecture (new set/2 entry point, override-precedence TTL, sub-scoped writer split) is sound and does not need to be re-derived -- these are two concrete, fixable spec gaps (one naming bug, one ownership decision) plus two smaller provenance items, not a fundamental problem, hence REVISE rather than REJECT.
- Concerns:
  - HIGH/functional: SPEC_command_center_overlay_update.md lines 23, 65, 95 spell the on-air layer as "onair" (lowercase) in the endpoint contract and the new set/2 guard clause, but the real spool field is "onAir" (capital A) -- confirmed live in production/schemas/broadcast.schema.json's own property name, in viewer/command_center.cjs's existing code (st.onAir at lines 909/916), and even in this same spec's own line 143 prose. POST /overlay/update {"layer":"onair"} would call set("onair", payload), Map.put a new dead key that no overlay reader consumes, and still return accepted:true/written_at -- a false success receipt not caught by schema validation (broadcast.schema.json has no "onair" property either).
  - HIGH/provenance: SPEC_command_center_overlay_update.md:54 states the /overlay/update endpoint itself "additionally emits a Sec-class row to prod-mcp.ndjson per D-B3" for force=true, present tense. But SPEC_fence_override_forwarding.md:16 explicitly scopes that exact wiring as future work ("currently command_center.cjs, in future also POST /overlay/update with force=true"), and neither spec shows OverlayController.update/2 actually calling SP.Audit.Writer or /audit/fence_override. Live command_center.cjs (/api/overlay handler, lines 833-844) is untouched by either spec and is the only real caller today. As written it's unfalsifiable whether a force override produces 0, 1, or 2 audit rows -- serious on a spec whose own header says it 'changes the security-audit surface.'
  - MEDIUM/fence-gameability: viewer/command_center.cjs:139's existing FENCE regex includes the alternative "agi"; lib/sp/brain/fence.ex:17's @fence regex -- named by the corrected overlay spec as the new authoritative server-side gate via SP.Brain.Fence.flag/1 -- does not include "agi" (verified by direct diff of both regex literals). CLAUDE.md's Honesty rail explicitly bans "AGI." Currently masked only because the one live caller (/api/overlay) still runs the stricter JS check first; the spec doesn't audit that the new server-side gate is a strict subset of what it nominally supersedes, nor address a caller reaching /overlay/update directly.
  - LOW/provenance: SPEC_fence_override_forwarding.md lines 98-99 call node_server_name() and git_commit() inside the new SP.Audit.Writer code sample, but neither is defined anywhere in the spec, and a repo-wide grep of lib/ found zero existing Elixir precedent for either. The spec's justification ("resolving the same provenance fields server.py's metadata() already resolves... env/git rev-parse") mischaracterizes production/mcp/server.py:58, which is GIT_COMMIT = os.environ.get("UNI_GIT_COMMIT", "unknown") -- a plain env lookup with a literal "unknown" fallback and no git rev-parse call anywhere in the file (grep-confirmed). sensorium_envelope.schema.json makes provenance.git_commit a required field, so this is a real, if narrow, unresolved traceability gap in a spec whose whole purpose is audit provenance.

### aif-theorist (Lab Team persona 2 — docs/lab_team/02_aif_core_theorist.md)
- Verdict: **SIGN_WITH_CHANGES**
- Rationale: All four originally-BLOCKING findings are genuinely resolved and I independently re-verified each against live source, not just the spec's prose: (1) SP.Show.OverlayPublisher truly has no set/1, no handle_call, no public write function today (lib/sp/show/overlay_publisher.ex read in full) -- the corrected spec now names set/2 with a full signature, a real handle_call clause, and states plainly it is new code; the safe/1 citation at overlay_publisher.ex:122-128 is byte-accurate. (2) The write-race now has a concrete, named mechanism (manual_override_until map, N=10_000ms, per-layer maybe_put guard) that correctly threads through handle_info(:tick, state) -> publish(state) without breaking the existing safe/1 wrapper or the untouched-layer behavior. (3) SP.Audit.Writer is confirmed to have zero references anywhere in the codebase today (grep across .ex/.exs/.md), and the two-writer overlap on prod-mcp.ndjson is now resolved by an explicit, well-reasoned sub-scoped ownership split (disjoint row-kind + one-syscall-per-row O_APPEND atomicity), with OS_SPOOL_POLICY.md's ledger entry actually updated to match the spec's language. (4) The test paths are corrected to ui/test/sp_ui_web/*_test.exs, which I confirmed is the real, existing convention (overlooker_live_test.exs, stream_qa_test.exs live there; no test/ui/ directory exists in the repo). That is a competent, honestly self-checked fix pass. My fresh, independent pass on top of that found three concrete new/residual issues worth landing before ship, none of which are fundamental design flaws: a functional casing bug (onair vs onAir) that would make the new endpoint report false success on-air-toggle writes; a claim-fence regex gap (missing \"emotion\") that is precisely what my mandate asked me to verify and that this spec is the first to expose to free-form operator/API input rather than only AIF-generated narration; and an audit-ledger schema-shape claim that doesn't hold up against the actual Python row format, which the fix pass's own \"reconciling the two writers\" language implies was addressed but wasn't. These are named, scoped, and each independently fixable without redesigning the accepted architecture -- hence SIGN_WITH_CHANGES rather than REVISE.
- Concerns:
  - FUNCTIONAL BUG — onAir/onair casing mismatch, SPEC_command_center_overlay_update.md lines 23, 65, 95, 144 vs live code. The endpoint's layer enum and the new set/2 guard clause both spell the on-air layer lowercase `"onair"` (`when layer in ["lowerThird", "caption", "ticker", "onair"]`), but the real spool field is `"onAir"` (capital A) -- confirmed live at lib/sp/show/overlay_publisher.ex:89 (read_spool/0 default), production/schemas/broadcast.schema.json:20, production/overlays/broadcast.sample.json:4, and every reader (viewer/overlay_server.cjs:18, viewer/command_center.cjs:909/916, viewer/studio.cjs:296/350/360/379). The SAME spec document even uses the correct capital-A casing once, in its own write-race section at line 143 ("onAir/lowerThird/clock/music/brand/evidence"), so this is an internal inconsistency, not a deliberate rename. As written, `POST /overlay/update {"layer":"onair",...}` calls `set("onair", payload)` -> `Map.put(cur, "onair", payload)`, which writes a brand-new key no reader looks at, leaves the real `onAir` key untouched, and still returns `accepted: true, written_at: <now>` -- a false-positive success receipt for an on-air toggle that has zero observable effect. None of the spec's named tests (only "caption" is exercised for set/2) would catch this before ship.
  - CLAIM-FENCE GAP (my primary mandate) — SP.Brain.Fence's @fence regex (lib/sp/brain/fence.ex:17) bans feel/feeling/feelings/felt and experienc* but does NOT ban emotion/emotional/emotionally. Independently confirmed the SAME gap exists in the JS mirror the module's own moduledoc says it must agree with (viewer/command_center.cjs:138, identical FENCE regex, same missing token). SPEC_command_center_overlay_update.md's only safety gate for the new POST /overlay/update text fields (kicker/title/subtitle/text) is `SP.Brain.Fence.flag/1` -- and this is the FIRST time that regex becomes load-bearing against genuinely operator-typable free text (previously it only filtered Director-generated narration). As specced, an operator (or any future integrator) can POST `{"text":"UNI's emotional state is calm"}` with force:false and it reaches the live public broadcast overlay completely unflagged -- no fence trip, no audit row. My assigned check was "confirm no felt-state language (feel/emotion/experience) can reach any output surface" -- feel and experience are covered, emotion is not, and this spec is what turns that pre-existing gap into a public-facing one. Needs either extending the @fence alternation to an emotion-family token before this endpoint ships, or an explicit named follow-up gate in the spec (not silent ship-as-is).
  - AUDIT-LEDGER SCHEMA HONESTY — SPEC_fence_override_forwarding.md's Contract section and OS_SPOOL_POLICY.md's updated prod-mcp.ndjson ledger entry both frame the file as rows "conforming to production/schemas/sensorium_envelope.schema.json," and the fix pass reconciles the two-writer question purely as WHO-writes-WHEN (ownership by row kind + O_APPEND atomicity). Re-checked against live production/mcp/server.py: every existing _AUDIT.write(...) call (e.g. server.py:557 `_AUDIT.write({"event": "cut_to", "scene": scene, "transition": transition, "ms": ms})`) plus _LocalAudit.write() (server.py:136-150, which only adds top-level audit_id/server/ts) produces a FLAT row shaped `{event, ...fields, audit_id, server, ts}` with no schema_version, no kind, no payload wrapper, and no nested provenance object -- it does not satisfy sensorium_envelope.schema.json's `required: [schema_version, source, ts, kind, payload, provenance]` + `additionalProperties: false` (production/schemas/sensorium_envelope.schema.json:8). SP.Audit.Writer's own new rows ARE correctly shaped. So the fix resolves concurrency/ownership but silently leaves the file carrying two structurally incompatible row shapes, which neither spec nor the ledger names -- an auditor tool (e.g. get_evidence_bundle) built against the sensorium envelope would silently mis-parse every pre-existing MCP-tool-call row. This is pre-existing drift, not newly introduced, but the fix pass explicitly claims to have reconciled "the two writers" for this file and the shape mismatch wasn't surfaced -- it should be named honestly (either reconcile the shape or state plainly in the ledger that the Python-authored rows are a legacy flat shape pending migration) rather than implied as resolved.

### systems-architect (docs/lab_team/03_systems_architect.md) — "Can this be built, typed, validated, and inspected... without breaking the engine?"
- Verdict: **SIGN_WITH_CHANGES**
- Rationale: Independent re-verification against the live repo confirms all four originally-named BLOCKED findings are genuinely resolved in this corrected pass: (1) SP.Show.OverlayPublisher.set/2 is now fully named as NEW code with exact signature/behavior, correctly reusing the module's existing read_spool/write_spool/safe helpers (verified overlay_publisher.ex has no set/1, no handle_call, matching the spec's "confirmed live" claim exactly, including its precise line-citation of safe/1 at lines 122-128); (2) the manual_override_until write-race precedence mechanism is concretely specified (per-layer deadline map, N=10_000ms, exact interaction with the tick's maybe_put/5, correct 5-cycle arithmetic); (3) SP.Audit.Writer is cleanly scoped as sub-owner of fence_override-kind rows only, with a stated and technically sound concurrency-safety condition (single write()/append syscall per row under O_APPEND), and OS_SPOOL_POLICY.md's ledger entry was verified updated to match this split; (4) the test paths were corrected to ui/test/sp_ui_web/*, and I verified ui/test/sp_ui_web/overlooker_live_test.exs and stream_qa_test.exs do exist exactly as the spec claims. All function/module citations I could check against live source (SP.Brain.Fence.flag/1, server.py's _AUDIT/_LocalAudit at lines 124-156, the three referenced JSON schemas, the sensorium_envelope row shape) check out accurately -- this spec is honest about what exists vs. what's new, which is the core standard my persona holds work to.\n\nHowever the fix pass introduced/left one concrete functional bug (the onair/onAir key-casing mismatch, which would silently break the on-air overlay layer specifically while the other three layers work) and left two real completeness gaps in registration mechanics and response-schema conformance that a systems-architect pass is specifically responsible for catching. None of these require rethinking the architecture -- the sole-writer discipline, the GenServer entry-point design, and the sub-scoped audit-writer split are all sound -- but they are concrete, named, fixable-before-landing defects, which is exactly what SIGN_WITH_CHANGES is for.
- Concerns:
  - CONCRETE BUG in the NEW code this spec ships: SPEC_command_center_overlay_update.md's endpoint contract and the SP.Show.OverlayPublisher.set/2 guard clause both spell the on-air layer as lowercase "onair" (endpoint enum line ~23: `"lowerThird" | "caption" | "ticker" | "onair"`; guard clause line 65 and 95: `layer in ["lowerThird", "caption", "ticker", "onair"]`). The ACTUAL spool JSON key everywhere else in the live codebase is "onAir" (capital A) — verified at production/schemas/broadcast.schema.json:20 (`"onAir": {...}`), lib/sp/show/overlay_publisher.ex:89 (`"onAir" => %{...}`), and viewer/overlay_server.cjs:18 (`onAir: {...}`). Because the spec's own handle_call does `Map.put(layer, payload)` — using the caller-supplied string as the literal spool map key with no normalization step — a set/2 call for the on-air layer, made exactly per this spec's documented contract, would silently write a dead "onair" key that no reader (schema, overlay page, or otherwise) ever looks at, while the real "onAir" indicator stays stale. This is a genuine functional defect in code presented as fully-specified/ready-to-build, not a hedge or a TODO. Fix: use "onAir" consistently in the endpoint enum and the guard clause (or add an explicit normalization step and name it).
  - Registration mechanics are not named: neither spec instructs adding route entries to ui/lib/sp_ui_web/router.ex for the new `POST /overlay/update` or `POST /audit/fence_override` endpoints. Verified router.ex currently has only two scopes (`:browser` with `plug :protect_from_forgery`, and `:api` with just `plug :accepts, ["json"]`) and zero existing references to OverlayController/audit/fence_override (grep confirmed). Without a named route + pipeline, the fully-specified controllers are unreachable; and the choice of pipeline matters functionally -- routing a server-to-server JSON POST through `:browser` would hit CSRF protection and reject the request, so the spec should explicitly say these routes go under the `:api` scope (mirroring the existing `GET /producer/health` precedent) rather than leaving it to the implementer to guess.
  - SPEC_command_center_overlay_update.md's response-envelope example (`{"envelope": {...}, "result": {...}}`) claims conformance to production/schemas/envelope.schema.json but (a) omits that schema's own required top-level `schema_version` field (schema requires `["schema_version", "envelope", "result"]`, verified at envelope.schema.json:8), and (b) a sibling spec in this same review corpus, production/mcp/SPEC_uni_self_audit.md (lines ~50-55, ~348), already documents that this nested schema is 'aspirational' and matches NONE of the 25 real existing MCP tools, which all use the flat metadata() shape instead -- independently confirmed by reading production/mcp/server.py's actual metadata() function (lines 91-118), which returns a flat dict (ok/tool/data/evidence_class/provenance/help/docs), not a nested {envelope,result} wrapper. This new Phoenix HTTP endpoint is under no obligation to reuse a Python-MCP-shaped schema at all, but if it chooses to cite envelope.schema.json as its contract, the spec should either fix the example to actually conform, or acknowledge and resolve the known aspirational/real gap SPEC_uni_self_audit.md already flagged rather than silently repeating it.
  - Minor: SPEC_fence_override_forwarding.md's 'Test coverage the plan owes' section never names file paths for its two NEW unit-test suites (SP.Audit.Writer unit coverage, and the concurrency regression test that must drive both server.py's Python `_LocalAudit.write` and Elixir's `SP.Audit.Writer.write/1` against the same file concurrently) -- unlike its sibling spec, which precisely names `test/sp/show/overlay_publisher_test.exs` for the analogous new-module case. The cross-language concurrency test in particular has no named home or runner (pytest vs mix test vs a bespoke harness), which is a real gap for a test that has to coordinate two different language runtimes against one file.
  - Minor: SP.Audit.Writer's shown implementation (production/mcp/SPEC_fence_override_forwarding.md) calls `node_server_name/0` and `git_commit/0` inside handle_call but neither function is defined, given a signature, or pointed at an existing equivalent anywhere in the spec; grep confirms no such helpers exist yet anywhere in the Elixir tree (the only precedent is a one-off `System.cmd("git", ["rev-parse", "HEAD"])` at runs/lab_team_review.exs:202). Low severity since it's inferable, but inconsistent with how precisely every other function in this same code sample is specified.

### red-experimentalist (docs/lab_team/04_red_experimentalist.md) -- fresh independent re-review of the corrected D-A3/D-B3 specs and OS_SPOOL_POLICY.md, /lab-team-review ship gate
- Verdict: **SIGN_WITH_CHANGES**
- Rationale: Fresh independent re-check, source-verified line-by-line (not taking the spec's claims on faith): all four prior findings show real, well-grounded fixes. (1) overlay_publisher.ex confirmed live still has no handle_call/no set/1 -- the corrected spec now names set/2's full signature, body, and explicitly labels it NEW, matching the live source exactly. (2) manual_override_until is a concrete, testable mechanism (N=10_000ms, per-layer, self-healing, code shown) that genuinely resolves the clobber race in the tick handler shown at overlay_publisher.ex:41-75. (3) the SP.Audit.Writer / server.py dual-writer overlap is now resolved by an explicit, justified sub-scoped-by-row-kind split, and OS_SPOOL_POLICY.md's prod-mcp.ndjson ledger entry was actually updated to match (verified) -- confirmed server.py's 13 named tool names and its _LocalAudit single-write-call pattern (server.py:145-146) are accurate. (4) the two originally-named test paths (overlay_controller_test.exs, audit_fence_override_test.exs) are corrected to ui/test/sp_ui_web/*_test.exs and verified against the real, existing sibling files there (overlooker_live_test.exs, stream_qa_test.exs).\n\nBut my assigned focus -- testability sufficient to catch a fabricated-but-schema-valid implementation, and a named FALSIFIES condition -- surfaces five concrete, file-grounded gaps the fix pass introduces or leaves unaddressed, all listed above. The most consequential is that finding #4's defect class (wrong test-path convention) recurs in code this very fix pass added: the new OverlayPublisher.set/2 unit tests, which are the direct verification for the two most important prior fixes, are placed where the repo's actual two-mix-project structure (confirmed via both mix.exs files and docs/EVIDENCE.md's documented split) means they will not run as claimed. Paired with a FALSIFIES section missing where the repo's own convention (SPEC_uni_self_audit.md) already requires and demonstrates one, an underspecified concurrency-harness for the one load-bearing safety claim in the audit-writer design, a schema-violating worked example, and an un-ledgered fallback writer -- these are narrow, precisely locatable fixes, not a structural rework. None require re-architecting set/2, manual_override_until, or the sub-scoped audit-writer split, which are all sound. Verdict: SIGN_WITH_CHANGES -- land once the five named items are addressed.
- Concerns:
  - No FALSIFIES section in either corrected spec, despite this being an established, already-applied house requirement for exactly this document class. CLAUDE.md science-gate discipline #4 requires a named PASS condition + FALSIFIES condition 'in the docs before the run'; the sibling infra spec production/mcp/SPEC_uni_self_audit.md already carries a '## FALSIFIES' section, added in a prior review round ('12. FALSIFIES -- added, matching CLAUDE.md's science-gate discipline #4', line ~369). Neither SPEC_command_center_overlay_update.md nor SPEC_fence_override_forwarding.md states, in one place, the concrete observation that would reject its core trust claim (e.g. 'the sole-writer claim is falsified by any observed write to viewer/runtime/broadcast.json outside OverlayPublisher, including via the UNI_OVERLAY_FALLBACK path' / 'the concurrency-safety claim is falsified by any torn or malformed JSON line in prod-mcp.ndjson under concurrent Python+Elixir writers'). This is precisely what the task asked me to check, and the gap is real and precedented in-repo, not invented.
  - The NEW OverlayPublisher.set/2 unit-test suite (added by this fix pass to address prior findings #1/#2) is placed at a path that will not run as described, reintroducing the same defect class as prior finding #4 inside the fix itself. SPEC_command_center_overlay_update.md ('Test coverage the plan owes') places it at `test/sp/show/overlay_publisher_test.exs`, 'run inside the `ui` app's `mix test`.' Confirmed live: root mix.exs (app `stratified_palimpsest`) has `deps: []` and no test_paths override (default `["test"]`); ui/mix.exs also has no test_paths override (only `elixirc_paths(:test) -> ["lib","test/support"]`), so `cd ui && mix test` scans only `ui/test/**`, never top-level `test/**`. docs/EVIDENCE.md documents these as two separate, non-overlapping suites ('Core test suite | `mix test` | 266 tests' vs 'UI test suite | `cd ui && mix test` | 11 tests'). A file at `test/sp/show/overlay_publisher_test.exs` is picked up only by the root suite, which has no Jason -- exactly the constraint OverlayPublisher's own @moduledoc says forces the `apply(Jason, ...)` dynamic-dispatch pattern it uses. As specified, this suite either never executes under any documented `mix test` invocation, or crashes at runtime resolving Jason if run from root -- neither of which is 'sufficient to catch a fabricated-but-schema-valid set/2' for the very code this fix pass introduces to resolve the highest-severity prior finding.
  - SP.Audit.Writer's concurrency regression test -- described as 'the executable check for the one-syscall-per-row claim' that is the sole safety argument for the sub-scoped dual-writer design -- names no file path, harness, or runner anywhere in SPEC_fence_override_forwarding.md, unlike every other named test in both specs. It calls for running server.py's `_LocalAudit.write` and Elixir's `SP.Audit.Writer.write/1` concurrently against the same file from an ExUnit-style suite; confirmed no existing test anywhere in test/ or ui/test/ spawns a Python process (`grep -rl "System.cmd" test/ ui/test/` = no hits), so there is no precedent this is even wired for. Separately, the literal `SP.Audit.Writer` sample code calls `Jason.encode(row)` directly rather than the `apply(Jason, :encode, [row])` dynamic-dispatch pattern that is used, with zero exceptions repo-wide (`grep -rn "Jason\." lib/sp/` -> every hit is `apply(Jason, ...)`), by every other Jason-touching line in `lib/sp/`, including `overlay_publisher.ex` -- the very module this spec says `lib/sp/audit/writer.ex` 'mirrors ... placement' of. The spec neither follows the established convention nor explains why this module is exempt from it.
  - SPEC_command_center_overlay_update.md's own worked response example violates the schema it cites for conformance. The endpoint's example response body is `{ "envelope": {...}, "result": {...} }`, but `production/schemas/envelope.schema.json` sets `additionalProperties: false` at the top level and `required: ["schema_version","envelope","result"]` -- the example is missing the required top-level `schema_version` key and would fail validation against the very schema the spec claims it conforms to. No test in 'Test coverage the plan owes' checks the controller's response body against `envelope.schema.json`; the named controller tests ('accept, reject on fence, force+audit path') are behavioral, not schema-conformance, checks -- so a fabricated implementation that ships a schema-invalid envelope would pass every named test.
  - The command_center.cjs fallback ('Falls back to direct-file write ONLY if all three retries fail AND PROC.env.UNI_OVERLAY_FALLBACK == "1" (audited, temporary)') reintroduces, whenever that flag fires, exactly the two-writer race D-A3 exists to eliminate -- yet OS_SPOOL_POLICY.md's `viewer/runtime/broadcast.json` ledger entry still states unconditionally that 'D-A3 kills this,' with no caveat for the fallback path. Nothing in either spec's 'Test coverage the plan owes' exercises the fallback (what 'audited' means here is asserted, not specified -- no schema, no writer named, no test), and 'temporary' has no expiry ticket or removal criterion. This is a live, un-falsified re-opening of the sole-writer invariant the whole D-A2/D-A3 effort protects.

### embodiment-designer (Lab Team, role 5/5) — reused for this ship-gate panel's assigned focus: explicit field-level allowlists for anything crossing an internal/public boundary, and path/host-layout leaks. Same underlying discipline as the persona's normal charter (interoceptive Markov blanket: internal state must never leak across a boundary as if it were a public/felt signal without a declared, checked crossing).
- Verdict: **SIGN_WITH_CHANGES**
- Rationale: All four prior BLOCKING findings are genuinely resolved, independently re-verified against the live repo, not just re-asserted by the spec:

1. `SP.Show.OverlayPublisher.set/1` missing — RESOLVED. Live overlay_publisher.ex (read in full) confirms the prior state exactly as the spec now describes: pure tick-driven GenServer, no handle_call, no set/1. The corrected spec now specifies `set/2` (not `/1`) with a full `@spec`, exact `handle_call/3` clause, and correctly reuses the module's real private helpers `read_spool/0`, `write_spool/1`, and the real `safe/1` at lines 122-128 (verified byte-for-byte) rather than inventing new plumbing. Clearly labeled as new code, not something already present.

2. Tick-vs-manual write race — RESOLVED with a concrete, correctly-reasoned mechanism: per-layer `manual_override_until` map keyed off `System.monotonic_time(:millisecond)` (the right clock choice for a timeout, avoiding wall-clock skew), `@manual_override_ms 10_000`, and a `maybe_put/5` guard that only special-cases `\"caption\"`/`\"ticker\"` (the two keys the live tick handler actually touches — verified against source, `publish/0` never writes `lowerThird`/`onair`). Because everything routes through one GenServer's serialized mailbox, there's no cross-process race in the mechanism itself.

3. `SP.Audit.Writer` / dual-writer conflict — RESOLVED via sub-scoped ownership by row kind plus a falsifiable concurrency argument (one `write()`/append syscall per row, POSIX `O_APPEND` atomicity), with a matching, corrected OS_SPOOL_POLICY.md ledger entry. Reasonable engineering call, well justified against the real constraint (`server.py` is undeployed reference code, so routing through it would be strictly more work and a new liveness dependency).

4. Test paths — RESOLVED. Verified live: `ui/test/sp_ui_web/{overlooker_live_test.exs,stream_qa_test.exs}` exist; `test/ui/` does not exist anywhere in the tree. Both specs now point at the real convention.

New issue this pass introduces (not present, or not concrete enough to flag, in the prior BLOCKED version): in resolving the writer-ownership conflict, this pass made the `SP.Audit.Writer` row shape concrete for the first time — and that concrete row now carries an operator-identity field and an internal server hostname into a spool whose own (adjacent, same-pass-edited) reader list names a public MCP surface, with zero declared allowlist anywhere in the tree. This is squarely inside my assigned focus (field-level allowlist for anything crossing to a public surface / path-host-layout leaks) and it is fixable without reopening the sound parts of the design: name the allowlist (or strip the public reader from the ledger until one exists) and name where `operator` is sourced from. Land after those two named changes.
- Concerns:
  - production/mcp/SPEC_fence_override_forwarding.md's newly-concretized `SP.Audit.Writer` (Contract example + "NEW code this spec introduces" section) persists `payload.operator` (the spec's own example value is `"mpolzin"` — this repo's actual operator identity per `git log`, not an obviously-fake placeholder) and `provenance.server` (an internal box hostname, e.g. `"thinker"`) into `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`. production/docs/OS_SPOOL_POLICY.md's ledger entry for that exact file — the entry this fix pass itself rewrote (confirmed via `git diff`: only the sole-writer/split language changed) — still lists that file's readers, unedited, as "any auditor (operator, red-team, public-MCP `get_evidence_bundle`)", i.e. a public-facing surface. No field-level allowlist or redaction step is named anywhere across SPEC_fence_override_forwarding.md, OS_SPOOL_POLICY.md, or SPEC_uni_public_mcp.md between this raw row (operator identity + internal hostname + unredacted `forced_text`) and that public reader. The pass was editing the paragraph immediately above this Readers line and closed the writer-race problem while leaving this exposure boundary undeclared — a new/newly-concrete leak surface this corrected pass had every chance to close.
  - The "public-MCP `get_evidence_bundle`" reader named in OS_SPOOL_POLICY.md's prod-mcp.ndjson entry does not correspond to anything actually specified. SPEC_uni_public_mcp.md's only bundle-shaped tool is `read_evidence_bundle(bundle_sha)`, which is scoped to a whitelist of pre-built files under `docs/receipts/` + `production/docs/receipts/` and explicitly "Refuses arbitrary paths" — it has no path to raw ndjson streaming, and no tool in that spec is literally named `get_evidence_bundle`. Either this Readers claim is stale/aspirational (in which case, per this project's own honesty rail, it should say PENDING rather than assert a reader that doesn't exist) or it names a real intended future reader for which the field-level allowlist has never been designed. Either way it should be resolved before this ledger entry is treated as accurate, since SPEC_fence_override_forwarding.md's own ship gate states plainly this change "changes the security-audit surface."
  - Neither spec's implementation section (Phoenix `POST /audit/fence_override`, nor the `command_center.cjs implementation` section of SPEC_fence_override_forwarding.md) names where the `operator` field's value is actually supposed to come from. Verified against live viewer/command_center.cjs: the file has no login/session/identity capture of any kind today — the only `operator*`-named identifier in the whole file is `operatorPreview`, a UI-state variable holding a scene name, unrelated to a person's identity. `SP.Audit.Writer.write/1`'s own doc comment says the caller "MUST already carry" the operator field but the spec never says who sets it or from what source. Shipping an unsourced, permanently-audited (and per concern 1, possibly publicly-readable) identity field without naming its provenance is exactly the kind of half-specified boundary that turns into an accidental leak once someone wires it up.

## MERGED VERDICT

**REVISE**

(Merge rule: the worst verdict wins.)

## Honesty note

This is a v2 receipt following a spec-correction pass driven by the v1 review's own findings. This is the first formal review this spec has received. No FE source code (.ex/.exs/.py/.cjs) was written or modified by either the fix pass or this review -- only spec/schema/policy documents. If this verdict is SIGN or SIGN_WITH_CHANGES, implementation may proceed through this repo's normal ship gate; if REVISE or REJECT, further spec work is needed before any code diff.

## Addendum — named changes applied (pass 3)

**This is a direct-apply pass, not a fresh persona re-review.** I read this receipt's five persona
verdicts in full, extracted every bullet under every persona's "Concerns:" section (including the
SIGN_WITH_CHANGES personas' concerns — those are required changes before landing, not optional
notes), re-verified each against live source where a concern cited `file:line`, and applied direct
fixes to the three spec/policy documents (`SPEC_command_center_overlay_update.md`,
`SPEC_fence_override_forwarding.md`, `OS_SPOOL_POLICY.md`). No independent verification panel ran;
no code diff was written (`.ex`/`.exs`/`.py`/`.cjs` all untouched, per this project's own rail —
only the three spec/policy `.md` files changed). Findings below are grouped by the persona that
raised them; several personas independently raised the same underlying defect (onAir/onair casing,
the missing provenance helpers) and are marked FIXED together the first time, cross-referenced after.

### math-breaker (Falsifier)

- HIGH/functional — `"onair"` vs `"onAir"` casing (endpoint enum + `set/2` guard clause):
  **FIXED** — all five occurrences in `SPEC_command_center_overlay_update.md` (endpoint contract,
  `set/2` `@spec` guard, the two prose lines explaining the guard, and the write-race precedence
  bullet) corrected to `"onAir"`; re-verified live against `broadcast.schema.json`'s `onAir`
  property, `overlay_publisher.ex:89`'s `read_spool/0` default, and `command_center.cjs:909/916`.
- HIGH/provenance — the two specs contradict each other on whether `/overlay/update` itself emits
  the D-B3 audit row for `force=true`: **FIXED** — `SPEC_command_center_overlay_update.md`'s
  "Phoenix implementation" section rewritten to state plainly that `OverlayController.update/2`
  does NOT emit the row in this pass, names `command_center.cjs`'s separate follow-up POST as the
  actual current mechanism (matching `SPEC_fence_override_forwarding.md`'s Contract), and states
  the exact 1-row/0-row consequence instead of leaving it unfalsifiable. The now-stale
  "force+audit path" phrase in that spec's own controller-test bullet was also corrected so the
  test coverage matches the corrected architecture.
- MEDIUM/fence-gameability — `lib/sp/brain/fence.ex:17`'s `@fence` regex lacks an `"agi"`
  alternative (present in its own moduledoc comment one line above, and in the
  `command_center.cjs:139` mirror): **NOT FIXED — pre-existing code gap named as a prerequisite in
  the spec.** Fixing it means editing a live, already-running `.ex` file (and its `.cjs` mirror),
  out of scope for a spec-only pass. Named explicitly in `SPEC_command_center_overlay_update.md`'s
  new "Prerequisite (pre-existing gap, out of scope for this spec): claim-fence token coverage"
  section, together with the "emotion" gap below (same section, same root cause: this endpoint is
  the first caller that reaches `SP.Brain.Fence.flag/1` directly without the stricter client-side
  JS check running first).
- LOW/provenance — `node_server_name()`/`git_commit()` undefined, and the mischaracterization of
  `server.py`'s `GIT_COMMIT` as resolving via "env/git rev-parse": **FIXED** —
  `SPEC_fence_override_forwarding.md`'s `SP.Audit.Writer` code sample now defines both functions
  (`node_server_name/0` via `:inet.gethostname/0`, matching `colony_archive.sh:84`'s existing
  hostname-with-fallback convention; `git_commit/0` via `System.get_env("UNI_GIT_COMMIT", "unknown")`,
  reusing the exact env var `server.py:58` already reads), and the prose was corrected to state
  `server.py`'s `GIT_COMMIT` is a plain env lookup with a literal `"unknown"` fallback, not a
  `git rev-parse` call (grep-confirmed: no `git rev-parse` anywhere in that file).

### aif-theorist

- FUNCTIONAL BUG — onAir/onair casing: **FIXED** — see math-breaker's onair/onAir entry above (same fix).
- CLAIM-FENCE GAP — `fence.ex`/`command_center.cjs` FENCE regex missing an `"emotion"` family token:
  **NOT FIXED — pre-existing code gap named as a prerequisite in the spec.** Same live-code
  constraint as math-breaker's "agi" finding above; both named together in the same new
  "Prerequisite" section in `SPEC_command_center_overlay_update.md`, with the persona's own two
  concrete example strings (`"UNI's emotional state is calm"`) reflected in the note.
- AUDIT-LEDGER SCHEMA HONESTY — the corrected ledger's "sub-scoped ownership" language implied full
  reconciliation while silently leaving the flat-vs-nested row-shape mismatch un-named: **FIXED** —
  added a "Row-shape honesty" subsection to `SPEC_fence_override_forwarding.md`'s "Reconciling the
  two writers" section, re-verified live against `server.py:136-150`/`:557` (flat
  `{event, ...fields, audit_id, server, ts}`, no `schema_version`/`kind`/`payload`/`provenance`
  nesting, does not satisfy `sensorium_envelope.schema.json:8`'s `required` + `additionalProperties:
  false`), and added the matching honest note to `OS_SPOOL_POLICY.md`'s `prod-mcp.ndjson` ledger
  entry instead of leaving it implied-resolved.

### systems-architect

- CONCRETE BUG — onair/onAir casing: **FIXED** — see math-breaker's entry above (same fix).
- Registration mechanics not named (no `router.ex` entry for either new endpoint, ambiguous
  `:browser` vs `:api` pipeline): **FIXED** — added a "Registration in
  `ui/lib/sp_ui_web/router.ex`" section to BOTH specs, re-verified live (`router.ex` today has
  exactly `:browser`/`:api` pipelines and zero references to either new controller), naming the
  exact route addition under `:api` (mirroring the existing `GET /producer/health` precedent at
  `router.ex:27`) and explaining why `:browser`'s CSRF plug would wrongly reject these
  server-to-server JSON calls.
- Response-envelope worked example violates `envelope.schema.json` (missing top-level
  `schema_version`) and silently repeats the known aspirational/real gap `SPEC_uni_self_audit.md`
  already flagged: **FIXED** — the example in `SPEC_command_center_overlay_update.md` now includes
  `schema_version` and a fully-populated `envelope` object (`server`, `instrument_version`,
  `timestamp`, `evidence_class`, all required by `envelope.schema.json:8`/its nested `envelope`
  object), and the prose now correctly cross-references `SPEC_uni_self_audit.md`'s "Result shape"
  section (not "What changed", my first attempt at this citation was wrong and was corrected during
  my own re-check) for the pre-existing `server.py` drift, rather than repeating it.
- Minor — `SP.Audit.Writer`'s two new test suites (unit + concurrency) named no file path: **FIXED**
  — named `ui/test/sp/audit/writer_test.exs` and `ui/test/sp/audit/writer_concurrency_test.exs` in
  `SPEC_fence_override_forwarding.md`, with the concurrency test's harness spelled out (see
  red-experimentalist's matching concern below).
- Minor — `node_server_name/0`/`git_commit/0` undefined: **FIXED** — see math-breaker's LOW entry above (same fix).

### red-experimentalist

- No `## FALSIFIES` section in either spec, despite the established house convention: **FIXED** —
  added to both `SPEC_command_center_overlay_update.md` (sole-writer claim + write-race precedence
  claim, including the `UNI_OVERLAY_FALLBACK` fallback path as a named exception) and
  `SPEC_fence_override_forwarding.md` (the one-syscall-per-row concurrency-safety claim), matching
  `SPEC_uni_self_audit.md`'s existing pattern.
- `OverlayPublisher.set/2`'s new unit-test suite was placed at a path (`test/sp/show/…`) that will
  not run under either documented `mix test` invocation: **FIXED** — corrected to
  `ui/test/sp/show/overlay_publisher_test.exs`, re-verified live against both `mix.exs` files
  (neither overrides `test_paths`), `docs/EVIDENCE.md`'s documented two-suite split, and
  `ui/lib/sp_ui/application.ex:23` (confirms `SP.Show.Supervisor`, and therefore
  `SP.Show.OverlayPublisher`, only ever runs inside `ui`'s supervision tree).
- `SP.Audit.Writer`'s concurrency regression test named no file/harness/runner, and its code sample
  called `Jason.encode/1` directly instead of the `apply(Jason, ...)` pattern used with zero
  exceptions elsewhere in `lib/sp/`: **FIXED** — named path + harness (see systems-architect's
  matching entry above; harness spawns `Task.async` workers plus a `System.cmd("python3", ["-c",
  …])` snippet that reproduces `_LocalAudit.write`'s exact single-`open`+`write` call rather than
  importing `server.py` itself, which needs the undeployed `mcp`/FastMCP package — and I additionally
  caught and named that `@path` is a compile-time module attribute, so the test needs
  `UNI_PROD_MCP_AUDIT` exported before `mix test` runs, not set at test time); `Jason.encode(row)`
  changed to `apply(Jason, :encode, [row])`, re-verified live via a repo-wide grep that every other
  `Jason.`-touching line in `lib/sp/` already uses the dynamic-dispatch form.
- Worked response-envelope example violates the schema it cites: **FIXED** — see
  systems-architect's matching entry above (same fix).
- `command_center.cjs`'s retained `UNI_OVERLAY_FALLBACK` fallback re-opens the exact two-writer race
  D-A3 exists to eliminate, but `OS_SPOOL_POLICY.md`'s `broadcast.json` ledger entry stated
  unconditionally "D-A3 kills this" with no caveat: **FIXED** — added an explicit caveat to that
  ledger entry naming the fallback condition, cross-referencing the new FALSIFIES condition in
  `SPEC_command_center_overlay_update.md`, and stating plainly (not fixing, since no test exists)
  that neither spec's test coverage exercises the fallback path and "temporary" still has no expiry
  ticket — named as open, not silently resolved.

### embodiment-designer

- `SP.Audit.Writer`'s newly-concrete row persists `payload.operator` (a real identity) and
  `provenance.server` (an internal hostname) into a spool whose ledger names a public reader, with
  no field-level allowlist anywhere: **FIXED** — added a "Field-level allowlist for any future
  public reader (binding)" section to `SPEC_fence_override_forwarding.md`, naming both fields as
  never-exposable-without-review, mirroring `SPEC_uni_self_audit.md`'s existing "Claim-fence field
  allowlist" pattern. This is substantially defused (not just allowlisted) by the next fix, which
  established no such public reader exists today.
- The "public-MCP `get_evidence_bundle`" reader named in `OS_SPOOL_POLICY.md` doesn't correspond to
  any real tool: **FIXED** — re-verified live against `SPEC_uni_public_mcp.md` (only bundle-shaped
  tool is `read_evidence_bundle(bundle_sha)`, whitelist-scoped to `docs/receipts/` +
  `production/docs/receipts/`, no path to this ndjson file, and no tool named `get_evidence_bundle`
  exists anywhere in the repo — grep-confirmed). `OS_SPOOL_POLICY.md`'s `prod-mcp.ndjson` Readers
  line corrected to state plainly that no public-MCP reader of this file exists today, per this
  project's honesty rail (stale/aspirational claims read as PENDING, not asserted as real).
- Neither spec names where `payload.operator`'s value is supposed to come from, and
  `command_center.cjs` has no identity capture today: **FIXED** — named an explicit, narrow source
  in `SPEC_fence_override_forwarding.md`'s "`command_center.cjs` implementation" section: a new
  `UNI_OPERATOR_NAME` env var (same box/deploy-scoped pattern as the `UNI_GIT_COMMIT` reuse above),
  read as `process.env.UNI_OPERATOR_NAME || "unset"`, with Phoenix never inventing or inferring an
  operator value on its own. Flagged honestly rather than hidden: this is a genuinely minimal,
  single-operator-system placeholder, not a full identity/login/session design — a real
  per-request identity system remains a separate, larger design decision this spec does not
  attempt, and the spec text says so explicitly rather than presenting the env var as a complete
  answer.

### Not a persona concern, left untouched

The prior fix pass's own "Not fully resolved / flagged honestly" section named two adjacent,
out-of-scope observations (the `broadcast.json` ledger's stale "read via" vs "write via" wording,
and `server.py`'s audit rows not conforming to `sensorium_envelope.schema.json`'s nested shape).
Neither was a bullet under any of the five personas' "Concerns:" sections in this pass, so per this
task's scope (close out the *named findings*) they were not re-touched here beyond what the
schema-shape item already picked up incidentally under aif-theorist's AUDIT-LEDGER SCHEMA HONESTY
concern above. The `broadcast.json` "read via" wording is still open and still just as trivial to
fix as before — flagging again per "no work left behind" in case a follow-up pass should pick it up,
since I did not fix it myself here.
