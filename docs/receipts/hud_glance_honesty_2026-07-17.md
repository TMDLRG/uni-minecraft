# Receipt — the HUD stops being green about things it cannot see

**Date:** 2026-07-17 · **Track:** studio · **Surface:** THINKER · HUD service + widget + console
**Origin:** the operator asked *"why is the HUD missing on screen for all of this? HUD is not being
observed presently and that is an issue."* They were right, and the answer was not what I expected.

**Gates:** `air-level-counts-program-picture`, `hud-health-above-the-fold`, `arm-refuses-zero-endpoints`,
`colony-frozen-needs-dwell-not-one-sample` — all registered **PENDING before** the code moved.
`hud-renders-stale-as-stale` and `hud-renderer-honesty` remain **PENDING** (not done — see §7).

---

## 0. The finding behind the finding

The HUD was never missing. Service `UNI-HUD` = **Running**, Auto, `NT AUTHORITY\NetworkService`,
PID 2756, **12.5h uptime, 14,999 clean polls**. Widget up since 11:23, window visible, docked right
at `(3232,8)-(3832,1024)`, 53% painted. It had been telling the truth all day.

**It was missing from the WORK.** An entire fan-out honesty sweep (D1–D8) was proven through curl
and isolated harnesses, and the surface the operator would actually glance at was never opened once.
That is the same defect being fixed everywhere else in this repo — *the truth existed somewhere
nobody was looking* — committed by the agent, against the HUD.

Everything in §1–§5 was found in the **first twenty minutes** of actually looking at it.

## 1. Two agent claims RETRACTED (both from asserting on a partial view)

1. **"The per-endpoint fan-out honesty doesn't reach the HUD."** FALSE. Said from a screenshot
   truncated by a scrollbar, without reading `RenderHealth` (`MainWindow.xaml.cs:462`). The live
   snapshot carries **13 health rows**, and arming fake keys put D5's row on the HUD verbatim:
   `[RED] fanout.youtube_1 — FLAPPING … YOUR KEY IS NOT IMPLICATED.` It reaches the HUD.
2. **"A camera show turns the badge green when the camera collapses."** OVERSTATED. My first truth
   table omitted `audible`. With the mic still live, `audible=true` holds the old code at
   `LIVE_LIVE` (red). A camera collapse alone does **not** turn it green; only losing camera *and*
   mic does. The verified blocker is narrower and worse — see §2.

Four partial-view errors in one session, same shape each time. Recorded here rather than quietly
corrected, because the pattern is the point.

## 2. BLOCKER — the hero badge measured the wrong thing (gate: `air-level-counts-program-picture`)

`visible` counts `CAMS` — **human cameras only** (`command_center.cjs:60`). The flagship shot is
`COLONY: [["cap_colony", chromeFull], ["ShowMusic"]]`, whose own description reads *"the hero shot.
**No camera.**"* (`studio_stage.cjs:267`). So the entire colony broadcast computed `visible=false,
audible=false` → level `STREAMING` → the widget painted the 32pt badge **green** (`Ok #2ECC71`).

**Byte-identical whether the world was rendering or the browser source had died to black.** The
badge carried **zero picture information for the show we actually broadcast** — and the same is true
of MUSIC_HOUR and both STANDBY slates. Every camera-less show sat on permanent green.

### The trap (cost three tries in the stage-3 sweep; the audit warned again)

`"ovl_* is not picture"` is **WRONG**: `STANDBY: [["ovl_standby", F]]` and `MUSIC_HOUR: [...,
["ovl_music_hero", F], ...]` — the slate and the full-screen music card **are** `ovl_` sources and
**are** the picture. That rule would fire the alarm through every standby and the whole music
segment. The honest line is `studio_stage.cjs`'s own construction rule (`:325-330`): each scene
**declares** its content, then **chrome** is appended to every scene afterwards. Chrome is a closed,
known set. So: `content = enabled program sources − chrome − audio-only`.

### Proven against the REAL scene table

```
===== streaming = true =====
scene            | OLD                 | NEW
COLONY           | STREAMING (GREEN!)  | LIVE_LIVE (RED tally)
COLONY_dead      | STREAMING (GREEN!)  | STREAMING_DARK (RED alarm)
TRIO             | LIVE_LIVE (RED)     | LIVE_LIVE (RED tally)
TRIO_camdead     | LIVE_LIVE (RED)     | STREAMING_DARK (RED alarm)
MUSIC_HOUR       | STREAMING (GREEN!)  | LIVE_LIVE (RED tally)
STANDBY          | STREAMING (GREEN!)  | LIVE_LIVE (RED tally)
STANDBY_OFFLINE  | STREAMING (GREEN!)  | LIVE_LIVE (RED tally)
MUSIC_CARD       | LIVE_LIVE (RED)     | LIVE_LIVE (RED tally)

colony world dies   OLD STREAMING->STREAMING (GREEN!)  NEW LIVE_LIVE->STREAMING_DARK (RED alarm)
cameras collapse    OLD LIVE_LIVE->LIVE_LIVE           NEW LIVE_LIVE->STREAMING_DARK (RED alarm)
```

### A regression I shipped and the live surface caught within a minute

The first cut keyed **both** branches off picture. Idle OBS sits on the STANDBY slate; the slate IS
a picture; so the badge read amber **REHEARSAL forever** on an idle studio. That drains REHEARSAL of
the meaning it has always had (*talent up, air down*) and paints caution permanently — an amber
that is always on is not a caution. Only the streaming branch may change:

```
streaming  -> turns on PICTURE   (the defect: a dark push must never read green)
!streaming -> turns on PEOPLE    (unchanged: REHEARSAL means humans up, air down)
```

Re-proven across **both** streaming states: `streaming=false` rows are now identical OLD vs NEW, and
idle reads `OFF` (grey). Live confirmation: `level=OFF, pictureOnProgram=true, sources=["ovl_standby"]`.

**FENCE — say it exactly:** this is **source-enablement, not pixels**. `pictureOnProgram` means "a
picture-bearing source is enabled on program", **NOT** "there is a picture". A `cap_colony` that is
enabled but rendering black still reads true. The studio owns a real pixel classifier
(`probeRenderFrac` / `RENDER_MIN_FRAC`, `command_center.cjs:642`) and it is **NOT wired here** — a
`GetSourceScreenshot` on every 3s tick is a cost that needs its own measurement first. Until then
"there is a picture" stays **NOT VERIFIED**, and the note carried to the operator says so in words.

**Verdict: PASS**, with that fence.

## 3. The fix could have evaporated silently between two processes

`SnapshotBuilder.BuildAir` **enumerates** fields; it does not splat. A new console field is dropped
on the floor unless someone adds a line — no error, no warning. Four tests now pin the crossing, and
they were **rehearsed against failure**: removing the passthrough line produced

```
Failed!  - Failed: 3, Passed: 44
```

and restoring it produced `Passed! - 47`. A test that has never failed proves nothing (`c937ab4`).

## 4. FALSE ALARM found by LOOKING — the colony was never frozen (gate: `colony-frozen-needs-dwell-not-one-sample`)

At 05:11 the rebuilt HUD printed, in red:

> `COLONY frames/s 0.0 · FROZEN — frame not advancing`

The colony was **fine**. Its own health, probed twice 6s apart:

```
frame=33718  verdict=LIVE  driver=producer  colony_count=6
frame=33720  verdict=LIVE  driver=producer  colony_count=6
```

0.33 fps, advancing. **Cause: aliasing.** `Rate()` (`PollWorker.cs:256`) differences **one
consecutive pair**; the colony advances ~1 frame per ~3s against a **3.0s poll**, so the sample
interval *equals* the event interval and a Δ of 0 is noise, not a frozen mind. A perfectly healthy
colony flickers into a red alarm forever — and the false-alarm leg was the **one** thing this HUD
had genuinely earned.

**Fix:** the rate is still shown (a real magnitude) but may no longer **convict**. FROZEN is
dwell-gated on `colony.frame_stalled_ms` — wall clock since the counter last actually moved — which
is immune to the tick rate. 30s ≈ 10 expected frame intervals here.

**Proof, 12 samples over ~36s on the live colony:**

```
rate= 0.67  stalled=  1806ms  verdict=advancing
rate= 0.33  stalled=  2073ms  verdict=advancing
... (12/12) ...
rate= 0.33  stalled=  1468ms  verdict=advancing
```

Never FROZEN; stall never exceeded 3.0s. **Verdict: PASS.**

## 5. Fold order is a safety property (gate: `hud-health-above-the-fold`)

`BROADCAST HEALTH` — the **only** panel on the surface that can name a broadcast fault, and the one
carrying the per-endpoint fan-out rows — rendered **fifth**, behind a 14-card NOC grid and 9 Gaia
seats, ~600px below a 600×1016 dock. Nothing above the fold cued the scroll, because the badge,
`ARMED (N)`, `EGRESS` and `STACK: UP` are all invariant to a dark platform.

Worse, the panel outranking it is **static prose**: `predict()` (`door_lifecycle.cjs:145-158`) is a
string lookup on `(key, open, streaming)`. The tile promises *"if killed: door_watchdog reopens it
in <=5s"* and probes **nothing**. (Checked live: the watchdogs ARE running — PID 24204, 24128,
11080 — so the promise is true today **by luck**, not by measurement. If the watchdog died the tile
would keep promising a rescue nobody is coming to perform.) **Unmeasured reassurance outranked
measured fault.**

Health now renders directly under the mixer. Live capture confirms `BROADCAST HEALTH — 11 ok · 2
failing` with `✕ cam1` / `✕ cam2` in red **above the fold, no scroll**. **Verdict: PASS.**

Also fixed there: the id column was a fixed 96px and **clipped** — the live surface read
`restrea`, `overloo`, `colonyc`. A truncated identifier on the panel just promoted to prime real
estate breaks the wrap-don't-truncate law (`4cb0205`). Now a `SharedSizeGroup` sizes the column to
the longest id across rows and keeps them aligned — it grows with the data instead of guessing a
pixel count that rots when a check is added.

## 6. ARM could silently succeed at nothing (gate: `arm-refuses-zero-endpoints`)

`endpoints_store.load()` returns `{endpoints:[]}` for a **missing** file rather than throwing, so
`startFanout()` filtered to `[]`, looped zero times, and returned `{ok:true, count:0}` — **HTTP 200,
no error**, the widget's error branch never fires, the button re-enables, and the operator believes
they armed something.

```
POST /api/fanout {on:true}
{"ok":false,"err":"NOT ARMED: there are no saved endpoints — nothing would push. Add your
 YouTube/Twitch keys in the console (Streaming Endpoints), then arm."}
HTTP 409
```

**Verdict: PASS.** Also landed: `pinOrphan`/`pinNote` (D2's whole deliverable) were computed and
shipped by the console, rendered on the console panel, and **dropped by the widget** — the surface
that exists so the operator does *not* open the console at 02:40. It now renders red and disables
ARM, because a button whose only possible outcome is a failure seconds before air should not be
offered.

## 7. What is NOT done — do not read this as green

- **THE ONE CHANGE (blocker #2) is NOT BUILT.** There is still **no air alarm anywhere in the
  studio**. Grep for `ShowBalloonTip|SoundPlayer|MediaPlayer|FlashWindow|Notification` across both
  HUD binaries: **zero hits**. The entire off-screen inventory remains two balloon tips
  (`systray_watchdog.ps1:240,265`) about an OBS dialog and a downed process — **neither about air**.
  A black program kills no process and opens no dialog. **Nothing reaches a human who is not reading
  pixels.** The walk-away leg does not exist. Blocker #1 was fixed first on purpose: an alarm built
  on the old `visible` would have screamed through the entire flagship show.
- **`hud-renders-stale-as-stale` — PENDING.** `LastOf` (`MainWindow.xaml.cs:246`) still scans 120
  slots × 3s = **6 minutes** backwards for the last non-null and returns **no age**. A 6-minute-old
  colony number can still render as a confident green.
- **`hud-renderer-honesty` — PENDING.** The widget still has **zero tests**; the whole suite covers
  the service. Every renderer fix above lands untested. **No green claim about the renderer is
  permitted until this gate exists.**
- **Platform acceptance — NOT VERIFIED.** Nothing local proves YouTube/Twitch took the push.
- **Picture on program — NOT VERIFIED.** §2's fence: source-enablement is not pixels.
- **Supervisor liveness — NOT VERIFIED.** The `<=5s` door promise is design intent with a decimal
  point on it.
- **`commit ?`** in the footer — the HUD still cannot name its own bytes.
- A cc restart still silently disarms the fan-out (`epMem` is in-process); the HUD does not yet
  distinguish "you disarmed" from "the console died and dropped your arming".

## 8. Sweep provenance

88 agents, 6 adversarial lenses, every finding independently refuted before it counted:
**37 confirmed / 43 refuted**, 3 blockers. Verdict **HOLD** — 5 of 8 gauntlet legs FAIL. Notably
**nine of the refuted claims died because their proposed fixes would have broken the false-alarm
leg** — the discipline held in both directions. Workflow `wf_05f618f6-7f8`.
