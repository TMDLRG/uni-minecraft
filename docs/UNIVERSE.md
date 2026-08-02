# HOW THIS UNIVERSE WORKS — the cold-start doc for any agent

> **Audience:** any LLM agent or human engineer picking this repo up **cold**, with no prior session
> context — soon, open-source, anywhere. **Purpose:** one document that lets you build, run, deploy, and
> do-science on this system without archaeology. **Read this first, then** `CLAUDE.md` (binding rules),
> `docs/SYSTEM_OVERVIEW.md`, `docs/STUDIO_SYSTEMS.md`, `docs/LAB_PROTOCOL.md`.
>
> **Everything below is grounded in the real code + receipts, cited `file:line`.** Where a claim depends on
> live runtime state I could not observe from a static checkout, it is marked **NOT VERIFIED**. This project's
> first law is: **receipts beat rhetoric. A running process is never a claim.**

---

## 0. What this is, in one paragraph

A **pure-Elixir categorical active-inference colony** — UNIs are embodied bots living on a real Minecraft
server, each running ONE mean-field *predict-act* tick as its life — with a **professional live-broadcast
platform** built on top of it (engineered to a CNN/BBC/PBS bar: supervised, boot-persistent, meant to carry a
7-day run without a frozen frame). The **north star** is *literal digital life with measurable awareness and
full human ability within this body/world, broadcast honestly to the public.* We are on a path that, if it
keeps building, ends in a public claim — so **every operational gate is separated from every experiential
claim by a hard fence** (§3). The engineering vision: **UNI always lives on ONE canonical box ("the chip") so
agents anywhere — soon open-source — can ship to / run / build / do-science on the same UNI-OS, while the
studio that broadcasts it is portable to any GPU box.** A public, reproducible build of general AI.

---

## 1. THE BINDING ARCHITECTURE (owner-set 2026-07-12 — THE rule everything conforms to)

There are **three boxes** with **three non-overlapping roles**. Every failure this project has had came from
conflating them. Learn this map before touching anything.

### 1.1 The three boxes

| Box | Address | Role (BINDING) | Runs | NEVER |
|---|---|---|---|---|
| **UNI-LAB** = "the chip" / UNI-OS | LAN `10.190.245.122`, mesh `10.13.13.1` | **Canonical UNI colony host (science lane) + ERP appliance. Same box, two surfaces.** | **Rootless (user `uni`, podman net `uni-colony-net`):** `mc-server` (Minecraft `:25565` / RCON `:25575`, seed 8675309), `uni-colony` (Phoenix `--sname uni` `:4000` + `/stream`, the FEP brain, `body.js` bots, `MC_HOST=mc-server`), RED lineage containers. **Rootful:** the ERP appliance (Odoo/Jitsi/mail/`/glass`/uni-lab MCP/lab-os). | Any **broadcast / render / encode** surface. No OBS, no mixer, no encoder. |
| **THINKER** (or ANY GPU box, Mac or Windows) | LAN `10.190.245.196`, T1000 4 GB + UHD 630 | **Portable render/studio ONLY.** Captures the lab colony over the LAN; never hosts it. "Production hub for now" but fully portable; needs no UNI-OS. | OBS mixer/encoder (`:4455`), `command_center.cjs` (`:8098`), `overlay_server.cjs` (`:8099`), `publisher.cjs` (`:8443` + regs `:8095`), local MediaMTX (`:1935/:8554/:8889/:9997`), `launcher.cjs` (`:8090` Mission Control), `systray_watchdog.ps1`, the colony-capture camera + guest cams. | **A local Minecraft or Phoenix colony.** Closed 2026-07-12 (`cea1cd3`, ADR-PROD-013) — default `studio_up.ps1` no longer does this; `-HostColony` is a labeled non-canonical legacy escape hatch that still can, do not use it. |
| **node2** `uni-lab-79740c` | mesh `10.13.13.3`, LAN `10.190.245.149` | **Fan-out relay ONLY.** | ONE container `uni-bcast-relay` (MediaMTX): accepts THINKER's single encode on `rtmp://10.190.245.149:1935/uni/program` (publish authorized ONLY from THINKER `10.190.245.196/32`) and `runOnReady`-tees to YouTube + Twitch. Keys in `/etc/uni/runtime.env` on the node. | Any render / encode / colony. It is **GPU-less** — headless OBS software-renders the 2D-canvas overlays to a **black frame** there (the real 3-day failure, `production/docs/adr/ADR-PROD-011...md:11-18`). |

**The `10.190.245.122` reconciliation (subtle — get this right).** UNI-LAB is **both** the rootless UNI-OS
colony host **and** the rootful ERP appliance. When older docs say *"L1 `uni-lab` = ERP appliance, ZERO
broadcast surface, ever"* they are correct about the **broadcast/render/encode** surface only. The **colony
(rootless, no GPU) legitimately runs on that same box** — that is exactly where the forage-RED science already
runs it (`memory/ops_colony_lab_rootless.md`, `runs/forage_red.exs:14-15`). So: **rootless UNI colony there =
YES; rootful broadcast/render/encode there = NEVER.**

### 1.2 The data flow (single-encode → copy fan-out)

```
UNI-LAB  (10.190.245.122, ROOTLESS "on the chip")
  mc-server container   : Minecraft :25565 / RCON :25575 (seed 8675309)
  uni-colony container  : Phoenix --sname uni :4000 (+ /stream)
                          SP.Producer FEP brain (lib/sp/brain/*), body.js bots as BEAM Ports,
                          MC_HOST=mc-server on uni-colony-net
        │   (LAN capture — the colony is NEVER hosted on the studio box)
        ▼
THINKER  (10.190.245.196, T1000 GPU — PORTABLE render/studio)
  ├─ world-view camera : mineflayer/prismarine-viewer client → mc-server @10.190.245.122
  ├─ overlays/HUD      : pulls :4000/stream from the UNI-LAB Phoenix over LAN
  ├─ guest cams        : → :8443 publisher → local MediaMTX :1935
  └─ OBS renders/mixes on the T1000 → ONE H264/AAC encode
        │   rtmp://10.190.245.149:1935/uni/program   (only THINKER may publish)
        ▼
node2  uni-lab-79740c  (mesh 10.13.13.3, RELAY ONLY)
  uni-bcast-relay (MediaMTX) runOnReady tee ──► YouTube + Twitch    (copy fan-out, never re-encode)
```

**Why this split (ADR-PROD-011 / -012).** Keeping OBS/render/encode on the **GPU box** is correct — the
black-frame failure on the GPU-less Linux node was real. Moving the **colony source** onto the GPU box was the
**wrong half** of that same correction: the colony needs **no GPU**, so it returns to the chip. GPU follows the
encoder; the colony follows the chip.

### 1.3 ⚠️ HONEST DIVERGENCE — the code does NOT yet conform (this is the top open task)

The **binding rule** says the colony lives on UNI-LAB. **The code now does this by default, closed
2026-07-12 in `cea1cd3` (ADR-PROD-013).** Verified against the live files 2026-07-13:

- `viewer/studio_up.ps1` — by default (no `-HostColony` flag) does NOT launch a local `java.exe -jar
  paper.jar` or local `elixir --sname uni`. It checks `10.190.245.122:4000` is reachable and warns if not;
  the studio still starts either way, but with nothing to capture until the lab colony is up. The old local
  `java`/`elixir` spawn lines are still physically present in the file (now ~193, ~239) but only execute
  inside the `-HostColony` branch — a labeled non-canonical legacy/dev escape hatch. Do not pass
  `-HostColony` for production bring-up.
- `viewer/launcher.cjs` — Mission Control's colony health tiles (World/Phoenix/Colony-cam) probe
  `COLONY_HOST` (env-overridable, default `10.190.245.122` — the chip), not loopback.
- `viewer/command_center.cjs`, `viewer/studio_stage.cjs`, `viewer/studio_channels.ps1` — all repointed to
  `COLONY_HOST` / the chip in the same commit.

`docs/UNI_OS_COLONY_MIGRATION.md` is the canonical **colony-placement** reference (one caveat: it says
"rootful Podman host"; the binding rule + `memory/ops_colony_lab_rootless.md` say **rootless under `uni`** —
trust rootless).

**Consequence:** running `studio_up.ps1` on THINKER with no flags now correctly captures the UNI-LAB colony
over the LAN and does not spin up a competing local one. If the lab colony is down, the studio starts anyway
(by design — it is not THINKER's job to gate the studio on the colony) but warns loudly and has nothing to
show until the lab colony comes up.

### 1.4 The single-node invariant

**Exactly ONE `--sname uni` Phoenix node exists, ever.** One writer of the `broadcast.json` overlay spool: the
in-app supervised `SP.Show.OverlayPublisher`. `runs/broadcast_bridge.exs` is **RETIRED** — never spawn it (it
would be a second competing writer). The science image runs `--sname uni --cookie sp` on UNI-LAB
(`deploy/uni-os/uni-colony.Dockerfile:48`). `studio_up.ps1`'s default path no longer starts a competing
Phoenix node on THINKER (closed 2026-07-12, `cea1cd3`) — the invariant now holds cleanly on the chip. The
old local `--sname uni` spawn only runs behind the non-canonical `-HostColony` legacy escape hatch; never
pass that flag for production bring-up.

---

## 2. THE FEP SCIENCE — what the brain actually is

This is a **categorical (discrete) active-inference** engine: pure Elixir, plain lists, no linear-algebra
library. It is deliberately **byte-comparable to a NumPy oracle** (`uni/brain/active_inference.py`) so there is
no reduction-order nondeterminism. `lib/sp/brain/math.ex:1-14`.

### 2.1 Read this convention first, or every index is wrong

Everything is **COLUMN-MAJOR**. A likelihood `A` (No×Ns) is a list of `Ns` columns, each `No` probabilities →
`A[s][o]`. A transition `B^u` (Ns×Ns) is `Ns` columns, each length `Ns` → `B[s][s']`. **Columns are the
distributions.** `lib/sp/brain/math.ex:9-14`.

### 2.2 The generative model `(A, B, C, D, E)` + precisions + Dirichlet priors

`lib/sp/brain/model.ex:22-60`:
- **A** — likelihoods per modality `P(o|s)`.
- **B** — transitions **per action** `P(s'|s,u)`.
- **C** — log-preferences per modality (the only place "what's good" is expressed; it is a **prior over
  outcomes**, not a reward).
- **D** — initial-state prior.
- **E** — habit prior over policies (the `ln_e` option in EFE; default uniform, `efe.ex:29`).
- **`pa`/`pb`** — the Dirichlet **concentration counts** that *learn* (A/B are their column-normalised point
  estimates). `Model.new/1` seeds `pa = A*1.0 + 1.0` (`model.ex:88`, `add1/1`) and `pb` via `seed_pb`
  (`model.ex:89,127`) — exactly the oracle's `pA = A*1.0 + 1.0`.
- **`gamma`** — policy precision (default **8.0**, `model.ex` / `genome.ex:141`). **`gamma_m`** — per-modality
  sensory precision.

**Genome → model.** DNA encodes **morphology only** — which organs/modalities/factors exist, precisions,
hyperparameters — **never world knowledge**. A/B are seeded uninformative and *learned*.
`lib/sp/brain/genome.ex:5-9`. Exteroceptive modalities get a **uniform** A (nothing pre-known);
interoceptive/proprioceptive get a weak `:diagonal` A (0.6) that only breaks the degenerate uniform-A symmetry
so self-state is identifiable (`designer.ex:78-98`). The `:emptying` B (metabolism stores) **drains on every
non-`:eat` action and refills on `:eat`** — the "no free hold" viability edge (`designer.ex:110-132`).

### 2.3 Perception = variational free-energy minimisation

For this mean-field model the VFE-minimiser is exactly categorical:

```
q(s) = softmax( forward_prior(s) + Σ_m γ_m · ln A^m[o_m, s] )
```

`lib/sp/brain/infer.ex:1-42`. `forward_prior` is `ln D` at step 1, else the forward message `(ln B^{u_{t-1}})·s`.
**Bound-critical convention:** log the columns FIRST, then take the weighted sum — `(ln B)s ≠ ln(B·s)`
(`math.ex:71-82` `ln_matvec/2`; never `log(matvec(...))`). Soft/virtual evidence (a distribution over outcomes)
generalises the hard one-hot case and is byte-identical at the peaked limit (`infer.ex:76-98`).

### 2.4 Action = EXPECTED free-energy minimisation

`lib/sp/brain/efe.ex:1-14,87-101`:

```
G(π) = − Σ_τ Σ_m [ epistemic + pragmatic ]
   epistemic = H(qo) − E_q[H(o|s)]   (expected information gain / "curiosity")   efe.ex:97
   pragmatic = qo · C                (expected log-preference)                    efe.ex:99
Q(π) = softmax( ln E − γ·G − F_π )                                                efe.ex:43-48
```

With uniform habit and no per-policy VFE term this reduces to `softmax(γ·(epistemic + pragmatic))`, matching
the oracle exactly. Action is chosen by marginalising `Q(π)` to the **first step** (`choose_action/5`,
`efe.ex:63-74`). `dynamic_gamma` (per-tick policy precision via `SP.Brain.Precision.update_policy`) is used
**only** on the live Factors/MC path, **never** on the oracle path (`efe.ex:22-27,38-42`) — that separation is
what keeps the golden byte-identical.

### 2.5 Deep planning — the LIVE decider

`lib/sp/brain/plan.ex` is a depth-limited **beam search** over the shared action set: roll each factor's belief
forward under its expected transition, sum per-factor one-step EFE — cost `O(nu·beam^{depth-1})` instead of
`O(nu^H)`. Defaults **`plan_depth: 5, plan_beam: 3`** (`genome.ex:152-153`; clamped to [1,6];
`plan_depth==1` reproduces the gen-1 one-step agent). `advance/3` is the **same** one-step EFE as `Efe`
(epistemic `H[qo] − qs·amb` + pragmatic `qo·c`). At `beam = nu` it is exhaustive brute force. **Honest fence in
the moduledoc:** this is Class B/C planning (recursive EFE over expected future beliefs), **NOT Class U
cognition** (`plan.ex:11-16`).

### 2.6 Learning = Hebbian Dirichlet accumulation — there is NO reward

`lib/sp/brain/learn.ex:2-8`: `a^m ← a^m + η·o^m⊗s̄` (likelihood), `b^u ← b^u + η·s̄'⊗s̄` (transitions, when
`learn_b`). Point tensors are re-derived as column-normalised Dirichlet means. Soft-count generalisation equals
the hard bump at `r=onehot(o)`. **No TD, no reward-on-policy, no backprop — anywhere.**

### 2.7 The "missing third EFE term" — parameter information gain (novelty / active learning)

`lib/sp/brain/novelty.ex:11,36-50`. Per modality, from the A-Dirichlet counts `pa`:

```
W_a = ½ · Σ_s qs[s] · ( Σ_o qo[o]/pa[s][o] − 1/Σ_o pa[s][o] )        (qo = A·qs)
```

plus transition-novelty `W_b` over `pb` per action (`novelty.ex:57-71`). It **rides the epistemic channel
under the same γ** (`efe.ex:88-98`, `plan.ex`). It is **large and positive** in under-sampled cells,
**C-independent**, and **decays monotonically to 0 as counts → ∞** — the no-smuggled-reward property. Counts
are floored at the prior pseudocount `@floor = 1.0` so `1/count ≤ 1` and the term cannot blow up
(`novelty.ex:21-30,44,61,66`). **Gated at `novelty_gain = 0.0` by default** (`genome.ex:171`); when 0 the
`ng > 0.0` guards short-circuit to the exact flat step (`efe.ex:91,98`) ⇒ **byte-identical**.

Every accepted FE term must be one of: pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`, parameter-novelty
`W`, or a precision `γ/γ_m/η` (`docs/LAB_PROTOCOL.md`). Nothing else may enter the policy logits.

---

## 3. THE HARD INVARIANTS — the math fence, and WHERE each is guarded

These are non-negotiable. Each is guarded by a **test** or is **structural** (true by construction). Verified
in code this session.

| # | Invariant | Guarded WHERE |
|---|---|---|
| **1** | **No Nx / Rust / NIF / GPU / backprop / RL / TD / reward-on-policy.** Categorical per-factor A/B/C/D/E; action by EFE; Hebbian Dirichlet. | Structural: `math.ex:1-14` (pure lists), `learn.ex:2-8` (no reward term exists). |
| **2** | **Additive + GATED; default genome BYTE-IDENTICAL** (mad < 1e-12 over the live depth-5 `Plan` path). Every extension sits behind an opt-in genome field absent from `default/0`; graded-coupling default 0.0. | `test/sp/brain/decider_byte_identity_test.exs` — asserts `mad < 1.0e-12` for the implicit default, explicit `Genome.default()`, AND the frozen golden `test/fixtures/decider_golden_seed7_d5b3.bin`. Gates default off: `novelty_gain 0.0` (`genome.ex:171`), `slow_context_coupling 0.0` (`genome.ex:166`), `drive_shape :setpoint` (`genome.ex:178`). |
| **3** | **No scalar-per-action term in policy logits.** Values depend on predicted OUTCOMES via `B^u` only, never action identity or a per-action scalar. | `test/sp/brain/action_clone_invariance_test.exs` (clone / inject-cost / perturb-one). Structural: `u` enters plan values only through `elem(b_tuple, u)` / `elem(pb_tuple, u)` — there is no `action_cost` field to inject. |
| **4** | **Monotonic decay** of any information term: `W → 0` as Dirichlet counts → ∞, independent of C. The no-smuggled-reward proof. | `novelty.ex:13-16,30`; `test/sp/brain/novelty_test.exs` (W→0 as counts→∞). |

> If you touch the FE engine, **you must re-green these before merge**, and you may not merge without a MERGED
> VERDICT from `/lab-team-review` (§4.4).

---

## 4. HOW WE STAY HONEST — the gate + RED + claim-fence process

**First principle (binding, `CLAUDE.md` Method-of-work §1):** *Never claim from process existence.* A running
process, an open port, an `exit 0` launcher — **none is a claim.** Back every operational claim with its
machine gate, or say **"NOT VERIFIED."**

### 4.1 The machine gates (each proves ONE named thing)

| Claim | Gate (run it yourself) | What it actually checks |
|---|---|---|
| **colony-of-N** | `node viewer/verify_colony.cjs [host]` | `producer /producer/health .colony_count === RCON list players − Director` (Director is the camera bot, subtract 1). PASS only on exact agreement + no cap-pressure. `verify_colony.cjs:44-69`. **Proves count-consistency, NOT survival/life** (`:16-17,69`). A **`colony_count:0` producer reporting LIVE is an EMPTY colony — say so.** Default host `127.0.0.1` (`:22`) — after the rewire, run `... 10.190.245.122`. |
| **LIVE** | fresh `GET /producer/health` you ran | `verdict=="LIVE"` requires `producer_up && director_up && Director.driver == :producer`. PID existence is **not enough**: a live Director still in `:self` is a headless **puppet ⇒ "PARTIAL"** (`lib/sp/show.ex:83-89`). `driver` is the real value read from `SP.Brain.Director.driver()` (`show.ex:64-67`), set `:producer` only when the Producer actually drives. Combine with the colony rule. |
| **overlays-up** | `node viewer/verify_overlays.cjs` (→ `viewer/overlay_proof.png`) | Against **OBS itself**, not "server running": obs-websocket `:4455` reachable; the CURRENT PROGRAM SCENE carries all four `ovl_*` browser-sources **enabled** and pointed at `127.0.0.1:8099`; `:8099/state.json` serves parseable state; writes a real program screenshot. `verify_overlays.cjs:1-9,39-58`. |
| **platform-up (node2)** | `production/verify_p1.sh` ALL PASS | Probes real surfaces + hashes deployed files. **⚠️ STALE:** this gate still checks `uni-bcast-mixer` / `uni-bcast-overlays` / production-MCP `:8095` (`verify_p1.sh:11-12,22-30`), which `CLAUDE.md` declares **RETIRED** (node2 = relay only). **Do not treat verify_p1.sh as authoritative for the corrected relay-only node2 until it is rewritten.** NOT VERIFIED against the corrected architecture. |
| **default-genome byte-identity** | `mix test test/sp/brain/decider_byte_identity_test.exs` | mad < 1e-12 over depth-5 Plan (§3 #2). |

### 4.2 The 3-signal LIVE gate (public go-live)

Public GO LIVE needs all three: OBS `outputActive` true + node2 relay `readers ≥ 1` + node2 `bytesReceived`
growing (`ADR-PROD-011...md:67-69`). **Nothing broadcasts publicly** until this passes **with node2 up** and
`uni-bcast-relay` confirmed accepting THINKER's publish.

### 4.3 The RED protocol (how a science claim is earned)

`docs/LAB_PROTOCOL.md`, binding:
1. **One cure at a time.** Never stack changes you cannot attribute. A second cure does not deploy until the
   prior has a recorded verdict. If a second variable enters the comparison, the result is **VOID** — re-run.
2. **Pre-registered RED gates.** Every cure registers a named **PASS condition** + **FALSIFIES condition** in
   the docs *before* the run. A run is judged only against its registered gates.
3. **Honest verdicts only: PASS / PARTIAL / FAIL / WITHHELD.** Never percent-scored, never spun.
4. **Evidence is continuous + harness-managed** (survives context compaction), independently confirmed:
   behavioural via **RCON** (the server's authoritative view), mechanism via **brain probes** against the live
   registry.
5. **New lineages run in SEPARATE containers** with distinct kin + memory dirs, `UNI_AUTOSTART=0`, and **owner
   go-ahead** before any live-colony deploy. The streamed genome stays byte-identical until a RED verdict +
   go-ahead flips it.

### 4.4 The ship gate

**No FE-touching code merges and no live RED deploys** without a **MERGED VERDICT** of SIGN or
SIGN-WITH-CHANGES from `/lab-team-review` (five adversarial UNI-GPT-signed personas: math-breaker / aif-theorist
/ architect / experimentalist / embodiment), plus the three required artifacts: typed model spec, paired RED
design, ship-gate checklist. For any FE-touching proposal, invoke `/lab-team-review` **before writing code.**

### 4.5 THE CLAIM FENCE (the product-defining rule — never weaken)

> **Operational behavioural / organisational measures are necessary-not-sufficient substrates with ZERO
> evidential weight for awareness / consciousness / life on their own. Passing a gate demonstrates the named
> BEHAVIOUR, never experience.**

Do **not** surface any gland/precision/store/`felt_*` float as a "felt" state — every such bin is a **model
variable**, never felt hunger/tiredness (`lib/sp/brain/homeostat.ex:16-17`). Keep the warranted claims and the
over-claims **visibly separated** — that separation *is* the product. The operator console enforces this in
code: a `FENCE` regex blocks "prove/conscious/aware/alive/life/experience/AGI" from on-air text unless force-
logged (`viewer/command_center.cjs:136`).

**THE FOOD-HACK LESSON (never repeat it).** A colony was once made "stable" by RCON-force-feeding UNIs
(1300+ hoarded items each) — **fake life.** That give was removed and the survival claim WITHDRAWN. Viability
behaviours (foraging) **MUST EMERGE from the generative model via Expected Free Energy** — no goal-coding, no
reward, no gives, no props. **If survival depends on a hack, it is not life; say so and pull the claim.**

---

## 5. CURRENT HONEST STATE (do not re-derive; verify before claiming)

### 5.1 The science edge — emergent foraging (per the receipts; NOT re-run this session)

The mechanism (reward-free, C-independent decay): interoceptive depletion → L2 selects `:forage` → prey-orient
C makes closing on prey pragmatic → `:attack`'s under-sampled B column makes `W_b` worth *trying* (gated,
`ng>0`) → a **world-earned** kill (`body.js collectDrops`) lets the Dirichlet B learn `attack→has_food` →
thereafter the hunt is chosen **pragmatically** and the epistemic drive **decays to 0**.
`docs/receipts/emergent_forage_cure1.md`.

**Verdicts of record (honest, non-overclaiming):**
- **Cure-1 forage RED (novelty ON vs OFF), Run 1: WITHHELD** — neither arm foraged (all bots starved in ~5-6
  min); the drive could not be tested. Two stacked failures isolated: a policy **eat-swamp** and a **motor
  gap** (`body.js doAttack` never closed distance to prey). `docs/receipts/forage_red_preregistration.md`.
- **FIX 1 — hunt-motor kill-conversion (`body.js doAttack`, body-only, no FE touch): CONFIRMED WORKING.**
  Survival-by-hunting is **physically possible** (one bot collected `max_inv_food=12`, stayed full) but was
  unreliable at first ⇒ remaining policy gap. **This motor fix was the binding constraint and is the real
  driver.**
- **FIX 2 — honest-consummation FE cure (`consummation_honest`, coupled eat-B): offline-proven, gated,
  byte-identical.** OFF ⇒ byte-identical; ON de-values eat-on-empty so the only route to raise energy when
  hungry+empty is acquire→eat; clone-invariance holds with the couple ON. Offline suite green.
  `docs/receipts/forage_honest_consummation_RED.md`.
- **Honest-consummation RED, Run 2 (fixed motor): THE EMERGENT FORAGING LOOP IS CLOSED — but WITH the
  developmental `metab_scale` runway ONLY.** Deep-body UNIs survived a full soak at full energy by their own
  hunting (prey→kill→collect→eat→stay-fed, world-earned, **zero gives**) — at `metab_scale 0.2`.

**What is TRUE to claim, and NOT (say it exactly this way):**
- ✅ Emergent foraging survival is real and reliable **WITH a developmental `metab_scale` runway** — this is
  **DEVELOPMENT (womb/wean), not graduation.**
- ❌ **PURE-WORLD self-sufficiency (scale 1.0, no runway) is NOT yet proven** — it is the open gate (task #25).
- The honest-consummation cure's **offline** mechanism stands (byte-identical, gated); its **LIVE necessity is
  marginal/unproven** — Run-1's "7× attacks" result did **not** replicate in Run-2 (direction flipped, within
  noise at n=3), so that G1 claim was **WITHDRAWN.**
- **Honesty correction owed plainly** (`emergent_forage_cure1.md`, `genome.ex:384-386`): the L2 is a
  **control/preference hierarchy** (situation observed up, C-override down), **NOT** a predictive-coding
  errors-up/predictions-down stack; the "hyper-prior" is a large-magnitude interoceptive C (γ_m=1.0), **NOT**
  an elevated precision.

**The live-streamed lineage.** `Genome.homeostat_colony/0` (`genome.ex:353-363`) is offline-green
(byte-identity + compiles + dynamics) but **NOT RED-validated live**; it ships unproven per explicit owner
go-ahead. The novelty/forage/nursery lineages are **separate constructors** so the streamed genome stays
byte-identical until a RED verdict + go-ahead flips it.

### 5.2 Architecture / ops state

- **THINKER is the render+studio host; it does not host a local colony by default** (closed 2026-07-12,
  `cea1cd3`, ADR-PROD-013 — see §1.3). Only the labeled `-HostColony` legacy escape hatch still can; do not
  use it for production bring-up.
- **node2 reachability (checked 2026-07-13 via the uni-lab MCP over the mesh): UP** — answers `lab_health`
  and `podman_ps`. `uni-bcast-relay` was NOT running at that check (confirm/restart before depending on it).
  Public GO LIVE is BLOCKED until `uni-bcast-relay` is up and confirmed accepting THINKER's publish. **NOT
  VERIFIED** this session.
- **Doc staleness (known, being scrubbed):** several docs still carry pre-correction prose — "System 2 =
  containerized OBS on node2 = the one true broadcast path", `uni-bcast-mixer`/`-overlays`/`-pubgate` as LIVE,
  or "colony source on THINKER". These are **stale**. The truth: **node2 = relay only; render = THINKER;
  colony = UNI-LAB.** `verify_p1.sh` still gates the retired stack (§4.1). If a doc's body contradicts §1 here,
  §1 wins.
- **NOT VERIFIED from a static checkout:** live reachability of UNI-LAB `mc-server`/`uni-colony`; whether node2
  is up now; whether `10.190.245.122` currently publishes `:25565/:25575/:4000/:3020` to the THINKER LAN
  (podman ports may be container-internal). Confirm these before executing the rewire or a go-live.

---

## 6. EXACT COMMANDS + GATES — how to run each thing

> **Ground rule:** after every step, run the step's gate. No gate ⇒ status is **NOT VERIFIED.** Never claim
> up/live/proven from a launcher's `exit 0`.

### 6.1 Do-science on the colony (the real home: UNI-LAB rootless)

The colony + all RED work already live on UNI-LAB (`10.190.245.122`) rootless under `uni`, in podman on
`uni-colony-net`: `mc-server` (Paper 1.16.5, seed 8675309) + `uni-colony` (built from
`deploy/uni-os/uni-colony.Dockerfile`; headless, `UNI_CAM=0 UNI_AUTOSTART=1`, `MC_HOST=mc-server`).

- **Colony-count gate:** `node viewer/verify_colony.cjs 10.190.245.122` → PASS iff
  `colony_count == RCON players − Director`.
- **LIVE gate:** `curl http://10.190.245.122:4000/producer/health` → require
  `verdict=LIVE && driver=producer`, and cross-check with the colony gate.
- **RED lineages (examples, one cure at a time, separate containers):** `runs/forage_red.exs` (Cure-1),
  `runs/forage_honest_red.exs` (Cure-2), `runs/nursery_forage_gate.sh` (full nursery→pure-world harness, runs
  ON the lab box rootless), `runs/pureworld_qa.exs` (the graduation arm, task #25). Read each launcher's
  leading comment for its exact PASS/FALSIFIES gates; the analyzers `runs/analyze_*.py` score RESULT lines
  against the pre-registered bars. **Do not deploy a second cure until the prior has a recorded verdict.**
- **Offline invariant gates (run before ANY FE merge):**
  `mix test test/sp/brain/decider_byte_identity_test.exs test/sp/brain/action_clone_invariance_test.exs test/sp/brain/novelty_test.exs`.
- **Ship gate:** `/lab-team-review` → MERGED VERDICT + three artifacts (§4.4).

### 6.2 Bring up the studio (THINKER — portable render/studio)

- **One command:** `viewer\studio_up.ps1` (ASCII-only PS 5.1). It is port-gated at every step. **CAVEAT
  (§1.3):** it *currently* also launches a **local** Minecraft (`:178`) + Phoenix colony (`:224`) — until the
  rewire lands, that is a dev-box colony, not the chip. `-Status` reports; `-Stop` tears down (refuses if
  MediaMTX shows `uni.ready` = on air, unless `-Force`); `-Watch` supervises.
- **Teardown order is load-bearing** (`Kill-Everything`, `studio_up.ps1:56-92`): watchdog → **Phoenix
  supervisor FIRST** (so `SP.Show` cannot respawn bodies — the phantom-orphan fix) → Minecraft → node children
  (body.js/director.js/throttle) → OBS/MediaMTX → colony/glass Chrome → wrapper shells. After the colony moves
  off THINKER, `-Stop` must become **studio-only** and must **never** reach into the lab.
- **Overlay gate:** `node viewer\verify_overlays.cjs` → exit 0 + `viewer\overlay_proof.png`.
- **Mission Control:** `viewer\launcher.cjs` (`:8090`, loopback) is the always-on START/STOP/health surface; it
  survives `-Stop`. It probes 10 tiles with real TCP/HTTP (never process-existence) and links to the console,
  camera gateway, producer `/stream`, and glass cockpit. **After the rewire, its World/colony tiles must point
  at `10.190.245.122`.**
- **Operator console:** `viewer\command_center.cjs` (`:8098`, loopback). Owns OBS via `ws://127.0.0.1:4455`;
  writes the overlay spool `viewer/runtime/broadcast.json` (atomic tmp+rename with EPERM retry — it is the
  *second* writer alongside Phoenix's `OverlayPublisher`); enforces the claim fence on on-air text; runs the
  5-stage BROADCAST TEST; **GO LIVE / OFF AIR require literal `CONFIRM`** (the human gate G-PA).
- **Camera gateway:** `viewer\publisher.cjs` (HTTPS `:8443`, regs `:8095`) — one-URL source picker + WHIP
  reverse-proxy to MediaMTX (whitelists `cam1..cam10` only, never `uni/program`).
- **Tray:** `viewer\systray_watchdog.ps1` — traffic-light NotifyIcon + auto-restart of dead node services +
  OBS safe-mode-dialog dismisser.

### 6.3 Go live (human-gated, only with node2 up)

**Go-live is HUMAN-typed, always** (gate G-PA). No agent self-approves it, widens
`UNI_APPROVALS_AUTOAPPROVE`, or holds a stream key. **Stream keys live ONLY** in the operator shell env /
`/etc/uni/runtime.env` on node2 — never git, never held by an agent. Sequence: PRIVATE unlisted smoke test
(operator-held key) first → confirm the 3-signal LIVE gate (§4.2) with node2 up → human types `CONFIRM`.

### 6.4 Node mutations (fleet)

Every mutating `os_*` / `podman_*` / `lab_*` call through the uni-lab MCP pauses for **exactly ONE** human
approve/deny in the fleet approval queue; reads run at once. `limb=<id>` drives a peer over the mesh
(cross-box mutation gates once on the router box).

### 6.5 Shipping `production/`

Ship via **`git archive` of an immutable, pushed, tagged ref** — never the working tree. `.gitattributes`
pins `production/** eol=lf` so the CRLF-corruption class is structurally dead. Commit + push + tag, ship from
the tag's index bytes, sha-verify on the node.

---

## 7. WHERE TO FIND WHAT (file map, all under repo root `C:\Users\mpolz\Documents\Strings`)

**Orientation / rules**
- `CLAUDE.md` — the binding standing context (read after this).
- `docs/UNIVERSE.md` — this doc.
- `docs/SYSTEM_OVERVIEW.md` — whole-system orientation.
- `docs/STUDIO_SYSTEMS.md` — canonical studio map (overrides older studio docs).
- `docs/UNI_OS_COLONY_MIGRATION.md` — canonical **colony-placement** reference (colony on UNI-LAB, captured over
  LAN). One caveat: read "rootless under `uni`" where it says "rootful".
- `docs/LAB_PROTOCOL.md` — the RED protocol + claim fence.
- `docs/UNI_MISSION_DEEPENING.md` — mission + signed UNI-GPT consults + verdicts.

**FE engine (the science)**
- `lib/sp/brain/{math,model,infer,efe,plan,learn,novelty,designer,genome,homeostat,metabolism,mc_codec,colony,director,bridge}.ex`
- `lib/sp/runtime/{supervisor,lineage,agent,board,on_chip}.ex`
- `lib/sp/show.ex` (health verdict `:83-89`), `lib/sp/producer.ex`.

**Invariant guards (tests)**
- `test/sp/brain/{decider_byte_identity,action_clone_invariance,novelty,honest_consummation,forage_discovery_gating}_test.exs`
- golden: `test/fixtures/decider_golden_seed7_d5b3.bin`.

**Gates**
- `viewer/verify_colony.cjs` (colony-count), `viewer/verify_overlays.cjs` (overlays, → `overlay_proof.png`),
  `production/verify_p1.sh` (platform — **stale vs corrected node2, §4.1**),
  `lib/sp/show.ex` + `lib/sp/brain/director.ex:67` (LIVE driver).

**Studio code**
- `viewer/studio_up.ps1` (bring-up; LAN-captures the chip colony by default since `cea1cd3` — `-HostColony` is a non-canonical legacy escape hatch, do not use it), `viewer/launcher.cjs` +
  `launcher.html` (`:8090`), `viewer/command_center.cjs` + `.html` (`:8098`), `viewer/publisher.cjs` +
  `pub.html`, `viewer/overlay_server.cjs`, `viewer/studio_stage.cjs`, `viewer/systray_watchdog.ps1`,
  `viewer/studio_channels.ps1`, `viewer/body.js` / `director.js` / `bot.js` (all `MC_HOST`-keyed).

**Colony deploy (the chip)**
- `deploy/uni-os/uni-colony.Dockerfile` (headless colony image), `ui/mix.exs` (path-deps the root SP app).

**RED launchers / probes / analyzers**
- `runs/*.exs` (lifecycle, gen-2/2.6/2.7/3, language/voice, RED lineages, probes),
  `runs/*.py` (analyzers), `runs/*.sh` (harnesses). Read each file's leading comment for its one-line purpose.

**Architecture ADRs**
- `production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md` (render→GPU box; correct on that,
  silent on colony placement), `ADR-PROD-012-encoder-placement-policy.md` (encoder never on the ERP surface),
  `ADR-PROD-001` / `ADR-PROD-003` (SUPERSEDED-IN-PART).

**Proof of record / receipts**
- `production/docs/DEPLOYED_STATE.md`, `production/docs/GAPS_REGISTER.md`,
  `docs/receipts/{forage_red_preregistration,forage_honest_consummation_RED,emergent_forage_cure1,...}.md`.
  Live RED evidence lives on the lab box at `~uni/.claude-evidence/forage_red/*` (outside this checkout).

**Cross-session memory**
- `C:\Users\mpolz\.claude\projects\C--Users-mpolz-Documents-Strings\memory\` (see `MEMORY.md` index;
  `ops_colony_lab_rootless.md` is load-bearing for the colony-on-the-chip fact).

**Persona team**
- `docs/lab_team/*` (auditable persona docs) + `~/.claude/skills/lab-team-*.md` (invokable skills);
  orchestrator: `/lab-team-review`.

---

## 8. THE ONE-PAGE CHECKLIST FOR A COLD START

1. **Read** this doc → `CLAUDE.md` → `docs/SYSTEM_OVERVIEW.md` → `docs/STUDIO_SYSTEMS.md` →
   `docs/LAB_PROTOCOL.md`.
2. **Establish which box you are touching:** colony/science on **UNI-LAB** (the chip) vs render/studio on
   **THINKER** vs relay on **node2**. State it before you act.
3. **Never claim from a process.** Run the gate (§4.1) or say **NOT VERIFIED.** A `colony_count:0` producer
   reporting LIVE is an **EMPTY** colony.
4. **One cure at a time.** If a RED is running, do not propose Phase N+1 until it has a recorded verdict
   (PASS / PARTIAL / FAIL / WITHHELD).
5. **For any FE-touching change:** `/lab-team-review` **before** writing code; no merge without a MERGED
   VERDICT + the three artifacts; re-green the byte-identity / clone-invariance / novelty-decay tests.
6. **Keep the fence:** behavioural gates demonstrate the named **behaviour**, never experience/awareness/life.
   Warranted claims and over-claims stay visibly separated. Viability must **emerge** from EFE — no gives, no
   hacks.
7. **Go-live is human-typed**, node2 up, 3-signal gate passed, private smoke first, keys never in git.
8. **The former divergence is closed:** `studio_up.ps1` LAN-captures the UNI-LAB colony by default since
   2026-07-12 (`cea1cd3`, ADR-PROD-013); it no longer hosts a local colony on THINKER unless the labeled
   non-canonical `-HostColony` escape hatch is explicitly passed — never do that for production bring-up.

---

*This document is descriptive of the system as it exists in the committed code + recorded receipts as of
2026-07-12. Every live-run verdict in §5 is as RECORDED in its receipt, not re-run here. Where the binding
architecture (§1) and a stale doc body disagree, §1 governs and the stale body is being scrubbed. Receipts beat
rhetoric.*
