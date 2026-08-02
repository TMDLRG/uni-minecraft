// SEGMENT 4: THE BREATH OF LIFE — bioenergetics + claim 3 tested.
// Numbers traced to lab/evidence/. Run: node build_seg4.js
const path = require("path");
const L = require("./scene_lib.js");
const { title, quote, statement, claimCard, bg, nbg, STARS, esc } = L;
const SVG_DIR = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "segment_04_cues.json");

function membrane() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="120" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">a membrane — and a proton gradient across it</text>
  <!-- membrane band -->
  <rect x="160" y="280" width="1600" height="14" fill="#3b3450"/>
  <rect x="160" y="460" width="1600" height="14" fill="#3b3450"/>
  <text x="120" y="290" text-anchor="end" font-family="ui-monospace,Consolas,monospace" font-size="22" fill="#6c7393">outside</text>
  <text x="120" y="470" text-anchor="end" font-family="ui-monospace,Consolas,monospace" font-size="22" fill="#6c7393">inside</text>
  <!-- protons above (many) -->
  <g fill="#f9e2af">
    <circle cx="260" cy="220" r="9"/><circle cx="340" cy="190" r="9"/><circle cx="430" cy="230" r="9"/><circle cx="540" cy="200" r="9"/>
    <circle cx="640" cy="220" r="9"/><circle cx="720" cy="180" r="9"/><circle cx="820" cy="240" r="9"/><circle cx="900" cy="200" r="9"/>
    <circle cx="1000" cy="190" r="9"/><circle cx="1100" cy="220" r="9"/><circle cx="1180" cy="200" r="9"/><circle cx="1280" cy="240" r="9"/>
    <circle cx="1380" cy="190" r="9"/><circle cx="1480" cy="210" r="9"/><circle cx="1580" cy="180" r="9"/><circle cx="1660" cy="230" r="9"/>
  </g>
  <!-- few inside -->
  <g fill="#f9e2af" opacity="0.7">
    <circle cx="400" cy="540" r="9"/><circle cx="900" cy="560" r="9"/><circle cx="1380" cy="540" r="9"/>
  </g>
  <!-- ATP synthase symbol -->
  <g transform="translate(960,367)">
    <rect x="-40" y="-93" width="80" height="186" rx="14" fill="#1c2128" stroke="#a6e3a1" stroke-width="3"/>
    <circle cx="0" cy="0" r="34" fill="#1c2128" stroke="#a6e3a1" stroke-width="3"/>
    <text x="0" y="9" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#a6e3a1" font-weight="bold">ATP</text>
  </g>
  <!-- arrow downward through synthase -->
  <line x1="960" y1="260" x2="960" y2="285" stroke="#f9e2af" stroke-width="4" marker-end="url(#arr)"/>
  <line x1="960" y1="470" x2="960" y2="495" stroke="#f9e2af" stroke-width="4" marker-end="url(#arr)"/>
  <defs><marker id="arr" markerWidth="10" markerHeight="10" refX="6" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#f9e2af"/></marker></defs>
  <text x="960" y="610" text-anchor="middle" font-family="Georgia,serif" font-size="34" fill="#cdd6f4" font-style="italic">protons flow downhill — the cell makes ATP</text>`;
}

function pmfFormula() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="160" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">the proton-motive force (Mitchell, 1961)</text>
  <text x="960" y="360" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="76" fill="#e6edf3">Δp  =  Δψ  −  (59 mV)·ΔpH</text>
  <text x="960" y="440" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="30" fill="#9aa7b4">the gradient's energy = the charge difference + the pH difference</text>
  <line x1="500" y1="500" x2="1420" y2="500" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="580" text-anchor="middle" font-family="ui-monospace,Consolas,monospace" font-size="38" fill="#a6e3a1">at 298 K, the Nernst factor = 59.16 mV per pH unit</text>
  <text x="960" y="650" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">Nobel Prize in Chemistry, 1978</text>`;
}

function metabolicMenu() {
  const rows = [
    ["AEROBIC RESPIRATION", "O₂", "+0.82 V", "you, animals, plants — efficient", "#a6e3a1"],
    ["ANAEROBIC — sulfate",  "SO₄²⁻", "−0.22 V", "deep ocean, gut bacteria", "#89dceb"],
    ["ANAEROBIC — nitrate",  "NO₃⁻", "+0.43 V", "soil bacteria, denitrifiers", "#89dceb"],
    ["ANAEROBIC — iron",     "Fe³⁺", "+0.77 V", "iron-reducing bacteria", "#89dceb"],
    ["METHANOGENESIS",       "CO₂",  "−0.24 V", "archaea, wetlands, swamps", "#cba6f7"],
    ["FERMENTATION",         "none", "—",       "yeast, lactic acid bacteria", "#f9e2af"],
  ];
  const head = `<text x="180" y="200" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">METABOLISM</text>
    <text x="850" y="200" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">ELECTRON ACCEPTOR</text>
    <text x="1140" y="200" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">POTENTIAL</text>
    <text x="1700" y="200" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">WHO USES IT?</text>`;
  const body = rows.map((r, i) => {
    const y = 256 + i * 56;
    return `<text x="180" y="${y}" fill="${r[4]}" font-size="24" font-family="ui-monospace,Consolas,monospace">${r[0]}</text>
    <text x="850" y="${y}" text-anchor="end" fill="#cdd6f4" font-size="24" font-family="ui-monospace,Consolas,monospace">${r[1]}</text>
    <text x="1140" y="${y}" text-anchor="end" fill="#cdd6f4" font-size="24" font-family="ui-monospace,Consolas,monospace">${r[2]}</text>
    <text x="1700" y="${y}" text-anchor="end" fill="#9aa7b4" font-size="22" font-family="ui-sans-serif,sans-serif">${r[3]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">life's actual menu — many ways to make ATP</text>
  ${head}
  <line x1="160" y1="216" x2="1740" y2="216" stroke="#30363d" stroke-width="2"/>
    ${body}
  <line x1="160" y1="${256 + rows.length * 56 - 30}" x2="1740" y2="${256 + rows.length * 56 - 30}" stroke="#30363d" stroke-width="2"/>
  <text x="960" y="${256 + rows.length * 56 + 10}" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="24" fill="#6c7393">Oxygen is the best of these — but it is not the only one.</text>`;
}

function thirdClaimCard() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="180" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="4">CLAIM THREE — the breath of life</text>
  <rect x="360" y="260" width="1200" height="360" rx="18" fill="#1c2128" stroke="#cba6f7" stroke-width="3"/>
  <text x="960" y="350" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="#e6edf3">"There is a single thread running</text>
  <text x="960" y="412" text-anchor="middle" font-family="Georgia,serif" font-size="48" fill="#e6edf3">through everything that lives:</text>
  <text x="960" y="510" text-anchor="middle" font-family="Georgia,serif" font-size="56" fill="#cba6f7" font-weight="bold">a flow of electricity and breath."</text>`;
}

function verdictTable() {
  const rows = [
    ["A. Proton gradients power cells",        "B", "#3b82f6", "supported"],
    ["B. Oxygen is sufficient — high yield",   "B", "#3b82f6", "supported"],
    ["C. Oxygen is required for ALL life",     "X", "#f85149", "contradicted"],
    ["D. ALL life uses a proton gradient",     "C", "#d29922", "narrowed hypothesis"],
    ["E. Life as a 'sacred current'",          "D", "#a371f7", "metaphor preserved"],
  ];
  const head = `<text x="200" y="220" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">READING</text>
    <text x="1700" y="220" text-anchor="end" fill="#6c7393" font-size="22" font-family="ui-monospace,Consolas,monospace">VERDICT</text>`;
  const body = rows.map((r, i) => {
    const y = 290 + i * 70;
    return `<text x="200" y="${y}" fill="#e6edf3" font-size="28" font-family="ui-sans-serif,sans-serif">${r[0]}</text>
    <rect x="1320" y="${y - 32}" width="60" height="44" rx="6" fill="${r[2]}"/>
    <text x="1350" y="${y}" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" font-weight="bold" fill="${r[1] === 'X' ? '#fff' : (r[1] === 'B' ? '#fff' : '#0b0e12')}">${r[1]}</text>
    <text x="1700" y="${y}" text-anchor="end" fill="${r[2]}" font-size="24" font-family="ui-sans-serif,sans-serif">${r[3]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">the breath of life — the honest verdict</text>
  ${head}
  <line x1="180" y1="240" x2="1720" y2="240" stroke="#30363d" stroke-width="2"/>
    ${body}
  <line x1="180" y1="${290 + rows.length * 70 - 30}" x2="1720" y2="${290 + rows.length * 70 - 30}" stroke="#30363d" stroke-width="2"/>`;
}

function lucaTree() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="120" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">a single common ancestor — and the gradient was already there</text>
  <g transform="translate(960,380)" stroke="#cdd6f4" stroke-width="2" fill="none">
    <line x1="0" y1="0" x2="0" y2="-100"/>
    <line x1="0" y1="-100" x2="-300" y2="-200"/>
    <line x1="0" y1="-100" x2="0" y2="-200"/>
    <line x1="0" y1="-100" x2="300" y2="-200"/>
    <circle cx="0" cy="0" r="50" fill="#1c2128" stroke="#f9e2af" stroke-width="3"/>
  </g>
  <text x="960" y="395" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#f9e2af" font-weight="bold">LUCA</text>
  <text x="660" y="195" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#a6e3a1">Bacteria</text>
  <text x="960" y="195" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#89dceb">Archaea</text>
  <text x="1260" y="195" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#cba6f7">Eukarya — us</text>
  <text x="960" y="610" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#cdd6f4" font-style="italic">"Every living thing carries the same engine."</text>`;
}

// ---- SCENES ----
const S = [
["s01", title("SEGMENT FOUR", "The Breath of Life", "#a6e3a1", 90),
 "We come now to the third and last of the three bold claims — and I have been quietly waiting to bring you to this one, because of the three it is, in some ways, the most beautiful, and the most personal. It is the claim about life itself. The claim that there is a single thread, a single flow, running through every living thing on this Earth.",
 "आता आपण तीन धाडसी दाव्यांपैकी तिसऱ्या आणि शेवटच्या दाव्याकडे येतो — आणि मी तुम्हाला याकडे आणण्याची शांतपणे वाट पाहत होतो, कारण तिघांत हा, काही प्रकारे, सर्वात सुंदर आणि सर्वात वैयक्तिक आहे. हा दावा जीवनाबद्दलच आहे. की या पृथ्वीवरील प्रत्येक जिवंत गोष्टीतून एक एकच धागा, एक एकच प्रवाह वाहत आहे."],

["s02", thirdClaimCard(),
 "Spoken aloud, the claim sounds like poetry. There is a single thread running through everything that lives — a flow of electricity, of breath, of energy. Some traditions have called it the breath. Some have called it the current. The bold scientific version of the claim says all of those names point at the same real thing, and we can find it.",
 "उघडपणे बोलले तर, दावा कवितेसारखा वाटतो. प्रत्येक जिवंत गोष्टीतून एक एकच धागा वाहत आहे — विद्युत, श्वास, ऊर्जा यांचा प्रवाह. काही परंपरांनी त्याला श्वास म्हटले. काहींनी प्रवाह म्हटले. या दाव्याची धाडसी वैज्ञानिक आवृत्ती म्हणते की ती सर्व नावे एकाच खऱ्या गोष्टीकडे बोट दाखवतात, आणि आपण ती शोधू शकतो."],

["s03", quote('"And here, the dream and the lab almost meet."', ""),
 "And here, finally, the dream and the laboratory almost meet. Because this third claim is the one of our three that comes closest to surviving. Some of its readings really do hold up to the test — and one of the parts that survives is, in its own quiet way, more astonishing than any of the parts we have so far seen.",
 "आणि इथे, अखेर, स्वप्न आणि प्रयोगशाळा जवळजवळ भेटतात. कारण हा तिसरा दावा आपल्या तिघांपैकी एक आहे जो टिकण्याच्या सर्वात जवळ येतो. त्याची काही वाचने खरोखर चाचणीला टिकतात — आणि टिकणाऱ्या भागांपैकी एक, स्वतःच्या शांत मार्गाने, आपण आत्तापर्यंत पाहिलेल्या कोणत्याही भागापेक्षा अधिक चकित करणारा आहे."],

["s04", title("THE MOLECULE", "ATP — life's pocket cash", "#f9e2af", 100),
 "To test the claim, we have to know what life actually runs on. And life runs on a single molecule, used by every cell of every organism we have ever looked inside of. It is called ATP — adenosine triphosphate — and it is, essentially, life's pocket cash.",
 "दावा तपासण्यासाठी, जीवन प्रत्यक्षात कशावर चालते हे आपल्याला माहीत असले पाहिजे. आणि जीवन एका रेणूवर चालते, जो आपण आत पाहिलेल्या प्रत्येक जीवाच्या प्रत्येक पेशीने वापरला आहे. त्याला ATP म्हणतात — अॅडेनोसिन ट्रायफॉस्फेट — आणि तो, मुख्यतः, जीवनाची खिशातील रोकड आहे."],

["s05", quote('"Every breath. Every thought. Every heartbeat."', ""),
 "Every time your heart beats, ATP. Every time a neuron fires in your brain, ATP. Every time your immune system stitches together a wound, ATP. Every time the bacterium in your gut digests a sandwich, ATP. Every time a tree in a forest lifts water from a root to a leaf — ATP. The whole tree of life burns the same coin, in the same denomination.",
 "तुमचे हृदय प्रत्येक वेळी धडकते तेव्हा, ATP. तुमच्या मेंदूतील एक न्यूरॉन प्रत्येक वेळी जळतो तेव्हा, ATP. तुमची प्रतिकारशक्ती जखम जोडते तेव्हा, ATP. तुमच्या आतड्यातील जीवाणू सँडविच पचवतो तेव्हा, ATP. जंगलातील झाड मुळातून पानांपर्यंत पाणी उचलते तेव्हा — ATP. जीवनाचे संपूर्ण वृक्ष एकच नाणे, एकाच मूल्यात जाळते."],

["s06", title("HOW", "the proton gradient", "#3b82f6", 116),
 "And how does a cell make this coin? Through one of the strangest and most beautiful mechanisms in all of biology, discovered by a quiet British biochemist named Peter Mitchell in nineteen-sixty-one. Mitchell proposed that cells make ATP not by chemistry alone, but by pumping protons across a membrane.",
 "आणि पेशी हे नाणे कसे बनवते? जीवशास्त्रातील सर्वात विचित्र आणि सर्वात सुंदर यंत्रणांपैकी एकाद्वारे, पीटर मिशेल नावाच्या एका शांत ब्रिटिश जैवरसायनशास्त्रज्ञाने एकोणीसशे एकसष्ट साली शोधलेली. मिशेलने मांडले की पेशी ATP केवळ रसायनशास्त्राने बनवत नाहीत, तर पडद्याच्या आरपार प्रोटॉन उपसून बनवतात."],

["s07", membrane(),
 "Picture a tiny membrane inside one of your cells. On one side of it, your cell pumps protons — hydrogen ions, the smallest positive particles in chemistry — until there are many more on one side than the other. That difference, that lopsidedness, stores energy, the way water stored behind a dam stores energy. Then the cell lets the protons flow back, through a tiny molecular turbine, and the turbine spins and stitches ATP together. A microscopic hydroelectric dam.",
 "तुमच्या एका पेशीच्या आत एक लहान पडदा कल्पना. त्याच्या एका बाजूला, तुमची पेशी प्रोटॉन उपसते — हायड्रोजन आयन, रसायनशास्त्रातील सर्वात लहान धन कण — एका बाजूला दुसऱ्यापेक्षा खूप जास्त होईपर्यंत. तो फरक, ती असमतोलता, ऊर्जा साठवते, धरणामागे साठलेले पाणी ऊर्जा साठवते तसे. मग पेशी प्रोटॉनना परत वाहू देते, एका लहान आण्विक टर्बाइनमधून, आणि टर्बाइन फिरते आणि ATP जोडते. एक सूक्ष्म जलविद्युत धरण."],

["s08", pmfFormula(),
 "Mitchell wrote it down as a single equation, which became known as the proton-motive force. It says: the energy in the gradient equals the voltage difference across the membrane plus the pH difference across the membrane, weighted by a tiny conversion factor of fifty-nine millivolts per pH unit at body temperature. That little number, fifty-nine, comes from the same Nernst arithmetic that runs every battery on Earth.",
 "मिशेलने ते एका समीकरणात लिहिले, जे प्रोटॉन-मोटिव्ह फोर्स म्हणून ओळखले जाऊ लागले. ते म्हणते: गुरुत्वातील ऊर्जा म्हणजे पडद्याच्या आरपार व्होल्टेज फरक अधिक पडद्याच्या आरपार pH फरक, शरीराच्या तापमानावर प्रति pH एकक एकोणसाठ मिलीव्होल्ट या लहान रूपांतर घटकाने वजन केलेले. तो छोटा आकडा, एकोणसाठ, पृथ्वीवरील प्रत्येक बॅटरी चालवणाऱ्या त्याच नर्न्स्ट गणितातून येतो."],

["s09", quote('"For this work, the Nobel Prize, 1978."', ""),
 "Mitchell's idea was, at first, dismissed as fanciful. Then, slowly, the evidence came in. By the nineteen-seventies, every cell biologist on Earth was forced to admit that the proton gradient really was how it worked. In nineteen-seventy-eight, Mitchell received the Nobel Prize in Chemistry, alone. And the proton-motive force is now in every textbook of biochemistry, on every continent.",
 "मिशेलची कल्पना सुरुवातीला कल्पनारम्य म्हणून फेटाळली गेली. मग, हळूहळू, पुरावे आले. एकोणीसशे सत्तरच्या दशकापर्यंत, पृथ्वीवरील प्रत्येक पेशी-जीवशास्त्रज्ञाला मान्य करावे लागले की प्रोटॉन ग्रेडियंट खरोखर कसे चालते ते आहे. एकोणीसशे अठ्ठ्याहत्तर साली, मिशेलला रसायनशास्त्रातील नोबेल पारितोषिक मिळाले, एकट्याला. आणि प्रोटॉन-मोटिव्ह फोर्स आता प्रत्येक खंडावरील जैवरसायनशास्त्राच्या प्रत्येक पाठ्यपुस्तकात आहे."],

["s10", lucaTree(),
 "And here is the truly astonishing part. Every cell ever studied — bacteria, archaea, plants, fungi, you — uses some version of this same proton-gradient machinery. Three-and-a-half billion years ago, the very first common ancestor of every living thing on this planet — biologists call it LUCA — almost certainly was already making ATP this way. The mechanism is older than animals. Older than plants. Older than oxygen. It is, in the deepest possible sense, what life is.",
 "आणि इथे आहे खरोखर चकित करणारा भाग. आत्तापर्यंत अभ्यासलेली प्रत्येक पेशी — जीवाणू, आर्किया, वनस्पती, बुरशी, तुम्ही — याच प्रोटॉन-ग्रेडियंट यंत्रणेची काही ना काही आवृत्ती वापरते. साडे-तीन अब्ज वर्षांपूर्वी, या ग्रहावरील प्रत्येक जिवंत गोष्टीचा सर्वात पहिला सामायिक पूर्वज — जीवशास्त्रज्ञ त्याला LUCA म्हणतात — जवळजवळ निश्चितच आधीच अशा प्रकारे ATP बनवत होता. यंत्रणा प्राण्यांपेक्षा जुनी आहे. वनस्पतींपेक्षा जुनी. ऑक्सिजनपेक्षा जुनी. ती, सर्वात खोल अर्थाने, जीवन काय आहे ते आहे."],

["s11", title("READING A", "the proton gradient", "#3b82f6", 108),
 "So reading A of the third claim — that there really is a single, deep mechanism that all known life shares, and that mechanism is a proton gradient — is supported by every biology lab in the world. Class B. Maybe one of the cleanest Bs in this entire film. The deepest reading of the breath-of-life claim survives, and survives well.",
 "म्हणून तिसऱ्या दाव्याचे वाचन A — की खरोखर सर्व ज्ञात जीवन सामायिक करते अशी एक एकल, खोल यंत्रणा आहे, आणि ती यंत्रणा एक प्रोटॉन ग्रेडियंट आहे — जगातील प्रत्येक जीवशास्त्र प्रयोगशाळेने समर्थित आहे. वर्ग B. कदाचित या संपूर्ण चित्रपटातील सर्वात स्वच्छ B पैकी एक. श्वास-जीवन दाव्याचे सर्वात खोल वाचन टिकते, आणि चांगले टिकते."],

["s12", title("READING B", "oxygen makes it efficient", "#3b82f6", 88),
 "Now the readings about oxygen. Reading B says that oxygen, specifically, is what makes the breath of life so efficient and so vivid. And — narrowly — this one is also true.",
 "आता ऑक्सिजनबद्दलची वाचने. वाचन B म्हणते की ऑक्सिजन, विशेषतः, जीवनाचा श्वास इतका कार्यक्षम आणि इतका स्पष्ट बनवते. आणि — संकुचितपणे — हेही खरे आहे."],

["s13", quote('"+0.82 volts of pull"', "oxygen's reduction potential"),
 "When the proton gradient drives the turbine and ATP is built, the cell needs somewhere to dump the spent electrons at the end. Oxygen is exceptionally good at receiving them — it pulls on electrons with a force we measure as plus-zero-point-eight-two volts, the highest pull biology has ever found in a routinely-available molecule. The result is a metabolism roughly ten times more efficient than anything that does not use oxygen. That is why animals exist. That is why brains exist. That is why you are sitting here, breathing.",
 "जेव्हा प्रोटॉन ग्रेडियंट टर्बाइन चालवतो आणि ATP बनवली जाते, तेव्हा पेशीला शेवटी खर्च झालेले इलेक्ट्रॉन कुठेतरी टाकायला हवे. ऑक्सिजन ते स्वीकारण्यात अपवादात्मकपणे चांगला आहे — तो इलेक्ट्रॉनना धन-शून्य-पूर्णांक-आठ-दोन व्होल्ट इतक्या बलाने ओढतो, जैविकशास्त्राने एका नियमितपणे उपलब्ध रेणूत आढळलेले सर्वोच्च खेच. परिणाम म्हणजे ऑक्सिजन न वापरणाऱ्या कोणत्याही गोष्टीपेक्षा सुमारे दहा पट अधिक कार्यक्षम चयापचय. म्हणून प्राणी अस्तित्वात आहेत. म्हणून मेंदू अस्तित्वात आहेत. म्हणून तुम्ही इथे बसून श्वास घेत आहात."],

["s14", statement(["Oxygen is the best.", "But best", "is not the same as only."], "#3b82f6"),
 "But — and this is the important word — best is not the same as only. The third claim, in its bold form, did not just say oxygen is the best fuel for the engine. It said oxygen is the engine. It said no oxygen, no life. And here, as in our other two claims, the bold version is making a much stronger promise than the careful one. So we have to test those, separately, before we celebrate.",
 "पण — आणि हा महत्त्वाचा शब्द आहे — सर्वोत्तम म्हणजे एकमेव नाही. तिसरा दावा, त्याच्या धाडसी रूपात, फक्त 'ऑक्सिजन इंजिनसाठी सर्वोत्तम इंधन आहे' म्हटले नाही. तो म्हणाला 'ऑक्सिजन हे इंजिनच आहे'. तो म्हणाला 'ऑक्सिजन नाही, तर जीवन नाही'. आणि इथे, आपल्या इतर दोन दाव्यांप्रमाणे, धाडसी आवृत्ती काळजीपूर्वक आवृत्तीपेक्षा अधिक मजबूत वचन देत आहे. म्हणून आपण साजरे करण्यापूर्वी, त्यांची स्वतंत्र चाचणी घेणे आवश्यक आहे."],

["s15", title("READING C", "is oxygen REQUIRED?", "#f85149", 92),
 "Reading C, the strong oxygen reading, says no life can exist without oxygen. None. Anywhere. And this is the one place in the third claim where the discipline is forced to be the strictest, because the evidence here is, by now, overwhelming, and it points the other way.",
 "वाचन C, मजबूत ऑक्सिजन वाचन, म्हणते की ऑक्सिजनशिवाय कोणतेही जीवन अस्तित्वात असू शकत नाही. कुठेही. आणि तिसऱ्या दाव्यात हे एकमेव ठिकाण आहे जिथे शिस्तीला सर्वात कडक असावे लागते, कारण इथला पुरावा, आत्तापर्यंत, भरपूर आहे, आणि तो दुसऱ्या बाजूला बोट दाखवतो."],

["s16", metabolicMenu(),
 "Look at the menu life actually runs on. Animals like us breathe oxygen. But sulfate-reducing bacteria in deep ocean mud breathe sulfate. Nitrate-reducing bacteria in soil breathe nitrate. Iron-reducing bacteria breathe iron. Methanogens in swamps and your gut breathe carbon dioxide. Yeast in a sealed jar ferment — they need no electron acceptor at all. Every one of these makes ATP, with a proton gradient, just like you do. And not one of them uses oxygen.",
 "जीवन प्रत्यक्षात कोणत्या मेनूवर चालते ते पहा. आपल्यासारखे प्राणी ऑक्सिजन घेतात. पण खोल समुद्राच्या चिखलातील सल्फेट-कमी करणारे जीवाणू सल्फेट घेतात. मातीतील नायट्रेट-कमी करणारे जीवाणू नायट्रेट घेतात. लोह-कमी करणारे जीवाणू लोह घेतात. दलदलीतील आणि तुमच्या आतड्यातील मिथेनोजेन्स कार्बन डायऑक्साइड घेतात. बंद भांड्यातील यीस्ट किण्वन करतात — त्यांना इलेक्ट्रॉन स्वीकारणाऱ्याची मुळीच गरज नाही. यापैकी प्रत्येक ATP बनवतो, प्रोटॉन ग्रेडियंटसह, तुमच्याप्रमाणेच. आणि त्यांच्यापैकी कोणीही ऑक्सिजन वापरत नाही."],

["s17", statement(["Oxygen is one menu item.", "Life has six.", "Reading C — contradicted."], "#f85149"),
 "And — as we saw in segment two — life on Earth had already been thriving for at least a billion years before there was any meaningful oxygen in the atmosphere at all. The proton-gradient engine was running long before oxygen was invented as a fuel. Reading C, the bold one — life requires oxygen — is, by the kingdoms of life themselves, contradicted. Class X.",
 "आणि — दुसऱ्या भागात आपण पाहिले — पृथ्वीवरील जीवन वातावरणात कोणताही अर्थपूर्ण ऑक्सिजन येण्याआधी किमान एक अब्ज वर्षे भरभराटीत होते. ऑक्सिजन इंधन म्हणून शोधले जाण्याच्या खूप आधी प्रोटॉन-ग्रेडियंट इंजिन चालू होते. वाचन C, धाडसी एक — जीवनाला ऑक्सिजन आवश्यक आहे — जीवनाच्या राज्यांनी स्वतःच खोडलेले आहे. वर्ग X."],

["s18", title("READING D", "every life uses a gradient?", "#d29922", 88),
 "Then there is reading D, the deepest and trickiest reading of the third claim. It says every form of life everywhere uses a proton gradient. Every. Form. Everywhere. And here the answer is more humble than the question. We can only honestly speak about the forms of life we have looked at — which is the life on this one small planet. About life elsewhere in the universe, we know nothing yet. So we narrow the claim. The claim becomes: every form of life on Earth that we have examined uses some version of a proton gradient — and in that careful, narrowed form, the answer holds.",
 "मग वाचन D आहे, तिसऱ्या दाव्याचे सर्वात खोल आणि सर्वात अवघड वाचन. ते म्हणते सर्वत्र प्रत्येक जीवनाचा प्रकार प्रोटॉन ग्रेडियंट वापरतो. प्रत्येक. प्रकार. सर्वत्र. आणि इथे उत्तर प्रश्नापेक्षा अधिक नम्र आहे. आपण फक्त ज्या जीवनाच्या प्रकारांकडे पाहिले आहे त्याबद्दलच प्रामाणिकपणे बोलू शकतो — जे या एका लहान ग्रहावरील जीवन आहे. विश्वात इतरत्र जीवनाबद्दल, आम्हाला अद्याप काहीही माहीत नाही. म्हणून आपण दावा संकुचित करतो. दावा बनतो: पृथ्वीवरील आपण तपासलेले जीवनाचे प्रत्येक रूप प्रोटॉन ग्रेडियंटची काही ना काही आवृत्ती वापरते — आणि त्या काळजीपूर्वक, संकुचित स्वरूपात, उत्तर टिकते."],

["s19", quote('"Class C — a structured hypothesis."', ""),
 "We mark this as a Class C result — a structured hypothesis. The pattern is real, the data is strong, the universality may yet be true. But the universe is large, and we have not finished looking. We let the claim live in this narrowed form, where it can keep guiding our search and our wonder, while it waits for the wider evidence to come in.",
 "आपण याला वर्ग C परिणाम म्हणून खुणावतो — एक रचनात्मक गृहीतक. नमुना खरा आहे, माहिती मजबूत आहे, सार्वत्रिकता अद्याप खरी असू शकते. पण विश्व मोठे आहे, आणि आपण पाहणे संपवलेले नाही. आपण दाव्याला या संकुचित स्वरूपात जगू देतो, जिथे तो आपला शोध आणि आश्चर्य मार्गदर्शन करत राहू शकतो, व्यापक पुरावे येण्याची वाट पाहत."],

["s20", title("READING E", "life as a sacred current", "#a371f7", 92),
 "And finally reading E — the most poetic of all five. The breath of life as a sacred current, a single living force, the breath of the universe moving through each of us in turn. As metaphor, as orientation, as the language a human being uses for the awe of being alive — this reading is preserved, completely, and with respect.",
 "आणि शेवटी वाचन E — पाचांपैकी सर्वात काव्यमय. जीवनाचा श्वास एक पवित्र प्रवाह म्हणून, एक एकल जिवंत शक्ती, विश्वाचा श्वास आपल्यापैकी प्रत्येकामधून येऊन जाणारा. रूपक म्हणून, दिशा म्हणून, जिवंत असण्याच्या आदरासाठी मनुष्य वापरतो ती भाषा म्हणून — हे वाचन पूर्णतः जपले जाते, आणि आदराने."],

["s21", statement(["A real engine.", "A real ancestor.", "A real shared inheritance."], "#a371f7"),
 "And what gives this metaphor more grace than most is that the underlying science is unusually close to it. There really is a single mechanism in every living thing we have looked at. There really was a single common ancestor. There really is, in a perfectly literal scientific sense, a shared inheritance running through every cell on Earth. The poetry is not refuted by the laboratory. The poetry is, in this rare case, almost reading the same paragraph the laboratory is reading.",
 "आणि या रूपकाला बहुतेक रूपकांपेक्षा अधिक कृपा देणारी गोष्ट म्हणजे त्याखालील विज्ञान त्याच्या असामान्यपणे जवळ आहे. आपण पाहिलेल्या प्रत्येक जिवंत गोष्टीत खरोखर एक एकल यंत्रणा आहे. खरोखर एक एकल सामायिक पूर्वज होता. खरोखर, अगदी शाब्दिक वैज्ञानिक अर्थाने, पृथ्वीवरील प्रत्येक पेशीतून जाणारा एक सामायिक वारसा आहे. कवितेचे प्रयोगशाळेने खंडन केले जात नाही. कविता, या दुर्मिळ प्रसंगी, प्रयोगशाळा वाचत आहे तोच परिच्छेद जवळजवळ वाचत आहे."],

["s22", verdictTable(),
 "So here is the honest accounting of the breath-of-life claim. Reading A, that a single proton-gradient engine powers all known life, is supported — Class B. Reading B, that oxygen makes that engine efficient, is supported — also Class B. Reading C, that oxygen is required, is contradicted — Class X. Reading D, that all life everywhere uses a gradient, lives as a narrowed hypothesis — Class C. And reading E, the sacred current, is preserved as metaphor — Class D. Two clear yeses, one clear no, one disciplined maybe, and one beautiful image, the most beautiful one our discipline has yet allowed us to keep.",
 "तर हे आहे जीवन-श्वास दाव्याचे प्रामाणिक हिशोब. वाचन A, सर्व ज्ञात जीवनाला एक प्रोटॉन-ग्रेडियंट इंजिन शक्ती देते, समर्थित आहे — वर्ग B. वाचन B, ऑक्सिजन त्या इंजिनला कार्यक्षम बनवते, समर्थित आहे — तेही वर्ग B. वाचन C, ऑक्सिजन आवश्यक आहे, खोडलेले आहे — वर्ग X. वाचन D, सर्वत्र सर्व जीवन ग्रेडियंट वापरते, संकुचित गृहीतक म्हणून जगते — वर्ग C. आणि वाचन E, पवित्र प्रवाह, रूपक म्हणून जपलेला — वर्ग D. दोन स्पष्ट 'होय', एक स्पष्ट 'नाही', एक शिस्तबद्ध 'कदाचित', आणि एक सुंदर प्रतिमा, आपल्या शिस्तीने आपल्याला आत्तापर्यंत ठेवू दिलेली सर्वात सुंदर."],

["s23", title("THE LITERAL", "and the metaphorical agreed", "#a6e3a1", 88),
 "Notice what is unusual here. In segments two and three, we let go of the boldest reading of each claim — ozone is not life, pressure is not weight. Here, in segment four, the boldest reading we could honestly hope for has survived, in its narrowed form. The literal and the metaphorical are almost shaking hands. There is a single thread running through everything that lives on Earth. We have found it. We can name it. The poem is, in this one case, also the chemistry.",
 "इथे काय असामान्य आहे ते लक्षात घ्या. दुसऱ्या आणि तिसऱ्या भागांत, आपण प्रत्येक दाव्याच्या सर्वात धाडसी वाचनाला जाऊ दिले — ओझोन हे जीवन नाही, दाब हे वजन नाही. इथे, चौथ्या भागात, आपण प्रामाणिकपणे आशा करू शकतो ते सर्वात धाडसी वाचन, त्याच्या संकुचित स्वरूपात, टिकले आहे. शाब्दिक आणि रूपक जवळजवळ हस्तांदोलन करत आहेत. पृथ्वीवर जगणाऱ्या प्रत्येक गोष्टीतून एक एकल धागा वाहत आहे. आपण तो शोधला. आपण त्याला नाव देऊ शकतो. कविता, या एका प्रसंगी, रसायनशास्त्रही आहे."],

["s24", quote('"Three claims. Three honest hearings. One film."', ""),
 "And with that, all three of the bold claims have had their hearing. The sky's shield got a careful, mixed verdict. The weight of worlds got a clear no. The breath of life got the closest thing to a yes any bold claim is ever going to get from a discipline this strict. Different verdicts. Same kindness. Same arithmetic. Same respect — paid to the dreamer at the start, and to the universe at the end.",
 "आणि त्यासह, तिन्ही धाडसी दाव्यांची सुनावणी झाली. आकाशाच्या कवचाला काळजीपूर्वक, मिश्र निर्णय मिळाला. जगांच्या वजनाला स्पष्ट 'नाही' मिळाला. जीवनाच्या श्वासाला इतक्या कडक शिस्तीतून कोणताही धाडसी दावा मिळवू शकेल त्या 'होय'च्या सर्वात जवळची गोष्ट मिळाली. वेगवेगळे निर्णय. तीच दया. तेच गणित. तोच आदर — सुरुवातीला स्वप्न पाहणाऱ्याला, आणि शेवटी विश्वाला दिलेला."],

["s25", title("NEXT", "The Honest Gift", "#89b4fa", 92),
 "There is one segment left. Not to test another claim — we are done testing — but to gather what survived, look honestly at what did not, and ask what all of this has been for. It is called The Honest Gift, and it is the one segment of this film that is mostly about us. Stay for it. We have come a long way together to get there.",
 "एक भाग बाकी आहे. आणखी एक दावा तपासायचा नाही — आपली चाचणी संपली — तर जे टिकले ते एकत्र करायचे, जे टिकले नाही ते प्रामाणिकपणे पाहायचे, आणि हे सर्व कशासाठी होते ते विचारायचे. त्याचे नाव आहे प्रामाणिक भेट, आणि या चित्रपटाचा हा एकमेव भाग आहे जो बहुतेक आपल्याबद्दल आहे. त्यासाठी थांबा. आपण तिथे पोहोचण्यासाठी एकत्र खूप लांब आलो आहोत."],

["s26", title("TRAVELERS", "two yeses, two nos, two preserved", "#89b4fa", 130),
 "People must see to learn, and learn to see. Three claims have had their hearings. The honest gift is just ahead.",
 "शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे. तीन दाव्यांची सुनावणी झाली. प्रामाणिक भेट पुढेच आहे."],
];

L.writeScenes(S, SVG_DIR, CUES, "seg4");
