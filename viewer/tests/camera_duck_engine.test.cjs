// camera_duck_engine.test.cjs — RED-1 .. RED-4 target behavior for the PURE engine.
//
// Fake time (monotonic_now_ms is passed in). No OBS, no fs, no ws, no process. Every clause carries
// its named PASS line and the pre-implementation FAIL is triggered by the STUB in the engine
// module (UNI_CAMERA_DUCK_FULL unset). GREEN requires the flag set to '1'.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createEngine, DEFAULTS } = require(path.join(__dirname, "..", "camera_duck_engine.cjs"));

// Small helper: canonical UI-mute map. false = UI-unmuted.
function muteMap({ unmuted = [], muted = [], unknown = [] } = {}) {
  const m = {};
  for (const n of muted) m[n] = true;
  for (const n of unmuted) m[n] = false;
  for (const n of unknown) m[n] = null;
  return m;
}
function hotMap(names) { const h = {}; for (const n of names) h[n] = true; return h; }

// RED-6 documents the on-air defect from the first deploy attempt (2026-08-03 00:39): the caller
// was reading the live OBS fader as operator_level_db each tick, so after every duck-write the
// "operator level" moved DOWN by DUCK_DB and the next tick ducked another DUCK_DB below that.
// The pure engine is not the source of that defect — this test proves the engine PRODUCES a
// STABLE target when the caller correctly hands it a stable operator_level_db, so any future
// ratchet is unambiguously a caller / integration bug, not an engine bug.
test("RED-6 successive DUCK evaluations at a stable operator level produce a stable target", () => {
  const e = createEngine();
  const opLevel = -20.7;                                        // simulate the live operator level
  const targets = [];
  for (let i = 0; i < 10; i++) {
    const r = e.evaluate({
      ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
      recent_hot: {},                                            // cold — DUCK, not TUCK
      voice_owned: false,
      monotonic_now_ms: 5_000_000 + i * 1500,
      operator_level_db: opLevel,                                // STABLE input — must yield STABLE output
    });
    targets.push(r.target_db);
  }
  // All targets equal the same DUCK level (or null for deduped writes).
  const distinctTargets = [...new Set(targets.filter((t) => t !== null))];
  assert.equal(distinctTargets.length, 1,
    "engine target must be stable when operator_level_db is stable — got " + JSON.stringify(distinctTargets));
  assert.equal(distinctTargets[0], opLevel - DEFAULTS.DUCK_DB,
    "single stable target = operator_level_db - DUCK_DB");
});

test("RED-1 hot UI-unmuted RemoteCam1 enters TUCK", () => {
  const e = createEngine();
  const now = 1_000_000;
  const r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false,
    monotonic_now_ms: now,
    operator_level_db: -12.6,
  });
  assert.equal(r.state, "TUCK", "hot unmuted cam must reach TUCK");
  assert.equal(Math.round(r.target_db * 10) / 10, Math.round((-12.6 - DEFAULTS.TUCK_DB) * 10) / 10,
    "TUCK target = operator_level_db - TUCK_DB");
  assert.equal(r.action, "write", "TUCK must issue a write when voice is not owned");
});

test("RED-2 UI-muted hot RemoteCam1 cannot cause DUCK or TUCK", () => {
  const e = createEngine();
  const now = 2_000_000;
  const r = e.evaluate({
    ui_mute: muteMap({ muted: ["RemoteCam1", "RemoteCam2"] }),
    recent_hot: hotMap(["RemoteCam1"]),                    // hot but muted → must be ignored
    voice_owned: false,
    monotonic_now_ms: now,
    operator_level_db: -12.6,
  });
  assert.equal(r.state, "RESTORED", "UI-muted hot cam must NOT cause DUCK or TUCK");
  assert.equal(r.target_db, -12.6, "target stays at operator level when all cams UI-muted");
});

test("RED-3 remuting every camera restores the operator level", () => {
  const e = createEngine();
  // Go RESTORED → DUCK → TUCK → remute all
  let now = 3_000_000;
  const opLevel = -20.7;                                    // simulate the operator lowering the bed
  let r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false,
    monotonic_now_ms: now,
    operator_level_db: opLevel,
  });
  assert.equal(r.state, "DUCK", "unmuted + cold → DUCK");

  now += 100;
  r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false,
    monotonic_now_ms: now,
    operator_level_db: opLevel,
  });
  assert.equal(r.state, "TUCK", "hot → TUCK");

  now += 100;
  r = e.evaluate({
    ui_mute: muteMap({ muted: ["RemoteCam1", "RemoteCam2"] }),
    recent_hot: hotMap(["RemoteCam1"]),                    // still nominally hot, but UI-muted
    voice_owned: false,
    monotonic_now_ms: now,
    operator_level_db: opLevel,
  });
  assert.equal(r.state, "RESTORED", "all muted → RESTORED immediately");
  assert.equal(r.target_db, opLevel, "restore target = CURRENT operator level (not a cached value)");
});

test("RED-4 TUCK requires 10000ms continuous all-camera cold before DUCK", () => {
  const e = createEngine();
  const opLevel = -12.6;
  const t_hot = 10_000_000;                // hot frame — enters TUCK, allColdSince stays null
  const t_cold0 = t_hot + 1;               // FIRST cold observation — allColdSince := t_cold0

  // Enter TUCK.
  let r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: t_hot, operator_level_db: opLevel,
  });
  assert.equal(r.state, "TUCK");

  // First cold frame — allColdSince is set to t_cold0. State remains TUCK.
  r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},                                          // cold everywhere
    voice_owned: false, monotonic_now_ms: t_cold0, operator_level_db: opLevel,
  });
  assert.equal(r.state, "TUCK", "first cold frame within TUCK_COLD_MS window → still TUCK");

  // At 9 999 ms after the first cold observation, still TUCK.
  r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: t_cold0 + 9_999, operator_level_db: opLevel,
  });
  assert.equal(r.state, "TUCK", "at 9999ms continuous cold from first cold observation, still TUCK");

  // At exactly 10 000 ms after the first cold observation, transition to DUCK.
  r = e.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: t_cold0 + 10_000, operator_level_db: opLevel,
  });
  assert.equal(r.state, "DUCK", "at ≥10000ms continuous cold, TUCK → DUCK");

  // A hot frame during the cold interval resets the timer.
  const e2 = createEngine();
  const s0 = 20_000_000;
  e2.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: s0, operator_level_db: opLevel,
  });
  e2.evaluate({                                             // cold at s0+5000
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: s0 + 5_000, operator_level_db: opLevel,
  });
  e2.evaluate({                                             // hot at s0+7000 — resets
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: s0 + 7_000, operator_level_db: opLevel,
  });
  const r2 = e2.evaluate({                                  // cold at s0+16000 — 9s cold, not 16s
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: s0 + 16_000, operator_level_db: opLevel,
  });
  assert.equal(r2.state, "TUCK",
    "hot frame at +7000 resets timer; cold only for 9000ms at +16000 → still TUCK");

  // Changing the UI-unmuted camera set resets the cold interval.
  const e3 = createEngine();
  const u0 = 30_000_000;
  e3.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: u0, operator_level_db: opLevel,
  });
  e3.evaluate({                                             // cold, +9000
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: u0 + 9_000, operator_level_db: opLevel,
  });
  // Add RemoteCam2 to unmuted set at +9500 — resets timer.
  e3.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1", "RemoteCam2"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: u0 + 9_500, operator_level_db: opLevel,
  });
  const r3 = e3.evaluate({                                  // +18000: original set was 9s cold,
    ui_mute: muteMap({ unmuted: ["RemoteCam1", "RemoteCam2"] }), // new set is 8.5s cold — must stay TUCK
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: u0 + 18_000, operator_level_db: opLevel,
  });
  assert.equal(r3.state, "TUCK",
    "unmuted-set change at +9500 resets timer; only 8.5s cold at +18000 → still TUCK");

  // Muting the previously hot camera must not award retroactive cold time.
  const e4 = createEngine();
  const m0 = 40_000_000;
  e4.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1", "RemoteCam2"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: m0, operator_level_db: opLevel,
  });
  // Mute RemoteCam1 (the hot one) at +5000. RemoteCam2 was never hot.
  // Unmuted set changes → cold timer resets. NOT: retroactive credit for RemoteCam2's cold history.
  e4.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam2"], muted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: m0 + 5_000, operator_level_db: opLevel,
  });
  const r4 = e4.evaluate({                                  // +9500: only 4.5s in new set
    ui_mute: muteMap({ unmuted: ["RemoteCam2"], muted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: m0 + 9_500, operator_level_db: opLevel,
  });
  assert.equal(r4.state, "TUCK",
    "muting hot cam does not award retroactive cold time; still TUCK at +9500");

  // Backward clock: resets interval, does not exit TUCK early.
  const e5 = createEngine();
  const b0 = 50_000_000;
  e5.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false, monotonic_now_ms: b0, operator_level_db: opLevel,
  });
  e5.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: b0 + 8_000, operator_level_db: opLevel,
  });
  const r5 = e5.evaluate({                                  // clock jumps BACKWARD
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: false, monotonic_now_ms: b0 - 1_000, operator_level_db: opLevel,
  });
  assert.equal(r5.state, "TUCK", "backward clock resets cold interval; must not exit TUCK early");
});
