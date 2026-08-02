# Rung-1 offline DYNAMICS pre-check: does the graded body, driven by a RESERVE-FOLLOWING hand policy (a proxy
# for what the reserve-C brain should learn), SURVIVE + regulate + pace + dissociate — where the flat
# fixed-setpoint died? This validates the STRUCTURE (reserve target is achievable/survivable) before the live
# RED tests whether the BRAIN learns it. Hand-policy, so it proves the body, not the mind. Run: mix run this.
alias SP.Brain.Homeostat

ok = fn l, c -> IO.puts("[#{if c, do: "PASS", else: "FAIL"}] #{l}"); c end

# reserve-following policy (proxy for the reserve-C brain): eat when energy/gut slips BELOW the reserve band
# (bin 4 'sated'), rest before spent, work when fresh+fed. A saturable proxy would instead eat at bin<=4 (to full).
policy = fn b ->
  cond do
    Homeostat.bin6(b.energy) <= 3 -> :eat
    Homeostat.bin6(b.gut) <= 2 -> :eat
    Homeostat.bin6(b.fatigue) <= 2 -> :noop
    true -> :mine
  end
end

senses = %{"inv" => %{"food" => 9}, "hurt" => false}

{final, log} =
  Enum.reduce(1..800, {Homeostat.new(), []}, fn _t, {b, acc} ->
    a = policy.(b)
    b2 = Homeostat.step(b, a, senses, nil)
    {b2, [{a, b2} | acc]}
  end)

log = Enum.reverse(log)
post = Enum.drop(log, 100)  # drop warm-up
energies = Enum.map(post, fn {_a, b} -> b.energy end)
fats = Enum.map(post, fn {_a, b} -> b.fatigue end)
guts = Enum.map(post, fn {_a, b} -> b.gut end)
eats = Enum.count(post, fn {a, _b} -> a == :eat end)
mines = Enum.count(post, fn {a, _b} -> a == :mine end)
rests = Enum.count(post, fn {a, _b} -> a == :noop end)
mean = fn xs -> Enum.sum(xs) / length(xs) end
inband = fn xs, lo, hi -> Enum.count(xs, &(&1 >= lo and &1 <= hi)) / length(xs) end

IO.puts("\n== 800-tick reserve-policy roll ==")
IO.puts("survived=#{not Homeostat.dead?(final)}  eat=#{eats} mine=#{mines} rest=#{rests}")
IO.puts("energy mean=#{Float.round(mean.(energies), 3)}  fatigue mean=#{Float.round(mean.(fats), 3)}  gut mean=#{Float.round(mean.(guts), 3)}")
IO.puts("energy in interior reserve band [0.6,0.95] = #{Float.round(inband.(energies, 0.6, 0.95), 3)}")

# fatigue pacing: the arm cycles (spends on mine, recovers on rest) — variance > 0 (not pinned)
fat_var = mean.(Enum.map(fats, &:math.pow(&1 - mean.(fats), 2)))
# dissociation: at least one subsystem pair does NOT move in lockstep (proving distinct factors, not renamed bins)
corr = fn xs, ys ->
  mx = mean.(xs); my = mean.(ys)
  cov = mean.(Enum.zip(xs, ys) |> Enum.map(fn {a, b} -> (a - mx) * (b - my) end))
  sx = :math.sqrt(mean.(Enum.map(xs, &:math.pow(&1 - mx, 2))))
  sy = :math.sqrt(mean.(Enum.map(ys, &:math.pow(&1 - my, 2))))
  if sx * sy > 0, do: cov / (sx * sy), else: 0.0
end
r_eg = corr.(energies, guts)
r_ef = corr.(energies, fats)

IO.puts("")
r1 = ok.("SURVIVES the full roll (the flat fixed-setpoint died ~50% of live worlds)", not Homeostat.dead?(final))
r2 = ok.("holds an INTERIOR energy reserve (mean in [0.6,0.92] — a buffer, NOT pinned full like the saturable, NOT drained to the edge)", mean.(energies) >= 0.6 and mean.(energies) <= 0.92)
r3 = ok.("PACES work/rest (fatigue cycles: both mine>0 and rest>0, fatigue variance>0)", mines > 0 and rests > 0 and fat_var > 1.0e-4)
r4 = ok.("subsystems DISSOCIATE (>=1 pair not lockstep — energy↔fatigue is the cleanest: arm-only, rest-recovering)", min(abs(r_eg), abs(r_ef)) < 0.85)
IO.puts("     fatigue variance=#{Float.round(fat_var, 4)}  energy~gut corr=#{Float.round(r_eg, 3)}  energy~fatigue corr=#{Float.round(r_ef, 3)}")

all = [r1, r2, r3, r4]
IO.puts("\n== #{Enum.count(all, & &1)}/#{length(all)} ==  #{if Enum.all?(all), do: "STRUCTURE VIABLE", else: "STRUCTURE PROBLEM"}")
if not Enum.all?(all), do: System.halt(1)
