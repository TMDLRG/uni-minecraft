// Shared scene-building utilities for the TRAVELERS film.
// Used by build_seg1.js, build_seg2.js, ... etc.
const fs = require("fs"), path = require("path");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrap(text, max) {
  const w = text.split(/\s+/); const out = []; let c = "";
  for (const x of w) { if ((c + " " + x).trim().length <= max) c = (c + " " + x).trim(); else { if (c) out.push(c); c = x; } }
  if (c) out.push(c); return out;
}

function captionBlock(en, mr) {
  const enL = wrap(en, 90), mrL = wrap(mr, 82);
  const enFs = enL.length <= 2 ? 38 : enL.length <= 3 ? 32 : 28;
  const mrFs = mrL.length <= 2 ? 34 : mrL.length <= 3 ? 30 : 26;
  const enLh = Math.round(enFs * 1.22), mrLh = Math.round(mrFs * 1.32), gap = 28;
  const enH = (enL.length - 1) * enLh + enFs, mrH = (mrL.length - 1) * mrLh + mrFs;
  const padTop = 24, padBot = Math.round(mrFs * 0.65) + 18;
  const blockH = enH + gap + mrH + padTop + padBot, blockY = 1080 - blockH;
  const enB = blockY + padTop + enFs, mrB = enB + enH - enFs + gap + mrFs;
  const enT = enL.map((l, i) => `  <text x="960" y="${enB + i * enLh}" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="${enFs}" fill="#e6edf3">${esc(l)}</text>`).join("\n");
  const mrT = mrL.map((l, i) => `  <text x="960" y="${mrB + i * mrLh}" text-anchor="middle" font-family="Nirmala UI,'Mangal','Noto Sans Devanagari',sans-serif" font-size="${mrFs}" fill="#cdd6f4">${esc(l)}</text>`).join("\n");
  const dy = enB + enH - enFs + Math.round(gap / 2);
  return `\n  <rect x="0" y="${blockY}" width="1920" height="${blockH}" fill="#05070b" opacity="0.88"/>\n  <rect x="0" y="${blockY}" width="1920" height="3" fill="#89b4fa" opacity="0.5"/>\n${enT}\n  <rect x="800" y="${dy}" width="320" height="2" fill="#89b4fa" opacity="0.3"/>\n${mrT}`;
}

const STARS = `<g fill="#cdd6f4" opacity="0.5"><circle cx="180" cy="120" r="1.4"/><circle cx="380" cy="80" r="1"/><circle cx="640" cy="150" r="1.5"/><circle cx="900" cy="60" r="1.1"/><circle cx="1180" cy="180" r="1.3"/><circle cx="1420" cy="100" r="1.6"/><circle cx="1700" cy="220" r="1.4"/><circle cx="240" cy="380" r="1.1"/><circle cx="520" cy="320" r="1.5"/><circle cx="860" cy="280" r="1.2"/><circle cx="1320" cy="400" r="1"/><circle cx="1620" cy="470" r="1.3"/><circle cx="120" cy="560" r="1.2"/><circle cx="1040" cy="540" r="1.4"/><circle cx="1780" cy="600" r="1.1"/></g>`;

let _bg = 0;
const nbg = () => `g${_bg++}`;
function bg(id, a, b) { return `<defs><radialGradient id="${id}" cx="50%" cy="36%" r="82%"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#${id})"/>`; }

// Standard visual templates used across segments.
function title(big, sub, accent = "#89b4fa", size = 150) {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="360" text-anchor="middle" font-family="Georgia,serif" font-size="${size}" letter-spacing="${size > 120 ? 14 : 6}" fill="#e6edf3" font-weight="bold">${esc(big)}</text>
  <rect x="660" y="420" width="600" height="3" fill="${accent}" opacity="0.55"/>
  ${sub ? `<text x="960" y="500" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">${esc(sub)}</text>` : ""}`;
}

function quote(q, who) {
  return `${bg(nbg(), "#13111c", "#0b0e14")}${STARS}
  <text x="960" y="330" text-anchor="middle" font-family="Georgia,serif" font-size="54" fill="#cdd6f4" font-style="italic">${esc(q)}</text>
  ${who ? `<text x="960" y="430" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#6c7393">${esc(who)}</text>` : ""}`;
}

function statement(lines, accent = "#e6edf3") {
  const fs = 60, lh = 84, y0 = 360 - ((lines.length - 1) * lh) / 2;
  const t = lines.map((l, i) => `<text x="960" y="${y0 + i * lh}" text-anchor="middle" font-family="Georgia,serif" font-size="${fs}" fill="${i === lines.length - 1 ? accent : "#9aa7b4"}" font-weight="${i === lines.length - 1 ? "bold" : "normal"}">${esc(l)}</text>`).join("\n");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}\n${t}`;
}

function claimCard(tag, q, sub, color) {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <rect x="510" y="220" width="900" height="360" rx="18" fill="#1c2128" stroke="${color}" stroke-width="3"/>
  <text x="960" y="310" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="34" fill="${color}" letter-spacing="6">${esc(tag)}</text>
  <text x="960" y="410" text-anchor="middle" font-family="Georgia,serif" font-size="52" fill="#e6edf3">${esc(q)}</text>
  <text x="960" y="490" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#6c7393">${esc(sub)}</text>`;
}

function writeScenes(scenes, svgDir, cuesPath, segPrefix) {
  let n = 0;
  const cues = [];
  for (const [id, vis, en, mr] of scenes) {
    n++;
    const num = String(n).padStart(2, "0");
    const sid = `${segPrefix}_${num}_${id}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">${vis}${captionBlock(en, mr)}\n</svg>`;
    fs.writeFileSync(path.join(svgDir, sid + ".svg"), svg);
    cues.push({ n, id: sid, en, mr });
  }
  fs.writeFileSync(cuesPath, JSON.stringify(cues, null, 2));
  const words = scenes.reduce((a, s) => a + s[2].split(/\s+/).length, 0);
  console.log(`${scenes.length} scenes written; ~${words} EN words. cues -> ${path.relative(process.cwd(), cuesPath)}`);
}

module.exports = {
  esc, wrap, captionBlock, STARS, bg, nbg,
  title, quote, statement, claimCard,
  writeScenes,
};
