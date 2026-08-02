defmodule SP.Brain.ReaderTest do
  @moduledoc """
  UNI reading, rung 1: the producer LEARNS word→meaning from examples and PARSES free text by
  inferring meaning (categorical free-energy minimisation) — not keyword matching, not an LLM.
  These tests are the falsifiable claim: it generalises to unseen paraphrases, admits ignorance,
  and genuinely learns from new evidence.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.Reader

  # a small seed corpus over the producer's question-intents (content words chosen so meaning is
  # carried by EVIDENCE, not exact phrasing). Deliberately small — the point is it LEARNS + GENERALISES.
  @corpus [
    {"how many unis are alive", :count},
    {"what is the population", :count},
    {"the head count", :count},
    {"the number of agents", :count},
    {"who is in danger", :danger},
    {"is anyone hurt", :danger},
    {"anyone near death", :danger},
    {"who is at risk", :danger},
    {"why did you cut", :why},
    {"what is your reason", :why},
    {"explain that choice", :why},
    {"how is the server", :server},
    {"the tick rate", :server},
    {"is it lagging", :server},
    {"system performance", :server},
    {"what is the mood", :mood},
    {"how do they feel", :mood},
    {"their emotion", :mood},
    {"what is your plan", :plan},
    {"what comes next", :plan},
    {"your strategy", :plan},
    {"who is on camera", :star},
    {"who has the spotlight", :star},
    {"who is the strongest", :healthiest},
    {"the fittest one", :healthiest},
    {"are you real", :identity},
    {"are you a robot", :identity},
    {"are you human", :identity}
  ]

  setup do
    {:ok, reader: Reader.learn_corpus(Reader.new(), @corpus)}
  end

  test "reads TRAINED phrasings correctly", %{reader: r} do
    assert Reader.meaning(r, "who is in danger") == :danger
    assert Reader.meaning(r, "the tick rate") == :server
    assert Reader.meaning(r, "are you a robot") == :identity
  end

  test "GENERALISES to unseen paraphrases via learned word-evidence (keyword routing would miss these)", %{
    reader: r
  } do
    # none of these are in the corpus; meaning is inferred from shared content words.
    assert Reader.meaning(r, "count the agents") == :count
    assert Reader.meaning(r, "is the tick rate stable today") == :server
    assert Reader.meaning(r, "explain your reason for that") == :why
    assert Reader.meaning(r, "tell me the strategy") == :plan
  end

  test "ADMITS ignorance — gibberish or unknown vocabulary returns :unsure (no hallucination)", %{reader: r} do
    assert Reader.meaning(r, "xyzzy frobnicate qwerty") == :unsure
    assert Reader.meaning(r, "banana telescope") == :unsure
  end

  test "genuinely LEARNS — a phrase it can't read becomes readable after one example", %{reader: r} do
    # "slow" is not in the vocabulary yet → no evidence → :unsure
    assert Reader.meaning(r, "is it slow") == :unsure
    # teach it ONE example, and it now reads "slow" as a server concern
    r2 = Reader.learn(r, "is it slow", :server)
    assert Reader.meaning(r2, "is it slow") == :server
    # generalises the newly-learned "slow" to other server-flavoured contexts (no ambiguous words)
    assert Reader.meaning(r2, "the server is slow") == :server
  end

  test "posterior is a proper distribution and inference is deterministic (pure, gate-14 clean)", %{reader: r} do
    posterior = Reader.infer(r, "how many agents")
    total = posterior |> Enum.map(&elem(&1, 1)) |> Enum.sum()
    assert_in_delta(total, 1.0, 1.0e-9)
    assert Reader.infer(r, "how many agents") == posterior
    assert Reader.meaning(r, "how many agents") == Reader.meaning(r, "how many agents")
  end

  test "multi-intent: top meanings ranked for a compound question", %{reader: r} do
    means = Reader.meanings(r, "how is the server and who is in danger", k: 3)
    assert :server in means
    assert :danger in means
  end

  test "UTTERANCE: the SAME learned model speaks — emits words characteristic of a meaning", %{reader: r} do
    words = Reader.utter(r, :server)
    # the generative direction (action) inverts the same likelihood used to read (perception):
    # the most server-diagnostic learned words come back.
    assert is_list(words) and length(words) > 0
    assert Enum.any?(words, &(&1 in ~w(server tick rate lagging system performance)))
  end

  test "epistemic CLASSIFY: confident on clear evidence, unsure on none", %{reader: r} do
    assert {:confident, :danger} = Reader.classify(r, "who is in danger")
    assert :unsure = Reader.classify(r, "xyzzy frobnicate")
  end

  test "persists and reloads the learned model (language survives restart)", %{reader: r} do
    path = Path.join(System.tmp_dir!(), "reader_#{System.unique_integer([:positive])}.bin")
    Reader.save(r, path)
    r2 = Reader.load(path)
    File.rm(path)
    assert Reader.meaning(r2, "the tick rate") == :server
  end

  test "COMPOSE (rung 3): generates a non-empty, on-topic, DETERMINISTIC sequence for a meaning", %{reader: r} do
    sentence = Reader.compose(r, :server)
    assert is_binary(sentence) and sentence != ""
    # greedy compose is deterministic, and the words come from what it learned about :server
    # (stemmed vocab: "lagging"→"lagg", etc.)
    assert Reader.compose(r, :server) == sentence

    assert sentence
           |> String.split()
           |> Enum.any?(&(&1 in ~w(server tick rate lagg system performance health)))
  end

  test "SURPRISE (free energy) falsifies learning: LOW on learned text, HIGH on word salad", %{reader: r} do
    learned = Reader.surprise(r, "the tick rate", :server)
    salad = Reader.surprise(r, "banana qwerty zorp", :server)
    assert learned < salad
  end

  test "TRIGRAM (rung 4): compose follows a learned 3-gram chain; surprise prefers learned ORDER" do
    # ONE strongly-repeated ordered chain — the trigram memory should reproduce the WORD ORDER,
    # which a bigram alone (or a bag of words) cannot distinguish from a scramble.
    m =
      Enum.reduce(1..6, Reader.new(), fn _, acc -> Reader.train(acc, "wood feeds the bright fire", :narr) end)

    line = Reader.compose(m, :narr, max: 8)
    assert is_binary(line) and line =~ "wood" and line =~ "fire"

    # word ORDER now matters: the learned order is less surprising than a scramble of the SAME words.
    in_order = Reader.surprise(m, "wood feeds the bright fire", :narr)
    scrambled = Reader.surprise(m, "fire bright the feeds wood", :narr)
    assert in_order < scrambled
  end

  test "load BACKFILLS struct fields added after a model was saved (older readers upgrade, no crash)" do
    # simulate a reader persisted BEFORE the :tri field existed: a struct-map missing :tri.
    legacy = Reader.learn(Reader.new(), "the tick rate", :server)
    legacy_map = legacy |> Map.from_struct() |> Map.delete(:tri) |> Map.put(:__struct__, Reader)
    path = Path.join(System.tmp_dir!(), "legacy_#{System.unique_integer([:positive])}.bin")
    File.write!(path, :erlang.term_to_binary(legacy_map))

    m = Reader.load(path)
    File.rm(path)

    assert match?(%Reader{}, m) and m.tri == %{}
    assert Reader.meaning(m, "the tick rate") == :server
    # compose touches m.tri — must not crash on the back-filled default
    assert is_binary(Reader.compose(m, :server))
  end

  test "MERGE folds two readers' learning together with NO loss (and tolerates a pre-:tri model)" do
    a = Reader.learn_corpus(Reader.new(), [{"the tick rate", :server}, {"who is in danger", :danger}])
    b = Reader.learn(Reader.new(), "is it lagging and slow", :server)
    # simulate `b` as an OLDER in-memory reader that predates the :tri field (raw struct-map, no :tri)
    b_legacy = b |> Map.from_struct() |> Map.delete(:tri) |> Map.put(:__struct__, Reader)

    m = Reader.merge(a, b_legacy)

    # both sides' learning survives the merge…
    assert Reader.meaning(m, "the tick rate") == :server
    assert Reader.meaning(m, "who is in danger") == :danger
    assert Reader.meaning(m, "is it lagging") == :server
    # …and the vocabulary is the union (no word dropped)
    assert MapSet.subset?(a.vocab, m.vocab) and MapSet.member?(m.vocab, "slow")
  end
end
