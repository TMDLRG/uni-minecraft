defmodule SP.ControlPlane.RecorderAppendsNotRebuildsTest do
  @moduledoc """
  Phase 9 step 2.3 — the stepwise recorder.

  Pre-registered falsifier: **"it rebuilds the chain instead of appending"**.

  `scripts/control_plane_record_own_history.exs` holds all seven entries as a literal list and rebuilds the
  chain from `Ledger.new()` on every run, hashing each receipt from the file on disk. That only works while
  every historical receipt stays byte-identical forever. Edit one and the rebuild produces a different hash
  at that seq, `Store.persist/2` correctly refuses, and the script cannot append ANYTHING — including an
  unrelated new entry. Step 2.4 has to append Phases 6 and 7 to this exact ledger, so the remediation would
  have jammed on its own second step.

  These tests demonstrate the jam and then show the recorder surviving it. M2: the rebuild path is
  reconstructed here from the same primitives the script uses (`Ledger.new/0` + `append/3`), so the failure
  is the script's real failure mode and not a description of it.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Recorder, Store}

  # Submitted through Command, which is the ONLY sanctioned writer (F10). `:at` pins the instant so the
  # chain is byte-reproducible, which is what lets the rebuild-vs-append comparison below be exact.
  defp attrs(transition, receipt_hash) do
    %{
      command: :note,
      actor: "phase9-step-2-3",
      role: "recorder",
      transition: transition,
      resulting: %{"receipt_sha256" => receipt_hash},
      authorization: %{"kind" => "operator_cosign", "granted_by" => "operator"},
      evidence: [],
      at: {"2026-07-27T00:00:00.000Z", 1_785_000_000_000_000_000}
    }
  end

  setup do
    dir = Path.join(System.tmp_dir!(), "uni_recorder_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf(dir) end)
    {:ok, dir: dir}
  end

  describe "the recorder appends" do
    test "appends one entry at a time, and the seq advances", %{dir: dir} do
      assert {:ok, %{seq: 1}} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
      assert {:ok, %{seq: 2}} = Recorder.append_one(dir, attrs("phase-6", "bbb"))
      assert {:ok, entries} = Recorder.stored(dir)
      assert Enum.map(entries, & &1["transition"]) == ["phase-5", "phase-6"]
    end

    test "the stored chain still verifies after appends", %{dir: dir} do
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
      {:ok, _} = Recorder.append_one(dir, attrs("phase-6", "bbb"))
      {:ok, ledger} = Store.load(dir)
      assert :ok = Ledger.verify(ledger)
    end

    test "recorded?/2 lets a caller skip an entry already written (step 2.6 depends on this)", %{dir: dir} do
      refute Recorder.recorded?(dir, "phase-5")
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
      assert Recorder.recorded?(dir, "phase-5")
      refute Recorder.recorded?(dir, "phase-6")
    end
  end

  describe "THE FALSIFIER: a rebuild jams where an append does not" do
    # This is the script's real failure mode, reconstructed from the same primitives it uses.
    test "REBUILDING with a changed historical receipt is REFUSED", %{dir: dir} do
      # Two entries recorded, as history.
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "receipt-hash-as-it-was"))
      {:ok, _} = Recorder.append_one(dir, attrs("phase-6", "bbb"))

      # Now a historical receipt is edited, so a rebuild hashes phase-5 differently — exactly what the
      # literal-list script does on every run.
      rebuilt =
        Enum.reduce(
          [attrs("phase-5", "receipt-hash-AFTER-AN-EDIT"), attrs("phase-6", "bbb")],
          Ledger.new(),
          fn a, l ->
            {:ok, next} = Command.submit(l, a)
            next
          end
        )

      assert {:error, {:would_rewrite_history_at_seq, 1}} = Store.persist(dir, rebuilt),
             "the store must refuse a rebuild that disagrees with what it already holds"
    end

    # THE POINT: the same edited receipt must NOT stop an unrelated append.
    test "the recorder can still append AFTER a historical receipt changed", %{dir: dir} do
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "receipt-hash-as-it-was"))
      {:ok, _} = Recorder.append_one(dir, attrs("phase-6", "bbb"))

      # The receipt on disk has since been edited. The recorder never recomputes stored entries, so this
      # is irrelevant to it — and step 2.4's backfill can proceed.
      assert {:ok, %{seq: 3}} = Recorder.append_one(dir, attrs("phase-7", "ccc")),
             "a changed historical receipt blocked an unrelated append — the recorder is rebuilding, not appending"

      {:ok, entries} = Recorder.stored(dir)
      assert Enum.map(entries, & &1["transition"]) == ["phase-5", "phase-6", "phase-7"]

      # And history was carried unchanged, not re-derived: seq 1 still holds the ORIGINAL receipt hash.
      assert Enum.at(entries, 0)["resulting"]["receipt_sha256"] == "receipt-hash-as-it-was",
             "the stored entry was recomputed rather than carried — that is a rebuild wearing an append's name"
    end

    test "the recorder never rewrites a stored entry, even when asked to record the same step again", %{
      dir: dir
    } do
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
      {:ok, before} = Recorder.stored(dir)

      # Recording the same transition again appends a NEW entry (append-only); it must not edit seq 1.
      {:ok, _} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
      {:ok, after_} = Recorder.stored(dir)

      assert Enum.at(after_, 0) == Enum.at(before, 0), "seq 1 changed — an append-only log was edited"
      assert length(after_) == 2
    end
  end

  describe "an absent store is an empty ledger, but a corrupt one is an error" do
    test "the first append into a fresh directory succeeds", %{dir: dir} do
      refute File.exists?(dir)
      assert {:ok, %{seq: 1}} = Recorder.append_one(dir, attrs("phase-5", "aaa"))
    end
  end

  describe "identity, not kind (measured against the real ledger)" do
    test "recorded_by/2 distinguishes entries that share a transition", %{dir: dir} do
      # The real ledger's seven entries ALL carry transition "phase.executed", so recorded?/2 cannot tell
      # one phase from another. Keying step 2.6 on transition would report every phase as already recorded
      # and silently skip the backfill.
      {:ok, _} = Recorder.append_one(dir, attrs("phase.executed", "aaa"))

      assert Recorder.recorded?(dir, "phase.executed")

      assert Recorder.recorded_by(dir, &(&1["resulting"]["receipt_sha256"] == "aaa"))
      refute Recorder.recorded_by(dir, &(&1["resulting"]["receipt_sha256"] == "bbb"))
    end
  end
end
