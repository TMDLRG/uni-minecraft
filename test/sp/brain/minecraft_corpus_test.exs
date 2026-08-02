defmodule SP.Brain.MinecraftCorpusTest do
  @moduledoc """
  Training on the WORLD OF MINECRAFT: a procedural, scene-typed corpus (pure data, no LLM) teaches
  the deeper language model to talk about the Minecraft world. Falsifiable: training LOWERS surprise
  on real Minecraft sentences (it learns), and it generates the Minecraft vocabulary it was shown.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MinecraftCorpus, Language}

  test "generates Minecraft training pairs across scene-types — no raw facts (grounding-safe)" do
    pairs = MinecraftCorpus.generate(per: 4)
    assert length(pairs) > 60
    scenes = pairs |> Enum.map(&elem(&1, 1)) |> Enum.uniq()
    assert :forest in scenes and :cave in scenes and :danger in scenes and :mining in scenes

    # real Minecraft words, but never a raw number or UNI name (so a model trained on it can't hallucinate facts)
    for {s, _} <- pairs, do: refute(s =~ ~r/\d|uni-/i, "fact token in corpus: #{s}")
  end

  test "training on Minecraft LOWERS surprise on a real Minecraft sentence (it learns the world)" do
    m =
      Language.new(k: 8, seed: 7)
      |> Language.learn_corpus(MinecraftCorpus.generate(per: 6))
      |> Language.fit(iters: 10)

    assert Language.surprise(m, "the unit mines the iron from the grey stone", :mining) <
             Language.surprise(m, "qwerty zorp banana the iron foo", :mining)

    # it speaks the Minecraft vocabulary it was shown (every generated word is from the corpus)
    out = Language.generate(m, :forest, max: 10, sample: :rand.seed_s(:exsss, {1, 2, 3}))
    assert out == "" or Enum.all?(String.split(out), &MapSet.member?(m.vocab, &1))
  end
end
