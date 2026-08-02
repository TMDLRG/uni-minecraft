defmodule SP.Brain.MotorTest do
  @moduledoc """
  U13: continuous predictive coding. Action descends the free-energy gradient on
  prediction error, so the controller converges to the target; error falls monotonically;
  precision sets the loop gain (more precision ⇒ faster correction).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.Motor

  test "the controller converges to the target (prediction error → 0)" do
    final = Motor.settle(%Motor{pos: 0.0}, 1.0, 1.0, 200)
    assert_in_delta final.pos, 1.0, 0.01
  end

  test "prediction error falls monotonically (gradient descent, no overshoot)" do
    errors =
      Enum.scan(1..30, %Motor{pos: 0.0}, fn _, s -> Motor.step(s, 1.0, 1.0) end)
      |> Enum.map(fn s -> abs(Motor.error(s, 1.0)) end)

    assert errors == Enum.sort(errors, :desc)
  end

  test "precision is the loop gain: more precision ⇒ faster correction" do
    slow = Motor.settle(%Motor{pos: 0.0}, 1.0, 1.0, 10)
    fast = Motor.settle(%Motor{pos: 0.0}, 1.0, 3.0, 10)
    assert abs(Motor.error(fast, 1.0)) < abs(Motor.error(slow, 1.0))
  end

  test "it works in both directions and from any offset" do
    assert Motor.settle(%Motor{pos: 5.0}, -2.0, 1.0, 300).pos |> Float.round(2) == -2.0
  end
end
