defmodule SP.Minecraft.BridgeTest do
  @moduledoc "Offline tests for the Minecraft bridge: RCON codec + command builder."
  use ExUnit.Case, async: true

  alias SP.Minecraft.{Builder, Rcon}
  alias SP.World

  describe "RCON packet codec" do
    test "encode/decode round-trips id, type and body" do
      packet = Rcon.encode(7, 2, "say hello")
      assert {:ok, %{id: 7, type: 2, body: "say hello"}, ""} = Rcon.decode(packet)
    end

    test "decode reports :more on an incomplete packet" do
      <<head::binary-size(6), _::binary>> = Rcon.encode(1, 3, "password")
      assert {:more, ^head} = Rcon.decode(head)
    end

    test "decode returns the trailing bytes of a second packet" do
      two = Rcon.encode(1, 0, "a") <> Rcon.encode(2, 0, "b")
      assert {:ok, %{id: 1, body: "a"}, rest} = Rcon.decode(two)
      assert {:ok, %{id: 2, body: "b"}, ""} = Rcon.decode(rest)
    end
  end

  describe "terrain classification + block mapping" do
    test "cell_kind picks the dominant terrain category" do
      assert Builder.cell_kind(0.0, 0.9, 0.0, 0.0) == "toxic"
      assert Builder.cell_kind(0.0, 0.0, 0.9, 0.0) == "water"
      assert Builder.cell_kind(0.9, 0.0, 0.0, 0.0) == "lush"
      assert Builder.cell_kind(0.0, 0.0, 0.0, 0.0) == "barren"
      assert Builder.cell_kind(0.0, 0.0, 0.0, 0.9) == "void"
    end

    test "block_for maps kinds to valid Minecraft block ids" do
      assert Builder.block_for("lush") == "minecraft:lime_concrete"
      assert Builder.block_for("water") == "minecraft:light_blue_concrete"
      assert Builder.block_for("toxic") == "minecraft:red_concrete"
      assert Builder.block_for("barren") == "minecraft:sand"
      assert Builder.block_for("void") == "minecraft:black_concrete"
    end
  end

  describe "command building from a world" do
    setup do
      {:ok, world: World.generate(7, regions: 2)}
    end

    test "terrain commands place real blocks for every cell", %{world: world} do
      cmds = Builder.terrain_commands(world)
      # 3 commands per cell across 2 regions of 36 cells.
      assert length(cmds) == 3 * 2 * 36
      assert Enum.any?(cmds, &String.starts_with?(&1, "setblock "))
      assert Enum.any?(cmds, &String.contains?(&1, "minecraft:"))
      assert Enum.all?(cmds, &(String.starts_with?(&1, "setblock ") or String.starts_with?(&1, "fill ")))
    end

    test "two regions are laid out at different x offsets", %{world: world} do
      origins = Builder.origins(world)
      xs = origins |> Map.values() |> Enum.map(&elem(&1, 0))
      assert length(Enum.uniq(xs)) == 2
    end

    test "agent is a glowing blaze, spawned then teleported", %{world: world} do
      cmds = Builder.spawn_agent_commands(world, {0, 5}, {0, 64, 0})
      summon = List.last(cmds)
      assert Enum.any?(cmds, &(&1 == "kill @e[tag=spagent]"))
      assert summon =~ "summon minecraft:blaze"
      assert summon =~ "Glowing:1b"
      assert summon =~ ~s|Tags:["spagent"]|

      move = Builder.move_agent_command(world, {0, 5}, {0, 64, 0})
      assert move =~ ~r/^tp @e\[tag=spagent\] -?\d+ -?\d+ -?\d+$/

      follow = Builder.follow_command(world, {0, 5}, {0, 64, 0})
      assert follow =~ ~r/^tp \w+ -?\d+ -?\d+ -?\d+ facing -?\d+ -?\d+ -?\d+$/
    end
  end
end
