defmodule SP.ShowVerdictTest do
  @moduledoc """
  The puppet-cam guard (gate-integrity, Producer audit 2026-07-11). `SP.Show.verdict/1` must NOT read "LIVE" for a
  headless :self puppet — a live Director PID whose REAL driver is still :self is a puppet, and the old logic
  (verdict=LIVE on producer_up && director_up, driver synthesized as :producer from PID existence) was vacuous.
  LIVE now requires the Director's REAL driver == :producer.
  """
  use ExUnit.Case, async: true

  defp st(overrides),
    do:
      Map.merge(%{show_up: true, producer_up: true, director_up: true, driver: :producer}, Map.new(overrides))

  test "LIVE only when Producer + Director up AND real driver is :producer" do
    assert SP.Show.verdict(st(%{})) == "LIVE"
  end

  test "a headless :self puppet (live Director PID, driver still :self) is PARTIAL, NOT LIVE" do
    assert SP.Show.verdict(st(%{driver: :self})) == "PARTIAL"
  end

  test "driver nil (Director down/unreachable) with producer up is PARTIAL, not LIVE" do
    assert SP.Show.verdict(st(%{director_up: false, driver: nil})) == "PARTIAL"
  end

  test "producer up but director down is PARTIAL even if driver somehow reads :producer" do
    assert SP.Show.verdict(st(%{director_up: false})) == "PARTIAL"
  end

  test "nothing up is DOWN" do
    assert SP.Show.verdict(%{show_up: false, producer_up: false, director_up: false, driver: nil}) == "DOWN"
  end
end
