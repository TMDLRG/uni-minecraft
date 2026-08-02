# ADR-PROD-010 - Gating model: operator-set live-session autoapprove allowlist

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` ("Gating model"; GAP G-PA)

## Context

The UNI.OS charter requires that **destructive / mutating operations are human-approval-gated** and that
**the agent cannot self-approve** - every mutation through the uni-lab / control MCP writes a proposal and
waits for a human approve/deny in the approval daemon. But a **live show** cannot pause for a human
approve/deny on **every cut**: cutting cameras, riding the music, ducking, narrating, and flipping overlays
happen continuously and must be responsive. We must reconcile "every mutation human-gated" with live
operation **without** letting the producer agent self-approve anything.

## Decision

Run routine in-show verbs under an **operator-set live-session autoapprove allowlist** - this is the
appliance's **operator pre-authorization**, **NOT** agent self-approval:

- The operator (a human) opens a **live session** with **one human act**: they set
  `UNI_APPROVALS_AUTOAPPROVE` to an allowlist scoped to the in-show verbs. The producer agent **never holds
  the operator token** and cannot set this allowlist.
- **Within the session**, the in-show verbs run **without per-call prompts** but are **fully audited**:
  `cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`, `start_segment`,
  `set_layout`, `remove_guest`.
- **Outward-facing / irreversible** verbs are **always** explicit human decisions, never in the allowlist:
  `start_broadcast`, `stop_broadcast`, `admit_guest`, `schedule`. `start_broadcast` / `stop_broadcast` add a
  **2-step dry-run -> confirm** handshake.
- The producer agent can only **propose**; the human's pre-authorization (the allowlist) and the
  always-human gate on outward verbs are the controls. The agent cannot widen its own allowlist.

This property - **self-approval-blocked on the automated path** - is **GAP G-PA**: it is **Class-Sec,
unproven** until a logged red-team run shows the producer agent cannot escalate into approving its own
go-live / cut.

## Alternatives considered

- **Prompt a human for every cut (no session allowlist).** Rejected: it makes a live, responsive show
  impossible; the operator cannot approve hundreds of cuts/ducks per slot in real time.
- **Let the producer agent hold the operator token / auto-open its own session.** Rejected outright: that
  **is** agent self-approval and breaches the charter. The agent never holds the token; only a human opens
  the session.
- **Put outward verbs (`start_broadcast`, `admit_guest`, `schedule`) in the allowlist for convenience.**
  Rejected: those are outward-facing / irreversible and must always be an explicit human decision;
  go-live adds a 2-step confirm. Convenience does not justify removing the human from irreversible acts.
- **A blanket "autonomous mode."** Rejected: it would erase the gate; the session allowlist is deliberately
  **scoped** to reversible in-show verbs and is set by a human, not the agent.

## Consequences

- A live show is responsive (in-show verbs flow within a human-opened session) while the charter holds: the
  agent never self-approves, outward/irreversible verbs are always human-gated, and everything is audited.
  Honest tradeoff: the live-session allowlist is a **broad pre-authorization** - within the session, the
  scoped verbs are not individually prompted, so the audit log (not a per-call prompt) is the accountability
  surface for those verbs; the operator must scope and close the session responsibly.
- "The producer agent cannot self-approve a destructive go-live / cut" is the load-bearing safety claim and
  is **Class-Sec / pending_external** (**G-PA**) until a captured red-team run closes it. The design does not
  call this property "secure" or "isolated" - it is **unproven** until that evidence exists.
- The split (session-gated reversible verbs vs always-human outward verbs) is implemented in the production
  MCP's `MUTATING_TOOLS` + `approvals.require()` path (ADR-PROD-002).

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Gate: `/etc/uni-approvals`, `uni-approvald`, `UNI_APPROVALS_AUTOAPPROVE`
- Related: ADR-PROD-002 (server implements gating), the production MCP tool surface (`cut_to` ... vs
  `start_broadcast` / `admit_guest` / `schedule`)
- Gap: `production/docs/GAPS_REGISTER.md` row G-PA

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified word
is used as a claim. The gating split is a **design**; the self-approval-blocked property is **Class-Sec /
pending_external** (**G-PA**), unproven until a logged red-team run. The live-session allowlist is
**operator pre-authorization, NOT agent self-approval** - the producer agent never holds the operator token
and **cannot self-approve**. The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
**never** a mutation target; outward/irreversible verbs (`start_broadcast`, `stop_broadcast`, `admit_guest`,
`schedule`) are always human-gated.
