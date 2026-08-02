// assemble_cut.cjs — stitch per-movement scene arrays into one cue file, in narrative order.
//
// The movements are authored independently and in parallel, which is the only way a 100-scene
// documentary gets written in an evening. That parallelism has one cost and this file pays it:
// nobody who wrote a part saw the whole, so the seams have to be checked mechanically.
//
// It REFUSES rather than repairs:
//   * a duplicate scene id — two movements would silently overwrite each other's frames
//   * a scene with no narration — a silent frame is a hole nobody notices in a running film
//   * a bare numeral of two or more digits — the builder would refuse it later; better here, with
//     the movement named, than at render time with only a scene id
//   * an unknown plate shape, or a measurement plate naming a probe that is not in the capture
//   * M6 (the honest state) landing in the last quarter — the estate's own rule is that an adverse
//     result is never left where it reads as a footnote, and a film is the easiest place to bury one
//
// USAGE
//   node lab/film/welcome/render/assemble_cut.cjs --cut main  --parts <dir>
"use strict";

const fs = require("fs");
const path = require("path");

const FILM = path.resolve(__dirname, "..");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const CUT = arg("--cut", "main");
const PARTS = arg("--parts", path.join(FILM, "script", "parts", CUT));

const ORDER = ["m0m1", "m2", "m3m4", "m5", "m6", "m7", "m8", "m9"];
const forensic = JSON.parse(fs.readFileSync(path.join(FILM, "capture", "forensic_latest.json"), "utf8"));
const probeIds = new Set(forensic.probes.map((p) => p.id));

// A part file may be a bare array, or an object with .scenes — accept both, refuse anything else.
function scenesOf(raw, file) {
  let j;
  try { j = JSON.parse(raw); } catch (e) { die(`${file}: not JSON — ${e.message}`); }
  const s = Array.isArray(j) ? j : Array.isArray(j.scenes) ? j.scenes : null;
  if (!s) die(`${file}: no scene array found`);
  return s;
}
const problems = [];
const die = (m) => { console.error("ASSEMBLE REFUSED: " + m); process.exit(1); };

const all = [];
for (const key of ORDER) {
  const f = path.join(PARTS, `${key}.json`);
  if (!fs.existsSync(f)) { problems.push(`missing movement part: ${key}.json`); continue; }
  const scenes = scenesOf(fs.readFileSync(f, "utf8"), `${key}.json`);
  scenes.forEach((s) => all.push({ ...s, _movement: key }));
}

const seen = new Map();
all.forEach((s, i) => {
  const where = `${s._movement}[${i}] ${s.id || "(no id)"}`;
  if (!s.id) problems.push(`${where}: no id`);
  else if (seen.has(s.id)) problems.push(`${where}: duplicate id, also in ${seen.get(s.id)}`);
  else seen.set(s.id, s._movement);

  if (!s.narration || !String(s.narration).trim()) problems.push(`${where}: no narration — a silent frame`);
  if (!["measurement", "quotation", "intent", "title"].includes(s.plate)) problems.push(`${where}: unknown plate "${s.plate}"`);
  if (s.plate === "measurement" && s.probe && !probeIds.has(s.probe)) problems.push(`${where}: probe "${s.probe}" is not in the capture`);
  if (s.plate === "quotation" && !["minecraft", "flagellum", "cookbook"].includes(s.root)) problems.push(`${where}: quotation root "${s.root}" unknown`);

  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith("_") || typeof v !== "string") continue;
    const bare = v.match(/(?<![\w@.\-:/])\d{2,}(?![\w.\-:/])/g);
    // line numbers on a quotation plate are structural, not spoken
    if (bare && !(s.plate === "quotation" && /^(from|to|range)$/.test(k))) {
      problems.push(`${where}.${k}: hand-typed numeral(s) ${bare.join(", ")} — use a token id`);
    }
  }
});

// M6 must not be buried — AND IT MUST EXIST.
//
// The first version of this guard read `if (lastM6 >= 0 && lastM6 > all.length * 0.8)`, so a cut
// with NO honest-state movement at all passed it vacuously. An audit found exactly that: the main
// cut had been authored with M6 entirely absent, and the guard written to stop adverse results being
// buried would have waved through a film that had removed them.
//
// A missing adverse movement is not a milder version of a buried one. It is the same failure,
// completed. So absence is now the louder error of the two.
const movementsPresent = new Set(all.map((s) => s._movement));
for (const key of ORDER) {
  if (!movementsPresent.has(key)) problems.push(`movement ${key} is ENTIRELY ABSENT from this cut`);
}
const m6count = all.filter((s) => s._movement === "m6").length;
if (m6count === 0) {
  problems.push("THE HONEST-STATE MOVEMENT IS ABSENT. A film that drops M6 is not a shorter film; it is a different claim, and this assembler will not make it.");
} else {
  const lastM6 = all.map((s) => s._movement).lastIndexOf("m6");
  if (lastM6 > all.length * 0.8) {
    problems.push(`the honest-state movement ends at scene ${lastM6 + 1} of ${all.length} — the last fifth, where an adverse result reads as a footnote`);
  }
  if (m6count < 4) {
    problems.push(`only ${m6count} honest-state scene(s). The declared adverse facts do not fit in fewer than four frames without being clustered into one apologetic scene.`);
  }
}

if (problems.length) {
  console.error(`ASSEMBLE REFUSED — ${problems.length} problem(s):`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}

const out = {
  schema: "uni.film.cues.v1",
  cut: CUT,
  assembled_utc: new Date().toISOString(),
  forensic_capture_utc: forensic.captured_utc,
  design_rule: [
    "EXPOSE THE MEASUREMENT, NEVER ASSERT THE CONCLUSION. The operator's instruction, verbatim:",
    "'only ever shown and presented for others to observe of the signal and calibrate for them selves'.",
    "Narration names what is on screen and stops. Every PRINTS band is the recorded stdout of a probe;",
    "every quotation is re-read and re-hashed at render time; every number is a token id.",
  ],
  scenes: all.map(({ _movement, ...s }) => s),
};
fs.writeFileSync(path.join(FILM, "script", `cues_${CUT}.json`), JSON.stringify(out, null, 2) + "\n", "utf8");

const byMovement = {};
all.forEach((s) => { byMovement[s._movement] = (byMovement[s._movement] || 0) + 1; });
const words = all.reduce((a, s) => a + (String(s.narration).match(/\S+/g) || []).length, 0);
console.log(`assembled cues_${CUT}.json — ${all.length} scene(s), ${words} narration word(s)`);
console.log(`  by movement: ${ORDER.filter((k) => byMovement[k]).map((k) => `${k}=${byMovement[k]}`).join(" · ")}`);
console.log(`  plates: ${["measurement", "quotation", "intent", "title"].map((p) => `${p}=${all.filter((s) => s.plate === p).length}`).join(" · ")}`);
const m6end = all.map((s) => s._movement).lastIndexOf("m6");
console.log(`  honest state: ${m6count} frame(s), ending at scene ${m6end + 1} of ${all.length} ` +
  `(${Math.round(((m6end + 1) / all.length) * 100)}% in — must not be the last fifth)`);
// The rate is READ FROM THE SHIPPED CUT, not guessed and not typed. MANIFEST_short.json records
// every scene's word count and its synthesised duration; the rate is their ratio. The first draft
// of this line hardcoded 3.34 w/s from memory of the build log and the real figure is 3.42 — the
// film's own tooling was one line from carrying a hand-typed number, which is the exact defect the
// film exists to demonstrate against.
function measuredRate() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(FILM, "dgst", "MANIFEST_short.json"), "utf8"));
    const w = m.scenes.reduce((a, s) => a + s.words, 0);
    const sec = m.scenes.reduce((a, s) => a + s.audio_seconds, 0);
    return { rate: w / sec, from: `MANIFEST_short.json (${w} words / ${sec.toFixed(1)}s)` };
  } catch {
    return { rate: null, from: "NOT MEASURABLE — no shipped cut to read a rate from" };
  }
}
const RM = measuredRate();
const RATE = RM.rate;
const tail = all.reduce((a, s) => a + (typeof s.tail_silence === "number" ? s.tail_silence : 0.9), 0);
if (RATE) {
  console.log(`  estimated runtime ~${Math.round(words / RATE + tail)}s ` +
    `(${(words / RATE / 60).toFixed(1)} min of speech + ${Math.round(tail)}s of pause)`);
  console.log(`  at ${RATE.toFixed(2)} w/s, read from ${RM.from} — measured, not assumed`);
} else {
  console.log(`  runtime NOT ESTIMATED — ${RM.from}. An estimate with no measured rate behind it`);
  console.log(`  would be a guess wearing a decimal point.`);
}
