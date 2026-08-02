# WELCOME TO UNI LABS — narrative outline (the DOCUMENTARY cut)

**This is a scoping artifact, not narration.** No final prose is written here. Each beat carries an
*intent* — one line saying what that beat has to accomplish — plus the visual and the receipt. Prose
comes next, per beat, and is synthesised locally by `piper` per
`lab/film/welcome/TOOLCHAIN.md`.

**Scoped LONG first, deliberately.** The operator's production ladder: plan the ~36-minute
documentary, then derive the 12-minute main cut and the 3-minute short from it. Scoping long is the
cheapest act available; any smaller frame authored first silently drops a wing, and the wing it
drops is always the same one — the honest state, because it is the least comfortable to keep.

---

## Two corrections to the brief, made before the work rather than after it

**1. M0..M9 is ten movements, not nine.** The brief says "the nine movements (M0..M9)" and then names
ten things: invitation, mission, estate, how to watch, how it works, the truth machine, the honest
state, the cookbook, how to engage, the close. Ten names, ten identifiers, one wrong count. This
outline uses **ten movements, M0 through M9**, with those ten names in that order. The discrepancy is
recorded here rather than silently resolved, because a count corrected in silence is how
`CLAUDE.md`'s own banner came to say 25 gates in one paragraph and 23 in another.

**2. `lab/film/welcome/SPINE.json` does not exist.** Checked 2026-08-01. This document is therefore
the spine's *source*, not its rendering. When `SPINE.json` is authored it must be **generated from
this file**, not typed beside it — the estate has already paid for the other arrangement
(`viewer/generate_state_blocks.cjs`, and the six-place drift it exists to stop).

---

## The house rule this film inherits

`lab/film/script/reels_cues.json` — `reel3_proven`:

> "We took three big, beautiful, hopeful ideas about the universe, and we tested every one of them,
> fairly, all the way down. And across the entire film, we never once used the word proven."

**That boast is a constraint, and this film matches it exactly.** The word is not a stylistic tic to
avoid — it is a **banned token in this estate's machine-checked vocabulary**:
`production/schemas/claim_fence.json` fences `prov(e[sd]?|en|ing)` and `proof`, case-insensitive,
word-boundary-anchored, alongside the consciousness, life, experience and over-claim families.

Three consequences, all binding on the narration:

- **The narration never speaks that token, in any inflection.** Not in a claim, not in a denial, not
  in a joke. `lab/film/QC.md` recorded the same check for TRAVELERS — *"Word 'proven' anywhere in 67
  min of narration? ✅ never"* — and it was a hand-typed check on a hand-typed sheet. Here it is a
  gate: the narration corpus is run through the fence regex built from `claim_fence.json` before any
  audio is synthesised, and a hit fails the build.
- **The fenced families are fenced too.** No "conscious", "sentient", "self-aware", "alive",
  "living", "experience", "feels", "suffers", "world-first", "breakthrough", "AGI", "human-level".
  Where a beat below needs to gesture at one of these, it names *what a gate demonstrated* instead.
- **One place the token legitimately appears on screen, and never in the voice.** The cookbook's UNI
  fence uses `proven` as a *ledger value*
  (`UNI.Architect/UNI-Encyclopedia-Cookbook/encyclopedia/CLAIM-LEDGER.md`), while this repository's
  fence *bans the same token*. That divergence is real, it is a finding, and it is beat **W-M7-03**.
  When that ledger is on screen the word is legible on the card; the narrator does not say it.

**This outline was run through the fence, and it failed.** Six of its own lines carried fenced tokens
on the first pass — `living` in W-M2-05, `felt` in W-M4-04, `proof` in W-M6-03, W-M6-08 and W-M8-01,
and `re-proved` in the production constraints. All six are repaired above. Recording the failure
rather than quietly fixing it is the point: a scoping document that declares a fence gate and then
does not survive it is exactly the class of self-inconsistency this estate keeps paying for. Two
exemptions are declared for the gate rather than discovered later: **receipt paths are exempt** (a
filename such as `L12-creativity-awareness.md` is a citation, not a claim), and **on-screen quotation
is exempt while the voice is not** (W-M6-03 and W-M7-03 both show a fenced token and paraphrase it
aloud).

TRAVELERS is **not** reused. Different film, different subject — ozone, pressure, bioenergetics.
Nothing from `lab/film/script/MASTER_SCRIPT_EN.md` or the five segment cue files is carried across.
What *is* carried across is the discipline, and one self-implicating fact about TRAVELERS itself
(beat **W-M6-12**).

---

## Running time — how the estimate was derived, and why it is an estimate

| input | value | source |
|---|---|---|
| TRAVELERS EN narration | ~10,165 words | `lab/film/QC.md:18` |
| TRAVELERS spoken duration | ~67 min | `lab/film/QC.md:18` |
| implied rate | **~152 words/min** | derived from the two above |
| Piper measured, this machine | 4 words → 1.683 s → **~143 wpm** | `lab/film/welcome/TOOLCHAIN.md:44-46` |
| planning rate used here | **150 wpm** | midpoint, stated so it can be checked |

At 150 wpm, **36:00 ≈ 5,400 narration words ≈ 74 words per beat across 73 beats.**

**This is an estimate and is labelled as one.** The real duration is the sum of the measured WAV
durations, which only exist after `synth_narration.cjs` runs and writes `audio_manifest.json` (voice
model, sha256, exact text, output duration per beat — `TOOLCHAIN.md:52-56`). The QC sheet for this
film is **generated from the gate's output**, precisely because `lab/film/QC.md` states 143 scenes in
its probe table while its own segment table sums to 157 (`TOOLCHAIN.md:70-74`). A hand-typed running
time is a claim with a half-life. This one is marked PREDICTED until the manifest exists.

### Movement map

| id | movement | beats | in | out | duration | share |
|---|---|---:|---|---|---:|---:|
| **M0** | INVITATION | 5 | 00:00 | 02:30 | 2:30 | 6.9% |
| **M1** | THE MISSION (intent, not measurement) | 6 | 02:30 | 05:30 | 3:00 | 8.3% |
| **M2** | THE ESTATE | 8 | 05:30 | 09:30 | 4:00 | 11.1% |
| **M3** | HOW TO WATCH | 5 | 09:30 | 12:00 | 2:30 | 6.9% |
| **M4** | HOW IT WORKS | 8 | 12:00 | 16:00 | 4:00 | 11.1% |
| **M5** | THE TRUTH MACHINE | 8 | 16:00 | 19:45 | 3:45 | 10.4% |
| **M6** | **THE HONEST STATE** | **12** | **19:45** | **25:45** | **6:00** | **16.7%** |
| **M7** | THE COOKBOOK | 7 | 25:45 | 29:15 | 3:30 | 9.7% |
| **M8** | HOW TO ENGAGE | 9 | 29:15 | 33:30 | 4:15 | 11.8% |
| **M9** | THE CLOSE | 5 | 33:30 | 36:00 | 2:30 | 6.9% |
| | **TOTAL** | **73** | | | **36:00** | 100% |

**M6 opens at 19:45 of 36:00 — 54.9% of the running time.** Not at the end, and this is not a
preference. `CLAUDE.md`'s communication contract is explicit: *"A `FAIL`, a retraction, a falsified
prediction, a `NOT_CLEARED` — these are spoken and said **first**, never appended at the end where
they read as a footnote."* Ten and a quarter minutes of film run **after** the honest state — the
cookbook, the engagement, the close. Everything that follows has to survive it. An adverse result the
audience can still walk out on is a caveat; an adverse result the rest of the film must live with is
a finding.

---

## Threads that cross movements

Three ideas are too big for one movement and are deliberately braided:

- **FALSIFIER THREAD** — *what a falsifier is* (M5), *what it looks like when the estate is caught*
  (M6), *the drill you personally run* (M8). Beats: `W-M5-07`, `W-M5-08`, `W-M6-05`, `W-M6-07`,
  `W-M8-04`, `W-M8-05`, `W-M8-06`.
- **TWIN-TERM THREAD** — every technical idea arrives twice, plain then precise, in the same breath.
  Never one or the other. Register below.
- **STOPS THREAD** — the things an agent, a visitor, or a contributor must not do, and why each
  prohibition protects evidence rather than protecting the estate. Beats: `W-M6-03`, `W-M8-08`,
  `W-M8-09`.

### Twin-term register (binding on narration)

Every row must appear in the film with **both** halves audible, in the same sentence, in this order:
plain first, precise second. The plain term is never dropped for brevity; the precise term is never
dropped for accessibility.

| plain (layman) | precise (science) | first appears |
|---|---|---|
| a good guess about what is out there | a posterior belief over hidden states | W-M4-01 |
| being surprised | surprisal, `−ln p(o)` | W-M4-02 |
| the running cost of being wrong | variational free energy, `F` | W-M4-02 |
| a hunch you brought with you | a prior | W-M4-03 |
| how much a body trusts its own senses | precision, `γ` | W-M4-04 |
| a plan judged before you act | expected free energy over policies | W-M4-05 |
| curiosity, made countable | the epistemic term, `H(qo) − E[H(o|s)]` | W-M4-05 |
| the same start gives the same run | seeded determinism, `SP.Determinism` | W-M4-06 |
| a promise written down before the run | a pre-registered gate | W-M5-02 |
| an honest scoreboard | the four verdicts: PASS / PARTIAL / FAIL / WITHHELD | W-M5-03 |
| a list of words we will not say | the claim fence | W-M5-04 |
| a receipt that can be re-derived | a hash-anchored ledger entry | W-M5-05 |
| a check that can actually bite | a gate with a mutation test | W-M5-06 |
| breaking our claim on purpose | falsification | W-M5-07 |
| we saw it | `OBSERVED` — a source-pinned recorded measurement | W-M3-02 |
| we rebuilt it | reconstruction / simulation / derived field | W-M3-02 |
| a different bug entirely | species boundary (*E. coli* vs *Salmonella* vs *Bacillus*) | W-M3-04 |
| the tail on a bacterium | the flagellar motor | W-M2-07 |
| the one computer everything lives on | the canonical host — "the chip" | W-M2-03 |
| the thing that says no to going live | the go-live guard, `presence_evident` | W-M6-08 |
| nature already ran the experiment | convergent evolution as constraint-optimum evidence | W-M7-05 |
| not everything is there for a reason | Gould & Lewontin 1979 — drift, inertia, spandrels | W-M7-06 |

---

## Hard production constraints (from the toolchain, measured)

1. **No live IPs, hostnames or keys on screen, ever.** The estate ran a remediation that converted 29
   live IP literals to names and re-ran the check to confirm it still bites (`viewer/ip_fence.cjs`, commit
   `7fdcfc0`). A film that puts `10.190.245.x` on a title card undoes that in one frame. Boxes are
   named — the chip, the studio, the relay — never addressed.
2. **No GPU, no WebGL, no Three.js.** Chrome is invoked `--headless --disable-gpu` and only ever
   screenshots a static SVG (`TOOLCHAIN.md:60-62`). A film about a laboratory that refuses to ship
   those things must not be rendered by them.
3. **No container in the build.** Piper is native on PATH. This is the specific defect that makes
   TRAVELERS unbuildable today, and the Welcome film must not inherit it (`TOOLCHAIN.md:8-28`).
4. **No music bed without Michael's explicit rights attestation**, and if one is added,
   `dgst/RIGHTS.md` must name the grant (`TOOLCHAIN.md:63-66`).
5. **Nothing is fetched at build time.** Every asset is on this machine or is generated by the build.
6. **The studio stays cold.** No OBS, no MediaMTX, no presence token, no go-live path is touched by
   this pipeline (`TOOLCHAIN.md:67-68`).

---
---

# M0 · INVITATION — 00:00 → 02:30 · 5 beats

*Job: get a stranger through the door without asking for a single unit of trust, and tell them the
worst news is coming at minute twenty so it does not feel like an ambush.*

**[W-M0-01 | FRAME]**
- **Intent —** Open on the door itself. This is a laboratory that publishes what it has measured and
  publishes what it has failed at, and you are about to be handed the tools to attack both.
- **Visual —** `door.html` rendered as a still, then the title card resolving out of it. Palette from
  the repo, no photography.
- **Receipt —** `viewer/door.html`; `viewer/hub.html`

**[W-M0-02 | FRAME]**
- **Intent —** Name who this is for: someone who has never seen the estate, has no account, and owes
  us nothing. Nothing here needs permission to read.
- **Visual —** The public site's front page as a still, the four top-level sections legible.
- **Receipt —** `UNI.Public/README.md`; `docs/PUBLIC_README.md:5-7`

**[W-M0-03 | CLAIM]**
- **Intent —** State the promise plainly: *"you can read every claim we have and every receipt behind
  it without asking us for anything"* — and say immediately that this promise is currently incomplete,
  because the source repositories are private (M8 carries the detail).
- **Visual —** The promise as a quote card, with a small amber marker on the word "every" pointing
  forward to beat W-M8-03.
- **Receipt —** `docs/PUBLIC_README.md:7`; `UNI.Public/generators/sources.json` (`visibility:
  private`)

**[W-M0-04 | FRAME]**
- **Intent —** Say what this film will not do. It will not tell you the estate has succeeded; it will
  not use the fenced words; it will not put a number on screen that a person typed rather than a
  machine generated.
- **Visual —** The fence classes from `claim_fence.json` as a legible list, animating in — the
  vocabulary that is off the table, on screen, before any argument is made.
- **Receipt —** `production/schemas/claim_fence.json`

**[W-M0-05 | FRAME]**
- **Intent —** Lay the shape of the next thirty-six minutes and flag the turn: at minute twenty this
  film stops describing the laboratory and starts listing what is wrong with it. That is not the
  ending; ten minutes run after it.
- **Visual —** The movement map as a timeline strip, M6 highlighted at the 55% mark, with the
  remaining third of the bar visibly still to come.
- **Receipt —** This document, § "Movement map"; `CLAUDE.md` § "Never bury an adverse result"

---

# M1 · THE MISSION — 02:30 → 05:30 · 6 beats

*Job: state the mission in full, once, and fence it as intent. The fence is the point of the
movement, not a footnote to it.*

**[W-M1-01 | INTENT]**
- **Intent —** Read the mission in full, unedited, as one sentence:
  *"worldwide peace through free and open understanding; the public pursuit and ownership of General
  Universal Natural Intelligence; the end of extract and extortion; making safe all wombs and Gaia —
  earth, our solar system and beyond."*
- **Visual —** Full-frame type, the whole statement at once, no animation, held long enough to read
  twice.
- **Receipt —** The operator's declaration, 2026-08-01. **Not currently held in any repository file.**
  Authoring it to `lab/film/welcome/MISSION.md` and citing that path is a prerequisite for this beat
  — see § "Open questions for the operator", Q1.

**[W-M1-02 | INTENT]**
- **Intent —** Immediately mark the whole statement: this is **intent**, and intent is a different
  class of thing from measurement. Nothing in it has been measured. Saying so is the first honest act
  of the film.
- **Visual —** An `INTENT — NOT MEASURED` badge lands on the mission card in the estate's own badge
  style, matching the truth-class badges used everywhere else.
- **Receipt —** `CLAUDE.md` § "Truth contract"; `docs/LAB_PROTOCOL.md` § VI (the claim fence)

**[W-M1-03 | INTENT]**
- **Intent —** Clause one — *worldwide peace through free and open understanding*. What would even
  count as evidence here? Say honestly: nothing in this estate measures it, and the only thing
  downstream of it that *is* checkable is whether the work is genuinely readable by a stranger.
- **Visual —** The clause isolated; beneath it, the one checkable descendant — the public
  documentation coverage figure — with its generator named.
- **Receipt —** `UNI.Public/safety/verify_coverage.cjs`; `UNI.Public/content/coverage-manifest.json`

**[W-M1-04 | INTENT]**
- **Intent —** Clause two — *the public pursuit and ownership of General Universal Natural
  Intelligence*. Say what "public" is cashed out as here: pre-registered gates, published negatives,
  a seed that reproduces a verdict. Say what "General" is **not** cashed out as: no claim of that
  kind exists in the ledger.
- **Visual —** Split card — left, the four things "public" means operationally; right, an empty
  column headed by the claim that has never been made.
- **Receipt —** `docs/PUBLIC_README.md:11-17`; `docs/gates/PUBLIC_GATE_LOG.md`

**[W-M1-05 | INTENT]**
- **Intent —** Clause three — *the end of extract and extortion*. The only operational shadow of this
  clause in the codebase is a product contract: CPU-only, no LLM inference, no analytics, no
  accounts, no hidden network calls. That is a small thing measured against a large thing said.
- **Visual —** The runtime prohibitions as a list, each with the file that enforces it; then the
  clause above them, visibly larger than its enforcement.
- **Receipt —** `UNI-FLAGELLUM/CLAUDE.md` § Mission (product contract); `mix.exs` (`deps` → `[]`);
  `docs/FALSIFICATION.md` § 1

**[W-M1-06 | INTENT]**
- **Intent —** Clause four — *making safe all wombs and Gaia — earth, our solar system and beyond*.
  Name the one thing in the estate that carries the name: Gaia is a projection surface with a lint
  gate, not a planetary claim. The gap between the name and the thing is stated, not smoothed.
- **Visual —** The Gaia surface rendered, its gate name beside it, then the clause above it at scale.
- **Receipt —** `viewer/gaia/gaia_server.cjs`; `viewer/gaia/gaia_lint.cjs`;
  `viewer/gate_registry.json` (`gaia`, `gaia-lint`)

---

# M2 · THE ESTATE — 05:30 → 09:30 · 8 beats

*Job: a map. Four repositories, three machines, one colony, one microscope, one public surface. No
addresses on screen.*

**[W-M2-01 | FRAME]**
- **Intent —** There are four repositories and they do four different jobs. Show them as a map before
  any of them is explained.
- **Visual —** Four-node diagram: UNI.Minecraft, UNI-FLAGELLUM, UNI-Encyclopedia-Cookbook,
  UNI.Public. Each with its one-line job.
- **Receipt —** `UNI.Public/generators/sources.json`

**[W-M2-02 | CLAIM]**
- **Intent —** Three machines with three non-overlapping roles, and the plain statement that *every
  failure this project has had came from conflating them*.
- **Visual —** Three boxes, named not addressed: **the chip**, **the studio**, **the relay**. Arrows
  one-way: chip → studio → relay.
- **Receipt —** `docs/UNIVERSE.md` § 1.1

**[W-M2-03 | CLAIM]**
- **Intent —** The chip — the one computer everything canonically lives on. The colony runs there,
  rootless, with no graphics hardware at all.
- **Visual —** The chip alone, its two surfaces labelled, the broadcast surfaces greyed out with
  "never, here".
- **Receipt —** `docs/UNIVERSE.md` § 1.1, § 1.2;
  `production/docs/adr/ADR-PROD-013-colony-host-placement.md`

**[W-M2-04 | CLAIM]**
- **Intent —** The studio and the relay, and the three-day failure that taught the split: overlays
  software-rendered to a black frame on a graphics-less machine. Say the failure, then the rule it
  produced.
- **Visual —** A black frame, held uncomfortably long, then the corrected topology.
- **Receipt —** `docs/UNIVERSE.md` § 1.1 (node2 row);
  `production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md:11-18`

**[W-M2-05 | CLAIM]**
- **Intent —** The colony: bodies inhabiting a real world, each running one predict-act tick from
  start to finish. Plain first — small agents that guess, act, and update; then precise.
- **Visual —** The world view still, then the tick decomposed into its stages.
- **Receipt —** `docs/UNIVERSE.md` § 0; `lib/sp/brain/`; `docs/SYSTEM_OVERVIEW.md`

**[W-M2-06 | CLAIM]**
- **Intent —** The producer: the thing that watches the colony and puts it into words and pictures —
  and the hard rule that it may never say a name or a number it cannot see in the live state.
- **Visual —** A spoken line, then the state it was grounded against, then the injected fake name
  being refused.
- **Receipt —** `docs/FALSIFICATION.md` § 6b; `SP.Brain.Speaker.grounded?/2`;
  `mix sp.brain.verify` gate 19

**[W-M2-07 | CLAIM]**
- **Intent —** The other laboratory: a bacterial flagellar motor — the tail on a single-celled
  organism, the smallest rotary engine anyone has measured — with licensed microscopy beside a
  deterministic reconstruction. Two different classes of thing, kept apart on purpose.
- **Visual —** Motor schematic; the observation and the reconstruction side by side with different
  badges.
- **Receipt —** `UNI.Public/generators/sources.json` (`uni-flagellum`);
  `UNI-FLAGELLUM/CLAUDE.md` § "Truth contract"

**[W-M2-08 | CLAIM]**
- **Intent —** The public surface: roughly 290 documents from these repositories, rendered as they
  are written, plus thirteen authored articles. Say the one rule the whole site is built on — every
  volatile number is generated from the repository it describes and carries the commit it was read
  from.
- **Visual —** The site's own six-row "what is here" table, live.
- **Receipt —** `UNI.Public/README.md`; `UNI.Public/content/articles/`

---

# M3 · HOW TO WATCH — 09:30 → 12:00 · 5 beats

*Job: hand the viewer the reading instrument before they need it. Every badge, verdict and boundary
they will see for the next twenty-four minutes.*

**[W-M3-01 | INSTRUCTION]**
- **Intent —** Everything on screen from here carries a label saying what kind of thing it is. Teach
  the label before the content.
- **Visual —** The badge set, isolated, each one held.
- **Receipt —** `viewer/honesty_card.json`; `docs/gates/PUBLIC_GATE_LOG.md` § "Evidence classes"

**[W-M3-02 | INSTRUCTION]**
- **Intent —** The first and hardest boundary: *we saw it* versus *we rebuilt it*. Only a
  source-pinned recorded measurement is `OBSERVED`. A reconstruction, a simulation, a derived field
  or a model output may never be relabelled as one — that relabelling has a name in this estate,
  truth laundering, and there is a mutation test that detects it.
- **Visual —** Two images side by side, one observed, one reconstructed, then the label swap
  attempted and caught.
- **Receipt —** `UNI-FLAGELLUM/CLAUDE.md` § "Truth contract";
  `viewer/lab/verify_shot.cjs --mutate`

**[W-M3-03 | INSTRUCTION]**
- **Intent —** The four verdicts, and the rule that there is no fifth: PASS, PARTIAL, FAIL, WITHHELD.
  Never percent-scored. A PARTIAL names exactly which sub-claim holds and which does not.
- **Visual —** The four words; then a real PARTIAL row expanded to show its two halves.
- **Receipt —** `docs/LAB_PROTOCOL.md` § II; `docs/gates/PUBLIC_GATE_LOG.md`

**[W-M3-04 | INSTRUCTION]**
- **Intent —** The species boundary, using the flagellar lab: behavioural evidence from one organism
  is never merged with structural evidence from another, and neither may be implied to have come from
  one measured specimen.
- **Visual —** Three organism cards, physically separated, with the merge animation refused.
- **Receipt —** `UNI-FLAGELLUM/CLAUDE.md` § "Truth contract"

**[W-M3-05 | INSTRUCTION]**
- **Intent —** The last reading rule, and the one that makes the rest usable: a failed, blocked,
  external or not-run gate stays visible. If you cannot find the failures on a surface, the surface
  is not finished.
- **Visual —** A gate list with its `ci:false` rows deliberately left in — listed, never run, never a
  fabricated pass.
- **Receipt —** `viewer/gate_registry.json` (`colony`, `hud`, `overlays`);
  `CLAUDE.md` § generated block `uni.state.gates`

---

# M4 · HOW IT WORKS — 12:00 → 16:00 · 8 beats

*Job: the science, twice — plain and precise, in the same breath, every time.*

**[W-M4-01 | CLAIM]**
- **Intent —** Start with the guess. A body cannot see the world; it can only see its own sensors. So
  it keeps a good guess about what is out there — a posterior belief over hidden states — and acts on
  the guess.
- **Visual —** A body, a wall between it and the world, and the guess drawn on its side of the wall.
- **Receipt —** `docs/UNIVERSE.md` § 2 (FEP in one page); `docs/specs/generative_model.md`

**[W-M4-02 | CLAIM]**
- **Intent —** Being surprised has a number. Surprisal is minus the log of how likely what you saw
  was. Free energy is the running cost of being wrong — an upper bound on that surprise, and the one
  quantity everything here minimises.
- **Visual —** The two quantities written out, units carried, with the bound drawn as a bound.
- **Receipt —** `docs/UNIVERSE.md` § 2; `docs/FALSIFICATION.md` § 2 (gate 3: `F ≥ −ln p(o)`)

**[W-M4-03 | CLAIM]**
- **Intent —** A prior is a hunch you brought with you. It is not a flaw — it is how anything
  survives a world it cannot see all of. It is also how a thing becomes certain too early.
- **Visual —** A flat prior and a peaked prior, same evidence, different conclusions.
- **Receipt —** `docs/specs/generative_model.md`; `docs/UNIVERSE.md` § 2

**[W-M4-04 | CLAIM]**
- **Intent —** Precision is how much a body trusts its own senses right now. It is a real parameter
  with a name, `γ`, and it is deliberately never dressed up as an inner state — the fence forbids it.
- **Visual —** The same signal at two precisions; then the fence card refusing the sentimental
  reading.
- **Receipt —** `docs/LAB_PROTOCOL.md` § V.2, § VI; `production/schemas/claim_fence.json`

**[W-M4-05 | CLAIM]**
- **Intent —** How a plan gets chosen: every candidate plan is scored before it is acted on, and one
  part of that score is curiosity made countable — how much a plan would reduce what the body does
  not know.
- **Visual —** Three policies scored side by side, the pragmatic and epistemic terms separated and
  labelled.
- **Receipt —** `docs/LAB_PROTOCOL.md` § V.2; `lib/sp/brain/`

**[W-M4-06 | CLAIM]**
- **Intent —** The same start gives the same run, byte for byte. Not approximately — identically.
  There is no random number generator anywhere outside the seeded one.
- **Visual —** Two runs at one seed, byte-identical; then the seed changed by one, diverging.
- **Receipt —** `docs/FALSIFICATION.md` § 3; `SP.Determinism`;
  `mix run --no-start -r runs/real_evidence.exs`

**[W-M4-07 | CLAIM]**
- **Intent —** What is *not* inside: no language model, no foreign mind, no network call. Zero
  external libraries at all — so there is no library a language model could be hiding in.
- **Visual —** `sed -n '/defp deps/,/]/p' mix.exs` on screen returning an empty list; then the
  detector list that fails the build if any of them appears.
- **Receipt —** `docs/FALSIFICATION.md` § 1; `mix.exs`; `mix sp.brain.verify` gates 14/17/18

**[W-M4-08 | CLAIM]**
- **Intent —** The fence between what a gate demonstrates and what it does not. Passing a behavioural
  gate demonstrates the named behaviour, and carries zero evidential weight for anything beyond it.
  This is stated by the estate about its own work, unprompted.
- **Visual —** A passing gate, then the wall, then the empty space on the other side of the wall.
- **Receipt —** `docs/LAB_PROTOCOL.md` § VI; `docs/PUBLIC_README.md` § "What we are careful not to
  say"

---

# M5 · THE TRUTH MACHINE — 16:00 → 19:45 · 8 beats

*Job: how a claim is made here, and — the beat this film exists for — how a stranger takes one apart.*

**[W-M5-01 | CLAIM]**
- **Intent —** The first law, stated as the estate states it: never stack changes such that you
  cannot account for the winning outcome. If two things changed, the result is unattributable and may
  not be claimed at all.
- **Visual —** A paired design: two arms, one variable different, everything else identical.
- **Receipt —** `docs/LAB_PROTOCOL.md` § I

**[W-M5-02 | CLAIM]**
- **Intent —** A gate is a promise written down before the run: PASS requires all of these; FALSIFIES
  if this. Registered before, judged only against itself.
- **Visual —** A real pre-registration document, its PASS and FALSIFIES clauses highlighted, dated
  before its run.
- **Receipt —** `docs/LAB_PROTOCOL.md` § II;
  `docs/receipts/red_preregistration_forage_pureworld_graduation.md`

**[W-M5-03 | CLAIM]**
- **Intent —** The ledger. Every gate the project claims has to be represented as a row, and the row
  names a real file whose bytes carry the evidence. State the measured size of that ledger now.
- **Visual —** `evidence/gates.ndjson` scrolling, with the generated tally card beside it.
- **Receipt —** `evidence/gates.ndjson`; `CLAUDE.md` generated block `uni.state.gate_ledger` — 207
  rows / 110 unique names; last row per name: 93 PASS · 4 PARTIAL · 12 PENDING · 1 FAIL

**[W-M5-04 | CLAIM]**
- **Intent —** The claim fence again, now as machinery rather than promise: a versioned JSON file,
  case-insensitive, word-boundary-anchored, with an agreement guard holding the JavaScript and Elixir
  copies to the same behaviour. A flagged line is dropped honestly, never reworded into a
  subtly-different claim.
- **Visual —** The fence file, then the two implementations, then the snapshot test that holds them
  equal.
- **Receipt —** `production/schemas/claim_fence.json`; `test/sp/brain/fence_snapshot_test.exs`

**[W-M5-05 | CLAIM]**
- **Intent —** The anchor: a hash chain over the control-plane ledger, so a changed history is
  visible. Say precisely what it gives you — tamper-evidence — and set up M6, where the film says
  what it does not give you.
- **Visual —** The chain, the tip hash, the anchor's declared length agreeing with it.
- **Receipt —** `CLAUDE.md` generated block `uni.state.control_plane` — 32 entries, tip
  `b90b7498…` at seq 32, anchor agrees; `evidence/control_plane/`

**[W-M5-06 | CLAIM]**
- **Intent —** A check that cannot fail is not a check. So the checks are attacked: a mutation is
  introduced on purpose, and the gate has to catch it. Show one doing exactly that in greyscale, with
  no text read.
- **Visual —** Two rendered fixtures, the mutation applied, the gate turning red.
- **Receipt —** `viewer/lab/verify_shot.cjs --mutate`; `viewer/lab/l6.html:52-53`;
  `viewer/gate_registry.json` (`lab-l0`…`lab-l6`)

**[W-M5-07 | INSTRUCTION]**
- **Intent —** **What a falsifier is.** Not a critic, not a sceptic — someone who takes a specific
  written claim, finds the exact condition under which it would be false, and goes and checks that
  condition. A claim nobody can imagine falsifying is not science.
- **Visual —** One claim on screen; beneath it, the estate's own written falsifier for it, in its own
  words.
- **Receipt —** `docs/FALSIFICATION.md` (opening); `docs/FALSIFICATION.md` §§ 1–6b

**[W-M5-08 | INSTRUCTION]**
- **Intent —** **Being caught is the product working.** Say it without hedging: if you break a claim
  here, the estate owes you a correction, and the correction is published where the claim was. That
  is not generosity — it is the only arrangement under which any of the rest of this is worth
  reading.
- **Visual —** A real retraction: a claim, its withdrawal, and the receipt that carries both.
- **Receipt —** `docs/PUBLIC_README.md:19` (*"that is a legitimate falsification and we owe you a
  correction"*); `docs/receipts/phase1_curiosity_red_CORRECTION.md`

---

# M6 · THE HONEST STATE — 19:45 → 25:45 · 12 beats · **54.9% in, never last**

*Job: say what is wrong, in order of severity, with the receipt for each — including the several
occasions on which this estate's own instruments caught this estate lying to itself. Ten and a
quarter minutes of film run after this movement, and every one of them has to survive it.*

**[W-M6-01 | FRAME]**
- **Intent —** Mark the turn out loud. Everything up to here described how the laboratory is supposed
  to work. What follows is what is actually true today, measured, and it is not flattering.
- **Visual —** Hard cut. Palette shift. The word HONEST STATE full frame, the clock visible at
  19:45 of 36:00.
- **Receipt —** `CLAUDE.md` § "Never bury an adverse result"

**[W-M6-02 | ADVERSE]**
- **Intent —** The off-box witness is compromised. The remote machine that was supposed to
  independently hold a copy of the ledger accepts the writer's own key. The count of independent
  custodians is zero. So the anchor stands on git alone: tamper-evident, and **not** unforgeable.
- **Visual —** The witness diagram with the independence arrow drawn and then struck through; the
  literal `independent_custodians: 0`.
- **Receipt —** `viewer/gaia/collectors.cjs:806-825`; `viewer/bag.cjs:17,81`; `CLAUDE.md` § "Four
  things that must not be softened", item 1

**[W-M6-03 | ADVERSE / STOP]**
- **Intent —** And the obvious fix is forbidden. Removing that key is the one repair an agent must
  not perform — using write access to erase the evidence of write access is not restoring a witness,
  it is destroying the last evidence that it happened. The defect stays visible until a human fixes
  it properly.
- **Visual —** The stop card, S1, quoted verbatim on screen. *(The plan's own wording uses a fenced
  token; it is legible on the card and paraphrased in the voice — same rule as `W-M7-03`.)*
- **Receipt —** `evidence/remediation/phase9_plan.json` → `stops[id=S1]`

**[W-M6-04 | ADVERSE]**
- **Intent —** The gate registry and the canonical ledger do not agree. Of 33 registered gates, 1
  appears in `evidence/gates.ndjson` and 32 do not — while the row schema says every gate the project
  claims must be represented there.
- **Visual —** Two columns, 33 and 1, the 32-wide gap drawn as a gap.
- **Receipt —** `CLAUDE.md` generated block `uni.state.registry_ledger_gap`;
  `viewer/generate_state_blocks.cjs`; `viewer/gate_registry.json`; `evidence/gates.ndjson`

**[W-M6-05 | ADVERSE / FALSIFIER]**
- **Intent —** Worse, and better: four governing documents said that intersection was *empty* for two
  weeks after a row had already landed — and they said it inside the very paragraph claiming these
  numbers were generated. They were hand-written. The instrument that caught it is the same
  instrument that now writes the number.
- **Visual —** The false sentence, then the row that falsified it, then the generator replacing the
  sentence.
- **Receipt —** `CLAUDE.md` generated block `uni.state.registry_ledger_gap`;
  `viewer/generate_state_blocks.cjs`

**[W-M6-06 | ADVERSE]**
- **Intent —** The governing document was wrong in seven places, corrected, then wrong in six more
  within six hours — including a next-instruction that told a fresh reader to rebuild something that
  had shipped six hours earlier. One of those numbers was false 176 seconds after it was written.
- **Visual —** The half-life, on a clock: 176 seconds, ticking.
- **Receipt —** `CLAUDE.md` §§ "Corrected 2026-07-28", "Corrected AGAIN 2026-07-29";
  generated block `uni.state.how_to_measure`

**[W-M6-07 | ADVERSE / FALSIFIER]**
- **Intent —** The third correction was of the second correction's own claim — and the reason is the
  sharpest thing in this film. The gate whose entire purpose is to catch a stale instruction could
  not see one of the three copies of the document it guards, because that copy was defined as a root
  and then declared as no document. The audit's own count was therefore an undercount: it reported
  five, and the true number was six.
- **Visual —** Three copies of the same banner; the instrument's beam illuminating two of them; the
  third, unlit, carrying the stale line.
- **Receipt —** `CLAUDE.md` § "Corrected A THIRD TIME 2026-07-30"; `viewer/state_blocks.cjs`
  (`OUT_OF_TREE`); `viewer/verify_claims.cjs`

**[W-M6-08 | ADVERSE]**
- **Intent —** The guard that refuses to put this estate on air is real, it covers every path, and it
  is honest about its own ceiling: its claim level is `presence_evident`, not unforgeable. A process
  cannot authenticate a person; it can only refuse whenever the evidence of one is absent, and name
  which condition failed.
- **Visual —** The six code paths that reached the live button, four of them with no check at all;
  then the guard refusing each, with the refusal text legible.
- **Receipt —** `viewer/golive_guard.cjs:1-30`; `viewer/gate_registry.json`
  (`golive-refuses-agents`)

**[W-M6-09 | ADVERSE / STOP]**
- **Intent —** And on the studio machine, the control socket that drives the broadcast has no
  authentication at all. That one is the operator's to close, not an agent's, and it is named in the
  stops so it cannot be quietly done.
- **Visual —** The port, unauthenticated, on the studio box; the S2 stop card beside it.
- **Receipt —** `CLAUDE.md` § "Four things that must not be softened", item 4;
  `evidence/remediation/phase9_plan.json` → `stops[id=S2]`

**[W-M6-10 | ADVERSE]**
- **Intent —** The science is not yet run. The gate that would graduate the colony is blocked on a
  pre-registered test whose runner does not exist — the file raises a scaffold error instead of
  executing. State it plainly: no verdict has yet been authored about a real scientific claim here.
- **Visual —** The runner file open at the `raise`, the pre-registration beside it, the contract
  visible in the exception text.
- **Receipt —** `runs/pureworld_qa_gate.exs:38-44`;
  `docs/receipts/red_preregistration_forage_pureworld_graduation.md`;
  `evidence/remediation/phase9_plan.json` → `road_to_air.gates[colony_on_program]`

**[W-M6-11 | ADVERSE]**
- **Intent —** The broadcast track record, entire: one go-live, six minutes against a four-hour slot.
  The emergency stop has never been fired by a human in the platform's life — and a kill switch that
  has never been pulled is a decoration.
- **Visual —** A four-hour bar with six minutes filled; then the unpressed button.
- **Receipt —** `evidence/remediation/phase9_plan.json` → `road_to_air.track_record`,
  `road_to_air.free_moves_today[A2]`

**[W-M6-12 | ADVERSE / SELF]**
- **Intent —** And this film's own predecessor cannot be rebuilt from its own source today. TRAVELERS
  synthesised its narration by copying audio out of a container that no longer exists — 143 hardcoded
  identifiers pointing at nothing — and its hand-typed quality sheet contradicts itself about how
  many scenes it has. That is why *this* film's build has no container in it and *this* film's
  quality sheet is generated.
- **Visual —** The `docker cp` line; the 143 identifiers; the two contradicting scene counts, 143 and
  157, on the same sheet.
- **Receipt —** `lab/film/welcome/TOOLCHAIN.md:8-28`, `:70-74`; `lab/film/QC.md:17`, `:30`

---

# M7 · THE COOKBOOK — 25:45 → 29:15 · 7 beats

*Job: introduce the cookbook as a thing a stranger takes home and uses tonight, and be exact about
the one place its vocabulary and this repository's vocabulary disagree.*

**[W-M7-01 | FRAME]**
- **Intent —** There is a second body of work here that is not a codebase at all: two books and a
  build, written so someone outside this estate can cook the same dishes.
- **Visual —** The repository as a shelf: encyclopedia, cookbook, the pack, the build.
- **Receipt —** `UNI.Architect/UNI-Encyclopedia-Cookbook/README.md`

**[W-M7-02 | CLAIM]**
- **Intent —** Two sovereign ledgers, and the rule that organises everything: one vocabulary
  describes what *this programme* has built; the other describes what *nature* has been observed to
  do. Merging them is the cardinal error. Reading a published law about biology raises nothing here.
- **Visual —** The two ledgers side by side, their value sets legible, the merge arrow refused.
- **Receipt —** `UNI-Encyclopedia-Cookbook/encyclopedia/CLAIM-LEDGER.md`;
  `UNI-Encyclopedia-Cookbook/encyclopedia/NATURE-LEDGER.md`

**[W-M7-03 | ADVERSE / VOCABULARY]**
- **Intent —** And here the estate disagrees with itself, on camera. One repository's fence **bans**
  a certain word outright; the other repository uses that same word as an admissible ledger value.
  Two books, one estate, opposite treatments of one token. It is on screen; it is not in this
  narrator's mouth; it is unresolved and it is the operator's to rule.
- **Visual —** The fence file's banned classes and the cookbook ledger's value row, side by side, the
  shared token highlighted on both. No voice-over of the token itself.
- **Receipt —** `production/schemas/claim_fence.json`;
  `UNI-Encyclopedia-Cookbook/README.md` § "The two sovereign ledgers"; § "Open questions", Q3

**[W-M7-04 | CLAIM]**
- **Intent —** The ladder: thirteen developmental rungs, L0 to L12, from a genome to the open
  questions at the top — and the honest position printed in the book's own front matter, that roughly
  two of eleven-plus rungs are earned.
- **Visual —** The ladder with two rungs lit and the rest dark; the printed position quoted.
- **Receipt —** `UNI-Encyclopedia-Cookbook/cookbook/recipes/L0-genome-zygote.md` …
  `L12-creativity-awareness.md`; `UNI-Encyclopedia-Cookbook/README.md`

**[W-M7-05 | CLAIM]**
- **Intent —** The NATURA recipes: twelve build catalogues, from rocks and water and air to stars,
  DNA, ants, whales, bats, humans — and the open question beyond. State why nature is treated as an
  authority at all: it is the only system that has already run the experiment, over a very long
  parallel search, with the failures deleted.
- **Visual —** The twelve recipe cards dealt out.
- **Receipt —** `UNI-Encyclopedia-Cookbook/cookbook/recipes-natura/CN-01-rocks.md` …
  `CN-12-beyond-human-open-question.md`

**[W-M7-06 | CLAIM]**
- **Intent —** And its counterweight, which travels with it everywhere: not every trait is an
  adaptation. Drift, inertia, developmental constraint and frozen accidents are real — the vertebrate
  retina is wired backwards. "Nature does it this way" generates hypotheses; it settles nothing, and
  the bio-inspired design still has to beat a tuned conventional baseline on a pre-registered metric
  or be recorded NEGATIVE.
- **Visual —** The backwards retina, drawn honestly; then the pre-registered-metric requirement.
- **Receipt —** `UNI-Encyclopedia-Cookbook/README.md` § "Nature as the authority" (Gould & Lewontin
  1979)

**[W-M7-07 | INSTRUCTION]**
- **Intent —** **How to take it home.** Clone the repository; the books are plain markdown you can
  read in any editor. Run the build to produce the pack for your own assistant; run the site
  generator, which is standard-library Python only — no packages to install, nothing fetched. Start
  at the two index files. Everything needed is in the clone.
- **Visual —** Three commands on screen, executed, with their real outputs.
- **Receipt —** `UNI-Encyclopedia-Cookbook/tools/build_gpt_pack.py`;
  `UNI-Encyclopedia-Cookbook/deploy/deploy_cookbook.py`;
  `UNI-Encyclopedia-Cookbook/cookbook/00-INDEX.md`;
  `UNI-Encyclopedia-Cookbook/encyclopedia/00-INDEX.md`;
  `UNI-Encyclopedia-Cookbook/gpt/README-START-HERE.md`

---

# M8 · HOW TO ENGAGE — 29:15 → 33:30 · 9 beats

*Job: turn a viewer into a falsifier and a contributor, with steps they can execute, and be honest
about which of those steps does not work today.*

**[W-M8-01 | INSTRUCTION]**
- **Intent —** Start where a stranger starts: the public site. Thirteen articles, roughly 290
  documents from the repositories rendered as written, the gates, the receipts, the computed coverage
  and — deliberately — a page listing everything that was withheld and why.
- **Visual —** The site's navigation, each section opened briefly, ending on the omissions page.
- **Receipt —** `UNI.Public/README.md`; `UNI.Public/app/omissions/`; `UNI.Public/app/coverage/`

**[W-M8-02 | INSTRUCTION]**
- **Intent —** Every page can be read at the depth you want — the same document, three ways in. You
  do not need to be an engineer to start, and you do not get a simplified version that says something
  different from the technical one.
- **Visual —** One document, three lenses, the claim identical across all three.
- **Receipt —** `UNI.Public/content/lenses/`; `UNI.Public/content/curation.json`

**[W-M8-03 | ADVERSE]**
- **Intent —** And the honest defect in that offer: today, none of those citations can be opened. The
  source repositories are private, so every citation says so on its face. A citation you cannot
  follow is an appeal to authority — marking it is the difference between documentation and a
  brochure. When a repository is published, one field changes and the same citations become links.
- **Visual —** A citation with its "cannot be opened today" marker; then the single field in the
  source manifest that would change it.
- **Receipt —** `UNI.Public/README.md` § "Three things worth knowing", item 1;
  `UNI.Public/generators/sources.json` (`visibility: private`)

**[W-M8-04 | INSTRUCTION / FALSIFIER]**
- **Intent —** **The falsifier's drill, step one: pick a claim and read its written falsifier.** Do
  not argue with the summary — go to the claim's own document, where the estate has already written
  down the exact observation that would break it. Six of them are written out, numbered.
- **Visual —** The falsification document, one numbered claim expanded, its "Falsify:" clause
  highlighted.
- **Receipt —** `docs/FALSIFICATION.md` §§ 1–6b

**[W-M8-05 | INSTRUCTION / FALSIFIER]**
- **Intent —** **Step two: reproduce the verdict.** Check out the repository at the commit named in
  the receipt. Run the launcher named in the receipt with the seed named in the receipt. Compare your
  outcome to the pre-registered PASS and FALSIFIES conditions. The seed alone is enough.
- **Visual —** The three commands, run, with a real verdict landing at the end.
- **Receipt —** `docs/PUBLIC_README.md:13-19`; `runs/*.exs`;
  `docs/PUBLIC_REPRODUCIBILITY_BUNDLE.md`

**[W-M8-06 | INSTRUCTION / FALSIFIER]**
- **Intent —** **Step three: attack the check, not just the result.** Change one thing that *should*
  make the gate fail and confirm that it does. A gate that stays green under a mutation is the real
  finding — bigger than any single wrong number.
- **Visual —** A mutation applied to a passing gate; the gate turning red as it should; then the same
  move against a gate that does not, drawn as the prize.
- **Receipt —** `viewer/lab/verify_shot.cjs --mutate`; `UNI-FLAGELLUM/CLAUDE.md` § "Required
  validation" (mutation tests)

**[W-M8-07 | INSTRUCTION]**
- **Intent —** **How to contribute, concretely.** A finding here is not a bug report — it has a
  shape: severity and the claim it hits, the file and line, the command that reproduces it, the root
  cause, the smallest correction, and the test that must fail first. Write it in that shape and it
  can be acted on the same day.
- **Visual —** The required fields as a form, filled in with a real past finding.
- **Receipt —** `UNI-FLAGELLUM/CLAUDE.md` § "Communication" (the reported-delta fields);
  `docs/LAB_PROTOCOL.md` § III

**[W-M8-08 | INSTRUCTION]**
- **Intent —** Where to put it. Comments land append-only on the project's own tracking surface and
  are version-controlled, never edited. Pre-registrations have a desk that prints the exact line each
  one needs. Nothing you send is quietly deleted; a correction is a new record, never an overwrite.
- **Visual —** A comment posted, appearing in the append-only file; the desk printing a
  pre-registration line.
- **Receipt —** `viewer/track/track_server.cjs`; `evidence/track_comments.ndjson`;
  `viewer/lab/desk.cjs`; `viewer/lab/l5.html`

**[W-M8-09 | INSTRUCTION / STOP]**
- **Intent —** And what is not yours to do — the same list that binds every agent working here. Do
  not write to a frozen artifact; a correction is a new record with a new hash. Do not edit the gate
  ledger. Do not amend the contract. Every one of these protects the evidence, not the estate.
- **Visual —** The stops list, rendered from the plan file, each with its one-line reason.
- **Receipt —** `evidence/remediation/phase9_plan.json` → `stops`, `not_mine`

---

# M9 · THE CLOSE — 33:30 → 36:00 · 5 beats

*Job: land it without triumph, without sentimentality, and without a single fenced word.*

**[W-M9-01 | FRAME]**
- **Intent —** What actually stands, said in one breath: an instrument that catches its own operators
  writing false numbers, a vocabulary that refuses the words that would flatter it, and a published
  list of everything that is currently broken.
- **Visual —** Three cards, held.
- **Receipt —** `CLAUDE.md` generated blocks; `production/schemas/claim_fence.json`;
  `docs/control-plane/LIMITATIONS.md`

**[W-M9-02 | FRAME]**
- **Intent —** What does not stand, said just as plainly: the mission is intent and remains
  unmeasured; the science gate has not run; the witness is compromised; the citations cannot yet be
  followed.
- **Visual —** The same three-card frame, inverted, four items.
- **Receipt —** M1, M6 and M8 beats above, restated by reference — no new claim in the close

**[W-M9-03 | FRAME]**
- **Intent —** The word this film has not used, and why. Not because the estate is timid, but because
  a machine-checked list of forbidden words is the only version of restraint that survives contact
  with an ambitious person at two in the morning.
- **Visual —** The fence file, one last time, whole.
- **Receipt —** `production/schemas/claim_fence.json`; `lab/film/script/reels_cues.json`
  (`reel3_proven`)

**[W-M9-04 | FRAME]**
- **Intent —** The invitation, restated as an ask rather than an offer: come and break something.
  Being caught being wrong is the product working, and the estate has now shown you four separate
  occasions on which it was caught by its own instruments.
- **Visual —** The door again, open, with the falsifier's three steps as a card beside it.
- **Receipt —** `docs/PUBLIC_README.md:19`; beats `W-M6-05`, `W-M6-07`, `W-M8-04`–`W-M8-06`

**[W-M9-05 | FRAME]**
- **Intent —** Credits, and the reproduction line: how this film was built, which voice model spoke
  it, and where the manifest that lets you re-derive every narration line lives. The film ends by
  telling you how to check the film.
- **Visual —** Credits over the generated quality sheet; the reproduce block; the audio manifest.
- **Receipt —** `lab/film/welcome/TOOLCHAIN.md`; `lab/film/welcome/render/synth_narration.cjs`
  (to be built); `lab/film/welcome/QC_<cut>.md` (generated)

---
---

## Deriving the two shorter cuts (do this later, from this file, never beside it)

The 12-minute main cut and the 3-minute short are **subsets of these 73 beats**, not new writing.
Two rules govern the derivation, and both exist to stop the honest state being the thing that falls
out:

1. **M6 keeps its share.** In every cut, the honest-state movement holds **at least 16% of the
   running time and opens at 50–58%**. In the 12-minute cut that is ≥ 1:55 opening around 6:30; in
   the 3-minute short, ≥ 29 s opening around 1:35. A cut that cannot afford the honest state cannot
   afford to exist.
2. **Every retained claim keeps its receipt.** A beat may be dropped; a beat may not be kept with its
   citation removed for time.

Provisional 12-minute skeleton (33 beats): M0 ×2, M1 ×3, M2 ×3, M3 ×3, M4 ×4, M5 ×4, **M6 ×6**,
M7 ×3, M8 ×4, M9 ×1.
Provisional 3-minute skeleton (9 beats): M0 ×1, M1 ×1, M2 ×1, M4 ×1, M5 ×1, **M6 ×2**, M7 ×1,
M8 ×1. The short **drops the close, not the honest state** — a three-minute film has room for a
finding or a farewell, and the finding is the product.

---

## Gates this outline owes before any audio is synthesised

| gate | what it checks | status |
|---|---|---|
| `welcome-fence` | narration corpus vs `production/schemas/claim_fence.json` — zero hits, all classes | NOT BUILT |
| `welcome-receipts` | every `CLAIM` / `ADVERSE` beat names a receipt path that resolves on disk | NOT BUILT |
| `welcome-twin-terms` | every row of the twin-term register appears with both halves in one beat | NOT BUILT |
| `welcome-honest-state-position` | M6 onset ∈ [50%, 58%] and M6 share ≥ 16% in every cut | NOT BUILT |
| `welcome-audio-manifest` | every beat has a WAV with recorded voice model, sha256, text, duration | NOT BUILT |
| `welcome-qc-generated` | `QC_<cut>.md` is byte-identical to the gate's own output | NOT BUILT |
| `welcome-no-network` | build performs zero network calls; no container invoked | NOT BUILT |

None of these are registered in `viewer/gate_registry.json` yet. Registering them is agent work;
appending their rows to `evidence/gates.ndjson` is **S4 — the operator's**.

---

## Open questions for the operator (his calls, not an agent's)

- **Q1 — the mission's home.** The mission statement is not currently held in any repository file.
  Beat `W-M1-01` reads it verbatim and cites nothing. Where should it live —
  `lab/film/welcome/MISSION.md`, or somewhere more central? Until it has a file, that beat's receipt
  is a person, and a person is not a receipt.
- **Q2 — narrator voice.** `en_US-lessac-medium` (TRAVELERS' voice, continuity) or
  `en_GB-jenny_dioco-medium` (the estate's spoken-channel default). Both are on disk
  (`TOOLCHAIN.md:48-50`).
- **Q3 — the vocabulary divergence.** One repository bans a token the other uses as a ledger value
  (beat `W-M7-03`). The film shows the disagreement rather than resolving it. Resolving it is a
  contract amendment — **S5**.
- **Q4 — music bed.** Still absent, still requires an explicit rights attestation and a named grant
  in `dgst/RIGHTS.md` (`TOOLCHAIN.md:63-66`).
- **Q5 — captions.** TRAVELERS carried machine-authored Marathi and recorded native-speaker review as
  its largest editorial risk (`QC.md:66`). Same language, a different one, or English only?

---

## What this document does NOT claim

- **It does not claim a running time.** 36:00 is predicted from a words-per-minute figure derived
  from another film. The measurement does not exist until `audio_manifest.json` does.
- **It does not claim the beats are the right beats.** No beat has been storyboarded, timed, or read
  aloud. 73 is a plan, not a result.
- **It does not claim every cited receipt says what the beat needs it to say.** Every path in this
  document was checked to exist on disk on 2026-08-01; the *sufficiency* of each receipt for its beat
  is checked by the `welcome-receipts` gate, which is not built.
- **It does not claim the honest state is complete.** M6 carries twelve findings. They are the ones
  the estate's own governing documents and generated blocks currently surface. There is no basis in
  this document for believing that is all of them.
