defmodule SP.Runtime.LineageTest do
  @moduledoc """
  R3: kin-lineage population evolution. We test the PURE breeding core (archive +
  crossover + mutation) directly, then drive the durable lineage GenServer with simulated
  death reports (no Minecraft) and assert it breeds + respawns each generation. No sleeps:
  a synchronous `status/1` call after the sends drains the mailbox (FIFO) before we read.
  """
  use ExUnit.Case, async: false

  alias SP.Runtime.{Lineage, Supervisor}
  alias SP.Brain.Genome
  alias SP.Determinism, as: Det

  test "record/4 keeps the fittest `max`, sorted by fitness" do
    g = Genome.default()
    pop = Enum.reduce([10, 50, 30, 5, 40], [], fn f, acc -> Lineage.record(acc, g, f, 3) end)
    assert Enum.map(pop, fn {_g, f} -> f end) == [50, 40, 30]
  end

  test "breed/2 yields a valid child genome and is deterministic in rng" do
    pop = [{Genome.default(), 40}, {Genome.default(), 10}]
    {child, _} = Lineage.breed(pop, Det.new(7))
    assert match?(%Genome{}, child)
    assert Genome.valid?(child)

    {c1, _} = Lineage.breed(pop, Det.new(7))
    {c2, _} = Lineage.breed(pop, Det.new(7))
    assert c1 == c2
  end

  test "breed/2 degrades gracefully on an empty or singleton archive" do
    {child0, _} = Lineage.breed([], Det.new(1))
    {child1, _} = Lineage.breed([{Genome.default(), 0}], Det.new(1))
    assert Genome.valid?(child0) and Genome.valid?(child1)
  end

  test "the lineage spawns gen-1 then breeds + respawns on each death (population evolution)" do
    kin = 8
    Supervisor.ensure_started()
    Lineage.ensure_started(kin, body_script: "/nonexistent-body.js", visibility: "see_all")

    on_exit(fn ->
      for g <- 1..3, do: Supervisor.stop_agent("UNI-#{kin}-g#{g}")
      if pid = Process.whereis(Lineage.name(kin)), do: GenServer.stop(pid)
    end)

    assert Lineage.status(kin).gen == 1
    assert "UNI-8-g1" in Enum.map(Supervisor.list_agents(), & &1.username)

    g = Genome.default()
    send(Lineage.name(kin), {:agent_done, %{username: "UNI-8-g1", dna: g, fitness: 30}})
    send(Lineage.name(kin), {:agent_done, %{username: "UNI-8-g2", dna: g, fitness: 50}})

    st = Lineage.status(kin)
    assert st.gen == 3
    assert Enum.sort(st.archive, :desc) == [50, 30]
    assert "UNI-8-g3" in Enum.map(Supervisor.list_agents(), & &1.username)
  end
end
