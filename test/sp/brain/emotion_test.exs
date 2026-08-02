defmodule SP.Brain.EmotionTest do
  @moduledoc """
  U9 anchors. Emotion is a read-out over posteriors × policy-confidence: the key
  falsifiable prediction is that BLOCKING a response under threat (collapsing control)
  shifts the dominant emotion from fear to anger/frustration. Hormones modulate
  precision and plasticity as a slow context variable.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Emotion, Hormones, Genome}

  describe "emotion as action-readiness" do
    test "threat with the ability to act reads as fear" do
      e = Emotion.read(%{danger: 0.9, distress: 0.2, control: 0.9, epistemic_frac: 0.1})
      assert e.dominant == :fear
    end

    test "FALSIFICATION: blocking the response under threat shifts fear → anger" do
      able = Emotion.read(%{danger: 0.9, distress: 0.2, control: 0.9, epistemic_frac: 0.1})
      blocked = Emotion.read(%{danger: 0.9, distress: 0.2, control: 0.1, epistemic_frac: 0.1})

      assert able.dominant == :fear
      assert blocked.dominant == :anger
      # the prediction: frustration rises precisely because control collapsed
      assert blocked.dims.anger > able.dims.anger
    end

    test "safe + uncertain reads as curiosity; safe + capable reads as content" do
      assert Emotion.read(%{danger: 0.0, distress: 0.0, control: 0.2, epistemic_frac: 0.9}).dominant ==
               :curiosity

      assert Emotion.read(%{danger: 0.0, distress: 0.0, control: 0.95, epistemic_frac: 0.05}).dominant ==
               :content
    end

    test "persistent depletion with no good option reads as grief" do
      assert Emotion.read(%{danger: 0.1, distress: 0.9, control: 0.1, epistemic_frac: 0.1}).dominant == :grief
    end

    test "from_factors reads a valid emotion off a live genome model" do
      fm = Genome.express(Genome.default())
      e = Emotion.from_factors(fm)
      assert e.dominant in Emotion.labels()
      assert e.intensity >= 0.0 and e.intensity <= 1.0
    end

    test "from_factors: high danger belief yields a negative-valence emotion" do
      fm = Genome.express(Genome.default())
      # drive the danger factor (index 3) onto 'attacking'
      subs = List.update_at(fm.subs, 3, &%{&1 | qs: [0.0, 0.0, 1.0]})
      e = Emotion.from_factors(%{fm | subs: subs})
      assert e.dominant in [:fear, :anger]
    end

    test "from_senses: a SAFE agent is not angry; a threatened one is fear/anger" do
      fm = Genome.express(Genome.default())
      safe = Emotion.from_senses(%{"health" => 20, "food" => 18, "hostile_dist" => nil, "hurt" => false}, fm)
      threatened = Emotion.from_senses(%{"health" => 20, "food" => 18, "hurt" => true}, fm)

      refute safe.dominant == :anger
      assert threatened.dominant in [:fear, :anger]
    end
  end

  describe "hormones as context modulation" do
    test "stress raises policy precision and damps learning" do
      fm = Genome.express(Genome.default())
      calm = Hormones.modulate(fm, %{stress: 0.0})
      stressed = Hormones.modulate(fm, %{stress: 1.0})

      assert stressed.gamma > calm.gamma
      assert hd(stressed.subs).lr < hd(calm.subs).lr
    end

    test "a strategic context implies a hormone (arousal) level" do
      assert Hormones.of_context(:flee).stress > Hormones.of_context(:rest).stress
    end
  end
end
