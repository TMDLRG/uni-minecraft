const __obsauth = require("./lib/obs_auth.cjs");
// verify_overlays.cjs — THE OVERLAY PROOF GATE (binding; see docs/STUDIO_SYSTEMS.md).
// "Overlay server running" is NOT proof of overlays. This verifies against OBS itself:
//   1. obs-websocket reachable (:4455)
//   2. the CURRENT PROGRAM SCENE carries exactly the ovl_* sources THAT SCENE declares, ENABLED
//   3. each of those ovl_* source URLs points at the overlay server (127.0.0.1:8099)
//   4. :8099/state.json actually serves parseable overlay state
//   5. writes viewer/overlay_proof.png — a real screenshot of the program scene
// Exit 0 = PROVEN. Exit non-zero = the program has NO verified overlays; no agent may claim
// "overlays up". Run it after every bring-up (studio_up.ps1 does) and before any go-live.
//
// SCENE-AWARE (fixed 2026-07-19). This gate used to hard-code
//   const REQUIRED = ["ovl_lower3rd","ovl_ticker","ovl_caption","ovl_onair"]
// and assert that ONE list against whatever scene happened to be on program. But the stage does not
// put the same chrome on every template: the music scenes deliberately DROP the duplicate
// now-playing chrome (a hero card plus a lower-third plus a corner chip all said the same track),
// STANDBY carries only its slate, and MUSIC_CARD has a bespoke set. So the gate reported a FALSE
// FAILURE on every music scene — caught live 2026-07-19 on COLONY_SIDE_MUSIC:
//   "OVERLAY PROOF: FAIL - source 'ovl_lower3rd' is NOT in program scene 'COLONY_SIDE_MUSIC'"
// while the overlays on that scene were in fact correct and airing. A gate that cries wolf on a
// healthy system is worse than no gate: it trains the operator to ignore it.
//
// The expectation now comes from studio_stage.cjs — the same module that BUILDS the scenes — via
// `expectedOverlaysFor(scene)`. Expectation and build cannot drift apart, because they are one
// declaration. studio_stage.cjs guards its OBS-mutating half behind `require.main === module`, so
// requiring it here is inert: it exports policy and rebuilds nothing.
const WebSocket = require("ws");
const fs = require("fs");
const path = require("path");
const { expectedOverlaysFor } = require("./studio_stage.cjs");
const probe = require("./lib/frame_probe.cjs");
const OVERLAY_HOST = "127.0.0.1:8099";
const ws = new WebSocket("ws://127.0.0.1:4455");
let idc = 0;
const pending = {};
const fail = (why) => { console.log("OVERLAY PROOF: FAIL — " + why); process.exit(1); };
function req(type, data) {
  return new Promise((res) => {
    const requestId = "v" + (++idc);
    pending[requestId] = res;
    ws.send(JSON.stringify({ op: 6, d: { requestType: type, requestId, requestData: data || {} } }));
  });
}
ws.on("error", (e) => fail("obs-websocket :4455 unreachable (" + e.message + ")"));
setTimeout(() => fail("timeout talking to OBS"), 15000);
ws.on("message", async (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.op === 0) { ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d) })); return; }
  if (m.op === 7) { const r = pending[m.d.requestId]; if (r) { delete pending[m.d.requestId]; r(m.d); } return; }
  if (m.op !== 2) return;
  try {
    const prog = (await req("GetCurrentProgramScene")).responseData;
    const scene = prog.currentProgramSceneName || prog.sceneName;

    // What SHOULD this scene carry? Ask the module that builds it.
    const required = expectedOverlaysFor(scene);
    if (required === null) {
      return fail(`program scene '${scene}' is not declared in studio_stage.cjs SCENES — cannot verify`
        + ` an ad-hoc scene. Either cut to a declared template or add it to the stage definition.`);
    }

    const items = (await req("GetSceneItemList", { sceneName: scene })).responseData.sceneItems || [];
    const byName = {};
    for (const it of items) byName[it.sourceName] = it;

    for (const name of required) {
      const it = byName[name];
      if (!it) return fail(`scene '${scene}' declares '${name}' but it is NOT in the scene — stage never built or drifted (run studio_stage.cjs)`);
      if (!it.sceneItemEnabled) return fail(`source '${name}' present but DISABLED in '${scene}'`);
      // ovl_voice is the AGENT VOICE source. It legitimately comes from voice_server (:8106), NOT
      // the visual overlay server (:8099), so the :8099 URL assertion below does not apply to it.
      // Its present+enabled is still verified above (that IS the important part for go-live); its
      // audio actually reaching the mixer is proven separately by audio_meter.cjs. Added 2026-08-04
      // when ovl_voice joined every scene in studio_stage.cjs — without this exemption verify_overlays
      // FAILs on every scene and wrongly blocks go-live. (RAID f3871277 / the voice architecture.)
      if (name === "ovl_voice") continue;
      const s = (await req("GetInputSettings", { inputName: name })).responseData.inputSettings || {};
      if (!s.url || !s.url.includes(OVERLAY_HOST)) return fail(`source '${name}' url is '${s.url}' — not the overlay server ${OVERLAY_HOST}`);
    }

    // Overlays present on air that the scene does NOT declare. NOT a failure: ovl_lyrics is
    // documented as a per-segment operator choice the operator enables by hand. Surfaced anyway,
    // because a stale lower-third bleeding onto a music scene is a real defect this project has
    // shipped before, and silence about it is how it shipped.
    const extras = items
      .filter((it) => /^ovl_/.test(it.sourceName) && it.sceneItemEnabled && !required.includes(it.sourceName))
      .map((it) => it.sourceName);

    // overlay server must actually serve live state (the pages fetch this in a loop)
    let state;
    try {
      const r = await fetch(`http://${OVERLAY_HOST}/state.json`, { cache: "no-store" });
      if (!r.ok) return fail(`:8099/state.json HTTP ${r.status}`);
      state = await r.json();
    } catch (e) { return fail(":8099/state.json unreachable (" + e.message + ")"); }

    // proof screenshot of the real program
    const shot = await req("GetSourceScreenshot", { sourceName: scene, imageFormat: "png", imageWidth: 1280, imageHeight: 720 });
    const out = path.join(__dirname, "overlay_proof.png");
    if (shot.responseData && shot.responseData.imageData) {
      fs.writeFileSync(out, Buffer.from(shot.responseData.imageData.split(",")[1], "base64"));
    }

    // ── AND NOW LOOK AT IT (2026-08-05) ───────────────────────────────────────────────────────────
    // Everything above this line measures EXISTENCE: the sources this scene declares are present,
    // enabled, and addressed at the overlay server. All of it can be true over a black frame, and on
    // 2026-08-05 it was: this gate wrote overlay_proof.png at 20:06:03Z with a mean luma of 1.86/255
    // — 98.7% black — printed PASS and exited 0. studio_up.ps1 and studio_boot.ps1 both turn that
    // exit code into the words "OVERLAYS PROVEN". Nothing in this file had ever read a pixel.
    //
    // A second, tiny (160x90) UNCOMPRESSED grab is taken for measurement — uncompressed because the
    // byte count of a JPEG was deliberately removed as "the byte-count lie" (command_center.cjs:653),
    // and small because this runs on a CPU-saturated live box and 160x90 answers the question.
    const bmpShot = await req("GetSourceScreenshot", { sourceName: scene, imageFormat: "bmp", imageWidth: 160, imageHeight: 90 });
    if (!bmpShot.requestStatus || bmpShot.requestStatus.result !== true) {
      return fail(`could not grab a BMP frame of '${scene}' to inspect`
        + ` (OBS said: ${(bmpShot.requestStatus && bmpShot.requestStatus.comment) || "no comment"}).`
        + ` The overlay SOURCE checks passed, but this gate will not certify a picture it could not look at.`);
    }
    const frame = probe.analyzeBmp(Buffer.from(String(bmpShot.responseData.imageData).split(",")[1], "base64"));
    const v = probe.verdictFor(scene, frame);
    if (v.fail) {
      return fail(`scene '${scene}' has all its overlays and NO PICTURE — ${v.verdict}.\n`
        + `       ${v.why}\n`
        + `       Every source check above PASSED, and that is exactly the point: a source can be\n`
        + `       present, enabled and correctly addressed while the frame is black. Look at ${out}.`);
    }

    const carried = required.length ? required.join("/") : "(this scene declares no overlays by design)";
    console.log(`OVERLAY PROOF: PASS — scene '${scene}' carries ${carried} (enabled, -> ${OVERLAY_HOST});`
      + ` state.json updatedUtc=${state.updatedUtc || "?"}; screenshot ${out}`
      + `\n  PICTURE: ${v.verdict} — ${v.why}`
      + (v.verdict === "FLAT" ? `\n  ^^ NOT a failure, but the frame is nearly uniform. LOOK at it before you cut.` : "")
      + (extras.length ? `\n  NOTE: also enabled but not declared for this scene: ${extras.join(", ")}`
        + ` — expected if you turned one on for a segment; investigate if you did not.` : ""));
    process.exit(0);
  } catch (e) { fail("unexpected: " + (e && e.message)); }
});
