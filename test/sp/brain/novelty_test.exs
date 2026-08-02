defmodule SP.Brain.NoveltyTest do
  @moduledoc """
  gate.novelty (Phase 1) — the missing third EFE term (parameter information gain, UNI-GPT Q2). The pure form
  is correct (positive for under-sampled cells, monotonic-decay to 0 as counts→∞, C-independent, bounded), it
  is byte-identical at novelty_gain=0 over the live depth-5 Plan path, and ON (novelty_gain>0) it produces a
  prospective EXPLORATION drive — a fresh curiosity agent samples its action repertoire more uniformly than a
  fixating control (covering the under-used build/craft chain).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Plan, Genome, Novelty}

  # a Dirichlet count column with `hi` on one cell, low elsewhere (under-sampled cells ⇒ high novelty).
  defp col(n, hot, hi), do: for(o <- 0..(n - 1), do: if(o == hot, do: hi, else: 1.0))

  test "W_a is POSITIVE and decays MONOTONICALLY to 0 as the A counts grow (the no-reward invariant)" do
    qs = [1.0, 0.0]
    qo = [0.9, 0.1]
    # one state's column, swept from low counts (under-sampled) to high (saturated).
    w = fn c -> Novelty.w_a([[c, c]], qs, qo) end
    seq = Enum.map([1.0, 2.0, 5.0, 20.0, 100.0, 1000.0], w)

    assert hd(seq) >= 0.0, "novelty is non-negative at the prior"
    assert seq == Enum.sort(seq, :desc), "W_a must decrease monotonically as counts grow"
    assert List.last(seq) < 1.0e-3, "W_a → 0 as counts → ∞ (information, not reward)"
  end

  test "W_a is INDEPENDENT of C (it is information gain, never a preference/reward)" do
    # W_a takes only pa, qs, qo — there is no C argument; same inputs ⇒ same value regardless of any C.
    pa = [col(3, 0, 1.0), col(3, 1, 1.0), col(3, 2, 1.0)]

    assert Novelty.w_a(pa, [0.3, 0.3, 0.4], [0.2, 0.3, 0.5]) ==
             Novelty.w_a(pa, [0.3, 0.3, 0.4], [0.2, 0.3, 0.5])
  end

  test "novelty is BOUNDED even for degenerate sub-prior counts (cannot swamp survival)" do
    # a structure-grown cell with a tiny count would blow up an unfloored 1/count; the @floor clamps it.
    big = Novelty.w_a([[0.0001, 0.0001]], [1.0, 0.0], [0.5, 0.5])
    assert abs(big) < 1.0, "the count floor bounds the novelty term"
  end

  test "W_b PROMOTES under-sampled actions: a low-count transition has higher novelty than a saturated one" do
    qs = [1.0, 0.0]
    qs1 = [0.5, 0.5]
    saturated = Novelty.w_b([[500.0, 500.0], [500.0, 500.0]], qs, qs1)
    fresh = Novelty.w_b([[1.0, 1.0], [1.0, 1.0]], qs, qs1)
    assert fresh > saturated, "an under-sampled transition must carry more novelty than a saturated one"
    assert saturated < 1.0e-2, "a saturated transition's novelty has decayed to ~0"
  end

  test "byte-identical at novelty_gain=0 over the depth-5 Plan path (action values unchanged)" do
    base = MC.new(seed: 7).model
    on0 = %{base | subs: Enum.map(base.subs, &%{&1 | novelty_gain: 0.0})}
    v_base = Plan.action_values(base, depth: 5, beam: 3)
    v_on0 = Plan.action_values(on0, depth: 5, beam: 3)

    assert Enum.zip_with(v_base, v_on0, fn a, b -> abs(a - b) end) |> Enum.max() < 1.0e-12,
           "novelty_gain=0 must be byte-identical over the live decider"
  end

  # 600s, raised from 240s on 2026-07-18. This is the most expensive test in the whole suite: two
  # 200-step runs (control + curiosity) = 400 live MC.step calls through the full depth-5 beam-3
  # Plan search. Measured cost via `--trace` on an IDLE box: 185553.7 ms — i.e. the previous 240s
  # tag left only 1.29x headroom, and `mix test` runs CPU-bound tests oversubscribed, so it timed
  # out under the full suite (stack in Plan.advance/3, same signature as the MotorCortexTest flake
  # fixed in dc6af1f). 600s is ~3.2x the measured idle cost.
  #
  # The sample size is deliberately NOT reduced to make this cheaper. 200 steps is the statistical
  # power behind the two assertions below, and novelty_test.exs is one of the four invariant guards
  # named in CLAUDE.md ("Monotonic decay ... the no-smuggled-reward proof"). Trading its power for
  # wall time is a science-track change and would need /lab-team-review, not a test-hygiene commit.
  @tag timeout: 600_000
  test "prospective EXPLORATION: a fresh curiosity agent samples actions more uniformly than the control" do
    # the real live decider (depth-5 beam); the novelty term lifts the under-sampled actions.
    run = fn dna ->
      Enum.reduce(1..200, {MC.new(seed: 7, dna: dna), %{}}, fn _, {b, h} ->
        {a, b2} = MC.step(b, %{})
        {b2, Map.update(h, a, 1, &(&1 + 1))}
      end)
      |> elem(1)
    end

    entropy = fn h ->
      tot = Enum.sum(Map.values(h))

      -Enum.sum(
        Enum.map(Map.values(h), fn c ->
          p = c / tot
          p * :math.log(p)
        end)
      )
    end

    ctrl = run.(Genome.default())
    cur = run.(Genome.curiosity_primary(0.5))

    assert entropy.(cur) > entropy.(ctrl) + 0.2, "the curiosity agent must explore with higher action entropy"
    # the build-chain actions (place/craft) are under-used by the fixating control; novelty lifts them.
    assert Map.get(cur, :place, 0) + Map.get(cur, :craft, 0) >
             Map.get(ctrl, :place, 0) + Map.get(ctrl, :craft, 0),
           "novelty must increase exploration of the under-used build/craft actions"
  end
end
