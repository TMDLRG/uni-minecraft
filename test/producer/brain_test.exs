defmodule SP.Producer.BrainTest do
  @moduledoc """
  Gen-3 P3: the Producer is a PURE active-inference UNI. Its production decisions come from
  EFE minimisation under designed showrunning priors — no scripted rules. These drive-tests
  pin the argmax on canonical fixtures so the priors are correct before going live.
  """
  use ExUnit.Case, async: true

  alias SP.Producer.{Genome, Brain, Codec}
  alias SP.Brain.Factors

  # obs order = genome modalities: drama, spotlight, coverage, pacing, population,
  # server_health, error_rate, diversity, cohesion, economy, momentum. A nominal show:
  @nominal [[2], [4], [0], [1], [2], [3], [0], [0], [2], [2], [2]]

  defp preferred_action(obs) do
    model = Factors.infer_states(Genome.model(), obs)
    %{q_pi: q_pi} = Factors.evaluate_policies(model)
    {_p, i} = q_pi |> Enum.with_index() |> Enum.max_by(&elem(&1, 0))
    Codec.action(i)
  end

  test "a DOWN server pulls the producer to a health action (survival > aesthetics)" do
    obs = List.replace_at(@nominal, 5, [0])
    assert preferred_action(obs) == :health_tps
  end

  test "an OVERLOADED cast pulls the producer to cull an agent" do
    obs = List.replace_at(@nominal, 4, [4])
    assert preferred_action(obs) == :cull_agent
  end

  test "an EMPTY/thin cast pulls the producer to spawn an agent" do
    obs = List.replace_at(@nominal, 4, [0])
    assert preferred_action(obs) == :spawn_agent
  end

  test "STALE coverage with live drama pulls the producer to a CUT" do
    obs = @nominal |> List.replace_at(2, [2]) |> List.replace_at(0, [3])
    assert preferred_action(obs) in [:cut_to_drama, :cut_to_subject, :b_roll]
  end

  test "ERRORING logs pull the producer to a health action" do
    obs = List.replace_at(@nominal, 6, [2])
    assert preferred_action(obs) in [:health_tps, :health_restart_cam]
  end

  test "STUCK diversity pulls the producer to CUT to a different subject (vary the camera)" do
    obs = List.replace_at(@nominal, 7, [3])
    assert preferred_action(obs) in [:cut_to_subject, :b_roll]
  end

  test "a FLAGGING long arc (momentum memory) pulls the producer to re-engage (vary the show)" do
    obs = List.replace_at(@nominal, 10, [0])
    assert preferred_action(obs) in [:b_roll, :widen, :beat_recap]
  end

  test "a FRACTURED colony pulls the producer to NARRATE the social bond (cohesion → beat_social)" do
    obs = List.replace_at(@nominal, 8, [0])
    assert preferred_action(obs) == :beat_social
  end

  test "an IDLE economy pulls the producer to RECAP the journey (economy → beat_recap)" do
    obs = List.replace_at(@nominal, 9, [0])
    assert preferred_action(obs) == :beat_recap
  end

  test "decide is deterministic: identical (brain, obs) yields the identical action" do
    b = Brain.new(seed: 7)
    assert Brain.act(b, @nominal) |> elem(0) == Brain.act(b, @nominal) |> elem(0)
  end

  test "the producer plans DEEP: one planned value per action, all finite (forward reasoning)" do
    b = Brain.new(seed: 7)
    model = Factors.infer_states(Genome.model(), @nominal)
    vals = SP.Brain.Plan.action_values(model, depth: 3, beam: 5)
    assert length(vals) == length(Genome.actions())
    assert Enum.all?(vals, &(is_float(&1) and &1 == &1))
    # deep planning is still deterministic end-to-end through the brain
    assert Brain.act(b, @nominal) |> elem(0) == Brain.act(b, @nominal) |> elem(0)
  end

  test "codec encodes assembled telemetry into 11 in-range obs" do
    telemetry = %{
      rows: [%{senses: %{"health" => 20, "food" => 18, "social" => 1}, action: "mine", context: :forage}],
      tps: %{tps: 8.0, up: true},
      log: %{errors: 1, warns: 0},
      history: %{beats_since_cut: 6, recent_drama: [3, 2, 1], recent_stars: ["A", "A"]}
    }

    obs = Codec.encode(telemetry)
    assert length(obs) == 11
    assert Enum.all?(obs, fn [o] -> is_integer(o) and o >= 0 end)
    # spot-check a couple of the designed discretisations (8 TPS = degraded)
    assert Codec.server_health(telemetry) == 1
    assert Codec.error_rate(telemetry) == 2
    assert Codec.coverage(telemetry) == 2
    # the new fully-enabled senses: 1 agent socialising + mining ⇒ tight/thriving; no EWMA ⇒ flagging
    assert Codec.cohesion(telemetry) == 3
    assert Codec.economy(telemetry) == 3
    assert Codec.momentum(telemetry) == 0
  end
end
