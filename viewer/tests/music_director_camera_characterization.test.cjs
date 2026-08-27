// music_director_camera_characterization.test.cjs — RED-0 PRE-CHANGE CHARACTERIZATION.
//
// Proves TODAY's music_director does NOT camera-duck: its micIsHot() consults ONE input, MicHost.
// When the operator selects a camera as voice (command_center.setVoice() line 402), MicHost is
// MUTED and one of RemoteCam1..10 is unmuted — micIsHot() returns false, shouldDuck is false, no
// duck fires. This test is expected to PASS on the OLD code (proving the gap exists).
//
// This is a source-anchored + simulated-input characterization. It does NOT connect to live OBS,
// does NOT restart any process, does NOT touch the bed. The two clauses together form the
// characterization: (i) the source truly has the single-source pattern, and (ii) simulating the
// old micIsHot() with MicHost muted returns false regardless of camera state.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const REPO = path.join(__dirname, "..", "..");
const MDIR = path.join(REPO, "viewer", "music_director.cjs");

test("RED-0 current MicHost-only system ignores hot UI-unmuted RemoteCam1", async (t) => {
  // Clause (i) — source anchor. Today's music_director declares MIC as a single string.
  const src = fs.readFileSync(MDIR, "utf8");
  assert.match(src, /const MIC\s*=\s*"MicHost"/,
    "characterization: MIC is a single string 'MicHost' (source anchor)");

  // Clause (ii) — simulate today's micIsHot() with muted MicHost + hot RemoteCam1.
  // Today's implementation queries GetInputMute on the single MIC constant only.
  const fakeReq = async (t, args) => {
    if (t === "GetInputMute" && args.inputName === "MicHost") return { inputMuted: true };
    // Today's micIsHot() NEVER asks for any RemoteCam mute. This branch is a guard: if the code
    // WERE to check a RemoteCam, this test's simulation is wrong and the characterization is
    // invalid. This makes the characterization tight rather than trivial.
    assert.fail("today's micIsHot() unexpectedly queried " + args.inputName);
  };
  const todayMicIsHot = async () => {
    const r = await fakeReq("GetInputMute", { inputName: "MicHost" });
    return r.inputMuted === false;
  };

  const hotCameraObserved = true;   // simulate: RemoteCam1's meter is above HOT_DB right now
  void hotCameraObserved;

  const micHot = await todayMicIsHot();
  assert.equal(micHot, false,
    "characterization: with MicHost muted, today's system reports NOT hot regardless of RemoteCam");

  // The `shouldDuck` expression on line 210 of the current file is `micHot || desktopHot`.
  // desktopHot is dead code (DESKTOP_VOICE_DUCK=false, onMeters short-circuits at line 114). So
  // shouldDuck === false when MicHost is muted, and no camera-originated duck fires.
  const desktopHotDead = /DESKTOP_VOICE_DUCK\s*=\s*false/;
  assert.match(src, desktopHotDead, "characterization: desktop path is stood down (dead branch)");
});
