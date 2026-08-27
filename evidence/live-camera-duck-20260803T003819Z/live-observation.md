# LIVE OBSERVATION — passive window 2026-08-03 00:42:43 to 00:48:46 UTC

## What I could observe live

**voice_server precedence:** proven decisively. During ~90 seconds of voice_server speech
(three say calls), music_director's camera-duck path emitted 30+ consecutive `CAM_DUCK_CEDED
owner=voice_server reason=owns:healthz_active` events — zero fader writes while voice_server
owned the fader. This is exact RED-5 behavior in the wild, evidence class A.

**RESTORED → DUCK edge:** proven. At 00:42:43, hydration completed with RemoteCam1 UI-unmuted,
engine captured `CAM_DUCK_CEILING_CAPTURED opLevelDb=-20.7`, then issued exactly ONE
`CAM_DUCK_WRITE state=DUCK targetDb=-35.7` — the operator level minus DUCK_DB=15. Fader
verified at -35.7 dB post-write. NO subsequent writes for the next several minutes (engine dedup
correctly suppressed them). The ratchet defect from the first deploy attempt (00:39:05-00:39:12,
walked -20.7 → -95.7 in 15 dB/tick) is CURED — see the CAM_DUCK_CEILING_CAPTURED receipt as
proof of the fix path.

**outputSkippedFrames:** exactly 441 at every check across the whole exercise — before the
first deploy attempt, during the ratchet (which never dropped a frame either), after emergency
kill + manual restore, after redeploy with fix, and after 90 s of voice traffic on top.
Baseline preserved. Stream never disturbed. Evidence class A.

**Only music_director restarted:** voice_server PID 29500 stable throughout, command_center PID
20524 stable, launcher PID 28136 stable, publisher.cjs PID 40356 stable. music_director went
3220 → 2232 (killed for ratchet) → 36976 (current). All other PIDs unchanged. Evidence class A.

## What I could NOT observe live (NOT_MEASURED)

**DUCK → TUCK transition (unmuted-cold → unmuted-hot).** In the observation window, camera was
either ceded to voice_server (voice was speaking) or the camera mic peaks stayed below HOT_DB
(-45 dB). No live TUCK write observed. The engine's TUCK behavior is proven off-air via RED-1
(evidence class E), but not confirmed as A evidence in this session.

**TUCK → DUCK 10-s trailing.** Same reason — no live TUCK observed to trail from. Proven
off-air via RED-4 (E).

**All-cams-remuted → RESTORED write.** Camera stayed unmuted throughout; no live RESTORED
write. Proven off-air via RED-3 (E).

## An honest edge-case I found (worth reporting, not a falsifier per se)

At 00:47:52, voice_server emitted `restore bed=ShowRadio to=-20.700000762939453` — but the
pre-voice fader was at -35.7 (the camera-DUCK level). Root cause: voice_server's ratchet-guard
added earlier today (viewer/voice_server.cjs:181-186, `duck_rejected_floor_level`) treats any
fader ≤ DUCK_FLOOR_DB + 1 = -29 dB as "already at the floor" and uses `lastRestingDb` instead
of the observed value. Since -35.7 ≤ -29, voice_server rejected the camera-DUCK level as
suspicious and restored to lastRestingDb (-20.7, the operator level captured much earlier).

Net effect: after voice_server speaks while a camera is UI-unmuted, the fader lands at the
OPERATOR level, not the camera-DUCK level. Not audible harm (the operator hears their music
at their own set level), and NOT a falsifier per the gate list (no falsifier says "the
DUCK level must survive a voice_server duck cycle"). Recorded honestly rather than hidden.

Fix options (do not implement without operator go-ahead):
  a) Camera engine detects live-fader-drift and re-issues its target on next tick.
  b) voice_server's ratchet guard is scoped to only "at or very near DUCK_FLOOR" (±0.5 dB),
     so it recognizes -35.7 as a legitimate camera-DUCK level, not a duck-floor artifact.
  c) Widen DUCK_FLOOR_DB in voice_server (currently -30) below the camera-DUCK level so the
     guard doesn't trigger. This has audible consequences on voice ducking depth.

Owner-decision: (b) is probably right — the guard exists to handle the specific case of a
fader stuck AT the duck floor, not below it. The current threshold is too generous.

## Current fader (post-observation, still-with-cam-unmuted)

-20.7 dB (operator level). Camera unmuted (RemoteCam1). Engine cedes to voice_server every
1.5 s while voice_server is speaking, deduped otherwise.
