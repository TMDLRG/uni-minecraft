defmodule SP.ControlPlane.RunIdentityDeterminismTest do
  @moduledoc """
  Phase 4 item 4.3 (`docs/control-plane/phases/PHASE-4.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    the same run twice produces different canonical bytes.

  ## A pre-registered phrase that is imprecise, corrected here before it is built on

  Item 4.3's expected outcome reads *"the same run twice produces byte-identical
  canonical bytes"*. Taken literally that is **false and must stay false**: a run
  record contains wall-clock start and end times, and two executions genuinely
  happen at different moments. A record that hid that would be lying.

  What must be identical is the run's **identity** — code identity, environment
  identity, inputs, params, seeds, and any stopping rule. Two runs of the same
  thing share an identity digest and differ in their execution record. Both
  halves are asserted below.

  This is the fourth pre-registered premise in this programme to be wrong on
  contact. The pattern is consistent: prose written before the thing exists
  compresses a distinction the thing turns out to require.

  ## The stopping rule is part of the identity, on purpose

  `CLAUDE.md`: *"never increase replicates after seeing a width"*. If a stopping
  rule were a mutable field, it could be declared after the numbers were seen.
  Because it is hashed into the identity, adding one **changes what run this is**
  — retroactive declaration is not a thing you can quietly do.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.Run

  defp identity do
    %{
      code_identity: "8ff5591",
      env_identity: "elixir-1.19.5/otp-28",
      inputs: %{"dataset" => "fixture-a", "n_rows" => 1349},
      params: %{"alpha" => 0.1, "k" => 8},
      seeds: [7],
      # Required at construction: run_status_refusals_test asserts a run with no
      # planned_n cannot be given a status, because the plan is what status is
      # measured against.
      planned_n: 10
    }
  end

  defp execution(n) do
    %{
      started_utc: "2026-07-26T12:00:0#{n}Z",
      started_unix_ns: 1_785_499_200_000_000_000 + n,
      ended_utc: "2026-07-26T12:00:1#{n}Z",
      ended_unix_ns: 1_785_499_210_000_000_000 + n,
      exit_code: 0,
      outputs: [%{"path" => "results/a.json", "sha256" => String.duplicate("a", 64)}]
    }
  end

  defp run(n), do: Run.new(Map.merge(identity(), execution(n)))

  test "a well-formed run is built and carries every identity and execution field" do
    assert {:ok, r} = run(1)

    for k <- [
          :run_id,
          :code_identity,
          :env_identity,
          :inputs,
          :params,
          :seeds,
          :started_utc,
          :started_unix_ns,
          :ended_utc,
          :ended_unix_ns,
          :exit_code,
          :outputs
        ] do
      assert Map.has_key?(r, k), "the run record is missing #{k}"
    end

    assert r.run_id =~ ~r/^[0-9a-f]{64}$/
  end

  test "THE CORRECTION — two runs of identical inputs share an IDENTITY, and differ in their RECORD" do
    {:ok, a} = run(1)
    {:ok, b} = run(2)

    assert a.run_id == b.run_id, "identical code, env, inputs, params and seeds are the same run identity"

    refute Run.canonical(a) == Run.canonical(b),
           "two executions happened at different moments; a record that hid that would be lying"

    assert a.started_unix_ns != b.started_unix_ns
  end

  test "the identity digest is stable across map ordering and across processes" do
    {:ok, a} = run(1)

    shuffled = identity() |> Enum.shuffle() |> Map.new() |> Map.merge(execution(9))
    assert {:ok, b} = Run.new(shuffled)
    assert a.run_id == b.run_id

    task =
      Task.async(fn ->
        {:ok, r} = run(3)
        r.run_id
      end)

    assert Task.await(task) == a.run_id
  end

  test "changing ANY identity field changes the run identity" do
    {:ok, base} = run(1)

    changes = [
      {:code_identity, "deadbeef"},
      {:env_identity, "elixir-1.18.0/otp-27"},
      {:inputs, %{"dataset" => "fixture-b", "n_rows" => 1349}},
      {:params, %{"alpha" => 0.2, "k" => 8}},
      {:seeds, [8]}
    ]

    for {key, value} <- changes do
      {:ok, other} = Run.new(identity() |> Map.put(key, value) |> Map.merge(execution(1)))

      refute other.run_id == base.run_id,
             "changing #{key} left the run identity unchanged — the digest does not cover it"
    end
  end

  test "changing an EXECUTION field does NOT change the run identity" do
    {:ok, base} = run(1)

    for key <- [:started_utc, :started_unix_ns, :ended_utc, :ended_unix_ns, :exit_code, :outputs] do
      value =
        case key do
          :exit_code -> 1
          :outputs -> []
          k when k in [:started_unix_ns, :ended_unix_ns] -> 1
          _ -> "2030-01-01T00:00:00Z"
        end

      {:ok, other} = Run.new(identity() |> Map.merge(execution(1)) |> Map.put(key, value))
      assert other.run_id == base.run_id, "changing #{key} changed the identity; it should not"
    end
  end

  test "a stopping rule is part of the IDENTITY — it cannot be declared after the numbers are seen" do
    {:ok, without} = run(1)

    {:ok, with_rule} =
      Run.new(identity() |> Map.merge(execution(1)) |> Map.put(:stopping_rule, "stop at n=30 or 2 h"))

    refute with_rule.run_id == without.run_id,
           "adding a stopping rule must change what run this is; otherwise it can be added retroactively"
  end

  test "a run missing any identity field is refused, and the refusal names it" do
    for key <- [:code_identity, :env_identity, :inputs, :params, :seeds] do
      attrs = identity() |> Map.merge(execution(1)) |> Map.delete(key)
      assert {:error, reason} = Run.new(attrs), "a run with no #{key} was accepted"
      assert inspect(reason) =~ to_string(key)
    end
  end

  test "a run missing both time bases is refused — unix_ns and UTC are both required, neither substitutes" do
    for key <- [:started_utc, :started_unix_ns, :ended_utc, :ended_unix_ns] do
      attrs = identity() |> Map.merge(execution(1)) |> Map.delete(key)
      assert {:error, reason} = Run.new(attrs)
      assert inspect(reason) =~ to_string(key)
    end
  end

  test "every output must be content-addressed" do
    attrs = identity() |> Map.merge(execution(1)) |> Map.put(:outputs, [%{"path" => "results/a.json"}])
    assert {:error, reason} = Run.new(attrs)
    assert inspect(reason) =~ ~r/sha256|outputs/i
  end

  test "a run record cannot be edited after the fact — there is no setter" do
    Code.ensure_loaded!(Run)

    for {fun, arity} <- [update: 3, put: 3, set: 3, edit: 2, amend: 2] do
      refute function_exported?(Run, fun, arity), "Run.#{fun}/#{arity} exists; a run identity is immutable"
    end
  end
end
