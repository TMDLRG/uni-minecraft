defmodule SP.Brain.MathTest do
  use ExUnit.Case, async: true
  alias SP.Brain.Math

  doctest SP.Brain.Math

  describe "digamma vs scipy.special.digamma (frozen anchors)" do
    @anchors %{
      0.01 => -100.560885457869,
      0.1 => -10.423754940411,
      0.5 => -1.963510026021,
      1.0 => -0.577215664902,
      1.5 => 0.036489973979,
      2.0 => 0.422784335098,
      3.5 => 1.103156640645,
      6.0 => 1.706117668432,
      10.0 => 2.251752589067,
      100.0 => 4.600161852738
    }

    test "matches scipy to 1e-6 across the range" do
      for {x, expected} <- @anchors do
        assert_in_delta Math.digamma(x), expected, 1.0e-6, "digamma(#{x})"
      end
    end
  end

  describe "(ln B)s ≠ ln(Bs) — the bound-critical convention (§16)" do
    test "ln_matvec (log-then-mix) differs from log(matvec) (mix-then-log)" do
      b_u = [[0.9, 0.1], [0.2, 0.8]]
      w = [0.5, 0.5]
      ln_then_mix = Math.ln_matvec(b_u, w)
      mix_then_log = Math.matvec(b_u, w) |> Math.vlog()
      # They must be genuinely different (Jensen gap), proving we didn't collapse them.
      diff = Enum.zip_with(ln_then_mix, mix_then_log, fn a, b -> abs(a - b) end) |> Enum.max()
      assert diff > 1.0e-6
    end
  end

  describe "simplex kernels" do
    test "softmax sums to 1 and is order-preserving" do
      p = Math.softmax([1.0, 2.0, 3.0])
      assert_in_delta Enum.sum(p), 1.0, 1.0e-12
      assert Enum.at(p, 2) > Enum.at(p, 1) and Enum.at(p, 1) > Enum.at(p, 0)
    end

    test "entropy of a uniform distribution is ln(n)" do
      assert_in_delta Math.entropy([0.25, 0.25, 0.25, 0.25]), :math.log(4), 1.0e-9
    end

    test "norm_cols makes every column stochastic" do
      a = Math.norm_cols([[2.0, 2.0], [1.0, 3.0]])
      for col <- a, do: assert_in_delta(Enum.sum(col), 1.0, 1.0e-12)
    end

    test "matvec is the column-weighted sum (A·w)" do
      # column-major A with columns [0.9,0.1] and [0.2,0.8]; qs=[1,0] selects col 0
      assert Math.matvec([[0.9, 0.1], [0.2, 0.8]], [1.0, 0.0]) == [0.9, 0.1]
    end
  end
end
