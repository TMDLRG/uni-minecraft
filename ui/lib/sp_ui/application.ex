defmodule SpUi.Application do
  @moduledoc false
  use Application

  @impl true
  def start(_type, _args) do
    children =
      [
        {Phoenix.PubSub, name: SpUi.PubSub},
        SpUiWeb.Endpoint
      ] ++ show_children()

    Supervisor.start_link(children, strategy: :one_for_one, name: SpUi.Supervisor)
  end

  # UNI.OS headless deploy: when UNI_AUTOSTART=1, the whole show runs as a SUPERVISED subtree of
  # this node (SP.Show.Supervisor owns Colony + Director + Producer, restart-safe), and a
  # supervised SP.Show.Bootstrap populates the design cast once. Replaces the old fire-and-forget
  # Task.start. Unset = the dev box, where the operator triggers the show deliberately via
  # /stream or `mix producer.run` (SP.Show.ensure_started) — so this stays byte-inert there.
  defp show_children do
    if System.get_env("UNI_AUTOSTART") == "1" do
      # UNI_POPULATE=0 runs the supervised show WITHOUT the cast populator — the observer-node
      # deploy (reviewed: docs/specs/producer_remote_sense_observe_only.md). Default "1" (unset)
      # = today's behaviour, byte-identical.
      if System.get_env("UNI_POPULATE") == "0" do
        [{SP.Show.Supervisor, show_opts()}]
      else
        [{SP.Show.Supervisor, show_opts()}, {SP.Show.Bootstrap, kin: autostart_kin()}]
      end
    else
      []
    end
  end

  # Reviewed transport/fence opts for the supervised show (Show.Supervisor forwards opts to
  # Colony/Director/Producer/OverlayPublisher). Unset env = [] = today's bare child, byte-identical.
  defp show_opts do
    opts =
      case System.get_env("UNI_COLONY_NODE") do
        nil -> []
        "" -> []
        s -> [colony_node: String.to_atom(s)]
      end

    if System.get_env("UNI_OBSERVE_ONLY") == "1", do: Keyword.put(opts, :observe_only, true), else: opts
  end

  # The design colony = kin [0,1,1,2,3] (5 UNIs), overridable via UNI_KIN="0,1,2" for a smaller test colony.
  defp autostart_kin do
    case System.get_env("UNI_KIN") do
      nil -> [0, 1, 1, 2, 3]
      s -> s |> String.split(",") |> Enum.map(&(&1 |> String.trim() |> String.to_integer()))
    end
  end

  @impl true
  def config_change(changed, _new, removed) do
    SpUiWeb.Endpoint.config_change(changed, removed)
    :ok
  end
end
