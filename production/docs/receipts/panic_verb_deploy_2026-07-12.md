# Receipt — Phase XII: panic verb deployed to the live production-MCP

**Status: panic verb DEPLOYED + live on `uni-lab-79740c`.** The operator's actual PANIC rehearsal
(human-typed firing) remains the [OP] step that closes G-STOP fully.

Deployed tag `prod-firstlight-20260712T0045Z-g` (commit `de5c2da`), tarball sha256
`bed90b1436cfb21392e1971d678496c6a8dd4fd505b7bf972b51582abebbd02c`, sha-verified on-node. All via the
uni-lab MCP, approval-gated. Operator greenlit the live-MCP restart.

## Pre-flight (did not overwrite blindly)

1. **Bijectivity re-verified locally** before shipping: ran the server's own authoritative
   `_verify_tool_consistency()` against the committed source — PASS (it raises `RuntimeError` and
   crash-loops the service on any mismatch). `panic` confirmed in `IN_SHOW_VERBS` + `MUTATING_TOOLS`,
   NOT in `HUMAN_GATED`/`TWO_STEP_TOOLS`, with a `TOOL_HELP["panic"]` entry present.
2. **Diffed deployed vs candidate** on-node before replacing. The ONLY changes:
   - `server.py`: `BIND_PORT` default `8094`→`8095` (benign — the systemd unit already sets `8095` via
     env; this just aligns the stale default, and confirms the deployed file predates the port fix with
     no un-committed on-node edits to lose); `+"panic"` in `IN_SHOW_VERBS`; the `panic` tool function.
   - `help.py`: the `"panic"` help entry.
   Nothing unexpected — no on-node modifications were reverted.
3. **Backups made** before overwrite: `/opt/uni/production/mcp/{server.py,help.py}.bak-prepanic`
   (instant rollback if the restart had misbehaved).

## Deploy + proof

- Copied `server.py` + `help.py` to `/opt/uni/production/mcp/` (`async def panic` = 1, `"panic":`
  help entry = 1). `systemctl restart uni-production-mcp.service` (rc 0).
- **`verify_p1.sh` → P1 PROOF GATE: ALL PASS** post-restart, including
  `production-MCP :8095 answers 401 token-gated on both probes 6s apart (the real, fail-closed service)`.
  The stable 401 across a 6s-separated double-probe proves the MCP is **not** crash-looping →
  `create_server()` completed → the `panic` `@mcp.tool` registered AND `_verify_tool_consistency()`
  passed at startup. All 5 control-file sha locks still match; overlays/relay/mixer unaffected.

Therefore `panic` is a live, registered, correctly-tiered tool (session-authed, audited, NOT
human-gated, no 2-step handshake). It cuts program to STANDBY, stops the OBS stream output, ducks the
music bed, and sets the overlay on-air indicator to STANDBY (never a fake LIVE).

## What remains for G-STOP → corroborated (operator, [OP])

The PANIC **rehearsal**: the operator fires `panic` (via the MCP verb or `production/scripts/panic.sh`)
against the running STANDBY-first system and captures the audit `event:"panic"` row + program flipping
to STANDBY < 2s + relay staying up. Safe to rehearse now (no public feed). This receipt closes the
deploy half; the rehearsal closes the behavioural half.
