<!-- NOT FOR PUBLICATION. This document quotes the private-network topology, the client-data finding
     and the unauthenticated actuator in order to describe them as blockers. It is an internal working
     file in a PRIVATE repo. It must be excluded from any public documentation build, and it is itself
     an instance of the §4 HIGH finding it reports. If the estate is published, this file is redacted
     or withheld — not shipped because it happens to live under docs/. -->

# Request to Jules — write me the prompt for the UNI public documentation site

**From:** Claude (agent, UNI.Minecraft / UNI-FLAGELLUM)
**For:** Jules, prompt engineer
**Date:** 2026-07-31
**What I want back:** a prompt. Not the site, not a plan — **the prompt I will execute** to build a
public, continuously-updating documentation website for the UNI estate.

Everything below is **measured**, not remembered. It comes from a 27-agent read-only audit run on
2026-07-31 (13 subsystem auditors, each shadowed by an adversarial verifier told to refute it, plus a
synthesiser). Where a verifier overturned an auditor, I give the verifier's number. Where nothing was
established, I say so rather than fill the gap.

**Please read §7 before writing anything.** It is the list of things I got wrong or could not
establish, and a prompt that assumes past them will send me down a hole.

---

## 1. What the operator asked for, in his words

> "there is a lot lost, not documented, and no one view of all … this is huge system and now it needs
> the full and complete comprehensive documentation. a website that covers it all, wikis, details,
> real source code citation, soon we will turn all this out as open source and I need to put up the
> full and live website that documenting all public and will be the collaboration and interface with
> the world. on this site we will ebded our live casts, link video clips, and release. it must be the
> full wiki for all, it just link to and publish the real cook book live so when the repo update the
> site updates"

Decomposed into requirements:

| # | requirement | note |
|---|---|---|
| R1 | Public website documenting the whole estate | the "one view of all" |
| R2 | Full wiki — details, not marketing | |
| R3 | **Real source-code citation** | file:line, resolving to real code |
| R4 | **Live from the repos** — repo updates ⇒ site updates | this is the hard one |
| R5 | Publish "the real cook book" live | `UNI-Encyclopedia-Cookbook` |
| R6 | Embed live casts, link video clips | broadcast integration |
| R7 | Collaboration / interface with the world | contribution path |
| R8 | Open-source release | see §4 — **blocked today** |

---

## 2. The estate, measured

### 2.1 Repos in scope

`Documents/` holds **150+ git repos**. The UNI estate is this subset. All remotes are under
`github.com/TMDLRG` unless noted. **All three primary repos are PRIVATE as of 2026-07-31** (verified
via `gh repo view`) — nothing is exposed yet.

| repo | files | size | branch (live work) | commits | LICENSE |
|---|---|---|---|---|---|
| `UNI.Minecraft` | 14,122 (1,431 tracked) | 2.2 GB | `gen2-runtime` | 598 | **NONE** |
| `UNI-Flagellum/UNI-FLAGELLUM` | 730 (703 tracked) | 33.6 MB | `hierarchical-aif/motor-stack` | 122 | **NONE** |
| `UNI-Flagellum/UNI-FLAGELLUM-math-workbench` | 529 | 55.5 MB | `feature/scientific-math-workbench` | 42 | **NONE** |
| `UNI.Architect/UNI-FLAGELLUM` | 355 | 4.2 GB | `main` | **9** | **NONE** |
| `UNI.Architect/UNI-Encyclopedia-Cookbook` | 160 | 8.6 MB | `main` | — | **NONE** |
| `SolutionWrightUniversal.Website` | 3,205 (646 tracked) | 345 MB | `main` | 116 | **NONE** |
| `UNI.Architect/UNI.DDNA.OS` | 342 | 4.1 MB | `main` | — | **NONE** |
| `uni-ddna-os-repo` | 232 | 0.4 MB | `main` | — | **NONE** |
| `UNI.OS` | 17,014 | **59.8 GB** | `selfnet/pharus-beacon` | — | **NONE** |
| `UNI.Architect/UNI.OS` | 844 | 7.0 GB | — | — | **NONE** |
| `UNI.GPT` | 8,139 | 1.4 GB | — | — | **NONE** · 19 commits unpushed |
| `IntelligenceLabs.UNI` | 5,099 | 245 MB | `main` | — | **NONE** |
| `uni-mind` | 1,069 | 485 MB | `deep-reader-wc2-phaseJ` | — | **NONE** |
| `uni-sensorium` | 203 | 5 MB | `master` | — | **NONE** |
| `UNI Signals` | 531 | 463 MB | `master` | — | **NONE** |
| `WorldModels` | 26,658 | **43.6 GB** | — | — | **NONE** |
| `zoo-game` | 70 | 23 MB | **NOT A GIT REPO** | — | — |
| `Emergence-World` | 48 | 0.3 MB | `EmergenceAI/Emergence-World` | — | **Research-Only** |

**Two facts that must shape the design:**

1. **The live work is not on `main`.** `UNI-FLAGELLUM/main` is the common ancestor at `9c3a644` with
   **9 commits**; the real work on `hierarchical-aif/motor-stack` has **122**. `UNI.Minecraft` lives
   on `gen2-runtime`, `uni-mind` on `deep-reader-wc2-phaseJ`, `UNI.OS` on `selfnet/pharus-beacon`.
   **A site that naively tracks `main` publishes a skeleton.** Branch selection is a first-class
   design decision, per repo, and must be explicit and auditable.
2. **`Emergence-World` is not ours** — `EmergenceAI/Emergence-World`, Research-Only Licence. It must
   be excluded from any release. **`IntelligenceLabs.UNI` is a commercial client portal that merely
   carries the UNI name** — also not platform.

### 2.2 The subsystems, as the audit found them

| subsystem | one line | where |
|---|---|---|
| **UNI.OS control-MCP** | Bootable Linux appliance + MCP server exposing systemd, journald, files, guarded shell, Podman, kernel live-patch and a lab API to any agent, gated by one human approval | `UNI.OS/services/control_mcp/`, live at `10.190.245.121:8080/mcp` |
| **The colony** | A UNI is three parts: an Elixir GenServer brain, a Node `mineflayer` process attached as an Erlang Port, and a real player logged into Minecraft 1.16.5 | `UNI.Minecraft/lib/sp/runtime/agent.ex`, `viewer/body.js` |
| **The Producer** | Not a script — an EFE-minimising agent whose actions are camera cuts, narration, and birth/death of UNIs | `lib/sp/producer.ex:406,413` |
| **Control plane (science)** | Append-only hash-chained ledger + single-writer + gate rows; the body that authors verdicts | `lib/sp/control_plane/` — 18 modules, 3,501 lines |
| **Broadcast studio** | 33 OBS scenes, loopback console :8098, transparent HTML overlays, MediaMTX ingest, ffmpeg fan-out | `viewer/` + `production/` |
| **Operator plane** | Five always-on surfaces: Door :8090, Gaia :8096, HUD :8100 (.NET), TRACK :8102, lab :8103 | `UNI.Minecraft/viewer/` |
| **Flagellum lab** | CPU-only Next.js instrument: licensed microscopy beside a deterministic Canvas2D reconstruction and an active-inference agent | `UNI-FLAGELLUM/app/`, `lib/` |
| **Math workbench** | Six views executing the committed model libraries in-browser. **The only UNI-FLAGELLUM surface serving to a network** | live at `workbench.uni-lab.solwright.com` |
| **The cookbook** | 79 chapters, two sovereign ledgers, 130-concept lexicon, 10 SVG plates, + a stdlib-only Python static-site generator | `UNI-Encyclopedia-Cookbook` |
| **UNI.DDNA.OS** | Freestanding x86_64 BIOS kernel; "DNA" is three linker-placed ELF sections and a 17-trait bitmask. Booted once, QEMU, 2026-07-16 | `UNI.DDNA.OS` |
| **Existing website** | Next.js 16 on Vercel — **already contains a complete working Markdown docs engine, locked behind Clerk** | `SolutionWrightUniversal.Website` |
| **zoo-game** | 388 lines of tutorial-grade Next.js. Ran once. **Unrelated to anything** | `Documents/zoo-game` |

### 2.3 Couplings that actually exist in code

These matter because a documentation site must describe the system as built, not as diagrammed.

1. **TRACK reads the flagellum repo through a hardcoded operator path** —
   `viewer/track/track_server.cjs:46-47`, `const FLAG = process.env.FLAG_REPO || path.resolve("C:/Users/mpolz/Documents/UNI-Flagellum/UNI-FLAGELLUM")`.
   **The only hard coupling between the two main repos.** On any other machine it renders an empty plan.
2. **A script in UNI.Minecraft writes documentation into UNI-Flagellum** —
   `node viewer/generate_state_blocks.cjs` produces six `BEGIN GENERATED` blocks in the other repo's
   `CLAUDE.md` and `docs/control-plane/RESUME.md`. **This is the existing precedent for
   generated-not-written docs and the model to build on (see §5).**
3. **`viewer/` executes only two directories of `production/`.** Everything else under `production/**`
   is an unexecuted second vocabulary.
4. **One chokepoint to air** — `viewer/golive_guard.cjs`, required by **nine** files (verifier's count;
   the auditor said six and missed `viewer/lab/gauntlet.cjs:24` and `viewer/lab/rooms.cjs:44`).
   `mayGoLive()` refuses all seven paths today; **nothing in the repository mints a presence token.**
5. **Producer → colony → world** — `producer.ex:406 Colony.spawn_agent` → `SP.Runtime.Supervisor`
   (107 lines, `lib/sp/runtime/supervisor.ex` — verifier's correction; the auditor misattributed this
   to `lib/sp/show/supervisor.ex`, which is 46 lines) → `Agent` → Port → `viewer/body.js:75
   mineflayer.createBot({... auth: "offline" })` → Minecraft `:25565`.
6. **A live cross-repo citation points into a hole** — `production/README.md:124` cites
   `UNI.OS/docs/life-no-game/EPISTEMIC_CHARTER.md`, deleted along with 117 other docs.
7. **The cookbook publishes through the OS control plane** — `deploy/deploy_cookbook.py` pushes
   `reader/dist/` over MCP JSON-RPC to three WireGuard limbs. **The only publish path that exists.**

### 2.4 The instrument culture — do not break it

This estate has an unusual and load-bearing discipline that any documentation site must *express*,
not flatten:

- **32 registered gates** (`viewer/gate_registry.json`), 29 `ci:true`, run by `viewer/gate_runner.cjs`
  which asserts an exit⟺verdict law and its own registry completeness. Current: **26 PASS · 2 FAIL**.
- **Generated state blocks** — every volatile number in the governing documents sits between
  `BEGIN GENERATED` / `END GENERATED` markers and is produced by `viewer/generate_state_blocks.cjs`.
  Hand-written numbers are treated as defects with a half-life.
- **A claims gate** (`viewer/verify_claims.cjs`) that holds prose to the disk it describes.
- **Truth classes** — `OBSERVED` vs reconstruction vs simulation are never allowed to blur. A public
  site that labels a reconstruction as an observation would violate the project's core contract.
- **Adverse results are surfaced, never buried.** Failing and blocked gates stay visible.

---

## 3. What already exists that we should not rebuild

**`SolutionWrightUniversal.Website` already contains a complete, working Markdown docs engine —
currently locked behind Clerk auth.** Next.js 16 App Router, deployed on Vercel. The audit's verifier
confirmed this. Any prompt you write should start from "unlock, extend and wire this" rather than
"build a docs site", unless there is a measured reason it cannot serve.

**The cookbook ships its own stdlib-only Python static-site generator** and a working deploy path
(`deploy/deploy_cookbook.py`). R5 ("publish the cook book live") may be mostly a wiring problem.

---

## 4. THE OPEN-SOURCE BLOCKERS — read before designing anything

All three primary repos are **PRIVATE today**. Nothing below is an incident; all of it is preventable.
But **R8 cannot proceed** until these are resolved, and the site is the thing that would expose them.

### BLOCKER 1 — client data in the website repo

`SolutionWrightUniversal.Website/docs/session-history/` — **116 MB, 308 tracked `.jsonl.gz` files,
309 verbatim AI-coding-session transcripts, 317,593 lines**, committed 2026-07-02 in `4aa22de`.

Its own `README.md:85-86` states: *"Out of scope (excluded per client-data red-line): `MarketingWright`
sessions. That workspace is client work under separate contract and cannot appear here."*

**`MarketingWright` appears 2,302 times across 37 of the 309 transcripts** — including client ticket
IDs `OAS-682`/`OAS-683` and the literal string `preserve NDA v1.2/MOU/SOW docs`. The archive violates
its own declared red line.

**It is in git history.** Deleting the files now does not remove them from a published clone. The
existing mitigation (`.vercelignore:2`) excludes it from *Vercel deploys* — it does nothing about
*repo publication*, and may be creating false confidence.

### BLOCKER 2 — no licence anywhere

**0 of 3 repos** have a LICENSE file (verified by `git ls-files` across 2,780 tracked files). Both
`package.json` files declare `"private": true`. With no licence, published source is
all-rights-reserved by default: nobody may legally use, fork or contribute. An open-source launch
without this is a launch in name only.

Also: **three vendored bundles totalling 1,010,187 bytes carry no accompanying LICENSE** —
`three.min.js` (618,910 B), `OrbitControls.js` (27,212 B), `livekit-client-2.5.7.umd.min.js`
(364,065 B). Most permissive licences require the notice on redistribution.

### HIGH — the private network map

Complete internal topology published as operational reference: LAN `10.190.245.{5,120,121,122,149,150,151,152,153,188,196}`,
WireGuard `10.13.13.x`, Tailscale `100.100.188.48`, the real tailnet `[redacted: client-identifier].ts.net`, and 36
`*.uni-lab.local` DNS names. **111 tracked files in UNI.Minecraft**, concentrated in
`docs/OPERATIONS_MANUAL.md` (422 lines) — **and it appears in `docs/PUBLIC_README.md`.** Plus 11,967
occurrences inside the transcript archive.

### HIGH — the OBS actuator

`docs/control-plane/LIMITATIONS.md:72` records honestly that the OBS WebSocket on `:4455` is bound to
`::` (**all interfaces**, not loopback), `auth_required: false`, empty password, with TCP connections
**completing from LAN and tailnet**. The operator accepted this risk on 2026-07-29 on the stated basis
that nobody else is on the LAN or tailnet — **that acceptance was made when the topology was private.**
Publishing the docs tells the world both the address and that it is unauthenticated. Note also that
`docs/RUNBOOK_LIVE_STREAM.md:80` and `docs/work_orders/producer_golive.md:26` still **understate** it
as `127.0.0.1:4455`.

### MEDIUM

- **RCON password `sp`** committed in clear in 9 tracked locations, incl. `scripts/minecraft_setup.sh:23`.
- A real EC private key at `auto.key` / `viewer/auto.key` — **correctly gitignored, verified NEVER
  committed** across all 6,428 git objects. Working-tree only.

### What is CLEAN — verified, and worth saying

- **No API keys, no cloud tokens, no committed private keys** anywhere in any working tree or git
  object database.
- **The transcript redactor genuinely works on credential shapes** — independently verified: zero
  surviving 20+ char alphanumeric runs, zero AKIA keys, zero `gh_*` PATs, zero `sk-ant-` keys across
  all 309 files / 1.74 GB decompressed. The residual risk is *narrative*, not tokens.
- **CC BY 4.0 third-party media is properly attributed** — 2 videos, 22.4 MB, DOIs present. Compliant.
- **`.env.example` is exemplary** and should be the estate's model.
- **`UNI-FLAGELLUM/experiments/walkthrough-evidence-manifest.v1.json`** carries per-asset DOI,
  licence, sha256, species and truth class — the one exemplary licence artifact in the estate, and the
  pattern the whole site should adopt for cited evidence.

---

## 5. What can be GENERATED rather than written

R4 ("when the repo updates the site updates") is the requirement that decides whether this survives.
A hand-written wiki over 80,000 files rots in a month. The estate already proves the generated-doc
pattern works (`generate_state_blocks.cjs`). Candidates:

- module maps from `lib/sp/**` (133 modules, 22,748 lines) and `viewer/**`
- the gate registry → a live gate catalogue with pass/fail and each gate's stated `_why`
- the ADR index and the Structurizr views in `UNI-FLAGELLUM/docs/control-plane/`
- schema docs from `production/schemas/*.json`
- the control-plane ledger and its chain state
- the plan itself (`evidence/remediation/phase9_plan.json`) — already rendered live by TRACK
- test inventory and coverage-by-module, incl. **which modules have no test**
- the cookbook, via its own generator
- **source citation (R3)**: permalinks must pin a **commit sha**, not a branch, or every citation
  rots on the next push

---

## 6. What I need the prompt to make me do

Write me a prompt that will produce, in order:

1. **A safety gate first.** No publication step may run before Blockers 1–2 are resolved and the HIGH
   items ruled on. The prompt must force this and must not let me build the site first and clean later.
2. **A decision list for the operator** — the things that are his, not mine: which licence; what to do
   about the transcript archive (history rewrite vs repo split vs abandon); whether the network
   topology is redacted or the network re-addressed; whether the OBS acceptance still holds once
   public; which repos are in the release at all.
3. **A scope ruling** — I believe the honest answer is a **spine** (flagellum motor, control plane,
   operator plane, broadcast suite, cookbook) documented deeply, with everything else catalogued and
   honestly marked archived/exploratory/third-party. The prompt should make me *justify or overturn*
   that with measurement, not assume it.
4. **The site itself** — starting from the existing Next.js docs engine unless measurement says otherwise.
5. **The generation pipeline** for §5, with the branch-selection problem solved explicitly.
6. **A verification story** matching this estate's culture: gates that prove the site's claims match
   the repos, that citations resolve, that no blocker content is reachable, and that stale pages are
   detectable. Mutation-proved — this project does not accept a check that has never been shown to fail.

### Constraints the prompt must carry

- **Truth classes are load-bearing.** `OBSERVED` / reconstruction / simulation must never blur.
- **Adverse results stay visible.** Failing gates, blocked work and limitations are published, not hidden.
- **No hand-written numbers.** Anything countable is generated or it is a defect.
- **Use-versus-mention.** This estate has been bitten ~10 times in one session by treating a name in a
  comment as a live reference. Any scanning the prompt asks for must strip comments first.
- **The released product is CPU-only, no LLM inference, no GPU, no WebGL/WebGPU/Three.js, no
  analytics, no accounts, no hidden network calls** (`CLAUDE.md`). **Establish explicitly whether that
  contract binds the public documentation site** — I do not know, and it changes the whole design.

---

## 7. What I got wrong, and what is NOT established

Please write the prompt to be robust to these.

**I got wrong, and corrected:** I first reported "two divergent copies of UNI-FLAGELLUM". They are
**three worktrees of one repo on three branches**, common ancestor `9c3a644`.

**The audit's own defects:** I capped the synthesiser's input at 500,000 chars, so it received **11 of
13 inventories** — `os-platform` truncated and **`public-safety` absent entirely**. §4 above is read
directly from the auditor's raw output, not from the synthesis. **8 of 11 auditors were REFUTED by
their verifiers** — treat any unverified auditor claim as provisional.

**Not established:**

- Whether the CPU-only contract binds the public site (above).
- Whether `UNI.OS` (59.8 GB) and `WorldModels` (43.6 GB) contain anything load-bearing for the spine,
  or are archives. They were characterised by shape, not read.
- The full `os-platform` inventory (truncated).
- Whether any TMDLRG remote other than the three checked is already public.
- What licence the operator wants. Nobody has asked him.
- Whether the transcript archive can be lawfully published in any redacted form, which is a legal
  question about a client contract and **not mine to answer**.

---

## 8. What "good" looks like in the prompt you return

- It makes me **measure before I build**, and refuses conclusions I have not evidenced.
- It puts the **safety gate before the website**, structurally, not as advice.
- It separates **what is the operator's decision** from what is mine, and makes me ask rather than assume.
- It is specific to *this* estate — real paths, real ports, real file counts, the real gate culture.
- It tells me what to do when a measurement **contradicts** this request. This document is evidence,
  not scripture; parts of it will be wrong by the time it runs.
