# Typed model spec — Producer remote colony-sense + observe-only fence
**Status:** reviewed, MERGED VERDICT **SIGN-WITH-CHANGES** (lab-team review 2026-07-15; verdicts + the
19 consolidated required changes recorded in `docs/receipts/producer_reattach_remote_sense_spec.md` §3).
This spec incorporates every required change. Owner decision: option A′ (chat, 2026-07-15).

| Slot | Before | After | Notes |
|---|---|---|---|
| **StateSpace** | Producer genome factors (11 designed modalities, `SP.Producer.Genome`) | **unchanged** | no factor added/removed |
| **ObservationChannels** | `rows` from local `SP.Brain.Colony.snapshot()` (same-node ETS board); tps/log/history as today | same channels; `rows` TRANSPORT becomes `SP.Show.RemoteRows.fetch(colony_node)`: `nil` → local `Colony.snapshot()` (today's bytes, incl. failure→`[]`); node → `:rpc.call(node, SP.Runtime.Board, :all, [], 500)` — **pure remote ETS read** (remote `Colony.snapshot/0` is FORBIDDEN: its `ensure_started` fallback is a remote write, colony.ex:65-68). timeout/badrpc/exception → `[]`. Rows normalised (`username` required; `kin/mode/senses/action` `put_new`-defaulted) so a v2-vs-HEAD shape drift cannot remap observation channels or crash `Director.card/1` (director.ex:515). | MB1, MB2, MB3; live row-shape receipt required pre-deploy |
| **ActionSpace** | genome action set (cut/glide/b-roll/widen/beats/spawn/cull/health/hold…) | **set unchanged.** Under opt `observe_only: true`, the INTERPRET of exactly `{:spawn}`, `{:cull, _}`, `{:health, :tps}` becomes `{:fenced, dir}` → logged no-op + per-action counter. Camera/narration directives untouched. Defense in depth: `SP.Brain.Colony.spawn_agent/2` + `stop_agent/1` refuse under `UNI_OBSERVE_ONLY=1`. | fence is post-decision (generative PROCESS, not model); A5 |
| **PreferenceModel (C)** | genome C per factor; `server_health` dominant; `population` C-peak at state 2 (= 6 UNIs) | **unchanged.** Honest note: under the fence, `population`/`server_health` preferences are watch-and-narrate only — the fenced node cannot act on them. At the measured 6-UNI colony, population sits at its C-peak, so the dead limbs stay LATENT in the RED (untested, not absent). | D2, D4 |
| **PolicySet** | horizon-1 producer decide (depth-5 plan values, γ-weighted, habit-biased sample) | **unchanged** — EFE still scores fenced actions normally; no per-action scalar anywhere | MB check 7 |
| **LearningParameters** | `learn_a: false, learn_b: false, learn_e: false` (genome.ex:125-126, 141, 145) — **no learning** | **unchanged.** CORRECTED CLAIM (was false in the draft packet): the producer CANNOT adapt to dead actuators. The fence creates a **standing, unlearnable prediction error** on `population`/`server_health` whenever those factors leave preference: frozen B keeps predicting the fixer works, EFE may re-elect it, the fence no-ops it. Senses stay honest (true remote board — faking them would be Food-Hack-class fraud). Instrumented via fenced-action counters + the perseveration tripwire (K consecutive same-fenced-action beats with zero camera directives ⇒ abort/INCONCLUSIVE, never a masked FAIL). | D1, D2 |
| **PrecisionSchedule** | γ=12.0 designed | **unchanged** | |
| **ValidationAnchors** | invariant suite green | suite stays green (`decider_byte_identity`, `action_clone_invariance`, `novelty` — none of their paths touched); NEW anchors: `fence_directives(dirs, [])==dirs` (identity), fence replaces exactly the three directives, `RemoteRows.fetch(nil)` = local branch **including the failure branch** (exception → `[]`, byte-identical to today's catch), unreachable node → `[]`. | MB4 |
| **ClaimFence** | all narration through `SP.Brain.Fence.gate_line` at `Director.add_line` | **unchanged**; fenced-choice logs use functional language only; camera bot `"Director"` is equipment, never narrated as a mind. | D check 6 |

**FORBIDDEN FIX (binding, D3):** no future change may quiet fenced choices via a per-action scalar,
an action-cost, or an edit to the shipped genome's C — that is reward-in-a-wig. If an observer-role
producer genome is ever wanted (e.g. population C flattened), it is lawful ONLY as its own separate
genome constructor (forage/honest-lineage pattern) through its own lab-team review.

**Deployment shape (honesty lines included, D4/A6):** container `uni-producer` on `uni-colony-net`,
HEAD bytes, `--sname producer --cookie sp` (the one-`uni`-node law holds — the only `--sname uni`
node remains the colony), env `UNI_AUTOSTART=1 UNI_POPULATE=0 UNI_COLONY_NODE=uni@uni-colony
UNI_OBSERVE_ONLY=1 MC_HOST=mc-server VIEWER_URL=http://<chip>:3020/`, `UNI_CAM` unset (camera ON:
`director.js` as the Director's Port child — the proven mechanism). Host publishes `:4200→:4000`
(health + stream; **not `:4100`** — that is `masterplan.uni-lab.local`, caught in the registry
2026-07-15; `producer.uni-lab.local:4200` is registered `nv` until its live probe passes; port
verified free at deploy) and the existing `:3020` forwarder re-points `uni-cam:3020 →
uni-producer:3020` after `uni-cam` stops (bot-name collision: MC kicks duplicate `"Director"`
logins). **Two Producer
minds then sense the same colony: the living v2 one inside `uni-colony` keeps its cast hands and its
legacy `:4000/stream` narration; the new fenced node is the broadcast show-runner (camera + its own
`/stream`).** `UNI_OBSERVE_ONLY=1` + `UNI_POPULATE=0` are **load-bearing** (an unfenced node under
`rows=[]` would spawn real bodies / fire `kill @e` at the live world) and must be attested in the
deploy receipt (`podman inspect`). The camera's own RCON verbs (`tp`/`gamemode spectator`/`forceload`
on `Director`) are the Arm-A-identical proven mechanism — ALLOWED; anything touching `UNI-*` or
entities/items (spawn/cull/`kill`/`give`/`summon`) is FORBIDDEN. `director.js` gains stdin-EOF
self-exit so a supervisor restart can never orphan a camera into a login kick-fight (A4;
studio-track edit under the owner's waiver, 2026-07-15).

**Code touch-points:** `lib/sp/show/remote_rows.ex` (new) · `lib/sp/producer.ex` (snapshot seam,
`fence_directives/2`, fenced counters in `:status`) · `lib/sp/brain/director.ex` (snapshot seam) ·
`lib/sp/show.ex` (status count through the seam — else `/producer/health` reads the local empty
board and gate 1 is unreachable) · `lib/sp/brain/colony.ex` (observe-only refusal guards) ·
`ui/lib/sp_ui/application.ex` (`UNI_POPULATE` gate + `show_opts/0`) · `viewer/director.js`
(stdin-EOF exit, waived) · tests.
