// Build SVG scenes for Segment 1 (cold open + Act 1).
// Each scene = a visual area (top 720px) + a dual-language caption block (bottom 360px).
// Captions: English (spoken language) on top, Marathi (Devanagari) below.
// Run: node build_scenes.js
const fs = require("fs"), path = require("path");
const SVG_DIR = path.join(__dirname, "..", "svg");

// ------------------------------------------------------------------- WRAPPING
function wrap(text, maxChars) {
  const words = text.split(/\s+/); const lines = []; let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ------------------------------------------------------------------- CAPTIONS
function captionBlock(en, mr) {
  const enLines = wrap(en, 88);
  const mrLines = wrap(mr, 80);
  const enFs = enLines.length <= 2 ? 38 : enLines.length <= 3 ? 32 : 28;
  const mrFs = mrLines.length <= 2 ? 34 : mrLines.length <= 3 ? 30 : 26;
  const enLh = Math.round(enFs * 1.22);
  const mrLh = Math.round(mrFs * 1.32); // Devanagari needs more line-height for marks above/below
  const gap = 28;
  const enBlockH = (enLines.length - 1) * enLh + enFs;
  const mrBlockH = (mrLines.length - 1) * mrLh + Math.round(mrFs * 1.0);
  const totalH = enBlockH + gap + mrBlockH;
  const padTop = 24, padBot = Math.round(mrFs * 0.65) + 18; // descender + bottom margin
  const blockH = totalH + padTop + padBot;
  const blockY = 1080 - blockH;                   // anchor to bottom of frame
  const enFirstBaseline = blockY + padTop + enFs; // top of EN baseline
  const mrFirstBaseline = enFirstBaseline + enBlockH - enFs + gap + mrFs;

  const enTxt = enLines.map((l, i) =>
    `  <text x="960" y="${enFirstBaseline + i * enLh}" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="${enFs}" fill="#e6edf3">${escape(l)}</text>`
  ).join("\n");
  const mrTxt = mrLines.map((l, i) =>
    `  <text x="960" y="${mrFirstBaseline + i * mrLh}" text-anchor="middle" font-family="Nirmala UI,'Mangal','Noto Sans Devanagari',sans-serif" font-size="${mrFs}" fill="#cdd6f4">${escape(l)}</text>`
  ).join("\n");
  const dividerY = enFirstBaseline + enBlockH - enFs + Math.round(gap / 2);

  return `
  <rect x="0" y="${blockY}" width="1920" height="${blockH}" fill="#05070b" opacity="0.88"/>
  <rect x="0" y="${blockY}" width="1920" height="3" fill="#89b4fa" opacity="0.5"/>
${enTxt}
  <rect x="800" y="${dividerY}" width="320" height="2" fill="#89b4fa" opacity="0.3"/>
${mrTxt}`;
}

function escape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --------------------------------------------------------------------- BASES
const STARFIELD = `
  <g fill="#cdd6f4" opacity="0.55">
    <circle cx="180" cy="120" r="1.4"/><circle cx="380" cy="80" r="1.0"/><circle cx="640" cy="140" r="1.5"/>
    <circle cx="900" cy="60" r="1.1"/><circle cx="1180" cy="180" r="1.3"/><circle cx="1420" cy="100" r="1.6"/>
    <circle cx="1700" cy="220" r="1.4"/><circle cx="240" cy="380" r="1.1"/><circle cx="520" cy="320" r="1.5"/>
    <circle cx="860" cy="280" r="1.2"/><circle cx="1320" cy="400" r="1.0"/><circle cx="1620" cy="480" r="1.3"/>
    <circle cx="120" cy="560" r="1.2"/><circle cx="1040" cy="540" r="1.4"/><circle cx="1780" cy="600" r="1.1"/>
  </g>`;

function pageBg(gradId, c1, c2) {
  return `
  <defs>
    <radialGradient id="${gradId}" cx="50%" cy="38%" r="80%">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#${gradId})"/>`;
}

// ----------------------------------------------------------------- VISUAL: per-scene visual area (in the top 720px)

const visuals = {
  // OPEN-1: TRAVELERS cold open — vast cosmic field
  open1: `
${pageBg("bg1", "#11151f", "#0b0e14")}
${STARFIELD}
  <text x="960" y="340" text-anchor="middle" font-family="Georgia, serif" font-size="140" letter-spacing="20" fill="#e6edf3" font-weight="bold">T R A V E L E R S</text>
  <rect x="660" y="400" width="600" height="3" fill="#89b4fa" opacity="0.5"/>
  <text x="960" y="475" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="6">A N   H O N E S T   S C I E N C E   F I L M</text>
  <text x="960" y="640" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="26" fill="#f9e2af" opacity="0.7" font-style="italic">Segment 1 of 5</text>`,

  // OPEN-2: priors / many travelers — soft warm horizon
  open2: `
${pageBg("bg2", "#1a1822", "#0b0e14")}
${STARFIELD}
  <!-- soft horizon -->
  <ellipse cx="960" cy="700" rx="1100" ry="80" fill="#f9e2af" opacity="0.08"/>
  <ellipse cx="960" cy="700" rx="700" ry="40" fill="#fab387" opacity="0.10"/>
  <!-- many small silhouettes walking, abstract -->
  <g fill="#6c7393" opacity="0.7">
    <circle cx="380" cy="600" r="6"/><rect x="378" y="606" width="4" height="22" rx="2"/>
    <circle cx="520" cy="590" r="7"/><rect x="517" y="597" width="6" height="26" rx="2"/>
    <circle cx="700" cy="610" r="6"/><rect x="698" y="616" width="4" height="22" rx="2"/>
    <circle cx="900" cy="585" r="8"/><rect x="896" y="593" width="8" height="28" rx="2"/>
    <circle cx="1080" cy="605" r="6"/><rect x="1078" y="611" width="4" height="22" rx="2"/>
    <circle cx="1260" cy="595" r="7"/><rect x="1257" y="602" width="6" height="26" rx="2"/>
    <circle cx="1480" cy="610" r="6"/><rect x="1478" y="616" width="4" height="22" rx="2"/>
  </g>
  <text x="960" y="240" text-anchor="middle" font-family="Georgia, serif" font-size="44" fill="#9aa7b4" font-style="italic">"Every one of us arrived here..."</text>`,

  // OPEN-3: a lens / eye / perception — the prior as filter
  open3: `
${pageBg("bg3", "#11151f", "#0b0e14")}
${STARFIELD}
  <!-- single circular lens shape with refracted lines through it -->
  <g transform="translate(960,360)">
    <circle cx="0" cy="0" r="160" fill="none" stroke="#89b4fa" stroke-width="3" opacity="0.7"/>
    <circle cx="0" cy="0" r="100" fill="none" stroke="#89b4fa" stroke-width="2" opacity="0.35"/>
    <circle cx="0" cy="0" r="40" fill="#cdd6f4" opacity="0.18"/>
    <!-- rays incoming, bent through lens -->
    <g stroke="#f9e2af" stroke-width="2" opacity="0.6">
      <line x1="-380" y1="-200" x2="-160" y2="-80"/><line x1="-160" y1="-80" x2="380" y2="120"/>
      <line x1="-380" y1="-100" x2="-160" y2="-30"/><line x1="-160" y1="-30" x2="380" y2="60"/>
      <line x1="-380" y1="0" x2="-160" y2="20"/><line x1="-160" y1="20" x2="380" y2="0"/>
      <line x1="-380" y1="100" x2="-160" y2="80"/><line x1="-160" y1="80" x2="380" y2="-40"/>
      <line x1="-380" y1="200" x2="-160" y2="140"/><line x1="-160" y1="140" x2="380" y2="-80"/>
    </g>
  </g>
  <text x="960" y="640" text-anchor="middle" font-family="Georgia, serif" font-size="34" fill="#6c7393" font-style="italic">A prior is not a flaw — it is how a mind survives.</text>`,

  // OPEN-4: title refrain / call to look
  open4: `
${pageBg("bg4", "#11151f", "#0b0e14")}
${STARFIELD}
  <text x="960" y="280" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="#9aa7b4" letter-spacing="6">This film is about</text>
  <text x="960" y="420" text-anchor="middle" font-family="Georgia, serif" font-size="180" fill="#e6edf3" font-weight="bold">LOOKING</text>
  <rect x="660" y="470" width="600" height="3" fill="#89b4fa" opacity="0.5"/>
  <text x="960" y="600" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="30" fill="#9aa7b4" font-style="italic">one big idea — and the way we test what we believe</text>`,

  // A1-1: dreamer — single thinker silhouette against cosmos
  a1_1: `
${pageBg("bg5", "#11151f", "#0b0e14")}
${STARFIELD}
  <!-- a single thinker silhouette, looking up -->
  <g transform="translate(960,640)" fill="#3b3450" opacity="0.85">
    <ellipse cx="0" cy="0" rx="180" ry="40"/>
    <path d="M -80 -20 L -80 -260 Q -80 -300 -40 -300 L 40 -300 Q 80 -300 80 -260 L 80 -20 Z"/>
    <circle cx="0" cy="-330" r="40"/>
  </g>
  <!-- thought wisps -->
  <g stroke="#89b4fa" stroke-width="2" fill="none" opacity="0.4">
    <circle cx="960" cy="200" r="60"/><circle cx="1080" cy="160" r="35"/><circle cx="840" cy="170" r="40"/>
  </g>
  <text x="960" y="100" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#f9e2af" font-style="italic" opacity="0.85">"Why does the sky protect us?"</text>`,

  // A1-2: three claims emerge as glowing cards
  a1_2: `
${pageBg("bg6", "#11151f", "#0b0e14")}
${STARFIELD}
  <text x="960" y="160" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="38" fill="#9aa7b4" letter-spacing="4">three bold proposals</text>
  <!-- three claim cards -->
  <g font-family="ui-sans-serif,'Segoe UI',sans-serif">
    <rect x="120" y="260" width="520" height="320" rx="14" fill="#1c2128" stroke="#89dceb" stroke-width="2"/>
    <text x="380" y="340" text-anchor="middle" font-size="28" fill="#89dceb" letter-spacing="3">OZONE</text>
    <text x="380" y="430" text-anchor="middle" font-size="30" fill="#e6edf3">the source of life?</text>
    <text x="380" y="500" text-anchor="middle" font-size="22" fill="#6c7393">— a shield, or something more</text>

    <rect x="700" y="260" width="520" height="320" rx="14" fill="#1c2128" stroke="#f9e2af" stroke-width="2"/>
    <text x="960" y="340" text-anchor="middle" font-size="28" fill="#f9e2af" letter-spacing="3">PRESSURE</text>
    <text x="960" y="430" text-anchor="middle" font-size="30" fill="#e6edf3">the source of weight?</text>
    <text x="960" y="500" text-anchor="middle" font-size="22" fill="#6c7393">— not mass, but the press of air</text>

    <rect x="1280" y="260" width="520" height="320" rx="14" fill="#1c2128" stroke="#a6e3a1" stroke-width="2"/>
    <text x="1540" y="340" text-anchor="middle" font-size="28" fill="#a6e3a1" letter-spacing="3">PLANETS</text>
    <text x="1540" y="430" text-anchor="middle" font-size="30" fill="#e6edf3">a great machine?</text>
    <text x="1540" y="500" text-anchor="middle" font-size="22" fill="#6c7393">— gears in solar engineering</text>
  </g>`,

  // A1-3: question reframed — "what would have to be true?"
  a1_3: `
${pageBg("bg7", "#11151f", "#0b0e14")}
${STARFIELD}
  <text x="960" y="240" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="#6c7393" font-style="italic">The question is never</text>
  <text x="960" y="320" text-anchor="middle" font-family="Georgia, serif" font-size="56" fill="#9aa7b4" text-decoration="line-through">"who dares to ask"</text>
  <text x="960" y="440" text-anchor="middle" font-family="Georgia, serif" font-size="40" fill="#6c7393" font-style="italic">it is</text>
  <text x="960" y="540" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#e6edf3" font-weight="bold">"what would have to be true,</text>
  <text x="960" y="630" text-anchor="middle" font-family="Georgia, serif" font-size="64" fill="#e6edf3" font-weight="bold">and how would we know."</text>`,

  // A1-4: balance — honor by testing
  a1_4: `
${pageBg("bg8", "#11151f", "#0b0e14")}
${STARFIELD}
  <!-- a balance scale, in equilibrium -->
  <g transform="translate(960,400)" stroke="#cdd6f4" stroke-width="3" fill="none">
    <line x1="0" y1="-160" x2="0" y2="160"/>
    <line x1="-240" y1="-100" x2="240" y2="-100"/>
    <line x1="-240" y1="-100" x2="-240" y2="-40"/>
    <line x1="240" y1="-100" x2="240" y2="-40"/>
    <ellipse cx="-240" cy="-30" rx="100" ry="20" fill="#1c2128" stroke="#89b4fa"/>
    <ellipse cx="240" cy="-30" rx="100" ry="20" fill="#1c2128" stroke="#a6e3a1"/>
    <!-- base -->
    <line x1="-80" y1="160" x2="80" y2="160"/>
  </g>
  <text x="720" y="395" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="26" fill="#89b4fa">the dream</text>
  <text x="1200" y="395" text-anchor="middle" font-family="ui-sans-serif,'Segoe UI',sans-serif" font-size="26" fill="#a6e3a1">the test</text>
  <text x="960" y="640" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#f9e2af" font-style="italic" opacity="0.85">"We test it, honestly, all the way down."</text>`,
};

// --------------------------------------------------------------------- SCENES

const scenes = [
  { id: "scene_01_open1", visual: visuals.open1,
    en: "Life is made of travelers. We did not create the world we move through, and we do not fully understand it.",
    mr: "जीवन प्रवाशांचे बनलेले आहे. आपण ज्या जगातून प्रवास करतो ते आपण निर्माण केले नाही, आणि ते आपल्याला पूर्णपणे समजत नाही." },
  { id: "scene_02_open2", visual: visuals.open2,
    en: "Every one of us arrived here and started learning. Some of what we learned was love. Some of it was fear — separation, struggle, systems that broke their promises.",
    mr: "आपल्यापैकी प्रत्येक जण इथे आला आणि शिकू लागला. आपण जे शिकलो त्यातील काही प्रेम होते. काही भीती होती — विभक्तता, संघर्ष, वचने मोडलेल्या व्यवस्था." },
  { id: "scene_03_open3", visual: visuals.open3,
    en: "A prior is not a flaw. It is how a mind survives. But a prior set by hurt can make us certain too early — sure of an answer before we have looked.",
    mr: "पूर्वग्रह म्हणजे दोष नाही. हे मन कसे टिकते याचे ते स्वरूप आहे. परंतु दुखातून आलेला पूर्वग्रह आपल्याला फार लवकर खात्री करवू शकतो — पाहण्यापूर्वीच उत्तराची खात्री." },
  { id: "scene_04_open4", visual: visuals.open4,
    en: "This film is about looking. About one big, hopeful idea, and the gentle, stubborn discipline we use to test any idea fairly — including our own.",
    mr: "हा चित्रपट पाहण्याबद्दल आहे. एका मोठ्या, आशादायक कल्पनेबद्दल, आणि कोणत्याही कल्पनेची प्रामाणिकपणे चाचणी घेण्यासाठी आपण वापरतो ती सौम्य, हट्टी शिस्त — आपलीच कल्पना असली तरीही." },
  { id: "scene_05_a1_1", visual: visuals.a1_1,
    en: "It begins, as these things often do, with a curious person and a question too big to ignore. Why do worlds hold the things they hold? Why does the sky protect us? What is life, really?",
    mr: "हे सुरू होते, जसे अनेकदा होते, एका जिज्ञासू व्यक्तीने आणि दुर्लक्ष करण्यासाठी फार मोठ्या प्रश्नाने. जग ज्या गोष्टी धारण करतात त्या का? आकाश आपले रक्षण का करते? जीवन म्हणजे खरोखर काय?" },
  { id: "scene_06_a1_2", visual: visuals.a1_2,
    en: "Out of that wondering came a bold proposal — that the ozone in our sky is something close to the source of life itself; that the weight we feel might come not from mass, but from the press of the air; that the planets move like a great machine.",
    mr: "त्या आश्चर्यातून एक धाडसी प्रस्ताव आला — की आपल्या आकाशातील ओझोन जीवनाच्या स्रोताच्या जवळचे काहीतरी आहे; की आपण अनुभवतो ते वजन वस्तुमानातून नाही, तर हवेच्या दाबातून येऊ शकते; की ग्रह एका मोठ्या यंत्रासारखे फिरतात." },
  { id: "scene_07_a1_3", visual: visuals.a1_3,
    en: "These are extraordinary claims. And extraordinary claims are not the enemy. They are invitations. The question is never who dares to ask — it is what would have to be true, and how would we know.",
    mr: "हे असाधारण दावे आहेत. आणि असाधारण दावे शत्रू नाहीत. ते आमंत्रणे आहेत. प्रश्न कधीही 'कोण विचारण्याची हिंमत करतो' हा नसतो — तर 'काय खरे असावे, आणि आपल्याला कसे कळेल' हा असतो." },
  { id: "scene_08_a1_4", visual: visuals.a1_4,
    en: "So we honor the dream by doing the hardest, kindest thing we can for it: we test it, honestly, all the way down.",
    mr: "म्हणून आपण स्वप्नाचा सन्मान करतो, त्याच्यासाठी आपण करू शकतो ती सर्वात कठीण आणि सर्वात दयाळू गोष्ट करून: आपण त्याची चाचणी घेतो, प्रामाणिकपणे, अगदी खालपर्यंत." },
];

// ------------------------------------------------------------------ EMIT
for (const s of scenes) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">${s.visual}${captionBlock(s.en, s.mr)}
</svg>`;
  const out = path.join(SVG_DIR, s.id + ".svg");
  fs.writeFileSync(out, svg);
  console.log("wrote", path.relative(path.join(__dirname, "..", ".."), out));
}
console.log(`\n${scenes.length} scene SVGs generated.`);

// Also emit the script-cue JSON so the audio synth + composer can pick it up.
const cues = scenes.map(s => ({ id: s.id, en: s.en, mr: s.mr }));
fs.writeFileSync(path.join(__dirname, "..", "script", "segment_01_cues.json"),
  JSON.stringify(cues, null, 2));
console.log("wrote lab/film/script/segment_01_cues.json");
