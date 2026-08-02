defmodule SP.Brain.Speaker do
  @moduledoc """
  The producer UNI's VOICE — one faculty for grounded, learned speech. It unifies what the producer
  already has into a single speaking organ:

    * GROUND — every utterance's FACTS (agent names, the cast) are bound from the live state; the
      producer never speaks a name or number it cannot see. `grounded?/2` is the falsifiable check
      the §16 grounding gate enforces (no hallucination — the language analogue of the blanket).
    * LEARN — the producer learns its language from EVERYTHING: the questions it's asked (the Anchor
      reader) AND the narration it speaks (`SP.Brain.Anchor.observe/1`). One UNI, learning all it
      hears and says; its own composed voice (`SP.Brain.Reader.compose`) grows from that experience.
    * SPEAK — the live line itself stays the grounded, grade-4, multilingual Narrator realization
      (watchable, certified by `SP.Brain.Readability`); the learned voice grows underneath until it
      can carry the line itself. No LLM, no scripted fluency — the grounding is principled, the
      learning is real.

  Pure: no process, no effects. `say/1` is a grounded line for one agent; `grounded?/2` is the gate.
  """

  alias SP.Brain.Narrator

  @doc "A grounded, grade-4 spoken line for one agent snapshot (the producer's voice, multilingual)."
  def say(%{} = data), do: Narrator.write([data])

  @doc "The English grounded line (what the grounding gate + readability score)."
  def line(%{} = data), do: Narrator.sentences([data]) |> Enum.join(" ")

  @doc """
  GROUNDED? — true iff every FACT-token in `text` is present in the live state it was generated from.
  Facts here = UNI agent names (`UNI-k-n`) and bare integers. A line that names a UNI not in the
  cast, or cites a number not in the state, is HALLUCINATION → false. This is the producer's
  no-fake-speech guarantee, made falsifiable.
  """
  def grounded?(text, %{} = state) do
    allowed_names = state |> Map.get(:cast, []) |> Enum.map(&String.downcase(to_string(&1))) |> MapSet.new()
    allowed_nums = state |> Map.get(:numbers, []) |> Enum.map(&to_string/1) |> MapSet.new()
    t = to_string(text)

    names_ok =
      Regex.scan(~r/UNI-\d+-\d+/i, t)
      |> List.flatten()
      |> Enum.all?(&MapSet.member?(allowed_names, String.downcase(&1)))

    # scan for stray numbers AFTER removing the UNI-k-n names (their digits aren't "facts").
    nums_ok =
      Regex.replace(~r/UNI-\d+-\d+/i, t, "")
      |> (&Regex.scan(~r/\b\d+\b/, &1)).()
      |> List.flatten()
      |> Enum.all?(&MapSet.member?(allowed_nums, &1))

    names_ok and nums_ok
  end

  @doc "Build the grounding `state` (allowed cast + numbers) from a list of agent snapshots."
  def state_of(rows) when is_list(rows) do
    names = Enum.map(rows, &Map.get(&1, :who, Map.get(&1, :username)))

    nums =
      Enum.flat_map(rows, fn r -> r |> Map.get(:senses, %{}) |> Map.values() |> Enum.filter(&is_integer/1) end)

    %{cast: Enum.reject(names, &is_nil/1), numbers: [length(rows) | nums]}
  end
end
