// Assemble the full bilingual narration (Marathi primary, English reference) from the
// per-segment scene cues into a single document. Run: node assemble_narration.js
const fs = require("fs"), path = require("path");
const SCR = path.join(__dirname, "..", "script");
const OUT = path.join(__dirname, "..", "dgst");
fs.mkdirSync(OUT, { recursive: true });

const segs = [
  ["01", "TRAVELERS — प्रवासी", "Cold open · The Traveler · the history of bold ideas · the discipline"],
  ["02", "THE SKY'S SHIELD — आकाशाचे कवच", "Claim 1 (Ozone = Life) decomposed into five readings, each tested"],
  ["03", "THE WEIGHT OF WORLDS — जगांचे वजन", "Claim 2 (pressure replaces gravity) tested on seven worlds"],
  ["04", "THE BREATH OF LIFE — जीवनाचा श्वास", "Claim 3 (a single thread through all life) tested"],
  ["05", "THE HONEST GIFT — प्रामाणिक भेट", "Synthesis · meaning · close"],
];

let md = `# TRAVELERS — संपूर्ण मराठी निवेदन (Full Marathi Narration)
## with the English line beneath each, for verification

*A five-part science film. Marathi narration primary; English reference line beneath each.
Every scientific number is traced to a public source (see the Research Dossier). The word
"proven" appears nowhere — by design.*

*हे पाच भागांचे विज्ञान-चित्रपटाचे संपूर्ण निवेदन आहे. प्रत्येक मराठी ओळीखाली पडताळणीसाठी इंग्रजी ओळ
दिली आहे. प्रत्येक वैज्ञानिक आकडा सार्वजनिक स्रोताशी जोडलेला आहे. "सिद्ध" हा शब्द कुठेही वापरलेला नाही.*

`;

let totMr = 0, totEn = 0, totScenes = 0;
for (const [num, title, sub] of segs) {
  const cues = JSON.parse(fs.readFileSync(path.join(SCR, `segment_${num}_cues.json`), "utf8"));
  md += `\n---\n\n## SEGMENT ${num} — ${title}\n*${sub}*\n\n`;
  cues.forEach((c, i) => {
    totScenes++;
    totMr += c.mr.split(/\s+/).length;
    totEn += c.en.split(/\s+/).length;
    md += `**${i + 1}.** ${c.mr}\n\n`;
    md += `> *EN:* ${c.en}\n\n`;
  });
}

md = md.replace("# TRAVELERS", `<!-- ${totScenes} scenes · ${totMr} Marathi words · ${totEn} English words -->\n\n# TRAVELERS`);
fs.writeFileSync(path.join(OUT, "NARRATION_FULL_MR.md"), md);
console.log(`wrote dgst/NARRATION_FULL_MR.md — ${totScenes} scenes, ${totMr} MR words, ${totEn} EN words`);
