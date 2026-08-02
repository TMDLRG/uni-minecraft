defmodule SP.ControlPlane.LedgerHasNotFallenOutOfPracticeTest do
  @moduledoc """
  Phase 9 step 2.6 — every step marked done has a ledger entry, and nothing about that can go quiet.

  Pre-registered falsifier: **"the ledger falls out of practice again, silently — which is exactly what
  happened after Phase 5"**.

  That is the whole history of this body's failure. The Control Plane gained the capability to record in
  Phase 4, used it once in Phase 5, and then stopped. Two further phases executed and left no entry. Nothing
  failed, nothing warned, nothing noticed — for four phases. The capability was never lost; the PRACTICE
  was, and a practice that lapses silently is indistinguishable from one that never existed.

  So the guard is not "can the ledger record?" — Phase 4 already proved it could, and that proved nothing.
  It is: **does the record still match the work?** Every step the plan marks DONE must be accounted for in
  the ledger, either by its own entry or by an ingested account that names it. When they diverge, this
  fails, loudly, in the suite everyone runs. The silence is the defect, so the guard's only job is to be
  incapable of silence.

  ## Coverage by an ingested account is legitimate, and hash-bound

  Phase 9's own Stages 0-2 are covered by the prelude the ledger INGESTED (step 2.5), not by per-step
  entries — the recorder was broken while that work happened and could not write per-step. That account is
  named by hash in the ledger, and step 2.5's guard already asserts the hash still matches the file. So
  coverage here means "named in the ledger, or named in an account the ledger ingested and can still
  verify" — never "someone says so".
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Recorder

  @repo File.cwd!()
  @dir Path.join(@repo, "evidence/control_plane")
  @plan Path.join(@repo, "evidence/remediation/phase9_plan.json")

  defp entries do
    {:ok, e} = Recorder.stored(@dir)
    e
  end

  # STEPS **AND BUILDS**. Corrected 2026-07-28, and the gap is the whole failure mode reappearing
  # one level down inside the guard built to prevent it.
  #
  # This read `s["steps"]` only. Step 4.6 is IN_PROGRESS, so it was filtered out at the status check
  # — AND ITS SIX DONE BUILDS WENT WITH IT. Six shipped builds (L0..L5), two receipts on disk, zero
  # ledger entries, and this guard could not see any of it. The moduledoc above describes exactly
  # that: "work continued, the record did not, and nothing noticed". It was written about Phase 5
  # and was true again, here, about the file asserting it.
  #
  # A build is a unit of work that ships, carries its own receipt and gets its own commit. If it is
  # DONE it must be accounted for, whatever the status of the step containing it.
  defp plan_done_steps do
    @plan
    |> File.read!()
    |> JSON.decode!()
    |> Map.get("stages", [])
    |> Enum.flat_map(fn s ->
      steps = s["steps"] || []

      done_steps =
        steps
        |> Enum.filter(&(&1["status"] == "DONE"))
        |> Enum.map(&{s["id"], &1["id"]})

      done_builds =
        Enum.flat_map(steps, fn step ->
          (step["builds"] || [])
          |> Enum.filter(&(&1["status"] == "DONE"))
          |> Enum.map(&{s["id"], "#{step["id"]}/#{&1["id"]}"})
        end)

      done_steps ++ done_builds
    end)
  end

  # Every step id the ledger accounts for: named directly by an entry, or listed inside an account the
  # ledger ingested (whose hash step 2.5's guard independently checks against the file on disk).
  defp covered_step_ids do
    Enum.reduce(entries(), MapSet.new(), fn e, acc ->
      from_account =
        e
        |> get_in(["resulting", "stages"])
        |> case do
          list when is_list(list) -> Enum.flat_map(list, &(&1["steps_done"] || []))
          _ -> []
        end

      direct = List.wrap(get_in(e, ["resulting", "step"]))

      Enum.reduce(from_account ++ direct, acc, &MapSet.put(&2, &1))
    end)
  end

  test "the plan and the ledger are both readable — the check cannot pass by not running" do
    assert File.exists?(@plan), "the plan is missing; a coverage check with nothing to compare is not a pass"
    assert length(entries()) > 0, "the ledger is empty"
    assert plan_done_steps() != [], "no step is marked DONE; this guard would be vacuous"
  end

  test "THE FALSIFIER: every step the plan marks DONE is accounted for in the ledger" do
    covered = covered_step_ids()

    missing =
      plan_done_steps()
      |> Enum.reject(fn {_stage, step} -> MapSet.member?(covered, step) end)
      |> Enum.map(fn {stage, step} -> "stage #{stage} step #{step}" end)

    assert missing == [],
           "THE LEDGER HAS FALLEN OUT OF PRACTICE. These steps are marked DONE in the plan but are " <>
             "accounted for nowhere in the ledger:\n  " <>
             Enum.join(missing, "\n  ") <>
             "\n\nThat is exactly what happened after Phase 5: work continued, the record did not, and " <>
             "nothing noticed for four phases. Re-run the recorder for these steps, or correct the plan " <>
             "if they are not actually done. Do not silence this test."
  end

  # M1: the guard must FIRE on a step covered nowhere. A coverage check that cannot fail is the silence it
  # exists to prevent, wearing a green tick.
  test "the guard bites: a DONE step covered nowhere is reported" do
    covered = covered_step_ids()
    fabricated = {"9", "99.99-this-step-was-never-recorded"}

    missing =
      [fabricated]
      |> Enum.reject(fn {_stage, step} -> MapSet.member?(covered, step) end)

    assert missing == [fabricated],
           "a step that is recorded nowhere was reported as covered — the coverage check is vacuous"
  end

  # The guard must SEE builds at all — not merely tolerate them. Without this, reverting the change
  # that added them would restore the blindness and every other test here would still pass.
  test "the guard reads BUILDS as well as steps" do
    done = plan_done_steps()
    builds = Enum.filter(done, fn {_stage, id} -> String.contains?(id, "/") end)

    assert builds != [],
           "no DONE build is in the coverage set. This guard read `steps` only until 2026-07-28, and " <>
             "step 4.6 being IN_PROGRESS hid its six DONE builds completely — six shipped units of " <>
             "work, accounted for nowhere, invisible to the guard whose whole purpose is to notice " <>
             "exactly that. If the plan genuinely has no DONE builds, this test must be re-read " <>
             "deliberately rather than deleted."
  end

  # M6 negative control: a step that IS covered must not be reported, or the guard cries wolf and gets muted,
  # which is how a guard becomes silence by another route.
  test "no false alarm: a step named in an ingested account counts as covered" do
    covered = covered_step_ids()

    assert MapSet.member?(covered, "0.1"),
           "step 0.1 is named in the ingested account but was not counted as covered; a guard that fires " <>
             "on correctly-recorded work will be muted, and a muted guard is the silence it exists to prevent"
  end
end
