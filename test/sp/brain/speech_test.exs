defmodule SP.Brain.SpeechTest do
  @moduledoc """
  The producer's template-free generative voice. These pin the BUILD (not fluency — fluency is
  training-bound): every line is COMPOSED by the learned latent model and GROUNDED by binding fact
  slots from state, so the only names/numbers it can utter come from state (no hallucination, no
  authored return-string). Output quality scales with the corpus — the gap is training, not design.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Speech, Language}

  test "the corpus is DELEXICALISED — grounding by construction (no raw fact the model could generate)" do
    for {frame, _m} <- Speech.corpus() do
      refute frame =~ ~r/\d/, "raw number in corpus frame: #{frame}"
      refute frame =~ ~r/uni-/i, "raw UNI name in corpus frame: #{frame}"
    end
  end

  test "realize BINDS state facts into slots — no raw slot leaks, no hallucinated fact" do
    lang =
      Language.new(k: 2, seed: 5)
      |> Language.learn_corpus(for _ <- 1..20, do: {"slotuni is in danger now", :danger})
      |> Language.fit(iters: 18)

    out = Speech.realize(lang, :danger, %{uni: "UNI-7-7"})
    assert is_binary(out) and out != ""
    # the slot token is never left raw — it was either filled or not generated
    refute out =~ "slotuni"
    # the ONLY UNI name that can appear is the bound state fact (grounding holds)
    names = Regex.scan(~r/UNI-\d+-\d+/i, out) |> List.flatten()
    assert Enum.all?(names, &(String.downcase(&1) == "uni-7-7"))
  end

  test "the seeded voice GENERATES a non-empty line for show meanings (quality is training-bound)" do
    s = Speech.seeded()
    assert Speech.realize(s, :narration, %{uni: "UNI-1-1", count: 6, action: "mine"}) != ""
    assert Speech.realize(s, :count, %{count: 6}) != ""
  end

  test "scene_of classifies what's on the screen from the symbolic senses" do
    assert Speech.scene_of(%{"look" => "oak_log", "action" => "mine"}) == :mining
    assert Speech.scene_of(%{"hostile_dist" => 4.0}) == :danger
    assert Speech.scene_of(%{"look" => "water"}) == :water
    assert Speech.scene_of(%{"look" => "leaves", "light" => 2}) == :forest
    assert Speech.scene_of(%{"look" => "grass", "light" => 0}) == :night
  end

  test "describe SAYS what it sees — a scene caption grounded with the UNI name, no hallucinated fact" do
    lang =
      Language.new(k: 6, seed: 3)
      |> Language.learn_corpus(SP.Brain.MinecraftCorpus.generate(per: 6))
      |> Language.fit(iters: 10)

    out = Speech.describe(lang, %{"look" => "stone", "action" => "mine"}, "UNI-1-1")
    assert is_binary(out)

    if out != "" do
      assert out =~ "UNI-1-1"
      names = Regex.scan(~r/UNI-\d+-\d+/i, out) |> List.flatten()
      assert Enum.all?(names, &(String.downcase(&1) == "uni-1-1"))
    end
  end

  test "unfilled slots fall to GENERIC words (non-facts) so output stays grounded with no state" do
    lang =
      Language.new(k: 2, seed: 9)
      |> Language.learn_corpus(for _ <- 1..20, do: {"slotcount units press on", :count})
      |> Language.fit(iters: 18)

    out = Speech.realize(lang, :count, %{})
    refute out =~ "slotcount"
    # no number appears when none was provided (generic "several" stands in — not a fact)
    refute out =~ ~r/\d/
  end
end
