defmodule SP.Brain.Hormones do
  @moduledoc """
  Hormones as slow CONTEXT variables that retune the generative model (§ phenomenology
  B-HORMONES). A hormone level does not carry content; it MODULATES — precision Π,
  learning rate η, and (via the Strategist's `apply_context`) preferences C. Here we
  implement the precision/plasticity modulation; the Strategist supplies the C side.

  We model a single axis, `:stress` ∈ [0,1] (a catecholamine-style fast-mobilisation
  signal): it raises policy precision γ (sharper, more reactive choices) and lowers the
  Dirichlet learning rate (less model revision under acute stress — act now, learn later).

  **Fence:** this is a Class-B *mechanism* (parameter modulation, exactly how a slow
  variable retunes inference). We do NOT claim it reproduces the biology of any specific
  hormone — the magnitudes and which parameters move are engineering choices, not
  measured neuro-endocrinology.
  """

  alias SP.Brain.Factors

  # at stress=1, policy precision is ×(1+gain)
  @gamma_gain 1.5
  # at stress=1, learning rate is ×lr_floor
  @lr_floor 0.4

  @doc """
  Modulate a `Factors` model by a hormone state `%{stress: s}` (s ∈ [0,1]). Raises the
  baseline policy precision and damps each factor's learning rate. Pure.
  """
  def modulate(%Factors{} = fm, hormones) do
    s = clamp01(Map.get(hormones, :stress, 0.0))
    gamma = fm.gamma * (1.0 + @gamma_gain * s)
    lr_scale = 1.0 - (1.0 - @lr_floor) * s
    subs = Enum.map(fm.subs, fn sub -> %{sub | lr: sub.lr * lr_scale} end)
    %{fm | gamma: gamma, subs: subs}
  end

  @doc "The hormone state implied by a Strategist context (the L2 option drives arousal)."
  def of_context(:flee), do: %{stress: 1.0}
  def of_context(:socialize), do: %{stress: 0.3}
  def of_context(:forage), do: %{stress: 0.2}
  def of_context(:build), do: %{stress: 0.1}
  def of_context(:rest), do: %{stress: 0.0}
  def of_context(_), do: %{stress: 0.0}

  defp clamp01(v), do: v |> max(0.0) |> min(1.0)
end
