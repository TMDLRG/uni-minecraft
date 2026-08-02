defmodule SP.Brain.SoftObservationTest do
  @moduledoc """
  gate.soft-observation — feed the pixel cortex's POSTERIOR as VIRTUAL EVIDENCE (UNI-GPT WS-C Ruling 2),
  instead of a hard argmax that discards the cortex's uncertainty. A factor's likelihood message becomes
  (ln A)ᵀ r and its Dirichlet learning uses soft counts a_{g,s} += lr·r_g·qs[s]. Both strictly generalise
  the hard-integer path and reduce to it at r = onehot(o) (the peaked limit) — so existing symbolic agents
  are byte-identical.

    S1 peaked-limit (perception): infer with hard o == infer with soft onehot(o)   (< 1e-12)
    S2 uncertainty-preserving: a DIFFUSE soft obs yields a LESS-peaked posterior than its argmax hard obs
    S3 peaked-limit (learning): learn with hard o == learn with soft onehot(o)      (< 1e-12)
    S4 soft counts conserve + distribute: total Dirichlet mass added == lr; the diffuse obs spreads it
  """
  use ExUnit.Case, async: true
  alias SP.Brain.{Model, Infer, Learn}

  defp uniform(n), do: List.duplicate(1.0 / n, n)
  defp onehot(n, i), do: for(k <- 0..(n - 1), do: if(k == i, do: 1.0, else: 0.0))
  defp mad(a, b), do: Enum.zip_with(List.flatten(a), List.flatten(b), fn x, y -> abs(x - y) end) |> Enum.max()
  defp entropy(p), do: -Enum.sum(Enum.map(p, fn x -> if x > 0.0, do: x * :math.log(x), else: 0.0 end))
  defp argmax(p), do: p |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  defp total(matrix), do: matrix |> List.flatten() |> Enum.sum()
  defp outcome_mass(pa, o), do: pa |> hd() |> Enum.map(&Enum.at(&1, o)) |> Enum.sum()

  defp model3 do
    a = [[[0.7, 0.15, 0.15], [0.15, 0.7, 0.15], [0.15, 0.15, 0.7]]]
    b = [[[0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]]]

    %{
      Model.new(a: a, b: b, c: [[0.0, 0.0, 0.0]], d: uniform(3))
      | last_action: 0,
        qs: uniform(3),
        qs_prev: uniform(3)
    }
  end

  test "S1: a soft observation onehot(o) is byte-identical to the hard integer observation o" do
    m = model3()
    hard = Infer.infer_states(m, [1]).qs
    soft = Infer.infer_states(m, [onehot(3, 1)]).qs
    assert mad(hard, soft) < 1.0e-12
  end

  test "S2: a diffuse soft observation yields a less-peaked posterior than its argmax hard observation" do
    m = model3()
    hard = Infer.infer_states(m, [1]).qs
    diffuse = Infer.infer_states(m, [[0.2, 0.6, 0.2]]).qs
    assert argmax(diffuse) == argmax(hard), "the diffuse evidence still favours the same state"

    assert entropy(diffuse) > entropy(hard) + 0.05,
           "but it preserves the cortex uncertainty (less overconfident)"
  end

  test "S3: soft-count learning with onehot(o) is byte-identical to the hard learning at o" do
    m = %{model3() | qs: [0.1, 0.8, 0.1], lr: 1.0}
    hard = Learn.learn(m, [1])
    soft = Learn.learn(m, [onehot(3, 1)])
    assert mad(hard.pa, soft.pa) < 1.0e-12
    assert mad(hard.a, soft.a) < 1.0e-12
  end

  test "S4: soft counts conserve the total Dirichlet mass (== lr) and distribute it by r" do
    m = %{model3() | qs: [0.1, 0.8, 0.1], lr: 1.0}
    base = total(m.pa)
    hard = Learn.learn(m, [1])
    diffuse = Learn.learn(m, [[0.2, 0.6, 0.2]])

    # both add exactly lr = 1.0 of total Dirichlet mass (Σ_s qs = 1, Σ_g r_g = 1)
    assert abs(total(hard.pa) - base - 1.0) < 1.0e-9
    assert abs(total(diffuse.pa) - base - 1.0) < 1.0e-9

    # the hard obs adds mass ONLY to outcome 1; the diffuse spreads it across outcomes 0 and 2 too
    base_o0 = outcome_mass(m.pa, 0)
    assert abs(outcome_mass(hard.pa, 0) - base_o0) < 1.0e-12, "the hard obs adds NO mass to outcome 0"

    assert outcome_mass(diffuse.pa, 0) > base_o0 + 0.1,
           "the diffuse soft obs adds mass to outcome 0 (= 0.2·lr)"
  end
end
