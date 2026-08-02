defmodule SP.Brain.MC do
  @moduledoc """
  The Minecraft active-inference brain: a genome-expressed `SP.Brain.Factors`
  model driven by symbolic senses. One `step/2` is a full perception → learning →
  action cycle (VFE → Dirichlet → EFE), with curriculum preferences `C` providing
  the only "drive" (survival/progress) on top of the intrinsic epistemic term.

  It can `save/2` and `load/2` its learned model so it keeps its memories across
  death (P6). There is no reward and no RL anywhere.
  """

  alias SP.Brain.{
    Genome,
    Factors,
    Codec,
    MCCodec,
    Plan,
    Precision,
    Math,
    Strategist,
    Hormones,
    Curriculum,
    SlowContext,
    Hierarchy2,
    MotorControl,
    Metabolism
  }

  alias SP.Determinism, as: Det

  # The L2 strategist re-plans its strategic option every this-many L1 ticks (slow OODA).
  @l2_period 12

  # The index of the `:noop` (idle) primitive in the genome's action list.
  @noop_index Enum.find_index(Genome.actions(), &(&1 == :noop))

  # MOTOR-CORTEX (Gen-3, opt-in): when the discrete brain commits `:mine` and the genome has the
  # :motor_cortex organ, the mine_log OPTION takes over for up to @mine_budget ticks — the motor inner
  # loop (SP.Brain.MotorControl) emits FINE primitives toward the desired proprioceptive configuration
  # @mine_target {aim=on_target, reach=in_reach, contact=log, dig=broke, motion=still}, fulfilling the
  # goal as descending proprioceptive prediction (not a fixed script). The factors still commit `:mine`
  # each option tick (so B learns the mine-option dynamics) and perceive normally. Inert without the organ.
  @mine_index Enum.find_index(Genome.actions(), &(&1 == :mine))
  @mine_target {2, 1, 2, 3, 0}
  @mine_budget 24

  # `l2` = the in-process L2 Strategist (or nil ⇒ L1-only, graceful degradation); `context`
  # = the current strategic option; `tick` drives the slow L2 cadence; `strategy_idx` =
  # which factor carries the strategic situation; `l2_config` = the per-option C overrides.
  defstruct [
    :dna,
    :model,
    :rng,
    :l2,
    :context,
    :tick,
    :strategy_idx,
    :l2_config,
    :slow_context,
    :motor,
    :motor_shuffle
  ]

  @doc "Build a fresh brain. Opts: `:seed`, `:phase`, `:dna`."
  def new(opts \\ []) do
    dna =
      case Keyword.get(opts, :dna) do
        %Genome{} = d -> d
        _ -> %{Genome.default() | phase: Keyword.get(opts, :phase, 0)}
      end

    # motor_shuffle (default false): the P4 ABLATION-B control — when true a :motor_cortex agent's inner
    # loop emits a RANDOM fine primitive each tick (the servo policy shuffled), isolating the inner loop as
    # the cause of any harvest. Not heritable (an experimental control, not part of the genome).
    %__MODULE__{
      dna: dna,
      model: Genome.express(dna),
      rng: Det.new(Keyword.get(opts, :seed, 1)),
      motor_shuffle: Keyword.get(opts, :motor_shuffle, false)
    }
    |> init_runtime()
  end

  # Wire the in-process L2 runtime. The `:strategist` organ being developed is what
  # makes the hierarchy LIVE (heritable): present ⇒ an L2 Strategist + the index of the
  # `:strategy` factor it digests + the per-option C-override map; absent ⇒ `l2: nil`
  # and L1 runs alone (graceful degradation). Default standing context is `:forage`.
  defp init_runtime(%__MODULE__{dna: dna, model: model} = brain) do
    strategy_idx = Enum.find_index(Genome.active_modalities(dna), &(&1.name == :strategy))
    config = strategist_config(dna)
    l2 = if strategy_idx, do: Strategist.new(config: config), else: nil
    # standing :forage drive only when there's an L2 to act on it; a pure-L1 agent (no
    # strategist organ) has no strategic context (nil) — nothing modulates it.
    context = if strategy_idx, do: :forage, else: nil
    # WS-B: build the slow scene parent ONLY when the genome enables it (else nil ⇒ the decide
    # path is byte-identical). Rebuilt fresh each life from the expressed factors; uniform W ⇒ inert
    # until an informative coupling is designed/learned (the live-benefit piece, owed to the GPT).
    slow_context = if slow_context_enabled?(dna), do: build_slow_context(model, dna), else: nil

    %__MODULE__{
      brain
      | l2: l2,
        context: context,
        tick: 0,
        strategy_idx: strategy_idx,
        l2_config: config,
        slow_context: slow_context
    }
  end

  @doc "One perception–learning–action cycle. Returns `{action_atom, brain}`."
  def step(%__MODULE__{} = brain, senses) do
    obs = MCCodec.encode(senses, brain.dna)

    # L2 slow OODA: every @l2_period ticks lift the situation (UP — a primitive int from
    # the codec) and let the strategist pick a strategic option; otherwise hold it.
    {l2, context} = maybe_strategize(brain, obs)

    # DOWN: the option retunes THIS tick's plasticity (lr), policy precision (γ) and
    # preferences (C) — perception, learning and the decision all run under that hormonal
    # context. L1-only (no strategist organ) ⇒ no modulation, the bare sensorimotor loop.
    ctx = if l2, do: modulate(brain.model, brain.dna, context, brain.l2_config), else: brain.model

    # B3 satiety-attenuation, RELOCATED here (2026-07-11) so the metabolism appetite brake is L2-INDEPENDENT: it
    # must apply to a pure-L1 (strategist-free) metabolism agent too, else dropping the strategist silently strips
    # the brake (it used to live only inside `modulate`, which runs only when an L2 exists — mc.ex history). Applied
    # ONCE, before policy eval; a no-op for any genome without a satiety factor ⇒ default byte-identical, and the L2
    # path is unchanged (same op, applied at the same point, disjoint fields from inject_slow_priors). Stripped
    # before persist (demodulate for L2 agents; restore_c for L1-only metabolism agents) ⇒ zero persisted bytes.
    ctx = satiety_attenuate(ctx, brain.dna)

    # WS-B DOWN (space): condition each L1 factor on the slow scene belief — set emp_prior = W_c·q(scene)
    # and the coupling δ; perception then uses the δ-weighted contextual prior. nil slow_context ⇒ no-op.
    ctx = inject_slow_priors(ctx, brain.slow_context, slow_context_coupling(brain.dna))

    ctx = ctx |> Factors.infer_states(obs) |> Factors.learn(obs) |> Factors.grow(obs)

    # WS-B UP (time): fold each factor's EXTRINSIC LIKELIHOOD (not its posterior — the GPT Q2 cavity fix)
    # into the slow belief (predict then correct).
    slow_context = step_slow_context(brain.slow_context, ctx)

    {idx, rng} = decide(ctx, brain.rng, brain.dna)

    # MOTOR-CORTEX DOWN+inner-loop (gated): when the mine_log option is active (or the brain just chose
    # :mine), the motor inner loop emits a FINE primitive toward the proprioceptive target and the factors
    # commit :mine (the option atom). `:motor_cortex` absent ⇒ {nil, idx, nil} ⇒ the path below is the
    # exact flat behaviour (byte-identical). `emit` overrides only the action STRING sent to the body.
    {emit, commit_idx, motor, rng} = motor_step(brain, idx, obs, senses, rng)

    # commit the action: next tick's prior + transition-learning use it, and the habit
    # prior E strengthens toward what the agent actually does — UNLESS it's an idle noop
    # (heritable), so doing nothing never becomes a self-reinforcing rut (G5: keep moving).
    committed = commit_action(ctx, commit_idx, brain.dna)

    # Persist a PURE model: strip the transient hormonal γ/lr/C (re-derived each tick from
    # the option) while KEEPING the learning, so memory round-trips cleanly across death.
    # L2 agents demodulate (full strip). A strategist-free metabolism agent still had its energy/satiety C
    # transiently attenuated by satiety_attenuate (relocated above), so restore that C to the genome baseline —
    # else the attenuation compounds tick-over-tick. Non-metabolism L1 agents are unchanged (byte-identical).
    model =
      cond do
        l2 -> demodulate(committed, brain.model)
        metabolism?(brain.dna) -> restore_c(committed, brain.model)
        true -> committed
      end

    # the slow-context fields are transient — demodulate strips them for L2 agents; this also covers an
    # L1-only enabled agent. A no-op when slow_context is off, so the disabled path stays byte-identical.
    model =
      if slow_context,
        do: %{model | subs: Enum.map(model.subs, &%{&1 | emp_prior: nil, emp_delta: 0.0, last_lik: nil})},
        else: model

    new_brain = %__MODULE__{
      brain
      | model: model,
        rng: rng,
        l2: l2,
        context: context,
        tick: brain.tick + 1,
        slow_context: slow_context,
        motor: motor
    }

    {emit || MCCodec.action(commit_idx), maybe_advance_phase(new_brain, senses)}
  end

  # --- MOTOR-CORTEX inner loop (gated; nil ⇒ flat byte-identical) -------------
  # Returns {emit_atom | nil, commit_idx, motor_state, rng}. emit=nil ⇒ the caller uses MCCodec.action/1
  # (the flat path). When the mine_log option runs, emit is the fine primitive and commit_idx forces :mine.
  # Threads rng only for the shuffle control; the normal path returns it unchanged ⇒ byte-identical off.
  defp motor_step(%__MODULE__{} = brain, idx, obs, senses, rng) do
    if motor_cortex?(brain.dna) do
      run_motor_option(
        brain.motor,
        idx,
        motor_config(obs, brain.dna),
        motor_ctrl(senses),
        brain.motor_shuffle,
        rng
      )
    else
      {nil, idx, nil, rng}
    end
  end

  # the body's current proprioceptive configuration = the aim/reach/contact/dig/motion factor outcomes,
  # resolved BY NAME (not the last-5 positional assumption, which mis-maps the moment another organ — e.g.
  # :homeostat — appends factors after the motor block). Byte-identical for any genome where the motor
  # factors ARE the final 5 (the current motor_primary), correct for any factor ordering.
  defp motor_config(obs, dna) do
    idx = Genome.active_modalities(dna) |> Enum.with_index() |> Map.new(fn {m, i} -> {m.name, i} end)
    at = fn name -> obs |> Enum.at(idx[name]) |> hd() end
    {at.(:aim_state), at.(:reach_state), at.(:contact_state), at.(:dig_state), at.(:motion_state)}
  end

  # the body's CONTINUOUS signed error to the goal — what the inner-loop reflex descends. The categorical
  # obs (above) is the brain's belief substrate; this is the finer control signal the body already has.
  defp motor_ctrl(senses) do
    # `:pi` is the motor loop gain — 1.0 (full servo) unless the :homeostat body injects a fatigue-lowered
    # "motor_pi" (a tired arm aims worse). Absent for a non-homeostat motor agent ⇒ 1.0 ⇒ byte-identical.
    %{
      yaw: msense(senses, "aim_yaw"),
      pitch: msense(senses, "aim_pitch"),
      dist: msense(senses, "goal_dist"),
      pi: pi_of(senses)
    }
  end

  defp pi_of(s) when is_map(s), do: Map.get(s, "motor_pi", 1.0)
  defp pi_of(_), do: 1.0

  defp msense(s, k) when is_map(s), do: Map.get(s, k, 0.0)
  defp msense(_s, _k), do: 0.0

  # option ACTIVE: continue the inner loop; end on dig=broke or budget exhaustion. `emit` is an ATOM (the
  # caller / Bridge stringifies uniformly) — the fine primitive replaces the root atom sent to the body.
  defp run_motor_option(%{control: control, ticks_left: left}, _idx, cfg, ctrl, shuffle, rng) do
    {prim, control2, telem, rng2} = next_primitive(control, cfg, ctrl, shuffle, rng)
    {_aim, _reach, _contact, dig, _motion} = cfg
    done? = dig == 3 or left <= 1
    motor = if done?, do: nil, else: %{control: control2, ticks_left: left - 1, telem: telem}
    {prim, @mine_index, motor, rng2}
  end

  # option INACTIVE: start mine_log iff the brain just chose :mine; else the flat path.
  defp run_motor_option(nil, idx, cfg, ctrl, shuffle, rng) when idx == @mine_index do
    {prim, control2, telem, rng2} = next_primitive(MotorControl.new(), cfg, ctrl, shuffle, rng)
    {prim, @mine_index, %{control: control2, ticks_left: @mine_budget, telem: telem}, rng2}
  end

  defp run_motor_option(nil, idx, _cfg, _ctrl, _shuffle, rng), do: {nil, idx, nil, rng}

  # the inner loop's fine primitive. Normal: the servo's choice (descends proprioceptive PE). Shuffle
  # (ABLATION B): a RANDOM primitive via the deterministic rng — the control still advances (so telemetry
  # is comparable) but its policy is destroyed, isolating the inner loop as the cause of any harvest.
  defp next_primitive(control, cfg, ctrl, shuffle, rng) when shuffle == true do
    {_servo_prim, control2, telem} =
      MotorControl.step(control, @mine_target, cfg, ctrl, Map.get(ctrl, :pi, 1.0))

    prims = MotorControl.primitives()
    {i, rng2} = Det.uniform_int(rng, length(prims))
    {Enum.at(prims, rem(i, length(prims))), control2, telem, rng2}
  end

  defp next_primitive(control, cfg, ctrl, _shuffle, rng) do
    {prim, control2, telem} = MotorControl.step(control, @mine_target, cfg, ctrl, Map.get(ctrl, :pi, 1.0))
    {prim, control2, telem, rng}
  end

  # the genome carries the :motor_cortex organ (opt-in; absent from default/0 ⇒ flat path).
  defp motor_cortex?(dna), do: :motor_cortex in Genome.active_organs(dna)

  # Decide an action. `plan_depth == 1` ⇒ the gen-1 ONE-STEP path (byte-identical to the
  # validated engine). Deeper ⇒ bounded recursive-EFE lookahead (SP.Brain.Plan) — wide
  # reasoning — still SAMPLED (exploration preserved) and still biased by the habit prior
  # E, at a dynamic policy precision. Pure: threads the deterministic rng.
  defp decide(model, rng, dna) do
    case plan_depth(dna) do
      1 ->
        %{q_pi: q_pi} = Factors.evaluate_policies(model)
        Codec.sample(q_pi, rng)

      depth ->
        values = Plan.action_values(model, depth: depth, beam: plan_beam(dna))
        gamma = Precision.update_policy(values, model.gamma)
        logits = Math.vadd(Math.vscale(values, gamma), Factors.action_log_habit(model))
        Codec.sample(Math.softmax(logits), rng)
    end
  end

  # depth/beam clamped to [1,4] (the 4GB fence); missing trait (old saved DNA) ⇒ gen-1.
  # depth clamped to [1,6] (lifted from the gen-2 [1,4] fence — more temporal depth); a MISSING
  # trait (old/inherited DNA) now DEFAULTS TO DEEP (3) instead of silently collapsing to 1-step.
  defp plan_depth(%{plan_depth: d}) when is_integer(d), do: d |> max(1) |> min(6)
  # fallback for genomes that predate the heritable plan_depth trait. Raised 3→5: with the
  # optimised planner a depth-5 step is ~370 ms (≈ the body cadence), so old-DNA live agents
  # reason 5 beats ahead while still acting ~1.5×/sec — deep AND lively. (depth 6 ≈ 1.4 s is too slow.)
  defp plan_depth(_), do: 5
  defp plan_beam(%{plan_beam: b}) when is_integer(b), do: b |> max(1) |> min(4)
  defp plan_beam(_), do: 3

  # --- curriculum progression (the agent grows up) ---------------------------

  # PURE + MONOTONIC: advance to the next curriculum phase the moment the current phase's goal
  # is sensed as met (survive → wood → tools → established). set_phase only re-expresses C,
  # keeping every learned tensor, so the colony climbs the curriculum instead of being pinned.
  defp maybe_advance_phase(%__MODULE__{dna: %{phase: p} = dna} = brain, senses) do
    cap = min(Curriculum.max_phase(), max_phase_cap(dna))
    if p < cap and phase_goal_met?(p, senses), do: set_phase(brain, p + 1), else: brain
  end

  # Heritable phase cap: nil ⇒ no cap (== Curriculum.max_phase()) ⇒ default byte-identical; an integer pins the
  # climb (0 ⇒ the agent is held at phase 0, so the regulation-gate isolation lineage never re-imports task-C).
  defp max_phase_cap(%{max_phase: m}) when is_integer(m), do: m
  defp max_phase_cap(_), do: Curriculum.max_phase()

  defp phase_goal_met?(0, s), do: sense(s, "health") >= 18 and sense(s, "food") >= 12
  defp phase_goal_met?(1, s), do: inv(s, "wood") >= 3
  defp phase_goal_met?(2, s), do: inv(s, "tools") >= 1
  defp phase_goal_met?(3, s), do: inv(s, "wood") >= 8 and inv(s, "tools") >= 1
  defp phase_goal_met?(_p, _s), do: false

  defp sense(s, k), do: numf(Map.get(s, k))
  defp inv(s, k), do: numf(get_in(s, ["inv", k]))
  defp numf(v) when is_number(v), do: v
  defp numf(_), do: 0

  # --- L2/L1 hierarchy (the slow strategic OODA) -----------------------------

  # Slow loop: on the L2 cadence, lift the body's situation (UP, a primitive integer)
  # and let the Strategist run its OWN min-VFE + softmax-over-options to pick a context;
  # off-cadence (or L1-only) hold the current option. Never crosses a belief struct.
  defp maybe_strategize(%__MODULE__{l2: nil} = brain, _obs), do: {nil, brain.context}

  defp maybe_strategize(%__MODULE__{l2: l2, tick: tick, context: context} = brain, obs) do
    if rem(tick, @l2_period) == 0 do
      {option, l2} = Strategist.step(l2, situation_from_obs(obs, brain.strategy_idx))
      {l2, option}
    else
      {l2, context}
    end
  end

  # The strategic situation digest is exactly the `:strategy` modality outcome the body
  # sensed this tick (0 calm · 1 threatened · 2 depleted · 3 social · 4 idle) — a clean
  # primitive crossing the inter-level blanket UP (no learned belief leaks across).
  defp situation_from_obs(obs, idx) when is_integer(idx) do
    case Enum.at(obs, idx) do
      [o | _] when is_integer(o) -> o
      _ -> 0
    end
  end

  defp situation_from_obs(_obs, _idx), do: 0

  # DOWN: re-base γ/lr to the genome baseline (so repeated modulation can't compound),
  # apply the option's ABSOLUTE C overrides, then the hormonal retune for that context.
  defp modulate(model, dna, context, config) do
    model
    |> reset_baseline(dna)
    |> Strategist.apply_context(context, config)
    |> Hormones.modulate(Hormones.of_context(context))

    # satiety_attenuate is applied L2-INDEPENDENTLY in step/2 (relocated 2026-07-11), NOT here, so a
    # strategist-free metabolism agent keeps the appetite brake; for an L2 agent the net effect is unchanged.
  end

  # B3 (Phase 2): satiety down-weights APPETITIVE (positive-lobe) C on the energy/satiety factors so a sated
  # agent forages/refills less. A no-op for any genome without a satiety factor ⇒ byte-identical. Applied in
  # step/2 (L2-INDEPENDENTLY — relocated 2026-07-11 so a strategist-free metabolism agent keeps the brake),
  # before policy eval, action-independent, and stripped before persist (demodulate for L2 agents, restore_c for
  # L1-only metabolism agents) ⇒ zero persisted bytes. The protective blacklist (self/social/status/threat) and
  # the depletion penalties are never touched.
  defp satiety_attenuate(model, dna) do
    mods = Genome.active_modalities(dna)

    Metabolism.attenuate_model(
      model,
      Enum.find_index(mods, &(&1.name == :energy)),
      Enum.find_index(mods, &(&1.name == :satiety))
    )
  end

  defp reset_baseline(model, dna) do
    %{model | gamma: dna.gamma, subs: Enum.map(model.subs, &%{&1 | lr: 1.0})}
  end

  # Inverse of the transient retune: keep the freshly-learned tensors in `learned` but
  # restore the precision γ, plasticity lr and preferences C from the pre-modulation
  # `base` (the stored pure model). The hormonal context is state, not memory.
  defp demodulate(learned, base) do
    # emp_prior is TRANSIENT (re-derived each tick from the slow belief) — strip it from the persisted
    # pure model so it never leaks into a saved life and the off-path stays byte-identical.
    subs =
      Enum.zip(learned.subs, base.subs)
      |> Enum.map(fn {l, b} -> %{l | lr: b.lr, c: b.c, emp_prior: nil, emp_delta: 0.0, last_lik: nil} end)

    %{learned | gamma: base.gamma, subs: subs}
  end

  # Restore ONLY the preferences C from the pre-tick base — used for a strategist-free metabolism agent (no full
  # demodulate) whose satiety_attenuate transiently modified energy/satiety C. C is re-derived from the genome
  # each tick (never learned), so restoring the baseline C is always correct and keeps the learned tensors.
  defp restore_c(learned, base) do
    subs = Enum.zip(learned.subs, base.subs) |> Enum.map(fn {l, b} -> %{l | c: b.c} end)
    %{learned | subs: subs}
  end

  # Commit the chosen action. By default `noop` sets the last action but does NOT bump the
  # habit prior E (idleness stays non-habitual); a genome with `e_on_noop: true` reinforces
  # it like any other action. Toggling `learn_e` is local — the original flag is restored.
  #
  # Phase-2 METABOLISM: `:eat` is also excluded from habit bumps for a `:metabolism` genome —
  # eating is a HOMEOSTATIC act driven by need (energy/satiety C peaked at setpoint), not a
  # tendency that should snowball into a reflex (else early defensive eats compound and the
  # standing drive is masked by a learned eat-habit). Exact analogue of the `:noop` exclusion.
  # Absent for non-metabolism genomes ⇒ byte-identical.
  defp commit_action(model, idx, dna) do
    if habit_excluded?(idx, dna) do
      %{Factors.commit_action(%{model | learn_e: false}, idx) | learn_e: model.learn_e}
    else
      Factors.commit_action(model, idx)
    end
  end

  defp habit_excluded?(idx, dna) do
    (idx == @noop_index and not e_on_noop?(dna)) or (idx == eat_index() and metabolism?(dna))
  end

  defp eat_index, do: Enum.find_index(Genome.actions(), &(&1 == :eat))
  defp metabolism?(%Genome{} = dna), do: :metabolism in Genome.active_organs(dna)
  defp metabolism?(_), do: false

  defp e_on_noop?(%{e_on_noop: v}) when is_boolean(v), do: v
  defp e_on_noop?(_), do: false

  # --- WS-B: the slow scene parent over the L1 factors -----------------------
  # Heritable, OFF by default. When on, a SP.Brain.SlowContext conditions every factor each tick
  # (DOWN: emp_prior = W_c·q(scene)) and is itself updated by the factors' posteriors (UP). The
  # accessors fall back safely on DNA serialized before these fields existed.

  defp slow_context_enabled?(%{slow_context_enabled: v}) when is_boolean(v), do: v
  defp slow_context_enabled?(_), do: false

  defp slow_context_timescale(%{slow_context_timescale: t}) when is_float(t), do: t |> max(0.5) |> min(0.999)
  defp slow_context_timescale(_), do: 0.95

  # The DOWN coupling δ ∈ [0,1] (the contextual-prior blend weight). 0 ⇒ flat even when the parent exists.
  defp slow_context_coupling(%{slow_context_coupling: c}) when is_number(c), do: c |> max(0.0) |> min(1.0)
  defp slow_context_coupling(_), do: 0.0

  # The number of slow "scene" states the parent distinguishes (architecture, not learned).
  defp slow_context_states, do: 4

  # Build the parent from the EXPRESSED factors: one child per L1 sub, in factor order (subs carry no
  # name; the order matches Genome.active_modalities/1). W_c starts UNIFORM (Sg columns of length ns_c)
  # so child_priors is uniform ⇒ emp_prior uniform ⇒ inert/byte-identical until an informative coupling
  # is designed/learned (the live-benefit piece, owed to the GPT). B^G is sticky from the timescale.
  defp build_slow_context(model, dna) do
    sg = slow_context_states()
    names = Genome.active_modalities(dna) |> Enum.map(& &1.name)

    child_specs =
      Enum.zip(names, model.subs)
      |> Enum.map(fn {name, sub} ->
        uniform_col = List.duplicate(1.0 / sub.ns, sub.ns)
        {name, List.duplicate(uniform_col, sg)}
      end)

    h2 = Hierarchy2.new(sg, List.duplicate(1.0 / sg, sg), child_specs)
    SlowContext.new(h2, sticky_cols(sg, slow_context_timescale(dna)))
  end

  # Column-stochastic sticky transition: column j has `d` on the diagonal, the rest spread uniformly.
  defp sticky_cols(n, d) do
    off = (1.0 - d) / (n - 1)
    for j <- 0..(n - 1), do: for(r <- 0..(n - 1), do: if(r == j, do: d, else: off))
  end

  # DOWN: set each factor's transient emp_prior = W_c·q(scene). Children and subs share order, so we
  # zip them (no name lookup on the nameless sub). Guarded: if a factor grew its ns (structure learning)
  # past the W_c column length, skip its injection (nil) rather than feed a mismatched-length prior.
  defp inject_slow_priors(model, nil, _delta), do: model

  defp inject_slow_priors(%{subs: subs} = model, %SlowContext{} = sc, delta) do
    children = sc.h2.children

    if length(children) == length(subs) do
      priors = SlowContext.child_priors(sc)

      subs =
        Enum.zip(children, subs)
        |> Enum.map(fn {child, sub} ->
          # child.sc is the child's |states| recorded at build time; if a factor GREW its ns past it
          # (structure learning), skip its injection rather than feed a mismatched-length prior.
          prior = Map.fetch!(priors, child.name)

          if length(prior) == sub.ns,
            do: %{sub | emp_prior: prior, emp_delta: delta},
            else: %{sub | emp_prior: nil, emp_delta: 0.0}
        end)

      %{model | subs: subs}
    else
      # the factor COUNT diverged from the parent's children (e.g. Factors.add_factor) — skip the whole
      # injection rather than risk mis-mapping priors to the wrong factors.
      model
    end
  end

  # UP: fold the fresh L1 posteriors (same child order) into the slow belief. If any factor's belief
  # length no longer matches its child (structure growth), hold the slow belief this tick (no crash).
  defp step_slow_context(nil, _model), do: nil

  defp step_slow_context(%SlowContext{} = sc, %{subs: subs}) do
    pairs = Enum.zip(sc.h2.children, subs)

    # UP message = each factor's EXTRINSIC LIKELIHOOD last_lik (the data term), NOT its posterior — the GPT
    # Q2 cavity fix, so the parent hears evidence, not an echo of its own down-prior. Hold the slow belief
    # (no update, no crash) if the factor count diverged or a factor lacks a same-length likelihood.
    if length(sc.h2.children) == length(subs) and
         Enum.all?(pairs, fn {child, sub} -> is_list(sub.last_lik) and length(sub.last_lik) == child.sc end) do
      SlowContext.step(sc, Map.new(pairs, fn {child, sub} -> {child.name, sub.last_lik} end))
    else
      sc
    end
  end

  # Per-option ABSOLUTE preference overrides keyed by L1 sub-index. ABSOLUTE (not delta)
  # and rewriting the SAME strategic factors for every option ⇒ idempotent: switching
  # options never leaves a stale bias, and re-applying the held option is a no-op.
  # Indices are resolved by modality NAME so the map is correct for any morphology.
  defp strategist_config(dna) do
    idx = Genome.active_modalities(dna) |> Enum.with_index() |> Map.new(fn {m, i} -> {m.name, i} end)
    organs = Genome.active_organs(dna)

    # absolute C vectors over each factor's OUTCOMES (length must equal its `no`)
    needs_safe = [-4.0, -1.0, -0.5, 2.0]
    danger_calm = [1.0, 0.0, -2.0]
    danger_flee = [3.0, -1.0, -5.0]
    inv_neutral = [0.0, 0.5, 1.0, 0.5]
    inv_forage = [-1.0, 2.0, 0.5, 2.0]
    inv_build = [-1.0, 0.5, 3.0, 0.0]
    vis_neutral = [-1.0, 0.0, 0.0, 0.0, -2.0, 0.0]
    vis_tree = [-1.0, 0.0, 3.0, 0.0, -2.0, 0.0]
    vis_shelter = [-1.0, 0.0, 0.0, 0.0, -2.0, 1.5]

    # SURFACE DRIVE (the bedrock fix): the UNI senses light (0 dark·1 dim·2 day) and sky
    # (0 enclosed·1 partial·2 open) but nothing preferred either — so it could mine to bedrock
    # at no pragmatic cost. Make deep-underground (dark + enclosed) costly and daylight + open sky
    # good, so a foraging/roaming UNI climbs OUT of the mines instead of digging down. `build`/`rest`
    # stay NEUTRAL here (a shelter is rightly dim + enclosed) so the agent can still mine for
    # stone/tools while building — only surface activity pulls up. (Inert if light/sky aren't expressed.)
    light_surface = [-2.0, 0.0, 1.5]
    sky_surface = [-2.0, 0.0, 1.5]
    light_neutral = [0.0, 0.0, 0.0]
    sky_neutral = [0.0, 0.0, 0.0]

    by_name = fn pairs ->
      pairs
      |> Enum.flat_map(fn {name, vec} ->
        case idx[name] do
          nil -> []
          i -> [{i, vec}]
        end
      end)
      |> Map.new()
    end

    # HOMEOSTAT FOOD-NICHE (Rung-1): an organism with a metabolic death edge must forage FOOD, not just wood.
    # When the :homeostat organ is present, :forage additionally ORIENTS to prey (prey outcomes 0 none·1 ahead·
    # 2 left·3 right) — prefer prey ahead so a hungry UNI turns toward and closes on the animal, exactly as the
    # wood forager prefers vision=tree. This is the innate food-niche of the phenotype (a hunt DRIVE), not a
    # reward. Gated: default + every non-homeostat genome gets NO prey override ⇒ :forage byte-identical.
    prey_hunt = if :homeostat in organs, do: [prey: [-0.5, 3.0, 0.5, 0.5]], else: []

    %{
      forage:
        by_name.(
          [
            status: needs_safe,
            inventory: inv_forage,
            vision: vis_tree,
            threat: danger_calm,
            light: light_surface,
            sky: sky_surface
          ] ++ prey_hunt
        ),
      build:
        by_name.(
          status: needs_safe,
          inventory: inv_build,
          vision: vis_shelter,
          threat: danger_calm,
          light: light_neutral,
          sky: sky_neutral
        ),
      flee:
        by_name.(
          status: needs_safe,
          inventory: inv_neutral,
          vision: vis_neutral,
          threat: danger_flee,
          light: light_surface,
          sky: sky_neutral
        ),
      socialize:
        by_name.(
          status: needs_safe,
          inventory: inv_neutral,
          vision: vis_neutral,
          threat: danger_calm,
          light: light_surface,
          sky: sky_surface
        ),
      rest:
        by_name.(
          status: needs_safe,
          inventory: inv_neutral,
          vision: vis_shelter,
          threat: danger_calm,
          light: light_neutral,
          sky: sky_neutral
        )
    }
  end

  @doc "Per-factor beliefs (diagnostics)."
  def beliefs(%__MODULE__{model: model}), do: Factors.beliefs(model)

  @doc """
  Advance (or reset) the agent to a curriculum `phase`, re-expressing the preference `C`
  for that phase while KEEPING every learned tensor (A/B/E/precision/posteriors). Lets a
  colony "grow up" — survive → gather wood → tools → shelter — without forgetting; the L2
  strategist (if present) keeps modulating C on top of the new baseline. Morphology and the
  L2 wiring are unchanged, so the strategy index and option configs stay valid.
  """
  def set_phase(%__MODULE__{} = brain, phase) when is_integer(phase) do
    new_dna = %{brain.dna | phase: phase}
    fresh = Genome.express(new_dna)

    subs =
      cond do
        # identical shape: keep the learned tensors, refresh only the genome's preference C.
        same_shape?(brain.model, fresh) ->
          Enum.zip(brain.model.subs, fresh.subs) |> Enum.map(fn {learned, f} -> %{learned | c: f.c} end)

        # structure GREW during life (ns larger than the base expression) but the factors still
        # match: keep the learned, grown subs untouched — never reset hard-won structure on a phase
        # change (refreshing the base-sized C here would mis-shape the grown factor).
        compatible?(brain.model, fresh) ->
          brain.model.subs

        true ->
          fresh.subs
      end

    %__MODULE__{brain | dna: new_dna, model: %{brain.model | subs: subs}}
  end

  @doc "Persist the learned model so memories survive death."
  def save(%__MODULE__{} = brain, path) do
    File.write!(path, :erlang.term_to_binary({brain.dna, brain.model}))
  end

  @doc """
  Reload a saved model into a fresh brain (a new life that remembers). Defensive and
  forward-compatible: a memory file written by an OLDER struct/shape (e.g. before a new
  factor or field was added) is RECONCILED — learned tensors are grafted onto a
  current-struct skeleton when the shape matches, else the agent starts fresh. A
  corrupt/unreadable file also yields a fresh life rather than crashing.
  """
  def load(path, opts \\ []) do
    case safe_read(path) do
      {:ok, file_dna, model} ->
        # the lineage may RE-HOME an inherited model under an EVOLVED genome (opts[:dna]):
        # reconcile grafts the learned tensors when the shape still matches, else starts
        # fresh — so a kin remembers across death while its genome keeps evolving.
        dna =
          case Keyword.get(opts, :dna) do
            %Genome{} = d -> d
            _ -> file_dna
          end

        %__MODULE__{
          dna: dna,
          model: reconcile(dna, model),
          rng: Det.new(Keyword.get(opts, :seed, 1)),
          motor_shuffle: Keyword.get(opts, :motor_shuffle, false)
        }
        |> init_runtime()

      :error ->
        new(opts)
    end
  end

  defp safe_read(path) do
    {dna, model} = path |> File.read!() |> :erlang.binary_to_term()
    {:ok, dna, model}
  rescue
    _ -> :error
  catch
    _, _ -> :error
  end

  # Keep learned tensors when the saved shape matches the genome's current expression;
  # otherwise the model evolved across versions — start fresh.
  # Reconcile a saved model with the current genome expression. The model is KEPT (all its learning
  # preserved) whenever it is still COMPATIBLE — same factors and motor repertoire — EVEN IF its
  # hidden-state spaces grew during life (structure learning, U3). Only a genuine incompatibility
  # (a factor added/removed, the observation or action repertoire changed across versions) starts
  # fresh. This is what lets a UNI carry its DEEP, structure-grown memory across death — not just
  # freshly-born base shapes.
  defp reconcile(dna, %Factors{} = saved) do
    fresh = Genome.express(dna)
    if compatible?(saved, fresh), do: adopt(fresh, saved), else: fresh
  end

  defp reconcile(dna, _other), do: Genome.express(dna)

  # STRICT match (hidden-state dims identical too) — used by `set_phase` to know when it can safely
  # refresh the genome's preference C (which is sized to the base expression).
  defp same_shape?(%Factors{subs: a}, %Factors{subs: b}) do
    length(a) == length(b) and
      Enum.all?(Enum.zip(a, b), fn {x, y} -> Map.get(x, :ns) == y.ns and Map.get(x, :nu) == y.nu end)
  end

  defp same_shape?(_, _), do: false

  # COMPATIBLE: same number of factors, and for each factor the same OBSERVATION dim (`no`) and
  # ACTION count (`nu`). The hidden-state count `ns` MAY differ — a model that grew its state-space
  # is still valid (its likelihood columns still map to the body's observations, its B still spans
  # the same motors), so its learning is kept rather than discarded.
  defp compatible?(%Factors{subs: a, nu: nua}, %Factors{subs: b, nu: nub}) do
    nua == nub and length(a) == length(b) and
      Enum.all?(Enum.zip(a, b), fn {x, y} ->
        Map.get(x, :no) == Map.get(y, :no) and Map.get(x, :nu) == Map.get(y, :nu)
      end)
  end

  defp compatible?(_, _), do: false

  # ADOPT the saved (learned, possibly structure-GROWN) model: keep every saved factor wholesale so
  # NO learning is lost, while back-filling any struct field added since it was saved (new keys get
  # the current default) and dropping any field no longer in the struct. Model-level policies and
  # precision come from the current genome expression.
  defp adopt(%Factors{subs: fresh_subs} = fresh, %Factors{subs: saved_subs} = saved) do
    subs =
      Enum.zip(fresh_subs, saved_subs)
      # exclude the TRANSIENT slow-context fields so values saved by a (possibly enabled) prior life can
      # never resurrect onto a fresh sub — they must always start at the default and be re-derived each tick.
      |> Enum.map(fn {f, s} ->
        Map.merge(f, Map.take(s, Map.keys(f) -- [:emp_prior, :emp_delta, :last_lik]))
      end)

    %{fresh | subs: subs, pe: Map.get(saved, :pe, fresh.pe), e: Map.get(saved, :e, fresh.e)}
  end
end
