defmodule SP.ControlPlane.GateRowAndStoreDirectTest do
  @moduledoc """
  Phase 9 step 2.1 — DIRECT tests for the two functions that had none.

  `GateRow.new/1` builds the canonical evidence row. `Store.write_artifact/*` is the ONLY public disk write
  on the body. Both were exercised only INCIDENTALLY, through tests whose subject was something else, so no
  test named either as what it was checking. A function covered only by accident is covered until the day
  the accident stops.

  The pre-registered falsifier for 2.1 is exact:

      "a path traversal escapes the declared directory"

  It held. `write_artifact/2` took a path and wrote it: `File.mkdir_p!(Path.dirname(path))` then
  `File.write!(path, contents)`. No containment, no notion of a declared directory at all. Its only caller,
  `Run.score_to/3`, builds `Path.join(dir, "score_\#{run_id}.json")` — so a run_id carrying `..` walked
  straight out of `dir`, and an absolute path ignored `dir` entirely.

  M2 (independent reimplementation): containment is re-derived here with `Path.expand/1` and a prefix test
  written independently of the module's own implementation. M6 (negative control): an ordinary filename must
  still be written, or "refuses everything" would pass as security.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{GateRow, Store}

  @valid %{
    "schema_version" => 1,
    "name" => "phase9-step-2-1",
    "verdict" => "PASS",
    "evidence_class" => "C",
    "phase" => "9",
    "last_updated" => "2026-07-27",
    "pre_registration_path" => "",
    "receipt_path" => "docs/receipts/control-plane/phase9_step21.md"
  }

  describe "GateRow.new/1 — the canonical evidence builder, tested as itself" do
    test "accepts a conforming row and returns it string-keyed" do
      assert {:ok, row} = GateRow.new(@valid)
      assert row["name"] == "phase9-step-2-1"
      assert row["verdict"] == "PASS"
      assert Enum.all?(Map.keys(row), &is_binary/1), "every key must be a string, whatever the caller passed"
    end

    test "atom keys and string keys produce the SAME row — the caller cannot create two shapes" do
      atomised = %{
        schema_version: 1,
        name: "phase9-step-2-1",
        verdict: "PASS",
        evidence_class: "C",
        phase: "9",
        last_updated: "2026-07-27",
        pre_registration_path: "",
        receipt_path: "docs/receipts/control-plane/phase9_step21.md"
      }

      assert {:ok, from_atoms} = GateRow.new(atomised)
      assert {:ok, from_strings} = GateRow.new(@valid)
      assert from_atoms == from_strings
    end

    test "refuses a verdict outside the controlled vocabulary" do
      assert {:error, errors} = GateRow.new(Map.put(@valid, "verdict", "MOSTLY_FINE"))
      assert is_list(errors) and errors != []
    end

    test "refuses a row missing a required field, and says which" do
      assert {:error, errors} = GateRow.new(Map.delete(@valid, "name"))
      assert Enum.any?(errors, &(&1 =~ "name")), "the error must name the missing field: #{inspect(errors)}"
    end

    test "a refusal returns errors and NOT a row — a rejected row must never be usable" do
      refute match?({:ok, _}, GateRow.new(%{}))
    end
  end

  describe "Store.write_artifact/3 — containment against the declared directory" do
    setup do
      dir = Path.join(System.tmp_dir!(), "uni_store_direct_#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf(dir) end)
      {:ok, dir: dir}
    end

    # M6 NEGATIVE CONTROL: a gate that refuses everything is not containment, it is breakage.
    test "writes an ordinary artifact inside the declared directory", %{dir: dir} do
      assert {:ok, path} = Store.write_artifact(dir, "score_run-1.json", ~s({"ok":true}))
      assert File.read!(path) == ~s({"ok":true})
      assert Path.expand(path) |> String.starts_with?(Path.expand(dir))
    end

    # THE FALSIFIER, in every shape it takes.
    test "REFUSES a name that traverses out of the declared directory", %{dir: dir} do
      for name <- ["../escaped.json", "../../escaped.json", "sub/../../escaped.json", "./../escaped.json"] do
        assert {:error, {:escapes_declared_directory, _}} = Store.write_artifact(dir, name, "x"),
               "#{name} must be refused"
      end

      # M2: re-derive containment independently and confirm nothing landed outside.
      parent = Path.expand(Path.join(dir, ".."))
      refute File.exists?(Path.join(parent, "escaped.json")), "a refused write still created the file"
    end

    test "REFUSES an absolute path, which ignores the declared directory entirely", %{dir: dir} do
      outside = Path.join(System.tmp_dir!(), "uni_absolute_escape_#{System.unique_integer([:positive])}.json")
      assert {:error, {:escapes_declared_directory, _}} = Store.write_artifact(dir, outside, "x")
      refute File.exists?(outside)
    end

    test "REFUSES a directory separator in the name — an artifact is a file, not a tree", %{dir: dir} do
      assert {:error, {:escapes_declared_directory, _}} = Store.write_artifact(dir, "nested/score.json", "x")
    end

    test "refuses empty and dot names rather than writing something surprising", %{dir: dir} do
      for name <- ["", ".", ".."] do
        assert {:error, {:escapes_declared_directory, _}} = Store.write_artifact(dir, name, "x"),
               "#{inspect(name)} must be refused"
      end
    end

    # The refusal must be a VALUE, not an exception: a caller has to be able to handle it.
    test "a refusal is returned, never raised", %{dir: dir} do
      assert {:error, _} = Store.write_artifact(dir, "../x.json", "x")
    end
  end

  describe "Run.score_to/3 — the caller cannot smuggle a traversal through a run_id" do
    test "a run_id carrying .. cannot write outside the declared directory" do
      dir = Path.join(System.tmp_dir!(), "uni_score_to_#{System.unique_integer([:positive])}")
      File.mkdir_p!(dir)
      on_exit(fn -> File.rm_rf(dir) end)

      run = %{run_id: "../../pwned", planned_n: 1, stopping_rule: "fixed", halted: false}

      result =
        try do
          SP.ControlPlane.Run.score_to(run, dir, fn -> %{"x" => 1} end)
        rescue
          e -> {:raised, e}
        end

      refute match?({:ok, _}, result),
             "a run_id containing .. produced a successful write: #{inspect(result)}"

      parent = Path.expand(Path.join(dir, ".."))
      refute File.exists?(Path.join(parent, "pwned.json"))
      refute File.exists?(Path.expand(Path.join(dir, "../../pwned.json")))
    end
  end
end
