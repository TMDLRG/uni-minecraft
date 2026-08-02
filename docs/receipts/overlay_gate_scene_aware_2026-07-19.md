# Receipt — the overlay gate is scene-aware (stops crying wolf on music scenes)

**Date:** 2026-07-19 · **Track:** studio · **Surface:** THINKER · **Class:** A (independently reproduced,
failure rehearsed both directions on the live program)
**Gate:** `overlays-up` — behaviour corrected, not loosened.

## The defect

`viewer/verify_overlays.cjs` hard-coded ONE expected list:

```js
const REQUIRED = ["ovl_lower3rd", "ovl_ticker", "ovl_caption", "ovl_onair"];
```

and asserted it against whatever scene was on program. But the stage does not put the same chrome on
every template (`viewer/studio_stage.cjs`): music scenes deliberately DROP the duplicate now-playing
chrome (hero card + lower-third + corner chip all said the same track), `STANDBY` carries only its
slate, and `MUSIC_CARD` has a bespoke set. So on 2026-07-19, live on air, the gate reported:

```
OVERLAY PROOF: FAIL — source 'ovl_lower3rd' is NOT in program scene 'COLONY_SIDE_MUSIC'
                      — stage never built (run studio_stage.cjs)
```

The stage was built correctly and the overlays were airing correctly. The gate was wrong, and its
advice ("run studio_stage.cjs") would have **rebuilt every scene and cut program to COLONY mid-show**.
A gate that cries wolf on a healthy system is worse than no gate: it trains the operator to ignore it,
and here it also pointed at a destructive remedy.

## The fix

The expectation now comes from the module that BUILDS the scenes, so the two cannot drift:

- `studio_stage.cjs` exports `expectedOverlaysFor(sceneName)`, derived from the BUILT `SCENES` object
  (so appended music chrome and voice anchors are accounted for). Items declared `disabled: true`
  are excluded — `ovl_lyrics` is created intentionally dark on `MUSIC_HOUR` and must not be demanded.
- Unknown scene returns `null` and the gate FAILS honestly rather than silently passing.
- `verify_overlays.cjs` asks for the current scene's declared set and verifies present + enabled +
  pointing at `127.0.0.1:8099`.
- Overlays enabled but NOT declared for the scene are reported as a NOTE, not a failure —
  `ovl_lyrics` is a documented per-segment operator choice. Surfaced anyway, because a stale
  lower-third bleeding onto a music scene is a defect this project has shipped before.

**Load-bearing safety detail:** `studio_stage.cjs` ran its OBS-mutating half unguarded at require
time — connecting to OBS, rebuilding every scene, and ending with
`SetCurrentProgramScene {sceneName:"COLONY"}`. Requiring it for its policy would have cut the live
program. It is now guarded by a top-level `if (require.main !== module) return;` (legal in CommonJS,
smallest possible guard, no reindentation, no behaviour change when run directly).

## Proof

Resolution is correct per scene type (require returned in 284 ms; a real build takes many seconds):

```
COLONY_SIDE_MUSIC -> ["ovl_music_card","ovl_watermark","ovl_onair"]
COLONY            -> ["ovl_watermark","ovl_musicbug","ovl_nowplaying","ovl_lower3rd","ovl_caption","ovl_ticker","ovl_onair"]
MUSIC_HOUR        -> ["ovl_music_hero","ovl_watermark","ovl_onair"]      (ovl_lyrics excluded: declared disabled)
MUSIC_CARD        -> ["ovl_music_card","ovl_watermark","ovl_lower3rd","ovl_onair"]
STANDBY           -> ["ovl_standby"]
NO_SUCH_SCENE     -> null                                                (gate fails honestly)
```

**Guard proven inert:** program scene read BEFORE require = `COLONY_SIDE_MUSIC`; AFTER require =
`COLONY_SIDE_MUSIC`. No rebuild, no cut.

**Gate on the exact case that falsely failed — now PASS:**
```
OVERLAY PROOF: PASS — scene 'COLONY_SIDE_MUSIC' carries ovl_music_card/ovl_watermark/ovl_onair
(enabled, -> 127.0.0.1:8099); state.json updatedUtc=2026-07-19T07:13:22.975Z
```
It also wrote a REAL 576,066-byte proof, replacing a 22,289-byte near-blank failed capture.

**Failure rehearsed BOTH directions on the live program** (a test that never failed proves nothing):
```
disable ovl_watermark -> OVERLAY PROOF: FAIL — source 'ovl_watermark' present but DISABLED
                         in 'COLONY_SIDE_MUSIC'                                   exit=1
re-enable             -> OVERLAY PROOF: PASS                                       exit=0
```
Air unaffected throughout: `uni` ready, readers=2.

## Honest scope

This corrects the gate's EXPECTATION, it does not weaken it. Every previously-checked property is
still checked (present, enabled, URL points at the overlay server, `state.json` parses, screenshot
written) — they are simply checked against the set the scene actually declares. A scene that drops a
declared overlay still fails, as rehearsed above.
