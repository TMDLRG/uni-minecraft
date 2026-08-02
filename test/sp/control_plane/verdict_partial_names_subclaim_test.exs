defmodule SP.ControlPlane.VerdictPartialNamesSubclaimTest do
  @moduledoc """
  Phase 3 item 3.4 · F3 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a bare `PARTIAL` with no holding sub-claim is accepted.

  `ARCHITECTURE.md` §7.1: *"`PARTIAL` must name exactly which sub-claim holds."*

  A bare `PARTIAL` is the most dangerous word in the vocabulary. It reads as
  "mostly passed" and means nothing checkable. `PARTIAL` that names what holds —
  and, by omission, what does not — is a finding. `PARTIAL` that names nothing is
  a mood.

  The canonical ledger has four live `PARTIAL` rows and each one's `notes` says
  what holds. This makes that convention mechanical.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Ledger, Registry, Verdict}

  defp at(n), do: {"2026-07-25T19:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_438_000_000_000_000 + n}

  defp auth, do: %{"kind" => "adjudication", "granted_by" => "michael", "ref" => "PHASE-3.md#3.4"}

  defp registered do
    {:ok, l} =
      Registry.register(Ledger.new(), %{
        gate: "g-one",
        pass_condition: "Both the offline arm and the live arm hold.",
        falsifies_condition: "Either arm fails.",
        pre_registration_path: "docs/control-plane/phases/PHASE-3.md",
        actor: "claude",
        role: "agent",
        authorization: auth(),
        at: at(1)
      })

    l
  end

  defp author(extra) do
    Verdict.author(
      registered(),
      Map.merge(
        %{
          gate: "g-one",
          verdict: "PARTIAL",
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

  test "F3 — a bare PARTIAL is refused, and the refusal says what is missing" do
    assert {:error, reason} = author(%{})
    assert inspect(reason) =~ "PARTIAL"
    assert inspect(reason) =~ ~r/holds|sub.?claim/i
  end

  test "F3 — an empty, blank or nil holding sub-claim is refused too" do
    for holds <- ["", "   ", "\n", nil] do
      assert {:error, _} = author(%{holds: holds}), "#{inspect(holds)} was accepted as a sub-claim"
    end
  end

  test "F3 — a sub-claim that says nothing is refused; it must be substantive" do
    for holds <- ["partial", "some", "n/a", "TBD", "-", "?"] do
      assert {:error, _} = author(%{holds: holds}), "#{inspect(holds)} was accepted as a sub-claim"
    end
  end

  test "a PARTIAL that names what holds is accepted, and the ledger carries the words" do
    assert {:ok, l} = author(%{holds: "The offline arm holds; the live arm was not run."})

    v = Verdict.of(l, "g-one")
    assert v.verdict == "PARTIAL"
    assert v.holds == "The offline arm holds; the live arm was not run."

    [_reg, entry] = Ledger.entries(l)
    assert entry["resulting"]["holds"] == "The offline arm holds; the live arm was not run."
    assert :ok = Ledger.verify(l)
  end

  test "only PARTIAL requires it — the other four are refused if they supply one" do
    for v <- ~w(PASS FAIL WITHHELD PENDING) do
      assert {:ok, _} = author(%{verdict: v}), "#{v} should not need a holding sub-claim"

      assert {:error, reason} = author(%{verdict: v, holds: "the offline arm"}),
             "#{v} accepted a holding sub-claim, which only PARTIAL may carry"

      assert inspect(reason) =~ "holds"
    end
  end

  test "the four PARTIAL rows in the canonical ledger each say what holds — the convention this encodes" do
    rows =
      Path.expand("../../../evidence/gates.ndjson", __DIR__)
      |> File.read!()
      |> String.split(~r/\r?\n/, trim: true)
      |> Enum.map(&JSON.decode!/1)
      |> Enum.reduce(%{}, fn r, acc -> Map.put(acc, r["name"], r) end)
      |> Map.values()
      |> Enum.filter(&(&1["verdict"] == "PARTIAL"))

    assert length(rows) == 4, "expected the four live PARTIAL gates"

    for r <- rows do
      assert String.length(r["notes"] || "") > 40,
             "#{r["name"]} is PARTIAL with no substantive notes — the convention this test encodes is broken upstream"
    end
  end
end
