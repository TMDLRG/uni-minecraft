# motor_shuffle_live_ablation.exs — RED launcher scaffold (B-B2).
#
# Pre-registration: docs/receipts/red_preregistration_motor_shuffle_live_ablation.md
# Gate: evidence/gates.ndjson "motor-shuffle-live-ablation" (PENDING).
# Extends: runs/motor_lineage.exs (existing).
#
# STATUS: SCAFFOLD. Names runner shape; body queued to /lab-team-review once
# the `motor_shuffle_lineage/0` genome opt-in lands (motor_control.shuffle=true
# permuting inference weights per action step).

Mix.install([])

defmodule MotorShuffleLiveAblation do
  def run(argv) do
    args = parse(argv)
    IO.puts("[motor_shuffle_live_ablation] kin_k1=#{args.kin_k1} kin_k2=#{args.kin_k2} hours=#{args.hours}")

    unless File.exists?("docs/receipts/red_preregistration_motor_shuffle_live_ablation.md"),
      do: raise("pre-registration missing")

    raise """
    SCAFFOLD — motor shuffle live ablation not yet implemented against live colony.

    Contract (pre-registration §Protocol):
      - K1: trained motor lineage (frozen from Motor RED).
      - K2: same genome with motor_control.shuffle=true (opt-in, absent default).
      - Same seed, same spawn, T >= 4 hours.
      - Independent RCON polling for drop events (data get entity per prey).

    Verdict:
      - PASS: K1 kill rate > K2 by >= 5x under matched exposure.
      - PARTIAL: K1 > K2 but ratio < 5x.
      - FAIL: K1 <= K2.

    Emit: docs/receipts/motor_shuffle_live_ablation_<utc>.md.

    Requires: motor_shuffle_lineage/0 in lib/sp/brain/genome.ex (opt-in, coupling 0.0).
    """
  end

  defp parse(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: [kin_k1: :string, kin_k2: :string, hours: :integer])
    %{
      kin_k1: Keyword.get(opts, :kin_k1, "motor_trained"),
      kin_k2: Keyword.get(opts, :kin_k2, "motor_shuffled"),
      hours: Keyword.get(opts, :hours, 4)
    }
  end
end

MotorShuffleLiveAblation.run(System.argv())
