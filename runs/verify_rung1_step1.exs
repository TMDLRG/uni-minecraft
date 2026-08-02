# Rung-1 STEP 1 offline check: :homeostat organ + graded 6-state energy_reserve + interior-peak :reserve C.
# Byte-identity of default/0 is covered by the test suite; this checks the new lineage builds correctly.
alias SP.Brain.{Genome, MC, Curriculum}
IO.puts("== RUNG-1 STEP 1 CHECK ==")
ok = fn l, c -> IO.puts("[#{if c, do: "PASS", else: "FAIL"}] #{l}"); c end

rc = Curriculum.drive_c(:reserve, 6)
argmax_bin = rc |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
r1 = ok.("drive_c(:reserve,6) interior-peak (argmax at INTERIOR bin 4 'sated', surplus<sated)",
  rc == [-8.0, -3.0, -1.0, 1.0, 2.5, 2.0] and argmax_bin == 4)
IO.puts("     reserve C = #{inspect(rc)}")

g = Genome.homeostat_l1_phase0()
organs = Genome.active_organs(g)
mods = Genome.active_modalities(g) |> Enum.map(& &1.name)
r2 = ok.(":homeostat present, :metabolism absent, strategist dropped",
  :homeostat in organs and :metabolism not in organs and :strategist not in organs)
r3 = ok.(":energy_reserve factor present", :energy_reserve in mods)

b = MC.new(seed: 7, dna: g)
mi = Enum.find_index(Genome.active_modalities(g), &(&1.name == :energy_reserve))
er = Enum.at(b.model.subs, mi)
erc = hd(er.c)
r4 = ok.("energy_reserve is 6-state carrying the reserve C", length(erc) == 6 and erc == rc)
r5 = ok.("pure-L1 (l2 nil), phase-0 pinned", is_nil(b.l2) and g.phase == 0 and g.max_phase == 0)
IO.puts("     modalities=#{inspect(mods)}")

all = [r1, r2, r3, r4, r5]
IO.puts("== #{Enum.count(all, & &1)}/#{length(all)} PASS ==")
if not Enum.all?(all), do: (IO.puts("STEP 1: RED"); System.halt(1)), else: IO.puts("STEP 1: GREEN")
