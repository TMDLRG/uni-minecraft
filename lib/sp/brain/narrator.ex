defmodule SP.Brain.Narrator do
  @moduledoc """
  The Producer's grade-4 WRITER — language production as active inference. A small pure-FEP
  selector (a `SP.Brain.Factors` UNI) infers the next RHETORICAL MOVE (cause→effect, contrast,
  temporal, or conclude) under "young-writer" priors — vary the relation, build a short arc,
  conclude in 3–5 sentences — and a multi-clause REALIZER renders each move into a sentence in
  five languages. No LLM: the structure is inferred, the surface is composed from authored
  priors (lexicon + per-language clause templates). Present tense throughout (live-appropriate,
  and it avoids the hardest morphology). Deterministic; measured by `SP.Brain.Readability`.

  `write(data, opts)` → `%{lang => paragraph_string}` and `sentences(data, opts)` → the EN
  sentence list (what the harness scores). `data` is an agent snapshot
  (`%{who, emotion, context, action, senses}`).
  """

  alias SP.Brain.{Factors, Codec}
  alias SP.Determinism, as: Det

  @langs [:en, :zh, :hi, :es, :ar]
  def langs, do: @langs

  @doc "The rhetorical-move selector as a `SP.Brain.Factors` model (for §16 gating)."
  def model, do: move_model()

  # present-tense verb phrase (no subject) by ACTIVITY, per language.
  @verbs %{
    forage: %{
      en: "forages through the wild",
      zh: "在荒野中觅食",
      hi: "जंगल में भोजन ढूँढ़ता है",
      es: "busca comida por el bosque",
      ar: "يبحث عن الطعام في البرّية"
    },
    mine: %{
      en: "carves into the stone",
      zh: "凿入岩石",
      hi: "पत्थर में खुदाई करता है",
      es: "excava en la piedra",
      ar: "ينحت في الصخر"
    },
    build: %{
      en: "shapes the world",
      zh: "改造着世界",
      hi: "दुनिया को गढ़ता है",
      es: "moldea el mundo",
      ar: "يعيد تشكيل العالم"
    },
    flee: %{
      en: "flees from danger",
      zh: "逃离危险",
      hi: "ख़तरे से भागता है",
      es: "huye del peligro",
      ar: "يفرّ من الخطر"
    },
    social: %{
      en: "draws close to its kin",
      zh: "靠近亲族",
      hi: "अपने स्वजनों के पास आता है",
      es: "se acerca a los suyos",
      ar: "يقترب من ذويه"
    },
    rest: %{
      en: "pauses to rest",
      zh: "停下休息",
      hi: "रुककर सुस्ताता है",
      es: "se detiene a descansar",
      ar: "يتوقّف ليستريح"
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

  # state predicate by KEY (the full copula clause per language; ar is a bare adjective for the
  # verbless nominal sentence). Keys come from senses + emotion.
  @states %{
    hungry: %{en: "is hungry", zh: "饿了", hi: "भूखा है", es: "tiene hambre", ar: "جائع"},
    hurt: %{en: "is hurt", zh: "受伤了", hi: "घायल है", es: "está herido", ar: "مصاب"},
    weary: %{en: "is weary", zh: "疲惫", hi: "थका है", es: "está cansado", ar: "متعب"},
    afraid: %{en: "is afraid", zh: "害怕", hi: "डरा हुआ है", es: "tiene miedo", ar: "خائف"},
    curious: %{en: "is curious", zh: "好奇", hi: "जिज्ञासु है", es: "siente curiosidad", ar: "فضولي"},
    content: %{en: "is content", zh: "满足", hi: "संतुष्ट है", es: "está satisfecho", ar: "راضٍ"},
    calm: %{en: "is calm", zh: "平静", hi: "शांत है", es: "está sereno", ar: "هادئ"},
    restless: %{en: "is restless", zh: "焦躁", hi: "बेचैन है", es: "está inquieto", ar: "قلق"}
  }

  # mood appositive (closing flourish) by EMOTION, per language.
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
      en: "bright with wonder",
      zh: "充满好奇",
      hi: "जिज्ञासा से भरा",
      es: "ávido de curiosidad",
      ar: "متّقد بالفضول"
    },
    fierce: %{en: "fierce and unbowed", zh: "凶猛无畏", hi: "प्रचंड और निडर", es: "feroz e firme", ar: "شرس لا يلين"},
    weary: %{
      en: "weary but willing",
      zh: "疲惫却不屈",
      hi: "थका पर तैयार",
      es: "cansado pero entero",
      ar: "متعب لكنه صامد"
    },
    default: %{en: "set on its way", zh: "专注前路", hi: "अपनी राह पर", es: "fijo en su camino", ar: "ماضٍ في دربه"}
  }

  # per-MOVE, per-language clause template — SCENE narration: each sentence is about a DIFFERENT
  # cast member (so content stays fresh), names them, then refers back with "it". Slots:
  # {name} {vp} {vp2} {state} {mood} (and {cvp}/{cmood} for the colony conclusion). Each is a
  # genuine two-clause sentence joined by a connective; openings vary (distinct names + "So").
  # (ar/hi authored as MSA/Devanagari present forms — see docs/LANGUAGE.md; EN is harness-certified.)
  @tpl %{
    open: %{
      en: "{name} {state}, and it {vp}.",
      zh: "{name}{state}，它{vp}。",
      hi: "{name} {state}, और वह {vp}।",
      es: "{name} {state} y {vp}.",
      ar: "{name} {state}، وهو {vp}."
    },
    cause: %{
      en: "{name} {state}, so it {vp}.",
      zh: "{name}{state}，于是它{vp}。",
      hi: "{name} {state}, इसलिए वह {vp}।",
      es: "{name} {state}, así que {vp}.",
      ar: "{name} {state}، لذا {vp}."
    },
    contrast: %{
      en: "{name} {vp}, but it {state}.",
      zh: "{name}{vp}，但它{state}。",
      hi: "{name} {vp}, पर वह {state}।",
      es: "{name} {vp}, pero {state}.",
      ar: "{name} {vp}، لكنّه {state}."
    },
    temporal: %{
      en: "{name} {vp}, then it {vp2}.",
      zh: "{name}{vp}，接着它{vp2}。",
      hi: "{name} {vp}, फिर वह {vp2}।",
      es: "{name} {vp}, y luego {vp2}.",
      ar: "{name} {vp}، ثم {vp2}."
    },
    conclude: %{
      en: "So the colony {cvp}, {cmood}.",
      zh: "于是聚落{cvp}，{cmood}。",
      hi: "इसलिए कॉलोनी {cvp}, {cmood}।",
      es: "Así que la colonia {cvp}, {cmood}.",
      ar: "لذا تمضي المستعمرة، {cmood}."
    }
  }

  # the colony conclusion fragments (verb + mood), per language. Claim-fence-clean: BEHAVIOUR words
  # only ("busy and pressing on"), never a life/consciousness claim ("alive" is fence-banned).
  @colony_vp %{en: "presses on", zh: "继续前行", hi: "आगे बढ़ती है", es: "sigue adelante", ar: "قدماً"}
  @colony_mood %{
    en: "busy and unbroken",
    zh: "忙碌而不息",
    hi: "व्यस्त और अडिग",
    es: "activa y sin pausa",
    ar: "منشغلة بلا توقّف"
  }

  # SOLO develop templates — when the whole paragraph is about ONE agent, open the develops with
  # the RELATION word + a pronoun (Because… / But… / Then…) instead of repeating the name, so
  # openings stay varied. (Live shows always have several agents and use the scene templates.)
  @solo %{
    cause: %{
      en: "Because it {state}, it {vp}.",
      zh: "因为它{state}，它{vp}。",
      hi: "क्योंकि वह {state}, वह {vp}।",
      es: "Como {state}, {vp}.",
      ar: "لأنّه {state}، {vp}."
    },
    contrast: %{
      en: "But it {vp2}, even as it {state}.",
      zh: "但它{vp2}，同时它{state}。",
      hi: "पर वह {vp2}, जबकि वह {state}।",
      es: "Pero {vp2}, aunque {state}.",
      ar: "لكنّه {vp2}، رغم أنّه {state}."
    },
    temporal: %{
      en: "Then it {vp}, {mood}.",
      zh: "接着它{vp}，{mood}。",
      hi: "फिर वह {vp}, {mood}।",
      es: "Luego {vp}, {mood}.",
      ar: "ثم {vp}، {mood}."
    }
  }

  @develops [:cause, :contrast, :temporal]

  # --- the FEP move selector (a tiny pure-AIF UNI) ---------------------------
  # factors: stage (how far the arc has come) × last_develop (for variety). actions: the three
  # develop relations + conclude. C prefers advancing the arc and NOT repeating the last
  # relation; conclude becomes preferred once the arc is well developed (stage ≥ 2).

  @actions [:cause, :contrast, :temporal, :conclude]

  defp move_model do
    # stage: 0 opened · 1 developing · 2 developed · 3 done. develop actions push stage up,
    # conclude jumps to done. C: reach "developed" then finish.
    stage = %{
      a: [near_identity(4, 0.85)],
      b: [
        bcol(4, %{0 => 1, 1 => 2, 2 => 2}),
        bcol(4, %{0 => 1, 1 => 2, 2 => 2}),
        bcol(4, %{0 => 1, 1 => 2, 2 => 2}),
        bcol(4, %{0 => 3, 1 => 3, 2 => 3, 3 => 3})
      ],
      c: [[-0.5, 0.5, 2.0, 1.5]],
      d: [1.0, 0.0, 0.0, 0.0],
      gamma_m: [1.0],
      learn_a: false,
      learn_b: false
    }

    # last_develop: 0 none · 1 cause · 2 contrast · 3 temporal. Each develop SETS its own value;
    # C dislikes whatever was just used is handled by precision over repetition (see decide).
    last = %{
      a: [near_identity(4, 0.85)],
      b: [
        bcol(4, %{0 => 1, 1 => 1, 2 => 1, 3 => 1}),
        bcol(4, %{0 => 2, 1 => 2, 2 => 2, 3 => 2}),
        bcol(4, %{0 => 3, 1 => 3, 2 => 3, 3 => 3}),
        bcol(4, %{0 => 0, 1 => 0, 2 => 0, 3 => 0})
      ],
      c: [[0.0, 0.0, 0.0, 0.0]],
      d: [1.0, 0.0, 0.0, 0.0],
      gamma_m: [1.0],
      learn_a: false,
      learn_b: false
    }

    Factors.new([stage, last], gamma: 8.0, horizon: 1, learn_e: false)
  end

  # --- public API ------------------------------------------------------------

  @doc "Write a grade-4 SCENE paragraph in every language: `%{lang => string}`."
  def write(rows_or_data, opts \\ [])
  def write(rows, opts) when is_list(rows), do: scene(rows, opts) |> render_all()
  def write(data, opts) when is_map(data), do: write([data], opts)

  @doc "The English sentence list the readability harness scores."
  def sentences(rows_or_data, opts \\ [])
  def sentences(rows, opts) when is_list(rows), do: scene(rows, opts) |> Enum.map(&render_one(&1, :en))
  def sentences(data, opts) when is_map(data), do: sentences([data], opts)

  @doc """
  The ordered `(move, subject)` pairs (diagnostics): opens on the focal agent, develops across
  other cast members by EFE-chosen relations, concludes on the colony. Always 3–5 sentences.
  """
  def scene(rows_or_data, opts \\ [])
  def scene([], opts), do: scene([%{who: "A UNI"}], opts)

  def scene(rows, opts) when is_list(rows) do
    focal = hd(rows)
    others = rows |> tl() |> Enum.take(3)
    # one cast member ⇒ SOLO mode (pronoun-opener develops); otherwise scene mode (named cast).
    {mode, devel_agents} = if others == [], do: {:solo, [focal, focal]}, else: {:scene, others}
    seed = Keyword.get(opts, :seed, :erlang.phash2(Enum.map(rows, &Map.get(&1, :who))))
    moves = develop_loop(move_model(), Det.new(seed), [], 0, min(3, length(devel_agents)))

    [{:open, focal, mode}] ++
      Enum.map(Enum.zip(moves, devel_agents), fn {mv, ag} -> {mv, ag, mode} end) ++
      [{:conclude, :colony, mode}]
  end

  def scene(data, opts) when is_map(data), do: scene([data], opts)

  # --- the rollout: EFE-chosen develop relations, then conclude --------------

  defp develop_loop(_model, _rng, acc, n, max) when n >= max, do: Enum.reverse(acc)

  defp develop_loop(model, rng, acc, n, max) do
    # observe the current stage/last, infer, choose the next relation by EFE; bias AWAY from
    # repeating the previous relation (variety); FORCE at least one develop (n==0 ⇒ no early
    # conclude) so a paragraph is always ≥3 sentences (open + ≥1 develop + conclude).
    obs = [[min(n, 3)], [last_idx(acc)]]
    model = Factors.infer_states(model, obs)
    %{q_pi: q} = Factors.evaluate_policies(model)
    q = q |> penalize_repeat(acc) |> maybe_mask_conclude(n)
    {idx, rng} = Codec.sample(q, rng)

    case Enum.at(@actions, idx) do
      :conclude -> Enum.reverse(acc)
      move -> develop_loop(model, rng, [move | acc], n + 1, max)
    end
  end

  # forbid repeating the immediately-previous relation (variety): zero its posterior mass so two
  # consecutive develops always differ — no duplicate sentences. Still an EFE choice among the
  # rest (+ conclude), still deterministic via the threaded rng.
  defp penalize_repeat(q, [last | _]) do
    case Enum.find_index(@actions, &(&1 == last)) do
      nil -> q
      i -> q |> List.replace_at(i, 0.0) |> normalize()
    end
  end

  defp penalize_repeat(q, _), do: q

  # at least one develop before a conclude is allowed (zero the conclude action at n==0).
  defp maybe_mask_conclude(q, 0), do: q |> List.replace_at(3, 0.0) |> normalize()
  defp maybe_mask_conclude(q, _), do: q

  defp last_idx([]), do: 0

  defp last_idx([m | _]) do
    case Enum.find_index(@develops, &(&1 == m)) do
      nil -> 0
      i -> i + 1
    end
  end

  # --- realization (clause templates → grammatical sentences) ----------------

  defp render_all(pairs) do
    Map.new(@langs, fn lang ->
      sep = if lang == :zh, do: "", else: " "
      {lang, pairs |> Enum.map(&render_one(&1, lang)) |> Enum.join(sep)}
    end)
  end

  defp render_one({:conclude, :colony, _mode}, lang) do
    @tpl.conclude
    |> Map.get(lang, "")
    |> fill(%{cvp: Map.get(@colony_vp, lang, ""), cmood: Map.get(@colony_mood, lang, "")})
    |> capitalize()
  end

  defp render_one({move, data, mode}, lang) do
    act = activity(data)
    table = if mode == :solo and Map.has_key?(@solo, move), do: @solo, else: @tpl

    table
    |> Map.fetch!(move)
    |> Map.get(lang, "")
    |> fill(%{
      name: to_string(Map.get(data, :who, "A UNI")),
      vp: get_in(@verbs, [act, lang]) || "",
      vp2: get_in(@verbs, [alt_activity(act), lang]) || "",
      state: get_in(@states, [state_key(data), lang]) || "",
      mood: get_in(@mood, [mood_key(Map.get(data, :emotion)), lang]) || get_in(@mood, [:default, lang])
    })
    |> capitalize()
  end

  defp fill(template, slots) do
    Enum.reduce(slots, template, fn {k, v}, acc ->
      String.replace(acc, "{#{k}}", to_string(v))
    end)
  end

  # capitalise the first alphabetic char (for pro-drop languages whose sentence starts on the
  # verb); leaves CJK/Arabic/Devanagari untouched (no case).
  defp capitalize(<<c::utf8, rest::binary>>) when c in ?a..?z, do: <<c - 32::utf8>> <> rest
  defp capitalize(s), do: s

  # --- show-state → lexical keys --------------------------------------------

  defp activity(data) do
    cond do
      Map.get(data, :action) == "mine" -> :mine
      Map.get(data, :action) == "eat" -> :eat
      Map.get(data, :context) in [:forage, :build, :flee, :social, :rest] -> Map.get(data, :context)
      true -> :explore
    end
  end

  # a DIFFERENT activity for the {vp2} slot (the temporal "then it …" second clause), for variety.
  defp alt_activity(act), do: Enum.find([:social, :rest, :explore, :forage], :explore, &(&1 != act))

  defp state_key(data) do
    s = Map.get(data, :senses, %{})

    cond do
      truthy(Map.get(s, "hurt")) or num(Map.get(s, "health"), 20) < 8 -> :hurt
      num(Map.get(s, "food"), 20) < 8 -> :hungry
      true -> emotion_state(Map.get(data, :emotion))
    end
  end

  defp emotion_state(:fear), do: :afraid
  defp emotion_state(:curious), do: :curious
  defp emotion_state(:content), do: :content
  defp emotion_state(:calm), do: :calm
  defp emotion_state(:weary), do: :weary
  defp emotion_state(_), do: :restless

  defp mood_key(e) when e in [:calm, :fear, :content, :curious, :fierce, :weary], do: e
  defp mood_key(_), do: :default

  # --- tiny matrix builders (mirror the genome's column-major priors) --------

  defp near_identity(n, p) do
    off = (1.0 - p) / (n - 1)
    for s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: p, else: off))
  end

  defp bcol(n, resolve) do
    for cur <- 0..(n - 1) do
      case Map.get(resolve, cur) do
        t when is_integer(t) and t != cur ->
          rest = if n > 2, do: 0.15 / (n - 2), else: 0.0

          for nx <- 0..(n - 1),
              do:
                (cond do
                   nx == cur -> 0.6
                   nx == t -> 0.25
                   true -> rest
                 end)

        _ ->
          off = 0.2 / (n - 1)
          for nx <- 0..(n - 1), do: if(nx == cur, do: 0.8, else: off)
      end
    end
  end

  defp normalize(v) do
    s = Enum.sum(v)
    if s > 0, do: Enum.map(v, &(&1 / s)), else: v
  end

  defp num(v, _d) when is_number(v), do: v
  defp num(_v, d), do: d
  defp truthy(true), do: true
  defp truthy(_), do: false
end
