defmodule SP.Brain.SurfacePreferenceTest do
  @moduledoc """
  Gate for the BEDROCK FIX: the colony dug to bedrock because nothing in its preferences
  `C` distinguished the surface from the deep — `vision` bins all stone/dirt/bedrock as
  "enclosed" (neutral in forage, GOOD in build), and the `light`/`sky` senses (which DO
  distinguish surface from depth) carried no preference at all. The fix gives the
  surface-activity contexts (forage/socialize/flee) a preference for daylight + open sky
  and against dark + enclosed, while leaving build/rest neutral (a shelter is rightly dim
  + enclosed). This gate proves the preference is wired correctly and points the right way.

  MECHANISM-only: that this makes a live colony spend less time at bedrock is a behavioural
  claim that needs a live run to measure — it is NOT asserted here.
  """
  use ExUnit.Case, async: true
  alias SP.Brain.{MC, Genome}

  @light_surface [-2.0, 0.0, 1.5]
  @sky_surface [-2.0, 0.0, 1.5]
  @neutral [0.0, 0.0, 0.0]

  defp idx_of(name) do
    Genome.active_modalities(Genome.default())
    |> Enum.with_index()
    |> Enum.find_value(fn {m, i} -> if m.name == name, do: i end)
  end

  test "T1: light + sky are active modalities the agent can actually sense" do
    names = Genome.active_modalities(Genome.default()) |> Enum.map(& &1.name)
    assert :light in names, "light must be expressed for the surface drive to bite"
    assert :sky in names, "sky must be expressed for the surface drive to bite"
  end

  test "T2: forage prefers daylight + open sky (climb OUT of the mines while foraging)" do
    cfg = MC.new().l2_config
    li = idx_of(:light)
    si = idx_of(:sky)
    assert cfg[:forage][li] == @light_surface
    assert cfg[:forage][si] == @sky_surface
    # orientation: the surface (day/open, outcome 2) is preferred over the deep (dark/enclosed, 0)
    assert Enum.at(cfg[:forage][li], 2) > Enum.at(cfg[:forage][li], 0)
    assert Enum.at(cfg[:forage][si], 2) > Enum.at(cfg[:forage][si], 0)
  end

  test "T3: build + rest stay NEUTRAL on light/sky — a shelter is rightly dim + enclosed" do
    cfg = MC.new().l2_config
    li = idx_of(:light)
    si = idx_of(:sky)
    assert cfg[:build][li] == @neutral
    assert cfg[:build][si] == @neutral
    assert cfg[:rest][li] == @neutral
    assert cfg[:rest][si] == @neutral
  end

  test "T4: socialize + flee also pull toward daylight (don't socialise/flee into a pit)" do
    cfg = MC.new().l2_config
    li = idx_of(:light)
    assert cfg[:socialize][li] == @light_surface
    assert cfg[:flee][li] == @light_surface
  end

  test "T5: the surface preference lands on the model's light/sky factors under forage" do
    # End-to-end through the real modulation path: apply the forage context to a fresh model
    # and the light/sky factors carry the surface preference C the EFE will act on.
    brain = MC.new()
    model = SP.Brain.Strategist.apply_context(brain.model, :forage, brain.l2_config)
    li = idx_of(:light)
    si = idx_of(:sky)
    # the Factors engine stores a factor's preference C as a 1×no row
    assert Enum.at(model.subs, li).c == [@light_surface]
    assert Enum.at(model.subs, si).c == [@sky_surface]
  end
end
