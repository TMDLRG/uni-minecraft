// music_director_voice_precedence.test.cjs — RED-5 voice_server ownership precedence.
//
// The engine must produce action:'cede' (never 'write') whenever `voice_owned: true`.
// State bookkeeping is still allowed to advance; the ONLY requirement is zero-write while owned.
//
// PURE — no fs, no http, no OBS, no ws.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { createEngine, DEFAULTS } = require(path.join(__dirname, "..", "camera_duck_engine.cjs"));

function muteMap({ unmuted = [], muted = [], unknown = [] } = {}) {
  const m = {};
  for (const n of muted) m[n] = true;
  for (const n of unmuted) m[n] = false;
  for (const n of unknown) m[n] = null;
  return m;
}
function hotMap(names) { const h = {}; for (const n of names) h[n] = true; return h; }

test("RED-5 voice_server ownership suppresses every music_director fader write", () => {
  const opLevel = -12.6;

  // Case A: voice_server active + hot unmuted cam that would otherwise TUCK
  const eA = createEngine();
  const rA = eA.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: true,
    monotonic_now_ms: 1_000_000, operator_level_db: opLevel,
  });
  assert.equal(rA.action, "cede", "A: voice_server owns → action must be 'cede'");
  assert.equal(rA.target_db, null, "A: no target when ceding");

  // Case B: voice_server active + all cams muted (RESTORED path)
  const eB = createEngine();
  const rB = eB.evaluate({
    ui_mute: muteMap({ muted: ["RemoteCam1"] }),
    recent_hot: {},
    voice_owned: true,
    monotonic_now_ms: 1_000_000, operator_level_db: opLevel,
  });
  assert.equal(rB.action, "cede", "B: voice_server owns even in RESTORED-shape → cede");

  // Case C: voice_owned repeatedly true for many evaluations — never a single write
  const eC = createEngine();
  let writes = 0;
  for (let i = 0; i < 50; i++) {
    const r = eC.evaluate({
      ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
      recent_hot: i % 2 === 0 ? hotMap(["RemoteCam1"]) : {},
      voice_owned: true,
      monotonic_now_ms: 2_000_000 + i * 100, operator_level_db: opLevel,
    });
    if (r.action === "write") writes++;
  }
  assert.equal(writes, 0, "C: 50 evaluations while voice_owned → 0 writes");

  // Case D: voice_server RELEASES — engine must re-evaluate against the CURRENT operator level,
  // not a cached pre-voice value.
  const eD = createEngine();
  eD.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: true,
    monotonic_now_ms: 3_000_000, operator_level_db: -12.6,
  });
  // Operator adjusted the slider WHILE voice was owning; engine must use the NEW level.
  const rD = eD.evaluate({
    ui_mute: muteMap({ unmuted: ["RemoteCam1"] }),
    recent_hot: hotMap(["RemoteCam1"]),
    voice_owned: false,                                   // voice released
    monotonic_now_ms: 3_000_500, operator_level_db: -20.7,   // NEW operator level
  });
  assert.equal(rD.action, "write", "D: on release + hot cam, engine issues a write");
  assert.equal(rD.state, "TUCK", "D: state is TUCK (hot cam still present)");
  const expectedTarget = Math.round((-20.7 - DEFAULTS.TUCK_DB) * 10) / 10;
  assert.equal(Math.round(rD.target_db * 10) / 10, expectedTarget,
    "D: target uses CURRENT operator level, not the pre-voice level");
});
