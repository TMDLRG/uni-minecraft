# homeostat_colony_red.exs — RED launcher scaffold (B-B4).
#
# Pre-registration: docs/receipts/red_preregistration_homeostat_colony.md
# Gate: evidence/gates.ndjson "homeostat-colony-live" (PENDING).
# Related: CLAUDE.md:162-164, lib/sp/brain/genome.ex:homeostat_colony/0.
#
# STATUS: SCAFFOLD. Names runner shape; body queued.

Mix.install([])

defmodule HomeostatColonyRED do
  def run(argv) do
    args = parse(argv)
    IO.puts("[homeostat_colony_red] hours=#{args.hours}")

    unless File.exists?("docs/receipts/red_preregistration_homeostat_colony.md"),
      do: raise("pre-registration missing")

    raise """
    SCAFFOLD — homeostat_colony/0 live RED not yet implemented.

    Contract:
      - Twin A: homeostat_colony/0 lineage.
      - Twin B: matched sibling (same organs enabled, matched dirichlet counts at t=0,
                homeostat_colony/0 streaming disabled).
      - Same MC world, same spawn, T >= 4 hours.
      - Collect energy/satiety/kill/eat trajectories.

    Verdict:
      - PASS: no regression + >= 1 favorable signature (energy smoothness OR satiety-attenuation).
      - PARTIAL: no regression, no distinguishable signature.
      - WITHHELD: Twin B beats Twin A -> withdraw homeostat_colony/0.

    Emit: docs/receipts/homeostat_colony_red_<utc>.md.
    """
  end

  defp parse(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: [hours: :integer])
    %{hours: Keyword.get(opts, :hours, 4)}
  end
end

HomeostatColonyRED.run(System.argv())
