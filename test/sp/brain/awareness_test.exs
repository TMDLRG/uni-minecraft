defmodule SP.Brain.AwarenessTest do
  @moduledoc """
  U10 anchors for the functional correlates of access (NOT qualia). Metacognition tracks
  posterior sharpness; the broadcast spotlights the highest-precision/most-confident
  factor; the report is a structured statement of that broadcast and changes with state.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{Awareness, Genome}

  defp peaked_belief(fm, idx, onehot) do
    %{fm | subs: List.update_at(fm.subs, idx, &%{&1 | qs: onehot})}
  end

  test "metacognition tracks posterior sharpness (sure vs uncertain)" do
    fm = Genome.express(Genome.default())
    sharp = peaked_belief(fm, 0, [1.0, 0.0, 0.0, 0.0]) |> peaked_belief(3, [0.0, 0.0, 1.0])
    assert Awareness.metacognition(sharp) > Awareness.metacognition(fm)
  end

  test "the broadcast spotlights the highest-precision, most-confident factor" do
    fm = Genome.express(Genome.default())
    # make the danger factor (3) both very precise and sharply believed
    subs = List.update_at(fm.subs, 3, &%{&1 | gamma_m: [4.0], qs: [0.0, 0.0, 1.0]})
    b = Awareness.broadcast(%{fm | subs: subs})
    assert b.focus == 3
    assert b.focus_state == 2
  end

  test "the report is a structured statement of the broadcast" do
    fm = Genome.express(Genome.default())
    r = Awareness.broadcast(fm) |> Awareness.report()
    assert is_binary(r)
    assert r =~ "focus:"
    assert r =~ "feel:"
    assert r =~ "conf:"
  end

  test "the broadcast is informative: it changes when the dominant state changes" do
    fm = Genome.express(Genome.default())

    a =
      Awareness.broadcast(
        peaked_belief(fm, 3, [1.0, 0.0, 0.0])
        |> then(&%{&1 | subs: List.update_at(&1.subs, 3, fn s -> %{s | gamma_m: [4.0]} end)})
      )

    b =
      Awareness.broadcast(
        peaked_belief(fm, 3, [0.0, 0.0, 1.0])
        |> then(&%{&1 | subs: List.update_at(&1.subs, 3, fn s -> %{s | gamma_m: [4.0]} end)})
      )

    assert a.focus_state != b.focus_state
  end

  test "confidence is bounded to [0,1]" do
    fm = Genome.express(Genome.default())
    c = Awareness.metacognition(fm)
    assert c >= 0.0 and c <= 1.0
  end
end
