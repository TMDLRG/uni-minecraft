defmodule SP.Brain.Homeostat do
  @moduledoc """
  Graded per-subsystem viability BODY for the `:homeostat` organ (Rung-1, `docs/specs/rung1_graded_viability.md`).

  The depth the single 4-bin `:metabolism` scalar lacked. The mind cannot externally sense its own subsystem
  stores, so — exactly like `SP.Brain.Metabolism` for the frozen `:metabolism` organ — the live runtime
  maintains continuous per-subsystem stores here, advances them each tick with **acted-subsystem attribution**
  (mining/attacking loads the ARM, moving loads the LEGS, an upkeep debits the CORE on EVERY action incl.
  `:noop` — the "no free hold" that makes the viability edge bite), discretises each to the 6-bin graded
  viability gradient **{0 critical · 1 depleted · 2 tired · 3 nominal · 4 sated · 5 surplus}**, and injects them
  as `felt_*` observations the codec reads. Death = the core ATP store empties.

  STAGED: this step holds the CORE `energy` store (with attribution scaffolding). `gut`, `soma`, and per-limb
  `fatigue` land in the later rung-1 steps; the struct + `step/4` are written to grow into them.

  CLAIM FENCE: every store is a MODEL VARIABLE, never a felt state — homeostatic self-maintenance, never
  life-as-experience. No float is ever surfaced as felt hunger/tiredness.
  """

  # Per-tick rates (RED-tunable; declared for the falsification ledger / amplitude sweep). Core drain mirrors
  # the Phase-2 `Metabolism` defaults so the reserve contrast is a shape change, not a rate change.
  @upkeep 0.04
  @work 0.04
  # ENERGY is directly eat-refilled (so the reserve-C agent can hold it at an INTERIOR bin by choosing WHEN to
  # eat — the discriminator from the saturable foil, which eats to full). GUT is an independent satiety buffer:
  # eat-filled, drained by slow passage (hunger returns) — NOT work-drained — so gut and energy DISSOCIATE via
  # different drain drivers (work vs passage). [A body-side gut→energy digestion transfer is a deferred
  # refinement — with fast digestion it pins energy full, blurring reserve↔saturable; needs joint conditioning.]
  @eat_refill 0.4
  @gut_refill 0.4
  @gut_empty 0.03
  # SOMA integrity (health channel): damaged by a hurt event, heals slowly. Honestly scoped: FLAT in a
  # peaceful world (no damage) ⇒ decorative there; only validated where the streamed MC health channel varies.
  @soma_heal 0.02
  @soma_damage 0.2
  @nominal_tick_sec 8.0
  # MUSCLE FATIGUE (the arm gets tired): arm-loading actions SPEND freshness; any other action RECOVERS it.
  # The fatigue store is `freshness` ∈ [0,1] (1 fresh · 0 spent) on a FASTER clock than energy (tires/recovers
  # quicker) — the first per-factor timescale split (yuga). Fatigue lowers the motor loop gain (Step 4b).
  @fatigue_spend 0.06
  @fatigue_recover 0.03
  @fatigue_tick_sec 3.0
  @arm_actions [:mine, :attack]
  # COSTLY actions debit extra CORE energy (locomotion/mining/combat load — acted-subsystem attribution).
  @costly [:forward, :turn_left, :turn_right, :mine, :jump, :attack]

  # metab_scale: the NURSERY developmental runway (runtime-only, opt-in). 1.0 (default) ⇒ pure-world physics ⇒
  # byte-identical (`core_drain * 1.0` is bit-exact for finite floats). 0 < s < 1 slows CORE-energy drain s×,
  # buying an altricial UNI time to LEARN foraging before starvation — the WOMB/WEAN period. Set from the genome
  # `nursery: %{scale: s}` at spawn (agent nursery_scale/1); dropped at graduation.
  defstruct energy: 1.0, gut: 0.5, soma: 1.0, fatigue: 1.0, metab_scale: 1.0

  @type t :: %__MODULE__{energy: float(), gut: float(), soma: float(), fatigue: float(), metab_scale: float()}

  @doc "A fresh body. energy full (settles to the reserve band), gut mid, soma full, muscles fresh."
  def new(opts \\ []) do
    %__MODULE__{
      energy: Keyword.get(opts, :energy, 1.0),
      gut: Keyword.get(opts, :gut, 0.5),
      soma: Keyword.get(opts, :soma, 1.0),
      fatigue: Keyword.get(opts, :fatigue, 1.0),
      metab_scale: Keyword.get(opts, :metab_scale, 1.0)
    }
  end

  @doc "Tunable rates (for the RED amplitude sweep / falsification ledger)."
  def rates,
    do: %{
      upkeep: @upkeep,
      work: @work,
      eat_refill: @eat_refill,
      gut_refill: @gut_refill,
      gut_empty: @gut_empty
    }

  @doc "Nominal wall-clock seconds per abstract tick (drain scales by dt/this live; dt=nil ⇒ one abstract tick)."
  def nominal_tick_sec, do: @nominal_tick_sec

  @doc """
  Discretise a store level in [0,1] to the 6-bin graded viability outcome
  **{0 critical · 1 depleted · 2 tired · 3 nominal · 4 sated · 5 surplus}**. `<=0` ⇒ critical.
  """
  def bin6(level) when level <= 0.0, do: 0
  def bin6(level), do: min(trunc(level * 6.0), 5)

  @doc """
  Advance the body given the chosen `action`, live `senses`, and wall-clock `dt` (seconds; `nil` ⇒ one abstract
  tick, frac 1.0, so offline dynamics are exact). Per-subsystem, acted-attribution:
  - CORE `energy`: drains by upkeep (every action, incl. `:noop`) + work (costly actions); `:eat` refills it.
  - `gut`: `:eat` fills the satiety buffer; slow passage empties it — dissociates from energy (not work-drained).
  - `soma`: a hurt event damages it; heals slowly.  - `fatigue`: arm actions spend, rest recovers (faster clock).
  Returns the new `%Homeostat{}`.
  """
  def step(%__MODULE__{} = b, action, senses, dt \\ nil, severed \\ []) do
    frac = if is_number(dt) and dt > 0.0, do: dt / @nominal_tick_sec, else: 1.0

    # SEVERED LIMBS (Rung-1 review Group E): cut a factor's AFFERENT world→store coupling. A generative-PROCESS
    # edit — the store still drains + `inject`/`bin6` still emit its felt obs, but it stops reading its world
    # channel (eat/hurt/work). `severed == []` (default) ⇒ every guard is true ⇒ byte-identical to the pre-review
    # step. The severed-limb falsifier: if a severed twin is indistinguishable on the LIVE world from intact, the
    # factor is a preference-hack with no world limb.
    eat_world? = action == :eat and food_available?(senses)
    energy_eat? = eat_world? and :energy_reserve not in severed
    gut_eat? = eat_world? and :gut_satiety not in severed
    hurt? = hurt?(senses) and :soma_integrity not in severed
    arm_action? = action in @arm_actions and :muscle_fatigue not in severed

    # CORE energy: upkeep (every action) + work (costly) drain; :eat refills directly (with food, limb intact).
    # NURSERY runway (metab_scale): default 1.0 ⇒ `* 1.0` is bit-exact ⇒ byte-identical; 0<s<1 slows the drain s×.
    core_drain = (@upkeep + if(action in @costly, do: @work, else: 0.0)) * frac * b.metab_scale
    energy = clamp(b.energy - core_drain + if(energy_eat?, do: @eat_refill, else: 0.0))

    # GUT satiety: :eat fills it; slow passage empties it (hunger returns) — NOT work-drained, so it dissociates
    # from energy (which IS work-drained). The two subsystems decouple via their different drain drivers.
    gut = clamp(b.gut - @gut_empty * frac + if(gut_eat?, do: @gut_refill, else: 0.0))

    soma = clamp(b.soma - if(hurt?, do: @soma_damage, else: 0.0) + @soma_heal * frac)

    # MUSCLE FATIGUE (faster clock): arm actions spend freshness, everything else recovers it.
    ffrac = if is_number(dt) and dt > 0.0, do: dt / @fatigue_tick_sec, else: 1.0
    dfat = if(arm_action?, do: -@fatigue_spend, else: @fatigue_recover) * ffrac
    fatigue = clamp(b.fatigue + dfat)

    %{b | energy: energy, gut: gut, soma: soma, fatigue: fatigue}
  end

  @doc "Inject the graded `felt_*` interoceptive observations (energy/gut/soma/fatigue) the codec reads."
  def inject(senses, %__MODULE__{} = b) do
    senses
    |> Map.put("energy_reserve", bin6(b.energy))
    |> Map.put("gut_satiety", bin6(b.gut))
    |> Map.put("soma_integrity", bin6(b.soma))
    |> Map.put("muscle_fatigue", bin6(b.fatigue))
    # continuous motor loop-gain for the motor cortex (Step 4b): a tired arm aims worse. Read by MC.motor_ctrl.
    |> Map.put("motor_pi", motor_pi(b))
  end

  @doc """
  The motor loop-gain multiplier for the current muscle freshness (Step 4b coupling). Fresh (1.0) ⇒ full gain
  1.0; fully spent (0.0) ⇒ ~0.35 (a weaker/slower servo). Linear in freshness. A genuine world consequence:
  a tired arm aims worse (degraded reafference) — the falsifier that fatigue is not decorative.
  """
  def motor_pi(%__MODULE__{fatigue: f}), do: 0.35 + 0.65 * clamp(f)
  def motor_pi(f) when is_number(f), do: 0.35 + 0.65 * clamp(f)

  @doc "Dead when the core ATP store empties OR the soma/health integrity store hits 0 (a critical organ failed)."
  def dead?(%__MODULE__{energy: e, soma: s}), do: e <= 0.0 or s <= 0.0

  # a hurt event on the live MC health channel (the body sends "hurt" as a bool).
  defp hurt?(senses), do: Map.get(senses, "hurt", Map.get(senses, :hurt, false)) in [true, 1, "true"]

  # the live MC food channel: does the body have food to eat? (inv.food > 0)
  defp food_available?(senses) do
    inv = Map.get(senses, "inv", Map.get(senses, :inv, %{}))
    (Map.get(inv, "food", Map.get(inv, :food, 0)) || 0) > 0
  end

  defp clamp(x), do: x |> max(0.0) |> min(1.0)
end
