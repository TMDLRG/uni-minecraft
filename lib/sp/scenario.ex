defmodule SP.Scenario do
  @moduledoc """
  Scenario definitions: reproducible, schema-validated benchmark configurations.

  A scenario is a plain map (loadable from JSON in `config/scenarios/`) describing
  the world size, seed, hybrid-time cadence, horizon, and which baseline agent to
  run. `load/1` validates against `schema/0` (via `SP.Core.Schema`) so malformed
  configs are rejected with structured errors rather than crashing mid-run
  (spec QA: corrupted scenario config handling).

  Agent names are resolved through a fixed registry — learner-facing clients
  never pass a module directly.
  """

  alias SP.Core.Schema

  @agents %{
    "random" => SP.Baselines.Random,
    "homeostatic" => SP.Baselines.Homeostatic,
    "probe_first" => SP.Baselines.ProbeFirst,
    "morphology_seeking" => SP.Baselines.MorphologySeeking,
    "infrastructure" => SP.Baselines.Infrastructure,
    "leakage_probe" => SP.Baselines.LeakageProbe
  }

  @schema [
    {:name, :string, []},
    {:seed, :integer, default: 1},
    {:regions, :integer, default: 2},
    {:w, :integer, default: 6},
    {:h, :integer, default: 6},
    {:max_ticks, :integer, default: 400},
    {:micro_per_decision, :integer, default: 3},
    {:dev_interval, :integer, default: 5},
    {:agent, {:in, Map.keys(@agents)}, default: "homeostatic"},
    {:scramble, :boolean, default: true}
  ]

  @type t :: map()

  @spec schema() :: Schema.schema()
  def schema, do: @schema

  @spec agents() :: %{String.t() => module()}
  def agents, do: @agents

  @doc "Validate a scenario map. Returns `{:ok, normalised}` or `{:error, errors}`."
  @spec validate(map()) :: {:ok, t()} | {:error, term()}
  def validate(map) when is_map(map), do: Schema.validate(map, @schema)

  @doc "Load and validate a scenario from a JSON file."
  @spec load(Path.t()) :: {:ok, t()} | {:error, term()}
  def load(path) do
    with {:ok, bin} <- File.read(path),
         {:ok, decoded} <- decode(bin) do
      validate(decoded)
    end
  end

  @doc "Convert a validated scenario into `SP.Sim.new/1` options."
  @spec to_sim_opts(t()) :: keyword()
  def to_sim_opts(scenario) do
    [
      seed: scenario.seed,
      agent: Map.fetch!(@agents, scenario.agent),
      max_ticks: scenario.max_ticks,
      micro_per_decision: scenario.micro_per_decision,
      dev_interval: scenario.dev_interval,
      scramble: scenario.scramble,
      world_opts: [regions: scenario.regions, w: scenario.w, h: scenario.h]
    ]
  end

  @doc "Built-in reference scenarios (also written to config/scenarios as JSON)."
  @spec builtin() :: %{String.t() => t()}
  def builtin do
    %{
      "starter" => norm(%{"name" => "starter", "seed" => 101, "regions" => 2, "agent" => "homeostatic"}),
      "epistemic" => norm(%{"name" => "epistemic", "seed" => 202, "regions" => 2, "agent" => "probe_first"}),
      "morphogenesis" =>
        norm(%{
          "name" => "morphogenesis",
          "seed" => 303,
          "regions" => 2,
          "agent" => "morphology_seeking",
          "max_ticks" => 600
        }),
      "open_ended" =>
        norm(%{
          "name" => "open_ended",
          "seed" => 404,
          "regions" => 3,
          "agent" => "infrastructure",
          "max_ticks" => 800
        }),
      "leakage_probe" => norm(%{"name" => "leakage_probe", "seed" => 505, "agent" => "leakage_probe"})
    }
  end

  defp norm(map) do
    {:ok, s} = validate(map)
    s
  end

  defp decode(bin) do
    {:ok, :json.decode(bin)}
  rescue
    e -> {:error, {:invalid_json, Exception.message(e)}}
  end
end
