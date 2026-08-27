defmodule SP.Brain.Designer do
  @moduledoc """
  The universal-builder front-end (§spec "Function Designer Card"). A **card** is a
  declarative description of a function — its sensory modalities, hidden causes,
  action set, preferences, precision rules and learning flags — and `compile/1`
  turns it into a runnable `SP.Brain.Factors` model. This generalises the genome:
  `SP.Brain.Genome.express/1` is now just `compile(Genome.card(dna))`, so the
  5-modality survival agent is simply *one card*, and any new function (a nociception
  reflex, a self-model, a strategic layer) is *another card* compiled the same way
  and checked by the same validation gates.

  A card:

      %{
        modalities:  [%{name: :nociception, no: 3, ns: 3}, ...],
        actions:     [:withdraw, :guard, :forward, ...],   # only the count matters
        preferences: %{nociception: %{0 => 2.0, 2 => -6.0}},  # sparse or dense C
        precision:   %{nociception: 1.0},                   # per-modality γ_m
        learn:       %{a: true, b: false},
        gamma: 8.0, horizon: 1
      }

  Each modality compiles to one factor with an UNINFORMATIVE likelihood (meaning is
  learned, never given), near-identity transitions ("states persist"), a uniform
  prior, and `C` from the card. We test ADEQUACY (does the compiled model behave as
  the card specifies?) — we never claim the card *is* the biological function.
  """

  alias SP.Brain.Factors

  @doc "Compile a declarative Function-Card into a runnable `SP.Brain.Factors` model."
  def compile(card) do
    actions = Map.fetch!(card, :actions)
    nu = length(actions)
    eat_idx = Enum.find_index(actions, &(&1 == :eat))
    gamma = Map.get(card, :gamma, 8.0)
    horizon = Map.get(card, :horizon, 1)
    learn = Map.get(card, :learn, %{})
    learn_a = Map.get(learn, :a, true)
    learn_b = Map.get(learn, :b, false)
    novelty_gain = Map.get(card, :novelty_gain, 0.0)
    prefs = Map.get(card, :preferences, %{})
    prec = Map.get(card, :precision, %{})

    specs =
      Enum.map(Map.fetch!(card, :modalities), fn mod ->
        %{
          a: [likelihood(Map.get(mod, :init_a), mod.no, mod.ns)],
          b: transition(Map.get(mod, :b_init), mod.ns, nu, eat_idx),
          c: [preference_vector(Map.get(prefs, mod.name), mod.no)],
          d: List.duplicate(1.0, mod.ns),
          gamma_m: [Map.get(prec, mod.name, 1.0)],
          learn_a: learn_a,
          learn_b: Map.get(mod, :learn_b, learn_b),
          novelty_gain: novelty_gain,
          pb_seed: Map.get(mod, :pb_seed, 1.0),
          # HONEST CONSUMMATION (Cure-2, gated): a modality carrying :couple threads the data the Plan rollout needs
          # to mix its :eat column with a fixed DRAIN column by the parent has_food belief. Absent :couple ⇒ nil ⇒
          # the Plan takes the verbatim byte-identical path. B_hi is the live learned `b` (not recompiled here, C3).
          couple: couple_spec(Map.get(mod, :couple), mod.ns, eat_idx)
        }
      end)

    Factors.new(specs, gamma: gamma, horizon: horizon)
  end

  # {parent_index, parent_state, eat_idx, drain_col}: the plan-time coupling payload. `drain_col` is the FIXED
  # drain matrix (the world-true eat-on-empty ≡ noop transition, immune to a muddied learned marginal); B_hi stays
  # the live learned `b`. nil ⇒ no coupling (no :couple, or a genome without :eat).
  defp couple_spec(nil, _ns, _eat_idx), do: nil
  defp couple_spec(_couple, _ns, nil), do: nil

  defp couple_spec(%{parent_index: p, parent_state: s}, ns, eat_idx),
    do: %{parent_index: p, parent_state: s, eat_idx: eat_idx, drain_col: drain_matrix(ns)}

  # Likelihood prior selector. Default (`nil`) ⇒ the UNINFORMATIVE uniform likelihood (exteroception:
  # meaning is learned, never given). `:diagonal` ⇒ a near-identity PROPRIOCEPTIVE prior — see below.
  # `{:prior_draw, name, domain}` ⇒ a DRAW from that same uninformative prior rather than its mean
  # (the frozen-factor repair, gated off by default at `Genome.exteroceptive_a_init`) — see below.
  defp likelihood({:prior_draw, name, domain}, no, ns), do: prior_draw_likelihood(name, domain, no, ns)
  defp likelihood(:diagonal, no, ns), do: diagonal_likelihood(no, ns)
  defp likelihood(_uniform, no, ns), do: uniform_likelihood(no, ns)

  @doc "Uninformative likelihood: `ns` columns, each uniform over `no` outcomes."
  def uniform_likelihood(no, ns), do: for(_ <- 1..ns, do: List.duplicate(1.0 / no, no))

  @doc """
  Near-identity likelihood for PROPRIOCEPTION: hidden configuration-state `k` tends to produce sensed
  outcome `k` (the body senses its OWN configuration, unlike exteroception where the state↔outcome mapping
  must be learned from a uniform start). A WEAK diagonal prior (0.6 on the diagonal) — it only breaks the
  otherwise-degenerate uniform-`A` symmetry so the motor configuration is *identifiable*; online learning
  still refines the true likelihood. Used only by `:init_a => :diagonal` modalities (the motor cortex).
  """
  def diagonal_likelihood(no, ns) do
    hi = 0.6
    lo = (1.0 - hi) / (no - 1)

    for s <- 0..(ns - 1) do
      d = min(s, no - 1)
      for o <- 0..(no - 1), do: if(o == d, do: hi, else: lo)
    end
  end

  @doc """
  A DRAW from the uninformative likelihood prior, one per state-column:

      Â₀[:,s] ~ Dir(κ·1_{n_o}),   κ = 1.0

  **This changes no prior.** `uniform_likelihood/2` evaluates the MEAN of exactly this symmetric
  Dirichlet, `E[Â₀] = 1/n_o`, and the mean is precisely the one point in the simplex that EVERY
  permutation of the hidden states fixes. With identical A-columns, identity B and uniform D the whole
  parameter set is S_ns-invariant, and every update rule reads state-indexed VALUES and never a state
  INDEX — so the update map is S_ns-equivariant and `q(s)` stays uniform forever, as a matter of group
  theory (`docs/whiteboard/DEFECTS-AND-REPAIRS.md` §2; measured `max|qᵢ−qⱼ|` ≈ 4e-16). Sampling the
  prior instead of evaluating its mean leaves `E[pA]` byte-identical and only stops the REALISATION
  sitting on the symmetric point.

  κ = 1.0 is IMPOSED twice over: it is the same `+1` that `SP.Brain.Model.add1/1` adds to seed `pA`,
  and it is the unique κ with a closed form — Gamma(1,1) = Exp(1), so `x_o = −ln u_o` and
  `col = x/Σx`. Branch-free, no rejection loop, exactly one uniform per cell.

  DETERMINISTIC: seeded from `SP.Determinism` (SplitMix64) on `domain <> name`, never `:rand` and
  never the wall clock, so the draw is a pure function of a committed string and reproduces bit-exactly
  from a clean clone. The seed is per-(domain, factor-name) — i.e. per LINEAGE, not per agent — which
  is what makes the covenant falsifier (a second domain must give the same behaviour) checkable at all.
  The log is floored at `1.0e-16` to match `SP.Brain.Math`'s ε, bounding `x_o` at 36.84.
  """
  def prior_draw_likelihood(name, domain, no, ns) do
    rng = SP.Determinism.new(domain <> Atom.to_string(name))

    {cols, _rng} =
      Enum.map_reduce(1..ns//1, rng, fn _s, rng ->
        {us, rng} = SP.Determinism.floats(rng, no)
        x = Enum.map(us, fn u -> -:math.log(max(u, 1.0e-16)) end)
        z = Enum.sum(x)
        {Enum.map(x, &(&1 / z)), rng}
      end)

    cols
  end

  @doc "Identity transition: a \"states persist\" prior over `n` states."
  def identity(n), do: for(s <- 0..(n - 1), do: for(o <- 0..(n - 1), do: if(o == s, do: 1.0, else: 0.0)))

  # Per-action transition prior for a modality. `nil` ⇒ identity ("states persist") on every action — the
  # default, byte-identical path (`List.duplicate(identity(ns), nu)`, the exact prior code). `:emptying` ⇒
  # the metabolism organ's interoceptive store: every NON-`:eat` action DRAINS the level one step toward
  # `empty` (the internal upkeep — B2=Both, "no free hold"), and `:eat` REFILLS toward `full`. Column-major,
  # column-stochastic; seeded as a STRONG Dirichlet prior via the modality's `:pb_seed` (Model.new).
  def transition(nil, ns, nu, _eat_idx), do: List.duplicate(identity(ns), nu)

  def transition(:emptying, ns, nu, eat_idx) do
    drain = drain_matrix(ns)
    fill = fill_matrix(ns)
    for u <- 0..(nu - 1), do: if(u == eat_idx, do: fill, else: drain)
  end

  # drain: column j ⇒ 0.85 STAY at j, 0.15 drift to j-1 — a SLOW downward drift matching the actual store
  # rate (upkeep 0.04/tick, 1 bin = 0.25 ⇒ ~1 bin per ~6 ticks). A faster modelled drain makes the depth-5
  # planner believe `empty` is imminent and over-eat to buffer (no limit-cycle); the slow drift lets it rest
  # near the setpoint and eat only when genuinely low. `empty` (j=0) is absorbing (max(j-1,0)=0).
  defp drain_matrix(ns) do
    for j <- 0..(ns - 1), do: two_mass(ns, j, max(j - 1, 0), 0.85, 0.15)
  end

  # fill (:eat): column j ⇒ 0.7 at min(j+2, ns-1), 0.3 at min(j+1, ns-1) (refill toward `full`).
  defp fill_matrix(ns) do
    for j <- 0..(ns - 1), do: two_mass(ns, min(j + 2, ns - 1), min(j + 1, ns - 1), 0.7, 0.3)
  end

  # one column of length ns: `hi` mass at row t1, `lo` at row t2 (masses ADD if t1 == t2 ⇒ stays stochastic).
  defp two_mass(ns, t1, t2, hi, lo) do
    for i <- 0..(ns - 1), do: if(i == t1, do: hi, else: 0.0) + if(i == t2, do: lo, else: 0.0)
  end

  # A preference C over `no` outcomes: nil ⇒ neutral; a dense list ⇒ used as-is; a
  # sparse %{outcome_idx => weight} map ⇒ expanded (0.0 default).
  defp preference_vector(nil, no), do: List.duplicate(0.0, no)
  defp preference_vector(v, _no) when is_list(v), do: v
  defp preference_vector(m, no) when is_map(m), do: for(i <- 0..(no - 1), do: Map.get(m, i, 0.0))
end
