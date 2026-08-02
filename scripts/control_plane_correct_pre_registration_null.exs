# Phase 3 item 3.1 — correct the rows whose `pre_registration_path` is `null`.
#
# The schema declares that property `"type": "string"`. Twelve rows carry `null`,
# across eleven distinct gate names. This authors ONE superseding row per name,
# carrying `""` — the value 114 other rows already use to mean "no pre-registration
# exists" — and changes nothing else.
#
# It uses SP.ControlPlane.GateRow.supersede/2, the module Phase 2 built, rather
# than hand-editing JSON. That is the point: the first real act on canonical
# evidence goes through the Control Plane's own authoring path.
#
# The ledger is APPEND-ONLY. The twelve bad rows are not touched and remain in
# the file forever. Only the effective state (last row per name) becomes conformant.
#
#   mix run scripts/control_plane_correct_pre_registration_null.exs --dry-run
#   mix run scripts/control_plane_correct_pre_registration_null.exs --write
#
# Authorised by the operator, 2026-07-25, answering PHASE-3.md §1 option A.

alias SP.ControlPlane.GateRow

gates = Path.expand("../evidence/gates.ndjson", __DIR__)
mode = if "--write" in System.argv(), do: :write, else: :dry_run

raw = File.read!(gates)

# EOL DETECTION — this went wrong once, on 2026-07-25, and the fix is recorded
# here so it cannot go wrong the same way twice.
#
# The canonical ledger has MIXED line endings: 58 lines end CRLF, 137 end with a
# bare LF, and the file ends with a bare LF. The first version of this script
# asked `String.contains?(raw, "\r\n")` and so chose the MINORITY terminator, then
# — because the file does not END with CRLF — appended a spurious separator,
# leaving a blank line in canonical evidence. Eleven correct rows, plus bytes
# nobody authorised. It was rolled back to the original digest.
#
# What matters when appending is the terminator of the LAST line, not the most
# common one and not merely whether CRLF appears anywhere.
eol = if String.ends_with?(raw, "\r\n"), do: "\r\n", else: "\n"
sep = if raw == "" or String.ends_with?(raw, "\n"), do: "", else: eol

lines = String.split(raw, ~r/\r?\n/, trim: true)
rows = Enum.map(lines, &JSON.decode!/1)

crlf = raw |> :binary.matches("\r\n") |> length()

IO.puts(
  "ledger: #{length(rows)} rows · appending with eol #{inspect(eol)} · separator #{inspect(sep)} · " <>
    "(file is mixed: #{crlf} CRLF / #{length(rows) - crlf} LF) · mode #{mode}"
)

# The last row per name is what every reader resolves to.
latest =
  rows
  |> Enum.reduce(%{}, fn row, acc -> Map.put(acc, row["name"], row) end)

targets =
  latest
  |> Map.values()
  |> Enum.filter(&(Map.get(&1, "pre_registration_path", :absent) == nil))
  |> Enum.sort_by(& &1["name"])

IO.puts("gate names whose EFFECTIVE row is non-conformant: #{length(targets)}")

note_prefix =
  "SCHEMA-CONFORMANCE CORRECTION 2026-07-25: the superseded row carried " <>
    "pre_registration_path: null, which production/schemas/gate_row.schema.json forbids " <>
    "(\"type\": \"string\"). Corrected to \"\", the value 114 other rows use to mean no " <>
    "pre-registration exists. Verdict, receipt_path, evidence_class, last_updated and both " <>
    "conditions are UNCHANGED — this moves no science. Authored by " <>
    "SP.ControlPlane.GateRow.supersede/2 under operator authorisation (PHASE-3.md §1, option A). " <>
    "The superseded row is kept; this ledger is append-only. — "

{authored, failures} =
  Enum.reduce(targets, {[], []}, fn prior, {ok, bad} ->
    changes = %{
      "pre_registration_path" => "",
      "notes" => note_prefix <> (prior["notes"] || "")
    }

    case GateRow.supersede(prior, changes) do
      {:ok, row} -> {[{prior, row} | ok], bad}
      {:error, errors} -> {ok, [{prior["name"], errors} | bad]}
    end
  end)

authored = Enum.reverse(authored)

unless failures == [] do
  IO.puts("\nREFUSED — nothing written:")
  Enum.each(failures, fn {n, e} -> IO.puts("  #{n}: #{inspect(e)}") end)
  System.halt(1)
end

# Independent re-check: only the intended fields may differ.
allowed = ~w(pre_registration_path notes supersedes)

drift =
  Enum.flat_map(authored, fn {prior, row} ->
    (Map.keys(prior) ++ Map.keys(row))
    |> Enum.uniq()
    |> Enum.reject(&(&1 in allowed))
    |> Enum.reject(&(Map.get(prior, &1) == Map.get(row, &1)))
    |> Enum.map(&{row["name"], &1, Map.get(prior, &1), Map.get(row, &1)})
  end)

unless drift == [] do
  IO.puts("\nREFUSED — a correction changed a field it was not authorised to change:")
  Enum.each(drift, fn {n, f, a, b} -> IO.puts("  #{n}.#{f}: #{inspect(a)} -> #{inspect(b)}") end)
  System.halt(1)
end

Enum.each(authored, fn {prior, row} ->
  IO.puts(
    "  #{row["name"]}  verdict=#{row["verdict"]} (was #{prior["verdict"]})  " <>
      "pre_registration_path #{inspect(prior["pre_registration_path"])} -> #{inspect(row["pre_registration_path"])}"
  )
end)

appended = Enum.map_join(authored, "", fn {_, row} -> GateRow.encode(row) <> eol end)

case mode do
  :dry_run ->
    IO.puts("\nDRY RUN — nothing written. #{byte_size(appended)} bytes would be appended.")

    IO.puts(
      "first authored row:\n#{authored |> hd() |> elem(1) |> GateRow.encode() |> binary_slice(0, 300)}…"
    )

  :write ->
    before = :crypto.hash(:sha256, raw) |> Base.encode16(case: :lower)
    File.write!(gates, raw <> sep <> appended)
    reread = File.read!(gates)

    # POST-WRITE SELF-CHECK. Added after the first attempt put an undeclared
    # blank line into canonical evidence. A write to append-only evidence proves
    # what it did, or it is rolled back.
    checks = [
      {"the original bytes are an exact PREFIX of the new file — nothing before the append moved",
       String.starts_with?(reread, raw)},
      {"exactly #{length(authored)} rows were added",
       length(String.split(reread, ~r/\r?\n/, trim: true)) == length(rows) + length(authored)},
      {"no blank line was introduced",
       reread |> String.split("\n") |> Enum.drop(-1) |> Enum.all?(&(String.trim(&1) != ""))},
      {"the file still ends with exactly one newline",
       String.ends_with?(reread, eol) and not String.ends_with?(reread, eol <> eol)},
      {"every line still parses as JSON",
       reread
       |> String.split(~r/\r?\n/, trim: true)
       |> Enum.all?(&match?({:ok, _}, JSON.decode(&1)))}
    ]

    failed = Enum.reject(checks, &elem(&1, 1))

    if failed == [] do
      after_ = :crypto.hash(:sha256, reread) |> Base.encode16(case: :lower)
      IO.puts("\nWRITTEN and self-checked (#{length(checks)}/#{length(checks)}).")
      IO.puts("  sha256 #{before}\n    ->   #{after_}")
      IO.puts("  rows: #{length(rows)} -> #{length(rows) + length(authored)}")
    else
      File.write!(gates, raw)
      IO.puts("\nROLLED BACK — the write did not satisfy its own post-conditions:")
      Enum.each(failed, fn {desc, _} -> IO.puts("  FAILED: #{desc}") end)
      IO.puts("  file restored to sha256 #{before}")
      System.halt(1)
    end
end
