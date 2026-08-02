defmodule SP.Brain.SelfLocation do
  @moduledoc """
  Self-location as precision-weighted multisensory inference — and the controlled
  out-of-body experiment (§ phenomenology B-OBE).

  A single hidden factor `self-location` over `n` body-frame positions (0 = on-body) is
  observed by TWO modalities, proprioception and vision, each with its own precision
  `γ`. Normally both agree and the posterior sits on the body. When the senses CONFLICT
  (vision places the self elsewhere) AND visual precision dominates proprioceptive
  precision, the self-location posterior shifts OFF the body — exactly the structure of
  the out-of-body report.

  **Fence:** this reproduces the EXPERIENCE/REPORT (a self-location posterior that moved)
  via standard precision-weighted inference (Class B/C). It is NOT a claim that the self
  literally left the body (Class U).
  """

  alias SP.Brain.{Model, Infer, Designer}

  @doc """
  Build a self-location model: `n` positions, observed by proprioception (precision
  `g_prop`) and vision (precision `g_vis`). Both sensors are near-identity readouts.
  """
  def model(n \\ 5, g_prop \\ 1.0, g_vis \\ 1.0) do
    a = sensor(n)

    Model.new(
      a: [a, a],
      b: [Designer.identity(n)],
      c: [List.duplicate(0.0, n), List.duplicate(0.0, n)],
      d: List.duplicate(1.0, n),
      gamma_m: [g_prop, g_vis]
    )
  end

  @doc "Infer the self-location posterior from a proprioceptive and a visual observation."
  def locate(%Model{} = m, o_prop, o_vis), do: Infer.infer_states(m, [o_prop, o_vis]).qs

  @doc "The most-likely self-location (0 = on-body)."
  def where(%Model{} = m, o_prop, o_vis), do: locate(m, o_prop, o_vis) |> argmax()

  # near-identity sensor: position s ⇒ observe s with prob 0.8.
  defp sensor(n, p \\ 0.8) do
    off = (1.0 - p) / (n - 1)
    for s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: p, else: off))
  end

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
end
