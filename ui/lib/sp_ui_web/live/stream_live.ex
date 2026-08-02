defmodule SpUiWeb.StreamLive do
  @moduledoc """
  The live-stream broadcast page: the Director camera (a following 3rd-person view
  of the current "star" agent) composited with reality-show overlays — a scene
  banner, a lower-third narration caption + ticker, and per-agent status cards with
  health / food / tension meters. Point OBS's browser source at `/stream`.
  """
  use SpUiWeb, :live_view

  @empty %{star: nil, lines: [], cards: [], day: 1}

  @impl true
  def mount(_params, _session, socket) do
    bc =
      if connected?(socket) do
        # The Producer UNI runs the show — it starts + drives the Director (camera/cards/
        # broadcast plumbing) in :producer mode. /stream still reads the Director's broadcast.
        # SP.Show.ensure_started brings up the SUPERVISED show (Colony + Director + Producer),
        # so a Producer/Director crash self-heals instead of ending the show.
        SP.Show.ensure_started()
        Process.send_after(self(), :refresh, 1000)
        # SHARED Q&A: every /stream viewer (incl. the OBS browser source → YouTube) subscribes to
        # the producer's answer feed, so a question asked from ANY tab/phone shows on the broadcast.
        Phoenix.PubSub.subscribe(SpUi.PubSub, "producer:qa")
        SP.Brain.Director.broadcast()
      else
        @empty
      end

    {:ok, assign(socket, broadcast: bc, lang: :en, cycle: false, tick: 0, qa: [])}
  end

  # Broadcast language set — only languages with a Piper voice + i18n catalog + a grid slot (zh/ar have none).
  @langs [:en, :es, :fr, :it, :pt, :hi]

  @impl true
  def handle_info(:refresh, socket) do
    if connected?(socket), do: Process.send_after(self(), :refresh, 1000)
    tick = socket.assigns.tick + 1
    # "world tour": when cycling, rotate the overlay language every ~4s on the same poll.
    lang = if socket.assigns.cycle and rem(tick, 4) == 0, do: next_lang(socket.assigns.lang), else: socket.assigns.lang
    {:noreply, assign(socket, broadcast: SP.Brain.Director.broadcast(), tick: tick, lang: lang)}
  end

  # a producer answer broadcast from ANY viewer's question — render it on this broadcast too.
  def handle_info({:qa, item}, socket) do
    {:noreply, assign(socket, qa: Enum.take([item | socket.assigns.qa], 6))}
  end

  @impl true
  def handle_event("set_lang", %{"lang" => l}, socket) do
    {:noreply, assign(socket, lang: String.to_existing_atom(l), cycle: false)}
  end

  def handle_event("toggle_cycle", _params, socket) do
    {:noreply, assign(socket, cycle: not socket.assigns.cycle)}
  end

  def handle_event("ask", %{"q" => q}, socket) when is_binary(q) and q != "" do
    ans = SP.Brain.Anchor.ask(q)
    # WS3-A: the Q&A answer is an ON-AIR path too — fence it (behaviour/viability only). If a
    # learned/edge answer trips the claim fence, deflect honestly rather than air the over-claim.
    a =
      if SP.Brain.Fence.clean?(ans.text),
        do: ans.text,
        else: "I keep to behaviour language — ask me what a UNI is doing, how its viability reads, or why I made my last cut."

    # the camera RESPONDS to the audience: cut a close-up to a referenced agent.
    if r = List.first(ans.refs), do: SP.Brain.Director.shot(:closeup, r)
    # BROADCAST to every /stream viewer (incl. OBS → YouTube) rather than only this socket, so the
    # exchange appears on the live show. The asker updates via the same round-trip (handle_info).
    Phoenix.PubSub.broadcast(SpUi.PubSub, "producer:qa", {:qa, %{q: q, a: a}})
    {:noreply, socket}
  end

  def handle_event("ask", _params, socket), do: {:noreply, socket}

  @impl true
  def render(assigns) do
    ~H"""
    <style>
      .bcast { position: fixed; inset: 0; background: #05070b; overflow: hidden; }
      .bcast .cam-wrap, .bcast .cam { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
      .bcast .onair { position: absolute; top: 14px; right: 16px; background: #c0392b; color: #fff; font-weight: bold;
        padding: 4px 10px; border-radius: 4px; letter-spacing: 1px; box-shadow: 0 2px 8px rgba(0,0,0,.5); animation: pulse 1.2s infinite alternate; }
      @keyframes pulse { from { opacity: .65 } to { opacity: 1 } }
      .bcast .cam-reload { position: absolute; top: 14px; right: 332px; z-index: 5; background: rgba(11,14,20,.7); color: #cdd6f4;
        border: 1px solid #1f2430; border-radius: 4px; padding: 4px 9px; cursor: pointer; font: inherit; font-size: 12px; }
      .bcast .cam-reload:hover { background: rgba(30,36,51,.95); }
      .bcast .scene { position: absolute; top: 14px; left: 16px; background: rgba(11,14,20,.78); color: #89b4fa;
        padding: 6px 12px; border-radius: 6px; font-weight: bold; letter-spacing: 1px; }
      .bcast .langs { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; z-index: 6; }
      .bcast .lang { background: rgba(11,14,20,.7); color: #cdd6f4; border: 1px solid #1f2430; border-radius: 4px;
        padding: 3px 9px; cursor: pointer; font: inherit; font-size: 12px; }
      .bcast .lang.on { border-color: #f9e2af; color: #f9e2af; }
      .bcast .star-name { position: absolute; top: 56px; left: 16px; background: rgba(11,14,20,.7); color: #f9e2af;
        padding: 4px 10px; border-radius: 6px; }
      .bcast .lower3 { position: absolute; left: 0; right: 320px; bottom: 0; padding: 14px 22px 18px;
        background: linear-gradient(transparent, rgba(5,7,11,.92) 55%); }
      .bcast .caption { color: #fff; font-size: 26px; font-weight: 700; text-shadow: 0 2px 6px #000; line-height: 1.25; }
      .bcast .ticker { margin-top: 8px; color: #b8c0e0; font-size: 13px; display: flex; gap: 18px; flex-wrap: wrap; opacity: .85; }
      .bcast .cards { position: absolute; top: 0; right: 0; width: 320px; height: 100%; padding: 12px 12px 12px;
        background: rgba(11,14,20,.55); overflow: auto; display: flex; flex-direction: column; gap: 8px; }
      .bcast .card { background: #11151f; border: 1px solid #1f2430; border-radius: 8px; padding: 8px 10px; }
      .bcast .card.star { border-color: #f9e2af; box-shadow: 0 0 0 1px #f9e2af55; }
      .bcast .ch { color: #cdd6f4; font-weight: bold; display: flex; justify-content: space-between; }
      .bcast .kin { color: #6c7393; font-weight: normal; }
      .bcast .bar { height: 7px; background: #1e2433; border-radius: 4px; margin-top: 5px; overflow: hidden; }
      .bcast .bar > span { display: block; height: 100%; }
      .bcast .cmeta { color: #94a3c4; font-size: 11px; margin-top: 6px; }
      .bcast .mind { color: #b4befe; font-size: 11px; margin-top: 5px; padding-top: 5px; border-top: 1px solid #1f2430; }
      .bcast .mind .opt { font-weight: bold; }
      .bcast .mind .intent { color: #89dceb; }
      .bcast .empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #6c7393; }
      .bcast .qa { margin-top: 10px; padding-top: 10px; border-top: 1px solid #1f2430; }
      .bcast .qa form { display: flex; gap: 6px; }
      .bcast .qa input { flex: 1; min-width: 0; background: #0b0e14; color: #cdd6f4; border: 1px solid #1f2430;
        border-radius: 4px; padding: 5px 8px; font: inherit; font-size: 12px; }
      .bcast .qa .send { background: #f9e2af; color: #11151f; border: 0; border-radius: 4px; padding: 5px 10px; cursor: pointer; font: inherit; font-size: 12px; }
      .bcast .qa .item { font-size: 11px; margin-top: 6px; line-height: 1.3; }
      .bcast .qa .q { color: #f9e2af; }
      .bcast .qa .a { color: #b8c0e0; }
    </style>

    <div class="bcast">
      <div class="cam-wrap" id="dir-cam" phx-update="ignore">
        <iframe id="cam-frame" src={viewer_url() <> "/"} class="cam" title="UNI colony — director camera"></iframe>
        {raw(camera_warm_script())}
      </div>

      <div class="onair">● LIVE</div>
      <button class="cam-reload" onclick="reloadCam()" title="reconnect the camera">⟳ cam</button>
      <div class="scene">{SP.Brain.Narration.render_one(:scene, %{day: @broadcast.day}, @lang)}</div>

      <div class="langs">
        <button
          :for={{l, lbl} <- lang_labels()}
          class={"lang" <> if(@lang == l and not @cycle, do: " on", else: "")}
          phx-click="set_lang"
          phx-value-lang={Atom.to_string(l)}
        >{lbl}</button>
        <button class={"lang" <> if(@cycle, do: " on", else: "")} phx-click="toggle_cycle" title="cycle languages">↻</button>
      </div>

      <div :if={@broadcast.star} class="star-name">★ {@broadcast.star}</div>

      <div class="lower3" dir="ltr">
        <div class="caption">{caption(@broadcast.lines, @lang)}</div>
        <div class="ticker">
          <span :for={l <- Enum.drop(@broadcast.lines, 1)}>{line_text(l, @lang)}</span>
        </div>
      </div>

      <div class="cards">
        <div :for={c <- @broadcast.cards} class={"card" <> if(c.username == @broadcast.star, do: " star", else: "")}>
          <div class="ch">{c.username}<span class="kin">kin {c.kin}</span></div>
          <div class="bar"><span style={"width:#{min(c.health * 5, 100)}%;background:#a6e3a1"}></span></div>
          <div class="bar"><span style={"width:#{min(c.food * 5, 100)}%;background:#fab387"}></span></div>
          <div class="bar"><span style={"width:#{c.tension}%;background:#f38ba8"}></span></div>
          <div class="bar"><span style={"width:#{Map.get(c, :stress, 0)}%;background:#cba6f7"}></span></div>
          <div class="cmeta">{mode_label(c.mode)} · {c.social} · <span style={emotion_style(c.emotion)}>{c.emotion}</span> · {c.action} · tension {c.tension}</div>
          <div class="mind">
            🧠 <span class="opt" style={context_style(c[:context])}>{context_label(c[:context])}</span>
            · <span class="intent">{c[:intent] || "—"}</span> · {c[:confidence] || 0}% sure
          </div>
          <div :if={c[:phase] != nil} class="cmeta" style="opacity:.8">
            grown: phase {c.phase}<span :if={c[:focus] != nil}> · focus f{c.focus}</span>
          </div>
          <div :if={c[:body]} class="cmeta" style="display:flex;gap:4px;align-items:center;margin-top:2px">
            <span style="color:#89b4fa;font-size:9px;letter-spacing:.08em">BODY</span>
            <span
              :for={{lab, key} <- [{"en", :energy}, {"gut", :gut}, {"soma", :soma}, {"fat", :fatigue}]}
              title={"#{key} store: #{Map.get(c.body, key)}"}
              style={"font-size:9px;padding:1px 4px;border-radius:3px;" <> vchip(c.body.bins[key])}
            >{lab}</span>
          </div>
        </div>
        <div :if={@broadcast.cards == []} class="cmeta" style="padding:8px">No agents live yet — spawn UNIs from the overlooker (/).</div>

        <div class="qa">
          <form phx-submit="ask">
            <input type="text" name="q" placeholder="Ask the producer…" autocomplete="off" />
            <button class="send" type="submit">Ask</button>
          </form>
          <div :for={item <- @qa} class="item">
            <div class="q">▸ {item.q}</div>
            <div class="a">{item.a}</div>
          </div>
        </div>
      </div>
    </div>
    """
  end

  defp caption([], _lang), do: "The colony stirs…"
  defp caption([line | _], lang), do: line_text(line, lang)

  # English keeps the Director's rich phrase banks (line.text); other languages come from
  # the Producer's multilingual templates (line.i18n[lang]), falling back to English.
  defp line_text(%{text: t}, :en), do: t
  defp line_text(%{i18n: i18n, text: t}, lang) when is_map(i18n), do: Map.get(i18n, lang) || t
  defp line_text(%{text: t}, _lang), do: t

  defp next_lang(l) do
    i = Enum.find_index(@langs, &(&1 == l)) || 0
    Enum.at(@langs, rem(i + 1, length(@langs)))
  end

  defp lang_labels, do: [{:en, "EN"}, {:es, "ES"}, {:fr, "FR"}, {:it, "IT"}, {:pt, "PT"}, {:hi, "हिन्दी"}]

  defp mode_label("see_all"), do: "See All"
  defp mode_label("blind"), do: "Blind"
  defp mode_label("see_kin"), do: "See Kin"
  defp mode_label(o), do: to_string(o)

  defp emotion_style(:fear), do: "color:#f38ba8"
  defp emotion_style(:anger), do: "color:#eb6f92"
  defp emotion_style(:grief), do: "color:#9aa5ce"
  defp emotion_style(:curiosity), do: "color:#89dceb"
  defp emotion_style(:content), do: "color:#a6e3a1"
  defp emotion_style(_), do: "color:#cdd6f4"

  # The L2 strategic option (the "mind beat"), colour-coded by arousal/intent.
  defp context_label(nil), do: "—"
  defp context_label(:forage), do: "foraging"
  defp context_label(:build), do: "building"
  defp context_label(:flee), do: "fleeing"
  defp context_label(:socialize), do: "socialising"
  defp context_label(:rest), do: "resting"
  defp context_label(o), do: to_string(o)

  defp context_style(:flee), do: "color:#f38ba8"
  defp context_style(:socialize), do: "color:#89dceb"
  defp context_style(:build), do: "color:#a6e3a1"
  defp context_style(:rest), do: "color:#9aa5ce"
  defp context_style(_), do: "color:#f9e2af"

  # WS1-A: viability-body chip colour by graded tier bin (0 critical .. 5 surplus).
  defp vchip(b) when is_integer(b) and b <= 0, do: "background:#f38ba8;color:#11111b"
  defp vchip(b) when is_integer(b) and b <= 1, do: "background:#fab387;color:#11111b"
  defp vchip(b) when is_integer(b) and b <= 2, do: "background:#f9e2af;color:#11111b"
  defp vchip(_), do: "background:#313244;color:#a6e3a1"

  # The director camera cold-starts: its spectator must connect, spawn, and load chunks
  # before the world renders. The iframe can connect before that's ready and would stay
  # blank (the wrapper is phx-update="ignore", so it never reloads on its own). So we
  # reconnect it a few times across the warm-up window, then STOP — no ongoing flicker.
  # `reloadCam()` is also wired to a manual ⟳ button for any later reconnect.
  # the director camera's public address — defaults to localhost for solo viewing; set VIEWER_URL
  # (e.g. to a tunnel/public https URL) so REMOTE viewers' browsers load the video, not their own
  # localhost. Used by both the iframe src and the cold-start reconnect script.
  defp viewer_url, do: System.get_env("VIEWER_URL", "http://localhost:3020")

  defp camera_warm_script do
    """
    <script>
      (function () {
        var url = "#{viewer_url()}/";
        window.reloadCam = function () {
          var f = document.getElementById("cam-frame");
          if (f) f.src = url + "?t=" + Date.now();
        };
        // Only reconnect during the brief cold-start window (before the camera's bot is
        // up); then STOP, so we never reset an already-rendering view (which blanks the
        // terrain). The ⟳ button is there if a manual reconnect is ever needed.
        [5000, 13000].forEach(function (ms) { setTimeout(window.reloadCam, ms); });
      })();
    </script>
    """
  end
end
