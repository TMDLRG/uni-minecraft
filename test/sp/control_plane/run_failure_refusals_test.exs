defmodule SP.ControlPlane.RunFailureRefusalsTest do
  @moduledoc """
  Phase 4 item 4.6 · F16, F17, F18 (`docs/control-plane/FAILURE-MODES.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a non-converged fit writes a result artifact.

  All three come from defects found in the flagellum and never fixed there:

  * **F16** — `fit.py:41-54` stores `res.success` as `"converged"` and never
    checks it; `compare.py` scores unconditionally. A fit that did not converge
    produced a scored artifact indistinguishable from one that did.
  * **F17** — `score.py:21,30` uses a bare `zip(per_event_nlpd, motor_ids)`,
    which **truncates silently** when the two differ in length. A mean was then
    computed over the truncated pairs. Nothing raised.
  * **F18** — a crashed run and a negative result are not the same thing, and a
    system that records them the same way manufactures evidence.

  These are not hypotheticals. They are the reason this module exists.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Run

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_run_failure_#{System.unique_integer([:positive])}")
    File.mkdir_p!(dir)
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp base do
    %{
      code_identity: "8ff5591",
      env_identity: "elixir-1.19.5/otp-28",
      inputs: %{"dataset" => "fixture-a"},
      params: %{"alpha" => 0.1},
      seeds: [7],
      planned_n: 10,
      actual_n: 10,
      started_utc: "2026-07-26T16:00:00Z",
      started_unix_ns: 1_785_513_600_000_000_000,
      ended_utc: "2026-07-26T16:00:10Z",
      ended_unix_ns: 1_785_513_610_000_000_000,
      exit_code: 0,
      outputs: []
    }
  end

  # ── F16 — non-convergence halts BEFORE scoring, and writes nothing ──────────

  test "F16 — a converged fit may be scored" do
    assert {:ok, r} = Run.new(Map.put(base(), :converged, true))
    assert :ok = Run.may_score?(r)
  end

  test "F16 — a NON-converged fit is refused before scoring, and the refusal says so" do
    {:ok, r} = Run.new(Map.put(base(), :converged, false))

    assert {:error, reason} = Run.may_score?(r)
    assert inspect(reason) =~ ~r/converg/i
  end

  test "F16 — convergence UNDECLARED is refused, not assumed true" do
    {:ok, r} = Run.new(base())

    assert {:error, reason} = Run.may_score?(r),
           "an absent convergence flag must not be read as success — that is the exact flagellum defect"

    assert inspect(reason) =~ ~r/converg/i
  end

  test "F16 — a non-converged run writes NO artifact at all", %{dir: dir} do
    {:ok, r} = Run.new(Map.put(base(), :converged, false))

    assert {:error, _} = Run.score_to(r, dir, fn -> %{"nlpd" => 1.23} end)
    assert File.ls!(dir) == [], "a halted run left a file behind: #{inspect(File.ls!(dir))}"
  end

  test "a converged run does write its artifact, so the refusal above is not vacuous", %{dir: dir} do
    {:ok, r} = Run.new(Map.put(base(), :converged, true))

    assert {:ok, path} = Run.score_to(r, dir, fn -> %{"nlpd" => 1.23} end)
    assert File.exists?(path)
    assert JSON.decode!(File.read!(path))["nlpd"] == 1.23
  end

  # ── F17 — mismatched lengths raise BEFORE any aggregate ────────────────────

  test "F17 — equal-length score and id arrays aggregate normally" do
    assert {:ok, %{n: 3, mean: mean}} = Run.aggregate([1.0, 2.0, 3.0], ["m1", "m2", "m3"])
    assert_in_delta mean, 2.0, 1.0e-12
  end

  test "F17 — differing lengths are REFUSED before any mean is computed, and both lengths are named" do
    assert {:error, reason} = Run.aggregate([1.0, 2.0, 3.0], ["m1", "m2"])
    assert inspect(reason) =~ "3"
    assert inspect(reason) =~ "2"
  end

  test "F17 — the refusal holds in both directions; a longer id list is equally wrong" do
    assert {:error, _} = Run.aggregate([1.0, 2.0], ["m1", "m2", "m3"])
  end

  test "F17 — empty inputs do not silently produce a mean of zero" do
    assert {:error, reason} = Run.aggregate([], [])
    assert inspect(reason) =~ ~r/empty|no_/i
  end

  test "F17 — a repeated motor id is refused; frames are not independent replicates" do
    assert {:error, reason} = Run.aggregate([1.0, 2.0, 3.0], ["m1", "m1", "m2"])

    assert inspect(reason) =~ ~r/duplicate|repeat|pseudorep/i,
           "the experimental unit is the motor; counting one motor twice is pseudoreplication"
  end

  # ── F18 — a crash is a crash, not a scientific negative ────────────────────

  test "F18 — a non-zero exit code records FAILED_RUN, never a verdict-bearing status" do
    {:ok, r} = Run.new(%{base() | exit_code: 137})
    assert Run.status(r) == :FAILED_RUN
  end

  test "F18 — a FAILED_RUN stays inspectable: its identity, times and exit code all survive" do
    {:ok, r} = Run.new(%{base() | exit_code: 1})

    assert r.run_id =~ ~r/^[0-9a-f]{64}$/
    assert r.exit_code == 1
    assert r.started_unix_ns == base().started_unix_ns
    assert r.ended_unix_ns == base().ended_unix_ns
  end

  test "F18 — a crashed run may not be scored, whatever its convergence flag says", %{dir: dir} do
    {:ok, r} = Run.new(%{base() | exit_code: 1} |> Map.put(:converged, true))

    assert {:error, reason} = Run.may_score?(r)
    assert inspect(reason) =~ ~r/exit|fail/i

    assert {:error, _} = Run.score_to(r, dir, fn -> %{"nlpd" => 1.0} end)
    assert File.ls!(dir) == []
  end

  test "F18 — FAILED_RUN outranks every other status, including OVERRUN" do
    {:ok, crashed_overrun} = Run.new(%{base() | exit_code: 1, actual_n: 99})
    assert Run.status(crashed_overrun) == :FAILED_RUN

    {:ok, crashed_empty} = Run.new(%{base() | exit_code: 1, actual_n: 0})
    assert Run.status(crashed_empty) == :FAILED_RUN
  end

  test "FAILED_RUN is in the vocabulary, so it cannot be a surprise value nothing renders" do
    assert :FAILED_RUN in Run.statuses()
  end
end
