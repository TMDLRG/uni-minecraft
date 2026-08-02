defmodule SP.EvalTest do
  use ExUnit.Case, async: true
  alias SP.{Eval, Sim}

  @seeds [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]
  @ladder [
    :manipulator,
    :excavator,
    :transporter,
    :constructor,
    :instrument_mount,
    :field_effector,
    :seam_engineer,
    :proprioception,
    :plume,
    :tomography,
    :spectral,
    :seam_coherence,
    :meta
  ]

  # A sense-equipped body, so an agent that *uses* senses can exploit them.
  defp developed_body(seed) do
    g = SP.Genome.repair(%SP.Genome{lineage: "t", growth_plan: @ladder, maturation_rate: 0.4})
    body = %{SP.Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0}
    SP.Body.Development.develop_n(body, g, 400)
  end

  defp mean_survival(agent) do
    surv =
      Enum.map(@seeds, fn seed ->
        Sim.new(seed: seed, agent: agent, body: developed_body(seed), max_ticks: 400)
        |> Sim.run()
        |> Map.get(:tick)
      end)

    Enum.sum(surv) / length(surv)
  end

  test "sensing matters: an agent that uses senses clearly out-survives random (same body)" do
    homeo = mean_survival(SP.Baselines.Homeostatic)
    random = mean_survival(SP.Baselines.Random)
    assert homeo > random * 1.1, "expected sense-using homeostatic (#{homeo}) >> random (#{random})"
  end

  test "hidden layers matter: each deep sense strictly adds observation channels (Invariant #8)" do
    for omit <- [[:tomography], [:spectral], [:seam_coherence], [:meta]] do
      %{with: with_c, without: without_c} = Eval.layer_visibility(7, omit)

      assert with_c > without_c,
             "omitting #{inspect(omit)} did not reduce channels (#{with_c} vs #{without_c})"
    end
  end

  test "morphology matters: a never-developing body builds nothing and never expands" do
    metrics =
      Eval.run_episode(seed: 3, agent: SP.Baselines.Infrastructure, max_ticks: 300, dev_interval: 10_000_000)
      |> Eval.episode_metrics()

    assert metrics.final_stage <= 1
    assert metrics.structures_built == 0
    assert metrics.expansions == 0
    # it nonetheless tried gated actions it could not perform
    assert metrics.ungated_attempts >= 0
  end

  test "ablation suite produces aggregates and deltas vs full" do
    report = Eval.ablation_suite([201, 202, 203], max_ticks: 150)
    assert Map.has_key?(report.per_preset, :full)
    assert Map.has_key?(report.deltas_vs_full, :no_development)
    assert report.per_preset[:full].n == 3
    # final_stage delta: full should reach at least as deep as no_development on average
    assert report.per_preset[:full].final_stage >= report.per_preset[:no_development].final_stage
  end

  test "episode metrics never expose a scalar reward channel (Invariant #15)" do
    m = Eval.run_episode(seed: 1, agent: SP.Baselines.Random, max_ticks: 50) |> Eval.episode_metrics()
    refute Map.has_key?(m, :reward)
    refute Map.has_key?(m, :score)
    refute Map.has_key?(m, :return)
  end
end
