defmodule SP.ControlPlane.LedgerSchemaConformanceTest do
  @moduledoc """
  Phase 3 item 3.1 (`docs/control-plane/phases/PHASE-3.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CORRECTION EXISTS, for this reason:
    the canonical ledger's EFFECTIVE state contains rows the schema rejects,
    and nothing fails.

  ## What "the ledger conforms" can and cannot mean

  `evidence/gates.ndjson` is **append-only**. The twelve rows that carry
  `"pre_registration_path": null` are historical fact and stay in the file
  forever. They are not edited, and no correction can remove them.

  So conformance is a claim about the **effective state** — the last row per
  gate name, which is what every reader (`render_gates.cjs`, UNI TRACK, Gaia's
  gates seat) actually resolves to. That is what item 3.1 establishes, and it is
  the only form of the claim that append-only discipline permits.

  This file therefore asserts three separate things, and keeps them separate:

    1. every EFFECTIVE row validates            — red before the correction, green after
    2. the twelve historical violations SURVIVE  — a guard against "fixing" by editing
    3. each correction changes ONLY the field it was authored to change
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.GateRow

  @gates Path.expand("../../../evidence/gates.ndjson", __DIR__)

  @corrected ~w(
    broadcast-test-stages-honest
    status-endpoint-honest
    gaia-probe-not-envelope
    publisher-pin-claim-retracted
    cc-writestate-honest-freshness
    cc-status-honest-fields
    cc-per-endpoint-fanout-rows
    cc-broadcast-metadata-surface
    cc-glass-badge-honest-rename
    music-service-integration-first-class
    cam-mic-hardened-defaults
  )

  defp rows do
    @gates
    |> File.read!()
    |> String.split(~r/\r?\n/, trim: true)
    |> Enum.map(&JSON.decode!/1)
  end

  defp effective(rows) do
    rows
    |> Enum.reduce(%{}, fn row, acc -> Map.put(acc, row["name"], row) end)
    |> Map.values()
  end

  test "3.1 — every EFFECTIVE row validates against gate_row.schema.json" do
    refused =
      rows()
      |> effective()
      |> Enum.reject(&(GateRow.validate(&1) == :ok))

    assert refused == [],
           "the effective state of the ledger does not conform:\n" <>
             Enum.map_join(refused, "\n", fn r ->
               "  #{r["name"]}: #{inspect(GateRow.validate(r))}"
             end)
  end

  test "the twelve historical violations SURVIVE — a correction must never be an edit" do
    violations =
      rows()
      |> Enum.with_index(1)
      |> Enum.filter(fn {r, _} -> Map.get(r, "pre_registration_path", :absent) == nil end)

    assert Enum.map(violations, fn {_, i} -> i end) == Enum.to_list(112..123),
           "the historical violations moved or vanished — the ledger was edited, not appended to"
  end

  test "each corrected gate now resolves to a conforming row that supersedes its predecessor" do
    by_name = Map.new(rows(), fn r -> {r["name"], r} end)

    for name <- @corrected do
      row = by_name[name]
      assert row, "#{name} is not in the ledger at all"
      assert :ok = GateRow.validate(row), "#{name} still does not validate"
      assert row["pre_registration_path"] == "", "#{name} must carry \"\", not null"
      assert name in (row["supersedes"] || []), "#{name} must record what it supersedes"
    end
  end

  test "a correction changed ONLY pre_registration_path, supersedes and notes — never a verdict" do
    all = rows()
    by_name_all = Enum.group_by(all, & &1["name"])

    for name <- @corrected do
      versions = by_name_all[name]
      assert length(versions) >= 2, "#{name} has no prior version to compare against"

      [prior, current] = Enum.take(versions, -2)

      for field <- ~w(schema_version name phase pass_condition falsifies_condition
                      receipt_path verdict evidence_class last_updated) do
        assert Map.get(prior, field) == Map.get(current, field),
               "#{name}: a schema-conformance correction must not change #{field} " <>
                 "(#{inspect(Map.get(prior, field))} -> #{inspect(Map.get(current, field))})"
      end

      assert prior["pre_registration_path"] == nil
      assert current["pre_registration_path"] == ""
    end
  end

  test "the correction is recorded in the notes of every row it touched, not only in a commit message" do
    by_name = Map.new(rows(), fn r -> {r["name"], r} end)

    for name <- @corrected do
      assert by_name[name]["notes"] =~ "SCHEMA-CONFORMANCE CORRECTION 2026-07-25",
             "#{name}: the row must say why it exists — a reader of the ledger alone must be able to tell"
    end
  end

  # The frozen tally is a drift guard on the 2026-07-25 schema correction: it must have moved no
  # science. It is deliberately a whole-ledger freeze rather than a check confined to the corrected
  # rows, because a correction that quietly flipped an UNRELATED verdict is exactly the failure worth
  # catching, and a scoped check would not see it.
  #
  # The cost of that choice is that a legitimately added row also moves it, and then the expectation
  # has to be amended ON PURPOSE with the reason written down. That is the intended cost, not a
  # defect: a number that may only change deliberately is the point.
  #
  # AMENDED 2026-08-01: PASS 92 → 93.
  #   Cause: one new row, `relay-probe-cached`, landed in commit 2dcbfd2 ("TTL-cache the off-box
  #   node2 relay probe"). It is a single PASS row for a gate that did not previously exist in the
  #   ledger — an addition, superseding nothing, and it changes no prior row's verdict.
  #   Effective ledger measured at the time of amendment: 207 rows, 110 unique names,
  #   93 PASS · 4 PARTIAL · 12 PENDING · 1 FAIL.
  #
  #   THIS TEST WAS RED AND NOBODY SAW IT. CI compiles with --warnings-as-errors and one unused
  #   alias in lib/mix/tasks/sp.uni.prove.ex failed the compile step, so `mix test` never executed in
  #   CI at all — across the entire recorded history of the workflow. The suite has been running only
  #   where someone ran it by hand. That is why a stale expectation survived a row landing.
  #
  # AMENDED 2026-08-24: PASS 93 → 94, PARTIAL 4 → 5.
  #   Cause: exactly TWO NEW gate names since the 2026-08-01 baseline (commit de32604), both
  #   additions that supersede nothing and move no existing gate:
  #     `radio-bed-rolling`                     PASS     (commit 4f05a3a)
  #     `camera-mic-ducking-and-slot-awareness` PARTIAL  (commit de511ef, receipt
  #                                                       docs/receipts/camera_mic_ducking_pre_reg_2026-08-03.md)
  #   Verified by diffing the EFFECTIVE per-name verdict map at de32604 against this tree before
  #   touching the number: 2 NEW, 0 MOVED, 0 GONE. So this test's own claim -- that no gate's
  #   verdict changed -- is still literally true; what moved is the population, not a verdict.
  #   Effective ledger at amendment: 212 rows, 112 unique names,
  #   94 PASS · 5 PARTIAL · 12 PENDING · 1 FAIL.
  #
  #   The guard did its job. It was red because the ledger legitimately grew, which is the intended
  #   cost written down directly above -- not a defect, and not a reason to loosen the assertion.
  test "no gate's verdict tally changed — this correction moved no science" do
    tally =
      rows()
      |> effective()
      |> Enum.frequencies_by(& &1["verdict"])

    assert tally == %{"PASS" => 94, "PARTIAL" => 5, "FAIL" => 1, "PENDING" => 12},
           "the effective verdict tally moved: #{inspect(tally)}"
  end
end
