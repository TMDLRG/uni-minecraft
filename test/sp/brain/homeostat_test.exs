defmodule SP.Brain.HomeostatTest do
  use ExUnit.Case, async: true
  alias SP.Brain.Homeostat

  describe "bin6 — 6-bin graded viability {0 critical..5 surplus}" do
    test "boundaries + clamp" do
      assert Homeostat.bin6(0.0) == 0
      assert Homeostat.bin6(-0.5) == 0
      assert Homeostat.bin6(0.01) == 0
      assert Homeostat.bin6(0.2) == 1
      assert Homeostat.bin6(0.4) == 2
      assert Homeostat.bin6(0.5) == 3
      assert Homeostat.bin6(0.7) == 4
      assert Homeostat.bin6(0.9) == 5
      assert Homeostat.bin6(1.0) == 5
    end

    test "the reserve C peak (bin 4 sated) maps to an INTERIOR store [0.667,0.833) (a held reserve, below full)" do
      assert Homeostat.bin6(0.667) == 4
      assert Homeostat.bin6(0.83) == 4
      assert Homeostat.bin6(0.834) == 5

      # so the reserve target (bin 4) sits strictly below full/surplus (bin 5 = [0.833,1.0]) — a buffer, not a hoard
    end
  end

  describe "step — CORE energy drain (upkeep on all actions + work on costly) with an EMPTY gut (no digestion)" do
    test "upkeep drains on every action incl :noop (no free hold)" do
      assert %{energy: e} = Homeostat.step(%Homeostat{energy: 1.0, gut: 0.0}, :noop, %{}, nil)
      assert_in_delta e, 0.96, 1.0e-9
    end

    test "costly actions debit extra work energy" do
      assert %{energy: e} = Homeostat.step(%Homeostat{energy: 1.0, gut: 0.0}, :mine, %{}, nil)
      assert_in_delta e, 0.92, 1.0e-9
    end

    test "dt scales the drain (wall-clock, cadence-independent); dt=nil is one abstract tick" do
      half = Homeostat.step(%Homeostat{energy: 1.0, gut: 0.0}, :noop, %{}, Homeostat.nominal_tick_sec() / 2)
      assert_in_delta half.energy, 1.0 - 0.02, 1.0e-9
    end

    test "clamps to [0,1] and dies when core energy OR soma empties" do
      dead = Homeostat.step(%Homeostat{energy: 0.02, gut: 0.0}, :noop, %{}, nil)
      assert dead.energy == 0.0
      assert Homeostat.dead?(dead)
      refute Homeostat.dead?(%Homeostat{energy: 0.01})
      assert Homeostat.dead?(%Homeostat{energy: 0.5, soma: 0.0})
    end
  end

  describe "step — energy (direct eat) / gut (satiety buffer) / dissociation (the per-subsystem depth)" do
    test ":eat (with food) refills energy directly AND fills the gut satiety buffer" do
      b = Homeostat.step(%Homeostat{energy: 0.5, gut: 0.5}, :eat, %{"inv" => %{"food" => 3}}, nil)
      # 0.86
      assert_in_delta b.energy, 0.5 - 0.04 + 0.4, 1.0e-9
      # 0.87
      assert_in_delta b.gut, 0.5 - 0.03 + 0.4, 1.0e-9
    end

    test ":eat needs food (inv.food>0), else no refill (both just drain)" do
      b = Homeostat.step(%Homeostat{energy: 0.5, gut: 0.5}, :eat, %{"inv" => %{"food" => 0}}, nil)
      assert_in_delta b.energy, 0.5 - 0.04, 1.0e-9
      assert_in_delta b.gut, 0.5 - 0.03, 1.0e-9
    end

    test "gut empties by slow passage (hunger returns), independent of energy's work drain" do
      b = Homeostat.step(%Homeostat{energy: 1.0, gut: 0.5}, :noop, %{}, nil)
      assert_in_delta b.gut, 0.5 - 0.03, 1.0e-9
    end

    test "DISSOCIATION: mining drains ENERGY (work) far more than the GUT (passage only) — they decouple" do
      b0 = %Homeostat{energy: 0.9, gut: 0.9}
      b1 = Homeostat.step(b0, :mine, %{}, nil)
      assert b0.energy - b1.energy > b0.gut - b1.gut, "energy should fall faster than gut under work"
    end
  end

  describe "step — soma (health integrity), honestly scoped" do
    test "a hurt event damages soma; it heals slowly otherwise" do
      hurt = Homeostat.step(%Homeostat{energy: 1.0, soma: 1.0}, :noop, %{"hurt" => true}, nil)
      assert_in_delta hurt.soma, 1.0 - 0.2 + 0.02, 1.0e-9
      heal = Homeostat.step(%Homeostat{energy: 1.0, soma: 0.5}, :noop, %{"hurt" => false}, nil)
      assert_in_delta heal.soma, 0.5 + 0.02, 1.0e-9
    end

    test "flat in a peaceful world (no hurt) — stays near full" do
      b =
        Enum.reduce(1..10, %Homeostat{energy: 1.0, soma: 1.0}, fn _, acc ->
          Homeostat.step(acc, :noop, %{}, nil)
        end)

      assert b.soma == 1.0
    end
  end

  describe "step — muscle fatigue (the arm gets tired), faster clock + Motor.pi coupling" do
    test "arm actions (mine/attack) SPEND freshness; other actions RECOVER it" do
      assert_in_delta Homeostat.step(%Homeostat{fatigue: 1.0}, :mine, %{}, nil).fatigue, 0.94, 1.0e-9
      assert_in_delta Homeostat.step(%Homeostat{fatigue: 1.0}, :attack, %{}, nil).fatigue, 0.94, 1.0e-9
      assert_in_delta Homeostat.step(%Homeostat{fatigue: 0.5}, :noop, %{}, nil).fatigue, 0.53, 1.0e-9
      assert_in_delta Homeostat.step(%Homeostat{fatigue: 0.5}, :forward, %{}, nil).fatigue, 0.53, 1.0e-9
    end

    test "fatigue runs a FASTER clock than energy (recovers more per wall-second than energy drains)" do
      dt = 8.0
      b = Homeostat.step(%Homeostat{energy: 1.0, gut: 0.0, fatigue: 0.5}, :noop, %{}, dt)
      # energy drained upkeep*8/8 = 0.04; fatigue recovered 0.03*8/3 = 0.08 — a distinct, faster timescale
      assert_in_delta b.energy, 1.0 - 0.04, 1.0e-9
      assert_in_delta b.fatigue, 0.5 + 0.03 * (8.0 / 3.0), 1.0e-9
    end

    test "motor_pi: fresh ⇒ full gain, spent ⇒ ~0.35 (weaker servo)" do
      assert_in_delta Homeostat.motor_pi(%Homeostat{fatigue: 1.0}), 1.0, 1.0e-9
      assert_in_delta Homeostat.motor_pi(%Homeostat{fatigue: 0.0}), 0.35, 1.0e-9
      assert_in_delta Homeostat.motor_pi(0.5), 0.675, 1.0e-9
    end

    test "fatigue does not cause death (only energy/soma do)" do
      refute Homeostat.dead?(%Homeostat{energy: 0.5, fatigue: 0.0})
    end

    test "a lower motor_pi (tired arm) weakens the servo response (smaller motor_delta) — the world consequence" do
      cfg = {0, 1, 2, 0, 0}
      ctrl = %{yaw: 0.5, pitch: 0.0, dist: 1.0}

      {_p, _c, fresh} =
        SP.Brain.MotorControl.step(SP.Brain.MotorControl.new(), 0, cfg, ctrl, Homeostat.motor_pi(1.0))

      {_p, _c, tired} =
        SP.Brain.MotorControl.step(SP.Brain.MotorControl.new(), 0, cfg, ctrl, Homeostat.motor_pi(0.0))

      assert abs(tired.motor_delta) < abs(fresh.motor_delta)
    end
  end

  describe "inject — graded felt observations (energy/gut/soma/fatigue)" do
    test "puts all four 6-bin viability signals the codec reads" do
      senses =
        Homeostat.inject(%{"health" => 20}, %Homeostat{energy: 0.75, gut: 0.2, soma: 1.0, fatigue: 0.1})

      assert senses["energy_reserve"] == 4
      assert senses["gut_satiety"] == 1
      assert senses["soma_integrity"] == 5
      assert senses["muscle_fatigue"] == 0
      assert senses["health"] == 20
    end
  end
end
