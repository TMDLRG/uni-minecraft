defmodule SP.ControlPlane.AppenderTakesLastLineTerminatorTest do
  @moduledoc """
  Phase 4 item 4.7 (`docs/control-plane/phases/PHASE-4.md` in UNI-FLAGELLUM).

  MUST FAIL BEFORE THE CODE EXISTS, for this reason:
    an appender infers the line terminator from anywhere but the last line.

  ## The rollback this rule was bought with

  On 2026-07-25 the Control Plane made its first authorised write to canonical
  evidence. The appender asked *"does `CRLF` appear anywhere in this file?"*,
  found 58 occurrences among 195 lines, and chose `CRLF` — the **minority**
  terminator. It then asked *"does the file end with `CRLF`?"*, found it did not
  (the file ends on a bare `LF`), and appended a separator to be safe.

  Result: eleven correct rows, preceded by **a blank line in canonical evidence
  that nobody authorised.** Every parser in the repository uses `trim: true` and
  would never have noticed. It was caught by `git diff --numstat` reading
  **12 added lines for 11 rows**, and rolled back to the exact pre-write digest.

  The rule that falls out is narrow and mechanical: **what matters when appending
  is the terminator of the last line.** Not the most common one. Not whether
  `CRLF` occurs. And the write proves what it did afterwards, or it is undone.

  `evidence/gates.ndjson` is genuinely mixed — 58 `CRLF`, 148 `LF` at 206 rows —
  so this is not a hypothetical shape.
  """
  use ExUnit.Case, async: true

  alias SP.ControlPlane.{Command, Ledger, Store}

  setup do
    dir = Path.join(System.tmp_dir!(), "cp_eol_#{System.unique_integer([:positive])}")
    on_exit(fn -> File.rm_rf!(dir) end)
    {:ok, dir: dir}
  end

  defp at(n), do: {"2026-07-26T17:00:#{String.pad_leading("#{n}", 2, "0")}Z", 1_785_517_200_000_000_000 + n}

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
          authorization: %{"kind" => "co_sign", "granted_by" => "michael", "ref" => "PHASE-4.md#4.7"},
          evidence: [],
          at: at(i)
        })

      l
    end)
  end

  defp lines(path), do: path |> File.read!() |> String.split(~r/\r?\n/, trim: true)
  defp raw(path), do: File.read!(path)

  test "the terminator comes from the LAST line, not from whether CRLF occurs anywhere", %{dir: dir} do
    l2 = chain(2)
    {:ok, _} = Store.persist(dir, l2)
    path = Store.ledger_path(dir)

    # Rewrite the stored file so line 1 ends CRLF and line 2 ends LF — the exact
    # shape of the canonical gate ledger, and the shape that caused the rollback.
    [a, b] = lines(path)
    File.write!(path, a <> "\r\n" <> b <> "\n")
    assert String.contains?(raw(path), "\r\n")

    l4 = chain(4)
    assert {:ok, %{appended: 2}} = Store.persist(dir, l4)

    appended = raw(path) |> String.split("\n") |> Enum.slice(2, 2)

    for line <- appended do
      refute String.ends_with?(line, "\r"),
             "the appender used CRLF because it appeared somewhere, instead of the last line's LF"
    end
  end

  test "when the last line DOES end CRLF, the appender uses CRLF", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(2))
    path = Store.ledger_path(dir)
    File.write!(path, Enum.map_join(lines(path), "", &(&1 <> "\r\n")))

    assert {:ok, %{appended: 2}} = Store.persist(dir, chain(4))

    assert raw(path) |> String.split("\r\n", trim: true) |> length() == 4,
           "the appender must follow the last line's terminator in BOTH directions"
  end

  test "THE ROLLBACK, mechanically — appending N rows adds exactly N lines and no blank one", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    path = Store.ledger_path(dir)
    before_count = raw(path) |> String.split("\n") |> length()

    {:ok, %{appended: 2}} = Store.persist(dir, chain(5))
    after_count = raw(path) |> String.split("\n") |> length()

    assert after_count - before_count == 2,
           "12 added lines for 11 rows is exactly the defect this test exists to catch"

    refute raw(path) =~ ~r/\n\s*\n/, "a blank line appeared in the record"
    assert length(lines(path)) == 5
  end

  test "a file that does NOT end with a newline gets exactly one separator, not two", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(2))
    path = Store.ledger_path(dir)
    File.write!(path, Enum.join(lines(path), "\n"))
    refute String.ends_with?(raw(path), "\n")

    assert {:ok, %{appended: 1}} = Store.persist(dir, chain(3))
    assert length(lines(path)) == 3
    refute raw(path) =~ ~r/\n\s*\n/
  end

  test "the file ends with exactly one newline, never two", %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(4))
    r = raw(Store.ledger_path(dir))

    assert String.ends_with?(r, "\n")
    refute String.ends_with?(r, "\n\n")
    refute String.ends_with?(r, "\r\n\r\n")
  end

  test "the write PROVES what it did — a store whose file is mutated mid-flight refuses rather than trusts",
       %{dir: dir} do
    {:ok, _} = Store.persist(dir, chain(3))
    path = Store.ledger_path(dir)
    File.write!(path, raw(path) <> "{\"seq\":99}\n")

    assert {:error, _} = Store.persist(dir, chain(5)),
           "the stored bytes are no longer a prefix of the ledger; the write must refuse"
  end

  test "the canonical gate ledger really does have mixed line endings — the premise is live, not remembered" do
    gates = Path.expand("../../../evidence/gates.ndjson", __DIR__)
    bytes = File.read!(gates)

    crlf = bytes |> :binary.matches("\r\n") |> length()
    total = bytes |> String.split(~r/\r?\n/, trim: true) |> length()

    assert crlf > 0 and crlf < total,
           "expected a genuinely mixed file; got #{crlf} CRLF of #{total} lines. " <>
             "If this is now uniform, say so and re-derive the rule rather than deleting it."

    assert String.ends_with?(bytes, "\n")

    refute String.ends_with?(bytes, "\r\n"),
           "the last line ends LF — the minority terminator, which is the trap"
  end
end
