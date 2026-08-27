#!/usr/bin/env node
// audio_meter.cjs -- MEASURE WHAT OBS IS ACTUALLY HEARING, per input, in dB.
//
//   node viewer/audio_meter.cjs             # sample every input for 4s, print peak dB
//   node viewer/audio_meter.cjs 8           # sample for 8s
//   node viewer/audio_meter.cjs 6 ovl_voice # only inputs whose name contains "ovl_voice"
//
// WHY THIS EXISTS (2026-08-04)
// This studio has ONE pixel measurement and had ZERO audio measurements. That asymmetry is exactly
// how the voice went missing: `Desktop Audio` existed, was configured, showed a healthy -20.8 dB
// volume slider, and captured SILENCE for an unknown length of time because it was bound to a
// device GUID that no longer existed. Every readable property said healthy. The only thing that
// would have caught it is the LEVEL, and nothing here read levels.
//
// A volume setting is a claim about how loud a thing WOULD be. A meter is a measurement of how
// loud it IS. `GetInputVolume` and `GetInputMute` answer the first question and are what everything
// in this repo has been asking. This asks the second.
//
// It is read-only: it Identifies with ONLY the high-volume InputVolumeMeters subscription
// (1 << 16) and sends no requests that change anything.
//
// READING THE OUTPUT
//   peak dB   the loudest sample seen in the window. -inf means literally nothing arrived.
//   frames    how many meter updates carried this input. 0 frames = OBS is not metering it at all
//             (it is not in the active scene, or it has no audio track).
//   SILENT    peak below -90 dB. Present, metered, and producing nothing -- the Desktop Audio state.
"use strict";
const __obsauth = require("./lib/obs_auth.cjs");

const WebSocket = require("ws");
const OBS = "ws://127.0.0.1:4455";
const SECS = Number(process.argv[2]) > 0 ? Number(process.argv[2]) : 4;
const FILTER = process.argv[3] || null;

// OBS reports levels as multipliers. 0 is true digital silence, which is -Infinity dB.
const toDb = (mul) => (mul > 0 ? 20 * Math.log10(mul) : -Infinity);
const fmt = (db) => (db === -Infinity ? "  -inf" : (db >= 0 ? " " : "") + db.toFixed(1).padStart(6));

const seen = new Map(); // inputName -> { peak, frames }

const ws = new WebSocket(OBS);
ws.on("message", (data) => {
  let m; try { m = JSON.parse(data.toString()); } catch { return; }
  // Hello -> Identify. eventSubscriptions 1<<16 = InputVolumeMeters ONLY; we want no other traffic.
  if (m.op === 0) return ws.send(JSON.stringify({ op: 1, d: __obsauth.identifyD(m.d, { eventSubscriptions: 1 << 16 }) }));
  if (m.op !== 5 || m.d.eventType !== "InputVolumeMeters") return;
  for (const inp of m.d.eventData.inputs || []) {
    const name = inp.inputName;
    if (FILTER && !name.toLowerCase().includes(FILTER.toLowerCase())) continue;
    if (!seen.has(name)) seen.set(name, { peak: -Infinity, frames: 0 });
    const rec = seen.get(name);
    rec.frames++;
    // inputLevelsMul is [channel][ magnitude, peak, inputPeak ]. Take the loudest peak across
    // channels; inputPeak (index 2) is pre-fader, peak (index 1) is post-fader -- post-fader is
    // what actually leaves for the stream, so that is what we report.
    for (const ch of inp.inputLevelsMul || []) {
      const db = toDb(ch[1]);
      if (db > rec.peak) rec.peak = db;
    }
  }
});
ws.on("error", (e) => { console.log("OBS unreachable: " + e.message); process.exit(3); });

setTimeout(() => {
  const rows = [...seen.entries()].sort((a, b) => b[1].peak - a[1].peak);
  console.log("=== OBS audio, measured over " + SECS + "s ===");
  if (!rows.length) {
    console.log("  NOTHING METERED. No input produced a meter frame -- check OBS is running and has an active scene.");
    process.exit(1);
  }
  console.log("  peak dB  frames  input");
  for (const [name, r] of rows) {
    const tag = r.peak < -90 ? "  <- SILENT (present but producing nothing)" : "";
    console.log("  " + fmt(r.peak) + "  " + String(r.frames).padStart(6) + "  " + name + tag);
  }
  // An input OBS never mentions is not in this list at all. Say so, because absence from a table
  // reads as "fine" and it is the opposite.
  if (FILTER && !rows.length) console.log("  (no input matched '" + FILTER + "')");
  try { ws.close(); } catch (_) {}
  process.exit(0);
}, SECS * 1000);
