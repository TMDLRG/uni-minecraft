defmodule SP.Brain.ViabilityTest do
  @moduledoc """
  U12: death = viability-exit + the shutdown of the experiencing loop (precision collapse
  ⇒ perception stops integrating the world). NDE clustering: agents with DIFFERENT priors
  converge to the SAME high-level narrative under shared extreme ("dying") input, while
  diverging under different input — clustering from shared structure, no metaphysics.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Viability, Factors, Math}

  describe "viability + shutdown" do
    test "the viable set V excludes the dying body" do
      assert Viability.viable?(%{"health" => 20, "food" => 18})
      assert Viability.viable?(%{"health" => 10})
      refute Viability.viable?(%{"health" => 3})
    end

    test "shutdown halts the experiencing loop: perception no longer updates beliefs" do
      fm =
        Factors.new([
          %{a: [[[0.9, 0.1], [0.1, 0.9]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5]}
        ])

      alive = Factors.infer_states(fm, [[0]]) |> Factors.beliefs() |> hd()
      dead = fm |> Viability.shutdown() |> Factors.infer_states([[0]]) |> Factors.beliefs() |> hd()

      assert Enum.at(alive, 0) > 0.8
      # the dead loop ignores the observation — belief stays at the prior
      assert_in_delta Enum.at(dead, 0), 0.5, 1.0e-6
    end
  end

  describe "near-death-report clustering" do
    # a high-level "narrative" factor: 3 states; the 'dying' observation (index 2)
    # strongly indicates state 2. Shared bodies + shared priors share this likelihood.
    defp narrative(d) do
      Factors.new([
        %{
          a: [[[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]]],
          b: [[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]],
          c: [[0.0, 0.0, 0.0]],
          d: d
        }
      ])
    end

    defp run(fm, obs),
      do: Enum.reduce(1..8, fm, fn _, m -> m |> Factors.infer_states([[obs]]) |> Factors.commit_action(0) end)

    test "shared extreme input clusters the narrative; different input diverges" do
      a = narrative([0.8, 0.1, 0.1])
      b = narrative([0.1, 0.8, 0.1])

      # shared 'dying' input (obs 2): both converge to narrative state 2 despite priors
      qa = run(a, 2) |> Factors.beliefs() |> hd()
      qb = run(b, 2) |> Factors.beliefs() |> hd()
      assert Math.dot(qa, qb) > 0.95
      assert argmax(qa) == 2 and argmax(qb) == 2

      # control: different inputs ⇒ the narratives diverge
      qa2 = run(a, 0) |> Factors.beliefs() |> hd()
      qb2 = run(b, 1) |> Factors.beliefs() |> hd()
      assert Math.dot(qa2, qb2) < 0.3
    end
  end

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
end
