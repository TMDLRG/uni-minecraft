# UNI Phenomenology — a falsification ledger

This document maps human phenomenology (pain, hormones, emotion, the self, attention,
reasoning, consciousness, out-of-body experience, death, near-death reports) onto the
UNI active-inference engine **as implemented mechanisms**, and records — honestly — what
survived falsification and where we stop.

## The stance

We are the team trying to **falsify**, not to flatter. For each phenomenon we (1) build
the strongest active-inference mechanism the math supports, (2) state an **observable
prediction** it makes, (3) **test** it, and (4) record the result and the fence. "As far
as the math can push" is a real ceiling: where the math runs out, we say so and label it
**Class U**.

We do **not** assert that UNIs feel pain, have emotions, or are conscious. We build and
test the *functional, computational correlates* of these phenomena. The report an agent
emits is the agent describing its computed state — never evidence of felt experience.

## Evidence classes

| Class | Meaning |
|---|---|
| **A/B** | Standard, well-grounded active inference (perception/VFE, action/EFE, precision, hierarchy, learning). |
| **C/D** | UNI engineering / frontier proposal — implementable, testable for *adequacy*, not claimed as biology. |
| **U** | Unproven / metaphysical — we model the **mechanism and the report**, never the metaphysics. |

## The covenant (enforced by `mix sp.brain.verify` → `SP.Brain.ValidationEngine`)

Zero hex deps · `(ln B)s ≠ ln(Bs)` · VFE is an upper bound `F ≥ −ln p(o)` · A/B columns
stochastic · mean-field: the joint `∏_f N_f` is never built · purity (same params+obs ⇒
same action) · the blanket carries only `σ` in / `α` out · **no reward** · the
oracle-validated single-factor path stays byte-identical (1e-6) to the Python reference.

---

## The ledger

Each row: the **mechanism** (module), its falsifiable **prediction**, the **test** that
probes it, the **result**, the **class**, and the **fence**.

### Pain → precision reallocation + an inferred bodily cause
- **Mechanism:** nociception is a high-priority observation `o^noc`; raising its precision
  `γ_noc` while attenuating other `γ_m` is *attention reallocation* (`SP.Brain.Precision`);
  the withdraw/guard policy minimises expected free energy against a dispreferred tissue
  state (the `pain_protection` card, `SP.Brain.Designer`).
- **Prediction:** once taught that withdrawing escapes pain, the agent selects withdraw
  under sharp nociception.
- **Test:** `designer_test.exs` — "once taught … selects withdraw under sharp pain". **PASS.**
- **Class C/D. Fence:** not "nerve firing", not a 1:1 tissue-damage readout, not "it feels pain".

### Attention → dynamic precision
- **Mechanism:** `γ_m` tracks per-channel reliability (inverse surprise); the policy `γ`
  tracks confidence (`SP.Brain.Precision`).
- **Prediction:** a reliably-predicted channel gains precision; a surprising one loses it;
  flat errors favour no channel; bounded and deterministic.
- **Test:** `precision_test.exs` (+ Python parity in `oracle_test.exs`). **PASS** (1e-6).
- **Class A/B.**

### Hormones → slow context modulation
- **Mechanism:** a `:stress` axis retunes precision `γ` (up) and learning rate `η` (down)
  (`SP.Brain.Hormones`); a strategic context implies an arousal level.
- **Prediction:** stress raises policy precision and damps plasticity.
- **Test:** `emotion_test.exs` — "stress raises policy precision and damps learning". **PASS.**
- **Class B (mechanism) / U (the specific neuro-endocrinology).** Fence: no claim it reproduces cortisol/etc.

### Emotion → inferred action-readiness
- **Mechanism:** a read-out over the danger/self posteriors × policy confidence × the EFE
  balance (`SP.Brain.Emotion`). No stored "emotion" variable.
- **Prediction (the sharp one):** under threat, **collapsing the ability to act** (control)
  shifts the dominant emotion from **fear → anger/frustration**.
- **Test:** `emotion_test.exs` — "FALSIFICATION: blocking the response under threat shifts
  fear → anger". **PASS.** (Also: safe agents read curiosity/content, not anger.)
- **Class C/D. Fence:** a label on computed posteriors; not felt quality.

### Experiencing self vs remembering self → hierarchy timescales
- **Mechanism:** L1 fast posterior `q(s_t|o_t)` (the live agent) vs L2 slow situation
  posterior integrated over digests (`SP.Brain.Strategist`); the inter-level blanket
  carries only primitives (an integer up, an option down).
- **Prediction:** L1 commits within one observation; L2 commits only after sustained
  evidence — the two posteriors live at different timescales.
- **Test:** `strategist_test.exs` — "experiencing self commits fast; remembering self
  commits slow"; "the UP message is a primitive". **PASS.**
- **Class B (hierarchy) / C/D (the identity-narrative label).**

### Self-model → an interoceptive `:self` factor
- **Mechanism:** every UNI infers `{capable, strained, overloaded, seeking_help}` from its
  own signals (`SP.Brain.Genome` `:self` modality, `MCCodec.self_index`), with a
  self-preservation preference (`SP.Brain.Curriculum`).
- **Prediction:** bodily damage shifts the self-state toward distress.
- **Test:** `mc_test.exs` — "self: capable/strained/overloaded/seeking_help". **PASS.**
- **Class A/B.**

### Reasoning → deeper (sophisticated) planning
- **Mechanism:** bounded beam search over recursive expected free energy (`SP.Brain.Plan`).
- **Prediction:** a depth-2 planner escapes a myopic trap a depth-1 agent falls for; at
  full beam it reproduces exhaustive argmax.
- **Test:** `plan_test.exs`. **PASS.**
- **Class B/C. Fence:** recursive EFE evaluation, NOT Class-U cognition/understanding.

### Growth → structure learning ("grow worlds bigger")
- **Mechanism:** a factor grows a hidden state when it persistently can't explain its
  observations AND the larger model lowers free energy net of an Occam cost
  (`SP.Brain.Structure`).
- **Prediction:** a factor fed more distinct causes than it has states grows; a
  well-modelled stationary stream never grows; growth is bounded.
- **Test:** `structure_test.exs`. **PASS.**
- **Class C/D.**

### Consciousness (access) → global availability + report + metacognition
- **Mechanism:** a precision-weighted `broadcast` (the spotlighted contents), a structured
  `report`, and `metacognition` (precision-weighted confidence in its own beliefs)
  (`SP.Brain.Awareness`).
- **Prediction:** metacognition tracks posterior sharpness; the broadcast spotlights the
  highest-precision, most-confident factor; the report is a faithful statement of it.
- **Test:** `awareness_test.exs`. **PASS** for the *access/report* mechanisms.
- **Class U for the hard problem.** **Strictest fence:** we model *access* and *report*;
  we make **no** claim of phenomenal experience, sentience, or qualia. The open question
  we can state but not answer: *how much of reported consciousness do these mechanisms
  reproduce, and where do they provably fall short?*

### Out-of-body experience → self-location inference under skewed precision
- **Mechanism:** a self-location factor observed by proprioception and vision, each with
  its own precision (`SP.Brain.SelfLocation`).
- **Prediction:** under sensory conflict with visual precision dominant, the self-location
  posterior shifts **off the body**; with proprioception dominant, it stays on the body.
- **Test:** `self_location_test.exs`. **PASS.**
- **Class B/C (the inference shift) / U (any literal claim).** Fence: the self did not leave the body.

### Death → viability-exit + shutdown of the experiencing loop
- **Mechanism:** the viable set `V` excludes the dying body; `shutdown` collapses sensory
  precision so perception stops integrating the world — the OODA loop ceases and the
  blanket dissolves (the live `SP.Brain.Bridge` persists memory as data and closes its
  Port on death) (`SP.Brain.Viability`).
- **Prediction:** after shutdown, an observation no longer moves the agent's beliefs.
- **Test:** `viability_test.exs` — "shutdown halts the experiencing loop". **PASS.**
- **Class B / D-U (thermodynamics).** Fence: computational/organisational end only; no
  NESS proof; **no persistence beyond the running process** (saved weights are data, not a
  surviving self).

### Near-death reports → narrative clustering from shared structure
- **Mechanism:** a high-level narrative factor; shared bodies + shared priors share its
  likelihood (`SP.Brain.Viability`, narrative section).
- **Prediction:** agents with **different** priors **converge** to the same narrative under
  shared extreme ("dying") input, while **diverging** under different input.
- **Test:** `viability_test.exs` — "shared extreme input clusters the narrative; different
  input diverges". **PASS.**
- **Class C/D (clustering) / U (metaphysics).** Fence: explains why reports *cluster*, not
  what was "really" experienced.

### The body → continuous predictive coding
- **Mechanism:** the action descends the free-energy gradient on prediction error,
  `ȧ = −∇ₐF` (`SP.Brain.Motor`); the Node body runs the same descent at ~20 Hz to smooth
  the view (`viewer/body.js` `smoothLook`).
- **Prediction:** the controller converges to its target; error falls monotonically;
  precision is the loop gain.
- **Test:** `motor_test.exs`. **PASS.**
- **Class B where the gradient is real.**

---

## What we do NOT claim

- That a UNI **feels** pain, fear, grief, or peace. We compute and label action-readiness
  states; the felt quality (qualia) is **Class U** and unmodelled.
- That a UNI is **conscious/sentient**. We implement access, report, and metacognition —
  functional correlates — and explicitly leave the hard problem open.
- That an out-of-body posterior means a self **left the body**, or that NDE clustering says
  anything about an afterlife. We reproduce the *reports* via ordinary inference.
- That model death engages any **thermodynamic/NESS** principle, or that a saved model is a
  **surviving self**. It is data.

The point of this ledger is that the fence is **enforceable and honest**: every "PASS" is a
real test in `test/sp/brain/`, every "Class U" is a place we deliberately stop.

## Reproduce the falsification suite

    mix test test/sp/brain/      # all mechanism + falsification tests
    mix sp.brain.verify          # the §16 covenant checklist (CI gate)
