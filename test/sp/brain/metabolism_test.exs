defmodule SP.Brain.MetabolismTest do
  @moduledoc """
  Phase-2 metabolic dynamics (`docs/specs/metabolism.md` §2.1 — the live viability edge, owner B2=Both). The
  store drains every tick (upkeep — no free hold), costly actions drain more, `:eat` refills ONLY with food,
  and empty = death. Verifies the action-severed-twin (G5b) MECHANISM: an all-`:noop` twin (never eats)
  drains to death; an agent that forages-and-eats sustains.
  """
  use ExUnit.Case, async: true

  alias SP.Brain.Metabolism, as: M

  @food %{"inv" => %{"food" => 3}}
  @nofood %{"inv" => %{"food" => 0}}

  test "bin discretises [0,1] → 0 empty .. 3 full" do
    assert M.bin(0.0) == 0
    assert M.bin(1.0e-9) == 0
    assert M.bin(0.3) == 1
    assert M.bin(0.5) == 2
    assert M.bin(1.0) == 3
  end

  test "inject writes the discretised energy/satiety into the senses the codec reads" do
    s = M.inject(%{}, 0.5, 0.8)
    assert s["energy"] == 2
    assert s["satiety"] == 3
  end

  test "every action drains (upkeep — no free hold); costly actions drain MORE" do
    {e_noop, _} = M.step(1.0, 0.5, :noop, @nofood)
    {e_mine, _} = M.step(1.0, 0.5, :mine, @nofood)
    assert e_noop < 1.0, ":noop still drains (internal upkeep — no free hold)"
    assert e_mine < e_noop, "a costly action (:mine) drains more than :noop"
  end

  test ":eat refills ONLY with food (foraging is metabolically necessary)" do
    {e_food, sa_food} = M.step(0.5, 0.5, :eat, @food)
    {e_none, _} = M.step(0.5, 0.5, :eat, @nofood)
    assert e_food > 0.5, ":eat WITH food refills energy"
    assert sa_food > 0.5, ":eat WITH food refills satiety"
    assert e_none < 0.5, ":eat WITHOUT food does not refill (still pays upkeep)"
  end

  test "G5b mechanism — an all-:noop twin (never eats) drains to DEATH in finite ticks" do
    death_at =
      {1.0, 0.5}
      |> Stream.iterate(fn {e, sa} -> M.step(e, sa, :noop, @nofood) end)
      |> Stream.take(60)
      |> Enum.find_index(fn {e, _} -> M.dead?(e) end)

    assert death_at != nil and death_at < 40, "the action-severed (noop) twin must drain to death (no refill)"
  end

  test "an agent that forages-and-eats (with food) SUSTAINS over the same window" do
    {e, _} =
      Enum.reduce(1..60, {0.6, 0.5}, fn i, {e, sa} ->
        action = if rem(i, 4) == 0, do: :eat, else: :noop
        M.step(e, sa, action, @food)
      end)

    refute M.dead?(e), "an agent that eats with food must sustain its energy (action-dependent viability)"
  end

  # --- B3: satiety -> C appetite attenuation (V9) ---

  test "V9 — satiety multiplier ∈ [0,1]: full appetite when hungry, reduced when sated" do
    for level <- 0..3, do: assert(M.satiety_multiplier(level) >= 0.0 and M.satiety_multiplier(level) <= 1.0)
    assert M.satiety_multiplier(0) == 1.0 and M.satiety_multiplier(1) == 1.0, "hungry ⇒ full appetite"
    assert M.satiety_multiplier(2) < 1.0, "sated ⇒ reduced appetite"
    assert M.satiety_multiplier(3) < M.satiety_multiplier(2), "stuffed ⇒ even less appetite"
  end

  test "V9 — attenuate_appetite scales ONLY the positive lobe; depletion penalties + zeros untouched" do
    assert M.attenuate_appetite([3.0, -2.0, 0.0, -8.0], 0.5) == [1.5, -2.0, 0.0, -8.0]
    assert M.attenuate_appetite([3.0, -2.0, 0.0, -8.0], 0.0) == [0.0, -2.0, 0.0, -8.0]
  end

  test "V9 — attenuate_model scales energy/satiety appetite when sated; BLACKLIST factors byte-identical" do
    model = %{
      subs: [
        %{c: [[-8.0, -2.0, 3.0, 0.0]], qs: [0.0, 0.0, 1.0, 0.0]},
        %{c: [[-8.0, -2.0, 3.0, 0.0]], qs: [0.0, 0.0, 1.0, 0.0]},
        %{c: [[3.0, -1.0, -5.0, -4.0]], qs: [1.0, 0.0, 0.0, 0.0]}
      ]
    }

    out = M.attenuate_model(model, 0, 1)

    # satiety believed sated (bin 2) ⇒ m = 0.6: energy positive lobe 3.0 -> 1.8; depletion penalties unchanged
    [e0, e1, e2, e3] = hd(Enum.at(out.subs, 0).c)
    assert_in_delta e2, 1.8, 1.0e-9, "the positive lobe (bin 2) is attenuated by m=0.6"
    assert [e0, e1, e3] == [-8.0, -2.0, 0.0], "depletion penalties + the zero are byte-identical"

    # the @self_pref-like protective factor (NOT energy/satiety) is byte-identical — its +3.0 is never attenuated
    assert Enum.at(out.subs, 2).c == Enum.at(model.subs, 2).c
  end

  test "V9 — attenuate_model is a no-op (byte-identical) when there is no satiety factor" do
    model = %{subs: [%{c: [[3.0, -2.0]], qs: [0.5, 0.5]}]}
    assert M.attenuate_model(model, 0, nil) == model
  end

  test "V5 — a STRONG pb_seed makes W_b decay (a well-sampled transition has ~0 novelty)" do
    qs = [1.0, 0.0]
    qs1 = [0.5, 0.5]
    strong = SP.Brain.Novelty.w_b([[26.0, 26.0], [26.0, 26.0]], qs, qs1)
    weak = SP.Brain.Novelty.w_b([[1.5, 1.5], [1.5, 1.5]], qs, qs1)
    assert strong < weak, "a strong (well-sampled) prior carries less novelty than a weak one"

    assert abs(strong) < 1.0e-2,
           "the strong-seed transition's novelty has decayed to ~0 (monotonic decay preserved)"
  end
end
