defmodule SP.Brain.BridgeTest do
  use ExUnit.Case, async: false
  alias SP.Brain.{Bridge, MC, Genome}

  describe "the line protocol (the blanket: only σ in / α out)" do
    test "parse_sense decodes a sense line into the codec's expected shape" do
      s = Bridge.parse_sense("18;7;2;0;1;water;5.5;true")
      assert s["health"] == 18
      assert s["food"] == 7
      assert s["inv"] == %{"wood" => 2, "tools" => 0, "food" => 1}
      assert s["look"] == "water"
      assert s["hostile_dist"] == 5.5
      assert s["hurt"] == true
    end

    test "process_line maps a sense line to a valid primitive action and learns" do
      brain = MC.new(seed: 1)
      {action, brain2} = Bridge.process_line(brain, "20;18;0;0;0;oak_log;;false")
      assert action in Enum.map(Genome.actions(), &Atom.to_string/1)
      assert %MC{} = brain2
    end

    test "malformed input never crashes — it still yields a valid action" do
      {action, _} = Bridge.process_line(MC.new(seed: 1), "totally bogus line")
      assert action in Enum.map(Genome.actions(), &Atom.to_string/1)
    end
  end

  describe "live lockstep over a real Port (test double, no Minecraft)" do
    test "5 senses in ⇄ 5 actions out, in strict lockstep" do
      mock = Path.join(File.cwd!(), "viewer/mock_body.js")
      assert File.exists?(mock)

      {:ok, _pid} = Bridge.start_link(seed: 1, body_script: mock, report_to: self())

      # 30s, not the previous 5s. This budget covers an OS-level `node` process spawn plus 5 real
      # lockstep Port round trips, and it was measured failing under the full suite on 2026-07-18
      # ("no matching message after 5000ms. The process mailbox is empty.") — a saturated box can
      # take seconds just to spawn the interpreter. This is a wall-clock allowance on process
      # startup, NOT a loosened assertion: the test still requires exactly {:bridge_done, 5}, i.e.
      # 5 senses in ⇄ 5 actions out in strict lockstep. It stays well under the 60s per-test
      # timeout so a genuinely wedged Port still fails the test rather than hanging the suite.
      assert_receive {:bridge_done, 5}, 30_000
    end
  end
end
