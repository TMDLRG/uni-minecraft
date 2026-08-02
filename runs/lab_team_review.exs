# lab_team_review.exs — the in-repo /lab-team-review runner scaffold (A-A2).
#
# WHY: docs/lab_team/*.md carries the auditable persona docs; the RUNNABLE
# skills live outside this repo at ~/.claude/skills/lab-team-*.md (ambient to
# a Claude session). A non-Claude agent or CI cannot invoke the ship gate today.
# This runner reads the persona docs, applies the /lab-team-review orchestration
# (math-breaker FIRST, embodiment FOURTH, aif-theorist MERGES LAST), and emits
# a MERGED VERDICT receipt at docs/receipts/lab_team_review_<sha>.md.
#
# STATUS: scaffold. The persona invocation itself has two supported backends:
#   MODE=api      calls the Anthropic API directly (needs ANTHROPIC_API_KEY;
#                 falls through with a clear error if unset).
#   MODE=stdin    prompts stdin — useful for a human running the loop locally.
#   MODE=dryrun   emits a template receipt with placeholder verdicts (default
#                 in this scaffold — so the file lands honestly WITHOUT
#                 pretending to have run the review).
#
# USAGE:
#   mix run runs/lab_team_review.exs -- --files lib/sp/brain/plan.ex --sha HEAD
#   MODE=dryrun mix run runs/lab_team_review.exs -- --files ...
#
# Emits: docs/receipts/lab_team_review_<sha-prefix>.md with YAML frontmatter
# conforming to A-A5 lint (`verdict: SIGN|SIGN_WITH_CHANGES|REVISE|REJECT`).

Mix.install([])

defmodule LabTeamReview do
  @moduledoc "Scaffold runner for the MERGED VERDICT ship gate."

  @personas [
    {"math-breaker", "docs/lab_team/01_math_breaker.md"},
    {"architect", "docs/lab_team/03_systems_architect.md"},
    {"experimentalist", "docs/lab_team/04_red_experimentalist.md"},
    {"embodiment", "docs/lab_team/05_embodiment_designer.md"},
    {"aif-theorist", "docs/lab_team/02_aif_core_theorist.md"}
  ]

  @merged_verdicts ~w(SIGN SIGN_WITH_CHANGES REVISE REJECT)a

  def run(argv) do
    args = parse(argv)
    files = Map.get(args, :files, [])
    sha = args |> Map.get(:sha, "HEAD") |> resolve_sha()
    mode = System.get_env("MODE", "dryrun")

    IO.puts("[lab_team_review] mode=#{mode} sha=#{sha} files=#{Enum.count(files)}")

    persona_verdicts =
      Enum.map(@personas, fn {name, doc_path} ->
        persona = load_persona(name, doc_path)
        verdict = invoke(mode, persona, files, sha)
        {name, verdict}
      end)

    merged = merge(persona_verdicts)
    write_receipt(sha, files, persona_verdicts, merged, mode)
  end

  # --- persona loading ---
  defp load_persona(name, doc_path) do
    body =
      case File.read(doc_path) do
        {:ok, s} -> s
        {:error, _} -> "(persona doc missing at #{doc_path})"
      end

    %{name: name, doc_path: doc_path, body: body}
  end

  # --- invocation backends ---
  defp invoke("dryrun", persona, _files, _sha) do
    %{
      persona: persona.name,
      verdict: "SIGN_WITH_CHANGES",
      concerns: [
        "SCAFFOLD MODE: no real invocation. This is a template so the runner emits a valid receipt."
      ]
    }
  end

  defp invoke("api", persona, files, sha) do
    case System.get_env("ANTHROPIC_API_KEY") do
      nil ->
        raise """
        MODE=api requires ANTHROPIC_API_KEY.
        Set it, or run MODE=dryrun to land a scaffold receipt.
        """

      _key ->
        # Left as a scaffold: the actual HTTP call to the Messages API is a
        # follow-up implementation once /lab-team-review is a first-class need.
        # Envelope: prompt the persona with (a) its full body, (b) the file
        # diff for the SHA, (c) a strict verdict schema demand.
        IO.puts("[api] persona=#{persona.name} files=#{Enum.count(files)} sha=#{sha}")

        %{persona: persona.name, verdict: "REVISE", concerns: ["MODE=api implementation is queued; use dryrun for now."]}
    end
  end

  defp invoke("stdin", persona, files, _sha) do
    IO.puts("\n--- #{persona.name} (persona doc: #{persona.doc_path}) ---")
    IO.puts("Files touched:")
    Enum.each(files, &IO.puts("  - " <> &1))
    v = IO.gets("Verdict (SIGN|SIGN_WITH_CHANGES|REVISE|REJECT): ") |> to_string() |> String.trim()
    v = if v == "", do: "REVISE", else: v
    c = IO.gets("Concerns (one line): ") |> to_string() |> String.trim()
    %{persona: persona.name, verdict: v, concerns: List.wrap(c)}
  end

  defp invoke(mode, _p, _f, _s), do: raise("unknown MODE=#{mode}")

  # --- merge ---
  # aif-theorist merges LAST. If ANY persona says REJECT -> REJECT.
  # Else if ANY says REVISE -> REVISE. Else if ANY says SIGN_WITH_CHANGES -> SIGN_WITH_CHANGES.
  # Else SIGN. This is the honest disjunction: the worst verdict wins the merge.
  defp merge(persona_verdicts) do
    verdicts = for {_n, v} <- persona_verdicts, do: v.verdict

    cond do
      "REJECT" in verdicts -> "REJECT"
      "REVISE" in verdicts -> "REVISE"
      "SIGN_WITH_CHANGES" in verdicts -> "SIGN_WITH_CHANGES"
      Enum.all?(verdicts, &(&1 == "SIGN")) -> "SIGN"
      true -> "REVISE"
    end
  end

  # --- receipt emission ---
  defp write_receipt(sha, files, persona_verdicts, merged, mode) do
    short = String.slice(sha, 0, 7)
    path = "docs/receipts/lab_team_review_#{short}.md"
    now = DateTime.utc_now() |> DateTime.truncate(:second) |> DateTime.to_iso8601()

    body = """
    ---
    verdict: PARTIAL
    evidence_class: C
    ---

    # /lab-team-review MERGED VERDICT — #{short}

    - **HEAD SHA:** `#{sha}`
    - **Mode:** `#{mode}`
    - **Generated:** #{now}
    - **Runner:** `runs/lab_team_review.exs` (scaffold — A-A2)

    ## Files reviewed
    #{files |> Enum.map(&("- `" <> &1 <> "`")) |> Enum.join("\n")}

    ## Persona verdicts

    #{Enum.map_join(persona_verdicts, "\n", fn {name, v} ->
      concerns =
        (v.concerns || [])
        |> Enum.map(&("  - " <> &1))
        |> Enum.join("\n")

      "### #{name}\n- Verdict: **#{v.verdict}**\n- Concerns:\n#{concerns}"
    end)}

    ## MERGED VERDICT

    **#{merged}**

    (Merge rule: the worst verdict wins. If ANY persona REJECTS, the merged verdict is REJECT.)

    ## Ship-gate artifacts

    Per docs/LAB_PROTOCOL.md §II, no FE-touching merge and no live RED deploy proceeds
    without SIGN or SIGN_WITH_CHANGES + the three artifacts:
    1. Typed spec: (attach path)
    2. Paired RED launcher: (attach path)
    3. Ship-gate checklist: (attach path)

    ## Frontmatter honesty note

    The `verdict:` field above is set to `PARTIAL` because this receipt was
    emitted in scaffold mode. When the runner reaches real backend invocation,
    it will emit `verdict: PASS` (SIGN / SIGN_WITH_CHANGES) or `verdict: FAIL`
    (REVISE / REJECT) mapped from the merged verdict.
    """

    File.mkdir_p!("docs/receipts")
    File.write!(path, body)
    IO.puts("[lab_team_review] wrote #{path}")
  end

  # --- helpers ---
  defp parse(argv) do
    {opts, _, _} =
      OptionParser.parse(argv,
        strict: [files: :string, sha: :string]
      )

    files = opts |> Keyword.get(:files, "") |> String.split(",", trim: true) |> Enum.map(&String.trim/1) |> Enum.reject(&(&1 == ""))
    sha = Keyword.get(opts, :sha, "HEAD")
    %{files: files, sha: sha}
  end

  defp resolve_sha("HEAD"),
    do:
      System.cmd("git", ["rev-parse", "HEAD"])
      |> (fn {out, 0} -> String.trim(out); _ -> "HEAD" end).()

  defp resolve_sha(sha), do: sha
end

LabTeamReview.run(System.argv())
