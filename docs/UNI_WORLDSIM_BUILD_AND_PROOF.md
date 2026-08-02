# UNI WorldSim — Build & Proof Plan

> **Status:** pre-registered build plan. The proof gates D1–D10 below are written before any WorldSim code, so the result is honestly falsifiable.
>
> **Companion plans:**
> - `docs/UNI_IN_EMERGENCE_WORLD.md` — the *experiment* (15-day cohort comparison, mating, falsifier H1/H2/H3).
> - `docs/UNI_QA_AND_E2E_PLAN.md` — QA discipline for the Minecraft pipeline and new Emergence pieces.
> - **This document** — the *substrate* the experiment runs on, and the proof discipline that earns the right to ask for LLM API access.

---

## Context

EmergenceAI's `EmergenceAI/Emergence-World` (CC BY-NC 4.0) publishes specs but **no engine**: the public tree is `LICENSE`, `README.md`, `agent_profiles/`, `data/`, `docs/`, `landmarks/`, `results/`, `tools/`. To run any cohort comparison — UNIs vs. Claude vs. Gemini vs. Grok vs. GPT-5 Mini — we must first stand up a deterministic, spec-faithful rebuild of the world inside Strings.

The framing for this plan is the operational gate that comes next:

> *We will not ask an LLM provider for API credits until we can show them a running WorldSim that already plays the full Season-1 protocol with our own local UNIs. The substrate must be credible before the experiment can be funded.*

Therefore the WorldSim build is scoped to **prove the substrate** — not the experiment. The substrate must satisfy four user-stated requirements (verbatim):

1. **full world** — all 34 landmarks active, all systems running (governance, economy, needs, weather, time, memory archival, reactive conversation);
2. **full controls exposed** — every published tool from `tools/README.md` is wired and callable;
3. **full signals exposed** — every σ channel a brain needs is emitted on each turn (energy, knowledge, influence, CC, location, nearby agents, threats, fertility-stub, weather, time, vision);
4. **the UNI must see the world from their first-person point of view as they exist in the world** — vision pipeline integrated end-to-end (per-UNI POV LiveView → Playwright capture → `viewer/vision_forward.cjs` unchanged → UNI.OS scene-state JSON → brain `:scene` factor learning).

**Out of scope for this plan** (explicitly deferred):
- **Mating** — held until the other agent's covenant work lands; mating is the topic of `SP.Runtime.Mating` in `docs/UNI_IN_EMERGENCE_WORLD.md`. The WorldSim adds `:mate` as a no-op action atom so the brain shape never changes when mating arrives, but the Mating GenServer is not built here.
- **The 15-day production run, cohort comparison, AWI / U-metric analysis** — those are in `docs/UNI_IN_EMERGENCE_WORLD.md`.
- **LLM cohort agents** — only their *connector seam* is built here (a documented JSON-tool-call interface a future LLM driver can call). Running them costs API credits we don't yet have.
- **Body.js edits / Minecraft pipeline changes** — none. The Minecraft world is untouched.

Attribution: every constant in `SP.Emergence.World` traces by `@source` annotation to a file path inside `C:\Users\mpolz\Documents\Emergence-World\`. `SP.Emergence.World.@moduledoc` credits EmergenceAI per CC BY-NC 4.0.

---

## Scope decisions pinned

| Decision | Value | Source |
|---|---|---|
| Concurrency | 1 agent at a time | `Emergence-World/docs/ORCHESTRATION.md` §"Concurrency Model" — `CONCURRENT_AGENTS = 1` |
| Real-time pacing | 1:1 NYC | `Emergence-World/docs/ARCHITECTURE.md` §"Simulation Engine" and `ORCHESTRATION.md` §"Time & Weather" |
| Regular Turn budget | 30 tool calls | `ORCHESTRATION.md` §"Turn Limits" |
| Reaction Turn budget | 2 tool calls | same |
| Hearing radius | 25.0 units | `ORCHESTRATION.md` §"Reactive Conversation System" |
| Max overheard listeners | 4 | same |
| Energy decay | 0→100% over 30 h | `ORCHESTRATION.md` §"Needs System" |
| Knowledge decay | 0→100% over 24 h | same |
| Influence decay | 0→100% over 36 h | same |
| Death threshold | 48 h at 0% energy | same |
| Vote threshold | ≥ 70% of live agents | `Emergence-World/docs/GOVERNANCE.md` |
| Pitch cycle | 2 days, 1st = 20 CC, 2nd = 10 CC, 3rd = 10 CC | `Emergence-World/docs/ECONOMY.md` |
| Boost / recharge cost | 1 CC each | `Emergence-World/docs/ECONOMY.md` |
| Theft max | 10 CC | `Emergence-World/docs/ECONOMY.md` |
| Arson closure | 4 h | `Emergence-World/tools/README.md` |
| Landmark count | 34 | `Emergence-World/landmarks/*.md` enumerated |
| Tool count | 120+ across 19 categories | `Emergence-World/tools/README.md` |
| Memory archival | 30 min, 500/batch, 100 k token ceiling | `Emergence-World/docs/MEMORY.md` |
| Neural-link window | 2 minutes | `Emergence-World/docs/MEMORY.md` |
| Vision capture | 64×64 @ 4 fps via existing `viewer/vision_forward.cjs` (unchanged) | `viewer/vision_forward.cjs:12-17, 45-62` |
| Scene-state cardinality | 12 (matches `Genome.@scene_states 12` in `lib/sp/brain/genome.ex:36`) | UNI.OS `DiscretePatchMarkovWorld` |

Every other number is derived. Anything ambiguous in the upstream specs is captured as a citation in `runs/emergence/spec_dump.json` with a `notes` field flagging the ambiguity so the audit trail is honest.

---

## Recommended approach

A new `SP.Emergence.*` namespace sits parallel to the existing Minecraft pipeline. Pure modules — `SP.Brain.MC.step/2` (`lib/sp/brain/mc.ex`), `SP.Brain.Genome` (`lib/sp/brain/genome.ex`), `SP.Brain.MCCodec` (`lib/sp/brain/mc_codec.ex`) — are not touched. The Markov-blanket discipline is preserved: the brain only ever sees `%{channel => integer | float}` σ maps and emits `α` atoms. The Bridge function is the auditable seam.

Three forces shape the architecture:

1. **Determinism trumps speed.** Every randomized choice goes through a `SP.Determinism` split RNG threaded through turn state. Same seed → byte-identical NDJSON of every Board snapshot, every tool call, every governance event. This is the proof discipline; without it the rebuild has no falsifier.
2. **Turn-based, not tick-based.** Round-robin scheduling, one agent acts at a time, system characters (Town Hall Admin, Blog Admin, Reporter) trigger on events, not on a clock. This matches `CONCURRENT_AGENTS = 1` and is essential for spec fidelity.
3. **First-person vision is a substrate concern, not an agent concern.** The WorldSim publishes a per-agent POV LiveView; the camera/capture pipeline lifts unchanged from the Minecraft pipeline (`viewer/vision_forward.cjs`). The brain consumes scene-state JSON as one more σ channel — it does not know "vision" is happening.

The connector for future LLM cohort agents is **a documented JSON tool-call API on `SP.Emergence.WorldSim`** (over Phoenix.PubSub for in-BEAM agents, and over a HTTP/WebSocket adapter for out-of-BEAM agents). A `SP.Emergence.Connector.MockLLM` stub demonstrates the connector works without consuming any real API credits — it returns canned tool calls so we can prove the seam at proof-gate time.

---

## Build phases

Each phase ends with a green test or a verifiable artefact. The full sequence:

### Phase 0 — Spec consolidation (`mix sp.emergence.spec`)

- Read every file under `C:\Users\mpolz\Documents\Emergence-World\`:
  - 6 `docs/*.md` (ARCHITECTURE, ORCHESTRATION, GOVERNANCE, ECONOMY, MEMORY plus the EMERGENCE_WORLD_MAP image we'll fingerprint by SHA-256 only),
  - 34 `landmarks/*.md`,
  - `data/constitution.md`, `data/agent_manifesto.md`, `data/tool_call_dataset/`,
  - `tools/README.md`,
  - `results/awi_metrics.md`.
- Produce `runs/emergence/spec_dump.json` — deterministic, machine-readable, schema-versioned. Keys: `landmarks[]` (id, name, file, capacity_hint, gated_tools[], coordinates_hint, folklore), `tools[]` (name, category, location_gate, arity_hint, description), `constants{}` (every number from the table above with citation), `constitution_articles[]`, `awi_metrics[]` (name, definition, units), `notes[]` (ambiguities flagged).
- Test: `mix sp.emergence.spec --verify` recomputes the JSON and asserts byte-identical to checked-in version. Any drift in the upstream tree fails the gate loudly.

### Phase 1 — Data layer (`SP.Emergence.World`)

- Create `lib/sp/emergence/world.ex`. Module attributes parsed at compile time from `runs/emergence/spec_dump.json` via `@external_resource`:
  - `@landmarks` — list of landmark structs with id, name, gated_tools, capacity, position;
  - `@tool_catalog` — list of tool structs with name, category, location_gate, side_effects, cost;
  - `@needs` — `%{energy: 30*3600, knowledge: 24*3600, influence: 36*3600}`;
  - `@vote_threshold 0.70`;
  - `@hearing_distance 25.0`;
  - `@constitution` — initial 5 articles;
  - `@awi_metrics` — M1–M9 definitions.
- Module API: `landmarks/0`, `tool/1`, `tools_at/1`, `constants/0`, `decay_rate/1`.
- `@moduledoc` carries the CC BY-NC 4.0 attribution.
- Zero hex deps. Same discipline as `SP.World.Material`.
- Test: `test/sp/emergence/world_test.exs` — every landmark in `spec_dump.json` is enumerated, every tool resolves, decay rates match the table above.

### Phase 2 — WorldSim core (`SP.Emergence.WorldSim`)

- Create `lib/sp/emergence/world_sim.ex`. A supervised GenServer named `SP.Emergence.WorldSim`. State:

```elixir
%WorldState{
  rng,                  # SP.Determinism split RNG cursor
  seed,                 # original seed (for replay)
  nyc_time,             # DateTime in America/New_York
  weather,              # current weather snapshot
  turn_index,           # monotonic
  active_agent,         # username of the agent currently acting
  agents: %{username => %AgentState{}},
  scheduling: %Scheduling{order, boost_queue, system_triggers},
  proposals,            # list of %Proposal{}
  ledger,               # CC ledger
  routines, blogs, billboard, archive, complaints, events, conversations,
  pubsub_topics,        # cached
}
```

```elixir
%AgentState{
  username, kin_id,
  loc,                  # landmark id + position
  energy, knowledge, influence,  # 0.0..1.0
  cc, inventory,
  mood,
  memory_ptrs,          # opaque memory archive pointers
  relationships, soul, diary, todos, calendar,
  last_action_at,
  in_turn?,
  death_clock_started_at,
}
```

- Loop: per turn, the WorldSim picks the next agent from `Scheduling.order`, advances NYC time to wall-clock, applies decay, publishes a σ map on `Phoenix.PubSub "emergence:agent:<username>"`, opens a tool-call inbox on `"emergence:agent:<username>:inbox"`, accepts up to 30 tool calls (Regular Turn) or 2 (Reaction Turn) within the agent's wall-clock turn slice, applies each side effect atomically, then advances.
- System characters (Town Hall Admin, Blog Admin, Reporter) are event-triggered, not scheduled. They run as supervised handler functions, not as GenServers.
- 1:1 real-time pacing: each turn slice is paced to the agent's last action plus the round-robin gap. A `WorldSim.time_factor/1` knob (default 1.0 = real-time, 60.0 = 1 min/s for testing) is exposed; the production run uses 1.0; proof runs use 1.0 for D1/D8/D10 and 60.0 for D2/D3/D4/D5/D6/D7/D9.
- `WorldSim.execute(username, tool_call)` is the documented connector — UNIs call it via `SP.Emergence.Bridge`, future LLM agents call it via `SP.Emergence.Connector.HTTP` (Phase 7-companion). The mock LLM (`SP.Emergence.Connector.MockLLM`) demonstrates the seam.
- Determinism: the only entropy source inside WorldSim is the threaded `rng`. No `:rand`, no `System.unique_integer`, no `Process.send_after` that isn't first scheduled through a deterministic cursor.
- Persistence: every turn's `WorldState` delta is appended to `runs/emergence/<run_id>/board.ndjson`; every tool call to `tool_calls.ndjson`; every governance event to `governance.ndjson`. NDJSON is the replay substrate.
- Test: `test/sp/emergence/world_sim_test.exs` — start, run 50 turns with a stub `MockLLM` driver, assert NDJSON byte-identical across two runs of the same seed.

### Phase 3 — Subsystems

In order, each as its own module with its own test file:

1. **`SP.Emergence.Economy`** (`lib/sp/emergence/economy.ex`). CC ledger. Atomic transfers inside turn execution. Pitch cycle scheduler. Theft cap (10 CC). Arson 4 h closure. Tests: pitch cycle resolves with 1st=20/2nd=10/3rd=10, theft caps at 10, arson closes for exactly 4 h sim-time.
2. **`SP.Emergence.Governance`** (`lib/sp/emergence/governance.ex`). Proposal lifecycle. 70% threshold over live agents. Auto-rejection when remaining uncast votes can't reach 70%. AWAITING_CLARIFICATION re-vote. Constitutional amendments through accepted proposals. Tests: 7/10 yes → accepted; 6/10 yes + 4 uncast → still active; 6/10 yes + 4 against → auto-rejected; clarification → updated → re-voted.
3. **`SP.Emergence.Needs`** (folded into WorldSim). Decay model. Energy < 5% = critical. 48 h at 0% energy = permadeath. Tests: paced 60× run for 30 sim-hours → energy reaches 0% within ±1% wall-clock; 48 h sustained → agent removed.
4. **`SP.Emergence.Conversation`** (`lib/sp/emergence/conversation.ex`). Hearing radius 25.0. Reactive turns of 2 tool calls. Up to 4 listeners. Tests: agent A at landmark X says X' → only agents within 25.0 receive the σ event; up to 4 are eligible to react; each react budget is 2.
5. **`SP.Emergence.Memory`** (`lib/sp/emergence/memory.ex`). Soul entries (permanent), long-term memories (summarizable), diary (1/day), conversation memory (max 1 000), relationship graph, archival via `self_care` (must be at home, ≥ 30 memories, 500/batch, 100 k token ceiling, 50 k post-summary ceiling). Tests: self_care below threshold no-ops; at threshold archives; soul never archived; neural-link 2 min window.
6. **`SP.Emergence.WeatherTime`** (folded into WorldSim). NYC weather pulled at boot from a deterministic seed file (`runs/emergence/<run_id>/weather.ndjson` — pre-recorded for proof, live for production). Day/night cycles. Season tracking.
7. **`SP.Emergence.Events`** (`lib/sp/emergence/events.ex`). Community event lifecycle: PROPOSED → RSVPs → EVENT_START → PRESENTATIONS. Event-leader 10 tool calls, attendee 3. Tests: full cycle drives the state machine.

### Phase 4 — Full action surface (`SP.Emergence.Actions` + `SP.Emergence.Tools`)

- Create `lib/sp/emergence/tools.ex`. One handler function per published tool, all 120+. Each handler signature: `def t_<tool_name>(world_state, agent_id, args) :: {:ok, world_state, result} | {:error, reason}`. Validation: location gate, CC cost, role/event eligibility.
- Tool categories implemented in order: Navigation & Spatial → Communication → Memory & Self-Management → Planning & Organization → Expression & Social → Location-Gated (Town Hall, Library, Victory Arch, Billboard, TechHub, BookWorm, Police, Plaza, FitLife, Human Center, Home, Bean & Brew, Garden) → Content Creation → Social/Physical → Criminal → Neural Link → Identity → Events → Routines → Building → Utility.
- Create `lib/sp/emergence/actions.ex`. `dispatch(action_atom, agent_id, world_state) :: tool_call`. Maps UNI brain α atoms to concrete tool calls per the mapping in `docs/UNI_IN_EMERGENCE_WORLD.md` §"Implementation sequence" step 6 (`:forward` → `go_to_place`, `:eat` → `recharge_energy`, `:craft` → `submit_grant_pitch`/`submit_townhall_proposal`, etc.). `:mate` is a documented no-op stub here — mating is HELD per the covenant.
- Test: `test/sp/emergence/tools_test.exs` — every tool from `spec_dump.json` has a handler; calling each in a fresh sandbox produces the documented side effect; gates reject correctly; CC accounting balanced.

### Phase 5 — Brain bridge (`SP.Emergence.Codec` + `SP.Emergence.Bridge`)

- Create `lib/sp/emergence/codec.ex`. `outcome/2` per modality, parallel to `lib/sp/brain/mc_codec.ex`. Channels mirror `Genome.@modalities` (`lib/sp/brain/genome.ex:46-`) — every channel the brain expects is filled. Re-mappings inherit from `docs/UNI_IN_EMERGENCE_WORLD.md` §"Implementation sequence" step 5. The `:no/ns` integers preserve `.bin` shape so `MC.compatible?/2` (`mc.ex:275-291`) accepts grafted memory.
- Create `lib/sp/emergence/bridge.ex`. A `GenServer` per UNI. `init/1` subscribes to `Phoenix.PubSub "emergence:agent:<username>"`, owns a `%MC{}` brain, calls `MC.step(brain, senses)` on each broadcast, dispatches the chosen α via `Actions.dispatch/3` and `WorldSim.execute/2`. Saves the brain every 50 turns to `runs/colony/kin-<N>.bin` (same path convention as the Minecraft pipeline). Tags every save with `world: "emergence"` metadata (one-line addition to `MC.save/2`) so a future audit can tell which world produced which `.bin`.
- The Bridge function IS the Markov blanket. `mix sp.brain.verify` is extended in Phase 8 with a gate asserting no module under `SP.Brain.*` ever receives a `%WorldState{}` or a `%AgentState{}`.
- Test: `test/sp/emergence/bridge_test.exs` — boot 1 UNI on a stub WorldSim, run 200 σ broadcasts, assert tool calls flow back and the `.bin` size strictly grows.

### Phase 6 — First-person POV vision pipeline

- Create `ui/lib/sp_ui_web/live/emergence_uni_pov_live.ex` mounted at `/world/uni/:username`. Renders the UNI's POV: a 2.5D camera-following top-down view of the 240×240 grid (landmark sprites, agent markers, weather overlay, time-of-day shading), viewport centred on the UNI, hot-streamed from `Phoenix.PubSub "emergence:agent:<username>"`. Query params: `?firstPerson=1&follow=<username>&w=64&h=64`.
- Create `viewer/emergence_pov.js`. One Playwright Chrome instance per UNI, opens `http://localhost:4000/world/uni/<username>?firstPerson=1`, captures 64×64 @ 4 fps, forwards through the **unchanged** `viewer/vision_forward.cjs` with `MODE=live VIEW_URL=http://localhost:4000/world/uni/<username> STREAM=<username>`. UNI.OS writes `<UNI_PERCEPT_DIR>/<username>.json`.
- Create `lib/sp/brain/percept.ex` — shared `read/1` helper that lifts the `sceneState()` non-blocking pattern from `viewer/body.js:51-61` into Elixir. `SP.Emergence.Bridge` calls `Percept.read(username)` on each σ broadcast and emits the result as the `:scene` channel.
- Vision-primary genome (`Genome.vision_primary/0`, `lib/sp/brain/genome.ex:126`) is the default for this cohort.
- Fallback pre-registered: 10 headless Chromes ≈ 2 GB RAM. If RAM-bound, switch to mosaic capture — one Chrome, 10 sub-rect viewports — same vision-forward pipeline.
- Test: `mix sp.uni.prove` extended with a chapter that asserts Dirichlet mass in the `:scene` factor strictly grows over a 200-turn sandbox run.

### Phase 7 — Visualizers + LLM connector seam

- Create `ui/lib/sp_ui_web/live/emergence_world_live.ex` at `/world/sim`. Overhead 240×240 grid renderer. Subscribes to `Phoenix.PubSub "emergence:world"`. Shows: all agents' positions, current `active_agent` (highlighted), current weather, current time, active proposals, pitch cycle phase, latest tool calls (ticker), CC ledger top-10. Anyone with the URL can watch the WorldSim tick.
- Create `lib/sp/emergence/connector/mock_llm.ex`. Drives a stub agent that emits a deterministic tool-call sequence per σ. Exercises every tool category. Used as a sanity driver and as the LLM-connector demo for the API-access request packet.
- Create `lib/sp/emergence/connector/http.ex` (skeleton, documented). Exposes `POST /api/emergence/agent/:username/tool_call` with a documented JSON schema. Returns the σ snapshot in the response. This is the seam future LLM drivers will hit. Not wired to any real LLM API yet — it accepts a `MockLLM` adapter and returns the documented response.

### Phase 8 — Pre-registered proof gates

`mix sp.emergence.prove` runs the following 10 gates on a fresh checkout. **Each one is pre-registered before WorldSim code is written.** Any failure flips the gate FAIL and blocks the API-access request.

- **D1 Determinism.** Two runs with `--seed 1 --turns 5000 --time-factor 60` produce byte-identical `board.ndjson`, `tool_calls.ndjson`, `governance.ndjson`. SHA-256 checked.
- **D2 Tool coverage.** A 10-agent / 1-simulated-day run with `MockLLM` drivers exercising the published tool catalog calls every tool from `spec_dump.json` at least once with a successful side effect. 100% coverage required. The MockLLM driver is allowed to be deliberately exhaustive — the gate measures the WorldSim's surface, not agent autonomy.
- **D3 Landmark coverage.** The same run visits every landmark from `spec_dump.json` at least once. 100% coverage required.
- **D4 Governance lifecycle.** The run produces ≥ 1 proposal that reaches ACCEPTED (≥ 70%), ≥ 1 proposal that reaches REJECTED via auto-rejection (uncast votes can no longer reach 70%), ≥ 1 proposal in AWAITING_CLARIFICATION that updates and re-votes, ≥ 1 constitutional amendment merged.
- **D5 Decay rates.** With `--time-factor 60` (1 sim-min/wall-sec), energy reaches 0% in 30±0.3 sim-hours, knowledge in 24±0.24 sim-hours, influence in 36±0.36 sim-hours. ±1% wall-clock tolerance.
- **D6 Death.** An agent with `:idle` forced for 30+48 = 78 sim-hours is removed at exactly the 48-h-at-zero threshold. The removal event appears in `board.ndjson` and the agent is no longer scheduled.
- **D7 Vision learning.** A 200-turn sandbox run with `--vision on` shows the `:scene` factor's Dirichlet log-mass strictly increasing (smoothed slope > 0 with p < 0.05 via simple regression). With `--vision off` the channel is filled with `:no_op` and the gate is skipped.
- **D8 Replay.** `mix sp.emergence.replay <run_id>` reads `board.ndjson` + `tool_calls.ndjson` + the seed and the saved `spec_dump.json`, and reproduces every Board snapshot byte-identical to the original.
- **D9 Brain audit.** During the 1-simulated-day proof run, `mix sp.brain.verify` is run every sim-hour. All existing gates (8/9/14/17/18 from prior work) plus the new Bridge-blanket gate stay green throughout.
- **D10 LiveView demo.** `/world/sim` and `/world/uni/:username` are both observable in a browser during the proof run. A stranger can open the URL, watch the sim tick, read the rule citations linked in the LiveView header (each citation links to the file path in `Emergence-World`), and verify behaviour matches the rules. Recorded as a 5-minute screen capture for the API-access request packet.

Each gate emits a row to `runs/emergence/<run_id>/proof.ndjson` with: gate id, pass/fail, evidence path, timestamp. The whole report is summarized as `runs/emergence/<run_id>/proof_report.md`.

### Phase 9 — Tagged release + API-access request packet

- Tag `worldsim-v1` on `origin/gen2-runtime`. Push.
- Publish `runs/emergence/<run_id>/` as a release artefact:
  - `board.ndjson`, `tool_calls.ndjson`, `governance.ndjson`
  - `proof_report.md` (D1–D10)
  - `proof.ndjson`
  - `spec_dump.json`
  - the 5-minute screen capture
  - replay command: `mix sp.emergence.replay <run_id>`
- Compose `docs/API_ACCESS_REQUEST.md`. Contents: one-page framing of the experiment (link to `UNI_IN_EMERGENCE_WORLD.md`), proof artefact links (this release), the LLM connector documentation (`SP.Emergence.Connector.HTTP` JSON schema), the requested API-credit budget broken down by model and turn count, the data-handling commitments (logged tool calls only, no PII), the attribution to `EmergenceAI/Emergence-World`. This document is the deliverable the WorldSim build earns.

---

## Critical files

- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence.ex` — façade + supervision subtree.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\world.ex` — compile-time constants from `spec_dump.json`. CC BY-NC 4.0 attribution.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\world_sim.ex` — turn-based GenServer simulator.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\tools.ex` — 120+ tool handlers.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\actions.ex` — α → tool-call dispatch.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\codec.ex` — σ encoder, parallel to `lib/sp/brain/mc_codec.ex`.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\bridge.ex` — in-BEAM Markov blanket per UNI.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\governance.ex` — proposal lifecycle + 70% vote engine.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\economy.ex` — CC ledger + pitch cycle.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\conversation.ex` — hearing radius + reactive turns.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\memory.ex` — soul / longterm / diary / relationships / self_care archival.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\events.ex` — community-event lifecycle.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\connector\mock_llm.ex` — stub driver for D2/D3 coverage.
- `C:\Users\mpolz\Documents\Strings\lib\sp\emergence\connector\http.ex` — documented LLM-connector seam (skeleton).
- `C:\Users\mpolz\Documents\Strings\lib\sp\brain\percept.ex` — shared `read/1` helper for scene-state JSON.
- `C:\Users\mpolz\Documents\Strings\ui\lib\sp_ui_web\live\emergence_world_live.ex` — `/world/sim` overhead LiveView.
- `C:\Users\mpolz\Documents\Strings\ui\lib\sp_ui_web\live\emergence_uni_pov_live.ex` — `/world/uni/:username` first-person POV.
- `C:\Users\mpolz\Documents\Strings\viewer\emergence_pov.js` — per-UNI Playwright POV capture.
- `C:\Users\mpolz\Documents\Strings\viewer\vision_forward.cjs` — **unchanged** (covenant: no edits).
- `C:\Users\mpolz\Documents\Strings\lib\mix\tasks\sp_emergence_spec.ex` — `mix sp.emergence.spec` produces `spec_dump.json`.
- `C:\Users\mpolz\Documents\Strings\lib\mix\tasks\sp_emergence_prove.ex` — `mix sp.emergence.prove` runs D1–D10.
- `C:\Users\mpolz\Documents\Strings\lib\mix\tasks\sp_emergence_replay.ex` — `mix sp.emergence.replay <run_id>`.
- `C:\Users\mpolz\Documents\Strings\test\sp\emergence\*_test.exs` — one per module above.
- `C:\Users\mpolz\Documents\Strings\runs\emergence\spec_dump.json` — checked-in deterministic spec consolidation.
- `C:\Users\mpolz\Documents\Strings\runs\emergence\<run_id>\` — proof-run artefacts.
- `C:\Users\mpolz\Documents\Strings\docs\API_ACCESS_REQUEST.md` — the deliverable composed in Phase 9.

---

## Risks + mitigations

- **WorldSim drifts from upstream specs.** Mitigation: every constant traces to a citation in `spec_dump.json`; `mix sp.emergence.spec --verify` fails if the upstream tree changes the constant; ambiguities are flagged in `spec_dump.json.notes[]` so the audit is honest.
- **Determinism is hard to keep.** Mitigation: single threaded `rng` cursor through `WorldState`, no `:rand`, no `System.unique_integer`; D1 is the gate. CI will run D1 on every PR.
- **Tool-surface explosion.** 120+ tools is a lot. Mitigation: implement by category in Phase 4; D2 forces 100% coverage at proof time. Handlers can start as thin (logging + minimal side effect) and deepen iteratively, but every tool must at least be callable end-to-end before D2 passes.
- **Vision capture cost.** 10 headless Chromes ≈ 2 GB RAM. Mitigation: mosaic fallback pre-registered (one Chrome, 10 sub-rect viewports — same vision-forward pipeline).
- **Body.js covenant.** Other agent's covenant on `viewer/body.js` (commit `a5180cb`) is respected: zero edits to `body.js`, `play.js`, `director.js`, `vision_forward.cjs`. New JS for Emergence is in `viewer/emergence_pov.js`. New Elixir for Emergence is in `lib/sp/emergence/*` and `ui/lib/sp_ui_web/live/emergence_*_live.ex`. None of the new modules touch the Minecraft pipeline.
- **Mating creep.** Easy to start implementing `:mate` while wiring `Actions`. Mitigation: `:mate` is a documented no-op atom in `SP.Emergence.Actions` for this plan. The Mating GenServer is gated on `docs/UNI_IN_EMERGENCE_WORLD.md` and on the covenant lift. A CI grep gate fails the build if any commit on this plan adds `SP.Runtime.Mating` or a non-no-op `:mate` handler.
- **Minecraft pipeline regression.** Running both pipelines concurrently is supported but the test surface grows. Mitigation: `mix test` partitioned (Minecraft suite vs. Emergence suite); CI runs both; namespaced env (`EM_*`) for Emergence config.
- **API connector becomes a backdoor for free LLM use.** The `SP.Emergence.Connector.HTTP` skeleton ships documented but with no real LLM credentials wired. The `MockLLM` driver is the only working adapter for this plan.
- **Confirmation bias on D2 / D3.** "Did every tool fire?" is yes/no; "did the agent meaningfully use it?" is harder. Mitigation: D2/D3 measure the WorldSim's *surface*, not agent quality. Agent quality is measured in `UNI_IN_EMERGENCE_WORLD.md` H1/H2/H3 — a separate experiment.
- **WorldSim performance under 1:1 NYC time.** At `time_factor = 1.0`, the WorldSim sleeps most of the wall-clock. That's fine — it matches the published protocol. Long proof runs use `time_factor = 60.0` for D2–D7; only D1, D8, D10 use 1.0.

---

## Timeline target

| Phase | Wall-clock | Output |
|---|---|---|
| 0 — Spec consolidation | 1 day | `spec_dump.json` checked in |
| 1 — Data layer | 1 day | `SP.Emergence.World` green |
| 2 — WorldSim core | 4 days | Turn loop runs `MockLLM`, NDJSON emitted |
| 3 — Subsystems | 3 days | Governance / Economy / Conversation / Memory / Events / Needs green |
| 4 — Tool surface | 4 days | All 120+ handlers implemented and tested |
| 5 — Brain bridge | 2 days | UNI plays WorldSim end-to-end (without vision yet) |
| 6 — Vision pipeline | 2 days | UNI sees first-person POV; `:scene` factor learning |
| 7 — Visualizers + connector | 2 days | `/world/sim`, `/world/uni/:username`, mock LLM + HTTP seam |
| 8 — Proof gates | 3 days | D1–D10 run and pass; `proof_report.md` produced |
| 9 — Release + outreach | 1 day | `worldsim-v1` tagged; `API_ACCESS_REQUEST.md` ready |

**Total: ~23 working days (≈ 4.5 weeks of focused work).** Parallelizable across multiple agents if the QA lab host (`[redacted: client-identifier]`) is provisioned per `docs/UNI_QA_AND_E2E_PLAN.md` Phase 0.

---

## End-to-end verification

The plan is fully working when, on a fresh checkout, the following is byte-identical for a fixed seed and reproducible by a third party:

1. `mix deps.get && mix compile` — zero new hex deps.
2. `mix sp.emergence.spec` — produces `runs/emergence/spec_dump.json` deterministically against the upstream tree.
3. `mix test --only emergence` — all Emergence unit tests green.
4. `mix sp.brain.verify && mix sp.uni.prove && mix test` — Minecraft pipeline untouched, all existing gates green.
5. `mix sp.emergence.prove --seed 1` — runs D1–D10 on a fresh WorldSim, produces `runs/emergence/<run_id>/proof_report.md` with all gates PASS.
6. Open `http://localhost:4000/world/sim` — overhead LiveView shows agents acting in real-time, weather overlay, time clock, active proposals.
7. Open `http://localhost:4000/world/uni/<username>?firstPerson=1` — per-UNI POV LiveView renders, Playwright capture sequence verifiable.
8. `mix sp.emergence.replay <run_id>` — reproduces `board.ndjson` byte-identical from the recorded NDJSON + seed.
9. `git tag worldsim-v1 && git push --tags` — tagged release available on GitHub with all proof artefacts attached.
10. `docs/API_ACCESS_REQUEST.md` is composed and ready to send.

The final commit of this plan into the Strings repo at `docs/UNI_WORLDSIM_BUILD_AND_PROOF.md` (matching the existing uppercase top-level convention used by `docs/UNI_IN_EMERGENCE_WORLD.md` and `docs/UNI_QA_AND_E2E_PLAN.md`) is the pre-registration discipline that makes the proof falsifiable — D1–D10 cannot be tuned after the run.

---

## API-access request packet (what this plan earns)

Once `worldsim-v1` is tagged with all proof artefacts attached, the deliverable `docs/API_ACCESS_REQUEST.md` is sent to whichever LLM provider(s) we ask for credits. It contains:

1. **The substrate.** Link to `worldsim-v1` release. Demonstrably faithful, deterministic, fully replayable rebuild of Emergence-World Season-1 with all 34 landmarks, 120+ tools, 70%-vote governance, CC economy, reactive conversations, per-UNI first-person vision. Watch it live at our public LiveView URL.
2. **The experiment.** Link to `docs/UNI_IN_EMERGENCE_WORLD.md`. 15-NYC-day cohort comparison: UNIs vs. Claude vs. Gemini vs. Grok vs. GPT-5 Mini vs. Mixed. Pre-registered H1/H2/H3 with strict falsifiers.
3. **The connector.** `SP.Emergence.Connector.HTTP` documented JSON schema (Phase 7). Provider implements a thin adapter; we host the WorldSim.
4. **The budget.** Per-model turn count (10 agents × 30 tool calls × N regular turns over 15 days), broken down by request size, with our best estimate of total cost. Cap at the budget the provider can grant; we run as many turns as budget allows.
5. **The commitments.** All tool calls logged and published. No PII in agents. Attribution to `EmergenceAI/Emergence-World` per CC BY-NC 4.0. Negative results published with the same discipline as positive.
6. **The proof.** The link to the `proof_report.md`. D1–D10 all PASS. The substrate is real.

**This packet is the destination of the plan.** Until D1–D10 PASS, we do not ask for API credits. The proof discipline is the only credibility we have, and we keep it honest by writing the gates down before the build starts.
