# ADR-PROD-009 - On-air UNI expert: a Claude persona, not uni-mind inference

- **Status:** Proposed
- **Date:** 2026-06-21
- **Deciders:** UNI Production architecture
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` ("a non-infra decision - the on-air UNI expert")

## Context

The show puts a recurring **UNI expert** on cam/voice to explain the mission's science (trauma and the
nervous system, mental-health-to-nature alignment, etc.). The tempting move is to make that expert
**uni-mind's own inference**. But uni-mind is **research-stage**: its serving surfaces have **no shipped
expert weights** and present as a 4-pattern closed class (ingest map E, as captured this session). Putting an
unshipped research model on air as "the UNI expert" would be an over-claim and a charter violation. We need
an on-air expert that is honest about what UNI is and what it is not, and that cannot drift into AGI / "beats
LLMs" / "memory" over-claims live.

## Decision

The on-air UNI expert is a **Claude persona**, **not** uni-mind's own inference. The persona is **seeded**
with:

- `uni-mind/docs/press/02_FACT_SHEET.md` - **ground truth** about what UNI is.
- `uni-mind/docs/prompts/UNI_CHAT.md` - the **voice/tone** contract.
- `uni-mind/docs/press/05_CLAIMS_AND_FENCES.md` - a **hard compile-time lint on every on-air word**: no AGI,
  no "beats LLMs," say "cache hit" not "memory," and **UNI math stays private**.

The persona speaks via the MCP `narrate` verb (Piper, ADR-PROD-006) and/or on cam. `uni-deep-chat` may
appear **only** as a clearly-labeled on-screen **microscope** (surprisal / cache B-roll) - **never** as the
talking expert. The claims-and-fences lint runs on script copy before air; on-air narration text is
generated under the fences.

## Alternatives considered

- **uni-mind's own inference as the on-air expert.** Rejected: research-stage, no shipped expert weights, a
  4-pattern closed serving class - presenting it as a live expert would over-claim and breach the charter
  (and `05_CLAIMS_AND_FENCES.md`). It is not deployable as a talking head.
- **`uni-deep-chat` as the talking expert.** Rejected as the expert: it is a microscope, useful as labeled
  B-roll (surprisal / cache visualization) but not a persona; using it as the expert would conflate a
  research instrument with an authoritative speaker.
- **A generic unfenced LLM persona.** Rejected: without the `02_FACT_SHEET` ground truth + `UNI_CHAT` voice
  + `05_CLAIMS_AND_FENCES` lint, the expert could drift into AGI / "beats LLMs" / "memory" over-claims live,
  which is exactly the failure mode the fences exist to prevent.

## Consequences

- The on-air expert is honest by construction: it speaks UNI's approved public framing (human-owned loop,
  not "LLMs can never be safe"; restraint + peace close) under a compile-time fence, and never externalizes
  UNI's private math. Honest tradeoff: the persona is a Claude-over-MCP construct, **not** a UNI-native
  model; the show must label it as a persona (an editorial honesty requirement), and the fences-catch-all
  property is **pending** (a lint can miss novel phrasings until exercised).
- `uni-deep-chat` stays a labeled microscope, keeping the research instrument distinct from the on-air voice.
- Evidence class: "uni-mind has no shipped expert weights / 4-pattern closed class" is **Class-C** as
  captured this session; "the fenced persona never over-claims on air" is **pending** until exercised over a
  captured show.

## Links

- Master: `docs/UNI_PRODUCTION_PLATFORM.md`
- Seeds: `uni-mind/docs/press/02_FACT_SHEET.md`, `uni-mind/docs/prompts/UNI_CHAT.md`,
  `uni-mind/docs/press/05_CLAIMS_AND_FENCES.md`
- Related: ADR-PROD-006 (`narrate` voice), ADR-PROD-005 (lower-third "UNI EXPERT" kicker; microscope B-roll
  overlay)

## Status (honest)

This ADR is a **design**, status `pending`; nothing is deployed or claimed to run. No banned-unqualified word
is used as a claim. "uni-mind is research-stage / no shipped expert weights" is **Class-C** as captured
2026-06-21; the on-air fenced persona's behavior is **pending** until exercised. UNI math stays private and
is never externalized. The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
**never** a mutation target; the producer agent **cannot self-approve**.
