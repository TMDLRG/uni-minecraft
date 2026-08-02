# Adding the `/control` LiveView route to the existing `ui/` app

**What this is:** the concrete plan for adding `live "/control", ControlLive` to the existing Strings
Phoenix app (`ui/`, Phoenix 1.8 + LiveView 1.0 on `:4000`). It reuses the exact patterns already in
`ui/lib/sp_ui_web/live/stream_live.ex` (a 1-second `handle_info(:refresh)` poll, `phx-click` /
`phx-submit` handlers, `Phoenix.PubSub`) and the router/web-module shapes already in the tree. The panel
layout and the control->tool map are in `DESIGN.md`; the voice path is in `voice-intents.md`.

**Hard constraint (do NOT violate):** the **zero-dep core** of Strings gets no new hex deps. This route
lives entirely in `ui/`. The HTTP call to the production MCP uses Erlang/OTP's built-in `:httpc`
(no `:req`, no `:finch`, no `:tesla`) and `Jason` (already present in any Phoenix app via
`phoenix`/`jason`). If `ui/mix.exs` already vendors a JSON lib, use that; otherwise `:json` (OTP 27+) or
`Jason` - but add nothing to the core `mix.exs` outside `ui/`.

**Evidence posture:** DESIGN/REFERENCE. The route does not exist yet; this is the build recipe, status
`pending`. Honesty footer at the foot.

---

## 1. The router change

The current `ui/lib/sp_ui_web/router.ex` (read this session) is:

```elixir
scope "/", SpUiWeb do
  pipe_through :browser
  live "/", OverlookerLive, :index
  live "/stream", StreamLive, :index
end
```

Add one line in the same scope (same `:browser` pipeline, which already sets the loosened CSP
`base-uri 'self'` that permits iframing the program preview):

```elixir
scope "/", SpUiWeb do
  pipe_through :browser
  live "/", OverlookerLive, :index
  live "/stream", StreamLive, :index
  live "/control", ControlLive, :index      # operator pedalboard (production MCP remote)
end
```

No pipeline change is needed: the existing `:browser` pipeline already drops `frame-ancestors` to allow
the embedded preview. (If, in production, `/control` must be reachable only on the LAN/WG, gate it at nginx
or with a plug in a dedicated pipeline - that is a deployment choice, out of scope for the route itself.)

---

## 2. The LiveView module shape

Create `ui/lib/sp_ui_web/live/control_live.ex`. It mirrors `StreamLive`: `use SpUiWeb, :live_view`, a
`mount/3` that subscribes + starts a refresh timer when `connected?`, a `handle_info(:refresh)` poll that
re-reads show state, and one `handle_event/3` per control that builds the args and calls the MCP.

```elixir
defmodule SpUiWeb.ControlLive do
  @moduledoc """
  The operator control surface (the pedalboard). A THIN remote for the production MCP
  (uni-production-mcp on 127.0.0.1:8095). Holds no production logic: every operator action
  is an MCP tools/call (audited + session-gated); the panel state is read back from
  get_show_state / list_* on a 1s poll. See production/control/DESIGN.md.
  """
  use SpUiWeb, :live_view

  # The MCP loopback bind (server-side call; the bearer never reaches the browser).
  # TODO: set PROD_MCP_URL + PROD_MCP_TOKEN in the ui/ runtime env.
  @mcp_url System.get_env("PROD_MCP_URL", "http://127.0.0.1:8095")

  @empty %{
    scene: nil, on_air: false, music: %{volume: 0.0, ducked: false},
    now_playing: nil, clips: [], segments: [], guests: %{green_room: [], on_air: []},
    caption: nil, approvals: [], session_open: false, audit_last: nil, heard: nil, stale: true
  }

  @impl true
  def mount(_params, _session, socket) do
    state =
      if connected?(socket) do
        Process.send_after(self(), :refresh, 1000)
        read_state()
      else
        @empty
      end

    {:ok, assign(socket, state |> Map.put(:lang, "en") |> Map.put(:transition, "fade") |> Map.put(:ms, 400))}
  end

  # ---- read poll (the panel's live state comes from the MCP, never a private copy) ----
  @impl true
  def handle_info(:refresh, socket) do
    if connected?(socket), do: Process.send_after(self(), :refresh, 1000)
    {:noreply, assign(socket, read_state())}
  end

  defp read_state do
    show   = mcp_read("get_show_state")
    clips  = mcp_read("list_clips")     |> Map.get("clips", [])
    segs   = mcp_read("list_segments")  |> Map.get("segments", [])
    guests = mcp_read("list_guests")
    appr   = mcp_read("approvals_pending") |> Map.get("pending", [])
    %{
      scene: show["scene"], on_air: show["onAir"] || false,
      music: show["music"] || %{volume: 0.0, ducked: false},
      now_playing: show["nowPlaying"], caption: show["caption"],
      clips: clips, segments: segs,
      guests: %{green_room: guests["green_room"] || [], on_air: guests["on_air"] || []},
      approvals: appr, stale: stale?(show["updatedUtc"])
    }
  end

  # ---- in-show verbs (session-gated): fire MCP, let the next poll reconcile ----
  @impl true
  def handle_event("cut", %{"scene" => s} = p, socket) do
    call(socket, "cut_to", %{scene: s,
      transition: p["transition"] || socket.assigns.transition,
      ms: to_int(p["ms"], socket.assigns.ms)})
  end

  def handle_event("set_music_volume", %{"level" => l}, socket),
    do: call(socket, "set_music_volume", %{level: to_float(l, 0.18)})

  def handle_event("duck", %{"on" => on}, socket),
    do: call(socket, "duck", %{on: on == "true"})

  def handle_event("narrate", %{"text" => t, "lang" => lang} = p, socket) when t != "",
    do: call(socket, "narrate", %{text: t, lang: lang, voice: p["voice"]})

  def handle_event("set_overlay", %{"layer" => layer} = p, socket),
    do: call(socket, "set_overlay", %{layer: layer, payload: overlay_payload(layer, p)})

  def handle_event("roll_clip", %{"clip" => id} = p, socket),
    do: call(socket, "roll_clip", %{clipId: id, mode: p["mode"] || "cut"})

  def handle_event("start_segment", %{"template" => tpl} = p, socket),
    do: call(socket, "start_segment", %{template: tpl, params: Map.drop(p, ["template"])})

  def handle_event("set_layout", %{"template" => tpl}, socket),
    do: call(socket, "set_layout", %{template: tpl})

  def handle_event("remove_guest", %{"guest" => id}, socket),
    do: call(socket, "remove_guest", %{guestId: id})

  # ---- session control (one human act sets the operator autoapprove allowlist) ----
  def handle_event("open_session", _p, socket) do
    # Calls the MCP/approvals side that sets UNI_APPROVALS_AUTOAPPROVE to the in-show verb
    # allowlist. This is operator pre-authorization, NOT agent self-approval.
    _ = call_raw("open_session", %{verbs: in_show_verbs()})
    {:noreply, assign(socket, session_open: true)}
  end

  def handle_event("close_session", _p, socket) do
    _ = call_raw("close_session", %{})
    {:noreply, assign(socket, session_open: false)}
  end

  # ---- human-gated verbs: fire, then show approval-pending; poll status ----
  def handle_event("admit_guest", %{"guest" => id} = p, socket),
    do: gated(socket, "admit_guest", %{guestId: id, layout: p["layout"]})

  def handle_event("schedule", %{"slot" => slot} = p, socket),
    do: gated(socket, "schedule", %{slot: slot, runOfShow: p["runOfShow"]})

  # 2-step: first click = dry-run, second = confirm
  def handle_event("start_broadcast", %{"target" => t, "confirm" => "true"}, socket),
    do: gated(socket, "start_broadcast", %{target: t, confirm: true})
  def handle_event("start_broadcast", %{"target" => t}, socket),
    do: gated(socket, "start_broadcast", %{target: t, dryRun: true})

  def handle_event("stop_broadcast", %{"confirm" => "true"}, socket),
    do: gated(socket, "stop_broadcast", %{confirm: true})
  def handle_event("stop_broadcast", _p, socket),
    do: gated(socket, "stop_broadcast", %{dryRun: true})

  # ---- voice / text intents resolved client-side or via LLM, posted back as the same events ----
  def handle_event("intent", %{"tool" => tool, "args" => args, "heard" => heard}, socket) do
    # The client (voice-intents.js) maps a phrase -> {tool, args}; the server still routes it
    # through the SAME MCP call + gating, so voice has no extra privilege.
    {:noreply, socket |> assign(heard: heard) |> dispatch(tool, args)}
  end

  # ---------- helpers ----------
  defp call(socket, tool, args) do
    res = call_raw(tool, args)
    # push the new program-preview state to the client hook (see push_event below)
    {:noreply, socket |> assign(audit_last: res["audit_id"]) |> push_event("mcp:done", %{tool: tool, audit_id: res["audit_id"]})}
  end

  defp gated(socket, tool, args) do
    res = call_raw(tool, args)
    {:noreply, socket
      |> assign(audit_last: res["audit_id"])
      |> push_event("approval:pending", %{tool: tool, request_id: res["request_id"]})}
  end

  defp dispatch(socket, tool, args), do: elem(call(socket, tool, args), 1)

  # The actual HTTP call to the MCP over loopback, bearer held server-side.
  defp call_raw(tool, args) do
    body = Jason.encode!(%{method: "tools/call", params: %{name: tool, arguments: args}})
    headers = [{~c"content-type", ~c"application/json"}, {~c"authorization", ~c"Bearer #{token()}"}]
    request = {~c"#{@mcp_url}/prod-mcp", headers, ~c"application/json", body}
    case :httpc.request(:post, request, [{:timeout, 5000}], []) do
      {:ok, {{_, 200, _}, _h, resp}} -> Jason.decode!(to_string(resp))
      other -> %{"error" => inspect(other), "audit_id" => nil}
    end
  end

  defp mcp_read(tool), do: call_raw(tool, %{})

  defp token, do: System.get_env("PROD_MCP_TOKEN", "")   # TODO: set in ui/ runtime env, never in source
  defp in_show_verbs, do: ~w(cut_to set_music_volume duck narrate set_overlay roll_clip start_segment set_layout remove_guest)
  defp stale?(nil), do: true
  defp stale?(iso) do
    case DateTime.from_iso8601(iso) do
      {:ok, dt, _} -> DateTime.diff(DateTime.utc_now(), dt) > 5
      _ -> true
    end
  end
  defp to_int(v, d), do: (case Integer.parse(to_string(v)) do {n, _} -> n; _ -> d end)
  defp to_float(v, d), do: (case Float.parse(to_string(v)) do {n, _} -> n; _ -> d end)

  # Build the set_overlay payload to match broadcast.schema.json exactly.
  defp overlay_payload("lowerThird", p), do:
    %{visible: p["visible"] == "true", kicker: p["kicker"], title: p["title"], subtitle: p["subtitle"], tone: p["tone"] || "ok"}
  defp overlay_payload("title", p), do:
    %{visible: p["visible"] == "true", kicker: p["kicker"], text: p["text"], subtitle: p["subtitle"], tone: p["tone"] || "ok"}
  defp overlay_payload("caption", p), do:
    %{visible: p["visible"] == "true", lang: p["lang"] || "en", text: p["text"]}
  defp overlay_payload("ticker", p), do: p["items"] || []   # array of {text,tone}
  defp overlay_payload("onAir", p), do: %{value: p["value"] == "true", text: p["text"] || "LIVE"}
  defp overlay_payload(_l, p), do: p

  @impl true
  def render(assigns) do
    ~H"""
    <!-- The full markup is the panel in DESIGN.md section 1. Key bindings shown here. -->
    <div id="control" phx-hook="ControlPreview">
      <header>
        <span>UNI Producer - Operator Control</span>
        <button :if={not @session_open} phx-click="open_session">Open live session</button>
        <button :if={@session_open} phx-click="close_session" class="on">Session OPEN</button>
        <span class={"onair " <> if(@on_air, do: "live", else: "")}>{if @on_air, do: "ON AIR", else: "--"}</span>
      </header>

      <!-- program preview: an iframe; the hook updates a staleness ribbon from push_event -->
      <div class="preview" phx-update="ignore" id="prog">
        <iframe id="prog-frame" src={preview_url()} title="program preview"></iframe>
      </div>
      <div :if={@stale} class="stale">STALE - broadcast.json not refreshing</div>

      <!-- scene/cut bus -->
      <div class="cuts">
        <button :for={s <- ~w(COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP)}
          class={"cut" <> if(@scene == s, do: " on", else: "")}
          phx-click="cut" phx-value-scene={s}
          phx-value-transition={@transition} phx-value-ms={@ms}>{s}</button>
      </div>

      <!-- music fader + duck -->
      <form phx-change="set_music_volume">
        <input type="range" min="0" max="1" step="0.01" name="level" value={@music.volume} />
      </form>
      <button phx-click="duck" phx-value-on={to_string(not @music.ducked)}>
        duck: {if @music.ducked, do: "ON", else: "off"}
      </button>

      <!-- narrate -->
      <form phx-submit="narrate">
        <select name="lang"><option :for={l <- ~w(en es fr it pt hi)} value={l} selected={l == @lang}>{l}</option></select>
        <textarea name="text" placeholder="text to narrate..."></textarea>
        <button type="submit">Narrate</button>
      </form>

      <!-- broadcast (human-gated, 2-step) -->
      <button class="gated" phx-click="start_broadcast" phx-value-target="youtube">GO LIVE</button>
      <button class="gated" phx-click="stop_broadcast" disabled={not @on_air}>STOP</button>

      <!-- clip browser -->
      <ul class="clips">
        <li :for={c <- @clips}>
          {c["clipId"]} - {c["title"]} ({c["lang"]}, {c["duration"]})
          <button phx-click="roll_clip" phx-value-clip={c["clipId"]} phx-value-mode="cut">roll</button>
        </li>
      </ul>

      <!-- guests, run-of-show, overlay editors: same pattern (phx-click -> the matching handle_event) -->
      <p class="audit">last action audit: {@audit_last || "-"}</p>
    </div>
    """
  end

  defp preview_url, do: System.get_env("PROG_PREVIEW_URL", "http://127.0.0.1:8099/overlays/")
end
```

---

## 3. The `push_event` / client hook (program preview + approval feedback)

The server uses `push_event/3` (already imported via `Phoenix.LiveView`) to nudge the client after an MCP
call - mirroring how `stream_live.ex` keeps the camera iframe responsive without re-rendering it. A small
colocated/static JS hook `ControlPreview` listens:

```javascript
// ui/assets/js/hooks/control_preview.js  (registered in app.js LiveSocket hooks)
export const ControlPreview = {
  mounted() {
    // refresh the program-preview iframe staleness + flash the audit id on each MCP result
    this.handleEvent("mcp:done", ({tool, audit_id}) => {
      this.el.querySelector(".audit")?.replaceChildren(`last action audit: ${audit_id || "-"} (${tool})`);
    });
    // a gated action returned pending -> show the banner + start status polling client-side
    this.handleEvent("approval:pending", ({tool, request_id}) => {
      showApprovalBanner(this.el, tool, request_id);   // polls approvals_status via the server
    });
  }
};
```

This is the same `push_event` -> client-hook seam the master design's control section calls for: the
LiveView server decides + audits via the MCP; the client only reflects the result and keeps the preview
fresh.

---

## 4. Why this respects the constraints

- **No core hex deps.** Everything is `:httpc` + the existing JSON lib, inside `ui/`. The zero-dep Strings
  core `mix.exs` is untouched. (`:inets`/`:ssl` ship with OTP; `:httpc` needs `:inets` started - add
  `:inets` to `extra_applications` in `ui/mix.exs` only, which adds no external dep.)
- **The bearer never reaches the browser.** Pattern A from `DESIGN.md`: the `phx-click` reaches the Elixir
  process, which holds `PROD_MCP_TOKEN` server-side and calls the loopback MCP. The client gets only the
  rendered state + push_event nudges.
- **Reuses proven patterns.** The 1s `handle_info(:refresh)` poll, `phx-click`/`phx-submit`, `phx-update`
  `ignore` on the iframe wrapper, and `push_event` are all lifted directly from `stream_live.ex`.
- **The MCP is the only authority.** The LiveView never mutates show state itself; it proposes via the MCP
  and reads state back. Gating + audit live in the MCP, so voice/text/click all have identical privilege.

---

## Status (honest)

- This is a **DESIGN/REFERENCE** build recipe. The `/control` route, `ControlLive`, and the
  `control_preview.js` hook do **not** exist yet; status `pending`. The code above is illustrative target
  shape, not a deployed module.
- The router/web-module/`stream_live.ex` patterns reused here were read **as captured** this session from
  `ui/lib/sp_ui_web/router.ex`, `ui/lib/sp_ui_web.ex`, and `ui/lib/sp_ui_web/live/stream_live.ex`
  (Class-C). The MCP tool names, args, gating, and overlay payload shapes are taken **as captured** from
  `docs/UNI_PRODUCTION_PLATFORM.md` and `production/schemas/broadcast.schema.json` - no verb or field is
  invented or renamed.
- No banned-unqualified word is used as a claim (no: verified, proven, guaranteed, isolated, secure, 100%,
  certified, real). That the bearer stays server-side and that the MCP gate blocks producer self-approval
  is the **intended** posture, **pending confirmation** (GAP **G-PA**, Class-Sec) by a captured run.
- The exact JSON-RPC envelope and the `request_id`/`audit_id` field names depend on the production MCP
  server in `production/mcp/`; where they differ, the MCP server is authoritative and this route is
  adjusted to match (no new verbs).
- Live-appliance safety: this route never targets the business stack (`solutionwright-*`, odoo, jitsi,
  cloudflared, portainer); the producer agent never holds the operator token and cannot self-approve.
