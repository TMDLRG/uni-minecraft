defmodule SP.Brain.MotorControl do
  @moduledoc """
  The MOTOR INNER LOOP (Gen-3) — "action as proprioceptive inference". Given the body's CONTINUOUS signed
  proprioceptive error to the goal (yaw/pitch deltas + range) and the categorical contact, it emits the fine
  motor PRIMITIVE that descends the precision-weighted proprioceptive prediction error toward the desired
  configuration `C_motor` (aim on_target → in reach → strike). `SP.Brain.Motor` is the continuous reflex
  (`F = ½·Π·err²`, `ȧ = −∂F/∂a`, Class-B predictive coding); this module sequences it across the skill
  stages and discretises the descent into the body's fine vocabulary.

  Why a CONTINUOUS error (not the 3-bin `aim_state` factor): a categorical bin is too coarse for precise
  control — incremental turns don't move the bin, so a bin-only servo thrashes and never aims (proven by the
  end-to-end sim). Real proprioception is signed + graded: the body senses which way (and how far) it is
  turned relative to the goal. The 3-bin `aim_state` remains the brain's categorical BELIEF substrate (it
  learns `A`/`B`); this inner loop uses the finer continuous signal the body already has.

  FIXED-gain reflex FIRST (UNI-GPT round-2: "keep SP.Brain.Motor fixed, learn the gains later" = P5). Gated
  behind `:motor_cortex`; never constructed for a default UNI.

  `ctrl` is `%{yaw: dyaw, pitch: dpitch, dist: blocks}` in the BODY's own look convention (so the primitive
  signs are self-consistent: `dyaw > 0` ⇒ the goal is to turn yaw up ⇒ a `turn_left*` primitive, which the
  body executes as `yaw += step`). `target`/`obs` are the categorical `{aim,reach,contact,dig,motion}` tuples.
  """

  alias SP.Brain.Motor

  # the fine motor vocabulary the body executes. turn_left/right (root atoms, large 0.6) close a big yaw gap
  # fast; the _small (0.18) variants fine-tune; pitch_*_small tilt; step_forward closes range; hold_mine
  # strikes; wait stabilises.
  @primitives ~w(turn_left turn_right turn_left_small turn_right_small pitch_up_small pitch_down_small step_forward hold_mine wait)a

  @contact_log 2
  # per-axis tolerance kept tight so the COMBINED residual (yaw+pitch) lands within the on_target threshold
  # (≤0.14 < 0.15), and the small step (0.10 in the body) is < 2·tol so the servo settles without oscillating.
  @yaw_tol 0.07
  @pitch_tol 0.07
  @reach_blocks 3.0
  @big 0.45

  # control state: SP.Brain.Motor reflexes for the yaw + pitch channels (telemetry + precision/gain).
  defstruct yaw: %Motor{}, pitch: %Motor{}, last: :wait

  @doc "A fresh inner-loop controller (one per active motor option)."
  def new, do: %__MODULE__{}

  @doc "The fine primitive vocabulary (for the body's executor + tests)."
  def primitives, do: @primitives

  @doc """
  One inner-loop step. `ctrl = %{yaw, pitch, dist}` is the body's continuous signed error to the goal.
  Returns `{primitive, control, telemetry}` — telemetry carries `target/observed/error/precision/motor_delta`
  (the logged inner-loop trace). `pi` is the loop gain (precision); default 1.0 (the fixed reflex).
  """
  def step(%__MODULE__{} = c, target, obs, ctrl, pi \\ 1.0) do
    {_aim, _reach, contact, _dig, _motion} = obs
    yaw = num(ctrl[:yaw])
    pitch = num(ctrl[:pitch])
    dist = num(ctrl[:dist], 99.0)

    cond do
      # STAGE 1 — close the aim: descend the yaw error, then the pitch error (signed ⇒ no sign-guessing).
      abs(yaw) > @yaw_tol -> servo(c, :yaw, yaw, target, obs, pi)
      abs(pitch) > @pitch_tol -> servo(c, :pitch, pitch, target, obs, pi)
      # STAGE 2 — aimed but out of reach: step in.
      dist > @reach_blocks -> emit(c, :step_forward, target, obs, dist - @reach_blocks, pi, 0.0)
      # STAGE 3 — aimed + in reach + crosshair on a log: strike.
      contact == @contact_log -> emit(c, :hold_mine, target, obs, 0.0, pi, 0.0)
      # target met / nothing to do: stabilise.
      true -> emit(c, :wait, target, obs, 0.0, pi, 0.0)
    end
  end

  # descend a continuous angular error via SP.Brain.Motor; discretise to a big/small directional primitive.
  defp servo(c, channel, err, target, obs, pi) do
    motor = Map.fetch!(c, channel)
    # vel = pi·err — the precision-weighted descent (logged)
    m = Motor.step(%{motor | pos: 0.0}, err, pi)
    prim = primitive_for(channel, err)
    emit(%{c | channel => m}, prim, target, obs, err, pi, m.vel)
  end

  # err > 0 ⇒ the body must INCREASE this angle (turn_left / pitch_down add to it); large gap ⇒ a big turn.
  defp primitive_for(:yaw, err) when err > 0, do: if(err > @big, do: :turn_left, else: :turn_left_small)
  defp primitive_for(:yaw, err), do: if(-err > @big, do: :turn_right, else: :turn_right_small)
  defp primitive_for(:pitch, err) when err > 0, do: :pitch_down_small
  defp primitive_for(:pitch, _err), do: :pitch_up_small

  defp emit(c, prim, target, obs, err, pi, motor_delta) do
    {prim, %{c | last: prim}, telem(target, obs, err, pi, motor_delta)}
  end

  @doc "Scalar target-relative proprioceptive error over the controllable channels (for the gate)."
  def target_error(target, obs) do
    {t_aim, t_reach, _, _, _} = target
    {aim, reach, _, _, _} = obs
    abs(t_aim - aim) + abs(t_reach - reach)
  end

  defp telem(target, obs, err, pi, motor_delta),
    do: %{target: target, observed: obs, error: err, precision: pi, motor_delta: motor_delta}

  defp num(v, default \\ 0.0)
  defp num(v, _default) when is_number(v), do: v * 1.0
  defp num(_v, default), do: default
end
