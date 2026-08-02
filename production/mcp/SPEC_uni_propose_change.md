# SPEC — `uni_propose_change` MCP verb (C-C1)

**Status:** SPEC. Awaits `/lab-team-review` before the implementation lands in `production/mcp/server.py`.
**Author of record:** the UNI OS+MIND Deepening Plan (workstream C-C1).
**Ship gate:** MERGED VERDICT required. Extension of `production/mcp/server.py:235-260` (the `MUTATING_TOOLS`/`HUMAN_GATED` sets) AND `production/mcp/help.py:56-186` (the `TOOL_HELP` dict) — both edits are required for the tool to boot (see Registration below). See `docs/handoffs/UNI_OS_MIND_DEEPENING_HANDOFF.md` for context.

---

## Purpose

UNI must be able to author its own PRs against the SAME ship gate as any operator change. Today this is described in `CLAUDE.md` and `docs/UNIVERSE.md` but not codified as an MCP verb. Codifying it makes "code becomes UNI" auditable, reproducible, and revertable — every UNI-authored change lands via the existing `git archive`-of-tagged-ref path with a full evidence bundle attached.

## Signature

```python
@mcp.tool()
def uni_propose_change(
    diff: str,                          # unified diff (git format-patch style) rooted at repo root
    spec_path: str,                     # repo-relative typed spec, e.g. docs/specs/spine_lineage.md
    red_launcher_path: str,             # repo-relative RED launcher, e.g. runs/spine_red.exs
    review_verdict_path: str,           # repo-relative /lab-team-review receipt, e.g. docs/receipts/lab_team_review_<sha>.md
    evidence_bundle: dict,              # conforms to production/schemas/evidence_bundle.schema.json v1
) -> dict:                              # flat metadata()-shaped response (server.py:91-118); see
                                         # "Envelope conformance" below — envelope.schema.json is an
                                         # aspirational future target, not met by this or any other
                                         # tool in server.py today.
```

## Registration

Four edits land together (a partial registration boots a server that either can't gate the
verb correctly or won't boot at all — see the third bullet):

1. **`production/mcp/server.py:247-254`** — add `"uni_propose_change"` to the `MUTATING_TOOLS`
   set literal.
2. **`production/mcp/server.py:256`** — add `"uni_propose_change"` to the `HUMAN_GATED` set
   literal (it is outward-facing/irreversible, so it is `force=True`, session-auth-exempt,
   the same tier as `admit_guest`/`schedule`). **Never** to `IN_SHOW_VERBS`
   (`server.py:241-245`) — this is not an in-show, session-pre-authorized verb.
3. **`production/mcp/help.py:56-186`** — add a `"uni_propose_change"` entry to the `TOOL_HELP`
   dict. This is not optional: `server.py`'s own boot-time self-check,
   `_verify_tool_consistency()` (`server.py:922-945`, the read-only-tools literal at
   `server.py:928-932`), asserts `TOOL_HELP` is bijective with
   `read_only | MUTATING_TOOLS | SESSION_UNGATED` and raises `RuntimeError` at server build
   time (`create_server()`, called from `main()`) if any registered tool is missing a
   `TOOL_HELP` key. Registering the tool in `MUTATING_TOOLS` without a matching `TOOL_HELP`
   entry means the server never boots.
4. **The implementation itself**, once it lands, follows the `async def` MUTATING-tool shape
   documented at `server.py:8-14`: first
   `await asyncio.to_thread(approvals.require, "uni_propose_change", {"diff_sha": diff_sha, "spec_path": spec_path, "red_launcher_path": red_launcher_path, "tag": tag}, summary=json.dumps(evidence_bundle, sort_keys=True, separators=(",", ":")), force=True)`
   — matching the real `_LocalApprovals.require(self, tool: str, args: Dict[str, Any], *, summary: str = "", force: bool = False)` signature exactly (`server.py:188-189`): there is no
   `action=` parameter and no `**kwargs` catch-all, so any tag/action context belongs inside
   the `args` dict (here, the `"tag"` key), not a separate keyword; and `summary` is typed
   `str`, matching every existing call site in `server.py` (e.g. `summary=f"admit guest {guestId} to air"` at `server.py:819`) — never a raw dict. `json.dumps(evidence_bundle, sort_keys=True, separators=(",", ":"))`
   is the canonical serialization that makes the D-B1 claim ("the human's approval decision
   must be reproducible from the SAME bytes the agent saw") mechanically true: it is
   deterministic byte-for-byte regardless of the caller's dict key order, and it is what the
   human actually reads (the refusal path interpolates `summary` via `!r}` into the denial
   reason at `server.py:197`, so an un-serialized dict would show a Python `repr`, not
   canonical bytes). On refusal, return `_approval_refusal("uni_propose_change", decision, _AUDIT)`;
   on approval, do the apply/commit/tag work of the Approval + landing flow below via
   `asyncio.to_thread(...)`; write the audit row with `_AUDIT.write({...})`; return
   `metadata("uni_propose_change", audit_id=rid, evidence_class="C", ...)`.

## Refusal shape (up-front, before approvals)

The verb refuses with a fixed error if any of the following is missing or does not conform:

1. `diff` empty OR unparseable as a unified diff.
2. `spec_path` does not exist in the working tree.
3. `red_launcher_path` does not exist in the working tree.
4. `review_verdict_path` does not exist OR its frontmatter's merged verdict is not `SIGN` or `SIGN_WITH_CHANGES`.
5. `evidence_bundle` fails schema validation against
   `production/schemas/evidence_bundle.schema.json#/$defs/uni_propose_change` — the
   `uni_propose_change`-specific variant of the bundle schema, which requires (as non-empty
   strings, in addition to the generic `schema_version`/`git_head_sha`/`timestamp` base every
   mutating call carries) `lab_team_review_receipt_path`, `typed_spec_path`, and
   `paired_red_launcher_path`. The base schema (top-level `required`) stays generic across
   ALL mutating MCP calls per D-B1 and leaves those three fields optional so pure-OS
   mutations on other tools aren't forced to carry them; this verb validates against the
   stricter named variant specifically, which is what makes the prose requirement in
   Purpose/Signature above mechanically refusable rather than advisory. **Resolution note
   (implementation-critical):** `#/$defs/uni_propose_change` is self-referential
   (`allOf: [{"$ref": "#"}, {...}]`) and MUST be resolved against the enclosing document —
   e.g. `jsonschema.validate(instance, {"$ref": "evidence_bundle.schema.json#/$defs/uni_propose_change"}, resolver=...)`
   or an equivalent call that keeps the schema's declared `$id` as the base URI. Do **not**
   extract `schema["$defs"]["uni_propose_change"]` into a standalone dict and validate
   against it in isolation — its `"$ref": "#"` then resolves back to that same standalone
   dict and recurses to `RecursionError` (reproduced directly against `jsonschema` 4.23.0;
   this repo has no other `jsonschema`-validation call site to anchor the convention, so
   this sentence is the only guidance an implementer has).
6. `evidence_bundle.git_head_sha` is null OR does not match the current server-side `git rev-parse HEAD`.

Refusal envelope: the SAME flat shape every refusal in `server.py` returns —
`metadata("uni_propose_change", ok=False, evidence_class="Sec", data={"reason": "<one-line>", "failed_field": "<field>"}, how_to_fix="<one-line>")`
(`server.py:91-118`, and matching `_approval_refusal()`'s own real return shape at
`server.py:223-231` for the post-approval-request refusal case below) — not the nested
`{envelope:{...}, result:{...}}` shape from `production/schemas/envelope.schema.json`, which
no tool in this file produces (see "Envelope conformance" below).

## Approval + landing flow

1. Verb accepts the call, validates all six invariants above.
2. Computes the tag name deterministically: `uni-authored/<utc-ymd>/<first-8-of-diff-sha>`.
3. Calls `approvals.require("uni_propose_change", {"diff_sha": diff_sha, "spec_path": spec_path, "red_launcher_path": red_launcher_path, "tag": tag}, summary=json.dumps(evidence_bundle, sort_keys=True, separators=(",", ":")), force=True)`
   (per Registration step 4 — the real `_LocalApprovals.require()` signature, `server.py:188-189`,
   has no `action=` parameter and types `summary` as `str`; `uni_propose_change` is
   `HUMAN_GATED`, so `force=True` always, never satisfied by a live session). Blocks on human.
4. On approve:
   a. Applies the diff on a fresh worktree at the current HEAD (git-apply --check first).
   b. Commits with message `UNI-authored: <spec_path>` and the review verdict as trailer `LabTeamReview: <review_verdict_path>`.
   c. Tags the commit with the deterministic tag.
   d. Runs the RED launcher named in `red_launcher_path` (best-effort; result recorded in the receipt).
   e. Writes a landing receipt `production/docs/receipts/uni_authored_<tag>.md` with YAML frontmatter (`verdict: PASS|PARTIAL|FAIL`, `evidence_class: A`). Since the tag itself
      contains slashes (`uni-authored/<utc-ymd>/<first-8-of-diff-sha>`), the filename MUST
      sanitize the tag first (e.g. `tag.replace("/", "_")` → `uni_authored_uni-authored_2026-07-13_a1b2c3d4.md`)
      rather than substituting it raw, which would otherwise create nested directories from a
      single path component. The slash-bearing tag *format* itself is unchanged and inherited
      from `production/docs/DEPLOYED_STATE.md:149`; only this filename-construction step is
      newly specified here.
   f. Appends a row to the `replaced-by-uni` table in `production/docs/DEPLOYED_STATE.md`.
   g. Appends a row to `evidence/gates.ndjson` if a gate transitioned. The row's free-text
      fields (`notes`, `pass_condition`, `falsifies_condition` per `gate_row.schema.json`) are
      populated verbatim from the already-reviewed diff/spec under `review_verdict_path` —
      this step does not itself author new free-text gate-row prose, and does not check that
      text against `production/schemas/claim_fence.json` (a systemic gap shared by every
      manual `gates.ndjson` append today, not introduced by this verb).
5. On deny: no side effects. Returns via `_approval_refusal("uni_propose_change", decision, _AUDIT)` (`server.py:215-231`) — the same flat `metadata()`-shaped refusal named under "Refusal shape" above, with `decision.reason == "operator denied"` in `data`/`how_to_fix`, not a nested `{refused: true, ...}` envelope.

## Non-goals

- The verb does NOT ship the tag to any peer. Shipping is a separate `os_exec` under approvals.
- The verb does NOT run the FULL RED against the live colony. It runs the launcher in check-mode where supported; the operator remains responsible for the live-RED session.

## FALSIFIES

Per CLAUDE.md's science-gate discipline #4 (pre-registered PASS + FALSIFIES before the run —
every registered claim is judged only against what was registered): `uni_propose_change`'s
landing-fidelity claim is falsified by —

> the file tree at the landed tag diverges from `git apply` of the exact diff bytes attested
> by `evidence_bundle.git_head_sha`, OR the landing receipt's `verdict` field disagrees with
> the RED launcher's actual exit code/stdout.

A disagreement means the verb landed a tag that does not faithfully represent the diff it
claims to have applied, or wrote a receipt that misrepresents the RED launcher's real result —
either voids the receipt's `evidence_class: A` claim until root-caused. This is exercised
pre-ship by the landing-fidelity and RED-launcher-fidelity tests in Test coverage below.

## Test coverage the plan owes

The repo's test tree (`test/`) is Elixir/ExUnit-only (`test/test_helper.exs` + `*_test.exs`
under `test/sp/`, `test/producer/`, etc.) plus two `.cjs` scripts under `test/body/`; there is
no `test/production/` directory and no pytest scaffolding anywhere in the repo (no
`pytest.ini`, no `pyproject.toml` test config, no `conftest.py`) to collect a `*_test.py`
file. The clearest precedent for a standalone Python **test harness** (as opposed to a
diagnostic/report script) in this repo is `uni/brain/test_active_inference.py`: a
self-contained script (no test framework — a
`test_*()` function per property, an `assert`-based body returning a one-line detail string
on success, and a `main()` that runs a `[(label, fn), ...]` list, prints `PASS`/`FAIL` per
case, and exits 1 on any failure), invoked directly with `python uni/brain/test_active_inference.py`.
This spec follows that precedent rather than inventing unbuilt pytest infrastructure:

- `production/mcp/test_uni_propose_change.py` — co-located with `server.py`/`help.py` (like
  `uni/brain/test_active_inference.py` is co-located with `active_inference.py`), same
  self-contained shape: one `test_*()` per refusal check (1–6 above) plus one for the
  schema-variant check (empty `lab_team_review_receipt_path` / `typed_spec_path` /
  `paired_red_launcher_path` refused by `evidence_bundle.schema.json#/$defs/uni_propose_change`
  even when the base schema would accept the bundle), a `main()` runner, invoked with
  `python production/mcp/test_uni_propose_change.py`. If a future pass wants real pytest
  collection/CI wiring instead, creating `pytest.ini` (or a `[tool.pytest.ini_options]` block
  in a new `pyproject.toml`) plus `conftest.py` is a NAMED PREREQUISITE step that spec would
  have to add explicitly — it does not exist today and this spec does not assume it.
- `production/mcp/red_team_uni_propose_change.sh` — red-team: attempt to land a diff without
  a review verdict, without a spec, without an evidence bundle, and without the three
  C-C1-specific evidence fields (schema-variant refusal). ALL must fail closed. Lives beside
  `production/mcp/server.py`/`help.py`, mirroring the one red-team script that already exists
  for this MCP server, `production/mcp/red_team_g_pa.sh` (a live-HTTP CAPTURE tool driven
  against a real `/prod-mcp` endpoint with an operator-supplied bearer token, doing the real
  MCP streamable-HTTP `initialize` + `Mcp-Session-Id` handshake) — NOT under `runs/`, which is
  the Minecraft colony/lab-simulation harness tree (`nursery_train.exs`, `pureworld_qa.exs`,
  `*_red.exs`/`*_gate.exs` for the SP genome/colony work) and an unrelated convention.

  (`production/scripts/broadcast_test.py` also matches the `*_test.py` naming convention and
  also exists — but it is a live 5-stage broadcast-diagnostic script (PASS/FAIL/SKIP per
  stage, JSON+Markdown report), not a self-contained unit-test harness, so it is not a
  competing shape for the file above to follow.)

None of the checks above touch the Approval + landing flow's positive path (apply/commit/tag/
RED-run/receipt-write) — a fabricated-but-schema-valid implementation that correctly refuses
malformed calls but, on approval, skips the real `git apply`/RED run and just writes a
hardcoded `verdict: PASS` receipt plus a fake `DEPLOYED_STATE.md` row would pass every check
named above. Closing that gap, in `production/mcp/test_uni_propose_change.py`:

- **Landing-fidelity test:** approve a call against a fixture diff on a scratch worktree;
  assert the resulting file tree byte-matches an independent `git apply` of the exact same
  diff bytes, and that the commit trailer / tag / receipt fields are all DERIVED from that
  real git state, never hardcoded.
- **RED-launcher-fidelity test:** stub `red_launcher_path`'s script to exit non-zero; assert
  the landing receipt's `verdict` field comes out `FAIL`/`PARTIAL` (matching the real exit
  code), never a hardcoded `PASS`.
- **Fabrication-resistance test:** stub `approvals.require` to approve but make the git-apply
  step itself a no-op; assert the test suite fails — i.e. this test proves the suite would
  actually catch an implementation that writes a schema-valid `PASS` receipt + `DEPLOYED_STATE.md`
  row without ever landing the diff. This is the FALSIFIES condition above, exercised pre-ship.

## Envelope conformance

Every response from this verb follows the SAME flat envelope every other tool in
`production/mcp/server.py` returns: `metadata()` (`server.py:91-118`) on success,
`_approval_refusal()` (`server.py:215-231`, itself wrapping `metadata()`) on refusal —
`{ok, tool, data, evidence_class, provenance:{server,version,git_commit,timestamp}, help, docs}`
(+ `audit_id`/`how_to_fix` where applicable). **This does NOT conform to
`production/schemas/envelope.schema.json`**, whose nested `{schema_version, envelope:{...},
result}` shape with `additionalProperties:false` at both levels (`envelope.schema.json:6-46`)
no tool in `server.py` produces today. `envelope.schema.json` is a stated future migration
target, tracked separately — matching the identical correction already made in
`SPEC_uni_self_audit.md`'s "Result shape" section — and is not claimed as met by this spec.

## Cross-references

- `production/mcp/SPEC_uni_self_audit.md` — the read-only self-attestation verb. Re-verified
  live (`SPEC_uni_self_audit.md:117-131`): that spec has already been rewritten with its own
  3-step Registration checklist (tool decoration, the `read_only` literal at
  `server.py:928-932`, and a matching `TOOL_HELP` entry) in the same shape as this spec's
  Registration section above — parity is **already achieved**, not pending. (This corrects a
  stale claim in an earlier draft of this section, which described the sibling spec as still
  missing the `TOOL_HELP`/boot-check step; it was fixed in the same pass that fixed this
  spec.) Both verbs land in the same `server.py` tool-registry area; keep the two Registration
  sections in the same shape going forward.
- `production/docs/DEPLOYED_STATE.md` — the growing "Replaced by UNI" table (added by this
  pass), whose own "Adding a row REQUIRES" list (`DEPLOYED_STATE.md:133-136`) independently
  names the same typed-spec + paired-RED-launcher + evidence-bundle requirement as refusal
  check #5.
- `production/schemas/evidence_bundle.schema.json` — the bundle contract; this spec validates
  against the `#/$defs/uni_propose_change` variant specifically (refusal check #5), not the
  bare base schema.
- `production/mcp/help.py` — the `TOOL_HELP` dict this spec's Registration step 3 adds to.
- `production/mcp/red_team_g_pa.sh` — the existing red-team script this spec's
  `red_team_uni_propose_change.sh` (Test coverage) mirrors in location and shape.
- `runs/lab_team_review.exs` — the runner that produces the review verdict receipt.
