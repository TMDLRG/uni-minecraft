defmodule SP.Brain.Model do
  @moduledoc """
  The generative model `(A, B, C, D, E)` plus precisions, Dirichlet priors, and the
  agent's live beliefs — the full active-inference state, mirroring the validated
  Python oracle `uni/brain/active_inference.py`.

  All matrices are COLUMN-MAJOR (see `SP.Brain.Math`):
    * `a`  : list of likelihoods, one per modality; each is Ns columns of length No.
    * `b`  : list of transitions, one per action; each is Ns columns of length Ns.
    * `c`  : list of log-preference vectors over outcomes, one per modality.
    * `d`  : prior over the initial hidden state (length Ns).
    * `gamma_m` : per-modality sensory precision (attention/attenuation).
    * `gamma`   : policy precision.

  `pa`/`pb` are the Dirichlet concentrations (learning); `a`/`b` are the current
  point-estimate stochastic tensors derived from them. Beliefs: `qs`, `qs_prev`,
  `last_action`.
  """

  alias SP.Brain.Math

  defstruct a: [],
            b: [],
            c: [],
            d: [],
            pa: [],
            pb: [],
            gamma_m: [],
            gamma: 8.0,
            lr: 1.0,
            learn_a: true,
            learn_b: false,
            # NOVELTY (Gen-3 plateau cure): the per-factor weight on the parameter-information-gain EFE term
            # (SP.Brain.Novelty). Default 0.0 ⇒ the term is gated off ⇒ byte-identical to the flat engine.
            novelty_gain: 0.0,
            horizon: 1,
            policies: [],
            nu: 1,
            ns: 1,
            qs: [],
            qs_prev: [],
            last_action: nil,
            # structure-learning bookkeeping (§16 growth) — inert until used; an EWMA
            # of this factor's VFE and a step counter, carried IN the struct so growth
            # stays a pure function of (model, obs) with no hidden global state.
            struct_pressure: 0.0,
            struct_steps: 0,
            # WS-B slow-context (all TRANSIENT, re-derived each tick, never persisted; cleared on demodulate):
            #   emp_prior — the scene contextual prior W_c·q(scene), length `ns`, all > 0; `nil` ⇒ no coupling.
            #   emp_delta — the heritable coupling δ ∈ [0,1]: the DOWN prior is the δ-weighted geometric blend
            #     normalize(forward^(1-δ) · emp_prior^δ) that REPLACES the forward prior (GPT Option B). δ=0 ⇒ flat.
            #   last_lik  — the factor's normalised EXTRINSIC likelihood softmax((lnA)ᵀo); the slow parent's UP
            #     message is this (the data term), NOT the prior-shaped posterior (the GPT Q2 cavity fix).
            emp_prior: nil,
            emp_delta: 0.0,
            last_lik: nil,
            # HONEST CONSUMMATION (Cure-2, gated): %{parent_index, parent_state, eat_idx, drain_col} threading the
            # Plan-time :eat-column coupling to a parent factor's has_food belief. nil (default) ⇒ inert ⇒ the Plan
            # rollout takes the verbatim byte-identical path. Pure pass-through metadata; no math reads it here.
            couple: nil

  @doc """
  Build a model. Required opts: `:a` (list of column-major likelihoods), `:b`
  (list of column-major transitions), `:c` (list of preference vectors), `:d`
  (prior). Optional: `:horizon` (1), `:gamma` (8.0), `:gamma_m` (1.0 each),
  `:lr` (1.0), `:learn_a` (true), `:learn_b` (false).
  """
  def new(opts) do
    a_in = Keyword.fetch!(opts, :a)
    b_in = Keyword.fetch!(opts, :b)
    c = Keyword.fetch!(opts, :c)
    d_in = Keyword.fetch!(opts, :d)

    a = Enum.map(a_in, &Math.norm_cols/1)
    b = Enum.map(b_in, &Math.norm_cols/1)
    d = Math.normalize(d_in)
    nu = length(b)
    ns = length(d)
    horizon = Keyword.get(opts, :horizon, 1)

    %__MODULE__{
      a: a,
      b: b,
      c: Enum.map(c, fn v -> Enum.map(v, &(&1 * 1.0)) end),
      d: d,
      # Dirichlet concentrations seeded from the tensors (mildly concentrated),
      # exactly as the oracle's `pA = A*1.0 + 1.0`.
      pa: Enum.map(a, &add1/1),
      pb: Enum.map(b, &seed_pb(&1, Keyword.get(opts, :pb_seed, 1.0))),
      gamma_m: Keyword.get(opts, :gamma_m, List.duplicate(1.0, length(a))),
      gamma: Keyword.get(opts, :gamma, 8.0),
      lr: Keyword.get(opts, :lr, 1.0),
      learn_a: Keyword.get(opts, :learn_a, true),
      learn_b: Keyword.get(opts, :learn_b, false),
      horizon: horizon,
      policies: enumerate_policies(nu, horizon),
      nu: nu,
      ns: ns,
      qs: d,
      qs_prev: d,
      last_action: nil,
      novelty_gain: Keyword.get(opts, :novelty_gain, 0.0),
      emp_prior: Keyword.get(opts, :emp_prior, nil),
      couple: Keyword.get(opts, :couple, nil)
    }
  end

  @doc "Reset beliefs to the initial prior (a fresh life — but learned params persist)."
  def reset(%__MODULE__{d: d} = m),
    do: %{m | qs: d, qs_prev: d, last_action: nil, emp_prior: nil, emp_delta: 0.0, last_lik: nil}

  # Every action sequence of length `horizon` over 0..nu-1 (the candidate policies).
  defp enumerate_policies(nu, horizon) do
    actions = Enum.to_list(0..(nu - 1))

    Enum.reduce(1..horizon, [[]], fn _step, acc ->
      for seq <- acc, u <- actions, do: seq ++ [u]
    end)
  end

  defp add1(matrix), do: Enum.map(matrix, fn col -> Enum.map(col, &(&1 * 1.0 + 1.0)) end)

  # Dirichlet concentration seed for the transition counts `pb`: `pb = norm_col·κ + 1`. κ (`:pb_seed`)
  # defaults to 1.0, where it is BYTE-IDENTICAL to `add1` (`x*1.0+1.0`). κ ≫ 1 is a STRONG prior (the
  # metabolism organ's emptying-B durability, UNI-GPT Q5 "refine, not erase"): it raises Σpb so the
  # expected B → the seeded shape and `W_b → 0` FASTER — the no-smuggled-reward monotonic decay is
  # preserved (faster, not broken). Applied AFTER `norm_cols` (above), so the seeded shape is not wiped.
  defp seed_pb(matrix, k), do: Enum.map(matrix, fn col -> Enum.map(col, &(&1 * k + 1.0)) end)
end
