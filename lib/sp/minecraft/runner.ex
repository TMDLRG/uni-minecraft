defmodule SP.Minecraft.Runner do
  @moduledoc """
  Drives a live simulation into a running Minecraft (Paper) server over RCON:
  builds the terrain, spawns the glowing agent, then steps the world — moving the
  agent each tick and refreshing the terrain periodically. When the agent
  perishes (or hits the horizon) it begins a fresh life whose body is bred from
  the best genome seen so far — a **(1+1) evolution strategy**: keep the
  longest-lived genome, mutate it for the next life. So a spectator watches the
  agent's morphology evolve across generations, indefinitely.

  The run is built to play *forever*: memory is bounded (each life uses
  `keep_points: false` so per-tick trace points never accumulate), and RCON send
  failures are swallowed by `SP.Minecraft.Rcon`, so a transient server hiccup
  never crashes the loop — it simply skips a frame and continues.

  Run via `mix sp.minecraft`. Requires a Paper server with RCON enabled (see
  `docs/runbooks/minecraft.md`).
  """

  alias SP.Minecraft.{Builder, Rcon}
  alias SP.Sim

  # Sit the world on the superflat plain (grass at y≈3), not floating at sea level.
  @base {0, 4, 0}

  @spec run(keyword()) :: :ok | {:error, term()}
  def run(opts \\ []) do
    host = Keyword.get(opts, :host, "127.0.0.1")
    port = Keyword.get(opts, :port, 25_575)
    password = Keyword.get(opts, :password, "sp")

    case Rcon.connect(host, port, password) do
      {:ok, sock} ->
        try do
          IO.puts("connected to Minecraft RCON #{host}:#{port} — building world…")
          Rcon.commands(sock, Builder.setup_commands())
          sim = new_sim(opts, nil)
          # Wipe any stale morphology crowns left floating by a previous run, then build.
          Rcon.command(sock, Builder.clear_airspace_command(sim.world, @base))
          rebuild(sock, sim)
          Rcon.command(sock, Builder.spectate_command(sim.world, @base))
          IO.puts("streaming. In the Minecraft client, join the server and watch (try /gamemode spectator).")
          # (1+1)-ES state threaded across lives: {best_genome, best_fitness, mutation_rng}.
          # The mutation stream is seeded distinctly (seed+7) so it never perturbs the
          # world/body streams, keeping the whole evolutionary run reproducible.
          seed = Keyword.get(opts, :seed, 314)
          evo = {nil, -1, SP.Determinism.new(seed + 7)}
          render = %{prev_loc: nil, prev_terrain: Builder.terrain_map(sim.world, @base), prev_crown: nil}
          loop(sock, sim, opts, evo, render)
        after
          Rcon.close(sock)
        end

      {:error, reason} ->
        IO.puts("Could not reach Minecraft RCON at #{host}:#{port}: #{inspect(reason)}")
        IO.puts("Is the Paper server running with enable-rcon=true? See docs/runbooks/minecraft.md")
        {:error, reason}
    end
  end

  # Build one life. `genome` is the body's hereditary substrate: pass `nil` for the
  # very first life (Sim.new derives a random genome from the seed); pass a bred
  # child genome for every subsequent life so the morphology evolves.
  defp new_sim(opts, genome) do
    agent = Map.fetch!(SP.Scenario.agents(), Keyword.get(opts, :agent, "morphology_seeking"))

    base = [
      seed: Keyword.get(opts, :seed, 314),
      agent: agent,
      max_ticks: Keyword.get(opts, :max_ticks, 100_000),
      # Forever-run memory bound: never retain per-tick trace points across a life.
      keep_points: false
    ]

    # `Sim.new` defaults the genome via `Keyword.get_lazy`, which only fires when the
    # key is ABSENT — so omit it entirely (don't pass nil) on the first life.
    opts_for_sim = if genome, do: Keyword.put(base, :genome, genome), else: base
    Sim.new(opts_for_sim)
  end

  defp rebuild(sock, sim) do
    Rcon.commands(sock, Builder.terrain_commands(sim.world, @base))
    Rcon.commands(sock, Builder.spawn_agent_commands(sim.world, sim.body.location, @base))
  end

  defp loop(sock, sim, opts, evo, render) do
    ms = Keyword.get(opts, :ms, 500)

    cond do
      not SP.Body.alive?(sim.body) or sim.tick >= sim.max_ticks ->
        # Selection: fitness is lifespan (ticks survived). Keep the fitter of the
        # life that just ended vs. the incumbent best, then breed the next life by
        # mutating that champion — a textbook (1+1) evolution strategy.
        {best, best_fit, rng} = evo
        fit = sim.tick
        {best, best_fit} = if is_nil(best) or fit > best_fit, do: {sim.genome, fit}, else: {best, best_fit}
        {child, rng} = SP.Genome.mutate(best, rng)

        IO.puts(
          "life ended at tick #{fit} " <>
            "(gen #{sim.genome.generation}, #{length(SP.Body.organs(sim.body))} organs, stage #{sim.body.stage}) — " <>
            "best #{best_fit}; breeding generation #{child.generation}."
        )

        if render.prev_loc,
          do: Rcon.command(sock, Builder.morphology_clear_command(sim.world, render.prev_loc, @base))

        # Subtitle must be set BEFORE title (the `title` packet triggers the on-screen draw).
        Rcon.command(
          sock,
          ~s|title @a subtitle {"text":"survived #{fit} ticks · best #{best_fit}","color":"gray"}|
        )

        Rcon.command(sock, ~s|title @a title {"text":"generation #{child.generation}","color":"gold"}|)

        sim = new_sim(opts, child)
        # Respawn the agent avatar (a localized kill+summon), then update the terrain
        # by DIFF ONLY. The new world resets to its freshly-generated state, so the
        # only cells that differ from the ending life are the few the agent depleted —
        # which reset back. A FULL rebuild here made the whole world blink every life
        # (every block vanished + redrew → the white flash / "world resetting").
        Rcon.commands(sock, Builder.spawn_agent_commands(sim.world, sim.body.location, @base))
        new_terrain = Builder.terrain_map(sim.world, @base)

        respawn_changed =
          for {pos, spec} <- new_terrain, Map.get(render.prev_terrain, pos) != spec, do: {pos, spec}

        if respawn_changed != [],
          do:
            Rcon.commands(
              sock,
              Enum.flat_map(respawn_changed, fn {pos, spec} -> Builder.cell_commands(pos, spec, @base) end)
            )

        render = %{prev_loc: nil, prev_terrain: new_terrain, prev_crown: nil}
        pace(ms)
        loop(sock, sim, opts, {best, best_fit, rng}, render)

      true ->
        sim = Sim.step(sim)
        loc = sim.body.location
        Rcon.command(sock, Builder.move_agent_command(sim.world, loc, @base))
        # Camera is owned by the spectator-bot (viewer/bot.js: smooth glide + modes),
        # so the Runner does NOT chase by default — two controllers would fight. Pass
        # `follow: true` only if you want the old server-side chase instead of the bot.
        if Keyword.get(opts, :follow, false),
          do: Rcon.command(sock, Builder.follow_command(sim.world, loc, @base))

        # Smooth, accurate terrain: re-render ONLY the cells whose kind/height
        # actually changed this tick (a periodic full rebuild made the live viewer
        # re-mesh the whole world and flicker). Usually a few cells, or none.
        terrain = Builder.terrain_map(sim.world, @base)
        changed = for {pos, spec} <- terrain, Map.get(render.prev_terrain, pos) != spec, do: {pos, spec}

        if changed != [],
          do:
            Rcon.commands(
              sock,
              Enum.flat_map(changed, fn {pos, spec} -> Builder.cell_commands(pos, spec, @base) end)
            )

        # Morphology crown: redraw only when the agent moved or its body changed, so
        # a stationary agent's column isn't cleared+rewritten every tick (flicker).
        sig = crown_sig(sim.body, loc)

        render =
          if sig != render.prev_crown do
            if render.prev_loc,
              do: Rcon.command(sock, Builder.morphology_clear_command(sim.world, render.prev_loc, @base))

            Rcon.commands(sock, morphology_crown(sim.world, sim.body, loc))
            %{render | prev_loc: loc, prev_crown: sig}
          else
            render
          end

        pace(ms)
        loop(sock, sim, opts, evo, %{render | prev_terrain: terrain})
    end
  end

  # Signature that determines whether the morphology crown needs redrawing.
  defp crown_sig(body, loc) do
    organs = SP.Body.organs(body)
    senses = Enum.filter(organs, &(&1 in SP.Body.sense_kinds()))
    appendages = Enum.filter(organs, &(&1 in SP.Body.appendage_kinds()))
    {loc, senses, appendages, body.stage}
  end

  # Build the per-tick "morphology crown" reflecting the agent's mature organs + stage.
  defp morphology_crown(world, body, loc) do
    organs = SP.Body.organs(body)
    senses = Enum.filter(organs, &(&1 in SP.Body.sense_kinds()))
    appendages = Enum.filter(organs, &(&1 in SP.Body.appendage_kinds()))
    Builder.morphology_commands(world, loc, @base, senses, appendages, body.stage)
  end

  # A real-time viewer loop is paced for human watching (not a test — sleeping
  # here is intentional and the only place the project uses it).
  defp pace(ms), do: Process.sleep(ms)
end
