defmodule SP.ControlPlane.RunStatusRefusalsTest do
  @moduledoc """
  Phase 4 item 4.5 · F13, F14, F15 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a short run reads as complete; an overrun reads as `ELIGIBLE`.

  These three come from a real defect in the flagellum's `status.py`, where
  `actual_n > planned_n` collapsed silently into `ELIGIBLE` with no overrun flag
  and no test. The status vocabulary exists so that the difference between
  *"we did not run this"*, *"we stopped early"* and *"we ran more than we said"*
  cannot be flattened into one word.

  `CLAUDE.md`: **"never increase replicates after seeing a width."** An overrun is
  not a bonus. It is a change to the analysis that was not pre-registered, and it
  is flagged as one.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Run

  defp run(opts) do
    {:ok, r} =
      Run.new(
        Map.merge(
          %{
            code_identity: "8ff5591",
            env_identity: "elixir-1.19.5/otp-28",
            inputs: %{"dataset" => "fixture-a"},
            params: %{"alpha" => 0.1},
            seeds: [7],
            started_utc: "2026-07-26T15:00:00Z",
            started_unix_ns: 1_785_510_000_000_000_000,
            ended_utc: "2026-07-26T15:00:10Z",
            ended_unix_ns: 1_785_510_010_000_000_000,
            exit_code: 0,
            outputs: []
          },
          Map.new(opts)
        )
      )

    r
  end

  # CORRECTED before green: this originally asserted FIVE statuses, and contradicted
  # run_failure_refusals_test, which requires :FAILED_RUN to be IN the vocabulary so it
  # cannot be a surprise value nothing renders. That test is right and this one was
  # wrong — two of my own tests disagreeing, resolved on the merits rather than by
  # loosening whichever was easier.
  test "the status vocabulary is exactly these six, and none of them is a score" do
    assert Run.statuses() == [
             :NOT_RUN,
             :PARTIAL_NOT_ESTABLISHED,
             :STOPPED_BY_RULE,
             :COMPLETE,
             :OVERRUN,
             :FAILED_RUN
           ]
  end

  test "F13 — actual_n = 0 records NOT_RUN, never a verdict" do
    assert Run.status(run(planned_n: 30, actual_n: 0)) == :NOT_RUN
  end

  test "F14 — a short run with NO pre-declared stopping rule is PARTIAL_NOT_ESTABLISHED" do
    assert Run.status(run(planned_n: 30, actual_n: 12)) == :PARTIAL_NOT_ESTABLISHED
  end

  test "F14 — a short run WITH a pre-declared stopping rule is STOPPED_BY_RULE, which is a different thing" do
    r = run(planned_n: 30, actual_n: 12, stopping_rule: "stop at 12 successes or 2 hours, whichever first")
    assert Run.status(r) == :STOPPED_BY_RULE
  end

  test "F14 — the stopping rule must be substantive; a word is not a rule" do
    for rule <- ["", "   ", "yes", "TBD", "n/a"] do
      r = run(planned_n: 30, actual_n: 12, stopping_rule: rule)

      assert Run.status(r) == :PARTIAL_NOT_ESTABLISHED,
             "#{inspect(rule)} was accepted as a pre-declared stopping rule"
    end
  end

  test "a run that met its plan is COMPLETE" do
    assert Run.status(run(planned_n: 30, actual_n: 30)) == :COMPLETE
  end

  test "F15 — actual_n > planned_n is OVERRUN, and is never COMPLETE or eligible" do
    r = run(planned_n: 30, actual_n: 31)
    assert Run.status(r) == :OVERRUN
    refute Run.status(r) == :COMPLETE
  end

  test "F15 — an overrun is FLAGGED, and the flag names both numbers" do
    r = run(planned_n: 30, actual_n: 45)
    assert {:flagged, detail} = Run.flag(r)
    assert inspect(detail) =~ "30"
    assert inspect(detail) =~ "45"
  end

  test "F15 — a stopping rule does NOT excuse an overrun; it explains running short, not long" do
    r = run(planned_n: 30, actual_n: 45, stopping_rule: "stop at 30 successes or 2 hours")
    assert Run.status(r) == :OVERRUN
  end

  test "only OVERRUN and PARTIAL_NOT_ESTABLISHED are flagged; the rest carry no flag" do
    assert Run.flag(run(planned_n: 30, actual_n: 30)) == :ok
    assert Run.flag(run(planned_n: 30, actual_n: 0)) == :ok
    assert Run.flag(run(planned_n: 30, actual_n: 12, stopping_rule: "stop at 12 or 2 hours")) == :ok
    assert {:flagged, _} = Run.flag(run(planned_n: 30, actual_n: 12))
    assert {:flagged, _} = Run.flag(run(planned_n: 30, actual_n: 45))
  end

  test "a run with no planned_n cannot be given a status — the plan is what status is measured against" do
    assert {:error, reason} =
             Run.new(%{
               code_identity: "x",
               env_identity: "y",
               inputs: %{},
               params: %{},
               seeds: [1],
               actual_n: 5,
               started_utc: "2026-07-26T15:00:00Z",
               started_unix_ns: 1,
               ended_utc: "2026-07-26T15:00:01Z",
               ended_unix_ns: 2,
               exit_code: 0,
               outputs: []
             })

    assert inspect(reason) =~ "planned_n"
  end

  test "planned_n and actual_n must be non-negative integers, not strings that look like numbers" do
    for {p, a} <- [{"30", 12}, {30, "12"}, {-1, 0}, {30, -1}, {30.0, 12}] do
      assert {:error, _} =
               Run.new(%{
                 code_identity: "x",
                 env_identity: "y",
                 inputs: %{},
                 params: %{},
                 seeds: [1],
                 planned_n: p,
                 actual_n: a,
                 started_utc: "2026-07-26T15:00:00Z",
                 started_unix_ns: 1,
                 ended_utc: "2026-07-26T15:00:01Z",
                 ended_unix_ns: 2,
                 exit_code: 0,
                 outputs: []
               }),
             "planned_n=#{inspect(p)} actual_n=#{inspect(a)} was accepted"
    end
  end

  test "planned_n is part of the run IDENTITY — it cannot be lowered after the fact to make a short run look complete" do
    base = run(planned_n: 30, actual_n: 12)
    lowered = run(planned_n: 12, actual_n: 12)

    refute base.run_id == lowered.run_id,
           "lowering the plan must change what run this is; otherwise PARTIAL_NOT_ESTABLISHED can be laundered into COMPLETE"

    assert Run.status(base) == :PARTIAL_NOT_ESTABLISHED
    assert Run.status(lowered) == :COMPLETE
  end

  test "no status is a number, and none of them is ELIGIBLE" do
    for s <- Run.statuses() do
      assert is_atom(s)
      refute s == :ELIGIBLE
    end
  end
end
