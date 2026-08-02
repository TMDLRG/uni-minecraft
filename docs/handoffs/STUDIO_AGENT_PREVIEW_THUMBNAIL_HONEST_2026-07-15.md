# STUDIO-AGENT LAUNCH PROMPT — honest live preview + thumbnail rework (2026-07-15)

> **How to use:** open a fresh Claude Code session in this repo and paste:
> *"Read `docs/handoffs/STUDIO_AGENT_PREVIEW_THUMBNAIL_HONEST_2026-07-15.md` in full and execute it,
> honoring every protocol it names. Diagnose with receipts before you change anything."*
>
> Written by the studio agent 2026-07-15 after reading the running code (anchors below are real
> file:line, verified this session). The colony is broadcasting LIVE right now — see §0 SAFETY.

---

You are the **studio-track agent** for UNI.Minecraft (Stratified Palimpsest). This is broadcast-
platform work under `viewer/**` only. You do **not** touch `lib/sp/**` or `lib/sp/runtime/**`
(science track), you do not design or set a science gate, you do not hold a stream key, and you
never type `CONFIRM` / press GO LIVE (G-PA). Read `CLAUDE.md` in full first (especially the FIRST
MOVE endpoint, the two-track law, the Door/OBS operating rules, the claim fence, and the Gaia law),
then `docs/STUDIO_SYSTEMS.md`, `docs/HUD.md`, and `docs/GAIA.md`.

## §0 — SAFETY (binding, read before any action)

1. **THE STREAM IS LIVE.** As of this handoff the studio is `air.level: STREAMING`, program
   `OVERLOOK`, fan-out pushing to YouTube + Twitch (2 readers on the MediaMTX `uni` path). **Your
   work must not black-frame, freeze, or drop the on-air PROGRAM.** All preview/thumbnail capture is
   console-side and read-only w.r.t. program (`GetSourceScreenshot` renders offscreen; StudioMode
   *preview* is a separate surface from *program*). The honesty test in §4 that *forces a black
   source* MUST be run on a **scratch/preview-only source, never a program source**, or scheduled
   off-air. If in doubt, ask the operator to go off-air first.
2. **OBS operating rules (CLAUDE.md, burned in by real incidents):** OBS is launched ONLY by
   `viewer/studio_up.ps1` (correct cwd); **never hand-launch, never force-kill** OBS; graceful close
   only. You are NOT bringing OBS up/down for this task — it is already running. Talk to it over the
   websocket (`viewer/lib/obs_client.cjs`, `ws://127.0.0.1:4455`).
3. **Reads never actuate.** A status/poll endpoint must never start a process or mutate program.
4. **FIRST MOVE for any "what is the state" question:** `curl -s http://127.0.0.1:8090/api/status`
   (never grep the repo for state). Command-center live truth: `GET :8098/api/state`.

## §1 — The mission (the operator's exact words, restated precisely)

The thumbnail/preview subsystem must carry **perfect, honest, true signals** and give a real live
feel without a 30fps cost. Five concrete behaviors:

1. **Grid thumbnails (the bottom tiles):** each tile carries a **recent snapshot**. **On click**,
   that tile plays a **short low-res / low-fps live loop OR a fresh live snap** (~**5-second loop**
   is the target; a fresh single snap is an acceptable minimum). Today a click only loads the scene
   into PREVIEW (`command_center.html:264` → `/api/preview`) and the tile image is a stale cached
   still; that is the gap.
2. **PREVIEW monitor (left window):** show the **full live feed at low frames — ~3 fps** for the
   armed/preview scene (not a static snap). Today it is a cached still refreshed only on
   demand/program-change/20-min sweep (`command_center.cjs:416-423`, `pollThumbs`
   `command_center.html:521-534`).
3. **On TAKE / sent to program (on air):** the **PREVIEW monitor freezes to a static snap** (it is
   now on air; a live preview of it is redundant), and the **PROGRAM monitor refreshes every ~30
   seconds** with a fresh live frame snap. Today the program tile is hard-labeled `"LIVE"`
   unconditionally (`command_center.html:531`) regardless of frame freshness — dishonest.
4. **Keep the flyout:** the true **30fps** view stays available on demand — the existing
   `OpenVideoMixProjector` button ("OPEN SMOOTH 30fps MONITOR", `command_center.cjs:777-781`,
   `command_center.html:95,274`). Do not remove or regress it.
5. **HONESTY IS THE POINT (binding law for this task):** a **black or absent frame must NEVER be
   labeled attached / LIVE / live**. See §2 — this is the core defect.

## §2 — The dishonest-signal defect (root-caused this session, with anchors)

"It says the local camera is attached but the preview is black." Cause: the "attached/live" signal
is a **registration/codec heartbeat, not proof of a rendered non-black frame**:

- `command_center.cjs:500-501` — `liveCams` = publisher registrations whose `ageMs < 30000`. A slot
  that merely heartbeats within 30s counts as "live" even if its OBS source renders black.
- `command_center.cjs:694,701` — `remote1/remote2 = "live"` iff the MediaMTX path has an h264 track
  (`rc()`), else `"badcodec"`/`"not publishing"`. Codec presence ≠ non-black video.
- `command_center.html:509-510` — `camstatus` renders that as bold **LIVE**.
- `command_center.html:531` — the grid card `age` is set to `"LIVE"` for the program scene
  **unconditionally**, even when the cached thumb is stale or black.

**The honest primitive already exists:** a non-black frame is `imageData.length > 2600`
(`command_center.cjs:492,513,961`; a black 480×270 JPEG compresses to ~a few hundred–thousand bytes,
e.g. the 4307-byte all-black frames observed on OBS CEF WebGL sources this session). **The fix is to
gate every "attached/LIVE" claim on a real recent non-black frame**, and to separate two distinct,
independently-true signals in the API and UI:
- `registered` (a source/slot exists and heartbeats) — may be true.
- `rendering` (a recent `GetSourceScreenshot` of that source is non-black, i.e. bytes > threshold
  within the freshness window) — the only thing allowed to read "LIVE"/"attached (video)".
Never collapse the two into one green "LIVE" again. If registered && !rendering, the honest label is
e.g. **"attached · NO SIGNAL (black)"**, not LIVE.

## §3 — Current architecture you are modifying (all real, verified 2026-07-15)

**Server — `viewer/command_center.cjs`:**
- Thumbnail cache + policy: `thumbs {}` (`:422`), header contract `:416-421` ("reference stills,
  NOT video … refreshed on demand / program-change / 20-min sweep"). **That contract is what you
  are changing — update this comment as DD.**
- `grabThumb(scene)` `:543-546` (one `GetSourceScreenshot`, 480×270 jpeg q55, caches `{img, at}`,
  returns byte length — already your black detector).
- `sweepStep(scene)` `:549-552` (SetCurrentPreviewScene + settle + grab). 20-min safety sweep
  `:554-563` (skips while `idleMode`/`preflightBusy`). Auto-idle after 15 min `:565-575`.
- Routes: `/api/thumbs` `:713-717` (all cached thumbs + age), `/api/thumb?scene=` `:719-724`,
  `/api/preview` `:760-765` (sets `operatorPreview`, delayed grab), `/api/take` `:767-775`
  (StudioMode transition preview→program), `/api/cut` `:776`, `/api/projector` `:777-781` (the
  30fps flyout), `/api/slotstates` `:732-751` (per-slot live/preview/idle), `/api/state` `:699-703`
  (emits `camsInfo`, `slots`, `preview`, `idle`, `restreamer`).
- Program-change watcher `:327-328` refreshes the thumb on cut.

**UI — `viewer/command_center.html`:**
- Monitors: `#prevthumb` / `#progthumb` `:93,95`; the PROGRAM header carries the 30fps projector
  button `:95`. `.mon img` styling `:33`.
- `pollThumbs()` `:521-534` — pulls `/api/thumbs` every ~2s, updates monitors + card images; **the
  `"LIVE"` label bug is `:531`**.
- Template grid built `:250-266` (`click` → `/api/preview`, `dblclick` → hot-cut). `.card.preview`
  style `:44`.
- Camera status `:509-510`; projector button wiring `:274`.

**OBS client:** `viewer/lib/obs_client.cjs` (`OBSClient`, `.req(name, params, timeoutMs)` →
`{ok, comment, data}`, `onConnected`). Requests you will use: `GetSourceScreenshot`,
`GetCurrentProgramScene`, `SetCurrentPreviewScene`, `OpenVideoMixProjector`, `GetInputList`.

## §4 — Design constraints + the performance budget (do not skip)

- **`GetSourceScreenshot` is expensive** (offscreen render + base64 in the console Chrome). The
  existing comment (`:420`) warns fast-polling *all* scenes stutters. The operator's chosen cadences
  are deliberately cheap and are the spec, not a suggestion: **PREVIEW ~3 fps for the ONE armed
  scene only; a ~5 s loop only for the ONE clicked tile; PROGRAM one snap / ~30 s; every other tile
  stays an on-demand still.** Never resurrect all-card fast polling.
- Only ONE scene is "live-previewed" at a time (the armed `operatorPreview`). When a tile is clicked
  for its 5 s loop, capture ~15 frames at 3 fps for THAT scene, serve them (data-URI ring or a tiny
  MJPEG-style sequence the page cycles), then fall back to a still. Consider whether a single
  server-side capture loop keyed to `operatorPreview` (3 fps) is cheaper than per-request grabs.
- **Black detection is mandatory on every frame that could carry a LIVE/attached label**: compute
  `bytes` and compare to a named threshold constant (start from the proven `2600` for 480×270; if
  you change resolution, re-derive the threshold empirically against a known all-black source and
  record the number). Consider a stricter signal than raw bytes if you have time (e.g. sample a few
  pixels) but bytes>threshold is the accepted floor.
- Keep the 30fps flyout (`OpenVideoMixProjector`) untouched and working — it is the escape hatch for
  "I want full rate now."
- No new third-party dependency in `viewer/package.json`.

## §5 — Gaia alignment + the honesty law (binding)

This task **is** the receipts-over-rhetoric discipline made literal. Gaia's `studio` seat and the
HUD project the command center's signals; if the console emits a false "LIVE", Gaia would project a
false "LIVE" — a GAIA-LAW-adjacent lie at the source. So:
- Every signal the console exposes (`/api/state.camsInfo`, `/api/slotstates`, the card `age`, the
  monitor labels) must be **true by construction**: a value may read LIVE/attached-video only when a
  recent real non-black frame backs it. Prefer emitting the two orthogonal booleans
  (`registered`, `rendering`) so downstream (Gaia, HUD) can project either without inventing.
- After your change, `node viewer/gaia/verify_gaia.cjs` must still be **11 PASS / 0 FAIL / 0 SKIP**
  (you are not editing `viewer/gaia/**`, but confirm no regression in what she reads).
- **Claim fence:** "LIVE" here means *broadcast/video live*, never a life/awareness claim; do not
  reuse the token for anything else (there is a separate, known token collision where the science
  `verdict="LIVE"` bleeds into operator surfaces — out of scope here, do not make it worse).

## §6 — DDD/TDD deliverables (a work-item is done only when ALL are true)

**Pre-register the gates BEFORE writing code** (append PENDING rows to `evidence/gates.ndjson`, one
receipt path each; name PASS + FALSIFIES verbatim; then supersede with the verdict). Proposed gates
(refine names as you see fit, keep the intent):

| gate | PASS (short) | FALSIFIES |
|---|---|---|
| `preview-signal-honest-no-black-live` | Forcing an armed source to black makes its label read NO-SIGNAL/black; a real frame reads LIVE. `registered` and `rendering` are separate and each true-by-frame. | Any black/absent frame ever labeled LIVE/attached-video anywhere (card, monitor, camsInfo, slotstates). |
| `preview-live-3fps` | The armed PREVIEW monitor updates ~3 fps (measured: ≥2 frame changes/sec over a 5 s sample) for the preview scene only. | PREVIEW is a static still while armed; OR all cards fast-poll (perf regression). |
| `thumbnail-click-liveloop` | Clicking a grid tile yields a ~5 s low-fps live loop (or at minimum a fresh live snap) for that tile. | Click yields only a stale cached still with no fresh capture. |
| `program-30s-live-refresh` | Once on program, PROGRAM monitor refreshes ~every 30 s with a fresh live frame; PREVIEW freezes to a static snap. | PROGRAM tile shows a hard "LIVE" with a stale/never-refreshed frame; OR PREVIEW keeps live-updating on air. |
| `flyout-30fps-preserved` | `OpenVideoMixProjector` still opens the true 30fps program window. | The flyout button is removed or errors. |
| `preview-perf-within-budget` | New cadence measured within a stated CPU/GPU budget (record before/after; no visible stutter on the on-air program). | Program frame-drops or console stutter attributable to the capture cadence. |

**DD (documents true in the same breath as the code):**
- Update `viewer/command_center.cjs:416-421` header comment — the "reference stills, NOT video / 20-
  min sweep" contract is superseded by the live-preview model; state the new cadence + the honesty
  rule inline.
- Update `docs/STUDIO_SYSTEMS.md` (the thumbnail/preview/monitor section) to describe: 3 fps armed
  preview, 5 s click-loop, 30 s program refresh + preview-freeze-on-air, the honest
  registered-vs-rendering split, and the retained 30 fps flyout.
- If the signal model changes materially (two orthogonal booleans replacing one "live"), write a
  short ADR under `production/docs/adr/` (next number) recording the honesty-by-construction
  decision.
- Re-render `docs/GATES.md` from the ledger after appending/superseding rows.

**TD (the gate is the test; verify with real artifacts, not claims):**
- Prove every gate with a real captured frame + its byte count (grab via `GetSourceScreenshot`;
  save the JPEG; look at it). For the honesty gate, actually force a black source (scratch/preview
  only per §0) and show the label flips to NO-SIGNAL, then restore and show it reads LIVE.
- Measure the fps and the CPU cost; put the numbers in the receipt.
- Add a small automated check where feasible (e.g. a node test that asserts the black-byte threshold
  classifier: a known-black buffer → not-live, a known-content buffer → live) under `viewer/` tests.

## §7 — Method (VFE/EFE/OODA, one cure at a time)

1. **Observe** — run the gates/probes: `/api/status`, `/api/state`, grab real renders of PREVIEW,
   PROGRAM, and a camera source; record byte counts (black vs content). Reproduce "attached but
   black" with a receipt.
2. **Orient** — diff measured vs the honest contract in §2/§5; the gap is your prediction error.
3. **Decide** — the single highest-leverage cure first (the honesty split — never label black as
   LIVE), before the ergonomics (3 fps / 5 s loop / 30 s). Do not stack cures such that you cannot
   attribute the win.
4. **Act** — change as code (never a runtime patch), update the doc + the gate row in the same
   breath, commit + push. Then the next cure.

## §8 — Fences (do not cross)

- `viewer/**` only. No `lib/sp/**`, no science gate, no ADR that touches the FE engine.
- No go-live action, no key handling, no `CONFIRM`. GO LIVE / OFF AIR stay the operator's.
- Never force-kill OBS; never hand-launch it; it is already up — talk to it over the websocket.
- Reads never actuate. The one exception surface (setting `operatorPreview` / SetCurrentPreviewScene)
  affects PREVIEW only, never PROGRAM — keep it that way.
- Do not disrupt the live broadcast (§0). Prefer to land + verify the honesty split live (read-only),
  and schedule any black-source forcing test on a scratch source or off-air with the operator.

The product is honest signals: a green LIVE that is always a real, current, non-black frame; a
preview that actually moves at 3 fps; tiles that come alive on click; a program that refreshes on a
calm 30 s heartbeat; and the 30 fps flyout when you want the truth at full rate.
