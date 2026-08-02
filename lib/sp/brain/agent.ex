defmodule SP.Brain.Agent do
  @moduledoc """
  An active-inference learner that satisfies the pure `SP.Agent` contract — the
  first time the brain *acts* end-to-end inside the real, leakage-audited `SP.Sim`.

  It is FAITHFUL by construction: `decide/3` reads only the opaque observation and
  never touches `context.channel_map`, so it runs unchanged in `faithful?: true`
  episodes (where no channel map is even provided). It builds one hidden-state
  factor per opaque sensory channel (lazily, as channels appear), perceives by
  minimising variational free energy, learns its likelihood/transition model by
  Dirichlet accumulation, and acts by minimising expected free energy. With no
  preferences set (`C = 0`) the only drive is the EPISTEMIC term — pure curiosity:
  it acts to reduce uncertainty about what its senses mean and what its (initially
  meaningless) actions do.
  """
  @behaviour SP.Agent

  alias SP.Brain.{Codec, Infer, Learn}
  alias SP.Core.Directive.Actuate
  alias SP.Determinism, as: Det

  @impl true
  def init(opts) do
    %{
      channels: %{},
      rng: Det.new(Keyword.get(opts, :seed, 1)),
      n_actions: length(SP.Interface.action_catalogue()),
      n_bins: Keyword.get(opts, :n_bins, 4),
      n_states: Keyword.get(opts, :n_states, 4),
      gamma: Keyword.get(opts, :gamma, 8.0)
    }
  end

  @impl true
  def decide(obs, state, _ctx) when map_size(obs) == 0 do
    # No senses active yet — emit a harmless probe and wait for a sensorium.
    {dir, rng} = Det.uniform_int(state.rng, 4)
    {[%Actuate{channel: 0, params: %{dir: dir}}], %{state | rng: rng}}
  end

  def decide(obs, state, _ctx) do
    # 1. Perceive + learn, one factor per opaque sensory channel.
    present =
      Enum.map(obs, fn {ch, value} ->
        model =
          Map.get(state.channels, ch) ||
            Codec.channel_model(state.n_bins, state.n_states, state.n_actions, gamma: state.gamma)

        o = Codec.bin(value, state.n_bins)
        {ch, model |> Infer.infer_states([o]) |> Learn.learn([o])}
      end)

    models = Enum.map(present, &elem(&1, 1))

    # 2. Act by minimising expected free energy (sampled ⇒ exploratory/curious).
    p_u = Codec.action_distribution(models, state.gamma)
    {action, rng} = Codec.sample(p_u, state.rng)
    {dir, rng} = Det.uniform_int(rng, 4)

    # 3. Commit the chosen action so next tick's prior + transition-learning use it.
    channels =
      Enum.reduce(present, state.channels, fn {ch, m}, acc ->
        Map.put(acc, ch, %{m | last_action: action})
      end)

    {[%Actuate{channel: action, params: %{dir: dir}}], %{state | channels: channels, rng: rng}}
  end
end
