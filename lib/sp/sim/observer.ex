defmodule SP.Sim.Observer do
  @moduledoc """
  Pure builder of a per-tick **observer frame**: a complete record of the world
  (the omniscient/overlooker view) plus the exact Markov-blanket I/O for the tick.

  A frame is produced AFTER the agent has decided and the directives have been
  interpreted, so it can never influence agent behaviour or perturb determinism —
  it is a read-only projection of already-computed state.

  The frame has four parts:

    * `:world` / `:body` / `:genome` — the god view (all regions, all five layers
      L0–L4, morphology, ecology, infrastructure, seams).
    * `:afferent` — what the world sent the agent this tick: the sensor signals,
      the opaque `%{channel => float}` observation, a per-channel derivation, and
      the organs present at sensing time (`decision_organs`).
    * `:efferent` — what the agent sent back: directives + decoded/gated actions.
    * `:blanket` — a *claim* block (audit/scan results, channel-explainability,
      faithful-context flag). It is NEVER trusted by itself: `SP.Sim.Verifier`
      independently re-derives the verdict from the raw afferent data.

  All semantic labels (material/organ/layer names) live only in the frame, on the
  observer side of the blanket — never on the agent path.
  """

  alias SP.{Body, Interface}
  alias SP.Interface.Audit
  alias SP.World
  alias SP.World.{Field, Region}

  @doc """
  Build a frame for the just-completed tick.

  `decision_body` is the body that produced `signals`/`obs` (pre-development), so
  organ-provenance and gating are judged against the morphology that actually
  sensed and acted.
  """
  @spec frame(SP.Sim.t(), [SP.Core.Signal.t()], %{integer() => float()}, [struct()], Body.t()) :: map()
  def frame(sim, signals, obs, directives, decision_body) do
    cm = sim.channel_map

    %{
      tick: sim.tick,
      world: world_snapshot(sim.world),
      body: body_snapshot(sim.body),
      genome: genome_snapshot(sim.genome),
      afferent: %{
        signals: Enum.map(signals, &signal_map/1),
        observation: obs,
        derivation: derivation(cm, obs),
        decision_organs: Body.organs(decision_body)
      },
      efferent: %{
        directives: Enum.map(directives, &directive_map/1),
        decoded: Enum.map(directives, &decode_outcome(cm, decision_body, &1))
      },
      blanket: %{
        audit: audit_label(obs),
        scan_leaks: Audit.scan(obs),
        channels_explained: channels_explained?(cm, obs, decision_body),
        context_redacted: sim.faithful?
      }
    }
  end

  @doc "Map a sensor `source` string (e.g. \"sensor:plume\") to its organ atom, or nil."
  @spec source_organ(String.t()) :: atom() | nil
  def source_organ("sensor:" <> organ) do
    Enum.find(Body.sense_kinds(), fn k -> Atom.to_string(k) == organ end)
  end

  def source_organ(_), do: nil

  @doc "Are all present observation channels explainable by an organ the body has?"
  @spec channels_explained?(Interface.ChannelMap.t(), %{integer() => float()}, Body.t()) :: boolean()
  def channels_explained?(cm, obs, body) do
    organs = Body.organs(body)

    Enum.all?(Map.keys(obs), fn ch ->
      case Interface.reveal_channel(cm, ch) do
        {source, _key} -> source_organ(source) in organs
        _ -> false
      end
    end)
  end

  # --- afferent helpers --------------------------------------------------------

  defp derivation(cm, obs) do
    Enum.map(obs, fn {ch, value} ->
      {source, key} =
        case Interface.reveal_channel(cm, ch) do
          {s, k} -> {s, k}
          _ -> {nil, nil}
        end

      %{
        channel: ch,
        source: source,
        key: inspect_key(key),
        organ: source && source_organ(source),
        affine: affine_of(cm, ch),
        encoded: value
      }
    end)
    |> Enum.sort_by(& &1.channel)
  end

  defp affine_of(cm, ch) do
    case Map.get(cm.affine, ch) do
      {scale, offset} -> [scale, offset]
      _ -> [1.0, 0.0]
    end
  end

  defp inspect_key({:bands, i}), do: "bands.#{i}"
  defp inspect_key(k) when is_atom(k), do: Atom.to_string(k)
  defp inspect_key(k), do: inspect(k)

  defp signal_map(sig) do
    %{type: sig.type, source: sig.source, time: sig.time, data: sig.data}
  end

  defp audit_label(obs) do
    case Audit.audit_observation(obs) do
      :ok -> "ok"
      {:leak, findings} -> findings
    end
  end

  # --- efferent helpers --------------------------------------------------------

  defp directive_map(%SP.Core.Directive.Actuate{channel: ch, params: p}),
    do: %{kind: "actuate", channel: ch, params: p}

  defp directive_map(other), do: %{kind: "other", value: inspect(other)}

  defp decode_outcome(cm, body, %SP.Core.Directive.Actuate{channel: ch} = d) do
    case Interface.decode_action(cm, d) do
      {:ok, action, params} ->
        gated = Body.can_do?(body, action)
        %{channel: ch, action: action, params: params, decoded: true, gated: gated, applied: gated}

      {:error, reason} ->
        %{channel: ch, decoded: false, error: inspect(reason)}
    end
  end

  defp decode_outcome(_cm, _body, other),
    do: %{decoded: false, error: "non-actuate", value: inspect(other)}

  # --- god-view snapshots ------------------------------------------------------

  @doc "A lean, render-ready snapshot of the whole world (no rng, no internal state)."
  @spec world_snapshot(World.t()) :: map()
  def world_snapshot(world) do
    %{
      seed: world.seed,
      tick: world.tick,
      root: world.root,
      region_count: World.region_count(world),
      seam_threshold: World.seam_threshold(),
      adjacency: edges(world.adjacency),
      seams: edges(world.seams),
      regions: world.regions |> Map.keys() |> Enum.sort() |> Enum.map(&region_snapshot(world.regions[&1]))
    }
  end

  defp edges(set), do: set |> MapSet.to_list() |> Enum.map(&Tuple.to_list/1) |> Enum.sort()

  defp region_snapshot(%Region{} = r) do
    %{
      id: r.id,
      w: r.w,
      h: r.h,
      law: Map.from_struct(r.law),
      seam_readiness: round3(r.seam_readiness),
      seam_ready: r.seam_readiness >= World.seam_threshold(),
      layers: %{
        nutrient: grid(r.nutrient),
        temperature: grid(r.temperature),
        solvent: grid(r.solvent),
        toxin: grid(r.toxin),
        cavity: grid(r.cavity),
        strain: grid(r.strain),
        bands: for(b <- 0..(Region.band_count() - 1), do: grid(Map.fetch!(r.bands, b)))
      },
      materials: materials_snapshot(r.materials),
      conduits: r.conduits |> MapSet.to_list() |> Enum.map(&Tuple.to_list/1),
      infrastructure: infrastructure_snapshot(r.infrastructure),
      ecology: Enum.map(r.ecology, fn a -> %{cell: a.cell, kind: a.kind, energy: round3(a.energy)} end)
    }
  end

  defp grid(%Field{w: w, h: h} = f) do
    %{w: w, h: h, cells: for(i <- 0..(w * h - 1), do: round3(Field.get(f, i)))}
  end

  defp materials_snapshot(materials) do
    Map.new(materials, fn {cell, comp} ->
      {cell, Map.new(comp, fn {mat, amt} -> {Atom.to_string(mat), round3(amt)} end)}
    end)
  end

  defp infrastructure_snapshot(infra) do
    Map.new(infra, fn {cell, structures} ->
      {cell, Enum.map(structures, fn s -> %{kind: s.kind, integrity: round3(s.integrity)} end)}
    end)
  end

  @doc "A render-ready snapshot of the body/morphology (no rng)."
  @spec body_snapshot(Body.t()) :: map()
  def body_snapshot(body) do
    %{
      location: Tuple.to_list(body.location),
      energy: round3(body.energy),
      hydration: round3(body.hydration),
      temperature: round3(body.temperature),
      integrity: round3(body.integrity),
      growth_budget: round3(body.growth_budget),
      stage: body.stage,
      alive: body.alive,
      inventory: Map.new(body.inventory, fn {m, a} -> {Atom.to_string(m), round3(a)} end),
      organs: Body.organs(body),
      parts:
        body.parts
        |> Map.values()
        |> Enum.sort_by(& &1.id)
        |> Enum.map(fn p ->
          %{id: p.id, kind: p.kind, attached_to: p.attached_to, maturity: round3(p.maturity)}
        end)
    }
  end

  defp genome_snapshot(genome) do
    %{
      lineage: genome.lineage,
      growth_plan: genome.growth_plan,
      maturation_rate: round3(genome.maturation_rate),
      thrift: round3(genome.thrift),
      generation: genome.generation,
      parents: genome.parents
    }
  end

  defp round3(v) when is_float(v), do: Float.round(v, 3)
  defp round3(v), do: v
end
