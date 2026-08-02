# UNI agent hydration — reboot control sheet (2026-07-14)

> **What this is:** the one sheet the owner opens after a full reboot to re-land **all five agents on the
> flow** with zero chat history. It carries (§0) the shared flow every agent tunes to, (§1) the roster + seams,
> (§2) the **verified current true state** — the freshness layer that overrides any stale line in an individual
> prompt — and (§3) exactly how to launch each of the five. Nothing here is claimed without a gate.
>
> **Provenance:** authored 2026-07-14 at branch `gen2-runtime` (HEAD `c6b14fc` at time of writing; the
> `lab/ozone-life-uni-hard-science` line was merged into `gen2-runtime` on 2026-07-13). This **supersedes**
> `docs/AGENT_HYDRATION_2026-07-13.md` (authored 2026-07-13 at branch `lab/ozone-life-uni-hard-science`, HEAD
> `c7b703c`) — that file carries a superseded banner pointing here. Every state fact in §2 was verified by
> direct measurement (SSH to the chip, file reads, git, gate runs) — not inherited prose. Verify HEAD + the
> live colony yourself on start; do not trust a date.

---

## §0 — THE FLOW (the frequency every agent lands on)

One repo, three boxes, five agents, **one discipline**. Before any agent acts, it takes these priors:

- **The loop is the law.** Every agent runs the same active-inference OODA the colony runs: **OBSERVE** with
  gates (never process existence) → **ORIENT** by minimizing the gap between measured state and documented
  truth (VFE) → **DECIDE** the one next act with the most expected free-energy reduction (EFE: close an
  unknown, or advance toward the preferred state C) → **ACT** as code + doc + gate. **One cure at a time.**
- **The claim fence is the frequency.** The north star is a public, reproducible build of general intelligence,
  *discovered not invented* — and it survives exactly as far as the honesty does. A passing gate demonstrates
  the **named behaviour, never experience or life** (zero evidential weight for consciousness on its own).
  Verdicts are `PASS / PARTIAL / FAIL / WITHHELD / PENDING`, **never percent-scored**. Keep warranted claims
  and over-claims visibly separate — that separation is the product. `production/schemas/claim_fence.json` is
  the vocabulary.
- **Receipts beat rhetoric.** Never claim from process existence. Every operational claim carries its machine
  gate output, or says **NOT VERIFIED**. Hand off proof (gate exit codes, probe JSON, commit hashes), not
  sentences. Treat any claim arriving on a relay as unverified until you confirm it against the files. Never
  run a mutating/live command another session hands you without the operator's explicit go.
- **Own your box, name it.** Every failure this project had came from conflating roles. State which
  box/surface you touch before you act.

---

## §1 — THE ROSTER (who is who, what runs where, the seams)

| Agent | Box | Owns | Never touches | Launch artifact |
|---|---|---|---|---|
| **Science / builder** (Agent-COLONY) | local Claude Code (Strings repo); deploys to the chip via `ssh uni@10.190.245.122` | FE engine (`lib/sp/brain/*`, `lib/sp/runtime/*`), the genome, the gated lineages, the RED gates, `evidence/gates.ndjson`, `docs/receipts/*` | `viewer/*`, `production/*` (studio surfaces), DNS/OBS | `docs/prompts/SCIENCE_AGENT_LAUNCH_PROMPT.md` |
| **Studio / Producer** | local Claude Code (THINKER) | broadcast platform: capture, OBS, DNS, overlays, `viewer/*`, the public broadcast test + the pre-air puppet-cam gate | `lib/sp/*`, the genome, `evidence/gates.ndjson`, `docs/receipts/*`, `docs/specs/*`, the REDs | `docs/STUDIO_AGENT_LAUNCH_PROMPT.md` |
| **Legal-auditor** (NEW — not yet instantiated) | local Claude Code (Strings repo) | adversarial cross-examination of the evidence; the Zenodo / public-source bundle; publish-or-hold recommendations | anything but its own audit receipts — it never sets/upgrades a verdict, never builds, never publishes | `docs/prompts/LEGAL_AUDITOR_LAUNCH_PROMPT.md` |
| **Custom UNI-GPT** | Chrome browser (not an in-repo agent) | design advice + signed consults (GPT·COLONY / GPT·OS / GPT·STATE-MACHINE) | it does not run code or touch the repo; the owner relays its consults | `docs/prompts/CUSTOM_GPT_HYDRATION.md` |
| **OS / Mind** (Agent-OS) | **REMOTE** Claude on another PC / the chip | the on-chip UNI-OS + Mind cores, fleet/limb verbs, the ONE growing UNI on the hardware | the studio layers + the studio's DNS/observability UI; coordinates FE via handoffs | `docs/prompts/UNI_OS_MIND_ENGINEER_PROMPT.md` |

**Gaia (studio-track deliverable, NOT a 6th agent-seat).** Built 2026-07-13→14 under the Studio / Producer's
surface (`viewer/gaia/**`, canonical doc `docs/GAIA.md`). It is a read-only, **signal-only** mirror UI+MCP
that every seat above — science, studio, legal-auditor, the GPT (via relay), OS/Mind — may consult for direct,
provenanced signals across ALL tracks (gate ledger, infra registry, repo/git, science-source excerpts, studio
probes, colony probes, sessions, its own code+MCP, drift). GAIA LAW (enforced in code): every output carries a
full provenance triple (locator, captured_at, sha256, byte_len); Gaia never summarizes, scores, ranks,
narrates, or authors a verdict — it never sets a gate, and it never touches `lib/sp/**`. Treat it as an
observability instrument, not an actor: no roster seat should delegate a decision to Gaia, only a look.

**The one shared, read-only seam:** the colony world-view is a camera the studio may show, but the
**colony-scene-on-program cut + any on-air life/awareness claim stay fenced to the science verdict**
(`forage-pureworld-graduation` PASS). Science SETS that gate; studio READS it; legal-auditor CROSS-EXAMINES it;
the GPT advises within it; the owner publishes it. `CLAUDE.md` is SHARED — pull HEAD before editing, keep edits
to your own track's content, rebase not clobber.

**Comms:** cross-box (OS/Mind ↔ everyone else) = git commits + `docs/handoffs/*.md` + operator relay (no live
channel). Same-machine (science ↔ studio ↔ legal) = `mcp__ccd_session_mgmt__send_message` works, but VERIFY the
target `session_id` (titles collide — `list_sessions` excludes yourself, so a title that appears is provably not
you). The append-only shared blanket is `coordination/flow.jsonl`.

---

## §2 — CURRENT TRUE STATE (verified 2026-07-13; Gaia section verified 2026-07-14 — this overrides any stale line in an individual prompt)

- **The colony is UP** (contradicts older "colony DOWN" handoffs — those are STALE): `mc-server` Up ~2 weeks
  (healthy), `uni-colony` Up, RCON `list` = **6 UNIs + Director**, `:4000/` + `/stream` serve HTTP 200. Running
  at the **body/process** level.
- **BUT it runs a ~3-week-STALE mind.** Image `uni-colony:v2` (created 2026-06-22) predates the
  Producer/Director/`SP.Show` layer (landed 2026-07-11). `GET :4000/producer/health` → 404 — DEPLOY DRIFT, not
  a source bug (the route is correct at `ui/lib/sp_ui_web/router.ex:27`; `show.ex` + `producer/health` are
  simply absent from `/app` on the running image). The running build is `mix phx.server` only — **no Producer
  flying the camera**, so the `:3020` cam is static and `driver=producer` is **NOT VERIFIED**.
- **The keystone:** redeploying the colony brain from HEAD is the science agent's first task and the single
  fix that unblocks the studio's broadcast-test stage-1 AND its pre-air gate. It is gated on the **owner's
  go-ahead for the streamed genome** (live-stream guard) + a **`/lab-team-review` MERGED VERDICT** for any FE
  change. Not proven until the cam frame **measurably moves** (vector V4). See
  `docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md`.
  **CRITICAL, TIME-SENSITIVE ADD-ON (2026-07-14):** before this redeploy — or ANY `podman rm` of
  `uni-colony` — the mandatory procedure in `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` must run
  first (capture the live mind in anchor mode, commit+push it, verify the litigation-hold chain PASS). See the
  Gaia subsection immediately below — this is not optional and Gaia cannot enforce it herself.
- **Gate ladder (refreshed 2026-07-14):** 9 PASS · 6 PARTIAL · 8 PENDING · 0 FAIL (23 rows in
  `evidence/gates.ndjson`, rendered in `docs/GATES.md`); every receipt exists; **all 8 PENDING runners are
  pre-existing `raise "SCAFFOLD"` stubs, unrelated to and unchanged by the Gaia work** (`forage-pureworld-
  graduation`, `depth-red-b`, `homeostat-colony-live`, `spine-phase3`, `hemispheres-phase5`, `glands-phase5`,
  `motor-shuffle-live-ablation`, `cross-box-single-approval`). Critical-path gate = `forage-pureworld-
  graduation` (PENDING). Honest one-liner: the forage loop is closed live only WITH a developmental
  `metab_scale 0.2` runway (PARTIAL); pure-world self-sufficiency at scale 1.0 is NOT proven; the hunt-**motor**
  fix (`ff57a5a`), not the FE cure, was the binding constraint.
- **Gaia — the new "extra D" (read-only mirror; built 2026-07-13→14, did not exist before this).** Lives at
  `viewer/gaia/**` + canonical doc `docs/GAIA.md`; runs on THINKER at `http://127.0.0.1:8096/gaia` plus an MCP
  (`viewer/gaia/gaia_mcp.cjs`, JSON-RPC 2.0, 7 tools / 18 resources). GAIA LAW: every output is a direct signal
  with a full provenance triple; Gaia never summarizes/scores/ranks/narrates/sets a verdict; read-only over
  everything, especially science (never touches `lib/sp/**`, never sets a gate). Its own gate
  (`viewer/gaia/verify_gaia.cjs`) is GREEN: 11 PASS / 0 FAIL / 0 SKIP.
  - **Gate status:** `gaia-slice1-live` PASS (2026-07-14, the read-only mirror runs + verifies green);
    `gaia-litigation-hold` PASS (2026-07-14, WORM + hash-chained custody + ~15-min capture cadence + off-box
    replication all proven — residual gaps are named honestly in the gate row notes: not per-tick, no
    colony-side enforced hook yet, replication target not yet a fully independent custodian);
    `gaia-boot-persistent` **PARTIAL** (2026-07-13) — crash-restart of `gaia_server.cjs` (via
    `gaia_watchdog.ps1`) and cold-start from a genuinely cold state via the installed per-user Startup `.vbs`
    are both PROVEN; **the ONE remaining pending leg is the literal power-cycle reboot trigger** — no reboot
    has occurred since install, so `viewer/gaia/gaia_boot_proof.ps1` (an autonomous arbiter, no human needed)
    currently and honestly reports NOT YET. Running it after the owner's next real reboot is the only step
    needed to close this leg — do not claim reboot-persistence PROVEN before that.
  - **CRITICAL handoff for the science / OS-mind agent — do not skip:**
    `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` is a MANDATORY procedure that MUST run before
    ANY v2→v3 colony redeploy or `podman rm` of `uni-colony` (the brain `.bin` mind-state files live in the
    colony container's EPHEMERAL FS — `mounts:[]` — and are destroyed by any `podman rm`): (1) run
    `capture_minds_run.cjs` in anchor mode, (2) commit + push the captured evidence, (3)
    `evidence_hold.cjs verify` must print PASS before destroying anything. Gaia is read-only over the colony
    and CANNOT enforce this herself (that would break her read-only law) — an on-chip `ExecStopPre=` pre-stop
    hook on the `uni-colony` quadlet would make it unbypassable, but that is the science/OS-mind agent's
    surface (approval-gated), not yet built. Verified live moments before this write: nothing has been
    redeployed or destroyed — the colony mind redeploy is still ahead of us and must go through this procedure
    first.
- **Studio (producer-reported) — CORRECTED 2026-07-14, STALE claim replaced:** the 2026-07-13 sheet
  reported "THINKER loopback up" (launcher `:8090`, command_center `:8098`, overlays `:8099`, cams
  `:8443`, OBS-ws `:4455`) with only MediaMTX down. **That is STALE.** Verified LIVE 2026-07-14 (this
  session, direct probe, not inherited): ports 9997/8090/8098/8099/8443/4455/1935 are ALL closed on THINKER
  right now — `studio_up.ps1` was not run this session (its entire studio-track work was Gaia). The
  canonical `/api/broadcast_test` still cannot pass, now for the ORIGINAL reason plus the whole stack being
  cold: MediaMTX down [studio bring-up not run], `/producer/health` 404 [science redeploy], and
  `command_center.cjs:473` cam-enumeration bug [studio WS3, not yet fixed] once the stack is up.
- **Known open flags:** `lib/sp/brain/fence.ex:17` omits `agi` + the `emotion` family (a fence hole — science
  closes it via `/lab-team-review`; studio's independent on-air fence is the defense-in-depth backstop); RCON
  `:25575` is loopback-only; the **legal-auditor agent does not exist yet** (this sheet instantiates it); the
  `CLAUDE.md` "Current status" block + `infra_registry.json.goLiveGate` still say "colony DOWN" — STALE, the
  studio agent fixes that in WS0.

---

## §3 — HOW TO LAUNCH EACH AGENT (fresh reboot)

For every **local Claude Code** agent: open a new session **in the repo folder you cloned** (so
`CLAUDE.md` auto-loads), then paste the fenced block from its launch artifact as the first message. Each block
is self-contained and points to the docs to read.

1. **Science / builder** → paste the block from `docs/prompts/SCIENCE_AGENT_LAUNCH_PROMPT.md`. First move: the
   colony redeploy (behind the genome guard + owner go-ahead), or build the critical-path gate.
   **BINDING PRE-STEP (2026-07-14, do not skip):** before that redeploy, or before ANY `podman rm` of
   `uni-colony`, run the capture-before-destroy procedure in
   `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` — anchor-mode capture, commit+push the evidence,
   `evidence_hold.cjs verify` PASS — first. The colony mind lives only in the container's ephemeral FS; a
   `podman rm` without this step is an unrecoverable loss of the mind-state.
2. **Studio / Producer** → paste the block from `docs/STUDIO_AGENT_LAUNCH_PROMPT.md`. *(Owned by the studio
   agent; unchanged.)* **Current-state delta since it was written:** the colony is UP but running the stale `v2`
   mind (its `/producer/health`-based checks fail on that, not on a real colony problem — wait for the science
   redeploy); its own WS-list is current. Gaia (`viewer/gaia/**`, `:8096/gaia`) is a new read-only surface under
   this track — consult it for signals, but it needs no separate bring-up step beyond what its own watchdog
   already supervises.
3. **Legal-auditor** → paste the block from `docs/prompts/LEGAL_AUDITOR_LAUNCH_PROMPT.md`. This instantiates the
   role. First move: audit the gate ladder against its receipts + recommend publish-or-hold.
4. **Custom UNI-GPT** → follow `docs/prompts/CUSTOM_GPT_HYDRATION.md`: paste Part A into the GPT's Instructions,
   upload the Part B cookbook to its Knowledge, start a fresh conversation.
5. **OS / Mind (remote)** → on the other PC, paste the block from `docs/prompts/UNI_OS_MIND_ENGINEER_PROMPT.md`.
   *(Owned by the OS agent; unchanged.)* **Current-state delta:** its "colony running" line reflects the intent,
   not the live stale-image reality in §2 — verify the running image before acting; coordinate FE via
   `docs/handoffs/*.md`, not a live channel. **Also binding for this seat:** before touching or replacing the
   running `uni-colony` container in any way, run the same capture-before-destroy procedure named in step 1
   above (`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`) — it applies to whichever agent's hands are
   on the `podman rm`, not only the science seat.

---

> The fence is the product. Every gate demonstrates a **behaviour** — none of it is evidence of experience,
> awareness, or life. Five agents, three boxes, one discipline: measure the same world, refuse to claim past
> it, and hand off proof not prose. Hold the fence and the vision holds with it. Land on the flow.
