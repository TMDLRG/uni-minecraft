defmodule SP.Brain.Anchor do
  @moduledoc """
  The show's ANCHOR — the Producer UNI's question-answering voice. A human asks anything about
  the show and the anchor answers from the **full live belief state**, with NO language model:

    * the colony — `SP.Runtime.Board` snapshot (every UNI's senses, action, context, emotion,
      kin, intent);
    * the show-running itself — `SP.Producer.status` (the producer's last action + reasoning,
      its focus factor, server health/TPS, recent decisions, and any sensor requests);
    * what is on screen — the `SP.Brain.Director` broadcast (the current star + the multilingual
      caption it is narrating).

  Two design commitments make it a faithful UNI voice, not a chatbot:

    1. **Full comprehension** — it scans the WHOLE question and answers EVERY intent it finds
       (a multi-part question gets a multi-part answer), instead of stopping at the first match.
    2. **Full sight, zero hallucination** — it only ever states what it can read from the belief
       state; an unrecognised question gets a safe overview. No template invents a fact.

  Pure `answer/2` is the testable seam; the GenServer just assembles the live context (each
  source wrapped so a missing one degrades gracefully) and never *starts* the Producer to read
  it — it reads the producer only when it is already running.
  """
  use GenServer

  alias SP.Runtime.Board
  alias SP.Brain.{Director, Narrator, Reader}

  @name __MODULE__
  @max_intents 4
  @reader_path "runs/producer_reader.bin"

  # The producer's language PRIORS — a small seed corpus (phrase → meaning) the Reader starts from
  # and then GROWS, online, from every real question (the keyword router is its reliable teacher).
  # It LEARNS to read free language by pure active inference — no LLM. See SP.Brain.Reader.
  @seed [
    {"who are you", :identity},
    {"what are you", :identity},
    {"are you real", :identity},
    {"are you a robot", :identity},
    {"are you human", :identity},
    {"what is this show", :identity},
    {"how many are alive", :count},
    {"the population", :count},
    {"the head count", :count},
    {"how big is the cast", :count},
    {"the number of agents", :count},
    {"the crew size", :count},
    {"who is in danger", :danger},
    {"is anyone hurt", :danger},
    {"anyone near death", :danger},
    {"who is at risk", :danger},
    {"are they wounded", :danger},
    {"who is on camera", :star},
    {"who is the star", :star},
    {"who has the spotlight", :star},
    {"what are we watching", :star},
    {"who is in focus right now", :star},
    {"who is the strongest", :healthiest},
    {"the healthiest uni", :healthiest},
    {"the fittest one", :healthiest},
    {"who is the weakest", :weakest},
    {"the most fragile", :weakest},
    {"who is sick", :weakest},
    {"what is the mood", :mood},
    {"how do they feel", :mood},
    {"their emotion", :mood},
    {"are they happy", :mood},
    {"the kin groups", :kin},
    {"the families", :kin},
    {"who is related", :kin},
    {"where are they", :where},
    {"their location", :where},
    {"where is the colony", :where},
    {"what are they doing", :doing},
    {"what is going on", :doing},
    {"what is happening to them", :doing},
    {"why did you cut", :why},
    {"what is your reason", :why},
    {"explain that choice", :why},
    {"how come you did that", :why},
    {"how is the server", :server},
    {"the tick rate", :server},
    {"is it lagging", :server},
    {"system performance", :server},
    {"server health", :server},
    {"what just happened", :recent},
    {"recap recent events", :recent},
    {"the history so far", :recent},
    {"what is your plan", :plan},
    {"what comes next", :plan},
    {"your strategy", :plan},
    {"what will you do", :plan},
    {"do you need a sensor", :needs},
    {"what do you want", :needs},
    {"what are you missing", :needs},
    {"say it in spanish", :language},
    {"translate the caption", :language},
    {"what language", :language},
    {"how dramatic is it", :drama},
    {"is it tense", :drama},
    {"the tension level", :drama},
    {"what is your focus", :focus},
    {"what are you paying attention to", :focus},
    # conversational — the producer is a live HOST, not only a query box (it learns these too)
    {"hello there", :greeting},
    {"hey friend", :greeting},
    {"good morning", :greeting},
    {"good evening", :greeting},
    {"greetings host", :greeting},
    {"thanks so much", :thanks},
    {"thank you", :thanks},
    {"much appreciated", :thanks},
    {"goodbye for now", :bye},
    {"good night", :bye},
    {"see you soon", :bye},
    {"how is it going", :wellbeing},
    {"how are things", :wellbeing},
    {"hope you are well", :wellbeing},
    {"say something", :speak},
    {"speak to me", :speak},
    {"talk to me", :speak},
    {"narrate something", :speak}
  ]

  # NARRATION corpus — the producer's SPEAKING priors: authored show-style sentences (present
  # tense, colony/survival vocabulary) the Reader trains its word-TRANSITIONS on, so it composes
  # fluent-er, show-flavoured utterances. It grows online from the live narration it produces.
  @narration_corpus [
    "the colony presses on through the long night",
    "a unit forages for wood at the edge of the forest",
    "danger draws near as the light fades",
    "the brave one mines deep into the cold stone",
    "kin gather close when the dark comes",
    "a hungry wanderer searches the hills for food",
    "the builder shapes a shelter before nightfall",
    "fear ripples through the colony as a threat appears",
    "the strongest stands its ground against the danger",
    "a curious unit wanders into the unknown",
    "the colony grows calmer when the sun returns",
    "wood and stone slowly fill the stores",
    "a weary unit pauses to rest by the water",
    "the hunter strikes at the prey in the open field",
    "shelter rises stone by stone against the cold",
    "the camera holds on the unit that matters most",
    "tension builds as the night deepens",
    "the colony works together to survive another day",
    "a unit crafts its first simple tool",
    "hope returns with the morning light",
    "the colony gathers wood to build a shelter",
    "a hungry unit hunts for food in the tall grass",
    "the brave one stands guard while the others rest",
    "danger fades as the morning sun climbs the sky",
    "the colony presses on through cold and dark",
    "a young unit learns to mine the hard stone",
    "the camera turns to the unit that needs help",
    "kin stay close together when the threat is near",
    "the builder raises a wall against the rising danger",
    "calm settles over the colony as the food stores grow",
    "the strongest unit leads the others to safe ground",
    "a weary wanderer finds rest beside the quiet water"
  ]

  @doc false
  def seeded_reader, do: Reader.new() |> Reader.learn_corpus(@seed) |> Reader.train_corpus(@narration_corpus)

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: @name)

  def ensure_started(opts \\ []) do
    case Process.whereis(@name) do
      nil ->
        case GenServer.start(__MODULE__, opts, name: @name) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      pid ->
        pid
    end
  end

  @doc "Answer a free-text question about the show. Returns `%{kind, text, refs}`."
  def ask(question, opts \\ []) do
    ensure_started()
    GenServer.call(@name, {:ask, question, opts})
  end

  @doc """
  OBSERVE a line the producer SPOKE (narration) — the language faculty learns its word-transitions
  from its own voice, so the ONE UNI learns from everything it SAYS as well as everything it's ASKED.
  """
  def observe(text) do
    ensure_started()
    GenServer.cast(@name, {:observe, text})
  end

  @doc """
  MIGRATE the running producer's language forward (used after a hot code load): fold the current
  seed corpus (richer narration + conversational priors) INTO the live reader via `Reader.merge/2`,
  preserving every word it has learned online while adding the new vocabulary, trigrams, and host
  intents — and back-filling fields (e.g. `:tri`) on a reader created before they existed. Persists.
  """
  def migrate_language do
    ensure_started()
    GenServer.call(@name, :migrate_language)
  end

  @impl true
  def init(_opts) do
    # load the producer's learned language, or seed it from priors (then it grows from real questions).
    {:ok, %{reader: Reader.load(@reader_path) || seeded_reader(), asks: 0}}
  end

  @impl true
  def handle_call({:ask, question, _opts}, _from, state) do
    bc = safe(fn -> Director.broadcast() end, %{star: nil, lines: []})
    # read the producer ONLY if it is already alive — never start it just to answer a question.
    prod = if Process.whereis(SP.Producer), do: safe(fn -> SP.Producer.status() end, nil), else: nil

    ctx = %{
      rows: safe(fn -> Board.all() end, []),
      star: Map.get(bc, :star),
      lines: Map.get(bc, :lines, []),
      producer: prod
    }

    # parse with the LEARNED reader, and LEARN from this question (the keyword router teaches it).
    {ans, reader} = answer_learn(to_string(question), ctx, state.reader)
    asks = state.asks + 1
    # persist periodically so the producer's language survives restarts (like the agents' memory).
    if rem(asks, 25) == 0, do: safe(fn -> Reader.save(reader, @reader_path) end, :ok)
    {:reply, ans, %{state | reader: reader, asks: asks}}
  end

  @impl true
  def handle_call(:migrate_language, _from, state) do
    # union the (new, richer) seed corpus with everything learned online — no learning is lost,
    # and the reader gains the new vocabulary/trigrams + any newly-added struct fields.
    reader = Reader.merge(seeded_reader(), state.reader)
    safe(fn -> Reader.save(reader, @reader_path) end, :ok)
    {:reply, Reader.knowledge(reader), %{state | reader: reader}}
  end

  @impl true
  def handle_cast({:observe, text}, state) do
    # learn the word-transitions of a line the producer spoke (generation fluency grows from its
    # own voice); same persistence cadence as questions.
    reader = Reader.train(state.reader, text)
    asks = state.asks + 1
    if rem(asks, 25) == 0, do: safe(fn -> Reader.save(reader, @reader_path) end, :ok)
    {:noreply, %{state | reader: reader, asks: asks}}
  end

  # --- intent classification (pure, deterministic — exposed for tests) -------

  @doc """
  Classify + answer a question against the assembled `ctx`. PURE. Scans for ALL matching
  intents (capped at #{@max_intents}) and combines their answers; falls back to a per-agent
  dossier (if a UNI id is named) or a safe overview when nothing matches.
  """
  # Keyword-only path (pure, back-compat): an EMPTY reader contributes nothing, so this reproduces
  # the original deterministic keyword routing exactly (kept for the existing tests + callers).
  def answer(question, ctx) when is_map(ctx), do: answer_with(question, ctx, Reader.new())

  @doc """
  Reader-AWARE answer (pure): the LEARNED reader's inferred meanings UNION the keyword matches, so
  the producer parses free language (generalising past keywords) while still grounded. If neither
  fires, it asks an epistemic CLARIFY question (when two meanings are close) else an honest fallback.
  """
  def answer_with(question, ctx, %Reader{} = reader) do
    q = to_string(question)
    dq = String.downcase(q)
    subj = subject(q)
    # carry the LEARNED reader in the context so host-turn handlers can show what it has learned
    # and SPEAK in its own composed voice (grounded; never invents a fact).
    ctx = Map.put(ctx, :reader, reader)

    # a request to TELL THE STORY short-circuits to the grade-4 Narrator (a whole paragraph).
    if Regex.match?(~r/\bstory\b|recap|narrate|what.?s happening|describe the show|tell .*about the show/, dq) do
      story(ctx)
    else
      answer_intents(dq, ctx, subj, reader)
    end
  end

  @doc """
  Answer AND learn: returns `{answer, reader'}`. The keyword router is the reliable TEACHER — the
  reader learns the question under every intent the regex confidently recognised, so its vocabulary
  GROWS from real questions with no self-reinforcing drift. This is the producer learning to read.
  """
  def answer_learn(question, ctx, %Reader{} = reader) do
    ans = answer_with(question, ctx, reader)
    taught = keyword_intents(String.downcase(to_string(question)))
    reader = Enum.reduce(taught, reader, fn intent, r -> Reader.learn(r, question, intent) end)
    {ans, reader}
  end

  defp keyword_intents(dq), do: for({re, kind} <- intents(), Regex.match?(re, dq), do: kind) |> Enum.uniq()

  defp answer_intents(dq, ctx, subj, reader) do
    learned = Reader.meanings(reader, dq, k: @max_intents)
    matched = (learned ++ keyword_intents(dq)) |> Enum.uniq() |> Enum.take(@max_intents)

    kinds =
      cond do
        matched != [] ->
          matched

        # nothing matched: if two meanings are CLOSE, ask which (epistemic information-seeking);
        # else a named UNI ⇒ dossier; else an honest :unsure (never guess / hallucinate).
        true ->
          case Reader.classify(reader, dq) do
            {:ambiguous, pair} -> [{:clarify, pair}]
            _ -> (subj && [:dossier]) || [:unsure]
          end
      end

    kinds
    |> Enum.map(&handle(&1, ctx, subj))
    |> Enum.reject(&is_nil/1)
    |> combine(ctx)
  end

  # Back-compat seam: the original `answer(question, rows, star)` (colony-only) still works.
  @doc false
  def answer(question, rows, star) when is_list(rows) do
    answer(question, %{rows: rows, star: star, lines: [], producer: nil})
  end

  # Ordered intent table (priority high→low). Each question is matched against ALL of these.
  defp intents do
    [
      # — conversational HOST turns (a viewer talking TO the producer, not querying the colony).
      # Word-boundaried so "hi" never fires inside "this"/"which"; these COMBINE with any real
      # query in the same line ("hey, who's in danger?" greets AND answers).
      {~r/\b(hi|hello|hey|yo|hiya|howdy|sup|greetings)\b|\bgood (morning|afternoon|evening|day)\b/,
       :greeting},
      {~r/\b(thanks|thank you|thank u|thx|ty|cheers)\b|appreciate (it|that)|much appreciated/, :thanks},
      {~r/\b(bye|goodbye|goodnight|farewell|cya)\b|good night|see (you|ya)( soon| later)?|take care/, :bye},
      {~r/\bhow (are|r) (you|u)\b|how.?s it going|how are things|how do you do|how have you been|are you (ok|okay|well|alright)/,
       :wellbeing},
      {~r/\b(say something|speak|talk to me|improvise|freestyle)\b|in your own (words|voice)|narrate something|let me hear you/,
       :speak},
      # — who/what am I (honest self-description; no language model) —
      {~r/who are you|what are you|what is this|who.s the producer|are you (a |an )?(ai|llm|bot|human|real|fake|gpt)|are you real|explain yourself|what.s your name/,
       :identity},
      # — the colony —
      {~r/how many|head ?count|alive|populat|cast size|how big/, :count},
      {~r/danger|attack|threat|hurt|dying|wounded|at risk|is .* safe/, :danger},
      {~r/camera|on screen|watching|who.*\bon\b|focused on|spotlight on/, :star},
      {~r/strong|healthi|fittest|the best|top/, :healthiest},
      {~r/weak|sick|lowest|worst|least healthy|frail|near death/, :weakest},
      {~r/scared|afraid|fear|feel|emotion|mood|happy|sad|angry|calm/, :mood},
      {~r/\bkin\b|family|relativ|group|clan/, :kin},
      {~r/\bwhere\b|location|position|located/, :where},
      {~r/doing|behav|busy|action of|what is .* up to/, :doing},
      # — the show-running itself (the producer's own beliefs) —
      {~r/\bwhy\b|reason|because|how come|what made|explain/, :why},
      {~r/server|\btps\b|lag|perform|\bfps\b|frame ?rate|how healthy|system health/, :server},
      {~r/just happen|recent|history|so far|earlier|last few|recap|what.*happened/, :recent},
      {~r/\bplan\b|what.*next|strateg|intend|going to|about to/, :plan},
      {~r/sensor|need (a|more|new|another)|missing|new signal|request|what do you (want|need)/, :needs},
      {~r/languag|translat|in (chinese|mandarin|spanish|arabic|hindi)|say it in/, :language},
      {~r/dramat|tension|excit|interesting|\bstory\b|\bplot\b|tense/, :drama},
      {~r/your focus|attention|paying attention|concentrat/, :focus},
      # VISION (the producer's video sight): what its visual cortex is seeing on the feed.
      {~r/what do you see|through your eyes|your (eyes|vision|visual|video|sight)|describe the (view|scene)|what does it look like|what.s on your screen/,
       :vision}
    ]
  end

  # --- dispatch --------------------------------------------------------------

  defp handle({:clarify, pair}, _c, _s), do: clarify(pair)
  defp handle(:identity, c, _s), do: identity(c)
  defp handle(:unsure, c, _s), do: unsure(c)
  defp handle(:vision, c, _s), do: vision_report(c)
  defp handle(:greeting, c, _s), do: greeting(c)
  defp handle(:thanks, _c, _s), do: thanks()
  defp handle(:bye, _c, _s), do: bye()
  defp handle(:wellbeing, c, _s), do: wellbeing(c)
  defp handle(:speak, c, _s), do: speak(c)
  defp handle(:count, c, _s), do: count_alive(c.rows)
  defp handle(:danger, c, _s), do: who_in_danger(c.rows)
  defp handle(:star, c, _s), do: current_star(c.rows, c.star)
  defp handle(:healthiest, c, _s), do: healthiest(c.rows)
  defp handle(:weakest, c, _s), do: weakest(c.rows)
  defp handle(:mood, c, s), do: mood_of(c.rows, s || c.star)
  defp handle(:kin, c, _s), do: kin_summary(c.rows)
  defp handle(:where, c, _s), do: where_answer(c)
  defp handle(:doing, c, s), do: doing(c.rows, s || c.star)
  defp handle(:dossier, c, s), do: dossier(c.rows, s)
  defp handle(:overview, c, _s), do: overview(c.rows, c.star)
  # producer-aware (skip — nil — when the producer isn't running; answer falls back gracefully):
  defp handle(:why, c, s), do: with_producer(c, &why(&1, c, s))
  defp handle(:server, c, _s), do: with_producer(c, &server(&1))
  defp handle(:recent, c, _s), do: with_producer(c, &recent(&1))
  defp handle(:plan, c, s), do: plan(c, s)
  defp handle(:needs, c, _s), do: with_producer(c, &needs(&1))
  defp handle(:language, c, _s), do: language_of(c)
  defp handle(:drama, c, _s), do: with_producer(c, &drama_level(&1))
  defp handle(:focus, c, _s), do: with_producer(c, &focus_of(&1))

  defp with_producer(%{producer: p}, fun) when is_map(p), do: fun.(p)
  defp with_producer(_c, _fun), do: nil

  # combine 0/1/N handler results: one passes through unchanged (preserves :kind/:refs);
  # several fold into one :multi answer (texts joined, refs unioned).
  defp combine([], c), do: overview(c.rows, c.star)
  defp combine([one], _c), do: one

  defp combine(results, _c) do
    %{
      kind: :multi,
      text: results |> Enum.map(& &1.text) |> Enum.join(" "),
      refs: results |> Enum.flat_map(& &1.refs) |> Enum.uniq()
    }
  end

  # --- colony handlers (unchanged behaviour) ---------------------------------

  defp count_alive(rows), do: %{kind: :count, text: "#{length(rows)} UNIs are live right now.", refs: []}

  defp who_in_danger(rows) do
    danger =
      Enum.filter(rows, fn r ->
        s = senses(r)
        truthy(s["hurt"]) or near?(s["hostile_dist"]) or num(s["health"], 20) < 8
      end)

    names = Enum.map(danger, & &1.username)

    text =
      case names do
        [] -> "No one is in danger right now — the colony is calm."
        [u] -> "#{u} is in danger."
        many -> "#{Enum.join(many, ", ")} are in danger."
      end

    %{kind: :danger, text: text, refs: names}
  end

  defp current_star(rows, star) do
    case find(rows, star) do
      nil ->
        %{kind: :star, text: "The camera is settling on the colony.", refs: []}

      r ->
        %{
          kind: :star,
          text: "The camera is on #{star} — currently #{action(r)} (#{ctx_of(r)}).",
          refs: [star]
        }
    end
  end

  defp healthiest(rows) do
    case rows do
      [] ->
        %{kind: :health, text: "No UNIs are live yet.", refs: []}

      _ ->
        r = Enum.max_by(rows, fn x -> num(senses(x)["health"], 0) end)

        %{
          kind: :health,
          text: "#{r.username} is the healthiest at #{round(num(senses(r)["health"], 0))}/20.",
          refs: [r.username]
        }
    end
  end

  defp weakest(rows) do
    case rows do
      [] ->
        %{kind: :health, text: "No UNIs are live yet.", refs: []}

      _ ->
        r = Enum.min_by(rows, fn x -> num(senses(x)["health"], 20) end)

        %{
          kind: :health,
          text: "#{r.username} is the most fragile at #{round(num(senses(r)["health"], 20))}/20.",
          refs: [r.username]
        }
    end
  end

  defp mood_of(rows, who) do
    case find(rows, who) do
      nil -> %{kind: :mood, text: "I can't see that one right now.", refs: []}
      r -> %{kind: :mood, text: "#{r.username} reads #{Map.get(r, :emotion, :calm)}.", refs: [r.username]}
    end
  end

  defp kin_summary(rows) do
    by_kin =
      rows |> Enum.group_by(& &1.kin) |> Enum.map(fn {k, rs} -> "kin #{k}: #{length(rs)}" end) |> Enum.sort()

    text =
      if by_kin == [], do: "No kin groups are live yet.", else: "Kin groups — #{Enum.join(by_kin, " · ")}."

    %{kind: :kin, text: text, refs: []}
  end

  defp doing(rows, who) do
    case find(rows, who) do
      nil ->
        %{kind: :doing, text: "I can't see that one right now.", refs: []}

      r ->
        %{
          kind: :doing,
          text: "#{r.username} is #{action(r)} — strategy #{ctx_of(r)}, planning #{intent(r)}.",
          refs: [r.username]
        }
    end
  end

  defp dossier(rows, who) do
    case find(rows, who) do
      nil ->
        %{kind: :dossier, text: "#{who} isn't on the board right now.", refs: []}

      r ->
        s = senses(r)

        text =
          "#{r.username} (kin #{r.kin}): #{round(num(s["health"], 20))} HP, #{round(num(s["food"], 20))} food · " <>
            "#{action(r)} · strategy #{ctx_of(r)} · reads #{Map.get(r, :emotion, :calm)}."

        %{kind: :dossier, text: text, refs: [r.username]}
    end
  end

  defp overview(rows, star) do
    mood = rows |> Enum.map(&Map.get(&1, :emotion, :calm)) |> mode() || :calm
    s = if star, do: "the camera follows #{star}", else: "the camera roams the colony"

    %{
      kind: :overview,
      text: "#{length(rows)} UNIs are live; #{s}; the mood is #{mood}.",
      refs: List.wrap(star)
    }
  end

  # IDENTITY — an honest self-description. The producer is a pure active-inference agent; it
  # does NOT use a language model, and says so plainly when asked what it is. It also shows the
  # CONCRETE, growing evidence that it is learning the language: its live vocabulary size.
  defp identity(c) do
    %{
      kind: :identity,
      refs: [],
      text:
        "I'm the Producer — a pure active-inference agent, not a language model. I direct this " <>
          "show by choosing each camera cut and narration to minimise expected free energy over the " <>
          "colony's live state, and I answer by reading that state directly (never inventing facts). " <>
          "Right now #{length(c.rows)} UNIs are live." <> learned_suffix(c)
    }
  end

  # the visible PROOF it is learning: how much language it has folded in so far. Grows as the show
  # runs (every question asked, every line spoken). Empty on a fresh reader ⇒ it makes no claim.
  defp learned_suffix(c) do
    case Map.get(c, :reader) do
      %Reader{} = r ->
        k = Reader.knowledge(r)

        if k.words > 0,
          do:
            " And I keep learning to talk as we go — #{k.words} words across #{map_size(k.examples)} kinds of question so far.",
          else: ""

      _ ->
        ""
    end
  end

  # GREETING — a viewer says hello. The producer answers as a live HOST: warm, in character, and
  # GROUNDED (the live head-count is read, never invented), then invites a real question.
  defp greeting(c) do
    %{
      kind: :greeting,
      refs: [],
      text:
        "Hi! I'm the Producer, directing this live colony — #{length(c.rows)} UNIs are on screen right now. " <>
          "Ask me how many are in the colony, who's in danger, who's on camera, why I made my last cut, or about a named UNI." <>
          learned_suffix(c)
    }
  end

  defp thanks do
    %{
      kind: :thanks,
      refs: [],
      text: "You're welcome — glad you're watching. Ask me anything about the colony."
    }
  end

  # VISION — what the producer's visual cortex (UNI.OS) infers from the live video feed. It reports
  # only the discrete scene it learned (never pixels), and honestly says when its sight is off.
  defp vision_report(c) do
    star = Map.get(c, :star)
    star_row = Enum.find(Map.get(c, :rows, []), &(to_string(Map.get(&1, :username)) == to_string(star)))
    seen = star_row && safe(fn -> SP.Brain.Speech.describe(Map.get(star_row, :senses, %{}), star) end, nil)

    watching =
      case SP.Brain.Vision.percept("producer") do
        %{surprise: surp} when is_number(surp) ->
          "I'm watching through my visual cortex — the view is #{SP.Brain.Vision.novelty(surp)}."

        _ ->
          "I'm watching the colony through my visual cortex."
      end

    text =
      if is_binary(seen) and seen != "",
        # the producer DESCRIBES what it sees, generated from its Minecraft-trained voice, grounded
        do:
          "#{watching} I see — #{seen} (I learn the look of the world from my own video feed; no script, no language model.)",
        else:
          watching <>
            " I learn the look of every scene from my own video feed — no script, and I only report the scene I've inferred, never raw pixels."

    %{kind: :vision, refs: List.wrap(star), text: text}
  end

  defp bye do
    %{kind: :bye, refs: [], text: "Take care — the colony plays on. Come back any time."}
  end

  # WELLBEING — "how are you?". Honest + grounded: the producer reports its own running state.
  defp wellbeing(c) do
    %{
      kind: :wellbeing,
      refs: [],
      text:
        "I'm running the show — directing #{length(c.rows)} live UNIs and picking each shot to keep the " <>
          "story clear. The work is steady." <> learned_suffix(c)
    }
  end

  # SPEAK — show the producer's OWN learned voice on demand: a line COMPOSED from the trigram model
  # it has grown from everything it has heard and said. Honestly framed as learned (not scripted,
  # not an LLM); it improves as the corpus grows. Falls back gracefully before it has enough words.
  defp speak(c) do
    case Map.get(c, :reader) do
      %Reader{} = r ->
        line = first_nonempty([Reader.compose(r, :narration, max: 14), Reader.compose(r, :doing, max: 10)])
        framed = if line == "", do: "I'm still gathering words.", else: String.capitalize(line) <> "."

        %{
          kind: :speak,
          refs: [],
          text:
            "In my own learned voice: \"#{framed}\" " <>
              "I compose that from everything I've heard and said — no script, no language model. It grows as the show goes on."
        }

      _ ->
        %{kind: :speak, refs: [], text: "I'm still learning to speak freely."}
    end
  end

  defp first_nonempty(list), do: Enum.find(list, "", &(&1 != ""))

  # CLARIFY (epistemic information-seeking, active-inference style): two meanings are close, so
  # rather than guess, the producer UTTERS a question to gather the disambiguating observation.
  defp clarify([a, b]) do
    %{
      kind: :clarify,
      refs: [],
      text:
        "I'm not certain what you mean — #{intent_label(a)}, or #{intent_label(b)}? Tell me and I'll learn it."
    }
  end

  defp clarify(_), do: unsure(%{rows: [], star: nil})

  # human-readable gloss of an intent, for the clarify question.
  defp intent_label(:count), do: "how many are in the colony"
  defp intent_label(:danger), do: "who's in danger"
  defp intent_label(:star), do: "who's on camera"
  defp intent_label(:healthiest), do: "who's strongest"
  defp intent_label(:weakest), do: "who's most fragile"
  defp intent_label(:mood), do: "the mood"
  defp intent_label(:kin), do: "the kin groups"
  defp intent_label(:where), do: "where they are"
  defp intent_label(:doing), do: "what they're doing"
  defp intent_label(:why), do: "why I made my last cut"
  defp intent_label(:server), do: "the server health"
  defp intent_label(:recent), do: "what just happened"
  defp intent_label(:plan), do: "my plan"
  defp intent_label(:needs), do: "what sensor I need"
  defp intent_label(:language), do: "the caption language"
  defp intent_label(:drama), do: "how dramatic it is"
  defp intent_label(:focus), do: "what I'm focused on"
  defp intent_label(:identity), do: "who I am"
  defp intent_label(other), do: to_string(other)

  # UNSURE — the question matched no known intent and named no UNI. Rather than return a
  # confident overview as if we'd understood (which would look like a canned answer), we SAY we
  # didn't recognise it, list what we can answer, and append the real overview as honest context.
  defp unsure(c) do
    ov = overview(c.rows, c.star)

    %{
      kind: :unsure,
      refs: ov.refs,
      text:
        "I don't recognise that one yet — I read your words against what I can see in the colony, and " <>
          "I keep learning, but I'd rather say so than invent an answer. Try: how many are in the colony, who's in " <>
          "danger, what the camera is on, why I made my last cut, the server health, the mood, my plan, or a " <>
          "named UNI (e.g. UNI-1-1). For context: #{ov.text}"
    }
  end

  # the grade-4 STORY: hand the colony to the Narrator UNI, which writes a multi-clause scene
  # paragraph (the producer's voice at a fourth-grade reading/writing level).
  defp story(%{rows: []} = c), do: overview(c.rows, c.star)

  defp story(%{rows: rows}) do
    text = Narrator.write(narr_rows(rows)).en
    refs = rows |> Enum.map(&Map.get(&1, :username)) |> Enum.reject(&is_nil/1) |> Enum.take(4)
    %{kind: :story, text: text, refs: refs}
  end

  # Board rows use :username; the Narrator wants :who.
  defp narr_rows(rows) do
    Enum.map(rows, fn r ->
      %{
        who: Map.get(r, :username),
        emotion: Map.get(r, :emotion),
        context: Map.get(r, :context),
        action: Map.get(r, :action),
        senses: senses(r)
      }
    end)
  end

  # WHERE — an honest, on-covenant answer: no UNI's coordinates ever leave its body (the Markov
  # blanket), so the producer cannot report positions; it frames who matters instead.
  defp where_answer(%{star: star}) do
    tail = if star, do: " — right now the camera is on #{star}.", else: "."

    %{
      kind: :where,
      text: "I don't track positions: by design, no UNI's coordinates leave its body#{tail}",
      refs: List.wrap(star)
    }
  end

  # --- show-running handlers (the producer's own beliefs) --------------------

  defp why(p, _c, _s) do
    act = phrase_action(Map.get(p, :action, :noop))
    foc = focus_name(p)
    drama = latest_drama_label(p)
    tail = if drama, do: " — the colony is #{drama}", else: ""

    %{
      kind: :why,
      text: "Last beat I chose to #{act}, because my attention was on #{foc}#{tail}.",
      refs: List.wrap(Map.get(p, :star))
    }
  end

  defp server(p) do
    tps = get_in(p, [:tps, :tps])
    up = get_in(p, [:tps, :up])

    text =
      cond do
        up == false ->
          "The server looks down — I can't read its tick rate."

        is_number(tps) and tps < 18.0 ->
          "The server is lagging at #{Float.round(tps, 1)} TPS; I'm clearing clutter to recover it."

        is_number(tps) ->
          "The server is healthy at #{Float.round(tps, 1)} of 20 TPS."

        true ->
          "Server health looks nominal."
      end

    %{kind: :server, text: text, refs: []}
  end

  defp recent(p) do
    case Map.get(p, :knowledge, []) do
      [] ->
        %{kind: :recent, text: "The show just started — nothing to recap yet.", refs: []}

      log ->
        moves = log |> Enum.take(4) |> Enum.map(&phrase_action(&1.action)) |> Enum.join(", then ")
        %{kind: :recent, text: "Recently I chose to #{moves}.", refs: []}
    end
  end

  # the producer's plan is its current stance; for a named UNI, surface that agent's intent.
  defp plan(%{rows: rows} = _c, subj) when is_binary(subj) do
    case find(rows, subj) do
      nil -> %{kind: :plan, text: "#{subj} isn't on the board right now.", refs: []}
      r -> %{kind: :plan, text: "#{r.username} is planning #{intent(r)}.", refs: [r.username]}
    end
  end

  defp plan(%{producer: p}, _subj) when is_map(p) do
    %{
      kind: :plan,
      text: "My plan this beat is to #{phrase_action(Map.get(p, :action, :noop))}.",
      refs: List.wrap(Map.get(p, :star))
    }
  end

  defp plan(_c, _s), do: nil

  defp needs(p) do
    case Map.get(p, :requests, []) do
      [] ->
        %{kind: :needs, text: "My senses are sufficient right now — I'm not asking for new ones.", refs: []}

      reqs ->
        factors = reqs |> Enum.map(&to_string(Map.get(&1, :factor, "?"))) |> Enum.uniq() |> Enum.join(", ")
        %{kind: :needs, text: "I've asked for a richer sensor for: #{factors}.", refs: []}
    end
  end

  defp language_of(c) do
    case c.lines do
      [line | _] when is_map(line) ->
        i = Map.get(line, :i18n, %{})

        parts =
          for {lang, label} <- [{:zh, "中文"}, {:hi, "हिन्दी"}, {:es, "Español"}, {:ar, "العربية"}],
              t = Map.get(i, lang),
              t not in [nil, ""],
              do: "#{label}: #{t}"

        text =
          if parts == [],
            do: "The current caption is: #{Map.get(line, :text, "—")}",
            else: "Current caption — " <> Enum.join(parts, " · ")

        %{kind: :language, text: text, refs: []}

      _ ->
        %{kind: :language, text: "No caption is on screen yet.", refs: []}
    end
  end

  defp drama_level(p) do
    case latest_drama_label(p) do
      nil -> %{kind: :drama, text: "The story is quiet right now.", refs: []}
      label -> %{kind: :drama, text: "The story is #{label} right now.", refs: List.wrap(Map.get(p, :star))}
    end
  end

  defp focus_of(p) do
    %{kind: :focus, text: "My attention is on #{focus_name(p)} this beat.", refs: []}
  end

  # --- producer-signal helpers ----------------------------------------------

  # the producer's focus is a factor index; name it (and say what it means) from the genome order.
  defp focus_name(p) do
    names = SP.Producer.Genome.modalities() |> Enum.map(& &1.name)
    name = Enum.at(names, Map.get(p, :focus, 0))

    case name do
      :drama -> "how tense the colony is"
      :spotlight -> "who deserves the spotlight"
      :coverage -> "how fresh the current shot is"
      :pacing -> "the rhythm of the show"
      :population -> "the size of the cast"
      :server_health -> "the server's health"
      :error_rate -> "system errors"
      :diversity -> "variety on camera"
      :cohesion -> "how together the colony is"
      :economy -> "the colony's build progress"
      :momentum -> "the show's momentum"
      other when not is_nil(other) -> to_string(other)
      _ -> "the whole show"
    end
  end

  defp latest_drama_label(p) do
    case Map.get(p, :knowledge, []) do
      [%{drama: d} | _] when is_integer(d) -> drama_word(d)
      _ -> nil
    end
  end

  defp drama_word(4), do: "at a climax"
  defp drama_word(3), do: "in crisis"
  defp drama_word(2), do: "active"
  defp drama_word(1), do: "simmering"
  defp drama_word(_), do: "quiet"

  # the producer's motor repertoire, in human terms (for :why / :recent / :plan).
  defp phrase_action(:hold), do: "hold the shot"
  defp phrase_action(:cut_to_drama), do: "cut to the drama"
  defp phrase_action(:cut_to_subject), do: "cut to another cast member"
  defp phrase_action(:b_roll), do: "roll a beauty shot"
  defp phrase_action(:widen), do: "widen to an establishing shot"
  defp phrase_action(:beat_crisis), do: "narrate the crisis"
  defp phrase_action(:beat_social), do: "narrate the social beat"
  defp phrase_action(:beat_mind), do: "narrate their inner state"
  defp phrase_action(:beat_recap), do: "recap the story"
  defp phrase_action(:spawn_agent), do: "bring in a new cast member"
  defp phrase_action(:cull_agent), do: "retire a cast member"
  defp phrase_action(:health_tps), do: "clear clutter to protect server health"
  defp phrase_action(:health_restart_cam), do: "re-acquire the camera"
  defp phrase_action(:noop), do: "wait a beat"
  defp phrase_action(other), do: to_string(other)

  # --- generic helpers -------------------------------------------------------

  defp subject(q), do: (m = Regex.run(~r/UNI-\d+-\d+/i, q)) && hd(m)
  defp find(_rows, nil), do: nil
  defp find(rows, u), do: Enum.find(rows, &(String.downcase(&1.username) == String.downcase(u)))
  defp senses(r), do: Map.get(r, :senses, %{})
  defp action(r), do: Map.get(r, :action) || "—"
  defp ctx_of(r), do: Map.get(r, :context) || "exploring"

  defp intent(r),
    do:
      r
      |> Map.get(:intent, [])
      |> Enum.take(3)
      |> Enum.map(&to_string/1)
      |> Enum.join(" → ")
      |> blank("its next move")

  defp blank("", d), do: d
  defp blank(s, _d), do: s
  defp mode([]), do: nil
  defp mode(xs), do: xs |> Enum.frequencies() |> Enum.max_by(&elem(&1, 1)) |> elem(0)

  defp num(v, _d) when is_number(v), do: v
  defp num(_v, d), do: d
  defp truthy(true), do: true
  defp truthy(_), do: false
  defp near?(v), do: is_number(v) and v < 10.0

  defp safe(fun, default) do
    try do
      fun.()
    catch
      _, _ -> default
    end
  end
end
