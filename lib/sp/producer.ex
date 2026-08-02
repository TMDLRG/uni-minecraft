defmodule SP.Producer do
  @moduledoc """
  The Producer UNI host — the live show-running control plane. A singleton GenServer that
  every beat assembles ALL telemetry (the colony board + server health + logs), runs the
  pure FEP `SP.Producer.Brain` (EFE-minimising decision), and INTERPRETS the chosen action
  as production effects: it drives the camera + narration + cast (via `SP.Brain.Director`,
  which it puts in `:producer` mode and uses as its camera/overlay actuator), and — for
  self-maintenance — the colony and the server. It SUBSUMES the Director's rule-based
  show-running: the Director keeps the proven camera Port + card builder + broadcast that
  `/stream` consumes, but the DECISIONS are now the Producer's active inference.

  The decision is pure (`plan/2`); effects happen only in the GenServer (the Jido contract).

  ## Not to be confused with `SP.ControlPlane`

  "Control plane" is used twice in this codebase and they are DIFFERENT BODIES:

    * `SP.Producer` (here) is the **show's** control plane — camera, narration, cast,
      broadcast. It runs the programme.
    * `SP.ControlPlane` is the **science's** control plane — gates, runs, verdicts,
      receipts, rooms. It runs the experiments and is the only body that may author a
      verdict.

  Neither may be collapsed into the other. See
  `docs/control-plane/decisions/ADR-0006-sp-controlplane-naming-and-placement.md`
  in the UNI-FLAGELLUM repo.
  """
  use GenServer

  require Logger

  alias SP.Brain.{Director, Colony}
  alias SP.Producer.{Brain, Codec, WorldSensor}
  alias SP.Show.RemoteRows
  alias SP.Minecraft.Rcon

  @name __MODULE__
  @tick_ms 1500
  @history 8
  @pop_min 3
  @pop_max 6
  @tps_every 8
  @ewma_w 0.85
  @low_conf 0.3
  # the LONG memory: a slow drama EWMA (half-life ~14 beats ≈ 20s, much longer than the
  # @history=8-beat short window) — the producer's read of the show's arc over time.
  @drama_decay 0.95

  # --- client ----------------------------------------------------------------

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: @name)

  @doc "Start the Producer once (unlinked, survives the LiveView) and hand it the show."
  def ensure_started(opts \\ []) do
    case Process.whereis(@name) do
      nil ->
        case GenServer.start(__MODULE__, opts, name: @name) do
          {:ok, pid} -> pid
          {:error, {:already_started, pid}} -> pid
        end

      pid ->
        pid
    end
  end

  @doc "Diagnostics: the producer's last action, frame, focus, server health (tps), knowledge log."
  def status, do: ensure_started() && GenServer.call(@name, :status)

  # --- pure plan (the test seam) ---------------------------------------------

  @doc """
  PURE: assembled `telemetry` → `{brain, action, directives}`. The directives are inert
  descriptions of effects (`{:star, u}`, `{:shot, type, subj}`, `{:line, u}`, `{:spawn}`,
  `{:cull, u}`, `{:health, kind}`); only the GenServer interprets them.
  """
  def plan(%Brain{} = brain, telemetry) do
    {action, brain} = Brain.step(brain, telemetry)
    rows = Map.get(telemetry, :rows, [])
    frame = Map.get(telemetry, :frame, 0)
    {brain, action, directives(action, rows, frame)}
  end

  @doc "Pure action → directives mapping (the production-effect descriptions). Exposed for tests."
  def directives_for(action, rows, frame), do: directives(action, rows, frame)

  @doc """
  PURE observe-only fence (reviewed: `docs/specs/producer_remote_sense_observe_only.md`). Under
  `observe_only: true`, exactly the world-mutating directives — `{:spawn}`, `{:cull, _}`,
  `{:health, :tps}` — become `{:fenced, dir}` (interpreted as a counted, logged no-op). Identity
  when the opt is absent. Camera/narration directives always pass. FORBIDDEN FIX (binding): never
  quiet fenced choices via a per-action scalar or a shipped-genome C edit — observer-role genomes
  are their own constructor through their own review.
  """
  def fence_directives(dirs, opts) do
    if opts[:observe_only] do
      Enum.map(dirs, fn
        {:spawn} = d -> {:fenced, d}
        {:cull, _} = d -> {:fenced, d}
        {:health, :tps} = d -> {:fenced, d}
        d -> d
      end)
    else
      dirs
    end
  end

  @doc """
  P7 evolvability (PURE): fold the latest per-factor confidences into an EWMA and emit a
  `:sensor_request` for any factor that stays chronically uncertain (low confidence) — the
  producer's "I need a better/new sensor for X" signal, surfaced to the operator.
  """
  def evolve(ewma, confidences) do
    new =
      Enum.reduce(confidences, ewma, fn {name, c}, acc ->
        prev = Map.get(acc, name, 1.0)
        Map.put(acc, name, @ewma_w * prev + (1.0 - @ewma_w) * c)
      end)

    requests =
      for {name, v} <- new,
          v < @low_conf,
          do: %{kind: :sensor_request, factor: name, confidence: Float.round(v, 2)}

    {new, requests}
  end

  # cut to DRAMA = a hard cut, TIGHT on the most dramatic agent — snap to the action and STAY on
  # it. closeup/follow are non-wide, so (unlike establish/overview) they don't auto-revert.
  defp directives(:cut_to_drama, rows, _f), do: subject_dirs(Codec.top_subject(rows), :closeup)
  # roam to another INTEREST = a SMOOTH drone-glide (flyto) to a different agent, trailing it.
  defp directives(:cut_to_subject, rows, f), do: glide_dirs(rotate(rows, f), :follow)
  # B-roll = a smooth glide to a mid beauty shot of someone other than the star.
  defp directives(:b_roll, rows, f), do: glide_dirs(rotate(rows, f), :beauty)
  # widen = a deliberate god's-eye reveal of the whole colony.
  defp directives(:widen, _rows, _f), do: [{:shot, :overview, "-"}]
  # WS2-A: the four story beats the genome DISTINGUISHES now land distinctly on screen, instead of
  # collapsing to one plain line. Each is a different WHO x ASPECT:
  #   crisis — a hard, TIGHT cut to the most dramatic UNI (its drama line).
  #   social — a smooth glide to a socially-engaged UNI, narrating cohesion.
  #   mind   — hold and narrate the star's live REASONING (strategy + planned intent + confidence).
  #   recap  — a grade-4 SP.Brain.Narrator scene paragraph: the periodic "story so far" segment.
  defp directives(:beat_crisis, rows, _f), do: subject_dirs(Codec.top_subject(rows), :closeup)
  defp directives(:beat_social, rows, f), do: social_dirs(rows, f)
  defp directives(:beat_mind, rows, _f), do: ((u = Codec.top_subject(rows)) && [{:mind_line, u}]) || []
  defp directives(:beat_recap, rows, _f), do: [{:recap, rows}]

  defp directives(:spawn_agent, _rows, _f), do: [{:spawn}]
  defp directives(:cull_agent, rows, _f), do: ((s = Codec.low_subject(rows)) && [{:cull, s}]) || []
  defp directives(:health_tps, _rows, _f), do: [{:health, :tps}]
  defp directives(:health_restart_cam, _rows, _f), do: [{:health, :cam}]
  defp directives(_hold_or_noop, _rows, _f), do: []

  # every cut also NARRATES its subject, so narration is coupled to the camera (coherent +
  # frequent) rather than relying on standalone beats.
  defp subject_dirs(nil, _shot), do: []
  defp subject_dirs(u, shot), do: [{:star, u}, {:shot, shot, u}, {:line, u}]

  # A SMOOTH transition to a new subject (vs subject_dirs' hard cut): glide the camera over
  # (flyto) and ease the shot params in — a drone move to the next interest, not a hard jump.
  defp glide_dirs(nil, _shot), do: []
  defp glide_dirs(u, shot), do: [{:glide, u, shot}, {:line, u}]

  # social beat (WS2-A): glide to a UNI whose social sense is engaged (kin or outsider near) and
  # narrate the cohesion (its {:line} resolves to a reunite_kin / meet_outsider beat). If nobody
  # is socially engaged, fall back to a beauty b-roll so the beat is never empty.
  defp social_dirs(rows, f) do
    case Enum.filter(rows, fn r -> (Map.get(r, :senses, %{})["social"] || 0) > 0 end) do
      [] ->
        glide_dirs(rotate(rows, f), :beauty)

      social ->
        u = Enum.at(social, rem(f, length(social))).username
        [{:glide, u, :beauty}, {:social_line, u}]
    end
  end

  # non-wide shot presets (mirror director.js SHOTS) eased in when gliding to a new subject.
  defp shot_params(:follow), do: %{r: 5, h: 2.5, period: 22_000, lerp: 0.18}
  defp shot_params(:beauty), do: %{r: 9, h: 5, period: 16_000, lerp: 0.22}
  defp shot_params(_), do: %{}

  defp rotate(rows, frame) do
    top = Codec.top_subject(rows)

    case Enum.reject(rows, &(&1.username == top)) do
      [] -> nil
      others -> Enum.at(others, rem(frame, length(others))).username
    end
  end

  # --- server ----------------------------------------------------------------

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)
    SP.Runtime.LogSensor.install()
    Director.ensure_started(opts)
    Director.set_driver(:producer)
    Process.send_after(self(), :beat, 900)

    {:ok,
     %{
       brain: Brain.new(seed: opts[:seed] || 7),
       opts: opts,
       frame: 0,
       last_cut: 0,
       rows: [],
       star: nil,
       drama_hist: [],
       star_hist: [],
       last_action: :noop,
       knowledge: [],
       rcon: rcon_connect(opts),
       tps: %{up: true, tps: 20.0},
       world: nil,
       arcs: %{},
       conf_ewma: %{},
       drama_ewma: 1.0,
       requests: [],
       # per-action counts of observe-only-fenced choices — a counter (not a once-only log) so
       # the perseveration rate stays visible on :status (reviewed change D2).
       fenced: %{}
     }}
  end

  @impl true
  def handle_info(:beat, state) do
    state = maybe_poll_tps(state)
    state = maybe_poll_world(state)
    rows = safe_snapshot(state.opts)
    telemetry = build_telemetry(rows, state)
    {brain, action, dirs} = plan(state.brain, telemetry)

    state = %{state | brain: brain, rows: rows, frame: state.frame + 1, last_action: action}
    state = Enum.reduce(fence_directives(dirs, state.opts), state, &interpret(&2, &1))
    state = announce_arcs(state, rows)
    state = record(state, action, Codec.drama(telemetry))

    # P7: fold per-factor confidence into the EWMA; surface any chronic "I need a sensor".
    {ewma, requests} = evolve(state.conf_ewma, Brain.factor_confidence(brain))
    state = surface_requests(%{state | conf_ewma: ewma}, requests)

    Process.send_after(self(), :beat, @tick_ms)
    {:noreply, state}
  end

  def handle_info(_other, state), do: {:noreply, state}

  @impl true
  def handle_call(:status, _from, state) do
    {:reply,
     %{
       frame: state.frame,
       action: state.last_action,
       star: state.star,
       focus: Brain.awareness(state.brain).focus,
       tps: state.tps,
       world: state.world,
       requests: state.requests,
       knowledge: Enum.take(state.knowledge, 8),
       fenced: state.fenced
     }, state}
  end

  # Push a one-time line for each NEWLY-arisen sensor request (operator-facing on /stream).
  defp surface_requests(state, requests) do
    requests
    |> Enum.reject(fn r -> Enum.any?(state.requests, &(&1.factor == r.factor)) end)
    |> Enum.each(fn r ->
      Director.add_line(%{
        text: "PRODUCER REQUESTS a richer sensor for #{r.factor} (confidence #{r.confidence}).",
        who: nil,
        i18n: %{}
      })
    end)

    %{state | requests: requests}
  end

  # --- telemetry & interpretation --------------------------------------------

  defp build_telemetry(rows, state) do
    %{
      rows: rows,
      tps: state.tps,
      # the node's own error/warning rate since last beat — the producer SENSES its logs (the
      # error_rate modality) instead of being blind to them. Drained (read+reset) each beat.
      log: SP.Runtime.LogSensor.drain(),
      frame: state.frame,
      history: %{
        beats_since_cut: state.frame - state.last_cut,
        recent_drama: state.drama_hist,
        recent_stars: state.star_hist,
        # the LONG-arc memory the momentum sensor reads (slow EWMA of drama over the show).
        drama_ewma: state.drama_ewma
      }
    }
  end

  # The ONLY place effects happen (the Jido interpret boundary).
  defp interpret(state, {:star, u}) do
    Director.set_star(u)
    %{state | star: u, last_cut: state.frame, star_hist: Enum.take([u | state.star_hist], @history)}
  end

  defp interpret(state, {:shot, type, subj}) do
    Director.shot(type, subj)
    state
  end

  # SMOOTH glide to a new subject: flyto eases the camera over, cam_set eases the shot params
  # in (no hard cut), and set_star updates the overlay/cards. The producer "flies to" interests.
  defp interpret(state, {:glide, u, shot}) do
    Director.set_star(u)
    Director.flyto(u)
    Director.cam_set(shot_params(shot))
    %{state | star: u, last_cut: state.frame, star_hist: Enum.take([u | state.star_hist], @history)}
  end

  defp interpret(state, {:line, u}), do: say_row(state, u, &Director.narration_line/2)
  # WS2-A mind beat: narrate the star's live REASONING (strategy + planned intent + confidence),
  # regardless of drama — Director.mind_line forces the L2 mind beat.
  defp interpret(state, {:mind_line, u}), do: say_row(state, u, &Director.mind_line/2)
  # WS2-A social beat: narrate the cohesion (kin reunion / outsider meeting) of a clustered UNI.
  defp interpret(state, {:social_line, u}), do: say_row(state, u, &Director.social_line/2)

  # WS2-A recap segment: a grade-4 SP.Brain.Narrator scene paragraph naming the cast — the periodic
  # "story so far". Narrator reads a small `%{who,...}` shape, so map the snapshot rows into it.
  defp interpret(state, {:recap, rows}) do
    cast =
      rows
      |> Enum.take(4)
      |> Enum.map(fn r ->
        %{
          who: r.username,
          context: Map.get(r, :context),
          emotion: Map.get(r, :emotion),
          action: Map.get(r, :action)
        }
      end)

    i18n = safe(fn -> SP.Brain.Narrator.write(cast) end)

    if is_map(i18n) and is_binary(Map.get(i18n, :en)) do
      line = %{text: i18n.en, who: nil, i18n: i18n}
      Director.add_line(line)
      safe(fn -> SP.Brain.Anchor.observe(i18n.en) end)
    end

    state
  end

  defp interpret(state, {:spawn}), do: maybe_spawn(state)
  defp interpret(state, {:cull, u}), do: maybe_cull(state, u)

  # Observe-only fence (reviewed): the chosen world-mutating directive is counted and produces
  # NO effect. First occurrence per action logs once; the counter carries the rate.
  defp interpret(state, {:fenced, dir}) do
    key = fenced_key(dir)

    if not Map.has_key?(state.fenced, key),
      do:
        Logger.info(
          "[producer] observe-only fence: #{inspect(dir)} chosen; not actuated (counted from now on)"
        )

    %{state | fenced: Map.update(state.fenced, key, 1, &(&1 + 1))}
  end

  # Self-maintenance (homeostasis as active inference): the producer INFERS a sick server /
  # camera and chooses the action whose designed effect moves that factor back to healthy.
  defp interpret(state, {:health, :tps}) do
    # dropped items are the usual TPS sink — declutter the world (a safe recovery action).
    if state.rcon, do: safe(fn -> Rcon.command(state.rcon, "kill @e[type=item]") end)
    state
  end

  defp interpret(state, {:health, :cam}) do
    # nudge the camera to re-acquire its subject (self-heal the shot).
    if state.star, do: Director.cut(state.star)
    state
  end

  # Narrate a specific row via a Director line-builder, then LEARN from the producer's own speech
  # (one faculty learns all it says AND is asked). The claim fence is applied at Director.add_line.
  defp say_row(state, u, builder) do
    case Enum.find(state.rows, &(&1.username == u)) do
      nil ->
        :ok

      row ->
        line = builder.(row, state.frame)
        Director.add_line(line)

        if is_map(line) and is_binary(Map.get(line, :text)),
          do: safe(fn -> SP.Brain.Anchor.observe(line.text) end)
    end

    state
  end

  defp maybe_spawn(state) do
    if length(state.rows) < @pop_max do
      kin = rem(state.frame, 10)
      safe(fn -> Colony.spawn_agent(kin, "see_all") end)
    end

    state
  end

  defp maybe_cull(state, u) do
    if length(state.rows) > @pop_min and u, do: safe(fn -> Colony.stop_agent(u) end)
    state
  end

  defp record(state, action, drama) do
    entry = %{frame: state.frame, action: action, star: state.star, drama: drama}
    # short memory: the last @history drama scores. long memory: a slow EWMA of drama (the arc).
    ewma = @drama_decay * state.drama_ewma + (1.0 - @drama_decay) * drama

    %{
      state
      | drama_hist: Enum.take([drama | state.drama_hist], @history),
        drama_ewma: ewma,
        knowledge: Enum.take([entry | state.knowledge], 200)
    }
  end

  defp rcon_connect(opts) do
    case Rcon.connect(
           opts[:mc_host] || System.get_env("MC_HOST") || "127.0.0.1",
           opts[:rcon_port] || 25_575,
           opts[:rcon_pass] || "sp"
         ) do
      {:ok, sock} -> sock
      _ -> nil
    end
  end

  # Poll server health every @tps_every beats (bounds RCON load). No socket ⇒ assume healthy
  # (don't cry wolf in dev); a dropped socket ⇒ mark down + try to reconnect.
  defp maybe_poll_tps(%{rcon: nil} = state), do: state

  defp maybe_poll_tps(state) do
    if rem(state.frame, @tps_every) == 0 do
      case safe(fn -> Rcon.command(state.rcon, "tps") end) do
        {:ok, body} ->
          case parse_tps(body) do
            {:ok, t} -> %{state | tps: %{up: true, tps: t}}
            :error -> %{state | tps: %{up: true, tps: 20.0}}
          end

        _ ->
          %{state | tps: %{up: false, tps: 0.0}, rcon: rcon_connect(state.opts)}
      end
    else
      state
    end
  end

  # Paper's `tps` reads "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0" (± color codes). Require
  # a DECIMAL so we grab the first TPS value (20.0), not the "1" in the "1m" label.
  defp parse_tps(body) do
    case Regex.run(~r/\d+\.\d+/, to_string(body)) do
      [n] ->
        case Float.parse(n) do
          {f, _} -> {:ok, f}
          :error -> :error
        end

      _ ->
        :error
    end
  end

  # WS1-B: the WORLD sense. On a slow cadence (offset from the TPS poll so RCON calls don't bunch),
  # read day/night + colony size and narrate the transitions as world COLOR — a side-channel to the
  # EFE-chosen subject beat, NOT a new modality (the brain never sees `world`, so the FE gate is
  # untouched). Markov-safe: WorldSensor reads world-level facts only, never a UNI's coordinates.
  defp maybe_poll_world(%{rcon: nil} = state), do: state

  defp maybe_poll_world(state) do
    if rem(state.frame, @tps_every) == 4 do
      case safe(fn -> WorldSensor.poll(state.rcon) end) do
        w when is_map(w) -> announce_world(state, w)
        _ -> state
      end
    else
      state
    end
  end

  # Narrate a day/night transition or a colony-size increase (fence-clean, model-honest). The very
  # first reading only seeds state.world (no transition to announce).
  defp announce_world(state, world) do
    prev = state.world

    cond do
      is_nil(prev) ->
        :ok

      world.daytime == :night and prev.daytime != :night ->
        push_world_line(:world_nightfall, %{day: world.day})

      world.daytime == :day and prev.daytime in [:dawn, :night, :dusk] ->
        push_world_line(:world_dawn, %{day: world.day})

      world.online > prev.online ->
        push_world_line(:world_grew, %{online: world.online})

      true ->
        :ok
    end

    %{state | world: world}
  end

  defp push_world_line(beat, data) do
    i18n = SP.Brain.Narration.render(beat, data)
    Director.add_line(%{text: Map.get(i18n, :en, ""), who: Map.get(data, :who), i18n: i18n})
  end

  # WS2-B: per-UNI story ARCS over time. The Producer keeps a small per-UNI record and narrates a
  # rung when a UNI's curriculum PHASE climbs, and once when it has weathered a long stretch. These
  # are side-channel arc lines (like world beats); the claim fence still applies at add_line.
  @survive_ticks 500

  defp announce_arcs(state, rows) do
    {arcs, beats} =
      Enum.reduce(rows, {state.arcs, []}, fn r, {acc, bs} ->
        u = r.username
        prev = Map.get(acc, u, %{phase: nil, survived: false})
        phase = Map.get(r, :phase)
        count = Map.get(r, :count, 0)

        {bs, survived} =
          cond do
            is_integer(phase) and is_integer(prev.phase) and phase > prev.phase ->
              {[{:arc_grew, %{who: u, phase: phase, phasename: phase_name(phase)}} | bs], prev.survived}

            count >= @survive_ticks and not prev.survived ->
              {[{:arc_survived, %{who: u}} | bs], true}

            true ->
              {bs, prev.survived}
          end

        {Map.put(acc, u, %{phase: phase, survived: survived}), bs}
      end)

    Enum.each(beats, fn {beat, data} -> push_world_line(beat, data) end)
    %{state | arcs: arcs}
  end

  # curriculum labels (curriculum.ex:9): 0 survive · 1 wood · 2 craft · 3 mine · 4 shelter.
  defp phase_name(0), do: "survival"
  defp phase_name(1), do: "gathering wood"
  defp phase_name(2), do: "crafting basics"
  defp phase_name(3), do: "mining stone"
  defp phase_name(4), do: "building shelter"
  defp phase_name(_), do: "growing"

  # Rows through the reviewed transport seam: opts[:colony_node] nil = today's local read
  # (byte-identical, incl. the exception→[] fold, now inside RemoteRows.fetch/1).
  defp safe_snapshot(opts), do: RemoteRows.fetch(opts[:colony_node])

  defp fenced_key({:spawn}), do: :spawn_agent
  defp fenced_key({:cull, _}), do: :cull_agent
  defp fenced_key({:health, :tps}), do: :health_tps
  defp fenced_key(other), do: other

  defp safe(fun) do
    try do
      fun.()
    catch
      _, _ -> :error
    end
  end
end
