defmodule SP.Lab.Bioenergetics do
  @moduledoc """
  Chemiosmosis: the proton-motive force and an ATP free-energy proxy, plus a configurable
  cell-viability rule that does NOT bake oxygen in as a requirement for all life.

  ## Formulae (evidence class A/B)

      Δp = Δψ − (2.303·R·T / F)·ΔpH        proton-motive force (mV)
      ΔG_ATP ≈ n·F·Δp                      free energy available from n translocated protons

  `F = 96485 C·mol⁻¹` (Faraday, class A). `R = 8.314 J·mol⁻¹·K⁻¹`. The Nernst slope
  `2.303·R·T/F ≈ 59 mV` per pH unit at 298 K. Mitchell's chemiosmotic theory (Nobel 1978,
  evidence class B) established proton/electron gradients as the basis of ATP synthesis;
  oxygen is an exceptionally strong terminal electron acceptor (E°' ≈ +0.82 V).

  ## The honest fence

  Oxygen and ozone are **not "life itself."** Proton gradients are foundational to known
  bioenergetics (class B), but the requirement for O₂ is **not universal**: anaerobic and
  non-oxygenic metabolisms exist, and life on Earth predates atmospheric O₂/O₃. The
  `cell_status/1` rule therefore supports both an `:aerobic` mode (default acceptor O₂) and
  an `:anaerobic` mode (sulfate/nitrate), so the simulation cannot smuggle in the conclusion
  "all life needs oxygen." See `lab/proofs/bioenergetics_proton_gradient.md`.
  """

  # Faraday (C/mol) and gas constant (J/mol/K), rounded for teaching; the evidence corpus
  # (Nernst slope 59.16 mV/pH at 298 K) is consistent with these values. Exact SI values are
  # 96485.33212 and 8.314462618; the rounding is immaterial to every verdict here.
  @faraday 96_485.0
  @gas_const 8.314

  # Viability thresholds (engineering choices for the toy cell; evidence class C).
  @water_min 0.6
  @pmf_min_mV 50.0
  @radiation_max 1.0

  @typedoc """
  A toy cell. `mode` selects the metabolic regime; `electron_acceptor` must match the mode
  (`:o2` for aerobic; `:sulfate`/`:nitrate` for anaerobic). `radiation_dose` is a normalised
  damage proxy in [0, ∞); `water_activity` ∈ [0, 1].
  """
  @type cell :: %{
          mode: :aerobic | :anaerobic,
          water_activity: float(),
          pmf_mV: float(),
          electron_donor: boolean(),
          electron_acceptor: :o2 | :sulfate | :nitrate | :none,
          membrane_intact: boolean(),
          radiation_dose: float()
        }

  @doc "Faraday constant (C·mol⁻¹)."
  @spec faraday() :: float()
  def faraday, do: @faraday

  @doc """
  Nernst slope `2.303·R·T/F` in mV per pH unit at temperature `t_k` (K).

  `2.303` is the conventional rounding of `ln 10`; this implementation uses `ln 10` exactly so
  the slope returns the canonical textbook value `59.16 mV/pH` at 298.15 K (not `59.17`).
  """
  @spec nernst_slope_mv(float()) :: float()
  def nernst_slope_mv(t_k) when t_k > 0, do: :math.log(10) * @gas_const * t_k / @faraday * 1000.0

  @doc """
  Proton-motive force `Δp = Δψ − (2.303RT/F)·ΔpH` in millivolts.

  `delta_psi_mv` is the membrane potential (mV) and `delta_ph` the trans-membrane pH
  difference (pH units); `t_k` defaults to 298.15 K.

      iex> Float.round(SP.Lab.Bioenergetics.proton_motive_force(150.0, 0.5), 1)
      120.4
  """
  @spec proton_motive_force(float(), float(), float()) :: float()
  def proton_motive_force(delta_psi_mv, delta_ph, t_k \\ 298.15) do
    delta_psi_mv - nernst_slope_mv(t_k) * delta_ph
  end

  @doc """
  ATP free-energy proxy `ΔG ≈ n·F·Δp` (J·mol⁻¹), with `pmf_volts` the proton-motive force
  in volts and `n` the number of protons translocated per ATP.

      iex> Float.round(SP.Lab.Bioenergetics.atp_free_energy(3, 0.120))
      34735.0
  """
  @spec atp_free_energy(non_neg_integer(), float()) :: float()
  def atp_free_energy(n, pmf_volts) when n >= 0, do: n * @faraday * pmf_volts

  @doc """
  Cell viability under the configured rule. Returns `:viable` or `{:nonviable, reasons}`
  where `reasons` is a list of atoms. A breached membrane is fatal regardless of the
  measured PMF (the gradient cannot be held), modelling membrane integrity explicitly.
  """
  @spec cell_status(cell()) :: :viable | {:nonviable, [atom()]}
  def cell_status(c) do
    reasons =
      []
      |> flag(c.water_activity >= @water_min, :insufficient_water)
      |> flag(c.membrane_intact, :membrane_breach)
      |> flag(c.membrane_intact and c.pmf_mV >= @pmf_min_mV, :insufficient_proton_gradient)
      |> flag(c.electron_donor, :no_electron_donor)
      |> flag(valid_acceptor?(c), :no_valid_electron_acceptor)
      |> flag(c.radiation_dose <= @radiation_max, :radiation_damage)

    case Enum.reverse(reasons) do
      [] -> :viable
      rs -> {:nonviable, rs}
    end
  end

  @doc "Viability thresholds (declared for the falsification ledger)."
  @spec thresholds() :: map()
  def thresholds, do: %{water_min: @water_min, pmf_min_mV: @pmf_min_mV, radiation_max: @radiation_max}

  defp valid_acceptor?(%{mode: :aerobic, electron_acceptor: a}), do: a == :o2
  defp valid_acceptor?(%{mode: :anaerobic, electron_acceptor: a}), do: a in [:sulfate, :nitrate]
  defp valid_acceptor?(_), do: false

  defp flag(reasons, true, _reason), do: reasons
  defp flag(reasons, false, reason), do: [reason | reasons]
end
