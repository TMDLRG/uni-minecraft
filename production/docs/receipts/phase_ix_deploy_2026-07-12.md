# Receipt — Phase IX: producer/playout/mixer shipped, built, and proven on-node

**Status: Phase IX deploy gate MET.** The show-runner (producer + playout + mixer scene build +
overlays-on-program gate) is deployed on `uni-lab-79740c`, boot-persistent, and proven end-to-end.
Every claim below is backed by a captured gate output, not process existence.

Node: `uni-lab-79740c` (mesh `10.13.13.3`). All mutations via the uni-lab MCP, `os_exec`
dry_run→confirm, one human approval each. Ship discipline: `git archive` of a pushed+tagged ref →
sha256 → LAN fetch on-node → `sha256sum -c` before unpack (CLAUDE.md rule 2).

## What shipped

- **Tag** `prod-firstlight-20260712T0010Z-e` (commit `1e080db`), `production/` subtree, tarball
  sha256 `4d589e998a429a45ef1411d58139f346ca931c3d6a16d028f9e68d66efc0535d`, sha-verified on-node
  (`ship-e.tar.gz: OK`). Provenance stamped in `/var/lib/uni/broadcast-src-b/SHIP_PROVENANCE.txt`.
  The a5d1a85 P1 lock (`/var/lib/uni/broadcast-src`) was left untouched — this ship staged to a
  separate `broadcast-src-b`, so the DEPLOYED_STATE control-file lock stays valid (re-proven below).
- **Installed:** `/opt/uni/production/{producer,playout,mixer}` (add-only; `mcp/` etc. untouched);
  host units `/etc/systemd/system/uni-{producer,playout}.service`; run-of-show config to
  `/var/lib/uni/broadcast/run-of-show/` (weekly-grid.yaml, slot-4h.yaml, templates/, GUIDE.md).
- **Venv deps** (were missing — the live MCP's OBS/TTS paths had never been exercised on-node, so
  its 401 "healthy" signature never needed them). `pip install` into `/opt/uni/.venv` (Python 3.13):
  `websocket-client 1.9.0` (obs adapter), `requests 2.34.2` + `urllib3 2.7.0` +
  `charset_normalizer 3.4.9` (tts adapter). Captured in `/run/uni-pip.log`.

## Gates captured

1. **Scene build — `BUILD COMPLETE (8 scenes)`** (`/run/uni-buildscenes.log`). 8 canonical scenes
   (COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP), program parked on **STANDBY**, Fade 400ms.
   Canvas pinned `[0/9] pinning OBS canvas -> 1280x720@30 (was 1920x1080)` → `canvas now 1280x720`.
2. **Overlays-on-program proof — `SCENE PROOF: PASS`** (`production.mixer.verify_scenes`,
   `/run/uni-verifyscenes.log`): the program scene AND STANDBY both carry
   `ovl_lower3rd, ovl_ticker, ovl_caption, ovl_onair, ovl_title, ovl_clock` (enabled, → 127.0.0.1:8099);
   STANDBY additionally carries `ovl_standby`; `:8099/overlays/state.json` parsed. This is the
   System-2 analog of `viewer/verify_overlays.cjs` and closes the "System 2 has no overlays-on-program
   gate" hole. (First-light receipt #4.)
3. **Services up, boot-persistent.** `uni-producer` + `uni-playout` `systemctl enable --now`
   (symlinks created in `multi-user.target.wants`). Producer log: clean start, no errors. Playout log:
   `(re)loaded: catalog rows=0, templates=8, weekly-grid days=7`, `entering slot SUN-S1`, watchdog
   active. `producer.ndjson` shows a continuous standby beat loop (sb-01-hold ↔ sb-02-reel) + a
   watchdog cutover — the standby/fallback machinery works.
4. **Show-runner wiring proven end-to-end.** Injected one `start_segment` in playout's exact wire
   shape (`{"cmd":"start_segment","args":{"template":"news-desk","params":{"language":"en"}}}`) into
   `queue.jsonl`; `producer.ndjson` recorded `{"event":"run_template","template":"news-desk",
   "segmentId":"manual-verify-newsdesk", audit_id 24facfcf...}` then beats `nd-01-title`(TITLE) and
   `nd-02-anchor-intro`(NEWSDESK). playout → producer → template beats → OBS scene cuts, confirmed.
5. **Honesty covenant intact.** Throughout the news-desk run, `broadcast.json` `onAir.text` stayed
   `"STANDBY"` (never a fake `"LIVE"`). Only a human `start_broadcast` or an explicit `set_live` from
   playout may claim LIVE.
6. **P1 core untouched — `P1 PROOF GATE: ALL PASS`** (`verify_p1.sh`, postship): overlays :8099,
   relay :9997, mixer :4455 (426), production-MCP :8095 (401 double-probe), + all 5 control-file
   sha256 locks match the DEPLOYED_STATE table. (First-light receipt #2, postship.)

## Three real bugs caught by RUNNING the services (not by inspection)

- **OBS canvas was 1920x1080, build assumed 1280x720** → overlays landed in the top-left quadrant.
  Fix (commit `07ce965`): `build_scenes` now pins base+output+fps to the 720p30 floor (ADR-PROD-003 /
  G-ENC) as step 0 — the set-once builder is authoritative regardless of the OBS/container default.
- **Every template's `{layer: nowPlaying}` beat overlay raised "unknown overlay layer"** (nowPlaying
  is a broadcast.json block with its own `set_now_playing`, not a `set_overlay` layer). Fix (commit
  `a29f2d6`): the producer special-cases `nowPlaying` like `onAir` and routes it to `set_now_playing`,
  an explicit beat value winning over the per-beat auto-default. Honors the authored GUIDE/template
  contract; kills the per-beat error noise.
- **playout's `start_segment` command was dropped** ("unknown queue cmd ignored") — the producer's
  dispatch only knew `run_template`/`cutover`/`resume`/`set_live`, so it never ran the scheduled
  run-of-show. Fix (commit `1e080db`): `_handle_run_template` now reads playout's `args`-wrapped shape
  and is registered under both `start_segment` (playout's real command) and `run_template` (alias).
  This is the fix gate #4 proved.

## Honest caveats / follow-ups (not blockers for a non-broadcasting idle system)

- **Colony posture (Phase XIV = WITHHELD) — RESOLVED via a reversible gate.** The colony lane's
  forage RED verdict is WITHHELD (commit `3bec962`: "hunt loop did not engage, both arms starved";
  confirmed by the colony lane) — no proven colony survival. Per the plan's Phase XIV FAIL path,
  first-light is **STANDBY + CLIP + TITLE only**. Initially the deployed run-of-show still cued the
  COLONY scene (colony-live template ×2 slot segments + news-desk/explainer colony cut-ins = 8
  `scene:COLONY` beats). **Fixed 2026-07-12 (commit `3ddbfd0`, tag `-f`):** the producer now gates any
  COLONY-scene beat to STANDBY unless `UNI_COLONY_ONAIR` is set (default off). **Proven on-node:** an
  injected `colony-live` segment logged `beat cl-01-open: COLONY scene gated off (colony not proven
  on-air; UNI_COLONY_ONAIR unset) -> STANDBY` — the dead source never reached program. One switch to
  restore when the colony passes its RED: `UNI_COLONY_ONAIR=true` in `/etc/uni/runtime.env` + restart
  `uni-producer`. Owner to flip: colony-gate reconciliation + operator.
- **Canvas-pin persistence.** `build_scenes` pins 720p at build time. `production/containers/
  obs-entrypoint.sh` sets `UNI_BCAST_WIDTH/HEIGHT=1280/720` but the running OBS still came up at
  1920x1080 (it defaulted to the Xvfb screen). So on a mixer-container restart the canvas may revert
  until `build_scenes` is re-run. Follow-up: make `obs-entrypoint.sh` actually apply the base canvas,
  or run `build_scenes` on mixer start.
- **Catalog is empty** (`catalog rows=0`) — Phase V (catalog.json bootstrap + placeholder.mp4 +
  music bed) not yet staged; playout tolerates this honestly (roll_clip/standby-reel content
  unavailable, live grid still runs). A deliberate `layout: nowPlaying` cleanup across templates was
  made unnecessary by the producer-side fix.
- **Transient gate units** (`uni-buildscenes`, `uni-verifyscenes`, `uni-pipinstall`) live in
  `/run/systemd/system` (tmpfs — gone on reboot, by design). The durable gates are the committed
  `production.mixer.{build_scenes,verify_scenes}` modules; a persistent wrapper unit is optional.
- One `manual-verify-newsdesk` line remains in `queue.jsonl` (the wiring-proof injection, already
  consumed; the producer offset is past it) — left as an honest record of the test.

## Ship trail (tags this phase)

`prod-firstlight-20260711T2332Z-b` (initial producer/playout/mixer) → `-c` (canvas-pin) →
`-d` (nowPlaying) → `-e` (start_segment). Only `-e` is deployed; earlier tags are the incremental
fix history. All pushed to `origin/lab/ozone-life-uni-hard-science`.
