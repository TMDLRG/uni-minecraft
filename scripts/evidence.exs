# Capture validation evidence numbers for the reports in docs/reports/.
# Usage: `mix run scripts/evidence.exs`
alias SP.{Body, Eval, Genome, Interface, Sim, World}
alias SP.Body.{Development, Sensor}
alias SP.Interface.Audit
alias SP.World.{Actions, Region}

rule = String.duplicate("=", 70)
section = fn t -> IO.puts("\n" <> rule <> "\n" <> t <> "\n" <> rule) end
mean = fn l -> Float.round(Enum.sum(l) / length(l), 2) end

batch = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112]

ladder = [
  :manipulator,
  :excavator,
  :transporter,
  :constructor,
  :instrument_mount,
  :field_effector,
  :seam_engineer,
  :proprioception,
  :plume,
  :tomography,
  :spectral,
  :seam_coherence,
  :meta
]

dev_body = fn seed ->
  g = Genome.repair(%Genome{lineage: "t", growth_plan: ladder, maturation_rate: 0.4})
  Development.develop_n(%{Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0}, g, 400)
end

section.("REPRODUCIBILITY")
a = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run()
b = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run()
IO.puts("same-seed full-episode trace identical: #{Sim.points(a) == Sim.points(b)}")

IO.puts(
  "same-seed world step identical:        #{World.step_n(World.generate(7), 100) == World.step_n(World.generate(7), 100)}"
)

IO.puts(
  "different-seed traces differ:           #{Sim.points(a) != Sim.new(seed: 315, agent: SP.Baselines.MorphologySeeking, max_ticks: 250) |> Sim.run() |> Sim.points()}"
)

section.("INTERFACE LEAKAGE AUDIT")

leak_runs =
  for agent <- [
        SP.Baselines.Random,
        SP.Baselines.Homeostatic,
        SP.Baselines.ProbeFirst,
        SP.Baselines.MorphologySeeking,
        SP.Baselines.Infrastructure,
        SP.Baselines.LeakageProbe
      ] do
    sim = Sim.new(seed: 7, agent: agent, max_ticks: 200, debug?: true) |> Sim.run()
    {agent, sim}
  end

IO.puts("all baselines ran with debug? leak-trap ON, none raised: true")
adv = Enum.find_value(leak_runs, fn {a, s} -> if a == SP.Baselines.LeakageProbe, do: s end)

IO.puts(
  "leakage-probe baseline detected leaks:    #{adv.agent_state.leaks} (audited #{adv.agent_state.audited} observations)"
)

IO.puts("leakage-probe malformed actions rejected: #{adv.trace.decoded_failures}")

obs =
  Interface.encode_observation(
    Interface.channel_map(7),
    Sensor.transduce(
      dev_body.(7) |> Map.put(:location, {0, 3}),
      World.generate(7, regions: 1) |> World.step_n(20),
      20
    )
  )

IO.puts(
  "full encoded obs channels=#{map_size(obs)}/#{Interface.channel_count()} structurally_clean=#{Audit.audit_observation(obs) == :ok} token_scan_clean=#{Audit.scan(obs) == []}"
)

section.("SURVIVAL DIFFICULTY (reference batch, seed-developed bodies)")

for agent <- [
      SP.Baselines.Random,
      SP.Baselines.Homeostatic,
      SP.Baselines.ProbeFirst,
      SP.Baselines.MorphologySeeking,
      SP.Baselines.Infrastructure
    ] do
  surv = for s <- batch, do: Sim.new(seed: s, agent: agent, max_ticks: 400) |> Sim.run() |> Map.get(:tick)

  IO.puts(
    "#{String.pad_trailing(inspect(agent) |> String.replace("SP.Baselines.", ""), 18)} mean=#{mean.(surv)} min=#{Enum.min(surv)} max=#{Enum.max(surv)} horizon=#{Enum.count(surv, &(&1 >= 400))}/#{length(batch)}"
  )
end

section.("SENSORY ABLATION (same body, sense-using agent vs blind random)")

homeo =
  for s <- batch,
      do:
        Sim.new(seed: s, agent: SP.Baselines.Homeostatic, body: dev_body.(s), max_ticks: 400)
        |> Sim.run()
        |> Map.get(:tick)

rand =
  for s <- batch,
      do:
        Sim.new(seed: s, agent: SP.Baselines.Random, body: dev_body.(s), max_ticks: 400)
        |> Sim.run()
        |> Map.get(:tick)

IO.puts("Homeostatic (uses senses) mean survival: #{mean.(homeo)}")
IO.puts("Random      (ignores senses) mean survival: #{mean.(rand)}")
IO.puts("relative advantage: #{Float.round((mean.(homeo) / mean.(rand) - 1) * 100, 1)}%")

section.("HIDDEN-LAYER VISIBILITY (channels with vs without each deep sense)")

for omit <- [[:tomography], [:spectral], [:seam_coherence], [:meta]] do
  v = Eval.layer_visibility(7, omit)

  IO.puts(
    "omit #{String.pad_trailing(inspect(omit), 20)} with=#{v.with} without=#{v.without} delta=#{v.with - v.without}"
  )
end

section.("MORPHOLOGY ABLATION")

seed_struct =
  Sim.new(seed: 3, agent: SP.Baselines.Infrastructure, max_ticks: 400, dev_interval: 10_000_000)
  |> Sim.run()
  |> Eval.episode_metrics()

IO.puts(
  "never-develop body: stage=#{seed_struct.final_stage} structures=#{seed_struct.structures_built} expansions=#{seed_struct.expansions} (cannot build/excavate/expand)"
)

builders =
  for s <- 11..40 do
    Sim.new(seed: s, agent: SP.Baselines.Infrastructure, max_ticks: 800)
    |> Sim.run()
    |> Eval.episode_metrics()
  end

IO.puts(
  "developing Infrastructure (seeds 11..40): builders=#{Enum.count(builders, &(&1.structures_built > 0))}/30 total_structures=#{Enum.map(builders, & &1.structures_built) |> Enum.sum()} max_stage=#{Enum.map(builders, & &1.final_stage) |> Enum.max()}"
)

section.("OPEN-ENDEDNESS / SEAM EXPANSION")
# deterministic forced path proves the mechanism
w = World.generate(2024, regions: 1)

r =
  Enum.reduce(0..3, World.region(w, 0), fn c, r ->
    Region.add_structure(r, c, %Region.Structure{kind: :resonator})
  end)

w = World.put_region(w, r) |> World.step_n(80)
{:ok, w2, nid} = World.open_seam(w, 0)

IO.puts(
  "forced resonator path opens seam: new_region=#{nid} regime_distance=#{Float.round(SP.World.Law.distance(World.region(w, 0).law, World.region(w2, nid).law), 3)}"
)

exps = Enum.map(builders, & &1.expansions) |> Enum.sum()
IO.puts("stochastic expansions by Infrastructure over 30 seeds: #{exps} (hard, late-stage capability)")

section.("CONSERVATION / BOUNDEDNESS")
reg = World.region(World.generate(31, regions: 1), 0)
before = Region.total_material(reg)
{:ok, reg2, _} = Actions.transport(reg, 0, 1, 0.4)
IO.puts("transport material-mass delta: #{abs(Region.total_material(reg2) - before)} (must be ~0)")
world500 = World.generate(8675, regions: 3) |> World.step_n(500)

maxes =
  for {_id, rr} <- world500.regions, into: %{} do
    {rr.id,
     %{
       nut: rr.nutrient.cells |> Map.values() |> Enum.max(),
       tox: rr.toxin.cells |> Map.values() |> Enum.max()
     }}
  end

IO.puts("after 500 microsteps fields bounded (sample region maxima): #{inspect(maxes[0])}")
IO.puts("\nEVIDENCE CAPTURE COMPLETE")
