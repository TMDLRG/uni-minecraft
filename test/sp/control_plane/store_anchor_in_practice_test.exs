defmodule SP.ControlPlane.StoreAnchorInPracticeTest do
  @moduledoc """
  Phase 4 item 4.2 (`docs/control-plane/phases/PHASE-4.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a reload that has lost its tail is reported sound.

  ## What this closes, and exactly how far

  Phase 2 found that a hash chain cannot detect truncation from its own tail.
  Phase 3 built `Anchor` to hold the head and length outside the chain — and
  landed **PARTIAL**, because nothing persisted an anchor, so the mechanism only
  worked inside a single test where the anchor was still in memory.

  This closes the gap **for loss and for accident**. The anchor is written to its
  own file beside the ledger, so it survives a restart, and a ledger that comes
  back short fails to attest against it.

  ## THE RESIDUAL, stated rather than left to be discovered

  It does **not** close the gap against a **deliberate tamperer with write access
  to the same directory**, who truncates `ledger.ndjson` and rewrites
  `anchor.json` to match. Nothing local can close that. It needs an anchor the
  ledger's writer cannot reach — a second machine, a signed feed, or a witness.

  So item 4.2's honest reading is: **truncation is now detected in practice
  against loss, corruption and accident; not against an adversary who owns the
  directory.** That residual belongs to `PHASE-5.md`, not to a footnote.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Anchor, Command, Ledger, Store}

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_store_anchor_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp at(n), do: {"2026-07-26T11:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_495_600_000_000_000 + n}

  defp chain(n) do
    Enum.reduce(1..n, Ledger.new(), fn i, l ->
      {:ok, l} =
        Command.submit(l, %{
          command: :note,
          actor: "claude",
          role: "agent",
          transition: "note.written",
          prior: if(i == 1, do: nil, else: %{"step" => i - 1}),
          resulting: %{"step" => i},
          authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-4.md#4.2"},
          evidence: [],
          at: at(i)
        })

      l
    end)
  end

  defp drop_last_lines(dir, n) do
    path = Store.ledger_path(dir)
    kept = path |> File.read!() |> String.split(~r/\r?\n/, trim: true) |> Enum.drop(-n)
    File.write!(path, Enum.map_join(kept, "", &(&1 <> "\n")))
  end

  test "persisting writes an anchor beside the ledger, as its own artifact", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))

    assert File.exists?(Store.anchor_path(dir))
    assert {:ok, %Anchor{} = a} = Store.anchor(dir)
    assert a.length == 4
    assert a.head =~ ~r/^[0-9a-f]{64}$/
  end

  test "a sound store attests", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))
    assert {:ok, :anchored} = Store.attest(dir)
  end

  test "THE POINT — a store that has lost its tail FAILS to attest, across a reload", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(6))
    assert {:ok, :anchored} = Store.attest(dir)

    drop_last_lines(dir, 2)

    # The truncated chain is still internally sound — that is exactly the problem.
    {:ok, reloaded} = Store.load(dir)
    assert :ok = Ledger.verify(reloaded)

    assert {:error, reason} = Store.attest(dir)
    assert inspect(reason) =~ ~r/length|head/
  end

  test "losing a single entry from the tail is caught", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))
    drop_last_lines(dir, 1)
    assert {:error, _} = Store.attest(dir)
  end

  test "a store with NO anchor is refused — an absent anchor is not a pass", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    File.rm!(Store.anchor_path(dir))

    assert {:error, reason} = Store.attest(dir)
    assert inspect(reason) =~ ~r/anchor|enoent|missing/i
  end

  test "a corrupt anchor file is refused rather than ignored", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    File.write!(Store.anchor_path(dir), "not an anchor")

    assert {:error, _} = Store.attest(dir)
  end

  test "the anchor advances as the ledger grows, and the old anchor no longer attests", %{dir: dir} do
    l3 = chain(3)
    {:ok, _} = Store.persist(dir, l3)
    {:ok, old} = Store.anchor(dir)

    {:ok, l4} =
      Command.submit(l3, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "note.written",
        prior: %{"step" => 3},
        resulting: %{"step" => 4},
        authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "x"},
        evidence: [],
        at: at(4)
      })

    {:ok, _} = Store.persist(dir, l4)
    {:ok, fresh} = Store.anchor(dir)

    assert fresh.length == 4
    assert fresh.head != old.head
    assert {:ok, :anchored} = Store.attest(dir)

    {:ok, reloaded} = Store.load(dir)
    assert {:error, _} = Anchor.attest(reloaded, old), "a stale anchor must not attest a grown chain"
  end

  # @limitation cp.anchor.phase5-closure-void
  #   what: Phase 5 recorded this residual as CLOSED. That closure is VOID and the residual is live.
  #   why: the closure rested on two-domain corroboration whose off-box custodian, node2, ACCEPTS the writer's key -- viewer/gaia/witness.json reports independent_custodians: 0 and qualifies_as_witness: false. A second domain the writer can reach is not a second domain.
  #   claim: the local anchor stands on git alone -- tamper-evident, NOT unforgeable.
  #   proof: test/sp/control_plane/store_anchor_in_practice_test.exs:145 (this test still PASSES, and passing is the finding)
  #   owner: removing that key is S1 -- the one repair an agent must not perform, because using write access to erase the evidence of write access destroys the last proof.
  test "RESIDUAL — an adversary who owns the directory can rewrite BOTH, and this is not caught", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(6))

    # Truncate the ledger, then re-anchor to the truncated state — exactly what a
    # tamperer with write access would do.
    drop_last_lines(dir, 2)
    {:ok, truncated} = Store.load(dir)
    {:ok, forged} = Anchor.of(truncated)
    File.write!(Store.anchor_path(dir), Anchor.encode(forged))

    assert {:ok, :anchored} = Store.attest(dir),
           "this PASSES, and that is the honest limit: a local anchor cannot outrank a local writer. " <>
             "Closing it needs an anchor the ledger's writer cannot reach — PHASE-5."
  end
end
