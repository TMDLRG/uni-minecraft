defmodule SP.Runtime.SupervisorTest do
  @moduledoc """
  R4: the supervised, sharded runtime + ETS push-snapshot. We drive a Port-less agent
  (no Minecraft) by feeding it σ messages directly, then assert it registers, publishes
  its mind beat to the board, is listed, and is cleanly stopped. No sleeps: a synchronous
  `stats/1` call after the sends forces the mailbox to drain (FIFO) before we read.
  """
  use ExUnit.Case, async: false

  alias SP.Runtime.{Supervisor, Board, Agent}

  @sigma "20;18;0;0;0;air;;false"

  setup do
    Supervisor.ensure_started()
    :ok
  end

  defp spawn_headless(username) do
    {:ok, ^username} =
      Supervisor.spawn_agent(
        username: username,
        kin: 3,
        visibility: "see_all",
        body_script: "/nonexistent-body.js",
        memory_path: nil,
        publish_every: 4
      )

    [{pid, _}] = Registry.lookup(Supervisor.registry(), username)
    on_exit(fn -> Supervisor.stop_agent(username) end)
    pid
  end

  test "Board stores, reads, and drops snapshot rows; all/0 is sorted" do
    Board.put("Z-row", %{count: 1})
    Board.put("A-row", %{count: 2})

    assert Enum.map(Board.all(), & &1.username) |> Enum.filter(&(&1 in ["A-row", "Z-row"])) == [
             "A-row",
             "Z-row"
           ]

    assert Board.get("A-row").count == 2
    Board.drop("A-row")
    Board.drop("Z-row")
    assert Board.get("A-row") == nil
  end

  test "a spawned agent registers (O(1) lookup) and appears in list_agents" do
    _pid = spawn_headless("UNI-3-101")
    listed = Supervisor.list_agents()
    me = Enum.find(listed, &(&1.username == "UNI-3-101"))
    assert (me && me.kin == 3) and me.mode == "see_all"
  end

  test "the agent PUBLISHES its mind beat to the board (push-snapshot, no fan-out)" do
    pid = spawn_headless("UNI-3-102")

    # feed 5 σ ticks, then a synchronous stats call forces them all to be processed
    for _ <- 1..5, do: send(pid, {nil, {:data, {:eol, @sigma}}})
    _ = Agent.stats(pid)

    row = Board.get("UNI-3-102")
    assert row.count == 5
    assert row.senses["health"] == 20
    # by tick 4 the deep-planning mind beat has been computed and pushed
    assert row.context in [:forage, :build, :flee, :socialize, :rest]
    assert is_list(row.intent)
  end

  test "stop_agent removes the agent and drops its board row" do
    pid = spawn_headless("UNI-3-103")
    send(pid, {nil, {:data, {:eol, @sigma}}})
    _ = Agent.stats(pid)
    assert Board.get("UNI-3-103") != nil

    Supervisor.stop_agent("UNI-3-103")
    # terminate_child is synchronous (process is dead) and we drop the board row; the
    # Registry deregisters asynchronously via its own monitor, so we don't assert on it here.
    refute Process.alive?(pid)
    assert Board.get("UNI-3-103") == nil
  end
end
