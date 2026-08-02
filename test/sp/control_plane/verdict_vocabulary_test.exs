defmodule SP.ControlPlane.VerdictVocabularyTest do
  @moduledoc """
  Phase 3 items 3.3 and 3.4 · F2 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    `verdict: 0.93`, `"93%"` or `"MOSTLY_PASS"` is accepted.

  `ARCHITECTURE.md` §7.1: **no percent scores.** A verdict is one of five
  controlled words and nothing else. A number looks more precise than a word and
  carries less: it invites an average, a trend line and a threshold, none of which
  the evidence supports. `CLAUDE.md`'s truth contract calls this "never
  percent-scored".
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Ledger, Registry, Verdict}

  defp at(n), do: {"2026-07-25T18:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_434_400_000_000_000 + n}

  defp auth, do: %{"kind" => "adjudication", "granted_by" => "michael", "ref" => "PHASE-3.md#3.3"}

  defp registered(gate \\ "g-one") do
    {:ok, l} =
      Registry.register(Ledger.new(), %{
        gate: gate,
        pass_condition: "P holds.",
        falsifies_condition: "P does not hold.",
        pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
        actor: "claude",
        role: "agent",
        authorization: auth(),
        at: at(1)
      })

    l
  end

  defp author(l, verdict, extra \\ %{}) do
    Verdict.author(
      l,
      Map.merge(
        %{
          gate: "g-one",
          verdict: verdict,
          receipt_ref: "docs/GATES.md",
          actor: "claude",
          role: "agent",
          authorization: auth(),
          at: at(2)
        },
        extra
      )
    )
  end

  test "the vocabulary is exactly the five words the gate ledger already uses" do
    assert Verdict.vocabulary() == ~w(PASS PARTIAL FAIL WITHHELD PENDING)

    schema =
      Path.expand("../../../production/schemas/gate_row.schema.json", __DIR__)
      |> File.read!()
      |> JSON.decode!()

    assert Verdict.vocabulary() == schema["properties"]["verdict"]["enum"],
           "the Control Plane's vocabulary and the ledger schema's must be the same list, not two lists that agree today"
  end

  test "each of the five is accepted" do
    for v <- ~w(PASS FAIL WITHHELD PENDING) do
      assert {:ok, l} = author(registered(), v)
      assert Verdict.of(l, "g-one").verdict == v
    end

    assert {:ok, _} = author(registered(), "PARTIAL", %{holds: "the offline arm only"})
  end

  test "F2 — a number is refused" do
    for v <- [0.93, 93, 1, 0, -1, 1.0] do
      assert {:error, reason} = author(registered(), v), "#{inspect(v)} was accepted as a verdict"
      assert inspect(reason) =~ "verdict"
    end
  end

  test "F2 — a percent, a score and a fraction dressed as a string are refused" do
    for v <- ["93%", "0.93", "93", "9/10", "A+", "green", "mostly"] do
      assert {:error, _} = author(registered(), v), "#{inspect(v)} was accepted as a verdict"
    end
  end

  test "F2 — a word outside the vocabulary is refused, and the refusal quotes it back" do
    assert {:error, reason} = author(registered(), "MOSTLY_PASS")
    assert inspect(reason) =~ "MOSTLY_PASS"
  end

  test "case and whitespace are not silently normalised — a near-miss is a refusal, not a guess" do
    for v <- ["pass", "Pass", "PASS ", " PASS", "pAsS"] do
      assert {:error, _} = author(registered(), v), "#{inspect(v)} was normalised instead of refused"
    end
  end

  test "a verdict lands as a ledger entry carrying the word, the receipt and the state it replaced" do
    {:ok, l} = author(registered(), "PASS")
    [_reg, v] = Ledger.entries(l)

    assert v["transition"] == "gate.adjudicated"
    assert v["resulting"]["verdict"] == "PASS"
    assert v["resulting"]["receipt_ref"] == "docs/GATES.md"
    assert v["prior"]["verdict"] == "PENDING"
    assert :ok = Ledger.verify(l)
  end

  test "a verdict may be lowered on receipts — that is the gate working, not an error" do
    {:ok, l} = author(registered(), "PASS")

    assert {:ok, l} =
             Verdict.author(l, %{
               gate: "g-one",
               verdict: "FAIL",
               receipt_ref: "docs/receipts/falsified.md",
               actor: "claude",
               role: "agent",
               authorization: auth(),
               at: at(3)
             })

    assert Verdict.of(l, "g-one").verdict == "FAIL"
    assert length(Ledger.entries(l)) == 3, "the PASS entry is kept; history is extended, never edited"
    assert :ok = Ledger.verify(l)
  end

  test "no verdict path accepts a score field under any name" do
    for key <- [:score, :percent, :confidence, :pct, :grade] do
      assert {:error, reason} = author(registered(), "PASS", %{key => 0.93}),
             "a #{key} field was accepted alongside a verdict"

      assert inspect(reason) =~ to_string(key)
    end
  end
end
