defmodule SP.Lab.ModelCompareTest do
  @moduledoc """
  Hard tests 15 & 16: the model-comparison rubric, fed *computed* failure counts, prefers
  the zero-free-parameter Newtonian model over the pressure model that needs a constant per
  body. The pressure model's failures are real (out-of-sample), not assigned.
  """
  use ExUnit.Case, async: true

  alias SP.Lab.ModelCompare

  test "Newtonian model fails on 0 of 7 bodies at 2% tolerance" do
    report = ModelCompare.gravity_model_report(0.02)
    assert report.newtonian.failures == 0
  end

  test "pressure model fails on every out-of-sample body it can score" do
    report = ModelCompare.gravity_model_report(0.02)
    # 6 bodies have a surface; Earth is the calibration point, so all 5 others must fail.
    assert report.pressure.failures == 5
  end

  test "the rubric prefers Newtonian; the pressure model is penalised, not rewarded (hard test 15)" do
    report = ModelCompare.gravity_model_report(0.02)
    assert report.newtonian.score > report.pressure.score
    assert report.verdict == :newtonian_dominates
  end

  test "scoring uses the declared public weights" do
    w = ModelCompare.weights()
    card = %{e: 7.0, c: 1.0, f: 0.0, u: 0.0}
    expected = w.e * 7.0 - w.c * 1.0 - w.f * 0.0 - w.u * 0.0
    assert ModelCompare.score(card) == expected
  end

  test "lab evidence-class and result vocabularies are closed sets (no 'proven')" do
    assert SP.Lab.evidence_class?(:b)
    refute SP.Lab.evidence_class?(:proven)
    assert SP.Lab.result?(:contradicted_by_test)
    refute SP.Lab.result?(:proven)
  end
end
