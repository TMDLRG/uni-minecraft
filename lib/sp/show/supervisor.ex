defmodule SP.Show.Supervisor do
  @moduledoc """
  The live-show supervision tree — the durability fix. Before this, `SP.Producer`,
  `SP.Brain.Director`, and `SP.Brain.Colony` were started with unlinked `GenServer.start`
  and nothing restarted them: a Producer crash ended the show until an operator noticed.
  Now the three run as supervised children, so the show self-heals.

  Strategy is `:rest_for_one` with the children ordered `[Colony, Director, Producer]`:

    * Colony first — the runtime board the others read.
    * Director second — the camera/overlay actuator the Producer drives.
    * Producer last — the active-inference show-runner.

  `:rest_for_one` is deliberate: if the **Director** crashes it is restarted together with
  the **Producer** after it, so `SP.Producer.init/1`'s `Director.set_driver(:producer)` runs
  again and the fresh Director comes back up in producer-driven mode (never the legacy
  rule-based `:self` driver, and never the headless "puppet orbit"). A Producer-only crash
  restarts just the Producer; a Colony crash restarts all three.

  This module owns process placement only — no math, no I/O of its own. It lives outside the
  FE covenant scan dirs (`lib/sp/brain`, `lib/sp/runtime`, `lib/sp/producer`) on purpose.
  """
  use Supervisor

  @name __MODULE__

  def start_link(opts \\ []), do: Supervisor.start_link(__MODULE__, opts, name: @name)

  @impl true
  def init(opts) do
    children = [
      %{id: SP.Brain.Colony, start: {SP.Brain.Colony, :start_link, [opts]}, restart: :permanent},
      %{id: SP.Brain.Director, start: {SP.Brain.Director, :start_link, [opts]}, restart: :permanent},
      %{id: SP.Producer, start: {SP.Producer, :start_link, [opts]}, restart: :permanent},
      # WS2-C: the audience overlay spool writer, in-app + supervised (replaces the hand-launched
      # runs/broadcast_bridge.exs). After the Producer so it reads the Director's fresh broadcast.
      %{
        id: SP.Show.OverlayPublisher,
        start: {SP.Show.OverlayPublisher, :start_link, [opts]},
        restart: :permanent
      }
    ]

    Supervisor.init(children, strategy: :rest_for_one)
  end
end
