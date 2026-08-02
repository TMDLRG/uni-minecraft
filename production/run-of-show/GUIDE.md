# Run-of-Show Guide - UNI Production Platform

Authored against `docs/UNI_PRODUCTION_PLATFORM.md` (the fixed master design). This guide
is a **design/reference**, not a deployed system. It explains the beat schema, how the
producer executes a template, how to author a new template, how language and standby
work, and walks one Interview slot beat-by-beat.

All scene names and MCP verbs here are the **fixed contracts** from the master design.
Do not introduce new scene names or verbs - the eight scenes and the producer verb set
are closed.

---

## 1. What a run-of-show is

A **run-of-show** is a declarative, ordered list of **beats** that the UNI Producer
(`uni-producer`) and the scheduler/playout (`uni-playout`) execute to drive a live show.
Nothing in a run-of-show is imperative code: it is data the producer reads, turning each
beat into a small sequence of **production-MCP** calls. Three nested artifacts:

```
templates/*.yaml   ->  a TEMPLATE  = one named segment (a list of beats)
slot-4h.yaml       ->  a SLOT      = a 4-hour block chaining several templates
weekly-grid.yaml   ->  the GRID    = 7 days x 3 slots/day across time zones + languages
```

The eight templates: `news-desk`, `interview`, `panel`, `explainer`, `colony-live`,
`film-playout`, `qa-chat`, `standby`.

---

## 2. The beat schema (use this exactly, everywhere)

Every beat is one object with these fields:

```yaml
- id: iv-03-admit-guest          # stable unique id within the template
  name: Admit the guest to air   # human label (shows in the control UI run-of-show)
  scene: GUESTS                   # FIXED scene set: COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP
  durationSec: 5                  # nominal beat length; the playout clock can flex ambient/film beats
  language: en                    # one of: en es fr it pt hi  (drives narration voice + caption lang)
  overlays:                       # zero or more overlay mutations (each -> a set_overlay MCP call)
    - layer: lowerThird           # layer = a key of broadcast.json: onAir lowerThird title ticker caption music nowPlaying
      payload: { visible: true, kicker: UNI EXPERT, title: "Dr. A. Rivera", subtitle: "...", tone: ok }
  narrate: { text: "...", lang: en } | null   # null = no narration; object -> a narrate() MCP call (Piper, auto-duck)
  music: { volume: 0.10, duck: true }         # music bed state for the beat -> set_music_volume + duck
  clip: { clipId: "BNB-P1-03", mode: fullframe } | null  # non-null -> a roll_clip() MCP call
  notes: "Producer crib - which verbs, what is human-gated, honesty fences."
```

### Field -> MCP verb mapping

| Beat field | Producer action | MCP verb(s) |
|---|---|---|
| `scene` | program cut/transition to that scene | `cut_to(scene, transition?, ms?)` |
| `overlays[].layer/payload` | write each overlay layer into `broadcast.json` | `set_overlay(layer, payload)` |
| `narrate` (non-null) | Piper TTS to the narration bus, music auto-ducks | `narrate(text, lang, voice?)` |
| `music.volume` | ride the music bed | `set_music_volume(level)` |
| `music.duck` | duck/unduck under speech | `duck(on, target_db?)` |
| `clip` (non-null) | roll a catalog clip into the CLIP scene | `roll_clip(clipId, mode?)` |
| layout in `notes` (talking-head/panel/PIP) | guest layout on the stage page | `set_layout(template)` |
| guest admit in `notes` | green-room -> on-air (human-gated) | `admit_guest(guestId, layout?)` |
| segment hop in `notes` | launch the next template | `start_segment(template, params)` |

`set_overlay` writes the layer into the shared `broadcast.json`; the transparent overlay
pages at `:8099/overlays/*.html` poll that file and re-render (no WebGL - 2D-canvas/CSS,
so it captures clean in OBS). The `layer` names are exactly the `broadcast.json` keys.

A **template** is `{ template, description, defaultLanguage, beats: [...] }`. Templates
that take per-placement inputs also carry a `params:` block (referenced as `{{param}}`
inside beats - the slot/grid supplies real values).

---

## 3. How the producer executes a template (the beat clock)

`uni-producer` is the generalised `director_show.cjs` seam ("replace the timer with cues
from the Producer beats"). It runs a **deterministic beat clock**:

```
load template (+ params)
for each beat in order:
    t0 = now
    cut_to(beat.scene)                              # one program cut
    for ov in beat.overlays: set_overlay(ov.layer, ov.payload)
    set_music_volume(beat.music.volume); duck(beat.music.duck)
    if beat.clip:    roll_clip(beat.clip.clipId, beat.clip.mode)
    if beat.narrate: narrate(beat.narrate.text, beat.narrate.lang)   # auto-ducks; clock waits for TTS to finish or beat end, whichever is later
    wait until (t0 + beat.durationSec)  OR  an operator/LLM override arrives
    advance
```

Two layers ride on top of the deterministic clock:

- **Operator + LLM (creative):** the operator speaks/types ("cut to colony", "lower third
  for Dr. Rivera", "admit the guest"); STT/intent (or the chat LLM, the UNI-expert Claude
  persona) turns that into the same MCP verbs, interrupting or extending beats. The clock
  is the floor; the human is the ceiling.
- **Auto-duck:** any `narrate()` (or live mic VAD) ducks the music bed automatically; the
  beat's `music` block is the resting state it returns to.

**Gating:** the operator opens a **live session** once (an operator-set autoapprove
allowlist scoped to the in-show verbs - `cut_to`, `set_music_volume`, `duck`, `narrate`,
`set_overlay`, `roll_clip`, `start_segment`, `set_layout`, `remove_guest`). Inside the
session those run without per-call prompts but are fully audited. The **outward-facing**
verbs - `admit_guest`, `schedule`, `start_broadcast`, `stop_broadcast` - **always** need
an explicit human decision (and start/stop add a 2-step dry-run -> confirm handshake).
The producer agent never holds the operator token; it can only propose (GAP **G-PA**,
Class-Sec, unproven until a captured red-team run).

**Playout / clock flexing:** `uni-playout` owns wall-time position so the weekly grid
stays aligned. Ambient beats (`colony-live`) and film beats (`film-playout`) are elastic:
playout extends/loops them or trims live blocks to hit each slot's clock. Film beat
durations come from the catalog (`manifest.json total_duration_s`).

---

## 4. How to author a NEW template

1. Copy an existing template in `templates/` whose shape is closest (interview for a
   guest segment, explainer for graphics, film-playout for a clip, etc.).
2. Set `template`, `description`, `defaultLanguage`. Add a `params:` block only if the
   slot/grid must pass values in (guest ids, clip ids, language, topic).
3. Write `beats:` in order. For each beat:
   - Pick a `scene` from the **fixed eight** only. Never invent a scene.
   - Set `durationSec` (nominal) and `language`.
   - List `overlays` using only the **broadcast.json layer keys**: `onAir`, `lowerThird`,
     `title`, `ticker`, `caption`, `music`, `nowPlaying`. Payloads must match the schema
     in `schemas/broadcast.schema.json`.
   - Set `narrate` to `null` or `{text, lang}`. Keep narration inside the honesty fences
     (`docs/press/05_CLAIMS_AND_FENCES.md`): no AGI / no "beats LLMs"; "cache hit" not
     "memory"; UNI math stays private. Aspirational lines are framed as aspiration.
   - Set `music: { volume, duck }` - duck `true` whenever a human/narration speaks.
   - Set `clip` to `null` unless the beat rolls a catalog clip.
   - Write `notes:` naming the exact MCP verbs the beat fires and flagging anything
     human-gated (admit_guest / start_broadcast).
4. Reference the new template from `slot-4h.yaml` (a `segments[]` entry) and place it in
   `weekly-grid.yaml` if it earns a recurring slot.
5. Validate: scene names in the fixed set; overlay layers are real `broadcast.json` keys;
   every speaking beat ducks; no banned-unqualified words in any on-air `narrate` text.

---

## 5. How language works

- A beat carries a `language` (one of `en es fr it pt hi`). It selects (a) the **Piper
  narration voice** for that beat's `narrate`, and (b) the **caption language** the
  caption overlay shows; `uni-bcast-captions` (faster-whisper) can add translated tracks.
- A **template** has a `defaultLanguage`; per-beat `language` overrides it.
- A **slot** has one `language` (set by the grid); the slot's segments inherit it unless a
  template/beat overrides for a deliberate multilingual moment.
- The **weekly grid** assigns one native language per slot per time zone, so each zone's
  evening window is delivered in its own language. Across the week all six catalog
  languages appear: `en` (Americas + Europe + Asia lingua-franca), `es` (LatAm + Spain),
  `pt` (Brazil + Portugal), `hi` (the daily India window), `fr` (France), `it` (Italy).
- **Hindi (`hi`)** may use the ClaudeSpeak EN+HI Hinglish code-switch engine when a script
  mixes Devanagari + Latin; pure-Hindi scripts use a `hi_IN` voice. Write Hindi in
  Devanagari, English in Latin - the engine switches voice by script.

---

## 6. How standby works (the watchdog floor)

`standby.yaml` is the loop the watchdog cuts to. On **any** source or encoder glitch,
`uni-playout` immediately `cut_to(STANDBY)` (last-frame hold -> standby reel) and sets
`onAir.text = "STANDBY"` (honest - not "LIVE"). The reel beat **loops** (`roll_clip(reel,
mode=loop)`) - standby never goes to black. The producer holds in standby until the
health probe reports the live source recovered, then resumes the interrupted slot at its
next live beat, with the slot clock preserving wall-time position so the grid stays
aligned. Standby is also the between-slots holding pattern in the grid. Watchdog =
systemd `Restart=always` + a health probe.

---

## 7. Worked example - one Interview slot, beat by beat

Placement: `weekly-grid.yaml` -> `MON-S3`, `startUtc 16:00Z` (Europe evening), language
`en`. `uni-playout` loads `slot-4h.yaml`, reaches **BLOCK A - INTERVIEW**, and runs
`templates/interview.yaml` with params `{ guestId: GUEST-A, guestName: "Dr. A. Rivera",
guestTopic: "Trauma and the nervous system", language: en }`. The operator has opened a
**live session** (in-show verbs auto-approved; outward-facing verbs still gated).

**Beat `iv-01-open` (TITLE, 7s).** Producer: `cut_to("TITLE")`;
`set_overlay("onAir", {value:true, text:"LIVE"})`;
`set_overlay("title", {visible:true, kicker:"INTERVIEW", text:"A conversation",
subtitle:"The science behind the mission"})`;
`set_overlay("nowPlaying", {segment:"Interview", lang:"en", clipId:null})`;
`set_music_volume(0.28)`; `duck(false)`. No narration. The title overlay page (polling
`broadcast.json`) shows the card; music is up because no one is speaking. Clock waits 7s.

**Beat `iv-02-host-intro` (NEWSDESK, 30s).** `cut_to("NEWSDESK")`;
`set_overlay("title", {visible:false})`;
`set_overlay("lowerThird", {visible:true, kicker:"HOST", title:"Welcome", subtitle:"Setting
up todays conversation", tone:"ok"})`;
`set_overlay("ticker", [{text:"Guest joins from the green room - admitted by the host",
tone:"ok"}])`; `set_music_volume(0.12)`; `duck(true)`. The host speaks live; the mic VAD
keeps the bed ducked. The guest is in the LiveKit **green room** (off-air); the operator
sees them on the control UI but the audience does not.

**Beat `iv-03-admit-guest` (GUESTS, 5s) - HUMAN-GATED.** The operator decides to bring the
guest up. `admit_guest("GUEST-A", layout="talking-head")` is **outward-facing**, so it
**prompts a human decision** (it does not auto-run inside the live session). On approve:
the guest moves green-room -> on-air room; producer `set_layout("talking-head")` on the
stage page; `cut_to("GUESTS")` (OBS captures the LiveKit stage page two-shot);
`set_overlay("lowerThird", {visible:true, kicker:"UNI EXPERT", title:"Dr. A. Rivera",
subtitle:"Trauma and the nervous system", tone:"ok"})`.

**Beat `iv-04-interview-body` (GUESTS, 240s).** Two-shot talking-head holds.
`set_overlay("caption", {visible:true, lang:"en", text:""})` - `uni-bcast-captions`
streams live transcript lines into the caption layer (and translations for the audience
language picker). Music stays ducked at `0.08`. The host drives the conversation; the
operator can fire `set_overlay("lowerThird", ...)` to flip topic chips. The clock floor is
240s but the host/LLM can extend the beat to fill the block; the next beat does not start
until the operator cues it or the clock plus any override elapses.

**Beat `iv-05-thank-release` (NEWSDESK, 20s).** `cut_to("NEWSDESK")`;
`set_overlay("lowerThird", {visible:true, kicker:"HOST", title:"Thank you", subtitle:
"Wrapping the conversation", tone:"ok"})`; `set_overlay("caption", {visible:false})`. The
host thanks the guest; `remove_guest("GUEST-A")` (session-auth, no prompt) drops them back
to the green room. `set_music_volume(0.14)`; `duck(true)` (host still speaking).

**Beat `iv-06-out` (TITLE, 6s).** `cut_to("TITLE")`;
`set_overlay("title", {visible:true, kicker:"INTERVIEW", text:"Thank you for watching",
subtitle:"The feed continues"})`; `set_overlay("lowerThird", {visible:false})`;
`set_music_volume(0.28)`; `duck(false)` - music lifts on the sting. The template ends;
`uni-playout` `start_segment`s the next slot segment (**BLOCK B - EXPLAINER**).

Every one of those calls returns the `metadata()` provenance envelope and is appended to
the audit log. The one human gate in the whole segment was `admit_guest` - exactly the
outward-facing boundary the gating model requires.

---

## Status (honest)

- This is a **design/reference** authored 2026-06-21 against `docs/UNI_PRODUCTION_PLATFORM.md`.
  Nothing here is deployed; every "the producer does X" is a **proposal**, status
  `pending`, not a statement that anything runs.
- **AMENDED 2026-07-29 — one file in this directory is NO LONGER a proposal.**
  `first-show.rundown.json` is bound to the **live** studio: every scene it names was
  read from `viewer/runtime/templates.json` and checked to exist, every super was tested
  against the real overlay fence at `viewer/command_center.cjs:313`, and
  `verify_rundown.cjs` next to it re-checks all of that on demand and is proved to fail
  four ways. The eight `templates/*.yaml` beside it, and `../producer/run.py`, remain
  design/reference and remain `pending` — they declare a **third** scene vocabulary
  (`COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP`) that matches neither the live
  32 nor the retired six. Do not drive the studio from them.
- No banned-unqualified word is used as a claim (avoided: verified, proven, guaranteed,
  isolated, secure, 100%, certified, real; used instead: checked / observed / as captured
  / reported / appears / pending confirmation).
- Evidence posture: the templates/slot/grid are buildable data authored to the fixed
  contracts; their on-air behavior is **pending** a containerized run on the broadcast
  node. Related open gaps: **G-PA** (producer cannot self-approve a go-live/cut -
  Class-Sec, unproven until a captured red-team run), **G-ENC** (encoder node/GPU is an
  operator hardware choice), **G-CAP** (multilingual caption latency unmeasured),
  **G-MUSIC** (no music bed asset yet - must source CC/royalty-free), **G-9x16** (vertical
  catalog clips must be pillarboxed/shorts-walled).
- The business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is **never**
  a mutation target and the producer agent **cannot self-approve**; the encoder is not
  co-located with the ERP appliance. All mutating MCP verbs route through the human
  approval gate; outward-facing verbs always require an explicit human decision.
