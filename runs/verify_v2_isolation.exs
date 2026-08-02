# v2 REGULATION-GATE ISOLATION — offline structural verification (pre-T0 invariant gate, blocking items 1-4,6).
# Proves the isolation lineage is strategist-free (no forage-C source), pure-L1 (l2=nil), pinned at phase 0
# (no auto-advance), and that the two arms differ ONLY in the energy/satiety C (single-variable). The satiety
# brake being L2-independent + no C-compounding + eat-selection are exercised by the live smoke (c_ok + eat).
# Run: mix run runs/verify_v2_isolation.exs

alias SP.Brain.{Genome, MC, Metabolism}

IO.puts("==== v2 ISOLATION OFFLINE VERIFICATION ====")
ok = fn label, cond -> IO.puts("[#{if cond, do: "PASS", else: "FAIL"}] #{label}"); cond end

gT = %{Genome.metabolism_l1_phase0() | drive_shape: :setpoint}
gC = %{Genome.metabolism_l1_phase0() | drive_shape: :saturable}

organsT = Genome.active_organs(gT)
modsT = Genome.active_modalities(gT) |> Enum.map(& &1.name)
r1 = ok.("strategist organ DROPPED (no forage-C source)", :strategist not in organsT)
r2 = ok.(":strategy factor absent", :strategy not in modsT)
r3 = ok.(":energy + :satiety factors present", :energy in modsT and :satiety in modsT)
r4 = ok.("phase=0 AND max_phase=0 (pinned)", gT.phase == 0 and gT.max_phase == 0)
IO.puts("     organs=#{inspect(organsT)}")
IO.puts("     modalities=#{inspect(modsT)}")

bT = MC.new(seed: 7, dna: gT)
bC = MC.new(seed: 7, dna: gC)
r5 = ok.("both arms pure-L1 (l2 == nil ⇒ no strategist modulate/forage-C)", is_nil(bT.l2) and is_nil(bC.l2))

mods = Genome.active_modalities(gT)
ei = Enum.find_index(mods, &(&1.name == :energy))
si = Enum.find_index(mods, &(&1.name == :satiety))

# single-variable: every factor identical EXCEPT the energy/satiety C
diffs =
  Enum.zip(bT.model.subs, bC.model.subs)
  |> Enum.with_index()
  |> Enum.flat_map(fn {{t, c}, i} ->
    non_c_same = Map.drop(t, [:c]) == Map.drop(c, [:c])
    c_same = t.c == c.c
    expected = if i in [ei, si], do: non_c_same and not c_same, else: non_c_same and c_same
    if expected, do: [], else: ["idx #{i} (#{Enum.at(mods, i).name}): non_c_same=#{non_c_same} c_same=#{c_same}"]
  end)
r6 = ok.("arms differ ONLY in energy/satiety C (single-variable)", diffs == [])
Enum.each(diffs, &IO.puts("     UNEXPECTED: #{&1}"))
IO.puts("     energy C  setpoint=#{inspect(Enum.at(bT.model.subs, ei).c)}")
IO.puts("     energy C saturable=#{inspect(Enum.at(bC.model.subs, ei).c)}")
IO.puts("     satiety C setpoint=#{inspect(Enum.at(bT.model.subs, si).c)}")
IO.puts("     satiety C saturable=#{inspect(Enum.at(bC.model.subs, si).c)}")

# brake path reachable on the L1 model (the relocated satiety_attenuate calls this; must not raise + returns a model)
attn = Metabolism.attenuate_model(bC.model, ei, si)
r7 = ok.("satiety brake (attenuate_model) reachable on the pure-L1 model", is_map(attn) and length(attn.subs) == length(bC.model.subs))

# phase-0 pin: maybe_advance_phase is private; the cap is enforced by the genome contract
# (min(Curriculum.max_phase(), max_phase) = 0 ⇒ the p<cap advance guard is p<0 ⇒ never advances).
r8 = ok.("phase cap contract: max_phase=0 forbids advance (p<0 false)", gT.max_phase == 0)

all = [r1, r2, r3, r4, r5, r6, r7, r8]
IO.puts("\n==== #{Enum.count(all, & &1)}/#{length(all)} PASS ====")
if Enum.all?(all), do: IO.puts("V2 ISOLATION GATE: GREEN"), else: (IO.puts("V2 ISOLATION GATE: RED"); System.halt(1))
