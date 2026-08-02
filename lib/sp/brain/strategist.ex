defmodule SP.Brain.Strategist do
  @moduledoc """
  The L2 strategic layer (§9 hierarchy) — the SAME discrete engine instanced a level
  up, running slower. L1 is the fast sensorimotor `SP.Brain.Factors` (the MC agent);
  L2 is a `Factors` whose hidden factor is the strategic SITUATION the agent is in and
  whose actions are strategic OPTIONS (forage/build/flee/socialize/rest).

      DOWN: the chosen option sets L1's empirical priors (its preferences `C`).
      UP:   a DIGEST of L1 — a single integer (the situation) — is L2's observation.

  This is also the architecture of the **two selves**: the *experiencing self* is L1's
  fast per-tick posterior `q(s_t|o_t)`; the *remembering self* is L2's slow posterior
  over the situation, integrated across many L1 digests. They genuinely differ — L1
  commits within a tick, L2 only after sustained evidence.

  The inter-level Markov blanket stays clean exactly as the body↔brain one does: only
  PRIMITIVES cross — an integer up, an option atom (+ a preference override) down.
  Never a live belief struct. L1 runs fine with no Strategist attached (graceful
  degradation); the strategist is an empirical-prior source, not a controller.
  """

  use GenServer

  alias SP.Brain.Factors

  @options [:forage, :build, :flee, :socialize, :rest]
  # situations L2 reasons over: 0 calm · 1 threatened · 2 depleted · 3 social · 4 idle
  @nsit 5

  defstruct [:l2, :config, options: @options]

  def options, do: @options

  # --- pure core (testable without the GenServer) ----------------------------

  @doc """
  Build an L2 strategist. `:config` maps option ⇒ %{l1_sub_index ⇒ C-override}.

  The situation likelihood is a fixed READOUT (the digest is a noisy reading of the
  situation — not learned), and the transition is STICKY (the situation has momentum),
  so the remembering self changes gradually: it tracks the recent regime, not the
  instant.
  """
  def new(opts \\ []) do
    l2 =
      Factors.new(
        [
          %{
            a: [near_identity(@nsit, 0.6)],
            b: option_transitions(),
            c: [[3.0, -3.0, -2.0, 0.0, 0.0]],
            d: List.duplicate(1.0, @nsit),
            learn_a: false
          }
        ],
        gamma: 8.0
      )

    %__MODULE__{l2: l2, config: Keyword.get(opts, :config, %{})}
  end

  @doc """
  UP message: summarise an L1 `Factors` into a single situation index — a primitive
  integer, never a struct. Reads the factor at `sub_index` and maps its self-model state
  to a situation; callers should pass the `:self` factor's index. The default (the LAST
  factor) is a fallback only — with a dedicated `:strategy` factor present the live agent
  instead lifts the observed situation directly (`SP.Brain.MC.situation_from_obs`).
  """
  def digest(%Factors{} = l1, sub_index \\ nil) do
    idx = sub_index || length(l1.subs) - 1
    self_to_situation(argmax(Enum.at(l1.subs, idx).qs))
  end

  @doc "L2 perceives a digest, learns, and picks the next strategic option (slow loop)."
  def step(%__MODULE__{} = s, situation) when is_integer(situation) do
    l2 = s.l2 |> Factors.infer_states([[situation]]) |> Factors.learn([[situation]])
    {idx, l2} = Factors.select_action(l2, :argmax)
    {Enum.at(@options, idx), %{s | l2: l2}}
  end

  @doc """
  DOWN message: apply a chosen option's empirical priors to L1 by overriding the
  preferences `C` of the configured factors. Returns the modulated L1.
  """
  def apply_context(%Factors{} = l1, option, config) do
    overrides = Map.get(config, option, %{})

    subs =
      l1.subs
      |> Enum.with_index()
      |> Enum.map(fn {sub, i} ->
        case Map.get(overrides, i) do
          nil -> sub
          c -> %{sub | c: [c]}
        end
      end)

    %{l1 | subs: subs}
  end

  @doc "The slow *remembering self*: L2's integrated belief over the strategic situation."
  def context_belief(%__MODULE__{l2: l2}), do: hd(Factors.beliefs(l2))

  # --- GenServer host (for live use; the colony can attach one per L1) --------

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts)

  @doc "Send L2 a digest; get back the chosen strategic option."
  def observe(pid, situation), do: GenServer.call(pid, {:observe, situation})

  @impl true
  def init(opts), do: {:ok, new(opts)}

  @impl true
  def handle_call({:observe, situation}, _from, s) do
    {option, s} = step(s, situation)
    {:reply, option, s}
  end

  def handle_call(:context_belief, _from, s), do: {:reply, context_belief(s), s}

  # --- helpers ---------------------------------------------------------------

  # situation readout likelihood (peaked at outcome == state) and sticky transition.
  defp near_identity(n, p) do
    off = (1.0 - p) / (n - 1)
    for s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: p, else: off))
  end

  # Each strategic option has a CHARACTERISTIC, gentle effect on the situation — a designed
  # strategic repertoire, exactly like the designed readout `a` and preferences `c`. Mostly
  # sticky (situations have momentum) with a 0.2 drift that RESOLVES the situation the option
  # is meant for. Gentle, so perception still tracks the observed situation (the slow
  # remembering self still concentrates), while the pragmatic EFE term cleanly differentiates
  # options: the one readout `a` makes the epistemic term identical across options, so any
  # transition asymmetry decides the argmax. situations: 0 calm·1 threatened·2 depleted·3 social·4 idle
  defp option_transitions do
    Enum.map(@options, fn
      :forage -> option_b(%{2 => 0, 4 => 0})
      :build -> option_b(%{4 => 0})
      :flee -> option_b(%{1 => 0})
      :socialize -> option_b(%{4 => 3})
      :rest -> option_b(%{2 => 0})
    end)
  end

  # One option's transition, COLUMN-MAJOR (`SP.Brain.Math` convention): the matrix is a
  # list of columns, outer index = SOURCE state, and `B·qs = Σ_j qs_j · col_j` predicts the
  # next state. So `col_cur` is source `cur`'s distribution over NEXT states. From a resolve
  # map `%{source => target}`: a resolved source drifts toward its target (0.6 stay · 0.25
  # target · 0.05 each other); every other source stays sticky (0.8 stay · 0.05 each other).
  # EVERY entry is strictly positive (≥ 0.05) because the forward prior is `(ln B)·s` (§16) —
  # a hard 0.0 would make `ln 0` poison the message. Each column already sums to 1.
  defp option_b(resolve) do
    for cur <- 0..(@nsit - 1) do
      case Map.get(resolve, cur) do
        t when is_integer(t) and t != cur ->
          for next <- 0..(@nsit - 1) do
            cond do
              next == cur -> 0.6
              next == t -> 0.25
              true -> 0.05
            end
          end

        _ ->
          for next <- 0..(@nsit - 1), do: if(next == cur, do: 0.8, else: 0.05)
      end
    end
  end

  # self-state {capable,strained,overloaded,seeking_help} → situation
  defp self_to_situation(0), do: 0
  defp self_to_situation(1), do: 2
  defp self_to_situation(2), do: 1
  defp self_to_situation(3), do: 2
  defp self_to_situation(_), do: 4

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
end
