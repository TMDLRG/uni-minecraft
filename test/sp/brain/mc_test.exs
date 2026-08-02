defmodule SP.Brain.MCTest do
  use ExUnit.Case, async: true
  alias SP.Brain.{MC, MCCodec, Genome}

  describe "MCCodec — sense discretisation matches the curriculum's outcome semantics" do
    test "status: dying / injured / hungry / safe" do
      assert MCCodec.status_index(3, 18) == 0
      assert MCCodec.status_index(10, 18) == 1
      assert MCCodec.status_index(18, 5) == 2
      assert MCCodec.status_index(20, 18) == 3
    end

    test "inventory: empty / wood / tools / food" do
      assert MCCodec.inventory_index(%{}) == 0
      assert MCCodec.inventory_index(%{"wood" => 3}) == 1
      assert MCCodec.inventory_index(%{"tools" => 1}) == 2
      assert MCCodec.inventory_index(%{"food" => 2}) == 3
    end

    # --- has_food OBSERVABILITY under a held tool (mc_codec.ex:118) -----------------------
    #
    # The four assertions above test each inventory key IN ISOLATION, so they are all green
    # against a `cond` whose FIRST clause is `tools > 0 -> 2`. The COMBINATION is never
    # tested, and the combination is where the defect lives: an agent holding any tool
    # observes outcome 2 FOREVER, and `has_food` (3) becomes unobservable to it.
    #
    # WHY THIS IS FE-RELEVANT, not cosmetic (docs/receipts/emergent_forage_cure1.md §2):
    #   step 4  "a world-earned kill (body.js collectDrops) lets Dirichlet B learn attack->has_food"
    #   step 5  "thereafter the forage has_food C selects the hunt pragmatically"
    # Both steps require the agent to OBSERVE outcome 3 after an :attack. If a tool masks it,
    # B[:attack] can never accumulate mass on has_food and the forage/graduation gates are
    # unpassable for any tool-holding lineage — and the failure is SILENT: it presents as
    # "the drive didn't work", not "the outcome was unobservable".
    #
    # The masking is REACHABLE, not hypothetical: viewer/body.js:125 counts any
    # `_(pickaxe|axe|sword|shovel|hoe)$` item as a tool, so a UNI that crafts the very
    # wooden sword/axe a hunting lineage wants permanently blinds its own has_food channel.
    #
    # NOT the cause of the 2026-07-19 nursery RED's flat pb[atk->food], and the reason is
    # sharper than "that run had tools=0". MEASURED 2026-07-19 (scratch probe, 400-tick soak):
    # the :inventory modality declares NO init_a (genome.ex:51), so Designer.compile gives it a
    # UNIFORM likelihood (designer.ex:82). Math.row_log over a uniform A returns a CONSTANT
    # vector, which the softmax in Infer.infer_states annihilates (infer.ex:24). On
    # default/0, homeostat_colony_forage/1 and nursery/2 the inventory observation therefore has
    # EXACTLY ZERO effect on q_inv: max |q(obs=2) - q(obs=3)| = 0.0, and q_inv is still exactly
    # [0.25,0.25,0.25,0.25] after 400 ticks with learn_a: true. That non-identifiability is the
    # documented cause of the flat pb (gate row `nursery-fenced-red-stocked`; receipt
    # docs/receipts/nursery_fenced_red_2026-07-19.md section 6b) -- it is a DIFFERENT defect on
    # the same channel, not this one. Still do not conflate them.
    #
    # WHICH MEANS THE MASKING BELOW IS LATENT, NOT DEAD -- and this is the load-bearing point:
    # it is inert today only because the channel is broken in a LARGER way upstream. Set
    # init_a: :diagonal on :inventory (what consummation_honest already does, genome.ex:455) and
    # the channel becomes informative -- measured q_inv [0.268, 0.175, 0.175, 0.383] -- at which
    # point this cond starts confidently reporting has_tools to a UNI that is carrying food.
    # Fixing identifiability ALONE upgrades this channel from "carries nothing" to "carries
    # something false". The two defects must be sequenced deliberately, not fixed one at a time
    # in whichever order they were found.
    #
    # SKIPPED, not deleted, and not "fixed" in passing: the repair is a change to the
    # OBSERVATION SPACE (A / outcome cardinality), which is FE-adjacent and requires a
    # MERGED VERDICT via /lab-team-review before any code lands (CLAUDE.md, ship gate).
    # Un-skip this test in the SAME change that lands the verdict's chosen repair.
    # Same convention + rationale as test/sp/brain/output_side_leak_audit_test.exs.
    @tag :skip
    test "inventory: has_food stays observable while holding a tool (SKIPPED pending MERGED VERDICT)" do
      # a fed hunter that has also crafted a tool must still be able to SEE its food
      assert MCCodec.inventory_index(%{"tools" => 1, "food" => 2}) == 3
      assert MCCodec.inventory_index(%{"tools" => 1, "food" => 2, "wood" => 3}) == 3
    end

    # ALWAYS RUNS — so a green suite can never be read as "no masking". Asserts nothing about
    # WHICH index is correct (that is the verdict's call, and asserting the current value here
    # would lock the defect in as intended behaviour); it only makes the masking LOUD.
    test "TRIPWIRE: report whether a held tool masks has_food (soft check for now)" do
      observed = MCCodec.inventory_index(%{"tools" => 1, "food" => 2})

      unless observed == 3 do
        IO.warn("""
        has_food MASKED: inventory_index(%{"tools" => 1, "food" => 2}) == #{observed}, not 3.
        A tool-holding UNI cannot observe has_food, so B[:attack] can never learn
        attack->has_food (docs/receipts/emergent_forage_cure1.md §2 steps 4-5) and the
        forage/graduation gates are unpassable for that lineage.
        Repair is an observation-space change (mc_codec.ex:118) — queued to /lab-team-review
        for a MERGED VERDICT. Do NOT edit the cond without one.
        """)
      end
    end

    test "vision: void / open / tree / water / hazard / enclosed" do
      assert MCCodec.vision_index(nil) == 0
      assert MCCodec.vision_index("air") == 1
      assert MCCodec.vision_index("oak_log") == 2
      assert MCCodec.vision_index("water") == 3
      assert MCCodec.vision_index("lava") == 4
      assert MCCodec.vision_index("stone") == 5
    end

    test "threat: none / near / attacking" do
      assert MCCodec.threat_index(nil, false) == 0
      assert MCCodec.threat_index(20.0, false) == 0
      assert MCCodec.threat_index(3.0, false) == 1
      assert MCCodec.threat_index(nil, true) == 2
    end

    test "social: alone / kin / non-kin (already mode-filtered by the body), clamped" do
      assert MCCodec.outcome(:social, %{"social" => 0}) == 0
      assert MCCodec.outcome(:social, %{"social" => 1}) == 1
      assert MCCodec.outcome(:social, %{"social" => 2}) == 2
      assert MCCodec.outcome(:social, %{}) == 0
      assert MCCodec.outcome(:social, %{"social" => 99}) == 2
    end

    test "encode orders outcomes by the genome's active modalities; action maps by index" do
      dna = Genome.default()
      obs = MCCodec.encode(%{"health" => 20, "food" => 18, "look" => "oak_log"}, dna)
      # default develops [status, inventory, vision, threat, social, self, strategy] + RICH SIGHT
      # [light, sky, sight] — trailing [2],[2],[0] = day / open / no-tree defaults when absent.
      assert obs == [[3], [0], [2], [0], [0], [0], [4], [2], [2], [0], [0], [0]]
      assert MCCodec.action(0) == :forward
      assert MCCodec.action(5) == :noop
    end

    test "rich sight: light / sky / tree-direction discretise (with safe defaults)" do
      s = %{"light" => 0, "sky" => 0, "tree_dir" => 2}

      assert MCCodec.outcome(:light, s) == 0 and MCCodec.outcome(:sky, s) == 0 and
               MCCodec.outcome(:sight, s) == 2

      # absent ⇒ day / open-sky / no-tree (so a body that omits them degrades gracefully)
      assert MCCodec.outcome(:light, %{}) == 2 and MCCodec.outcome(:sky, %{}) == 2 and
               MCCodec.outcome(:sight, %{}) == 0

      # out-of-range bound to the modality's outcome count
      assert MCCodec.outcome(:sight, %{"tree_dir" => 9}) == 3
      assert MCCodec.action(6) == :jump
    end

    test "build readiness (Gen-2.6): nothing / can-place / can-craft, with the new motors mapped" do
      # 0 nothing-to-build · 1 can-place (placeable block) · 2 can-craft (logs/planks)
      assert MCCodec.outcome(:build, %{"build" => 0}) == 0
      assert MCCodec.outcome(:build, %{"build" => 1}) == 1
      assert MCCodec.outcome(:build, %{"build" => 2}) == 2
      # absent ⇒ nothing-to-build (a body that omits the channel degrades gracefully)
      assert MCCodec.outcome(:build, %{}) == 0
      # out-of-range bound to [0,2]
      assert MCCodec.outcome(:build, %{"build" => 9}) == 2
      # the BUILD motors: appended after :noop/:jump so existing indices are unchanged
      assert :place in Genome.actions() and :craft in Genome.actions()
      assert MCCodec.action(7) == :place
      assert MCCodec.action(8) == :craft
    end

    test "prey bearing + combat (Gen-2.7): nearest-animal direction discretises; :attack maps" do
      # 0 none · 1 ahead · 2 left · 3 right
      assert MCCodec.outcome(:prey, %{"prey" => 0}) == 0
      assert MCCodec.outcome(:prey, %{"prey" => 1}) == 1
      assert MCCodec.outcome(:prey, %{"prey" => 3}) == 3
      assert MCCodec.outcome(:prey, %{}) == 0
      # out-of-range bound to [0,3]
      assert MCCodec.outcome(:prey, %{"prey" => 9}) == 3
      # the COMBAT/HUNT motor: appended last so existing indices are unchanged
      assert :attack in Genome.actions()
      assert MCCodec.action(9) == :attack
    end

    test "an agent that senses prey + a threat still resolves to ONE valid action" do
      senses = %{"health" => 16, "food" => 5, "hostile_dist" => 3.0, "prey" => 1, "inv" => %{}}
      {action, _} = MC.step(MC.new(seed: 1), senses)
      assert action in Genome.actions()
    end

    test "situation_index covers all five strategic situations — none is dead" do
      assert MCCodec.situation_index(%{"hurt" => true}) == 1
      assert MCCodec.situation_index(%{"health" => 3}) == 2
      assert MCCodec.situation_index(%{"food" => 4}) == 2
      assert MCCodec.situation_index(%{"social" => 1}) == 3
      assert MCCodec.situation_index(%{"inv" => %{}}) == 4
      assert MCCodec.situation_index(%{"inv" => %{"wood" => 2}}) == 0
    end

    test "self: capable / strained / overloaded / seeking_help (from the body's own signals)" do
      assert MCCodec.self_index(20, 18, false, nil) == 0
      assert MCCodec.self_index(8, 18, false, nil) == 1
      assert MCCodec.self_index(20, 5, false, nil) == 1
      assert MCCodec.self_index(20, 18, true, nil) == 2
      assert MCCodec.self_index(20, 18, false, 2.0) == 2
      assert MCCodec.self_index(3, 18, false, nil) == 3
    end
  end

  describe "MC — the Minecraft brain loop" do
    @senses %{
      "health" => 20,
      "food" => 18,
      "inv" => %{},
      "look" => "oak_log",
      "hostile_dist" => nil,
      "hurt" => false
    }

    test "step returns a valid primitive action and updates beliefs" do
      {action, brain} = MC.step(MC.new(seed: 1), @senses)
      assert action in Genome.actions()

      beliefs = MC.beliefs(brain)
      assert length(beliefs) == 12
      for q <- beliefs, do: assert_in_delta(Enum.sum(q), 1.0, 1.0e-9)
    end

    test "an agent perceiving build-readiness (logs + craftable) still decides a valid action" do
      # logs in hand + can-craft signal: the :build factor is live; :place/:craft are now
      # in the repertoire, but the decision must still resolve to ONE valid primitive.
      senses = %{"health" => 20, "food" => 18, "inv" => %{"wood" => 3}, "look" => "grass_block", "build" => 2}
      {action, _brain} = MC.step(MC.new(seed: 1), senses)
      assert action in Genome.actions()
    end

    test "the model learns from experience (Dirichlet counts change)" do
      brain0 = MC.new(seed: 1)
      pa0 = Enum.map(brain0.model.subs, & &1.pa)

      brain = Enum.reduce(1..10, brain0, fn _i, b -> elem(MC.step(b, @senses), 1) end)
      pa = Enum.map(brain.model.subs, & &1.pa)

      refute pa == pa0
    end

    test "memory survives death: save/load round-trips the learned model" do
      brain = Enum.reduce(1..5, MC.new(seed: 1), fn _i, b -> elem(MC.step(b, @senses), 1) end)

      path = Path.join(System.tmp_dir!(), "uni_mem_#{System.unique_integer([:positive])}.bin")
      MC.save(brain, path)
      revived = MC.load(path, seed: 1)
      File.rm(path)

      assert revived.model == brain.model
    end

    test "loading a STALE memory file (older shape) starts fresh instead of crashing" do
      brain = MC.new(seed: 1)
      # simulate a pre-upgrade save: a model with a different factor count + a sub
      # missing the newer struct keys (as binary_to_term would yield).
      stale_sub = brain.model.subs |> hd() |> Map.from_struct() |> Map.drop([:struct_pressure, :struct_steps])
      stale_model = %{brain.model | subs: [struct(SP.Brain.Model, stale_sub)]}

      path = Path.join(System.tmp_dir!(), "uni_stale_#{System.unique_integer([:positive])}.bin")
      File.write!(path, :erlang.term_to_binary({brain.dna, stale_model}))
      revived = MC.load(path, seed: 1)
      File.rm(path)

      # reconciled to the CURRENT full-shape model (7 factors), and it can step
      assert length(revived.model.subs) == 12
      {action, _} = MC.step(revived, %{"health" => 20, "food" => 18})
      assert action in Genome.actions()
    end

    test "structure-GROWN memory survives respawn: a model whose state-space grew is KEPT, not reset" do
      brain = MC.new(seed: 1)
      [s0 | rest] = brain.model.subs
      # simulate within-life structure learning: factor 0 grew its hidden-state space by 2 states.
      grown = SP.Brain.Structure.expand_factor(s0, s0.ns + 2)
      grown_brain = %{brain | model: %{brain.model | subs: [grown | rest]}}

      path = Path.join(System.tmp_dir!(), "uni_grown_#{System.unique_integer([:positive])}.bin")
      MC.save(grown_brain, path)
      revived = MC.load(path, seed: 1)
      File.rm(path)

      # the GROWN hidden-state space is preserved (the old strict reconcile would reset it to base ns)
      assert hd(revived.model.subs).ns == s0.ns + 2
      assert length(revived.model.subs) == length(brain.model.subs)
      # and the revived brain is valid — it still steps to a real action
      {action, _} = MC.step(revived, %{"health" => 20, "food" => 18})
      assert action in Genome.actions()
    end
  end
end
