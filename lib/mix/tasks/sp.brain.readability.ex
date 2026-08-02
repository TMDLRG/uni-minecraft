defmodule Mix.Tasks.Sp.Brain.Readability do
  @shortdoc "Score the Narrator UNI's writing against the openly-falsifiable grade-4 contract."
  @moduledoc """
  Generates scene paragraphs with `SP.Brain.Narrator` and scores them with
  `SP.Brain.Readability` — the published, pure-arithmetic grade-4 contract (no model). Prints
  the paragraph, the per-metric breakdown, and PASS/FAIL, so anyone can recompute and try to
  break it.

      mix sp.brain.readability

  This is the language faculty's falsification harness: dispute the formula, or find a colony
  whose scene drops below grade 4 — both are visible here. See `docs/LANGUAGE.md`.
  """
  use Mix.Task

  alias SP.Brain.{Narrator, Readability}

  @fixtures %{
    "calm colony" => [
      %{who: "UNI-1-1", emotion: :calm, context: :forage, action: "forward", senses: %{"food" => 16}},
      %{who: "UNI-1-2", emotion: :curious, context: nil, action: "mine", senses: %{"food" => 18}},
      %{who: "UNI-1-3", emotion: :content, context: :social, action: "forward", senses: %{"food" => 18}},
      %{who: "UNI-1-4", emotion: :calm, context: :build, action: "forward", senses: %{"food" => 14}}
    ],
    "colony in crisis" => [
      %{
        who: "UNI-2-1",
        emotion: :fear,
        context: :flee,
        action: "forward",
        senses: %{"health" => 4, "hurt" => true}
      },
      %{who: "UNI-2-2", emotion: :fear, context: :flee, action: "forward", senses: %{"health" => 6}},
      %{who: "UNI-2-3", emotion: :weary, context: :forage, action: "forward", senses: %{"food" => 5}},
      %{who: "UNI-2-4", emotion: :calm, context: :social, action: "forward", senses: %{"food" => 12}}
    ],
    "single agent" => [
      %{who: "UNI-3-1", emotion: :curious, context: nil, action: "mine", senses: %{"food" => 18}}
    ]
  }

  @impl true
  def run(_args) do
    Mix.Task.run("compile")
    IO.puts("\nGRADE-4 LANGUAGE FACULTY — falsification report (pure arithmetic; see docs/LANGUAGE.md)\n")

    results =
      Enum.map(@fixtures, fn {label, rows} ->
        ss = Narrator.sentences(rows)
        m = Readability.analyze(ss)
        {ok?, reasons} = Readability.meets_grade4?(ss)

        IO.puts("== #{label} ==")
        Enum.each(ss, &IO.puts("  " <> &1))

        IO.puts(
          "  metrics: grade=#{m.grade} · sentences=#{m.sentences} · clauses/sent=#{m.mean_clauses} · " <>
            "words/sent=#{m.mean_words} · multiclause=#{m.multiclause_frac} · connectives=#{inspect(m.connectives)} · " <>
            "cause→effect=#{m.cause_effect} · opening-repeat=#{m.opening_repeat_frac} · ref-violations=#{m.reference_violations}"
        )

        IO.puts("  GRADE-4: #{if ok?, do: "PASS", else: "FAIL — " <> inspect(reasons)}\n")
        ok?
      end)

    if Enum.all?(results) do
      IO.puts(
        "ALL FIXTURES MEET THE GRADE-4 CONTRACT. Try to falsify: edit a fixture, or dispute grade_index/0."
      )
    else
      Mix.raise("a fixture FAILED the grade-4 contract")
    end
  end
end
