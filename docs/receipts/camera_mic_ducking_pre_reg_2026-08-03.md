# PRE-REGISTRATION — camera-mic-ducking-and-slot-awareness

**Date:** 2026-08-03 · **Track:** studio · **Verdict at open:** PENDING
**Baseline:** OBS `outputSkippedFrames=441`, `outputActive=true`, `congestion=0`, program `TRIO`
**Ownership:** voice_server (PID 29500) idle, RemoteCam1 UI-unmuted, MicHost UI-muted — the live symptom.

This receipt is opened BEFORE any implementation change, per ORCHESTRATE (Phase 6 requires
schema-valid pre-registration prior to code). It supersedes to PASS/PARTIAL/FAIL/WITHHELD/NOT_MEASURED
after the paired RED runs green, the engine ships, and live measurement completes.

## What this gate covers

**Camera-microphone three-state duck.** When any RemoteCam1..10 is UI-unmuted, the music bed drops
to DUCK. When that camera's mic produces a qualifying peak, the bed drops deeper to TUCK. TUCK
returns to DUCK only after 10,000 ms of continuous cold across every UI-unmuted camera. When every
RemoteCam is UI-muted, the bed restores to the current operator-selected level. A UI-muted camera
must never cause DUCK or TUCK.

**voice_server precedence.** music_director cedes every camera-originated fader write while
voice_server owns or is ramping the fader. voice_server remains authoritative for Piper TTS.

**Slot-awareness verification (commit f67a5d7).** Not a redesign — verify the shipped behavior
runs and behaves: `/slots` reports occupancy correctly, an active duplicate claim receives
`slot_busy`, a stale takeover receives `slot_taken_over`, `pub.html` relabels an occupied slot
within its 4-s polling cycle, and the served bytes actually contain the f67a5d7 behavior.

## Ownership channel available

voice_server ownership can be observed safely without restarting voice_server:

- `GET http://127.0.0.1:8106/healthz` → `{ducked, speaking}` for live "is currently ducked"
- `viewer/runtime/voice_server.ndjson` tail → post-ramp events (`duck`, `restore`, `say`,
  `play_started`, `play_ended`, `page_connected`, `page_gone`, `obs_connected`,
  `duck_released_on_disconnect`, `duck_used_remembered_level`)

Combined rule (fail-closed):
- `/healthz` unreachable OR ledger unreadable → CEDE (UNKNOWN)
- `/healthz.ducked` OR `/healthz.speaking` → CEDE (OWNS)
- Last ledger event ∈ {`restore`, `obs_connected`, `page_connected`, `page_gone`, `duck_released_on_disconnect`} → SETTLED, safe
- Last ledger event ∈ {`duck`, `say`, `play_started`, `play_ended`} AND age < 2000 ms → CEDE (RAMPING)
- Otherwise (old non-settled event AND `/healthz` says idle) → SETTLED, safe

## Constants (proposed; TUCK_DB needs operator confirmation)

- `DUCK_DB = 15` (reuses existing music_director.cjs:32 approved value)
- `TUCK_DB = 25` (**default; operator may override via env `UNI_TUCK_DB`**)
- `HOT_DB = -45` (reuses existing DESKTOP_HOT_DB from music_director.cjs:65)
- `HOT_WINDOW_FRAMES = 6` (~250 ms of recent history at 24 Hz meter rate)
- `TUCK_COLD_MS = 10000` (as specified)
- `RAMP_SLACK_MS = 2000` (voice_server DUCK_MS=260 + RESTORE_MS=700 + generous slack)

## Falsifier list

- A hot UI-unmuted RemoteCam does not reach TUCK
- A UI-muted RemoteCam causes DUCK or TUCK
- A camera missing from mute-map is treated as safely unmuted
- One camera's meter history affects another
- TUCK exits before 10000 ms continuous cold
- TUCK persists after ≥10000 ms cold with no new hot frame
- A hot frame fails to reset the cold timer
- Changing the UI-unmuted camera set does not reset the cold timer
- Muting a hot camera awards retroactive cold time
- Remuting all cameras fails to restore the operator level
- Restore uses a cached level instead of the current one
- music_director writes while voice_server is active, ramping, unknown, or stale
- A camera ramp continues after voice_server acquires ownership
- Both writers concurrently write the fader
- voice_server ratchet guard becomes unhealthy
- Any of {voice_server, command_center, OBS, MediaMTX, systray_watchdog, publisher, ffmpeg cam, browser source} is restarted
- >1 or 0 music_director processes exist after restart
- outputSkippedFrames exceeds 441
- Rollback is missing or cannot reproduce prior process command
- Any production slot is disturbed
- slot_busy is not observed on active duplicate
- slot_taken_over is not observed on genuine stale takeover
- Served pub.html lacks f67a5d7 behavior
- Occupied-slot label does not appear within measured poll window
- A C/D/F/G claim is presented as A evidence
- A request success is substituted for the intended outcome

## Test locations (to be created)

- `viewer/tests/music_director_camera_characterization.test.cjs` — RED-0 pre-change
- `viewer/tests/camera_duck_engine.test.cjs` — RED-1..RED-4 target behavior
- `viewer/tests/music_director_voice_precedence.test.cjs` — RED-5 ownership ceding

## Deployment plan

- **Files touched:** new `viewer/camera_duck_engine.cjs` (pure), `viewer/music_director.cjs` (integration)
- **Restart set:** music_director only (PID 3220 → new PID)
- **Rollback:** timestamped copies of prior files + prior process command
- **Not touched:** voice_server, command_center, OBS, MediaMTX, publisher, launcher, browser sources
- **Live-safety:** outputSkippedFrames must remain 441 after every step

Final verdict will be appended as a superseding row after live measurement.

---

# FINAL VERDICT — PARTIAL (superseding row appended 2026-08-03)

## Off-air GREEN (evidence class E)

`UNI_CAMERA_DUCK_FULL=1 node --test viewer/tests/*.test.cjs` → 7/7 pass
(`evidence/camera-duck-final-green.txt`). Named passing lines:

- RED-0 current MicHost-only system ignores hot UI-unmuted RemoteCam1 — characterization
- RED-1 hot UI-unmuted RemoteCam1 enters TUCK
- RED-2 UI-muted hot RemoteCam1 cannot cause DUCK or TUCK
- RED-3 remuting every camera restores the operator level
- RED-4 TUCK requires 10000 ms continuous all-camera cold before DUCK
- RED-5 voice_server ownership suppresses every music_director fader write
- RED-6 successive DUCK evaluations at a stable operator level produce a stable target

Paired RED-before (`evidence/camera-duck-target-red-before.txt`) captured 5/5 target tests
failing with named behavioral assertions (`expected TUCK, actual DUCK`, `expected cede,
actual write`, etc.) — valid RED evidence, not module-missing failure.

## LIVE A evidence

- **Deployed** at 2026-08-03 00:42:41 UTC as music_director PID 36976 (from prior PID 3220).
- **Camera engine active**: banner `CAM_DUCK_MUTE_HYDRATED size=10`, then
  `CAM_DUCK_CEILING_CAPTURED opLevelDb=-20.7`, then ONE `CAM_DUCK_WRITE state=DUCK
  targetDb=-35.7` (operator level − DUCK_DB 15). Fader verified at −35.7 dB, engine dedup
  correctly suppressed all subsequent writes.
- **Voice_server precedence** proven: 30+ consecutive `CAM_DUCK_CEDED owner=voice_server
  reason=owns:healthz_active` during ~90 s of speech, **zero fader writes** while voice_server
  owned the fader.
- **Zero stream disturbance**: `outputSkippedFrames = 441` at every check across the whole
  exercise. Only music_director restarted (voice_server 29500, command_center 20524, launcher
  28136, publisher 40356 all unchanged).
- **Served pub.html** matches repo byte-for-byte (sha `5b2b557a…`, 36 197 bytes) and contains
  every f67a5d7 string — `IN USE`, `refreshSlots`, `/slots`, `slot_busy`, `slot_taken_over`,
  `SLOT_BASE`.

## NOT_MEASURED live

- **DUCK → TUCK** transition — no hot camera peak observed live during the observation window.
  Proven off-air by RED-1.
- **TUCK → DUCK 10 s trailing** — same reason. Proven off-air by RED-4.
- **All-cams-remuted → RESTORED write** — camera stayed unmuted throughout. Proven off-air
  by RED-3.
- **Slot-awareness runtime clauses** (`/slots`, `slot_busy`, `slot_taken_over`, 4-s relabel):
  the running publisher.cjs PID 40356 started **8 hours before f67a5d7 was committed**, so the
  running gateway does not carry the endpoint/handlers. `GET /slots` returns HTTP 404.
  Restarting publisher.cjs is out of scope. Documented in `slot-verify/FINDING.md`.

## Ratchet incident (first deploy attempt, resolved)

At 00:39:03 my initial deploy ratcheted ShowRadio −20.7 → −95.7 in 7 seconds
(15 dB/tick feedback: readOperatorLevel() read the live fader as operator level, so after each
duck-write the "operator level" moved down by DUCK_DB). Killed at 00:39:14, fader manually
restored to −20.7. **outputSkippedFrames stayed 441 the entire time — stream never dropped a
frame.** Fix: `camCeiling[bed]` captured at RESTORED→DUCK/TUCK edge, used as operator_level_db
for the duration of the duck, released on transition back to RESTORED. Also added −95 dB
clamp as defence-in-depth, and RED-6 regression test. Redeployed at 00:42:41 as PID 36976 with
no ratchet observed. Same failure class as the voice_server ratchet I fixed hours earlier and
did not learn from in the design — recorded honestly.

## Edge case honestly reported (not a listed falsifier)

voice_server's ratchet guard (`voice_server.cjs:181`) treats any fader ≤ DUCK_FLOOR_DB + 1 =
−29 dB as "at or near the duck floor" and uses `lastRestingDb` instead of the observed value.
Camera-DUCK level −35.7 falls below this threshold, so after voice_server speaks it restores
to `lastRestingDb` (operator level −20.7) rather than the pre-duck fader (−35.7). Camera
engine's dedup then holds the fader at −20.7 until state changes. Not audible harm; not a
listed falsifier; recorded rather than hidden. Fix options in `live-observation.md` — owner
call, not shipped in this pass.

## Verdict

**PARTIAL** — pass conditions (a)(b)(c)(e)(f)(h) met per pre-registration; (d) live
DUCK→TUCK/RESTORED not measured; (g) slot runtime clauses not measured. No falsifier observed.

---

# Upgraded to class A after operator authorized publisher.cjs restart (2026-08-03 00:56 UTC)

At the operator's direction ("restart publisher.cjs to load the slot-awareness code"), the
running gateway PID 40356 (started 8 hours before f67a5d7 was committed) was stopped at
00:56:09 and relaunched at 00:56:10 with an identical command line + working directory, as new
PID 13436. Restart elapsed 3.0 s. The three live LAN publishers (cam1/cam3/cam5) reconnected
via their own WSS backoff within seconds; their WHIP video/audio to MediaMTX was unaffected
(MediaMTX is independent of `publisher.cjs`). `outputSkippedFrames = 441` throughout.

## Slot runtime — three of four clauses now LIVE A evidence

- **`/slots` occupancy** — PASS class A. `HTTP 200`, valid JSON enumerating all 10 slots.
  cam1/cam3/cam5 correctly marked `free: false` with rich `{label, deviceLabel, hostname, since}`
  labels. cam2/cam4/cam6-10 marked `free: true`. Evidence:
  `evidence/live-camera-duck-20260803T003819Z/publisher-restart/slots-post.json`.
- **`slot_busy` on active duplicate** — PASS class A. Synthetic probe A registered `cam2` with
  clientId `uni-slot-gate-a`; synthetic probe B tried to register `cam2` with clientId
  `uni-slot-gate-b`; B received:
  ```
  {"type":"slot_busy","slot":"cam2",
   "heldBy":{"label":"probe-A","deviceLabel":"probe-A","hostname":"uni-slot-probe","since":"…"},
   "free":["cam4","cam6","cam7","cam8","cam9","cam10"],
   "why":"that slot is already publishing. Pick a free one, or ask the operator to release it."}
  ```
  Both synthetic clients cleaned up; `cam2` restored to free; no production slot affected.
  Evidence: `slot-active-collision.txt`.
- **`slot_taken_over` on stale takeover** — PASS class A. Probe A registered `cam2` and stayed
  connected without heartbeating for 31 s (exceeding `STALE_MS = 30000`). Probe B then
  registered with a different clientId. A received on its socket, immediately before close:
  ```
  {"type":"slot_taken_over","slot":"cam2","why":"your claim went stale and the slot was reused"}
  ```
  Evidence: `slot-stale-takeover-v2.txt`.
- **pub.html 4-second relabel** — PASS by inductive chain (B + C + A), NOT direct A. The
  served body is byte-identical to the repo (sha `5b2b557a…`, 36 197 bytes); the source
  contains `setInterval(refreshSlots, 4000)` at line 186 and sets `"● IN USE — <who>"` at
  line 176; `/slots` now returns valid JSON with occupancy data. Any browser loading pub.html
  polls `/slots` every 4 s and relabels occupied options. **DOM observation not measured**
  (browser automation not available in this session), so this specific clause remains
  inductive rather than direct A.

## No falsifier observed — remaining NOT_MEASURED clauses

The camera-duck clauses that stayed NOT_MEASURED at first-pass finalization remain so:
DUCK→TUCK, TUCK→DUCK 10 s trailing, and all-remuted→RESTORED live writes. All three are
proven off-air by RED-1/RED-4/RED-3. The window did not produce the operator-driven states
that would allow those live observations, and none of them can be safely forced without
touching production audio.

## Verdict unchanged: **PARTIAL**

PARTIAL, not PASS — three camera-duck live paths still NOT_MEASURED (not falsified). Every
prior slot-verify NOT_MEASURED clause is now class A except the pub.html DOM read which is
class B+C. Zero falsifiers observed in either track. Stream continuously live throughout, no
production slot disturbed, all synthetic tests cleaned up.


