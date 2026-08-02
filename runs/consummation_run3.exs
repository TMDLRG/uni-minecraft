# consummation_run3.exs — RED launcher scaffold for Consummation Cure-2 Run 3 (B-B6).
#
# Pre-registration: docs/receipts/red_preregistration_consummation_run3.md
# Gate: evidence/gates.ndjson "consummation-honest-cure2" (PARTIAL — Run 3 supersedes Run 2).
# Related: docs/receipts/forage_honest_consummation_RED.md:87-100.
#
# STATUS: SCAFFOLD.

Mix.install([])

defmodule ConsummationRun3 do
  def run(argv) do
    args = parse(argv)
    IO.puts("[consummation_run3] seeds=#{Enum.count(args.seeds)} hours=#{args.hours}")

    unless File.exists?("docs/receipts/red_preregistration_consummation_run3.md"),
      do: raise("pre-registration missing")

    raise """
    SCAFFOLD — Consummation Cure-2 Run 3 (isolated arms) not yet implemented.

    Contract:
      - Two lineages, identical prior: Cure-1 baseline motor, Cure-2 honest-consummation motor.
      - Two ISOLATED MC worlds (different seeds, matched biome mix). One lineage per world.
      - T >= 4 hours; per-bot drop attribution via RCON `data get entity`.

    Verdict:
      - PASS: Cure-2 per-bot drop rate >= 2x Cure-1 under matched attribution.
      - PARTIAL: Cure-2 > Cure-1 but ratio < 2x.
      - FAIL: Cure-2 <= Cure-1.

    Emit: docs/receipts/consummation_run3_<utc>.md.

    Fix-forward from Run 2 confounder: isolated arms + per-bot attribution.
    """
  end

  defp parse(argv) do
    {opts, _, _} =
      OptionParser.parse(argv, strict: [seeds: :string, hours: :integer])

    seeds =
      opts
      |> Keyword.get(:seeds, "")
      |> String.split(",", trim: true)
      |> Enum.reject(&(&1 == ""))

    %{seeds: seeds, hours: Keyword.get(opts, :hours, 4)}
  end
end

ConsummationRun3.run(System.argv())
