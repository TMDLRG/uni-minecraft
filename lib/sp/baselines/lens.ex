defmodule SP.Baselines.Lens do
  @moduledoc """
  Engineering/debug-only semantic decoder for the scripted validation baselines.

  This module deliberately uses the channel map's inverse (`SP.Interface.reveal_*`)
  to recover semantics from an opaque observation. That is allowed ONLY because
  these baselines exist for harness validation — to demonstrate the world is
  navigable and that morphology/senses matter. **A real learner must never use
  this.** The blind baselines (`Random`, `LeakageProbe`) do not.
  """

  alias SP.Core.Directive.Actuate
  alias SP.Determinism
  alias SP.Interface
  alias SP.Interface.ChannelMap

  @doc "Recover `%{{source, key} => raw_value}` from an opaque observation."
  @spec semantic(ChannelMap.t(), %{non_neg_integer() => float()}) :: %{term() => float()}
  def semantic(%ChannelMap{} = cm, obs) do
    Map.new(obs, fn {channel, value} ->
      feature = Interface.reveal_channel(cm, channel)
      {scale, offset} = Map.get(cm.affine, channel, {1.0, 0.0})
      {feature, (value - offset) / scale}
    end)
  end

  @spec get(map(), String.t(), term(), number()) :: number()
  def get(sem, source, key, default \\ 0.0), do: Map.get(sem, {source, key}, default)

  @doc "Whether a sensor source is present in the semantic view."
  @spec has_source?(map(), String.t()) :: boolean()
  def has_source?(sem, source), do: Enum.any?(sem, fn {{s, _k}, _v} -> s == source end)

  @doc "Build an opaque actuation directive for `action` with relative `params`."
  @spec act(ChannelMap.t(), atom(), map()) :: Actuate.t()
  def act(%ChannelMap{action_to_channel: a2c}, action, params \\ %{}) do
    %Actuate{channel: Map.fetch!(a2c, action), params: params}
  end

  @doc """
  Core foraging navigation, using whatever senses are available:

    * with **distal plume** sensing — climb the nutrient gradient, avoiding the
      toxin gradient (directed search);
    * else with **proximal chemotactile** sensing — run-and-tumble chemotaxis:
      stay put to exploit a good, safe cell; tumble (random move) off a depleted
      or hazardous one;
    * else — undirected wander.

  Returns `{[directive], rng}`.
  """
  @spec feed_or_explore(ChannelMap.t(), map(), Determinism.t()) :: {[Actuate.t()], Determinism.t()}
  def feed_or_explore(cm, sem, rng) do
    cond do
      has_source?(sem, "sensor:plume") ->
        nut_dir = round(get(sem, "sensor:plume", :nutrient_dir, -1))
        tox_dir = round(get(sem, "sensor:plume", :toxin_dir, -1))
        tox_grad = get(sem, "sensor:plume", :toxin_gradient, 0.0)

        cond do
          nut_dir < 0 -> chemotaxis(cm, sem, rng)
          nut_dir == tox_dir and tox_grad > 0.1 -> wander(cm, rng)
          true -> {[act(cm, :move, %{dir: clamp_dir(nut_dir)})], rng}
        end

      has_source?(sem, "sensor:chemotactile") ->
        chemotaxis(cm, sem, rng)

      true ->
        wander(cm, rng)
    end
  end

  # Run-and-tumble: exploit a good safe cell, tumble off a poor/hazardous one.
  defp chemotaxis(cm, sem, rng) do
    attract = get(sem, "sensor:chemotactile", :attractant, 0.0)
    irritation = get(sem, "sensor:chemotactile", :irritation, 0.0)

    if irritation > 0.2 or attract < 0.25 do
      wander(cm, rng)
    else
      {[act(cm, :orient, %{dir: 0})], rng}
    end
  end

  @doc "Pick a uniformly random valid action channel with a random direction."
  @spec wander(ChannelMap.t(), Determinism.t()) :: {[Actuate.t()], Determinism.t()}
  def wander(cm, rng) do
    {dir, rng} = Determinism.uniform_int(rng, 4)
    {[act(cm, :move, %{dir: dir})], rng}
  end

  defp clamp_dir(d) when d in 0..3, do: d
  defp clamp_dir(_), do: 0
end
