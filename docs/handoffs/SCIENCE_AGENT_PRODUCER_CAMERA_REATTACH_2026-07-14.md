# SCIENCE-AGENT LAUNCH PROMPT — reattach the Producer UNI to the live camera (2026-07-14)

> **✅ EXECUTED 2026-07-15 — gate `producer-camera-attached` = PASS (evidence class A).**
> The diagnosis REVERSED this doc's premise: the living v2 Producer was running inside
> `uni-colony` the whole time (`driver=:producer`, `port:nil`) — its camera directives died in
> `cam_write(nil)`. Owner chose option (a)-class (new HEAD show-runner node `uni-producer`,
> observe-only fenced, rpc-sensing the real board; colony untouched). Verdict receipt:
> `docs/receipts/producer_camera_attached_verdict_2026-07-15.md` · pre-registration + review:
> `docs/receipts/producer_reattach_remote_sense_spec.md` · spec:
> `docs/specs/producer_remote_sense_observe_only.md`. Remaining: studio re-points OBS to
> `producer.uni-lab.local:4200/stream` (narration-camera coherence); persist the `:4200` nft
> rule (task chip). This banner closes the handoff; the text below is preserved as written.

> **How to use:** paste everything below the line into a fresh Claude Code session in this repo.
> Written by the studio agent 2026-07-14 evening after live, read-only diagnosis. All facts below
> carry their probe timestamps. The studio agent touched NOTHING on the chip — every command run
> was read-only (`podman ps/logs/inspect/port`, `curl`).

---

You are the **science agent** for UNI.Minecraft (Stratified Palimpsest), per CLAUDE.md's two-track
rule. Read `CLAUDE.md` in full first, then `docs/LAB_PROTOCOL.md`,
`docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md`, and
`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`. This prompt supersedes the 07-13
handoff's *remedy* (full brain redeploy) — the owner has explicitly withdrawn that as the next
step. Your mission is narrower and different.

## The owner's directive (binding, verbatim intent)

The colony is ~926 in-world days old and has been running for years of wall-clock time. **The
owner forbids replacing, redeploying, restarting, or otherwise touching the living colony
(`uni-colony` container, the world, the UNIs' minds) for this fix.** The UNIs are to be observed
and followed live, as they are. The broken thing is the CAMERA ATTACHMENT, and the owner's own
diagnosis — which the studio agent verified — is correct: *"there is just not the UNI attached."*
The Producer UNI (the unique UNI that flies the camera and reports the show) is not connected to
the camera that is currently rendering. This is a go-live blocker: the owner will not take the
colony scene to a broadcast test in this state.

**Timeline (owner's report + container evidence agree):** camera-follow WAS working during the
owner's last live stream of UNI.Minecraft, driven by the real Producer
(`docs/RESUME_RUNG1.md:99-127` — `mix producer.run` + `cd ui && mix phx.server`, 2026-07-11 era,
commits `24d88f4`/`61671b0`; see also the puppet-cam incident `68d8cc6`→`307b8a1`). It broke
within the last 3 days. On **2026-07-13, 03:50–05:46 UTC** the camera path was re-plumbed into
standalone containers (`podman ps` CreatedAt, probed 2026-07-15 02:05 UTC):

| container | image | created | state | role |
|---|---|---|---|---|
| `uni-cam` | `localhost/uni-cam:v1` | 2026-07-13 05:44 | Up 44h | runs `director.js` standalone against `mc-server:25565`, viewer on `:3020` (its own log: `"[uni-cam] starting director.js against mc-server:25565 (VIEWER on :3020)"`) |
| `uni-viewer-cam-fwd` | alpine/socat | 2026-07-13 05:46 | Up 44h | host `:3020` → `uni-cam:3020` |
| `uni-viewer-mc-fwd` | alpine/socat | 2026-07-13 05:37 | Up 44h | host `:25565` → `mc-server:25565` |
| `uni-viewer-fwd` | alpine/socat | 2026-07-13 03:50 | Up 46h | host `:4000` → `uni-colony:4001` |
| `uni-viewer-in` | alpine/socat | 2026-07-13 03:50 | Up 46h | `:4001` → `127.0.0.1:4000` |
| `uni-colony` | `localhost/uni-colony:v2` | 2026-06-22 | Up 46h | THE LIVING COLONY — DO NOT TOUCH |
| `mc-server` | itzg/minecraft-server | 2026-06-25 | Up 2wk (healthy) | the world — DO NOT TOUCH |

## Why the camera is frozen (verified mechanism)

`viewer/director.js` is a spectator/camera bot driven ONLY over **stdin** (grammar at
`viewer/director.js:8-13`, parser `:171-200`): `star <user>` / `shot <type> <user|-> [params]` /
`flyto <user>` / `cut <user>` / `set k=v`. In the working 07-11 configuration,
`lib/sp/brain/director.ex` spawned it as an OS **Port** (`spawn_camera/1` `:577-598`, gated by
`UNI_CAM`) and wrote shots to that stdin (`cam_write/2` `:245-254`, `cut_to/3` `:602-605`);
under `driver=:producer` the beat handler (`:141-145`) skips its own rule-based cuts and the
camera moves ONLY on `SP.Producer` directives (`lib/sp/producer.ex:86-135`, `:240-302`;
`lib/sp/producer/brain.ex` picks actions by EFE minimization).

The 07-13 re-plumb moved `director.js` into the `uni-cam` container, where its stdin belongs to
the container entrypoint shell. **No Elixir Port, no Producer, no stdin writer.** `director.js`'s
`subject` is a module-level variable that never expires — `glide()` keeps orbiting the last
subject forever — so the camera still renders (owner's screenshot: `:4000/stream`, "THE COLONY ·
Day 923", live narration + per-bot cards updating) while never changing shot. Narration and
camera are structurally decoupled (`ui/.../stream_live.ex:37-43` polls `Director.broadcast()`
over HTTP; the camera is a separate `phx-update="ignore"` iframe to `:3020`, `:126-129`, `:252`),
so live narration is NOT evidence of an attached Producer.

**Fresh probe (2026-07-15 02:10 UTC):** `GET http://10.190.245.122:4000/producer/health` →
**`Phoenix.Router.NoRouteError`**. The node serving `:4000` doesn't even have the Producer health
route, while `/stream` on the same port narrates live. `driver=producer` is NOT VERIFIED. The
Producer UNI is not attached. (Open topology question you must resolve FIRST: which node/process
actually serves `:4000` behind the `uni-viewer-fwd`→`uni-colony:4001`→`uni-viewer-in`→`127.0.0.1:4000`
socat chain — and where, if anywhere, is a Phoenix node with the post-07-11 code running?)

## Your mission

Reattach the **real Producer** (`SP.Producer` + `SP.Brain.Director` from HEAD, `gen2-runtime`) to
the live camera, so the camera again cuts/follows the UNIs under genuine Producer control —
**without touching `uni-colony`, `mc-server`, the world, or any UNI mind.**

1. **Diagnose first, with receipts.** Resolve the `:4000` topology. Establish exactly what
   process narrates, what `driver()` it reports, and confirm no Producer is running anywhere.
2. **Surface the reattachment choice — do not silently pick** (this is ADR-PROD-013's open
   camera-mechanism decision, now concrete):
   - **(a) Port-respawn:** run the Producer's node so it spawns `director.js` as its own Port
     child (the proven 07-11 mechanism). Note the consequence: the standalone `uni-cam` container
     becomes redundant — two camera bots must NOT fight; decide and document which one lives.
   - **(b) Command bridge:** keep `uni-cam` as-is and bridge Producer shot-commands to its stdin
     (e.g., a small TCP→stdin listener). NOTE: `viewer/director.js` is STUDIO-track code — if this
     option needs changes there, hand that piece to the studio agent; do not edit `viewer/**`
     yourself.
   Present both to the owner with a recommendation before implementing.
3. **Honor the hard rules:** exactly ONE `--sname uni` Phoenix node ever (CLAUDE.md); the
   puppet-cam ban (`68d8cc6`→`307b8a1` — a self-orbiting camera with no real Producer is FAKE and
   was killed by owner directive once already; never "fix" this by letting `director.js` drive
   itself); one cure at a time; mutations on the chip go through the uni-lab MCP approval queue;
   if — and only if — some container mutation becomes truly unavoidable, run the FULL
   capture-before-destroy procedure first AND get explicit owner approval in chat; no FE-engine
   code changes without `/lab-team-review` MERGED VERDICT (re-RUNNING existing HEAD code is not an
   FE change; editing `lib/sp/**` is).
4. **Pre-register the gate before the fix** (append PENDING row to `evidence/gates.ndjson`, then
   supersede with the verdict):
   - **`producer-camera-attached`** — PASS: a fresh `GET /producer/health` you run returns 200
     with `driver=producer`, AND over a ≥10-minute observation window the `:3020` camera performs
     ≥3 distinct Producer-issued shot changes (log the issued directives and correlate with
     observed camera motion), AND narration remains live. FALSIFIES: camera static across the
     window; or `driver≠producer`; or directives issued but camera unresponsive (that outcome is
     pre-registered as V4 in the 07-13 handoff — surface it, don't mask it).
5. **Hand back proof, not prose:** probe outputs with timestamps, the gate row, and a short
   receipt doc under `docs/receipts/`. The studio agent treats `producer-camera-attached` as a
   broadcast-readiness blocker for the colony scene until it reads PASS.

The camera is real, the world is real, the narration is real. The only missing thing is the
Producer's hands on the wheel. Attach the UNI; change nothing else.
