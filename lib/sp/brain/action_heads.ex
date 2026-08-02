defmodule SP.Brain.ActionHeads do
  @moduledoc """
  Factored (product) ACTION space — the dual of `SP.Brain.Factors`.

  `SP.Brain.Factors` factors the STATE: `q(x) = Π_f q(x_f)` with ONE shared action
  set. `ActionHeads` factors the ACTION: the body emits a simultaneous control
  vector `a = (a_{h1}, …, a_{hH})`, one categorical per head (move / look / jump /
  sneak / sprint / click / hotbar / meta). Each head is its OWN `Factors` engine
  over its own action sub-set `Nu_h`, scored by expected free energy. Heads are
  independent given the belief, so

      G(a) = Σ_h G_h(a_h),    Q(a_h) = softmax(ln E_h − γ_h · G_h)

  and the joint product space `Π_h Nu_h` is **never materialised** — selecting the
  whole control vector costs `Σ_h Nu_h` EFE evaluations, not the product.

  ## Scope (honest fences)

  - **MECHANISM only — no capability claim.** This composes `SP.Brain.Factors` /
    `SP.Brain.Efe` per head *verbatim*; there is **no new EFE math** here.
  - This is the **one-step factored selection** (consult A5, R2-corrected). The
    bounded *sophisticated multi-step tree* and the look×click / move×look couplings
    are a separate, unbuilt design that stays **invalid-not-negative until measured**.
  - Heads here are independent given the belief. Full state-sharing across heads
    (one `q(x)` feeding every head's EFE) is the refinement — design-only.

  (purebody migration Step 2; bar `step2.action-heads.mechanism`.)
  """

  alias SP.Brain.Factors

  @enforce_keys [:heads]
  defstruct heads: []

  @typedoc "One head: a name, its `Factors` engine, and its action count `Nu_h`."
  @type head :: %{name: atom(), fm: SP.Brain.Factors.t(), nu: pos_integer()}
  @type t :: %__MODULE__{heads: [head()]}

  @doc """
  Build heads from `[{name, factor_specs}]`. Each head is `Factors.new(specs, opts)`;
  a head's action count `Nu_h` is the shared `nu` of its specs, and heads MAY differ
  in `Nu_h` (that is the point — the action space is a product of unequal heads).
  """
  @spec new([{atom(), [map()]}], keyword()) :: t()
  def new(head_specs, opts \\ []) when is_list(head_specs) do
    heads =
      Enum.map(head_specs, fn {name, specs} ->
        fm = Factors.new(specs, opts)
        %{name: name, fm: fm, nu: fm.nu}
      end)

    %__MODULE__{heads: heads}
  end

  @doc "Infer each head's state from per-head observations `%{name => obs_by_factor}`."
  @spec infer_states(t(), %{atom() => list()}) :: t()
  def infer_states(%__MODULE__{heads: heads} = ah, obs_by_head) when is_map(obs_by_head) do
    heads =
      Enum.map(heads, fn h ->
        case Map.fetch(obs_by_head, h.name) do
          {:ok, obs} -> %{h | fm: Factors.infer_states(h.fm, obs)}
          :error -> h
        end
      end)

    %{ah | heads: heads}
  end

  @doc """
  Per-head action distribution `%{name => p_u}`. Each `p_u` is the head's own
  `Q(a_h)` over `0..Nu_h-1` (horizon-1 ⇒ the policy posterior IS the action
  distribution), computed from that head's models ALONE.
  """
  @spec distributions(t()) :: %{atom() => [float()]}
  def distributions(%__MODULE__{heads: heads}) do
    Map.new(heads, fn h -> {h.name, Factors.evaluate_policies(h.fm).q_pi} end)
  end

  @doc """
  Select one action per head → the ordered control vector `[{name, action}]`, and
  the updated engine (each head commits its chosen action). `:argmax` is fully
  deterministic; `:sample` threads `rng` through each head in order.
  """
  @spec select(t(), :argmax | :sample, (-> {float(), any()}) | nil) :: {[{atom(), non_neg_integer()}], t()}
  def select(%__MODULE__{heads: heads} = ah, mode \\ :argmax, rng \\ nil) do
    {rev_vec, rev_heads} =
      Enum.reduce(heads, {[], []}, fn h, {vec, hs} ->
        {action, fm2} = Factors.select_action(h.fm, mode, rng)
        {[{h.name, action} | vec], [%{h | fm: fm2} | hs]}
      end)

    {Enum.reverse(rev_vec), %{ah | heads: Enum.reverse(rev_heads)}}
  end

  @doc "The ordered head names."
  @spec names(t()) :: [atom()]
  def names(%__MODULE__{heads: heads}), do: Enum.map(heads, & &1.name)

  @doc "The action count `Nu_h` of one head (nil if absent)."
  @spec nu(t(), atom()) :: pos_integer() | nil
  def nu(%__MODULE__{heads: heads}, name), do: Enum.find_value(heads, fn h -> if h.name == name, do: h.nu end)

  @doc "EFE evaluations to select the whole vector = `Σ_h Nu_h` (NOT the product)."
  @spec eval_cost(t()) :: non_neg_integer()
  def eval_cost(%__MODULE__{heads: heads}), do: heads |> Enum.map(& &1.nu) |> Enum.sum()

  @doc "The size of the joint product space `Π_h Nu_h` (the number we DON'T pay)."
  @spec product_size(t()) :: pos_integer()
  def product_size(%__MODULE__{heads: heads}), do: Enum.reduce(heads, 1, fn h, acc -> acc * h.nu end)
end
