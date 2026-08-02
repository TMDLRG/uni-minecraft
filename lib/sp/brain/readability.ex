defmodule SP.Brain.Readability do
  @moduledoc """
  The OPENLY-FALSIFIABLE grade-level harness for the Producer's language faculty. Pure
  arithmetic over text — NO neural scoring, no model — so anyone can recompute it and dispute
  the result. It measures English (the primary caption); the other four languages mirror the
  same generated structure (see `docs/LANGUAGE.md`).

  `analyze/1` returns the rubric metrics for a paragraph; `meets_grade4?/1` returns
  `{ok?, reasons}` against the published contract. The single `grade` number is a TRANSPARENT
  custom index (documented below), not authority — the ten rubric checks are the real claim.

  Grade-4 contract (a sample = a list of sentence strings, one paragraph):
    1 multi-clause   ≥60% of sentences have ≥2 clauses (a connective joins them)
    2 connectives    ≥3 distinct connectives across the sample
    3 cause→effect   ≥1 because/so in the paragraph
    4 reference      0 naked-pronoun-before-introduction violations
    6 opening variety ≤60% of sentences share the same opening word
    7 paragraph      3..5 sentences
    8 length band    mean 7..16 words/sentence
    grade index      structural grade in [3.0, 5.0]
  (Tense consistency (5) and 100% grammaticality (9) are enforced by CONSTRUCTION in the
  Narrator/grammar — the generator only emits well-formed, single-tense clauses — and asserted
  there; this analyzer measures what is robustly checkable from surface text.)
  """

  @connectives ~w(because so but then when while and or after before since)

  @doc "Metrics for one paragraph (a list of sentence strings, or a single string)."
  def analyze(text) when is_binary(text), do: analyze(split_sentences(text))

  def analyze(sentences) when is_list(sentences) do
    sentences = Enum.reject(sentences, &(String.trim(&1) == ""))
    n = length(sentences)
    words = Enum.map(sentences, &word_count/1)
    clauses = Enum.map(sentences, &clause_count/1)
    conns = used_connectives(sentences)
    openings = Enum.map(sentences, &opening/1)
    mean_words = mean(words)
    mean_clauses = mean(clauses)

    %{
      sentences: n,
      mean_words: Float.round(mean_words, 2),
      mean_clauses: Float.round(mean_clauses, 2),
      multiclause_frac: Float.round(frac(clauses, &(&1 >= 2)), 2),
      connectives: conns,
      cause_effect: count_matches(sentences, ~w(because so)),
      opening_repeat_frac: Float.round(opening_repeat(openings), 2),
      reference_violations: reference_violations(sentences),
      grade: Float.round(grade_index(mean_words, mean_clauses), 2)
    }
  end

  @doc "Check a paragraph against the grade-4 contract: `{ok?, reasons_failed}`."
  def meets_grade4?(text) do
    m = analyze(text)

    checks = [
      {m.multiclause_frac >= 0.6, "multi-clause <60% (#{m.multiclause_frac})"},
      {length(m.connectives) >= 3, "fewer than 3 distinct connectives (#{inspect(m.connectives)})"},
      {m.cause_effect >= 1, "no because/so cause→effect"},
      {m.reference_violations == 0, "#{m.reference_violations} naked-pronoun-before-intro"},
      {m.opening_repeat_frac <= 0.6, "openings too repetitive (#{m.opening_repeat_frac})"},
      {m.sentences >= 3 and m.sentences <= 5, "paragraph not 3..5 sentences (#{m.sentences})"},
      {m.mean_words >= 7 and m.mean_words <= 16, "mean words/sentence outside 7..16 (#{m.mean_words})"},
      {m.grade >= 3.0 and m.grade <= 5.0, "structural grade outside [3,5] (#{m.grade})"}
    ]

    reasons = for {ok?, why} <- checks, not ok?, do: why
    {reasons == [], reasons}
  end

  # --- transparent metrics ---------------------------------------------------

  # custom, fully-disclosed structural grade: a single main clause of ~6 words ≈ grade 2; a
  # two-clause sentence of ~11 words ≈ grade 4; three clauses / longer climbs toward 5–6.
  def grade_index(mean_words, mean_clauses) do
    (2.0 + 1.2 * (mean_clauses - 1) + 0.15 * (mean_words - 6)) |> max(1.0) |> min(12.0)
  end

  defp split_sentences(text) do
    text
    |> String.split(~r/(?<=[.!?।。])\s+/u, trim: true)
    |> Enum.map(&String.trim/1)
  end

  defp word_count(s), do: s |> String.split(~r/\s+/u, trim: true) |> length()

  # clauses ≈ 1 + number of clause-joining connective tokens present (a grade-school proxy).
  defp clause_count(s) do
    toks = tokens(s)
    1 + Enum.count(toks, &(&1 in @connectives))
  end

  defp used_connectives(sentences) do
    sentences |> Enum.flat_map(&tokens/1) |> Enum.filter(&(&1 in @connectives)) |> Enum.uniq()
  end

  defp count_matches(sentences, words) do
    sentences |> Enum.flat_map(&tokens/1) |> Enum.count(&(&1 in words))
  end

  # the first WORD as written (keep names intact: "UNI-2-3" stays distinct from "UNI-1-1" rather
  # than collapsing to a shared token), lower-cased, sentence punctuation stripped.
  defp opening(s) do
    s
    |> String.split(~r/\s+/u, trim: true)
    |> List.first()
    |> to_string()
    |> String.downcase()
    |> String.replace(~r/[.,!?;:।。、，]/u, "")
  end

  defp opening_repeat([]), do: 0.0

  defp opening_repeat(openings) do
    {_, top} = openings |> Enum.frequencies() |> Enum.max_by(&elem(&1, 1), fn -> {nil, 0} end)
    top / length(openings)
  end

  # a pronoun (it/they/its/their) is a violation only if it appears in a sentence BEFORE any
  # capitalised subject token (a name) has been introduced in the paragraph so far.
  @pronouns ~w(it they its their them)
  defp reference_violations(sentences) do
    {violations, _introduced?} =
      Enum.reduce(sentences, {0, false}, fn s, {v, introduced?} ->
        has_name = Regex.match?(~r/\b[A-Z][A-Za-z0-9-]+\b/u, s)
        starts_pronoun = opening(s) in @pronouns
        v = if starts_pronoun and not introduced?, do: v + 1, else: v
        {v, introduced? or has_name}
      end)

    violations
  end

  defp tokens(s) do
    s
    |> String.downcase()
    |> String.replace(~r/[^\p{L}\p{N}\s]/u, " ")
    |> String.split(~r/\s+/u, trim: true)
  end

  defp mean([]), do: 0.0
  defp mean(xs), do: Enum.sum(xs) / length(xs)

  defp frac([], _f), do: 0.0
  defp frac(xs, f), do: Enum.count(xs, f) / length(xs)
end
