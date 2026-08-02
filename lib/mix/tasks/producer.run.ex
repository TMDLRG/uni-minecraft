defmodule Mix.Tasks.Producer.Run do
  @shortdoc "Run the Producer UNI — the pure active-inference show-runner — live."
  @moduledoc """
  Starts the Producer UNI, which puts the Director camera into `:producer` mode and runs
  the live show by active inference: it senses all telemetry (the colony board + server
  health), decides every production action by EFE (cuts/shots/narration/spawn/cull/health),
  narrates in five languages, answers questions, and self-maintains. Open `/stream` to watch.

      mix producer.run

  Requires a Paper server + the Phoenix UI (`cd ui && mix phx.server`) for the camera/overlay;
  this task just brings the Producer up and keeps the node alive.
  """
  use Mix.Task

  @impl true
  def run(_argv) do
    Mix.Task.run("app.start")
    SP.Show.ensure_started()
    IO.puts("Producer UNI is running the show — open http://localhost:4000/stream. Ctrl-C twice to stop.")
    Process.sleep(:infinity)
  end
end
