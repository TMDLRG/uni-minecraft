# Is the surface/bedrock fix actually COMPILED INTO THE RUNNING NODE (not just committed on disk)?
# Replicates surface_preference_test T2/T5 against the live colony's loaded code.
node = :"uni@Thinker"
Node.connect(node)
brain = :rpc.call(node, SP.Brain.MC, :new, [])
cfg = Map.get(brain, :l2_config)
default = :rpc.call(node, SP.Brain.Genome, :default, [])
mods = :rpc.call(node, SP.Brain.Genome, :active_modalities, [default])
idx = fn name -> mods |> Enum.with_index() |> Enum.find_value(fn {m, i} -> if Map.get(m, :name) == name, do: i end) end
li = idx.(:light); si = idx.(:sky)
fl = cfg[:forage][li]; fs = cfg[:forage][si]; bl = cfg[:build][li]
IO.puts("light_idx=#{inspect li}  sky_idx=#{inspect si}")
IO.puts("forage[light] C = #{inspect fl}")
IO.puts("forage[sky]   C = #{inspect fs}")
IO.puts("build[light]  C = #{inspect bl}  (should be neutral)")
IO.puts("FIX_LIVE=#{fl == [-2.0, 0.0, 1.5] and fs == [-2.0, 0.0, 1.5] and bl == [0.0, 0.0, 0.0]}")
