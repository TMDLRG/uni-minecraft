defmodule SP.Brain.Viability do
  @moduledoc """
  Death as viability-exit and shutdown (§ phenomenology B-DEATH).

  An agent is alive while its body stays inside the viable set `V` (the strongly
  preferred region of `C` — not dying). Death is the COMPUTATIONAL/organisational end of
  the agent: when no policy can return the body to `V`, precision collapses, the
  perception→planning→action→learning loop (`SP.Brain.MC.step/2`) stops integrating the
  world, and the Markov blanket dissolves — in the live system the `SP.Brain.Bridge`
  closes its Port and persists memory (data, not a surviving self) on the body's death.

  `shutdown/1` models the precision-collapse: every sensory precision drops to ~0, so the
  agent no longer updates beliefs from observations — the experiencing loop has ceased.

  **Fence:** this is the computational/organisational end only. We invoke NO
  non-equilibrium-steady-state thermodynamics, and make NO claim of persistence beyond the
  running process. NDE clustering (below) explains why reports *cluster*, not what
  metaphysically happens.
  """

  alias SP.Brain.{Factors, MCCodec, Math}

  @doc "Is the body inside its viable set V (status not 'dying')?"
  def viable?(senses), do: MCCodec.outcome(:status, senses) != 0

  @doc """
  Shutdown: collapse all sensory precision. The agent stops integrating evidence — the
  OODA loop ceases and the blanket dissolves (perception no longer tracks the world).
  """
  def shutdown(%Factors{} = fm) do
    subs = Enum.map(fm.subs, fn s -> %{s | gamma_m: Enum.map(s.gamma_m, fn _ -> Math.eps() end)} end)
    %{fm | subs: subs}
  end
end
