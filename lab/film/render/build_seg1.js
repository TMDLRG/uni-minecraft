// Build the FULL ~20-minute Segment 1 (TRAVELERS): cold open + The Traveler +
// the three claims in depth + the history of bold claims (Wegener, Le Sage) + the discipline.
// Each scene = one visual (top ~700px) + dual-language caption (EN spoken, MR captions).
// Run: node build_seg1.js
const fs = require("fs"), path = require("path");
const SVG_DIR = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "segment_01_cues.json");

// ---------- helpers ----------
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
function bg(id, a, b) { return `<defs><radialGradient id="${id}" cx="50%" cy="36%" r="82%"><stop offset="0%" stop-color="${a}"/><stop offset="100%" stop-color="${b}"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#${id})"/>`; }

// ---------- visual templates ----------
let _bg = 0; const nbg = () => `g${_bg++}`;
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
function threeClaims() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="150" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="4">three bold proposals</text>
  <g font-family="ui-sans-serif,sans-serif">
  <rect x="110" y="240" width="540" height="340" rx="14" fill="#1c2128" stroke="#89dceb" stroke-width="2"/><text x="380" y="320" text-anchor="middle" font-size="28" fill="#89dceb" letter-spacing="3">OZONE</text><text x="380" y="410" text-anchor="middle" font-size="32" fill="#e6edf3">the source of life?</text><text x="380" y="480" text-anchor="middle" font-size="22" fill="#6c7393">a shield — or something more</text>
  <rect x="690" y="240" width="540" height="340" rx="14" fill="#1c2128" stroke="#f9e2af" stroke-width="2"/><text x="960" y="320" text-anchor="middle" font-size="28" fill="#f9e2af" letter-spacing="3">PRESSURE</text><text x="960" y="410" text-anchor="middle" font-size="32" fill="#e6edf3">the source of weight?</text><text x="960" y="480" text-anchor="middle" font-size="22" fill="#6c7393">not mass, but the press of air</text>
  <rect x="1270" y="240" width="540" height="340" rx="14" fill="#1c2128" stroke="#a6e3a1" stroke-width="2"/><text x="1540" y="320" text-anchor="middle" font-size="28" fill="#a6e3a1" letter-spacing="3">PLANETS</text><text x="1540" y="410" text-anchor="middle" font-size="32" fill="#e6edf3">a great machine?</text><text x="1540" y="480" text-anchor="middle" font-size="22" fill="#6c7393">gears of solar engineering</text>
  </g>`;
}
function timeline(era, head, detail, color = "#89b4fa") {
  return `${bg(nbg(), "#0f1320", "#0b0e14")}${STARS}
  <line x1="260" y1="300" x2="1660" y2="300" stroke="#30363d" stroke-width="3"/>
  <circle cx="500" cy="300" r="10" fill="${color}"/>
  <text x="500" y="250" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="30" fill="${color}">${esc(era)}</text>
  <text x="960" y="440" text-anchor="middle" font-family="Georgia,serif" font-size="52" fill="#e6edf3" font-weight="bold">${esc(head)}</text>
  <text x="960" y="520" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="30" fill="#9aa7b4">${esc(detail)}</text>`;
}
function ladder() {
  const rows = [["A", "established / derivable", "#2ea043"], ["B", "mainstream evidence", "#3b82f6"], ["C", "structured hypothesis", "#d29922"], ["D", "interpretation", "#a371f7"], ["U", "speculative", "#8b949e"], ["X", "contradicted", "#f85149"]];
  const r = rows.map((x, i) => `<g transform="translate(560,${200 + i * 78})"><rect x="0" y="0" width="64" height="64" rx="10" fill="${x[2]}"/><text x="32" y="44" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="34" font-weight="bold" fill="#0b0e12">${x[0]}</text><text x="100" y="44" font-family="ui-sans-serif,sans-serif" font-size="34" fill="#cdd6f4">${x[1]}</text></g>`).join("\n");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}<text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">how sure are we? — one honest label per claim</text>\n${r}`;
}
function dreamer() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <g transform="translate(960,600)" fill="#3b3450" opacity="0.85"><ellipse cx="0" cy="0" rx="170" ry="36"/><path d="M -74 -20 L -74 -240 Q -74 -276 -38 -276 L 38 -276 Q 74 -276 74 -240 L 74 -20 Z"/><circle cx="0" cy="-304" r="38"/></g>
  <g stroke="#89b4fa" stroke-width="2" fill="none" opacity="0.4"><circle cx="960" cy="180" r="58"/><circle cx="1080" cy="150" r="32"/><circle cx="840" cy="160" r="38"/></g>`;
}
function balance() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <g transform="translate(960,380)" stroke="#cdd6f4" stroke-width="3" fill="none"><line x1="0" y1="-150" x2="0" y2="150"/><line x1="-230" y1="-96" x2="230" y2="-96"/><line x1="-230" y1="-96" x2="-230" y2="-40"/><line x1="230" y1="-96" x2="230" y2="-40"/><ellipse cx="-230" cy="-30" rx="96" ry="18" fill="#1c2128" stroke="#89b4fa"/><ellipse cx="230" cy="-30" rx="96" ry="18" fill="#1c2128" stroke="#a6e3a1"/><line x1="-76" y1="150" x2="76" y2="150"/></g>
  <text x="730" y="365" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#89b4fa">the dream</text>
  <text x="1190" y="365" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#a6e3a1">the test</text>`;
}
function horizon() {
  return `${bg(nbg(), "#1a1822", "#0b0e14")}${STARS}
  <ellipse cx="960" cy="640" rx="1100" ry="80" fill="#f9e2af" opacity="0.07"/><ellipse cx="960" cy="640" rx="700" ry="40" fill="#fab387" opacity="0.10"/>
  <g fill="#6c7393" opacity="0.7"><circle cx="380" cy="560" r="6"/><rect x="378" y="566" width="4" height="20" rx="2"/><circle cx="560" cy="550" r="7"/><rect x="557" y="557" width="6" height="24" rx="2"/><circle cx="760" cy="568" r="6"/><rect x="758" y="574" width="4" height="20" rx="2"/><circle cx="980" cy="545" r="8"/><rect x="976" y="553" width="8" height="26" rx="2"/><circle cx="1180" cy="562" r="6"/><rect x="1178" y="568" width="4" height="20" rx="2"/><circle cx="1380" cy="552" r="7"/><rect x="1377" y="559" width="6" height="24" rx="2"/></g>`;
}
function lens() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <g transform="translate(960,360)"><circle r="160" fill="none" stroke="#89b4fa" stroke-width="3" opacity="0.7"/><circle r="100" fill="none" stroke="#89b4fa" stroke-width="2" opacity="0.35"/><circle r="40" fill="#cdd6f4" opacity="0.18"/><g stroke="#f9e2af" stroke-width="2" opacity="0.6"><line x1="-380" y1="-180" x2="-160" y2="-70"/><line x1="-160" y1="-70" x2="380" y2="110"/><line x1="-380" y1="0" x2="-160" y2="20"/><line x1="-160" y1="20" x2="380" y2="0"/><line x1="-380" y1="180" x2="-160" y2="120"/><line x1="-160" y1="120" x2="380" y2="-70"/></g></g>`;
}

// ---------- SCENES (~40; ~2,900 words EN ≈ 18-20 min with dwell) ----------
const S = [
// --- CH0 Cold open ---
["s01", title("TRAVELERS", "AN HONEST SCIENCE FILM", "#89b4fa", 150),
 "Life is made of travelers. We may call them humans, animals, organisms, agents, or living systems — but at the deepest level, we are all the same kind of thing. We move through a world we did not create, and do not fully understand, trying to make sense of it as we go.",
 "जीवन प्रवाशांचे बनलेले आहे. आपण त्यांना माणसे, प्राणी, जीव, घटक किंवा जिवंत व्यवस्था म्हणू शकतो — पण सर्वात खोल पातळीवर, आपण सर्व एकाच प्रकारचे आहोत. आपण न निर्माण केलेल्या, पूर्णपणे न समजलेल्या जगातून प्रवास करतो, आणि वाटेत त्याचा अर्थ लावण्याचा प्रयत्न करतो."],
["s02", horizon(),
 "And the way a traveler makes sense of the world is always the same. We receive signals from outside us. We interpret them, as best we can, against everything we have already learned. And then we act — and the world answers back, and we learn again.",
 "आणि प्रवासी जगाचा अर्थ कसा लावतो ते नेहमी सारखेच असते. आपल्या बाहेरून आपल्याला संकेत मिळतात. आपण ते, जमेल तितके, आधी शिकलेल्या सगळ्याशी ताडून पाहतो. आणि मग आपण कृती करतो — आणि जग उत्तर देते, आणि आपण पुन्हा शिकतो."],
["s03", quote('"Some of what we learned was love."', ""),
 "But here is the tender part. Every one of us arrived here and began learning before we could choose what to learn. Some of what we learned was love, and safety, and trust. And some of it was fear — separation, struggle, hunger, systems that broke their promises to us.",
 "पण इथे एक हळवा भाग आहे. आपल्यापैकी प्रत्येक जण इथे आला आणि काय शिकायचे हे निवडता येण्याआधीच शिकू लागला. आपण जे शिकलो त्यातील काही प्रेम होते, सुरक्षितता होती, विश्वास होता. आणि काही भीती होती — विभक्तता, संघर्ष, भूक, आपल्याला दिलेली वचने मोडणाऱ्या व्यवस्था."],
["s04", lens(),
 "All of it — the love and the fear alike — settles into us as priors. A prior is just a quiet expectation: the lens we look through before we have looked at all. It bends the incoming light. And a prior is not a flaw. It is how a mind survives a world it cannot fully see.",
 "ते सर्व — प्रेम आणि भीती दोन्ही — आपल्यात पूर्वग्रह म्हणून रुजतात. पूर्वग्रह म्हणजे फक्त एक शांत अपेक्षा: पाहण्याआधीच आपण ज्यातून पाहतो ती भिंग. ते येणारा प्रकाश वाकवते. आणि पूर्वग्रह म्हणजे दोष नाही. पूर्ण न दिसणाऱ्या जगात मन कसे टिकते याचे ते स्वरूप आहे."],
["s05", statement(["But a prior set by hurt", "can make us certain too early —", "sure of an answer", "before we have looked."], "#e6edf3"),
 "But there is a cost. A prior set by hurt can make us certain too early. It can hand us an answer before we have looked — and then quietly defend that answer against everything the world tries to show us. Most of the time, we never even notice it happening.",
 "पण याची एक किंमत आहे. दुखातून घडलेला पूर्वग्रह आपल्याला फार लवकर खात्री करवू शकतो. तो आपल्याला पाहण्याआधीच उत्तर देऊ शकतो — आणि मग जग जे दाखवू पाहते त्या सर्वांविरुद्ध ते उत्तर गुपचूप जपतो. बहुतेक वेळा, हे घडत आहे हे आपल्याला कळतही नाही."],
["s06", title("LOOKING", "one idea — and the way we test what we believe", "#89b4fa", 170),
 "This film is about the cure for that — which is simply looking. It is about one big, hopeful idea, and about the gentle, stubborn discipline we use to test any idea fairly, no matter how much we want it to be true. Including, hardest of all, our own ideas.",
 "हा चित्रपट त्यावरील उपचाराबद्दल आहे — जो म्हणजे फक्त पाहणे. हा एका मोठ्या, आशादायक कल्पनेबद्दल आहे, आणि कोणत्याही कल्पनेची, ती कितीही खरी असावी असे वाटले तरी, प्रामाणिकपणे चाचणी घेण्याच्या सौम्य, हट्टी शिस्तीबद्दल आहे. आणि सर्वात कठीण म्हणजे — आपल्याच कल्पनांची."],
// --- CH1 The Traveler ---
["s07", title("ACT ONE", "The Traveler", "#f9e2af", 96),
 "It begins, as these things so often do, with a single curious person, and a question too big to put down.",
 "हे सुरू होते, जसे अनेकदा होते, एका जिज्ञासू व्यक्तीने, आणि खाली ठेवता न येणाऱ्या एका मोठ्या प्रश्नाने."],
["s08", dreamer(),
 "Why do worlds hold the things they hold? Why doesn't the air just drift away into space? Why does the thin blue sky above us shield our skin from a Sun that should burn it? What, underneath everything, is life — and where on earth, or off it, did we come from?",
 "जग ज्या गोष्टी धारण करतात त्या का? हवा अवकाशात निघून का जात नाही? आपल्यावरचे पातळ निळे आकाश आपली त्वचा अशा सूर्यापासून का वाचवते जो ती जाळायला हवा? सर्वांखाली, जीवन म्हणजे काय — आणि आपण कुठून आलो, या पृथ्वीवरून की तिच्या पलीकडून?"],
["s09", quote('"To wonder is the oldest human thing we do."', ""),
 "These are not new questions. They are older than any of us, older than every book. Every people who ever stood under the night sky and felt small has asked some version of them. To wonder like this is not childish, and it is not naive. It may be the oldest, most human thing we do.",
 "हे नवीन प्रश्न नाहीत. ते आपल्या सर्वांपेक्षा जुने आहेत, प्रत्येक ग्रंथापेक्षा जुने. रात्रीच्या आकाशाखाली उभे राहून लहान वाटलेल्या प्रत्येक माणसाने यांचे कोणते ना कोणते रूप विचारले आहे. असे आश्चर्य वाटणे बालिश नाही, आणि भोळेही नाही. कदाचित ती आपली सर्वात जुनी, सर्वात मानवी कृती आहे."],
["s10", threeClaims(),
 "And out of one person's wondering came three bold answers. That the ozone in our sky is not just a filter, but something close to the very source of life. That the weight pinning us to the ground comes not from mass at all, but from the press of the air. And that the planets are not a loose scatter of rock and fire, but a single great machine.",
 "आणि एका व्यक्तीच्या आश्चर्यातून तीन धाडसी उत्तरे आली. की आपल्या आकाशातील ओझोन केवळ गाळणी नाही, तर जीवनाच्या मूळ स्रोताच्या जवळचे काहीतरी आहे. की आपल्याला जमिनीला खिळवून ठेवणारे वजन वस्तुमानातून मुळीच नाही, तर हवेच्या दाबातून येते. आणि की ग्रह म्हणजे खडक-अग्नीचा विखुरलेला ढग नाही, तर एकच मोठे यंत्र आहे."],
["s11", statement(["Extraordinary claims", "are not the enemy.", "They are invitations."], "#a6e3a1"),
 "Now — by any measure, these are extraordinary claims. And here is the very first thing this film asks you to believe: extraordinary claims are not the enemy of science. They never have been. They are its invitations. Almost everything we now call settled began as somebody's outrageous guess.",
 "आता — कोणत्याही मापाने, हे असाधारण दावे आहेत. आणि हा चित्रपट तुम्हाला सर्वप्रथम हे मानायला सांगतो: असाधारण दावे विज्ञानाचे शत्रू नाहीत. ते कधीच नव्हते. ती त्याची आमंत्रणे आहेत. आज आपण जे ठरलेले म्हणतो ते जवळजवळ सगळे कोणाच्या तरी अचाट अंदाजातून सुरू झाले."],
["s12", statement(['The question is never', '"who dares to ask."', "It is: what would have to be true —", "and how would we know?"], "#e6edf3"),
 "So the question, faced with a bold claim, is never who dares to ask it, or whether they have the right credentials, or whether the idea sounds respectable. The only question worth asking is this: what would have to be true for this to hold — and how, exactly, would we be able to tell?",
 "म्हणून, धाडसी दाव्यासमोर, प्रश्न कधीही 'कोण विचारण्याचे धाडस करतो', किंवा त्यांच्याकडे योग्य पात्रता आहे का, किंवा कल्पना प्रतिष्ठित वाटते का, हा नसतो. विचारण्याजोगा एकमेव प्रश्न हा आहे: हे खरे ठरण्यासाठी काय असावे लागेल — आणि नेमके आपल्याला कसे ओळखता येईल?"],
["s12b", dreamer(),
 "And we should be honest about what that question costs. To ask it out loud — to say I think the textbooks might be incomplete — is a lonely thing. It invites the raised eyebrow, the polite silence, sometimes the open ridicule. It takes a particular kind of courage to propose something and then, harder still, to let it be tested.",
 "आणि तो प्रश्न विचारण्याची किंमत काय आहे याबद्दल आपण प्रामाणिक असले पाहिजे. तो उघडपणे विचारणे — पाठ्यपुस्तके अपूर्ण असू शकतात असे म्हणणे — ही एकाकी गोष्ट आहे. ती उंचावलेली भुवई, सभ्य मौन, कधी उघड उपहास ओढवून घेते. काहीतरी मांडणे आणि मग, त्याहून कठीण, ते तपासू देणे यासाठी एक विशेष धैर्य लागते."],
// --- CH2 The three claims, in depth ---
["s13", claimCard("CLAIM ONE", "Ozone = life", "the breath of a living world", "#89dceb"),
 "Let us meet the three claims properly, because each one deserves to be understood before it is tested. The first: ozone. High in the sky, far above the clouds, sits a faint layer of a special kind of oxygen. The claim is almost poetic — that this layer is not merely a shield, but something close to the breath and the source of life itself.",
 "तिन्ही दाव्यांना नीट भेटू, कारण चाचणीआधी प्रत्येक समजून घेण्याजोगा आहे. पहिला: ओझोन. आकाशात उंचावर, ढगांच्या खूप वर, एका विशेष प्रकारच्या ऑक्सिजनचा एक धूसर थर आहे. दावा जवळजवळ काव्यमय आहे — की हा थर केवळ कवच नाही, तर जीवनाच्या श्वासाच्या आणि स्रोताच्या जवळचे काहीतरी आहे."],
["s14", quote('"You can feel exactly why it is tempting."', ""),
 "And you can feel exactly why that is tempting to believe. Strip the ozone away, and the Sun's ultraviolet light would pour down and sterilise the surface — sunburn without end, life on land made impossible. When one thin thing stands between every creature and a killing light, it is a small, human step to call that thing the source of life.",
 "आणि ते मानणे का मोहक आहे ते तुम्हाला नेमके जाणवते. ओझोन काढून टाका, आणि सूर्याचे अतिनील किरण ओतून पृष्ठभाग निर्जंतुक करतील — न संपणारी उन्हाची जळजळ, जमिनीवरचे जीवन अशक्य. जेव्हा एक पातळ गोष्ट प्रत्येक जीव आणि मारक प्रकाश यांच्यात उभी असते, तेव्हा तिला जीवनाचा स्रोत म्हणणे हे एक छोटे, मानवी पाऊल आहे."],
["s15", claimCard("CLAIM TWO", "Pressure, not mass", "the air presses you down", "#f9e2af"),
 "The second claim is about something you are feeling right now: your own weight. We are taught it comes from gravity — from mass quietly pulling on mass, the Earth tugging every part of you toward its centre. This proposal says no. It says the weight you feel is the air itself, a whole ocean of sky, pressing down on your shoulders.",
 "दुसरा दावा तुम्ही आत्ता अनुभवत असलेल्या गोष्टीबद्दल आहे: तुमचे स्वतःचे वजन. आपल्याला शिकवले जाते की ते गुरुत्वाकर्षणातून येते — वस्तुमान शांतपणे वस्तुमानाला ओढते, पृथ्वी तुमच्या प्रत्येक भागाला आपल्या केंद्राकडे ओढते. हा प्रस्ताव नाही म्हणतो. तो म्हणतो की तुम्हाला जाणवणारे वजन म्हणजे हवाच, आकाशाचा संपूर्ण महासागर, तुमच्या खांद्यांवर दाबणारा."],
["s16", quote('"We do live at the bottom of an ocean of air."', ""),
 "And this one, too, has an honest pull on the mind. Because it is true — we really do live at the bottom of an ocean of air, kilometres deep. We really can feel pressure: in our ears on a mountain road, in a storm before the rain. So why not suppose that the thing we can feel pressing is the very thing that holds us down?",
 "आणि हाही मनावर एक प्रामाणिक पकड ठेवतो. कारण ते खरे आहे — आपण खरोखर हवेच्या महासागराच्या तळाशी राहतो, किलोमीटर खोल. आपल्याला खरोखर दाब जाणवतो: डोंगरी रस्त्यावर कानांत, पावसाआधी वादळात. मग आपल्याला जे दाबताना जाणवते तेच आपल्याला खाली धरून ठेवते असे का मानू नये?"],
["s17", claimCard("CLAIM THREE", "A great machine", "the solar system as engineering", "#a6e3a1"),
 "And the third claim is the grandest of all. Look up at the planets, wheeling in their orbits century after century, never colliding, never wandering off. The proposal is that this is no accident of gravity and dust — that the Sun and its planets are a precise machine, an engine and its meshing gears, turning in deliberate, designed order.",
 "आणि तिसरा दावा सर्वांत भव्य आहे. ग्रहांकडे पाहा, शतकानुशतके आपल्या कक्षांत फिरणारे, कधीही न आदळणारे, कधीही भरकटून न जाणारे. प्रस्ताव असा की हा गुरुत्वाकर्षण आणि धुळीचा योगायोग नाही — की सूर्य आणि त्याचे ग्रह म्हणजे एक अचूक यंत्र आहे, एक इंजिन आणि त्याचे एकमेकांत गुंतलेले गिअर्स, ठरवून, रचून क्रमाने फिरणारे."],
["s18", statement(["Each claim is beautiful.", "Each one is hopeful.", "And none of that", "tells us if it is true."], "#e6edf3"),
 "Sit with those three for a moment. Each of them is beautiful. Each is hopeful. Each gives the universe a warmth and a purpose that the textbook can feel too cold to offer. And none of that — not one ounce of the beauty, not one spark of the hope — tells us whether a single one of them is true. Only a test can do that.",
 "त्या तिघांसोबत क्षणभर बसा. त्यातला प्रत्येक सुंदर आहे. प्रत्येक आशादायक आहे. प्रत्येक विश्वाला एक ऊब आणि एक हेतू देतो जो पाठ्यपुस्तक देताना फार थंड वाटू शकतो. आणि त्यातले काहीही — सौंदर्याचा कणही, आशेचा ठिणगीही — त्यातला एकही खरा आहे की नाही ते सांगत नाही. ते फक्त चाचणीच करू शकते."],
// --- CH3 The history of bold claims ---
["s19", title("BEFORE WE TEST", "a fair look at bold ideas", "#89b4fa", 84),
 "Before we put a single claim on trial, it is only fair to remember what history actually teaches about bold ideas. And the record is more honest, and more humbling, than either the cynics or the believers like to admit. Some impossible-sounding claims turned out to be right. Some turned out to be wrong. And which was which was never decided by how strange they sounded.",
 "एकही दावा तपासणीला लावण्यापूर्वी, धाडसी कल्पनांविषयी इतिहास खरोखर काय शिकवतो ते आठवणे न्याय्य आहे. आणि ती नोंद, निंदक किंवा विश्वासू दोघांनाही मान्य करावी वाटते त्यापेक्षा अधिक प्रामाणिक आणि अधिक नम्र करणारी आहे. काही अशक्य वाटणारे दावे बरोबर निघाले. काही चुकीचे. आणि कोणता कोणता हे ते किती विचित्र वाटले यावरून कधीच ठरले नाही."],
["s20", timeline("1912", "A teacher says the continents move", "Alfred Wegener: the land itself drifts.", "#a6e3a1"),
 "Consider Alfred Wegener. In 1912, this quiet German scientist stood up and proposed something that sounded absurd: that the continents move. That Africa and South America had once been pressed together, a single land, and had slowly, over ages, torn apart and drifted to where we find them now.",
 "आल्फ्रेड वेगेनरचा विचार करा. १९१२ मध्ये, या शांत जर्मन शास्त्रज्ञाने उभे राहून असे काहीतरी मांडले जे हास्यास्पद वाटले: की खंड हलतात. की आफ्रिका आणि दक्षिण अमेरिका एकेकाळी एकत्र दाबलेले होते, एकच भूमी, आणि युगानुयुगे हळूहळू फाटून आज आपल्याला सापडतात तिथे सरकले."],
["s21", quote('"He had real evidence. He was still ridiculed."', "for decades"),
 "And he was ridiculed for it, openly, for decades. The strange part is that he was not guessing wildly — he had real evidence. The coastlines of the continents fit together like torn paper. The same fossils, the same ancient rock, appeared on shores now separated by an entire ocean. But he was missing one fatal thing, and his critics knew it: a mechanism. He could not say what force could possibly move a continent.",
 "आणि त्याची यासाठी उघडपणे, दशकांपर्यंत खिल्ली उडवली गेली. विचित्र भाग म्हणजे तो बेधडक अंदाज लावत नव्हता — त्याच्याकडे खरे पुरावे होते. खंडांचे किनारे फाटलेल्या कागदासारखे एकमेकांत बसत होते. आता संपूर्ण महासागराने वेगळ्या झालेल्या किनाऱ्यांवर तेच जीवाश्म, तेच प्राचीन खडक दिसत होते. पण त्याच्याकडे एक घातक गोष्ट नव्हती, आणि टीकाकारांना ते माहीत होते: यंत्रणा. खंड हलवू शकेल असे कोणते बल असू शकेल हे तो सांगू शकला नाही."],
["s22", timeline("1950s–60s", "The evidence finally arrived", "Seafloor spreading, magnetic stripes — a mechanism.", "#a6e3a1"),
 "Wegener died on the ice in Greenland, still mocked, never vindicated in his lifetime. And then, decades after his death, the missing piece arrived. New instruments mapped the floor of the oceans and found it spreading apart, with the rock recording the Earth's flipping magnetic field in frozen stripes. There, at last, was the mechanism. His absurd idea became plate tectonics — the bedrock of all modern geology.",
 "वेगेनर ग्रीनलंडच्या बर्फावर मरण पावला, अजूनही उपहासित, हयातीत कधीही निर्दोष ठरला नाही. आणि मग, त्याच्या मृत्यूनंतर दशकांनी, हरवलेला तुकडा आला. नव्या उपकरणांनी महासागरांचा तळ नकाशात आणला आणि तो विलग होत असल्याचे आढळले, खडकाने पृथ्वीचे उलटणारे चुंबकीय क्षेत्र गोठलेल्या पट्ट्यांत नोंदवले होते. तिथे, अखेर, यंत्रणा होती. त्याची हास्यास्पद कल्पना भूपट्ट सिद्धांत बनली — सर्व आधुनिक भूगर्भशास्त्राचा पाया."],
["s23", statement(["It graduated not because", "it was bold —", "but because evidence,", "and a mechanism, arrived."], "#a6e3a1"),
 "But notice — carefully — why it finally graduated. Not because it was bold. Not because Wegener wanted it badly enough, or believed it hard enough; he wanted it and believed it his whole life, and that changed nothing. It graduated for one reason only: new evidence, a real mechanism, and fresh predictions that came true. That is the only door a bold idea can ever walk through.",
 "पण लक्षात घ्या — काळजीपूर्वक — ते अखेर का स्वीकारले गेले. ते धाडसी होते म्हणून नाही. वेगेनरला ते पुरेसे हवे होते किंवा त्याने पुरेसा विश्वास ठेवला म्हणून नाही; त्याला ते आयुष्यभर हवे होते आणि त्याने विश्वास ठेवला, आणि त्याने काहीच बदलले नाही. ते एकाच कारणाने स्वीकारले गेले: नवीन पुरावा, खरी यंत्रणा, आणि खरी ठरलेली नवी भाकिते. धाडसी कल्पना जिथून आत येऊ शकते तो एकमेव दरवाजा तोच आहे."],
["s24", timeline("1690 – 1908", "A bold idea that did not survive", "Le Sage's push-gravity: tested, and set aside.", "#f38ba8"),
 "Now the other half of the honest record — because it would be a cheat to show you only the idea that won. Centuries ago, thinkers named Fatio and Le Sage proposed a beautiful answer to gravity itself. What if gravity is not a pull but a push? What if space is full of tiny particles streaming in every direction, and two objects simply shadow each other from that storm, and get shoved together? It was bold. And, crucially, it was genuinely testable.",
 "आता प्रामाणिक नोंदीचा दुसरा भाग — कारण फक्त जिंकलेली कल्पना दाखवणे ही फसवणूक ठरेल. शतकांपूर्वी, फॅटिओ आणि ल साज नावाच्या विचारवंतांनी गुरुत्वाकर्षणालाच एक सुंदर उत्तर दिले. गुरुत्वाकर्षण ओढ नसून धक्का असेल तर? अवकाश सर्व दिशांनी वाहणाऱ्या सूक्ष्म कणांनी भरलेले असेल, आणि दोन वस्तू एकमेकांना त्या वादळापासून सावली देऊन एकत्र ढकलल्या जात असतील तर? ते धाडसी होते. आणि, महत्त्वाचे म्हणजे, ते खरोखर तपासण्याजोगे होते."],
["s25", quote('"Falsifiable — and then falsified. Honorably."', ""),
 "And because it was testable, serious scientists took it seriously — and then they tested it. James Clerk Maxwell did the arithmetic and showed those particles would dump so much energy into the Earth that they would burn it to a crisp. Poincaré showed the numbers simply could not be made to work. A real, falsifiable idea — that took its tests, and lost them. Honorably. It is not a shameful thing to be wrong this way. It is science working exactly as it should.",
 "आणि ते तपासण्याजोगे असल्यामुळे, गंभीर शास्त्रज्ञांनी ते गांभीर्याने घेतले — आणि मग त्यांनी त्याची चाचणी घेतली. जेम्स क्लर्क मॅक्सवेलने गणित केले आणि दाखवले की ते कण पृथ्वीत इतकी ऊर्जा ओततील की ती जळून जाईल. पोआंकारेने दाखवले की आकडे जुळवताच येत नाहीत. एक खरी, खोडण्याजोगी कल्पना — जिने आपल्या चाचण्या दिल्या, आणि हरली. सन्मानाने. असे चुकणे लाजिरवाणे नाही. हे विज्ञान नेमके जसे चालावे तसे चालणे आहे."],
["s26", statement(["A claim is not judged", "by who makes it,", "or how strange it sounds —", "only by the test."], "#e6edf3"),
 "So this is the lesson we carry, with real care, into our own three claims. A claim is never judged by who makes it, or by their fame, or their poverty, or their certainty. It is not judged by how warm it feels, or how strange it sounds. It is judged — only, ever, and always — by the test it can or cannot survive. Wegener's idea survived. Le Sage's did not. Both were treated honestly. That is all we owe anyone.",
 "तर हा धडा आपण, खऱ्या काळजीने, आपल्या तीन दाव्यांमध्ये घेऊन जातो. दावा कधीही तो कोण करतो, त्यांची कीर्ती, त्यांची गरिबी, किंवा त्यांची खात्री यावरून ठरत नाही. तो कसा ऊबदार वाटतो किंवा किती विचित्र वाटतो यावरून ठरत नाही. तो ठरतो — फक्त, नेहमी — तो टिकवू शकतो की नाही त्या चाचणीवरून. वेगेनरची कल्पना टिकली. ल साजची टिकली नाही. दोघांशीही प्रामाणिक वागले गेले. कोणाचेही आपण एवढेच देणे लागतो."],
// --- CH4 The discipline ---
["s27", title("THE DISCIPLINE", "how to test fairly", "#89b4fa", 90),
 "So how, in practice, do we test fairly? Not with scorn — scorn is just a prior wearing a lab coat. And not with worship either. We test with a handful of simple, stubborn habits. They are not complicated. They are the same habits a clear, honest mind uses on its own most precious beliefs.",
 "मग, प्रत्यक्षात, आपण प्रामाणिकपणे चाचणी कशी घ्यायची? तिरस्काराने नाही — तिरस्कार म्हणजे फक्त प्रयोगशाळेचा कोट घातलेला पूर्वग्रह. आणि पूजेनेही नाही. आपण काही साध्या, हट्टी सवयींनी चाचणी घेतो. त्या गुंतागुंतीच्या नाहीत. स्वच्छ, प्रामाणिक मन स्वतःच्या सर्वात मौल्यवान समजुतींवर वापरते त्याच त्या सवयी आहेत."],
["s28", ladder(),
 "First, we say out loud, in advance, how sure we actually are. We use six honest labels — running from established at the top, down through hypothesis and interpretation, all the way to contradicted at the bottom. Every claim we make gets exactly one of them, pinned to it in plain sight. And no claim, however beloved, is ever allowed to quietly skip the line.",
 "पहिले, आपण आधीच, उघडपणे सांगतो की आपण खरोखर किती खात्रीशीर आहोत. आपण सहा प्रामाणिक खुणा वापरतो — वर स्थापित पासून, गृहीतक आणि अर्थ यांतून, अगदी खाली खोडलेल्या पर्यंत. आपण करत असलेल्या प्रत्येक दाव्याला त्यातली नेमकी एक मिळते, उघडपणे जोडलेली. आणि कोणताही दावा, कितीही प्रिय असो, गुपचूप रांग वगळू शकत नाही."],
["s29", statement(["The math is allowed", "to say no."], "#f85149"),
 "Second, and this is the heart of all of it: the math is allowed to say no. This is the rule that separates a test from a performance. A procedure that can only ever agree with you is not a test at all — it is a mirror. So we build ours to be able to break, on purpose, in advance. And we have to mean it. We have to actually want to find out if we are wrong.",
 "दुसरे, आणि हेच या सर्वांचे हृदय आहे: गणिताला नाही म्हणण्याची परवानगी आहे. हाच नियम चाचणीला देखाव्यापासून वेगळा करतो. जी प्रक्रिया फक्त तुमच्याशी सहमतच होऊ शकते ती चाचणी मुळीच नाही — तो आरसा आहे. म्हणून आपण आपली अशी बनवतो की ती मुद्दाम, आधीच, मोडू शकेल. आणि आपला तसा खरा हेतू असायला हवा. आपण चुकलो आहोत का हे शोधण्याची आपल्याला खरोखर इच्छा असायला हवी."],
["s30", statement(["State the bar", "before the run.", "Not after."], "#e6edf3"),
 "Third: we state the bar before the run, never after. We decide exactly what would count as success while we still genuinely might fail — and we write it down where we cannot edit it later. It sounds like a small thing. It is everything. It is the single rule that makes it impossible to quietly move the goalposts to wherever the ball happened to land, and then call it a bullseye.",
 "तिसरे: आपण मोजमापाची रेषा चाचणीआधी ठरवतो, नंतर कधीच नाही. आपण अजून खरोखर अपयशी होऊ शकतो तेव्हाच यश नेमके काय मानायचे ते ठरवतो — आणि ते अशा ठिकाणी लिहितो जिथे नंतर बदलता येणार नाही. ही छोटी गोष्ट वाटते. ती सर्वकाही आहे. चेंडू जिथे पडला तिथे गुपचूप ध्येयरेषा हलवून त्याला अचूक नेम म्हणणे अशक्य करणारा तो एकमेव नियम आहे."],
["s31", balance(),
 "And fourth, holding all the others together: we keep the dream and the test in balance. We owe a real idea a real test — one generous enough to actually let it win if it deserves to, and strict enough that, when it does win, the winning genuinely means something. Too soft, and we fool ourselves. Too cruel, and we lose the truth the idea was reaching for.",
 "आणि चौथे, बाकी सर्वांना एकत्र धरून ठेवणारे: आपण स्वप्न आणि चाचणी समतोलात ठेवतो. खऱ्या कल्पनेला आपण खरी चाचणी देणे लागतो — पात्र असेल तर तिला खरोखर जिंकू देण्याइतकी उदार, आणि ती जिंकली तर त्या जिंकण्याला खरोखर अर्थ असेल इतकी कठोर. फार मऊ असली तर आपण स्वतःला फसवतो. फार क्रूर असली तर कल्पना ज्या सत्याकडे पोहोचत होती ते आपण गमावतो."],
["s32", quote('"Compare it to the strongest idea we already have."', ""),
 "There is one last habit, quiet but absolutely decisive. We never test a new idea against a weak, cartoon version of the old one. We compare it, always, to the strongest, best-tuned explanation we already possess. It is easy to look brilliant beside a strawman. It means nothing. The only victory that counts is a victory over the real thing, at its very best.",
 "एक शेवटची सवय आहे, शांत पण अत्यंत निर्णायक. आपण नवीन कल्पनेची चाचणी जुन्याच्या कमकुवत, व्यंगचित्रासारख्या आवृत्तीशी कधीच घेत नाही. आपण ती नेहमी आपल्याकडे आधीच असलेल्या सर्वात मजबूत, उत्तम जुळवलेल्या स्पष्टीकरणाशी तुलना करतो. भुसकटाशेजारी तेजस्वी दिसणे सोपे आहे. त्याला काहीच अर्थ नाही. मोजला जाणारा एकमेव विजय म्हणजे खऱ्या गोष्टीवर, तिच्या सर्वोत्तम रूपात मिळवलेला विजय."],
["s32b", quote('"Once is an accident. The test must repeat."', ""),
 "And we add one more guard, because a single lucky result fools everyone. A real finding has to repeat — the same answer, many times over, from fixed starting points anyone can rerun, and ideally by other hands entirely. In our own work, every measurement is run from five fixed seeds, and reported with its uncertainty. Once is an anecdote. Many times, reproducibly, is a result.",
 "आणि आपण आणखी एक रक्षण जोडतो, कारण एकच नशिबाचा निकाल सगळ्यांना फसवतो. खऱ्या निष्कर्षाला पुन्हा यावे लागते — तेच उत्तर, अनेकदा, कोणीही पुन्हा चालवू शकेल अशा निश्चित सुरुवातींपासून, आणि शक्यतो पूर्णपणे दुसऱ्या हातांनी. आपल्या स्वतःच्या कामात, प्रत्येक मोजमाप पाच निश्चित बीजांपासून चालवले जाते, आणि त्याच्या अनिश्चिततेसह नोंदवले जाते. एकदा म्हणजे किस्सा. अनेकदा, पुनरुत्पादनक्षमपणे, म्हणजे निष्कर्ष."],
["s32c", statement(["A new idea must keep", "everything the old one", "already got right."], "#89b4fa"),
 "And there is a quiet test of fairness that catches most bad ideas instantly. A new explanation is not allowed to throw away everything we already know works. It must contain the old idea's successes inside itself — reproduce every right answer the old one gave — and then do something more. If it cannot even recover what we already had, it has not improved on anything.",
 "आणि न्यायाची एक शांत चाचणी आहे जी बहुतेक वाईट कल्पना तत्काळ पकडते. नवीन स्पष्टीकरणाला आपल्याला आधीच माहीत असलेले जे चालते ते सर्व फेकून देण्याची परवानगी नाही. त्याने जुन्या कल्पनेची यशे स्वतःमध्ये सामावून घेतली पाहिजेत — जुन्याने दिलेले प्रत्येक बरोबर उत्तर पुन्हा द्यावे — आणि मग काहीतरी अधिक करावे. जे आपल्याकडे आधीच होते तेच जर ते परत मिळवू शकत नसेल, तर त्याने कशातही सुधारणा केलेली नाही."],
["s32d", statement(["An honest 'no'", "is a real result —", "not a failure."], "#a6e3a1"),
 "And last, the gentlest rule of all, the one that makes all the others survivable. When a test comes back negative — when the idea we hoped for does not hold — that is not a failure of the work. A clear, honest no is itself a real result. It is knowledge. It tells us, truthfully, where not to look, so the next traveler does not lose the same years we did.",
 "आणि शेवटी, सर्वांत सौम्य नियम, जो बाकी सर्व सहन करण्याजोगे करतो. जेव्हा चाचणी नकारात्मक येते — जेव्हा आपण आशा केलेली कल्पना टिकत नाही — तो कामाचा पराभव नाही. स्पष्ट, प्रामाणिक 'नाही' हाच एक खरा निष्कर्ष आहे. ते ज्ञान आहे. ते आपल्याला खरेपणाने सांगते की कुठे पाहू नये, म्हणजे पुढचा प्रवासी आपण गमावलेली तीच वर्षे गमावणार नाही."],
// --- CH5 Close of Segment 1 ---
["s33", statement(["So that is the promise", "of this film:", "to look — before", "we are certain."], "#e6edf3"),
 "So that is the whole promise of this film, and it is a small and a hard one. To honor a hopeful idea by looking straight at it — before we are certain, and especially when the looking might cost us the comfort of being right. To love the question more than we love our favourite answer.",
 "तर हे या चित्रपटाचे संपूर्ण वचन आहे, आणि ते लहान पण कठीण आहे. एका आशादायक कल्पनेचा सन्मान तिच्याकडे सरळ पाहून करणे — खात्री होण्याआधी, आणि विशेषतः जेव्हा ते पाहणे आपल्याला बरोबर असण्याची सुखसोय गमवायला लावेल. आपल्या आवडत्या उत्तरापेक्षा प्रश्नावर अधिक प्रेम करणे."],
["s34", threeClaims(),
 "In the segments still ahead, we take these three claims and we put each of them, in turn, to the fairest and hardest test we can build — the sky's shield, the weight of distant worlds, and at the very end, the human meaning we were reaching for underneath all three.",
 "अजून पुढे असलेल्या भागांत, आपण हे तीन दावे घेतो आणि प्रत्येकाला, एकेक करून, आपण बांधू शकतो त्या सर्वात न्याय्य आणि कठीण चाचणीला लावतो — आकाशाचे कवच, दूरच्या जगांचे वजन, आणि अगदी शेवटी, या तिघांखाली आपण शोधत असलेला मानवी अर्थ."],
["s35", statement(["What survives,", "we will keep.", "What does not,", "we will let go — gently."], "#a6e3a1"),
 "And we make you a promise about what comes back. Whatever survives the testing, we will keep, with both hands and real gratitude. And whatever does not survive, we will let go — gently, and entirely without shame. Letting go of a wrong belief is not a defeat. It is the cleanest, bravest thing a traveler ever does. It is how we stay honest on the road.",
 "आणि काय परत येते याबद्दल आम्ही तुम्हाला एक वचन देतो. जे काही चाचणीत टिकेल ते आम्ही दोन्ही हातांनी आणि खऱ्या कृतज्ञतेने जपू. आणि जे टिकणार नाही ते आम्ही सोडून देऊ — सौम्यपणे, आणि पूर्णपणे लाज न बाळगता. चुकीची समजूत सोडणे हा पराभव नाही. प्रवासी कधी करतो ती सर्वात स्वच्छ, सर्वात धाडसी कृती आहे. वाटेवर आपण प्रामाणिक कसे राहतो याचे ते स्वरूप आहे."],
["s36", title("TRAVELERS", "People must see to learn, and learn to see.", "#89b4fa", 140),
 "People must see to learn, and learn to see. This has been Segment One — the traveler, the dream, and the discipline. Stay with us. The testing begins now.",
 "शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे. हा होता पहिला भाग — प्रवासी, स्वप्न, आणि शिस्त. आमच्यासोबत राहा. चाचणी आता सुरू होते."],
];

let n = 0;
const cues = [];
for (const [id, vis, en, mr] of S) {
  n++;
  const num = String(n).padStart(2, "0");
  const sid = `seg1_${num}_${id}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">${vis}${captionBlock(en, mr)}\n</svg>`;
  fs.writeFileSync(path.join(SVG_DIR, sid + ".svg"), svg);
  cues.push({ n, id: sid, en, mr });
}
fs.writeFileSync(CUES, JSON.stringify(cues, null, 2));
const words = S.reduce((a, s) => a + s[2].split(/\s+/).length, 0);
console.log(`${S.length} scenes written; ~${words} EN words. cues -> ${path.relative(path.join(__dirname, "..", ".."), CUES)}`);
