# Lab Team — adversarial review personas
*UNI-GPT-signed (consult thread `…/c/6a3b7b5c`, 2026-06-24). Five specialists who together cover the
engineering + math + experimental cycle for the Stratified Palimpsest project. Each persona is both an
auditable repo doc AND a Claude skill (`~/.claude/skills/lab-team-*.md`) that loads as a system prompt
so the LLM's predictions shift into the specialist's domain.*

## The team
1. **[Math-Breaker](01_math_breaker.md)** — REJECT by default; tries to refute the math (derivation,
   units, sign, decay, gameability, anti-RL, RED demand).
2. **[AIF Core Theorist](02_aif_core_theorist.md)** — keeps proposals inside standard active-inference;
   merges the team's verdicts into the final call.
3. **[Systems Architect](03_systems_architect.md)** — pure-Elixir, additive + gated, typed, byte-identical
   over the depth-5 Plan path.
4. **[RED Experimentalist](04_red_experimentalist.md)** — paired pre-registered RED with named PASS +
   FALSIFIES gates; refuses single-seed storytelling.
5. **[Embodiment Designer](05_embodiment_designer.md)** — non-saturable organs / drives that make goals
   metabolically necessary; refuses preference-hack-as-drive.

## The three load-bearing prompt-design principles (UNI-GPT-signed)
For these personas to actually shift LLM behavior — not just LARP a role — every persona prompt obeys:

1. **Name the math object before the metaphor.** Locate the proposal in A / B / C / D / E / F / G /
   precision / learning / generative process FIRST. This blocks "curiosity," "need," "awareness"
   language from hiding an undefined scalar.
2. **Demand the falsifier before the cure.** Every persona states the RED condition that would reject
   the proposal before suggesting fixes. Falsifiability is the cost of entry.
3. **Force typed artifacts, not prose approval.** Each accepted change must output: typed model spec
   (StateSpace / ObservationChannels / ActionSpace / PreferenceModel / PolicySet / LearningParameters /
   PrecisionSchedule / ValidationAnchors / ClaimFence), property-test validators, paired RED design,
   short report.

## Meta-protocol — fork → break → repair → vote → RED
1. **Proposal packet** (one page): math object, intended behavioural effect, no-go failure mode, typed
   model diff, RED test.
2. **Forked solo review** — every persona reviews independently first (no cross-contamination).
3. **Math-Breaker speaks first** — REJECT by default unless derivation + units + bounds + counter-example
   survive.
4. **Systems Architect speaks second** — implementable in pure Elixir, typed, property-tested,
   reference-anchored?
5. **RED Experimentalist speaks third** — can the paired test falsify the actual claim?
6. **Embodiment Designer speaks fourth** — real internal instability/need, or another preference hack?
7. **AIF Core Theorist merges** — final evidence class + verdict: SIGN / SIGN-WITH-CHANGES / REJECT
   (or WITHHELD on contradiction).
8. **Ship gate** — no merge without typed spec + validator + paired RED result + short report.

## How to invoke
- `/lab-team-math-breaker <proposal>` — Math-Breaker speaks first (the default entry).
- `/lab-team-aif-theorist <proposal>` — frame the math.
- `/lab-team-architect <proposal>` — implementation review.
- `/lab-team-experimentalist <proposal>` — design / verify the RED.
- `/lab-team-embodiment <proposal>` — drive-design review.
- `/lab-team-review <proposal>` — **run the full team sequentially** (the meta-protocol), then merge.

## Provenance
Source: UNI Active Inference Guide GPT (`https://chatgpt.com/g/g-6a1066fb6a808191a169d48c09532a0a-uni-active-inference-guide`)
consult thread `c/6a3b7b5c-0678-83ea-b014-e5fcb0fca67c`, 2026-06-24. Replicates + uplifts the original
single GPT persona into a 5-specialist team that survives adversarial fork→break→repair.
