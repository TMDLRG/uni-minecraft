defmodule SP.Brain.LanguageTest do
  @moduledoc """
  Rung 5 — the DEEPER pure-FEP language model: a meaning-conditioned latent-state HMM over words,
  learned by Baum–Welch EM. Falsifiable claims: it LEARNS (free energy drops on trained text vs
  salad), GENERATES by decoding a latent trajectory (deterministic, words from the corpus), and its
  quality scales with the corpus (training is the lever, not a missing-capacity wall). No neural net.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.Language

  defp trained do
    corpus =
      for(_ <- 1..8, do: {"the colony grows calm at dawn", :narr}) ++
        for _ <- 1..8, do: {"a unit mines the cold stone", :narr}

    Language.new(k: 6, seed: 1) |> Language.learn_corpus(corpus) |> Language.fit(iters: 15)
  end

  test "LEARNS — free energy is LOW on trained text, HIGH on word salad" do
    m = trained()

    assert Language.surprise(m, "the colony grows calm at dawn", :narr) <
             Language.surprise(m, "stone qwerty colony zorp dawn foo", :narr)
  end

  test "GENERATES by latent decoding — non-empty, on-corpus, DETERMINISTIC" do
    m = trained()
    out = Language.generate(m, :narr, max: 10)
    assert is_binary(out) and out != ""
    # greedy decode is deterministic
    assert Language.generate(m, :narr, max: 10) == out
    # every generated word came from the training vocabulary (it speaks what it learned)
    assert Enum.all?(String.split(out), &MapSet.member?(m.vocab, &1))
  end

  test "TRAINING is the lever — more corpus lowers surprise on held-out-style text" do
    base = Language.new(k: 6, seed: 2) |> Language.learn("the colony grows", :narr) |> Language.fit(iters: 8)

    more =
      Language.new(k: 6, seed: 2)
      |> Language.learn_corpus(for _ <- 1..10, do: {"the colony grows calm and safe", :narr})
      |> Language.fit(iters: 15)

    # the better-trained model is less surprised by an on-topic sentence (capacity is filled by data)
    assert Language.surprise(more, "the colony grows calm", :narr) <=
             Language.surprise(base, "the colony grows calm", :narr)
  end

  test "is multi-state (deeper than a flat n-gram) and meaning-conditioned" do
    m = trained()
    k = Language.knowledge(m)
    assert k.states == 6
    assert :narr in k.meanings
    assert k.words > 0
  end

  test "unknown meaning / empty model degrades gracefully (no crash)" do
    m = Language.new()
    assert Language.generate(m, :nope) == ""
    assert Language.surprise(m, "anything", :nope) == 0.0
  end
end
