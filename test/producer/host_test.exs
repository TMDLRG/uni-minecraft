defmodule SP.Producer.HostTest do
  @moduledoc """
  Gen-3 P4: the Producer host turns an EFE-chosen action into production directives (inert
  descriptions the GenServer interprets). P3 proves telemetry→action; this proves
  action→directives + the end-to-end pure plan/2.
  """
  use ExUnit.Case, async: true

  alias SP.Producer.Brain

  defp row(u, senses, action \\ "forward"),
    do: %{username: u, senses: senses, action: action, context: :forage}

  test "cut_to_drama ⇒ set the star + a TIGHT closeup on the most dramatic agent (stay on the action)" do
    rows = [row("UNI-0-1", %{"hurt" => true, "health" => 8}), row("UNI-0-2", %{"health" => 20})]
    dirs = SP.Producer.directives_for(:cut_to_drama, rows, 0)
    assert {:star, "UNI-0-1"} in dirs
    assert {:shot, :closeup, "UNI-0-1"} in dirs
  end

  test "cut_to_subject ⇒ a SMOOTH glide (flyto) to a different agent, not a hard cut" do
    rows = [row("UNI-0-1", %{"hurt" => true}), row("UNI-0-2", %{"health" => 20})]
    dirs = SP.Producer.directives_for(:cut_to_subject, rows, 0)
    # the most-dramatic agent is the current star; we glide to SOMEONE ELSE
    assert Enum.any?(dirs, &match?({:glide, "UNI-0-2", :follow}, &1))
    refute Enum.any?(dirs, &match?({:shot, _, _}, &1))
  end

  test "widen ⇒ a colony overview shot" do
    assert SP.Producer.directives_for(:widen, [], 0) == [{:shot, :overview, "-"}]
  end

  test "cull_agent ⇒ cull the LEAST dramatic agent" do
    rows = [row("UNI-0-1", %{"hurt" => true}), row("UNI-0-2", %{"health" => 20})]
    assert SP.Producer.directives_for(:cull_agent, rows, 0) == [{:cull, "UNI-0-2"}]
  end

  test "spawn / health / beat / hold map to their directives" do
    assert SP.Producer.directives_for(:spawn_agent, [], 0) == [{:spawn}]
    assert SP.Producer.directives_for(:health_tps, [], 0) == [{:health, :tps}]
    assert SP.Producer.directives_for(:hold, [], 0) == []
    assert SP.Producer.directives_for(:noop, [], 0) == []
    rows = [row("UNI-0-1", %{"social" => 1})]
    # WS2-B story arcs (e310a76): a social beat glides the camera to the social UNI then says its social line.
    assert SP.Producer.directives_for(:beat_social, rows, 0) == [
             {:glide, "UNI-0-1", :beauty},
             {:social_line, "UNI-0-1"}
           ]
  end

  test "plan/2 is pure end-to-end: a DOWN server yields a health directive" do
    tel = %{
      rows: [row("UNI-0-1", %{"health" => 20})],
      tps: %{up: false},
      log: %{},
      frame: 0,
      history: %{beats_since_cut: 0, recent_drama: [], recent_stars: []}
    }

    {_brain, action, dirs} = SP.Producer.plan(Brain.new(seed: 1), tel)
    assert action == :health_tps
    assert {:health, :tps} in dirs
  end
end
