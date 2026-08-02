defmodule SP.ControlPlane.RecorderHasAProductionCallerTest do
  @moduledoc """
  Phase 9 step 4.1 — the recorder becomes the first production caller.

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    every one of the fifteen Control Plane modules is called only by tests and by one-shot
    repair scripts. Nothing that RUNS calls it.

  The remediation plan's own line: *"Zero of 15 Control Plane modules has a production caller."*
  Measured 2026-07-27 and exact — grepping `lib/` for `SP.ControlPlane` outside
  `lib/sp/control_plane/` returns nothing but two documentation mentions in moduledocs. The body
  built to record canonical mutations is an island.

  ## Why `mix sp.uni.prove`, and not somewhere more convenient

  Its own docstring: *"The OBSERVABLE proof. Run it and watch each claim about the UNI be tested
  with evidence — every line is recomputed from the running code."* It runs the validation engine,
  produces a pass/fail tally, and exits non-zero when a claim fails. It is the most canonical,
  most repeatable thing this repository does, it needs no live Minecraft, and **the Control Plane
  has never heard of it.** That gap is the step.

  `mix sp.verify` was the first candidate and was rejected on measurement: there are ZERO `.jsonl`
  evidence logs in `runs/`, so it has nothing to verify. That is itself part of "the unrun", and
  it is recorded here rather than worked around by inventing a log.

  ## A MEASUREMENT IS NOT A VERDICT, and the entry must not blur them

  F1 refuses a verdict authored with no pre-registered gate. A proof run is an OBSERVATION — the
  instrument reporting what it saw — and recording it as `gate.adjudicated` would launder a
  measurement into an adjudication. The transition is `proof.observed`, the actor is the
  instrument rather than a person, and the entry says in words that it is not a verdict.

  The authorization is honest for the same reason: an automated run cannot manufacture a fresh
  co-sign, so it carries the STANDING authorization that wired it, not a pretend one.
  """
  use ExUnit.Case, async: false

  alias SP.ControlPlane.{Ledger, Store}

  @repo Path.expand("../../..", __DIR__)
  @prove Mix.Tasks.Sp.Uni.Prove

  defp tmp do
    dir = Path.join(System.tmp_dir!(), "cp_prodcaller_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    dir
  end

  defp summary(ok?), do: %{all_proven: ok?, pass: 10, fail: if(ok?, do: 0, else: 1), skip: 2}

  # ---- THE FALSIFIER, mechanically ------------------------------------------------------------

  test "THE FALSIFIER: at least one file under lib/ OUTSIDE the Control Plane calls the Recorder" do
    callers =
      Path.wildcard(Path.join(@repo, "lib/**/*.ex"))
      |> Enum.reject(&String.contains?(Path.relative_to(&1, @repo), "lib/sp/control_plane/"))
      |> Enum.filter(&(File.read!(&1) =~ ~r/Recorder\.append_one|ControlPlane\.Recorder/))
      |> Enum.map(&Path.relative_to(&1, @repo))

    assert callers != [],
           "STILL ZERO CALLERS OUTSIDE TESTS. The Control Plane records canonical mutations and " <>
             "nothing that runs has ever asked it to. Capability is not practice."

    assert Enum.any?(callers, &String.starts_with?(&1, "lib/mix/tasks/")),
           "the caller must be a production ENTRY POINT (a compiled Mix task), not another " <>
             "library module waiting for a caller of its own: #{inspect(callers)}"
  end

  test "the production caller is reachable as a function, not buried inside a task body" do
    Code.ensure_loaded!(@prove)

    assert function_exported?(@prove, :record_run, 3),
           "a caller that can only be exercised by running the whole task cannot be tested, and " <>
             "an untestable wire is one nobody will notice breaking"
  end

  # ---- what it actually records ---------------------------------------------------------------

  test "running it appends exactly one entry, and the chain still verifies" do
    dir = tmp()

    assert {:ok, %{seq: 1, total: 1}} = @prove.record_run(dir, summary(true), "report bytes")

    assert {:ok, ledger} = Store.load(dir)
    assert :ok = Ledger.verify(ledger)
    assert {:ok, :anchored} = Store.attest(dir)
  end

  test "it records an OBSERVATION, never a verdict" do
    dir = tmp()
    {:ok, _} = @prove.record_run(dir, summary(true), "report bytes")
    [e] = Store.load(dir) |> elem(1) |> Ledger.entries()

    assert e["transition"] == "proof.observed"
    refute e["transition"] =~ "verdict"
    refute e["transition"] =~ "adjudicated"

    assert is_binary(e["resulting"]["not_a_verdict"]),
           "the entry must say in words that it is a measurement — F1 refuses a verdict with no " <>
             "pre-registered gate, and a reader must not have to infer which this is"
  end

  test "the actor is the INSTRUMENT and the co-signer is not the actor" do
    dir = tmp()
    {:ok, _} = @prove.record_run(dir, summary(true), "report bytes")
    [e] = Store.load(dir) |> elem(1) |> Ledger.entries()

    assert e["actor"] =~ "sp.uni.prove"
    assert e["role"] == "instrument"
    assert e["authorization"]["kind"] == "standing"
    assert e["authorization"]["granted_by"] == "michael"

    refute String.downcase(e["actor"]) == String.downcase(e["authorization"]["granted_by"]),
           "an automated run cannot manufacture a fresh co-sign; it carries the standing " <>
             "authorization that wired it, and the two parties stay two"
  end

  test "AN ADVERSE RESULT IS RECORDED TOO — not only the green ones" do
    dir = tmp()
    assert {:ok, _} = @prove.record_run(dir, summary(false), "a claim failed")
    [e] = Store.load(dir) |> elem(1) |> Ledger.entries()

    assert e["resulting"]["all_proven"] == false
    assert e["resulting"]["fail"] == 1
  end

  test "the evidence is content-addressed and retrievable, not just a path" do
    dir = tmp()
    {:ok, _} = @prove.record_run(dir, summary(true), "report bytes")
    [e] = Store.load(dir) |> elem(1) |> Ledger.entries()
    [%{"sha256" => digest}] = e["evidence"]

    assert {:ok, "report bytes"} = Store.object(dir, digest),
           "the lesson from 2.6: evidence is content-addressed at the moment it is referenced"

    assert {:ok, %{faults: []}} =
             Store.audit_evidence(dir, dir, Store.load(dir) |> elem(1) |> Ledger.entries())
  end

  # ---- the ledger is a record of facts, not a log of runs --------------------------------------

  test "an identical result is NOT appended twice" do
    dir = tmp()
    assert {:ok, %{seq: 1}} = @prove.record_run(dir, summary(true), "same bytes")
    assert {:ok, :unchanged} = @prove.record_run(dir, summary(true), "same bytes")
    assert length(Store.load(dir) |> elem(1) |> Ledger.entries()) == 1
  end

  test "a CHANGED result IS appended — the ledger records what changed" do
    dir = tmp()
    {:ok, _} = @prove.record_run(dir, summary(true), "green bytes")
    assert {:ok, %{seq: 2}} = @prove.record_run(dir, summary(false), "a claim failed")
    assert length(Store.load(dir) |> elem(1) |> Ledger.entries()) == 2
  end

  # ---- the science must not depend on the recorder working -------------------------------------

  test "RECORDING CANNOT BREAK THE SCIENCE — an unusable store is reported, never raised" do
    # A directory that cannot hold a store. The proof run must survive this; a body that records
    # the science must never be able to STOP the science.
    unusable = Path.join(tmp(), "not-a-dir.txt")
    File.mkdir_p!(Path.dirname(unusable))
    File.write!(unusable, "this is a file, not a directory")

    assert {:error, _reason} = @prove.record_run(unusable, summary(true), "report bytes")
  end

  test "the recorder is used through append_one, so Command remains the only writer" do
    source = File.read!(Path.join(@repo, "lib/mix/tasks/sp.uni.prove.ex"))

    assert source =~ "Recorder.append_one",
           "the production caller must go through the recorder, not around it"

    refute source =~ "Ledger.append(",
           "F10: nothing but Command may call the ledger writer, and a production caller is not " <>
             "an exception to that"
  end
end
