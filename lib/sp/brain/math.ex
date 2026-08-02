defmodule SP.Brain.Math do
  @moduledoc """
  Pure numerical kernels for discrete active inference — no Nx, no native deps.

  The whole engine is small categorical algebra (factors ≤ ~10, modalities ≤ ~8),
  so plain lists are fast enough and stay byte-comparable to the NumPy oracle
  (`uni/brain/active_inference.py`) — no BLAS reduction-order nondeterminism.

  ## Matrix convention — COLUMN-MAJOR
  A likelihood `A` (No×Ns, columns are `P(o|s)`) is stored as a **list of Ns
  columns, each a list of No probabilities**: `A[s][o]`. A transition `B^u`
  (Ns×Ns, columns are `P(s'|s,u)`) is a list of Ns columns each length Ns:
  `B[s][s']`. Columns are the distributions, so column ops are the natural ones.
  """

  @eps 1.0e-16

  def eps, do: @eps

  @doc "Natural log with an epsilon floor (matches the oracle's `np.log(x + 1e-16)`)."
  def log(x), do: :math.log(x + @eps)

  def vlog(v), do: Enum.map(v, &log/1)

  @doc "Numerically-stable softmax of a list."
  def softmax(v) do
    m = Enum.max(v)
    ex = Enum.map(v, fn x -> :math.exp(x - m) end)
    s = Enum.sum(ex)
    s = if s < @eps, do: @eps, else: s
    Enum.map(ex, &(&1 / s))
  end

  @doc "Normalise a vector to a probability distribution (sum→1, eps-floored)."
  def normalize(v) do
    s = Enum.sum(v)
    s = if s < @eps, do: @eps, else: s
    Enum.map(v, &(&1 / s))
  end

  def dot(a, b), do: Enum.zip_reduce(a, b, 0.0, fn x, y, acc -> acc + x * y end)

  def vadd(a, b), do: Enum.zip_with(a, b, &+/2)
  def vsub(a, b), do: Enum.zip_with(a, b, &-/2)
  def vscale(v, k), do: Enum.map(v, &(&1 * k))
  def zeros(n), do: List.duplicate(0.0, n)

  @doc "Shannon entropy H(p) = -Σ p ln p (nats)."
  def entropy(p), do: -dot(p, vlog(p))

  @doc "Per-state ambiguity H(o|s): entropy of each column of a likelihood A."
  def col_entropies(a), do: Enum.map(a, &entropy/1)

  @doc "Normalise every column of a column-major matrix."
  def norm_cols(a), do: Enum.map(a, &normalize/1)

  @doc """
  Matrix-vector product for a column-major matrix: `A·w = Σ_j w_j · col_j`.
  For a likelihood A (Ns columns of length No), `matvec(A, qs)` is the predicted
  observation distribution `qo` (length No). For a transition B^u, `matvec(B,qs)`
  is the predicted next-state distribution (the FILTER prior, `B·qs`).
  """
  def matvec([], _w), do: []

  def matvec(cols, w) do
    r = length(hd(cols))

    Enum.zip(cols, w)
    |> Enum.reduce(zeros(r), fn {col, wj}, acc -> vadd(acc, vscale(col, wj)) end)
  end

  @doc """
  The forward message `(ln B)·s` — **log the columns FIRST, then the weighted
  sum**. This is bound-critical (§16): `(ln B)s ≠ ln(B·s)`. Used by the VFE
  smoother for the action-conditioned prior, never `log(matvec(...))`.
  """
  def ln_matvec([], _w), do: []

  def ln_matvec(cols, w) do
    r = length(hd(cols))

    Enum.zip(cols, w)
    |> Enum.reduce(zeros(r), fn {col, wj}, acc -> vadd(acc, vscale(vlog(col), wj)) end)
  end

  @doc "Row `o` of a column-major likelihood: `P(o|s)` over states s (length Ns)."
  def row(a, o), do: Enum.map(a, fn col -> Enum.at(col, o) end)

  @doc "Log of row `o`: `(ln A)^T · onehot(o)` = `ln A[o,:]` over states (length Ns)."
  def row_log(a, o), do: Enum.map(a, fn col -> log(Enum.at(col, o)) end)

  @doc """
  Digamma ψ(x) for x > 0, via upward recurrence (ψ(x)=ψ(x+1)−1/x) until x ≥ 6,
  then the asymptotic Bernoulli series. Matches `scipy.special.digamma` to ~1e-9.
  """
  def digamma(x) when x > 0, do: digamma_acc(x, 0.0)

  defp digamma_acc(x, acc) when x < 6.0, do: digamma_acc(x + 1.0, acc - 1.0 / x)

  defp digamma_acc(x, acc) do
    inv = 1.0 / x
    inv2 = inv * inv
    # ψ(x) ≈ ln x − 1/2x − 1/12x² + 1/120x⁴ − 1/252x⁶ + 1/240x⁸
    acc + :math.log(x) - 0.5 * inv -
      inv2 * (1.0 / 12.0 - inv2 * (1.0 / 120.0 - inv2 * (1.0 / 252.0 - inv2 * (1.0 / 240.0))))
  end
end
