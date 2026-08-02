// SEGMENT 3: THE WEIGHT OF WORLDS — pressure-vs-gravity tested across 7 bodies.
// Every number traces to lab/evidence/parameter_ledger.json. Run: node build_seg3.js
const path = require("path");
const L = require("./scene_lib.js");
const { title, quote, statement, claimCard, bg, nbg, STARS, esc } = L;
const SVG_DIR = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "segment_03_cues.json");

// ---- segment-specific visuals ----

function gFormula() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="160" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">Newton's law of surface gravity</text>
  <text x="960" y="380" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="120" fill="#e6edf3">g  =  GM / R²</text>
  <text x="960" y="490" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4">gravity at the surface = a constant × the body's mass ÷ its radius squared</text>
  <line x1="500" y1="540" x2="1420" y2="540" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="610" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="28" fill="#cdd6f4">G = 6.674 × 10⁻¹¹  m³ kg⁻¹ s⁻²  (CODATA)</text>
  <text x="960" y="670" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">No air, no pressure, no atmosphere — only mass and radius.</text>`;
}

function rivalFormula() {
  return `${bg(nbg(), "#1a1422", "#0b0e14")}${STARS}
  <text x="960" y="160" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">the rival proposal — weight as pressure</text>
  <text x="960" y="380" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="140" fill="#f9e2af">g  =  k · P</text>
  <text x="960" y="490" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4">gravity at the surface = a constant × the surface pressure</text>
  <line x1="500" y1="540" x2="1420" y2="540" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="620" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">no mass term — no radius term — only the air on your shoulders</text>`;
}

function calibrateEarth() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">we let it pick its own anchor — Earth</text>

  <rect x="430" y="220" width="1060" height="100" rx="14" fill="#1c2128" stroke="#f9e2af" stroke-width="2"/>
  <text x="960" y="285" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="44" fill="#f9e2af">g(Earth) = 9.82 m/s²  &  P(Earth) = 1.014 bar</text>

  <text x="960" y="400" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4">solve for k:</text>
  <rect x="430" y="430" width="1060" height="100" rx="14" fill="#1c2128" stroke="#89b4fa" stroke-width="2"/>
  <text x="960" y="495" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="44" fill="#a6e3a1">k  ≈  9.68  m/s² per bar</text>

  <text x="960" y="620" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#cdd6f4" font-style="italic">It fits Earth perfectly. By construction. That is the deal.</text>
  <text x="960" y="670" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">Now it must predict every other world with no further tuning.</text>`;
}

function bodiesTable() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="90" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">seven worlds — NASA NSSDCA reference data</text>

  <g font-family="ui-monospace,Consolas,monospace" font-size="24" fill="#cdd6f4">
    <text x="220" y="180" fill="#6c7393" font-size="22">BODY</text>
    <text x="780" y="180" text-anchor="end" fill="#6c7393" font-size="22">SURFACE PRESSURE</text>
    <text x="1180" y="180" text-anchor="end" fill="#6c7393" font-size="22">MEASURED g (m/s²)</text>
    <text x="1700" y="180" text-anchor="end" fill="#6c7393" font-size="22">RADIUS / MASS</text>
    <line x1="200" y1="200" x2="1720" y2="200" stroke="#30363d" stroke-width="2"/>

    <text x="220" y="248">Earth</text>
    <text x="780" y="248" text-anchor="end">1.014 bar</text>
    <text x="1180" y="248" text-anchor="end" fill="#f9e2af">9.82</text>
    <text x="1700" y="248" text-anchor="end">6371 km · 5.97e24 kg</text>

    <text x="220" y="296">Moon</text>
    <text x="780" y="296" text-anchor="end" fill="#9aa7b4">~3 × 10⁻¹⁵ bar</text>
    <text x="1180" y="296" text-anchor="end" fill="#a6e3a1">1.62</text>
    <text x="1700" y="296" text-anchor="end">1737 km · 7.35e22 kg</text>

    <text x="220" y="344">Mars</text>
    <text x="780" y="344" text-anchor="end">6.36 mbar</text>
    <text x="1180" y="344" text-anchor="end" fill="#a6e3a1">3.73</text>
    <text x="1700" y="344" text-anchor="end">3390 km · 6.42e23 kg</text>

    <text x="220" y="392">Venus</text>
    <text x="780" y="392" text-anchor="end" fill="#f38ba8">92 bar</text>
    <text x="1180" y="392" text-anchor="end" fill="#a6e3a1">8.87</text>
    <text x="1700" y="392" text-anchor="end">6052 km · 4.87e24 kg</text>

    <text x="220" y="440">Mercury</text>
    <text x="780" y="440" text-anchor="end" fill="#9aa7b4">~5 × 10⁻¹⁵ bar</text>
    <text x="1180" y="440" text-anchor="end" fill="#a6e3a1">3.70</text>
    <text x="1700" y="440" text-anchor="end">2440 km · 3.30e23 kg</text>

    <text x="220" y="488">Jupiter</text>
    <text x="780" y="488" text-anchor="end">≫1000 bar</text>
    <text x="1180" y="488" text-anchor="end" fill="#a6e3a1">25.92</text>
    <text x="1700" y="488" text-anchor="end">69911 km · 1.90e27 kg</text>

    <text x="220" y="536">Titan</text>
    <text x="780" y="536" text-anchor="end" fill="#f9e2af">1.467 bar</text>
    <text x="1180" y="536" text-anchor="end" fill="#a6e3a1">1.354</text>
    <text x="1700" y="536" text-anchor="end">2575 km · 1.35e23 kg</text>

    <line x1="200" y1="560" x2="1720" y2="560" stroke="#30363d" stroke-width="2"/>
  </g>
  <text x="960" y="610" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#6c7393">sources: NASA NSSDCA factsheets · JPL Solar System Dynamics · Huygens HASI (Titan)</text>`;
}

function failTable() {
  const rows = [
    ["Earth",    "1.014 bar",   "9.82",   "9.82 (calibration)", "—",            "#9aa7b4"],
    ["Venus",    "92 bar",      "8.87",   "≈ 891",              "100× too HIGH", "#f85149"],
    ["Titan",    "1.467 bar",   "1.354",  "≈ 14.2",             "10.5× too HIGH","#f85149"],
    ["Mars",     "6.36 mbar",   "3.73",   "≈ 0.062",            "60× too LOW",  "#f85149"],
    ["Mercury",  "~5×10⁻¹⁵ bar","3.70",   "≈ 5 × 10⁻¹⁴",        "~10¹⁴× too LOW","#f85149"],
    ["Moon",     "~3×10⁻¹⁵ bar","1.62",   "≈ 3 × 10⁻¹⁴",        "~10¹³× too LOW","#f85149"],
  ];
  const head = `<text x="220" y="180" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">BODY</text>
    <text x="560" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">PRESSURE</text>
    <text x="900" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">REAL g</text>
    <text x="1300" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">PRESSURE-MODEL g</text>
    <text x="1700" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">VERDICT</text>`;
  const body = rows.map((r, i) => {
    const y = 240 + i * 60;
    return `<text x="220" y="${y}" fill="#cdd6f4" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[0]}</text>
    <text x="560" y="${y}" text-anchor="end" fill="#cdd6f4" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[1]}</text>
    <text x="900" y="${y}" text-anchor="end" fill="#a6e3a1" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[2]}</text>
    <text x="1300" y="${y}" text-anchor="end" fill="${r[5]}" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[3]}</text>
    <text x="1700" y="${y}" text-anchor="end" fill="${r[5]}" font-size="22" font-family="ui-sans-serif,sans-serif">${r[4]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">out of sample, the pressure model breaks</text>
  ${head}
  <line x1="200" y1="200" x2="1720" y2="200" stroke="#30363d" stroke-width="2"/>
    ${body}
  <line x1="200" y1="${240 + rows.length * 60 - 30}" x2="1720" y2="${240 + rows.length * 60 - 30}" stroke="#30363d" stroke-width="2"/>`;
}

function magnitudeBar() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">the size of the failure</text>

  <text x="320" y="280" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">Venus       — too HIGH by</text>
  <rect x="800" y="248" width="200" height="42" fill="#f85149"/><text x="900" y="280" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="28" fill="#fff">100×</text>

  <text x="320" y="370" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">Titan       — too HIGH by</text>
  <rect x="800" y="338" width="60" height="42" fill="#f85149"/><text x="900" y="370" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="28" fill="#fff">10×</text>

  <text x="320" y="460" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">Mars        — too LOW by</text>
  <rect x="800" y="428" width="120" height="42" fill="#f85149"/><text x="900" y="460" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="28" fill="#fff">60×</text>

  <text x="320" y="550" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">Moon &amp; Mercury — too LOW by</text>
  <rect x="800" y="518" width="800" height="42" fill="#f85149"/><text x="1200" y="550" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="32" fill="#fff" font-weight="bold">~10¹⁴×</text>

  <text x="960" y="660" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#f9e2af" font-style="italic">A factor of ten trillion is not a rounding error.</text>`;
}

function newtonFits() {
  const rows = [
    ["Earth",   "9.82",  "9.82",  "0.0%"],
    ["Moon",    "1.62",  "1.63",  "0.4%"],
    ["Mars",    "3.73",  "3.73",  "0.0%"],
    ["Venus",   "8.87",  "8.87",  "0.0%"],
    ["Mercury", "3.70",  "3.70",  "0.0%"],
    ["Jupiter", "25.92", "26.18", "1.0%"],
    ["Titan",   "1.354", "1.354", "0.0%"],
  ];
  const head = `<text x="320" y="180" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">BODY</text>
    <text x="780" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">MEASURED g</text>
    <text x="1240" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">GM/R² PREDICTED</text>
    <text x="1640" y="180" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">ERROR</text>`;
  const body = rows.map((r, i) => {
    const y = 240 + i * 56;
    return `<text x="320" y="${y}" fill="#cdd6f4" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[0]}</text>
    <text x="780" y="${y}" text-anchor="end" fill="#cdd6f4" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[1]}</text>
    <text x="1240" y="${y}" text-anchor="end" fill="#a6e3a1" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[2]}</text>
    <text x="1640" y="${y}" text-anchor="end" fill="#a6e3a1" font-size="26" font-family="ui-monospace,Consolas,monospace">${r[3]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#a6e3a1" letter-spacing="3">Newton's GM/R² — every body, no tuning</text>
  ${head}
  <line x1="280" y1="200" x2="1680" y2="200" stroke="#30363d" stroke-width="2"/>
    ${body}
  <line x1="280" y1="${240 + rows.length * 56 - 30}" x2="1680" y2="${240 + rows.length * 56 - 30}" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="${240 + rows.length * 56 + 30}" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#a6e3a1">max error ≤ 0.36% across all seven worlds.</text>`;
}

function decisiveCase(label, sub, color) {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="380" text-anchor="middle" font-family="Georgia,serif" font-size="100" fill="#e6edf3" font-weight="bold">${esc(label)}</text>
  <rect x="660" y="420" width="600" height="3" fill="${color}" opacity="0.6"/>
  <text x="960" y="510" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="34" fill="${color}">${esc(sub)}</text>`;
}

function pressureScale() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">the test bench the solar system gives us</text>

  <text x="100" y="320" font-family="ui-sans-serif,sans-serif" font-size="30" fill="#cdd6f4">Surface pressure across these seven worlds spans</text>
  <text x="960" y="430" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="100" fill="#f9e2af" font-weight="bold">~10¹⁶</text>
  <text x="960" y="490" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="30" fill="#9aa7b4">ten quadrillion-fold</text>

  <line x1="700" y1="540" x2="1220" y2="540" stroke="#30363d" stroke-width="2"/>

  <text x="960" y="610" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#cdd6f4">Surface gravity spans only a factor of</text>
  <text x="960" y="690" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="60" fill="#a6e3a1" font-weight="bold">~19×</text>`;
}

// ---- SCENES ----
const S = [
["s01", title("SEGMENT THREE", "The Weight of Worlds", "#89b4fa", 96),
 "We come now to the second of the three bold claims — and this one, I will tell you, is the one the universe has given us the cleanest tools to settle. It is the claim that the weight you are feeling right now does not come from the mass of the Earth pulling on you. It comes, instead, from the air pressing down on you.",
 "आता आपण तीन धाडसी दाव्यांपैकी दुसऱ्याकडे येतो — आणि हा, मी तुम्हाला सांगतो, असा आहे ज्याची सोडवणूक करण्यासाठी विश्वाने आपल्याला सर्वात स्वच्छ साधने दिली आहेत. हा दावा आहे की तुम्हाला आत्ता जाणवणारे वजन पृथ्वीच्या वस्तुमानाच्या तुम्हावरील ओढीतून येत नाही. तो येतो हवेच्या तुम्हावरील दाबातून."],

["s02", quote('"Honor it first. Then test it."', ""),
 "And we honor it before we test it, as we always must. There is something honest in this idea. We really do live at the bottom of an ocean of air. You can feel it on a mountain road when your ears pop. You can feel it in a storm. It is a real thing pressing on you. The question is only whether it is also the only thing pressing on you.",
 "आणि आपण नेहमीप्रमाणे, चाचणीआधी त्याचा सन्मान करतो. या कल्पनेत काहीतरी प्रामाणिक आहे. आपण खरोखर हवेच्या महासागराच्या तळाशी राहतो. डोंगरी रस्त्यावर तुमचे कान फुटतात तेव्हा तुम्हाला ते जाणवते. वादळात तुम्हाला ते जाणवते. ती तुम्हावर दाबणारी एक खरी गोष्ट आहे. प्रश्न फक्त एवढाच आहे की तुम्हावर दाबणारी ती एकमेव गोष्ट आहे का."],

["s03", title("THE OPPONENT", "Newton's law", "#89b4fa", 108),
 "Before we hear the challenger, let us hear the champion. The current champion in this corner is Isaac Newton, whose simple, beautiful equation has reigned over the description of falling things for three hundred and forty years.",
 "आव्हानवीराला ऐकण्यापूर्वी, चॅम्पियनला ऐकू. या कोपऱ्यातील सध्याचा चॅम्पियन आहे आयझॅक न्यूटन, ज्याचे साधे, सुंदर समीकरण पडणाऱ्या गोष्टींच्या वर्णनावर तीनशे चाळीस वर्षांपासून राज्य करत आहे."],

["s04", gFormula(),
 "Here is Newton's claim, in a single line. Surface gravity equals a universal constant — G — multiplied by the body's mass, divided by its radius squared. Nothing about air. Nothing about pressure. Nothing about what gases happen to be hanging above the surface. Only mass and radius. That is the whole story.",
 "इथे आहे न्यूटनचा दावा, एका ओळीत. पृष्ठभागावरील गुरुत्वाकर्षण म्हणजे एक सार्वत्रिक स्थिरांक — G — गुणिले शरीराचे वस्तुमान, भागिले त्रिज्येचा वर्ग. हवेबद्दल काहीही नाही. दाबाबद्दल काहीही नाही. पृष्ठभागावर कोणते वायू असतात याबद्दल काहीही नाही. फक्त वस्तुमान आणि त्रिज्या. हीच सर्व कहाणी आहे."],

["s05", title("THE CHALLENGER", "weight as pressure", "#f9e2af", 100),
 "And here, in the other corner, is the challenger. A simpler claim — and in a way a more human one, because it says that the thing you can actually feel is the thing that does the work.",
 "आणि इथे, दुसऱ्या कोपऱ्यात, आहे आव्हानवीर. एक साधा दावा — आणि एका अर्थाने अधिक मानवी, कारण तो म्हणतो की तुम्हाला खरोखर जाणवणारी गोष्टच काम करते."],

["s06", rivalFormula(),
 "Here is the challenger's claim, also in a single line. Surface gravity equals some constant — call it k — multiplied by the air pressure. There is no mass term in this equation. No radius term. Only the air on your shoulders. If this is right, every world's gravity is just the weight of its sky.",
 "इथे आहे आव्हानवीराचा दावा, एका ओळीत. पृष्ठभागावरील गुरुत्वाकर्षण म्हणजे काही स्थिरांक — त्याला k म्हणू — गुणिले हवेचा दाब. या समीकरणात वस्तुमान नाही. त्रिज्या नाही. फक्त तुमच्या खांद्यांवरील हवा. हे बरोबर असेल, तर प्रत्येक जगाचे गुरुत्वाकर्षण म्हणजे फक्त त्याच्या आकाशाचे वजन आहे."],

["s07", calibrateEarth(),
 "Now here is where we are very deliberately fair. Before the test, we let the challenger pick its own k from its strongest case — Earth. Take Earth's gravity, nine-point-eight-two metres per second squared, divide by Earth's surface pressure, one-point-zero-one-four bar. Solve for k. The number comes out to about nine-point-seven. Our challenger now fits Earth perfectly, exactly as it wants to. By construction.",
 "आता इथे आपण अगदी मुद्दाम न्याय्य आहोत. चाचणीपूर्वी, आपण आव्हानवीराला त्याच्या सर्वात मजबूत प्रसंगातून — पृथ्वीवरून — स्वतःचा k निवडू देतो. पृथ्वीचे गुरुत्वाकर्षण, नऊ-पूर्णांक-आठ-दशांश-दोन मीटर प्रति सेकंदाचा वर्ग, पृथ्वीच्या पृष्ठभागावरील दाब, एक-पूर्णांक-शून्य-दशांश-एक-चार बार ने भागा. k साठी सोडवा. आकडा अंदाजे नऊ-पूर्णांक-सात येतो. आता आपला आव्हानवीर पृथ्वीशी अगदी पूर्णपणे जुळतो, हुबेहूब त्याला हवे तसे. रचनेने."],

["s08", quote('"And that is the only freedom it gets."', ""),
 "And that is the only freedom it gets. From this point on, the challenger must walk into six other worlds with no further tuning whatsoever, and predict the gravity it would feel there. If it gets close on those six worlds — anywhere close — it wins. If it does not, it does not. And we owe it the same fairness we would owe any of our own beloved ideas.",
 "आणि एवढीच स्वातंत्र्य त्याला मिळते. या क्षणापासून, आव्हानवीराने इतर सहा जगांत कोणत्याही पुढील जुळवणीशिवाय जायचे आहे, आणि तेथे जाणवेल ते गुरुत्वाकर्षण भाकीत करायचे आहे. त्या सहा जगांत तो जवळ पोहोचला — कोणत्याही बाजूने — तर तो जिंकतो. नसेल, तर नाही. आणि आपण त्याला तीच न्याय्यता देणे लागतो जी आपण आपल्याच कोणत्याही प्रिय कल्पनेला देऊ."],

["s09", title("THE BENCH", "seven worlds, settled by NASA", "#89b4fa", 90),
 "Here is the test bench. Seven worlds, all of which we have visited with spacecraft, all of whose masses and radii we know to several decimal places, and whose surface pressures and gravities are recorded in plain numbers on NASA's public planetary fact sheets. No mystery. No interpretation. Just the data.",
 "इथे आहे चाचणीचा बेंच. सात जगे, ज्यांना आपण अवकाशयानांनी भेट दिली आहे, ज्यांचे वस्तुमान आणि त्रिज्या आपल्याला अनेक दशांश स्थानांपर्यंत माहीत आहेत, आणि ज्यांचे पृष्ठीय दाब आणि गुरुत्वाकर्षण नासाच्या सार्वजनिक ग्रहीय माहितीपत्रकांत साध्या आकड्यांत नोंदवले आहेत. कोणतेही रहस्य नाही. कोणताही अर्थ नाही. फक्त माहिती."],

["s10", bodiesTable(),
 "Let us look at the bench together. There is Earth, at one bar of pressure and nine-point-eight of gravity. There is the airless Moon and the airless Mercury, with essentially zero atmosphere. There is Mars, with a thin breath of carbon dioxide at six millibars. There is Venus, with a crushing ninety-two bars. There is mighty Jupiter. And there is Titan — Saturn's moon — with an atmosphere thicker than ours, but the gentle gravity of a small world.",
 "बेंचकडे एकत्र पाहू. तिथे आहे पृथ्वी, एक बार दाबावर आणि नऊ-पूर्णांक-आठ गुरुत्वाकर्षणावर. तिथे आहे हवारहित चंद्र आणि हवारहित बुध, जवळजवळ शून्य वातावरणासह. तिथे आहे मंगळ, सहा मिलिबारवर कार्बन डायऑक्साइडच्या पातळ श्वासासह. तिथे आहे शुक्र, चिरडणाऱ्या ब्याऐंशी बारांसह. तिथे आहे पराक्रमी गुरू. आणि तिथे आहे टायटन — शनीचा चंद्र — आपल्यापेक्षा जाडसर वातावरणासह, पण एका छोट्या जगाच्या सौम्य गुरुत्वाकर्षणासह."],

["s11", pressureScale(),
 "Before we run the test, look at the range our test bench gives us. From the Moon's near-vacuum to the crush of Venus, the surface pressure across these seven worlds spans about ten thousand trillion to one. Sixteen orders of magnitude. Meanwhile, the surface gravity across the same seven worlds spans only a factor of about nineteen. The pressure varies by a factor of ten quadrillion. The gravity varies by a factor of nineteen.",
 "चाचणी चालवण्याआधी, आपल्या चाचणी बेंचने आपल्याला दिलेली श्रेणी पहा. चंद्राच्या जवळ-शून्य पासून शुक्राच्या चिरडण्यापर्यंत, या सात जगांवरील पृष्ठीय दाब साधारण दहा-हजार-कोटी-कोटी ते एक इतका पसरतो. सोळा परिमाण-कोटी. दरम्यान, त्याच सात जगांवरील पृष्ठीय गुरुत्वाकर्षण फक्त सुमारे एकोणीसच्या घटकाने पसरते. दाब दहा-कोटी-कोटी-कोटीच्या घटकाने बदलतो. गुरुत्वाकर्षण एकोणीसच्या घटकाने बदलते."],

["s12", quote('"Already, the shape of the answer is showing."', ""),
 "Already, without doing a single multiplication, the shape of the answer is showing through. If gravity were just rescaled pressure, we would expect them to vary roughly together. They do not. The driver is wild, and the thing it is supposed to be driving is calm. Something in the proposal is going to break. The only honest question is: where, and how badly?",
 "आधीच, एकही गुणाकार न करता, उत्तराचा आकार दिसू लागला आहे. जर गुरुत्वाकर्षण म्हणजे फक्त पुनर्मापन केलेला दाब असता, तर आपण अपेक्षा करू की ते साधारण एकत्र बदलतील. ते बदलत नाहीत. चालक जंगली आहे, आणि जे त्याने चालवायचे आहे ते शांत आहे. प्रस्तावात काहीतरी मोडणार. प्रामाणिक प्रश्न एकच आहे: कुठे, आणि किती वाईट?"],

["s13", title("THE TEST", "calibrated on Earth, applied everywhere", "#f38ba8", 92),
 "Let us run it. We take the challenger, with its Earth-calibrated k of nine-point-seven, and we ask it to predict the gravity on each of the other six worlds. We are not allowed to adjust anything else. We are not allowed to invent a separate constant for each planet. That would not be a theory. That would be a list of numbers wearing a mask. So we feed it the pressures, one by one, and we listen.",
 "त्याला चालवू. आपण आव्हानवीर घेतो, त्याच्या पृथ्वी-कॅलिब्रेट केलेल्या k = नऊ-दशांश-सात सह, आणि आपण त्याला इतर सहा जगांपैकी प्रत्येकावरील गुरुत्वाकर्षण भाकीत करायला सांगतो. आपल्याला बाकी काहीही समायोजित करण्याची परवानगी नाही. आपल्याला प्रत्येक ग्रहासाठी वेगळा स्थिरांक निर्माण करण्याची परवानगी नाही. तो सिद्धांत नसेल. ती मुखवटा घातलेली आकड्यांची यादी असेल. म्हणून आपण त्याला दाब देतो, एक एक करून, आणि आपण ऐकतो."],

["s14", failTable(),
 "Here is what the challenger predicts. On Venus, with ninety-two bars of atmosphere, the model predicts about eight hundred and ninety-one. The real answer is eight-point-eight-seven. One hundred times too high. On Titan, with one-point-five bars, the model predicts about fourteen. The real answer is one-point-three-five. Ten times too high. On Mars, with its thin atmosphere, the model predicts almost nothing. Real Mars gravity is three-point-seven. Sixty times too low.",
 "इथे आहे आव्हानवीराचे भाकीत. शुक्रावर, ब्याऐंशी बार वातावरणासह, मॉडेल सुमारे आठशे एकाहत्तर भाकीत करते. खरे उत्तर आहे आठ-दशांश-आठ-सात. शंभर पट जास्त. टायटनवर, एक-दशांश-पाच बार सह, मॉडेल सुमारे चौदा भाकीत करते. खरे उत्तर आहे एक-दशांश-तीन-पाच. दहा पट जास्त. मंगळावर, पातळ वातावरणासह, मॉडेल जवळजवळ शून्य भाकीत करते. खरे मंगळाचे गुरुत्वाकर्षण आहे तीन-दशांश-सात. साठ पट कमी."],

["s15", decisiveCase("THE MOON", "no air. Still pulls.", "#cdd6f4"),
 "And then we come to the case that ends the conversation. On the Moon, with essentially zero atmospheric pressure — no air, no breath, no sky — the pressure model is forced to predict, by its own equation, a gravity of essentially zero. And the real answer? The Moon's gravity is one-point-six-two metres per second squared. Enough to drop a hammer and a feather at the same speed in vacuum, which Apollo 15 astronauts did, on camera, for all of us.",
 "आणि मग आपण त्या प्रसंगाकडे येतो जो संभाषण संपवतो. चंद्रावर, अत्यंत शून्य वातावरणीय दाबासह — हवा नाही, श्वास नाही, आकाश नाही — दाब मॉडेलला त्याच्या स्वतःच्या समीकरणाने, अत्यंत शून्य गुरुत्वाकर्षण भाकीत करायला भाग पाडले जाते. आणि खरे उत्तर? चंद्राचे गुरुत्वाकर्षण आहे एक-दशांश-सहा-दोन मीटर प्रति सेकंदाचा वर्ग. व्हॅक्यूममध्ये हातोडा आणि पीस एकाच वेगाने टाकण्यासाठी पुरेसे, जे अपोलो १५ अंतराळवीरांनी, कॅमेऱ्यावर, आपल्या सर्वांसाठी केले."],

["s16", magnitudeBar(),
 "Look at the size of the failure. Not a sloppy fit. Not a slightly miscalibrated graph. The pressure model is off by a factor of one hundred on Venus, ten on Titan, sixty on Mars, and on the Moon and Mercury it is off by something like ten trillion. A factor of ten trillion is not a rounding error. It is not a near miss. It is two different worlds, sitting in two different rooms.",
 "अपयशाचा आकार पहा. ढिल्ले जुळवण नाही. किंचित चुकीचे कॅलिब्रेट केलेले आलेख नाही. दाब मॉडेल शुक्रावर शंभर, टायटनवर दहा, मंगळावर साठ पटीने चुकते, आणि चंद्र व बुधावर ते दहा-कोटी-कोटीच्या क्रमाने चुकते. दहा-कोटी-कोटीचा घटक म्हणजे गोलाकार त्रुटी नाही. तो जवळचा चुक नाही. ती दोन वेगवेगळी जगे आहेत, दोन वेगवेगळ्या खोल्यांत बसलेली."],

["s17", quote('"This is what a falsification looks like."', ""),
 "Pause here for one moment. This is what a falsification looks like in real science. It is not a clever argument. It is not someone shouting. It is just public numbers, fed through a public equation, producing answers that no honest person can call correct. The discipline is doing what the discipline does. The math has said no, in seven different rooms, six different times.",
 "इथे क्षणभर थांबू. खऱ्या विज्ञानात खंडन असेच दिसते. ते हुशार युक्तिवाद नाही. ती कोणीतरी ओरडणारी व्यक्ती नाही. ती फक्त सार्वजनिक आकडे आहेत, सार्वजनिक समीकरणातून पाठवलेले, अशी उत्तरे निर्माण करत आहेत जी कोणीही प्रामाणिक व्यक्ती बरोबर म्हणू शकत नाही. शिस्त जे करते ते करत आहे. गणिताने नाही म्हटले आहे, सात वेगवेगळ्या खोल्यांत, सहा वेगवेगळ्या वेळा."],

["s18", title("THE CHAMPION", "Newton, with no excuses", "#a6e3a1", 96),
 "Now let us be perfectly fair. Maybe Newton's equation has its own problems. Maybe its long reign is just inertia, and at the test bench it would do no better. So we line it up against the same seven worlds, with no special tuning for any of them, and we run the same arithmetic.",
 "आता आपण पूर्णपणे न्याय्य असू. कदाचित न्यूटनच्या समीकरणाचेही स्वतःचे प्रश्न असतील. कदाचित त्याचे दीर्घ राज्य फक्त जडत्व आहे, आणि चाचणी बेंचवर ते अधिक चांगले करणार नाही. म्हणून आपण त्याला त्याच सात जगांविरुद्ध, कोणत्याहीसाठी विशेष जुळवणीशिवाय, उभा करतो आणि तेच गणित चालवतो."],

["s19", newtonFits(),
 "And here is what Newton's GM-over-R-squared predicts. Earth gravity? Nine-point-eight-two. Match. Moon? One-point-six-three. The real answer is one-point-six-two. A four-tenths-of-one-percent error. Mars — match. Venus — match. Mercury — match. Jupiter, off by less than one percent. Titan — match. Across all seven worlds, with no per-planet tuning, the worst miss is one-point-zero percent and most of the others are essentially exact.",
 "आणि इथे आहे न्यूटनच्या GM/R² चे भाकीत. पृथ्वीचे गुरुत्वाकर्षण? नऊ-पूर्णांक-आठ-दोन. जुळते. चंद्र? एक-दशांश-सहा-तीन. खरे उत्तर एक-दशांश-सहा-दोन. चार-दशांश-एक-टक्का त्रुटी. मंगळ — जुळते. शुक्र — जुळते. बुध — जुळते. गुरू, एक टक्क्यापेक्षा कमी चुकतो. टायटन — जुळते. सर्व सात जगांवर, प्रत्येक ग्रहासाठी जुळवणीशिवाय, सर्वात वाईट चूक एक-दशांश-शून्य टक्के आहे आणि बाकीच्या जवळजवळ अचूक आहेत."],

["s20", statement(["Newton: max error ≤ 0.36%", "Pressure model: factors of 10 to 10¹⁴", "There is no contest."], "#a6e3a1"),
 "There is, frankly, no contest. The champion fits all seven worlds to within a fraction of a percent. The challenger gets exactly one right — the world it was bribed with — and is wrong on every other by factors of ten, of a hundred, of ten trillion. Both equations are simple. Both can be checked by a child with a calculator. One of them describes the universe.",
 "स्पष्टपणे सांगायचे तर, स्पर्धाच नाही. चॅम्पियन सर्व सात जगांना एक टक्क्याच्या अंशात बसवतो. आव्हानवीर नेमका एक बरोबर मिळवतो — ज्या जगाने त्याला लाच दिली होती ते — आणि बाकी प्रत्येकावर दहा, शंभर, दहा-कोटी-कोटीच्या घटकांनी चुकीचा आहे. दोन्ही समीकरणे साधी आहेत. दोन्ही गणकयंत्र असलेले मूल तपासू शकते. एक त्यांच्यापैकी विश्वाचे वर्णन करते."],

["s21", title("THE VERDICT", "the second claim — contradicted", "#f85149", 92),
 "So we write down the verdict. With the discipline we promised ourselves we would keep, and with no joy in the announcement, because we always honor the dream before we test it. The claim that the weight you feel comes from air pressure rather than mass and gravity is — by the planets themselves, by their own pressures and their own gravities — contradicted by test. Class X in our six honest labels.",
 "म्हणून आपण निर्णय लिहितो. आपण स्वतःशी पाळण्याचे वचन दिलेल्या शिस्तीने, आणि घोषणेत कोणताही आनंद न घेता, कारण आपण नेहमीच चाचणीआधी स्वप्नाचा सन्मान करतो. तुम्हाला जाणवणारे वजन वस्तुमान आणि गुरुत्वाकर्षणातून नव्हे तर हवेच्या दाबातून येते हा दावा — ग्रहांनी स्वतःच, त्यांच्या स्वतःच्या दाबांनी आणि त्यांच्या स्वतःच्या गुरुत्वाकर्षणांनी — चाचणीने खोडलेला आहे. आपल्या सहा प्रामाणिक खुणांतील वर्ग X."],

["s22", quote('"The math has said no, in seven worlds."', ""),
 "And it is important to say what this is, and what it is not. It is not an insult to the person who proposed the idea. It is not a victory lap for established physics. It is a measurement. We let the proposal pick its own anchor, we let it walk across six other worlds with the dignity it asked for, and on every one of them the universe, in plain numbers, said no. That is what a real test feels like.",
 "आणि हे काय आहे आणि काय नाही हे सांगणे महत्त्वाचे आहे. ती कल्पना मांडणाऱ्या व्यक्तीचा अपमान नाही. हे स्थापित भौतिकशास्त्राचा विजय फेरा नाही. हे मोजमाप आहे. आपण प्रस्तावाला त्याचा स्वतःचा आधार निवडू दिला, आपण त्याला त्याने मागितलेल्या प्रतिष्ठेने इतर सहा जगांत चालू दिले, आणि प्रत्येकावर विश्वाने, साध्या आकड्यांत, नाही म्हटले. खऱ्या चाचणीची हीच जाणीव असते."],

// --- CH7 Why the intuition felt true ---
["s23", title("AND YET —", "the air is real. Just not weight.", "#f9e2af", 84),
 "Now I want to spend a minute on something kinder than the verdict — because the verdict alone is not the whole story. Why did this idea feel true to so many people? Why does it still feel true? Because the air really does press on you. That part was not wrong. It was just attached to the wrong cause.",
 "आता मला निर्णयापेक्षा अधिक दयाळू गोष्टीवर एक मिनिट खर्च करायचा आहे — कारण फक्त निर्णय ही संपूर्ण कहाणी नाही. ही कल्पना अनेक लोकांना खरी का वाटली? ती अजूनही खरी का वाटते? कारण हवा खरोखर तुम्हावर दाबते. तो भाग चुकीचा नव्हता. तो फक्त चुकीच्या कारणाशी जोडलेला होता."],

["s24", quote('"Air pressure is real. It just isn\'t weight."', ""),
 "Atmospheric pressure is utterly real. It is fourteen-point-seven pounds per square inch on every square inch of your skin, right now, holding you in a steady embrace from every direction. It really does pop your ears on a mountain road. It really does drive the weather. But it does all of those things sideways — it does not, on its own, hold you to the ground. Gravity does that, quietly, in the background, every second.",
 "वातावरणीय दाब पूर्णपणे खरा आहे. तो तुमच्या त्वचेच्या प्रत्येक चौरस इंचावर साडे-चौदा पौंड प्रति चौरस इंच आहे, आत्ता, प्रत्येक दिशेने स्थिर मिठीत तुम्हाला धरून. तो डोंगरी रस्त्यावर तुमचे कान फुटवतो. तो खरोखर हवामान चालवतो. पण तो हे सर्व बाजूने करतो — तो स्वतः तुम्हाला जमिनीवर धरत नाही. ते गुरुत्वाकर्षण करते, शांतपणे, पार्श्वभूमीत, प्रत्येक सेकंदाला."],

["s25", statement(["The mistake was not in noticing.", "The mistake was in attributing.", "Two things, side by side."], "#f9e2af"),
 "And so the mistake the bold claim made was not in noticing the air. The mistake was in attributing weight to it. Two real things were sitting side by side in your everyday experience — pressure and weight — and the proposal merged them into one. The discipline's gentle gift is just to pull them apart again, with no scorn, and to ask each one what it really does.",
 "आणि म्हणून धाडसी दाव्याने केलेली चूक हवेला लक्षात घेण्यात नव्हती. चूक होती तिला वजन देण्यात. दोन खऱ्या गोष्टी तुमच्या रोजच्या अनुभवात बाजूबाजूला बसल्या होत्या — दाब आणि वजन — आणि प्रस्तावाने त्यांना एकात विलीन केले. शिस्तीची सौम्य भेट म्हणजे फक्त त्यांना तिरस्काराशिवाय पुन्हा वेगळे काढणे, आणि प्रत्येकाला तो खरोखर काय करतो ते विचारणे."],

// --- CH8 The deeper "why" — for those who want it ---
["s26", title("THE DEEPER WHY", "atmospheres are HELD by gravity", "#3b82f6", 84),
 "There is one more piece worth knowing — the deeper reason the pressure model could never have worked. Atmospheres do not sit on planets by accident. They are not painted on the surface. They are held in place by gravity itself. The air is a consequence of weight; it is not the cause of it.",
 "आणखी एक तुकडा जाणण्यासारखा आहे — दाब मॉडेल कधीच कार्य करू शकले नसते याचे खोल कारण. वातावरण ग्रहांवर अपघाताने बसत नाहीत. ते पृष्ठभागावर रंगवलेले नाहीत. ते स्वतः गुरुत्वाकर्षणाने जागी धरले जातात. हवा वजनाचा परिणाम आहे; तिचे कारण नाही."],

["s27", quote('"Weak gravity loses its air."', ""),
 "Bodies with weak gravity cannot hold their air. That is why the Moon has no atmosphere — its escape velocity is too low, and over billions of years any gases it had simply drifted off into space. That is why little Mercury is a near-vacuum, while heavy Venus traps a crushing ninety-two-bar furnace of carbon dioxide. The pressure is downstream of the gravity. Saying the pressure causes the gravity is, in the deepest sense, getting cause and effect exactly backwards.",
 "कमकुवत गुरुत्वाकर्षण असलेले शरीर त्यांची हवा धरू शकत नाहीत. म्हणून चंद्राला वातावरण नाही — त्याचा सुटका वेग खूप कमी आहे, आणि अब्जावधी वर्षांत त्याच्याकडे असलेले कोणतेही वायू फक्त अवकाशात निघून गेले. म्हणूनच लहान बुध जवळ-शून्य आहे, तर जड शुक्र ब्याऐंशी-बार कार्बन डायऑक्साइडची चिरडणारी भट्टी अडकवतो. दाब गुरुत्वाकर्षणाच्या खाली प्रवाहात आहे. दाब गुरुत्वाकर्षण निर्माण करतो असे म्हणणे म्हणजे, खोल अर्थाने, कारण आणि परिणाम बरोबर उलट करणे."],

["s28", statement(["Gravity holds the air.", "Not the other way around."], "#3b82f6"),
 "Gravity holds the air. Not the other way around. The intuition was reading the same equation backwards. That is also why the discipline matters. Because intuitions are good at noticing real correlations — and almost always bad at guessing which direction the arrow of causation actually runs.",
 "गुरुत्वाकर्षण हवा धरते. उलट नाही. अंतर्ज्ञान तेच समीकरण उलट वाचत होते. म्हणूनच शिस्त महत्त्वाची आहे. कारण अंतर्ज्ञाने खरे संबंध लक्षात घेण्यात चांगली असतात — आणि कारणाचा बाण नेमका कोणत्या दिशेने जातो याचा अंदाज लावण्यात जवळजवळ नेहमीच वाईट."],

// --- CH9 Honoring the dream within the verdict ---
["s29", title("THE DREAM", "honored, even here", "#f9e2af", 90),
 "And here, as in the last segment, I want to take a quiet moment to honor the person who reached for this idea. Because I think the reaching itself was the right kind of bravery, even if the destination turned out to be in a different room.",
 "आणि इथे, मागील भागाप्रमाणे, मला या कल्पनेकडे पोहोचणाऱ्या व्यक्तीचा सन्मान करण्यासाठी एक शांत क्षण घ्यायचा आहे. कारण मला वाटते की पोहोचणे हीच योग्य प्रकारची शूरता होती, गंतव्यस्थान वेगळ्या खोलीत निघाले तरीही."],

["s30", quote('"To question gravity itself takes courage."', ""),
 "To question the most established force in physics — to look up at three hundred and forty years of Newton and say I think this might be missing something — that is not foolishness. That is the act of a free mind. The discipline disagrees with the answer, but it stands up for the right to ask the question. The two things are not the same, and we should never let the world confuse them.",
 "भौतिकशास्त्रातील सर्वात स्थापित बलावर प्रश्न विचारणे — न्यूटनच्या तीनशे चाळीस वर्षांकडे वर पाहणे आणि म्हणणे मला वाटते यात काहीतरी सुटले आहे — हा मूर्खपणा नाही. ही एका स्वतंत्र मनाची कृती आहे. शिस्त उत्तराशी असहमत आहे, पण ती प्रश्न विचारण्याच्या अधिकारासाठी उभी आहे. या दोन गोष्टी एकच नाहीत, आणि आपण कधीही जगाला त्यांच्यात गल्लत करू देऊ नये."],

["s31", statement(["The dream said:", '"Look at the air."', "The discipline answered:", '"You are right to look —', 'but the answer is below."'], "#cdd6f4"),
 "The dream said look at the air. The discipline said yes, you are right to look. But the answer you are after is not above you, in the sky. It is below you, in the mass. Same act of attention. Different room. And the same person, if they keep that act of attention going, can walk through the wrong room into the right one. That is what science is built to do.",
 "स्वप्न म्हणाले हवेकडे पहा. शिस्तीने उत्तर दिले होय, तुम्ही पाहण्यात बरोबर आहात. पण तुम्ही जे शोधत आहात ते वर तुमच्यावर, आकाशात नाही. ते तुमच्या खाली, वस्तुमानात आहे. लक्ष देण्याची तीच कृती. वेगळी खोली. आणि तीच व्यक्ती, जर ती ती लक्ष देण्याची कृती चालू ठेवते, तर चुकीच्या खोलीतून बरोबरच्या खोलीत जाऊ शकते. विज्ञान हेच करण्यासाठी बांधले आहे."],

// --- CH10 Close + bridge ---
["s32", title("SO FAR", "two of three claims tested", "#89b4fa", 92),
 "Two of the three bold claims have now had their hearing. Ozone-as-life: most readings contradicted, the modest shield reading kept and the metaphor preserved. Pressure-as-weight: contradicted, on seven worlds, by their own numbers. One claim remains. The third one is the strangest of all three, and in some ways the most beautiful.",
 "तीन धाडसी दाव्यांपैकी दोन आता ऐकले गेले आहेत. ओझोन-म्हणजे-जीवन: बहुतेक वाचने खोडली, माफक कवच वाचन ठेवले आणि रूपक जपले. दाब-म्हणजे-वजन: सात जगांवर, त्यांच्या स्वतःच्या आकड्यांनी, खोडलेला. एक दावा शिल्लक आहे. तिसरा तिन्हीतला सर्वात विचित्र आहे, आणि काही प्रकारे सर्वात सुंदर."],

["s33", quote('"The third claim is the one about us."', ""),
 "And it is the one about you, and me, and the one cell that became a thousand and then a trillion and then us. It is the claim about life itself — about what runs you, what holds you together, what answers when something hurts and what reaches when something calls. It is the claim of a deeper unity — a single force, a single substance, a single thread running through all living things.",
 "आणि तो तुमच्याबद्दल, माझ्याबद्दल, आणि एका पेशीबद्दल आहे जी हजार झाली आणि मग एक कोटी आणि मग आपण. तो जीवनाबद्दलचा दावा आहे — तुम्हाला काय चालवते, तुम्हाला काय एकत्र धरते, काहीतरी दुखवते तेव्हा काय उत्तर देते आणि काहीतरी हाक मारते तेव्हा काय पोहोचते. तो खोल एकत्वाचा दावा आहे — एकच बल, एकच पदार्थ, सर्व जिवंत गोष्टींतून जाणारा एकच धागा."],

["s34", title("NEXT", "The Breath of Life", "#a6e3a1", 92),
 "It is called The Breath of Life. We will walk it through the same discipline. And like the other two, parts of it — some genuinely beautiful parts — will survive, and parts will not. We will keep what is real, with both hands, and let the rest go, gently, as honest travelers do.",
 "त्याचे नाव आहे जीवनाचा श्वास. आपण त्याला त्याच शिस्तीतून चालवू. आणि इतर दोघांप्रमाणे, त्याचे काही भाग — काही खरोखर सुंदर भाग — टिकतील, आणि काही टिकणार नाहीत. आपण जे खरे आहे ते दोन्ही हातांनी ठेवू, आणि बाकीचे, सौम्यपणे, प्रामाणिक प्रवासी जसे करतात तसे जाऊ देऊ."],

["s35", title("TRAVELERS", "the testing continues", "#89b4fa", 130),
 "People must see to learn, and learn to see. The second claim has had its hearing. May the last one find as fair a one.",
 "शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे. दुसऱ्या दाव्याची सुनावणी झाली. शेवटच्यालाही तितकीच न्याय्य सुनावणी मिळो."],
];

L.writeScenes(S, SVG_DIR, CUES, "seg3");
