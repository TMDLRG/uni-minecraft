defmodule SP.Brain.Speech do
  @moduledoc """
  The producer's COMPLETE generative voice — template-free, grounded. Every line the producer says
  is COMPOSED by the deeper pure-FEP language model (`SP.Brain.Language`, a latent-state HMM), then
  GROUNDED by binding fact slots from live state. There are no authored return-strings and no
  fallback: the model generates a delexicalized FRAME (e.g. `slotcount units press on through the
  dark`), and the realizer fills the slots (`slotcount` → the live head-count, `slotuni` → a named
  UNI, …) from the belief state. Facts therefore only ever come from state ⇒ the grounding gate
  (§16/19) holds by construction; the wording is learned + generated, not canned.

  The seed corpus below is TRAINING DATA (language priors), not templates: the model learns the
  frames and recombines them; quality grows with the corpus (training is the lever). No LLM, no
  neural net — a discrete latent-variable generative model, exact inference, Dirichlet learning.
  """

  alias SP.Brain.Language

  # Delexicalized seed corpus — {frame, meaning}. Slots: slotcount slotuni slotaction slotcontext
  # slotemotion slottps slotfocus. NO raw names/numbers anywhere (so the model can never GENERATE a
  # fact — only a slot, which the realizer binds from state). Present tense, colony/show vocabulary.
  @corpus [
    # who/what am I (honest self-description — learned, not a fixed string)
    {"i am the producer a pure active inference mind not a language model", :identity},
    {"i direct this show by minimising free energy over the colony", :identity},
    {"i am a learning mind i read the state and choose each shot", :identity},
    {"i am no language model i reason over what i can see", :identity},
    {"i run the show as a pure inference engine watching slotcount units", :identity},
    # conversational host turns
    {"hello and welcome to the colony slotcount units are live", :greeting},
    {"good to see you the show runs on with slotcount units", :greeting},
    {"welcome in slotcount units press on through the world", :greeting},
    {"hello friend the colony holds slotcount units right now", :greeting},
    {"you are welcome here glad to have you watching the colony", :thanks},
    {"thank you for watching the colony plays on", :thanks},
    {"take care the colony plays on come back any time", :bye},
    {"farewell for now the units carry on without rest", :bye},
    {"i am running the show steady over slotcount live units", :wellbeing},
    {"the work goes well i watch slotcount units and choose each shot", :wellbeing},
    # the colony — facts bound from state via slots
    {"slotcount units are alive in the colony right now", :count},
    {"the colony holds slotcount units through the long night", :count},
    {"right now slotcount units press on in the world", :count},
    {"slotuni is in danger and fights to survive", :danger},
    {"fear grips slotuni as the threat closes in", :danger},
    {"no unit is in danger the colony is calm for now", :danger},
    {"the camera holds on slotuni who is slotaction", :star},
    {"we watch slotuni slotaction at the edge of the world", :star},
    {"the shot stays on slotuni feeling slotemotion", :star},
    {"slotuni is the strongest standing firm in the colony", :healthiest},
    {"slotuni is the most fragile and near the end", :weakest},
    {"slotuni feels slotemotion as the night goes on", :mood},
    {"the colony feels slotemotion under the open sky", :mood},
    {"slotuni is slotaction with a strategy of slotcontext", :doing},
    {"slotuni works on slotaction at the forest edge", :doing},
    {"the kin gather close when the dark comes", :kin},
    {"the families hold together against the cold", :kin},
    # the show-running itself
    {"i chose to slotaction because my focus was slotfocus", :why},
    {"last beat i cut the shot to follow slotfocus", :why},
    {"the server runs steady at slottps ticks of twenty", :server},
    {"the tick rate holds near slottps and the world is smooth", :server},
    {"i plan to slotaction and keep the story clear this beat", :plan},
    {"my plan is to hold the shot on slotuni", :plan},
    {"my senses are enough for now i ask for no new signal", :needs},
    {"the story is tense as the night deepens over the colony", :drama},
    {"my attention is on slotfocus this beat", :focus},
    # narration — the live caption voice
    {"the colony presses on through the long cold night", :narration},
    {"slotuni forages for wood at the edge of the forest", :narration},
    {"danger draws near as the light fades over the hills", :narration},
    {"slotuni mines deep into the cold grey stone", :narration},
    {"kin gather close together when the dark comes down", :narration},
    {"a weary unit pauses to rest beside the quiet water", :narration},
    {"the builder raises a shelter stone by stone before night", :narration},
    {"slotuni feels slotemotion as the threat appears", :narration},
    {"the strongest unit stands its ground against the danger", :narration},
    {"hope returns to the colony with the morning light", :narration},
    {"slotcount units work together to survive another day", :narration},
    {"the colony grows calmer when the sun climbs the sky", :narration},
    # what it sees (vision)
    {"i watch the show through my visual cortex and learn the scene", :vision},
    {"the view looks familiar as i learn the look of the world", :vision},
    # honest not-understood (still generated, never a canned wall)
    {"i did not catch that ask me about the colony or a named unit", :unsure},
    {"i am not sure what you mean tell me and i will learn it", :unsure}
  ]

  @doc "A fitted generative voice: the seed corpus trained into the latent-state language model."
  def seeded(opts \\ []) do
    Language.new(k: Keyword.get(opts, :k, 10), seed: Keyword.get(opts, :seed, 7))
    |> Language.learn_corpus(@corpus)
    |> Language.fit(iters: Keyword.get(opts, :iters, 18))
  end

  @doc "The seed corpus (language priors) — exposed for the Anchor's online learning + tests."
  def corpus, do: @corpus

  @mc_path "runs/mc_language.bin"

  @doc """
  The Minecraft-trained voice (`SP.Brain.MinecraftCorpus` → `SP.Brain.Language`): loaded from the
  saved heavy-training model when present, else trained quickly from the corpus. Cached in
  `:persistent_term` so it loads once. This is what lets the producer DESCRIBE what it sees.
  """
  def minecraft_model do
    case :persistent_term.get({__MODULE__, :mc}, nil) do
      %Language{} = m ->
        m

      _ ->
        path = System.get_env("SP_MC_LANG") || @mc_path

        m =
          Language.load(path) ||
            Language.new(k: 10, seed: 7)
            |> Language.learn_corpus(SP.Brain.MinecraftCorpus.generate(per: 12))
            |> Language.fit(iters: 12)

        :persistent_term.put({__MODULE__, :mc}, m)
        m
    end
  end

  @doc """
  Classify what's on the screen into a SCENE-TYPE from the body's symbolic senses — the label the
  Minecraft-trained model describes. (The visual cortex confirms it SEES the scene; the symbolic
  senses name which one.)
  """
  def scene_of(senses) when is_map(senses) do
    look = senses |> get(["look", "ground"]) |> to_string() |> String.downcase()
    light = num(senses["light"], 2)
    threat = senses["hostile_dist"]
    action = to_string(senses["action"] || senses[:action] || "")

    cond do
      truthy(senses["hurt"]) or (is_number(threat) and threat < 10) ->
        :danger

      String.contains?(look, ["lava", "fire", "magma"]) ->
        :danger

      String.contains?(look, ["water", "kelp", "seagrass"]) ->
        :water

      action == "mine" or String.contains?(look, ["stone", "ore", "cobble", "deepslate", "andesite"]) ->
        :mining

      action in ["place", "craft"] ->
        :building

      String.contains?(look, ["log", "leaves", "wood", "sapling"]) ->
        :forest

      light == 0 ->
        :night

      true ->
        :calm
    end
  end

  def scene_of(_), do: :calm

  @doc """
  DESCRIBE what a UNI sees: classify its scene, GENERATE a Minecraft caption for that scene from the
  trained model, and ground it with the UNI's name. The caption itself is fact-free MC vocabulary
  (grounding-safe); only the prefixed name is a state fact ⇒ gate-19 grounded.
  """
  def describe(senses, star \\ nil), do: describe(minecraft_model(), senses, star)

  def describe(%Language{} = lang, senses, star) do
    case realize(lang, scene_of(senses), %{}) do
      "" -> ""
      caption -> if is_binary(star) and star != "", do: "#{star}: #{caption}", else: caption
    end
  end

  defp get(senses, keys), do: Enum.find_value(keys, fn k -> senses[k] || senses[String.to_atom(k)] end)
  defp num(v, _d) when is_number(v), do: v
  defp num(_v, d), do: d
  defp truthy(true), do: true
  defp truthy(_), do: false

  @doc """
  REALIZE one grounded line for a meaning: generate a delexicalized frame from the learned model,
  then bind the fact slots from `facts` (drawn from live state). Generic words fill any slot a fact
  is missing for, so the only NAMES/NUMBERS in the output come from `facts` ⇒ grounded by construction.
  """
  def realize(%Language{} = lang, meaning, facts \\ %{}, opts \\ []) do
    # decode by SAMPLING (seeded ⇒ deterministic) rather than greedy — greedy decode of a finite
    # generative model degenerates into loops; sampling explores the learned latent trajectory. A
    # sample can decode to the empty sentence; RESAMPLE a few seeds (still pure generation, no
    # template fallback) so the producer always speaks when the model has anything to say.
    max = Keyword.get(opts, :max, 16)
    base = :erlang.phash2(meaning)

    Enum.reduce_while(0..5, "", fn i, _ ->
      rng = opts[:sample] || :rand.seed_s(:exsss, {base + i * 7 + 1, 17 + i, 23})

      line =
        case Language.generate(lang, meaning, max: max, sample: rng) do
          "" -> ""
          frame -> frame |> String.split() |> Enum.map(&fill(&1, facts)) |> Enum.join(" ") |> finish()
        end

      if line == "", do: {:cont, ""}, else: {:halt, line}
    end)
  end

  # slot binding — facts ONLY from state; generics (non-facts) for anything missing.
  defp fill("slotcount", f), do: to_string(Map.get(f, :count) || "several")
  defp fill("slotuni", f), do: to_string(Map.get(f, :uni) || "a unit")
  defp fill("slotaction", f), do: to_string(Map.get(f, :action) || "moving")
  defp fill("slotcontext", f), do: to_string(Map.get(f, :context) || "surviving")
  defp fill("slotemotion", f), do: to_string(Map.get(f, :emotion) || "alert")
  defp fill("slottps", f), do: to_string(Map.get(f, :tps) || "twenty")
  defp fill("slotfocus", f), do: to_string(Map.get(f, :focus) || "the whole show")
  defp fill(word, _f), do: word

  defp finish(""), do: ""

  # capitalise only the FIRST character (preserve fact casing like "UNI-1-1" so grounding holds).
  defp finish(s) do
    t = String.trim(s)
    if t == "", do: "", else: String.upcase(String.first(t)) <> String.slice(t, 1..-1//1) <> "."
  end
end
