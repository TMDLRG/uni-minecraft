defmodule SP.Brain.ValidationEngine do
  @moduledoc """
  The §16 acceptance checklist, enforced. One pure module that runs every numerical
  and structural gate the active-inference engine must satisfy, mapped to the spec's
  13-point list, runnable on ANY compiled card (`mix sp.brain.verify`). This is what
  makes the covenant *enforceable* rather than aspirational — the fence holds because
  CI fails when a gate breaks.

  Gates 1–7 + 13 are checked here directly; 8–10 are runtime/embedding gates covered
  by `bridge_test.exs` / `SP.Sim.Verifier`; 11–12 land with U7/U8 and are reported as
  pending so the checklist is honest about coverage.
  """

  alias SP.Brain.{Math, Model, Infer, Efe, Factors, Genome, Designer, Plan, Strategist}

  @type status :: :pass | :fail | :skip
  @type result :: {pos_integer(), String.t(), status(), String.t()}

  @doc """
  Run all gates against `model` (defaults to the expressed genome). Returns
  `{:ok | :error, [result]}` where each result is `{id, name, status, detail}`.
  """
  @spec run(Factors.t() | nil) :: {:ok | :error, [result()]}
  def run(model \\ nil) do
    model = model || Genome.express(Genome.default())

    results = [
      g(1, "digamma ψ(x) ≈ scipy (1e-6)", check_digamma()),
      g(2, "(ln B)·s ≠ ln(B·s) — bound-critical convention", check_ln_b()),
      g(3, "VFE is an upper bound: F ≥ −ln p(o)", check_vfe_bound()),
      g(4, "A/B columns stochastic (Σ=1)", check_stochastic(model)),
      g(5, "mean-field: belief_size = Σ_f N_f (joint never built)", check_mean_field(model)),
      g(6, "purity: identical (params,obs) ⇒ identical action", check_purity()),
      g(7, "EFE decomposes into finite epistemic + pragmatic", check_efe(model)),
      g(11, "bounded planning ≡ exhaustive at full beam", check_planning()),
      g(12, "hierarchy inter-level blanket carries only primitives", check_hierarchy()),
      g(13, "Designer.compile(card) ≡ Genome.express", check_designer()),
      skip(8, "blanket carries only σ in / α out", "bridge_test.exs"),
      skip(9, "lockstep: N senses ⇄ N actions", "bridge_test.exs"),
      skip(10, "leakage / encode-equivalence / provenance", "SP.Sim.Verifier")
    ]

    status = if Enum.any?(results, fn {_, _, s, _} -> s == :fail end), do: :error, else: :ok
    {status, results}
  end

  @doc """
  Gen-2 GLOBAL gates (run once, not per-card): the "math on chip, no layer" fence.

    * 14 — no foreign computation layer (`Nx`/`rustler`/NIF/`System.cmd`/`Port.open`)
      anywhere in the `SP.Brain.*` MATH namespace (the transport modules — Bridge,
      Colony, Director — legitimately own the body/camera Ports and are excluded).
    * 15 — the BEAM is running the native BeamAsm JIT (`emu_flavor == :jit`), so the
      pure-Elixir math is compiled straight to CPU code with nothing in between.
    * 17 — "no fake in UNI": no SIMULATOR (`SP.World`/`SP.Sim`/`SP.Body`/baselines/eval) is
      referenced anywhere in the LIVE path (runtime + brain + producer). The UNI's senses come
      from the real Minecraft body, never a sim.
    * 18 — "no fake in UNI": no FOREIGN MIND — no LLM/network/external model (HTTP client, vendor
      SDK, websocket) anywhere in the live path. The UNI's decisions are its own pure inference.
  """
  @spec global_gates() :: [result()]
  def global_gates do
    [
      g(14, "no foreign layer (Nx|rustler|nif|System.cmd|Port) in SP.Brain.* math", check_no_foreign_layer()),
      g(15, "native BeamAsm JIT asserted (emu_flavor=:jit) — math on chip", check_native_jit()),
      g(17, "no simulator in the live UNI path (sense→decide→act)", check_no_simulator()),
      g(18, "no foreign mind (LLM/network/external model) in the live UNI path", check_no_foreign_mind()),
      g(
        19,
        "grounded speech: the producer speaks no fact it cannot see (no hallucination)",
        check_grounding()
      )
    ]
  end

  @doc "Pretty one-line-per-gate report, returns the {:ok|:error, results} for chaining."
  def report(model \\ nil) do
    {status, results} = run(model)

    Enum.each(results, fn {id, name, s, detail} ->
      mark = %{pass: "PASS", fail: "FAIL", skip: "····"}[s]

      IO.puts(
        "  [#{mark}] #{String.pad_leading(to_string(id), 2)} · #{name}#{if detail == "", do: "", else: "  (#{detail})"}"
      )
    end)

    {status, results}
  end

  # --- gates -----------------------------------------------------------------

  defp check_digamma do
    anchors = [{1.0, -0.5772156649015329}, {2.0, 0.42278433509846713}, {10.0, 2.2517525890667211}]
    bad = Enum.find(anchors, fn {x, want} -> abs(Math.digamma(x) - want) > 1.0e-6 end)
    if bad, do: {:fail, "ψ(#{elem(bad, 0)}) off"}, else: {:pass, ""}
  end

  defp check_ln_b do
    b = [[0.7, 0.3], [0.2, 0.8]]
    w = [0.5, 0.5]
    gap = Math.vsub(Math.ln_matvec(b, w), Math.vlog(Math.matvec(b, w))) |> Enum.map(&abs/1) |> Enum.max()
    if gap > 1.0e-6, do: {:pass, "Jensen gap #{Float.round(gap, 4)}"}, else: {:fail, "no gap — using ln(Bs)?"}
  end

  defp check_vfe_bound do
    m =
      Model.new(a: [[[0.9, 0.1], [0.1, 0.9]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5])

    m = Infer.infer_states(m, [0])
    f = Infer.vfe(m, [0])
    surprisal = -Math.log(0.5 * 0.9 + 0.5 * 0.1)
    if f >= surprisal - 1.0e-9, do: {:pass, ""}, else: {:fail, "F=#{f} < −ln p(o)=#{surprisal}"}
  end

  defp check_stochastic(%Factors{subs: subs}) do
    cols = Enum.flat_map(subs, fn s -> Enum.flat_map(s.a, & &1) ++ Enum.flat_map(s.b, & &1) end)
    bad = Enum.find(cols, fn col -> abs(Enum.sum(col) - 1.0) > 1.0e-9 end)
    if bad, do: {:fail, "a column sums to #{Enum.sum(bad)}"}, else: {:pass, "#{length(cols)} columns"}
  end

  defp check_mean_field(%Factors{subs: subs} = fm) do
    sum_nf = subs |> Enum.map(& &1.ns) |> Enum.sum()
    prod_nf = subs |> Enum.map(& &1.ns) |> Enum.product()

    cond do
      Factors.belief_size(fm) != sum_nf -> {:fail, "belief_size ≠ Σ_f N_f"}
      length(subs) > 1 and prod_nf == sum_nf -> {:skip, "single-state factors"}
      true -> {:pass, "Σ=#{sum_nf} vs joint ∏=#{prod_nf}"}
    end
  end

  defp check_purity do
    build = fn ->
      Model.new(a: [[[0.8, 0.2], [0.2, 0.8]]], b: [[[1.0, 0.0], [0.0, 1.0]]], c: [[0.0, 0.0]], d: [0.5, 0.5])
      |> Infer.infer_states([0])
    end

    {a1, _} = Efe.select_action(build.(), :argmax)
    {a2, _} = Efe.select_action(build.(), :argmax)
    if a1 == a2, do: {:pass, ""}, else: {:fail, "non-deterministic"}
  end

  defp check_efe(%Factors{} = fm) do
    ev = Factors.evaluate_policies(fm)
    finite? = Enum.all?(ev.neg_efe, &is_number/1) and Enum.all?(ev.q_pi, &is_number/1)
    sums1? = abs(Enum.sum(ev.q_pi) - 1.0) < 1.0e-9
    if finite? and sums1?, do: {:pass, ""}, else: {:fail, "non-finite or q_pi≠1"}
  end

  defp check_designer do
    dna = Genome.default()

    if Designer.compile(Genome.card(dna)) == Genome.express(dna),
      do: {:pass, ""},
      else: {:fail, "compile ≠ express"}
  end

  defp check_planning do
    a = [[0.9, 0.05, 0.05], [0.05, 0.9, 0.05], [0.05, 0.05, 0.9]]
    adv = [[0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]]
    stay = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
    fm = Factors.new([%{a: [a], b: [adv, stay], c: [[1.0, 0.0, 10.0]], d: [1.0, 0.0, 0.0]}])
    seqs = for x <- 0..(fm.nu - 1), y <- 0..(fm.nu - 1), do: [x, y]
    exhaustive = seqs |> Enum.max_by(&Plan.sequence_value(fm, &1)) |> hd()

    if Plan.best_action(fm, depth: 2, beam: fm.nu) == exhaustive,
      do: {:pass, ""},
      else: {:fail, "beam ≠ exhaustive"}
  end

  defp check_hierarchy do
    d = Strategist.digest(Genome.express(Genome.default()))
    if is_integer(d), do: {:pass, "digest=#{d} (primitive)"}, else: {:fail, "non-primitive up-message"}
  end

  # gate 15 — native CPU code, not the interpreter. BeamAsm (OTP 24+) JIT-compiles the
  # pure-Elixir kernels to machine code; this asserts we're actually running it.
  defp check_native_jit do
    case :erlang.system_info(:emu_flavor) do
      :jit -> {:pass, "emu_flavor=:jit"}
      other -> {:fail, "emu_flavor=#{inspect(other)} — not native JIT"}
    end
  end

  # gate 14 — the math is pure Elixir on the BEAM with NO foreign layer between it and the
  # CPU. Scan the SP.Brain math sources for actual usage of a foreign compute/IO layer.
  # The transport/orchestration modules own the body & camera Ports (the blanket), so they
  # are excluded — only the numerical core must be foreign-free.
  @foreign ~r/Nx\.|Rustler|rustler|load_nif|System\.cmd|Port\.open/
  # excluded from the math scan: transport/orchestration own the body & camera Ports (the
  # blanket), and this validator itself names the forbidden tokens (regex + docs).
  @excluded ["bridge.ex", "colony.ex", "director.ex", "validation_engine.ex"]

  defp check_no_foreign_layer do
    dir = Path.join([File.cwd!(), "lib", "sp", "brain"])

    files =
      dir |> Path.join("*.ex") |> Path.wildcard() |> Enum.reject(&(Path.basename(&1) in @excluded))

    case Enum.filter(files, fn f -> Regex.match?(@foreign, File.read!(f)) end) do
      [] -> {:pass, "#{length(files)} math files foreign-free"}
      hits -> {:fail, "foreign layer in #{Enum.map_join(hits, ", ", &Path.basename/1)}"}
    end
  end

  # gates 17–18 — "no fake in UNI". The LIVE path (sense→decide→act→produce) is the runtime +
  # the brain + the producer; it must contain NO simulator and NO external model. The validator
  # itself names the forbidden tokens (regex + docs), so it is excluded — exactly like gate 14.
  @live_dirs [["lib", "sp", "runtime"], ["lib", "sp", "brain"], ["lib", "sp", "producer"]]
  @live_extra [["lib", "sp", "producer.ex"]]
  @live_excluded ["validation_engine.ex"]

  # simulator namespaces, matched as CODE (alias/import/require/use, or a qualified `.Call`) so
  # prose like "mirrors `SP.Sim` (the offline interpreter)" never trips the gate.
  @sim_code ~r/\b(?:alias|import|require|use)\s+SP\.(?:World|Sim|Body|Baselines|Eval)\b|SP\.(?:World|Sim|Body|Baselines|Eval)\.[A-Za-z_]/
  # the only ways to reach an EXTERNAL MODEL that gate 14 (Nx|NIF|System.cmd|Port) doesn't cover:
  # an HTTP client, a vendor SDK, or a websocket. Deliberately NOT the bare words llm/gpt/cohere
  # (so honest "no LLM" docs and "coherent" don't false-trip), and NOT :gen_tcp (RCON to the local
  # Minecraft server is legitimate body/world I/O, not a foreign mind).
  @foreign_mind ~r/openai|anthropic|huggingface|openrouter|HTTPoison|Tesla\.|Finch\.|:httpc|WebSockex|Req\.(?:get|post|request)|api[_.]?key/i

  @doc false
  def simulator_token?(content) when is_binary(content), do: Regex.match?(@sim_code, content)
  @doc false
  def foreign_mind_token?(content) when is_binary(content), do: Regex.match?(@foreign_mind, content)

  # every .ex in the live path, minus the validator (which names the tokens).
  defp live_path_files do
    root = File.cwd!()

    from_dirs =
      Enum.flat_map(@live_dirs, fn parts -> Path.wildcard(Path.join([root | parts] ++ ["**/*.ex"])) end)

    extras = Enum.map(@live_extra, fn parts -> Path.join([root | parts]) end)

    (from_dirs ++ extras)
    |> Enum.filter(&File.exists?/1)
    |> Enum.reject(&(Path.basename(&1) in @live_excluded))
    |> Enum.uniq()
  end

  # gate 17 — no simulator reaches the live UNI.
  defp check_no_simulator do
    files = live_path_files()

    case Enum.filter(files, &simulator_token?(File.read!(&1))) do
      [] -> {:pass, "#{length(files)} live files simulator-free"}
      hits -> {:fail, "simulator ref in #{Enum.map_join(hits, ", ", &Path.basename/1)}"}
    end
  end

  # gate 18 — no foreign mind (LLM/network/external model) reaches the live UNI.
  defp check_no_foreign_mind do
    files = live_path_files()

    case Enum.filter(files, &foreign_mind_token?(File.read!(&1))) do
      [] -> {:pass, "#{length(files)} live files foreign-mind-free"}
      hits -> {:fail, "external-model reach in #{Enum.map_join(hits, ", ", &Path.basename/1)}"}
    end
  end

  # gate 19 — GROUNDED SPEECH: the producer's spoken line names no UNI / cites no number it cannot
  # see in the live state. The language analogue of the blanket: no hallucinated facts.
  defp check_grounding do
    rows = [
      %{who: "UNI-1-1", emotion: :fear, context: :flee, action: "forward", senses: %{"health" => 5}},
      %{who: "UNI-1-2", emotion: :content, context: :forage, action: "mine", senses: %{"food" => 18}}
    ]

    line = rows |> hd() |> SP.Brain.Speaker.line()
    state = SP.Brain.Speaker.state_of(rows)

    cond do
      not SP.Brain.Speaker.grounded?(line, state) ->
        {:fail, "ungrounded line: #{line}"}

      # and it must REJECT a hallucinated name (proves the check actually bites)
      SP.Brain.Speaker.grounded?("UNI-9-9 is hurt", state) ->
        {:fail, "grounding check failed to catch a fake name"}

      true ->
        {:pass, "spoken facts ⊆ live state"}
    end
  end

  # --- result helpers --------------------------------------------------------

  defp g(id, name, {status, detail}), do: {id, name, status, detail}
  defp skip(id, name, detail), do: {id, name, :skip, detail}
end
