# How to PROVE — or FALSIFY — the UNI

This project lives or dies by being **falsifiable**. Nothing here asks for trust: every claim is
recomputed from the running code, and below is exactly how to **break** each one if it were false.
A claim you cannot imagine falsifying is not science.

## Observe it in one command
```
mix sp.uni.prove
```
Recomputes and prints PASS/FAIL with evidence for all six claim-groups below. No live Minecraft
needed; runs on any machine with Elixir. Also: `mix sp.brain.verify` (the §16 gate checklist) and
`mix test` (the full suite).

---

## The claims, and how to falsify each

### 1. It is NOT a mimic — no LLM, no foreign mind, no network
- **Observe:** `mix sp.uni.prove` §1 · `mix sp.brain.verify` gates 14/17/18 · `sed -n '/defp deps/,/]/p' mix.exs` → `[]`.
- **Falsify:** add ANY of `Nx.`, a NIF, `System.cmd`, `Port.open`, `HTTPoison`/`Req`/`:httpc`, or the
  words `openai`/`anthropic`/`api_key` to a `SP.Brain.*`, `SP.Runtime.*`, or `SP.Producer.*` file →
  gates 14/18 turn `FAIL` and the build breaks. (Gate 18's detectors are themselves unit-tested in
  `test/sp/brain/validation_engine_test.exs` — they're proven to bite.) There are zero hex deps, so
  there is no library an LLM could hide in.

### 2. The math IS active inference — matched to an independent oracle
- **Observe:** `mix sp.uni.prove` §2 · `mix sp.brain.verify` gates 1,2,3,5,7. The Python/scipy oracle
  is `uni/brain/active_inference.py`; gate 1 checks `digamma ψ(x) ≈ scipy` to **1e-6**.
- **Falsify:** perturb any update equation (e.g. use `ln(B·s)` instead of `(ln B)·s`) → gate 2's
  Jensen gap vanishes (`FAIL`); break the VFE bound → gate 3 fails (`F < −ln p(o)`); materialise the
  joint instead of mean-field → gate 5 fails (`belief_size ≠ Σ Nf`). Or compute the same equations
  yourself / in pymdp and diff — they must match to 1e-6.

### 3. It is DETERMINISTIC — a stochastic mimic cannot be
- **Observe:** `mix sp.uni.prove` §3, or
  `mix run --no-start -r runs/real_evidence.exs` / the determinism snippet (same seed → byte-identical
  action sequence AND model hash; different seed → diverges).
- **Falsify:** find ANY two runs at the same seed that differ. (You can't — there is no RNG outside
  the seeded `SP.Determinism`.)

### 4. The AGENTS genuinely learn — a generative model, not a script
- **Observe:** `mix sp.uni.prove` §4 (Dirichlet mass grows with steps) ·
  `mix run --no-start -r runs/real_evidence.exs` (a live agent's persisted brain: +tens-of-thousands
  of observation-counts folded into its likelihood `A`; learned columns peak from a flat prior).
- **Falsify:** show the Dirichlet counts (`model.subs[].pa`) do NOT change as the agent steps, or that
  actions don't derive from `(model, obs, seed)`. (The "model learns" test in `mc_test.exs` pins this.)

### 5. The PRODUCER learns to READ free language — no keywords, no LLM
- **Observe:** `mix sp.uni.prove` §5, or `mix test test/sp/brain/reader_test.exs`. It classifies
  unseen paraphrases ("count the agents" → `:count`) AND returns `:unsure` on words it hasn't learned.
- **Falsify:** find a paraphrase made only of trained words that it mis-reads, or gibberish it answers
  confidently (it must say `:unsure`). Or show its accuracy does NOT improve after `Reader.learn`.

### 6. The PRODUCER learns to SPEAK — measurably (surprise = free energy)
- **Observe:** `mix sp.uni.prove` §6 — `Reader.surprise/3` = `−ln p(text|meaning)`, the FEP quantity
  the engine minimises (a measurement, not a mechanism): LOW on learned/on-topic text, HIGH on
  word-salad. `Reader.compose/2` generates from the learned transitions.
- **Falsify:** show surprise does NOT drop as the corpus grows, or that learned and random text get
  the same surprise. **Honest ceiling:** this is bigram/topic-grade — short, on-topic, not fluent
  prose. It is real learning, not human fluency (rung 4 — grammar/composition — is open frontier).

### 6b. The producer speaks GROUNDED — never a fact it cannot see (no hallucination)
- **Observe:** `mix sp.uni.prove` §7 · `mix sp.brain.verify` gate 19 — every UNI-name / number in a
  spoken line must be present in the live state it was generated from, AND the check provably
  REJECTS an injected fake name (`SP.Brain.Speaker.grounded?/2`). The producer also LEARNS from its
  own speech (`SP.Brain.Anchor.observe/1`) — one faculty, learning all it says + is asked.
- **Falsify:** produce a line that names a UNI not in the cast or cites a number not in state, and
  have gate 19 pass it. (It can't — the gate fails the build. Captions stay the grounded grade-4
  Narrator; the learned voice grows underneath and only takes the line once it measurably matches.)

### 7. The blanket holds — the action-brain receives only symbolic σ (no raw pixels, no leakage)
- **Observe:** `mix sp.brain.verify` gates 8/9 (`bridge_test.exs`); the live σ is symbolic channels
  (`runs/see_probe.exs`). Live: RCON `127.0.0.1:25575 "list"` shows the UNIs are real Minecraft players.
- **Falsify:** find a coordinate or raw pixel array crossing into the agent's `cmd/2`, or a sim feeding
  its senses (gate 17 forbids it). The action-brain is Dirichlet-CATEGORICAL — it cannot ingest a
  frame; it only ever receives discrete σ bins. (Vision-primary, §8, adds ONE more discrete bin — a
  learned scene-state — never pixels.)

### 8. It SEES (vision-primary) — yet the blanket still holds: pixels stay in a pure-FEP cortex
- **What:** opt-in, a UNI's first-person POV pixels are inferred by a pure-FEP VISUAL CORTEX
  (UNI.OS `DiscretePatchMarkovWorld`: 8×8 patch codes → Dirichlet-HMM, exact forward–backward,
  `−F = log-evidence`) into ONE discrete SCENE-STATE, which crosses the blanket as a `:scene` σ
  channel — exactly like `:prey`/`:build`. The action-brain reasons over the scene; it never touches a pixel.
- **Observe:** `mix sp.uni.prove` §8 (a vision-primary brain develops the `:scene` factor, ingests a
  scene-state bin, and acts — the percept is a discrete integer, not pixels). Cross-repo: UNI.OS
  `pytest tests/aion_vwm/test_vision_bridge_nn_free.py` proves the cortex is NEURAL-NET-FREE, and its
  free energy DROPS on real captured frames (it learns to see — see UNI.OS `docs/falsifiable_claims.md`).
- **Falsify:** find a raw pixel/frame array reaching `SP.Brain.MC.cmd/2` or the `:scene` factor (only
  an integer `0..N-1` ever does); or add a `torch`/`tensorflow`/`transformers` import to any vision-bridge
  module and watch the NN-free audit FAIL. Pixel I/O plumbing (opencv/ffmpeg/GL) is allowed; a LEARNED
  foreign model is not. The covenant is EXTENDED (a new symbolic channel + an audited-pure cortex),
  **not weakened** — gates 8/9/17/18 stay green.

---

## The standing invitation
Disconnect every tool the author has — `mix sp.uni.prove`, `mix sp.brain.verify`, and `mix test`
still run, and the live colony keeps deciding on its own node. If any line above is fake, one of
these checks will catch it. Bring the hardest test you have.
