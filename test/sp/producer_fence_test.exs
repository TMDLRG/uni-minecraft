defmodule SP.ProducerFenceTest do
  use ExUnit.Case, async: true

  # The reviewed identity anchor: with no observe_only opt, fence_directives is the identity —
  # the default path stays byte-identical (docs/specs/producer_remote_sense_observe_only.md).
  test "identity when observe_only is absent" do
    dirs = [
      {:star, "u"},
      {:spawn},
      {:cull, "x"},
      {:health, :tps},
      {:health, :cam},
      {:shot, :closeup, "u"},
      {:glide, "u", :follow},
      {:line, "u"}
    ]

    assert SP.Producer.fence_directives(dirs, []) == dirs
    assert SP.Producer.fence_directives(dirs, observe_only: false) == dirs
  end

  test "fences exactly {:spawn}, {:cull,_}, {:health,:tps} under observe_only — nothing else" do
    dirs = [
      {:star, "u"},
      {:spawn},
      {:cull, "x"},
      {:health, :tps},
      {:health, :cam},
      {:glide, "u", :follow},
      {:mind_line, "u"}
    ]

    assert SP.Producer.fence_directives(dirs, observe_only: true) == [
             {:star, "u"},
             {:fenced, {:spawn}},
             {:fenced, {:cull, "x"}},
             {:fenced, {:health, :tps}},
             {:health, :cam},
             {:glide, "u", :follow},
             {:mind_line, "u"}
           ]
  end

  test "empty directives stay empty under both modes" do
    assert SP.Producer.fence_directives([], []) == []
    assert SP.Producer.fence_directives([], observe_only: true) == []
  end
end
