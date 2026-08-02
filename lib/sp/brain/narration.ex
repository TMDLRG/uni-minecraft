defmodule SP.Brain.Narration do
  @moduledoc """
  The Producer's LINGUISTIC PRIORS — overlay narration rendered in the world's top-5
  languages (English, Mandarin Chinese, Hindi, Spanish, Arabic) from designed template
  tables. There is NO language model: the Producer SELECTS a narrative *beat* (an atom +
  data) by active inference; this module renders that beat as text. The templates are data
  (hot-reloadable, diff-reviewable, per-language word order), exactly "priors to generate
  overlay text" — not generation.

  `render(beat_kind, data, opts)` returns `%{lang => string}` for all five languages, so the
  stream can stack/cycle without re-rendering. Deterministic phrasing variety uses the same
  `rem(frame + phash2(who), n)` idiom as the Director. Missing slots render as "" (never
  raises) — the same defensive spirit as `SP.Runtime.Mind`.
  """

  @langs [:en, :zh, :hi, :es, :ar]

  def langs, do: @langs

  # beat_kind => lang => [phrasings]. Slots: {{who}} {{context}} {{intent}} {{conf}} {{day}}.
  @templates %{
    under_attack: %{
      en: ["{{who}} is under attack — fighting for its life!", "Something is hurting {{who}}!"],
      zh: ["{{who}} 遭到攻击——为生存而战！", "有东西在伤害 {{who}}！"],
      hi: ["{{who}} पर हमला — अपनी जान के लिए लड़ रहा है!", "कोई {{who}} को चोट पहुँचा रहा है!"],
      es: ["¡{{who}} está bajo ataque, luchando por su vida!", "¡Algo está hiriendo a {{who}}!"],
      ar: ["{{who}} يتعرّض للهجوم — يقاتل من أجل حياته!", "شيء ما يؤذي {{who}}!"]
    },
    gravely_wounded: %{
      en: ["{{who}} is on the brink, badly wounded.", "{{who}} clings to life."],
      zh: ["{{who}} 身受重伤，命悬一线。", "{{who}} 苦苦支撑着生命。"],
      hi: ["{{who}} गंभीर रूप से घायल, मौत के कगार पर।", "{{who}} जीवन से जूझ रहा है।"],
      es: ["{{who}} está al borde, gravemente herido.", "{{who}} se aferra a la vida."],
      ar: ["{{who}} على شفا الهاوية، مصاب بجروح بالغة.", "{{who}} يتشبّث بالحياة."]
    },
    rebirth: %{
      en: ["{{who}} falls — and rises again, memories intact."],
      zh: ["{{who}} 倒下了——又重新站起，记忆犹存。"],
      hi: ["{{who}} गिरता है — और फिर उठ खड़ा होता है, यादें बरकरार।"],
      es: ["{{who}} cae — y se levanta de nuevo, con su memoria intacta."],
      ar: ["{{who}} يسقط — ثم ينهض من جديد، وذاكرته سليمة."]
    },
    hostile_near: %{
      en: ["A hostile mob closes in on {{who}}.", "Danger stalks {{who}}."],
      zh: ["敌对生物逼近 {{who}}。", "危险正尾随着 {{who}}。"],
      hi: ["एक शत्रु प्राणी {{who}} के पास आ रहा है।", "ख़तरा {{who}} का पीछा कर रहा है।"],
      es: ["Una criatura hostil se acerca a {{who}}.", "El peligro acecha a {{who}}."],
      ar: ["وحش معادٍ يقترب من {{who}}.", "الخطر يترصّد {{who}}."]
    },
    wounded: %{
      en: ["{{who}} is wounded and wary.", "{{who}} nurses its wounds."],
      zh: ["{{who}} 受了伤，谨慎戒备。", "{{who}} 正在养伤。"],
      hi: ["{{who}} घायल और सतर्क है।", "{{who}} अपने घाव सहला रहा है।"],
      es: ["{{who}} está herido y cauteloso.", "{{who}} cura sus heridas."],
      ar: ["{{who}} جريح وحذر.", "{{who}} يداوي جراحه."]
    },
    reunite_kin: %{
      en: ["{{who}} draws near its kin.", "{{who}} senses family close by."],
      zh: ["{{who}} 与同族相聚。", "{{who}} 感到亲族就在身旁。"],
      hi: ["{{who}} अपने स्वजनों के पास आता है।", "{{who}} को परिवार पास होने का आभास होता है।"],
      es: ["{{who}} se acerca a los suyos.", "{{who}} siente a su familia cerca."],
      ar: ["{{who}} يقترب من ذويه.", "{{who}} يشعر بأهله قريبين."]
    },
    meet_outsider: %{
      en: ["{{who}} crosses paths with an outsider.", "A stranger drifts into {{who}}'s view."],
      zh: ["{{who}} 与一个外来者相遇。", "一个陌生者进入了 {{who}} 的视野。"],
      hi: ["{{who}} का सामना एक बाहरी से होता है।", "एक अजनबी {{who}} की नज़र में आता है।"],
      es: ["{{who}} se cruza con un forastero.", "Un extraño aparece ante {{who}}."],
      ar: ["{{who}} يلتقي بغريب.", "غريب يظهر في مرأى {{who}}."]
    },
    hunger: %{
      en: ["{{who}} is hungry, foraging the forest.", "Hunger drives {{who}} onward."],
      zh: ["{{who}} 饿了，在森林中觅食。", "饥饿驱使着 {{who}} 前行。"],
      hi: ["{{who}} भूखा है, जंगल में भोजन ढूँढ़ रहा है।", "भूख {{who}} को आगे बढ़ाती है।"],
      es: ["{{who}} tiene hambre y busca comida en el bosque.", "El hambre empuja a {{who}}."],
      ar: ["{{who}} جائع، يبحث عن الطعام في الغابة.", "الجوع يدفع {{who}} للمضي."]
    },
    mining: %{
      en: ["{{who}} digs in, working the world.", "{{who}} carves into the earth."],
      zh: ["{{who}} 埋头开采，改造着世界。", "{{who}} 凿入大地。"],
      hi: ["{{who}} खुदाई में जुट गया, दुनिया को गढ़ रहा है।", "{{who}} धरती में खोदता है।"],
      es: ["{{who}} se pone a excavar, labrando el mundo.", "{{who}} cava en la tierra."],
      ar: ["{{who}} ينقّب، يصوغ العالم.", "{{who}} يحفر في الأرض."]
    },
    eating: %{
      en: ["{{who}} pauses to eat, restoring itself."],
      zh: ["{{who}} 停下来进食，恢复体力。"],
      hi: ["{{who}} खाने के लिए रुकता है, ख़ुद को बहाल करता है।"],
      es: ["{{who}} se detiene a comer y recuperarse."],
      ar: ["{{who}} يتوقّف ليأكل ويستعيد عافيته."]
    },
    strategy: %{
      en: ["{{who}} commits to {{context}}; plans to {{intent}} — {{conf}}% sure."],
      zh: ["{{who}} 决定{{context}}；计划{{intent}}——有 {{conf}}% 把握。"],
      hi: ["{{who}} ने {{context}} चुना; योजना: {{intent}} — {{conf}}% निश्चित।"],
      es: ["{{who}} opta por {{context}}; planea {{intent}} — {{conf}}% seguro."],
      ar: ["{{who}} يختار {{context}}؛ يخطّط لـ {{intent}} — متأكّد {{conf}}%."]
    },
    explore: %{
      en: ["{{who}} ventures into the unknown, drawn by curiosity.", "{{who}} wanders, reducing the unknown."],
      zh: ["{{who}} 受好奇心驱使，闯入未知。", "{{who}} 四处游荡，消解未知。"],
      hi: ["{{who}} जिज्ञासा से प्रेरित होकर अनजान में बढ़ता है।", "{{who}} भटकता है, अनजान को कम करता है।"],
      es: [
        "{{who}} se adentra en lo desconocido, movido por la curiosidad.",
        "{{who}} deambula, reduciendo lo desconocido."
      ],
      ar: ["{{who}} يخوض في المجهول بدافع الفضول.", "{{who}} يتجوّل، يقلّص المجهول."]
    },
    scene: %{
      en: ["THE COLONY · Day {{day}}"],
      zh: ["聚落 · 第 {{day}} 天"],
      hi: ["कॉलोनी · दिन {{day}}"],
      es: ["LA COLONIA · Día {{day}}"],
      ar: ["المستعمرة · اليوم {{day}}"]
    },
    # WS1-A: the graded viability body (homeostat lineage). Narrated as a MODEL-VARIABLE readout —
    # "its {{sys}} reads {{tier}}" — never as a felt state. {{sys}}/{{tier}} are the interoceptive
    # subsystem + its 0..5 tier word; kept as the technical term inside each language's frame.
    viability_crisis: %{
      en: ["{{who}}'s {{sys}} reads {{tier}} — a survival test, right now."],
      zh: ["{{who}} 的 {{sys}} 读数为 {{tier}}——眼下的生存考验。"],
      hi: ["{{who}} का {{sys}} {{tier}} पढ़ता है — अभी जीवित रहने की परीक्षा।"],
      es: ["El {{sys}} de {{who}} marca {{tier}}: una prueba de supervivencia ahora."],
      ar: ["{{sys}} لدى {{who}} عند {{tier}} — اختبار بقاء الآن."]
    },
    viability_low: %{
      en: ["{{who}}'s {{sys}} reads {{tier}}; it must tend to it soon."],
      zh: ["{{who}} 的 {{sys}} 读数为 {{tier}}，需尽快应对。"],
      hi: ["{{who}} का {{sys}} {{tier}} पढ़ता है; जल्द ध्यान देना होगा।"],
      es: ["El {{sys}} de {{who}} marca {{tier}}; deberá atenderlo pronto."],
      ar: ["{{sys}} لدى {{who}} عند {{tier}}؛ عليه معالجته قريبًا."]
    },
    # WS1-B: WORLD beats — the day/night rhythm and colony size, the real gameplay the Producer
    # narrates alongside the agents. {{day}} = day count, {{online}} = colony size.
    world_nightfall: %{
      en: ["Night falls over the colony — Day {{day}}. Watch what stirs in the dark."],
      zh: ["夜幕降临聚落——第 {{day}} 天。留意暗处的动静。"],
      hi: ["कॉलोनी पर रात उतरती है — दिन {{day}}। अँधेरे में हलचल पर नज़र रखें।"],
      es: ["Cae la noche sobre la colonia — Día {{day}}. Atentos a lo que acecha."],
      ar: ["يحلّ الليل على المستعمرة — اليوم {{day}}. انتبهوا لما يتحرّك في الظلام."]
    },
    world_dawn: %{
      en: ["Dawn breaks over the colony — Day {{day}}."],
      zh: ["黎明照临聚落——第 {{day}} 天。"],
      hi: ["कॉलोनी पर भोर होती है — दिन {{day}}।"],
      es: ["Amanece sobre la colonia — Día {{day}}."],
      ar: ["يطلع الفجر على المستعمرة — اليوم {{day}}."]
    },
    world_grew: %{
      en: ["The colony is {{online}} strong now."],
      zh: ["聚落现已壮大到 {{online}} 名成员。"],
      hi: ["कॉलोनी अब {{online}} सदस्यों की हो गई है।"],
      es: ["La colonia cuenta ya con {{online}} miembros."],
      ar: ["صار عدد المستعمرة {{online}} الآن."]
    },
    # WS2-B: story ARCS — a UNI growing up over time (curriculum phase climb) or weathering a long
    # stretch. {{phase}} = curriculum level 0..4, {{phasename}} = its English label.
    arc_grew: %{
      en: ["{{who}} has grown a rung — now at phase {{phase}}, {{phasename}}."],
      zh: ["{{who}} 更上一层——现处于第 {{phase}} 阶段（{{phasename}}）。"],
      hi: ["{{who}} एक पायदान बढ़ा — अब चरण {{phase}} ({{phasename}}) पर।"],
      es: ["{{who}} ha subido un peldaño — ahora en la fase {{phase}} ({{phasename}})."],
      ar: ["{{who}} ارتقى درجة — الآن في الطور {{phase}} ({{phasename}})."]
    },
    arc_survived: %{
      en: ["{{who}} has weathered a long stretch out here."],
      zh: ["{{who}} 已在这里撑过了漫长的一段。"],
      hi: ["{{who}} ने यहाँ एक लंबा दौर झेल लिया है।"],
      es: ["{{who}} ha resistido un largo trecho aquí."],
      ar: ["{{who}} صمد لفترة طويلة هنا."]
    }
  }

  # L2 strategic option words, per language (for the {{context}} slot).
  @context_words %{
    forage: %{en: "foraging", zh: "觅食", hi: "भोजन खोजना", es: "buscar comida", ar: "البحث عن الطعام"},
    build: %{en: "building", zh: "建造", hi: "निर्माण", es: "construir", ar: "البناء"},
    flee: %{en: "fleeing danger", zh: "逃离危险", hi: "ख़तरे से भागना", es: "huir del peligro", ar: "الفرار من الخطر"},
    socialize: %{
      en: "seeking others",
      zh: "寻找同伴",
      hi: "साथियों की तलाश",
      es: "buscar a otros",
      ar: "البحث عن الآخرين"
    },
    rest: %{en: "resting", zh: "休息", hi: "विश्राम", es: "descansar", ar: "الاستراحة"}
  }

  # Primitive action words, per language (for the {{intent}} slot — localised plan preview).
  @act_words %{
    forward: %{en: "step", zh: "前进", hi: "क़दम", es: "avanzar", ar: "خطوة"},
    turn_left: %{en: "turn", zh: "转身", hi: "मुड़ना", es: "girar", ar: "يلتفّ"},
    turn_right: %{en: "turn", zh: "转身", hi: "मुड़ना", es: "girar", ar: "يلتفّ"},
    mine: %{en: "mine", zh: "开采", hi: "खोदना", es: "minar", ar: "ينقّب"},
    eat: %{en: "eat", zh: "进食", hi: "खाना", es: "comer", ar: "يأكل"},
    jump: %{en: "hop", zh: "跳跃", hi: "कूदना", es: "saltar", ar: "يقفز"},
    noop: %{en: "wait", zh: "等待", hi: "रुकना", es: "esperar", ar: "ينتظر"}
  }

  # === COMPOSITIONAL GRAMMAR (generation, not lookup) ========================
  # Ambient narration is COMPOSED from the agent's live state — a verb-phrase chosen by what it
  # is doing × a mood clause chosen by how it feels — assembled per language. This is a small
  # generative model expressed as priors (lexicon + assembly rule), so the producer can utter a
  # whole space of sentences (|activity| × |mood| per language) it was never handed verbatim —
  # the FEP way (generate from a model), not a phrasebook. Still authored, deterministic, no LLM.

  # verb-phrase by ACTIVITY (3rd-person singular; agent ids are gender-neutral, so no agreement).
  @vp %{
    forage: %{
      en: "forages through the wild",
      zh: "在荒野中觅食",
      hi: "जंगल में भोजन ढूँढ़ता है",
      es: "busca comida por la espesura",
      ar: "يبحث عن الطعام في البرّية"
    },
    mine: %{
      en: "carves into the stone",
      zh: "凿入岩石",
      hi: "पत्थर में खुदाई करता है",
      es: "se hunde en la piedra",
      ar: "ينحت في الصخر"
    },
    build: %{
      en: "reshapes the world",
      zh: "改造着世界",
      hi: "दुनिया को गढ़ता है",
      es: "moldea el mundo",
      ar: "يعيد تشكيل العالم"
    },
    flee: %{en: "flees the danger", zh: "逃离危险", hi: "ख़तरे से भागता है", es: "huye del peligro", ar: "يفرّ من الخطر"},
    social: %{
      en: "seeks out its kin",
      zh: "寻找亲族",
      hi: "अपने स्वजनों को खोजता है",
      es: "busca a los suyos",
      ar: "يبحث عن ذويه"
    },
    rest: %{
      en: "pauses to recover",
      zh: "停下休整",
      hi: "थमकर सँभलता है",
      es: "se detiene a recuperarse",
      ar: "يتوقّف ليستعيد قوّته"
    },
    eat: %{en: "stops to eat", zh: "停下进食", hi: "रुककर खाता है", es: "se detiene a comer", ar: "يتوقّف ليأكل"},
    explore: %{
      en: "wanders into the unknown",
      zh: "闯入未知",
      hi: "अनजान में भटकता है",
      es: "se adentra en lo desconocido",
      ar: "يخوض في المجهول"
    }
  }

  # mood clause by EMOTION (an appositive flourish; dash-joined so it stays grammatical in every
  # language without clause-agreement gymnastics).
  @mood %{
    calm: %{en: "calm and steady", zh: "沉稳镇定", hi: "शांत और स्थिर", es: "sereno y firme", ar: "هادئ وثابت"},
    fear: %{en: "wary and tense", zh: "警惕而紧张", hi: "सतर्क और तनावग्रस्त", es: "alerta y tenso", ar: "يقظ ومتوتّر"},
    content: %{
      en: "quietly content",
      zh: "静静满足",
      hi: "चुपचाप संतुष्ट",
      es: "callado y satisfecho",
      ar: "راضٍ بهدوء"
    },
    curious: %{
      en: "bright with curiosity",
      zh: "充满好奇",
      hi: "जिज्ञासा से भरा",
      es: "ávido de curiosidad",
      ar: "متّقد بالفضول"
    },
    fierce: %{
      en: "fierce and unflinching",
      zh: "凶猛无畏",
      hi: "प्रचंड और निडर",
      es: "feroz e inquebrantable",
      ar: "شرس لا يلين"
    },
    weary: %{
      en: "weary but unbowed",
      zh: "疲惫却不屈",
      hi: "थका पर अडिग",
      es: "cansado pero entero",
      ar: "متعب لكنه صامد"
    },
    default: %{
      en: "intent on the path ahead",
      zh: "专注于前路",
      hi: "अपनी राह पर अटल",
      es: "fijo en su camino",
      ar: "مركّز على دربه"
    }
  }

  @doc """
  COMPOSE an ambient line for an agent from its live state (`%{who, emotion, context, action}`)
  — generated from the grammar, in every language: `%{lang => string}`. Unlike `render/3` (fixed
  beats), this assembles activity × mood, so the output space is combinatorial.
  """
  @spec compose(map, keyword) :: %{atom => String.t()}
  def compose(data, opts \\ []) do
    langs = Keyword.get(opts, :langs, @langs)
    Map.new(langs, fn lang -> {lang, compose_one(data, lang)} end)
  end

  defp compose_one(data, lang) do
    who = to_string(Map.get(data, :who, ""))
    vp = @vp |> Map.get(activity(data), @vp.explore) |> Map.get(lang, "")
    md = @mood |> Map.get(mood_key(Map.get(data, :emotion)), @mood.default) |> Map.get(lang, "")
    assemble(who, vp, md, lang)
  end

  # the assembly rule (a tiny grammar): subject + verb-phrase, mood as a dash-appositive. zh uses
  # fullwidth punctuation; everyone else the em-dash. Empty pieces never break it.
  defp assemble(who, vp, md, :zh),
    do: String.trim("#{who}#{vp}" <> if(md == "", do: "", else: " —— #{md}")) <> "。"

  defp assemble(who, vp, md, :hi),
    do: String.trim("#{who} #{vp}" <> if(md == "", do: "", else: " — #{md}")) <> "।"

  defp assemble(who, vp, md, _lang),
    do: String.trim("#{who} #{vp}" <> if(md == "", do: "", else: " — #{md}")) <> "."

  defp activity(data) do
    cond do
      Map.get(data, :action) == "mine" -> :mine
      Map.get(data, :action) == "eat" -> :eat
      Map.get(data, :context) in [:forage, :build, :flee, :social, :rest] -> Map.get(data, :context)
      true -> :explore
    end
  end

  defp mood_key(e) when e in [:calm, :fear, :content, :curious, :fierce, :weary], do: e
  defp mood_key(:afraid), do: :fear
  defp mood_key(:angry), do: :fierce
  defp mood_key(:tired), do: :weary
  defp mood_key(_), do: :default

  @doc "Render a beat to overlay text in every language: `%{lang => string}`."
  @spec render(atom, map, keyword) :: %{atom => String.t()}
  def render(beat_kind, data, opts \\ []) do
    langs = Keyword.get(opts, :langs, @langs)
    Map.new(langs, fn lang -> {lang, render_one(beat_kind, data, lang, opts)} end)
  end

  @doc "Render a beat in one language."
  @spec render_one(atom, map, atom, keyword) :: String.t()
  def render_one(beat_kind, data, lang, opts \\ []) do
    frame = Keyword.get(opts, :frame, 0)
    who = to_string(Map.get(data, :who, ""))

    phrasings =
      @templates
      |> Map.get(beat_kind, %{})
      |> Map.get(lang, Map.get(Map.get(@templates, beat_kind, %{}), :en, [""]))

    template =
      if phrasings == [],
        do: "",
        else: Enum.at(phrasings, rem(frame + :erlang.phash2(who), length(phrasings)))

    interp(template, data, lang)
  end

  @doc "Convenience for a producer-emitted `{:narrate, kind, data}` directive."
  def of_directive({:narrate, kind, data}, opts \\ []), do: render(kind, data, opts)

  # --- helpers ---------------------------------------------------------------

  defp interp(template, data, lang) do
    template
    |> String.replace("{{who}}", to_string(Map.get(data, :who, "")))
    |> String.replace("{{conf}}", to_string(Map.get(data, :conf, "")))
    |> String.replace("{{day}}", to_string(Map.get(data, :day, "")))
    |> String.replace("{{online}}", to_string(Map.get(data, :online, "")))
    |> String.replace("{{phase}}", to_string(Map.get(data, :phase, "")))
    |> String.replace("{{phasename}}", to_string(Map.get(data, :phasename, "")))
    |> String.replace("{{context}}", context_word(Map.get(data, :context), lang))
    |> String.replace("{{intent}}", intent_phrase(Map.get(data, :intent_actions, []), lang))
    # WS1-A viability slots — subsystem name + tier word (English technical terms held inside
    # each language's sentence frame; these are model variables, not felt states).
    |> String.replace("{{sys}}", to_string(Map.get(data, :sys, "")))
    |> String.replace("{{tier}}", to_string(Map.get(data, :tier, "")))
  end

  defp context_word(nil, _lang), do: ""

  defp context_word(ctx, lang) do
    @context_words |> Map.get(ctx, %{}) |> Map.get(lang) || to_string(ctx)
  end

  defp intent_phrase([], _lang), do: ""

  defp intent_phrase(actions, lang) do
    actions
    |> Enum.take(3)
    |> Enum.map(fn a -> @act_words |> Map.get(a, %{}) |> Map.get(lang) || to_string(a) end)
    |> Enum.join(" → ")
  end
end
