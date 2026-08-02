defmodule SP.Minecraft.Builder do
  @moduledoc """
  Translates the simulated world into Minecraft (1.16.5) console commands.

  The world's region graph is laid out as a row of "islands"; each cell becomes a
  block column whose top block and height encode the terrain (lush=grass,
  water=water, toxic=red, barren=sand, void=black). The agent is a glowing,
  AI-less magma cube teleported to its cell each tick — its `Glowing` outline is
  visible through terrain, so a third-party observer can always follow it.

  Pure: every function returns command strings; `SP.Minecraft.Rcon` sends them.
  Nothing here is Minecraft-version-specific beyond the block ids below.
  """

  alias SP.World
  alias SP.World.{Field, Region}

  @gap 2
  # The server world is a SUPERFLAT (grass surface at y≈3), so we build the
  # terrain to sit ON that plain rather than floating high above it.
  @base_y 4
  @agent_tag "spagent"

  @type base :: {integer(), integer(), integer()}

  @doc "One-time world settings for a clean, stable spectating environment."
  @spec setup_commands() :: [String.t()]
  def setup_commands do
    [
      "gamerule doDaylightCycle false",
      "gamerule doWeatherCycle false",
      "gamerule doMobSpawning false",
      "gamerule randomTickSpeed 0",
      # NOT peaceful: peaceful deletes hostile mobs (our magma-cube agent). Mob
      # spawning is off above, so the agent is the only creature in the world.
      "difficulty easy",
      "weather clear",
      "time set 6000"
    ]
  end

  @doc "Row layout: region id -> `{ox, oz}` offset (in blocks) from the base."
  @spec origins(World.t()) :: %{World.region_id() => {integer(), integer()}}
  def origins(%World{} = world) do
    world.regions
    |> Map.keys()
    |> Enum.sort()
    |> Enum.with_index()
    |> Map.new(fn {id, idx} ->
      w = world.regions[id].w
      {id, {idx * (w + @gap), 0}}
    end)
  end

  @doc "Commands to (re)build the whole terrain as Minecraft blocks (full build)."
  @spec terrain_commands(World.t(), base()) :: [String.t()]
  def terrain_commands(%World{} = world, base \\ {0, @base_y, 0}) do
    world
    |> terrain_map(base)
    |> Enum.flat_map(fn {pos, spec} -> cell_commands(pos, spec, base) end)
  end

  @doc """
  The world's desired terrain as a pure description: `%{{x, z} => {kind, top}}`.
  The Runner diffs this against the previous tick and re-renders ONLY the cells
  that actually changed — a full rebuild every tick makes the live viewer re-mesh
  the whole world and flicker. The world is mostly static within a life, so a
  diff is usually a handful of cells (or none).
  """
  @spec terrain_map(World.t(), base()) :: %{{integer(), integer()} => {String.t(), integer()}}
  def terrain_map(%World{} = world, base \\ {0, @base_y, 0}) do
    origins = origins(world)

    world.regions
    |> Map.values()
    |> Enum.flat_map(fn region -> region_cells(region, Map.fetch!(origins, region.id), base) end)
    |> Map.new()
  end

  defp region_cells(%Region{} = region, {ox, oz}, {bx, by, bz}) do
    {mn, ms, mc} = {fmax(region.nutrient), fmax(region.solvent), fmax(region.cavity)}
    n = region.w * region.h

    Enum.map(0..(n - 1), fn i ->
      cx = rem(i, region.w)
      cy = div(i, region.w)
      x = bx + ox + cx
      z = bz + oz + cy

      nf = norm(Field.get(region.nutrient, i), mn)
      tf = min(1.0, Field.get(region.toxin, i) / 0.6)
      sf = norm(Field.get(region.solvent, i), ms)
      cavf = norm(Field.get(region.cavity, i), mc)
      kind = cell_kind(nf, tf, sf, cavf)
      top = by + height(kind, nf)
      {{x, z}, {kind, top}}
    end)
  end

  @doc "Commands to (re)render exactly one terrain cell column at `{x, z}`."
  @spec cell_commands({integer(), integer()}, {String.t(), integer()}, base()) :: [String.t()]
  def cell_commands({x, z}, {kind, top}, {_bx, by, _bz}) do
    [
      # Solid core down to the base, then the surface block, then clear the air
      # just ABOVE the surface only — NOT up into the agent/crown airspace (by+9+),
      # so a terrain refresh can never erase the hovering agent's morphology crown.
      "fill #{x} #{by} #{z} #{x} #{top - 1} #{z} minecraft:stone",
      "setblock #{x} #{top} #{z} #{block_for(kind)}",
      "fill #{x} #{top + 1} #{z} #{x} #{by + 8} #{z} minecraft:air"
    ]
  end

  @doc """
  One-time clear of the airspace above the world (the agent/crown zone), used at
  startup to wipe any stale morphology crowns left by a previous bridge run.
  """
  @spec clear_airspace_command(World.t(), base()) :: String.t()
  def clear_airspace_command(%World{} = world, {bx, by, bz}) do
    span = world.regions |> Map.values() |> Enum.map(&(&1.w + @gap)) |> Enum.sum()
    maxh = world.regions |> Map.values() |> Enum.map(& &1.h) |> Enum.max(fn -> 1 end)
    "fill #{bx - 1} #{by + 9} #{bz - 1} #{bx + span} #{by + 30} #{bz + maxh} minecraft:air"
  end

  @doc "Classify a cell into a terrain kind (mirrors the web map's biomes)."
  @spec cell_kind(float(), float(), float(), float()) :: String.t()
  def cell_kind(nf, tf, sf, cavf) do
    cond do
      cavf > 0.6 -> "void"
      tf > 0.45 -> "toxic"
      sf > 0.5 -> "water"
      nf > 0.32 -> "lush"
      true -> "barren"
    end
  end

  @doc "Minecraft block id for a terrain kind."
  @spec block_for(String.t()) :: String.t()
  # Distinct from the superflat's grass plain (grass_block would blend in) — the
  # whole palette is colour-coded blocks, like the web map's biomes.
  def block_for("lush"), do: "minecraft:lime_concrete"
  # Solid block (not flowing `minecraft:water`) so the map reads cleanly, like the
  # other biomes' concrete blocks — flowing water cascaded off the terrain edges.
  def block_for("water"), do: "minecraft:light_blue_concrete"
  def block_for("toxic"), do: "minecraft:red_concrete"
  def block_for("barren"), do: "minecraft:sand"
  def block_for("void"), do: "minecraft:black_concrete"
  def block_for(_), do: "minecraft:stone"

  defp height("void", _nf), do: 0
  defp height("water", _nf), do: 1
  defp height("lush", nf), do: 2 + round(nf * 4)
  defp height("toxic", nf), do: 1 + round(nf * 2)
  defp height(_barren, nf), do: 1 + round(nf * 2)

  @doc "Command to (re)spawn the glowing agent avatar, removing any previous one."
  @spec spawn_agent_commands(World.t(), {World.region_id(), non_neg_integer()}, base()) :: [String.t()]
  def spawn_agent_commands(%World{} = world, location, base) do
    {x, y, z} = agent_xyz(world, location, base)

    [
      # Clear any prior agent + stray magma cubes from earlier runs. A blaze (unlike a
      # magma cube) does NOT split into copies when killed, so respawns stay clean.
      "kill @e[type=minecraft:magma_cube]",
      "kill @e[tag=#{@agent_tag}]",
      # A glowing, hovering blaze with a visible gold name — big and bright, unmistakable.
      "summon minecraft:blaze #{x} #{y} #{z} " <>
        "{NoAI:1b,NoGravity:1b,Silent:1b,Glowing:1b,Invulnerable:1b,PersistenceRequired:1b," <>
        "CustomName:'{\"text\":\"◆ AGENT\",\"color\":\"gold\"}',CustomNameVisible:1b,Tags:[\"#{@agent_tag}\"]}"
    ]
  end

  @doc "Command to move the agent avatar to its current cell (per tick)."
  @spec move_agent_command(World.t(), {World.region_id(), non_neg_integer()}, base()) :: String.t()
  def move_agent_command(%World{} = world, location, base) do
    {x, y, z} = agent_xyz(world, location, base)
    "tp @e[tag=#{@agent_tag}] #{x} #{y} #{z}"
  end

  @doc "Teleport the spectator-bot camera to chase the agent in 3rd person (per tick)."
  @spec follow_command(World.t(), {World.region_id(), non_neg_integer()}, base(), String.t()) :: String.t()
  def follow_command(%World{} = world, location, base, bot \\ "Overlooker") do
    {x, y, z} = agent_xyz(world, location, base)
    "tp #{bot} #{x} #{y + 5} #{z + 7} facing #{x} #{y} #{z}"
  end

  @doc "Clear the morphology crown previously drawn above the agent at `location`."
  @spec morphology_clear_command(World.t(), {World.region_id(), non_neg_integer()}, base()) :: String.t()
  def morphology_clear_command(%World{} = world, location, {_bx, by, _bz} = base) do
    {x, _y, z} = agent_xyz(world, location, base)
    "fill #{x} #{by + 9} #{z} #{x} #{by + 28} #{z} minecraft:air"
  end

  @doc """
  A small glowing "crown" above the hovering agent that reflects its EVOLVING
  morphology: one block per mature organ — cyan = sense, magenta = appendage —
  topped by a sea-lantern stage marker. The crown grows as the body develops, so a
  spectator watches the agent's morphology evolve (it has no fixed/humanoid form).
  """
  @spec morphology_commands(
          World.t(),
          {World.region_id(), non_neg_integer()},
          base(),
          [atom()],
          [atom()],
          non_neg_integer()
        ) :: [String.t()]
  def morphology_commands(%World{} = world, location, base, senses, appendages, stage) do
    {x, y, z} = agent_xyz(world, location, base)
    # Cap each category so a many-organ agent doesn't grow a giant tower over the camera.
    senses = Enum.take(senses, 4)
    appendages = Enum.take(appendages, 4)
    cb = y + 2
    ns = length(senses)

    sense_cmds =
      for {_o, i} <- Enum.with_index(senses),
          do: "setblock #{x} #{cb + i} #{z} minecraft:cyan_concrete"

    app_cmds =
      for {_o, i} <- Enum.with_index(appendages),
          do: "setblock #{x} #{cb + ns + i} #{z} minecraft:magenta_concrete"

    top = cb + ns + length(appendages)
    stage_cmds = if stage > 0, do: ["setblock #{x} #{top} #{z} minecraft:sea_lantern"], else: []

    sense_cmds ++ app_cmds ++ stage_cmds
  end

  @doc "A camera teleport so a spectator is dropped looking at the world."
  @spec spectate_command(World.t(), base()) :: String.t()
  def spectate_command(%World{} = world, {bx, by, bz}) do
    span = world.regions |> Map.values() |> Enum.map(& &1.w) |> Enum.sum()
    "tp @a #{bx + div(span, 2)} #{by + 22} #{bz - 14} 25 55"
  end

  defp agent_xyz(world, {region_id, cell}, {bx, by, bz}) do
    region = World.region(world, region_id)
    {ox, oz} = Map.get(origins(world), region_id, {0, 0})
    cx = rem(cell, region.w)
    cy = div(cell, region.w)
    # Hover at a CONSTANT height (just above the tallest terrain column) so neither the
    # avatar nor the chase-cam (which targets it) bounce vertically as the agent crosses
    # cells of different elevation. The sim has no notion of agent "height", so a fixed
    # hover is just as faithful as terrain-following — and far steadier to watch.
    {bx + ox + cx, by + 8, bz + oz + cy}
  end

  defp norm(v, m), do: min(1.0, v / m)

  defp fmax(%Field{cells: cells}) do
    cells |> Map.values() |> Enum.max(fn -> 0.001 end) |> max(0.001)
  end
end
