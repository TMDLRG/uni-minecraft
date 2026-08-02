defmodule SP.Brain.ColonyObserveOnlyTest do
  # async: false — manipulates process-global env.
  use ExUnit.Case, async: false

  # Defense-in-depth guard (reviewed change A5): under UNI_OBSERVE_ONLY=1 the colony facade
  # refuses to spawn or stop agents no matter who calls — an observer node must be unable to
  # mutate the cast of the world it watches. Unset env = today's behaviour (covered by every
  # existing test that spawns agents).
  test "spawn_agent and stop_agent refuse under UNI_OBSERVE_ONLY=1" do
    System.put_env("UNI_OBSERVE_ONLY", "1")
    on_exit(fn -> System.delete_env("UNI_OBSERVE_ONLY") end)

    assert SP.Brain.Colony.spawn_agent(0, "see_all") == {:error, :observe_only}
    assert SP.Brain.Colony.stop_agent("UNI-0-1") == {:error, :observe_only}
  end

  test "invalid args still refuse ahead of the fence semantics" do
    assert SP.Brain.Colony.spawn_agent(99, "see_all") == {:error, :invalid_args}
  end
end
