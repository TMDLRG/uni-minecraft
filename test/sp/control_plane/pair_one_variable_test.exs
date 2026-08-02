defmodule SP.ControlPlane.PairOneVariableTest do
  @moduledoc """
  Phase 4 item 4.4 · F12 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a two-variable comparison is claimable instead of `VOID`.

  `LAB_PROTOCOL.md`: a paired design has **exactly one differing variable**. Two
  differences do not weaken the result — they make it **unattributable**, because
  no observation can say which change produced the difference. The verdict is
  `VOID`, and `VOID` is not a bad result; it is the absence of one.

  Nothing here decides whether a difference is *interesting*. That is
  adjudication, and it belongs to `SP.ControlPlane.Verdict` behind a registered
  gate.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Pair, Run}

  defp arm(params, overrides \\ %{}) do
    {:ok, r} =
      Run.new(
        Map.merge(
          %{
            code_identity: "8ff5591",
            env_identity: "elixir-1.19.5/otp-28",
            inputs: %{"dataset" => "fixture-a"},
            params: params,
            seeds: [7],
            planned_n: 10,
            actual_n: 10,
            started_utc: "2026-07-26T13:00:00Z",
            started_unix_ns: 1_785_502_800_000_000_000,
            ended_utc: "2026-07-26T13:00:10Z",
            ended_unix_ns: 1_785_502_810_000_000_000,
            exit_code: 0,
            outputs: []
          },
          overrides
        )
      )

    r
  end

  test "exactly one differing param is comparable, and the pair names the variable" do
    a = arm(%{"alpha" => 0.1, "k" => 8})
    b = arm(%{"alpha" => 0.2, "k" => 8})

    assert {:ok, pair} = Pair.of(a, b)
    assert pair.variable == "alpha"
    assert pair.a == 0.1
    assert pair.b == 0.2
    assert Pair.claimable?(pair)
  end

  test "F12 — two differing params mark the pair VOID and unclaimable, naming both" do
    a = arm(%{"alpha" => 0.1, "k" => 8})
    b = arm(%{"alpha" => 0.2, "k" => 16})

    assert {:error, {:void, keys}} = Pair.of(a, b)
    assert Enum.sort(keys) == ["alpha", "k"]
  end

  test "F12 — three or more differences are equally VOID; it does not get worse, it is already unclaimable" do
    a = arm(%{"alpha" => 0.1, "k" => 8, "iters" => 12})
    b = arm(%{"alpha" => 0.2, "k" => 16, "iters" => 24})

    assert {:error, {:void, keys}} = Pair.of(a, b)
    assert Enum.sort(keys) == ["alpha", "iters", "k"]
  end

  test "zero differences is refused too — two identical arms are a repeat, not a contrast" do
    a = arm(%{"alpha" => 0.1, "k" => 8})
    b = arm(%{"alpha" => 0.1, "k" => 8})

    assert {:error, :no_differing_variable} = Pair.of(a, b)
  end

  test "a param present in one arm and absent in the other counts as a difference" do
    a = arm(%{"alpha" => 0.1, "k" => 8})
    b = arm(%{"alpha" => 0.1})

    assert {:ok, pair} = Pair.of(a, b)
    assert pair.variable == "k"
    assert pair.b == nil
  end

  test "differing INPUTS also count — the variable need not be a param" do
    a = arm(%{"alpha" => 0.1}, %{inputs: %{"dataset" => "fixture-a"}})
    b = arm(%{"alpha" => 0.1}, %{inputs: %{"dataset" => "fixture-b"}})

    assert {:ok, pair} = Pair.of(a, b)
    assert pair.variable == "inputs.dataset"
  end

  test "F12 — one param AND one input differing is TWO variables, and therefore VOID" do
    a = arm(%{"alpha" => 0.1}, %{inputs: %{"dataset" => "fixture-a"}})
    b = arm(%{"alpha" => 0.2}, %{inputs: %{"dataset" => "fixture-b"}})

    assert {:error, {:void, keys}} = Pair.of(a, b)
    assert Enum.sort(keys) == ["alpha", "inputs.dataset"]
  end

  test "a differing SEED is a variable — it is not free" do
    a = arm(%{"alpha" => 0.1}, %{seeds: [7]})
    b = arm(%{"alpha" => 0.1}, %{seeds: [8]})

    assert {:ok, pair} = Pair.of(a, b)
    assert pair.variable == "seeds"
  end

  test "a differing CODE or ENV identity is a variable — the same code is part of the contrast" do
    for {key, value, name} <- [
          {:code_identity, "deadbeef", "code_identity"},
          {:env_identity, "elixir-1.18.0/otp-27", "env_identity"}
        ] do
      a = arm(%{"alpha" => 0.1})
      b = arm(%{"alpha" => 0.1}, %{key => value})

      assert {:ok, pair} = Pair.of(a, b)
      assert pair.variable == name
    end
  end

  test "execution facts are NOT variables — two arms necessarily run at different times" do
    a = arm(%{"alpha" => 0.1})

    b =
      arm(%{"alpha" => 0.2}, %{
        started_utc: "2026-07-26T14:00:00Z",
        started_unix_ns: 1_785_506_400_000_000_000,
        ended_utc: "2026-07-26T14:00:10Z",
        ended_unix_ns: 1_785_506_410_000_000_000,
        exit_code: 0
      })

    assert {:ok, pair} = Pair.of(a, b), "wall-clock difference must not count as a second variable"
    assert pair.variable == "alpha"
  end

  test "a VOID pair exposes no way to claim it anyway" do
    Code.ensure_loaded!(Pair)

    refute function_exported?(Pair, :force, 2)
    refute function_exported?(Pair, :claim, 1)
    refute function_exported?(Pair, :override, 2)

    a = arm(%{"alpha" => 0.1, "k" => 8})
    b = arm(%{"alpha" => 0.2, "k" => 16})
    assert {:error, {:void, _}} = Pair.of(a, b)
  end

  test "Pair decides comparability and nothing else — it renders no verdict" do
    source = Path.expand("../../../lib/sp/control_plane/pair.ex", __DIR__) |> File.read!()

    for word <- ~w(PASS FAIL PARTIAL WITHHELD) do
      refute source =~ word,
             "pair.ex mentions #{word}; adjudication belongs to Verdict, behind a registered gate"
    end
  end
end
