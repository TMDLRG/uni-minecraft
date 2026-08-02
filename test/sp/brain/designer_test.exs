defmodule SP.Brain.DesignerTest do
  @moduledoc """
  U4 anchors for the Function-Card compiler (the universal-builder front-end). The
  genome is just one card: `Designer.compile(Genome.card(dna)) == Genome.express(dna)`.
  Arbitrary cards compile to the structure they specify, and the worked pain card,
  once taught, drives the withdraw reflex it was designed for.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Designer, Genome, Factors}

  describe "the genome is one card (faithful refactor)" do
    test "compile(card(dna)) is identical to express(dna)" do
      dna = Genome.default()
      assert Designer.compile(Genome.card(dna)) == Genome.express(dna)
    end

    test "express still produces the validated structure" do
      fm = Genome.express(Genome.default())
      assert %Factors{} = fm
      assert length(fm.subs) == 12
      # all likelihood/transition columns stochastic
      for sub <- fm.subs, a_m <- sub.a, col <- a_m, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
    end
  end

  describe "an arbitrary card compiles to the structure it specifies" do
    test "factor count, cardinalities, preferences and precision are honoured" do
      card = %{
        modalities: [%{name: :sound, no: 3, ns: 2}, %{name: :light, no: 4, ns: 5}],
        actions: [:a, :b, :c],
        preferences: %{sound: %{2 => 5.0}, light: [0.0, 1.0, 0.0, -2.0]},
        precision: %{sound: 2.5},
        learn: %{a: true, b: true},
        gamma: 6.0,
        horizon: 1
      }

      fm = Designer.compile(card)
      assert length(fm.subs) == 2
      assert fm.nu == 3
      assert fm.gamma == 6.0

      [sound, light] = fm.subs
      assert sound.ns == 2 and light.ns == 5
      assert sound.gamma_m == [2.5] and light.gamma_m == [1.0]
      # sparse preference expanded; dense preference used as-is
      assert hd(sound.c) == [0.0, 0.0, 5.0]
      assert hd(light.c) == [0.0, 1.0, 0.0, -2.0]
      # each factor has nu transition matrices
      assert length(sound.b) == 3
    end
  end

  describe "the worked pain card (nociception reflex)" do
    defp pain_card do
      %{
        modalities: [
          %{name: :nociception, no: 3, ns: 3},
          %{name: :status, no: 4, ns: 4}
        ],
        actions: [:withdraw, :guard, :forward, :eat, :noop],
        preferences: %{nociception: %{0 => 2.0, 2 => -6.0}},
        learn: %{a: true, b: true},
        gamma: 8.0,
        horizon: 1
      }
    end

    test "compiles and runs a full perception→action cycle without crashing" do
      fm = Designer.compile(pain_card())
      assert length(fm.subs) == 2 and fm.nu == 5

      {action, _} =
        fm
        |> Factors.infer_states([[2], [0]])
        |> Factors.learn([[2], [0]])
        |> Factors.select_action(:argmax)

      assert action in 0..4
    end

    test "once taught that withdraw escapes pain, it selects withdraw under sharp pain" do
      fm = Designer.compile(pain_card())

      # Teach the nociception factor: hidden tissue {intact,strained,damaged} maps to
      # nociception {none,ache,sharp}; only :withdraw (action 0) moves damaged→intact.
      a = [[[0.9, 0.05, 0.05], [0.05, 0.9, 0.05], [0.05, 0.05, 0.9]]]
      withdraw = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 0.0, 0.0]]
      ident = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
      noci = %{hd(fm.subs) | a: a, b: [withdraw, ident, ident, ident, ident], qs: [0.0, 0.0, 1.0]}
      fm = %{fm | subs: [noci | tl(fm.subs)]}

      {action, _} = Factors.select_action(fm, :argmax)
      assert action == 0
    end
  end
end
