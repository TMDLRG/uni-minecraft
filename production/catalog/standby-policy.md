# Standby + Playout Policy — fallback selection, last-frame hold, loop, language/time-zone

Part of the UNI Production Platform `production/` tree (ADR-PROD-007 scheduler/playout). Authored
strictly against `docs/UNI_PRODUCTION_PLATFORM.md`: the container/service map (`uni-playout` #8,
`uni-bcast-mixer` STANDBY scene #1), the `broadcast.json` overlay contract, and the GAPS register.
This file fixes how the scheduler picks a standby clip on a source/encoder glitch, the
last-frame-hold -> standby-reel sequence, the loop policy, and language / time-zone selection.

It depends on `catalog.json` (built by `build-catalog.mjs`, shaped in `CATALOG_SPEC.md`) as the
asset layer and on the per-slot run-of-show under `production/run-of-show/` as the schedule layer.

All status claims are `pending` (design). See the honesty footer.

---

## 1. What "standby" protects against

A live source or the encoder can drop mid-show: the colony cam (`:3020`) stalls, a guest's
LiveKit feed freezes, `/glass` stops repainting, or `uni-bcast-mixer` (OBS) hiccups on a scene
swap. The audience must never see a frozen frame, a black screen, or an error. The platform's
answer (master design, scheduler section): **cut to the STANDBY scene and loop catalog content
until the live path recovers**, with a graceful last-frame-hold -> standby-reel transition so the
cut is not jarring.

STANDBY is a first-class OBS scene in the mixer (alongside COLONY / GLASS / GUESTS / CLIP /
NEWSDESK / TITLE / PIP). It layers: the looping standby clip (media source) + the `standby.html`
overlay (a calm "back shortly" / now-playing card) + the music bed + the ticker/clock overlays.
The producer / playout owns when to enter and leave it.

---

## 2. Detection -> entry (the watchdog)

`uni-playout` runs `Restart=always` (systemd) and a health probe loop. Entry into STANDBY is
triggered by any of:

- **Encoder/mixer fault:** obs-websocket unreachable, or the program scene reports no active video
  source, or the relay (`uni-bcast-relay` MediaMTX API `127.0.0.1:9997`) shows the ingest path
  down.
- **Source fault on the current beat:** the live source named by the active run-of-show beat is
  unhealthy past a debounce window (default **2.5 s**, mirroring the glass cockpit's alarm-debounce
  so a single dropped frame does not trip it).
- **Run-of-show gap:** the schedule has no live beat ready for the current slot/time (late guest,
  empty segment) - STANDBY fills the gap rather than dead air.
- **Operator command:** `cut_to("STANDBY")` via the production MCP (session-authed in-show verb).

On entry, playout writes `broadcast.json`: `onAir` stays `LIVE`, `nowPlaying.segment="Standby"`,
and `standby.html` shows the calm card. The entry reason + timestamp are recorded in the audit log
(the producer cannot self-approve a go-live, but in-show cuts within an open operator session are
audited, not per-call prompted - the gating model in the master design).

---

## 3. The transition sequence (last-frame hold -> standby reel)

The cut is staged so it reads as intentional, not as a crash:

1. **Last-frame hold (0 - ~600 ms).** The mixer holds the last good program frame (OBS freeze /
   the standby clip's first frame pre-rolled) for a short beat. This hides the source-drop instant
   and gives the standby media source time to start cleanly. Hold is capped (default **600 ms**);
   if the source recovers inside the hold, playout aborts the standby cut and returns to program.
2. **Crossfade to the standby reel (~300 ms).** A short fade (the proven foundation already uses
   fade transitions) from the held frame into the STANDBY scene with the first selected clip
   playing. No hard cut.
3. **Standby reel loop.** Playout plays a sequence of standby-eligible clips (Section 4) back to
   back, crossfading between them, with the `standby.html` card + ticker + clock + music overlaid.
4. **Recovery -> crossfade back.** When the live path is healthy again past a **recovery debounce**
   (default **4 s**, longer than entry debounce to avoid flapping), playout crossfades from the
   current standby clip's nearest clean boundary back to the live program scene and resumes the
   run-of-show where it left off. `broadcast.json.nowPlaying` is restored.

Anti-flap: if entry/exit would toggle more than **3 times in 60 s**, playout latches STANDBY for a
**cool-down** (default 30 s) before re-attempting recovery, so a flapping source does not strobe
the audience.

---

## 4. Standby clip selection (the ranking)

When playout needs the next standby clip, it queries `catalog.json` and ranks candidates by a
deterministic, tie-broken preference. **Prefer, in order:**

1. **`aired === true`** - already public on YouTube, so it is safe, reviewed content. (A
   not-yet-aired clip could expose unpublished material on the live broadcast.) Non-aired clips are
   used only as a last resort when no aired clip fits, and only if `--allow-unaired-standby` policy
   is set by the operator.
2. **On-language** - `row.language === slotLanguage` (the current slot's language; Section 5).
   Falls back to the slot's language family, then to `en` as the universal default.
3. **`orientation === "vertical"`** - the pool is 9:16; the STANDBY scene composites vertical clips
   with the pillarbox / shorts-wall layout (GAP G-9x16). A `landscape` clip would letterbox oddly
   in that scene, so vertical is preferred for the reel; `unknown` orientation is treated
   conservatively as vertical.
4. **Duration-fit** - prefer clips whose `durationSec` fits the expected hold window. Default fit
   band **45 - 120 s** (the shorts are ~80 - 90 s). A clip with `durationSec === null` is skipped
   for fit-sensitive selection (it may be a stub or unmeasured) unless forced.
5. **Topical coherence (soft)** - prefer the same `campaign` (and, if set, the same `series`) as
   the interrupted segment, so the standby reel feels related to what the show was doing. This is a
   soft tiebreak, not a hard filter.
6. **Freshness / rotation** - among equal-ranked candidates, pick the **least-recently-played**
   (playout keeps an in-memory recently-played ring per session) so the reel does not repeat the
   same clip while a long outage runs. Final deterministic tiebreak: `assetId` ascending.

Selection is a pure function of `(catalog rows, slot context, recently-played set)` - reproducible
and auditable. The shortlist (the standby pool for a slot) can be precomputed at slot start so the
glitch-path selection is O(1).

Guard: clips under `min-duration` (3 s; the `content/media/shorts/` 0.07 s stubs) are never in the
catalog (the builder refuses them), so they can never be selected.

---

## 5. Language + time-zone selection

The 7-day grid places three 4-hour slots/day across time zones; each slot carries a **language**
and a **local appointment time** (the daily engine already staggers languages: en 09:00 CT,
es 10:00, pt 11:00, fr 12:00, it 13:00, hi 14:00 - from `uni-channels.json`). Playout uses that
registry both for live language and for standby:

- **Slot language drives the reel.** A Spanish 12:00-16:00 CET slot pulls `language === "es"`
  standby clips; a Hindi slot pulls `language === "hi"` (Devanagari font; `hi_IN-priyamvada`
  voice for any narration overlay). Language falls back en when a language has too few aired
  standby clips to sustain a long outage.
- **Time-zone -> which clock zones + which slot.** `broadcast.json.clock.zones` shows the relevant
  zones (UTC + the slot's anchor region + two reference zones). The weekly grid maps wall-clock
  windows to slots so each major audience band gets a fresh appointment in its own prime time and
  its own language; the standby reel inherits the active slot's language so a viewer who tuned in
  for Hindi prime time still sees Hindi content during an outage.
- **Caption language during standby.** `uni-bcast-captions` may idle during a clip-only reel; the
  `caption.html` overlay either hides or shows the clip's burned-in language. `broadcast.json.
  caption.lang` is set to the slot language.
- **Brand consistency.** Every standby clip carries `brandPack: "uni-solutionwright"`; the
  `standby.html` card uses the same UNI x Solution Wright mark as the live lower-thirds, so the
  channel identity holds across the cut (master-design uniform-brand rule).

The language registry (`uni-channels.json`) is the single source for locale, default language,
playlist id, publish-local-time, and title-prefix; playout reads it (not a hard-coded table) so a
registry edit reschedules both live and standby language behavior.

---

## 6. Loop policy (sustained outage)

For a long outage, the standby reel must stay watchable, honest, and non-repetitive:

- **Sequence, do not single-loop.** Play a *rotation* of distinct ranked clips (Section 4),
  crossfading between them, rather than looping one clip - a single looped clip reads as "frozen /
  broken" to a returning viewer.
- **Rotation window.** Cycle through the slot's standby shortlist; only re-show a clip once the
  shortlist is exhausted (recently-played ring prevents near-term repeats). With ~100 aired clips
  today the rotation can run a long time before any repeat.
- **Honest standby card.** `standby.html` says, plainly, "Back on air shortly" + the now-playing
  clip title + a staleness-aware clock (every overlay shows `broadcast.json.updatedUtc` age
  honestly per the contract). It does **not** claim the live show is running when it is not.
- **Music continues, ducked appropriately.** The music bed (GAP G-MUSIC - must be sourced
  CC/royalty-free; none exists today) keeps the reel from feeling dead; `broadcast.json.music`
  reflects its level. Narration overlays are not triggered during a pure standby reel unless the
  operator narrates.
- **Escalation.** If the outage exceeds an operator-set ceiling (default **15 min**), playout
  raises an alert (notify path) and the producer proposes either continuing the reel or a clean
  `stop_broadcast` - which is **human-gated + 2-step confirm** (the producer agent cannot
  self-approve ending the public stream).

---

## 7. Interaction with the run-of-show

- A scheduled **CLIP beat** (`roll_clip`) is *not* standby - it is normal programming; it pulls
  from the same catalog but by the run-of-show's explicit `assetId` / filter, not the standby
  ranking.
- Standby is the **involuntary** path (glitch / gap). When the run-of-show itself schedules a
  "film / segment playout" template for a slot, that is planned content, and standby only engages
  if *that* playout's source faults.
- On recovery, playout resumes the run-of-show at the interrupted beat's boundary, not from the
  top of the slot, so the schedule does not drift.

---

## Status (honest)

This is a **design + policy spec**, not a deployed system. No part of the playout / standby path
runs yet; every "playout will / picks / cuts" is a proposal, status `pending`. The thresholds
(debounce 2.5 s, hold 600 ms, recovery 4 s, fit band 45 - 120 s, escalation 15 min) are honest
**defaults to be tuned against captured runs**, not measured values.

- No banned-unqualified word is used as a claim (verified / proven / guaranteed / isolated /
  secure / 100% / certified / real). Standby behavior is described as it is **designed to** behave;
  recovery/anti-flap correctness is `pending` until a captured run (a deliberately killed source)
  shows the cut-to-STANDBY-and-recover sequence.
- Standby selection depends on `catalog.json`, whose **`aired` state is read from `_status`
  snapshots and may be stale** (see `CATALOG_SPEC.md`). "Prefer aired" is therefore best-effort:
  reconcile against the live YouTube library if exposing unpublished content is a concern.
- Open GAPs touching this artifact: **G-9x16** (vertical pool in a 16:9 STANDBY scene -
  pillarbox/shorts-wall), **G-MUSIC** (no music bed asset exists - the reel's audio bed must be
  sourced CC/royalty-free), **G-ENC** (the encoder node/GPU is an operator hardware choice; the
  encoder is never co-located with the ERP appliance).
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared,
  portainer) is read-only observation, **never** a mutation target. Standby/playout only reads the
  catalog + the run-of-show and drives the mixer/overlays; the irreversible verbs
  (`stop_broadcast`) remain human-gated + 2-step confirm and the producer agent cannot
  self-approve.
