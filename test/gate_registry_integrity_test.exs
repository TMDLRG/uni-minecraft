defmodule GateRegistryIntegrityTest do
  @moduledoc """
  Enforces the integrity contract for evidence/gates.ndjson (A-A1):
    - Every row parses as JSON.
    - Every row conforms to production/schemas/gate_row.schema.json's required fields.
    - Every row's receipt_path exists in the working tree.
    - Every row's pre_registration_path (if present + non-empty) exists.

  This is the gate-registry integrity guard the plan (A-A1) promises. It fails
  fast so CI catches drift (a row whose receipt was renamed/deleted).
  """
  use ExUnit.Case, async: true

  @gates_path Path.expand("../evidence/gates.ndjson", __DIR__)
  @required_keys ~w(schema_version name verdict receipt_path evidence_class last_updated)
  @valid_verdicts ~w(PASS PARTIAL FAIL WITHHELD PENDING)
  @valid_classes ~w(A B C Sec pending)

  test "evidence/gates.ndjson exists and every row is integrous" do
    assert File.exists?(@gates_path),
           "evidence/gates.ndjson is missing (A-A1) — seed it before running this test"

    lines =
      @gates_path
      |> File.read!()
      |> String.split(~r/\r?\n/, trim: true)

    assert length(lines) > 0, "evidence/gates.ndjson is empty"

    for {line, idx} <- Enum.with_index(lines, 1) do
      # Stdlib JSON (Elixir >= 1.18) — this repo is deliberately zero-dep, so
      # Jason is not (and must not become) available here.
      row =
        case JSON.decode(line) do
          {:ok, r} ->
            r

          {:error, e} ->
            flunk("row #{idx}: JSON decode failed: #{inspect(e)}\n  line: #{line}")
        end

      for k <- @required_keys do
        assert Map.has_key?(row, k), "row #{idx} (#{row["name"] || "unnamed"}) missing key #{k}"
      end

      assert row["schema_version"] == 1,
             "row #{idx} (#{row["name"]}): schema_version must be 1"

      assert row["verdict"] in @valid_verdicts,
             "row #{idx} (#{row["name"]}): verdict #{inspect(row["verdict"])} not in #{inspect(@valid_verdicts)}"

      assert row["evidence_class"] in @valid_classes,
             "row #{idx} (#{row["name"]}): evidence_class #{inspect(row["evidence_class"])} not in #{inspect(@valid_classes)}"

      repo_root = Path.expand("..", __DIR__)

      # THE EMPTY STRING HAD TO BE REFUSED FIRST, AND UNTIL 2026-07-28 IT WAS NOT.
      #
      # `Path.join(repo_root, "")` is `repo_root`, and the repository root exists — so a row carrying
      # `"receipt_path": ""` sailed through the assertion below by pointing at the directory the
      # check was standing in. Found by the L5 desk, whose every generated row has exactly that
      # shape, and it is a hole in the guard the entire gate ledger leans on rather than a defect in
      # the thing that found it.
      assert row["receipt_path"] not in [nil, ""],
             "row #{idx} (#{row["name"]}): receipt_path is empty. A row with no receipt is a claim " <>
               "with no evidence — and `Path.join(root, \"\")` is the root itself, so an empty " <>
               "value used to satisfy the existence check below by naming the repository."

      receipt = Path.join(repo_root, row["receipt_path"])

      assert File.exists?(receipt),
             "row #{idx} (#{row["name"]}): receipt_path #{row["receipt_path"]} does not exist"

      refute File.dir?(receipt),
             "row #{idx} (#{row["name"]}): receipt_path #{row["receipt_path"]} is a DIRECTORY. " <>
               "`File.exists?/1` is true for directories, so existence alone never established " <>
               "that a receipt is a document somebody can read."

      if row["pre_registration_path"] not in [nil, ""] do
        pre = Path.join(repo_root, row["pre_registration_path"])

        assert File.exists?(pre),
               "row #{idx} (#{row["name"]}): pre_registration_path #{row["pre_registration_path"]} does not exist"
      end
    end
  end
end
