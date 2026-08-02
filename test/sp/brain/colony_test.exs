defmodule SP.Brain.ColonyTest do
  use ExUnit.Case, async: false
  alias SP.Brain.Colony

  describe "argument validation (no agents spawned)" do
    test "rejects an out-of-range kin group without side effects" do
      assert Colony.spawn_agent(99, "see_all") == {:error, :invalid_args}
    end

    test "rejects an unknown visibility mode" do
      assert Colony.spawn_agent(0, "bogus") == {:error, :invalid_args}
    end
  end

  describe "configuration surface" do
    test "supports kin groups 0..9 (10 unique kin)" do
      assert Colony.max_kin() == 9
    end

    test "offers exactly the three visibility modes" do
      assert Enum.sort(Colony.modes()) == ["blind", "see_all", "see_kin"]
    end
  end
end
