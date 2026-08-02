# Limitations — what this system does NOT do, derived from the source

**GENERATED. DO NOT EDIT.** Written by `viewer/generate_limitations.cjs` from `@limitation`
annotations that sit at the line each limitation lives on, and checked by the
`limitations-doc` gate, which regenerates this file and refuses any difference.

A hand-written limitations page drifts in one direction: nobody forgets to delete a limit
that has been fixed, and everybody forgets to add the one they just found. So this one is
not written. **A derived doc cannot drift.**

## Scope, stated rather than implied

Derived from `UNI.Minecraft` only, under: `lib/`, `test/`, `viewer/`, `scripts/`, `runs/`.
Limitations declared in `UNI-FLAGELLUM` are **not** in this document, and that gap is
itself recorded below as `doc.limitations.single-repo`. A derived doc whose scope is
implicit is a doc claiming a completeness it never had.

**9 limitations declared.**

---

## `cp.anchor.local-writer`

**the anchor is NOT proof against a tamperer with write access to the store directory**

- **Why it stands:** such a tamperer can truncate the ledger and rewrite the anchor to match, in one move. Nothing held on the same disk as the writer can outrank the writer.
- **Claim level:** caught in practice for LOSS, corruption, truncation and accident, across restarts. NOT caught for deliberate tampering.
- **Held visible by:** `test/sp/control_plane/store_anchor_in_practice_test.exs:145`
- **Declared at:** `lib/sp/control_plane/store.ex:70`

## `cp.anchor.phase5-closure-void`

**Phase 5 recorded this residual as CLOSED. That closure is VOID and the residual is live.**

- **Why it stands:** the closure rested on two-domain corroboration whose off-box custodian, node2, ACCEPTS the writer's key -- viewer/gaia/witness.json reports independent_custodians: 0 and qualifies_as_witness: false. A second domain the writer can reach is not a second domain.
- **Claim level:** the local anchor stands on git alone -- tamper-evident, NOT unforgeable.
- **Held visible by:** `test/sp/control_plane/store_anchor_in_practice_test.exs:145 (this test still PASSES, and passing is the finding)`
- **Whose call:** removing that key is S1 -- the one repair an agent must not perform, because using write access to erase the evidence of write access destroys the last proof.
- **Declared at:** `test/sp/control_plane/store_anchor_in_practice_test.exs:145`

## `cp.ledger.tail-truncation`

**`verify/1` cannot detect truncation from the TAIL of the chain**

- **Why it stands:** a prefix of a valid hash chain is itself a valid chain -- every prev_hash still resolves and seq is still contiguous. This is a property of hash chains, not a defect here, and no amount of internal hashing fixes it.
- **Claim level:** internally sound, NOT complete. Detection requires an anchor held OUTSIDE the chain, which is what verify/2 takes.
- **Held visible by:** `test/sp/control_plane/ledger_chain_tamper_test.exs`
- **Declared at:** `lib/sp/control_plane/ledger.ex:42`

## `cp.recorder.recorded-not-identity-safe`

**`recorded?/2` answers "is there an entry with this transition", not "is THIS work recorded"**

- **Why it stands:** every real entry so far shares the transition "phase.executed", so the question it can actually answer is coarser than the question a caller wants to ask.
- **Claim level:** adequate as a presence check, NOT as an identity check. Use `recorded_by/2` with a predicate when identity matters.
- **Held visible by:** `test/sp/control_plane/recorder_appends_not_rebuilds_test.exs`
- **Declared at:** `lib/sp/control_plane/recorder.ex:28`

## `doc.limitations.single-repo`

**this document covers UNI.Minecraft only; limitations declared in UNI-FLAGELLUM are absent from it**

- **Why it stands:** the generator scans one repository so the derived doc is regenerable and gate-checkable from a single clean checkout, which CI has. A generator that reaches into a sibling repo passes on this machine and fails everywhere else.
- **Claim level:** complete for the roots it names, and it names them. NOT a whole-programme limitations register.
- **Held visible by:** `viewer/verify_limitations_doc.cjs`
- **Declared at:** `viewer/limitations.cjs:33`

## `f31.obs-unauthenticated`

**F31 binds this codebase's paths to air. IT DOES NOT BIND THE BOX -- and the exposure is WIDER THAN THE NETWORK, not just wider than this repository.**

- **Why it stands:** measured 2026-07-29, not recalled -- the obs-websocket listener is bound to `::` (ALL INTERFACES), not to loopback, with `auth_required: false` and `server_password: ""` in %APPDATA%/obs-studio/plugin_config/obs-websocket/config.json. TCP connections to :4455 COMPLETED on 10.190.245.196 (LAN) and 100.98.223.27 (tailnet). Every prior statement in this repository -- including this block until today -- said "127.0.0.1:4455", which was FALSE: it understated the guard's own limit. Four lines of Node from any host on either plane reach the actuator with no credential and never import this guard.
- **Claim level:** seven paths through this repository are guarded and mechanically kept guarded. ANY process on the machine, AND any host on the LAN or the tailnet, bypasses all seven.
- **Held visible by:** `viewer/prove_golive_refuses_me.cjs prints this limit on every run`
- **Whose call:** the operator's studio configuration, S2. RISK ACCEPTED BY THE OPERATOR 2026-07-29 on the stated basis that no other party is presently on the LAN or the tailnet. That is an ACCEPTANCE, not a mitigation: the port is still open and unauthenticated, and the acceptance rests on a network condition that can change without anything here noticing.
- **Declared at:** `viewer/golive_guard.cjs:51`

## `f31.presence-evident`

**the go-live guard is `presence_evident`, NOT unforgeable**

- **Why it stands:** an agent already running inside the operator's live desktop session, with read access to the token file, can replay a valid token before it expires. Nothing in a process can authenticate a human.
- **Claim level:** excludes every headless agent, service session, scheduled task, remote shell, CI job and script in this repository. Does not exclude an agent already inside the session.
- **Held visible by:** `viewer/verify_golive_refuses_agents.cjs`
- **Declared at:** `viewer/golive_guard.cjs:46`

## `gates.attempts.inferred-from-record`

**this classifies whether a gate COULD have been attempted, not whether anyone did attempt it**

- **Why it stands:** S10 forbids running the PENDING science gates, so the only evidence available is the record -- the row, the runner, and whether that runner refuses by construction. An attempt that left no trace is invisible here, and so is one made outside this repository.
- **Claim level:** sound about the ROUTE to an attempt (none, blocked, or open). NOT a log of attempts, and never described as one.
- **Held visible by:** `viewer/verify_gate_attempts.cjs`
- **Declared at:** `viewer/gate_attempts.cjs:32`

## `gates.attempts.result-document-is-a-judgment`

**HAS_RESULT_DOCUMENT means the row names a receipt distinct from its pre-registration -- it does not mean the receipt contains a result**

- **Why it stands:** reading the receipt to decide whether it reports an outcome would be interpretation, and a classifier that interprets prose will disagree with the next reader. The structural fact is checkable; the semantic one is not.
- **Claim level:** a reliable pointer to the rows worth a human's attention -- the count is printed by the classifier on every run and is NOT written here, because the number this line used to carry (23) was the EVER-PENDING tally and the live figure is 1. NOT a finding that those rows have results.
- **Held visible by:** `viewer/verify_gate_attempts.cjs says the count out loud on every run`
- **Declared at:** `viewer/gate_attempts.cjs:37`

