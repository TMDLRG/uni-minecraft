# Phase-2 limit-cycle / allostasis DERIVATION (B4 + G4) — self-contained, NO engine import.
# Reduced pragmatic homeostat: the energy factor only (A = identity self-sensing ⇒ qo = qs), N bins,
# setpoint-peaked C, column-stochastic B per action (mirrors the engine's column-major B + deterministic
# mean-field belief update qs' = B[a]·qs). The planner is exhaustive over action sequences to depth D and
# acts the first action of the best (max Σ qo·C + work-bonus) sequence — the pragmatic reduction of
# Plan.action_values(depth, beam). B2=Both ⇒ even :noop drains (internal upkeep): NO free hold at setpoint.
# Sweeps work_bonus to locate the regime where (1) the level LIMIT-CYCLES around the setpoint AND work is
# genuinely used (real depletion pressure) AND (2) depth-5 forages at a HIGHER energy than depth-1 (allostasis).
# Run: elixir runs/phase2_homeostat_demo.exs

n = 6                                       # bins 0..5
setpoint = 3                                # 'ok'
c = [-8.0, -4.0, -1.0, 3.0, 1.0, 0.0]       # peaked at ok (bin 3), flat toward full (bin 5)

clamp = fn x -> x |> max(0) |> min(n - 1) end
# column-stochastic B for a drift of k bins: col_j = 0.7 at clamp(j+k), 0.3 at clamp(j+k - sign(k)).
build = fn k ->
  s = if k > 0, do: 1, else: -1
  for j <- 0..(n - 1) do
    t1 = clamp.(j + k)
    t2 = clamp.(j + k - s)
    base = List.duplicate(0.0, n)
    base |> List.update_at(t1, &(&1 + 0.7)) |> List.update_at(t2, &(&1 + 0.3))
  end
end
upkeep = build.(-1)   # :noop  (internal upkeep only)
work_b = build.(-2)   # :work  (upkeep + work cost)
forage = build.(+2)   # :forage (refill)

dot = fn a, b -> Enum.zip(a, b) |> Enum.reduce(0.0, fn {x, y}, s -> s + x * y end) end
bmul = fn cols, qs ->
  Enum.zip(cols, qs)
  |> Enum.reduce(List.duplicate(0.0, n), fn {col, p}, acc ->
    Enum.zip(acc, col) |> Enum.map(fn {a, x} -> a + p * x end)
  end)
end
elevel = fn qs -> Enum.with_index(qs) |> Enum.reduce(0.0, fn {p, i}, s -> s + p * i end) end

run_demo = fn wb ->
  actions = [{:forage, forage, 0.0}, {:work, work_b, wb}, {:noop, upkeep, 0.0}]
  bfor = fn name -> Enum.find(actions, fn {x, _, _} -> x == name end) end
  seq_value = fn seq, qs0 ->
    {v, _} =
      Enum.reduce(seq, {0.0, qs0}, fn {_n, b, bonus}, {acc, qs} ->
        qs1 = bmul.(b, qs); {acc + dot.(qs1, c) + bonus, qs1}
      end)
    v
  end
  seqs = fn d -> Enum.reduce(1..d, [[]], fn _, acc -> for s <- acc, a <- actions, do: s ++ [a] end) end
  decide = fn qs, d ->
    seqs.(d) |> Enum.map(fn s -> {hd(s) |> elem(0), seq_value.(s, qs)} end)
    |> Enum.max_by(fn {_a, v} -> v end) |> elem(0)
  end
  loop = fn d, ticks ->
    qs0 = (for i <- 0..(n - 1), do: if(i == n - 1, do: 1.0, else: 0.0))
    Enum.reduce(1..ticks, {[], [], qs0}, fn _, {ts, as, qs} ->
      a = decide.(qs, d); {_x, b, _} = bfor.(a); qs1 = bmul.(b, qs)
      {ts ++ [Float.round(elevel.(qs1), 2)], as ++ [a], qs1}
    end)
  end
  osc = fn traj ->
    t = Enum.drop(traj, 8)
    diffs = Enum.zip(t, tl(t)) |> Enum.map(fn {a, b} -> b - a end) |> Enum.reject(&(&1 == 0.0))
    rev = Enum.zip(diffs, tl(diffs)) |> Enum.count(fn {a, b} -> a * b < 0.0 end)
    {Float.round(Enum.min(t), 1), Float.round(Enum.max(t), 1), rev}
  end
  trig = fn d ->
    (n - 1)..0//-1
    |> Enum.filter(fn bin ->
      qs = (for i <- 0..(n - 1), do: if(i == bin, do: 1.0, else: 0.0))
      decide.(qs, d) == :forage
    end)
    |> Enum.max(fn -> -1 end)
  end
  {traj5, acts5, _} = loop.(5, 30)
  {lo, hi, rev} = osc.(traj5)
  used = acts5 |> Enum.uniq() |> Enum.map(&Atom.to_string/1) |> Enum.join(",")
  IO.puts("wb=#{wb}: depth5 range=[#{lo},#{hi}] reversals=#{rev} actions_used={#{used}}  forage_trigger d1=bin#{trig.(1)} d5=bin#{trig.(5)}  #{if trig.(5) > trig.(1), do: "← ALLOSTASIS (d5>d1)", else: ""}")
  {traj5, acts5}
end

IO.puts("== Phase-2 reduced homeostat (#{n} bins) C=#{inspect(c)} setpoint=ok(bin#{setpoint}) ==\n")
for wb <- [3.0, 4.0, 5.0, 6.0, 7.0], do: run_demo.(wb)

IO.puts("\n== detail at the allostasis regime ==")
{traj, acts} = run_demo.(5.0)
IO.puts("depth-5 E[bin]: #{inspect(Enum.take(traj, 20))}")
IO.puts("depth-5 acts  : #{inspect(Enum.take(acts, 20) |> Enum.map(&(Atom.to_string(&1) |> String.first())))}")
