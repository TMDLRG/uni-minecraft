defmodule SP.Brain.Genome do
  @moduledoc """
  The agent's heritable specification (§13): a `%DNA{}` that **expresses** into a
  runnable `SP.Brain.Factors` model. The DNA does NOT encode world knowledge — it
  only sets morphology (which sensory/motor organs the body has), precisions, and
  hyperparameters. The contingency tensors `A/B` are seeded UNINFORMATIVE and
  learned from experience (no priors about the world).

  Mirrors `SP.Genome` (the existing morphology genome): an ordered `growth_plan`
  of organs with prerequisite structure, made developable by `repair/1`
  (prerequisite closure + topological order), and evolvable by `mutate/2` /
  `recombine/3` — so agents themselves can evolve, not just learn within a life.
  """

  alias SP.Brain.{Curriculum, Designer}
  alias SP.Determinism, as: Det

  # organ → prerequisites. interoception is the always-granted base sense.
  @prereqs %{
    interoception: [],
    metabolism: [:interoception],
    chemotaction: [],
    proprioception: [],
    vision: [],
    social_sense: [:interoception],
    camera_control: [:vision],
    locomotion: [:proprioception],
    strategist: [:interoception, :proprioception],
    # PIXEL SIGHT (vision-primary): the first-person visual cortex. Requires :vision (the body must
    # have eyes). NOT in the default plan, so default UNIs are unaffected — opt in via `vision_primary/0`.
    sight_cortex: [:vision],
    # MOTOR CORTEX (motor-inference, Gen-3): the proprioceptive/motor-configuration layer — the body
    # senses its OWN state (aim/reach/contact/dig/motion) and learns a motor generative model over it
    # (muscle memory). Requires :proprioception. NOT in the default plan ⇒ default UNIs are byte-identical;
    # opt in via `motor_primary/0`. (UNI-GPT-signed: "action as proprioceptive inference".)
    motor_cortex: [:proprioception],
    # HOMEOSTAT (Rung-1): graded per-subsystem viability + work/fatigue. Interoceptive base only.
    homeostat: [:interoception]
  }
  @organs Map.keys(@prereqs)

  # Hidden-state count of the learned scene factor — must match the UNI.OS visual cortex's
  # `n_states` (DiscretePatchMarkovWorld), so the percept (scene-state index) maps 1:1.
  @scene_states 12
  def scene_states, do: @scene_states

  # Each sensory organ unlocks one observation modality wired to one hidden factor.
  # Outcome/state sizes match SP.Brain.Curriculum's outcome semantics.
  @modalities [
    %{name: :status, organ: :interoception, no: 4, factor: :needs, ns: 4},
    %{name: :inventory, organ: :chemotaction, no: 4, factor: :inventory, ns: 4},
    %{name: :vision, organ: :vision, no: 6, factor: :localmap, ns: 6},
    %{name: :threat, organ: :proprioception, no: 3, factor: :danger, ns: 3},
    %{name: :social, organ: :social_sense, no: 3, factor: :others, ns: 3},
    # SELF-MODEL (U6): an interoceptive summary of "how am I doing", inferred from the
    # body's own signals — the seat of the EXPERIENCING self and the substrate over
    # which emotion (U9) is read out. Gated on the always-present base sense, so every
    # UNI models itself.
    %{name: :self, organ: :interoception, no: 4, factor: :self, ns: 4},
    # STRATEGY (Gen 2): makes the `:strategist` organ functional. A factor over the 5
    # strategic SITUATIONS {calm, threatened, depleted, social, idle} the L2 strategist
    # reasons about. Neutral C (preference lives at L2). Developing the organ now grows a
    # real L1 factor AND gates the live L2 loop (SP.Brain.MC).
    %{name: :strategy, organ: :strategist, no: 5, factor: :strategy, ns: 5},
    # --- RICH SIGHT (Gen-2.5): the UNI perceives its SURROUNDINGS, not just the one block it
    # faces — gated on the same :vision organ, so it develops with sight. ---
    # light: 0 dark · 1 dim · 2 day
    %{name: :light, organ: :vision, no: 3, factor: :light, ns: 3},
    # sky/shelter: 0 enclosed · 1 partial · 2 open  (lets the UNI sense — and seek — shelter)
    %{name: :sky, organ: :vision, no: 3, factor: :sky, ns: 3},
    # sight: bearing to the nearest tree — 0 none · 1 ahead · 2 left · 3 right (navigate to wood)
    %{name: :sight, organ: :vision, no: 4, factor: :sight, ns: 4},
    # build readiness (Gen-2.6): 0 nothing-to-build · 1 can-place (holds a placeable block) ·
    # 2 can-craft (holds a craftable like logs/planks) — so :place / :craft are EFE-informed.
    %{name: :build, organ: :vision, no: 3, factor: :build, ns: 3},
    # prey bearing (Gen-2.7): nearest animal (food on the hoof) relative to facing —
    # 0 none · 1 ahead · 2 left · 3 right. Makes :attack (hunt) and :eat EFE-informed: the agent
    # can learn to turn toward and strike prey when hungry. Gated on :vision (a visual bearing).
    %{name: :prey, organ: :vision, no: 4, factor: :prey, ns: 4},
    # PIXEL SIGHT (vision-primary, opt-in): the LEARNED scene-state from the UNI's first-person POV,
    # inferred by its pure-FEP visual cortex (UNI.OS DiscretePatchMarkovWorld) — the same input a
    # human player sees, compressed to a discrete scene the action-brain reasons over. Gated on the
    # :sight_cortex organ (absent from the default plan ⇒ default UNIs stay 12-factor); a
    # vision-primary genome develops this as a high-cardinality 13th factor (ns = n_states).
    %{name: :scene, organ: :sight_cortex, no: @scene_states, factor: :scene, ns: @scene_states},
    # --- MOTOR CORTEX (Gen-3, opt-in via :motor_cortex): the PROPRIOCEPTIVE configuration the body
    # senses about ITSELF. The hidden cause of these observations is the body's inferred motor
    # configuration (UNI-GPT round-2: "not just phase — distributed across configuration factors"), each a
    # learned factor (A_motor likelihood + B_motor transition-per-action = muscle memory). Absent from the
    # default plan ⇒ default UNIs stay 12-factor + byte-identical. ---
    # PROPRIOCEPTIVE likelihood (:init_a => :diagonal): the body senses its OWN configuration, so state k
    # a-priori tends to produce sensed outcome k (a weak near-identity A). This breaks the degenerate
    # uniform-A symmetry (no==ns single-modality factors are otherwise non-identifiable — qs stuck uniform),
    # making the motor configuration inferable; learning still refines it. Exteroceptive factors keep uniform A.
    # aim: angular error between look vector and the goal target — 0 off · 1 near · 2 on_target
    %{name: :aim_state, organ: :motor_cortex, no: 3, factor: :aim_state, ns: 3, init_a: :diagonal},
    # reach: is the goal block within dig reach — 0 out_of_reach · 1 in_reach
    %{name: :reach_state, organ: :motor_cortex, no: 2, factor: :reach_state, ns: 2, init_a: :diagonal},
    # contact: the material the crosshair points at — 0 air · 1 leaf · 2 log · 3 other
    %{name: :contact_state, organ: :motor_cortex, no: 4, factor: :contact_state, ns: 4, init_a: :diagonal},
    # dig: the digging reafference — 0 idle · 1 started · 2 progressing · 3 broke
    %{name: :dig_state, organ: :motor_cortex, no: 4, factor: :dig_state, ns: 4, init_a: :diagonal},
    # motion: own-body locomotion reafference — 0 still · 1 moving · 2 blocked
    %{name: :motion_state, organ: :motor_cortex, no: 3, factor: :motion_state, ns: 3, init_a: :diagonal},
    # --- METABOLISM (Phase 2, opt-in via :metabolism, prereq :interoception): interoceptive energy/satiety
    # STORES. `:b_init => :emptying` gives a NON-identity draining/refilling B (the one new generative object);
    # `:pb_seed` seeds it as a STRONG Dirichlet prior (refine-not-erase). `init_a: :diagonal` = self-sensing.
    # Absent from the default plan ⇒ default UNIs stay 12-factor + byte-identical. C is setpoint-peaked
    # (prefer 'ok'), see SP.Brain.Curriculum `@energy_setpoint`. docs/specs/metabolism.md. ---
    # energy: 0 empty · 1 low · 2 ok · 3 full  (internal metabolic store; drains on every non-:eat action)
    %{
      name: :energy,
      organ: :metabolism,
      no: 4,
      factor: :energy,
      ns: 4,
      init_a: :diagonal,
      b_init: :emptying,
      pb_seed: 50.0
    },
    # satiety: 0 starving · 1 hungry · 2 sated · 3 stuffed  (refilled by :eat)
    %{
      name: :satiety,
      organ: :metabolism,
      no: 4,
      factor: :satiety,
      ns: 4,
      init_a: :diagonal,
      b_init: :emptying,
      pb_seed: 50.0
    },
    # --- HOMEOSTAT (Rung-1, opt-in via :homeostat, prereq :interoception): GRADED per-subsystem viability, the
    # depth the single 4-bin metabolism scalar lacked. 6-state gradient {0 critical·1 depleted·2 tired·3 nominal·
    # 4 sated·5 surplus}. C is the interior-peak :reserve shape (surplus<sated ⇒ holds a reserve, never hoards).
    # Absent from default ⇒ byte-identical. docs/specs/rung1_graded_viability.md. (energy_reserve first; gut/soma/
    # fatigue land in later rung-1 steps.) ---
    %{
      name: :energy_reserve,
      organ: :homeostat,
      no: 6,
      factor: :energy_reserve,
      ns: 6,
      init_a: :diagonal,
      b_init: :emptying,
      pb_seed: 50.0
    },
    # gut_satiety: the gut/food buffer — :eat fills it, digestion empties it (transferring to energy). :emptying
    # B (eat→fill, else drain) matches. Dissociates from energy via the digestion LAG + not being work-drained.
    %{
      name: :gut_satiety,
      organ: :homeostat,
      no: 6,
      factor: :gut_satiety,
      ns: 6,
      init_a: :diagonal,
      b_init: :emptying,
      pb_seed: 50.0
    },
    # soma_integrity: health/tissue integrity — damaged by a hurt event, heals slowly. Mostly STABLE ⇒ identity
    # B prior (no b_init). Honestly scoped: flat in a peaceful world (validated only where health varies).
    %{name: :soma_integrity, organ: :homeostat, no: 6, factor: :soma_integrity, ns: 6, init_a: :diagonal},
    # muscle_fatigue: per-limb (arm) freshness — arm actions (mine/attack) SPEND it, rest RECOVERS it, on a
    # faster clock. Reserve C ⇒ the agent rests BEFORE spent (work-rest pacing). Identity B prior (learns the
    # arm-drain/rest-recover cycle; a two-signed :fatiguing prior is a noted refinement). Feeds Motor.pi (4b).
    %{name: :muscle_fatigue, organ: :homeostat, no: 6, factor: :muscle_fatigue, ns: 6, init_a: :diagonal}
  ]
  # Motor repertoire. `:jump` is a forward HOP (climb a 1-block step / get unstuck);
  # appended last so existing action indices (incl. :noop=5) are unchanged.
  # :place and :craft are the BUILD motors (Gen-2.6) — appended after :noop so @noop_index is
  # unchanged. mine destroys; place builds/shelters; craft turns logs→planks→sticks→tools.
  # :attack (Gen-2.7) is the COMBAT/HUNT motor — strike the nearest hostile (defend) or animal
  # (hunt for food). Appended last so existing action indices are unchanged.
  @actions [:forward, :turn_left, :turn_right, :mine, :eat, :noop, :jump, :place, :craft, :attack]

  # FROZEN-FACTOR REPAIR (§2). The COMMITTED domain string of the A₀ prior draw. It is
  # pre-registered so the covenant falsifier is checkable: a SECOND domain (…v2:) must give
  # materially the SAME per-factor behaviour, else the specific realisation is carrying
  # information and a prior has been smuggled in — which does not ship.
  @gauge_domain "uni.exterocept.gauge.v1:"
  def gauge_domain, do: @gauge_domain

  # The CONTESTED set: the twelve EXTEROCEPTIVE factors measured frozen by symmetry. Every one of
  # them ships no `:init_a` today, so gate-off leaves each untouched. The proprioceptive/interoceptive
  # modalities (motor_cortex, metabolism, homeostat) already carry `:diagonal` and are NOT listed —
  # they self-sense, so their symmetry was already broken by a signed decision. `:scene` is also NOT
  # listed: it is exteroceptive but its observation is a learned posterior from a separate cortex,
  # a different evidential object that this repair does not claim to have measured.
  @contested_exteroceptive [
    :status,
    :inventory,
    :vision,
    :threat,
    :social,
    :self,
    :strategy,
    :light,
    :sky,
    :sight,
    :build,
    :prey
  ]
  def contested_exteroceptive, do: @contested_exteroceptive

  @enforce_keys [:growth_plan]
  defstruct growth_plan: [],
            gamma: 8.0,
            lr: 1.0,
            learn_b: true,
            horizon: 1,
            phase: 0,
            # Gen-2 reasoning traits (heritable, evolvable). DECOUPLED from `horizon`:
            # `horizon` drives policy enumeration (kept at 1 for oracle parity), while
            # `plan_depth`/`plan_beam` drive the live deep-planning decider (SP.Brain.Plan).
            # Clamped to [1,6] at use; plan_depth==1 reproduces the gen-1 one-step agent. Default
            # lifted to 5: with the optimised planner a depth-5 step is ~370 ms (≈ the body cadence),
            # so agents reason 5 beats ahead while still acting ~1.5×/sec; evolution can climb to 6.
            plan_depth: 5,
            plan_beam: 3,
            # Heritable disposition to ACT: when false (default), choosing `noop` sets the
            # last action but does NOT strengthen the habit prior E — so idleness never
            # becomes a self-reinforcing rut and the agent stays inclined to move/explore.
            e_on_noop: false,
            # WS-B slow-context (heritable, OFF by default). When enabled, a slow scene parent
            # (SP.Brain.SlowContext) conditions every L1 factor each tick via an empirical prior.
            # `false` ⇒ no parent is built ⇒ byte-identical to the flat engine. `timescale` = the
            # diagonal of the parent transition B^G (mass that stays in the same scene per tick).
            slow_context_enabled: false,
            slow_context_timescale: 0.95,
            # WS-B v2: the DOWN coupling δ ∈ [0,1] (the contextual-prior blend weight). 0 ⇒ flat even when
            # enabled — the heritable knob that grades the slow scene context from off to fully-on.
            slow_context_coupling: 0.0,
            # NOVELTY (Gen-3 plateau cure, heritable). The weight on the parameter-information-gain EFE term
            # (SP.Brain.Novelty), per factor. 0.0 (default) ⇒ the term is gated off ⇒ byte-identical to the
            # flat engine (the slow_context_coupling precedent). >0 ⇒ a standing active-learning drive that
            # decays to 0 as the model's Dirichlet counts saturate (no reward).
            novelty_gain: 0.0,
            # METABOLISM regulation gate (RED ablation, heritable). The SHAPE of the energy/satiety
            # interoceptive C, emitted at EVERY curriculum phase (so it survives phase advance — closes the
            # set_phase C-restoration leak). :setpoint (default) ⇒ the non-saturable setpoint-peaked map
            # (byte-identical to the phase-baked @energy_setpoint); :saturable ⇒ a monotone "more-is-better"
            # foil (still eats, no setpoint peak); :off ⇒ zeroed (drive-severed sanity). Only affects a
            # :metabolism genome's energy/satiety factors ⇒ every other genome is byte-identical.
            drive_shape: :setpoint,
            # PER-FACTOR drive C (Rung-1 review Group B, docs/receipts/rung1_graded_viability_RED.md). A
            # name→shape map overriding the scalar `drive_shape` for INDIVIDUAL homeostat/metabolism factors
            # (soma monotone-to-full, fatigue its own rest-pull, or a single RED arm flipping ONLY
            # energy_reserve). Default `%{}` ⇒ every factor inherits `drive_shape` ⇒ byte-identical. Read only
            # in card/1's drive-C branch (a non-homeostat/metabolism genome never reaches it).
            drive_shape_by_factor: %{},
            # FATIGUE→MOTOR coupling gate (Rung-1 review Group D). true (default) ⇒ the :homeostat body's
            # fatigue-lowered motor_pi reaches the servo (a tired arm aims worse). false ⇒ the efferent limb is
            # pinned (motor_pi = 1.0) — the K3 ablation / fatigue-efferent severed twin. Read only on the
            # homeostatic step path ⇒ every non-homeostat genome is byte-identical.
            fatigue_motor_coupling: true,
            # SEVERED LIMBS (Rung-1 review Group E). A list of homeostat factors whose AFFERENT world→store
            # coupling is cut (a generative-PROCESS edit: the store still drains + emits felt obs + beliefs, but
            # stops reading its world channel). Default `[]` ⇒ no cut ⇒ byte-identical. The severed-limb
            # falsifier arms; runtime-only, so the compiled model (A/B/C/D/E) is byte-identical to the intact twin.
            severed_limbs: [],
            # PHASE CAP (heritable, opt-in). nil ⇒ no cap ⇒ default genome byte-identical (maybe_advance_phase
            # then uses Curriculum.max_phase()). An integer caps the curriculum climb at that phase — set to 0 for
            # the regulation-gate isolation lineage so a fed/healthy agent cannot auto-advance to phase 1 and
            # re-import the phase-1 wood/tree task-C (the confound). Only read by the phase-advance gate.
            max_phase: nil,
            # NURSERY (developmental scaffold, opt-in, RUNTIME-ONLY — never a compiled-model field). nil (default)
            # ⇒ pure-world physics ⇒ default + every deployed genome byte-identical. %{scale: s} (0 < s <= 1) makes
            # the live Homeostat drain CORE energy s× slower (a longer learning runway — the WOMB/WEAN period);
            # hunger, forage drive, refills, and the compiled A/B/C/D/E stay UNCHANGED. Read ONLY on the
            # homeostatic step path (via agent nursery_scale/1). Graduation = drop it (re-home under the forage
            # lineage) ⇒ the deployed agent survives by its OWN foraging in the pure world (no manna).
            nursery: nil,
            # HONEST CONSUMMATION (Cure-2, forage acquisition, opt-in). false (default) ⇒ NO couple ⇒ the compiled
            # model + depth-5 Plan path are BYTE-IDENTICAL to today for EVERY lineage. true ⇒ (a) the :eat column of
            # the energy_reserve/gut_satiety :emptying B is coupled to the inventory has_food belief in the plan
            # rollout — eat REFILLS only when food is (predicted) in hand, DRAINS like noop when empty (world-true,
            # homeostat.ex:94) — and (b) the inventory factor self-senses (diagonal A) so q_inv[has_food] is a real
            # signal. Removes the false "eat always refills" belief so the ONLY route to raise energy when hungry+
            # empty is acquire-food(hunt)→eat ⇒ hunting EMERGES via the existing novelty + has_food-C. Gated to the
            # forage-honest lineage; the live homeostat_colony/0 is untouched.
            consummation_honest: false,
            # FROZEN-FACTOR REPAIR (docs/whiteboard/DEFECTS-AND-REPAIRS.md §2, opt-in, heritable).
            # nil (default, and EVERY existing lineage) ⇒ no `:init_a` on any exteroceptive modality ⇒
            # `Map.take` yields the exact prior key-set ⇒ card/1 and express/1 are BYTE-IDENTICAL to today.
            # `:prior_draw` ⇒ each contested exteroceptive factor's A₀ column is DRAWN from its own
            # symmetric Dirichlet prior, `Â₀[:,s] ~ Dir(κ·1_{n_o})` with κ = 1 (the κ imposed by
            # `Model.add1`'s `+1`, and the unique κ with a closed form: Gamma(1,1) = Exp(1) ⇒
            # `x_o = −ln u_o`, `col = x/Σx`, branch-free, one uniform per cell).
            #
            # WHY. For the twelve exteroceptive factors A has identical columns, B is the identity and D
            # is uniform, so the whole parameter set is invariant under relabelling hidden states (S_ns),
            # and every update rule reads state-indexed VALUES, never a state INDEX — so the update map is
            # S_ns-equivariant. An equivariant map applied to an invariant point returns an invariant
            # point: q(s) is uniform FOREVER, the epistemic term is exactly 0, and every C-override is
            # behaviourally inert. Measured max|qᵢ−qⱼ| = 4.4e-16 / 3.0e-15 / 1.8e-15.
            #
            # The defect is choosing the prior's MEAN (1/n_o — the one point in the simplex every
            # permutation fixes) as the initial point estimate. It is NOT the prior, NOT the learning
            # rule, and NOT `ns == no`. `E[Â₀] = 1/n_o` EXACTLY, so `E[pA]` is unchanged: the prior is not
            # changed by one iota; only its realisation stops sitting on the symmetric point.
            #
            # OPERATOR GATE (genome.ex:5-9, docs/UNIVERSE.md:138-141 — the DNA encodes no world
            # knowledge): a draw from the UNCHANGED prior asserts nothing about the world, which is why
            # this is more conservative than the already-signed `:diagonal`. Enabling it for a SCORED
            # lineage is the operator's call, not an agent's.
            exteroceptive_a_init: nil

  @type t :: %__MODULE__{}

  def organs, do: @organs
  def actions, do: @actions
  def modalities, do: @modalities

  @doc "A fully-developed default genome (all senses + motor + strategist)."
  def default do
    repair(%__MODULE__{
      growth_plan: [
        :interoception,
        :chemotaction,
        :proprioception,
        :vision,
        :social_sense,
        :camera_control,
        :locomotion,
        :strategist
      ]
    })
  end

  @doc """
  A VISION-PRIMARY genome: the default UNI plus its first-person visual cortex (the `:scene`
  factor). Opt-in — develops the 13th factor whose observation is the learned scene-state from the
  UNI's POV pixels (UNI.OS). Default UNIs keep the 12-factor symbolic shape; this is the deliberate
  vision-primary form (its saved brains are a distinct lineage — a fresh, pixel-seeing colony).
  """
  def vision_primary do
    repair(%__MODULE__{
      growth_plan: [
        :interoception,
        :chemotaction,
        :proprioception,
        :vision,
        :social_sense,
        :camera_control,
        :locomotion,
        :strategist,
        :sight_cortex
      ]
    })
  end

  @doc """
  A MOTOR-PRIMARY genome (Gen-3, opt-in): the default UNI plus its `:motor_cortex` — the proprioceptive
  motor-configuration factors (aim/reach/contact/dig/motion) over which it learns a motor generative
  model ("muscle memory"). Develops 5 extra factors; default UNIs keep the 12-factor shape and are
  byte-identical. A distinct lineage (its saved brains never load into a default UNI).
  """
  def motor_primary do
    repair(%__MODULE__{
      growth_plan: [
        :interoception,
        :chemotaction,
        :proprioception,
        :vision,
        :social_sense,
        :camera_control,
        :locomotion,
        :strategist,
        :motor_cortex
      ]
    })
  end

  @doc """
  A CURIOSITY-PRIMARY genome (Gen-3 plateau cure, opt-in): the default UNI with the parameter-information-gain
  (novelty) EFE term turned on (`novelty_gain > 0`). Same 12-factor shape as default — the novelty term rides
  the existing factors' Dirichlet counts, so no new organ/factor — but a standing active-learning drive that
  pushes it off the epistemic-starvation plateau toward the unlearned build/craft chain (decays to 0 as counts
  saturate). The control is `default/0` (novelty_gain = 0.0).
  """
  def curiosity_primary(gain \\ 0.3) do
    %{default() | novelty_gain: gain}
  end

  @doc """
  A METABOLISM-PRIMARY genome (Phase-2 plateau cure, opt-in): the default UNI PLUS the `:metabolism` organ —
  interoceptive energy/satiety stores with a draining emptying-B and a setpoint-peaked C, i.e. a STANDING,
  non-saturable interoceptive drive (`docs/specs/metabolism.md`). 14-factor; the control is `default/0`
  (12-factor, organ absent ⇒ byte-identical over the depth-5 Plan path).
  """
  def metabolism_primary do
    d = default()
    %{d | growth_plan: d.growth_plan ++ [:metabolism]}
  end

  @doc """
  Strategist-free (pure-L1) metabolism lineage pinned to phase 0 — the v2 regulation-gate ISOLATION lineage
  (docs/receipts/metabolism_regulation_gate_v2.md). Drops the :strategist organ (so the standing :forage task-C
  never fires; mc.ex:64-65) AND caps the phase at 0 (so a fed agent cannot auto-advance and re-import the phase-1
  wood/tree curriculum C). The satiety-attenuation brake is applied L2-INDEPENDENTLY in the step path, so dropping
  the strategist does NOT strip the saturable foil's brake. Both regulation-gate arms share this genome and differ
  ONLY in :drive_shape (setpoint vs saturable). Nothing depends on :strategist (no organ lists it as a prereq), so
  the closure keeps it dropped.
  """
  def metabolism_l1_phase0 do
    d = default()
    plan = (d.growth_plan -- [:strategist]) ++ [:metabolism]
    repair(%{d | growth_plan: plan, phase: 0, max_phase: 0})
  end

  @doc """
  Rung-1 HOMEOSTAT lineage (docs/specs/rung1_graded_viability.md): the strategist-free, phase-0-pinned graded
  viability body — the default senses/motor plus the opt-in `:homeostat` organ (6-state graded viability
  factors) instead of `:metabolism`. drive_shape `:reserve` gives the interior-peak reserve-holding C. This is
  the treatment lineage for the rung-1 RED; the baseline/foil arms flip drive_shape (`:setpoint`/`:saturable`)
  at the same 6-state cardinality. gut/soma/fatigue factors + body stores land in later rung-1 steps.
  """
  def homeostat_l1_phase0 do
    d = default()
    # strategist dropped (no forage-C confound); :motor_cortex ADDED so the motor loop runs and the fatigue→
    # Motor.pi coupling (a tired arm aims worse) is a genuine world consequence. motor_config is name-indexed
    # (STEP 0) so :motor_cortex + :homeostat factors coexist safely.
    plan = (d.growth_plan -- [:strategist]) ++ [:motor_cortex, :homeostat]
    # Per-factor C (Rung-1 review Group A/B): energy_reserve + gut_satiety inherit the scalar :reserve
    # (interior-peak); soma_integrity is MONOTONE-to-full (never the reserve interior-peak, which would prefer
    # slightly-injured over full health); muscle_fatigue gets its OWN named rest-pull. The empty-map default on
    # every other lineage keeps them byte-identical.
    repair(%{
      d
      | growth_plan: plan,
        phase: 0,
        max_phase: 0,
        drive_shape: :reserve,
        drive_shape_by_factor: %{soma_integrity: :soma_monotone, muscle_fatigue: :fatigue_reserve}
    })
  end

  @doc """
  Rung-1 RED control/ablation/severed arms (lab-team SIGN-WITH-CHANGES, docs/receipts/rung1_graded_viability_RED.md
  REVISION 1). Each flips EXACTLY ONE coupling vs FULL (`homeostat_l1_phase0/0`) over {K1 = energy_reserve C shape,
  K2 = muscle_fatigue C, K3 = fatigue→Motor.pi}, so any survival/pacing delta is attributable to a single named
  surface (Lab-Protocol-I). SETPOINT-6 = the death-shape baseline (K1); SATURABLE-6 = the eat-to-full foil (K1);
  ABL-fatigue-C = flat fatigue C (K2); ABL-fatigue-pi = pinned Motor.pi (K3). Severed twins cut ONE factor's world
  limb (energy/gut/soma afferent; fatigue afferent via `severed_limbs`, fatigue efferent via `:muscle_fatigue_efferent`).
  """
  def homeostat_setpoint6, do: put_factor_shape(homeostat_l1_phase0(), :energy_reserve, :setpoint6)
  def homeostat_saturable6, do: put_factor_shape(homeostat_l1_phase0(), :energy_reserve, :saturable6)
  def homeostat_abl_fatigue_c, do: put_factor_shape(homeostat_l1_phase0(), :muscle_fatigue, :off)
  def homeostat_abl_fatigue_pi, do: %{homeostat_l1_phase0() | fatigue_motor_coupling: false}

  def homeostat_severed(:muscle_fatigue_efferent),
    do: %{homeostat_l1_phase0() | fatigue_motor_coupling: false}

  def homeostat_severed(limb) when limb in [:energy_reserve, :gut_satiety, :soma_integrity, :muscle_fatigue],
    do: %{homeostat_l1_phase0() | severed_limbs: [limb]}

  defp put_factor_shape(%__MODULE__{} = dna, factor, shape),
    do: %{dna | drive_shape_by_factor: Map.put(Map.get(dna, :drive_shape_by_factor, %{}), factor, shape)}

  @doc """
  LIVE deep-body colony lineage — the Rung-1 graded-viability body deployed as a LIVING streamed generation
  (owner-directed 2026-07-11). Distinct from `homeostat_l1_phase0/0` (the RED *isolation* lineage, which drops
  the strategist and pins phase 0): this keeps the FULL default UNI — every sense, locomotion, the strategist
  (L2 mind), and phase progression — and ADDS the deep body: the `:homeostat` organ (graded energy/gut/soma/
  fatigue viability) plus `:motor_cortex` so a tired arm actually aims worse. `drive_shape :reserve`
  (interior-peak, reserve-holding — the shape that survives where the flat setpoint died); soma routed
  monotone-to-full, fatigue its own rest-pull.

  Opt-in ⇒ `default/0` stays byte-identical. HONEST SCOPE (claim fence): offline-green (byte-identity +
  compiles + dynamics), **NOT RED-validated live**; the strategist(L2)×homeostat interaction ships unproven per
  the owner's explicit go-ahead. Every felt_* bin is a MODEL VARIABLE — never narrated as felt hunger/tiredness.
  """
  def homeostat_colony do
    d = default()
    plan = d.growth_plan ++ [:motor_cortex, :homeostat]

    repair(%{
      d
      | growth_plan: plan,
        drive_shape: :reserve,
        drive_shape_by_factor: %{soma_integrity: :soma_monotone, muscle_fatigue: :fatigue_reserve}
    })
  end

  @doc """
  FORAGING-DISCOVERY lineage (Cure 1, opt-in) — `homeostat_colony/0` with the parameter-information-gain
  (novelty) EFE term turned ON (`novelty_gain > 0`). A SEPARATE constructor (precedent: `curiosity_primary/0`
  vs `default/0`) so the LIVE streamed `homeostat_colony/0` stays byte-identical until this returns a RED
  verdict + owner go-ahead flips the lineage.

  Developmental reading (the ontogeny, owner-directed): the interoceptive reserve-C + the strong `pb_seed` (50)
  on energy_reserve/gut_satiety ARE the innate "cellular" nutrient hyper-prior — the organism predicts it will
  be fed to setpoint. The `B[:attack]→has_food` transition column is the digestive/consummatory organ: BUILT
  (present in the model) but DORMANT (its Dirichlet counts are flat = unlearned) at birth. Foraging is not
  scripted; it EMERGES: a hungry UNI routes interoceptive-depleted → :forage (mc_codec.ex situation_index),
  whose prey-orient C (mc.ex) makes facing/closing prey pragmatic; `:attack`'s under-sampled column makes
  transition-novelty W_b (plan.ex) worth TRYING; a world-earned kill (body.js collectDrops) lets Dirichlet B
  LEARN attack→has_food, after which the forage has_food C selects the hunt PRAGMATICALLY and the epistemic
  drive DECAYS to 0 as counts saturate (novelty.ex, C-independent — the no-smuggled-reward property).

  NOTE (math-honest, C4): W_b is a STANDING GLOBAL drive over EVERY under-sampled column — inventory/prey AND
  soma_integrity/muscle_fatigue (all pb_seed 1.0). It does NOT name :attack, prey, or food; the strong pb_seed
  (50) on energy_reserve/gut_satiety keeps THEIR novelty ≈0. It is not "concentrated on the strike".
  NOTE (math-honest, C9): the L2 is a CONTROL/preference hierarchy (situation observed up, C-override down), not
  a predictive-coding errors-up/predictions-down stack; the "hyper-prior" is a large-magnitude interoceptive C
  (γ_m = 1.0), not an elevated precision.

  Gating: `default/0` and `homeostat_colony/0` keep novelty_gain 0.0 ⇒ the value-gated `ng > 0.0` short-circuits
  (plan.ex) to the exact flat step ⇒ BYTE-IDENTICAL over the depth-5 Plan path.
  """
  def homeostat_colony_forage(gain \\ 0.3) when is_number(gain) and gain >= 0.0 do
    %{homeostat_colony() | novelty_gain: gain}
  end

  @doc """
  HONEST-CONSUMMATION forage lineage (Cure-2) — `homeostat_colony_forage/1` (novelty ON) with the honest-eat
  coupling turned on (`consummation_honest: true`). This is the single-variable TREATMENT lineage for the
  honest-consummation RED; its CONTROL is `homeostat_colony_forage/1` (couple OFF, novelty identical). The `has_food`
  preference is UNCHANGED and the nursery `metab_scale` is applied identically to both arms — the ONLY difference
  from the control is the couple. See docs/receipts/forage_honest_consummation_RED.md.
  """
  def homeostat_colony_forage_honest(gain \\ 0.3) when is_number(gain) and gain >= 0.0 do
    %{homeostat_colony_forage(gain) | consummation_honest: true}
  end

  @doc """
  NURSERY genome — `homeostat_colony_forage/1` (novelty ON) wrapped in a developmental scaffold. The compiled
  model (A/B/C/D/E) is IDENTICAL to the forage lineage — the nursery is RUNTIME-ONLY — the sole difference is
  `nursery: %{scale: s}`, which slows the live body's CORE-energy drain by `s×` so an altricial UNI has a longer
  runway to LEARN foraging before the pure-world drain kills it.

  This is the WOMB→WEAN arc of the ontogeny, done honest (NO manna, C3): the gentle metabolic runway is the
  protected developmental period during which the dormant digestive/consummatory organ becomes competent; prey
  density lives in the launcher (world config), never here; ZERO calorie gives. Graduation DROPS the scaffold —
  re-home the trained `.bin` under `homeostat_colony_forage/1` (pure world, natural prey, no gives) — which is a
  byte-identical no-op because training and deploy are the SAME lineage (C2).

  Gating: `nursery == nil` (default + every other genome) ⇒ metab_scale 1.0 ⇒ pure-world physics ⇒ byte-identical.
  """
  def nursery(gain \\ 0.3, scale \\ 0.5) when is_number(scale) and scale > 0.0 and scale <= 1.0 do
    %{homeostat_colony_forage(gain) | nursery: %{scale: scale}}
  end

  @doc """
  Express the DNA into a `SP.Brain.Factors` model. Only modalities whose gating
  organ is present develop; each becomes a factor with an UNINFORMATIVE likelihood
  (learned online), near-identity transitions (a "states persist" prior), uniform
  state prior, and preferences `C` set by the curriculum phase.
  """
  def express(%__MODULE__{} = dna), do: Designer.compile(card(dna))

  @doc """
  The Function-Card this DNA expresses — the declarative spec (modalities, actions,
  curriculum preferences, precisions) that `SP.Brain.Designer.compile/1` turns into a
  runnable model. Expression is now just `compile(card(dna))`, so the genome agent is
  one card among many.
  """
  def card(%__MODULE__{} = dna) do
    dna = repair(dna)
    mods = active_modalities(dna)

    # HONEST CONSUMMATION (Cure-2, gated). When on: (a) energy_reserve/gut_satiety carry a :couple to the inventory
    # factor's has_food state, and (b) the inventory factor self-senses (diagonal A) so q_inv[has_food] is a true
    # signal for the couple. Off (default + every other lineage) ⇒ no :init_a change, no :couple key ⇒ Map.take
    # yields the exact prior key-set ⇒ byte-identical.
    honest? = Map.get(dna, :consummation_honest, false)
    inv_i = honest? && Enum.find_index(mods, &(&1.name == :inventory))

    # FROZEN-FACTOR REPAIR (§2, gated). nil (default + EVERY existing lineage) ⇒ no branch taken ⇒ no
    # `:init_a` key ⇒ `Map.take` yields the exact prior key-set ⇒ byte-identical card. `:prior_draw` ⇒
    # each CONTESTED exteroceptive modality carries `{:prior_draw, name, domain}`, which the Designer
    # routes to a deterministically-seeded draw from the SAME symmetric Dirichlet prior it evaluates the
    # mean of today. Ordered AFTER the honest? branches so the already-signed honest-consummation
    # semantics wins where they overlap: with BOTH gates on, `:inventory` keeps its `:diagonal`
    # self-sensing A (the couple reads q_inv[has_food] and needs that channel identifiable), and every
    # other contested factor still gets its draw.
    prior_draw? = Map.get(dna, :exteroceptive_a_init, nil) == :prior_draw

    %{
      # carry :init_a when a modality declares it (proprioception ⇒ :diagonal). Map.take omits absent keys,
      # so default/exteroceptive modality cards are byte-unchanged (no :init_a ⇒ designer uses uniform A).
      modalities:
        Enum.map(mods, fn m ->
          m =
            cond do
              honest? and m.name == :inventory ->
                Map.put(m, :init_a, :diagonal)

              (honest? and inv_i) && m.name in [:energy_reserve, :gut_satiety] ->
                Map.put(m, :couple, %{parent_index: inv_i, parent_state: 3})

              prior_draw? and m.name in @contested_exteroceptive ->
                Map.put(m, :init_a, {:prior_draw, m.name, @gauge_domain})

              true ->
                m
            end

          Map.take(m, [:name, :no, :ns, :init_a, :b_init, :pb_seed, :learn_b, :couple])
        end),
      actions: @actions,
      # Energy/satiety C comes from the heritable :drive_shape (emitted at EVERY phase — genome-level, so a
      # phase advance cannot restore/overwrite an ablated shape). Every OTHER modality keeps the phase-indexed
      # curriculum C. drive_shape :setpoint returns exactly the phase-baked @energy_setpoint ⇒ byte-identical.
      preferences:
        Map.new(mods, fn m ->
          c =
            if m.name in [:energy, :satiety, :energy_reserve, :gut_satiety, :soma_integrity, :muscle_fatigue] do
              # PER-FACTOR C routing (Group B): a factor may override the scalar `drive_shape` via
              # `drive_shape_by_factor`; the empty-map default inherits `drive_shape` ⇒ byte-identical to the
              # pre-review single-shape dispatch (and the default genome never enters this branch at all).
              shape =
                Map.get(
                  Map.get(dna, :drive_shape_by_factor, %{}),
                  m.name,
                  Map.get(dna, :drive_shape, :setpoint)
                )

              Curriculum.drive_c(shape, m.no)
            else
              Curriculum.preference(dna.phase, m.name, m.no)
            end

          {m.name, c}
        end),
      precision: Map.new(mods, fn m -> {m.name, 1.0} end),
      learn: %{a: true, b: dna.learn_b},
      novelty_gain: Map.get(dna, :novelty_gain, 0.0),
      gamma: dna.gamma,
      horizon: dna.horizon
    }
  end

  @doc "List the modality specs that the DNA actually develops (for the codec)."
  def active_modalities(%__MODULE__{} = dna) do
    plan = repair(dna).growth_plan
    Enum.filter(@modalities, &(&1.organ in plan))
  end

  @doc "The organs the DNA actually develops (prerequisite-closed). Used to gate opt-in organ behaviour."
  def active_organs(%__MODULE__{} = dna), do: repair(dna).growth_plan

  # --- developability (mirrors SP.Genome.repair/1) ---------------------------

  @doc "Make a DNA developable: keep known organs, force the base sense, take the prerequisite closure, order by depth."
  def repair(%__MODULE__{} = dna) do
    plan =
      dna.growth_plan
      |> Enum.filter(&(&1 in @organs))
      |> Enum.uniq()
      |> ensure_base()
      |> closure()
      |> Enum.sort_by(&depth/1)

    %{dna | growth_plan: plan}
  end

  @doc "A DNA is valid if its plan is known, deduped, base-inclusive, and prerequisite-ordered."
  def valid?(%__MODULE__{} = dna) do
    plan = dna.growth_plan
    known? = Enum.all?(plan, &(&1 in @organs))
    unique? = length(plan) == length(Enum.uniq(plan))
    base? = :interoception in plan

    ordered? =
      plan
      |> Enum.with_index()
      |> Enum.all?(fn {organ, idx} ->
        Enum.all?(Map.get(@prereqs, organ, []), fn p ->
          case Enum.find_index(plan, &(&1 == p)) do
            nil -> false
            j -> j < idx
          end
        end)
      end)

    known? and unique? and base? and ordered?
  end

  # --- evolution (mirrors SP.Genome.mutate/recombine) ------------------------

  @doc "Point-mutate the organ plan + jitter precisions, then repair."
  def mutate(%__MODULE__{} = g, rng) do
    g = slow_defaults(g)
    {op, rng} = Det.choice(rng, [:insert, :delete, :swap, :noop])
    {plan, rng} = apply_op(op, g.growth_plan, rng)
    {dg, rng} = Det.range(rng, -1.0, 1.0)
    {dl, rng} = Det.range(rng, -0.1, 0.1)
    {dd, rng} = Det.choice(rng, [-1, 0, 1])
    {db, rng} = Det.choice(rng, [-1, 0, 1])
    {flip, rng} = Det.choice(rng, [false, false, false, true])
    # WS-B traits (appended so the existing draw order — and thus existing mutation behaviour — is
    # unchanged): a RARE enable flip and a small timescale jitter, kept in [0.5, 0.999].
    {sflip, rng} = Det.choice(rng, [false, false, false, false, true])
    {dts, rng} = Det.range(rng, -0.05, 0.05)
    {dcp, rng} = Det.range(rng, -0.05, 0.05)
    # NOVELTY (Gen-3): a small jitter on the active-learning weight, APPENDED LAST so existing lineages'
    # draw order — and thus existing mutation behaviour — is unchanged. Clamped to [0, 1].
    {dnv, rng} = Det.range(rng, -0.02, 0.02)

    child =
      %{
        g
        | growth_plan: plan,
          gamma: clamp(g.gamma + dg, 1.0, 32.0),
          lr: clamp(g.lr + dl, 0.1, 2.0),
          plan_depth: clamp(g.plan_depth + dd, 1, 6),
          plan_beam: clamp(g.plan_beam + db, 1, 4),
          e_on_noop: if(flip, do: not g.e_on_noop, else: g.e_on_noop),
          slow_context_enabled: if(sflip, do: not g.slow_context_enabled, else: g.slow_context_enabled),
          slow_context_timescale: clamp(g.slow_context_timescale + dts, 0.5, 0.999),
          slow_context_coupling: clamp(g.slow_context_coupling + dcp, 0.0, 1.0),
          novelty_gain: clamp(g.novelty_gain + dnv, 0.0, 1.0)
      }
      |> repair()

    {child, rng}
  end

  @doc "One-point crossover of two organ plans; average precisions; repair."
  def recombine(%__MODULE__{} = a, %__MODULE__{} = b, rng) do
    a = slow_defaults(a)
    b = slow_defaults(b)
    {cut, rng} = Det.uniform_int(rng, max(length(a.growth_plan), 1))
    plan = Enum.take(a.growth_plan, cut) ++ b.growth_plan

    child =
      %{
        a
        | growth_plan: plan,
          gamma: (a.gamma + b.gamma) / 2.0,
          lr: (a.lr + b.lr) / 2.0,
          plan_depth: round((a.plan_depth + b.plan_depth) / 2),
          plan_beam: round((a.plan_beam + b.plan_beam) / 2),
          e_on_noop: a.e_on_noop,
          slow_context_enabled: a.slow_context_enabled,
          slow_context_timescale: (a.slow_context_timescale + b.slow_context_timescale) / 2.0,
          slow_context_coupling: (a.slow_context_coupling + b.slow_context_coupling) / 2.0,
          novelty_gain: (a.novelty_gain + b.novelty_gain) / 2.0
      }
      |> repair()

    {child, rng}
  end

  # Back-fill the WS-B fields for any DNA serialized before they existed, so evolution on an old
  # genome never raises on a missing key. The live decide path reads them via safe accessors.
  defp slow_defaults(g) do
    g
    |> Map.put_new(:slow_context_enabled, false)
    |> Map.put_new(:slow_context_timescale, 0.95)
    |> Map.put_new(:slow_context_coupling, 0.0)
    |> Map.put_new(:novelty_gain, 0.0)
    |> Map.put_new(:drive_shape, :setpoint)
    # Rung-1 RED fields (Group G1): back-fill via Map.put_new so an older serialized genome never raises on a
    # missing key. NO new Det draws in mutate/2 or recombine/3 (structural RED fields, not evolvable traits), so
    # every existing lineage's rng draw-order — and thus its mutation behaviour — is byte-identical.
    |> Map.put_new(:drive_shape_by_factor, %{})
    |> Map.put_new(:fatigue_motor_coupling, true)
    |> Map.put_new(:severed_limbs, [])
    |> Map.put_new(:max_phase, nil)
    |> Map.put_new(:nursery, nil)
    |> Map.put_new(:consummation_honest, false)
    # FROZEN-FACTOR REPAIR (§2): back-filled the same way, and deliberately NOT given a Det draw in
    # mutate/2 or recombine/3 — it is a structural RED field, not an evolvable trait — so every
    # existing lineage's rng draw-order, and thus its mutation behaviour, is byte-identical.
    |> Map.put_new(:exteroceptive_a_init, nil)
  end

  # --- helpers ---------------------------------------------------------------

  defp apply_op(:noop, plan, rng), do: {plan, rng}

  defp apply_op(:insert, plan, rng) do
    {organ, rng} = Det.choice(rng, @organs)
    {[organ | plan], rng}
  end

  defp apply_op(:delete, [], rng), do: {[], rng}

  defp apply_op(:delete, plan, rng) do
    {i, rng} = Det.uniform_int(rng, length(plan))
    {List.delete_at(plan, i), rng}
  end

  defp apply_op(:swap, plan, rng) when length(plan) >= 2 do
    {i, rng} = Det.uniform_int(rng, length(plan))
    {j, rng} = Det.uniform_int(rng, length(plan))
    a = Enum.at(plan, i)
    b = Enum.at(plan, j)
    {plan |> List.replace_at(i, b) |> List.replace_at(j, a), rng}
  end

  defp apply_op(:swap, plan, rng), do: {plan, rng}

  defp ensure_base(plan), do: if(:interoception in plan, do: plan, else: [:interoception | plan])

  defp closure(plan) do
    Enum.reduce(plan, MapSet.new(plan), fn organ, acc -> add_prereqs(organ, acc) end)
    |> MapSet.to_list()
  end

  defp add_prereqs(organ, acc) do
    Enum.reduce(Map.get(@prereqs, organ, []), MapSet.put(acc, organ), fn p, acc ->
      add_prereqs(p, MapSet.put(acc, p))
    end)
  end

  defp depth(organ) do
    case Map.get(@prereqs, organ, []) do
      [] -> 0
      ps -> 1 + (ps |> Enum.map(&depth/1) |> Enum.max())
    end
  end

  defp clamp(v, lo, hi), do: v |> max(lo) |> min(hi)
end
