defmodule SP.ControlPlane.GateRowSupersedesTest do
  @moduledoc """
  Phase 2 · F6 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a revision mutates the row it supersedes.

  The observed convention in evidence/gates.ndjson is followed, not invented:
  a revision REUSES the gate's name and lists that name in `supersedes`
  (see gaia-slice1-live, gaia-boot-persistent). The superseded row is kept.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.GateRow

  @fixtures Path.expand("../../fixtures/control_plane", __DIR__)

  defp prior, do: @fixtures |> Path.join("gate_row_valid.json") |> File.read!() |> JSON.decode!()

  test "a revision reuses the name and records the row it supersedes" do
    {:ok, rev} =
      GateRow.supersede(prior(), %{
        "verdict" => "PASS",
        "evidence_class" => "C",
        "last_updated" => "2026-07-26",
        "notes" => "Green after the seven red tests."
      })

    assert rev["name"] == prior()["name"]
    assert prior()["name"] in rev["supersedes"]
    assert rev["verdict"] == "PASS"
    assert :ok = GateRow.validate(rev)
  end

  test "F6 — the superseded row's bytes do not change" do
    before_bytes = GateRow.encode(prior())
    {:ok, _rev} = GateRow.supersede(prior(), %{"verdict" => "PASS", "evidence_class" => "C"})
    assert GateRow.encode(prior()) == before_bytes
  end

  test "F6 — appending a revision preserves the prior row verbatim in the ndjson" do
    p = prior()
    prior_line = GateRow.encode(p)

    {:ok, rev} = GateRow.supersede(p, %{"verdict" => "PASS", "evidence_class" => "C"})

    ndjson = prior_line <> "\n" <> GateRow.encode(rev) <> "\n"
    [line1, line2] = String.split(ndjson, "\n", trim: true)

    assert line1 == prior_line, "the superseded row must survive byte-identical"
    assert JSON.decode!(line1)["verdict"] == "PENDING"
    assert JSON.decode!(line2)["verdict"] == "PASS"
  end

  test "F6 — GateRow exposes no in-place mutation path at all" do
    Code.ensure_loaded!(GateRow)

    for {fun, arity} <- [update: 2, replace: 2, delete: 1, put: 3, patch: 2] do
      refute function_exported?(GateRow, fun, arity),
             "GateRow.#{fun}/#{arity} exists — a revision must be a new row, never an edit"
    end
  end

  test "supersedes accumulates across successive revisions rather than being overwritten" do
    {:ok, r1} = GateRow.supersede(prior(), %{"verdict" => "PARTIAL", "evidence_class" => "C"})
    {:ok, r2} = GateRow.supersede(r1, %{"verdict" => "PASS", "evidence_class" => "C"})

    assert prior()["name"] in r2["supersedes"]
    assert length(r2["supersedes"]) >= 1
    assert :ok = GateRow.validate(r2)
  end

  test "a revision that changes nothing is refused — a no-op is not a revision" do
    assert {:error, _} = GateRow.supersede(prior(), %{})
    assert {:error, _} = GateRow.supersede(prior(), %{"verdict" => prior()["verdict"]})
  end

  test "a revision that would produce an invalid row is refused" do
    assert {:error, errors} = GateRow.supersede(prior(), %{"verdict" => "MOSTLY_PASS"})
    assert Enum.any?(errors, &(&1 =~ "verdict"))
  end

  test "encode/1 is canonical — key order does not depend on map iteration order" do
    p = prior()
    shuffled = p |> Enum.shuffle() |> Map.new()
    assert GateRow.encode(shuffled) == GateRow.encode(p)
  end
end
