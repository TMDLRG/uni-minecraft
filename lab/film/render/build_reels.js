// Build 9:16 vertical reels (1080x1920) that promote the full film and point to the live URL.
// Run: node build_reels.js
const fs = require("fs"), path = require("path");
const SVG = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "reels_cues.json");
const URL = "youtube.com/watch?v=82yGA5KXYEw";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrap(t, max) { const w = t.split(/\s+/), o = []; let c = ""; for (const x of w) { if ((c + " " + x).trim().length <= max) c = (c + " " + x).trim(); else { if (c) o.push(c); c = x; } } if (c) o.push(c); return o; }

const STARS = `<g fill="#cdd6f4" opacity="0.5"><circle cx="140" cy="180" r="2"/><circle cx="380" cy="120" r="1.4"/><circle cx="700" cy="220" r="1.8"/><circle cx="940" cy="140" r="1.4"/><circle cx="240" cy="520" r="1.6"/><circle cx="820" cy="480" r="1.8"/><circle cx="540" cy="360" r="1.4"/><circle cx="980" cy="640" r="1.5"/><circle cx="120" cy="760" r="1.4"/></g>`;

// vertical card: hook (top), big punch, spoken caption, CTA banner (bottom)
function reelCard(hookLines, punch, punchColor, capEn, capMr) {
  const hook = hookLines.map((l, i) =>
    `<text x="540" y="${360 + i * 92}" text-anchor="middle" font-family="Georgia,serif" font-size="76" font-weight="bold" fill="#e6edf3">${esc(l)}</text>`).join("\n");
  const punchT = punch
    ? `<text x="540" y="820" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="${punch.length > 14 ? 56 : 96}" fill="${punchColor}" font-weight="bold">${esc(punch)}</text>`
    : "";
  const enL = wrap(capEn, 38), mrL = wrap(capMr, 34);
  const enT = enL.map((l, i) => `<text x="540" y="${1120 + i * 52}" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="40" fill="#cdd6f4">${esc(l)}</text>`).join("\n");
  const mrY = 1120 + enL.length * 52 + 28;
  const mrT = mrL.map((l, i) => `<text x="540" y="${mrY + i * 50}" text-anchor="middle" font-family="Nirmala UI,'Mangal',sans-serif" font-size="36" fill="#9aa7b4">${esc(l)}</text>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs><radialGradient id="bg" cx="50%" cy="32%" r="80%"><stop offset="0%" stop-color="#11151f"/><stop offset="100%" stop-color="#0b0e14"/></radialGradient></defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  ${STARS}
  <text x="540" y="180" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="30" letter-spacing="6" fill="#6c7393">TRAVELERS · प्रवासी</text>
  ${hook}
  ${punchT}
  ${enT}
  ${mrT}
  <!-- CTA banner -->
  <rect x="0" y="1640" width="1080" height="280" fill="#05070b" opacity="0.9"/>
  <rect x="0" y="1640" width="1080" height="4" fill="#89b4fa"/>
  <rect x="240" y="1690" width="600" height="84" rx="42" fill="#89b4fa"/>
  <text x="540" y="1745" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="40" font-weight="bold" fill="#0b0e12">▶  Watch the full film</text>
  <text x="540" y="1830" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="34" fill="#e6edf3">${URL}</text>
  <text x="540" y="1882" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">an honest science film · EN · मराठी · हिंदी</text>
</svg>`;
}

const reels = [
  { id: "reel1_weight",
    svg: reelCard(["Does your weight", "come from gravity —", "or from the air?"], "7 worlds tested", "#f9e2af",
      "On the airless Moon, you'd still weigh something. That one test settles it.",
      "हवारहित चंद्रावरही तुमचे वजन असेल. ती एक चाचणी हे ठरवते."),
    en: "Quick question. The weight you feel right now — does it come from gravity pulling on your mass, or from the air pressing down on you? We tested that idea across seven worlds. On the airless Moon, with no atmosphere at all, you would still weigh something. That one test settles it. Watch the full honest science film — the link is on screen." },
  { id: "reel2_ozone",
    svg: reelCard(["Ozone blocks the", "Sun's deadliest light."], "but is it LIFE?", "#89dceb",
      "A real shield — yet not the same as life. We tested that five separate ways.",
      "खरे कवच — पण जीवन नाही. आम्ही ते पाच प्रकारे तपासले."),
    en: "The thin layer of ozone in our sky blocks the Sun's deadliest ultraviolet light, by a factor of more than a trillion trillion trillion. That shield is absolutely real. But is ozone the same thing as life? That is a different question, and we tested it five separate ways. The full film breaks down every one. Link on screen." },
  { id: "reel3_proven",
    svg: reelCard(["We tested 3 big ideas.", "We never said", '"proven."'], "", "#a6e3a1",
      "Some survived. Some didn't. All of it honest, all of it sourced.",
      "काही टिकले. काही नाही. सर्व प्रामाणिक, सर्व स्रोतासह."),
    en: "We took three big, beautiful, hopeful ideas about the universe, and we tested every one of them, fairly, all the way down. And across the entire film, we never once used the word proven. Some ideas survived. Some did not. All of it honest, all of it sourced, in English and Marathi. Come and see." },
];

const cues = [];
for (const r of reels) { fs.writeFileSync(path.join(SVG, r.id + ".svg"), r.svg); cues.push({ id: r.id, en: r.en }); }
fs.writeFileSync(CUES, JSON.stringify(cues, null, 2));
console.log(`${reels.length} reel SVGs written → ${reels.map(r => r.id).join(", ")}`);
