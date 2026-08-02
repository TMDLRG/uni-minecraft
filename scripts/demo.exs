# Live proof of the core guarantees. Usage: `mix run scripts/demo.exs`
alias SP.{Body, Genome, Interface, Sim, World}
alias SP.Body.{Development, Sensor}
alias SP.Interface.Audit
alias SP.World.{Law, Region}

bar = fn t -> IO.puts("\n══ " <> t <> " " <> String.duplicate("═", max(0, 56 - String.length(t)))) end

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
  g = Genome.repair(%Genome{lineage: "demo", growth_plan: ladder, maturation_rate: 0.5})

  %{Body.seed(seed: seed) | growth_budget: 300.0, energy: 1.0, location: {0, 3}}
  |> Development.develop_n(g, 300)
end

bar.("1. WHAT THE LEARNER ACTUALLY SEES (opaque observation)")
world = World.generate(7, regions: 1) |> World.step_n(20)
cm = Interface.channel_map(7)
obs = Interface.encode_observation(cm, Sensor.transduce(dev_body.(7), world, 20))
IO.puts("a learner-facing observation (first 8 of #{map_size(obs)} channels):")

obs
|> Enum.sort()
|> Enum.take(8)
|> Enum.each(fn {ch, v} -> IO.puts("   channel #{ch} => #{Float.round(v, 4)}") end)

IO.puts("→ keys are opaque integers, values are floats. No names, no coordinates, no materials.")

IO.puts(
  "→ structural audit: #{inspect(Audit.audit_observation(obs))}   token scan: #{inspect(Audit.scan(obs))}"
)

bar.("2. LEAKAGE AUDIT CATCHES A POISONED OBSERVATION")
string_obs = %{0 => "high"}
IO.puts("clean obs            -> #{inspect(Audit.audit_observation(%{0 => 0.5, 1 => 0.3}))}")
IO.puts("obs with :energy key -> #{inspect(Audit.audit_observation(%{0 => 0.5, :energy => 0.3}))}")
IO.puts("obs with a string    -> #{inspect(Audit.audit_observation(string_obs))}")

bar.("3. MORPHOLOGY GATES ACTIONS (no organ ⇒ no action)")
seed = Body.seed(seed: 7)
dev = dev_body.(7)

for action <- [:move, :excavate, :build_resonator, :open_seam] do
  IO.puts(
    "   #{String.pad_trailing(to_string(action), 16)} seed-body: #{Body.can_do?(seed, action)}   developed-body: #{Body.can_do?(dev, action)}"
  )
end

bar.("4. SENSES GATE HIDDEN LAYERS (no organ ⇒ layer is invisible)")
seed_obs = Interface.encode_observation(cm, Sensor.transduce(%{seed | location: {0, 3}}, world, 20))
IO.puts("seed body (interoception+chemotactile only): #{map_size(seed_obs)} channels visible")
IO.puts("fully-developed body (all senses):           #{map_size(obs)} channels visible")
types = fn b -> b |> Sensor.transduce(world, 20) |> Enum.map(& &1.type) |> Enum.sort() end
IO.puts("seed sensor types: #{inspect(types.(%{seed | location: {0, 3}}))}")
IO.puts("dev  sensor types: #{inspect(types.(dev))}")

bar.("5. DETERMINISM (same seed ⇒ identical trace; different ⇒ differs)")
e1 = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 120) |> Sim.run()
e2 = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 120) |> Sim.run()
e3 = Sim.new(seed: 999, agent: SP.Baselines.MorphologySeeking, max_ticks: 120) |> Sim.run()
IO.puts("seed 314 vs 314 traces identical: #{Sim.points(e1) == Sim.points(e2)}")
IO.puts("seed 314 vs 999 traces identical: #{Sim.points(e1) == Sim.points(e3)}")

bar.("6. OPEN-ENDED EXPANSION (seam ⇒ new region with a MUTATED law regime)")
w = World.generate(2024, regions: 1)

r =
  Enum.reduce(0..3, World.region(w, 0), fn c, r ->
    Region.add_structure(r, c, %Region.Structure{kind: :resonator})
  end)

w = World.put_region(w, r) |> World.step_n(80)
{:ok, w2, nid} = World.open_seam(w, 0)
IO.puts("before: #{World.region_count(w)} region(s).  after opening seam: #{World.region_count(w2)} regions.")

IO.puts(
  "new region #{nid} law-vector distance from parent: #{Float.round(Law.distance(World.region(w, 0).law, World.region(w2, nid).law), 3)} (>0 ⇒ genuinely new physics)"
)

bar.("7. CONSERVATION (transport preserves total material mass exactly)")
reg = World.region(World.generate(31, regions: 1), 0)
{:ok, reg2, _} = SP.World.Actions.transport(reg, 0, 1, 0.4)

IO.puts(
  "|total_material(after) - total_material(before)| = #{abs(Region.total_material(reg2) - Region.total_material(reg))}"
)

IO.puts("\nDEMO COMPLETE — every line above was computed live by the engine.")
