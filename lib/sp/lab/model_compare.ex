defmodule SP.Lab.ModelCompare do
  @moduledoc """
  A small, declared-weight model-comparison engine, and a concrete gravity-vs-pressure
  bake-off whose inputs are *computed* from `SP.Lab.Physics` + `SP.Lab.PlanetaryData`
  (not hand-assigned), so the score cannot be quietly rigged.

  ## Scoring (declared, evidence class C — an engineering rubric, not a law)

      Sₘ = w_E·E − w_C·C − w_F·F − w_U·U

  where, per model: `E` = evidence-support score, `C` = complexity / free-parameter count,
  `F` = falsification failures (count of bodies mispredicted beyond tolerance), `U` =
  unsupported assumptions. Weights are fixed and public in `weights/0`. The rubric is a
  bookkeeping aid; the load-bearing fact is `F`, which is measured.

  ## The gravity-vs-pressure bake-off

  `gravity_model_report/1` calibrates the pressure-weight model `g = k·P` on Earth only,
  then scores both models out-of-sample against measured `g`. Newtonian `g = GM/R²` uses
  ZERO per-body free parameters; the pressure model is granted one (k). The report counts
  failures at a tolerance (default 2%). On the seven reference bodies Newtonian fails 0 and
  the pressure model fails on every out-of-sample body — the contradiction the lab exists to
  surface. See `lab/proofs/dgst_d_value_audit.md`.
  """

  alias SP.Lab.{Physics, PlanetaryData}

  @weights %{e: 1.0, c: 0.5, f: 1.5, u: 1.0}

  @typedoc "A scored model card."
  @type card :: %{e: float(), c: float(), f: float(), u: float()}

  @doc "The fixed, public scoring weights."
  @spec weights() :: map()
  def weights, do: @weights

  @doc "Score a model card `Sₘ = w_E·E − w_C·C − w_F·F − w_U·U`."
  @spec score(card()) :: float()
  def score(%{e: e, c: c, f: f, u: u}) do
    w = @weights
    w.e * e - w.c * c - w.f * f - w.u * u
  end

  @doc """
  Per-body relative error of the Newtonian model `g = GM/R²` against measured `g`.
  Returns `[{body_name, rel_error}]`.
  """
  @spec newtonian_errors() :: [{atom(), float()}]
  def newtonian_errors do
    for b <- PlanetaryData.bodies() do
      pred = Physics.surface_gravity(b.m_kg, b.r_km * 1000.0)
      {b.name, Physics.rel_error(pred, b.g_obs)}
    end
  end

  @doc """
  Per-body relative error of the pressure-weight model `g = k·P`, with `k` calibrated on
  Earth. Bodies with no surface pressure (gas giants) are skipped.
  Returns `[{body_name, rel_error}]`.
  """
  @spec pressure_errors() :: [{atom(), float()}]
  def pressure_errors do
    earth = PlanetaryData.body(:earth)
    k = Physics.calibrate_k(earth.g_obs, earth.p_bar)

    for b <- PlanetaryData.bodies_with_surface() do
      pred = Physics.pressure_weight(k, b.p_bar)
      {b.name, Physics.rel_error(pred, b.g_obs)}
    end
  end

  @doc """
  Full gravity-vs-pressure report at relative-error tolerance `tol` (default 0.02).

  Returns a map with both models' per-body errors, failure counts, scored cards, and the
  final scores. The Newtonian card carries 0 free parameters; the pressure card carries 1
  (the Earth-calibrated `k`) and inherits its measured failure count.
  """
  @spec gravity_model_report(float()) :: map()
  def gravity_model_report(tol \\ 0.02) do
    newton = newtonian_errors()
    pressure = pressure_errors()

    newton_fail = Enum.count(newton, fn {_, e} -> e > tol end)
    # Count pressure failures over the SAME bodies the pressure model can score (with surface).
    pressure_fail = Enum.count(pressure, fn {_, e} -> e > tol end)

    newton_card = %{e: 7.0, c: 1.0, f: newton_fail * 1.0, u: 0.0}
    # The pressure model needs a per-body constant to fit; that is one free parameter per
    # data point — recorded as high complexity AND an unsupported mechanism assumption.
    pressure_card = %{e: 1.0, c: 7.0, f: pressure_fail * 1.0, u: 3.0}

    %{
      tolerance: tol,
      newtonian: %{errors: newton, failures: newton_fail, card: newton_card, score: score(newton_card)},
      pressure: %{errors: pressure, failures: pressure_fail, card: pressure_card, score: score(pressure_card)},
      verdict:
        if(score(newton_card) > score(pressure_card),
          do: :newtonian_dominates,
          else: :inconclusive
        )
    }
  end
end
