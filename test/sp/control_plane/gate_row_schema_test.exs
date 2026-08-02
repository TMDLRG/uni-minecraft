defmodule SP.ControlPlane.GateRowSchemaTest do
  @moduledoc """
  Phase 2 · F5 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a row with `verdict: "MOSTLY_PASS"` is accepted.

  `SP.ControlPlane.GateRow` validates against production/schemas/gate_row.schema.json
  in hand-written Elixir with stdlib `JSON`. There is no schema library in the root
  app and there will not be one (ADR-0006 — deps: [] is a written contract).

  This test does NOT re-check receipt_path existence. That is already enforced by
  test/gate_registry_integrity_test.exs over the real ledger; duplicating it here
  would be a second oracle for the same claim.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.GateRow

  @fixtures Path.expand("../../fixtures/control_plane", __DIR__)
  @schema Path.expand("../../../production/schemas/gate_row.schema.json", __DIR__)

  defp fixture(name) do
    @fixtures |> Path.join(name) |> File.read!() |> JSON.decode!()
  end

  test "the schema this module hand-implements is on disk and is the one the ledger is judged by" do
    assert File.exists?(@schema)
    schema = @schema |> File.read!() |> JSON.decode!()

    assert schema["additionalProperties"] == false
    assert schema["required"] == ~w(schema_version name verdict receipt_path evidence_class last_updated)
    assert schema["properties"]["verdict"]["enum"] == ~w(PASS PARTIAL FAIL WITHHELD PENDING)
    assert schema["properties"]["evidence_class"]["enum"] == ~w(A B C Sec pending)
  end

  test "a well-formed row validates" do
    assert :ok = GateRow.validate(fixture("gate_row_valid.json"))
  end

  test "F5 — a verdict outside the enum is refused, and the refusal names the field" do
    assert {:error, errors} = GateRow.validate(fixture("gate_row_bad_verdict.json"))
    assert Enum.any?(errors, &(&1 =~ "verdict"))
    assert Enum.any?(errors, &(&1 =~ "MOSTLY_PASS"))
  end

  test "F5 — a key outside the schema is refused (additionalProperties: false)" do
    assert {:error, errors} = GateRow.validate(fixture("gate_row_extra_key.json"))
    assert Enum.any?(errors, &(&1 =~ "score_percent"))
  end

  test "F5 — a missing required key is refused, and the refusal names it" do
    assert {:error, errors} = GateRow.validate(fixture("gate_row_missing_required.json"))
    assert Enum.any?(errors, &(&1 =~ "receipt_path"))
  end

  test "every verdict in the enum is accepted and nothing else is" do
    base = fixture("gate_row_valid.json")

    for v <- ~w(PASS PARTIAL FAIL WITHHELD PENDING) do
      assert :ok = GateRow.validate(Map.put(base, "verdict", v)), "#{v} must be accepted"
    end

    for v <- ["pass", "Pass", "OK", "93%", "", "MOSTLY_PASS"] do
      assert {:error, _} = GateRow.validate(Map.put(base, "verdict", v)), "#{inspect(v)} must be refused"
    end
  end

  test "every evidence class in the enum is accepted and nothing else is" do
    base = fixture("gate_row_valid.json")

    for c <- ~w(A B C Sec pending) do
      assert :ok = GateRow.validate(Map.put(base, "evidence_class", c))
    end

    for c <- ~w(D sec PENDING a) do
      assert {:error, _} = GateRow.validate(Map.put(base, "evidence_class", c))
    end
  end

  test "schema_version is const 1" do
    base = fixture("gate_row_valid.json")
    assert {:error, errors} = GateRow.validate(Map.put(base, "schema_version", 2))
    assert Enum.any?(errors, &(&1 =~ "schema_version"))
  end

  test "name must be kebab-case" do
    base = fixture("gate_row_valid.json")

    for good <- ~w(motor-red g-pa gaia-slice1-live a) do
      assert :ok = GateRow.validate(Map.put(base, "name", good))
    end

    for bad <- ["Motor-Red", "motor_red", "motor red", "-motor", "motor-", "motor--red", ""] do
      assert {:error, _} = GateRow.validate(Map.put(base, "name", bad)), "#{inspect(bad)} is not kebab-case"
    end
  end

  test "last_updated must be a real ISO date" do
    base = fixture("gate_row_valid.json")

    assert :ok = GateRow.validate(Map.put(base, "last_updated", "2026-02-28"))

    for bad <- ["2026-7-25", "25-07-2026", "2026-13-01", "2026-02-30", "today", ""] do
      assert {:error, _} = GateRow.validate(Map.put(base, "last_updated", bad)),
             "#{inspect(bad)} is not a date"
    end
  end

  test "supersedes, when present, is a list of strings" do
    base = fixture("gate_row_valid.json")

    assert :ok = GateRow.validate(Map.put(base, "supersedes", []))
    assert :ok = GateRow.validate(Map.put(base, "supersedes", ["motor-red"]))
    assert {:error, _} = GateRow.validate(Map.put(base, "supersedes", "motor-red"))
    assert {:error, _} = GateRow.validate(Map.put(base, "supersedes", [1]))
  end

  # ---------------------------------------------------------------------------
  # ADVERSE RESULT, found by writing this validator and recorded rather than
  # smoothed away.
  #
  # The canonical ledger violates its own schema in exactly twelve places. Rows
  # 112–123 carry "pre_registration_path": null. The schema declares that field
  # "type": "string", and JSON Schema 2020-12 does not admit null for a string.
  #
  # It has never been caught because the enforcing test is more permissive than
  # the thing it enforces: test/gate_registry_integrity_test.exs:61 reads
  # `if row["pre_registration_path"] not in [nil, ""]`, which steps over null
  # deliberately — that line guards receipt EXISTENCE and was never meant to
  # type-check. Nothing else type-checks it either.
  #
  # This validator is NOT weakened to accept null; that would be laundering a
  # violation into conformance. The ledger is NOT edited; it is append-only and
  # rewriting twelve historical rows is not Phase 2's to do. The disagreement is
  # pinned by name below, so a thirteenth instance fails this test and so does a
  # silent repair.
  #
  # RESOLVED 2026-07-25, Phase 3 item 3.1, operator-authorised (option A).
  # Eleven superseding rows were appended — eleven, not twelve, because
  # broadcast-test-stages-honest accounts for two of the violations. Each carries
  # `""` instead of `null` and changes nothing else.
  #
  # THE ASSERTIONS BELOW STILL HOLD, AND MUST. The ledger is append-only: the
  # twelve original rows remain at indices 112-123 forever and remain
  # non-conformant. That is the record, not a bug. Conformance is now true of the
  # EFFECTIVE state — the last row per gate name — which is what every reader
  # resolves to, and that is asserted separately in
  # ledger_schema_conformance_test.exs. Keeping both tests keeps the two claims
  # from being confused for one another.
  # ---------------------------------------------------------------------------

  @known_null_pre_registration ~w(
    broadcast-test-stages-honest
    status-endpoint-honest
    gaia-probe-not-envelope
    broadcast-test-stages-honest
    publisher-pin-claim-retracted
    cc-writestate-honest-freshness
    cc-status-honest-fields
    cc-per-endpoint-fanout-rows
    cc-broadcast-metadata-surface
    cc-glass-badge-honest-rename
    music-service-integration-first-class
    cam-mic-hardened-defaults
  )

  defp canonical_rows do
    Path.expand("../../../evidence/gates.ndjson", __DIR__)
    |> File.read!()
    |> String.split(~r/\r?\n/, trim: true)
    |> Enum.map(&JSON.decode!/1)
  end

  test "every canonical row passes this validator EXCEPT twelve that violate the schema, named here" do
    rows = canonical_rows()
    assert length(rows) > 100, "expected the canonical ledger, not a stub"

    refused =
      rows
      |> Enum.with_index(1)
      |> Enum.reject(fn {row, _idx} -> GateRow.validate(row) == :ok end)

    assert Enum.map(refused, fn {row, _} -> row["name"] end) == @known_null_pre_registration,
           "the set of schema-violating canonical rows changed:\n" <>
             Enum.map_join(refused, "\n", fn {row, idx} ->
               "  row #{idx} #{row["name"]}: #{inspect(GateRow.validate(row))}"
             end)

    assert Enum.map(refused, fn {_, idx} -> idx end) == Enum.to_list(112..123)
  end

  test "the twelve are refused for exactly one reason, and it is pre_registration_path being null" do
    for {row, _idx} <-
          canonical_rows()
          |> Enum.with_index(1)
          |> Enum.filter(fn {row, _} -> GateRow.validate(row) != :ok end) do
      assert {:error, [reason]} = GateRow.validate(row)
      assert reason == "pre_registration_path must be a string, got nil"
      assert row["pre_registration_path"] == nil
    end
  end

  test "the enforcing test that should have caught this steps over null on purpose, and still does" do
    integrity = Path.expand("../../gate_registry_integrity_test.exs", __DIR__) |> File.read!()

    assert integrity =~ ~s|if row["pre_registration_path"] not in [nil, ""] do|,
           "the tolerance this finding depends on has moved — re-derive the finding before trusting it"
  end
end
