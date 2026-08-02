defmodule SP.Brain.ValidationEngineTest do
  @moduledoc "U5: the §16 checklist is enforced and passes on the genome + arbitrary cards."
  use ExUnit.Case, async: true

  alias SP.Brain.{ValidationEngine, Designer, Genome}

  test "all active gates pass on the expressed genome" do
    {status, results} = ValidationEngine.run()
    assert status == :ok
    refute Enum.any?(results, fn {_, _, s, _} -> s == :fail end)
    # the active math/structural gates actually ran (not all skipped)
    passed = Enum.count(results, fn {_, _, s, _} -> s == :pass end)
    assert passed >= 8
  end

  test "the checklist covers the full 13 points" do
    {_, results} = ValidationEngine.run()
    ids = results |> Enum.map(&elem(&1, 0)) |> Enum.sort()
    assert ids == Enum.to_list(1..13)
  end

  test "passes on an arbitrary compiled card (the universal builder is validated too)" do
    card = %{
      modalities: [%{name: :a, no: 3, ns: 2}, %{name: :b, no: 2, ns: 4}],
      actions: [:x, :y],
      gamma: 8.0
    }

    {status, _} = ValidationEngine.run(Designer.compile(card))
    assert status == :ok
  end

  test "detects a broken (non-stochastic) model" do
    fm = Genome.express(Genome.default())
    # corrupt one likelihood column so it no longer sums to 1
    [sub | rest] = fm.subs
    [a_m | a_rest] = sub.a
    broken_a = [[99.0 | tl(hd(a_m))] | tl(a_m)]
    fm = %{fm | subs: [%{sub | a: [broken_a | a_rest]} | rest]}

    {status, results} = ValidationEngine.run(fm)
    assert status == :error
    assert Enum.any?(results, fn {id, _, s, _} -> id == 4 and s == :fail end)
  end

  describe "no-fake-in-UNI global gates (17 no simulator · 18 no foreign mind)" do
    test "all global gates pass on the real tree, and 17 + 18 are present and green" do
      gates = ValidationEngine.global_gates()
      refute Enum.any?(gates, fn {_, _, s, _} -> s == :fail end)
      assert {17, _, :pass, _} = List.keyfind(gates, 17, 0)
      assert {18, _, :pass, _} = List.keyfind(gates, 18, 0)
    end

    test "the simulator detector BITES on real usage but ignores prose (falsifiable)" do
      # real code references to the sim lab must be caught …
      assert ValidationEngine.simulator_token?("x = SP.Sim.run(state)")
      assert ValidationEngine.simulator_token?("  alias SP.World.Region")
      assert ValidationEngine.simulator_token?("use SP.Body")
      # … but honest prose / live-path aliases must NOT trip it
      refute ValidationEngine.simulator_token?("# this mirrors `SP.Sim`, the offline interpreter")
      refute ValidationEngine.simulator_token?("alias SP.Brain.MC")
      refute ValidationEngine.simulator_token?("the SP.Sim treats them as inert")
    end

    test "the foreign-mind detector BITES on external-model reach but ignores honest docs" do
      # any path to an external model must be caught …
      assert ValidationEngine.foreign_mind_token?(~s|Req.post("https://api.openai.com/v1/chat")|)
      assert ValidationEngine.foreign_mind_token?("HTTPoison.get(url)")
      assert ValidationEngine.foreign_mind_token?("@anthropic_key System.get_env(\"API_KEY\")")
      # … but "no LLM" prose, "coherent", and the legit local RCON socket must NOT trip it
      refute ValidationEngine.foreign_mind_token?("# the FEP way — no LLM, no language model")
      refute ValidationEngine.foreign_mind_token?("field coherence is coherent here")
      refute ValidationEngine.foreign_mind_token?(":gen_tcp.connect(host, 25575, opts)")
    end
  end
end
