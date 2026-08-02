# VERDICT: PASS — `producer-camera-attached` (2026-07-15)

**Gate:** `producer-camera-attached` (pre-registered PENDING in `evidence/gates.ndjson` at commit
`0ae5e6d`, BEFORE deploy; pre-registration `docs/receipts/producer_reattach_remote_sense_spec.md`;
typed spec `docs/specs/producer_remote_sense_observe_only.md`; lab-team MERGED VERDICT
SIGN-WITH-CHANGES with all 19 changes integrated).
**Cure (Arm B, one composite ownership variable):** container `uni-producer` (image
`uni-producer:v1` = `340fb888c2d2`, built on the chip from the pushed ref `5e1ba18`, tarball
sha256 `87bd7afe…c176` verified both sides) + `uni-cam`/`uni-viewer-cam-fwd` stopped (kept for
rollback) + `uni-viewer-cam-fwd2` re-pointing host `:3020`. **`uni-colony`, `mc-server`, the
world, and the UNI minds were never touched** (their uptimes span the whole operation;
capture-before-destroy not triggered).

## The RED window (collector NDJSON — every number re-derivable)

- **Collector:** `runs/red_producer_camera_collector.cjs` (harness-managed, ≤5 s cadence) →
  `runs/red_producer_camera_20260715T040735Z.ndjson` (committed). Analyzer:
  `runs/red_producer_camera_verdict.cjs` → `runs/red_producer_camera_verdict_out.json` (committed).
- **Window:** 2026-07-15 04:07:36Z → 04:21:08Z (13.5 min, 163 samples; +8 tail samples to
  04:21:48 in the continuity checks).

| Clause | Requirement | Measured | Verdict |
|---|---|---|---|
| 1 — health | 200, `verdict=LIVE`, `driver=producer`, seam-joined `colony_count=6`, frame advancing ≥60 s | `LIVE`/`producer` in **every** sample; `colony_count=6` in **171/171** samples; frame 119 (04:07:46) → 169 (04:21:48) | **PASS** |
| 2 — reattachment | ≥3 discriminating subject-reattachment events (sep ≥24 blocks → dist ≤12 within ≤15 s) | **31** star-change events; **18 discriminating; 18/18 reattached** (e.g. `b_roll` UNI-1-2→UNI-1-3, separation 63.5, camera at 10.1 blocks in the same 5 s sample) | **PASS** (6× margin) |
| 3 — no mutation | UNI roster identical; zero fenced EXECUTED; only camera RCON verbs | exactly **1** distinct 6-UNI roster across all samples; fenced counters `{}` (zero fenced choices — population sat at its C-peak, as pre-noted); Director flaps **0** | **PASS** |
| 4 — legacy liveness | `:4000` narration alive all window | `/stream` HTTP 200 in **163/163** samples | **PASS** |
| 5 — restart repetition | mid-window Producer kill → recovery, ≥1 further reattachment, still one `Director` | 04:13:35Z rpc kill: pid `<13247.637.0>` → new `<13247.1070.0>` in ≤4 s; **Director kept pid `<13247.636.0>` (survived — camera never blinked)**; **11** post-restart discriminating+reattached events (first at 04:13:52, 17 s after the kill); `Director` present in every `list`, 0 flaps | **PASS** |

**Falsifiers:** none fired — no V4 (18/18 events reattached), `driver=producer` throughout, no
world/colony mutation, transport never broke (`colony_count` never left 6), no kick-fight.
**INCONCLUSIVE conditions:** not triggered — 38 cut directives in-window (not zero);
perseveration tripwire max same-fenced run = 0 (vs K=40).

## Honest notes (limits of this verdict)
1. **Analyzer limitation, conservative:** the event stream is keyed by producer frame; the
   mid-window restart resets frames, so pre/post frame-spaces overlap (110–169) — the dedup
   DROPS some post-restart entries there (undercount) and can fabricate ≤2 boundary artifacts.
   The 11 post-restart events were therefore verified by **timestamp**, and the ≥3 threshold
   holds under the worst discount. Fix belongs in the analyzer if this gate is ever re-run.
2. **The fenced dead limbs stayed latent** (population at C-peak all window) — the observe-only
   fence's perseveration regime is instrumented (`fenced` counters on `/producer/health`) but
   NOT exercised by this RED, exactly as pre-registered. No claim is made about behaviour under
   population loss.
3. **Firewall persistence gap:** LAN `:4200` is open via a runtime nft rule (audit
   `e278400086a4484d`); it dies on reboot until the nftables boot file carries it (follow-up
   task chip spawned; do NOT `reload` nftables — it would flush netavark and break the ERP
   stack). The registry entry `producer.uni-lab.local:4200` carries `nv` until its probe is
   wired into the observability panel.
4. **Two Producer minds now sense the same colony** (pre-registered honesty line): the living
   v2 Producer inside `uni-colony` keeps its cast hands + the legacy `:4000/stream` narration;
   the new fenced HEAD node owns the camera + its own `:4200/stream`. Only one mind has hands.
5. `uni-cam` ignored SIGTERM at cutover and took podman's 10 s SIGKILL fallback (stateless
   camera process; no data). Its image/container are intact for rollback
   (`deploy/uni-producer/rollback.sh` = exact Arm A).

## Claim fence
This gate demonstrates the named BEHAVIOUR only: the deployed Producer node's EFE decisions
measurably drive the world camera (directive → camera motion, correlated server-side). It is a
broadcast-plumbing/mechanism claim. It carries **zero evidential weight** for awareness,
consciousness, or life, and does not touch the science gates (`forage-pureworld-graduation`
remains the colony-scene-on-program blocker per `goLiveGate`).

## Hand-off to the studio agent
`producer-camera-attached` = PASS unblocks the camera half of the colony scene. The narration
half: point the OBS colony-scene browser source (OVERLOOK / `cap_overlook`) at
`http://producer.uni-lab.local:4200/stream` (the HEAD page whose narration + cards + camera
iframe are ONE mind — VIEWER_URL is baked to the LAN `:3020` camera) instead of the legacy
`:4000/stream`, so the on-air narration matches the picture. That re-point is a studio-track
change with its own gate (`verify_overlays` + the pre-air `driver=producer` check now answers
on `:4200/producer/health`).
