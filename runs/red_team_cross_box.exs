# red_team_cross_box.exs — cross-box single-approval RED-team scaffold (D-C5).
#
# Pre-registration: docs/receipts/red_preregistration_cross_box_g_pa.md
# Gate: evidence/gates.ndjson "cross-box-single-approval" (PENDING).
# Modelled on: production/mcp/red_team_g_pa.sh.
#
# STATUS: SCAFFOLD. Needs the OS-side MCP router token endpoint + a benign
# mutating verb pinned in the pre-registration. Both queued.

Mix.install([])

defmodule RedTeamCrossBox do
  def run(argv) do
    args = parse(argv)
    IO.puts("[red_team_cross_box] verb=#{args.verb} router=#{args.router} executor=#{args.executor}")

    unless File.exists?("docs/receipts/red_preregistration_cross_box_g_pa.md"),
      do: raise("pre-registration missing")

    raise """
    SCAFFOLD — cross-box G-PA red-team not yet implemented.

    Contract (three attacks, ALL must fail closed):
      1. Spent-token reuse: replay a token already redeemed on the executor.
      2. Forged token: submit token with plausible-looking payload but invalid signature.
      3. Executor without router approval: bypass the router, hit LimbGuard directly.

    Verdict:
      - PASS: all three attacks fail closed + each refusal is audited in prod-mcp.ndjson.
      - FAIL: any attack succeeds OR any refusal is not audited.

    Emit: docs/receipts/cross_box_g_pa_<utc>.md (Sec-class).

    Requires: OS-side token endpoint reachable + the benign mutating verb pinned.
    """
  end

  defp parse(argv) do
    {opts, _, _} =
      OptionParser.parse(argv,
        strict: [verb: :string, router: :string, executor: :string]
      )

    %{
      verb: Keyword.get(opts, :verb, "os_file_write"),
      router: Keyword.get(opts, :router, "http://127.0.0.1:8095"),
      executor: Keyword.get(opts, :executor, "http://node2.uni-lab.local:8095")
    }
  end
end

RedTeamCrossBox.run(System.argv())
