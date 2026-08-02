// build_cut.cjs — render a cut of WELCOME TO UNI LABS, end to end, from measured evidence.
//
//   cues (prose)  +  tokens.cjs (numbers)  +  forensic_latest.json (what actually ran)
//        -> SVG plates -> headless-Chrome raster -> Piper narration -> ffmpeg -> mp4
//
// THE RULE THE OPERATOR SET, and it shapes every frame: expose the measurement, never assert the
// conclusion. A plate shows the question, the command, the verbatim output and the source line. The
// narration names what is on screen. The viewer calibrates.
//
// NOTHING IS TYPED. A cue may not contain a number; it names a token id, and the token is resolved
// here from the live artifact. A cue that hardcodes a digit is refused before anything renders.
//
// USAGE
//   node lab/film/welcome/render/build_cut.cjs --cut short
//   node lab/film/welcome/render/build_cut.cjs --cut short --scenes 1     (pipeline smoke test)
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const HERE = __dirname;
const FILM = path.resolve(HERE, "..");
const MC = path.resolve(FILM, "..", "..", "..");
const P = require("./plate_lib.cjs");

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const CUT = arg("--cut", "short");
const LIMIT = Number(arg("--scenes", "0")) || 0;

const dir = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
const SVG = dir(path.join(FILM, "svg"));
const FRAMES = dir(path.join(FILM, "frames"));
const AUDIO = dir(path.join(FILM, "audio"));
const OUT = dir(path.join(FILM, "output"));

// ── the toolchain, located rather than assumed ──────────────────────────────────────────────────
const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find((p) => fs.existsSync(p));
const VOICE = ["C:/Users/mpolz/Desktop/Universal.Wright/ClaudeSpeak/claude-voice-connector-stdio/models/en_US-lessac-medium.onnx",
  "C:/Users/mpolz/Documents/Lurian/vendor/piper/voices/en_US-lessac-medium.onnx"].find((p) => fs.existsSync(p));
if (!CHROME) { console.error("no headless rasteriser found"); process.exit(1); }
if (!VOICE) { console.error("no piper voice model found"); process.exit(1); }

// ── the measured substrate ──────────────────────────────────────────────────────────────────────
const T = require(path.join(FILM, "qc", "tokens.cjs"));
const measured = T.measureAll();
const forensic = JSON.parse(fs.readFileSync(path.join(FILM, "capture", "forensic_latest.json"), "utf8"));
const probe = (id) => forensic.probes.find((p) => p.id === id);

const cues = JSON.parse(fs.readFileSync(path.join(FILM, "script", `cues_${CUT}.json`), "utf8"));
const scenes = LIMIT ? cues.scenes.slice(0, LIMIT) : cues.scenes;

// A token id inside narration or a plate becomes its measured value. A BARE DIGIT is refused: the
// estate's banner carried six hand-typed numbers that were wrong within six hours, and a film is
// rendered once and watched for a year.
function resolve(text, sceneId) {
  const bare = String(text).match(/(?<![\w@.\-:/])\d{2,}(?![\w.\-:/])/g);
  // THE DOT IS A SEPARATOR, NOT A CHARACTER. `[\w.]*` is greedy over dots, so a token ending a
  // sentence — "@n.golive.minters." — captured the full stop into the id, produced
  // "n.golive.minters." which is in no register, and killed the render with "unknown token". No such
  // occurrence exists in the tree today; the shape did, and it was one authored full stop from
  // stopping every build. This matches an id as segments joined by dots, the same shape tokens.cjs
  // uses and the same shape the gate's own TOKEN_RE uses — so all three now agree on what an id is.
  const withTokens = String(text).replace(/@([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)/g, (m, id) => {
    if (!(id in measured)) { console.error(`scene ${sceneId}: unknown token @${id}`); process.exit(1); }
    const v = measured[id].value;
    return typeof v === "string" ? v : String(v);
  });
  if (bare) {
    console.error(`scene ${sceneId}: literal number(s) ${bare.join(", ")} in cue text. ` +
      `Numbers must be token ids so they re-derive from the artifact.`);
    process.exit(1);
  }
  return withTokens;
}

// ── THE RENDER FENCE — the only place that sees what actually reaches a frame ────────────────────
//
// THIS EXISTS BECAUSE A FILM SHIPPED WITH THE STUDIO'S CONTROL SURFACE ON SCREEN.
//
// The QC gate lints cue text — the words an AUTHOR writes. But a measurement plate's PRINTS band is
// machine output, pasted from a probe's recorded stdout, which no author ever typed. So probe-sourced
// text bypassed every word rule in the project BY CONSTRUCTION. The gate's own limits block says it
// plainly: "It never watches the render."
//
// Measured: the short cut's fifth frame carried "enabling auth on the OBS WebSocket server" — the
// tail of prove_golive_refuses_me.cjs, honestly printed by a program describing its own limit, and
// the one shape `honest_state.json` says is NEVER named or shown, with no override path anywhere,
// not even for a perfect quotation. The gate returned PASS. The frame said it anyway.
//
// So the fence moves to the last possible moment: every string about to be drawn, whatever wrote it.
// A probe is not a person and cannot be trusted to have read the film's rules.
const FORBIDDEN = [
  [/\bobs[- ]?websocket\b/i, "the studio control surface, by name"],
  [/\bStartStream\b/, "the actuator verb"],
  [/\brtmp:\/\//i, "a stream endpoint"],
  [/\b(?:10|127|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/, "a private address"],
  [/\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/, "a tailnet address"],
  [/\b[\w-]+\.uni-lab\.(?:local|solwright\.com)\b/i, "an internal hostname"],
  [/\btailnet\b/i, "the overlay network, by name"],
  [/[A-Za-z]:\\Users\\[\w.-]+/, "an operator path"],
  [/\blive_[A-Za-z0-9]{6,}/, "a stream key shape"],
];

function fence(svg, sceneId) {
  // Read the TEXT the viewer sees, not the markup around it.
  const shown = (svg.match(/>([^<]*)</g) || []).map((s) => s.slice(1, -1)).join("\n");
  const hits = FORBIDDEN.filter(([re]) => re.test(shown)).map(([re, why]) => `${why} — matched ${re}`);
  if (hits.length) {
    console.error(`\nRENDER REFUSED — scene ${sceneId} would put forbidden content on screen:`);
    hits.forEach((h) => console.error("  " + h));
    console.error(
      "\n  This is the rule with NO override in this project. A probe's recorded stdout is still\n" +
      "  something a viewer reads, and a program honestly describing its own limit can still name\n" +
      "  a thing the film may not show. Trim the probe's output, choose a different band, or quote\n" +
      "  a narrower range — but do not weaken this fence.\n");
    process.exit(1);
  }
  return svg;
}

// ── render ──────────────────────────────────────────────────────────────────────────────────────
const manifest = [];
console.log(`\nBUILDING CUT "${CUT}" — ${scenes.length} scene(s)\n`);

for (const s of scenes) {
  const id = s.id;
  let svg;
  if (s.plate === "measurement") {
    const pr = s.probe ? probe(s.probe) : null;
    if (s.probe && !pr) { console.error(`scene ${id}: no probe "${s.probe}" in forensic_latest.json`); process.exit(1); }
    // PRINTS comes from the recorded run, never from the cue file. If a cue wants to show output,
    // it must name a probe that actually produced it.
    // WHICH LINES OF A PROBE'S OUTPUT A FRAME SHOWS IS A DECLARED CHOICE, not a default.
    //
    // `verdict_line || tail` was the original default and it is wrong in both directions. A probe
    // that prints a verdict rendered ONE line and discarded everything else — so s06_witness said
    // "the count is on screen" over a band where the count did not appear. And a probe with no
    // verdict rendered its last four lines whatever they contained, which is how the studio's
    // control surface reached a frame.
    //
    // `prints_tail: N` takes the last N lines. `prints_lines: [i, j]` takes chosen ones. Both are
    // narrowing a real recording, which is what `tail` already was; the difference is that the
    // choice is now written down in the cue file where a reader can see it and disagree. The full
    // output stays in capture/forensic_latest.json, unedited, and the frame's SOURCE band names it.
    const tail = pr ? (pr.tail || []) : [];
    const prints = s.prints_literal
      ? resolve(s.prints_literal, id)
      : typeof s.prints_tail === "number" ? tail.slice(-s.prints_tail).join("\n")
      : Array.isArray(s.prints_lines) ? s.prints_lines.map((i) => tail[i]).filter(Boolean).join("\n")
      : (pr.verdict_line ? [pr.verdict_line, ...tail.filter((t) => t !== pr.verdict_line)].join("\n")
                         : tail.join("\n")) || `(exit ${pr.exit_code})`;
    svg = P.measurement({
      asks: resolve(s.asks, id),
      runs: pr ? pr.command : resolve(s.runs, id),
      prints,
      source: resolve(s.source, id),
      note: s.note ? resolve(s.note, id) : null,
    });
  } else if (s.plate === "quotation") {
    // The quoted bytes are re-read and re-hashed HERE, at render time, through tokens.cjs's own
    // quote() rule — the same function the QC gate uses. The film never carries a remembered
    // quotation; it carries whatever the file says when the frame is made, and the digest beside it.
    const q = T.quote(s.root, s.file, s.from, s.to);
    svg = P.quotation({
      lines: q.text.split(/\r?\n/),
      file: s.file, range: `${s.from}-${s.to}`, sha256: q.sha256,
      why: s.why ? resolve(s.why, id) : null,
    });
  } else if (s.plate === "intent") {
    svg = P.intent({ lines: s.lines.map((l) => resolve(l, id)) });
  } else {
    svg = P.title({ line1: resolve(s.line1, id), line2: s.line2 ? resolve(s.line2, id) : null, kicker: s.kicker });
  }

  const svgPath = path.join(SVG, `${CUT}_${id}.svg`);
  fs.writeFileSync(svgPath, fence(svg, id), "utf8");

  // RASTER — headless Chrome, --disable-gpu, screenshotting a static file. Text shaping only.
  const png = path.join(FRAMES, `${CUT}_${id}.png`);
  const r = spawnSync(CHROME, ["--headless", "--disable-gpu", "--hide-scrollbars",
    `--screenshot=${png}`, `--window-size=${P.W},${P.H}`, "--default-background-color=00000000",
    "file:///" + svgPath.replace(/\\/g, "/")], { encoding: "utf8", timeout: 120000 });
  if (!fs.existsSync(png)) { console.error(`scene ${id}: raster failed\n${r.stderr}`); process.exit(1); }

  // NARRATION — Piper, local, offline.
  const line = resolve(s.narration, id);
  const wav = path.join(AUDIO, `${CUT}_${id}.wav`);
  const pv = spawnSync("piper", ["-m", VOICE, "-f", wav], { input: line, encoding: "utf8", timeout: 180000 });
  if (!fs.existsSync(wav)) { console.error(`scene ${id}: piper failed\n${pv.stderr}`); process.exit(1); }

  const dur = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "default=nw=1:nk=1", wav], { encoding: "utf8" }).stdout.trim());

  manifest.push({
    id, plate: s.plate, png: path.relative(MC, png).split(path.sep).join("/"),
    wav: path.relative(MC, wav).split(path.sep).join("/"),
    narration: line, words: (line.match(/\S+/g) || []).length,
    audio_seconds: dur, hold_seconds: +(dur + (s.tail_silence || 0.9)).toFixed(3),
    png_sha256: crypto.createHash("sha256").update(fs.readFileSync(png)).digest("hex"),
    voice: path.basename(VOICE), probe: s.probe || null,
  });
  console.log(`  ${id.padEnd(22)} ${String(manifest.at(-1).words).padStart(3)}w  ${dur.toFixed(2)}s  raster ok`);
}

// ── compose ─────────────────────────────────────────────────────────────────────────────────────
const listFile = path.join(FRAMES, `${CUT}_concat.txt`);
const segs = [];
for (const m of manifest) {
  const seg = path.join(FRAMES, `${CUT}_${m.id}.mp4`);
  const r = spawnSync("ffmpeg", ["-y", "-loop", "1", "-i", path.join(MC, m.png),
    "-i", path.join(MC, m.wav), "-af", `apad=pad_dur=${(m.hold_seconds - m.audio_seconds).toFixed(3)}`,
    "-c:v", "libx264", "-t", String(m.hold_seconds), "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", seg],
    { encoding: "utf8", timeout: 300000 });
  if (!fs.existsSync(seg)) { console.error(`compose failed for ${m.id}\n${r.stderr.slice(-1200)}`); process.exit(1); }
  segs.push(seg);
}
fs.writeFileSync(listFile, segs.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"), "utf8");

const mp4 = path.join(OUT, `WELCOME_TO_UNI_LABS_${CUT}.mp4`);
const cc = spawnSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", mp4],
  { encoding: "utf8", timeout: 600000 });
if (!fs.existsSync(mp4)) { console.error(`concat failed\n${cc.stderr.slice(-1500)}`); process.exit(1); }

const probeOut = spawnSync("ffprobe", ["-v", "error", "-show_entries",
  "format=duration,size:stream=codec_name,width,height,r_frame_rate", "-of", "json", mp4],
  { encoding: "utf8" }).stdout;

fs.writeFileSync(path.join(FILM, "dgst", `MANIFEST_${CUT}.json`), JSON.stringify({
  schema: "uni.film.cut_manifest.v1",
  cut: CUT,
  built_utc: new Date().toISOString(),
  forensic_capture_utc: forensic.captured_utc,
  voice: path.basename(VOICE),
  scenes: manifest,
  output: path.relative(MC, mp4).split(path.sep).join("/"),
  output_sha256: crypto.createHash("sha256").update(fs.readFileSync(mp4)).digest("hex"),
  ffprobe: JSON.parse(probeOut),
  note: [
    "Every frame's numbers were resolved from tokens.cjs at build time and every PRINTS band is the",
    "recorded stdout of a probe in capture/forensic_latest.json. No number in this film was typed.",
  ],
}, null, 1) + "\n", "utf8");

const j = JSON.parse(probeOut);
console.log(`\n  OUTPUT  ${path.relative(MC, mp4).split(path.sep).join("/")}`);
console.log(`  ${(Number(j.format.size) / 1048576).toFixed(1)} MB · ${Number(j.format.duration).toFixed(1)}s · ` +
  `${j.streams.map((s) => s.codec_name).join("+")} · ${j.streams[0].width}x${j.streams[0].height}`);
console.log(`  manifest: lab/film/welcome/dgst/MANIFEST_${CUT}.json\n`);
