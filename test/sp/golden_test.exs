defmodule SP.GoldenTest do
  @moduledoc """
  Benchmark regression test (spec QA section H). Pins a seeded episode's summary
  against a stored golden artifact so that unintended changes to world dynamics,
  development, or the interface are caught. Integer/structural fields must match
  exactly; float fields are compared within a tolerance to avoid brittleness.

  Regenerate the golden with: `mix run scripts/gen_golden.exs`.
  """
  use ExUnit.Case, async: true

  alias SP.{Observability, Sim}

  @golden_path "config/golden/reference_episode.json"
  @tolerance 1.0e-6

  test "the reference golden episode reproduces exactly (Invariant #13)" do
    assert File.exists?(@golden_path), "missing golden file; run mix run scripts/gen_golden.exs"
    golden = @golden_path |> File.read!() |> :json.decode()

    # Reproduce the same episode from its provenance.
    prov = golden["provenance"]
    agent = Map.fetch!(SP.Scenario.agents(), agent_key(prov["agent"]))

    sim =
      Sim.new(
        seed: prov["seed"],
        agent: agent,
        max_ticks: prov["max_ticks"],
        micro_per_decision: prov["micro_per_decision"],
        dev_interval: prov["dev_interval"],
        world_opts: [regions: prov["world"]["regions"], w: prov["world"]["w"], h: prov["world"]["h"]]
      )
      |> Sim.run()

    fresh = Observability.episode_report(sim) |> stringify()
    gm = golden["metrics"]
    fm = fresh["metrics"]

    for k <-
          ~w(survived_ticks final_stage final_organs region_count expansions structures_built sensor_modalities ungated_attempts decoded_failures) do
      assert gm[k] == fm[k], "golden mismatch on #{k}: golden=#{inspect(gm[k])} fresh=#{inspect(fm[k])}"
    end

    for k <- ~w(mean_risk max_risk mean_prior_divergence regime_novelty) do
      assert is_number(gm[k]) and is_number(fm[k]),
             "non-number on #{k}: golden=#{inspect(gm[k])} fresh=#{inspect(fm[k])}"

      assert abs(gm[k] - fm[k]) <= @tolerance,
             "golden float drift on #{k}: golden=#{inspect(gm[k])} fresh=#{inspect(fm[k])} halted=#{inspect(fm["halted"])} ticks=#{inspect(fm["survived_ticks"])}"
    end
  end

  defp agent_key("SP.Baselines." <> rest), do: Macro.underscore(rest)
  defp agent_key(other), do: other

  # Round-trip through JSON so the fresh report has identical (string) shape.
  defp stringify(term), do: term |> Observability.json() |> :json.decode()
end
