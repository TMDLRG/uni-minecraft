# depth_red.exs — RED launcher scaffold for depth-red-b (B-B3).
#
# Pre-registration: docs/receipts/red_preregistration_depth_red_b.md
# Gate: evidence/gates.ndjson "depth-red-b" (PENDING).
# Related spec: docs/specs/sensorium.md:5-40.
#
# STATUS: SCAFFOLD. Names runner shape; body queued to /lab-team-review once
# the :depth factor with init_a=:diagonal lands in a depth_lineage/0 opt-in.

Mix.install([])

defmodule DepthRED do
  def run(argv) do
    args = parse(argv)
    IO.puts("[depth_red] ablation_n=#{args.ablation_n} ticks=#{args.ticks} epsilon=#{args.epsilon}")

    unless File.exists?("docs/receipts/red_preregistration_depth_red_b.md"),
      do: raise("pre-registration missing")

    raise """
    SCAFFOLD — depth RED-B not yet implemented.

    Contract:
      - depth_lineage/0: :depth factor with init_a: :diagonal (opt-in, absent default).
      - Ablation set: N=100 scene tuples with independent depth/vision ground truth.
      - K=1024 ticks, sample posteriors every 128 ticks.
      - epsilon: pre-registered KL threshold (default 0.5 nats).

    Verdict:
      - PASS: KL(depth||vision) > epsilon on all sampled ticks.
      - PARTIAL: PASS on a majority of sampled ticks.
      - FAIL: byte-identity test FAIL OR posteriors indistinguishable.

    Emit: docs/receipts/depth_red_b_<utc>.md.
    """
  end

  defp parse(argv) do
    {opts, _, _} = OptionParser.parse(argv, strict: [ablation_n: :integer, ticks: :integer, epsilon: :float])
    %{
      ablation_n: Keyword.get(opts, :ablation_n, 100),
      ticks: Keyword.get(opts, :ticks, 1024),
      epsilon: Keyword.get(opts, :epsilon, 0.5)
    }
  end
end

DepthRED.run(System.argv())
