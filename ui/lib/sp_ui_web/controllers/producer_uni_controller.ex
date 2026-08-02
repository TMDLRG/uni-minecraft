defmodule SpUiWeb.ProducerUniController do
  @moduledoc """
  Per-UNI OBSERVATION surface (v1a) — read-only JSON the studio and Gaia can project VERBATIM.

  Every route here is a PURE READ of the colony's push-snapshot board
  (`SP.Runtime.Board.all/0`, reached through the reviewed transport seam
  `SP.Show.RemoteRows`). It starts nothing, writes nothing, and computes no score.

  ## THE CLAIM FENCE (binding — `docs/LAB_PROTOCOL.md`)

  Every field returned is a **substrate-level observation**. Passing behaviour demonstrates the
  named behaviour and NOTHING about awareness, experience, or life. Each response carries a
  top-level `disclaimer` AND an `x-uni-claim-fence` response header saying so. Do not remove
  either; do not add a synthesized aggregate "score", "rank", "health %", or "performance
  index" to any route — the gate `producer-per-uni-telemetry` FALSIFIES on exactly that.

  Field-name honesty, restated because it is load-bearing:

    * `emotion` / `stress` are **`SP.Brain.Hormones` / `SP.Brain.Emotion` labels computed from
      factor precisions**. They are NOT felt states. `SP.Brain.Awareness` (whose own moduledoc
      carries the strictest fence in the system) models *access and report*, not phenomenal
      experience.
    * `confidence` is `Awareness.metacognition/1` — a precision-weighted peakedness of the
      agent's own posteriors. It is a number about a distribution, not self-knowledge.
    * `intent` is `SP.Brain.Plan.preview/2` — the greedy depth-N rollout of *expected* beliefs.
      It is a prediction under the model, NOT a commitment; the body and world may diverge.

  ## v1a SCOPE — what is deliberately ABSENT (stated plainly, not silently missing)

    * No `energy` / `satiety` / homeostat body / `eat_count` / `attack_count` / `gamma_m`. Those
      live on the live `SP.Runtime.Agent` GenServer state but are NOT published to the board
      today. Adding them is **v1b** (an additive `Agent.publish/1` change) and requires a colony
      redeploy, which destroys the running minds unless the mandatory Gaia capture runs first
      (`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`).
    * No EFE decomposition (`H(qo) − E[H(o|s)]` vs `qo·C` vs `W`). Those summands are computed
      inside `SP.Brain.Plan.advance/3` and summed before return; extracting them is an
      FE-touching change and is **v2, behind `/lab-team-review`** per `docs/LAB_PROTOCOL.md`.
    * No per-frame history. The board is REPLACE-IN-PLACE (one row per agent, overwritten), so
      no history exists to serve. `/producer/uni_history/:name` therefore reports
      `available: false` with the reason — it does NOT fabricate a series.
  """
  use SpUiWeb, :controller

  alias SP.Show.RemoteRows

  @disclaimer "substrate observation only; no evidence for awareness/experience — see LAB_PROTOCOL claim fence"

  # Board keys that are safe, already-computed observations. Anything not in this list is not
  # invented here; it is simply absent (and §v1a SCOPE above says why).
  @mind_keys [:context, :stress, :emotion, :confidence, :focus, :intent, :report]

  # --- routes ----------------------------------------------------------------

  @doc "Every live UNI as the board sees it, plus honest name decoding."
  def roster(conn, _params) do
    rows = rows()

    send_observation(conn, %{
      count: length(rows),
      source: "SP.Runtime.Board.all/0 via SP.Show.RemoteRows",
      colony_node: node_label(),
      uni: Enum.map(rows, &roster_entry/1)
    })
  end

  @doc "One UNI's last published board row — the mind beat + its raw senses."
  def state(conn, %{"name" => name}) do
    case Enum.find(rows(), &(Map.get(&1, :username) == name)) do
      nil ->
        conn
        |> put_status(404)
        |> send_observation(%{error: "no such UNI on the board", name: name})

      row ->
        send_observation(conn, %{
          uni: roster_entry(row),
          mind: Map.take(row, @mind_keys),
          senses: Map.get(row, :senses, %{}),
          action: Map.get(row, :action),
          ticks: Map.get(row, :count),
          absent: absent_note()
        })
    end
  end

  @doc """
  Per-frame history. HONESTLY UNAVAILABLE in v1a — the board is replace-in-place, so there is no
  series to return. Returns 200 with `available: false` rather than 404 (the route exists and the
  contract is real) and rather than a fabricated series (which would be a lie).
  """
  def history(conn, %{"name" => name}) do
    known? = Enum.any?(rows(), &(Map.get(&1, :username) == name))

    send_observation(conn, %{
      name: name,
      known_to_board: known?,
      available: false,
      frames: [],
      reason:
        "SP.Runtime.Board is a replace-in-place ETS snapshot (one row per agent, overwritten " <>
          "every publish). No per-frame history is retained anywhere in the running system, so " <>
          "none can be served. A history ring is a separate, additive change (v1b+); this route " <>
          "reports its absence rather than synthesizing a series."
    })
  end

  @doc """
  Kin/lineage rollup.

  **HONESTY CORRECTION (2026-07-18, this commit).** `UNI-1-2` does NOT mean "generation 1". Two
  distinct naming schemes exist in the code:

    * `SP.Brain.Colony` (`lib/sp/brain/colony.ex:109`) — `UNI-<kin>-<idx>`: **kin group** +
      monotonic index. Carries NO generation.
    * `SP.Runtime.Lineage` (`lib/sp/runtime/lineage.ex:123`) — `UNI-<kin>-g<gen>`: kin group +
      **`g`-prefixed generation**, assigned by the death→breed→respawn loop.

  So the first number is the **KIN GROUP**. A true lineage generation exists only on a
  `g`-prefixed name. This route reports both separately and never conflates them.
  """
  def generations(conn, _params) do
    rows = rows()
    entries = Enum.map(rows, &roster_entry/1)

    by_kin =
      entries
      |> Enum.group_by(& &1.kin)
      |> Enum.map(fn {kin, es} -> %{kin: kin, alive: length(es), uni: Enum.map(es, & &1.username)} end)
      |> Enum.sort_by(& &1.kin)

    bred = Enum.filter(entries, &(&1.lineage_generation != nil))

    send_observation(conn, %{
      kin_groups: by_kin,
      kin_group_count: length(by_kin),
      lineage_bred_count: length(bred),
      lineage_generations:
        bred
        |> Enum.group_by(& &1.lineage_generation)
        |> Enum.map(fn {g, es} -> %{generation: g, alive: length(es)} end)
        |> Enum.sort_by(& &1.generation),
      note:
        "The first number in UNI-<a>-<b> is the KIN GROUP, not a generation. A lineage " <>
          "generation is present ONLY on a g-prefixed name (UNI-<kin>-g<gen>), produced by " <>
          "SP.Runtime.Lineage's death->breed->respawn loop. lineage_bred_count = 0 means NO " <>
          "generational turnover has been observed on this board — do not report kin spread " <>
          "as generational depth."
    })
  end

  # --- helpers ---------------------------------------------------------------

  defp rows do
    RemoteRows.fetch(RemoteRows.colony_node())
  rescue
    _ -> []
  catch
    _, _ -> []
  end

  defp node_label do
    case RemoteRows.colony_node() do
      nil -> "local"
      n -> to_string(n)
    end
  end

  # Decode the username WITHOUT inventing anything. kin/index come from the board row where
  # present (authoritative); the name is parsed only to expose the lineage generation, which
  # exists nowhere else.
  defp roster_entry(row) do
    username = Map.get(row, :username)
    {parsed_kin, index, lineage_gen} = decode_name(username)

    %{
      username: username,
      # the board row's kin is authoritative; the parsed one is the fallback for a remote-vintage
      # row that predates the key.
      kin: Map.get(row, :kin) || parsed_kin,
      index: index,
      lineage_generation: lineage_gen,
      mode: Map.get(row, :mode),
      # curriculum phase = how far this UNI has climbed (0 survive .. 4 shelter). An observation
      # of the genome's phase field, not a score.
      phase: Map.get(row, :phase),
      action: Map.get(row, :action),
      ticks: Map.get(row, :count)
    }
  end

  # "UNI-1-3"    -> {1, 3, nil}    (Colony: kin 1, agent #3, no generation)
  # "UNI-1-g4"   -> {1, nil, 4}    (Lineage: kin 1, generation 4)
  defp decode_name(name) when is_binary(name) do
    case Regex.run(~r/^UNI-(\d+)-(g?)(\d+)$/, name) do
      [_, kin, "g", gen] -> {to_int(kin), nil, to_int(gen)}
      [_, kin, _, idx] -> {to_int(kin), to_int(idx), nil}
      _ -> {nil, nil, nil}
    end
  end

  defp decode_name(_), do: {nil, nil, nil}

  defp to_int(s) do
    case Integer.parse(s) do
      {i, _} -> i
      _ -> nil
    end
  end

  defp absent_note do
    %{
      fields: [:energy, :satiety, :homeostat_body, :eat_count, :attack_count, :gamma_m],
      reason:
        "present on the live SP.Runtime.Agent state but NOT published to SP.Runtime.Board today. " <>
          "Exposing them is v1b (an additive Agent.publish/1 change requiring a colony redeploy, " <>
          "which is gated on the mandatory Gaia capture-before-destroy procedure).",
      efe_breakdown:
        "epistemic H(qo)-E[H(o|s)] / pragmatic qo·C / novelty W are summed inside " <>
          "SP.Brain.Plan.advance/3 and not separable without an FE-touching change (v2, gated " <>
          "on /lab-team-review)."
    }
  end

  # ONE exit point, so no route can ship without the fence.
  defp send_observation(conn, payload) when is_map(payload) do
    conn
    |> put_resp_header("cache-control", "no-store")
    |> put_resp_header("x-uni-claim-fence", @disclaimer)
    |> json(Map.merge(payload, %{disclaimer: @disclaimer, observed_at_unix: System.system_time(:second)}))
  end
end
