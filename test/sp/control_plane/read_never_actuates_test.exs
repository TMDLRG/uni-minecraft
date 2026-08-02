defmodule SP.ControlPlane.ReadNeverActuatesTest do
  @moduledoc """
  Phase 2 · F11 (docs/control-plane/FAILURE-MODES.md in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a read function mutates or spawns.

  This is the Door's law, inherited: a polled read never spawns anything.
  ADR-0001. A read is pure — same input, same output, no process created, no
  message sent, no byte written to disk.
  """
  use ExUnit.Case, async: false

  alias SP.ControlPlane.{Command, Drift, GateRow, Ledger}

  @gates Path.expand("../../../evidence/gates.ndjson", __DIR__)
  @fixtures Path.expand("../../fixtures/control_plane", __DIR__)

  defp row, do: @fixtures |> Path.join("gate_row_valid.json") |> File.read!() |> JSON.decode!()

  defp ledger do
    {:ok, l} =
      Command.submit(Ledger.new(), %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "gate.noted",
        prior: nil,
        resulting: %{"step" => 1},
        authorization: %{"kind" => "pre_registration", "granted_by" => "michael", "ref" => "PHASE-2.md#2.4"},
        evidence: [],
        at: {"2026-07-25T15:00:00Z", 1_785_423_600_000_000_000}
      })

    l
  end

  defp reads(l) do
    [e] = Ledger.entries(l)
    {:ok, obs_a} = Drift.observation("a", "x", :sha256)
    {:ok, obs_b} = Drift.observation("b", "x", :sha256)

    [
      {"Ledger.entries/1", fn -> Ledger.entries(l) end},
      {"Ledger.verify/1", fn -> Ledger.verify(l) end},
      {"Ledger.verify_entries/1", fn -> Ledger.verify_entries(Ledger.entries(l)) end},
      {"Ledger.hash_of/1", fn -> Ledger.hash_of(Map.delete(e, "hash")) end},
      {"Ledger.canonical/1", fn -> Ledger.canonical(e) end},
      {"GateRow.validate/1", fn -> GateRow.validate(row()) end},
      {"GateRow.encode/1", fn -> GateRow.encode(row()) end},
      {"Drift.compare/3", fn -> Drift.compare(obs_a, obs_b, :snapshot_vs_live) end}
    ]
  end

  test "F11 — no read spawns a process" do
    l = ledger()

    for {name, f} <- reads(l) do
      before = :erlang.system_info(:process_count)
      f.()
      # Give anything spawned a chance to appear before counting.
      Process.sleep(1)

      assert :erlang.system_info(:process_count) <= before,
             "#{name} increased the process count — a read must not spawn"
    end
  end

  test "F11 — no read sends this process a message" do
    l = ledger()
    for {_, f} <- reads(l), do: f.()
    assert {:message_queue_len, 0} = Process.info(self(), :message_queue_len)
  end

  test "F11 — every read is pure: three calls, identical results" do
    l = ledger()

    for {name, f} <- reads(l) do
      a = f.()
      b = f.()
      c = f.()
      assert a == b and b == c, "#{name} is not referentially transparent"
    end
  end

  test "F11 — no read changes the term it was given" do
    l = ledger()
    entries_before = Ledger.entries(l)
    r = row()

    for {_, f} <- reads(l), do: f.()

    assert Ledger.entries(l) == entries_before
    assert r == row()
  end

  test "F11 — no read writes to disk, and the canonical gate ledger is byte-identical afterwards" do
    l = ledger()

    digest = fn -> :crypto.hash(:sha256, File.read!(@gates)) |> Base.encode16(case: :lower) end
    before_digest = digest.()
    before_stat = File.stat!(@gates)

    for {_, f} <- reads(l), do: f.()

    assert digest.() == before_digest, "the canonical ledger changed during a read"
    assert File.stat!(@gates).size == before_stat.size
  end

  # -- NARROWED 2026-07-26, deliberately, and here is the trade. ---------------
  #
  # This asserted that NO module in the namespace performs disk IO. That was true
  # and useful while nothing persisted anything, and it was always a PROXY for the
  # real rule, which is "a read never actuates". Phase 4's `Store` writes, so the
  # blanket form had to go.
  #
  # WEAKER in one direction: one module may now touch disk.
  # STRONGER in another: it is an ALLOWLIST OF EXACTLY ONE. A second writer -- or
  # a writer appearing inside a module that reads -- fails this test, which the
  # blanket form could never distinguish. And the purity of every read is asserted
  # directly, in the tests above, and never depended on this scan.
  test "disk IO is confined to exactly one module, and it is not one that reads" do
    files =
      Path.expand("../../../lib/sp/control_plane", __DIR__)
      |> Path.join("**/*.ex")
      |> Path.wildcard()

    writers =
      files
      |> Enum.filter(&(File.read!(&1) =~ ~r/File\.write|File\.open|File\.rm|File\.cp|File\.mkdir/))
      |> Enum.map(&Path.basename/1)
      |> Enum.sort()

    assert writers == ["store.ex"],
           "disk IO must be confined to the store; found it in: #{inspect(writers)}"

    source = Enum.map_join(files, "\n", &File.read!/1)

    refute source =~ "gates.ndjson",
           "no Control Plane module may name the canonical ledger file -- this phase writes no row"
  end
end
