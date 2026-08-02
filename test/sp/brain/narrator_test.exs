defmodule SP.Brain.NarratorTest do
  @moduledoc "Gen-3 L3/L4: the grade-4 Narrator UNI — language production as active inference."
  use ExUnit.Case, async: true

  alias SP.Brain.{Narrator, Readability}

  @rows [
    %{who: "UNI-2-3", emotion: :calm, context: :forage, action: "forward", senses: %{"food" => 6}},
    %{
      who: "UNI-1-1",
      emotion: :curious,
      context: nil,
      action: "mine",
      senses: %{"health" => 20, "food" => 18}
    },
    %{
      who: "UNI-0-2",
      emotion: :fear,
      context: :flee,
      action: "forward",
      senses: %{"health" => 5, "hurt" => true}
    },
    %{who: "UNI-2-1", emotion: :content, context: :social, action: "forward", senses: %{"food" => 18}}
  ]

  test "writes a scene paragraph in all five languages, naming the cast" do
    p = Narrator.write(@rows)
    assert Map.keys(p) |> Enum.sort() == Enum.sort([:en, :zh, :hi, :es, :ar])
    for {_lang, s} <- p, do: assert(is_binary(s) and String.contains?(s, "UNI-2-3"))
    assert p.zh =~ "聚落" and p.es =~ "colonia"
  end

  test "the English scene MEETS the grade-4 contract" do
    {ok?, reasons} = Readability.meets_grade4?(Narrator.sentences(@rows))
    assert ok?, "grade-4 failed: #{inspect(reasons)}"
  end

  test "language production is deterministic (same cast ⇒ same paragraph)" do
    assert Narrator.write(@rows) == Narrator.write(@rows)
    assert Narrator.sentences(@rows) == Narrator.sentences(@rows)
  end

  test "the FEP selector opens, develops with VARIED relations, and concludes" do
    moves = Narrator.scene(@rows) |> Enum.map(&elem(&1, 0))
    assert List.first(moves) == :open
    assert List.last(moves) == :conclude
    develops = moves |> Enum.slice(1..-2//1)
    assert length(develops) >= 1
    # the develop relations are drawn from the rhetorical set
    assert Enum.all?(develops, &(&1 in [:cause, :contrast, :temporal]))
  end

  test "a single agent still yields a 3–5 sentence grade-4 paragraph" do
    one = [Enum.at(@rows, 2)]
    ss = Narrator.sentences(one)
    assert length(ss) >= 3 and length(ss) <= 5
    {ok?, reasons} = Readability.meets_grade4?(ss)
    assert ok?, "single-agent grade-4 failed: #{inspect(reasons)}"
  end

  test "empty cast is handled (never raises)" do
    assert %{en: s} = Narrator.write([])
    assert is_binary(s) and s != ""
  end
end
