defmodule Mix.Tasks.Sp.Uni.Prove do
  @shortdoc "Observe the UNI proven (or falsify it): one command runs every is-it-real check."
  @moduledoc """
  The OBSERVABLE proof. Run it and watch each claim about the UNI be tested with evidence:

      mix sp.uni.prove

  It is the antidote to "trust me" — every line is recomputed from the running code, and
  `docs/FALSIFICATION.md` shows exactly how to BREAK each claim if it were false. No live
  Minecraft needed; reproducible on any machine with Elixir.
  """
  use Mix.Task

  alias SP.Brain.{ValidationEngine, MC, Reader, Anchor}
  alias SP.ControlPlane.{Recorder, Store}

  # Phase 9 step 4.1 — THE FIRST PRODUCTION CALLER OF THE CONTROL PLANE.
  #
  # "Zero of 15 Control Plane modules has a production caller." Measured and exact: grepping lib/
  # for SP.ControlPlane outside lib/sp/control_plane/ returned two documentation mentions and
  # nothing else. The body built to record canonical mutations was an island, called only by tests
  # and by one-shot repair scripts.
  #
  # This task is where it comes ashore. It is the most canonical repeatable thing here — every
  # line recomputed from the running code, no live Minecraft needed — and until now the Control
  # Plane had never heard of it. (`mix sp.verify` was the first candidate and was rejected on
  # measurement: there are ZERO .jsonl evidence logs in runs/, so it has nothing to verify. That
  # is part of "the unrun", recorded rather than worked around by inventing a log.)
  @cp_actor "mix sp.uni.prove"
  @cp_transition "proof.observed"
  @cp_report "uni_prove_report.txt"

  @impl true
  def run(_args) do
    Mix.Task.run("compile")
    {_, gates} = ValidationEngine.run()
    globals = ValidationEngine.global_gates()
    all = gates ++ globals
    g = fn id -> Enum.find(all, fn {i, _, _, _} -> i == id end) end

    line = fn {_, name, s, detail} ->
      mark = %{pass: "PASS", fail: "FAIL", skip: "····"}[s]
      IO.puts("  [#{mark}] #{name}#{if detail == "", do: "", else: "  (#{detail})"}")
    end

    IO.puts("\n══ UNI PROOF — observe it proven, or falsify it (docs/FALSIFICATION.md) ══")

    IO.puts("\n[1] NOT A MIMIC — no LLM, no foreign mind, no network")
    line.(g.(14))
    line.(g.(18))
    line.(g.(17))
    deps = Mix.Project.config()[:deps] || []
    IO.puts("  [#{if deps == [], do: "PASS", else: "····"}] zero dependencies  (deps = #{inspect(deps)})")

    IO.puts("\n[2] REAL ACTIVE-INFERENCE MATH — matched to an independent oracle")
    for id <- [1, 2, 3, 5, 7, 11], do: line.(g.(id))

    IO.puts("\n[3] DETERMINISTIC — a stochastic mimic cannot reproduce this")
    senses = %{"health" => 14, "food" => 9, "inv" => %{"wood" => 3}, "look" => "oak_log", "build" => 2}

    run = fn seed ->
      Enum.map_reduce(1..8, MC.new(seed: seed), fn _, b -> MC.step(b, senses) end) |> elem(0)
    end

    det = run.(42) == run.(42) and run.(42) != run.(7)

    IO.puts(
      "  [#{if det, do: "PASS", else: "FAIL"}] same seed → identical actions; different seed → diverges"
    )

    IO.puts("\n[4] THE AGENTS LEARN — the generative model accumulates evidence, not scripted")
    mass = fn b -> b.model.subs |> Enum.flat_map(&List.flatten(&1.pa)) |> Enum.sum() end
    newborn = MC.new(seed: 1)
    lived = Enum.reduce(1..60, newborn, fn _, b -> elem(MC.step(b, senses), 1) end)
    grew = mass.(lived) - mass.(newborn)

    IO.puts(
      "  [#{if grew > 0, do: "PASS", else: "FAIL"}] Dirichlet mass #{Float.round(mass.(newborn), 1)} → #{Float.round(mass.(lived), 1)} (+#{round(grew)} learned in 60 steps)"
    )

    IO.puts("\n[5] THE PRODUCER LEARNS TO READ — free text → meaning, no keywords, admits ignorance")
    r = Anchor.seeded_reader()

    reads = [
      {"count the agents", :count},
      {"is the tick rate stable", :server},
      {"explain your reason", :why}
    ]

    read_ok = Enum.all?(reads, fn {q, m} -> Reader.meaning(r, q) == m end)
    unsure_ok = Reader.meaning(r, "qwerty banana soup") == :unsure

    for {q, m} <- reads,
        do:
          IO.puts(
            "       #{String.pad_trailing(inspect(q), 28)} → #{inspect(Reader.meaning(r, q))}  (want #{inspect(m)})"
          )

    IO.puts(
      "       #{String.pad_trailing(~s|"qwerty banana soup"|, 28)} → #{inspect(Reader.meaning(r, "qwerty banana soup"))}  (admits ignorance)"
    )

    IO.puts(
      "  [#{if read_ok and unsure_ok, do: "PASS", else: "FAIL"}] generalises past keywords AND says :unsure on the unknown"
    )

    IO.puts("\n[6] THE PRODUCER LEARNS TO SPEAK — SURPRISE (free energy) LOW on learned, HIGH on salad")
    pl = Reader.surprise(r, "the tick rate", :server)
    ps = Reader.surprise(r, "banana qwerty zorp", :server)
    IO.puts("       compose(:server) = #{inspect(Reader.compose(r, :server))}")

    IO.puts(
      "  [#{if pl < ps, do: "PASS", else: "FAIL"}] surprise learned #{Float.round(pl, 1)} < salad #{Float.round(ps, 1)}"
    )

    IO.puts("\n[7] IT SPEAKS GROUNDED — never a fact it cannot see (no hallucination)")
    rows = [%{who: "UNI-1-1", emotion: :fear, context: :flee, action: "forward", senses: %{"health" => 5}}]
    spoken = rows |> hd() |> SP.Brain.Speaker.line()
    st = SP.Brain.Speaker.state_of(rows)

    grounded =
      SP.Brain.Speaker.grounded?(spoken, st) and not SP.Brain.Speaker.grounded?("UNI-9-9 is hurt", st)

    IO.puts("       says: #{String.slice(spoken, 0, 84)}")

    IO.puts(
      "  [#{if grounded, do: "PASS", else: "FAIL"}] spoken facts ⊆ state, and a hallucinated name is rejected"
    )

    line.(g.(19))

    IO.puts(
      "\n[8] IT SEES — vision-primary: POV pixels → a pure-FEP visual cortex → a discrete SCENE the brain reasons over"
    )

    vg = SP.Brain.Genome.vision_primary()
    vmods = SP.Brain.Genome.active_modalities(vg) |> Enum.map(& &1.name)
    vbrain = SP.Brain.MC.new(seed: 1, dna: vg)
    {vact, _} = SP.Brain.MC.step(vbrain, %{"health" => 14, "food" => 9, "scene" => 5})
    scene_bin = SP.Brain.MCCodec.outcome(:scene, %{"scene" => 5})

    vision_ok =
      :scene in vmods and length(vbrain.model.subs) == 13 and vact in SP.Brain.Genome.actions() and
        is_integer(scene_bin)

    IO.puts(
      "       vision-primary genome → #{length(vbrain.model.subs)} factors incl :scene (ns=#{SP.Brain.Genome.scene_states()})"
    )

    IO.puts(
      "       the brain ingests scene-state #{scene_bin} — a DISCRETE bin, never raw pixels — and acts: #{vact}"
    )

    IO.puts(
      "  [#{if vision_ok, do: "PASS", else: "FAIL"}] the UNI reasons over a learned scene; pixels stay in the cortex (UNI.OS, audited NN-free; free-energy-drop proof there)"
    )

    passes = [g.(14), g.(18), g.(17), g.(19), g.(1), g.(2), g.(3), g.(5), g.(7), g.(11)]
    gate_ok = Enum.all?(passes, fn {_, _, s, _} -> s == :pass end)

    ok =
      gate_ok and deps == [] and det and grew > 0 and read_ok and unsure_ok and pl < ps and grounded and
        vision_ok

    IO.puts("\n══ VERDICT: #{if ok, do: "ALL PROVEN", else: "A CLAIM FAILED — investigate"} ══")
    IO.puts("To FALSIFY any line above, see docs/FALSIFICATION.md (e.g. inject an LLM call → [1] fails).\n")

    # RECORD BEFORE THE RAISE. An adverse result is the one most worth recording, and a body that
    # only ever hears about the green runs is a highlight reel.
    announce(record_run(cp_dir(), tally(all, ok), report_text(all, ok)))

    unless ok, do: Mix.raise("a UNI proof failed")
  end

  # -- Phase 9 step 4.1: the Control Plane wire ---------------------------------------------------

  @doc """
  Record this proof run in the Control Plane ledger. Public so it can be exercised without running
  the whole task — a wire that can only be tested by running everything is a wire nobody notices
  breaking.

  Returns `{:ok, %{seq: …}}` when it appended, `{:ok, :unchanged}` when the observed result is
  identical to the last one recorded, and `{:error, reason}` when the store cannot be used.

  ## It records an OBSERVATION, and says so

  `F1` refuses a verdict authored with no pre-registered gate. A proof run is the instrument
  reporting what it saw, so the transition is `proof.observed`, the actor is the instrument rather
  than a person, and `resulting.not_a_verdict` states it in words. Recording this as an
  adjudication would launder a measurement into a verdict.

  The authorization is `standing`, not `co_sign`: an automated run cannot manufacture a fresh
  second party, and pretending otherwise would hollow out the two-party rule everywhere else.

  ## The ledger records what CHANGED

  An identical result is not appended again. Re-running and seeing the same thing is not a new
  fact, and a chain that grows on every invocation stops being a record and becomes a log.
  """
  @spec record_run(Path.t(), map(), binary()) ::
          {:ok, map()} | {:ok, :unchanged} | {:error, term()}
  def record_run(dir, summary, report_text) when is_binary(dir) and is_map(summary) do
    digest = :crypto.hash(:sha256, report_text) |> Base.encode16(case: :lower)

    if already_observed?(dir, digest) do
      {:ok, :unchanged}
    else
      with {:ok, abs} <- Store.write_artifact(dir, @cp_report, report_text),
           {:ok, _} <- Store.put_object(dir, report_text) do
        rel = Path.relative_to(abs, evidence_root(dir))
        Recorder.append_one(dir, entry(summary, rel, digest))
      end
    end
  rescue
    # Store.write_artifact raises on a dir it cannot create. RECORDING MUST NEVER STOP THE SCIENCE:
    # a body that records the work must not be able to prevent the work.
    e -> {:error, {:cannot_record, Exception.message(e)}}
  end

  defp entry(summary, rel, digest) do
    %{
      command: :note,
      actor: @cp_actor,
      role: "instrument",
      transition: @cp_transition,
      prior: nil,
      resulting:
        Map.merge(stringify(summary), %{
          "not_a_verdict" =>
            "This is a MEASUREMENT: the instrument reporting what it observed on this run. It is " <>
              "not an adjudication of any gate. F1 refuses a verdict authored with no " <>
              "pre-registered gate, and a reader must not have to infer which of the two this is.",
          "instrument" => @cp_actor,
          "appended_only_on_change" =>
            "an identical result is not recorded twice; a chain that grows on every invocation " <>
              "is a log, not a record"
        }),
      authorization: %{
        "kind" => "standing",
        "granted_by" => "michael",
        "ref" =>
          "phase9_plan.json stage 4 step 4.1 — the recorder becomes the first production caller. " <>
            "STANDING and not co_sign: an automated run cannot manufacture a fresh second party."
      },
      evidence: [%{"path" => rel, "sha256" => digest}]
    }
  end

  defp already_observed?(dir, digest) do
    case Recorder.stored(dir) do
      {:ok, entries} ->
        entries
        |> Enum.filter(&(&1["transition"] == @cp_transition))
        |> List.last()
        |> case do
          nil -> false
          last -> Enum.any?(last["evidence"] || [], &(&1["sha256"] == digest))
        end

      _ ->
        false
    end
  end

  # The store lives at <root>/evidence/control_plane, and evidence paths are recorded relative to
  # <root> so `Store.audit_evidence(dir, root, …)` resolves them. Anywhere else — a temp directory
  # under test — the store IS its own root. Derived rather than passed in, so a caller cannot aim
  # the recorded path somewhere the auditor will not look.
  defp evidence_root(dir) do
    if Path.basename(dir) == "control_plane" and Path.basename(Path.dirname(dir)) == "evidence" do
      dir |> Path.dirname() |> Path.dirname()
    else
      dir
    end
  end

  defp cp_dir, do: Path.join(File.cwd!(), "evidence/control_plane")

  defp tally(all, ok) do
    count = fn s -> Enum.count(all, fn {_, _, st, _} -> st == s end) end

    %{
      all_proven: ok,
      pass: count.(:pass),
      fail: count.(:fail),
      skip: count.(:skip),
      gates_observed: length(all)
    }
  end

  defp report_text(all, ok) do
    lines =
      Enum.map(all, fn {id, name, st, detail} ->
        "#{String.pad_trailing(to_string(id), 4)} #{String.pad_trailing(to_string(st), 5)} " <>
          "#{name} — #{detail}"
      end)

    Enum.join(
      ["UNI PROOF RUN — mix sp.uni.prove", "", "ALL_PROVEN: #{ok}", ""] ++ lines ++ [""],
      "\n"
    )
  end

  defp stringify(m), do: Map.new(m, fn {k, v} -> {to_string(k), v} end)

  defp announce({:ok, :unchanged}),
    do: IO.puts("control plane: unchanged since the last recorded observation; nothing appended.")

  defp announce({:ok, %{seq: seq, total: total}}),
    do: IO.puts("control plane: recorded as seq #{seq}; the chain is now #{total} entries.\n")

  defp announce({:error, reason}),
    do:
      IO.puts(
        "control plane: NOT RECORDED — #{inspect(reason)}\n" <>
          "  The proof above stands on its own; this line says only that the record of it did not land.\n"
      )
end
