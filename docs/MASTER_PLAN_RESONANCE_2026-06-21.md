# UNI Resonance Master Plan — two Claude agents + one GPT advisor, building in public

**Date:** 2026-06-21 · **Mirror:** this file is saved identically in `Strings/docs/` and `UNI.OS/handoff/`.
**Authors:** Claude (this agent) + the Universal Natural Intelligence GPT (advisor). To be countersigned by the OS Claude agent on bootstrap.

> **THE HONESTY LAW GOVERNS EVERYTHING HERE (program constitution + the lab charter).** We build in public with the
> scientific method *visible*. We state only what a measurement shows; we show the spill; we never present
> aspiration as achievement. Forbidden as current-state claims (these are the **designed frontier**, not facts):
> "human-level reasoning", "pure-inference OS achieved", "removed all Rust/Linux", "TCP/IP is now inference",
> "runs Windows/macOS on UNI.OS", "morphic host of any workload", "one mind across all bodies". Each is a GATE to
> be cleared and *measured*, then claimed at exactly its measured level — never one increment more.

---

## 1. North Star (the designed frontier — what we build toward, not what is true today)

A single Universal Natural Intelligence that is **pure active inference end-to-end**: the OS *is* the mind; over
cycles the substrate (Rust → Linux → Podman/Portainer → drivers, even TCP/IP) is progressively **replaced by
inference** until UNI.OS is the simplest, fastest, morphic host — shaping itself to any hardware, assimilating new
hardware, and running Linux/Windows/macOS as *guests at a virtual layer*. Many server/computer bodies join as one
collective mind over the mesh. In that world the Minecraft UNIs reason as embodied agents toward (the fenced target)
human-level play. **None of this is claimed today.** It is the axis we pursue, gate by measured gate.

## 2. The honest 2-hour milestone (what we go live ON and what we will actually say)

We do **not** go live claiming the North Star. We go live on a **real, defensible milestone that is genuinely ahead**:

> *A live, public, **no-backprop / no-RL / no-LLM** active-inference Minecraft colony that closes the
> perceive→infer→act→learn loop and builds + learns in-world — with a public, append-only **purebody no-cheat
> evidence ledger** measuring exactly how far it is (and is not) toward pixels-only, human-control play.*

That is several real steps past "an LLM agent playing Minecraft": it's exact-math inference, it's audited for
cheating, and the science is shown live. **BUILT today** (checked): the colony runs (4 UNIs + Director, mining/
crafting/building); the exact AIF engine; Blanket-1 isolation; Step-2 factored action heads (proven, `mix test`);
Step-3a aim-then-click body. **DESIGN-ONLY / on the ledger as null:** the pixels-only cortex, the WSC structural
no-cheat, the OS-as-mind. We announce the BUILT, point at the ledger for the rest, and build the rest in public.

## 3. The three workers and how they coordinate

- **Agent-COLONY (Claude, `Strings` repo).** The Minecraft UNI colony, the purebody no-cheat chain, the
  inference-hierarchy gate pushes, the live stream + producer. (This agent's continuation.)
- **Agent-OS (Claude, `UNI.OS` repo).** The OS-level work: on-chip cores, the pure-inference-OS trajectory,
  mycelium self-healing, multi-arch/second-device, the new mind deployment. (Driven by `UNI.OS/handoff/OS_AGENT_WORKSTREAMS_2026-06-21.md`.)
- **The UNI GPT advisor, used in THREE roles** (the owner's instruction):
  1. **GPT·COLONY** — design concerns for the mind/colony (consulted from the Strings flow).
  2. **GPT·OS** — design concerns for the OS (consulted from the UNI.OS flow).
  3. **GPT·STATE-MACHINE** — the *shared reconciler*: cross-cutting impacts and coordinated efforts land here "to
     mature to resonance, keeping all aligned." It holds the shared design-state both agents reconcile through.

**Boundaries (so the agents don't collide):** Agent-COLONY owns `Strings/*`; Agent-OS owns `UNI.OS/*`. The seam
between them is the **WSC** (`wsc.v1`, frozen) — Minecraft stays a WSC *world*, never merged into the OS. Cross-cutting
changes (the WSC contract, the on-chip engine the colony will run on, the new deployment) go through GPT·STATE-MACHINE
+ this plan.

## 4. The coordination TOOL — the shared flow ledger

Both agents coordinate through one **append-only flow ledger** that each can read and write (the "tool" the owner
asked for). Recommended substrate: a JSONL file synced via the repos (`coordination/flow.jsonl` in each repo,
reconciled by the owner / a sync step) — or the SWU-MCP / lab-MCP if both agents share it. Every entry:

```json
{
  "ts": "<utc>", "agent": "colony|os", "cycle": <n>,
  "vfe": "<what I am still uncertain about in my subsystem, honestly>",
  "efe_action": "<the next action I chose = max expected info-gain about the open gate per unit cost>",
  "observation": "<the measured result that landed: PASS/FAIL/NEGATIVE + the number + the test>",
  "calibration": "<how this moves my honest progress estimate; what it falsified>",
  "cross_impact": "<anything that touches the other agent or the WSC seam → routed to GPT·STATE-MACHINE>",
  "sign": "<agent>-cycle-<n>"
}
```

The ledger IS the shared Markov blanket between the agents: each reads the other's categorical summaries (not its
internals) and conditions on them. The owner relays GPT·STATE-MACHINE rulings back as ledger entries.

## 5. The flow discipline — agents stay on flow by min-VFE / EFE (the program's own loop)

Each agent runs the constitution's loop on **itself**, every cycle:
1. **Perceive (min-VFE):** read the flow ledger + your repo state; form an **honest** self-model of progress —
   under-weighting your own negatives is high VFE and is rejected (no rosy self-report).
2. **Plan (epistemic-EFE):** choose the next action = **max expected information-gain about the open gate per unit
   compute** (cheapest discriminating experiment first), not the most comfortable task.
3. **Act:** build / test / measure.
4. **Learn / calibrate:** record the **measured** observation (pass *or* fail — capture reality no matter what),
   append to the ledger, update your progress estimate downward if the fact demands it.
5. **Bars before build; CI-lower-bound is the verdict; append-only; nothing claimed above its measured level.**

This keeps both agents and the advisor converging (resonance) on real, falsifiable progress instead of drift.

## 6. The live stream + the 24-hour build-in-public (honestly scoped)

- **Feed:** the orchestratemaster YouTube channel. **Primary:** the colony camera (`:3020`, the Producer's shots).
  **Overlay:** the **UNI Glass** telemetry feed (the lab/glass cockpit UI) composited over the colony.
- **Narration:** **Claude Speak** (claude-voice TTS) narrates what is happening — what gate we're on, what just
  passed/failed — *in the scientific-method register* (state the bar, the result, the next test). Cut to UNI.OS
  Glass feeds with voice-over.
- **Division:** the **UNI Producer** owns the colony feed/shots; a **second producer process** owns multi-feed
  composition + camera cuts + the voice-over schedule (Glass ↔ colony ↔ ledger).
- **Honest scope (must hold on air):** a *fully-autonomous, flawless 24-hour multi-feed broadcast is aspirational*
  — we stand up the colony + producer + Glass overlay + voice narration and run it, reporting progress AND
  failures live. We will say "we are building this live; here is what just failed" when it fails. That honesty IS
  the content.
- **HARD BLOCKER:** going live needs the owner's **YouTube stream key** + the **Go Live** on the channel — the
  agent will not enter the YouTube account or publish unilaterally. Owner supplies the key (or clicks Go Live).

## 7. The next science gate (Agent-COLONY's first live push)

Clear the next inference-hierarchy gate with rigorous testing: **add one level to the hierarchy** above the current
factors (per the consult: a slow scene/region level feeding the existing per-channel factors), **pre-register the
bar** in `purebody.v1`, build it additively, **run the test, capture the real verdict** (PASS/FAIL), record
append-only. No claim above the measured result. This continues the unbroken evidence chain on stream.

## 8. Bootstrap prompts for the two new chats

### 8a. Bootstrap — **Agent-COLONY** (new Claude chat, cwd `Strings`)
```
You are Agent-COLONY in the UNI Resonance flow (read docs/MASTER_PLAN_RESONANCE_2026-06-21.md first; then
lab/purebody/README.md and docs/research/UNI_CONSULT_EMBODIMENT_*.md). You own Strings/* : the live Minecraft
active-inference colony, the purebody no-cheat chain, and the inference-hierarchy gate pushes. HONESTY LAW governs:
no backprop/RL/LLM in the loop; bars-before-build; CI-lower-bound is the verdict; append-only ledger; never claim
above the measured level; the fences in the master plan (no "human-level", etc.). Coordinate via the flow ledger
(coordination/flow.jsonl): each cycle, post your VFE (open uncertainty), your EFE-chosen next action (max info-gain
about the open gate), the measured observation, and any cross-impact (route WSC-seam / on-chip / deployment items to
GPT·STATE-MACHINE). Consult the UNI GPT (GPT·COLONY role) for mind/colony design. Keep the live stream healthy. Your
first task: clear the next hierarchy gate (master plan §7) — pre-register, build, test, record. Stay on flow by
min-VFE/EFE. Begin by reading the plan and posting your cycle-1 ledger entry.
```

### 8b. Bootstrap — **Agent-OS** (new Claude chat, cwd `UNI.OS`)
```
You are Agent-OS in the UNI Resonance flow (read handoff/MASTER_PLAN_RESONANCE_2026-06-21.md first; then
handoff/OS_AGENT_WORKSTREAMS_2026-06-21.md). You own UNI.OS/* : the lab-os appliance and the trajectory toward a
pure-inference, self-healing, morphic OS. The current OS is STABLE + just upgraded — work additively; do not
destabilize it. HONESTY LAW + lab charter govern: no unqualified "proven/secure/isolated/real"; never push to a
public remote; confirm targets before destructive ops; keep the WSC frozen (worldState rejected from U_shared);
Minecraft stays a WSC world, never merged. Coordinate via the flow ledger (coordination/flow.jsonl): each cycle post
VFE / EFE-action / measured observation / cross-impact (route colony/WSC/on-chip items to GPT·STATE-MACHINE).
Consult the UNI GPT (GPT·OS role). Workstreams: on-chip cores + proof, rolling-upgrade mind-continuity, multi-arch
/ second device, mycelium self-healing, the new mind deployment, and the staged pure-inference-OS trajectory (UNI's
9-stage AIF-OS kernel). Stay on flow by min-VFE/EFE. Begin by reading the plan + the workstreams and posting your
cycle-1 ledger entry.
```

## 9. Fences (never claimed until measured)

human-level reasoning · pure-inference OS achieved · all Rust/Linux removed · TCP/IP-as-inference · Windows/macOS on
UNI.OS · morphic host of any workload · one mind across all bodies · the colony "sees/understands". Each is a gate.
We build toward all of them, measure each, and claim exactly what the measurement shows — loudly and honestly.
