defmodule Mix.Tasks.Uni.Play do
  @shortdoc "Run UNI — the active-inference agent — live in Minecraft"
  @moduledoc """
  Launches UNI: a Node `mineflayer` body connected to the pure active-inference
  brain over the Markov-blanket bridge. UNI logs into the Minecraft server,
  perceives symbolic senses, and acts by minimising expected free energy
  (pragmatic preference + epistemic curiosity). There is NO reward and NO RL.

      mix uni.play [--host 127.0.0.1] [--port 25565] [--version 1.16.5] \
        [--user UNI] [--visibility blind|seen] [--phase 0] [--seed 1] \
        [--memory runs/uni_memory.bin]

  Requires a Paper server running (docs/runbooks/minecraft.md) and Node with
  `mineflayer` installed under `viewer/`. Join with a 1.16.5 client (Direct
  Connect `localhost`) to watch; `--visibility seen` lets UNI sense you.
  """
  use Mix.Task

  @switches [
    host: :string,
    port: :integer,
    version: :string,
    user: :string,
    visibility: :string,
    phase: :integer,
    seed: :integer,
    memory: :string
  ]

  @impl true
  def run(argv) do
    Mix.Task.run("app.start")
    {opts, _rest, _} = OptionParser.parse(argv, switches: @switches)
    File.mkdir_p!("runs")

    bridge_opts = [
      mc_host: opts[:host] || "127.0.0.1",
      mc_port: opts[:port] || 25_565,
      mc_version: opts[:version] || "1.16.5",
      username: opts[:user] || "UNI",
      visibility: opts[:visibility] || "blind",
      phase: opts[:phase] || 0,
      seed: opts[:seed] || 1,
      memory_path: opts[:memory] || "runs/uni_memory.bin",
      body_script: Path.expand("viewer/body.js")
    ]

    {:ok, pid} = SP.Brain.Bridge.start_link(bridge_opts)

    IO.puts(
      "UNI is waking up in Minecraft as #{bridge_opts[:username]} " <>
        "(#{bridge_opts[:visibility]} mode). Join localhost with a 1.16.5 client to watch."
    )

    ref = Process.monitor(pid)

    receive do
      {:DOWN, ^ref, :process, _, reason} -> IO.puts("UNI bridge stopped: #{inspect(reason)}")
    end
  end
end
