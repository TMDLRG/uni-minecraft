defmodule SP.Brain.VisionTest do
  @moduledoc """
  Vision-primary perception (opt-in): the UNI's first-person POV pixels are inferred by a pure-FEP
  visual cortex (UNI.OS) into a discrete SCENE-STATE, which the action-brain ingests as a 13th,
  high-cardinality `:scene` factor. These tests pin: the default UNI is UNCHANGED (12 factors), the
  vision-primary genome develops the `:scene` factor, the codec maps the scene percept, and a
  vision brain does inference + acts. No pixels reach the categorical brain — only the scene-state.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Genome, MCCodec, MC}

  test "the DEFAULT UNI is unchanged — 12 symbolic factors, no :scene (opt-in only)" do
    mods = Genome.active_modalities(Genome.default()) |> Enum.map(& &1.name)
    assert length(mods) == 12
    refute :scene in mods
  end

  test "the VISION-PRIMARY genome develops the :scene factor (13 factors; ns = cortex n_states)" do
    mods = Genome.active_modalities(Genome.vision_primary())
    names = Enum.map(mods, & &1.name)
    assert length(mods) == 13
    assert :scene in names
    scene = Enum.find(mods, &(&1.name == :scene))
    assert scene.ns == Genome.scene_states() and scene.no == Genome.scene_states()
  end

  test "the codec maps the scene-state percept (bounded; absent ⇒ 0)" do
    assert MCCodec.outcome(:scene, %{"scene" => 7}) == 7
    assert MCCodec.outcome(:scene, %{"scene" => 999}) == Genome.scene_states() - 1
    assert MCCodec.outcome(:scene, %{}) == 0
    # encode/2 emits a per-factor observation list including :scene for a vision genome
    obs = MCCodec.encode(%{"health" => 20, "scene" => 4}, Genome.vision_primary())
    assert length(obs) == 13
  end

  test "a vision-primary brain has 13 factors, nu 10, and STEPS to a valid action on a scene percept" do
    b = MC.new(seed: 1, dna: Genome.vision_primary())
    assert length(b.model.subs) == 13
    assert b.model.nu == 10
    {action, b2} = MC.step(b, %{"health" => 14, "food" => 9, "scene" => 5})
    assert action in Genome.actions()
    # determinism: same seed + same observation ⇒ same action
    {action2, _} =
      MC.step(MC.new(seed: 1, dna: Genome.vision_primary()), %{"health" => 14, "food" => 9, "scene" => 5})

    assert action == action2
    # the scene factor accumulates evidence as it observes (it LEARNS what it sees)
    pa = fn br -> br.model.subs |> List.last() |> Map.get(:pa) |> List.flatten() |> Enum.sum() end
    assert pa.(b2) >= pa.(b)
  end

  test "vision is OPT-IN: a default brain ignores a scene sense (still 12 factors, still acts)" do
    b = MC.new(seed: 1)
    assert length(b.model.subs) == 12
    {action, _} = MC.step(b, %{"health" => 20, "food" => 18, "scene" => 9})
    assert action in Genome.actions()
  end

  test "Vision.percept reads a cortex percept from a dir; nil when the dir/file is absent" do
    dir = Path.join(System.tmp_dir!(), "percepts_#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)

    File.write!(
      Path.join(dir, "producer.json"),
      ~s({"stream":"producer","scene_state":4,"surprise":61.5,"frames":120})
    )

    p = SP.Brain.Vision.percept("producer", dir)
    assert p.scene_state == 4 and p.surprise == 61.5 and p.frames == 120
    assert SP.Brain.Vision.percept("missing_stream", dir) == nil
    assert SP.Brain.Vision.percept("producer", nil) == nil

    File.rm_rf!(dir)
  end

  test "Vision.novelty maps visual surprise (free energy) to plain language" do
    assert SP.Brain.Vision.novelty(95) =~ "new"
    assert SP.Brain.Vision.novelty(10) =~ "familiar"
  end

  test "Anchor answers 'what do you see' from the visual cortex — honest when sight is off" do
    rows = [
      %{username: "UNI-0-1", kin: 0, senses: %{}, action: "mine", context: :build, emotion: :calm, intent: []}
    ]

    a = SP.Brain.Anchor.answer("what do you see?", rows, nil)
    assert a.kind == :vision
    assert a.text =~ "visual cortex"
  end
end
