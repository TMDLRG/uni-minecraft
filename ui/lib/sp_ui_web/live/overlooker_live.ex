defmodule SpUiWeb.OverlookerLive do
  @moduledoc """
  The third-party "overlooker": an omniscient, real-time view of the WHOLE world
  every tick, alongside a Markov-blanket monitor that proves — per tick, with an
  independently re-derived verdict — that the agent receives only the opaque
  observation and lives entirely outside the world.

  Live mode steps the real `SP.Sim` one tick at a time (recording an observer
  frame each step); replay mode streams a recorded JSONL evidence log. The AGENT
  column is fed ONLY `afferent.observation` — never any world/body state.
  """
  use SpUiWeb, :live_view

  alias SP.Sim.Verifier
  alias SpUi.{RunLoader, Scene}

  @layers [
    {"nutrient (L0)", "nutrient", 120},
    {"temperature (L0)", "temperature", 30},
    {"solvent (L0)", "solvent", 200},
    {"toxin (L0)", "toxin", 0},
    {"cavity (L2)", "cavity", 280},
    {"strain (L2)", "strain", 320}
  ]

  @impl true
  def mount(_params, _session, socket) do
    socket =
      socket
      |> assign(
        mode: :live,
        view: :world,
        trail: [],
        seed: 314,
        agent_name: "morphology_seeking",
        max_ticks: 250,
        playing: false,
        interval: 350,
        finished: false,
        just_died: false,
        death_tick: nil,
        death_kind: nil,
        frame: nil,
        verdict: nil,
        logs: RunLoader.list_logs(),
        current_log: nil,
        agents: SP.Scenario.agents() |> Map.keys() |> Enum.sort(),
        sim: nil,
        frames: [],
        idx: 0,
        cm: nil,
        # cross-life evolution ((1+1)-ES): the longest-lived genome breeds the next life
        best_genome: nil,
        best_fit: -1,
        best_info: nil,
        evo_rng: nil,
        generation: 0,
        life: 0,
        peak_stage: 0,
        peak_organs: 0,
        # live multi-agent colony (spawned UNIs in Minecraft)
        colony: []
      )
      |> reset_evolution()
      |> start_live()

    if connected?(socket), do: Process.send_after(self(), :refresh_colony, 200)
    {:ok, socket}
  end

  # --- controls ----------------------------------------------------------------

  @impl true
  def handle_event("toggle_play", _params, socket) do
    playing = not socket.assigns.playing and not socket.assigns.finished
    if playing, do: send(self(), :tick)
    {:noreply, assign(socket, :playing, playing)}
  end

  def handle_event("step", _params, socket) do
    {:noreply, socket |> assign(:playing, false) |> advance()}
  end

  def handle_event("reset", _params, socket) do
    socket =
      case socket.assigns.mode do
        :live -> socket |> reset_evolution() |> start_live()
        :replay -> socket |> assign(idx: 0, finished: false) |> show_replay_frame(0)
      end

    {:noreply, assign(socket, :playing, false)}
  end

  def handle_event("set_speed", %{"ms" => ms}, socket) do
    {:noreply, assign(socket, :interval, String.to_integer(ms))}
  end

  def handle_event("set_view", %{"view" => v}, socket) do
    socket = assign(socket, :view, String.to_existing_atom(v))
    {:noreply, maybe_push_scene(socket)}
  end

  # The 3D canvas hook announces it is ready; reply with the current scene so the
  # first frame is never lost to a mount/push race.
  def handle_event("world_ready", _params, socket) do
    {:noreply, maybe_push_scene(socket)}
  end

  def handle_event("configure", %{"seed" => seed, "agent" => agent, "max_ticks" => mt}, socket) do
    socket =
      socket
      |> assign(
        mode: :live,
        seed: to_int(seed, 314),
        agent_name: agent,
        max_ticks: to_int(mt, 250),
        current_log: nil
      )
      |> reset_evolution()
      |> start_live()

    {:noreply, assign(socket, :playing, false)}
  end

  def handle_event("load_replay", %{"log" => ""}, socket), do: {:noreply, socket}

  def handle_event("load_replay", %{"log" => file}, socket) do
    {frames, cm} = RunLoader.load(file)

    socket =
      socket
      |> assign(
        mode: :replay,
        frames: frames,
        cm: cm,
        idx: 0,
        trail: [],
        current_log: file,
        playing: false,
        finished: length(frames) <= 1
      )
      |> show_replay_frame(0)

    {:noreply, socket}
  end

  def handle_event("spawn_uni", %{"kin" => kin, "mode" => mode}, socket) do
    SP.Brain.Colony.spawn_agent(String.to_integer(kin), mode)
    {:noreply, assign(socket, :colony, SP.Brain.Colony.list_agents())}
  end

  def handle_event("stop_uni", %{"id" => id}, socket) do
    SP.Brain.Colony.stop_agent(id)
    {:noreply, assign(socket, :colony, SP.Brain.Colony.list_agents())}
  end

  @impl true
  def handle_info(:tick, socket) do
    cond do
      # The agent just perished (live mode): freeze on the death frame, show a
      # clear banner, and schedule a rebirth — so death is unmistakable, not a
      # silent freeze.
      socket.assigns.playing and socket.assigns.finished and socket.assigns.mode == :live and
          not socket.assigns.just_died ->
        Process.send_after(self(), :respawn, 1400)
        # Distinguish a true death (energy/integrity gone) from merely reaching
        # the configured run horizon — otherwise we'd cry "perished" over a
        # perfectly alive agent whose experiment just ended.
        kind = if SP.Body.alive?(socket.assigns.sim.body), do: :horizon, else: :perished

        {:noreply,
         assign(socket, just_died: true, death_tick: socket.assigns.sim.tick, death_kind: kind)}

      socket.assigns.playing and not socket.assigns.finished ->
        socket = advance(socket)
        # Always reschedule while playing: if this step caused death, the next
        # :tick lands in the death branch above; otherwise it advances.
        Process.send_after(self(), :tick, socket.assigns.interval)
        {:noreply, socket}

      true ->
        {:noreply, socket}
    end
  end

  @impl true
  def handle_info(:respawn, socket) do
    socket =
      socket
      |> assign(just_died: false, death_tick: nil, death_kind: nil)
      |> breed_next_life()

    if socket.assigns.playing, do: Process.send_after(self(), :tick, socket.assigns.interval)
    {:noreply, socket}
  end

  @impl true
  def handle_info(:refresh_colony, socket) do
    if connected?(socket), do: Process.send_after(self(), :refresh_colony, 3000)
    {:noreply, assign(socket, :colony, SP.Brain.Colony.list_agents())}
  end

  # --- advancement -------------------------------------------------------------

  defp advance(%{assigns: %{mode: :live}} = socket), do: advance_live(socket)
  defp advance(%{assigns: %{mode: :replay}} = socket), do: advance_replay(socket)

  # Reset the whole evolutionary lineage — a brand-new experiment (used by
  # mount/reset/configure, NOT by respawn, which evolves the lineage instead).
  defp reset_evolution(socket) do
    assign(socket,
      best_genome: nil,
      best_fit: -1,
      best_info: nil,
      evo_rng: SP.Determinism.new(socket.assigns.seed + 7),
      generation: 0,
      life: 0
    )
  end

  # Selection + reproduction across lives ((1+1)-ES): score the life that just
  # ended by how long it survived, keep the fitter of it vs. the incumbent
  # champion, then begin the next life from a mutated copy of that champion — so
  # the morphology visibly evolves generation over generation.
  defp breed_next_life(socket) do
    dead = socket.assigns.sim
    fit = dead.tick

    {best, best_fit, best_info} =
      if is_nil(socket.assigns.best_genome) or fit > socket.assigns.best_fit do
        info = %{
          gen: dead.genome.generation,
          ticks: fit,
          organs: length(SP.Body.organs(dead.body)),
          stage: dead.body.stage,
          lineage: dead.genome.lineage
        }

        {dead.genome, fit, info}
      else
        {socket.assigns.best_genome, socket.assigns.best_fit, socket.assigns.best_info}
      end

    {child, evo_rng} = SP.Genome.mutate(best, socket.assigns.evo_rng)

    socket
    |> assign(best_genome: best, best_fit: best_fit, best_info: best_info, evo_rng: evo_rng)
    |> start_live(child)
  end

  # Begin one life. `genome` is the body's hereditary substrate: nil for the first
  # life of an experiment (Sim.new derives a random genome from the seed); a bred
  # child genome for every life after a death, so the morphology evolves.
  defp start_live(socket, genome \\ nil) do
    agent = Map.fetch!(SP.Scenario.agents(), socket.assigns.agent_name)

    base = [
      seed: socket.assigns.seed,
      agent: agent,
      max_ticks: socket.assigns.max_ticks,
      record_blanket?: true
    ]

    # Sim.new defaults the genome via Keyword.get_lazy (which fires only when the
    # key is ABSENT), so omit it entirely on the first life rather than passing nil.
    opts = if genome, do: Keyword.put(base, :genome, genome), else: base
    sim = SP.Sim.new(opts)

    socket
    |> assign(
      sim: sim,
      finished: false,
      frame: nil,
      verdict: nil,
      trail: [],
      generation: sim.genome.generation,
      life: socket.assigns.life + 1,
      peak_stage: 0,
      peak_organs: 0
    )
    |> advance_live()
  end

  defp advance_live(socket) do
    sim = socket.assigns.sim

    if SP.Body.alive?(sim.body) and sim.tick < sim.max_ticks do
      sim2 = SP.Sim.step(sim)
      [atom_frame | _] = sim2.trace.frames
      # Drop the retained frame to bound memory — the UI keeps only the latest.
      sim2 = put_in(sim2.trace.frames, [])

      put_frame(socket, atom_frame, sim2.channel_map)
      |> assign(
        sim: sim2,
        peak_stage: max(socket.assigns.peak_stage, sim2.body.stage),
        peak_organs: max(socket.assigns.peak_organs, length(SP.Body.organs(sim2.body)))
      )
    else
      assign(socket, :finished, true)
    end
  end

  defp advance_replay(socket) do
    next = socket.assigns.idx + 1

    if next < length(socket.assigns.frames) do
      socket |> assign(idx: next) |> show_replay_frame(next)
    else
      assign(socket, :finished, true)
    end
  end

  defp show_replay_frame(socket, idx) do
    frame = Enum.at(socket.assigns.frames, idx)
    if frame, do: put_frame(socket, frame, socket.assigns.cm), else: socket
  end

  # Normalise any frame (atom-keyed live or string-keyed replay) to the JSON
  # string-keyed shape used by the templates, and compute the verdict.
  defp put_frame(socket, frame, cm) do
    string_frame = frame |> SP.Observability.json() |> Jason.decode!()
    verdict = verdict_of(frame, cm)
    # Track the agent's position history so the map can draw its path.
    trail = [string_frame["body"]["location"] | socket.assigns.trail] |> Enum.take(16)

    socket
    |> assign(frame: string_frame, verdict: verdict, trail: trail)
    |> maybe_push_scene()
  end

  # Push the compact scene to the 3D world hook when that view is active.
  defp maybe_push_scene(socket) do
    if (socket.assigns.view == :world and socket.assigns.frame) && connected?(socket) do
      scene = socket.assigns.frame |> Scene.build() |> Map.put("verdict_ok", socket.assigns.verdict.ok)
      push_event(socket, "scene", scene)
    else
      socket
    end
  end

  defp mode_label("see_all"), do: "See All"
  defp mode_label("blind"), do: "Blind to Others"
  defp mode_label("see_kin"), do: "See Kin"
  defp mode_label(other), do: to_string(other)

  defp verdict_of(frame, cm) do
    case Verifier.check_frame(frame, cm) do
      :ok -> %{ok: true, reasons: []}
      {:violation, reasons} -> %{ok: false, reasons: reasons}
    end
  end

  # --- render ------------------------------------------------------------------

  @impl true
  def render(assigns) do
    ~H"""
    <header>
      <h1>STRATIFIED PALIMPSEST · OVERLOOKER</h1>
      <span class="muted">3rd-party omniscient view — the agent is outside this boundary</span>
      <div class="controls">
        <button phx-click="toggle_play">{if @playing, do: "⏸ pause", else: "▶ play"}</button>
        <button phx-click="step">⏭ step</button>
        <button phx-click="reset">⟲ reset</button>
        <form phx-change="set_speed">
          <select name="ms">
            <option value="700" selected={@interval == 700}>slow</option>
            <option value="350" selected={@interval == 350}>normal</option>
            <option value="120" selected={@interval == 120}>fast</option>
          </select>
        </form>
        <span class="controls vtoggle">
          <span class="muted">view</span>
          <button phx-click="set_view" phx-value-view="world" class={if @view == :world, do: "active", else: ""}>world (3D)</button>
          <button phx-click="set_view" phx-value-view="layers" class={if @view == :layers, do: "active", else: ""}>layers</button>
          <button phx-click="set_view" phx-value-view="map" class={if @view == :map, do: "active", else: ""}>map</button>
        </span>
        <span class="tick">tick {tick_of(@frame)} · {@mode}{if @finished, do: " · finished", else: ""}</span>
      </div>
      <form phx-submit="configure" class="controls">
        <label class="muted">seed</label>
        <input type="number" name="seed" value={@seed} style="width:78px" />
        <select name="agent">
          <option :for={a <- @agents} value={a} selected={a == @agent_name}>{a}</option>
        </select>
        <label class="muted">ticks</label>
        <input type="number" name="max_ticks" value={@max_ticks} style="width:70px" />
        <button type="submit">apply (live)</button>
      </form>
      <form phx-change="load_replay" class="controls">
        <select name="log">
          <option value="">— replay recorded run —</option>
          <option :for={f <- @logs} value={f} selected={f == @current_log}>{f}</option>
        </select>
      </form>
      <form phx-submit="spawn_uni" class="controls">
        <span class="muted">UNI colony →</span>
        <label class="muted">kin</label>
        <select name="kin">
          <option :for={k <- 0..9} value={k}>{k}</option>
        </select>
        <select name="mode">
          <option value="see_all">See All</option>
          <option value="blind">Blind to Others</option>
          <option value="see_kin">See Kin</option>
        </select>
        <button type="submit">+ spawn UNI</button>
        <span class="muted">live: {length(@colony)}</span>
      </form>
      <div :if={@colony != []} class="controls" style="flex-wrap: wrap">
        <span :for={a <- @colony} class="chip">
          {a.username} · {mode_label(a.mode)}
          <button type="button" phx-click="stop_uni" phx-value-id={a.id} style="margin-left:4px; padding:0 5px">✕</button>
        </span>
      </div>
    </header>

    <div :if={@just_died and @death_kind == :perished} class="deathbar">
      ☠ THE AGENT PERISHED at tick {@death_tick} — regenerating a new life…
    </div>
    <div :if={@just_died and @death_kind != :perished} class="horizonbar">
      ◷ HORIZON REACHED at tick {@death_tick} (agent still alive) — starting a fresh run…
    </div>

    <main :if={@frame}>
      <div class="dash">
        <section class="panel evidence-col">
          <.evolution_box
            life={@life}
            generation={@generation}
            peak_stage={@peak_stage}
            peak_organs={@peak_organs}
            best_info={@best_info}
          />
          <h2>Is the agent sealed off from the world?</h2>
          <.verdict_badge verdict={@verdict} />
          <p class="kid">
            The agent's "mind" lives <b>outside</b> the world. The only thing that ever reaches it is a list
            of plain <b>numbers</b> — never the real world. Read the three boxes below, top to bottom:
            nothing secret can sneak across the gap.
          </p>
          <div class="blanket">
            <div class="col world-col">
              <h3>1 · The real world</h3>
              <p class="kid">Everything that's actually out there. The agent can't see <b>any</b> of this.</p>
              <div class="kv">
                <b>regions</b><span>{length(@frame["world"]["regions"])}</span>
                <b>world tick</b><span>{@frame["world"]["tick"]}</span>
                <b>body region/cell</b><span>{inspect(@frame["body"]["location"])}</span>
                <b>stage</b><span>{@frame["body"]["stage"]}</span>
                <b>energy</b><span>{@frame["body"]["energy"]}</span>
                <b>integrity</b><span>{@frame["body"]["integrity"]}</span>
                <b>alive</b><span>{@frame["body"]["alive"]}</span>
              </div>
            </div>
            <div class="col body-col">
              <h3>2 · The only doorway — its senses</h3>
              <p class="kid">The single bridge between world and mind. Only plain numbers cross, and only from sense-organs the agent actually grew.</p>
              <div><b class="muted">sense-organs:</b> {Enum.join(@frame["afferent"]["decision_organs"], ", ")}</div>
              <div style="margin-top:6px"><b class="muted">senses → agent:</b></div>
              <div class="obs">
                <span :for={s <- @frame["afferent"]["signals"]} class="chip">{short_source(s["source"])}</span>
              </div>
              <div style="margin-top:6px"><b class="muted">actions ← agent:</b></div>
              <div class="obs">
                <span :for={d <- @frame["efferent"]["decoded"]} class="chip">{action_label(d)}</span>
                <span :if={@frame["efferent"]["decoded"] == []} class="muted">— none —</span>
              </div>
            </div>
            <div class="col agent-col">
              <h3>3 · The agent's mind (outside)</h3>
              <p class="kid">All it ever gets is these numbers — <b>no names, places, or things</b>. It has to figure the world out from these alone.</p>
              <div class="obs">
                <span :for={{ch, v} <- sorted_obs(@frame["afferent"]["observation"])} class="chip">{ch}={fmt(v)}</span>
              </div>
              <p class="muted" style="margin-top:6px">context_redacted (faithful): {@frame["blanket"]["context_redacted"]}</p>
            </div>
          </div>
        </section>

      <section :if={@view == :world} class="panel stage-col">
        <h2>World — the whole world as one 3D map (drag to orbit · wheel to zoom · the agent is tracked)</h2>
        <div class="world-wrap">
          <canvas id="world-canvas" phx-hook="World" phx-update="ignore"></canvas>
          <div class="world-controls">
            <button type="button" data-cam="fit">fit all</button>
            <button type="button" data-cam="follow">follow agent</button>
            <button type="button" data-cam="orbit">free orbit</button>
            <button type="button" data-cam="stack">stack layers (L0–L4)</button>
          </div>
        </div>
        <div class="mlegend">
          <b>terrain</b>:
          <span class="sw" style="background:rgb(55,150,70)"></span>lush (food)
          <span class="sw" style="background:rgb(40,110,185)"></span>wet
          <span class="sw" style="background:rgb(185,50,50)"></span>toxic
          <span class="sw" style="background:rgb(95,80,55)"></span>barren
          <span class="sw" style="background:rgb(22,18,28)"></span>void ·
          <b>glowing orb</b> = the agent (tracked) · <b>trail</b> = its path · teal blocks = infrastructure · dots = ecology · pillars = seam portals
        </div>
      </section>

      <section :if={@view == :map} class="panel stage-col">
        <h2>World map — the whole world as one map (the ◉ tracks the agent; faint dots trace its path)</h2>
        <div class="wmap">
          <div :for={region <- @frame["world"]["regions"]} class="mregion">
            <div class="rh">
              region {region["id"]} · seam_readiness {region["seam_readiness"]}{if region["seam_ready"], do: " · SEAM READY", else: ""}{if hd(@frame["body"]["location"]) == region["id"], do: " · ◉ agent is here", else: ""}
            </div>
            <div class="mgrid" style={"grid-template-columns: repeat(#{region["w"]}, 30px)"}>
              <div
                :for={c <- map_cells(region, body_cell(@frame, region["id"]), @trail)}
                class="mcell"
                style={"background:#{c.bg}"}
                title={c.title}
              >
                <div :if={c.kind == :agent} class="agent"></div>
                <div :if={c.kind == :struct} class="struct">{c.glyph}</div>
                <div :if={c.kind == :eco} class="eco" style={"background:#{c.color}"}></div>
                <div :if={c.kind == :trail} class="trail" style={"opacity:#{c.opacity}"}></div>
              </div>
            </div>
            <div class="muted" style="margin-top:6px">
              infrastructure: {infra_count(region)} · ecology: {length(region["ecology"])}{ecology_summary(region)}
            </div>
          </div>
        </div>
        <div class="mlegend">
          <b>terrain</b>:
          <span class="sw" style="background:rgb(55,150,70)"></span>lush (nutrient/food)
          <span class="sw" style="background:rgb(40,110,185)"></span>wet (solvent)
          <span class="sw" style="background:rgb(185,50,50)"></span>toxic (hazard)
          <span class="sw" style="background:rgb(95,80,55)"></span>barren
          <span class="sw" style="background:rgb(22,18,28)"></span>void (hidden cavity)<br />
          <b>markers</b>: ◉ glowing = the agent (tracked live) · faint yellow dots = its recent path ·
          teal squares = built infrastructure (R/S/B/C/M) ·
          coloured dots = ecology (<span style="color:#a6e3a1">grazer</span> / <span style="color:#f38ba8">mimic</span> / <span style="color:#89b4fa">decomposer</span>)<br />
          seams (unlocked adjacencies): {inspect(@frame["world"]["seams"])} · ordinary adjacency: {inspect(@frame["world"]["adjacency"])}
        </div>
      </section>

      <section :if={@view == :layers} class="panel stage-col">
        <h2>Overlooker — the whole world, all layers, every tick</h2>
        <div class="regions">
          <div :for={region <- @frame["world"]["regions"]} class="region">
            <div class="rh">
              region {region["id"]} · seam_readiness {region["seam_readiness"]}{if region["seam_ready"], do: " · SEAM READY", else: ""}
            </div>
            <div class="layers">
              <.layer_grid
                :for={{label, key, hue} <- layers()}
                label={label}
                hue={hue}
                layer={region["layers"][key]}
                body_cell={body_cell(@frame, region["id"])}
              />
              <.layer_grid
                :for={{band, i} <- Enum.with_index(region["layers"]["bands"])}
                label={"band #{i} (L3)"}
                hue={170}
                layer={band}
                body_cell={body_cell(@frame, region["id"])}
              />
            </div>
            <div class="muted" style="margin-top:6px">
              materials: {map_size(region["materials"])} cells ·
              infrastructure: {infra_count(region)} ·
              ecology: {length(region["ecology"])} actors
              {ecology_summary(region)}
            </div>
          </div>
        </div>
        <p class="muted">
          seams (unlocked adjacencies): {inspect(@frame["world"]["seams"])} ·
          ordinary adjacency: {inspect(@frame["world"]["adjacency"])}
        </p>
      </section>
      </div>

      <section class="panel">
        <h2>Signal &amp; action audit (this tick)</h2>
        <table class="timeline">
          <thead>
            <tr><th>dir</th><th>source / action</th><th>detail</th><th>status</th></tr>
          </thead>
          <tbody>
            <tr :for={s <- @frame["afferent"]["signals"]}>
              <td><span class="tag aff">afferent</span></td>
              <td>{s["source"]}</td>
              <td class="muted">{inspect(s["data"]) |> truncate(80)}</td>
              <td class="muted">→ opaque channels</td>
            </tr>
            <tr :for={d <- @frame["efferent"]["decoded"]}>
              <td><span class="tag eff">efferent</span></td>
              <td>{action_label(d)}</td>
              <td class="muted">channel {d["channel"]} {inspect(d["params"])}</td>
              <td class={gated_class(d)}>{gated_label(d)}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>

    <main :if={is_nil(@frame)}>
      <section class="panel"><p class="muted">No frame yet — press ▶ play.</p></section>
    </main>
    """
  end

  # --- function components -----------------------------------------------------

  attr :life, :integer, required: true
  attr :generation, :integer, required: true
  attr :peak_stage, :integer, required: true
  attr :peak_organs, :integer, required: true
  attr :best_info, :map, default: nil

  # A compact, kid-friendly readout of the live evolution: which life/generation
  # we're watching, how far this body developed, and the best life seen so far.
  defp evolution_box(assigns) do
    ~H"""
    <div class="evo">
      <h3>Watch it evolve</h3>
      <p class="kid">
        Whenever the creature dies, the body that lived <b>longest so far</b> has a baby with one
        small random change. Bodies that survive longer get to be parents — so the family slowly
        gets better, all on its own. No one designs it.
      </p>
      <div class="kv">
        <b>life #</b><span>{@life}</span>
        <b>generation</b><span>{@generation}</span>
        <b>organs grown</b><span>{@peak_organs}</span>
        <b>stage reached</b><span>{@peak_stage}</span>
        <b>best life yet</b>
        <span :if={@best_info}>
          {@best_info.ticks} ticks · gen {@best_info.gen} · {@best_info.organs} organs · stage {@best_info.stage}
        </span>
        <span :if={is_nil(@best_info)} class="muted">— this is the first life —</span>
      </div>
    </div>
    """
  end

  attr :verdict, :map, required: true

  defp verdict_badge(assigns) do
    ~H"""
    <div :if={@verdict} class={"verdict " <> if(@verdict.ok, do: "ok", else: "leak")}>
      {if @verdict.ok, do: "✓ YES — sealed off. No piece of the real world reached the agent this tick.", else: "✗ NO — a leak was detected this tick!"}
      <ul class="checks">
        <li :for={{label, key} <- checks()} class={if(failed?(@verdict.reasons, key), do: "fail", else: "pass")}>
          {label}
        </li>
      </ul>
    </div>
    """
  end

  attr :label, :string, required: true
  attr :hue, :integer, required: true
  attr :layer, :map, required: true
  attr :body_cell, :integer, default: -1

  defp layer_grid(assigns) do
    cells = assigns.layer["cells"] || []
    maxv = ([0.001 | cells] |> Enum.max()) * 1.0
    assigns = assign(assigns, cells: cells, maxv: maxv)

    ~H"""
    <div class="layer">
      <div class="lab">{@label}</div>
      <div class="grid" style={"grid-template-columns: repeat(#{@layer["w"]}, 14px)"}>
        <div
          :for={{v, i} <- Enum.with_index(@cells)}
          class={"cell" <> if(i == @body_cell, do: " body", else: "")}
          style={"background: #{heat(v, @maxv, @hue)}"}
          title={"##{i}: #{fmt(v)}"}
        >
        </div>
      </div>
    </div>
    """
  end

  # --- world map (human-legible top-down terrain map) -------------------------

  # Render one region as terrain tiles with biome colours, the agent marker, its
  # recent path, infrastructure and ecology. Cell helpers live in `SpUi.Scene`
  # (shared with the 3D world scene builder).
  defp map_cells(region, body_cell, trail) do
    l = region["layers"]
    nut = l["nutrient"]["cells"]
    tox = l["toxin"]["cells"]
    sol = l["solvent"]["cells"]
    cav = l["cavity"]["cells"]
    {mn, ms, mc} = {Scene.lmax(nut), Scene.lmax(sol), Scene.lmax(cav)}
    infra = region["infrastructure"] || %{}
    eco = (region["ecology"] || []) |> Map.new(fn a -> {a["cell"], a["kind"]} end)

    # cell index -> recency rank (1 = most recent previous position) within this region
    trail_ranks =
      trail
      |> Enum.with_index()
      |> Enum.filter(fn {[rid, _c], idx} -> rid == region["id"] and idx > 0 end)
      |> Enum.reduce(%{}, fn {[_rid, c], idx}, acc -> Map.put_new(acc, c, idx) end)

    for i <- 0..(region["w"] * region["h"] - 1) do
      nf = min(1.0, Scene.nz(Scene.at(nut, i)) / mn)
      tf = min(1.0, Scene.nz(Scene.at(tox, i)) / 0.6)
      sf = min(1.0, Scene.nz(Scene.at(sol, i)) / ms)
      cavf = min(1.0, Scene.nz(Scene.at(cav, i)) / mc)
      {kind, glyph, color, opacity} = Scene.marker(i, body_cell, infra, eco, trail_ranks)

      %{
        bg: Scene.biome(nf, tf, sf, cavf),
        kind: kind,
        glyph: glyph,
        color: color,
        opacity: opacity,
        title:
          "##{i} nutrient=#{Scene.rnd(Scene.at(nut, i))} toxin=#{Scene.rnd(Scene.at(tox, i))} solvent=#{Scene.rnd(Scene.at(sol, i))} cavity=#{Scene.rnd(Scene.at(cav, i))}"
      }
    end
  end

  # --- helpers -----------------------------------------------------------------

  defp layers, do: @layers

  defp checks do
    [
      {"only numbers crossed — no words, names, or objects (structural)", :structural},
      {"no secret labels snuck in (token scan)", :token_scan},
      {"every number came from a real sense-organ (provenance)", :morphology_provenance},
      {"the numbers exactly match what the senses measured (encode-equiv)", :encode_equivalence}
    ]
  end

  defp failed?(reasons, :structural), do: Enum.any?(reasons, &match?({:structural, _}, &1))
  defp failed?(reasons, :token_scan), do: Enum.any?(reasons, &match?({:token_scan, _}, &1))
  defp failed?(reasons, atom), do: atom in reasons

  defp heat(v, maxv, hue) do
    l = (v / maxv) |> max(0.0) |> min(1.0)
    "hsl(#{hue}, 70%, #{round(8 + l * 47)}%)"
  end

  defp body_cell(frame, region_id) do
    case frame["body"]["location"] do
      [^region_id, cell] -> cell
      _ -> -1
    end
  end

  defp sorted_obs(obs) when is_map(obs) do
    obs |> Enum.sort_by(fn {k, _} -> to_int(k, 0) end)
  end

  defp sorted_obs(_), do: []

  defp short_source("sensor:" <> s), do: s
  defp short_source(s), do: s

  defp action_label(%{"action" => a}), do: to_string(a)
  defp action_label(%{"error" => _}), do: "(rejected)"
  defp action_label(_), do: "?"

  defp gated_label(%{"decoded" => false}), do: "decode error"
  defp gated_label(%{"gated" => true}), do: "applied"
  defp gated_label(%{"gated" => false}), do: "ungated (no organ)"
  defp gated_label(_), do: "?"

  defp gated_class(%{"gated" => true}), do: "gated-true"
  defp gated_class(_), do: "gated-false"

  defp infra_count(region) do
    region["infrastructure"] |> Map.values() |> Enum.map(&length/1) |> Enum.sum()
  end

  defp ecology_summary(region) do
    region["ecology"]
    |> Enum.frequencies_by(& &1["kind"])
    |> case do
      m when map_size(m) == 0 -> ""
      m -> " (" <> (m |> Enum.map(fn {k, n} -> "#{k}:#{n}" end) |> Enum.join(", ")) <> ")"
    end
  end

  defp tick_of(nil), do: "—"
  defp tick_of(frame), do: frame["tick"]

  defp fmt(v) when is_float(v), do: Float.round(v, 3)
  defp fmt(v), do: v

  defp truncate(s, n) when byte_size(s) > n, do: binary_part(s, 0, n) <> "…"
  defp truncate(s, _), do: s

  defp to_int(v, _default) when is_integer(v), do: v

  defp to_int(v, default) when is_binary(v) do
    case Integer.parse(v) do
      {n, _} -> n
      _ -> default
    end
  end

  defp to_int(_, default), do: default
end
