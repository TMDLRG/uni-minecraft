// continuity_switch.cjs -- keep the PLATFORM SESSION open while the studio comes and goes.
//
// THE PROBLEM (measured 2026-08-03, hour 36 of a public run).
// The platforms are not connected to OBS. The chain is:
//
//   OBS --> MediaMTX rtmp://127.0.0.1:1935/uni --> dual_push (ffmpeg -c copy) --> YouTube + Twitch
//
// dual_push holds the RTMP sessions. When OBS disconnects, the `uni` path empties, dual_push's
// input errors ("Error during demuxing: I/O error"), ffmpeg EXITS, and THAT closes the platform
// session. The platform sees the stream END: the VOD is cut, the channel shows offline, and coming
// back needs a fresh go-live. That is why the x264->NVENC swap cannot be done without going off
// air -- OBS refuses encoder changes while streaming (command_center.cjs:951), and restarting the
// stream is /api/golive, which golive_guard refuses for every agent path (command_center.cjs:2212).
//
// THE FIX -- something between studio and fan-out whose OUTPUT NEVER STOPS:
//
//   OBS --> MediaMTX `uni` ─┐
//                           ├─> continuity_switch (NVENC) --> `uni_air` --> dual_push --> platforms
//   generated filler ───────┘
//
// HOW, AND WHY THERE IS NO CONTROL CHANNEL.
// The obvious design is `streamselect` flipped at runtime over ZMQ. It was built and abandoned:
// this ffmpeg has the zmq FILTER but ships no `zmqsend` CLIENT (bin/ holds only ffmpeg, ffplay,
// ffprobe), so driving it would mean hand-rolling a ZMTP client for a component sitting between
// the show and its audience. Worse, it makes continuity depend on a control message ARRIVING.
//
// Instead the filler is the BASE LAYER and the studio is a full-frame `overlay` on top of it, with
// `eof_action=pass`. Studio present -> it covers the filler exactly, so you see the studio. Studio
// gone -> overlay passes the filler through. No command, no timer, no supervisor, no race. The
// failover is a property of the filtergraph, not of something remembering to act.
// Audio is the same trick: filler audio is SILENCE, so `amix` of silence+studio IS the studio, and
// when the studio drops you get silence rather than a dead output.
//
// WHY RE-ENCODE. `-c copy` cannot splice across a source change -- each source carries its own
// SPS/PPS and timestamp base. So this decodes both and encodes ONE continuous output. That is the
// real cost, stated up front. It runs on NVENC, which this box measured as registered and
// completely idle while x264 pegged the CPU at 100%, so the cost lands on the idle GPU.
//
//   node viewer/continuity_switch.cjs --selftest   prove it, on scratch paths only
//   node viewer/continuity_switch.cjs --run        run for real (SWITCH_IN / SWITCH_OUT)
//
// PROVEN BY --selftest: the output survives its source dying and keeps emitting filler.
// NOT PROVEN: anything about the real path to air. Pointing this at the fan-out changes the path
// to air and is the operator's call. See "RECOVERY" at the foot of this file for the known gap.

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const FFMPEG = process.env.FFMPEG || "ffmpeg";
const MTX = process.env.MTX_HOST || "127.0.0.1";
const IN_STUDIO = process.env.SWITCH_IN || `rtmp://${MTX}:1935/uni`;
const OUT_AIR = process.env.SWITCH_OUT || `rtmp://${MTX}:1935/uni_air`;
const W = 1920, H = 1080, FPS = 30;

// The filler is GENERATED, never a file: a file can be missing, truncated or locked, and this
// component exists precisely so its input cannot fail. lavfi sources never end.
function buildArgs({ studio, out, useNvenc, listen, toFile }) {
  const vcodec = useNvenc
    ? ["-c:v", "h264_nvenc", "-preset", "p4", "-rc", "cbr", "-b:v", "4000k", "-maxrate", "4000k", "-bufsize", "8000k"]
    : ["-c:v", "libx264", "-preset", "veryfast", "-b:v", "4000k", "-maxrate", "4000k", "-bufsize", "8000k"];

  // [0]=filler video (infinite)  [1]=filler audio (silence, infinite)  [2]=studio
  // eof_action=pass is the whole design: when the studio ends, the filler underneath continues.
  const fg =
    `[0:v]scale=${W}:${H},fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[base];` +
    `[2:v]scale=${W}:${H},fps=${FPS},format=yuv420p,setpts=PTS-STARTPTS[top];` +
    `[base][top]overlay=x=0:y=0:eof_action=pass:shortest=0[vout];` +
    `[1:a]asetpts=PTS-STARTPTS[fa];` +
    `[2:a]aresample=async=1:first_pts=0,asetpts=PTS-STARTPTS[sa];` +
    `[fa][sa]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`;

  return [
    "-hide_banner", "-loglevel", "warning",
    "-f", "lavfi", "-i", `color=c=0x0b0e14:s=${W}x${H}:r=${FPS}`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    ...(listen ? ["-listen", "1"] : []),
    "-i", studio,
    "-filter_complex", fg,
    "-map", "[vout]", "-map", "[aout]",
    ...vcodec,
    "-g", String(FPS * 2), "-c:a", "aac", "-b:a", "160k", "-ar", "48000",
    ...(toFile ? ["-f", "flv", "-y"] : ["-f", "flv", "-flvflags", "no_duration_filesize"]),
    out,
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- SELFTEST ---------------------------------------------------------------------------------
// Proves the ONE property that matters: the output survives its source dying, and keeps producing.
// The switcher is its OWN RTMP listener and writes to a file, so the proof needs no MediaMTX path
// permission -- an earlier version published to a scratch MediaMTX path and was refused outright
// (-10054, connection reset), failing the proof for a reason unrelated to the claim.
async function selftest() {
  const PORT = Number(process.env.PROOF_PORT || 19353);
  const SRC = `rtmp://127.0.0.1:${PORT}/live/proof`;
  const OUT = path.join(process.env.TEMP || "/tmp", "continuity_proof.flv");
  let failures = 0;
  const check = (name, ok, detail) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  -- " + detail : ""}`);
    if (!ok) failures++;
  };
  const size = () => { try { return fs.statSync(OUT).size; } catch (_) { return 0; } };

  try { fs.unlinkSync(OUT); } catch (_) {}

  const mkSource = () => spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-re",
    "-f", "lavfi", "-i", `testsrc2=s=640x360:r=${FPS}`,
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000",
    "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "800k", "-g", "60",
    "-c:a", "aac", "-b:a", "96k", "-t", "600", "-f", "flv", SRC],
    { stdio: ["ignore", "ignore", "pipe"] });

  async function attempt(useNvenc) {
    const sw = spawn(FFMPEG, buildArgs({ studio: SRC, out: OUT, useNvenc, listen: true, toFile: true }),
      { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; sw.stderr.on("data", (d) => (err += d));
    await sleep(1500);
    const src = mkSource();
    await sleep(8000);
    return { sw, src, err: () => err };
  }

  console.log("1. switcher listens for the studio; studio connects  (no MediaMTX, no platform)");
  let useNvenc = true;
  let { sw, src, err } = await attempt(true);
  if (sw.exitCode !== null) {
    console.log(`   NVENC path exited (${sw.exitCode}) -- retrying on x264 so the PROPERTY is still tested`);
    console.log("   " + err().trim().split("\n").slice(0, 2).join("\n   "));
    try { src.kill("SIGKILL"); } catch (_) {}
    try { fs.unlinkSync(OUT); } catch (_) {}
    useNvenc = false;
    ({ sw, src, err } = await attempt(false));
  }
  check(`switcher running on ${useNvenc ? "NVENC" : "x264"} and producing output`,
    sw.exitCode === null && size() > 0,
    sw.exitCode === null ? `${size()} bytes` : err().trim().split("\n").slice(0, 2).join(" | "));

  const before = size();

  console.log("2. KILL THE STUDIO -- this is the whole test");
  try { src.kill("SIGKILL"); } catch (_) {}
  await sleep(10000);

  const alive = sw.exitCode === null;
  const after = size();
  check("SWITCHER SURVIVED its source dying", alive,
    alive ? "output session never closed -- a platform on the far side would NOT have seen a stream END"
          : `exited ${sw.exitCode}: ${err().trim().split("\n").slice(-2).join(" | ")}`);
  check("output KEPT GROWING on filler afterwards", after > before, `${before} -> ${after} bytes`);

  try { sw.kill("SIGKILL"); } catch (_) {}
  await sleep(300);

  console.log(`\n${failures === 0 ? "PROVEN" : "NOT PROVEN"}: ${failures} failure(s)  (encoder: ${useNvenc ? "NVENC" : "x264"})`);
  if (failures === 0) {
    console.log("This is exactly the property that blocks the NVENC swap today: the output outlives");
    console.log("the loss of its source and keeps emitting. STILL UNPROVEN: the real path to air,");
    console.log("and RECOVERY when the studio comes BACK (see the note at the foot of the file).");
  }
  return failures === 0 ? 0 : 1;
}

(async () => {
  const a = process.argv.slice(2);
  if (a.includes("--selftest")) process.exit(await selftest());
  if (a.includes("--run")) {
    console.log(`continuity_switch: ${IN_STUDIO} (+ filler) -> ${OUT_AIR}`);
    const p = spawn(FFMPEG, buildArgs({ studio: IN_STUDIO, out: OUT_AIR, useNvenc: true }), { stdio: "inherit" });
    p.on("exit", (c) => process.exit(c === null ? 1 : c));
    return;
  }
  console.log("usage: --selftest | --run");
  process.exit(0);
})();

// ---- RECOVERY: the known gap, stated rather than hidden -----------------------------------------
// `overlay=eof_action=pass` covers the studio GOING AWAY. It does not cover the studio COMING BACK:
// once an RTMP input has EOF'd, ffmpeg will not re-open it, so the switcher would sit on filler
// forever and OBS returning would change nothing on air.
//
// The fix is to give the switcher an input that can never EOF, and let a cheap restartable relay
// own the reconnecting:
//
//   OBS -> MediaMTX `uni` -> [relay: ffmpeg -i rtmp://.../uni -c copy -f mpegts udp://127.0.0.1:9000,
//                             in a restart loop]  ->  switcher reads udp://127.0.0.1:9000
//
// A UDP input never ends -- it stalls. The relay may die and respawn freely; the switcher never
// notices. Note the tradeoff honestly: with UDP the studio never EOFs either, so `eof_action=pass`
// stops firing and a stalled studio would FREEZE its last frame over the filler instead of
// revealing it. Handling that needs either the ZMQ control this file deliberately avoided, or a
// supervisor that restarts the RELAY (cheap) rather than the switcher (costly). That decision, and
// whether the relay lives on THINKER or on uni-lab, is the next design step -- and uni-lab is the
// better home, because the entire point is that the studio box becomes disposable.
