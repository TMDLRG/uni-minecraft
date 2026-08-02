defmodule SP.Interface do
  @moduledoc """
  The opaque learner-facing channel layer — the outermost edge of the Markov
  blanket. The future learner couples to the environment ONLY through this
  module's encoded observations and decoded actions. It must never be able to
  read true world state.

  ## What it does

    * **Observation encoding** — takes the semantic sensor signals produced by
      `SP.Body.Sensor` and projects them onto **opaque numeric channels**: an
      integer `channel_id => float` map. Channel ids are a per-seed permutation
      of the feature catalogue, and (optionally) values are passed through a
      per-channel invertible affine scramble, so a channel id carries no semantic
      meaning and differs between seeds. Absent organs simply omit their channels
      (partial observability is structural, not flagged).
    * **Action decoding** — the learner emits `Directive.Actuate{channel: int}`;
      we decode the opaque action channel to an internal action atom. Action ids
      are likewise a per-seed permutation. Action parameters are **relative**
      (e.g. a neighbour-ring direction `0..3`, or "here"), never absolute
      coordinates.

  ## Versioned schema

  `catalogue_version/0` and the explicit `observation_catalogue/0` /
  `action_catalogue/0` are the versioned observation/action schemas. The inverse
  maps (`reveal_*`) exist for engineering/eval/debug ONLY and must never be
  called from learner-facing code.

  See `SP.Interface.Audit` for the leakage checker enforcing these guarantees.
  """

  alias SP.Core.Directive.Actuate
  alias SP.Core.Signal
  alias SP.Determinism

  @catalogue_version "obs-v1"

  # The observation feature catalogue: {source, key, type}. This is the versioned
  # observation schema and MUST match what SP.Body.Sensor emits.
  @observation_catalogue [
    {"sensor:interoception", :energy, :num},
    {"sensor:interoception", :hydration, :num},
    {"sensor:interoception", :temperature, :num},
    {"sensor:interoception", :integrity, :num},
    {"sensor:interoception", :budget, :num},
    {"sensor:chemotactile", :attractant, :num},
    {"sensor:chemotactile", :solvent, :num},
    {"sensor:chemotactile", :irritation, :num},
    {"sensor:chemotactile", :texture, :num},
    {"sensor:chemotactile", :feedstock_feel, :num},
    {"sensor:proprioception", :appendages, :num},
    {"sensor:proprioception", :senses, :num},
    {"sensor:proprioception", :parts, :num},
    {"sensor:proprioception", :stage, :num},
    {"sensor:plume", :nutrient_gradient, :num},
    {"sensor:plume", :toxin_gradient, :num},
    {"sensor:plume", :nutrient_dir, :num},
    {"sensor:plume", :toxin_dir, :num},
    {"sensor:tomography", :cavity, :num},
    {"sensor:tomography", :strain, :num},
    {"sensor:tomography", :support, :num},
    {"sensor:tomography", :collapse_proximity, :num},
    {"sensor:spectral", {:bands, 0}, :num},
    {"sensor:spectral", {:bands, 1}, :num},
    {"sensor:spectral", {:bands, 2}, :num},
    {"sensor:seam_coherence", :readiness, :num},
    {"sensor:seam_coherence", :ready, :bool},
    {"sensor:meta", :conflict, :num},
    {"sensor:meta", :ambiguity, :num}
  ]

  # Actions the learner may request, by atom. Param shapes are relative-only.
  @action_catalogue [
    :move,
    :orient,
    :probe,
    :manipulate,
    :deposit,
    :excavate,
    :transport,
    :build_shelter,
    :build_buttress,
    :build_conduit,
    :build_memory_node,
    :build_resonator,
    :repair,
    :shape_field,
    :mount_instrument,
    :write_memory,
    :read_memory,
    :open_seam
  ]

  defmodule ChannelMap do
    @moduledoc "A per-seed opaque channel map. Inverse maps are debug-only."
    @enforce_keys [
      :seed,
      :obs_to_channel,
      :channel_to_feature,
      :affine,
      :action_to_channel,
      :channel_to_action
    ]
    defstruct [:seed, :obs_to_channel, :channel_to_feature, :affine, :action_to_channel, :channel_to_action]

    @type t :: %__MODULE__{
            seed: term(),
            obs_to_channel: %{term() => non_neg_integer()},
            channel_to_feature: %{non_neg_integer() => term()},
            affine: %{non_neg_integer() => {float(), float()}},
            action_to_channel: %{atom() => non_neg_integer()},
            channel_to_action: %{non_neg_integer() => atom()}
          }
  end

  @spec catalogue_version() :: String.t()
  def catalogue_version, do: @catalogue_version

  @spec observation_catalogue() :: [{String.t(), term(), atom()}]
  def observation_catalogue, do: @observation_catalogue

  @spec action_catalogue() :: [atom()]
  def action_catalogue, do: @action_catalogue

  @doc """
  Build a deterministic, reproducible channel map for a `seed`. The same seed
  always yields the same opaque mapping (so scenarios are reproducible), and
  different seeds yield different mappings (so channel ids cannot be memorised
  across seeds). `scramble?: false` disables the value affine (debug only).
  """
  @spec channel_map(term(), keyword()) :: ChannelMap.t()
  def channel_map(seed, opts \\ []) do
    scramble? = Keyword.get(opts, :scramble, true)
    rng = Determinism.new("interface:" <> to_string(seed))

    obs_features = Enum.map(@observation_catalogue, fn {src, key, _t} -> {src, key} end)
    {obs_perm, rng} = permutation(rng, length(obs_features))

    obs_to_channel =
      obs_features |> Enum.zip(obs_perm) |> Map.new()

    channel_to_feature = Map.new(obs_to_channel, fn {f, c} -> {c, f} end)

    {affine, rng} =
      Enum.reduce(0..(length(obs_features) - 1), {%{}, rng}, fn c, {acc, rng} ->
        if scramble? do
          {scale, rng} = Determinism.range(rng, 0.5, 2.0)
          {offset, rng} = Determinism.range(rng, -1.0, 1.0)
          {Map.put(acc, c, {scale, offset}), rng}
        else
          {Map.put(acc, c, {1.0, 0.0}), rng}
        end
      end)

    {act_perm, _rng} = permutation(rng, length(@action_catalogue))
    action_to_channel = @action_catalogue |> Enum.zip(act_perm) |> Map.new()
    channel_to_action = Map.new(action_to_channel, fn {a, c} -> {c, a} end)

    %ChannelMap{
      seed: seed,
      obs_to_channel: obs_to_channel,
      channel_to_feature: channel_to_feature,
      affine: affine,
      action_to_channel: action_to_channel,
      channel_to_action: channel_to_action
    }
  end

  @doc """
  Encode semantic sensor signals into an opaque observation: `%{channel_id =>
  float}`. Only features actually present (organ active) appear. The result
  contains nothing but integer keys and float values.
  """
  @spec encode_observation(ChannelMap.t(), [Signal.t()]) :: %{non_neg_integer() => float()}
  def encode_observation(%ChannelMap{} = cm, signals) when is_list(signals) do
    signals
    |> Enum.flat_map(&flatten_signal/1)
    |> Enum.reduce(%{}, fn {feature, value}, acc ->
      case Map.fetch(cm.obs_to_channel, feature) do
        {:ok, channel} ->
          {scale, offset} = Map.fetch!(cm.affine, channel)
          Map.put(acc, channel, scale * numeric(value) + offset)

        :error ->
          # Unknown feature (not in catalogue) is dropped — never leaked raw.
          acc
      end
    end)
  end

  @doc """
  Decode an opaque actuation directive into `{:ok, action_atom, params}` or
  `{:error, reason}`. Params are validated to be relative-only.
  """
  @spec decode_action(ChannelMap.t(), Actuate.t()) ::
          {:ok, atom(), map()} | {:error, term()}
  def decode_action(%ChannelMap{} = cm, %Actuate{channel: channel, params: params}) do
    case Map.fetch(cm.channel_to_action, channel) do
      {:ok, action} ->
        case validate_params(action, params) do
          :ok -> {:ok, action, params}
          {:error, reason} -> {:error, reason}
        end

      :error ->
        {:error, {:unknown_action_channel, channel}}
    end
  end

  @doc "Number of observation channels (the opaque observation dimensionality)."
  @spec channel_count() :: non_neg_integer()
  def channel_count, do: length(@observation_catalogue)

  # --- debug-only inverse (NEVER call from learner-facing code) ---------------

  @doc false
  @spec reveal_channel(ChannelMap.t(), non_neg_integer()) :: term()
  def reveal_channel(%ChannelMap{channel_to_feature: m}, c), do: Map.get(m, c)

  @doc false
  @spec reveal_action(ChannelMap.t(), non_neg_integer()) :: atom() | nil
  def reveal_action(%ChannelMap{channel_to_action: m}, c), do: Map.get(m, c)

  # --- helpers -----------------------------------------------------------------

  # Flatten a signal's data into `{ {source, key}, value }` features matching the
  # catalogue (list values expand to `{:bands, i}` etc).
  defp flatten_signal(%Signal{source: source, data: data}) do
    Enum.flat_map(data, fn
      {:bands, list} when is_list(list) ->
        list |> Enum.with_index() |> Enum.map(fn {v, i} -> {{source, {:bands, i}}, v} end)

      {key, value} ->
        [{{source, key}, value}]
    end)
  end

  defp numeric(true), do: 1.0
  defp numeric(false), do: 0.0
  defp numeric(v) when is_integer(v), do: v * 1.0
  defp numeric(v) when is_float(v), do: v
  defp numeric(_), do: 0.0

  # Relative-only parameter validation. Absolute coordinates are rejected.
  defp validate_params(action, params) when is_map(params) do
    forbidden = [:region, :cell, :region_id, :coord, :coords, :x, :y]

    cond do
      Enum.any?(forbidden, &Map.has_key?(params, &1)) ->
        {:error, :absolute_coordinate_forbidden}

      Map.has_key?(params, :dir) and Map.get(params, :dir) not in 0..3 ->
        {:error, :bad_direction}

      action in [:move, :orient] and not Map.has_key?(params, :dir) ->
        {:error, :direction_required}

      true ->
        :ok
    end
  end

  defp validate_params(_action, _), do: {:error, :params_must_be_map}

  # Fisher-Yates permutation of `0..(n-1)` using the deterministic RNG.
  defp permutation(rng, n) do
    Enum.reduce((n - 1)..0//-1, {Enum.to_list(0..(n - 1)), rng, []}, fn _i, {pool, rng, acc} ->
      {idx, rng} = Determinism.uniform_int(rng, length(pool))
      {picked, rest} = List.pop_at(pool, idx)
      {rest, rng, [picked | acc]}
    end)
    |> then(fn {_pool, rng, acc} -> {acc, rng} end)
  end
end
