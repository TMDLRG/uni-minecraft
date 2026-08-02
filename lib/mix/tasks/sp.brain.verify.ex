defmodule Mix.Tasks.Sp.Brain.Verify do
  @shortdoc "Run the active-inference §16 validation checklist (CI gate)."
  @moduledoc """
  Runs `SP.Brain.ValidationEngine` over the expressed genome AND a non-genome card
  (a nociception reflex), printing the 13-point checklist and exiting non-zero on any
  failure. This is the enforceable fence: the covenant holds because CI breaks when a
  gate breaks.

      mix sp.brain.verify
  """
  use Mix.Task

  alias SP.Brain.{ValidationEngine, Designer}

  @impl true
  def run(_args) do
    Mix.Task.run("compile")

    pain = %{
      modalities: [%{name: :nociception, no: 3, ns: 3}, %{name: :status, no: 4, ns: 4}],
      actions: [:withdraw, :guard, :forward, :eat, :noop],
      preferences: %{nociception: %{0 => 2.0, 2 => -6.0}},
      learn: %{a: true, b: true},
      gamma: 8.0
    }

    cards = [
      {"genome (survival agent)", nil},
      {"nociception reflex card", Designer.compile(pain)},
      {"producer UNI (show-runner)", SP.Producer.Genome.model()},
      {"narrator UNI (grade-4 writer)", SP.Brain.Narrator.model()}
    ]

    statuses =
      Enum.map(cards, fn {label, model} ->
        IO.puts("\n== #{label} ==")
        {status, _} = ValidationEngine.report(model)
        status
      end)

    # GLOBAL gates run once, not per card: 14 no-foreign-layer · 15 native-JIT · 17 no-simulator
    # in the live path · 18 no-foreign-mind (no LLM/network) in the live path. 17–18 are the
    # "no fake in UNI" fence — the live senses come from real Minecraft and decisions are pure.
    IO.puts("\n== on-chip + no-fake fence (math on chip · no sim · no foreign mind) ==")
    global = ValidationEngine.global_gates()

    Enum.each(global, fn {id, name, s, detail} ->
      mark = %{pass: "PASS", fail: "FAIL", skip: "····"}[s]
      IO.puts("  [#{mark}] #{id} · #{name}#{if detail == "", do: "", else: "  (#{detail})"}")
    end)

    global_ok = Enum.all?(global, fn {_, _, s, _} -> s != :fail end)

    # Gen-3 LANGUAGE gate: the Narrator UNI's scene must MEET the published grade-4 contract
    # (openly falsifiable — pure arithmetic, recomputable; see docs/LANGUAGE.md).
    IO.puts("\n== language (grade-4 reading/writing) ==")
    lang_ok = language_gate()

    if Enum.all?(statuses, &(&1 == :ok)) and global_ok and lang_ok do
      IO.puts("\nALL GATES PASS — the §16 covenant holds (on-chip 14–15, no-fake 17–18, grade-4 16).")
    else
      Mix.raise("validation FAILED — one or more gates did not pass")
    end
  end

  # a fixed synthetic colony ⇒ the Narrator writes a scene ⇒ the harness scores it. Deterministic.
  defp language_gate do
    rows = [
      %{who: "UNI-1-1", emotion: :calm, context: :forage, action: "forward", senses: %{"food" => 6}},
      %{who: "UNI-1-2", emotion: :curious, context: nil, action: "mine", senses: %{"food" => 18}},
      %{
        who: "UNI-1-3",
        emotion: :fear,
        context: :flee,
        action: "forward",
        senses: %{"health" => 5, "hurt" => true}
      },
      %{who: "UNI-1-4", emotion: :content, context: :social, action: "forward", senses: %{"food" => 18}}
    ]

    ss = SP.Brain.Narrator.sentences(rows)
    {ok?, reasons} = SP.Brain.Readability.meets_grade4?(ss)
    m = SP.Brain.Readability.analyze(ss)
    mark = if ok?, do: "PASS", else: "FAIL"

    IO.puts(
      "  [#{mark}] 16 · scene meets the grade-4 contract  (grade #{m.grade}, #{m.sentences} sentences, #{length(m.connectives)} connectives)"
    )

    unless ok?, do: IO.puts("        failed: #{inspect(reasons)}")
    ok?
  end
end
