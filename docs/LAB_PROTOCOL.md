# Lab Protocol — evidence discipline, attribution, claim fence
*Standing rules for this project. Hard guardrails, not preferences. Owner-set; violations are bugs.*

## I. The First Rule — never stack changes such that you cannot account for the winning outcome
Every RED test must end with a single answer to: *"what one variable, between the two arms, produced the divergence I'm reporting?"* If that answer is "two or more things changed at once," the outcome is **unattributable** and **may not be claimed** — it is logged as exploratory, never as evidence.

- **Paired design** is the default for any cure: same code, same world, same body, same kin shape; the only difference is the gated organ/coupling under test (e.g. `novelty_gain` 0.5 vs 0.0 for the Phase-1 RED).
- **One-cure-at-a-time.** A second cure is not deployed until the prior cure has been verdict-recorded (PASS / PARTIAL / FAIL). Phase 2 does not ship while Phase 1 is in flight.
- If a second variable accidentally entered the comparison, **the result is voided.** Re-run cleanly.

## II. Pre-registered RED gates (RED-first)
Every cure must register its gates **before the run**, named in the plan and the docs (see `docs/MOTOR_RED_TEST.md`, `docs/UNI_MISSION_DEEPENING.md`). A run is judged only against its registered gates.
- A gate has the form: *"PASS requires ALL of [a,b,c]; FALSIFIES if [x]."*
- Honest verdicts only: **PASS / PARTIAL / FAIL / WITHHELD**. Never percent-scored. Never spun.
- A PARTIAL result names *exactly* which sub-claim holds and which does not (e.g. *"hoard prevented (PASS), behavioural plateau-break (FAIL)"*).

## III. Evidence collection — continuous, owned, auditable
1. **Continuous time-series**, not single snapshots. RCON inventories + brain probes every 10 min for the run's window; both arms in lock-step.
2. **Lab-side or harness-managed**, never inside the LLM session — collectors must survive context compaction, model switches, and usage gaps.
3. **Independent confirmation**: behavioural claims (hoard, stone, building) confirmed via RCON (the *server's* authoritative view), not the body's self-report. Mechanism claims (B-counts, posteriors, EFE values) confirmed via brain probes against the live registry.
4. **Receipts**: every claim points to a commit hash, a saved `.bin`, and a probe-log path that reproduces it.

## IV. Live-stream guard (Stratified Palimpsest specific)
- No lineage deploys to the live colony without owner go-ahead (see `feedback_live_stream_changes`).
- New lineages run in **separate containers** (`uni-colony-motor`, `uni-colony-curiosity`, …) with `UNI_AUTOSTART=0`, distinct kin, distinct memory dirs. The default colony is never touched.
- An offline RED gate (test suite + sim) must pass before any live deploy.

## V. The math invariants (FE-consistent, not negotiable)
1. No Nx / Rust / NIF / GPU; no backprop; no RL / TD / reward-on-policy.
2. Every new term is a recognised FE quantity: pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`, parameter-novelty `W` over Dirichlet counts, or precision `γ/γ_m/η`.
3. **No scalar-per-action term** in policy logits. Guarded by the **action-clone-invariance test**: clone `:idle_a`/`:idle_b` with identical A/B/C/D/E → identical logits; change only `action_cost[:idle_b]=999` → identical logits; change only `B_x[:mine]` → only the predicted `qo·C` term moves.
4. **Additive + gated.** Every extension behind an opt-in genome organ/field absent from `default/0`; graded-on coupling default 0.0; default genome **byte-identical** (mad < 1e-12 over the live depth-5 Plan path).
5. **Monotonic decay** of any information term: `W → 0` as Dirichlet counts → ∞, independent of `C`. The no-smuggled-reward proof.

## VI. The claim fence (binding)
Operational behavioural / organisational measures are **necessary-not-sufficient substrates** with **ZERO evidential weight** for awareness / consciousness / life on their own. Passing a gate demonstrates the named behaviour, **never experience**. Do not surface gland/precision floats as "felt" states. We carry the receipts so that, when this becomes load-bearing in public, the warranted claims and the over-claims are visibly separated.

## VII. Adversarial review by persona team (Class-A peer review)
Before any FE-touching change ships, it is reviewed by the lab persona team (`.claude/skills/lab-team*.md`) running as Claude skills. Each persona is a system-prompt that loads its specialist knowledge primitives, fails-loudly on their named failure mode, and produces a SIGN / SIGN-WITH-CHANGES / REJECT verdict. Default protocol: **find-it-then-break-it** — the proposer drafts, the math-breaker tries to falsify, the engineer checks invariants, the experimentalist names the gate; majority `SIGN-WITH-CHANGES` or stronger to proceed.

## VIII. Standing instructions for the LLM (me)
- I do not move past a running RED test until its evidence is collected to a verdict.
- I do not infer cause from one snapshot — I read the time-series.
- I do not give up on a reasoning model's response after 30 s — it reasons silently for 1–3 min.
- I distinguish a *plateau in the data* from a *plateau in the agent*. Frozen collector ≠ frozen colony.
- I report PARTIAL when a sub-claim holds and the full claim does not. I do not spin sub-claims as full claims.
- I write the verdict in the same doc as the registered gate, so the receipt sits next to the claim.
