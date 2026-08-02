defmodule SP.Brain.AnchorTest do
  @moduledoc "Gen-3 P6: the show anchor answers from the live belief state (intent + retrieval, no LLM)."
  use ExUnit.Case, async: true

  alias SP.Brain.Anchor

  @rows [
    %{
      username: "UNI-0-1",
      kin: 0,
      senses: %{"health" => 20, "food" => 18},
      action: "mine",
      context: :build,
      emotion: :content,
      intent: [:mine, :forward]
    },
    %{
      username: "UNI-0-2",
      kin: 0,
      senses: %{"health" => 4, "hurt" => true},
      action: "forward",
      context: :flee,
      emotion: :fear,
      intent: []
    }
  ]

  test "counts the live cast" do
    assert Anchor.answer("how many are alive?", @rows, "UNI-0-1").text =~ "2 UNIs"
  end

  test "names who is in danger (hurt / low health)" do
    a = Anchor.answer("who is in danger?", @rows, nil)
    assert a.kind == :danger and "UNI-0-2" in a.refs
  end

  test "reports what a named agent is doing" do
    a = Anchor.answer("what is UNI-0-1 doing?", @rows, nil)
    assert a.kind == :doing and a.refs == ["UNI-0-1"] and a.text =~ "mine"
  end

  test "finds the healthiest" do
    a = Anchor.answer("who is strongest?", @rows, nil)
    assert a.refs == ["UNI-0-1"] and a.text =~ "20/20"
  end

  test "a bare agent id returns a dossier" do
    a = Anchor.answer("UNI-0-2", @rows, nil)
    assert a.kind == :dossier and a.refs == ["UNI-0-2"] and a.text =~ "kin 0"
  end

  test "an unknown question is HONESTLY flagged as unrecognised (no canned confident answer)" do
    a = Anchor.answer("what's the meaning of it all?", @rows, "UNI-0-1")
    # it must SAY it didn't recognise the question (not masquerade as having answered) and still
    # ground the user in the real overview — never invent a fact.
    assert a.kind == :unsure
    assert a.text =~ "don't recognise" and a.text =~ "2 UNIs"
  end

  test "asking who/what the producer is gets an honest, no-LLM self-description" do
    a = Anchor.answer("who are you?", @rows, "UNI-0-1")
    assert a.kind == :identity
    assert a.text =~ "active-inference" and a.text =~ "not a language model"
  end

  describe "learned reading (SP.Brain.Reader integration)" do
    test "the seeded reader parses a paraphrase the keyword router MISSES" do
      ctx = %{rows: @rows, star: nil, lines: [], producer: nil}
      # "count the agents" hits no :count keyword (regex needs 'head count'/'how many'/…) — the
      # LEARNED reader recognises it from 'count'/'agents' and routes to the count answer.
      a = SP.Brain.Anchor.answer_with("count the agents", ctx, SP.Brain.Anchor.seeded_reader())
      assert a.kind == :count
      assert a.text =~ "UNIs are live"
    end

    test "answer_learn GROWS the reader's vocabulary online from a keyword-taught question" do
      ctx = %{rows: @rows, star: nil, lines: [], producer: nil}
      {_ans, reader} = SP.Brain.Anchor.answer_learn("how many are alive", ctx, SP.Brain.Reader.new())
      # the keyword router taught :count, so the reader now knows those words and reads the paraphrase
      assert SP.Brain.Reader.knowledge(reader).words > 0
      assert SP.Brain.Reader.meaning(reader, "how many alive") == :count
    end

    test "the producer COMPOSES a multi-word, show-flavoured line from its trained narration corpus" do
      r = SP.Brain.Anchor.seeded_reader()
      line = SP.Brain.Reader.compose(r, :narration, max: 12)
      assert is_binary(line) and length(String.split(line)) >= 3
      # surprise (free energy) is LOWER on a show-like sentence than on salad — it learned the corpus
      assert SP.Brain.Reader.surprise(r, "the colony presses on", :narration) <
               SP.Brain.Reader.surprise(r, "qwerty banana zorp foo", :narration)
    end
  end

  test "empty board is handled gracefully" do
    assert Anchor.answer("how many alive?", [], nil).text =~ "0 UNIs"
    assert Anchor.answer("who is in danger?", [], nil).refs == []
  end

  # --- full comprehension + full sight (producer-aware) ----------------------

  # producer belief snapshot (the shape of SP.Producer.status/0)
  @producer %{
    frame: 42,
    action: :cut_to_drama,
    star: "UNI-0-1",
    focus: 1,
    tps: %{up: true, tps: 12.0},
    requests: [%{kind: :sensor_request, factor: :crowd_density, confidence: 0.2}],
    knowledge: [
      %{frame: 42, action: :cut_to_drama, star: "UNI-0-1", drama: 3},
      %{frame: 41, action: :hold, star: "UNI-0-1", drama: 2}
    ]
  }

  @ctx %{
    rows: @rows,
    star: "UNI-0-1",
    lines: [%{text: "UNI-0-1 draws near its kin.", who: nil, i18n: %{zh: "中文句子", es: "una frase"}}],
    producer: @producer
  }

  test "answers EVERY clause of a multi-part question (not first-match-wins)" do
    a = Anchor.answer("how many are alive and who is the strongest?", @ctx)
    assert a.kind == :multi
    assert a.text =~ "2 UNIs"
    assert a.text =~ "20/20"
    assert "UNI-0-1" in a.refs
  end

  test "explains its OWN decision (why) from the producer's beliefs" do
    a = Anchor.answer("why did you do that?", @ctx)
    assert a.kind == :why
    assert a.text =~ "cut to the drama"
    assert a.text =~ "spotlight"
    assert a.text =~ "crisis"
  end

  test "reports server health from the producer's TPS belief" do
    a = Anchor.answer("is the server lagging?", @ctx)
    assert a.kind == :server and a.text =~ "lagging" and a.text =~ "12.0"
  end

  test "a question that names two topics answers both (e.g. activity + server)" do
    a = Anchor.answer("how is the server doing?", @ctx)
    assert a.kind == :multi and a.text =~ "12.0"
  end

  test "recaps its recent decisions from the knowledge log" do
    a = Anchor.answer("what just happened?", @ctx)
    assert a.kind == :recent and a.text =~ "cut to the drama" and a.text =~ "hold the shot"
  end

  test "surfaces its sensor requests (evolvability)" do
    a = Anchor.answer("do you need any new sensors?", @ctx)
    assert a.kind == :needs and a.text =~ "crowd_density"
  end

  test "renders the live caption in other languages" do
    a = Anchor.answer("what languages are you narrating in?", @ctx)
    assert a.kind == :language and a.text =~ "中文句子" and a.text =~ "una frase"
  end

  test "producer signals absent ⇒ degrades to a safe overview (no hallucination)" do
    bare = %{rows: @rows, star: nil, lines: [], producer: nil}
    a = Anchor.answer("how is the server?", bare)
    assert a.kind == :overview and a.text =~ "2 UNIs"
  end

  test "a STORY request returns a grade-4 paragraph from the Narrator" do
    rows = [
      %{username: "UNI-0-1", senses: %{"food" => 6}, action: "forward", context: :forage, emotion: :calm},
      %{
        username: "UNI-0-2",
        senses: %{"health" => 4, "hurt" => true},
        action: "forward",
        context: :flee,
        emotion: :fear
      },
      %{username: "UNI-0-3", senses: %{"food" => 18}, action: "mine", context: nil, emotion: :curious},
      %{username: "UNI-0-4", senses: %{"food" => 18}, action: "forward", context: :social, emotion: :content}
    ]

    a = Anchor.answer("tell me the story so far", %{rows: rows, star: "UNI-0-1", lines: [], producer: nil})
    assert a.kind == :story
    {ok?, reasons} = SP.Brain.Readability.meets_grade4?(a.text)
    assert ok?, "story not grade-4: #{inspect(reasons)}"
  end

  test "WHERE is answered honestly from the Markov blanket (no coordinates)" do
    a = Anchor.answer("where is everyone?", @ctx)
    assert a.kind == :where and a.text =~ "coordinates"
  end

  # --- conversational host turns (the producer is a live HOST, not only a query box) ----------

  describe "conversational host turns" do
    test "a greeting is welcomed in character and grounded — NEVER :unsure" do
      a = Anchor.answer("hi", @ctx)
      assert a.kind == :greeting
      assert a.text =~ "Producer" and a.text =~ "2 UNIs"
    end

    test "'hi' does not fire inside ordinary words (no false greeting on 'this'/'which')" do
      # the colony query must answer the colony — the \bhi\b boundary must not match "this".
      a = Anchor.answer("what is this show about", @ctx)
      refute a.kind == :greeting
    end

    test "thanks and goodbye get warm, honest closers" do
      assert Anchor.answer("thanks!", @ctx).kind == :thanks
      assert Anchor.answer("goodbye", @ctx).kind == :bye
    end

    test "'how are you' reports its own running state, grounded (no invention)" do
      a = Anchor.answer("how are you?", @ctx)
      assert a.kind == :wellbeing
      assert a.text =~ "running the show" and a.text =~ "2 live UNIs"
    end

    test "a greeting COMBINES with a real query in the same line (answers both)" do
      a = Anchor.answer("hey, who is in danger?", @ctx)
      assert a.kind == :multi
      assert a.text =~ "danger" and a.text =~ "Producer"
    end

    test "'say something' shows the producer's OWN learned, composed voice" do
      a = Anchor.answer_with("say something", @ctx, Anchor.seeded_reader())
      assert a.kind == :speak
      assert a.text =~ "my own learned voice"
      # a real multi-word composed clause from the trigram model — not empty, not a script
      assert String.length(a.text) > 60
    end

    test "identity surfaces the GROWING learned-vocabulary count (visible proof it learns)" do
      a = Anchor.answer_with("who are you", @ctx, Anchor.seeded_reader())
      assert a.kind == :identity
      assert a.text =~ "active-inference" and a.text =~ "words across"
    end
  end
end
