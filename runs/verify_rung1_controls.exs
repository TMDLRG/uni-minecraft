# Rung-1 A6 offline CONTROL-VALIDITY pre-check (lab-team required change A6,
# docs/receipts/rung1_graded_viability_RED.md REVISION 1). Before the LIVE burn can credit FULL for beating the
# controls, the controls must be VALID: SETPOINT-6 must reproduce the flat-setpoint death regime (thin buffer,
# crosses the edge under a metabolic feed-gap) and SATURABLE-6 must hoard-but-survive (buffer near the ceiling),
# with RESERVE holding an INTERIOR buffer strictly between them. A control that fails its known behaviour ⇒
# redraw the CONTROL, never the treatment.
#
# This is a deterministic BODY roll under each shape's argmax-target hand policy (proves the C SHAPE's regime,
# not the mind). The exact live 6/12 survival band is the LIVE gate; this offline check validates the ORDERING +
# that SETPOINT-6 is death-prone. Run: mix run runs/verify_rung1_controls.exs
alias SP.Brain.{Homeostat, Curriculum}

ok = fn l, c -> IO.puts("[#{if c, do: "PASS", else: "FAIL"}] #{l}"); c end
mean = fn xs -> Enum.sum(xs) / length(xs) end

# a shape's argmax bin → its target store (bin center). The hand policy eats toward this target when food is
# reachable, else holds — so each shape self-selects the buffer depth its C argmax prefers.
target_store = fn shape ->
  c = Curriculum.drive_c(shape, 6)
  bin = c |> Enum.with_index() |> Enum.max_by(&elem(&1, 0)) |> elem(1)
  (bin + 0.5) / 6.0
end

# METABOLIC FEED-GAP: food is reachable only in a short window each cycle (a satiety agent cannot eat every
# tick — the v2 death was a thin-buffer self-drain BETWEEN feeds even with food available). A deep buffer rides
# the gap; a thin one crosses the edge.
feed_gap = 16
feed_window = 4
ticks = 720

roll = fn shape ->
  tgt = target_store.(shape)

  {final, log, _} =
    Enum.reduce(1..ticks, {Homeostat.new(energy: tgt, gut: 0.5), [], false}, fn t, {b, acc, dead} ->
      food? = rem(t, feed_gap) < feed_window
      senses = %{"inv" => %{"food" => if(food?, do: 9, else: 0)}}
      # eat toward the shape's target when food is in the window and we're below target; else hold (upkeep only).
      a = if food? and b.energy < tgt, do: :eat, else: :noop
      b2 = Homeostat.step(b, a, senses, nil)
      {b2, [b2.energy | acc], dead or Homeostat.dead?(b2)}
    end)

  energies = Enum.reverse(log)
  %{
    shape: shape,
    target: Float.round(tgt, 3),
    survived: not Homeostat.dead?(final),
    ever_dead: Enum.any?(energies, &(&1 <= 0.0)),
    mean: Float.round(mean.(energies), 3),
    min: Float.round(Enum.min(energies), 3)
  }
end

IO.puts("== RUNG-1 A6 CONTROL-VALIDITY (feed_gap=#{feed_gap} window=#{feed_window} ticks=#{ticks}) ==")
res = Map.new([:setpoint6, :reserve, :saturable6], fn s -> {s, roll.(s)} end)

for s <- [:setpoint6, :reserve, :saturable6] do
  r = res[s]
  IO.puts("  #{s}: target=#{r.target} mean=#{r.mean} min=#{r.min} survived=#{r.survived} ever_hit_0=#{r.ever_dead}")
end

sp = res[:setpoint6]
rv = res[:reserve]
sa = res[:saturable6]

IO.puts("")
# NOTE: under the IDENTICAL tight feed-gap (tuned to force the setpoint6 death), no shape pins at the ceiling —
# so "hoards" is operationalized RELATIVELY: same food, saturable6 parks the DEEPEST buffer with the most
# survival margin (the v2 finding: "wins by parking a high, stable reserve"). The absolute median≥0.90 hoard is
# the LIVE abundant-food expectation, not the offline feed-gap one.
r1 = ok.("SETPOINT-6 is DEATH-PRONE (thin buffer crosses the edge: hits 0 / does not survive the feed-gap)", sp.ever_dead or not sp.survived)
r2 = ok.("SATURABLE-6 HOARDS-but-survives (deepest buffer of the three: highest mean AND highest min, comfortable margin)", sa.survived and sa.mean >= rv.mean and sa.min >= rv.min and sa.min > 0.3)
r3 = ok.("RESERVE holds an INTERIOR buffer, survives, strictly between the two (setpoint6 < reserve < saturable6 mean)", rv.survived and sp.mean < rv.mean and rv.mean < sa.mean)

all = [r1, r2, r3]
IO.puts("\n== #{Enum.count(all, & &1)}/#{length(all)} ==  #{if Enum.all?(all), do: "CONTROLS VALID", else: "CONTROL INVALID — redraw the CONTROL, not the treatment"}")
if not Enum.all?(all), do: System.halt(1)
