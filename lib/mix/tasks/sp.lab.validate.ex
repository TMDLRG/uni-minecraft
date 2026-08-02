defmodule Mix.Tasks.Sp.Lab.Validate do
  @shortdoc "Cross-check: re-derive every lab ledger/proof number from the code; exit non-zero on any delta."
  @moduledoc """
  Runs `SP.Lab.Validate` — recomputes every code-backed number the lab's ledgers, proofs, and
  dossier assert, and verifies each against its documented value within tolerance.

      mix sp.lab.validate            # print report, exit 0 if all green
      mix sp.lab.validate --out PATH # also write the report to PATH

  Exits with status 1 if any check fails, so it can gate CI alongside `mix test`.
  """
  use Mix.Task

  @impl true
  def run(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: [out: :string])
    Mix.Task.run("compile")

    result = SP.Lab.Validate.run()
    report = SP.Lab.Validate.format(result)
    IO.puts(report)

    if path = opts[:out] do
      File.mkdir_p!(Path.dirname(path))
      File.write!(path, report)
      IO.puts("Report written to #{path}")
    end

    unless result.ok do
      Mix.raise("sp.lab.validate: one or more cross-checks FAILED (see report above).")
    end
  end
end
