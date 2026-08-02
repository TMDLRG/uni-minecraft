defmodule SP.Brain.ReadabilityTest do
  @moduledoc "Gen-3 L5: the openly-falsifiable grade-level harness (pure arithmetic, no model)."
  use ExUnit.Case, async: true

  alias SP.Brain.Readability

  # a hand-written GRADE-4 paragraph: multi-clause, connectives, cause→effect, pronoun reference,
  # varied openings, 4 sentences.
  @grade4 [
    "UNI-2-3 was hungry, so it foraged through the wild.",
    "It searched for a long time, but it found little.",
    "When the sun fell, danger crept near and UNI-2-3 grew wary.",
    "Then it returned to its kin, because together they were safe."
  ]

  # a hand-written GRADE-1 paragraph: single clauses, short, repetitive openings.
  @grade1 [
    "UNI ran.",
    "UNI ate.",
    "UNI sat."
  ]

  test "a grade-4 paragraph passes the contract" do
    {ok?, reasons} = Readability.meets_grade4?(@grade4)
    assert ok?, "expected grade-4 pass, failed: #{inspect(reasons)}"
  end

  test "a grade-1 paragraph FAILS the contract (the harness can tell them apart)" do
    {ok?, reasons} = Readability.meets_grade4?(@grade1)
    refute ok?
    assert length(reasons) >= 2
  end

  test "metrics are sensible and the grade index separates the two" do
    g4 = Readability.analyze(@grade4)
    g1 = Readability.analyze(@grade1)
    assert g4.multiclause_frac >= 0.6 and g4.cause_effect >= 1
    assert length(g4.connectives) >= 3
    assert g4.grade >= 3.0 and g4.grade <= 5.0
    assert g1.grade < 3.0
    assert g4.grade > g1.grade
  end

  test "naked pronoun before a name is introduced is a reference violation" do
    bad = ["It was hungry.", "UNI-1 foraged."]
    good = ["UNI-1 was hungry.", "It foraged."]
    assert Readability.analyze(bad).reference_violations == 1
    assert Readability.analyze(good).reference_violations == 0
  end
end
