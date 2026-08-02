# Proposal packet — Producer remote colony-sense + observe-only fence (option A′, 2026-07-15)

> **Purpose:** reattach a real, HEAD-code Producer UNI to the live camera of the untouchable
> `uni-colony:v2` colony (owner directive 2026-07-14/15; handoff
> `docs/handoffs/SCIENCE_AGENT_PRODUCER_CAMERA_REATTACH_2026-07-14.md`; owner chose option A′ in
> chat 2026-07-15). Reviewed by the full lab team 2026-07-15 → **MERGED VERDICT:
> SIGN-WITH-CHANGES** (§3). This version integrates every required change; the draft's two
> falsified claims are corrected inline and noted. Canonical typed spec:
> `docs/specs/producer_remote_sense_observe_only.md`.

## 0. Measured context the proposal stands on (receipts in chat log, probed 2026-07-15 02:20–02:35 UTC)

- Inside `uni-colony` (the ONLY `--sname uni` node; cookie `sp`): an 06-22-vintage `SP.Producer`
  (pid live) + `SP.Brain.Director` (pid live) run with **`driver: :producer` and `port: nil`**
  (`UNI_CAM=0`) — the living Producer's camera directives die in `cam_write(nil)`.
- `uni-cam` runs `viewer/director.js` (bot `"Director"`, RCON pass `sp` verified) with **no stdin
  writer and `subject=null`** — a rendering, unflown camera.
- The colony image **cannot host** `director.js` (no `prismarine-viewer`/`canvas`/`gl`).
- RCON `list` = 6 UNIs + `Director`; RPC `colony_count` = 6 (count-consistency holds).
- Read-only RPC into `uni@uni-colony` works.

## 1. The packet (Step-0 five elements, post-review)

**Math object:** **None.** No change to F, G (EFE), C, E, γ/γ_m/η, or learning. The change is
confined to the **generative process**: (i) telemetry transport (where `rows` come from — same
channels, remote source) and (ii) the **Jido interpret boundary** (which chosen actions may
actuate). `SP.Producer.plan/2`, `SP.Producer.Brain.*`, `SP.Brain.Plan/Infer/EFE/Learn/Novelty`
are byte-untouched. (Theorist's framing: the fence is a generative-PROCESS change — active
states' world-coupling severed post-decision — never a model edit.)

**Intended behavioural effect (one sentence):** a new, non-`uni` node on the chip runs HEAD's
Producer+Director sensing the REAL colony's board over a pure read-only RPC and flying its own
`director.js` camera Port, so the broadcast camera cuts/follows the living UNIs under genuine
EFE Producer control while the colony, world, and minds stay untouched.

**No-go failure mode (one sentence):** the new node mutates the world or colony in ANY way — a
spawn/cull/`kill @e` reaching the live server, a body process started, a write into
`uni@uni-colony` (including rpc to any function with side effects) — or its Producer stars
phantom subjects (rows transport broken/shape-drifted).

**Typed model diff:** see the canonical table in
`docs/specs/producer_remote_sense_observe_only.md`. Review corrections integrated there:
- ~~remote `SP.Brain.Colony.snapshot/0`~~ → **`:rpc.call(node, SP.Runtime.Board, :all, [], 500)`**
  (the draft's "pure ETS board read" claim was FALSE for `snapshot/0` — its `ensure_started`
  fallback is a remote WRITE, colony.ex:65-68; falsified by the Math-Breaker, confirmed by the
  Theorist). Timeout/badrpc/exception → `[]`. Rows normalised against HEAD consumer keys.
- ~~"the mind adapts to dead actuators"~~ → **FALSE** (producer genome: `learn_a/learn_b/learn_e`
  all false). Corrected: a **standing, unlearnable prediction error** on `population`/
  `server_health` under the fence; senses honest; instrumented via per-fenced-action counters +
  the perseveration tripwire. At 6 UNIs population sits at its C-peak → the regime is LATENT in
  this RED (untested, not absent).
- **FORBIDDEN FIX (binding):** no per-action scalar, no action-cost, no shipped-genome C edit to
  quiet fenced choices — an observer-role genome variant is lawful only as its own separate
  constructor through its own review.
- **Two-minds honesty line:** the living v2 Producer keeps cast hands + legacy `:4000/stream`
  narration; the new fenced node is the broadcast show-runner. Only one mind has hands.

**Code touch-points (exact, post-review):**
1. `lib/sp/show/remote_rows.ex` (**new**): `fetch(nil)` → local `Colony.snapshot()` under today's
   exception→`[]` semantics; `fetch(node)` → `:rpc.call(node, SP.Runtime.Board, :all, [], 500)`,
   any failure → `[]`; row normalisation (`username` required, `kin/mode/senses/action`
   `put_new`); `colony_node/0` + `observe_only?/0` env readers (`UNI_COLONY_NODE`,
   `UNI_OBSERVE_ONLY`).
2. `lib/sp/producer.ex`: `safe_snapshot(opts)` through the seam; PURE public
   `fence_directives(dirs, opts)`; `interpret(state, {:fenced, dir})` → log + per-action counter
   (exposed in `:status` — the once-per-distinct dedup would hide rate).
3. `lib/sp/brain/director.ex`: `safe_snapshot(state.opts)` through the seam (both beat clauses).
4. `lib/sp/show.ex`: `status/0` colony count through the seam (env-driven; local board alone
   reads 0 on the new node and makes gate 1 unreachable — Architect/Experimentalist).
5. `lib/sp/brain/colony.ex`: `spawn_agent/2` + `stop_agent/1` refuse under `UNI_OBSERVE_ONLY=1`
   (defense in depth; default unset = byte-identical).
6. `ui/lib/sp_ui/application.ex`: `UNI_POPULATE` gate (default `"1"` = today) + `show_opts/0`
   passing `colony_node`/`observe_only`/`mc_host` into `SP.Show.Supervisor`.
7. `viewer/director.js`: stdin-EOF self-exit (single-camera invariant across supervisor
   restarts; studio-track edit under the owner's 2026-07-15 waiver).

**Deployment shape:** see canonical spec. Load-bearing env (attested in deploy receipt):
`UNI_OBSERVE_ONLY=1`, `UNI_POPULATE=0`, `UNI_COLONY_NODE=uni@uni-colony`, `--sname producer`
(one-`uni`-law), `MC_HOST=mc-server`, `VIEWER_URL` → the `:3020` LAN path, host `:4200→:4000`
(`producer.uni-lab.local`; NOT `:4100` = masterplan — registry collision caught 2026-07-15).

**RED test design (paired, post-review):**
- **Arm A (control)** = the measured current state (§0): camera parked, wheel unplugged, 6 UNIs.
- **Arm B (cure)** = `uni-producer` up + `uni-cam` stopped — ONE composite ownership variable
  (MC kicks duplicate `"Director"` logins; ownership physically cannot be shared). Nothing in
  `uni-colony`/`mc-server`/minds changes.
- **Window preconditions (gate 0):** RCON `list` shows exactly one `Director`; `podman ps` shows
  `uni-cam` absent; env attestation captured (`podman inspect uni-producer`).
- **Collector (Lab Protocol III — harness-managed, no LLM-watched window):**
  `runs/red_producer_camera_collector.sh` on THINKER (ssh, read-only), sampling every ≤5 s for
  the whole window, appending timestamped NDJSON: (a) new-node `/producer/health` INCLUDING the
  frame-stamped `knowledge` ring (instantaneous `star` aliases under a 5 s poll) + fenced
  counters; (b) RCON `data get entity Director Pos` + `data get entity <current star> Pos`;
  (c) RCON `list` (names + count — the abort tripwire); (d) legacy `:4000` liveness.
- **PASS gate `producer-camera-attached` (ALL of):**
  1. Fresh `GET http://producer.uni-lab.local:4200/producer/health` → 200, `verdict=LIVE`,
     `driver=producer`, **seam-joined `colony_count=6`**, frame advancing across two probes
     ≥60 s apart.
  2. Over a ≥10-minute window: **≥3 discriminating subject-REATTACHMENT events** — a star/glide
     directive (from the knowledge ring) where old→new star separation ≥ 2× the reattach
     threshold, followed within ≤15 s by `dist(Director, new star) ≤ shot r + margin (≤12
     blocks)` in the Pos series. Wide-shot fallback: one `:overview` altitude event (Director y ≥
     subject y + 10) counts if the colony clusters below discrimination all window. (Orbital
     motion alone is V4-blind — `glide()` tps continuously once any subject was ever set.)
  3. RCON `list` UNI-count/names identical before/after (no entity added/removed by the new
     node); **zero fenced directives EXECUTED** (counters may increment; effects may not).
     ALLOWED RCON writes = the camera's proven verbs on `Director` only (`tp`, `gamemode
     spectator`, `forceload`); FORBIDDEN = anything touching `UNI-*` or entities/items.
  4. Legacy `:4000` narration liveness across the window (colony untouched).
  5. **Supervised-restart repetition:** mid-window, kill `SP.Producer` (or restart the container
     once); `rest_for_one` recovers; ≥1 further reattachment event AND still exactly one
     `Director` in `list` (single-camera invariant live-tested).
- **FALSIFIES (ANY of):** directives issued with no reattachment (the pre-registered **V4**
  outcome — surfaced, not masked); `driver≠producer`; any new-node world/colony mutation;
  `rows=[]`/`colony_count=0` while the legacy node still serves (transport broken);
  Director join/leave flapping (kick-fight = orphan camera = two variables).
- **INCONCLUSIVE (not FAIL):** zero star/glide directives across the window (a calm colony under
  hold/narration beats has no bounded-time cut guarantee) → extend to 30 min → verdict WITHHELD
  if still zero. Perseveration tripwire: K=40 consecutive beats electing the same fenced action
  with zero camera directives ⇒ abort + INCONCLUSIVE, never a masked FAIL.
- **Mid-run ABORT (operator holds the verb):** UNI count/name drift attributable in-window;
  Director flapping; any evidence of an unfenced spawn/cull/kill.
- **Rollback:** stop `uni-producer`, restart `uni-cam` + original forwarder — restores Arm A
  exactly (both non-colony plumbing).

## 2. Ship-gate checklist
- [x] MERGED VERDICT SIGN-WITH-CHANGES recorded (§3); all 19 required changes integrated.
- [ ] `mix test test/sp/brain/` green (byte-identity, action-clone-invariance, novelty).
- [ ] New unit tests green: `fence_directives/2` identity on empty opts; fence replaces exactly
      `{:spawn}`/`{:cull,_}`/`{:health,:tps}`; `RemoteRows.fetch(nil)` local incl. failure branch;
      unreachable node → `[]`; row normalisation.
- [ ] Live pre-deploy receipts: one rpc probe pinning `SP.Runtime.Board.all/0` present +
      side-effect-free in the v2 image's loaded code, capturing one real row's keys.
- [ ] Gate row `producer-camera-attached` appended PENDING to `evidence/gates.ndjson` with
      `pre_registration_path` = this file, committed, pushed, BEFORE deploy.
- [ ] Every chip mutation individually owner-approved; colony containers untouched
      (capture-before-destroy NOT triggered — if that ever changes, STOP and run
      `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` first).
- [ ] Verdict + receipts to `docs/receipts/`, gate row superseded with the verdict, every counted
      event re-derivable from the collector NDJSON + commit hash.

## 3. Review verdicts (lab-team adversarial review, 2026-07-15, protocol order)

- **Math-Breaker: SIGN-WITH-CHANGES** — "Math object: None" survives all 8 checks (no new logit
  term, no reward channel, colony-agent math untouched, defaults byte-identical). Falsified the
  draft's pure-read claim (remote `Colony.snapshot/0` = remote write via `ensure_started`);
  required MB1-MB5 (rpc retarget to `Board.all/0` + 500 ms timeout + shape receipt/normalise +
  failure-branch anchor + load-bearing env receipted).
- **Systems Architect: SIGN-WITH-CHANGES** — placement honest (lib/sp/show is the declared
  plumbing home; call sites stay in scanned dirs); supervision sound (`rest_for_one`: Producer
  crash leaves the camera up; driver re-asserts `:producer`); one-`uni`-law holds. Required
  A1-A6 (adopt MB verbatim + pin MFA live; `lib/sp/show.ex` joins the seam — local count reads
  0 and gate 1 was UNREACHABLE as drafted; spec into `docs/specs/`; single-camera invariant
  across restarts; fence the local facade; deployment completeness incl. `VIEWER_URL` and the
  allowed-vs-forbidden RCON enumeration).
- **RED Experimentalist: SIGN-WITH-CHANGES** — paired skeleton genuine, measurement layer
  rebuilt: E1-E6 (harness collector w/ frame-stamped ring; subject-REATTACHMENT metric on
  discriminating pairs — orbital motion is V4-blind; static-camera split into V4-FAIL vs
  INCONCLUSIVE→WITHHELD; seam-joined gate 1; restart repetition + preconditions + abort
  tripwires; evidence-bundle completeness + `pre_registration_path`).
- **Embodiment Designer: SIGN-WITH-CHANGES** — no need proposed, no preference smuggled; fence
  is post-decision severance. Required D1-D4 (Learning row corrected — learn flags all false, so
  the standing prediction error is UNLEARNABLE; perseveration regime named + instrumented +
  tripwired, latent at the 6-UNI C-peak; forbidden-fix fence; two-minds honesty line).
- **AIF Core Theorist (merger): MERGED VERDICT = SIGN-WITH-CHANGES** — 19 consolidated changes
  (all integrated above); reconciliation: the Math-Breaker/Embodiment contradiction on the
  Learning row resolved with code (`genome.ex` learn flags all false → Embodiment correct);
  A2≡E4 merged; A4/E5 complementary. "The rare clean case: a genuinely model-free change —
  transport + post-decision actuator severance — additive, opt-in, default byte-identical, claim
  fence intact, with its one honest cost named and instrumented rather than papered over."

Required follow-on artifacts: **typed spec** `docs/specs/producer_remote_sense_observe_only.md`
(landed) · **paired RED** = §1 above (this file is the `pre_registration_path`) · **ship-gate
checklist** = §2 above.
