# pureworld_qa_gate.exs — RED launcher scaffold for forage-pureworld-graduation (B-B1).
#
# Pre-registration: docs/receipts/red_preregistration_forage_pureworld_graduation.md
# Gate: evidence/gates.ndjson row "forage-pureworld-graduation" (PENDING).
#
# STATUS: SCAFFOLD. This file names the runner's SHAPE — argv parsing, seed sweep,
# twin comparison, per-tick collection, receipt emission — without asserting a
# working end-to-end run against the live UNI-LAB colony. The runner body is
# marked with @scaffold and raises if invoked. Future engineering completes the
# body once the paired FE code (metab_scale=1.0 world spawn + twin-lineage
# support in SP.Runtime.Lineage) is added under /lab-team-review.
#
# CONTRACT the scaffold locks in (any future implementation must honor):
#   - `--seeds "s1,s2,s3,..."` : the frozen seed list (pre-registered).
#   - `--twin-a` and `--twin-b` : lineage names (trained vs untrained).
#   - `--hours <n>` : soak duration; default 4.
#   - Emits `docs/receipts/forage_graduation_<utc>.md` with YAML frontmatter
#     conforming to A-A5 (`verdict:`, `evidence_class:`).
#   - The receipt names EVERY seed's outcome + Twin B (untrained) discriminator
#     check per pre-registration §Verdict.
#
# Non-goals: this scaffold does NOT run against the live colony. The plan
# (B-B1) queues that as the follow-up once the FE seam is added.

Mix.install([])

defmodule PureworldQAGate do
  @scaffold "SCAFFOLD — this launcher is not yet implemented against the live colony"

  def run(argv) do
    args = parse(argv)
    IO.puts("[pureworld_qa_gate] seeds=#{Enum.count(args.seeds)} " <>
            "twin_a=#{args.twin_a} twin_b=#{args.twin_b} hours=#{args.hours}")

    ensure_pre_reg_read!()

    _ = check_prereqs()  # scaffold: intentionally does not touch the colony

    raise """
    #{@scaffold}.

    Contract (from docs/receipts/red_preregistration_forage_pureworld_graduation.md):
      - seeds: frozen list, N >= 8
      - twin_a: trained lineage (closed-runway or homeostat_colony/0)
      - twin_b: untrained control (fresh default/0, no memory)
      - hours: T >= 4 (or the pre-registered N ticks)

    Verdict:
      - PASS iff every seed shows Twin A alive at T AND some seed shows Twin B dead by T.
      - PARTIAL iff some seeds PASS the discriminator but not all.
      - FAIL iff any seed shows Twin B alive AND Twin A dead.

    Emit: docs/receipts/forage_graduation_<utc>.md with per-seed rows.

    Next: implement against SP.Runtime.Lineage twin support + metab_scale=1.0 spawn.
    """
  end

  defp parse(argv) do
    {opts, _, _} =
      OptionParser.parse(argv,
        strict: [seeds: :string, twin_a: :string, twin_b: :string, hours: :integer]
      )

    seeds =
      opts
      |> Keyword.get(:seeds, "")
      |> String.split(",", trim: true)
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))

    %{
      seeds: seeds,
      twin_a: Keyword.get(opts, :twin_a, "homeostat_colony"),
      twin_b: Keyword.get(opts, :twin_b, "default"),
      hours: Keyword.get(opts, :hours, 4)
    }
  end

  defp ensure_pre_reg_read! do
    pre_reg = "docs/receipts/red_preregistration_forage_pureworld_graduation.md"

    unless File.exists?(pre_reg) do
      raise "pre-registration missing at #{pre_reg} — refusing to run"
    end
  end

  defp check_prereqs, do: :ok
end

PureworldQAGate.run(System.argv())
