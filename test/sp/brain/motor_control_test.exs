defmodule SP.Brain.MotorControlTest do
  @moduledoc """
  gate.motor-inner-loop (P3) — the motor inner loop fulfils a proprioceptive target by descending the
  CONTINUOUS signed proprioceptive error (`SP.Brain.Motor`), sequencing aim → reach → strike. Closed-loop
  against a simulated body whose proprioception responds to the fine primitives. This is the falsifiable
  core of "action as proprioceptive inference": the reflex nulls the precision-weighted error.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.MotorControl

  # desired config: aim=on_target · reach=in_reach · contact=log · dig=broke · motion=still.
  @target {2, 1, 2, 3, 0}

  # a simulated body: signed yaw/pitch error to the goal (true target 0), range in blocks, a dug flag.
  defp sense(b) do
    ang = abs(b.yaw) + abs(b.pitch)

    aim =
      cond do
        ang <= 0.2 -> 2
        ang <= 0.6 -> 1
        true -> 0
      end

    reach = if b.dist <= 3.0, do: 1, else: 0
    dig = if b.dug, do: 3, else: 0
    {aim, reach, 2, dig, 0}
  end

  defp ctrl(b), do: %{yaw: b.yaw, pitch: b.pitch, dist: b.dist}

  # the body's response to each fine primitive (signs consistent with the body's look convention).
  defp apply_primitive(b, prim) do
    aimed = abs(b.yaw) + abs(b.pitch) <= 0.2

    case prim do
      :turn_left -> %{b | yaw: b.yaw - 0.6}
      :turn_right -> %{b | yaw: b.yaw + 0.6}
      :turn_left_small -> %{b | yaw: b.yaw - 0.10}
      :turn_right_small -> %{b | yaw: b.yaw + 0.10}
      :pitch_down_small -> %{b | pitch: b.pitch - 0.10}
      :pitch_up_small -> %{b | pitch: b.pitch + 0.10}
      :step_forward -> %{b | dist: max(2.0, b.dist - 1.0)}
      :hold_mine -> if aimed and b.dist <= 3.0, do: %{b | dug: true}, else: b
      :wait -> b
    end
  end

  defp run(body0, ticks) do
    Enum.reduce_while(1..ticks, {body0, MotorControl.new(), []}, fn _, {b, c, trace} ->
      {prim, c2, _telem} = MotorControl.step(c, @target, sense(b), ctrl(b))
      b2 = apply_primitive(b, prim)
      acc = {b2, c2, [prim | trace]}
      if elem(sense(b2), 3) == 3, do: {:halt, acc}, else: {:cont, acc}
    end)
  end

  test "the inner loop fulfils a 2-axis aim + approach + strike target by descending the continuous error" do
    body = %{yaw: 1.4, pitch: -0.7, dist: 6.0, dug: false}
    {final, _c, trace} = run(body, 120)

    {aim, reach, _c2, dig, _m} = sense(final)
    assert aim == 2, "the servo must close the aim to on_target"
    assert reach == 1, "the servo must close the approach to in_reach"
    assert dig == 3, "once aimed + in reach over a log, the strike must land (dig=broke)"
    assert length(trace) < 120, "must converge within the tick budget"

    prims = Enum.uniq(trace)
    assert Enum.all?(prims, &(&1 in MotorControl.primitives())), "only fine motor primitives are emitted"
    assert :hold_mine in prims, "the strike primitive must fire"
    assert :step_forward in prims, "the approach primitive must fire"
  end

  test "it converges from either sign of error (signed proprioception, no sign-guessing needed)" do
    for {y, p} <- [{1.2, 0.5}, {-1.2, -0.5}, {0.9, -0.6}, {-0.3, 0.8}] do
      {final, _c, _t} = run(%{yaw: y, pitch: p, dist: 5.0, dug: false}, 120)
      assert elem(sense(final), 3) == 3, "must aim, approach and strike from (yaw=#{y}, pitch=#{p})"
    end
  end

  test "the target-relative prediction error reaches zero (the quantity being minimised)" do
    {final, _c, _t} = run(%{yaw: 0.8, pitch: 0.4, dist: 5.0, dug: false}, 120)

    assert MotorControl.target_error(@target, sense(final)) == 0,
           "aim+reach target-relative error must be nulled by the inner loop"
  end
end
