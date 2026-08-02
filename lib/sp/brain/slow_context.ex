defmodule SP.Brain.SlowContext do
  @moduledoc """
  Slow temporal CONTEXT over the 2-level composition — purebody gate
  `gate.slow-context.temporal-parent` (consult A4 "Slow-G", MECHANISM only).

  Adds the missing *temporal* dimension to `SP.Brain.Hierarchy2`: a slow parent
  transition `B^G` (`Sg × Sg`, column-major; column `j` = `P(g_t | g_{t-1}=j)`)
  gives the parent factor a slow (sticky) timescale via an **exact marginal Bayes
  filter** — not the consult's expected-log VMP variant:

    * PREDICT (down-in-time): `q⁻(g_t) = normalize(B^G · q(g_{t-1}))`
      — the standard discrete filter prior, reusing `Math.matvec` (the column-major `B·q`).
    * CORRECT (up-evidence): `q(g_t) = normalize( q⁻ ⊙ ∏_c (W_cᵀ · q(child_c)) )`
      — the SAME up-message fold as `Hierarchy2.parent_from_children`, **seeded from
      `q⁻` instead of the static prior `dg`** (that one substitution is the whole
      difference between a real filter and a decorative predict).
    * DOWN (space): child empirical priors `W_c · q(g_t)` are delegated to
      `Hierarchy2.child_priors` unchanged — so the children are conditioned on the
      *slow* belief.

  The time-joint `Sg^T` is **never materialised** — only the current marginal
  `q(g_t)` is kept (the fixed `Sg×Sg` `B^G` is model parameters, not a blowup).
  When every column of `B^G` equals `dg` (no memory) one `step` reduces to
  `Hierarchy2.parent_from_children` (numerically, < 1e-12).

  MECHANISM only — **no capability claim**, **no new EFE math**, **no backprop**,
  **no VMP approximation**; the predict is parameter-free (NO `ζ_G` precision floor —
  the timescale is governed solely by `B^G`'s diagonal). `SP.Brain.Hierarchy2` is
  reused VERBATIM and left byte-unchanged (the up-message fold is replicated here to
  keep that already-passed gate's artifact frozen). NOT wired into the live decide
  path; the A4 precision-floor variant and the pixels-grounded SGR-HMM stay DESIGN-ONLY/U.
  """

  alias SP.Brain.{Hierarchy2, Math}

  @enforce_keys [:h2, :bg]
  defstruct h2: nil, bg: []

  @typedoc "A Hierarchy2 composition wrapped with a slow parent transition `bg` (Sg columns of length Sg)."
  @type t :: %__MODULE__{h2: Hierarchy2.t(), bg: [[float()]]}

  @doc """
  Wrap a `%Hierarchy2{}` (the composition: parent prior `dg`, current belief `qg`,
  children `W_c`) with a slow parent transition `bg` — column-major, `Sg` columns of
  length `Sg`, column `j` = `P(g_t | g_{t-1}=j)`.
  """
  @spec new(Hierarchy2.t(), [[float()]]) :: t()
  def new(%Hierarchy2{sg: sg} = h2, bg) when is_list(bg) do
    ^sg = length(bg)
    true = Enum.all?(bg, fn col -> length(col) == sg end)
    %__MODULE__{h2: h2, bg: bg}
  end

  @doc "The current slow parent belief `q(g_t)`."
  @spec parent(t()) :: [float()]
  def parent(%__MODULE__{h2: h2}), do: h2.qg

  @doc "The parent prior `dg` (== the wrapped Hierarchy2's `dg`)."
  @spec dg(t()) :: [float()]
  def dg(%__MODULE__{h2: h2}), do: h2.dg

  @doc "Set the slow parent belief directly (normalised), threading through Hierarchy2."
  @spec put_parent(t(), [float()]) :: t()
  def put_parent(%__MODULE__{h2: h2} = sc, qg), do: %{sc | h2: Hierarchy2.put_parent(h2, qg)}

  @doc """
  PREDICT (down-in-time) — the filter prior `q⁻(g_t) = normalize(B^G · q(g_{t-1}))`.
  Returns the predicted parent distribution (a vector). Uses `Math.matvec` verbatim.
  """
  @spec predict(t()) :: [float()]
  def predict(%__MODULE__{h2: h2, bg: bg}), do: Math.normalize(Math.matvec(bg, h2.qg))

  @doc "A predict-only time update (no observation): advance the belief by one `B^G` step."
  @spec predict_step(t()) :: t()
  def predict_step(%__MODULE__{} = sc), do: put_parent(sc, predict(sc))

  @doc """
  One filter tick: PREDICT then CORRECT. `posteriors` = `%{child_name => q(child)}`.
  The corrected belief is threaded into the wrapped Hierarchy2 so `child_priors/1`
  reads the stepped (slow) belief.
  """
  @spec step(t(), %{atom() => [float()]}) :: t()
  def step(%__MODULE__{h2: h2} = sc, posteriors) do
    qg = correct(predict(sc), h2, posteriors)
    %{sc | h2: Hierarchy2.put_parent(h2, qg)}
  end

  # CORRECT: normalize( q⁻ ⊙ ∏_c (W_cᵀ · q(child_c)) ).
  # Replicates Hierarchy2.parent_from_children's up-message fold VERBATIM, seeded from
  # `qminus` instead of `dg` — keeping the Hierarchy2 artifact byte-unchanged.
  defp correct(qminus, %Hierarchy2{children: ch}, posteriors) do
    ch
    |> Enum.reduce(qminus, fn c, acc ->
      q = Map.fetch!(posteriors, c.name)
      up = Enum.map(c.w, fn col -> Math.dot(col, q) end)
      Enum.zip_with(acc, up, fn x, y -> x * y end)
    end)
    |> Math.normalize()
  end

  @doc "DOWN (space): child empirical priors from the current slow belief — delegated to Hierarchy2."
  @spec child_priors(t()) :: %{atom() => [float()]}
  def child_priors(%__MODULE__{h2: h2}), do: Hierarchy2.child_priors(h2)

  @doc "Belief (marginal) storage = `Sg + Σ_c Sc_c` (the time-joint `Sg^T` is never built)."
  @spec belief_size(t()) :: non_neg_integer()
  def belief_size(%__MODULE__{h2: h2}), do: Hierarchy2.belief_size(h2)

  @doc "The joint state-space size `Sg · ∏_c Sc_c` (the number we DON'T pay; per-tick)."
  @spec joint_size(t()) :: pos_integer()
  def joint_size(%__MODULE__{h2: h2}), do: Hierarchy2.joint_size(h2)
end
