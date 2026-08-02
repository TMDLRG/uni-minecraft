defmodule SP.Brain.Language do
  @moduledoc """
  UNI LANGUAGE — rung 5: a DEEPER generative model of speech than the flat n-gram. A meaning-
  conditioned discrete LATENT-STATE sequence model (an HMM over word tokens): a hidden state
  sequence z₁..z_T generates the words, with learned initial π, transitions A (K×K), and emissions
  B (state → word). Same active-inference family as the agents' brains and the visual cortex — a
  generative model inverted by EXACT inference (log-space forward–backward), its parameters learned
  by Baum–Welch EM (Dirichlet-conjugate); free energy = −log p(text).

  Why deeper than the n-gram: the latent states cluster words into reusable "modes" and carry
  sequence structure through the transition matrix, so generation is decoded from a learned latent
  TRAJECTORY, not a memoryless surface walk. Pure Elixir — no neural net, no LLM. Honest ceiling:
  still a finite-state model (richer than a trigram, not human-fluent); it learns toward its ceiling
  as the corpus grows — so quality is now bounded by TRAINING, not by missing capacity.
  """

  alias SP.Brain.Language

  @eos :"$end"

  # docs: %{meaning => [[word,...], ...]} corpus (per meaning). model: %{meaning => fitted params}.
  defstruct k: 8, alpha: 0.1, vocab: MapSet.new(), docs: %{}, model: %{}, seed: 1

  @type t :: %__MODULE__{}

  def new(opts \\ []) do
    %__MODULE__{
      k: Keyword.get(opts, :k, 8),
      alpha: Keyword.get(opts, :alpha, 0.1),
      seed: Keyword.get(opts, :seed, 1)
    }
  end

  @doc "Surface tokens for GENERATION — lowercased, punctuation-split, NO stop-word removal, NO stemming."
  def tokenize(text) do
    text |> to_string() |> String.downcase() |> String.split(~r/[^a-z0-9']+/u, trim: true)
  end

  @doc "Add one sentence to a meaning's corpus (grows vocab). Re-`fit/1` to learn from it."
  def learn(%Language{} = m, text, meaning) do
    words = tokenize(text)

    if words == [] do
      m
    else
      %Language{
        m
        | docs: Map.update(m.docs, meaning, [words], &[words | &1]),
          vocab: Enum.reduce(words, m.vocab, &MapSet.put(&2, &1))
      }
    end
  end

  def learn_corpus(%Language{} = m, pairs),
    do: Enum.reduce(pairs, m, fn {t, mean}, acc -> learn(acc, t, mean) end)

  @doc "Fit the HMM for every meaning by Baum–Welch EM (`:iters`, default 12). Returns `{model, history}`."
  def fit(%Language{} = m, opts \\ []) do
    iters = Keyword.get(opts, :iters, 12)

    model =
      Map.new(m.docs, fn {mean, seqs} ->
        {mean, fit_one(seqs, m.k, m.alpha, m.seed + :erlang.phash2(mean), iters)}
      end)

    %Language{m | model: model}
  end

  @doc "Free energy − the falsifiable learning metric: `−log p(text | meaning)` under the fitted HMM."
  def surprise(%Language{model: model}, text, meaning) do
    case Map.get(model, meaning) do
      nil -> 0.0
      p -> -log_evidence(tokenize(text) ++ [@eos], p)
    end
  end

  @doc """
  GENERATE a sentence for a meaning by decoding a latent trajectory: sample/argmax z from π, emit a
  word from B[z], transition z→z′, until `$end` or `:max`. Greedy (deterministic) by default;
  `sample: rng` for stochastic speech. This is the producer SPEAKING from the learned latent model.
  """
  def generate(%Language{model: model}, meaning, opts \\ []) do
    case Map.get(model, meaning) do
      nil -> ""
      p -> decode(p, Keyword.get(opts, :max, 14), Keyword.get(opts, :sample)) |> Enum.join(" ")
    end
  end

  def knowledge(%Language{} = m) do
    %{
      states: m.k,
      words: MapSet.size(m.vocab),
      meanings: Map.keys(m.model),
      docs: Map.new(m.docs, fn {k, v} -> {k, length(v)} end)
    }
  end

  @doc "Persist the trained model (so a heavy training pass survives restarts)."
  def save(%Language{} = m, path) do
    File.mkdir_p!(Path.dirname(path))
    File.write!(path, :erlang.term_to_binary(m))
  end

  @doc "Load a trained model, or nil if absent/corrupt."
  def load(path) do
    case File.read(path) do
      {:ok, bin} -> ((m = :erlang.binary_to_term(bin)) && match?(%Language{}, m) && m) || nil
      _ -> nil
    end
  rescue
    _ -> nil
  end

  # --- Baum–Welch EM for one meaning's sequences -----------------------------

  defp fit_one(seqs, k, alpha, seed, iters) do
    seqs = Enum.map(seqs, &(&1 ++ [@eos]))
    vocab = seqs |> List.flatten() |> Enum.uniq()
    v = max(length(vocab), 1)
    rng = :rand.seed_s(:exsss, {seed, seed * 7 + 1, seed * 13 + 3})

    # symmetry-broken init (a symmetric HMM can't differentiate states under EM).
    {pi0, rng} = rand_row(k, rng)
    {a0, rng} = rand_mat(k, rng)
    {b0, _rng} = rand_emit(k, vocab, rng)
    init = %{pi: pi0, a: a0, b: b0, v: v, alpha: alpha}

    Enum.reduce(1..iters, init, fn _, p -> em_step(seqs, p, k) end)
  end

  defp em_step(seqs, p, k) do
    log_pi = Enum.map(p.pi, &safe_log/1)
    log_a = Enum.map(p.a, fn row -> Enum.map(row, &safe_log/1) end)

    acc0 = %{pi: zeros(k), a: zmat(k), b: %{}, floor: p.alpha}

    acc =
      Enum.reduce(seqs, acc0, fn seq, acc ->
        {la, _ev} = forward(seq, log_pi, log_a, p)
        lb = backward(seq, log_a, p)
        tmax = length(seq)
        lg = for t <- 0..(tmax - 1), do: norm_log(vec_add(Enum.at(la, t), Enum.at(lb, t)))
        gamma = Enum.map(lg, fn row -> Enum.map(row, &:math.exp/1) end)

        # ξ_t[i][j] ∝ α_t[i] · A[i][j] · b_{t+1}[j] · β_{t+1}[j]
        xi_sum =
          Enum.reduce(0..(tmax - 2), zmat(k), fn t, m ->
            lat = Enum.at(la, t)
            lbt1 = Enum.at(lb, t + 1)
            obs1 = Enum.at(seq, t + 1)

            block =
              for i <- 0..(k - 1) do
                for j <- 0..(k - 1) do
                  Enum.at(lat, i) + Enum.at(Enum.at(log_a, i), j) + log_emit(p, j, obs1) + Enum.at(lbt1, j)
                end
              end

            z = lse(List.flatten(block))

            norm =
              for i <- 0..(k - 1), do: for(j <- 0..(k - 1), do: :math.exp(Enum.at(Enum.at(block, i), j) - z))

            mat_add(m, norm)
          end)

        b_acc =
          Enum.reduce(0..(tmax - 1), acc.b, fn t, b ->
            w = Enum.at(seq, t)
            g = Enum.at(gamma, t)

            Enum.reduce(0..(k - 1), b, fn s, b2 ->
              Map.update(b2, {s, w}, Enum.at(g, s), &(&1 + Enum.at(g, s)))
            end)
          end)

        %{acc | pi: vec_add(acc.pi, hd(gamma)), a: mat_add(acc.a, xi_sum), b: b_acc}
      end)

    # M-step (Dirichlet-smoothed)
    pi = normalize(Enum.map(acc.pi, &(&1 + p.alpha)))
    a = Enum.map(acc.a, fn row -> normalize(Enum.map(row, &(&1 + p.alpha))) end)

    # emission: per state, prob over the words it emitted (+ alpha floor for unseen).
    by_state =
      Enum.reduce(acc.b, %{}, fn {{s, w}, c}, m -> Map.update(m, s, %{w => c}, &Map.put(&1, w, c)) end)

    b =
      Map.new(0..(k - 1), fn s ->
        counts = Map.get(by_state, s, %{})
        total = (counts |> Map.values() |> Enum.sum()) + p.alpha * p.v
        probs = Map.new(counts, fn {w, c} -> {w, (c + p.alpha) / total} end)
        {s, %{probs: probs, floor: p.alpha / total}}
      end)

    %{p | pi: pi, a: a, b: b}
  end

  # --- inference (log-space) -------------------------------------------------

  defp forward(seq, log_pi, log_a, p) do
    [o0 | rest] = seq
    a0 = for s <- 0..(length(log_pi) - 1), do: Enum.at(log_pi, s) + log_emit(p, s, o0)

    {alphas_rev, _} =
      Enum.reduce(rest, {[a0], a0}, fn o, {acc, prev} ->
        cur =
          for j <- 0..(length(prev) - 1) do
            trans = for i <- 0..(length(prev) - 1), do: Enum.at(prev, i) + Enum.at(Enum.at(log_a, i), j)
            lse(trans) + log_emit(p, j, o)
          end

        {[cur | acc], cur}
      end)

    alphas = Enum.reverse(alphas_rev)
    {alphas, lse(List.last(alphas))}
  end

  defp backward(seq, log_a, p) do
    k = length(hd(log_a))
    last = List.duplicate(0.0, k)
    obs_rev = seq |> tl() |> Enum.reverse()

    {betas, _} =
      Enum.reduce(obs_rev, {[last], last}, fn o_next, {acc, next} ->
        cur =
          for i <- 0..(k - 1) do
            terms =
              for j <- 0..(k - 1),
                  do: Enum.at(Enum.at(log_a, i), j) + log_emit(p, j, o_next) + Enum.at(next, j)

            lse(terms)
          end

        {[cur | acc], cur}
      end)

    betas
  end

  defp log_evidence(seq, p) do
    log_pi = Enum.map(p.pi, &safe_log/1)
    log_a = Enum.map(p.a, fn row -> Enum.map(row, &safe_log/1) end)
    {_, ev} = forward(seq, log_pi, log_a, p)
    ev
  end

  defp log_emit(p, state, word) do
    case Map.get(p.b, state) do
      %{probs: probs, floor: floor} -> safe_log(Map.get(probs, word, floor))
      # during EM init the emit is a raw prob-map (no floor wrapper)
      probs when is_map(probs) -> safe_log(Map.get(probs, word, p.alpha / max(p.v, 1)))
      _ -> safe_log(1.0 / max(p.v, 1))
    end
  end

  # --- generation ------------------------------------------------------------

  defp decode(p, max, rng) do
    s0 = pick(p.pi, rng)
    walk(p, s0, [], MapSet.new(), max, rng)
  end

  defp walk(_p, _s, acc, _seen, 0, _rng), do: Enum.reverse(acc)

  defp walk(p, s, acc, seen, n, rng) do
    {w, _} = emit_word(p, s, rng)
    ws = to_string(w)
    bigram = acc != [] and {hd(acc), ws}

    cond do
      w == @eos or w == nil ->
        Enum.reverse(acc)

      # no immediate word-repeat ("plains plains"); and ANTI-LOOP: stop when a word-pair (bigram)
      # repeats — kills both "the the…" and the 2-cycle "the gold cave the gold cave…". A
      # finite-state generator needs these guards against spinning.
      acc != [] and ws == hd(acc) ->
        Enum.reverse(acc)

      bigram && MapSet.member?(seen, bigram) ->
        Enum.reverse(acc)

      true ->
        seen = if bigram, do: MapSet.put(seen, bigram), else: seen
        walk(p, pick(Enum.at(p.a, s), rng), [ws | acc], seen, n - 1, rng)
    end
  end

  defp emit_word(p, state, rng) do
    probs =
      case Map.get(p.b, state) do
        %{probs: probs} -> probs
        m when is_map(m) -> m
        _ -> %{}
      end

    cond do
      map_size(probs) == 0 -> {@eos, rng}
      rng -> sample_map(probs, rng)
      true -> {probs |> Enum.max_by(&elem(&1, 1)) |> elem(0), rng}
    end
  end

  defp pick(row, nil), do: row |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)

  defp pick(row, rng) do
    {r, _} = :rand.uniform_s(rng)
    target = r * Enum.sum(row)

    {idx, _} =
      Enum.reduce_while(Enum.with_index(row), 0.0, fn {pr, i}, acc ->
        if acc + pr >= target, do: {:halt, {i, acc}}, else: {:cont, acc + pr}
      end)
      |> case do
        {i, a} -> {i, a}
        a when is_number(a) -> {length(row) - 1, a}
      end

    idx
  end

  defp sample_map(probs, rng) do
    z = probs |> Map.values() |> Enum.sum()
    {r, _} = :rand.uniform_s(rng)
    target = r * z

    word =
      Enum.reduce_while(probs, 0.0, fn {w, pr}, acc ->
        if acc + pr >= target, do: {:halt, w}, else: {:cont, acc + pr}
      end)

    {if(is_binary(word) or is_atom(word), do: word, else: @eos), rng}
  end

  # --- numeric helpers -------------------------------------------------------

  defp lse([]), do: -1.0e10

  defp lse(xs) do
    mx = Enum.max(xs)

    if mx == -1.0e10,
      do: -1.0e10,
      else: mx + :math.log(Enum.reduce(xs, 0.0, fn x, a -> a + :math.exp(x - mx) end))
  end

  defp safe_log(x) when x > 0, do: :math.log(x)
  defp safe_log(_), do: -1.0e10

  defp norm_log(row),
    do:
      (
        z = lse(row)
        Enum.map(row, &(&1 - z))
      )

  defp vec_add(a, b), do: Enum.zip_with(a, b, &+/2)
  defp mat_add(a, b), do: Enum.zip_with(a, b, &vec_add/2)
  defp zeros(k), do: List.duplicate(0.0, k)
  defp zmat(k), do: List.duplicate(zeros(k), k)

  defp normalize(row),
    do:
      (
        z = Enum.sum(row)
        if z > 0, do: Enum.map(row, &(&1 / z)), else: List.duplicate(1.0 / length(row), length(row))
      )

  defp rand_row(k, rng), do: rand_norm(k, rng)
  defp rand_mat(k, rng), do: Enum.map_reduce(1..k, rng, fn _, r -> rand_norm(k, r) end)

  defp rand_norm(k, rng) do
    {vals, rng} =
      Enum.map_reduce(1..k, rng, fn _, r ->
        {x, r2} = :rand.uniform_s(r)
        {0.5 + x, r2}
      end)

    {normalize(vals), rng}
  end

  defp rand_emit(k, vocab, rng) do
    Enum.map_reduce(0..(k - 1), rng, fn _s, r ->
      {vals, r2} =
        Enum.map_reduce(vocab, r, fn w, rr ->
          {x, rr2} = :rand.uniform_s(rr)
          {{w, 0.5 + x}, rr2}
        end)

      z = vals |> Enum.map(&elem(&1, 1)) |> Enum.sum()
      {Map.new(vals, fn {w, x} -> {w, x / z} end), r2}
    end)
    |> then(fn {rows, rng} -> {Map.new(Enum.with_index(rows), fn {row, i} -> {i, row} end), rng} end)
  end
end
