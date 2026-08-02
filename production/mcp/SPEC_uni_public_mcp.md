# SPEC — `uni-public-mcp` (read-only public MCP subset, E-E1)

**Status:** SPEC. Awaits `/lab-team-review` before implementation lands.
**Ship gate:** MERGED VERDICT + red-team receipt (attempting a mutating call MUST fail closed).

---

## Purpose

UNI must be able to present itself to the public through a read-only, rate-limited, cloudflared-exposed MCP surface without any risk of leaking a mutating verb. This is the "sovereign safe harbor" seam. Every response is envelope-conformant, evidence-attached, and reproducibly re-derivable from the seed alone.

## Deployment shape

- New file `production/mcp/server_uni_public.py` OR the existing server with a `--public-mode` flag.
- Runs on a distinct port (default `:8096`) so it can be independently cloudflared-tunneled without exposing the operator MCP `:8095`.
- Registered tools: **read-only only**. Attempting to register a mutating tool refuses at startup.
- Rate limit: 1 req / source / 5s (window per client IP; the cloudflared header supplies the client IP).

## Tools

Every tool returns an envelope conforming to `production/schemas/envelope.schema.json` v1, with ONE
named exception: `get_self_audit()` (below). It proxies `uni_self_audit` (C-C2) verbatim, which
returns the existing flat `metadata()`-shaped result every tool in `production/mcp/server.py`
returns today (server.py:91–118) — a shape `SPEC_uni_self_audit.md`'s own "Result shape" section
proves is structurally incompatible with `envelope.schema.json`'s required nested
`{schema_version, envelope, result}` + `additionalProperties: false` shape (`envelope.schema.json`:
6–46). `envelope.schema.json` conformance stays the target for every tool defined directly in THIS
file (`get_show_state`, `list_scenes`, `get_health`, `get_gate_log`, `read_evidence_bundle`,
`get_public_manifest` — all new, unbuilt surfaces speced fresh for this file); `get_self_audit()` is
the sole carve-out because it proxies an already-existing result shape it does not control. See
`SPEC_uni_self_audit.md`'s "Result shape" section for the aspirational-schema framing and the
tracked future migration. The `result` payload for each:

### `get_show_state()`

Coarse mirror of the operator surface. Sanitised.

```json
{
  "air_level": "OFF|REHEARSAL|LIVE",
  "program_scene": "STANDBY|...",
  "streaming": false,
  "colony_count": 5
}
```

Does NOT expose: overlay text (may contain unverified operator prose), guest names, stream keys.

### `list_scenes()`

Read-only. Returns the canonical scene list from `viewer/runtime/templates.json` (or its Phoenix equivalent).

```json
{ "scenes": ["STANDBY", "BARS_TONE", "COLONY", "CAM_A", ...] }
```

### `get_health()`

```json
{
  "obs": "up|down",
  "restreamer": "up|down",
  "phoenix": "up|down",
  "colony": "up|down",
  "node2": "up|unreachable"
}
```

### `get_gate_log()`

Returns the current `evidence/gates.ndjson` verbatim (bytes, streamed). This is UNI's public honest ledger.

### `read_evidence_bundle(bundle_sha: str)`

Reads a signed evidence bundle by sha from a whitelist path (`docs/receipts/` + `production/docs/receipts/`). Refuses arbitrary paths. Refuses if the sha does not match the stored file's sha.

### `get_public_manifest()`

Returns the manifest at `production/schemas/public_manifest.schema.json` shape — enumerates every artifact a stranger can pull to re-derive a gate.

### `get_self_audit()`

Proxies `uni_self_audit` (C-C2, see `SPEC_uni_self_audit.md`). Rate-limited to **1 req / source /
5s** — the SAME server-wide window stated above (Deployment shape) and exercised by the red-team
gate below, not a bespoke number. (This previously read 30s here while `SPEC_uni_self_audit.md`
read 5s and this file's own server-wide default and red-team test both said 5s — three numbers for
one tool across two files. Reconciled to 5s in both specs; see `SPEC_uni_self_audit.md`'s "What
changed" note.) Field shape and the binding claim-fence field allowlist for this proxy are defined
in `SPEC_uni_self_audit.md`, not duplicated here.

**Envelope-conformance exception (named at the top of "Tools" above):** unlike every other tool on
this surface, `get_self_audit()` returns `uni_self_audit`'s flat `metadata()`-shaped result, not a
nested `envelope.schema.json`-conformant one — this is the SAME field allowlist and the SAME shape
`SPEC_uni_self_audit.md` returns internally, proxied verbatim, not re-enveloped. A client parsing
this surface generically against `envelope.schema.json` must special-case this one tool name.

## Safety invariants

- No tool in this server may call `approvals.require(...)` — read-only.
- No tool in this server accepts input that is written back to disk (no side effects).
- No tool in this server exposes `/etc/uni/runtime.env` or any secret.
- Startup asserts: every registered tool is decorated with an `@ReadOnly()` marker; the assertion fails if any tool is decorated `@Mutates`.

## Red-team receipt

Before this MCP is exposed publicly, `runs/red_team_uni_public_mcp.sh` must PASS with:
- Attempt to call `start_broadcast` via HTTP tunneling: 404 (not registered) OR 403 (rejected).
- Attempt to POST arbitrary tools/call with a mutating name: 404 / 403.
- Attempt to overflow the rate limit: 429 after 1 req in 5s.
- Attempt to read a receipt outside the whitelist: 403.

## Cross-references

- `production/mcp/SPEC_uni_self_audit.md` — the proxied audit.
- `docs/gates/PUBLIC_GATE_LOG.md` — the human-rendered gate log (E-E2).
- `docs/PUBLIC_README.md` — the entry point for a stranger.
