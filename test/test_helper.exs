# ONE timeout policy for the whole suite — do not go back to per-test @tag whack-a-mole.
#
# WHY 300s AND NOT ExUnit's 60s DEFAULT (measured 2026-07-18/19, do not relearn this the hard way):
# this is a pure-computation suite with ZERO deps — no DB, no HTTP, no IO wait. `mix test` runs at
# max_cases = System.schedulers_online() * 2 (32 on a 16-core box), Elixir's default 2x
# oversubscription. That default is tuned for IO-bound suites and is simply wrong for a CPU-bound
# one: it adds no throughput here, it just halves each test's effective core and turns wall-clock
# budgets into coin flips.
#
# Five tests sit in a narrow danger band against a 60s budget. Measured via `--trace` on an idle box:
#
#   SP.Brain.NoveltyTest       prospective EXPLORATION      185553 ms
#   SP.Brain.SlowContextWired  W1 byte-identical             46827 ms   (1.28x headroom)
#   SP.Brain.MotorCortexTest   P2 learn A_motor + B_motor    42968 ms   (1.40x)
#   SP.Brain.MotorCortexTest   P2 persist across save/load   40589 ms   (1.48x)
#   SP.EvalTest                sensing matters               38898 ms   (1.54x)
#
# Because they are clustered, raising ONE test's timeout frees it to run to completion, which raises
# sustained CPU occupancy and starves the NEXT test in the band. That displacement was MEASURED, not
# theorised: fixing MotorCortex moved the failure to NoveltyTest/BridgeTest; fixing those moved it to
# EvalTest (0/5 failures before, 3/3 after on a quiet box) and intermittently to
# SlowContextWiredTest. Four test files had accumulated hand-tuned band-aids and the suite was still
# red. A per-test timeout is the wrong instrument for a saturated CPU-bound suite; one global budget
# is the right one.
#
# Also measured and rejected: lowering max_cases to the true core count. At 16 vs 32 the suite ran
# 256s vs 261s and 333s vs 377s — marginally faster, but BOTH still failed. Reducing oversubscription
# is not the cure.
#
# The budget is RAISED, NOT REMOVED. 300s is ~6.4x the largest non-outlier cost above, so a genuine
# hang — or an FE regression that blows up planner cost — still fails the suite rather than wedging
# it. `timeout: :infinity` would forfeit that and is deliberately not used.
#
# ONE documented exception: SP.Brain.NoveltyTest's exploration test is a 4x outlier (185.6s — two
# 200-step runs through the full depth-5 beam-3 Plan search) and carries its own @tag timeout at the
# test. Its sample size is deliberately NOT reduced to fit this budget: that test is one of the four
# invariant guards named in CLAUDE.md, and trading its statistical power for wall time is a
# science-track change requiring /lab-team-review, not test hygiene.
#
# Receipt: docs/receipts/motor_cortex_suite_flake_2026-07-18.md
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# THE CROSS-REPOSITORY TESTS, AND WHY THEY ARE EXCLUDED OUT LOUD
# ─────────────────────────────────────────────────────────────────────────────────────────────────
# A small number of control-plane tests assert against documents in the UNI-FLAGELLUM repository,
# which sits BESIDE this one on the operator's machine and is reached by a relative path. Continuous
# integration checks out this repository alone, so those documents are absent there and every one of
# those assertions died on File.read!.
#
# That single cause accounted for ALL EIGHT test failures in CI — and CI had never reached the suite
# at all until 2026-08-01, because the compile step failed on one unused alias, so nobody had seen
# them.
#
# The exclusion is announced, never inferred. This estate's contract is explicit: an absent dataset,
# archive, instrument or service makes a check BLOCKED or NOT RUN — never a pass. A `File.exists?`
# guard inside each test would have produced a green suite that had quietly stopped asserting
# anything, which is strictly worse than a red one.
#
# THE STRONGER CURE IS NOW AVAILABLE, AND IT IS APPLIED. This block used to read: "Checking the
# sibling repository out in CI would let these tests genuinely run, and that needs a credential for
# a private repository — an operator action, not a code change."
#
# That stopped being true on 2026-08-24, when the operator ruled the frozen snapshots into real
# mirrors and TMDLRG/uni-flagellum-motor-stack became a public repository. No credential is needed
# to check out a public repository, so it WAS a code change after all. ci.yml now checks the mirror
# out and sets UNI_FLAGELLUM_PATH, and these seven tests RUN in CI instead of being excluded there.
#
# What is checked out is the MIRROR, which is redacted. Measured before the CI step was written: all
# 7 pass against a fresh clone of the mirror exactly as against the private tree, because none of
# the three redacted files is one these tests read. That is a fact about today, not a guarantee — if
# a future redaction touches ARCHITECTURE.md, FAILURE-MODES.md or phases/PHASE-7.md, this turns red
# in CI and green locally, and THAT DIVERGENCE IS THE SIGNAL, not a CI fault to be worked around.
#
# The exclusion path below is kept for anyone running without the repository present. The banner
# still fires, because an excluded test is still not a passing test.
cross_repo =
  System.get_env("UNI_FLAGELLUM_PATH") ||
    Path.expand("../../UNI-Flagellum/UNI-FLAGELLUM", __DIR__)

cross_repo_present? = File.dir?(Path.join(cross_repo, "docs/control-plane"))

exclusions =
  if cross_repo_present? do
    [:skip]
  else
    IO.puts([
      IO.ANSI.yellow(),
      "\n  CROSS-REPOSITORY TESTS EXCLUDED — NOT PASSED.\n",
      "  The UNI-FLAGELLUM repository is not present at #{cross_repo}, so tests that assert\n",
      "  against its documents cannot run here. They are tagged :cross_repo and EXCLUDED.\n",
      "  An excluded test is not a passing test. To run them, check that repository out beside\n",
      "  this one, or run the suite on a machine where it already is.\n",
      IO.ANSI.reset()
    ])

    [:skip, :cross_repo]
  end

ExUnit.start(exclude: exclusions, timeout: 300_000)
