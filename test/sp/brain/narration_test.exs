defmodule SP.Brain.NarrationTest do
  @moduledoc "Gen-3 P2: the Producer's multilingual narration priors (template render, no LLM)."
  use ExUnit.Case, async: true

  alias SP.Brain.Narration

  test "render/3 returns text for all five world languages" do
    m = Narration.render(:under_attack, %{who: "UNI-3-1"})
    assert Map.keys(m) |> Enum.sort() == Enum.sort([:en, :zh, :hi, :es, :ar])
    for {_lang, s} <- m, do: assert(is_binary(s) and String.contains?(s, "UNI-3-1"))
  end

  test "the {{who}} slot is interpolated in every language" do
    for lang <- Narration.langs() do
      assert Narration.render_one(:mining, %{who: "Zeta"}, lang) =~ "Zeta"
    end
  end

  test "the strategy beat localises both context and the plan intent" do
    s =
      Narration.render_one(
        :strategy,
        %{who: "U", context: :flee, intent_actions: [:forward, :mine], conf: 72},
        :zh
      )

    assert s =~ "逃离危险" and s =~ "前进" and s =~ "开采" and s =~ "72"

    es =
      Narration.render_one(
        :strategy,
        %{who: "U", context: :forage, intent_actions: [:forward], conf: 50},
        :es
      )

    assert es =~ "buscar comida" and es =~ "avanzar" and es =~ "50"
  end

  test "missing slots render as empty (never raises) and unknown beats are safe" do
    assert Narration.render_one(:strategy, %{who: "U"}, :en) |> is_binary()
    assert Narration.render_one(:no_such_beat, %{who: "U"}, :en) == ""
  end

  test "deterministic: same (beat, who, frame) renders the same phrasing" do
    a = Narration.render_one(:explore, %{who: "UNI-1-1"}, :en, frame: 5)
    b = Narration.render_one(:explore, %{who: "UNI-1-1"}, :en, frame: 5)
    assert a == b
  end

  # --- compositional grammar (generation, not lookup) ------------------------

  test "compose/2 GENERATES an ambient line in all five languages from agent state" do
    m = Narration.compose(%{who: "UNI-2-3", emotion: :calm, context: :forage, action: "forward"})
    assert Map.keys(m) |> Enum.sort() == Enum.sort([:en, :zh, :hi, :es, :ar])
    for {_lang, s} <- m, do: assert(is_binary(s) and String.contains?(s, "UNI-2-3"))
    # the EN composition reflects BOTH activity (forage) and mood (calm)
    assert m.en =~ "forages" and m.en =~ "calm"
  end

  test "composition is combinatorial: activity × mood yield distinct sentences" do
    a = Narration.compose(%{who: "U", emotion: :calm, action: "mine"}).en
    b = Narration.compose(%{who: "U", emotion: :fear, action: "mine"}).en
    c = Narration.compose(%{who: "U", emotion: :calm, context: :flee}).en
    assert a =~ "carves into the stone" and a =~ "calm"
    assert b =~ "carves into the stone" and b =~ "wary"
    assert c =~ "flees" and a != b and a != c
  end

  test "compose is total: unknown emotion/activity fall back, never raises" do
    s = Narration.compose(%{who: "U", emotion: :ecstatic, context: :nonsense, action: "noop"})
    assert is_binary(s.ar) and String.contains?(s.en, "U")
    # zh uses fullwidth sentence punctuation
    assert String.ends_with?(Narration.compose(%{who: "U"}).zh, "。")
  end
end
