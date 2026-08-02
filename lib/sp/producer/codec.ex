defmodule SP.Producer.Codec do
  @moduledoc """
  The Producer's sense/act discretiser (the analogue of `SP.Brain.MCCodec`). Pure: it turns
  the assembled production `telemetry` into the genome's discrete `obs_by_factor` and maps a
  chosen action index back to a production action atom. It is the ONLY producer-specific
  semantics; the brain below it is the generic FEP engine.

      telemetry = %{
        rows:    [board rows: %{senses, action, context, ...}],   # SP.Runtime.Board.all/0
        tps:     %{mspt: float, up: boolean},                     # RCON /tps
        log:     %{errors: n, warns: n},                          # log/stderr counters
        history: %{beats_since_cut: n, recent_drama: [..], recent_stars: [..]}
      }
  """

  alias SP.Producer.Genome

  @doc "Discretise telemetry into one `[outcome]` per modality, in genome order."
  def encode(t) when is_map(t) do
    [
      [drama(t)],
      [spotlight(t)],
      [coverage(t)],
      [pacing(t)],
      [population(t)],
      [server_health(t)],
      [error_rate(t)],
      [diversity(t)],
      [cohesion(t)],
      [economy(t)],
      [momentum(t)]
    ]
  end

  @doc "Map a chosen action index to its production action atom."
  def action(index), do: Enum.at(Genome.actions(), index, :noop)

  @doc "Username of the most dramatic agent (the natural cut subject), or nil."
  def top_subject(rows) when is_list(rows) do
    case rows do
      [] -> nil
      _ -> rows |> Enum.max_by(&row_score/1) |> Map.get(:username)
    end
  end

  @doc "Username of the least dramatic agent (the natural cull target), or nil."
  def low_subject(rows) when is_list(rows) do
    case rows do
      [] -> nil
      _ -> rows |> Enum.min_by(&row_score/1) |> Map.get(:username)
    end
  end

  # --- per-modality discretisation (public for testing) ----------------------

  # 0 dull · 1 simmering · 2 active · 3 crisis · 4 climax
  def drama(t) do
    case rows(t) |> Enum.map(&row_score/1) |> max0() do
      m when m >= 96 -> 4
      m when m >= 82 -> 3
      m when m >= 50 -> 2
      m when m >= 30 -> 1
      _ -> 0
    end
  end

  # 0 none · 1 survival · 2 combat · 3 social · 4 explore/mind · 5 builder
  def spotlight(t) do
    case top_row(t) do
      nil ->
        0

      r ->
        s = senses(r)

        cond do
          truthy(s["hurt"]) or num(s["health"], 20) < 11 -> 1
          near?(s["hostile_dist"]) -> 2
          (s["social"] || 0) > 0 -> 3
          Map.get(r, :action) == "mine" -> 5
          not is_nil(Map.get(r, :context)) -> 4
          true -> 0
        end
    end
  end

  # 0 fresh · 1 settled · 2 stale · 3 over-held  (star screen-time)
  def coverage(t) do
    case hist(t) |> Map.get(:beats_since_cut, 0) do
      n when n <= 1 -> 0
      n when n <= 4 -> 1
      n when n <= 8 -> 2
      _ -> 3
    end
  end

  # 0 lull · 1 building · 2 peak · 3 cooldown
  def pacing(t) do
    case hist(t) |> Map.get(:recent_drama, []) do
      [] ->
        0

      [last | rest] ->
        prev = if rest == [], do: last, else: Enum.sum(rest) / length(rest)

        cond do
          last >= 3 -> 2
          last > prev -> 1
          last < prev -> 3
          true -> 0
        end
    end
  end

  # 0 empty · 1 thin · 2 healthy · 3 crowded · 4 overloaded  (cast size)
  def population(t) do
    case length(rows(t)) do
      0 -> 0
      n when n <= 2 -> 1
      n when n <= 6 -> 2
      n when n <= 9 -> 3
      _ -> 4
    end
  end

  # 0 down · 1 degraded · 2 ok · 3 ideal  (engine ticks-per-second from RCON `tps`)
  def server_health(t) do
    tps = Map.get(t, :tps, %{})

    cond do
      Map.get(tps, :up, true) == false -> 0
      num(Map.get(tps, :tps), 20.0) < 10.0 -> 1
      num(Map.get(tps, :tps), 20.0) < 18.0 -> 2
      true -> 3
    end
  end

  # 0 clean · 1 warnings · 2 erroring
  def error_rate(t) do
    log = Map.get(t, :log, %{})

    cond do
      num(Map.get(log, :errors), 0) > 0 -> 2
      num(Map.get(log, :warns), 0) > 3 -> 1
      true -> 0
    end
  end

  # 0 fresh · 1 ok · 2 repetitive · 3 stuck  (anti-boredom: variety of recent stars)
  def diversity(t) do
    case hist(t) |> Map.get(:recent_stars, []) |> Enum.uniq() |> length() do
      d when d >= 4 -> 0
      3 -> 1
      2 -> 2
      _ -> 3
    end
  end

  # 0 fractured · 1 loose · 2 bonded · 3 tight  (how together the colony is — social density)
  def cohesion(t) do
    case rows(t) do
      [] ->
        0

      rows ->
        soc = Enum.count(rows, fn r -> num(senses(r)["social"], 0) > 0 end) / length(rows)

        cond do
          soc < 0.15 -> 0
          soc < 0.4 -> 1
          soc < 0.75 -> 2
          true -> 3
        end
    end
  end

  # 0 idle · 1 gathering · 2 building · 3 thriving  (productive activity + tools accrued).
  # "Productive" = mining/building OR foraging/gathering — a colony out working the world is
  # NOT idle; idle means genuinely doing nothing (fleeing, hurt, milling), which is rare.
  @productive_ctx [:build, :forage, :gather, :mine]
  def economy(t) do
    case rows(t) do
      [] ->
        0

      rows ->
        n = length(rows)

        build =
          Enum.count(rows, fn r ->
            Map.get(r, :action) == "mine" or Map.get(r, :context) in @productive_ctx
          end) / n

        tools = Enum.sum(Enum.map(rows, fn r -> num(senses(r)["tools"], 0) end)) / n
        score = build * 2.0 + min(tools, 2.0)

        cond do
          score < 0.3 -> 0
          score < 1.0 -> 1
          score < 2.0 -> 2
          true -> 3
        end
    end
  end

  # 0 flagging · 1 flat · 2 building · 3 peak  (the show's drama arc over a SLOW EWMA — the
  # producer's LONGER memory: it reads where the story has been trending, not just this beat).
  def momentum(t) do
    h = hist(t)
    ewma = num(Map.get(h, :drama_ewma), 0.0)

    last =
      case Map.get(h, :recent_drama, []) do
        [x | _] when is_number(x) -> x
        _ -> ewma
      end

    cond do
      ewma >= 2.5 -> 3
      ewma >= 1.5 and last >= ewma -> 2
      ewma >= 1.0 -> 1
      true -> 0
    end
  end

  # --- helpers ---------------------------------------------------------------

  defp rows(t), do: Map.get(t, :rows, [])
  defp hist(t), do: Map.get(t, :history, %{})
  defp senses(r), do: Map.get(r, :senses, %{})
  defp top_row(t), do: rows(t) |> Enum.max_by(&row_score/1, fn -> nil end)
  defp max0([]), do: 0
  defp max0(xs), do: Enum.max(xs)

  # per-agent drama score — the proven thresholds from SP.Brain.Director.score/2.
  defp row_score(r) do
    s = senses(r)

    cond do
      truthy(s["hurt"]) -> 100
      num(s["health"], 20) < 6 -> 96
      near?(s["hostile_dist"]) -> 82
      num(s["health"], 20) < 11 -> 72
      (s["social"] || 0) == 2 -> 56
      (s["social"] || 0) == 1 -> 50
      num(s["food"], 20) < 8 -> 46
      Map.get(r, :action) == "mine" -> 30
      true -> 8
    end
  end

  defp num(v, _d) when is_number(v), do: v
  defp num(_v, d), do: d
  defp truthy(true), do: true
  defp truthy(_), do: false
  defp near?(v), do: is_number(v) and v < 10.0
end
