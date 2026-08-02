# The Producer's Language Faculty — grade-4, pure UNI, openly falsifiable

The Producer narrates and answers in **English, Mandarin, Hindi, Spanish, and Arabic**. There is
**no language model** (gates 14/15 forbid any foreign/neural compute layer). Language is produced
from **designed priors** the way every UNI acts: a generative model proposes structure, expected
free energy selects it, and a grammar renders the surface. This document states the claim, the
method, and exactly **how to break it**.

## The claim
> The Narrator UNI (`SP.Brain.Narrator`) writes a colony **scene paragraph** that meets a
> published **grade-4** reading/writing contract, deterministically, with no neural model — and
> reads (comprehends) questions about the show at the same level (`SP.Brain.Anchor`).

Run it yourself:

```
mix sp.brain.readability     # prints paragraphs + per-metric scores + PASS/FAIL
mix sp.brain.verify          # gate "16 · scene meets the grade-4 contract" (with the §16 gates)
mix test test/sp/brain/{narrator,readability,anchor}_test.exs
```

## How language is produced (not a phrasebook)
1. **Rhetorical move = active inference.** A tiny `SP.Brain.Factors` model
   (`SP.Brain.Narrator.model/0`; factors `stage × last_relation`, actions
   `{cause, contrast, temporal, conclude}`) infers the next move by EFE under young-writer
   priors: open, develop with a **varied** relation, build a short arc, conclude in 3–5
   sentences. It is gated by §16 like every UNI (stochastic B, mean-field, deterministic).
2. **Surface = compositional grammar.** Each move is realized from authored **lexicon**
   (verb-phrases by activity, state predicates, mood clauses, colony fragments) and **per-language
   clause templates**, in present tense. Two genuine clauses joined by a connective; the cast is
   named, then referred to with a pronoun.

So the *structure* is generated and the *words* are composed from priors — neither looked up
whole nor produced by a neural net.

## The grade-4 contract (the rubric — pure arithmetic, `SP.Brain.Readability`)
A sample is one paragraph (a list of sentence strings). It PASSES iff:

| # | check | threshold |
|---|---|---|
| 1 | multi-clause fraction | ≥ 0.60 |
| 2 | distinct connectives | ≥ 3 of {because, so, but, then, when, while, and, …} |
| 3 | cause→effect (because/so) | ≥ 1 |
| 4 | naked pronoun before a name is introduced | = 0 |
| 6 | most-repeated opening word | ≤ 0.60 |
| 7 | sentences in the paragraph | 3–5 |
| 8 | mean words / sentence | 7–16 |
| – | structural grade index | in [3.0, 5.0] |

The **grade index** is a fully-disclosed custom formula (no neural scoring):

```
grade = 2.0 + 1.2·(mean_clauses − 1) + 0.15·(mean_words − 6)
```

so a one-clause ~6-word sentence ≈ grade 2; a two-clause ~11-word sentence ≈ grade 4. Tense
consistency (one tense throughout) and grammaticality are enforced **by construction** (the
realizer only emits present-tense, well-formed clause templates) and asserted in the tests.

## How to falsify it (please try)
- **Dispute the formula.** `grade_index/0` is arithmetic; argue the constants are wrong and
  recompute. If a different defensible readability metric puts the output below grade 4, that
  breaks the claim.
- **Find a breaking colony.** Edit a fixture in `mix sp.brain.readability` (or feed a live board)
  and find a scene that drops below the contract.
- **Check determinism.** Same cast ⇒ identical paragraph (`mix test` asserts it). A nondeterministic
  output breaks the "pure UNI" claim.
- **Check the covenant.** `mix sp.brain.verify` gate 14 asserts no foreign layer in `SP.Brain.*`.
  Find an `Nx`/`nif`/`System.cmd`/`Port`/neural dependency in the language path and the "no LLM"
  claim is broken.

## Honest limits
- **English is self-certified.** The harness measures English (the primary caption). The other
  four languages mirror the **same generated structure** with authored templates; they are
  present-tense and structurally parallel, but a **native-speaker review** would harden idiom and
  agreement, especially **Arabic** (nominal sentences, case) and **Hindi** (gender). Those are
  flagged here precisely so the gap is visible, not hidden.
- **Grade 4 is pinned to this rubric**, not a human judgment. The rubric is the falsifiable
  proxy; if you think it is too lax or too strict, the formula and thresholds are right here to
  argue with.
- **It is a faculty, not fluency.** It writes *about the show* (the colony, the producer's own
  state) at grade-4 structure. It cannot discuss arbitrary topics — by covenant, not by accident.
