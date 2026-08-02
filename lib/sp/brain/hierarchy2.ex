defmodule SP.Brain.Hierarchy2 do
  @moduledoc """
  2-level hierarchical composition — purebody gate `gate.hierarchy2.composition`.

  A slow PARENT context factor `g` (Sg states) sits above a set of fast CHILD factors.
  The schedule is the consult's **down = prior / up = evidence** (higher level supplies
  empirical priors + a slower timescale; lower level returns posterior evidence upward):

    * DOWN — the parent's belief supplies each child's EMPIRICAL PRIOR:
        child_prior_c = W_c · q(g)
      where `W_c` is `Sc_c × Sg` column-major (column k = the child prior given parent state k).
    * UP — the children's posteriors update the parent:
        q(g) ∝ d(g) ⊙ ∏_c ( W_cᵀ · q(child_c) )

  The joint `Sg · ∏_c Sc_c` is **never materialised** — beliefs stay per-level, cost `Sg + Σ_c Sc_c`.
  A uniform `W_c` (uninformative parent) ⇒ a uniform child prior ⇒ **exact reduction to the flat model**.

  MECHANISM only — **no capability claim**, **no new EFE math**, **no backprop**. Reuses `SP.Brain.Math`
  verbatim. NOT wired into the live decide path (the live colony stays on the proven engine). The
  pixels-grounded scene-gated HMM (consult A2 / SGR-HMM) remains DESIGN-ONLY / U.
  """

  alias SP.Brain.Math

  @enforce_keys [:sg, :dg, :qg, :children]
  defstruct sg: 1, dg: [], qg: [], children: []

  @typedoc "A child: name, its size Sc_c, and its prior map W_c (Sg columns of length Sc_c)."
  @type child :: %{name: atom(), sc: pos_integer(), w: [[float()]]}
  @type t :: %__MODULE__{sg: pos_integer(), dg: [float()], qg: [float()], children: [child()]}

  @doc """
  Build from parent size `sg`, the parent prior, and `[{name, W_c}]` — each `W_c` column-major with
  `sg` columns of length `Sc_c` (column k = the child prior given parent state k).
  """
  @spec new(pos_integer(), [float()], [{atom(), [[float()]]}]) :: t()
  def new(sg, parent_prior, child_specs) when is_list(child_specs) do
    dg = Math.normalize(parent_prior)
    children = Enum.map(child_specs, fn {name, w} -> %{name: name, sc: length(hd(w)), w: w} end)
    %__MODULE__{sg: sg, dg: dg, qg: dg, children: children}
  end

  @doc "DOWN: each child's empirical prior = `W_c · q(g)`, as `%{name => prior}`."
  @spec child_priors(t()) :: %{atom() => [float()]}
  def child_priors(%__MODULE__{qg: qg, children: ch}) do
    Map.new(ch, fn c -> {c.name, Math.matvec(c.w, qg)} end)
  end

  @doc "UP: parent posterior from the children's posteriors. `posteriors` = `%{name => q(child)}`."
  @spec parent_from_children(t(), %{atom() => [float()]}) :: t()
  def parent_from_children(%__MODULE__{dg: dg, children: ch} = h, posteriors) do
    combined =
      Enum.reduce(ch, dg, fn c, acc ->
        q = Map.fetch!(posteriors, c.name)
        up = Enum.map(c.w, fn col -> Math.dot(col, q) end)
        Enum.zip_with(acc, up, fn x, y -> x * y end)
      end)

    %{h | qg: Math.normalize(combined)}
  end

  @doc "Set the parent belief directly (normalised)."
  @spec put_parent(t(), [float()]) :: t()
  def put_parent(%__MODULE__{} = h, qg), do: %{h | qg: Math.normalize(qg)}

  @doc "Total belief storage = `Sg + Σ_c Sc_c` (proof the joint `Sg·∏ Sc_c` is never built)."
  @spec belief_size(t()) :: non_neg_integer()
  def belief_size(%__MODULE__{sg: sg, children: ch}), do: sg + (ch |> Enum.map(& &1.sc) |> Enum.sum())

  @doc "The size of the joint state space `Sg · ∏_c Sc_c` (the number we DON'T pay)."
  @spec joint_size(t()) :: pos_integer()
  def joint_size(%__MODULE__{sg: sg, children: ch}), do: Enum.reduce(ch, sg, fn c, acc -> acc * c.sc end)
end
