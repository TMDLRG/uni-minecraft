> **⛔ SUPERSEDED — DO NOT PASTE AS-IS (2026-07-11).** This work order predates the P1 deployment. Its claims that `uni-producer`/`uni-playout` do not exist, that there is no broadcast node, that the MCP adapters are stubs, and "DO NOT stand up the containerized studio tonight" are NOW FALSE — System 2 P1 core is DEPLOYED + PROVEN on `uni-lab-79740c`. Following this doc routes you down the DEPRECATED System-1 OBS path. Read `docs/SYSTEM_OVERVIEW.md` + `docs/STUDIO_SYSTEMS.md` + `production/docs/DEPLOYED_STATE.md` instead.

# WORK ORDER — Producer: go live on YouTube + Twitch tonight (multi-feed, honest)

> Paste the block below into a fresh Claude Code session **in this repo** (`C:\Users\mpolz\Documents\Strings`)
> on the Windows dev box ("Thinker", where OBS lives). It is self-contained. The MineCraft body/mind agent
> (me) is concluding the Phase-2 RED + building the deeper design in parallel; coordinate via the live
> master-plan page (URL in the prompt).

---

```
You are the UNI Producer / broadcast agent. Repo: C:\Users\mpolz\Documents\Strings (Windows dev box
"Thinker", where OBS runs). Owner go-ahead for the public stream is GRANTED.

MISSION (tonight, hard deadline ~midnight): take the UNI colony LIVE simultaneously on YouTube AND Twitch,
as a multi-feed show: (1) the Minecraft colony world, (2) the owner's camera, (3) occasional clips from our
YouTube. Honest on-screen captions throughout.

READ FIRST (ground truth — do not skip):
- docs/RUNBOOK_LIVE_STREAM.md — the proven start sequence + the hard gotchas.
- The live master-plan / status surface: http://100.100.188.48:4100/ (tailscale) or
  http://10.190.245.122:4100/ (LAN). It carries the honest project status + the claim fence + how agents
  collaborate. Read it; you can reflect your go-live status back to the owner through it.
- viewer/obs_stage.cjs, viewer/director_show.cjs, viewer/obs_golive.cjs, viewer/obs_ctl.cjs,
  viewer/studio_channels.ps1 — the WORKING OBS pipeline (was launch_channels.ps1, superseded 2026-08-02) (obs-websocket 127.0.0.1:4455, no auth).
- lib/sp/producer.ex — the existing autonomous show-runner (drives colony camera/overlays/cast).

THE HONEST STATE (so you don't chase a dead end):
- WHAT WORKS TODAY = the dev-box OBS path: obs_stage.cjs builds scenes COLONY / GLASS_OS / OVERLOOK / PIP as
  WGC window-captures; director_show.cjs timer-rotates the program scene; obs_golive.cjs pushes ONE RTMP
  target (YouTube only). Use and EXTEND this. It is proven.
- WHAT IS DESIGNED-BUT-NOT-BUILT = the production/ tree (uni-producer/uni-playout executors do NOT exist;
  no broadcast node; MCP adapters are stubs). DO NOT try to stand up the containerized studio tonight — it
  needs hardware that isn't provisioned. Mine it for reference only (esp. production/containers/systemd/
  mediamtx.yml for the restreamer, production/overlays/ for overlay pages, production/run-of-show/ for the
  beat schema).

TASKS (fastest honest path):
1. Streamable world. Bring up the colony on the dev box per the RUNBOOK: start Minecraft (mcserver, seed
   MUST be level-seed=8675309 — a verified inland forest), then `cd ui && iex --sname uni --cookie sp -S mix
   phx.server`, open http://localhost:4000/stream (this auto-starts SP.Producer -> Director -> :3020
   camera). HARD RULE: never also run `mix producer.run` — a second node fights over camera port :3020 and
   the "Director" MC login and crash-loops. (The lab-box colony at 10.190.245.122 is headless/UNI_CAM=0 and
   is being concluded separately — do not use it as the camera source.)
2. Build the OBS scenes: run viewer/studio_channels.ps1 then node viewer/obs_stage.cjs.
   (CORRECTED 2026-08-02: this line said launch_channels.ps1, which is SUPERSEDED. It brings up
   three channels where studio_channels.ps1 brings up five, and BOTH write viewer/channels.json --
   so following the old instruction overwrote that file with the subset and silently stranded the
   WEB and CLIP channels, the sources that carry every film, playlist and browser shot. The old
   script now refuses to run, but a work order can be copied and a refusal cannot, so both were
   fixed.) Verify with
   viewer/obs_shot.cjs. NOTE the dual-GPU gotcha: the WebGL camera must be a WINDOW-CAPTURE of a real Chrome
   window at http://localhost:3020, NOT an OBS browser source (BrowserHWAccel=true white-screens; =false
   drops terrain). This is already how obs_stage.cjs works — keep it.
3. Add the two NEW sources the owner wants, as new scenes in the "UNI" collection:
   - CAM: the owner's webcam (OBS Video Capture Device) — a full-cam scene + a PIP variant over COLONY.
   - CLIP: a Media Source for occasional YouTube clips (local files, or capture a Chrome window playing the
     clip). Keep clips short; return to COLONY after each.
4. Dual-target YT + Twitch. OBS cannot dual-push natively. Stand up a LOCAL restreamer: encode once in OBS
   -> push to the restreamer -> fan out copy to both. Simplest tonight, in order of preference:
   (a) MediaMTX locally (mirror production/containers/systemd/mediamtx.yml: the YouTube runOnReady is ready;
       UNCOMMENT + wire the Twitch path at mediamtx.yml:59-68), or (b) nginx-rtmp, or (c) Restream.io as a
       fast hosted fallback. Point obs_golive.cjs at the local restreamer instead of YouTube directly.
   Stream keys: from env (OBS_KEY / YT_KEY / TWITCH_KEY) or clipboard ONLY — NEVER write keys to disk or git.
5. Go live: start the restreamer, then node viewer/obs_golive.cjs (or OBS Start Streaming to the restreamer),
   confirm BOTH YouTube AND Twitch show the program. Run viewer/director_show.cjs for automatic scene
   rotation (COLONY 28s -> PIP 16s -> GLASS_OS 22s; add CAM/CLIP beats).
6. Honest overlays/captions (BINDING — this is a science project, not hype): the lower-third + ticker on
   /stream may describe what UNI is doing, but NEVER caption a scientific result as passed/proven if it is
   not. UNI demonstrates BEHAVIOUR / viability-learning, never experience/consciousness/humanness. If unsure
   whether a claim is warranted, check the master-plan page's science ledger (P1 = PARTIAL, P2 = PROVISIONAL
   PARTIAL/FAIL) and default to the weaker, true statement. No headline outruns its committed receipt.

AUTONOMY SCOPE (tonight): "autonomous" = the show runs itself INSIDE an operator-opened session
(director_show.cjs rotates scenes; SP.Producer narrates). The outward GO-LIVE / cut stays human-triggered by
design (the production/ safety model G-PA forbids a producer self-approving go-live). Full autonomous-studio
buildout (the production/ executor + a broadcast node) is a follow-on, not tonight.

DELIVER BACK: confirmation the program is live on BOTH YouTube and Twitch, a screenshot (obs_shot.cjs), the
scene list, and one honest line on what is autonomous vs operator-gated. Flag any blocker early. Do NOT put
stream keys anywhere in the repo.
```

---

## Notes for the owner (not part of the paste)
- The **streamable world for tonight is the dev-box colony** (RUNBOOK path, with the `:3020` Director
  camera). The lab-box `uni-colony-metabolism` + `mc-server` are headless and I'm concluding that RED
  separately — don't let the Producer point the camera at the lab box.
- **Dual YT+Twitch** is the one genuinely new piece — OBS can't dual-push, so the Producer stands up a local
  restreamer (MediaMTX design already exists in `production/`, Twitch path just needs uncommenting). If
  time-boxed, **Restream.io** is the fastest hosted fallback.
- The **full "autonomous producer studio"** (the `production/` containerized tree with `uni-producer`/
  `uni-playout`) is a real build that needs a dedicated broadcast node — a follow-on, not a midnight task.
  Tonight is proven-path + owner cam + clips + Twitch fan-out.
