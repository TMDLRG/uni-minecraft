# ADR-PROD-002 - Production MCP: a separate FastMCP server (port 8094)

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (decision 3; unit `uni-production-mcp`)

## Context

The appliance already runs `uni-control-mcp` (the `services/control_mcp` FastMCP server) behind the shared
`/etc/uni-approvals` store + the `uni-approvald` daemon, with bearer auth, a loopback/WireGuard bind guard,
append-only audit, and the `metadata()` provenance envelope (observed this session, Class-B/C from
`services/control_mcp/*`). The production platform introduces a new verb surface - `cut_to`,
`set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`, `start_segment`, `set_layout`,
`admit_guest`, `remove_guest`, `schedule`, `start_broadcast`, `stop_broadcast`, plus read-only
`get_show_state` / `list_*` / `caption_status` / `approvals_*`.

The question: add these tools **into** `uni-control-mcp`, or stand up a **separate** server?

## Decision

Stand up a **separate FastMCP server, `uni-production-mcp`**, on new port **8094** (host svc
`python -m production.mcp.server`), with its own systemd unit and a new nginx `/prod-mcp` location (added to
both nginx confs, with the stream-safe headers). It **mirrors `services/control_mcp` to the letter**:
`@mcp.tool(structured_output=True)`; read-only tools as sync `@_threaded`; mutating tools as `async def`
that call `approvals.require()` **first**; the `metadata()` provenance envelope (own
`server="uni-production-mcp"`, own `VERSION`, `evidence_class`, `audit_id`); bearer auth; the loopback /
WireGuard bind guard; append-only audit; and a charter-clean `help.py`. It **shares** the existing
`/etc/uni-approvals` store and the `uni-approvald` daemon - it does not run its own approval path.

Deployment note (2026-07-11): on the P1 node uni-lab-79740c the server was deployed on :8095, not :8094 — :8094 collides with uni-glass-configure on that node (404 impostor; real MCP is 401). The decision (separate FastMCP server, gated) stands; only the concrete port moved. See production/docs/DEPLOYED_STATE.md.

## Alternatives considered

- **Add production tools into `uni-control-mcp`.** Rejected: it couples the broadcast lifecycle to the
  appliance control plane (a mixer crash-loop or a noisy show could destabilize the control MCP), bloats one
  tool surface, complicates per-server versioning and audit attribution, and blurs the evidence envelope
  (`server=` would no longer disambiguate broadcast actions from OS/control actions).
- **A non-MCP REST microservice for broadcast control.** Rejected: it would bypass the established
  approval-gate + bearer-auth + audit ergonomics and the `metadata()` envelope, re-implementing the gate and
  losing uniform provenance. The whole platform's safety story depends on every mutation flowing through the
  same gate.
- **A second, independent approval store for production.** Rejected: two gates is two things to get right
  and two audit trails to reconcile; sharing `/etc/uni-approvals` + `uni-approvald` keeps one human-approval
  surface and one daemon to reason about.

## Consequences

- Clean separation: the broadcast surface versions, audits, and fails independently of the OS/control MCP,
  while still routing every mutation through the **one** shared human-approval gate (the agent cannot
  self-approve). Honest tradeoff: a new port (8094), a new unit, and two nginx-location edits are new
  surface to maintain and to bind-guard - **status pending** until deployed and a captured bind/auth probe
  confirms loopback/WG-only.
- The session-autoapprove gating model (ADR-PROD-010) is implemented in this server's `MUTATING_TOOLS` +
  `approvals.require()` path; correctness of "in-show verbs session-gated, outward verbs always human-gated"
  is **Class-Sec / pending** (GAP G-PA) until a captured red-team run.
- Reusing the `services/control_mcp` shape lowers the chance of drift in the security-relevant scaffolding
  (auth, bind guard, audit) because it is copied, not reinvented.
- Evidence class: the `control_mcp` pattern is **Class-B/C** as captured; the new server's behavior is
  **pending**.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Pattern source: `services/control_mcp/*`, the `uni-control-mcp.service` unit, `/etc/uni-approvals`,
  `uni-approvald`
- Spec: `production/mcp/PRODUCTION_MCP_SPEC.md`, reference `production/mcp/server.py`
- Related: ADR-PROD-010 (gating model), ADR-PROD-005 (`set_overlay` target), ADR-PROD-009 (narrate persona)

## Status (honest)

This ADR is a **design**, status `pending`; nothing here is deployed or claimed to run. No banned-unqualified
word is used as a claim. The `control_mcp` scaffolding is **Class-B/C** as captured 2026-06-21; the new
8094 server is **pending**. The gating/self-approval property is **Class-Sec / pending** (G-PA). The business
stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never** a mutation target; the producer
agent **cannot self-approve** - all mutations route through the shared human approval gate.
