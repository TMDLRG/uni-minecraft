defmodule Mix.Tasks.Sp.Minecraft do
  @shortdoc "Stream the simulated world into a running Minecraft (Paper) server via RCON"
  @moduledoc """
  Bridges the simulation into Minecraft: builds the world as blocks and moves a
  glowing agent through it, live, for you to watch in the Minecraft client.

      mix sp.minecraft --password <rcon_password> [--host 127.0.0.1] [--port 25575] \
        [--seed 314] [--agent morphology_seeking] [--ms 500]

  Prerequisites (see docs/runbooks/minecraft.md): a Paper 1.16.5 server running
  with `enable-rcon=true` and a matching Minecraft Java 1.16.5 client to watch.
  """
  use Mix.Task

  @switches [
    host: :string,
    port: :integer,
    password: :string,
    seed: :integer,
    agent: :string,
    ms: :integer,
    max_ticks: :integer,
    terrain_every: :integer
  ]

  @impl true
  def run(argv) do
    Mix.Task.run("app.start")
    {opts, _rest, _} = OptionParser.parse(argv, switches: @switches)
    SP.Minecraft.Runner.run(opts)
  end
end
