defmodule SP.Core.SignalTest do
  use ExUnit.Case, async: true
  alias SP.Core.Signal

  test "valid signal round-trips" do
    assert {:ok, sig} =
             Signal.new(%{
               id: "s1",
               type: "sp.sense.interoception",
               source: "sensor:interoception",
               time: 0,
               data: %{energy: 0.5}
             })

    assert sig.specversion == "1.0"
    assert Signal.valid?(sig)
  end

  test "rejects bad type, source, time, data, id" do
    base = %{id: "x", type: "sp.sense.x", source: "sensor:x", time: 0, data: %{}}
    assert {:error, {:invalid_type, _}} = Signal.new(%{base | type: "NotDotted"})
    assert {:error, {:invalid_type, _}} = Signal.new(%{base | type: "single"})
    assert {:error, {:invalid_source, _}} = Signal.new(%{base | source: ""})
    assert {:error, {:invalid_time, _}} = Signal.new(%{base | time: -1})
    assert {:error, {:invalid_data, _}} = Signal.new(%{base | data: [1, 2]})
    assert {:error, {:invalid_id, _}} = Signal.new(%{base | id: nil})
  end

  test "new! raises on invalid" do
    assert_raise ArgumentError, fn ->
      Signal.new!(%{id: "x", type: "bad", source: "s", time: 0, data: %{}})
    end
  end

  test "valid? is false for non-signals" do
    refute Signal.valid?(%{})
    refute Signal.valid?(nil)
  end
end
