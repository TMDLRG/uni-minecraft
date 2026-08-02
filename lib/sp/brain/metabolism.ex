defmodule SP.Brain.Metabolism do
  @moduledoc """
  Live interoceptive metabolic dynamics for the `:metabolism` organ (`docs/specs/metabolism.md` §2.1, owner
  ruling B2=BOTH). PURE functions over an internal energy/satiety STORE that the live `SP.Brain.Bridge`
  maintains on its GenServer state — the body cannot externally sense its own ATP store, so the bridge
  synthesises the interoceptive observation and injects it into the senses the codec reads.

  Every tick the store DRAINS by an internal upkeep (`@upkeep`, applied to EVERY action — the "no free hold"
  that makes the homeostatic limit-cycle exist) plus an extra debit for COSTLY actions (`@work`). `:eat`
  REFILLS it, but ONLY when the live MC food channel actually has food (`inv.food > 0`) — so foraging food is
  metabolically NECESSARY, not optional. At `empty` the agent DIES (the bridge persists memory and lets the
  process stop, closing the body Port — the OODA loop ceases).

  This is the REAL viability edge that makes the action-severed-twin gate (G5b) bite: an all-`:noop` twin pays
  upkeep, can never forage food to refill, and drains to death; an acting UNI forages and survives.

  CLAIM FENCE: `energy`/`satiety` are model variables, NEVER felt states. This is homeostatic
  self-maintenance — self-maintenance, never life-as-experience. The floats are never surfaced as hunger.
  """

  # Per-tick rates (RED-tunable parameters; pinned here as the Phase-2 defaults).
  @upkeep 0.04
  @work 0.04
  @eat_refill 0.5
  @satiety_decay 0.02
  @satiety_refill 0.4
  # COSTLY actions debit extra energy (locomotion + mining + combat). :noop/:eat/:place/:craft = upkeep only.
  @costly [:forward, :turn_left, :turn_right, :mine, :jump, :attack]

  @doc "Tunable rates (declared for the falsification ledger / the RED amplitude sweep, F5)."
  def rates,
    do: %{
      upkeep: @upkeep,
      work: @work,
      eat_refill: @eat_refill,
      satiety_decay: @satiety_decay,
      satiety_refill: @satiety_refill
    }

  @doc "Discretise a store level in [0,1] to a 4-bin interoceptive outcome — 0 empty · 1 low · 2 ok · 3 full."
  def bin(level) when level <= 0.0, do: 0
  def bin(level), do: min(trunc(level * 4.0), 3)

  @doc "Inject the (already-discretised) energy/satiety levels into the senses map the codec reads."
  def inject(senses, energy, satiety) do
    senses |> Map.put("energy", bin(energy)) |> Map.put("satiety", bin(satiety))
  end

  # One abstract metabolic "tick" = this many wall-clock seconds. The drain rates above are per-abstract-tick;
  # the LIVE Agent steps far faster than one tick/sec (~350 ms), so it passes the elapsed `dt` seconds and the
  # drain scales by `dt / @nominal_tick_sec` — the viability edge is thus WALL-CLOCK-based and cadence-INDEPENDENT
  # (immune to the world's step rate). `dt = nil` (the offline/abstract caller) ⇒ frac = 1.0 ⇒ byte-identical to
  # the per-tick model, so every offline gate + test is unchanged.
  @nominal_tick_sec 8.0

  @doc """
  Advance the store given the chosen `action` and the live `senses`. Returns `{energy, satiety}` clamped to
  [0,1]. Drain (upkeep + costly-action work) scales by wall-clock `dt` (seconds); `:eat` refills ONLY with food
  (an event, not time-scaled). `dt = nil` ⇒ one abstract tick (frac 1.0), preserving the offline dynamics.
  """
  def step(energy, satiety, action, senses, dt \\ nil) do
    frac = if is_number(dt) and dt > 0.0, do: dt / @nominal_tick_sec, else: 1.0
    eat? = action == :eat and food_available?(senses)
    drain = (@upkeep + if(action in @costly, do: @work, else: 0.0)) * frac
    e = clamp(energy - drain + if(eat?, do: @eat_refill, else: 0.0))
    sa = clamp(satiety - @satiety_decay * frac + if(eat?, do: @satiety_refill, else: 0.0))
    {e, sa}
  end

  @doc "The nominal wall-clock seconds per abstract metabolic tick (drain is scaled by dt/this live)."
  def nominal_tick_sec, do: @nominal_tick_sec

  @doc "Dead when the energy store is empty — the bridge then persists memory and stops (the body Port closes)."
  def dead?(energy), do: energy <= 0.0

  # --- B3: satiety -> C appetite attenuation (docs/specs/metabolism.md §4.2) -------------------------------
  # A DECLARED multiplicative map in [0,1]: high satiety down-weights APPETITIVE (positive-lobe) preference so
  # a sated agent forages/refills less. NEVER touches the depletion penalties (negative C) or the protective
  # blacklist factors (self/social/status/threat) — a sated agent is less hungry, never suicidal.
  @satiety_atten %{0 => 1.0, 1 => 1.0, 2 => 0.6, 3 => 0.3}

  @doc "The appetite multiplier ∈ [0,1] for a believed satiety level (0 starving .. 3 stuffed)."
  def satiety_multiplier(level), do: Map.get(@satiety_atten, level, 1.0)

  @doc "Attenuate ONLY the positive (appetitive) lobe of a C vector by `m`; negatives (depletion penalties) and zeros are untouched."
  def attenuate_appetite(c_vec, m), do: Enum.map(c_vec, fn x -> if x > 0.0, do: x * m, else: x end)

  @doc """
  Apply satiety->C attenuation to a model: scale the positive lobe of the ENERGY and SATIETY factors' C by the
  appetite multiplier for the current believed satiety level. A no-op (byte-identical) when there is no satiety
  factor. Action-independent; the live `SP.Brain.MC.modulate` applies it before policy eval and `demodulate`
  strips it back to the genome baseline (zero persisted bytes).
  """
  def attenuate_model(model, _energy_idx, nil), do: model

  def attenuate_model(model, energy_idx, satiety_idx) do
    level = model.subs |> Enum.at(satiety_idx) |> Map.fetch!(:qs) |> argmax()
    m = satiety_multiplier(level)
    targets = Enum.filter([energy_idx, satiety_idx], &is_integer/1)

    subs =
      model.subs
      |> Enum.with_index()
      |> Enum.map(fn {sub, i} ->
        if i in targets, do: %{sub | c: Enum.map(sub.c, &attenuate_appetite(&1, m))}, else: sub
      end)

    %{model | subs: subs}
  end

  defp argmax(v), do: v |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)

  # the live MC food channel: does the body have food to eat? (inv.food > 0)
  defp food_available?(senses) do
    inv = Map.get(senses, "inv", Map.get(senses, :inv, %{}))
    (Map.get(inv, "food", Map.get(inv, :food, 0)) || 0) > 0
  end

  defp clamp(x), do: x |> max(0.0) |> min(1.0)
end
