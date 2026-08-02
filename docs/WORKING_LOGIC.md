# Working logic — VFE / EFE / OODA, Document-Driven, Test-Driven (binding)

> Loaded-by-reference from `CLAUDE.md`. This is the fuller version of the tight "how this agent works"
> section there. **The rules here are binding.** They govern the **studio track**; the science track has its
> own binding protocol (`docs/LAB_PROTOCOL.md`).

## Two tracks, two agents — never conflate them (like the three boxes)

This repo runs **two parallel tracks with separate owners.** Conflating them is the same class of failure as
conflating the three boxes (chip / studio / relay) — it is how work gets un-attributable and claims get
over-stated.

| | **Studio track** | **Science track** |
|---|---|---|
| **Owns** | The broadcast platform: production paths, runtimes, UIs/UX, DNS, end-to-end process, and their docs | The colony's mind: the FE engine + the gated lineages |
| **Code** | `viewer/*`, `production/*`, `deploy/uni-os/*`, `ui/*` (web/broadcast surface), `CLAUDE.md`/`docs/*` studio docs | `lib/sp/brain/*`, `lib/sp/runtime/*`, `test/sp/brain/*`, `docs/specs/*`, `docs/receipts/*` |
| **Plan** | `docs/STUDIO_HARDENING_DD_TDD_PLAN.md` | `docs/DEEPENING_PLAN.md` + the pre-registered REDs |
| **Gate style** | Operational gates (`verify_*`, `restream.ps1 -Status`, the broadcast sweep) | Pre-registered RED gates (named PASS + FALSIFIES) |
| **Touches FE code?** | **Never** | Always (that's the point) |

**The one shared, read-only seam:** the colony world-view is a **camera** the studio may show. But the
**colony-scene-on-program** cut and any **on-air life/awareness claim** stay fenced to the science verdict —
`forage-pureworld-graduation` must PASS (encoded in `viewer/infra_registry.json.goLiveGate` +
`viewer/verify_colony.cjs`). The studio agent reads that gate; it never sets it.

**Rule:** state which track you are on at the top of any substantive change. A studio-track change that finds
itself editing `lib/sp/brain/*` has crossed the fence — stop and hand off to the science agent.

## Work the studio the way the colony thinks — an active-inference OODA loop

The point of this project is a colony that runs an active-inference loop. The operator-agent should run the
**same loop** over the studio, so the method and the subject are one thing, not two. The metaphor is only
allowed because it is tied to real code on both sides.

### The colony's loop (the real code, so the metaphor never floats free)

The live tick is `SP.Runtime.Agent` (`lib/sp/runtime/agent.ex`) driving `SP.Brain.MC.step/2`
(`lib/sp/brain/mc.ex`). (Note: the live driver is `SP.Runtime.Agent`, **not** `SP.Brain.Bridge`, which is a
Sim/Eval path — do not confuse them.)

- **Observe** — the Minecraft body's sense line arrives over the OS Port (`agent.ex`).
- **Orient** — `infer_states` minimises **Variational Free Energy**:
  `q(s) = softmax(forward_prior + Σ γ_m · lnA)` (`lib/sp/brain/infer.ex`). The `(lnB)·s` convention is
  bound-critical — it is **not** `ln(B·s)`. Then Hebbian-Dirichlet `learn` (`lib/sp/brain/learn.ex`) updates
  the counts and organs grow. The slow **L2 context OODA** runs every `@l2_period` ticks (a control/preference
  hierarchy: situation observed up, a large-magnitude interoceptive **C** overridden down — NOT a
  predictive-coding errors-up/predictions-down stack).
- **Decide** — action minimises **Expected Free Energy** over a depth-5 plan (`lib/sp/brain/plan.ex`,
  `lib/sp/brain/efe.ex`): epistemic `H(qo) − E[H(o|s)]` + pragmatic `qo·C` + gated parameter-novelty `W`.
  **Nothing else enters the logits** (the math fence; guarded by `test/sp/brain/*`).
- **Act** — the chosen action goes back out the Port as a body command.

### The operator-agent's loop (how to work the studio, every turn)

- **Observe** — run the **GATES**, never trust process existence. `node viewer/verify_overlays.cjs`,
  `node viewer/verify_colony.cjs 10.190.245.122`, a fresh `/producer/health` probe, `restream.ps1 -Status`,
  `tailscale status`, `grep` for surviving IP literals. A running process / open port / `exit 0` launcher is
  **not** a claim. Measured insight is the sense line. Gaia (`viewer/gaia/`, `docs/GAIA.md`) is a concrete,
  running instantiation of this step — a read-only, signal-only mirror the operator can query directly
  instead of trusting process existence (gate `gaia-slice1-live`, PASS).
- **Orient (VFE)** — diff the measured state against the **documented true state**. The gap *is* the prediction
  error. Reducing that surprise — making the docs and the box agree — is the work. If a doc claims something the
  gate does not show, the doc is wrong (or the box is); resolve it, don't paper over it.
- **Decide (EFE)** — pick the **one** next item that most reduces uncertainty and risk:
  - *epistemic* value = it closes a **NOT-VERIFIED** / an unknown (measure the thing you cannot yet see).
  - *pragmatic* value = it moves the studio toward the preferred state **C**: durable, DNS-only, operator-easy,
    on-air-honest.
  - **One cure at a time.** Never stack changes such that you cannot attribute the winning outcome.
- **Act** — make the change **as code** (never an ephemeral runtime patch), update the **doc** in the same
  breath (DD), and record the **gate** (TDD). Then loop.

## Document-Driven (DD) = the change-management / CI

Docs are not documentation-after-the-fact; they are the change-management system. A work-item is **done** only
when all three hold:

1. **Code** committed and pushed (production ships via `git archive` of a pushed, sha-verified tag — never the
   working tree).
2. **Doc is true** — the canonical doc or ADR that describes the surface is updated, or carries a correct
   superseded/stale banner. ADRs (`production/docs/adr/`) are the decision backbone; **011–014 are Accepted and
   are current truth**; 001/003 are superseded-in-part; 002/004–010 are still Proposed (design-stage).
3. **Gate recorded** — its row is appended to `evidence/gates.ndjson` (schema
   `production/schemas/gate_row.schema.json`), which renders to `docs/GATES.md` and the `/infra` gate-ladder.

**The claim fence** (`production/schemas/claim_fence.json`) governs wording. Operational/behavioural passes
demonstrate the **named behaviour, never experience or life.** Keep warranted claims and over-claims visibly
separated — that separation is the product. **Receipts beat rhetoric.**

## Test-Driven (TDD) = gates first

- Name the **PASS gate** before writing the change. For a science-adjacent change also name the **FALSIFIES**
  condition. The gate is the test; the change is judged only against its pre-named gate.
- The studio's **integration test is the full PUBLIC broadcast sweep** (`POST /api/broadcast_test` on
  `command_center.cjs`, extended to sweep every scene/camera/music-feed + SMPTE bars). Public is the only
  acceptance path.
- This plan **touches no FE-engine code**, so the invariant guards in `test/sp/brain/*` are a **regression
  fence** that must stay green — they are not modified here.

## The invariants that never move (studio-relevant subset)

- **NO IP literals in code. Ever.** Every host is a `<name>.uni-lab.local` DNS name derived from the single
  declared map `viewer/infra_registry.json` via `viewer/fqdn.cjs` (`fqdn(name)` / `url(name)`). IPs live ONLY
  in that registry, the DNS-bootstrap resolver (`viewer/infra.cjs:272`), and the drift-checker's own SSH read
  (`viewer/infra.cjs:21`). `viewer/hub.html` is the DNS-native reference implementation.
- **GO LIVE is human-typed, always** (gate G-PA). No agent self-approves it, widens its own autoapprove, or
  holds a stream key. Keys live only in the operator shell env / `/etc/uni/runtime.env` — never git, never an
  agent.
- **One `--sname uni` Phoenix node, ever — on the chip.** THINKER never starts a competing colony.
- **Single-encode → copy fan-out.** One encoder makes the program; the relay copies it to each destination.

## Remote-source security model (the camera gateway) — RETRACTED 2026-07-16

**HONEST CURRENT STATE.** `viewer/publisher.cjs` and `viewer/pub.html` implement **no PIN check**
and **no off-LAN approval flow.** grep for `PIN|UNI_PUBLISH_PIN|Authorization|approval|off-LAN` in
either file returns zero hits. The prior text in this section (default PIN 2077, LAN-immediate,
off-LAN per-stream operator approval, APPROVE/DENY banner) described a design that was never
enforced by the code. The 2026-07-15 sweep found the gap; the operator picked **retract, don't ship
a security claim no code enforces.**

- **The publisher is unauthenticated, LAN/tailnet only.** `pub.html` banners this in place.
- **MediaMTX WebRTC (`:8889`) is bound loopback-only** in `viewer/mediamtx_local.yml` so the WHIP
  is reachable only via the local publisher proxy, not directly from the LAN. This is the only
  posture defense that survives retraction.
- **Do not re-add** a PIN or approval claim to CLAUDE.md, this file, or `pub.html` unless the code
  in `publisher.cjs` enforces it. Enforcement is filed for a later pass.
- The `cams.uni-lab.local` name and `:8443` HTTPS endpoint are unchanged; what changed is the
  claim about protection, not the topology.
