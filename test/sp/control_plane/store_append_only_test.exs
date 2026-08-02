defmodule SP.ControlPlane.StoreAppendOnlyTest do
  @moduledoc """
  Phase 4 item 4.1 (`docs/control-plane/phases/PHASE-4.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    a stored ledger can be rewritten in place rather than appended to.

  Append-only is not a property of the data structure alone. An in-memory ledger
  that only appends can still be persisted by a writer that truncates the file
  and writes it out again — and the result would be indistinguishable from a
  correct write until the day the two disagreed.

  So the store must **refuse to write** whenever the bytes already on disk are
  not a prefix of what it is being asked to persist. Not "detect afterwards" —
  refuse, before anything is written.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Store}

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_store_append_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp at(n), do: {"2026-07-26T10:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_492_000_000_000_000 + n}

  defp grow(ledger, i, text) do
    {:ok, l} =
      Command.submit(ledger, %{
        command: :note,
        actor: "claude",
        role: "agent",
        transition: "note.written",
        prior: if(i == 1, do: nil, else: %{"step" => i - 1}),
        resulting: %{"step" => i, "text" => text},
        authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-4.md#4.1"},
        evidence: [],
        at: at(i)
      })

    l
  end

  defp chain(n, text \\ "as recorded"), do: Enum.reduce(1..n, Ledger.new(), &grow(&2, &1, text))

  test "a later persist appends only the new tail and leaves the existing bytes untouched", %{dir: dir} do
    l3 = chain(3)
    {:ok, %{appended: 3, total: 3}} = Store.persist(dir, l3)
    first_write = File.read!(Store.ledger_path(dir))

    l5 = l3 |> grow(4, "as recorded") |> grow(5, "as recorded")
    assert {:ok, %{appended: 2, total: 5}} = Store.persist(dir, l5)

    now = File.read!(Store.ledger_path(dir))
    assert String.starts_with?(now, first_write), "the earlier bytes must be an exact prefix"
    assert byte_size(now) > byte_size(first_write)
  end

  test "REFUSED — a ledger whose history differs from what is stored cannot be persisted", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3, "as recorded"))
    before = File.read!(Store.ledger_path(dir))

    divergent = chain(3, "as rewritten")

    assert {:error, reason} = Store.persist(dir, divergent)
    assert inspect(reason) =~ ~r/rewrite|diverge|prefix/i
    assert File.read!(Store.ledger_path(dir)) == before, "a refused write must write nothing at all"
  end

  test "REFUSED — a ledger SHORTER than what is stored cannot be persisted", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(5))
    before = File.read!(Store.ledger_path(dir))

    assert {:error, reason} = Store.persist(dir, chain(2))
    assert inspect(reason) =~ ~r/shorter|rewrite|truncat/i
    assert File.read!(Store.ledger_path(dir)) == before
  end

  test "the refusal names the seq at which the histories part company", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4, "as recorded"))

    divergent = Ledger.new() |> grow(1, "as recorded") |> grow(2, "as recorded") |> grow(3, "changed")

    assert {:error, reason} = Store.persist(dir, divergent)
    assert inspect(reason) =~ "3", "the operator must be told WHERE the disagreement starts"
  end

  test "the store exposes no rewrite, truncate or delete path at all" do
    Code.ensure_loaded!(Store)

    for {fun, arity} <- [
          write: 2,
          overwrite: 2,
          replace: 2,
          truncate: 1,
          truncate: 2,
          delete: 1,
          rm: 1,
          clear: 1
        ] do
      refute function_exported?(Store, fun, arity),
             "Store.#{fun}/#{arity} exists — a store with a rewrite path is not append-only"
    end
  end

  test "exactly one module in the Control Plane performs disk IO, and it is the store" do
    lib = Path.expand("../../../lib/sp/control_plane", __DIR__)

    writers =
      (lib <> "/**/*.ex")
      |> Path.wildcard()
      |> Enum.filter(&(File.read!(&1) =~ ~r/File\.write|File\.open|File\.rm|File\.cp|File\.mkdir/))
      |> Enum.map(&Path.basename/1)
      |> Enum.sort()

    assert writers == ["store.ex"],
           "disk IO must be confined to the store; found it in: #{inspect(writers)}"
  end

  test "no Control Plane module names the canonical gate ledger — this phase writes no row" do
    source =
      Path.expand("../../../lib/sp/control_plane", __DIR__)
      |> Path.join("**/*.ex")
      |> Path.wildcard()
      |> Enum.map_join("\n", &File.read!/1)

    refute source =~ "gates.ndjson"
  end

  test "the store writes only inside the directory it was given", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(2))

    written = dir |> File.ls!() |> Enum.sort()

    assert written == ["anchor.json", "ledger.ndjson"],
           "the store created something outside its own contract: #{inspect(written)}"
  end
end
