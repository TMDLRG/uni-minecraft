# Producer Language & Speaking Uplift — a genuinely-speaking UNI that manages the show, live

> Companion to docs/UNI_SIGHT_PLAN.md and docs/FALSIFICATION.md. Status: APPROVED, in progress.

## Context
The producer UNI already DIRECTS the show by active inference (EFE over telemetry → camera cuts,
narration beats, colony/health) and now READS free language (rung 1–3: `SP.Brain.Reader` — learned
word→meaning, online learning, `compose`, `surprise`/free-energy). It SPEAKS today via:
- `SP.Brain.Narrator` — a FEP move-selector + AUTHORED, GROUNDED, grade-4, multilingual clause
  templates (fact slots bound from live state ⇒ no hallucination), certified by `SP.Brain.Readability`.
- `SP.Brain.Anchor` — Q&A (learned reading + grounded handlers).
- `SP.Brain.Director.narration_line/add_line` + the producer's `{:line, u}` beat — the live caption
  seam shown on `/stream`.

**The gap.** The producer's SPEECH is still largely AUTHORED templates, not LEARNED. To be a
genuinely-speaking UNI that manages the show in its OWN voice, its narration + answers +
announcements must be COMPOSED from a language model it LEARNS (from a corpus + its own show) while
staying GROUNDED (facts from live state, never invented). No LLM (gate 18), falsifiable (grade-4 +
surprise-drop + a NEW grounding gate), deterministic, pure FEP.

**Honest ceiling.** Pure-FEP language is n-gram/HMM/topic-grade — coherent, on-topic, grade-4,
growing with the corpus — NOT LLM-fluent. Rung-4 grammar/morphology is the open frontier and may
hit a wall; we measure where, honestly. The grounding constraint deliberately bounds generation so
the producer never states a fact it cannot see.

## Approach (phased; each independently shippable + falsifiable)

### Phase A — Corpus + the learning loop
Seed corpus = language priors (show-relevant authored phrases + optional small public-domain text
under `priv/corpus/`). Online learning from the SHOW (its own narrations, the questions, event
descriptions) — self-supervised, no drift. Persist (`runs/producer_reader.bin`) so language
survives restarts. Reuse `Reader.learn`/`learn_corpus` + Anchor online-learning.

### Phase B — Richer learned generation (rung 4: word order + morphology)
Extend `SP.Brain.Reader`: higher-order transitions (trigram w/ backoff to bigram/unigram) for word
ORDER; light morphology (deterministic inflectional stemmer: strip `-s/-ed/-ing/-est/-ly`) so
inflections generalise. `compose/2` → beam search (length/fluency); `surprise/3` stays the
falsifiable learning metric. Honest: short coherent clauses, not fluent paragraphs.

### Phase C — Grounded learned speech + a GROUNDING GATE
New `SP.Brain.Speaker`: (1) choose STRUCTURE (Narrator move-selector / Anchor intent), (2) bind
FACT SLOTS from live state (names/counts/health — never invented), (3) REALIZE the surface from the
LEARNED model (`Reader.compose`) inside the slot frame. NEW §16 grounding gate
(`SP.Brain.ValidationEngine`): every fact-token in an utterance ⊆ the state it came from. Certify
generated speech at grade-4 via `SP.Brain.Readability`.

### Phase D — Live: the speaking producer manages the show
Route the producer's voice through the Speaker: `Director.narration_line` (captions), the producer
`{:line, u}` beat, `Anchor` answers, and a new cut-announcement — all composed, learned, grounded.
EFE decisions unchanged; only the VOICE is uplifted. Apply live with NO blackout (hot-load on
`uni@Thinker`; no model-shape change ⇒ no colony reset). Observe on `/stream`.

### Phase E — Observable proof
Extend `mix sp.uni.prove` (language): corpus size, surprise DROP over a training pass, readability ≥
grade-4 on generated speech, the grounding gate (no hallucinated facts), live samples. Update
`docs/FALSIFICATION.md`.

## Critical files
`lib/sp/brain/reader.ex` · NEW `lib/sp/brain/speaker.ex` · `lib/sp/brain/anchor.ex` ·
`lib/sp/brain/narrator.ex` + `narration.ex` · `lib/sp/brain/director.ex` · `lib/sp/producer.ex` ·
`lib/sp/brain/readability.ex` · `lib/sp/brain/validation_engine.ex` (+ grounding gate) ·
`lib/mix/tasks/sp.uni.prove.ex` · NEW `priv/corpus/` · `docs/FALSIFICATION.md`.

## Verification
`mix test` (Reader/Speaker: stemmer generalises, grounded compose binds facts, no hallucination) ·
`mix sp.brain.verify` (grade-4 gate 16 + NEW grounding gate + gate 18 no-LLM green) ·
`mix sp.uni.prove` (surprise drops with corpus; readability ≥ grade-4; grounding holds). Falsifiable:
inject a fact not in state → grounding gate FAILS. Live: hot-load, no blackout, observe on `/stream`.

## Honest risks / ceiling
Pure-FEP fluency ceiling (n-gram/HMM/topic-grade, not LLM). Grounding bounds generation (no
hallucinated facts — a feature). Corpus size gates fluency; learning from own output risks echo
(mitigated by the authored seed + grounding/keyword teachers). No LLM, no RL, deterministic, gates
green; EFE decisions untouched — only the VOICE is uplifted.
