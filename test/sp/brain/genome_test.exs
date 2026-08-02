defmodule SP.Brain.GenomeTest do
  use ExUnit.Case, async: true
  alias SP.Brain.{Genome, Factors, Curriculum}

  describe "express/1 builds a valid model with uninformative (learnable) senses" do
    test "the default genome develops all modalities; A/B columns are stochastic" do
      fm = Genome.express(Genome.default())
      # status4+inventory4+vision6+threat3+social3+self4+strategy5 + rich-sight(light3+sky3+sight4)
      # + build3 + prey4 = 46
      assert Factors.belief_size(fm) == 46

      for sub <- fm.subs do
        for a_m <- sub.a, col <- a_m, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
        for b_u <- sub.b, col <- b_u, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
        # likelihoods start UNINFORMATIVE (uniform) — no priors about the world
        for a_m <- sub.a, col <- a_m, do: assert(Enum.all?(col, &(abs(&1 - hd(col)) < 1.0e-12)))
      end
    end
  end

  describe "organ gating — morphology decides which senses exist" do
    test "a blind genome (no vision organ) develops fewer factors" do
      blind = Genome.repair(%Genome{growth_plan: [:interoception, :chemotaction, :proprioception]})
      sighted = Genome.default()

      refute :vision in blind.growth_plan
      assert :vision in sighted.growth_plan
      assert Factors.belief_size(Genome.express(blind)) < Factors.belief_size(Genome.express(sighted))
    end
  end

  describe "repair/1 — prerequisite closure + ordering (mirrors SP.Genome)" do
    test "camera_control pulls in vision (prereq) + interoception (base), ordered" do
      r = Genome.repair(%Genome{growth_plan: [:camera_control]})
      assert :vision in r.growth_plan and :interoception in r.growth_plan

      vi = Enum.find_index(r.growth_plan, &(&1 == :vision))
      ci = Enum.find_index(r.growth_plan, &(&1 == :camera_control))
      assert vi < ci
      assert Genome.valid?(r)
    end

    test "repair is idempotent" do
      once = Genome.repair(%Genome{growth_plan: [:strategist, :camera_control]})
      assert Genome.repair(once).growth_plan == once.growth_plan
    end
  end

  describe "evolvability — mutate/recombine always stay developable" do
    test "60 successive mutations are all valid after repair" do
      Enum.reduce(1..60, {Genome.default(), SP.Determinism.new(7)}, fn _i, {g, rng} ->
        {child, rng} = Genome.mutate(g, rng)
        assert Genome.valid?(child)
        # and it always expresses into a runnable model
        assert %Factors{} = Genome.express(child)
        {child, rng}
      end)
    end
  end

  describe "blindfold (§15) — suppressing a sense" do
    test "a blindfolded factor ignores its observation (stays at the prior)" do
      # informative single-factor model so the blindfold is observable
      spec = %{
        a: [[[0.95, 0.05], [0.05, 0.95]]],
        b: [[[1.0, 0.0], [0.0, 1.0]]],
        c: [[0.0, 0.0]],
        d: [0.5, 0.5]
      }

      fm = Factors.new([spec], gamma: 8.0)

      seeing = Factors.infer_states(fm, [[0]]) |> Factors.beliefs() |> hd()
      blind = Curriculum.blindfold(fm, 0) |> Factors.infer_states([[0]]) |> Factors.beliefs() |> hd()

      assert Enum.at(seeing, 0) > 0.9
      assert_in_delta Enum.at(blind, 0), 0.5, 1.0e-9
    end
  end

  describe "curriculum-as-preferences (§14)" do
    test "phase 0 prefers being safe; phase 1 prefers acquiring wood" do
      c0 = Curriculum.preference(0, :status, 4)
      assert length(c0) == 4
      assert Enum.at(c0, 3) == Enum.max(c0)

      c1 = Curriculum.preference(1, :inventory, 4)
      assert Enum.at(c1, 1) == Enum.max(c1) and Enum.at(c1, 1) > 0.0

      assert Curriculum.preference(0, :vision, 6) == [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]
    end
  end
end
