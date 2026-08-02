defmodule SP.Lab.Radiation do
  @moduledoc """
  Beer–Lambert UV attenuation through an absorbing column (the ozone-shield model).

  ## Formulae (evidence class A — directly derivable)

      I(λ, z) = I₀(λ)·exp(−τ(λ, z))         transmitted spectral irradiance
      τ(λ, z) = Σᵢ σᵢ(λ)·Nᵢ(z)               optical depth (here a single absorber)

  with `σ` the absorption cross-section (cm²·molecule⁻¹) and `N` the column number density
  (molecules·cm⁻²). The Dobson Unit (DU) conversion is `1 DU = 2.69×10¹⁶ molecules·cm⁻²`
  (evidence class B; WMO/NASA Ozone Watch). Earth's total ozone column is ~300 DU.

  ## What this establishes — and what it does not

  A larger absorbing column raises optical depth and lowers surface UV (`shield_factor`
  rises toward 1). A 300 DU ozone column at the Hartley-band cross-section (~1.1×10⁻¹⁷ cm²
  near 255 nm, evidence class B) gives `τ ≈ 89`, so UV-C transmission is effectively zero —
  consistent with NASA's statement that without ozone the surface would be sterilised by UV.

  This is a **toy single-absorber model**: it omits scattering, multi-species absorption,
  solar zenith angle, and altitude structure. Ozone here reduces UV; it is never a "life
  force." Ozone is also produced abiotically (Venus, Mars), so a shield is not a biosignature
  on its own. See `lab/proofs/uv_filtering.md`.
  """

  # 1 Dobson Unit in molecules cm^-2 (WMO/NASA; evidence class B).
  @du 2.69e16

  # Representative O3 absorption cross-section near the Hartley-band peak ~255 nm,
  # cm^2 molecule^-1 (evidence class B). This is a deliberately ROUNDED representative
  # value; the Hodges 2019 consensus at 253.65 nm is 1.1329e-17 (rel. std. unc. 0.31%).
  # Using the consensus only STRENGTHENS the shield result (tau ~88.8 -> ~91; surface
  # UV-C transmission falls further), so the verdict is unchanged either way.
  @sigma_o3_hartley 1.1e-17

  @doc "1 Dobson Unit in molecules·cm⁻²."
  @spec dobson_unit() :: float()
  def dobson_unit, do: @du

  @doc "Representative ozone Hartley-band cross-section (cm²·molecule⁻¹, ~255 nm)."
  @spec sigma_o3_hartley() :: float()
  def sigma_o3_hartley, do: @sigma_o3_hartley

  @doc "Convert an ozone column in Dobson Units to molecules·cm⁻²."
  @spec column_from_dobson(float()) :: float()
  def column_from_dobson(du), do: du * @du

  @doc "Optical depth `τ = σ·N` for a single absorber."
  @spec optical_depth(float(), float()) :: float()
  def optical_depth(sigma_cm2, column_cm2) when sigma_cm2 >= 0 and column_cm2 >= 0,
    do: sigma_cm2 * column_cm2

  @doc "Transmittance `exp(−τ)` ∈ (0, 1]."
  @spec transmittance(float()) :: float()
  def transmittance(tau) when tau >= 0, do: :math.exp(-tau)

  @doc "Transmitted surface irradiance `I₀·exp(−τ)` (same units as `i0`)."
  @spec surface_irradiance(float(), float()) :: float()
  def surface_irradiance(i0, tau) when i0 >= 0 and tau >= 0, do: i0 * :math.exp(-tau)

  @doc """
  Shield factor — the fraction of incident flux removed, `1 − exp(−τ)` ∈ [0, 1).
  0 means no shielding (no absorber); → 1 means an opaque shield.
  """
  @spec shield_factor(float()) :: float()
  def shield_factor(tau) when tau >= 0, do: 1.0 - :math.exp(-tau)

  @doc """
  Convenience: optical depth of an ozone column given in Dobson Units at the Hartley band.
  """
  @spec ozone_optical_depth_du(float()) :: float()
  def ozone_optical_depth_du(du), do: optical_depth(@sigma_o3_hartley, column_from_dobson(du))
end
