// SEGMENT 2: THE SKY'S SHIELD — ozone tested, decomposed into 5 readings.
// Each scientific claim traces to lab/evidence/. Run: node build_seg2.js
const path = require("path");
const L = require("./scene_lib.js");
const { title, quote, statement, claimCard, bg, nbg, STARS, esc } = L;
const SVG_DIR = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "segment_02_cues.json");

// ----- segment-specific visual templates -----

function ozoneMolecule() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <g transform="translate(960,380)">
    <line x1="-150" y1="60" x2="0" y2="-80" stroke="#89b4fa" stroke-width="6" opacity="0.7"/>
    <line x1="150" y1="60" x2="0" y2="-80" stroke="#89b4fa" stroke-width="6" opacity="0.7"/>
    <circle cx="-150" cy="60" r="68" fill="#3b82f6" stroke="#89dceb" stroke-width="3"/>
    <text x="-150" y="74" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="44" fill="#fff" font-weight="bold">O</text>
    <circle cx="150" cy="60" r="68" fill="#3b82f6" stroke="#89dceb" stroke-width="3"/>
    <text x="150" y="74" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="44" fill="#fff" font-weight="bold">O</text>
    <circle cx="0" cy="-80" r="68" fill="#3b82f6" stroke="#89dceb" stroke-width="3"/>
    <text x="0" y="-66" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="44" fill="#fff" font-weight="bold">O</text>
  </g>
  <text x="960" y="640" text-anchor="middle" font-family="Georgia,serif" font-size="44" fill="#89b4fa">O₃ — three oxygen atoms, bent in a triangle</text>`;
}

function chapmanCycle() {
  return `${bg(nbg(), "#0c111e", "#0b0e14")}${STARS}
  <text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="4">how ozone is born — the Chapman cycle (1930)</text>
  <g font-family="ui-monospace,Consolas,monospace" font-size="32" fill="#cdd6f4">
    <rect x="320" y="220" width="1280" height="90" rx="12" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="960" y="278" text-anchor="middle">O₂  +  UV light  →  O  +  O</text>
    <text x="1620" y="278" font-size="24" fill="#6c7393">(split)</text>

    <rect x="320" y="330" width="1280" height="90" rx="12" fill="#1c2128" stroke="#a6e3a1" stroke-width="2"/>
    <text x="960" y="388" text-anchor="middle">O  +  O₂  →  O₃</text>
    <text x="1620" y="388" font-size="24" fill="#6c7393">(form)</text>

    <rect x="320" y="440" width="1280" height="90" rx="12" fill="#1c2128" stroke="#89dceb" stroke-width="2"/>
    <text x="960" y="498" text-anchor="middle">O₃  +  UV light  →  O₂  +  O</text>
    <text x="1620" y="498" font-size="24" fill="#6c7393">(shield)</text>

    <rect x="320" y="550" width="1280" height="90" rx="12" fill="#1c2128" stroke="#f9e2af" stroke-width="2"/>
    <text x="960" y="608" text-anchor="middle">O  +  O₃  →  O₂  +  O₂</text>
    <text x="1620" y="608" font-size="24" fill="#6c7393">(close)</text>
  </g>`;
}

function beerLambert() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="4">how much light gets through — the math</text>
  <text x="960" y="290" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="74" fill="#e6edf3">I = I₀ · e<tspan font-size="48" baseline-shift="super">−τ</tspan></text>
  <text x="960" y="380" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4">light through  =  light in  ×  e to the minus τ</text>
  <line x1="500" y1="430" x2="1420" y2="430" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="500" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="42" fill="#cdd6f4">τ  =  σ · N</text>
  <text x="960" y="555" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="28" fill="#9aa7b4">optical depth  =  how much each molecule absorbs  ×  how many molecules are in the column</text>
  <text x="960" y="650" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="30" fill="#6c7393">Beer–Lambert · 19ᵗʰ century · still true</text>`;
}

function tauResult() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="150" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">plug in Earth's ozone column</text>

  <text x="960" y="260" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="32" fill="#cdd6f4">300 Dobson Units  =  8.07 × 10¹⁸ molecules / cm²</text>
  <text x="960" y="320" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="32" fill="#cdd6f4">σ (Hartley peak ~255 nm)  ≈  1.1 × 10⁻¹⁷ cm²</text>

  <rect x="430" y="380" width="1060" height="100" rx="14" fill="#1c2128" stroke="#89b4fa" stroke-width="2"/>
  <text x="960" y="445" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="50" fill="#a6e3a1">τ  ≈  88.8</text>

  <text x="960" y="560" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4">UV-C transmission at the ground:</text>
  <rect x="430" y="600" width="1060" height="100" rx="14" fill="#1c2128" stroke="#f9e2af" stroke-width="2"/>
  <text x="960" y="665" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="46" fill="#f9e2af">e⁻⁸⁸·⁸  ≈  3 × 10⁻³⁹</text>`;
}

function fiveReadings() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="120" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="38" fill="#9aa7b4" letter-spacing="4">"Ozone = Life" is not one claim — it is five</text>

  <g font-family="ui-sans-serif,sans-serif">
    <rect x="240" y="210" width="1440" height="64" rx="10" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="280" y="252" font-size="30" fill="#cba6f7" font-weight="bold">1.</text>
    <text x="340" y="252" font-size="30" fill="#e6edf3">LITERAL — ozone <tspan font-style="italic" fill="#f38ba8">is</tspan> life, alive in itself</text>

    <rect x="240" y="290" width="1440" height="64" rx="10" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="280" y="332" font-size="30" fill="#cba6f7" font-weight="bold">2.</text>
    <text x="340" y="332" font-size="30" fill="#e6edf3">NECESSARY — ozone is required for any life, anywhere</text>

    <rect x="240" y="370" width="1440" height="64" rx="10" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="280" y="412" font-size="30" fill="#cba6f7" font-weight="bold">3.</text>
    <text x="340" y="412" font-size="30" fill="#e6edf3">SHIELD — ozone protects life on modern Earth from UV</text>

    <rect x="240" y="450" width="1440" height="64" rx="10" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="280" y="492" font-size="30" fill="#cba6f7" font-weight="bold">4.</text>
    <text x="340" y="492" font-size="30" fill="#e6edf3">BIOSIGNATURE — ozone in an alien sky may signal life there</text>

    <rect x="240" y="530" width="1440" height="64" rx="10" fill="#1c2128" stroke="#cba6f7" stroke-width="2"/>
    <text x="280" y="572" font-size="30" fill="#cba6f7" font-weight="bold">5.</text>
    <text x="340" y="572" font-size="30" fill="#e6edf3">METAPHOR — the sky as the breath of a living world</text>
  </g>

  <text x="960" y="660" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#f9e2af" font-style="italic">we test each of the five — separately</text>`;
}

function planetOzone() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">but ozone is also found on dead worlds</text>

  <g font-family="ui-monospace,Consolas,monospace" font-size="30" fill="#cdd6f4">
    <text x="320" y="260" fill="#6c7393" font-size="24">PLANET</text>
    <text x="800" y="260" fill="#6c7393" font-size="24">ATMOSPHERE</text>
    <text x="1280" y="260" fill="#6c7393" font-size="24">OZONE DETECTED?</text>
    <text x="1620" y="260" fill="#6c7393" font-size="24">LIFE?</text>
    <line x1="280" y1="280" x2="1760" y2="280" stroke="#30363d" stroke-width="2"/>

    <text x="320" y="340">Earth</text>
    <text x="800" y="340">~1 bar O₂/N₂</text>
    <text x="1280" y="340" fill="#a6e3a1">Yes — ~300 DU</text>
    <text x="1620" y="340" fill="#a6e3a1">YES</text>

    <text x="320" y="410">Venus</text>
    <text x="800" y="410">~92 bar CO₂</text>
    <text x="1280" y="410" fill="#f9e2af">Yes — nightside, ~100 km</text>
    <text x="1620" y="410" fill="#f38ba8">NO</text>

    <text x="320" y="480">Mars</text>
    <text x="800" y="480">6 mbar CO₂</text>
    <text x="1280" y="480" fill="#f9e2af">Yes — 0.4–4 DU</text>
    <text x="1620" y="480" fill="#f38ba8">NO</text>
  </g>

  <text x="960" y="620" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">sources: ESA Venus Express SPICAV · ESA Mars Express SPICAM</text>
  <rect x="510" y="660" width="900" height="60" rx="10" fill="#1c2128" stroke="#f38ba8" stroke-width="2"/>
  <text x="960" y="700" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#f38ba8" font-weight="bold">Ozone forms in any UV-irradiated O/O₂ atmosphere — biotic or not.</text>`;
}

function ancientEarth() {
  return `${bg(nbg(), "#1a1422", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">Earth's own deep past says no</text>
  <g transform="translate(160,300)">
    <line x1="0" y1="120" x2="1600" y2="120" stroke="#30363d" stroke-width="4"/>

    <circle cx="0" cy="120" r="14" fill="#f9e2af"/>
    <text x="0" y="80" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="26" fill="#f9e2af">4.5 Ga</text>
    <text x="0" y="180" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#9aa7b4">Earth forms</text>

    <circle cx="500" cy="120" r="14" fill="#a6e3a1"/>
    <text x="500" y="80" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="26" fill="#a6e3a1">~3.7 Ga</text>
    <text x="500" y="180" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#cdd6f4">first life — anoxic</text>

    <circle cx="1100" cy="120" r="14" fill="#89dceb"/>
    <text x="1100" y="80" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="26" fill="#89dceb">~2.4 Ga</text>
    <text x="1100" y="180" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#cdd6f4">Great Oxidation Event</text>

    <circle cx="1600" cy="120" r="14" fill="#fab387"/>
    <text x="1600" y="80" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="26" fill="#fab387">today</text>
  </g>
  <text x="960" y="600" text-anchor="middle" font-family="Georgia,serif" font-size="36" fill="#cdd6f4" font-style="italic">"Life beat the ozone layer by more than a billion years."</text>`;
}

function verdictTable() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="120" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="38" fill="#9aa7b4" letter-spacing="4">"Ozone = Life" — the honest verdict</text>

  <g font-family="ui-sans-serif,sans-serif" font-size="26">
    <line x1="160" y1="210" x2="1760" y2="210" stroke="#30363d" stroke-width="2"/>

    <text x="220" y="270" fill="#e6edf3">1. LITERAL — ozone is alive</text>
    <rect x="1260" y="240" width="120" height="40" rx="6" fill="#f85149"/><text x="1320" y="268" text-anchor="middle" fill="#0b0e12" font-weight="bold" font-size="22">X</text>
    <text x="1420" y="268" fill="#f85149">contradicted</text>

    <text x="220" y="340" fill="#e6edf3">2. NECESSARY — for all life</text>
    <rect x="1260" y="310" width="120" height="40" rx="6" fill="#f85149"/><text x="1320" y="338" text-anchor="middle" fill="#0b0e12" font-weight="bold" font-size="22">X</text>
    <text x="1420" y="338" fill="#f85149">contradicted</text>

    <text x="220" y="410" fill="#e6edf3">3. SHIELD — UV protection on Earth</text>
    <rect x="1260" y="380" width="120" height="40" rx="6" fill="#3b82f6"/><text x="1320" y="408" text-anchor="middle" fill="#fff" font-weight="bold" font-size="22">B</text>
    <text x="1420" y="408" fill="#3b82f6">supported</text>

    <text x="220" y="480" fill="#e6edf3">4. BIOSIGNATURE — alien skies</text>
    <rect x="1260" y="450" width="120" height="40" rx="6" fill="#d29922"/><text x="1320" y="478" text-anchor="middle" fill="#0b0e12" font-weight="bold" font-size="22">C</text>
    <text x="1420" y="478" fill="#d29922">narrowed hypothesis</text>

    <text x="220" y="550" fill="#e6edf3">5. METAPHOR — breath of the world</text>
    <rect x="1260" y="520" width="120" height="40" rx="6" fill="#a371f7"/><text x="1320" y="548" text-anchor="middle" fill="#fff" font-weight="bold" font-size="22">D</text>
    <text x="1420" y="548" fill="#a371f7">metaphor preserved</text>

    <line x1="160" y1="580" x2="1760" y2="580" stroke="#30363d" stroke-width="2"/>
  </g>

  <text x="960" y="660" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#cdd6f4" font-style="italic">One reading survives in its narrowed form. The grandest do not.</text>`;
}

function uvSpectrum() {
  // simple horizontal UV spectrum bar with attenuated regions
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">what the shield stops</text>
  <g transform="translate(180,300)">
    <rect x="0" y="0" width="500" height="80" fill="#f85149"/>
    <text x="250" y="50" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#0b0e12" font-weight="bold">UV-C</text>
    <text x="250" y="-20" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="22" fill="#cdd6f4">100–280 nm</text>
    <text x="250" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="24" fill="#f38ba8">all blocked</text>

    <rect x="500" y="0" width="320" height="80" fill="#fab387"/>
    <text x="660" y="50" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#0b0e12" font-weight="bold">UV-B</text>
    <text x="660" y="-20" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="22" fill="#cdd6f4">280–315 nm</text>
    <text x="660" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="24" fill="#fab387">mostly blocked</text>

    <rect x="820" y="0" width="740" height="80" fill="#a6e3a1"/>
    <text x="1190" y="50" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#0b0e12" font-weight="bold">UV-A</text>
    <text x="1190" y="-20" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="22" fill="#cdd6f4">315–400 nm</text>
    <text x="1190" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="24" fill="#a6e3a1">passes through</text>
  </g>
  <text x="960" y="620" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">source: NASA Ozone Watch · Earth Observatory</text>`;
}

// ---------- SCENES (~42; ~2,800 words EN ≈ 17-20 min) ----------
const S = [
// --- CH0 Open ---
["s01", title("SEGMENT TWO", "The Sky's Shield", "#89b4fa", 108),
 "In the last segment, we listened to a hopeful idea, and we promised it a fair test. Now we keep that promise. We take the first of the three bold claims — that the ozone in our sky is the very source of life — and we walk it, gently, through the discipline.",
 "मागील भागात, आपण एका आशादायक कल्पनेला ऐकले, आणि आपण तिला न्याय्य चाचणीचे वचन दिले. आता आपण ते वचन पाळतो. आपण तीन धाडसी दाव्यांपैकी पहिला घेतो — की आपल्या आकाशातील ओझोन हाच जीवनाचा स्रोत आहे — आणि आपण तो सौम्यपणे शिस्तीतून चालवतो."],
["s02", quote('"First, we honor it. Then we test it."', ""),
 "We start, as we always will, by honoring it. This claim is beautiful. The sky above us really does protect us. To call that sky the source of life is not foolish — it is an act of attention. But beauty is not evidence. So now, with respect, we ask the harder question: in what form, exactly, could this be true?",
 "आपण सुरुवात नेहमीप्रमाणे, त्याचा सन्मान करून करतो. हा दावा सुंदर आहे. आपल्यावरचे आकाश खरोखर आपले रक्षण करते. त्या आकाशाला जीवनाचा स्रोत म्हणणे मूर्खपणा नाही — ती लक्ष देण्याची एक कृती आहे. पण सौंदर्य म्हणजे पुरावा नाही. म्हणून आता, आदराने, आपण अधिक कठीण प्रश्न विचारतो: नेमक्या कोणत्या स्वरूपात हे खरे असू शकेल?"],

// --- CH1 What is ozone, really ---
["s03", title("FIRST", "what ozone actually is", "#89dceb", 90),
 "Before we test, we need to know exactly what we are testing. Ozone is not magical. It is not mystical. It is a simple molecule, and the closer you look at it, the more remarkable it becomes — but in a measurable, particular way.",
 "चाचणीआधी, आपण नेमके काय तपासत आहोत हे आपल्याला माहीत असले पाहिजे. ओझोन जादुई नाही. गूढ नाही. ते एक साधे रेणू आहे, आणि जितक्या जवळून पाहाल तितके ते अधिक उल्लेखनीय वाटते — पण मोजता येण्याजोग्या, विशिष्ट पद्धतीने."],
["s04", ozoneMolecule(),
 "Ozone is just three oxygen atoms, bonded together in a slight bend — written O-three. That is it. The oxygen in the air we breathe is O-two, two atoms; ozone is the same element, with one extra atom and a slightly different shape. That tiny structural difference is the whole story.",
 "ओझोन म्हणजे फक्त तीन ऑक्सिजन अणू, थोडे वाकून जोडलेले — O-तीन असे लिहितात. एवढेच. आपण ज्या हवेत श्वास घेतो त्यातील ऑक्सिजन O-दोन, दोन अणू; ओझोन हाच घटक आहे, एका अतिरिक्त अणूसह आणि किंचित वेगळ्या आकारात. ती छोटी रचनात्मक तफावत हीच सगळी कहाणी आहे."],
["s05", chapmanCycle(),
 "Where does it come from? From sunlight, mostly. High in the upper atmosphere, ultraviolet light hits ordinary oxygen and breaks it apart. The loose oxygen atoms find their way back to oxygen molecules and join up, three at a time, into ozone. Then more ultraviolet light breaks the ozone apart again. This little dance is called the Chapman cycle, and it has been running over our heads for billions of years.",
 "ते कुठून येते? बहुतेक सूर्यप्रकाशातून. उच्च वातावरणात उंचावर, अतिनील किरण साध्या ऑक्सिजनवर आदळून त्याचे तुकडे करतात. सुटे ऑक्सिजन अणू पुन्हा ऑक्सिजन रेणूंशी जुळतात आणि तीन-तीन एकत्र येऊन ओझोन बनतात. मग अधिक अतिनील किरण पुन्हा ओझोनचे तुकडे करतात. या छोट्या नृत्याला चॅपमन चक्र म्हणतात, आणि ते आपल्या डोक्यावर अब्जावधी वर्षांपासून चालू आहे."],
["s06", quote('"A thin layer, ten to fifty kilometres up."', ""),
 "Most of Earth's ozone sits high in the stratosphere — between roughly ten and fifty kilometres above your head, peaking around thirty-two kilometres up. Ninety percent of all the ozone there is, is in this band. Even there, it is a tiny fraction of the air. If you brought all of it down to sea-level pressure, the ozone layer would be a film just three millimetres thick. That is the whole shield.",
 "पृथ्वीवरील बहुतेक ओझोन वातावरणात उंचावर बसते — आपल्या डोक्यावर अंदाजे दहा ते पन्नास किलोमीटर, सर्वोच्च बत्तीस किलोमीटर उंचीवर. सर्व ओझोनचा नव्वद टक्के या पट्ट्यात आहे. तिथेही, ती हवेचा एक अत्यल्प भाग आहे. ते सर्व समुद्रसपाटीच्या दाबाला आणले तर, ओझोनचा थर फक्त तीन मिलिमीटर जाडीचा एक पडदा होईल. एवढेच आहे संपूर्ण कवच."],

// --- CH2 The shield in numbers ---
["s07", title("SECOND", "the shield, in numbers", "#a6e3a1", 90),
 "Now we measure the shielding. Not with poetry, but with arithmetic. We use a law that has been in every physics textbook for a hundred and fifty years, and that absolutely nobody disputes — the Beer–Lambert law.",
 "आता आपण कवचाचे मोजमाप करतो. कविता वापरून नाही, तर गणिताने. आपण असा एक नियम वापरतो जो दीडशे वर्षांपासून प्रत्येक भौतिकशास्त्र पाठ्यपुस्तकात आहे, आणि जो कोणालाही कधीही नाकारता आला नाही — बीयर–लॅम्बर्ट नियम."],
["s08", beerLambert(),
 "It says: light passing through an absorbing material falls off exponentially. The amount that gets through is the amount that went in, multiplied by e — Euler's number — raised to a negative power. That power is called the optical depth, written tau. The bigger tau gets, the less light comes out the other side. It is a small equation, but it is the entire bookkeeping of a shield.",
 "तो म्हणतो: शोषक माध्यमातून जाणारा प्रकाश ऊर्जेयप्रमाणे कमी होतो. आत गेलेला प्रकाश, e — ऑयलरचा अंक — च्या ऋण घातांकाने गुणला तर बाहेर येणारा प्रकाश मिळतो. त्या घातांकाला प्रकाशीय खोली म्हणतात, टाऊ असे लिहितात. टाऊ जितका मोठा, दुसऱ्या बाजूने तितका कमी प्रकाश. लहान समीकरण, पण कवचाची संपूर्ण नोंद आहे."],
["s09", tauResult(),
 "Plug in Earth's numbers. The ozone column above your head, on a typical day, is about three hundred Dobson Units — roughly eight times ten to the eighteen molecules in every square centimetre. Multiply by how strongly each ozone molecule absorbs ultraviolet light at its peak — about one-point-one times ten to the minus seventeen — and you get an optical depth of about eighty-eight point eight.",
 "पृथ्वीचे आकडे टाका. तुमच्या डोक्यावर एका सामान्य दिवशी ओझोनचा स्तंभ साधारण तीनशे डॉब्सन एकके आहे — प्रत्येक चौरस सेंटिमीटरात अंदाजे आठ-गुणिले-दहा-च्या-अठरा रेणू. प्रत्येक ओझोन रेणू अतिनील किरण किती तीव्रतेने शोषतो त्याच्या उच्चांकाने — सुमारे एक-दशांश-एक-गुणिले-दहा-च्या-वजा-सतरा — गुणा, आणि सुमारे अठ्ठ्याऐंशी-दशांश-आठ इतकी प्रकाशीय खोली मिळते."],
["s10", quote('"e to the minus eighty-eight."', ""),
 "Now take e to the minus eighty-eight point eight. Picture this number with us for a moment. It is approximately three times ten to the minus thirty-nine. That is a decimal point, followed by thirty-eight zeros, followed by a three. The fraction of the most dangerous ultraviolet light that makes it from the top of the atmosphere all the way down to your skin is, for all practical purposes — zero.",
 "आता e च्या वजा अठ्ठ्याऐंशी-दशांश-आठ बघा. क्षणभर हा आकडा आमच्यासोबत डोळ्यासमोर आणा. तो अंदाजे तीन-गुणिले-दहा-च्या-वजा-एकोणचाळीस आहे. तो एक दशांश बिंदू, मग अडतीस शून्य, मग एक तीन. वातावरणाच्या वरून आपल्या त्वचेपर्यंत पोहोचणाऱ्या सर्वात धोकादायक अतिनील किरणांचा अंश — व्यावहारिकदृष्ट्या — शून्य आहे."],
["s11", uvSpectrum(),
 "Ultraviolet light comes in three flavours — A, B, and C. The high-energy C, the most dangerous, is blocked almost completely. The middle B is mostly blocked. Only the gentler A passes through to us. So the shielding is real. The number is real. The lab can recompute it from the code that drew this very picture, and the answer comes back the same to fifteen decimal places. The shield is supported by evidence — Class B in our ladder. That much we keep.",
 "अतिनील किरण तीन प्रकारात येतात — A, B, आणि C. उच्च-ऊर्जा C, सर्वात धोकादायक, जवळजवळ पूर्णपणे अडवला जातो. मधला B बहुतेक अडवला जातो. फक्त सौम्य A आपल्यापर्यंत पोहोचतो. म्हणून संरक्षण खरे आहे. आकडा खरा आहे. हीच चित्र काढणाऱ्या कोडवरून प्रयोगशाळा पुन्हा गणना करू शकते, आणि उत्तर पंधरा दशांश स्थानांपर्यंत तेच येते. कवच पुराव्यांनी समर्थित आहे — आपल्या शिडीतील वर्ग B. एवढे आपण ठेवतो."],

// --- CH3 The decomposition ---
["s12", title("BUT", "is shielding the same as life?", "#cba6f7", 96),
 "But — and here is where the patient discipline really begins to do its work — being a powerful UV shield is not the same as being life. Those are two different sentences, and we owe ourselves the care of telling them apart.",
 "पण — आणि इथेच धैर्यवान शिस्त खऱ्या अर्थाने काम करू लागते — एक शक्तिशाली अतिनील कवच असणे आणि जीवन असणे एकच गोष्ट नाही. ती दोन वेगवेगळी वाक्ये आहेत, आणि त्यांना वेगळी ओळखण्याची काळजी आपण स्वतःला देणे लागतो."],
["s13", fiveReadings(),
 "When somebody says ozone is life, they could mean any of at least five different things. We have to lay them out, side by side, in plain English, before we can test any of them. Otherwise, the strong reading and the weak reading hide behind each other, and the conversation can never end.",
 "जेव्हा कोणी म्हणते की ओझोन हे जीवन आहे, तेव्हा त्याचा अर्थ कमीतकमी पाच वेगवेगळ्या गोष्टींपैकी कोणतीही असू शकतो. कोणत्याही एकाची चाचणी घेण्यापूर्वी, आपल्याला त्या साध्या इंग्रजीत, एकमेकांच्या बाजूला मांडाव्या लागतात. नाहीतर, मजबूत आणि कमकुवत वाचने एकमेकांमागे लपतात, आणि संभाषण कधीच संपू शकत नाही."],
["s14", statement(["It could mean five things —", "and we will test", "each one separately."], "#e6edf3"),
 "These are not strawmen. Each of these readings is a way real people genuinely take the idea — sometimes all at once, without noticing. So we test them in turn. We let each one face its own kind of evidence, on its own terms. Some will survive. Some will not. And the one that survives may not be the one we expected.",
 "ही व्यंगचित्रे नाहीत. प्रत्येक वाचन हे खरे लोक खरोखर ज्या मार्गाने कल्पना घेतात तेच आहे — कधी एकाच वेळी, लक्षात न येता. म्हणून आपण त्यांची क्रमाने चाचणी घेतो. प्रत्येकाला त्याच्या स्वतःच्या प्रकारच्या पुराव्याला सामोरे जाऊ देतो, त्याच्या स्वतःच्या अटींवर. काही टिकतील. काही टिकणार नाहीत. आणि जे टिकेल ते आपण अपेक्षा केलेले नसेलही."],

// --- CH4 Test 1 — Literal ---
["s15", claimCard("READING 1", "Ozone IS life", "ozone is alive, in itself", "#cba6f7"),
 "Start with the strongest version. Reading one: ozone is itself alive. Not protective of life — actually alive, in some real sense. This is the most poetic reading, and the most easily testable. It comes apart almost immediately, but it deserves a careful answer rather than scorn.",
 "सर्वात मजबूत आवृत्तीने सुरुवात करा. वाचन एक: ओझोन हे स्वतः जिवंत आहे. जीवनाचे रक्षणकर्ते नाही — खरोखर जिवंत, काही खऱ्या अर्थाने. हे सर्वात काव्यमय वाचन आहे, आणि सर्वात सहज तपासण्याजोगे. ते जवळजवळ लगेच कोलमडते, पण तिरस्काराऐवजी काळजीपूर्वक उत्तर देण्यास पात्र आहे."],
["s16", quote('"Ozone is a triatomic oxidant. It is not alive."', ""),
 "Ozone, as a molecule, meets none of the things we mean by life. It does not eat, it does not grow, it does not copy itself, it does not respond to a wound. It is a clean, simple triatomic oxidant — and at ground level it is mildly toxic, the very thing your nose smells after a thunderstorm. As reading one, this idea collapses. Class X — contradicted.",
 "ओझोन, एक रेणू म्हणून, जीवन म्हणून आपण ज्याला म्हणतो त्यापैकी कशालाही पूर्ण करत नाही. ते खात नाही, वाढत नाही, स्वतःच्या प्रती बनवत नाही, जखमेला प्रतिसाद देत नाही. ते एक स्वच्छ, साधे त्रि-अणू ऑक्सिडकारक आहे — आणि जमिनीच्या पातळीवर ते सौम्यपणे विषारी आहे, गडगडाटी वादळानंतर तुमच्या नाकाला जाणवणारी तीच गोष्ट. वाचन एक म्हणून, ही कल्पना कोलमडते. वर्ग X — खोडली गेली."],
["s17", planetOzone(),
 "And here is the falsifier the cosmos itself hands us. Ozone exists on dead worlds. The European Space Agency's Venus Express probe found a thin nightside ozone layer about a hundred kilometres above Venus. Mars Express found a small but measurable ozone column over Mars. Both planets are, by every measure we have, biologically sterile. The shield is there, and the life is not. Reading one fails its test, cleanly.",
 "आणि इथे विश्वच आपल्या हातात देत असलेला खोडक आहे. ओझोन मृत जगांवर अस्तित्वात आहे. युरोपीय अवकाश संस्थेच्या व्हीनस एक्स्प्रेस यानाला शुक्रावर सुमारे शंभर किलोमीटर वर रात्रीच्या बाजूचा पातळ ओझोन थर सापडला. मार्स एक्स्प्रेसला मंगळावर लहान पण मोजता येण्याजोगा ओझोन स्तंभ सापडला. दोन्ही ग्रह, आपल्याकडे असलेल्या प्रत्येक मापाने, जैविकदृष्ट्या निर्जंतुक आहेत. कवच आहे, आणि जीवन नाही. वाचन एक त्याची चाचणी हरते, स्वच्छपणे."],

// --- CH5 Test 2 — Necessary ---
["s18", claimCard("READING 2", "Necessary for all life", "no ozone, no life — anywhere", "#cba6f7"),
 "Reading two is softer, and more tempting: maybe ozone isn't life, but maybe no life can exist without an ozone shield. Anywhere. Always. To test this we don't need other planets. We can look in our own backyard — and at our own deep past.",
 "वाचन दोन मऊ आहे, आणि अधिक मोहक: कदाचित ओझोन हे जीवन नाही, पण कदाचित ओझोन कवचाशिवाय कोणतेही जीवन कुठेही, कधीही असू शकत नाही. हे तपासण्यासाठी आपल्याला इतर ग्रहांची गरज नाही. आपण आपल्याच परसात — आणि आपल्या स्वतःच्या खोल भूतकाळात — पाहू शकतो."],
["s19", ancientEarth(),
 "Earth is about four-and-a-half billion years old. The first signs of life appear in rocks that are around three-and-a-half billion years old. The atmosphere did not become substantially oxygen-rich until something called the Great Oxidation Event, roughly two-point-four billion years ago. So life had already been thriving on this planet for more than a billion years before there was enough oxygen for ozone to form a real shield. Life beat the ozone layer by a billion years.",
 "पृथ्वी सुमारे साडे-चार अब्ज वर्षे जुनी आहे. जीवनाच्या पहिल्या खुणा साडे-तीन अब्ज वर्षे जुन्या खडकांत दिसतात. वातावरण मोठ्या ऑक्सिडेशन घटनेपर्यंत मोठ्या प्रमाणावर ऑक्सिजनयुक्त झाले नव्हते, साधारण २.४ अब्ज वर्षांपूर्वी. म्हणून ओझोन खरे कवच बनवण्यासाठी पुरेसा ऑक्सिजन येण्याच्या अब्ज वर्षांपूर्वीच जीवन या ग्रहावर भरभराटीत होते. जीवनाने ओझोन थराला एक अब्ज वर्षांनी हरवले."],
["s20", statement(["Life predates its shield", "by more than a billion years.", "Reading two — also contradicted."], "#f38ba8"),
 "And even today, large kingdoms of life live cheerfully without any reference to the ozone layer at all. Anaerobic bacteria in deep mud, ancient archaea in undersea hydrothermal vents, tube worms three kilometres down where the sunlight never reaches — none of them care whether the stratosphere is doing its job. Life is bigger than any one shield. Reading two is Class X — also contradicted.",
 "आणि आजही, जीवनाची मोठी राज्ये ओझोन थराचा कोणताही संदर्भ न घेता आनंदाने जगतात. खोल चिखलातील अनिवायुयिक जीवाणू, पाण्याखालील उष्ण जलवायुजनक छिद्रातील प्राचीन आर्किया, सूर्यप्रकाश कधीच न पोहोचणाऱ्या तीन किलोमीटर खोलवरील नळी-कृमी — कोणालाही पडलेले नाही की वातावरणाचा वरचा थर आपले काम करत आहे का. जीवन कोणत्याही एका कवचापेक्षा मोठे आहे. वाचन दोन वर्ग X — हेही खोडले."],

// --- CH6 Test 3 — Shield (the survivor) ---
["s21", claimCard("READING 3", "The modern shield", "for life today, on this planet", "#3b82f6"),
 "Reading three is the gentlest version, and the only one that has any chance of winning. It says simply this: for the kinds of life that exist on the surface of modern Earth today, the ozone layer matters. It actually shields us. And here, finally, the evidence holds.",
 "वाचन तीन सर्वात सौम्य आवृत्ती आहे, आणि जिंकण्याची काही संधी असलेले एकमेव. ते फक्त असे म्हणते: आज आधुनिक पृथ्वीच्या पृष्ठभागावर अस्तित्वात असलेल्या जीवनाच्या प्रकारांसाठी, ओझोन थर महत्त्वाचा आहे. तो खरोखर आपले रक्षण करतो. आणि इथे, अखेर, पुरावे टिकतात."],
["s22", statement(["e to the minus eighty-eight.", "On modern Earth's surface,", "this number is everything."], "#3b82f6"),
 "We did the math five minutes ago. e to the minus eighty-eight point eight is the entire argument. Strip the modern ozone layer away, and the energetic part of the Sun's UV — the part that breaks the chemical bonds inside the DNA in our skin cells — would hit the ground unattenuated. The shield is real, the number is enormous, and the dependence is real, in the very particular case of complex life like us, on this planet, right now.",
 "आपण पाच मिनिटांपूर्वी गणित केले. e च्या वजा अठ्ठ्याऐंशी-दशांश-आठ हाच संपूर्ण युक्तिवाद आहे. आधुनिक ओझोन थर काढून टाका, आणि सूर्याच्या अतिनील किरणांचा ऊर्जावान भाग — आपल्या त्वचा पेशींमधील DNA चे रासायनिक बंध तोडणारा भाग — जमिनीवर अबाधितपणे आदळेल. कवच खरे आहे, आकडा प्रचंड आहे, आणि या ग्रहावर, आत्ता, आपल्यासारख्या जटिल जीवनाच्या त्या विशिष्ट प्रसंगात, अवलंबित्व खरे आहे."],
["s23", quote('"Class B — supported within model."', ""),
 "Notice the language we use here. We don't say proven. We say supported, within the model we tested. The ozone column we measured is the real Earth column. The cross-section we used is the real, lab-measured absorption strength. The Beer–Lambert law is established physics. Each link in the chain is in our own evidence ledger, and any honest stranger can recompute the answer and check us. Class B in our six honest labels. The shield reading survives.",
 "इथे आपण वापरलेली भाषा लक्षात घ्या. आपण 'सिद्ध' म्हणत नाही. आपण 'समर्थित, आपण तपासलेल्या प्रतिकृतीत' म्हणतो. आपण मोजलेला ओझोन स्तंभ खरा पृथ्वीचा स्तंभ आहे. आपण वापरलेला छेद खरा, प्रयोगशाळेत मोजलेला शोषण तीव्रता आहे. बीयर–लॅम्बर्ट नियम स्थापित भौतिकशास्त्र आहे. साखळीतील प्रत्येक दुवा आपल्याच पुरावा खातावहीत आहे, आणि कोणताही प्रामाणिक अनोळखी व्यक्ती उत्तराची पुन्हा गणना करून आपली पडताळणी करू शकतो. आपल्या सहा प्रामाणिक खुणांमधील वर्ग B. कवच वाचन टिकते."],

// --- CH7 Test 4 — Biosignature ---
["s24", claimCard("READING 4", "Biosignature", "ozone in alien skies may signal life", "#d29922"),
 "Reading four is a step out into the universe. If ozone protects life here, then maybe, when we look at a distant planet around another star and see ozone in its atmosphere — maybe that is a hint of life there. This is the careful question astrobiologists actually wrestle with, every day, and the answer is interesting precisely because it is not simple.",
 "वाचन चार म्हणजे विश्वात एक पाऊल बाहेर. जर ओझोन इथे जीवनाचे रक्षण करते, तर कदाचित जेव्हा आपण दुसऱ्या ताऱ्याभोवती फिरणाऱ्या दूरच्या ग्रहाकडे पाहतो आणि त्याच्या वातावरणात ओझोन दिसते — कदाचित तो तिथल्या जीवनाचा संकेत आहे. हा तोच काळजीपूर्वक प्रश्न आहे ज्याच्याशी खगोलजीवशास्त्रज्ञ रोज झुंजतात, आणि उत्तर रंजक आहे कारण ते साधे नाही."],
["s25", quote('"Conditional. Context-dependent."', "Catling et al., 2018"),
 "Researchers like Catling and colleagues, in twenty-eighteen, laid out a serious framework for it. Yes, oxygen and ozone are real biosignatures — but only after you have ruled out the false-positive routes. Ozone can form abiotically, when an atmosphere's water is broken apart by ultraviolet light, the hydrogen escapes to space, and the leftover oxygen builds up. Without checking that escape route first, an ozone signal on its own does not prove life.",
 "कॅटलिंग आणि सहकाऱ्यांसारख्या संशोधकांनी, अठरा साली, यासाठी एक गंभीर चौकट मांडली. होय, ऑक्सिजन आणि ओझोन हे खरे जीवचिन्ह आहेत — पण फक्त तुम्ही खोट्या-सकारात्मक मार्गांना नाकारल्यानंतर. ओझोन निर्जीव पद्धतीने बनू शकतो, जेव्हा वातावरणातील पाणी अतिनील किरणांनी फुटते, हायड्रोजन अवकाशात पळून जातो, आणि उरलेला ऑक्सिजन साठतो. तो पळून जाण्याचा मार्ग आधी न तपासता, ओझोनचा संकेत स्वतःहून जीवन सिद्ध करत नाही."],
["s26", statement(["A useful hint —", "in a careful framework.", "Class C — narrowed hypothesis."], "#d29922"),
 "So reading four is allowed to live, but only in this narrowed and disciplined form: ozone is a useful hint, suggestive when combined with the right context, never decisive alone. We call this in our ladder a structured hypothesis — Class C. It is not proof. It is an honest, careful candidate for evidence, with all of its conditions stated out loud. That is the most we can responsibly give it.",
 "म्हणून वाचन चार जगू दिले जाते, पण फक्त या संकुचित आणि शिस्तबद्ध स्वरूपात: ओझोन एक उपयुक्त सूचक आहे, योग्य संदर्भासह एकत्रित केल्यावर सूचक, स्वतःहून कधीच निर्णायक नाही. आपल्या शिडीत आपण याला रचनात्मक गृहीतक म्हणतो — वर्ग C. हे सिद्धता नाही. हे पुराव्यासाठी एक प्रामाणिक, काळजीपूर्वक उमेदवार आहे, ज्याच्या सर्व अटी उघडपणे सांगितलेल्या आहेत. हेच आपण जबाबदारीने त्याला देऊ शकतो."],

// --- CH8 Test 5 — Metaphor ---
["s27", claimCard("READING 5", "The breath of a living world", "ozone as poetry, not chemistry", "#a371f7"),
 "And finally reading five — the most beautiful of them all, and the least empirical. Ozone as the breath, the skin, the breath-and-skin of a living world. This is not chemistry. It is poetry. It is the language of someone standing outside on a summer evening, feeling the sky, and reaching for words large enough to carry the feeling.",
 "आणि शेवटी वाचन पाच — त्या सगळ्यांत सुंदर, आणि सर्वात कमी प्रायोगिक. ओझोन एका जिवंत जगाचा श्वास, त्वचा, श्वास-आणि-त्वचा म्हणून. हे रसायनशास्त्र नाही. ही कविता आहे. ही उन्हाळ्याच्या संध्याकाळी बाहेर उभ्या असलेल्या, आकाश अनुभवणाऱ्या, आणि भावना वाहून नेण्याइतपत मोठ्या शब्दांकडे पोहोचणाऱ्या एखाद्याची भाषा आहे."],
["s28", statement(["As metaphor — preserved.", "As mechanism — never.", "Class D, with respect."], "#a371f7"),
 "We do not test metaphors with a microscope, and we shouldn't. As metaphor — as image, as orientation, as a way to feel the gratitude one ought to feel toward the sky above — this reading is preserved, entirely. We mark it Class D, an interpretive frame, and we leave it exactly where it belongs: in the language of human meaning, where it does its honest work, away from the laboratory bench. It is allowed to be beautiful without being a measurement.",
 "आपण रूपकांची चाचणी सूक्ष्मदर्शकाने घेत नाही, आणि आपण घेऊ नये. रूपक म्हणून — प्रतिमा म्हणून, दिशा म्हणून, वरच्या आकाशाबद्दल बाळगायला हवी ती कृतज्ञता अनुभवण्याचा मार्ग म्हणून — हे वाचन पूर्णतः जपले जाते. आपण त्याला वर्ग D, एक अर्थात्मक चौकट म्हणून खुणावतो, आणि त्याला जिथे ते असायला हवे तिथेच ठेवतो: मानवी अर्थाच्या भाषेत, जिथे ते आपले प्रामाणिक काम करते, प्रयोगशाळेच्या बेंचपासून दूर. ते मापन न होताही सुंदर असण्यास परवानगी आहे."],

// --- CH9 The verdict ---
["s29", title("THE VERDICT", "five readings, one survives narrowed", "#89b4fa", 88),
 "So now we line up our five readings and we look at them honestly, all together. No pleasure in the failures. No favoritism in the wins. Just the truth our discipline obliges us to write down.",
 "तर आता आपण आपली पाच वाचने एका रांगेत मांडतो आणि आपण त्यांच्याकडे प्रामाणिकपणे, एकत्र पाहतो. अपयशांचा आनंद नाही. विजयांमध्ये पक्षपात नाही. फक्त सत्य जे आपली शिस्त आपल्याला लिहायला भाग पाडते."],
["s30", verdictTable(),
 "Two of the five — the literal and the universal — were contradicted, by ozone on dead worlds and by life on a young Earth without an ozone shield. One — the modern shield on this planet — is supported within our model. One — biosignature — survives only as a narrowed, conditional hypothesis. And one — the metaphor — is preserved with respect, where it always belonged. Two clear nos, one clear yes, one disciplined maybe, and one beautiful image. That is the honest accounting.",
 "पाचपैकी दोन — शाब्दिक आणि सार्वत्रिक — मृत जगांवरील ओझोनने आणि ओझोन कवचाशिवाय तरुण पृथ्वीवरील जीवनाने खोडले गेले. एक — या ग्रहावरील आधुनिक कवच — आपल्या प्रतिकृतीत समर्थित आहे. एक — जीवचिन्ह — फक्त संकुचित, सशर्त गृहीतक म्हणून टिकते. आणि एक — रूपक — आदराने जपले, जिथे ते नेहमीच होते. दोन स्पष्ट 'नाही', एक स्पष्ट 'होय', एक शिस्तबद्ध 'कदाचित', आणि एक सुंदर प्रतिमा. हीच प्रामाणिक नोंद आहे."],

// --- CH10 Honoring the dream within the result ---
["s31", title("THE DREAM", "honored, even now", "#f9e2af", 90),
 "Look at that result for a moment. The grandest version of the claim — that ozone is the source of life itself — did not survive. And yet I would like to tell you why this is, in its own quiet way, a beautiful outcome. Why the person who first reached for the bigger reading is not diminished by it.",
 "त्या निकालाकडे क्षणभर पहा. दाव्याची सर्वात भव्य आवृत्ती — की ओझोन हे जीवनाचा स्रोत आहे — टिकली नाही. आणि तरीही मला तुम्हाला सांगायचे आहे की हा, स्वतःच्या शांत मार्गाने, एक सुंदर परिणाम आहे. ज्या व्यक्तीने प्रथम मोठ्या वाचनाकडे हात पसरला, ती यामुळे कमी होत नाही, हे का."],
["s32", quote('"They reached toward something real."', ""),
 "Because the person who reached for ozone-as-the-source-of-life was reaching toward something real. They had felt the shielding. They had noticed that the sky protects us. The grand claim was wrong in detail, but it was right in attention. They were facing the right direction. The discipline did not punish them for facing that direction; it only refined where, exactly, the truth turned out to be standing.",
 "कारण ओझोन-म्हणजे-जीवनाचा-स्रोत असे शोधणारा कोणीतरी काहीतरी खऱ्या गोष्टीकडे पोहोचत होता. त्यांना संरक्षण जाणवले होते. त्यांनी पाहिले होते की आकाश आपले रक्षण करते. तो मोठा दावा तपशीलात चुकीचा होता, पण लक्ष देण्यात बरोबर होता. ते योग्य दिशेला तोंड देत होते. शिस्तीने त्यांना त्या दिशेला तोंड देण्यासाठी शिक्षा केली नाही; तिने फक्त सत्य नेमके कुठे उभे होते ते परिष्कृत केले."],
["s33", quote('"And one of those reachings saved the ozone layer."', "Molina, Rowland, Crutzen — 1995 Nobel"),
 "And here is the gentle gift the universe gave us in return. The same impulse — the impulse to take ozone seriously — drove three chemists in the nineteen-seventies and eighties to ask whether human pollutants might be destroying it. Mario Molina, Sherwood Rowland, and Paul Crutzen showed that ordinary refrigerant chemicals were doing exactly that. They won the Nobel Prize, the world signed a treaty, and the hole in the sky began, slowly, to heal. The shield, taken seriously, repaid the attention.",
 "आणि इथे विश्वाने आपल्याला परत दिलेली सौम्य भेट. तीच प्रेरणा — ओझोनला गांभीर्याने घेण्याची प्रेरणा — सत्तर आणि ऐंशीच्या दशकात तीन रसायनशास्त्रज्ञांना मानवी प्रदूषक त्याचा नाश करत आहेत का हे विचारायला लावले. मारिओ मोलिना, शेरवुड रोलंड, आणि पॉल क्रुटझेन यांनी दाखवले की सामान्य प्रशीतक रसायने नेमके हेच करत आहेत. त्यांना नोबेल पारितोषिक मिळाले, जगाने करार केला, आणि आकाशातील भोक, हळूहळू, भरू लागले. कवचाने, गांभीर्याने घेतल्याबद्दल, लक्षाचा परतावा दिला."],

// --- CH11 Bridge ---
["s34", title("AHEAD", "the second claim awaits", "#f9e2af", 88),
 "So we close this segment with one honest yes, two honest nos, one disciplined maybe, and one preserved metaphor. None of it diminishes anyone. All of it is real. And one of the three bold claims has now been carefully retired in its grand form, and gently kept in its true one. Two claims remain.",
 "म्हणून आपण हा भाग एका प्रामाणिक 'होय', दोन प्रामाणिक 'नाही', एका शिस्तबद्ध 'कदाचित', आणि एका जपलेल्या रूपकासह बंद करतो. यापैकी काहीही कोणाला कमी करत नाही. सर्व काही खरे आहे. आणि तीन धाडसी दाव्यांपैकी एक त्याच्या भव्य स्वरूपात काळजीपूर्वक निवृत्त झाला आहे, आणि त्याच्या खऱ्या स्वरूपात सौम्यपणे ठेवला आहे. दोन दावे शिल्लक आहेत."],
["s35", statement(["Next segment:", "The Weight of Worlds."], "#f9e2af"),
 "Next, we walk the second of the three bold claims through the same gentle, stubborn discipline. That one is bigger than ozone. That one is about your own body, and your own weight, and seven other worlds in our solar system who, between them, will quietly settle the question. It is called The Weight of Worlds. We will see you there.",
 "पुढे, आपण तीन धाडसी दाव्यांपैकी दुसरा त्याच सौम्य, हट्टी शिस्तीतून चालवतो. तो ओझोनपेक्षा मोठा आहे. तो तुमच्या स्वतःच्या शरीराबद्दल, तुमच्या स्वतःच्या वजनाबद्दल, आणि आपल्या सौर मंडळातील आणखी सात जगांबद्दल आहे जे, एकत्र मिळून, शांतपणे प्रश्न मिटवतील. त्याचे नाव आहे जगांचे वजन. तिथे आपण भेटू."],
["s36", title("TRAVELERS", "the testing continues", "#89b4fa", 130),
 "People must see to learn, and learn to see. The first claim has had its hearing. May the others find as fair a one.",
 "शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे. पहिल्या दाव्याची सुनावणी झाली. बाकीच्यांनाही तितकीच न्याय्य सुनावणी मिळो."],
];

L.writeScenes(S, SVG_DIR, CUES, "seg2");
