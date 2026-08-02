defmodule SP.Runtime.LogSensorTest do
  @moduledoc "Gen-3: the producer SENSES the node's error/warning rate (the error_rate modality)."
  # not async: the counter + :logger handler are node-global singletons.
  use ExUnit.Case, async: false

  alias SP.Runtime.LogSensor

  test "install is idempotent and drain returns the right shape" do
    assert LogSensor.install() == :ok
    assert LogSensor.install() == :ok
    assert %{errors: e, warns: w} = LogSensor.drain()
    assert is_integer(e) and e >= 0 and is_integer(w) and w >= 0
  end

  test "counts error vs warning events and resets on drain" do
    LogSensor.install()
    LogSensor.drain()

    # drive the handler callback directly (deterministic — no dependence on Logger routing).
    LogSensor.log(%{level: :error}, %{})
    LogSensor.log(%{level: :critical}, %{})
    LogSensor.log(%{level: :warning}, %{})

    got = LogSensor.drain()
    assert got.errors >= 2 and got.warns >= 1

    # drain reset the counts: a fresh drain (sans new events) is back near zero.
    after_reset = LogSensor.drain()
    assert after_reset.errors == 0 and after_reset.warns == 0
  end
end
