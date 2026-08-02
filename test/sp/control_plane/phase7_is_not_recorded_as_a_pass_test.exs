defmodule SP.ControlPlane.Phase7IsNotRecordedAsAPassTest do
  @moduledoc """
  Phase 9 step 2.4 — the backfill's falsifier, enforced permanently.

  Pre-registered falsifier: **"Phase 7 recorded as a pass rather than ACCEPTANCE NOT MET"**.

  Phase 7 did not meet its own acceptance. Two of its seven clauses fail: the witness clause (the off-box
  custodian answers the writer's OWN key, so `independent_custodians` is 0 and the anchor stands on git
  alone — tamper-evident, not unforgeable), and *"two fixtures distinguishable with no text read"*, because
  the renderer was never built, so the clause cannot be evaluated at all.

  A backfill that quietly recorded that phase as a success would be the most damaging thing this body could
  write, because the ledger exists to hold exactly this kind of fact. So this is not a check that ran once
  at write time — it reads the REAL ledger on every suite run. If anyone ever appends a Phase 7 entry
  claiming success, or supersedes the honest one with a passing one, this fails.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Recorder

  @dir Path.join(File.cwd!(), "evidence/control_plane")

  defp phase_entries(phase) do
    case Recorder.stored(@dir) do
      {:ok, entries} -> Enum.filter(entries, &(get_in(&1, ["resulting", "phase"]) == phase))
      _ -> []
    end
  end

  test "the ledger is readable and holds this programme's history" do
    assert {:ok, entries} = Recorder.stored(@dir)
    assert length(entries) >= 7, "the recorded history shrank — an append-only ledger cannot lose entries"
  end

  test "IF Phase 7 is recorded, it is NOT recorded as a pass" do
    for entry <- phase_entries(7) do
      acceptance = get_in(entry, ["resulting", "acceptance"])

      refute acceptance in ["MET", "PASS", "PASSED", "OK", true],
             "Phase 7 is recorded with acceptance=#{inspect(acceptance)} — it did not meet its own acceptance, " <>
               "and recording it as a success is this step's pre-registered falsifier"

      assert acceptance == "NOT_MET",
             "Phase 7's acceptance must be stated explicitly as NOT_MET, not left absent or vague " <>
               "(got #{inspect(acceptance)}) — silence about a failure reads as success"
    end
  end

  test "IF Phase 7 is recorded, both failing clauses are named IN the entry" do
    for entry <- phase_entries(7) do
      detail = get_in(entry, ["resulting", "acceptance_detail"]) || ""

      assert detail =~ "witness",
             "the witness clause is one of the two failures and must be named in the entry, not left to a receipt"

      assert detail =~ "renderer",
             "the unbuilt renderer is the other failure and must be named in the entry"

      assert detail =~ "2 of 7", "the entry must say HOW MANY clauses failed, not merely that some did"
    end
  end

  test "IF Phase 6 is recorded, it carries its adverse result too" do
    for entry <- phase_entries(6) do
      adverse = get_in(entry, ["resulting", "adverse"]) || ""

      assert String.length(adverse) > 0,
             "a phase recorded with no adverse result is a phase recorded incompletely"
    end
  end

  # CORRECTED after measurement: the pre-existing ledger records per ITEM, not per phase — Phase 5 has three
  # entries (5.0, 5.1, 5.2). My first version of this test asserted at most one entry per PHASE and failed
  # against the real history, which was the test being wrong, not the ledger.
  #
  # STATED LIMITATION of the 2.4 backfill: it wrote ONE SUMMARY ENTRY per phase for 6 and 7, which is a
  # coarser granularity than the per-item entries Phase 5 left. That is a real inconsistency in the record,
  # recorded here rather than smoothed over. It is defensible for a backfill written after the fact — the
  # per-item detail lives in the receipts the entries hash — but a future recorder writing live should record
  # per item, as Phase 5 did.
  test "the backfill did not duplicate itself — one entry per backfilled phase" do
    for phase <- [6, 7] do
      n = length(phase_entries(phase))

      assert n == 1,
             "phase #{phase} has #{n} entries; the backfill must skip what is already recorded " <>
               "(step 2.6 depends on not double-recording)"
    end
  end

  test "no (phase, item) pair is recorded twice — the real uniqueness the ledger keeps" do
    {:ok, entries} = Recorder.stored(@dir)

    # Only entries that identify a phase participate: account.ingested entries carry no (phase, item) and
    # would all collide on {nil, nil}, which says nothing about duplication.
    keys =
      entries
      |> Enum.map(fn e ->
        {get_in(e, ["resulting", "phase"]), get_in(e, ["resulting", "item"])}
      end)
      |> Enum.reject(&match?({nil, _}, &1))

    assert length(Enum.uniq(keys)) == length(keys),
           "a (phase, item) pair appears twice: #{inspect(keys -- Enum.uniq(keys))}"
  end
end
