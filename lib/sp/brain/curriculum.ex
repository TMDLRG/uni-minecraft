defmodule SP.Brain.Curriculum do
  @moduledoc """
  Curriculum-as-preferences (§14) and blindfolds (§15).

  Active inference has NO reward — "what to want" is a **prior over preferred
  outcomes** `C` (log-preferences). A curriculum is just a phase-indexed family of
  these priors, so "learning to play" stays inside the formalism:

      phase 0 survive · 1 get wood · 2 craft basics · 3 mine stone · 4 shelter/night

  A blindfold (§15) suppresses a sensory channel by zeroing its precision `γ_m`
  (or making its likelihood uniform) — used to test that the agent can cope when a
  sense is removed, and that it hasn't overfit to one modality.
  """

  # Outcome semantics per modality (index → meaning), used to place preferences.
  # status:    0 dying · 1 injured · 2 hungry · 3 safe
  # inventory: 0 empty · 1 has_wood · 2 has_tools · 3 has_food
  # vision:    0 void · 1 open · 2 tree · 3 water · 4 hazard · 5 enclosed
  # threat:    0 none · 1 near · 2 attacking
  # social: prefer kin nearby (outcome 1), be wary of outsiders (outcome 2) — a
  # principled cohesion DRIVE (a preference, not a script). Agents that can sense
  # kin (See Kin / See All) are thus drawn together; Blind agents are unaffected.
  @social %{1 => 2.5, 2 => -1.0}
  # self (U6): 0 capable · 1 strained · 2 overloaded · 3 seeking_help. A self-PRESERVATION
  # drive — prefer being capable, disprefer distress/criticality. This is a principled
  # preference over the agent's own inferred state, not a script.
  @self_pref %{0 => 3.0, 1 => -1.0, 2 => -5.0, 3 => -4.0}
  # METABOLISM (Phase 2): setpoint-peaked C for the interoceptive energy/satiety stores — PEAK at 'ok'/'sated'
  # (bin 2), FLAT at 'full'/'stuffed' (bin 3, so there is NO over-fill gradient — non-saturable in the
  # homeostatic sense), steeply dispreferred at 'empty' (bin 0). Action-independent; only queried for a
  # `:metabolism` genome (default factors never reference it ⇒ byte-identical). docs/specs/metabolism.md §4.1.
  @energy_setpoint %{0 => -8.0, 1 => -2.0, 2 => 3.0, 3 => 0.0}
  @satiety_setpoint %{0 => -8.0, 1 => -2.0, 2 => 3.0, 3 => 0.0}
  @phase_weights %{
    0 => %{
      status: %{3 => 4.0, 2 => -1.0, 1 => -3.0, 0 => -8.0},
      threat: %{0 => 3.0, 2 => -6.0},
      social: @social,
      self: @self_pref,
      energy: @energy_setpoint,
      satiety: @satiety_setpoint
    },
    1 => %{
      status: %{3 => 3.0, 0 => -8.0},
      vision: %{2 => 4.0},
      inventory: %{1 => 8.0},
      threat: %{0 => 3.0, 2 => -6.0},
      social: @social,
      self: @self_pref,
      energy: @energy_setpoint,
      satiety: @satiety_setpoint
    },
    2 => %{
      status: %{3 => 3.0, 0 => -8.0},
      inventory: %{1 => 4.0, 2 => 10.0},
      threat: %{0 => 3.0, 2 => -6.0},
      social: @social,
      self: @self_pref,
      energy: @energy_setpoint,
      satiety: @satiety_setpoint
    },
    3 => %{
      status: %{3 => 3.0, 0 => -8.0},
      vision: %{5 => 5.0},
      inventory: %{1 => 5.0, 2 => 12.0},
      threat: %{0 => 3.0, 2 => -6.0},
      sky: %{0 => 2.0},
      social: @social,
      self: @self_pref,
      energy: @energy_setpoint,
      satiety: @satiety_setpoint
    },
    # phase 4 = SURFACE shelter (the build-drive boost): an established UNI wants WALLS around it (vision
    # enclosed) but up on the SURFACE (open sky), so it satisfies "enclosed" by BUILDING a shelter here —
    # visible — instead of digging an enclosed hole to bedrock. Underground (enclosed sky) is now DISpreferred,
    # open/partial sky preferred, and it keeps wood+tools to build with. Mining itself is left fully emergent.
    4 => %{
      status: %{3 => 4.0, 0 => -10.0},
      vision: %{5 => 8.0, 4 => -6.0},
      threat: %{0 => 4.0, 2 => -8.0},
      sky: %{2 => 4.0, 1 => 1.0, 0 => -3.0},
      inventory: %{1 => 4.0, 2 => 4.0},
      social: @social,
      self: @self_pref,
      energy: @energy_setpoint,
      satiety: @satiety_setpoint
    }
  }

  # METABOLISM regulation gate (RED ablation). A monotone "more-is-better" SATURABLE foil for energy/satiety:
  # bin-0 still steeply dispreferred (the agent STILL eats/stays alive) but reward keeps RISING toward 'full'
  # (bin 3), so there is NO homeostatic setpoint peak. Isolates the non-saturable setpoint PEAK (spec §4.1 F8).
  @saturable_drive %{0 => -8.0, 1 => -2.0, 2 => 2.0, 3 => 4.0}

  # RESERVE-HOLDING INTERIOR-PEAK drive (Rung-1, docs/specs/rung1_graded_viability.md): the 6-state graded
  # viability gradient {0 critical·1 depleted·2 tired·3 nominal·4 sated·5 surplus}. Positive gradient
  # nominal→sated so refill pressure returns the instant belief slips below sated, with surplus(+2.0) <
  # sated(+2.5) so the argmax is an INTERIOR buffer bin (never the ceiling): bounded, non-hoarding,
  # non-saturable-at-the-edge. NOT the flat setpoint (the measured death) and NOT a monotone ramp (= the
  # saturable foil = reward-smuggling). This is the depth the single 4-bin setpoint scalar lacked.
  @reserve_ramp %{0 => -8.0, 1 => -3.0, 2 => -1.0, 3 => 1.0, 4 => 2.5, 5 => 2.0}

  # --- Rung-1 RED control/foil/factor shapes (lab-team SIGN-WITH-CHANGES, docs/receipts/rung1_graded_viability_RED.md
  # REVISION 1). All magnitude-matched to :reserve (floor -8.0, peak 2.5, span 10.5) so a FULL-vs-control contrast
  # is shape-only (no smuggled precision). Registered maps = the c_ok leak baseline.
  #
  # SATURABLE-6 foil: :reserve with bins 4,5 SWAPPED (surplus 2.5 > sated 2.0 ⇒ argmax at the CEILING bin 5) — the
  # honest "eat-to-full / hoard" contrast. The single-variable isolation of "interior peak vs ceiling peak" is a
  # literal permutation ⇒ magnitude parity is exact by construction.
  @saturable6 %{0 => -8.0, 1 => -3.0, 2 => -1.0, 3 => 1.0, 4 => 2.0, 5 => 2.5}
  # SETPOINT-6 baseline (the DEATH shape at 6-state cardinality): symmetric interior-center peak (bins 2,3) that
  # DISPREFERS surplus (bin 5 = -8) ⇒ won't hold a high reserve ⇒ thin buffer ⇒ reproduces the flat-setpoint death.
  # Subject to the A6 offline control-validity gate (must die in the ~6/12 band, not 0/12, not 12/12).
  @setpoint6 %{0 => -8.0, 1 => -1.0, 2 => 2.5, 3 => 2.5, 4 => -1.0, 5 => -8.0}
  # MUSCLE-FATIGUE own C (freshness bins fresh 5..spent 0): strong dispref at spent (bin 0), interior-peak rest-pull
  # (sated bin 4 = 2.5 > fully-fresh bin 5 = 2.0 ⇒ rests before spent, no over-rest). Numerically = :reserve but a
  # NAMED, independently-tunable vector (was accidentally reusing the energy shape).
  @fatigue_reserve %{0 => -8.0, 1 => -3.0, 2 => -1.0, 3 => 1.0, 4 => 2.5, 5 => 2.0}
  # SOMA-INTEGRITY C: MONOTONE non-decreasing to full health (bin 5) — a health factor has no "too healthy", so full
  # is best. NEVER the reserve interior-peak (which would prefer slightly-injured over full health — the wrong-signed
  # soma the embodiment lens flagged). Honestly scoped: soma is decorative in a peaceful world.
  @soma_monotone %{0 => -8.0, 1 => -4.0, 2 => -2.0, 3 => 0.0, 4 => 1.0, 5 => 2.0}

  @doc """
  The energy/satiety interoceptive C for a genome `drive_shape`, emitted at EVERY curriculum phase (so a phase
  advance cannot restore/overwrite an ablated shape — the RED single-variable guarantee). `:setpoint` returns
  exactly the phase-baked `@energy_setpoint` (byte-identical); `:saturable` the monotone foil; `:off` zeros.
  The 6-state `:setpoint6`/`:saturable6`/`:fatigue_reserve`/`:soma_monotone` are the Rung-1 RED control shapes.
  """
  def drive_c(:setpoint, no), do: for(i <- 0..(no - 1), do: Map.get(@energy_setpoint, i, 0.0))
  def drive_c(:saturable, no), do: for(i <- 0..(no - 1), do: Map.get(@saturable_drive, i, 0.0))
  def drive_c(:reserve, no), do: for(i <- 0..(no - 1), do: Map.get(@reserve_ramp, i, 0.0))
  def drive_c(:setpoint6, no), do: for(i <- 0..(no - 1), do: Map.get(@setpoint6, i, 0.0))
  def drive_c(:saturable6, no), do: for(i <- 0..(no - 1), do: Map.get(@saturable6, i, 0.0))
  def drive_c(:fatigue_reserve, no), do: for(i <- 0..(no - 1), do: Map.get(@fatigue_reserve, i, 0.0))
  def drive_c(:soma_monotone, no), do: for(i <- 0..(no - 1), do: Map.get(@soma_monotone, i, 0.0))
  def drive_c(:off, no), do: List.duplicate(0.0, no)

  @doc "Log-preference vector C for a modality at a curriculum phase (length `no`)."
  def preference(phase, modality, no) do
    weights = @phase_weights |> Map.get(phase, %{}) |> Map.get(modality, %{})
    for i <- 0..(no - 1), do: Map.get(weights, i, 0.0)
  end

  @doc "Highest implemented curriculum phase."
  def max_phase, do: @phase_weights |> Map.keys() |> Enum.max()

  @doc """
  Blindfold a factor of a `SP.Brain.Factors` model by zeroing its sensory
  precision — its observations stop influencing inference (prior-only).
  """
  def blindfold(%SP.Brain.Factors{} = fm, factor_index) do
    subs =
      List.update_at(fm.subs, factor_index, fn sub ->
        %{sub | gamma_m: Enum.map(sub.gamma_m, fn _ -> 0.0 end)}
      end)

    %{fm | subs: subs}
  end

  @doc "Uniform-likelihood blindfold: replace a factor's A with the maximally ambiguous one."
  def blind_likelihood(%SP.Brain.Factors{} = fm, factor_index) do
    subs =
      List.update_at(fm.subs, factor_index, fn sub ->
        a = Enum.map(sub.a, fn m -> uniform_like(m) end)
        %{sub | a: a}
      end)

    %{fm | subs: subs}
  end

  defp uniform_like(matrix) do
    no = length(hd(matrix))
    Enum.map(matrix, fn _col -> List.duplicate(1.0 / no, no) end)
  end
end
