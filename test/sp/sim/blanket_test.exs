defmodule SP.Sim.BlanketTest do
  @moduledoc """
  Tests for the observer/recorder/verifier (Phase A): the per-tick Markov-blanket
  capture and the INDEPENDENT, falsifiable re-derivation of the no-leak verdict.
  """
  use ExUnit.Case, async: true

  alias SP.Sim
  alias SP.Sim.{Recorder, Verifier}

  defp record_run(opts \\ []) do
    [seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 60, record_blanket?: true]
    |> Keyword.merge(opts)
    |> Sim.new()
    |> Sim.run()
  end

  test "recording captures one frame per tick and is faithful to what the agent saw" do
    defmodule EchoAgent do
      @behaviour SP.Agent
      def init(_), do: %{seen: []}
      def decide(obs, st, _ctx), do: {[], %{st | seen: [obs | st.seen]}}
    end

    sim = record_run(agent: EchoAgent, max_ticks: 20)
    frames = Sim.frames(sim)
    seen = Enum.reverse(sim.agent_state.seen)

    assert length(frames) == sim.tick
    # Each frame's recorded afferent observation equals the obs the agent received.
    for {frame, obs} <- Enum.zip(frames, seen) do
      assert frame.afferent.observation == obs
    end
  end

  test "recording does not perturb determinism (points/summary identical ON vs OFF)" do
    off = Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 120) |> Sim.run()

    on =
      Sim.new(seed: 314, agent: SP.Baselines.MorphologySeeking, max_ticks: 120, record_blanket?: true)
      |> Sim.run()

    assert Sim.points(off) == Sim.points(on)
    assert Sim.summary(off) == Sim.summary(on)
  end

  test "verifier accepts an honest run (in-memory)" do
    rep = record_run() |> Verifier.check_sim()
    assert rep.ok
    assert rep.frames == 46 or rep.frames > 0
    assert rep.violations == []
  end

  test "verifier accepts an honest run re-derived independently from the JSONL log" do
    sim = record_run()
    dir = Path.join(System.tmp_dir!(), "sp_blanket_#{System.unique_integer([:positive])}")
    base = Path.join(dir, "run")
    {:ok, %{log: log}} = Recorder.write(sim, base)

    on_exit(fn -> File.rm_rf!(dir) end)
    rep = Verifier.check_log(log)
    assert rep.ok, "from-disk verification failed: #{inspect(rep.violations)}"
  end

  test "every observed channel is explained by an organ the morphology had" do
    sim = record_run()

    for frame <- Sim.frames(sim) do
      assert frame.blanket.channels_explained
    end
  end

  test "scramble on/off both verify cleanly" do
    for scramble <- [true, false] do
      rep = record_run(scramble: scramble) |> Verifier.check_sim()
      assert rep.ok, "scramble=#{scramble} failed verification"
    end
  end

  describe "NEGATIVE — the verifier actually bites" do
    setup do
      sim = record_run(max_ticks: 30)
      frame = sim |> Sim.frames() |> Enum.find(&(map_size(&1.afferent.observation) > 3))
      {:ok, sim: sim, frame: frame, cm: sim.channel_map}
    end

    test "tampered observation value fails encode-equivalence", %{frame: frame, cm: cm} do
      {ch, v} = frame.afferent.observation |> Enum.at(0)
      bad = put_in(frame.afferent.observation, Map.put(frame.afferent.observation, ch, v + 1.0))
      assert {:violation, reasons} = Verifier.check_frame(bad, cm)
      assert :encode_equivalence in reasons
    end

    test "an atom observation key fails the structural check", %{frame: frame, cm: cm} do
      bad = put_in(frame.afferent.observation, Map.put(frame.afferent.observation, :energy, 0.5))
      assert {:violation, reasons} = Verifier.check_frame(bad, cm)
      assert {:structural, :failed} in reasons
    end

    test "a channel whose organ is absent fails morphology provenance", %{frame: frame, cm: cm} do
      # Channel 999 does not exist in the map; provenance + encode-equivalence flag it.
      bad = put_in(frame.afferent.observation, Map.put(frame.afferent.observation, 999, 1.0))
      assert {:violation, reasons} = Verifier.check_frame(bad, cm)
      assert :morphology_provenance in reasons
    end

    test "dropping a recorded signal breaks encode-equivalence", %{frame: frame, cm: cm} do
      bad = put_in(frame.afferent.signals, tl(frame.afferent.signals))
      assert {:violation, reasons} = Verifier.check_frame(bad, cm)
      assert :encode_equivalence in reasons
    end
  end

  describe "faithful mode" do
    test "context omits the channel map; obs is the sole world-derived input" do
      defmodule CtxProbe do
        @behaviour SP.Agent
        def init(_), do: %{saw_cm: false}
        def decide(_obs, st, ctx), do: {[], %{st | saw_cm: Map.has_key?(ctx, :channel_map)}}
      end

      sim = Sim.new(seed: 1, agent: CtxProbe, max_ticks: 5, faithful?: true) |> Sim.run()
      refute sim.agent_state.saw_cm
    end

    test "blind baselines run under faithful mode; frames record the redaction" do
      sim = record_run(agent: SP.Baselines.Random, faithful?: true, max_ticks: 20)
      assert sim.halted in [:dead, :max_ticks]
      assert Enum.all?(Sim.frames(sim), & &1.blanket.context_redacted)
    end

    test "default (non-faithful) keeps the channel map for scripted baselines" do
      sim = record_run(agent: SP.Baselines.Homeostatic, max_ticks: 20)
      assert Enum.all?(Sim.frames(sim), &(&1.blanket.context_redacted == false))
    end
  end
end
