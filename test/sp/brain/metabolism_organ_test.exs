defmodule SP.Brain.MetabolismOrganTest do
  @moduledoc """
  Phase-2 `:metabolism` organ — the additive + gated seams (`docs/specs/metabolism.md`). Verifies the organ
  COMPILES from the genome card and carries the new generative structure: V3 (emptying-B is non-identity and
  drains; `:eat` refills), V4 (setpoint-peaked C at 'ok'), the strong `pb_seed` prior, and arm-integrity
  (14 vs the default 12 factors). Byte-identity with the organ OFF is gated by `DeciderByteIdentityTest` (V1).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Genome, Designer}

  defp metab_model, do: MC.new(seed: 7, dna: Genome.metabolism_primary()).model
  # energy/satiety are declared LAST in @modalities ⇒ the last two factors.
  defp energy_sub, do: Enum.at(metab_model().subs, -2)

  test "arm integrity — the :metabolism genome develops TWO extra factors (14 vs the default 12)" do
    assert length(MC.new(seed: 7, dna: Genome.default()).model.subs) == 12
    assert length(metab_model().subs) == 14
  end

  test "V3 — the energy factor's emptying-B is NON-identity (drains); :eat differs (refills)" do
    e = energy_sub()
    eat_idx = Enum.find_index(Genome.actions(), &(&1 == :eat))
    # action 0 = :forward (non-eat) ⇒ drain
    drain = Enum.at(e.b, 0)
    # :eat ⇒ fill
    fill = Enum.at(e.b, eat_idx)
    identity = Designer.identity(4)

    refute drain == identity, "a non-eat action's B_energy must drain (non-identity)"
    refute fill == drain, ":eat must refill (differ from the draining columns)"
    assert length(e.b) == length(Genome.actions())
  end

  test "V4 — C_energy is setpoint-peaked at 'ok' (bin 2), flat at 'full' (bin 3), steep at 'empty'" do
    c = hd(energy_sub().c)
    assert Enum.at(c, 2) == Enum.max(c), "C_energy must PEAK at 'ok' (bin 2)"
    assert Enum.at(c, 3) <= Enum.at(c, 2), "C_energy must be flat/lower at 'full' (no over-fill gradient)"
    assert Enum.at(c, 0) < Enum.at(c, 1), "C_energy must be steeply dispreferred at 'empty'"
  end

  test "the strong pb_seed makes the emptying-B a STRONG Dirichlet prior (Σpb per column ≫ default)" do
    # seed_pb(col, κ) = col·κ + 1 ⇒ column mass = κ + ns; κ=50, ns=4 ⇒ ≈ 54, vs ≈ 5 for the default add1.
    colsum = energy_sub().pb |> hd() |> hd() |> Enum.sum()
    assert colsum > 10.0, "pb_seed must concentrate the emptying-B prior (got Σ=#{colsum})"
  end

  test "V8 — a per-modality :learn_b card field overrides the global learn_b (mirrors :init_a/:b_init)" do
    base = %{actions: [:a, :eat], modalities: [%{name: :x, no: 2, ns: 2}], learn: %{a: true, b: true}}
    frozen = %{base | modalities: [%{name: :x, no: 2, ns: 2, learn_b: false}]}

    assert hd(Designer.compile(base).subs).learn_b == true,
           "field absent ⇒ the global learn_b (byte-identical)"

    assert hd(Designer.compile(frozen).subs).learn_b == false,
           "per-modality :learn_b:false freezes that factor"
  end
end
