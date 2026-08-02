// SEGMENT 5: THE HONEST GIFT — synthesis, meaning, close.
// Run: node build_seg5.js
const path = require("path");
const L = require("./scene_lib.js");
const { title, quote, statement, claimCard, bg, nbg, STARS, esc } = L;
const SVG_DIR = path.join(__dirname, "..", "svg");
const CUES = path.join(__dirname, "..", "script", "segment_05_cues.json");

function fullVerdictTable() {
  const rows = [
    ["Sky's shield: ozone is alive",          "X", "#f85149", "contradicted"],
    ["Sky's shield: required for all life",   "X", "#f85149", "contradicted"],
    ["Sky's shield: protects modern Earth",   "B", "#3b82f6", "supported"],
    ["Sky's shield: ozone as biosignature",   "C", "#d29922", "narrowed hypothesis"],
    ["Sky's shield: breath of a living world", "D", "#a371f7", "metaphor preserved"],
    ["Weight: pressure replaces gravity",     "X", "#f85149", "contradicted"],
    ["Weight: air pressure is real",          "B", "#3b82f6", "supported"],
    ["Breath: proton gradient powers life",   "B", "#3b82f6", "supported"],
    ["Breath: oxygen makes it efficient",     "B", "#3b82f6", "supported"],
    ["Breath: oxygen required for all life",  "X", "#f85149", "contradicted"],
    ["Breath: all life uses a gradient",      "C", "#d29922", "narrowed hypothesis"],
    ["Breath: a sacred current",              "D", "#a371f7", "metaphor preserved"],
  ];
  const head = `<text x="200" y="170" fill="#6c7393" font-size="20" font-family="ui-monospace,Consolas,monospace">READING</text>
    <text x="1700" y="170" text-anchor="end" fill="#6c7393" font-size="20" font-family="ui-monospace,Consolas,monospace">VERDICT</text>`;
  const body = rows.map((r, i) => {
    const y = 215 + i * 42;
    const txtFill = (r[1] === "X" || r[1] === "B" || r[1] === "D") ? "#fff" : "#0b0e12";
    return `<text x="200" y="${y}" fill="#e6edf3" font-size="22" font-family="ui-sans-serif,sans-serif">${r[0]}</text>
    <rect x="1340" y="${y - 22}" width="46" height="32" rx="5" fill="${r[2]}"/>
    <text x="1363" y="${y}" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="20" font-weight="bold" fill="${txtFill}">${r[1]}</text>
    <text x="1700" y="${y}" text-anchor="end" fill="${r[2]}" font-size="20" font-family="ui-sans-serif,sans-serif">${r[3]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="110" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">the full ledger — twelve readings, twelve honest verdicts</text>
  ${head}
  <line x1="180" y1="185" x2="1720" y2="185" stroke="#30363d" stroke-width="2"/>
    ${body}
  <line x1="180" y1="${215 + rows.length * 42 - 22}" x2="1720" y2="${215 + rows.length * 42 - 22}" stroke="#30363d" stroke-width="2"/>`;
}

function survivedColumn() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">what survived — what we keep, with both hands</text>
  <g font-family="ui-sans-serif,'Segoe UI',sans-serif">
    <rect x="240" y="220" width="1440" height="80" rx="12" fill="#1c2128" stroke="#3b82f6" stroke-width="2"/>
    <text x="280" y="272" font-size="30" fill="#3b82f6" font-weight="bold">B</text>
    <text x="360" y="272" font-size="30" fill="#e6edf3">Ozone shields modern Earth's surface from lethal UV.</text>

    <rect x="240" y="320" width="1440" height="80" rx="12" fill="#1c2128" stroke="#3b82f6" stroke-width="2"/>
    <text x="280" y="372" font-size="30" fill="#3b82f6" font-weight="bold">B</text>
    <text x="360" y="372" font-size="30" fill="#e6edf3">Atmospheric pressure is real — 14.7 psi, isotropic.</text>

    <rect x="240" y="420" width="1440" height="80" rx="12" fill="#1c2128" stroke="#3b82f6" stroke-width="2"/>
    <text x="280" y="472" font-size="30" fill="#3b82f6" font-weight="bold">B</text>
    <text x="360" y="472" font-size="30" fill="#e6edf3">A single proton-gradient engine powers all known life.</text>

    <rect x="240" y="520" width="1440" height="80" rx="12" fill="#1c2128" stroke="#3b82f6" stroke-width="2"/>
    <text x="280" y="572" font-size="30" fill="#3b82f6" font-weight="bold">B</text>
    <text x="360" y="572" font-size="30" fill="#e6edf3">Oxygen makes that engine remarkably efficient.</text>
  </g>`;
}

function letGoColumn() {
  return `${bg(nbg(), "#1a1822", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">what we let go — gently, without shame</text>
  <g font-family="ui-sans-serif,'Segoe UI',sans-serif">
    <rect x="240" y="220" width="1440" height="80" rx="12" fill="#1c2128" stroke="#f85149" stroke-width="2"/>
    <text x="280" y="272" font-size="30" fill="#f85149" font-weight="bold">X</text>
    <text x="360" y="272" font-size="28" fill="#cdd6f4">Ozone is alive, or required for all life</text>

    <rect x="240" y="320" width="1440" height="80" rx="12" fill="#1c2128" stroke="#f85149" stroke-width="2"/>
    <text x="280" y="372" font-size="30" fill="#f85149" font-weight="bold">X</text>
    <text x="360" y="372" font-size="28" fill="#cdd6f4">Air pressure replaces gravity</text>

    <rect x="240" y="420" width="1440" height="80" rx="12" fill="#1c2128" stroke="#f85149" stroke-width="2"/>
    <text x="280" y="472" font-size="30" fill="#f85149" font-weight="bold">X</text>
    <text x="360" y="472" font-size="28" fill="#cdd6f4">Oxygen is required for all life</text>
  </g>
  <text x="960" y="640" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#9aa7b4" font-style="italic">Three real claims. Three honest "no"s. Each one knowledge.</text>`;
}

function metaphors() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="130" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="36" fill="#9aa7b4" letter-spacing="3">what we preserve as metaphor — with respect</text>
  <g font-family="Georgia,serif">
    <rect x="240" y="220" width="1440" height="100" rx="14" fill="#1c2128" stroke="#a371f7" stroke-width="2"/>
    <text x="290" y="288" font-size="34" fill="#a371f7" font-weight="bold">D</text>
    <text x="370" y="288" font-size="32" fill="#cdd6f4" font-style="italic">"the breath of a living world"</text>

    <rect x="240" y="350" width="1440" height="100" rx="14" fill="#1c2128" stroke="#a371f7" stroke-width="2"/>
    <text x="290" y="418" font-size="34" fill="#a371f7" font-weight="bold">D</text>
    <text x="370" y="418" font-size="32" fill="#cdd6f4" font-style="italic">"a single thread running through everything alive"</text>

    <rect x="240" y="480" width="1440" height="100" rx="14" fill="#1c2128" stroke="#a371f7" stroke-width="2"/>
    <text x="290" y="548" font-size="34" fill="#a371f7" font-weight="bold">D</text>
    <text x="370" y="548" font-size="32" fill="#cdd6f4" font-style="italic">"life is made of travelers"</text>
  </g>
  <text x="960" y="650" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="26" fill="#6c7393">these are not failed science. they are language doing its honest work.</text>`;
}

function ladderRecap() {
  const rows = [
    ["A", "established / derivable",         "#2ea043", "the gravity equation, Beer–Lambert, the Nernst factor"],
    ["B", "supported by mainstream evidence","#3b82f6", "ozone shield, proton gradient, atmospheric pressure as a force"],
    ["C", "structured hypothesis",            "#d29922", "narrow biosignature inference; all-life-uses-a-gradient"],
    ["D", "interpretive synthesis",           "#a371f7", "the breath of life, the sacred current — preserved metaphor"],
    ["U", "speculative / unsupported",        "#8b949e", "none we claimed in this film"],
    ["X", "contradicted by test",             "#f85149", "ozone as life; pressure as weight; oxygen as required for all life"],
  ];
  const body = rows.map((r, i) => {
    const y = 240 + i * 76;
    return `<rect x="200" y="${y - 38}" width="68" height="60" rx="10" fill="${r[2]}"/>
    <text x="234" y="${y - 3}" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="34" font-weight="bold" fill="#0b0e12">${r[0]}</text>
    <text x="300" y="${y - 3}" font-family="ui-sans-serif,sans-serif" font-size="30" fill="#cdd6f4">${r[1]}</text>
    <text x="900" y="${y - 3}" font-family="ui-sans-serif,sans-serif" font-size="22" fill="#6c7393">${r[3]}</text>`;
  }).join("\n    ");
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <text x="960" y="140" text-anchor="middle" font-family="ui-sans-serif,sans-serif" font-size="32" fill="#9aa7b4" letter-spacing="3">the six honest labels — one final look</text>
    ${body}`;
}

function star() {
  return `${bg(nbg(), "#11151f", "#0b0e14")}${STARS}
  <g transform="translate(960,360)" opacity="0.85">
    <circle r="20" fill="#f9e2af"/>
    <circle r="60" fill="none" stroke="#f9e2af" stroke-width="1.5" opacity="0.4"/>
    <circle r="110" fill="none" stroke="#f9e2af" stroke-width="1" opacity="0.25"/>
    <circle r="180" fill="none" stroke="#f9e2af" stroke-width="1" opacity="0.15"/>
  </g>`;
}

function horizonClose() {
  return `${bg(nbg(), "#1a1822", "#0b0e14")}${STARS}
  <ellipse cx="960" cy="640" rx="1200" ry="100" fill="#f9e2af" opacity="0.08"/>
  <ellipse cx="960" cy="640" rx="800" ry="50" fill="#fab387" opacity="0.10"/>
  <g fill="#6c7393" opacity="0.7">
    <circle cx="380" cy="558" r="6"/><rect x="378" y="564" width="4" height="22" rx="2"/>
    <circle cx="560" cy="548" r="7"/><rect x="557" y="555" width="6" height="26" rx="2"/>
    <circle cx="760" cy="566" r="6"/><rect x="758" y="572" width="4" height="22" rx="2"/>
    <circle cx="980" cy="543" r="8"/><rect x="976" y="551" width="8" height="28" rx="2"/>
    <circle cx="1180" cy="560" r="6"/><rect x="1178" y="566" width="4" height="22" rx="2"/>
    <circle cx="1380" cy="550" r="7"/><rect x="1377" y="557" width="6" height="26" rx="2"/>
  </g>`;
}

// ---- SCENES ----
const S = [
["s01", title("SEGMENT FIVE", "The Honest Gift", "#89b4fa", 96),
 "We have come a long way together. Four segments. Three claims. Five honest labels in active use. Hours of patient, careful arithmetic, all of it for one purpose: to take a hopeful idea, honor it, and then walk it gently through the discipline of looking. Now we sit down. We gather what survived. We look at what did not. And we ask, very softly, what all of that has been for.",
 "आपण एकत्र खूप लांब आलो आहोत. चार भाग. तीन दावे. पाच प्रामाणिक खुणा कामात. तासन्तास धैर्यवान, काळजीपूर्वक गणित, हे सर्व एका हेतूसाठी: एक आशादायक कल्पना घेणे, तिचा सन्मान करणे, आणि मग पाहण्याच्या शिस्तीतून तिला सौम्यपणे चालवणे. आता आपण बसतो. जे टिकले ते एकत्र करतो. जे टिकले नाही ते पाहतो. आणि अगदी हळुवारपणे विचारतो, ते सर्व कशासाठी होते."],

["s02", fullVerdictTable(),
 "Here, in one place, is the full ledger. Twelve readings of three claims. Four reading the green-blue colour of supported within model. Three reading the red of contradicted by test. Two reading the gentle gold of narrowed hypothesis. And three reading the violet of metaphor preserved. No reading was promoted by certainty. No reading was demoted by scorn. Each one is here because the math said it could be here, exactly here, and nowhere else.",
 "इथे, एका ठिकाणी, संपूर्ण खातावही आहे. तीन दाव्यांची बारा वाचने. चार 'मॉडेलमध्ये समर्थित' च्या हिरव्या-निळ्या रंगाची. तीन 'चाचणीत खोडलेली' च्या लाल रंगाची. दोन 'संकुचित गृहीतक' च्या सौम्य सोनेरी रंगाची. आणि तीन 'रूपक जपलेले' च्या जांभळ्या रंगाची. कोणतेही वाचन निश्चिततेमुळे बढती मिळाली नाही. कोणतेही वाचन तिरस्कारामुळे खाली आणले गेले नाही. प्रत्येक इथे आहे कारण गणिताने सांगितले की ते इथे, नेमके इथे, असू शकते, आणि इतरत्र कुठेही नाही."],

["s03", survivedColumn(),
 "Begin with what survived. Ozone really does shield modern Earth's surface from lethal ultraviolet light. Atmospheric pressure really is a real, isotropic force, pressing on you with about fourteen-point-seven pounds per square inch from every direction. A single proton-gradient engine really does power every living cell we have ever looked inside of. And oxygen really does make that engine, for the creatures that can use it, remarkably efficient. Four real facts about our world. Each one earned. Each one ours.",
 "जे टिकले त्याने सुरुवात करा. ओझोन खरोखर आधुनिक पृथ्वीच्या पृष्ठभागाचे प्राणघातक अतिनील प्रकाशापासून रक्षण करते. वातावरणीय दाब खरोखर एक खरा, सर्व दिशांनी कार्यरत बल आहे, प्रत्येक दिशेने तुमच्यावर सुमारे साडे-चौदा पौंड प्रति चौरस इंच दाबणारा. एक प्रोटॉन-ग्रेडियंट इंजिन खरोखर आपण आत पाहिलेल्या प्रत्येक जिवंत पेशीला शक्ती देते. आणि ऑक्सिजन खरोखर ते इंजिन, ज्या जीवांना तो वापरता येतो त्यांच्यासाठी, उल्लेखनीयपणे कार्यक्षम बनवते. आपल्या जगाबद्दल चार खरी तथ्ये. प्रत्येक मिळवलेले. प्रत्येक आपले."],

["s04", letGoColumn(),
 "And here is what we let go of, on the way. The grandest reading of ozone — that it is life, or required for all life. The whole pressure-replaces-gravity claim. The strong reading of breath — that oxygen is required for any life anywhere. Three real claims. Three honest no's. Each of those no's, I want you to feel, is itself a kind of knowledge. It tells the next traveler, truthfully, where not to look — and so saves them the same years we just spent looking there.",
 "आणि वाटेत आपण काय सोडले ते इथे. ओझोनचे सर्वात भव्य वाचन — की ते जीवन आहे, किंवा सर्व जीवनासाठी आवश्यक. संपूर्ण दाब-गुरुत्वाकर्षण-बदलून-टाकतो दावा. श्वासाचे मजबूत वाचन — की कोणत्याही जीवनासाठी कुठेही ऑक्सिजन आवश्यक आहे. तीन खरे दावे. तीन प्रामाणिक 'नाही'. त्या प्रत्येक 'नाही' मध्ये, मला तुम्हाला जाणवायचे आहे, ते स्वतः एक प्रकारचे ज्ञान आहे. ते पुढच्या प्रवाशाला, खरेपणाने, कुठे पाहू नये ते सांगते — आणि म्हणून त्यांना आपण नुकत्याच तिथे पाहण्यात घालवलेल्या त्याच वर्षांची बचत करते."],

["s05", metaphors(),
 "And here is what we preserved, with respect. The breath of a living world. A single thread running through everything alive. Life made of travelers. These were never failed scientific claims. They were always — and they remain — language doing its honest work. They orient a human being toward something larger than themselves. They are not refuted by our table; they are not on the same map as our table. They run beside it, in their own language, with their own dignity.",
 "आणि इथे आदराने जपलेले आहे. एका जिवंत जगाचा श्वास. प्रत्येक जिवंत गोष्टीतून जाणारा एक धागा. प्रवाशांचे बनलेले जीवन. ही कधीही अपयशी वैज्ञानिक दावे नव्हते. ती नेहमीच होती — आणि ती आहेत — आपले प्रामाणिक काम करणारी भाषा. ती मनुष्याला स्वतःपेक्षा मोठ्या कशाकडे तरी दिशा देतात. आपल्या तक्त्याने त्यांचे खंडन केले जात नाही; ती आपल्या तक्त्याच्या त्याच नकाशावर नाहीत. ती त्याच्या शेजारी, स्वतःच्या भाषेत, स्वतःच्या प्रतिष्ठेने धावतात."],

["s06", title("THE GIFT", "is not the table", "#f9e2af", 100),
 "And I want you, here at the end of the film, to notice something — because if you do not, you will leave with the wrong gift. The honest gift of all of this is not the table. The table is the work. The gift is something else.",
 "आणि मला तुम्ही, चित्रपटाच्या शेवटी, काहीतरी लक्षात घ्यावे — कारण तसे न केले, तर तुम्ही चुकीची भेट घेऊन जाल. या सर्वांची प्रामाणिक भेट म्हणजे तक्ता नाही. तक्ता म्हणजे काम आहे. भेट काहीतरी वेगळी आहे."],

["s07", quote('"The gift is the way of looking."', ""),
 "The gift is the way of looking. It is the small, stubborn, humane discipline that lets a hopeful idea be tested without being humiliated, and lets a beautiful idea be wrong without being shamed. It is the practice of saying, out loud, how sure we are; of stating our bar before our run; of comparing to the best we already have; of believing the answer the math gives even when we wanted a different one. That is not a procedure. It is, in the deepest sense, a way of being.",
 "भेट म्हणजे पाहण्याची पद्धत. ती एक छोटी, हट्टी, मानवी शिस्त आहे जी आशादायक कल्पनेला अपमानित न करता तपासू देते, आणि सुंदर कल्पनेला लाजवल्याशिवाय चुकू देते. ती उघडपणे, आपण किती खात्रीशीर आहोत हे सांगण्याची प्रथा आहे; चाचणीआधी आपली रेषा सांगण्याची; आपल्याकडे आधीच असलेल्या सर्वोत्तमशी तुलना करण्याची; आपल्याला वेगळे उत्तर हवे असतानाही गणित देणारे उत्तर मानण्याची. ती प्रक्रिया नाही. ती, सर्वात खोल अर्थाने, असण्याचा एक मार्ग आहे."],

["s08", ladderRecap(),
 "Here are the six honest labels one more time. Notice — none of them is the word proven. We did not use it once in five segments and we will not use it now. Because nothing this large is ever proven, only supported by evidence, narrowed by hypothesis, preserved as metaphor, or contradicted by test. That single missing word — proven — is the small, quiet rebellion at the heart of this film. It is what makes everything else honest.",
 "इथे आहेत सहा प्रामाणिक खुणा एकदा पुन्हा. लक्षात घ्या — त्यापैकी कोणताही 'सिद्ध' हा शब्द नाही. आपण पाच भागांत तो एकदाही वापरला नाही आणि आता वापरणार नाही. कारण एवढी मोठी कोणतीही गोष्ट कधीही सिद्ध केली जात नाही, फक्त पुराव्यांनी समर्थित केली जाते, गृहीतकाने संकुचित केली जाते, रूपक म्हणून जपली जाते, किंवा चाचणीत खोडली जाते. तो एकच गहाळ शब्द — 'सिद्ध' — या चित्रपटाच्या केंद्रात एक छोटे, शांत बंड आहे. तेच बाकी सर्व काही प्रामाणिक बनवते."],

["s09", title("THIS WORLD", "is closer to midnight than to noon", "#f38ba8", 84),
 "And now, since we have come this far together, I want to speak to you for a moment about why we made this film at all — and what it has to do with the world we are all sharing tonight. Because the world we live in, just now, is closer to midnight than to noon. There is more weaponry, and more fear, and more shouting on the public square than there has been in any of our lifetimes.",
 "आणि आता, आपण इथपर्यंत एकत्र आलो आहोत म्हणून, मला तुम्हाला क्षणभर सांगायचे आहे की आपण हा चित्रपट का बनवला — आणि त्याचा आज रात्री आपण सर्व सामायिक करत असलेल्या जगाशी काय संबंध आहे. कारण आपण आत्ता जगतो ते जग दुपारपेक्षा मध्यरात्रीच्या जवळ आहे. आपल्यापैकी कोणाच्याही जीवनात कधीही नव्हते इतके शस्त्र, इतकी भीती, आणि सार्वजनिक चौकात इतके ओरडणे आहे."],

["s10", quote('"The cure for that is not louder shouting."', ""),
 "And I do not believe — and the discipline does not believe — that the cure for that is louder shouting on the other side. I believe the cure is small and quiet, and it lives inside each of us, and it is exactly what we have been practising for the last four segments. Hold a belief gently enough that evidence can move it. Let an opponent's claim, even one that seems frightening, be honored before it is tested. Let the math speak. Let our priors, when they are wrong, let go.",
 "आणि मला विश्वास नाही — आणि शिस्तीला विश्वास नाही — की त्यावर उपाय म्हणजे दुसऱ्या बाजूने अधिक मोठ्याने ओरडणे. मला विश्वास आहे की उपाय छोटा आणि शांत आहे, आणि तो आपल्यापैकी प्रत्येकाच्या आत राहतो, आणि नेमका तोच आहे जो आपण मागील चार भागांत अभ्यासत आलो आहोत. एखादी समजूत एवढी सौम्यपणे धरा की पुरावा तिला हलवू शकेल. एखाद्या प्रतिस्पर्ध्याचा दावा, अगदी भीतीदायक वाटला तरी, चाचणीआधी सन्मानित करू द्या. गणिताला बोलू द्या. आपले पूर्वग्रह, चुकीचे असतील तेव्हा, सोडून द्या."],

["s11", statement(["A safer world", "without war", "is not built by certainty.", "It is built by looking."], "#a6e3a1"),
 "A safer world without war is not built by certainty. It is not built by louder voices, or smarter slogans. It is built by the small, accumulated act of looking. By people who can ask, sincerely, what would have to be true for me to be wrong, and then go and find out. By people who can say I changed my mind, and feel that as a kind of pride rather than a kind of shame. That is the practice. That is the only one I know that genuinely scales.",
 "युद्धाशिवायचे सुरक्षित जग निश्चिततेने बांधले जात नाही. ते मोठ्या आवाजांनी किंवा हुशार घोषणांनी बांधले जात नाही. ते पाहण्याच्या छोट्या, साठलेल्या कृतीने बांधले जाते. प्रामाणिकपणे 'मी चुकीचा असण्यासाठी काय खरे असावे लागेल' विचारू शकणाऱ्या आणि मग जाऊन शोधणाऱ्या लोकांकडून. 'मी माझे मन बदलले' म्हणू शकणाऱ्या आणि ते लाजेऐवजी अभिमान म्हणून जाणवणाऱ्या लोकांकडून. हीच प्रथा आहे. खरोखर वाढू शकणारी मला माहीत असलेली ती एकमेव आहे."],

["s12", title("PEOPLE MUST SEE", "to learn, and learn to see", "#89b4fa", 70),
 "There is a phrase we have come back to, again and again, at the end of every segment. People must see to learn, and learn to see. I want to say it once more, here at the end, and tell you what we have come to mean by it. To learn is to be willing to look. To see is to be willing to recognize what we have looked at — including what we did not want to find.",
 "एक वाक्य आहे जे आपण प्रत्येक भागाच्या शेवटी, पुन्हा पुन्हा परत आलो. शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे. मला ते आता शेवटी एकदा पुन्हा सांगायचे आहे, आणि सांगायचे आहे की आपण त्याचा अर्थ काय आला आहे. शिकणे म्हणजे पाहण्यास तयार असणे. पाहणे म्हणजे आपण काय पाहिले ते ओळखण्यास तयार असणे — आपल्याला जे शोधायचे नव्हते तेही."],

["s13", quote('"To love the question more than the answer."', ""),
 "And the secret kindness inside all of it is this. To learn to see, in the way we have been describing for the last hour, is to love the question more than we love any particular answer we have managed to find. It is to stay in love with the world precisely because the world keeps surprising us. And that is not a sad practice. It is, I think, the most joyful practice a human mind can hold.",
 "आणि या सर्वांच्या आत असलेली गुप्त दया हीच आहे. गेल्या तासात आपण ज्या प्रकारे वर्णन करत आहोत त्या प्रकारे पाहण्यास शिकणे म्हणजे आपण मिळवू शकलेल्या कोणत्याही विशिष्ट उत्तरापेक्षा प्रश्नावर अधिक प्रेम करणे. ते जगाच्या प्रेमात राहणे आहे नेमके कारण जग आपल्याला आश्चर्यचकित करत राहते. आणि ती दुःखी प्रथा नाही. ती, मला वाटते, मानवी मन धारण करू शकेल अशी सर्वात आनंदी प्रथा आहे."],

["s14", title("THE TRAVELER", "stays honest by letting go", "#f9e2af", 86),
 "And there is one last thought I owe the person who reached for the bold claims, all the way back at the start. Because we have spent five segments testing their dreams, and most of those dreams did not survive the test. I do not want them to feel diminished by that. I want them to feel exactly the opposite.",
 "आणि एक शेवटचा विचार मी सुरुवातीला त्या धाडसी दाव्यांकडे पोहोचलेल्या व्यक्तीला देणे लागतो. कारण आपण पाच भाग त्यांच्या स्वप्नांची चाचणी घेण्यात घालवले, आणि त्यापैकी बहुतेक स्वप्ने चाचणी टिकू शकली नाहीत. मला त्यांना त्यामुळे कमी झाल्यासारखे वाटू नये अशी इच्छा आहे. मला त्यांना नेमके उलट जाणवायला हवे आहे."],

["s15", quote('"The reaching was the right kind of bravery."', ""),
 "Because the reaching itself was the right kind of bravery. To look at the textbook and say I think the textbook might be missing something — that is the act that has built every chapter of every textbook we now own. The discipline disagreed with their answer. It did not disagree with their question. And those two things are not the same, and I would like to live in a world that never forgets which is which.",
 "कारण पोहोचणे हीच योग्य प्रकारची शूरता होती. पाठ्यपुस्तकाकडे पाहून म्हणणे की 'मला वाटते पाठ्यपुस्तकात काहीतरी सुटले आहे' — हीच कृती आहे ज्याने आपल्याकडे आत्ता असलेल्या प्रत्येक पाठ्यपुस्तकाचा प्रत्येक अध्याय बांधला आहे. शिस्त त्यांच्या उत्तराशी असहमत होती. ती त्यांच्या प्रश्नाशी असहमत नव्हती. आणि त्या दोन गोष्टी एकच नाहीत, आणि मला अशा जगात राहायला आवडेल जे कोणती कोणती हे कधीही विसरत नाही."],

["s16", statement(["The honest gift", "is not certainty.", "It is the practice", "of looking."], "#cdd6f4"),
 "So the honest gift of this film, the one we hope you take with you, is not a list of answers. It is not the ozone shield, or Newton's equation, or Mitchell's proton gradient, beautiful as those things are. The honest gift is the practice. It is the willingness to keep looking. To honor a hopeful idea by testing it gently and all the way down. To love the question more than the answer. To let go of beliefs that the world has shown to be wrong, and to keep, with both hands, the ones that have earned their place.",
 "तर या चित्रपटाची प्रामाणिक भेट, जी आम्हाला आशा आहे तुम्ही सोबत घेऊन जाल, उत्तरांची यादी नाही. ओझोन कवच, न्यूटनचे समीकरण, किंवा मिशेलचा प्रोटॉन ग्रेडियंट, त्या गोष्टी कितीही सुंदर असोत, ती ती नाही. प्रामाणिक भेट म्हणजे प्रथा. ती म्हणजे पाहत राहण्याची इच्छा. आशादायक कल्पनेचा सन्मान सौम्यपणे आणि अगदी खालपर्यंत चाचणी करून करणे. उत्तरापेक्षा प्रश्नावर अधिक प्रेम करणे. जगाने चुकीच्या ठरवलेल्या समजुती सोडून देणे, आणि ज्यांनी आपले स्थान कमावले आहे त्यांना दोन्ही हातांनी ठेवणे."],

["s17", horizonClose(),
 "And now we walk on. We did not solve the universe in five segments. We did not promise we would. We honored some hopeful ideas, we listened to what the world said back, and we wrote down — exactly, with care, in plain English and plain Marathi — what survived and what did not. That is a small thing. It is also, I think, the only thing that has ever moved a species from where it is to where it might be.",
 "आणि आता आपण पुढे चालतो. आपण पाच भागांत विश्वाची सोडवणूक केली नाही. आपण तसे वचन दिले नव्हते. आपण काही आशादायक कल्पनांचा सन्मान केला, जगाने काय परत सांगितले ते आपण ऐकले, आणि आपण लिहिले — नेमके, काळजीपूर्वक, साध्या इंग्रजीत आणि साध्या मराठीत — काय टिकले आणि काय टिकले नाही. ती छोटी गोष्ट आहे. ती, मला वाटते, अशी एकमेव गोष्ट आहे जिने कधीही एका प्रजातीला ती जिथे आहे तिथून ती जिथे असू शकते तिथे हलवले आहे."],

["s18", star(),
 "And so we wish you, sincerely, a slightly safer world tomorrow than the one you went to bed in tonight. We wish you patient ears for ideas you disagree with. We wish you courage for ideas you hope are true. We wish you the practice of stating your bar before your run. We wish you the freedom of letting go of a wrong belief without the burden of shame. And we wish you, above all, the company of other travelers who are walking, with you, the same gentle, stubborn road.",
 "आणि म्हणून आम्ही तुम्हाला, मनापासून, आज रात्री ज्यात तुम्ही झोपलात त्यापेक्षा उद्या किंचित सुरक्षित जग शुभेच्छा. आम्ही तुम्हाला असहमत असलेल्या कल्पनांसाठी धैर्यवान कान शुभेच्छा. आम्ही तुम्हाला खऱ्या असाव्यात अशी आशा असलेल्या कल्पनांसाठी धैर्य शुभेच्छा. आम्ही तुम्हाला चाचणीआधी रेषा सांगण्याची प्रथा शुभेच्छा. आम्ही तुम्हाला लाजेच्या ओझ्याशिवाय चुकीची समजूत सोडण्याचे स्वातंत्र्य शुभेच्छा. आणि आम्ही तुम्हाला, सर्वांत वर, त्याच सौम्य, हट्टी रस्त्यावर तुमच्यासोबत चालणाऱ्या इतर प्रवाशांची सोबत शुभेच्छा."],

["s19", title("TRAVELERS", "people must see to learn, and learn to see", "#89b4fa", 124),
 "Life is made of travelers. We did not create the world we move through. But we are learning, slowly, to see it. Thank you for staying with us. Walk well.",
 "जीवन प्रवाशांचे बनलेले आहे. आपण ज्या जगातून प्रवास करतो ते आपण निर्माण केले नाही. पण आपण, हळूहळू, ते पाहायला शिकत आहोत. आमच्यासोबत राहिल्याबद्दल धन्यवाद. चांगला चालावा."],

["s20", title("END", "an honest science film", "#6c7393", 64),
 "Every number in this film traces to a public source. Every claim carries a label. Nothing has been called proven. The math has been allowed to say no. People must see to learn, and learn to see.",
 "या चित्रपटातील प्रत्येक आकडा सार्वजनिक स्रोताकडे जातो. प्रत्येक दावा खूण घेऊन येतो. काहीही 'सिद्ध' म्हटले नाही. गणिताला 'नाही' म्हणण्याची परवानगी होती. शिकण्यासाठी माणसाने पाहिले पाहिजे, आणि पाहण्यासाठी शिकले पाहिजे."],
];

L.writeScenes(S, SVG_DIR, CUES, "seg5");
