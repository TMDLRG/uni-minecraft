defmodule SP.ControlPlane.StoreRoundtripTest do
  @moduledoc """
  Phase 4 item 4.1 (`docs/control-plane/phases/PHASE-4.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a ledger written and reloaded loses or reorders an entry.

  ## Why this is the first item of the phase

  When the Control Plane corrected the canonical gate ledger on 2026-07-25, it
  **could not record that write in its own ledger** — `Ledger` had the
  hash-chained structure and no store. The audit trail was a git commit and a
  receipt: the mechanism this body exists to replace.

  ## Reconstruction is a trust boundary, and this test says so

  `Ledger.from_entries/1` rebuilds a ledger from bytes without going through
  `Command`. That is not a hole in "Command is the only writer" being papered
  over — it is the unavoidable fact that anything read from disk was written by
  something you are choosing to trust. `from_entries/1` refuses a chain that does
  not verify, which stops corruption and accident. It cannot stop a forger who
  computes valid hashes.

  **The anchor is what makes that checkable**, and that is item 4.2, tested
  separately in `store_anchor_in_practice_test.exs`.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Store}

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_store_roundtrip_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp at(n), do: {"2026-07-26T09:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_488_400_000_000_000 + n}

  defp chain(n) do
    Enum.reduce(1..n, Ledger.new(), fn i, l ->
      {:ok, l} =
        Command.submit(l, %{
          command: :note,
          actor: "claude",
          role: "agent",
          transition: "note.written",
          prior: if(i == 1, do: nil, else: %{"step" => i - 1}),
          resulting: %{"step" => i, "text" => "entry number #{i}"},
          authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-4.md#4.1"},
          evidence: [],
          at: at(i)
        })

      l
    end)
  end

  test "a ledger survives a round trip through disk, entry for entry", %{dir: dir} do
    original = chain(5)
    assert {:ok, %{appended: 5, total: 5}} = Store.persist(dir, original)
    assert {:ok, reloaded} = Store.load(dir)

    assert Ledger.entries(reloaded) == Ledger.entries(original)
    assert :ok = Ledger.verify(reloaded)
  end

  test "the reload is byte-identical, not merely equal — canonical bytes match entry for entry", %{dir: dir} do
    original = chain(4)
    {:ok, _} = Store.persist(dir, original)
    {:ok, reloaded} = Store.load(dir)

    for {a, b} <- Enum.zip(Ledger.entries(original), Ledger.entries(reloaded)) do
      assert Ledger.canonical(a) == Ledger.canonical(b)
      assert a["hash"] == b["hash"]
    end
  end

  test "the store is a plain, readable NDJSON file — evidence a human can open", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))

    lines =
      Store.ledger_path(dir)
      |> File.read!()
      |> String.split(~r/\r?\n/, trim: true)

    assert length(lines) == 3

    for line <- lines do
      assert {:ok, row} = JSON.decode(line)
      assert row["hash"] =~ ~r/^[0-9a-f]{64}$/
    end
  end

  test "an empty ledger persists and reloads as an empty ledger", %{dir: dir} do
    assert {:ok, %{appended: 0, total: 0}} = Store.persist(dir, Ledger.new())
    assert {:ok, reloaded} = Store.load(dir)
    assert Ledger.entries(reloaded) == []
    assert :ok = Ledger.verify(reloaded)
  end

  test "loading a directory that was never a store is refused, not treated as empty", %{dir: dir} do
    assert {:error, reason} = Store.load(dir)
    assert inspect(reason) =~ ~r/not_a_store|enoent|missing/i
  end

  test "a store whose ledger file has been corrupted is refused, not silently repaired", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    path = Store.ledger_path(dir)

    tampered =
      path
      |> File.read!()
      |> String.replace(~s|"step":2|, ~s|"step":99|)

    File.write!(path, tampered)

    assert {:error, reason} = Store.load(dir)
    assert inspect(reason) =~ ~r/hash|verify/i
  end

  test "a store with an unparseable line is refused, and the refusal names the line", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(2))
    File.write!(Store.ledger_path(dir), "not json\n", [:append])

    assert {:error, reason} = Store.load(dir)
    assert inspect(reason) =~ "3"
  end

  test "from_entries refuses a chain that does not verify — corruption and accident stop here" do
    entries = chain(3) |> Ledger.entries()
    broken = List.update_at(entries, 1, &Map.put(&1, "resulting", %{"step" => 99}))

    assert {:error, _} = Ledger.from_entries(broken)
    assert {:ok, _} = Ledger.from_entries(entries)
  end

  test "from_entries CANNOT stop a forger who recomputes hashes — stated, not hidden" do
    entries = chain(3) |> Ledger.entries()

    forged =
      entries
      |> Enum.take(1)
      |> then(fn [first] ->
        rewritten =
          first
          |> Map.put("actor", "someone-else")
          |> then(fn e -> Map.put(e, "hash", Ledger.hash_of(e)) end)

        [rewritten]
      end)

    assert {:ok, _} = Ledger.from_entries(forged),
           "a self-consistent forgery is indistinguishable from a real chain by hashing alone — " <>
             "this is why the anchor exists (item 4.2), and why it must eventually live off-box"
  end

  test "persisting twice with no new entries is a no-op, not a rewrite", %{dir: dir} do
    l = chain(3)
    {:ok, %{appended: 3}} = Store.persist(dir, l)
    before = File.read!(Store.ledger_path(dir))

    assert {:ok, %{appended: 0, total: 3}} = Store.persist(dir, l)
    assert File.read!(Store.ledger_path(dir)) == before
  end
end
