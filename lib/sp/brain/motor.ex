defmodule SP.Brain.Motor do
  @moduledoc """
  Continuous predictive coding for the body/motor layer (§ continuous PC, completes P7).

  Below the discrete L1 sensorimotor loop runs a fast continuous controller whose ACTION
  descends the free-energy gradient on sensory prediction error:

      F(a) = ½ · Π · (target − sense)²        (precision-weighted squared error)
      ȧ    = −∂F/∂a  ∝  Π · (target − sense)   (move to null the error)

  In generalized coordinates the action IS the velocity that reduces prediction error;
  precision `Π` is the loop gain (high precision ⇒ tight, fast correction). The Node body
  (`viewer/body.js`) runs this same descent at ~20 Hz between discrete decisions to smooth
  centering/range control toward the current target.

  **Fence:** this is Class-B predictive coding *where the free-energy gradient is real*
  (here it is). A plain proportional nuller without the gradient would be Class-C
  engineering and must be labelled as such.
  """

  defstruct pos: 0.0, vel: 0.0

  @dt 0.1

  @doc "One gradient-descent step toward `target` under precision `pi` (loop gain `kappa`)."
  def step(%__MODULE__{} = s, target, pi, kappa \\ 1.0) do
    err = target - s.pos
    vel = kappa * pi * err
    %__MODULE__{pos: s.pos + vel * @dt, vel: vel}
  end

  @doc "Settle toward `target` for `n` steps; returns the final motor state."
  def settle(%__MODULE__{} = s, target, pi, n, kappa \\ 1.0) do
    Enum.reduce(1..n, s, fn _, st -> step(st, target, pi, kappa) end)
  end

  @doc "The current prediction error (the quantity being minimised)."
  def error(%__MODULE__{pos: p}, target), do: target - p
end
