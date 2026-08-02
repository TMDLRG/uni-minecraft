defmodule SP.Brain.Reader do
  @moduledoc """
  UNI LANGUAGE — a LEARNED categorical generative model over words (reading rungs 1–3 + writing rung 4).

  This is the first step of the UNI learning to read free language WITHOUT a language model —
  no LLM, no neural net, no mimicry. It is the same active-inference machinery the agents use:
  a latent **meaning** state generates **word** observations through a likelihood `p(word|meaning)`
  whose Dirichlet counts are LEARNED from examples; a sentence is parsed by inferring the posterior
  over meaning (the categorical exact form of free-energy minimisation — a single-factor model).

  It genuinely LEARNS (counts mature with experience) and GENERALISES to unseen paraphrases via
  shared word-evidence, where a keyword router would fail. Honest ceiling: this is bag-of-words /
  topic-grade understanding — it does not yet model grammar or composition (later rungs). Pure
  Elixir on the BEAM (gate-14 clean): the only numerics are `:math.log` over learned counts.
  """

  alias SP.Brain.Reader

  @stop ~w(the a an of is are to do you i it that this what who how my me we they them and or for in on at)

  # counts: bag-of-words emission p(word|meaning) for READING; trans: meaning-conditioned word
  # BIGRAM transitions p(next|prev,meaning); tri: meaning-conditioned TRIGRAM transitions
  # p(next|prev2,prev1,meaning) for richer word ORDER (rung 4). ONE model, learned from the same
  # examples — the shared generative model of communication (perception inverts it, action emits).
  # Generation walks the trigram with BACKOFF to the bigram, so a longer-memory model speaks more
  # coherently yet never gets stuck when a 3-gram is unseen. (`tri` was added after the first
  # persisted models; `load/1` backfills it, so older saved readers upgrade transparently.)
  defstruct counts: %{}, priors: %{}, vocab: MapSet.new(), trans: %{}, tri: %{}, alpha: 0.1

  @type t :: %__MODULE__{}

  @doc "A fresh reader. `:alpha` is the Dirichlet smoothing (uninformative prior over words)."
  def new(opts \\ []), do: %__MODULE__{alpha: Keyword.get(opts, :alpha, 0.1)}

  @doc """
  Split text into content word-tokens: lowercased, punctuation-stripped, light stop-words removed,
  then STEMMED (rung-4 morphology) so inflections collapse — "agents"→"agent", "running"→"runn",
  "fastest"→"fast" — letting the model generalise across word forms it learned in any inflection.
  """
  def tokenize(text) do
    text
    |> to_string()
    |> String.downcase()
    |> String.split(~r/[^a-z0-9]+/u, trim: true)
    |> Enum.reject(&(&1 in @stop))
    |> Enum.map(&stem/1)
  end

  # a conservative inflectional stemmer (deterministic, pure): strip ONE common suffix, longest
  # first, with a min-stem guard so we never mangle short words. Not full morphology (it won't
  # relate "bot"≈"robot"); it collapses inflections, which is the honest rung-4 generalisation.
  defp stem(w) do
    cond do
      byte_size(w) > 5 and String.ends_with?(w, "ing") -> String.slice(w, 0..-4//1)
      byte_size(w) > 4 and String.ends_with?(w, "est") -> String.slice(w, 0..-4//1)
      byte_size(w) > 4 and String.ends_with?(w, "ed") -> String.slice(w, 0..-3//1)
      byte_size(w) > 4 and String.ends_with?(w, "ly") -> String.slice(w, 0..-3//1)
      byte_size(w) > 3 and String.ends_with?(w, "es") -> String.slice(w, 0..-3//1)
      byte_size(w) > 3 and String.ends_with?(w, "ss") -> w
      byte_size(w) > 3 and String.ends_with?(w, "s") -> String.slice(w, 0..-2//1)
      true -> w
    end
  end

  @doc "Learn one labelled example: `text` means `meaning`. Updates the Dirichlet word counts."
  def learn(%Reader{} = m, text, meaning) do
    words = tokenize(text)
    wfreq = Enum.frequencies(words)

    %Reader{
      m
      | counts: Map.update(m.counts, meaning, wfreq, &merge_add(&1, wfreq)),
        priors: Map.update(m.priors, meaning, 1, &(&1 + 1)),
        vocab: Enum.reduce(words, m.vocab, &MapSet.put(&2, &1)),
        trans: learn_trans(m.trans, meaning, words),
        tri: learn_tri(m.tri, meaning, words)
    }
  end

  # accumulate meaning-conditioned bigram transition counts (with :start/:end sentinels).
  defp learn_trans(trans, _meaning, []), do: trans

  defp learn_trans(trans, meaning, words) do
    seq = [:start | words] ++ [:end]

    seq
    |> Enum.zip(tl(seq))
    |> Enum.reduce(trans, fn {prev, next}, acc ->
      mt = Map.get(acc, meaning, %{})
      row = Map.get(mt, prev, %{})
      Map.put(acc, meaning, Map.put(mt, prev, Map.update(row, next, 1, &(&1 + 1))))
    end)
  end

  # accumulate meaning-conditioned TRIGRAM counts (rung 4 — word ORDER over two-word memory),
  # padded with two :start sentinels so the first real word is conditioned on the sentence start.
  defp learn_tri(tri, _meaning, []), do: tri

  defp learn_tri(tri, meaning, words) do
    seq = [:start, :start | words] ++ [:end]

    seq
    |> triples()
    |> Enum.reduce(tri, fn {p2, p1, next}, acc ->
      mt = Map.get(acc, meaning, %{})
      key = {p2, p1}
      row = Map.get(mt, key, %{})
      Map.put(acc, meaning, Map.put(mt, key, Map.update(row, next, 1, &(&1 + 1))))
    end)
  end

  # [a,b,c,d] → [{a,b,c},{b,c,d}] — consecutive ordered triples.
  defp triples(seq) do
    seq |> Enum.zip(tl(seq)) |> Enum.zip(tl(tl(seq))) |> Enum.map(fn {{a, b}, c} -> {a, b, c} end)
  end

  @doc "Learn a whole corpus of `{text, meaning}` pairs (order-independent — pure count accumulation)."
  def learn_corpus(%Reader{} = m, pairs),
    do: Enum.reduce(pairs, m, fn {t, mean}, acc -> learn(acc, t, mean) end)

  @doc """
  TRAIN on raw text for GENERATION fluency: learn the word TRANSITIONS (under a generation
  `channel`, default `:narration`) and grow the vocabulary — but NOT the emission/priors, so a
  language corpus teaches the producer to SPEAK without polluting the reading-intent classes.
  This is "learning to write from a body of text" (the producer reads the corpus, its surprise on
  show-like sentences drops). Pure count accumulation; order-independent.
  """
  def train(%Reader{} = m, text, channel \\ :narration) do
    words = tokenize(text)

    %Reader{
      m
      | vocab: Enum.reduce(words, m.vocab, &MapSet.put(&2, &1)),
        trans: learn_trans(m.trans, channel, words),
        tri: learn_tri(m.tri, channel, words)
    }
  end

  @doc "Train on many raw lines (a corpus) for generation fluency."
  def train_corpus(%Reader{} = m, texts, channel \\ :narration),
    do: Enum.reduce(texts, m, &train(&2, &1, channel))

  @doc """
  Infer the posterior over meanings for `text`: `[{meaning, prob}]` sorted high→low.
  log p(meaning | words) ∝ log p(meaning) + Σ_w log p(w | meaning), Laplace/Dirichlet-smoothed.
  Words never seen in training contribute no evidence (skipped) — honest about ignorance.
  """
  def infer(%Reader{counts: counts} = m, text) when map_size(counts) > 0 do
    words = tokenize(text) |> Enum.filter(&MapSet.member?(m.vocab, &1))
    v = max(MapSet.size(m.vocab), 1)
    total_docs = m.priors |> Map.values() |> Enum.sum() |> max(1)

    logs =
      for {meaning, wc} <- counts do
        total = wc |> Map.values() |> Enum.sum()

        logl =
          Enum.reduce(words, 0.0, fn w, acc ->
            c = Map.get(wc, w, 0.0) + m.alpha
            acc + :math.log(c / (total + m.alpha * v))
          end)

        {meaning, :math.log(Map.get(m.priors, meaning, 1) / total_docs) + logl}
      end

    softmax(logs)
  end

  def infer(%Reader{}, _text), do: []

  @doc """
  The single most likely meaning, or `:unsure` when there is no evidence (no known content words)
  or the top meaning isn't clearly ahead (`min_conf`, default 0.30). Honest: it admits when it
  cannot read the sentence, instead of guessing.
  """
  def meaning(%Reader{} = m, text, opts \\ []) do
    min_conf = Keyword.get(opts, :min_conf, 0.30)
    known = tokenize(text) |> Enum.any?(&MapSet.member?(m.vocab, &1))

    case infer(m, text) do
      [{meaning, p} | _] when known and p >= min_conf -> meaning
      _ -> :unsure
    end
  end

  @doc "Top-`k` meanings above `min_conf` (for multi-intent questions), highest first."
  def meanings(%Reader{} = m, text, opts \\ []) do
    k = Keyword.get(opts, :k, 3)
    min_conf = Keyword.get(opts, :min_conf, 0.20)
    known = tokenize(text) |> Enum.any?(&MapSet.member?(m.vocab, &1))

    if known do
      m
      |> infer(text)
      |> Enum.filter(fn {_, p} -> p >= min_conf end)
      |> Enum.take(k)
      |> Enum.map(&elem(&1, 0))
    else
      []
    end
  end

  @doc """
  EPISTEMIC read (active-inference information-seeking): classify the meaning with a confidence
  verdict so the speaker can ACT to disambiguate when uncertain.

    * `{:confident, meaning}`  — the posterior is peaked (top ≥ `:confident`, default 0.55)
    * `{:ambiguous, [m1, m2]}` — two meanings are close (top−2nd < `:margin`, default 0.25); the
      producer should ASK which (an utterance chosen to minimise expected free energy / uncertainty)
    * `:unsure`                — no learned evidence (unknown words)
  """
  def classify(%Reader{} = m, text, opts \\ []) do
    conf = Keyword.get(opts, :confident, 0.55)
    margin = Keyword.get(opts, :margin, 0.25)
    known = tokenize(text) |> Enum.any?(&MapSet.member?(m.vocab, &1))

    case infer(m, text) do
      _ when not known -> :unsure
      [{a, pa}, {b, pb} | _] when pa - pb < margin and pa < conf -> {:ambiguous, [a, b]}
      [{a, pa} | _] when pa >= conf -> {:confident, a}
      [{a, _} | _] -> {:confident, a}
      _ -> :unsure
    end
  end

  @doc """
  UTTERANCE (the generative direction — speaking from the SAME learned model used to read): the
  `k` words most CHARACTERISTIC of a meaning (high `p(word|meaning)`, low elsewhere). The shared
  generative model of communication: perception inverts it (`infer`), action emits from it.
  """
  def utter(%Reader{counts: counts}, meaning, opts \\ []) do
    k = Keyword.get(opts, :k, 4)
    wc = Map.get(counts, meaning, %{})
    overall = Enum.reduce(counts, %{}, fn {_m, c}, acc -> merge_add(acc, c) end)

    wc
    |> Enum.map(fn {w, c} -> {w, c / (1.0 + (Map.get(overall, w, c) - c))} end)
    |> Enum.sort_by(&(-elem(&1, 1)))
    |> Enum.take(k)
    |> Enum.map(&elem(&1, 0))
  end

  @doc """
  COMPOSE (rung 4 — generative speaking): emit a word sequence for a meaning by walking the
  learned meaning-conditioned TRIGRAM transitions `p(next|prev2,prev1,meaning)` from :start to
  :end, BACKING OFF to the bigram `p(next|prev,meaning)` whenever a two-word context is unseen.
  Greedy by default (deterministic); `sample: rng` for stochastic utterance. This is the producer
  SPEAKING from the same model it reads with — honest ceiling: n-gram-grade, it grows with the corpus.
  """
  def compose(%Reader{} = m, meaning, opts \\ []) do
    max = Keyword.get(opts, :max, 10)
    walk(m, meaning, :start, :start, [], max, Keyword.get(opts, :sample)) |> Enum.join(" ")
  end

  defp walk(_m, _mean, _p2, _p1, acc, 0, _rng), do: Enum.reverse(acc)

  defp walk(m, mean, p2, p1, acc, n, rng) do
    case next_row(m, mean, p2, p1) do
      nil ->
        Enum.reverse(acc)

      row ->
        next = if rng, do: sample_word(row, rng), else: row |> Enum.max_by(&elem(&1, 1)) |> elem(0)

        if next == :end,
          do: Enum.reverse(acc),
          else: walk(m, mean, p1, next, [to_string(next) | acc], n - 1, rng)
    end
  end

  # the next-word distribution conditioned on (prev2, prev1): the TRIGRAM row if it has mass, else
  # BACK OFF to the bigram row conditioned on prev1; `nil` when neither has been learned (dead end).
  defp next_row(m, mean, p2, p1) do
    tri = get_in(m.tri, [mean, {p2, p1}])

    cond do
      is_map(tri) and map_size(tri) > 0 ->
        tri

      true ->
        bi = get_in(m.trans, [mean, p1])
        if is_map(bi) and map_size(bi) > 0, do: bi, else: nil
    end
  end

  defp sample_word(row, rng) do
    z = row |> Map.values() |> Enum.sum()
    {r, _} = :rand.uniform_s(rng)
    target = r * z

    Enum.reduce_while(row, 0.0, fn {w, c}, acc ->
      if acc + c >= target, do: {:halt, w}, else: {:cont, acc + c}
    end)
  end

  @doc """
  SURPRISE (= free energy) — the falsifiable "did it learn?" MEASUREMENT, and it is the very
  quantity the engine minimises: the model's surprise `−ln p(text | meaning)` under the learned
  transitions. LOW on text the model expects (learned/on-topic), HIGH on word-salad. It is a
  RULER, not a mechanism — it scores the model, it drives no decision. Watch it DROP as the corpus
  grows: that is learning, measured in the FEP's own currency (cf. UNI.OS `F = −log_evidence`).
  """
  def surprise(%Reader{vocab: vocab} = m, text, meaning) do
    words = tokenize(text)
    seq = [:start, :start | words] ++ [:end]
    v = max(MapSet.size(vocab), 1)

    seq
    |> triples()
    |> Enum.reduce(0.0, fn {p2, p1, next}, s ->
      s - :math.log(prob_next(m, meaning, p2, p1, next, v))
    end)
  end

  # interpolated next-word probability over the TRIGRAM and BIGRAM rows with a uniform floor —
  # learned word-order (real 3-grams) scores high; word-salad backs off to ≈1/V (high surprise).
  defp prob_next(m, mean, p2, p1, next, v) do
    tri = get_in(m.tri, [mean, {p2, p1}]) || %{}
    bi = get_in(m.trans, [mean, p1]) || %{}
    0.6 * smoothed(tri, next, v) + 0.3 * smoothed(bi, next, v) + 0.1 / v
  end

  defp smoothed(row, next, v) do
    total = row |> Map.values() |> Enum.sum()
    (Map.get(row, next, 0) + 1.0 / v) / (total + 1.0)
  end

  @doc """
  MERGE two readers into one (pure): UNION the vocabulary and ADD the Dirichlet/transition counts,
  so two bodies of learning combine without losing either. Used to fold a freshly-seeded (richer)
  corpus into a reader that has been learning online — and to migrate an older in-memory/saved
  reader forward (it reads each field defensively, so a model from before `:tri` existed merges fine).
  """
  def merge(%Reader{} = a, %Reader{} = b) do
    %Reader{
      alpha: a.alpha,
      vocab: MapSet.union(field(a, :vocab, MapSet.new()), field(b, :vocab, MapSet.new())),
      priors: merge_add(field(a, :priors, %{}), field(b, :priors, %{})),
      counts: merge_by_meaning(field(a, :counts, %{}), field(b, :counts, %{}), &merge_add/2),
      trans: merge_by_meaning(field(a, :trans, %{}), field(b, :trans, %{}), &merge_rows/2),
      tri: merge_by_meaning(field(a, :tri, %{}), field(b, :tri, %{}), &merge_rows/2)
    }
  end

  defp field(m, k, default), do: Map.get(m, k, default)
  defp merge_by_meaning(a, b, combine), do: Map.merge(a, b, fn _meaning, x, y -> combine.(x, y) end)
  defp merge_rows(a, b), do: Map.merge(a, b, fn _ctx, r1, r2 -> merge_add(r1, r2) end)

  @doc "Words the reader has learned (its vocabulary size + the meanings it knows)."
  def knowledge(%Reader{} = m),
    do: %{words: MapSet.size(m.vocab), meanings: Map.keys(m.counts), examples: m.priors}

  @doc "Persist the learned model (so language grows across restarts — like the agents' memory)."
  def save(%Reader{} = m, path) do
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, :erlang.term_to_binary(m))
  end

  @doc """
  Load a persisted reader, or `nil` if absent/corrupt (caller seeds a fresh one). BACKFILLS any
  struct field added since the file was written (e.g. `:tri`) with its default, so older saved
  readers upgrade transparently instead of crashing on a missing key.
  """
  def load(path) do
    case File.read(path) do
      {:ok, bin} ->
        m = :erlang.binary_to_term(bin)

        if is_map(m) and Map.get(m, :__struct__) == __MODULE__,
          do: struct(__MODULE__, Map.delete(m, :__struct__)),
          else: nil

      _ ->
        nil
    end
  rescue
    _ -> nil
  end

  # --- helpers ---------------------------------------------------------------

  defp merge_add(a, b), do: Map.merge(a, b, fn _k, x, y -> x + y end)

  defp softmax(logs) do
    mx = logs |> Enum.map(&elem(&1, 1)) |> Enum.max()
    exps = Enum.map(logs, fn {k, lp} -> {k, :math.exp(lp - mx)} end)
    z = exps |> Enum.map(&elem(&1, 1)) |> Enum.sum()
    exps |> Enum.map(fn {k, e} -> {k, e / z} end) |> Enum.sort_by(&(-elem(&1, 1)))
  end
end
