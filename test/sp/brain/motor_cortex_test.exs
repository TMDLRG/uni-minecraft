defmodule SP.Brain.MotorCortexTest do
  @moduledoc """
  gate.motor-cortex.absent-byte-identical (P1) — the proprioceptive sensing pipeline (body.js senseLine →
  Bridge.parse_sense → MCCodec.outcome → Genome :motor_cortex modalities) is ADDITIVE and gated behind the
  opt-in :motor_cortex organ (ABSENT from Genome.default/0). These are the plan's named offline assertions:

    assert_no_motor_modalities_when_absent      — a default genome develops none of the 5 motor modalities.
    assert_no_motor_factors_when_absent         — its expressed model has no motor factors (12 subs, unchanged).
    assert_root_atoms_still_live_when_absent     — the shared @actions (root atoms) are unchanged.
    assert_motor_cortex_absent_byte_identical    — a default-genome MC.step action-sequence AND posteriors are
                                                   IDENTICAL whether each σ line carries the motor suffix or
                                                   not (the extra parse keys + codec clauses are inert absent).
    assert_motor_primary_develops_motor_factors  — the opt-in lineage DOES develop the 5 factors + the codec
                                                   bins them (the positive control).
  """
  use ExUnit.Case, async: true

  alias SP.Brain.{MC, Bridge, MCCodec, Genome, MotorControl}

  @motor_names [:aim_state, :reach_state, :contact_state, :dig_state, :motion_state]

  # representative base σ lines (14-channel, no scene/motor suffix) exercising varied senses.
  @base_lines [
    "20;20;0;0;0;air;;false;0;2;2;0;0;0",
    "12;7;1;0;2;oak_log;5.0;true;1;1;2;1;1;0",
    "6;3;0;1;0;stone;3.0;false;2;0;0;3;2;3",
    "20;20;3;1;0;water;;false;0;2;1;2;0;0",
    "18;14;0;0;1;air;10.0;false;1;2;2;0;1;1"
  ]

  # the same base line with the motor suffix: scene placeholder (0) + aim;reach;contact;dig;motion.
  defp with_motor_suffix(line, {a, r, c, d, m}), do: line <> ";0;#{a};#{r};#{c};#{d};#{m}"

  defp posteriors(brain), do: Enum.map(brain.model.subs, & &1.qs)
  defp mad(a, b), do: Enum.zip_with(a, b, fn x, y -> abs(x - y) end) |> Enum.max()

  defp run(brain, lines) do
    Enum.reduce(lines, {brain, []}, fn line, {b, acts} ->
      {a, b2} = MC.step(b, Bridge.parse_sense(line))
      {b2, [a | acts]}
    end)
  end

  test "assert_no_motor_modalities_when_absent + assert_no_motor_factors_when_absent" do
    mods = Genome.active_modalities(Genome.default()) |> Enum.map(& &1.name)
    assert Enum.all?(@motor_names, &(&1 not in mods)), "default genome must develop NO motor modalities"
    assert length(mods) == 12, "default genome stays 12 modalities"
    assert length(MC.new(seed: 1).model.subs) == 12, "default expressed model stays 12 factors"
  end

  test "assert_root_atoms_still_live_when_absent" do
    assert Genome.actions() ==
             [:forward, :turn_left, :turn_right, :mine, :eat, :noop, :jump, :place, :craft, :attack]

    assert Genome.card(Genome.default()).actions == Genome.actions()
  end

  test "assert_motor_cortex_absent_byte_identical: the motor σ-suffix is inert for a default genome" do
    motor_vals = [{2, 1, 2, 3, 1}, {0, 0, 0, 0, 0}, {1, 1, 3, 2, 2}, {2, 0, 1, 0, 0}, {0, 1, 2, 3, 1}]
    suffixed = Enum.zip(@base_lines, motor_vals) |> Enum.map(fn {l, v} -> with_motor_suffix(l, v) end)

    {b_plain, acts_plain} = run(MC.new(seed: 7), @base_lines)
    {b_suffixed, acts_suffixed} = run(MC.new(seed: 7), suffixed)

    assert acts_plain == acts_suffixed, "the motor suffix must not change ANY default decision"

    Enum.zip(posteriors(b_plain), posteriors(b_suffixed))
    |> Enum.each(fn {p, q} -> assert mad(p, q) < 1.0e-12, "each default posterior must be byte-identical" end)
  end

  test "assert_motor_primary_develops_motor_factors (positive control: the opt-in lineage)" do
    mods = Genome.active_modalities(Genome.motor_primary()) |> Enum.map(& &1.name)
    assert Enum.all?(@motor_names, &(&1 in mods)), "motor_primary must develop all 5 motor modalities"
    assert length(MC.new(seed: 1, dna: Genome.motor_primary()).model.subs) == 17

    # the codec bins each motor channel under the motor_primary genome (positions 15-19 of the σ line).
    senses = Bridge.parse_sense("20;20;0;0;0;air;;false;0;2;2;0;0;0;0;2;1;2;3;1")
    enc = MCCodec.encode(senses, Genome.motor_primary())
    assert Enum.map(Enum.take(enc, -5), &hd/1) == [2, 1, 2, 3, 1], "the 5 motor outcomes bin correctly"
  end

  # ============================================================================
  # P2 — the motor child factors LEARN (A_motor/B_motor) + persist across lives.
  # The 5 proprioceptive modalities are real factors, so they learn via the generic
  # per-factor Dirichlet machinery (learn_a=true, learn_b=dna.learn_b) and persist
  # through MC.save/load (term_to_binary of {dna, model}). These prove that gate.
  # ============================================================================

  # THESE TWO P2 TESTS ARE THE SUITE'S SECOND- AND THIRD-MOST EXPENSIVE (42.9s and 40.6s measured
  # via `--trace` on an idle box, 2026-07-18). Their timeout budget is NOT set here — it comes from
  # the ONE global policy in `test/test_helper.exs` (300s). Read that file before changing anything
  # timing-related; it carries the measurements for the whole danger band.
  #
  # Recorded here because this is where the incident was found: this module was long reported as
  # "nondeterministically flaky under the full suite" — failing under a DIFFERENT test name each run
  # while always passing in isolation. That signature reads like cross-test interference, and it was
  # not. Every shared-state suspect was falsified: the save/load test below already writes a unique
  # `System.unique_integer` tmp path; this module never touches Colony/Lineage `runs/colony/*.bin`;
  # and there is no ETS, :persistent_term, named process, Process.put or :rand.seed anywhere in the
  # `MC.step` path (Bridge is used only as the pure `parse_sense/1`). It was always
  # `ExUnit.TimeoutError`, stack mid-`Plan.advance/3` — two tests at ~1.4x headroom against a 60s
  # default, under a 2x-oversubscribed suite. Whichever caught the worst contention lost.
  #
  # Both drive `motor_experience/0`: 106 live `MC.step` calls through the FULL depth-5 `Plan` search
  # over a 17-factor motor_primary model. That cost is irreducible and is what the tests are for —
  # it must not be trimmed to fit a budget.

  # motor factor indices in a motor_primary model: the 5 motor modalities are declared LAST,
  # so they occupy subs[12..16] (12 default factors + 5 motor).
  @motor_idx 12..16

  defp motor_line({a, r, c, d, m}),
    do: "20;20;0;0;0;air;;false;0;2;2;0;0;0;0;#{a};#{r};#{c};#{d};#{m}"

  # a varied proprioceptive trajectory (so qs moves ⇒ A and B accumulate counts off their
  # uninformative/identity start), then a constant tail so the final config posterior peaks.
  defp motor_experience do
    cycle = [
      {0, 0, 0, 0, 0},
      {1, 0, 3, 0, 1},
      {1, 1, 2, 1, 1},
      {2, 1, 2, 2, 1},
      {2, 1, 2, 3, 1},
      {1, 1, 3, 0, 2},
      {0, 0, 1, 0, 0},
      {2, 1, 2, 3, 2}
    ]

    body = for _ <- 1..12, t <- cycle, do: motor_line(t)
    tail = for _ <- 1..10, do: motor_line({2, 1, 2, 3, 1})
    body ++ tail
  end

  defp feed(brain, lines),
    do: Enum.reduce(lines, brain, fn line, b -> elem(MC.step(b, Bridge.parse_sense(line)), 1) end)

  # feed, tracking the MAX peakedness (Enum.max(qs) - 1/n) any motor factor reaches at any step. This is
  # the faithful "the posterior became informative" signal: the dynamic inverse-salience precision flattens
  # a channel once it is predictable, so the informative moment is right after a surprising config change,
  # not at the final tick.
  defp feed_track_peak(brain, lines) do
    Enum.reduce(lines, {brain, 0.0}, fn line, {b, peak} ->
      b2 = elem(MC.step(b, Bridge.parse_sense(line)), 1)

      step_peak =
        b2.model.subs
        |> Enum.slice(@motor_idx)
        |> Enum.map(fn s -> Enum.max(s.qs) - 1.0 / length(s.qs) end)
        |> Enum.max()

      {b2, max(peak, step_peak)}
    end)
  end

  defp max_abs_diff(a, b) do
    List.flatten(a)
    |> Enum.zip(List.flatten(b))
    |> Enum.map(fn {x, y} -> abs(x - y) end)
    |> Enum.max()
  end

  test "P2: the motor config factors learn A_motor + B_motor, and the config posterior becomes informative" do
    fresh = MC.new(seed: 11, dna: Genome.motor_primary())
    {learned, posterior_peak} = feed_track_peak(fresh, motor_experience())

    fresh_motor = Enum.slice(fresh.model.subs, @motor_idx)
    learned_motor = Enum.slice(learned.model.subs, @motor_idx)

    # A_motor: at least one motor factor's likelihood moved off the uniform start.
    a_moved = Enum.zip(fresh_motor, learned_motor) |> Enum.map(fn {f, l} -> max_abs_diff(f.a, l.a) end)
    assert Enum.max(a_moved) > 0.05, "A_motor must learn the proprioceptive likelihood (move off uniform)"

    # B_motor: at least one motor factor's transition moved off the identity start (muscle memory).
    b_moved = Enum.zip(fresh_motor, learned_motor) |> Enum.map(fn {f, l} -> max_abs_diff(f.b, l.b) end)
    assert Enum.max(b_moved) > 0.05, "B_motor must learn at least one off-identity transition"

    # the config posterior became informative (peaked well above uniform) at some point during experience —
    # the agent inferred its motor configuration with confidence, not stuck at the uniform prior.
    IO.puts("\n[P2] motor config posterior peak over life = #{Float.round(posterior_peak, 4)} (uniform ⇒ 0)")
    assert posterior_peak > 0.1, "a motor config posterior must become informative during experience"

    # the shared habit prior E also moved (the agent acquired action tendencies while embodied).
    refute learned.model.pe == fresh.model.pe, "the habit prior E must accumulate over a motor life"
  end

  test "P2: learned motor A/B persist across MC.save/load (muscle memory survives death)" do
    learned = feed(MC.new(seed: 13, dna: Genome.motor_primary()), motor_experience())

    path = Path.join(System.tmp_dir!(), "uni_motor_persist_#{System.unique_integer([:positive])}.bin")

    try do
      MC.save(learned, path)
      reloaded = MC.load(path, seed: 13)

      assert length(reloaded.model.subs) == 17, "the reloaded motor lineage keeps all 17 factors"

      Enum.zip(Enum.slice(learned.model.subs, @motor_idx), Enum.slice(reloaded.model.subs, @motor_idx))
      |> Enum.each(fn {orig, back} ->
        assert max_abs_diff(orig.a, back.a) < 1.0e-12, "A_motor must persist byte-identical"
        assert max_abs_diff(orig.b, back.b) < 1.0e-12, "B_motor must persist byte-identical"
      end)
    after
      File.rm(path)
    end
  end

  # ============================================================================
  # P3 — the mine_log OPTION is wired into the live MC.step: while active, the motor inner loop
  # emits FINE primitives toward the proprioceptive target and self-terminates on dig=broke. The
  # default genome never engages it (flat byte-identical path).
  # ============================================================================

  test "P3: an active mine_log option emits FINE primitives through MC.step and self-terminates on strike" do
    base = MC.new(seed: 3, dna: Genome.motor_primary())

    # mid-option, aim still off, crosshair on a log (contact=2): aim=0;reach=0;contact=2;dig=0;motion=0
    line = "20;20;0;0;0;oak_log;;false;0;2;2;1;0;0;0;0;0;2;0;0"
    active = %{base | motor: %{control: MotorControl.new(), ticks_left: 24}}
    {act, b2} = MC.step(active, Bridge.parse_sense(line))

    assert act in MotorControl.primitives(),
           "an active motor option must emit a fine primitive, not a root atom"

    refute is_nil(b2.motor), "the option stays active while the proprioceptive target is unmet"

    # a strike reafference (dig=broke, position 18) must terminate the option.
    done = "20;20;1;0;0;oak_log;;false;0;2;2;1;0;0;0;2;1;2;3;0"

    {_a3, b3} =
      MC.step(%{base | motor: %{control: MotorControl.new(), ticks_left: 24}}, Bridge.parse_sense(done))

    assert is_nil(b3.motor), "dig=broke must terminate the mine_log option"
  end

  test "P3: a default genome never engages the motor option (flat path, no motor field)" do
    {act, b2} = MC.step(MC.new(seed: 3), %{})
    assert act in Genome.actions(), "default emits only root atoms"
    assert is_nil(b2.motor), "default never builds a motor option"
  end
end
