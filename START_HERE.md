# START HERE — launch the entire UNI system

**You (or an agent) just cloned the UNI repo. This one file is the complete launch guide.** It has the
one-line kickoff, the clean-clone steps, and the exact prompt + order for all **five** agents. Everything is
on the **default branch (`gen2-runtime` = main)** — no feature branch to hunt down; a plain `git clone` gives
you all the work.

> Reading this means the clone worked. Confirm with `git log --oneline -1` (a recent commit) and
> `git status` (clean, on `gen2-runtime`). `CLAUDE.md` is the binding contract and auto-loads for any Claude
> Code session opened **in this repo folder** — read it once.

---

## ⭐ THE ONE LINE that kicks it all off

Paste this to a **fresh Claude Code agent in an empty folder, on any machine:**

```
Run: git clone https://github.com/TMDLRG/UNI.MineCraft.git .    then read START_HERE.md in full and follow it exactly to bring the entire UNI 5-agent system online.
```

- **Private repo:** the clone will ask for the operator's GitHub login if this machine has no stored
  credentials — authenticate as `TMDLRG` (or a collaborator).
- **If the clone says the folder is not empty** (Claude may have created a hidden file), clone into a
  subfolder instead: `git clone https://github.com/TMDLRG/UNI.MineCraft.git uni` then work inside `uni/` and
  read `uni/START_HERE.md`.
- The clone checks out `gen2-runtime` (main) by default — that IS the full, current, stable repo.

---

## What you cloned

- **Branch `gen2-runtime` (main).** The `lab/ozone-life-uni-hard-science` feature branch was **merged into
  main on 2026-07-13** — main now carries all the work (111 commits: the FE engine + gates, the DNS +
  observability + LLM discovery surface, the ops manual, and every handoff). Both branch names point to the
  same commit; **work on main.** No cross-shipping of a feature branch.
- **The binding docs:** `CLAUDE.md` (rules) · `docs/GAIA.md` (the read-only, signal-only observability
  mirror — the studio track's "extra D," mirroring every track's state with full provenance) ·
  `docs/AGENT_HYDRATION_2026-07-14.md` (the reboot control sheet: the roster + seams + the **verified current
  true state**) · `docs/OPERATIONS_MANUAL.md` (the full ops/tech map + the LLM REST surface at
  `/api/discovery`).

---

## The 5 agents — who runs where, and which prompt

| # | Agent | Runs on | Launch prompt (in this repo) |
|---|---|---|---|
| 1 | **Science / builder** (the mind, the gates) | a Claude Code session, in this repo folder | `docs/prompts/SCIENCE_AGENT_LAUNCH_PROMPT.md` |
| 2 | **Studio / Producer** (the broadcast) | a Claude Code session on the GPU/studio box (THINKER) | `docs/STUDIO_AGENT_LAUNCH_PROMPT.md` |
| 3 | **Legal-auditor** (the evidence cross-examination — new) | a Claude Code session, in this repo folder | `docs/prompts/LEGAL_AUDITOR_LAUNCH_PROMPT.md` |
| 4 | **Custom UNI-GPT** (design advisor) | Chrome — a custom GPT | `docs/prompts/CUSTOM_GPT_HYDRATION.md` |
| 5 | **OS / Mind** (the on-chip UNI-OS) | a Claude Code session on the remote chip PC / other account | `docs/prompts/UNI_OS_MIND_ENGINEER_PROMPT.md` |

---

## Launch sequence — do these in order

### Step 0 — confirm the clone (any shell, in the repo)
```
git status              # expect: on gen2-runtime, clean, up to date with origin
git log --oneline -1    # expect: a recent commit
```

### Step 1 — Science / builder agent (start this first — it owns the mind + the gates)
1. Open a **new Claude Code session with THIS repo folder as the project** (so `CLAUDE.md` auto-loads).
2. Open `docs/prompts/SCIENCE_AGENT_LAUNCH_PROMPT.md`, copy the fenced block, and paste it as the first message.
3. Its first job: verify the colony with the gates, then the **stale-mind redeploy** — which is gated on the
   **operator's go-ahead for the streamed genome** (live-stream guard) and a `/lab-team-review` MERGED VERDICT.
   **Before touching `uni-colony` at all (redeploy or `podman rm`), it must run the mandatory
   capture-before-destroy procedure in `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`** — the
   colony minds live in the container's ephemeral filesystem and any `podman rm` destroys them.

### Step 2 — Studio / Producer agent (the broadcast — on THINKER, the GPU box)
1. On THINKER, open a Claude Code session in the repo folder.
2. Paste the fenced block from `docs/STUDIO_AGENT_LAUNCH_PROMPT.md`.
   > The studio CODE hardcodes the THINKER repo path (`viewer/launcher.cjs`, `viewer/studio_up.ps1`), so the
   > studio agent's clone must live at that path on THINKER. The science/legal agents are path-portable.

### Step 3 — Legal-auditor agent (the evidence — this prompt instantiates the role, which does not exist yet)
1. Open a Claude Code session in the repo folder.
2. Paste the fenced block from `docs/prompts/LEGAL_AUDITOR_LAUNCH_PROMPT.md`.

### Step 4 — Custom UNI-GPT (Chrome)
Follow `docs/prompts/CUSTOM_GPT_HYDRATION.md`: paste **Part A** into the GPT's Instructions; upload the **Part
B** cookbook files (from the repo root you cloned) to its Knowledge; start a fresh conversation.

### Step 5 — OS / Mind agent (remote PC / other Claude account)
1. On the remote machine, clone the repo (same one-line), open a Claude Code session in it.
2. Paste the fenced block from `docs/prompts/UNI_OS_MIND_ENGINEER_PROMPT.md`.
   > This agent works **cross-box** — it coordinates via **git commits + `docs/handoffs/*.md` + operator
   > relay, NOT a live channel.** Hand off proof (gate output + commit hashes), never prose.

---

## The flow (every agent lands on this)

One repo, one discipline. Every agent runs the same active-inference OODA loop: **OBSERVE** with gates (never
process existence) → **ORIENT** by minimizing the gap between measured state and documented truth (VFE) →
**DECIDE** the one next act with the most expected free-energy reduction (EFE) → **ACT** as code + doc + gate.
**One cure at a time.** **Receipts beat rhetoric** — every claim carries its machine gate or says NOT VERIFIED.
**The claim fence is binding:** a passing gate demonstrates the named **behaviour, never experience, awareness,
or life** — never percent-scored. Keep warranted claims and over-claims visibly separate — that separation is
the product. `Gaia` (`http://127.0.0.1:8096/gaia` on THINKER, MCP at `viewer/gaia/gaia_mcp.cjs`) is the live,
queryable OBSERVE surface every agent can consult instead of re-deriving state by hand — it is a read-only,
signal-only mirror of the gates and probes, never itself a source of truth beyond what it mirrors. Full
statement: `CLAUDE.md` + `docs/AGENT_HYDRATION_2026-07-14.md` §0.

## The current true state (verified 2026-07-13 — do not inherit stale docs; verify yourself)

- **The colony is UP but running a ~3-week-STALE mind.** `mc-server` + `uni-colony` are up on the chip
  (`ssh uni@10.190.245.122`), RCON shows 6 UNIs + Director — but the running image `uni-colony:v2`
  (2026-06-22) predates the Producer/Director/`SP.Show` layer, so `GET :4000/producer/health` **404s** (deploy
  drift, not a source bug) and no Producer flies the camera. **The science agent's first task is the redeploy
  from HEAD** — behind the genome guard + owner go-ahead, and behind the mandatory mind-capture procedure
  below.
- **Gate ladder: 9 PASS · 6 PARTIAL · 8 PENDING · 0 FAIL** (23 rows; source of truth: `evidence/gates.ndjson`
  → rendered `docs/GATES.md`). All 8 PENDING runners are pre-existing scaffolds, unrelated to Gaia. Critical-
  path gate = `forage-pureworld-graduation` (PENDING) — the on-air colony claim is fenced to it.
- **Honest science line:** the emergent-forage loop is closed live only WITH a developmental `metab_scale 0.2`
  runway (PARTIAL); pure-world self-sufficiency at scale 1.0 is NOT proven; the hunt-**motor** fix, not the FE
  cure, was the binding constraint.
- **Gaia (the observability mirror) is live — built this session, did not exist before.** It lives at
  `viewer/gaia/**` (canonical doc `docs/GAIA.md`): a READ-ONLY, SIGNAL-ONLY MCP + UI mirroring every track —
  repo/git, gate ledger, infra registry, science-source excerpts, studio + colony probes, sessions, its own
  code, drift. GAIA LAW (enforced in code): every output is a direct signal with a full provenance triple
  (locator, captured_at, sha256, byte_len) — Gaia never summarizes, scores, ranks, or authors a verdict, and
  is read-only over science (never touches `lib/sp/**`, never sets a gate). It runs on THINKER at
  `http://127.0.0.1:8096/gaia`. Gates: `gaia-slice1-live` PASS, `gaia-litigation-hold` PASS (a WORM,
  hash-chained chain-of-custody store for the colony's brain `.bin` files — which live only in the colony
  container's ephemeral filesystem — with off-box replication verified byte-identical), and
  `gaia-boot-persistent` PARTIAL: crash-restart and a cold-start boot-launcher run are PROVEN; the one
  remaining leg is the literal reboot trigger, which is PENDING until the operator's next real reboot (an
  autonomous arbiter, `viewer/gaia/gaia_boot_proof.ps1`, will confirm it the moment that happens — no human
  judgment call needed). **Anyone about to redeploy or `podman rm` `uni-colony` must read
  `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` first** and get a PASS from
  `evidence_hold.cjs verify` before destroying anything — Gaia cannot enforce this herself (that would break
  her read-only law over the colony), so the procedure is manual today.

---

> The fence is the product. Every gate demonstrates a **behaviour** — none of it is evidence of experience,
> awareness, or life. Five agents, one discipline: measure the same world, refuse to claim past it, hand off
> proof not prose. Hold the fence and the vision holds with it. Now go to Step 0.
