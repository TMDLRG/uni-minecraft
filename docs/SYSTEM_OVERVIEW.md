# SYSTEM OVERVIEW — the master onboarding map (read this FIRST)

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](../production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](../production/docs/adr/ADR-PROD-012-encoder-placement-policy.md) + [STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) first.**
> Corrected machine table: **THINKER** (Windows 11, NVIDIA T1000, LAN 10.190.245.196, non-ERP) = render +
> mixer + operator studio — **PORTABLE (any GPU box, Mac/Win)**. **node2 `uni-lab-79740c`** (mesh 10.13.13.3)
> = fan-out relay ONLY (`uni-bcast-relay` → YT + Twitch). **L1 `uni-lab`** (mesh 10.13.13.1 / LAN
> 10.190.245.122) = ERP appliance (ZERO broadcast) **AND the rootless UNI-OS colony host**.
>
> **⚠️ SECOND CORRECTION (2026-07-12, owner-set): the COLONY (Minecraft world + Phoenix FEP brain + `body.js`
> bots) runs on UNI-LAB (`10.190.245.122`), ROOTLESS, "on the CHIP" — ALWAYS, NEVER on THINKER. THINKER
> CAPTURES it over the LAN.** Data flow: **UNI-LAB colony** → THINKER captures world-view (camera → lab
> `mc-server`) + overlays (`:4000/stream`) over LAN → THINKER OBS renders on T1000 → single H264/AAC RTMP →
> node2 `runOnReady` tee → YouTube + Twitch. Canonical: `CLAUDE.md`,
> [ADR-PROD-013](../production/docs/adr/ADR-PROD-013-colony-host-placement.md), `docs/UNIVERSE.md`. Any
> reference in this doc's older body to a "System 2 mixer" on node2/L1, "one true broadcast path", or "colony
> source on THINKER" is **STALE** — trust the banner + those.

**Status: MASTER ONBOARDING, 2026-07-11.** One doc so any agent entering this repo is
dangerous-competent in 5 minutes. It links out; it does not replace the canonical docs.
If this doc and a linked canonical doc disagree on a specific fact, the canonical doc wins
and you fix this one. Precedence for the *studio*: `docs/STUDIO_SYSTEMS.md` overrides all
older studio docs; for the *deployed platform*: `production/docs/DEPLOYED_STATE.md` + the
gate `production/verify_p1.sh` are the record of truth; for the *science*: `CLAUDE.md` +
`docs/LAB_PROTOCOL.md` are the fence.

> **The one-paragraph orientation.** This repo is two things fused: (1) a pure-Elixir
> categorical **active-inference colony** — literal digital-life research where UNIs are
> embodied Minecraft bots whose "life" is the predict-act tick; and (2) a **worldwide live
> broadcast platform** to put that science on the air (EducateWright + UNI feed, CNN/BBC/PBS
> quality, 7-day 4h×3/day, multilingual). There are **TWO studio systems** (never conflate
> them). **Nothing is broadcasting right now, and that is correct**: the colony source is
> intentionally DOWN for a generative-model rebuild, and the proven broadcast platform is
> idle with no program. Every claim in this project is gated — you may not claim "up",
> "live", "alive", or "proven" from process existence; you run the named gate or you say
> nothing.

---

## 0. Fast facts (memorize these five)

1. **Three roles (2026-07-12 corrected — the two lines below are the old framing, superseded by the top
   banner + ADR-PROD-013):** the **COLONY** (world + FEP brain + `body.js` bots) = `viewer/` + `lib/sp/` on
   **UNI-LAB (`10.190.245.122`), rootless, on the chip — ALWAYS.** The **STUDIO** = native OBS + `viewer/`
   console on **THINKER (portable, any GPU box)** which CAPTURES the colony over the LAN. **node2
   `uni-lab-79740c`** = fan-out **relay ONLY** (NOT a "broadcast path" — one container, `uni-bcast-relay`).
2. **The real production-MCP is `:8095`, not the designed `:8094`.** `:8094` is the
   `uni-glass-configure` service on that node and answers **404** — the impostor signature.
   The real MCP is token-gated and answers **401**. Healthy = 401; 404 = wrong service.
   (Several docs still say `:8094`; treat `:8095` as truth.)
3. **Current live status: colony source DOWN (deliberate), platform PROVEN-but-IDLE, G2
   HELD.** The relay honestly reports `ready:false` because there is no program yet.
4. **Go-live (`golive CONFIRM` / `start_broadcast`) is ALWAYS human-typed.** Stream keys live
   only in the operator shell env / `/etc/uni/runtime.env`, never in git, never held by an agent.
5. **The science fence is hard.** Pure-Elixir categorical active inference; NO
   Nx/Rust/NIF/GPU/backprop/RL/TD/reward. Default genome byte-identical. One cure at a time.
   Behavioural gates carry ZERO evidential weight for awareness/consciousness/life.

---

## 1. The mission — and what "tonight's worldwide release" means

**North star (`CLAUDE.md`):** literal digital life with measurable awareness and full human
ability within a real body/world. UNIs are embodied bots on a public-streamed Minecraft
server. We carry receipts because we are on a path that, if it keeps building, ends in a
public claim. **Receipts beat rhetoric.**

**The broadcast mission (`docs/UNI_PRODUCTION_PLATFORM.md`):** the **EducateWright** nonprofit
+ the **UNI** project need their science feed back on the air. The platform is a durable
**7-day-a-week, 4h × 3/day** live broadcast covering the mission (end school shootings, solve
trauma, align mental-health treatment to nature, world peace, global understanding, free
food/water/health, a path to the stars), reaching **all time zones**, **multilingual**, at
**CNN/BBC/PBS/Twitch** production quality, run by **one operator + guests + the UNI expert
(a Claude persona)** with an LLM/MCP production team underneath.

**"Tonight's worldwide release"** = the intended first public go-live of this durable SYSTEM
(not a one-off stream). **Reality check for any agent told "we go live tonight":** nothing is
actually broadcast-ready. The honest blockers are in §5/§7. The single biggest risk is a
**false or wrong-system go-live** — pushing System 1's deprecated dev restreamer to the public
instead of System 2. Do not go live on anyone's say-so; go-live is human-typed and gate-backed.

---

## 2. The two studio systems — full service/port maps

### The fleet (who the boxes are)

| Box | Address | Role | Never do |
|---|---|---|---|
| **THINKER** | GPU box (`10.190.245.196`; portable — any Mac/Win GPU) | **PORTABLE STUDIO ONLY**: native OBS render/mix/encode + `viewer/` console + camera that CAPTURES the UNI-LAB colony over the LAN. Hosts NO colony. | — |
| **UNI-LAB** | the CHIP = UNI-OS (`10.190.245.122`, rootless `uni`) | **THE COLONY, ALWAYS**: Minecraft world + Phoenix/SP.Producer FEP brain + `body.js` bots (`mc-server` + `uni-colony` containers). Also rootful ERP appliance (zero broadcast). | — |
| **uni-lab** | `10.190.245.122` | The **ERP appliance** (Dell PowerEdge): `/glass`, the uni-lab MCP, and the **protected business stack** (solutionwright-odoo ERP, Jitsi, cloudflared, portainer). Matrox G200 — no 3D/HW encode. | **Never** run the encoder here; never stress/mutate the business stack (ADR-PROD-003; Epistemic Charter). Read-only observation only. |
| **uni-lab-79740c** | mesh `10.13.13.3` | **System 2**: the deployed P1 broadcast node — the only non-ERP x86 UNI.OS box on the mesh. Shares the box with the `aion-*`/`orchestrate-api` workload. | Encode floor is 720p30 x264 `faster` until a GPU is confirmed (GAP G-ENC). |
| **uni-tab-arm-1** | mesh peer (ARM) | Fleet member on the WireGuard mesh; reachable via the uni-lab MCP `limb=uni-tab-arm-1`. Not a broadcast node. | — |

Every box runs the **same uni-lab MCP** and exposes the whole-fleet surface. Drive any peer by
adding `limb=<id>` to any MCP tool; `limbs_list()` enumerates the fleet. Reads run at once;
mutations pause for **one human approval** in the shared approval queue.

### System 1 — `viewer/` (what `viewer\studio_up.ps1` starts, in order)

| Service | What | Port |
|---|---|---|
| Minecraft `paper.jar` | the world | `:25565` (RCON `:25575`) |
| Phoenix `--sname uni` (`UNI_AUTOSTART=1`) | supervised SP.Show: Colony→Director→Producer→OverlayPublisher + `/stream` | `:4000` |
| `director.js` (child of the beam — NEVER standalone) | colony cam, raw 3D world feed | `:3020` |
| OBS (profile UNI) | dev vision mixer / compositor | ws `:4455` |
| `overlay_server.cjs` | serves overlay HTML pages + `state.json` | `:8099` |
| MediaMTX | local restream ingest | rtmp `:1935`, api `:9997` |
| `studio_stage.cjs` | **builds the OBS scenes + puts overlays INTO OBS** | one-shot |
| `command_center.cjs` | operator console | `:8098` (air-status `:8097`) |
| `publisher.cjs` | remote-source gateway (guest cams via WHIP) | `:8443` |
| `systray_watchdog.ps1` | restarts dead node services | — |

**Role now (2026-07-12 corrected — see top banner + ADR-PROD-013):** THINKER is the **PORTABLE STUDIO** —
native OBS render/mix/encode + `viewer/` console + a camera that **captures the UNI-LAB colony** (Minecraft +
Phoenix show + `:3020` cam + `:4000/stream`) over the LAN. The colony itself runs on **UNI-LAB, rootless, on the
chip — never here**. (The old text below said "colony SOURCE only … Windows OBS deprecated"; that framing is
superseded.) The
`command_center` GO LIVE button and its `?` quick-guide drive the *local* restreamer
(`rtmp://127.0.0.1:1935` → YouTube/Twitch) — that is a **dev/rehearsal path, not the worldwide
go-live**. Do not push it to the public.

### System 2 — `production/` (the fixed contract; deployed on uni-lab-79740c)

| # | Unit | Kind | Deployed port(s) | Role |
|---|---|---|---|---|
| 1 | `uni-bcast-mixer` | quadlet | obs-websocket `:4455` (426 = alive) | Headless OBS vision mixer + encoder. **No scenes yet (G2).** |
| 2 | `uni-bcast-relay` | quadlet | RTMP `:1935`, SRT `:8890`, API `:9997` | MediaMTX restreamer; copy-fan-out to YouTube/Twitch/… `uni/program` path configured; **`ready:false`** (no program yet — correct). |
| 3 | `uni-bcast-overlays` | quadlet | caddy `:8099` (loopback) | Serves transparent 2D-canvas overlay pages + `state.json`. |
| 4 | `uni-bcast-livekit` | quadlet | `:7880/7881`, `50000-50200/udp` | WebRTC SFU for guests. **NOT deployed.** |
| 5 | `uni-bcast-captions` | quadlet | `:8501` | faster-whisper live captions. **NOT deployed** (image unbuilt). |
| 6 | `uni-production-mcp` | host svc | **`:8095`** (loopback; nginx `/prod-mcp` designed) | The production MCP (FastMCP). **Deployed + running; 401 token-gated.** (Design said `:8094`; moved to `:8095` — `:8094` is `uni-glass-configure`, answers 404.) |
| 7 | `uni-producer` | host svc | — | Show-runner (run-of-show clock + beats). **NEVER AUTHORED** (`production/producer/run.py` does not exist — design-only gap). |
| 8 | `uni-playout` | host svc | — | Scheduler/playout over `catalog.json`. **NEVER AUTHORED** (`production/playout/run.py` does not exist). |

Data flow: **SOURCES** (colony cam `:3020` + `/glass` + overlay pages `:8099` + guest stage +
operator cam + clips) → **uni-bcast-mixer** (set-once OBS, scenes + audio mix, one program out)
→ SRT → **uni-bcast-relay** (copy-fan-out) → **YouTube / Twitch / others**. The **uni-producer**
cues the mixer via **uni-production-mcp**, which the operator drives by voice/text.

---

## 3. The science — active inference, in plain terms

**What the model is.** Each UNI is a mean-field categorical active-inference agent. Its
generative model is per-factor: **A** (likelihood), **B** (transition-per-action), **C**
(preferences), **D** (prior), **E** (habit prior). Belief update: `q(s) = softmax(prior +
Σγ_m·lnA)`. It chooses actions by **Expected Free Energy** = epistemic `H(qo) − E[H(o|s)]`
(information gain) + pragmatic `qo·C` (preference satisfaction). Learning is Hebbian Dirichlet
count-updating. The live decider is `SP.Brain.Plan` (a depth-5 beam planner); `efe.ex` mirrors it.

**The hard invariants — the math fence (`CLAUDE.md` §Hard invariants; never violate):**
1. **NO** Nx, Rust, NIF, GPU, backprop, RL, TD, or reward-on-policy. Categorical per-factor only.
2. **Additive + gated.** Every extension sits behind an opt-in genome organ absent from
   `default/0`; graded-on coupling defaults to 0.0; the **default genome is byte-identical**
   (mad < 1e-12 over the live depth-5 `Plan` path).
3. **No scalar-per-action term** in policy logits — guarded by the **action-clone-invariance
   test** (clone two idle actions with identical A/B/C/D/E → identical logits, even if you set
   one action's cost to 999; only changing a factor's `B` may move that factor's `qo·C` term).
4. **Monotonic decay** of any information term: `W → 0` as Dirichlet counts → ∞, independent of
   C. This is the no-smuggled-reward proof.

**The deepened architecture (roadmap, `docs/UNI_MISSION_DEEPENING.md`), each phase gated:**
cortex/lateralisation (`:hemispheres`), motor spine (`:spine`), interoceptive organs +
emptying-B (`:metabolism`), glands/cycles (`:endocrine`), novelty drive (`:curiosity`,
`novelty_gain` default 0.0). Status: P0 diagnosis DONE (`epistemic_starvation`), P1 novelty
LIVE-RED **PARTIAL** (hoard suppressed ~4.5×, but plateau-break FAILED — the plateau is
multi-causal; a non-saturable interoceptive drive is the load-bearing missing piece).

**The lab protocol (`docs/LAB_PROTOCOL.md`) — evidence discipline:**
- **First rule:** never stack changes you can't attribute. **One cure at a time** — a second
  cure does not deploy until the prior has a recorded verdict (PASS/PARTIAL/FAIL/WITHHELD).
- **Pre-registered RED gates** (PASS condition + FALSIFIES condition) written *before* the run.
- **Continuous, harness-managed** evidence (survives context compaction), never inside the LLM.
- **Independent confirmation:** behaviour via RCON (the server's authoritative view), mechanism
  via brain probes against the live registry.
- **MERGED VERDICT** from `/lab-team-review` (5 adversarial personas) before any FE-touching
  merge or live RED deploy — SIGN or SIGN-WITH-CHANGES + typed spec + paired RED + checklist.

**The claim fence (binding, `CLAUDE.md` + `LAB_PROTOCOL.md` §VI):** operational
behavioural/organisational measures are **necessary-not-sufficient** substrates with **ZERO
evidential weight** for awareness/consciousness/life on their own. Passing a gate demonstrates
the named behaviour, **never experience**. Do not surface gland/precision floats as "felt".

**The food-hack lesson (why the colony is down right now).** An earlier "stable colony" was
propped up by an RCON **food-give** (1300+ hoarded items per UNI) — judged **fake life**, not
survival. The survival claim was withdrawn. The current work rebuilds the generative model so
foraging **emerges** from an interoceptive hyperprior via EFE — world-earned food, no goal-coding,
no gives. (Caveat: RCON gives still exist in some `runs/*.exs` gate scripts; the reversal is
partially recorded. Do not treat a give-fed colony as alive.)

---

## 4. The claim-rule / gate regime — and the EXACT command for each gate

**The rule:** no claim from process existence. Every user-facing claim is backed by a
machine-runnable gate. If you didn't run the gate, you don't make the claim.

| Claim | Binding rule | EXACT command |
|---|---|---|
| **"overlays up"** (System 1) | `verify_overlays.cjs` exit 0 + the screenshot. Never from "overlay_server started". | `node C:\Users\mpolz\Documents\Strings\viewer\verify_overlays.cjs` (writes `viewer/overlay_proof.png`; connects to OBS `:4455`, checks all four `ovl_*` browser-sources ENABLED in the program scene, pointed at `:8099`, with `:8099/state.json` serving) |
| **"platform up"** (System 2) | `verify_p1.sh` ALL PASS. Never from `podman ps`. | On the node: `podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh` |
| **platform liveness companion** | authoritative MCP liveness is systemd, not a port probe | `systemctl is-active uni-production-mcp` (must print `active`); `podman ps --filter name=uni-bcast --format '{{.Names}} :: {{.Status}}'` (3 Up) |
| **colony size** | `/producer/health .colony_count` **==** RCON `list` players **minus** Director. A mismatch = orphan bots or a Board-publish gap. | Probe `http://<colony>:4000/producer/health` and RCON `list`; subtract 1 for the Director. **(No committed executable joins these yet — this is the least-gated science-load-bearing claim; author `viewer/verify_colony.cjs` before claiming a size.)** |
| **"LIVE"** | fresh `/producer/health` probe YOU ran: `verdict=LIVE, driver=producer` + colony rule passing | `curl http://<colony>:4000/producer/health` **(caveat: `verdict=LIVE` today is PID-existence only and can't yet detect a `:self` puppet-cam — treat as weak until the Director's real driver field is read)** |
| **public go-live** | `golive CONFIRM` / `start_broadcast` is **HUMAN-typed, always** (G-PA). Keys in operator shell env only. | (human types it) — `start_broadcast(target)` is human-gated + 2-step confirm on the production MCP |

**What `verify_p1.sh` actually checks** (6 checks): (1) overlays `:8099` serves `state.json`;
(2) overlays serves `onair.html`; (3) relay `:9997` API answers + `uni/program` configured;
(4) mixer `:4455` obs-websocket answers **426 Upgrade Required** = OBS alive; (5)
production-MCP `:8095` answers **401** on **both** of two probes 6s apart (double-probe defeats
a crash-loop that binds the port for a moment; **404 = the glass-configure impostor, REJECTED**);
(6) prints deployed-file sha256s. **Caveat:** check #6 only *prints* hashes and fails on a
*missing* file — it does not compare to expected constants, so silent drift still passes. The
`DEPLOYED_STATE.md` sha table is the human-eyeball reference.

---

## 5. Current status + who owns which lane

**As of 2026-07-11:**
- **Colony SOURCE (System 1): intentionally DOWN.** The other agent removed the food-hack and
  is rebuilding the generative model so foraging emerges via EFE (interoceptive hyperprior, no
  gives). Do not "restart the colony" to make it look alive.
- **Broadcast platform (System 2): PROVEN + IDLE.** P1 core deployed on uni-lab-79740c: overlays
  (caddy `:8099`), relay (mediamtx `:1935/:8890/:9997`), mixer (headless OBS `:4455`),
  production-MCP (`:8095`, 401). `verify_p1.sh` was ALL PASS at 21:27Z. Relay `ready:false` is
  the honest state with no program. Quadlets are systemd-supervised, auto-start at boot.
- **G2 is HELD:** pointing the mixer at the colony source (building the OBS scenes) waits until
  the colony genuinely SURVIVES its pre-registered survival gate. No scenes = no program.

**Lanes:**
- **The science / colony rebuild lane** — the other agent owns the generative-model rebuild
  (foraging emerges via EFE) and the colony survival gate. Do not touch FE-code without a
  `/lab-team-review` MERGED VERDICT. Honor "one cure at a time" — do not start Phase N+1 while a
  RED is in flight.
- **The platform lane** — keep System 2 proven + idle; do not build G2 scenes / point the mixer
  at the source until the colony survives. Deployment mutations go through the uni-lab MCP with
  human approval.
- **The human operator** — owns every outward-facing act: `start_broadcast` / `stop_broadcast` /
  `admit_guest` / `schedule`, and holds the stream keys. Agents propose; the human co-signs.

**"Proven" is a timestamp, not a live property.** P1 rests on one 21:27Z gate run that can't be
re-derived from a fresh checkout and isn't continuously enforced. Re-run `verify_p1.sh` before
trusting it; there is no heartbeat/alerting on the idle node.

---

## 6. The go-live path, end to end

The worldwide public path runs on **System 2**. Sequence:

1. **Colony survives its gate.** The rebuilt generative model must PASS a pre-registered colony
   survival RED gate (world-earned food, no gives) — with a MERGED VERDICT. Until then, G2 is HELD.
2. **G2 — build the mixer scenes.** On uni-bcast-mixer, build the OBS scenes (COLONY / GLASS /
   GUESTS / CLIP / NEWSDESK / TITLE / STANDBY / PIP), wire the overlay browser-sources
   (`ovl_lower3rd/ticker/caption/onair` → `:8099`), and add the **colony source over the LAN**
   from THINKER. System 2 currently has **no overlays-on-program gate** — add a
   `verify_overlays`-style obs-websocket scene-item check against the mixer `:4455` before claiming.
3. **Phase H — expose the control plane.** nginx `/prod-mcp` → `127.0.0.1:8095` (NOT `:8094`) +
   nftables guest ports. (Not deployed yet.)
4. **Phase I — PRIVATE smoke test.** Operator wires a real `YT_KEY` into `/etc/uni/runtime.env`
   (never git), runs a private stream, confirms program + overlays + audio + fan-out. Digest-pin
   the images.
5. **Human go-live.** The operator TYPES `start_broadcast(target)` (human-gated + 2-step
   dry-run→confirm). Stream keys stay in the operator shell env / `/etc/uni/runtime.env`. An
   agent **never** holds the token and **cannot** self-approve (G-PA).

**No reachable in-app go-live UI exists yet for the worldwide path** — `production/control/
control.html` is non-functional (program-preview iframe empty, `MCP_BASE` a TODO, the Phoenix
`/control` route doesn't exist, nginx `/prod-mcp` not deployed). The only working console is
System 1's command center, which drives the **deprecated dev restreamer** — do not use it for
the worldwide go-live. Tonight's go-live, if it happens, is operator-shell/MCP-driven.

---

## 7. Honest gaps (do not paper over these)

- **Producer & playout never authored.** `production/producer/run.py` and
  `production/playout/run.py` do not exist — the show-runner and scheduler are design-only. P1
  smoke needs only the MCP, but there is no automated run-of-show.
- **Captions / LiveKit / nginx not deployed.** `uni-bcast-captions` (image unbuilt) and
  `uni-bcast-livekit` are not deployed; guest join/stage pages connect to nothing and load
  livekit-client from a public CDN with **no SRI hash** (supply-chain risk). nginx `/prod-mcp` +
  nftables guest ports are pending (Phase H). The "multilingual" promise has **no working caption
  pipeline**, and the language set is contradictory across surfaces (5 vs 6, different sets) — no
  canonical list yet.
- **G-ENC** (`pending_hardware`): no proven hardware encode. uni-lab-79740c shares the box with
  aion/orchestrate; encode floor is **720p30 x264 `faster`** until a GPU is confirmed. No 7-day
  soak test exists — memory-leak / reconnect / token-refresh stability over days is unknown.
- **G-PA** (`pending_external`, Class-Sec, UNPROVEN): the producer agent's inability to
  self-approve `start_broadcast` / widen its own `UNI_APPROVALS_AUTOAPPROVE` allowlist has code
  but **no logged red-team artifact**. Do not permit any outward go-live path until a captured,
  audited refusal run exists.
- **G-MUSIC** / **G-YTLIB**: no license-clean music bed exists; `catalog.json` does not exist
  (built by `production/catalog/build-catalog.mjs` from the FINAL pool) — so STANDBY has nothing
  to loop if the source drops.
- **The `runtime.env` autoapprove caveat.** During P1 deploy, `/etc/uni/runtime.env` was
  accidentally overwritten and restored from a Jul-3 backup; a Jul-3 `UNI_APPROVALS_AUTOAPPROVE`
  line was **not recoverable**. If approvals start prompting after the node's next
  restart/reboot, the operator re-adds it. Keys go in this file at go-live, never in git.
- **No rollback/DR, no emergency-stop procedure, no moderation/broadcast-delay path.** System 2
  is a **single node** (SPOF) for a 7-day broadcast with no documented redeploy-from-scratch,
  volume backup, or failover. `stop_broadcast` exists as an MCP verb but has no operator runbook.
- **Doc drift on the `:8094`/`:8095` port.** The canonical `STUDIO_SYSTEMS.md` still prints
  `:8094` (lines 36, 60), `DEPLOYED_STATE.md` line 49 still says `:8094`, and
  `UNI_PRODUCTION_PLATFORM.md` / `server.py:63` default / control+guest design docs too. **Truth
  is `:8095`.** An agent trusting the stale port probes the 404 impostor and false-passes.
- **Ship hygiene.** Working tree is typically dirty (`ui/runs/producer_reader.bin` is a tracked
  regenerable artifact) and HEAD may be ahead of origin — re-verify the exact commit; ship via
  `git archive` from a pushed, tagged ref, not the working tree. `.gitignore /runs/` shadows 34
  tracked gate scripts (a new gate can be silently un-added — use `git add -f` or move gates to a
  tracked dir). `.gitattributes` has no binary guard — the first logo/font/gz under `production/**`
  will be EOL-corrupted; add `*.png binary` etc. first.

---

## 8. File map — where to find what

**Orientation / canonical:**
- `CLAUDE.md` — standing project context + the hard math invariants + the lab-team ship gate. **Read first.**
- `docs/STUDIO_SYSTEMS.md` — CANONICAL studio map; overrides all older studio docs. Binding CLAIM RULES at the bottom.
- `production/docs/DEPLOYED_STATE.md` — the durable, sha-locked record of what runs on uni-lab-79740c.
- `docs/SYSTEM_OVERVIEW.md` — this doc (the onboarding map).
- `docs/GAIA.md` — **Gaia**: a live, READ-ONLY, signal-only mirror of the whole system (colony + studio +
  gate ledger + itself), running on THINKER (`:8096/gaia` + an MCP). GAIA LAW: every output is a direct
  signal with full provenance (locator/timestamp/hash) — never a summary, score, or verdict. Read this for
  detail before treating anything Gaia shows as more than a mirror.

**Science / lab:**
- `docs/LAB_PROTOCOL.md` — evidence discipline, RED gates, the claim fence.
- `docs/UNI_MISSION_DEEPENING.md` — mission + the deepened architecture + roadmap + UNI-GPT rulings + execution status.
- `docs/lab_team/` + `~/.claude/skills/lab-team-*.md` — the 5 adversarial review personas; `/lab-team-review` is the orchestrator.
- `lib/sp/brain/{plan,efe,novelty,diagnose,motor_control,motor,slow_context,hierarchy2}.ex` — the engine.
- `runs/*.exs` — launchers + RED-gate scripts + probes (note: `/runs/` is gitignored; source scripts are force-added).
- `docs/DEEPENING_PLAN.md` — in-repo execution plan with CURRENT STATUS.

**Broadcast platform (design + deploy):**
- `docs/UNI_PRODUCTION_PLATFORM.md` — master platform design: container/port map, MCP tool surface, `broadcast.json` overlay contract, the 7 tech-decision ADRs, GAPS.
- `production/docs/adr/ADR-PROD-001..010` — the fixed architecture decisions.
- `production/docs/{P1-BRINGUP,DEPLOY,GAPS_REGISTER}.md` — bring-up steps, deploy notes, gap register.
- `production/verify_p1.sh` — the P1 PROOF GATE (run it; don't trust `podman ps`).
- `production/mcp/server.py` — the production MCP (FastMCP, gated tools). Note `:8094` default is stale → deployed `:8095`.
- `production/{overlays,schemas,run-of-show,guest,control,catalog}/` — overlay pages, `broadcast.schema.json`, run-of-show templates, guest LiveKit app, `/control` design, catalog builder.

**Studio System 1 (`viewer/`):**
- `viewer/studio_up.ps1` — the bring-up launcher (starts the window fleet + runs the overlay proof gate).
- `viewer/verify_overlays.cjs` — the OVERLAY PROOF GATE (run before any go-live).
- `viewer/{studio,command_center,overlay_server,publisher,director}.*` — the source-side services.
- `docs/STUDIO_OPERATOR_MANUAL.md`, `docs/RUNBOOK_STUDIO.md` — System-1 operator docs (§"Going live" is DEV-preview only; the worldwide go-live is System 2).

**Fleet / ops:**
- The **uni-lab MCP** — drive the whole fleet (systemd, journald, files, Podman, live-kernel, the lab). `uni_help()` / `uni://guide` for the manual. Add `limb=<id>` to hit a peer; `limbs_list()` enumerates.
- `memory/ops_colony_lab_rootless.md` — the rootless colony-lab ops notes.

---

## 9. The 60-second "don't get burned" checklist

1. **Two systems.** System 1 = source (THINKER). System 2 = broadcast (uni-lab-79740c). Never conflate.
2. **MCP is `:8095`.** `:8094` = impostor (404). Healthy = 401.
3. **Nothing is live, and that's correct.** Colony down for rebuild; platform idle; G2 held.
4. **Never claim from process existence.** Run `verify_overlays.cjs` / `verify_p1.sh`. Re-run — "proven" is a timestamp.
5. **Go-live is human-typed.** Agents propose; humans co-sign; keys never in git, never held by an agent.
6. **Don't touch FE-code** without a `/lab-team-review` MERGED VERDICT. One cure at a time.
7. **The command-center GO LIVE is the DEPRECATED dev path.** The worldwide go-live is System 2, and it has no working UI yet.
8. **Behavioural gates ≠ life.** The claim fence gives operational measures ZERO evidential weight for experience.
