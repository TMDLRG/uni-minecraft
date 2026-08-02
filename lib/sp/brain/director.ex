defmodule SP.Brain.Director do
  @moduledoc """
  The show-runner for the live stream. Every beat it reads the colony snapshot
  (each agent's live senses + chosen action), scores the drama, picks the **star**
  (the agent with the most going on), writes rule-based **narration** (survival +
  social + mind beats), and tells the **director camera** (`viewer/director.js`,
  owned here as a Port) who to follow. The broadcast page (`/stream`) renders the
  camera + the narration + per-agent cards.
  """
  use GenServer

  alias SP.Brain.Narration
  alias SP.Show.RemoteRows

  @repo_root Path.expand("../../..", __DIR__)
  @name __MODULE__
  @tick_ms 1500
  @history 9
  # Hold on the current star for at least this many beats before drifting to a
  # new max-drama agent — a calm "cut" cadence. A :major event always overrides
  # the cooldown (hard cut to the crisis). B-roll on a non-star every N beats.
  @cut_cooldown 4
  @ensemble_every 5

  # --- client ----------------------------------------------------------------

  def start_link(opts \\ []), do: GenServer.start_link(__MODULE__, opts, name: @name)

  # Started UNLINKED so the Director (and its camera) survive the LiveView that
  # first opened /stream — otherwise navigating away would kill it.
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

  @doc "The current broadcast state: star, recent narration lines, per-agent cards, day."
  def broadcast do
    ensure_started()
    GenServer.call(@name, :broadcast)
  end

  @doc """
  Camera directives — drive the `viewer/director.js` shot grammar. `type` ∈
  `orbit|closeup|follow|beauty|establish|overview`; `subject` a username (or `"-"` for the
  colony, on overview). `opts` may carry `r:/h:/period:/lerp:`. (The Producer UNI calls these.)
  """
  def shot(type, subject, opts \\ %{}),
    do: cam_cast(["shot", to_string(type), to_string(subject)] ++ kv(opts))

  def flyto(subject, secs \\ 2.0), do: cam_cast(["flyto", to_string(subject), "secs=#{secs}"])
  def cut(subject), do: cam_cast(["cut", to_string(subject)])
  def cam_set(opts), do: cam_cast(["set" | kv(opts)])

  defp cam_cast(parts) do
    ensure_started()
    GenServer.cast(@name, {:cam, Enum.join(parts, " ")})
  end

  defp kv(opts), do: Enum.map(opts, fn {k, v} -> "#{k}=#{v}" end)

  @doc "Hand show-running to the Producer UNI (`:producer`) or back to the rule-based Director (`:self`)."
  def set_driver(d) when d in [:self, :producer], do: GenServer.cast(@name, {:set_driver, d})

  @doc """
  The REAL current show-driver — `:self` (the rule-based Director puppet) or `:producer` (the Producer UNI drives
  the star/lines/camera). Read by the health surface so `verdict=LIVE` reflects who ACTUALLY drives, NOT mere
  Director PID existence (the puppet-cam guard: a headless `:self` puppet must never read LIVE). Plain call — does
  NOT start the Director; callers guard on liveness and wrap in a catch.
  """
  def driver, do: GenServer.call(@name, :driver)

  @doc "Producer-driven: set the on-screen star (the camera subject)."
  def set_star(star), do: GenServer.cast(@name, {:set_star, star})

  @doc "Producer-driven: push a narration line (a `%{text, who, i18n}` map) into the broadcast."
  def add_line(line), do: GenServer.cast(@name, {:add_line, line})

  # high-drama moments get an authored, punchy beat; everything ambient is COMPOSED from the
  # agent's live state by the generative grammar (a far larger, situation-shaped sentence space).
  # WS1-A: the graded viability beats are authored too (the interoceptive body is a survival
  # signal, narrated as MODEL VARIABLES — "its energy reserve reads critical", never "it feels").
  @drama_beats [
    :under_attack,
    :gravely_wounded,
    :rebirth,
    :hostile_near,
    :wounded,
    :viability_crisis,
    :viability_low
  ]

  @doc "Build a multilingual narration line for a snapshot row (the Producer's narrate actuator)."
  def narration_line(%{username: u} = row, frame) do
    {beat, data} = beat_of(row)

    i18n =
      if beat in @drama_beats do
        Narration.render(beat, data, frame: frame)
      else
        Narration.compose(
          %{
            who: u,
            emotion: Map.get(row, :emotion),
            context: Map.get(row, :context),
            action: Map.get(row, :action)
          },
          frame: frame
        )
      end

    %{text: Map.get(i18n, :en, headline(row, frame)), who: u, i18n: i18n}
  end

  @doc """
  A forced MIND line for a snapshot row — the L2 strategic option + planned intent + confidence,
  narrated REGARDLESS of drama (the Producer's `:beat_mind` actuator, WS2-A). Renders in all five
  languages. Distinct from `narration_line/2`, whose per-UNI beat would surface drama first.
  """
  def mind_line(%{username: u} = row, frame) do
    {beat, data} = strategy_beat(row, u)
    i18n = Narration.render(beat, data, frame: frame)
    %{text: Map.get(i18n, :en, mind_beat(row, frame)), who: u, i18n: i18n}
  end

  @doc """
  A forced SOCIAL (cohesion) line — kin reunion or outsider meeting — the Producer's `:beat_social`
  actuator (WS2-A). Renders the authored social template in all five languages, so the social beat
  actually narrates the cluster instead of a generic ambient line.
  """
  def social_line(%{username: u, senses: s} = row, frame) do
    beat = if (s["social"] || 0) == 2, do: :meet_outsider, else: :reunite_kin
    i18n = Narration.render(beat, %{who: u}, frame: frame)
    %{text: Map.get(i18n, :en, headline(row, frame)), who: u, i18n: i18n}
  end

  # --- server ----------------------------------------------------------------

  @impl true
  def init(opts) do
    Process.flag(:trap_exit, true)
    port = spawn_camera(opts)
    Process.send_after(self(), :beat, 800)
    # driver: :self = the legacy rule-based show-runner; :producer = the Producer UNI drives
    # the star/lines/camera and the Director only keeps cards + the frame clock fresh.
    {:ok,
     %{
       port: port,
       opts: opts,
       star: nil,
       lines: [],
       cards: [],
       frame: 0,
       prev: %{},
       last_cut: 0,
       driver: :self
     }}
  end

  @impl true
  def handle_info(:beat, %{driver: :producer} = state) do
    snaps = safe_snapshot(state.opts)
    Process.send_after(self(), :beat, @tick_ms)

    {:noreply,
     %{
       state
       | cards: Enum.map(snaps, &card/1),
         frame: state.frame + 1,
         prev: Map.new(snaps, &{&1.username, &1.senses})
     }}
  end

  def handle_info(:beat, state) do
    snaps = safe_snapshot(state.opts)
    cur = Map.new(snaps, fn s -> {s.username, s.senses} end)
    events = detect_events(snaps, state.prev)
    scored = Enum.map(snaps, fn s -> {score(s, state.frame), s} end)

    # Star = the camera subject. A :major event forces a hard cut to the agent
    # in crisis; otherwise we hold the current star until the cut cooldown lapses,
    # then drift to whoever now has the most going on.
    {star, cut?} = choose_star(scored, events, state)
    last_cut = if cut?, do: state.frame, else: state.last_cut
    star_snap = Enum.find(snaps, &(&1.username == star))
    # On a cut, choose the SHOT (not just the subject): focus on action, widen for danger.
    state = if cut?, do: cut_to(state, star, shot_for(star_snap, state.frame)), else: state

    # Headline priority: a major event's beat wins; else narrate the star.
    new_line =
      cond do
        e = Enum.find(events, &(&1.kind == :major)) ->
          %{text: e.text, who: e.who, i18n: Narration.render(e.beat, e.data, frame: state.frame)}

        star_snap ->
          {beat, data} = beat_of(star_snap)

          %{
            text: headline(star_snap, state.frame),
            who: star,
            i18n: Narration.render(beat, data, frame: state.frame)
          }

        true ->
          nil
      end

    lines = push_line(state.lines, new_line)

    # Every few beats, drop a B-roll line about someone OTHER than the star into
    # the TICKER (never the headline — the big caption always tracks the camera),
    # so the ensemble story keeps moving without contradicting the live shot.
    lines =
      if rem(state.frame, @ensemble_every) == 0 and not Enum.any?(events, &(&1.kind == :major)) do
        insert_secondary(lines, ensemble_line(snaps, star, state.frame))
      else
        lines
      end

    Process.send_after(self(), :beat, @tick_ms)

    {:noreply,
     %{
       state
       | star: star,
         lines: lines,
         cards: Enum.map(snaps, &card/1),
         frame: state.frame + 1,
         last_cut: last_cut,
         prev: cur
     }}
  end

  # The camera (director.js) exited — respawn it after a beat so the live view self-heals
  # (e.g. after a Minecraft disconnect, or when its code is reloaded).
  def handle_info({port, {:exit_status, _}}, %{port: port} = state) do
    Process.send_after(self(), :respawn_camera, 1500)
    {:noreply, %{state | port: nil}}
  end

  def handle_info(:respawn_camera, state) do
    port = spawn_camera(state.opts)
    # Re-send the current star so the fresh camera knows who to follow (otherwise it
    # sits at its spawn point until the next cut — looking "stuck").
    port = if state.star, do: cam_write(port, "star #{state.star}\n"), else: port
    {:noreply, %{state | port: port}}
  end

  def handle_info(_other, state), do: {:noreply, state}

  @impl true
  def handle_call(:broadcast, _from, state) do
    {:reply, %{star: state.star, lines: state.lines, cards: state.cards, day: div(state.frame, 120) + 1},
     state}
  end

  def handle_call(:driver, _from, state), do: {:reply, state.driver, state}

  @impl true
  def handle_cast({:cam, line}, state) do
    {:noreply, %{state | port: cam_write(state.port, line <> "\n")}}
  end

  def handle_cast({:set_driver, d}, state), do: {:noreply, %{state | driver: d}}
  def handle_cast({:set_star, star}, state), do: {:noreply, %{state | star: star}}

  # WS3-A: every line pushed to the broadcast passes the claim fence HERE — the single choke point
  # for Producer narration (subject/mind/world/recap/sensor lines all flow through add_line). A
  # line that trips the fence is DROPPED (honestly silent), never aired.
  def handle_cast({:add_line, line}, state) do
    case SP.Brain.Fence.gate_line(line) do
      nil -> {:noreply, state}
      clean -> {:noreply, %{state | lines: push_line(state.lines, clean)}}
    end
  end

  # Crash-safe camera write: a nil / dead / stale port (MC disconnect, OOM, a leftover port
  # after a node restart) must NEVER crash the show-runner. On failure we drop the port and
  # schedule a respawn, so the camera self-heals. Returns the live port, or nil to re-spawn.
  defp cam_write(nil, _line), do: nil

  defp cam_write(port, line) do
    Port.command(port, line)
    port
  catch
    _, _ ->
      Process.send_after(self(), :respawn_camera, 500)
      nil
  end

  @impl true
  def terminate(_reason, state) do
    if state.port do
      try do
        Port.close(state.port)
      catch
        _, _ -> :ok
      end
    end

    :ok
  end

  defp threat_label(s) do
    cond do
      truthy(s["hurt"]) -> "attacked"
      near?(s["hostile_dist"]) -> "threat near"
      true -> "—"
    end
  end

  defp social_label(1), do: "kin near"
  defp social_label(2), do: "outsider"
  defp social_label(_), do: "alone"

  # --- drama logic (rule-based) ----------------------------------------------

  # Story BEATS are edge-triggered: we compare each agent's senses now vs the
  # previous beat and emit an event only on a transition (so a crisis fires once,
  # not every tick it persists). :major beats trigger a hard camera cut.
  defp detect_events(snaps, prev) do
    Enum.flat_map(snaps, fn %{username: u, senses: s} -> detect_for(u, s, Map.get(prev, u)) end)
  end

  defp detect_for(_u, _s, nil), do: []

  defp detect_for(u, s, p) do
    []
    |> add_event(truthy(s["hurt"]) and not truthy(p["hurt"]), u, :major, :under_attack)
    |> add_event(num(s["health"], 20) < 6 and num(p["health"], 20) >= 6, u, :major, :gravely_wounded)
    |> add_event(num(s["health"], 20) >= 18 and num(p["health"], 20) < 6, u, :major, :rebirth)
    |> add_event(near?(s["hostile_dist"]) and not near?(p["hostile_dist"]), u, :minor, :hostile_near)
    |> add_event((s["social"] || 0) == 1 and (p["social"] || 0) != 1, u, :minor, :reunite_kin)
    |> add_event((s["social"] || 0) == 2 and (p["social"] || 0) != 2, u, :minor, :meet_outsider)
    |> add_event(num(s["food"], 20) < 8 and num(p["food"], 20) >= 8, u, :minor, :hunger)
  end

  # Events carry the BEAT (an atom) + data, so each renders in all five languages via
  # SP.Brain.Narration; `text` stays the English string (the /stream fallback).
  defp add_event(events, true, who, kind, beat) do
    data = %{who: who}
    [%{who: who, kind: kind, beat: beat, data: data, text: Narration.render_one(beat, data, :en)} | events]
  end

  defp add_event(events, _false, _who, _kind, _beat), do: events

  defp choose_star(scored, events, state) do
    major = Enum.find(events, &(&1.kind == :major))

    cond do
      major ->
        {major.who, true}

      scored == [] ->
        {state.star, false}

      is_nil(state.star) ->
        {top_star(scored), true}

      state.frame - state.last_cut >= @cut_cooldown ->
        top = top_star(scored)
        {top, top != state.star}

      true ->
        {state.star, false}
    end
  end

  defp top_star(scored), do: scored |> Enum.max_by(&elem(&1, 0)) |> elem(1) |> Map.fetch!(:username)

  defp push_line(lines, nil), do: lines

  defp push_line(lines, %{text: t} = line) do
    if List.first(lines)[:text] == t, do: lines, else: Enum.take([line | lines], @history)
  end

  # B-roll: slot a line into the TICKER just under the headline, leaving index 0
  # (the big caption) untouched so it keeps describing the on-camera star.
  defp insert_secondary(lines, nil), do: lines

  defp insert_secondary(lines, %{text: t} = line) do
    cond do
      Enum.any?(lines, &(&1.text == t)) -> lines
      lines == [] -> [line]
      true -> Enum.take([hd(lines), line | tl(lines)], @history)
    end
  end

  defp ensemble_line(snaps, star, frame) do
    case Enum.reject(snaps, &(&1.username == star)) do
      [] ->
        nil

      others ->
        a = Enum.at(others, rem(frame, length(others)))
        {beat, data} = beat_of(a)
        %{text: headline(a, frame), who: a.username, i18n: Narration.render(beat, data, frame: frame)}
    end
  end

  # Map a snapshot to a narrative BEAT (atom + data) for multilingual rendering — mirrors
  # the English `headline/2` cond so the translation tracks what's on screen.
  defp beat_of(%{username: u, senses: s} = a) do
    cond do
      truthy(s["hurt"]) -> {:under_attack, %{who: u}}
      num(s["health"], 20) < 6 -> {:gravely_wounded, %{who: u}}
      near?(s["hostile_dist"]) -> {:hostile_near, %{who: u}}
      num(s["health"], 20) < 11 -> {:wounded, %{who: u}}
      # WS1-A: interoceptive viability crisis (homeostat lineage only) ranks with survival drama.
      viab_crisis?(s) -> {:viability_crisis, viab_data(u, s)}
      (s["social"] || 0) == 2 -> {:meet_outsider, %{who: u}}
      (s["social"] || 0) == 1 -> {:reunite_kin, %{who: u}}
      num(s["food"], 20) < 8 -> {:hunger, %{who: u}}
      a.action == "mine" -> {:mining, %{who: u}}
      a.action == "eat" -> {:eating, %{who: u}}
      # a low (but not critical) reserve/fatigue is an ambient viability note, above the calm beat.
      viab_low?(s) -> {:viability_low, viab_data(u, s)}
      true -> strategy_beat(a, u)
    end
  end

  # WS1-A viability predicates + data (homeostat felt_* bins in senses; absent on default genome).
  # Bins: 0 critical .. 5 surplus. energy/gut/soma low = depleted; muscle_fatigue low = spent.
  defp viab_crisis?(s), do: s["energy_reserve"] == 0 or s["soma_integrity"] == 0

  defp viab_low?(s) do
    is_integer(s["energy_reserve"]) and
      (s["energy_reserve"] <= 1 or s["gut_satiety"] == 0 or
         (is_integer(s["muscle_fatigue"]) and s["muscle_fatigue"] <= 1))
  end

  defp viab_data(u, s) do
    {sys, bin} = worst_subsystem(s)
    %{who: u, sys: sys, tier: tier6(bin)}
  end

  defp worst_subsystem(s) do
    [
      {"energy reserve", s["energy_reserve"]},
      {"body integrity", s["soma_integrity"]},
      {"gut", s["gut_satiety"]},
      {"muscle-fatigue store", s["muscle_fatigue"]}
    ]
    |> Enum.filter(fn {_sys, b} -> is_integer(b) end)
    |> Enum.min_by(fn {_sys, b} -> b end, fn -> {"energy reserve", 3} end)
  end

  defp strategy_beat(a, u) do
    case Map.get(a, :context) do
      nil ->
        {:explore, %{who: u}}

      ctx ->
        {:strategy,
         %{
           who: u,
           context: ctx,
           intent_actions: Map.get(a, :intent, []),
           conf: round(Map.get(a, :confidence, 0.0) * 100)
         }}
    end
  end

  defp score(%{senses: s} = a, frame) do
    cond do
      truthy(s["hurt"]) -> 100
      num(s["health"], 20) < 6 -> 96
      near?(s["hostile_dist"]) -> 82
      num(s["health"], 20) < 11 -> 72
      (s["social"] || 0) == 2 -> 56
      (s["social"] || 0) == 1 -> 50
      num(s["food"], 20) < 8 -> 46
      a.action == "mine" -> 30
      true -> 8 + rem(frame + :erlang.phash2(a.username), 7)
    end
  end

  defp headline(%{username: u, senses: s} = a, frame) do
    # Vary line choice by agent too, so two agents narrated on the same beat
    # don't echo the same phrasing.
    pick = fn list -> Enum.at(list, rem(frame + :erlang.phash2(u), length(list))) end

    cond do
      truthy(s["hurt"]) ->
        pick.([
          "#{u} is under attack — fighting for its life!",
          "Something is hurting #{u}!",
          "#{u} reels under a brutal assault."
        ])

      num(s["health"], 20) < 6 ->
        pick.([
          "#{u} is on the brink, badly wounded.",
          "#{u} clings to life.",
          "One more hit could end #{u}."
        ])

      near?(s["hostile_dist"]) ->
        pick.(["A hostile mob closes in on #{u}.", "Danger stalks #{u}.", "#{u} is not alone in the dark."])

      num(s["health"], 20) < 11 ->
        pick.(["#{u} is wounded and wary.", "#{u} nurses its wounds.", "#{u} licks its wounds, watchful."])

      viab_crisis?(s) ->
        (fn ->
           {sys, bin} = worst_subsystem(s)
           "#{u}'s #{sys} reads #{tier6(bin)} — a survival test now."
         end).()

      (s["social"] || 0) == 2 ->
        pick.([
          "#{u} crosses paths with an outsider.",
          "A stranger drifts into #{u}'s view.",
          "#{u} eyes an outsider warily."
        ])

      (s["social"] || 0) == 1 ->
        pick.(["#{u} draws near its kin.", "#{u} senses family close by.", "#{u} and its kin move as one."])

      num(s["food"], 20) < 8 ->
        pick.([
          "#{u} is hungry, foraging the forest.",
          "#{u} hunts for something to eat.",
          "Hunger drives #{u} onward."
        ])

      a.action == "mine" ->
        pick.([
          "#{u} digs in, working the world.",
          "#{u} mines, building toward something.",
          "#{u} carves into the earth."
        ])

      a.action == "eat" ->
        pick.(["#{u} pauses to eat, restoring itself.", "#{u} takes a moment to feed."])

      true ->
        # the calm beat is the MIND beat: narrate the live hierarchy + wide reasoning —
        # the L2 strategic option, the multi-step plan, and how sure the agent is.
        mind_beat(a, frame)
    end
  end

  # A "mind beat": the strategic option (L2), the multi-step planned intent (deep EFE
  # lookahead), and metacognitive confidence — the reasoning the user couldn't see before.
  defp mind_beat(%{username: u} = a, frame) do
    pick = fn list -> Enum.at(list, rem(frame + :erlang.phash2(u), length(list))) end
    conf = round(Map.get(a, :confidence, 0.0) * 100)
    intent = a |> Map.get(:intent, []) |> intent_phrase()

    case Map.get(a, :context) do
      nil ->
        pick.([
          "#{u} ventures into the unknown, drawn by curiosity.",
          "#{u} explores, hungry to understand its world.",
          "#{u} wanders, reducing the unknown."
        ])

      ctx ->
        pick.([
          "#{u} settles on a strategy: #{context_word(ctx)}. Plan: #{intent}.",
          "#{u} thinks #{plan_len(a)} steps ahead — #{intent} — #{conf}% sure.",
          "#{u} is #{context_word(ctx)}, weighing its options (#{conf}% confident).",
          "#{u} commits to #{context_word(ctx)}; next it intends to #{intent}."
        ])
    end
  end

  defp plan_len(a), do: a |> Map.get(:intent, []) |> length() |> max(1)

  # Render a planned action-index/atom sequence into a short readable phrase.
  defp intent_phrase([]), do: "hold"

  defp intent_phrase(actions) do
    actions |> Enum.take(3) |> Enum.map(&act_word/1) |> Enum.join(" → ")
  end

  defp act_word(:forward), do: "step"
  defp act_word(:turn_left), do: "turn"
  defp act_word(:turn_right), do: "turn"
  defp act_word(:mine), do: "mine"
  defp act_word(:eat), do: "eat"
  defp act_word(:noop), do: "wait"
  defp act_word(other), do: to_string(other)

  defp context_word(:forage), do: "foraging"
  defp context_word(:build), do: "building"
  defp context_word(:flee), do: "fleeing danger"
  defp context_word(:socialize), do: "seeking others"
  defp context_word(:rest), do: "resting"
  defp context_word(other), do: to_string(other)

  defp card(%{username: u, kin: kin, mode: mode, senses: s, action: action} = snap) do
    %{
      username: u,
      kin: kin,
      mode: mode,
      health: round(num(s["health"], 20)),
      food: round(num(s["food"], 20)),
      threat: threat_label(s),
      social: social_label(s["social"] || 0),
      emotion: Map.get(snap, :emotion, :calm),
      action: action || "—",
      tension: tension(s),
      # gen-2 mind beat — the live hierarchy + wide reasoning, made visible on the card:
      # the L2 strategic option, the multi-step planned intent, metacognitive confidence,
      # and the hormonal stress the context implies.
      context: Map.get(snap, :context),
      intent: snap |> Map.get(:intent, []) |> intent_phrase(),
      confidence: round(Map.get(snap, :confidence, 0.0) * 100),
      stress: round(Map.get(snap, :stress, 0.0) * 100),
      # WS1-A: deeper "what the UNI really is", read-only from the row (no decision-path change):
      #   phase  — how far it has GROWN UP (curriculum 0 survive .. 4 shelter)
      #   focus  — which generative factor is in its spotlight right now
      #   body   — the rung-1 graded viability BODY (energy/gut/soma/fatigue as 0..5 tier words),
      #            present ONLY for a :homeostat lineage; nil on the default streamed colony.
      #            These are MODEL VARIABLES, never "felt" states (LAB_PROTOCOL claim fence).
      phase: Map.get(snap, :phase),
      focus: Map.get(snap, :focus),
      body: viability_of(s)
    }
  end

  # The graded viability body from the homeostat felt_* bins injected into senses
  # (homeostat.ex:106). Returns tier WORDS per subsystem, or nil when absent (default genome).
  # Never surfaced as "hunger"/"tiredness" — these are the model's viability variables.
  @tier6 {"critical", "depleted", "low", "nominal", "sated", "surplus"}
  defp viability_of(s) do
    e = s["energy_reserve"]

    if is_integer(e) do
      %{
        energy: tier6(e),
        gut: tier6(s["gut_satiety"]),
        soma: tier6(s["soma_integrity"]),
        fatigue: tier6(s["muscle_fatigue"]),
        # raw bins too, so the /stream card can draw graded meters
        bins: %{energy: e, gut: s["gut_satiety"], soma: s["soma_integrity"], fatigue: s["muscle_fatigue"]}
      }
    else
      nil
    end
  end

  defp tier6(b) when is_integer(b) and b >= 0 and b <= 5, do: elem(@tier6, b)
  defp tier6(_), do: "unknown"

  defp tension(s) do
    base = 100 - round(num(s["health"], 20) * 3) - round(num(s["food"], 20))
    bonus = if(truthy(s["hurt"]), do: 45, else: 0) + if near?(s["hostile_dist"]), do: 30, else: 0
    (base + bonus) |> max(0) |> min(100)
  end

  # --- camera (owns viewer/director.js as a Port) ----------------------------

  defp spawn_camera(opts) do
    # UNI_CAM=0 ⇒ headless (no stream camera): leave node nil so the guard below skips director.js (the heavy
    # prismarine-viewer/headless-gl). Default (unset) = ON, so the dev-box stream is byte-unchanged; with no
    # port, cam_write(nil, …) is a clean no-op (the nil clause) so nothing ever respawns.
    node = if System.get_env("UNI_CAM") == "0", do: nil, else: System.find_executable(opts[:node] || "node")
    script = Path.join(@repo_root, "viewer/director.js")

    if node && File.exists?(script) do
      Port.open({:spawn_executable, node}, [
        :binary,
        :exit_status,
        {:line, 4096},
        args: [script],
        env: [
          {~c"MC_HOST", to_charlist(opts[:mc_host] || System.get_env("MC_HOST") || "127.0.0.1")},
          {~c"MC_PORT", to_charlist(to_string(opts[:mc_port] || 25_565))},
          {~c"MC_VERSION", to_charlist(opts[:mc_version] || "1.16.5")},
          {~c"RCON_PASS", to_charlist(opts[:rcon_pass] || "sp")},
          # Port-owned camera: die on stdin EOF so a supervisor restart can never orphan a
          # second "Director" into a login kick-fight (reviewed change A4).
          {~c"EXIT_ON_STDIN_EOF", ~c"1"}
        ]
      ])
    end
  end

  defp cut_to(%{port: nil} = state, _star, _shot), do: state

  defp cut_to(%{port: port} = state, star, shot) do
    Port.command(port, "shot #{shot} #{star}\n")
    state
  end

  # Interim shot selection (rule-based; the Producer UNI replaces this in P4): tight on
  # action, wide for danger CONTEXT, an occasional overview for variety, orbit otherwise.
  defp shot_for(nil, _frame), do: "orbit"

  defp shot_for(%{senses: s} = a, frame) do
    cond do
      rem(frame, 23) == 0 -> "overview"
      truthy(s["hurt"]) or near?(s["hostile_dist"]) -> "establish"
      num(s["health"], 20) < 6 -> "closeup"
      a.action == "mine" -> "closeup"
      (s["social"] || 0) > 0 -> "beauty"
      true -> "orbit"
    end
  end

  # --- helpers ---------------------------------------------------------------

  # Rows through the reviewed transport seam (nil = today's local read, byte-identical —
  # the exception→[] fold lives inside RemoteRows.fetch/1).
  defp safe_snapshot(opts), do: RemoteRows.fetch(opts[:colony_node])

  defp num(v, _d) when is_number(v), do: v
  defp num(_v, d), do: d
  defp truthy(true), do: true
  defp truthy(_), do: false
  defp near?(v), do: is_number(v) and v < 10.0
end
