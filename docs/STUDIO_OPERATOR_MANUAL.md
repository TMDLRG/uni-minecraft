# UNI Broadcast Studio — Operator Manual

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](../production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](../production/docs/adr/ADR-PROD-012-encoder-placement-policy.md) + [STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) first.**
> §10 "Going live" now describes **THINKER → node2 RTMP push** (native Windows OBS pushes one encode to
> `rtmp://10.190.245.149:1935/uni/program`; node2 `runOnReady` tees it to YouTube + Twitch). Typed
> `CONFIRM` in the command_center GO LIVE / OFF AIR fields is the ONE control (G-PA). A new **§10.5
> Broadcast test** exists: press ▶ BROADCAST TEST on the command_center; a 5-stage visible loop cycles
> BARS_TONE → every template with lower-third → live cameras → STANDBY on the program monitor, PRIVATE by
> default (loopback, no fan-out re-point). A new **§11 Publisher upgrades** covers the mute / cam-toggle /
> PTT / level-meter / test-tone / mid-session device swap / LIVE badge / WS reconnect / OverconstrainedError
> recovery / cue-from-studio controls in `pub.html`. Any older §10 text describing a "System 2 MCP path"
> is stale.

> **STATUS (2026-07-11): operates SYSTEM 1 — the v1 dev studio (interim/dev only).** Read
> **[STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) FIRST** for the two-systems map + binding claim rules
> (incl. the overlay proof gate: `node viewer\verify_overlays.cjs`). Production = System 2.

How to *run a show*. For *booting the machine* (start sequence, restreamer, shutdown) see
[RUNBOOK_STUDIO.md](RUNBOOK_STUDIO.md). Runbook = "turn it on"; this manual = "operate it".

Everything honest here obeys the **claim fence**: on-screen text describes UNI's *behaviour /
viability-learning*, never experience or consciousness. Science ledger at time of writing:
P1 novelty = PARTIAL, P2 metabolism = PROVISIONAL.

---

## 1. Mental model

- **OBS is the vision mixer.** It composites one 1920×1080@30 program. You never touch OBS
  directly during a show — you drive it from the **command center** (http://127.0.0.1:8098).
- **Templates** are pre-built scenes (camera + content arrangements). You pick one, it lands in
  **PREVIEW**; **TAKE** puts it on **PROGRAM** (what viewers see).
- **Camera roles** A / B / C are on-screen *positions*; you assign any camera or remote slot to a
  role, and every template that uses that role updates at once.
- **The projector window** (OBS's own program window, "OPEN SMOOTH 30fps MONITOR") is your true
  live monitor. The panels in the command center are lightweight snapshots, not video.
- **Air truth** is computed from real OBS state every second and shown in the top banner *and* on
  the UNI-lab glass cockpit badge:
  - **OFF AIR** — nothing is broadcast.
  - **REHEARSAL** — a camera/mic is up but you are NOT streaming.
  - **LIVE STREAMING** — public, but you (camera/mic) are not on it.
  - **LIVE LIVE** — public AND you are visible and/or audible. (The pulsing red one.)

## 2. Bring-up (short)

See RUNBOOK_STUDIO.md. In order: Minecraft → Phoenix node (`iex.bat …`) → OBS (Run in Normal
Mode) → `studio_channels.ps1` (colony+glass windows) → `throttle_colony.cjs` → `overlay_server.cjs`
→ `studio_stage.cjs` → `command_center.cjs` → open http://127.0.0.1:8098 → `publisher.cjs` for
remote sources. (WS5's one-command bringup wraps this.)
Run the overlay proof gate: `node viewer\verify_overlays.cjs` (must exit 0 + write overlay_proof.png).

## 3. The command center, top to bottom

- **Air banner** — the four air-truth states + a **?** button for this quick guide.
- **PREVIEW / TAKE / PROGRAM** — the switcher. Click a template = preview; **TAKE** = to air;
  double-click a card = hot cut. **OPEN SMOOTH 30fps MONITOR** pops OBS's real program window.
- **Template grid** — grouped by show mode (below). Each card shows a real frame after you
  preview it (or run PREFLIGHT once); hover for what it is.
- **Camera roles** — three dropdowns (A/B/C). Each lists the PC camera + all 10 remote slots
  (● = a slot that is publishing right now). PC camera is always video-only.
- **Voice** — which microphone is on air. Hot only in talk templates. Muted automatically when
  the PC camera is the only camera on program (owner rule).
- **Music bed / AUTO / UNI FEED** — background music level; auto-rotation (`beats` = TEMPLATE:secs);
  mirror the colony Producer's narration into the ticker/caption.
- **Web feed** — show any URL full / +host / +side.
- **YouTube clip** — re-air your own videos: **FULL / +HOST / +SIDE / +PIP**, optional auto-return,
  ★ favorites, ↻ recents.
- **Window shares** — list windows, pick one, bind to slot 1/2/3 (feeds DESK/SHARE/SHARE_MULTI/TEACH).
- **On-screen text** — lower-third / caption / ticker, claim-fenced; FORCE overrides (logged).
- **Broadcast** — CONFIRM + GO LIVE / OFF AIR.
- **Health + PREFLIGHT** — the automated broadcast engineer (section 9).

## 4. Template catalog (by show mode)

**33 templates in 11 groups**, plus three camera-role scenes (`ROLE_A`/`ROLE_B`/`ROLE_C`) which are
plumbing rather than shots you cut to.

> **Corrected 2026-08-01.** This catalog listed **9** groups and was missing three things an operator
> would have gone looking for and not found: the whole **MUSIC** group (`MUSIC_HOUR`, `MUSIC_CARD`,
> `COLONY_SIDE_MUSIC`), the whole **CAMERAS** group (`GRID`), and two thirds of **UTILITY** — it said
> "UTILITY — STANDBY" when there is also `BARS_TONE`, which is the sound-check and the opening beat of
> the BROADCAST TEST, and `STANDBY_OFFLINE`.

`viewer/runtime/templates.json` is **generated output**, written by `viewer/studio_stage.cjs` from
its `SCENES` and `GROUPS` (`studio_stage.cjs:571-573`) — so the builder is the source of truth and
that file is its current print-out. The build reports its own tally on every run. If this page and
the console ever disagree, the console is right; check it in one line from the repo root:

```powershell
node -e "console.log(Object.keys(require('./viewer/studio_stage.cjs').SCENES).length)"
```

Groups:

- **SOLO** — `CAM_A` you full-frame.
- **COLONY** — `COLONY` (world hero) · `CAM_PIP` (world + you PIP) · `COLONY_SIDE` (you + world
  side-by-side) · `PIP` (world + live data inset).
- **TEACH / DEMO** — `SHARE` (screen + you corner) · `DESK` (you + screen split) · `GLASS_TALK`
  (cockpit + you PIP) · `SHARE_MULTI` (share wall) · `TEACH` (screen hero + you/colony/clip rail).
- **WEB** — `WEB_HOST` (page + you corner) · `WEB_SIDE` (you + page split).
- **VIDEO CLIP** — `CLIP_HOST` (clip + you corner) · `CLIP_SIDE` (clip + you split) · `CLIP_PIP`
  (you full + clip PIP — the react-to-a-video shot). All carry the clip's own audio.
- **DESK / MULTI** — `NEWSDESK` (you anchor + colony & clip monitors) · `ANCHOR` (you big + a rail
  of clip/colony/glass).
- **FULL SCREEN** — `GLASS_OS` · `OVERLOOK` · `WEB` · `CLIP`.
- **MULTI-CAM (demoted)** — `DUAL_AB` (interview two-shot) · `TRIO` (panel) · `DUAL_WORLD` ·
  `CAM_B`. Two/three cameras of you — kept only for real interviews/panels.
- **CAMERAS** — `GRID` (up to 10 remote cameras at once, a 5x2 monitor wall).
- **MUSIC** — `MUSIC_HOUR` (full-screen cover + up-next + store QR codes; no camera) ·
  `MUSIC_CARD` (you on the left, music card on the right — mic *and* music both on program) ·
  `COLONY_SIDE_MUSIC` (colony hero + music card, world runs and music airs, no camera).
- **UTILITY** — `BARS_TONE` (SMPTE bars + 1 kHz tone; the sound check, and the SEEN-sweep opener for
  BROADCAST TEST) · `STANDBY` (honest slate, silent — no music bed, no overlays) ·
  `STANDBY_OFFLINE` (fallback slate when the music service is unreachable; uses the local file bed,
  an honest degrade rather than a frozen card).

### ⚠ PIP_AB is in NO group — and that has a consequence

That is 32 scenes. The 33rd, `PIP_AB` (camera A full-frame + camera B as a PIP), is built and
described but belongs to no group, so `allTemplates()` excludes it and `/api/preview` returns **400**
for it. The only route to it is `/api/camlayout {layout:"pip"}`, whose default branch **cuts straight
to air** (`command_center.cjs:1641-1653`).

**The one scene you cannot preview is reachable only by putting it on air.** Treat that as a rule of
the room, not a curiosity: an anxious first-time operator must never be handed a shot they cannot
look at first. It is fenced rather than left to memory — `verify_rundown.cjs` check 2 fails if any
rundown row names a scene that cannot be previewed, and the first show's rundown records the same
finding under `measured_2026_07_29.orphan`. If you do want the A/B picture-in-picture, arm it as a
preview first by passing `{preview:true}`; the default branch is a hot cut.

## 5. Camera roles & voice

A = host, B = guest, C = third. Assign any camera or live remote slot to a role from its dropdown;
reassigning updates every template using that role, live. The **PC camera** is video-only by rule.
Remote cameras carry their own microphone. **Voice** follows whichever mic you pick; it is the
single audio truth (offscreen "voice anchors" keep the primary remote cameras' audio alive across
cuts so a cut never drops the mic). When the PC camera is the only camera on program, voice
auto-mutes.

## 6. Content sources

- **Web** — an OBS browser source; the console navigates it (no separate window). Defaults to the
  master-plan board. Heavy WebGL pages may not render — keep web feeds 2D.
- **YouTube clip** — an OBS browser source that plays with its own audio. Full / host / side / PIP.
  In SIDE/PIP the clip audio and your mic are both live — ride them with the mute matrix / music
  slider.
- **Window shares** — bind up to three windows into slots for the DESK / SHARE / TEACH layouts.
- **Panel pages** — colony (Minecraft hero), glass cockpit (best-looking data panel), overlooker
  (science/evidence board), master-plan (the roadmap + honest ledger = the web default).

## 7. Remote sources (the other computer — no install)

Open **https://<this-box-LAN-IP>:8443/** in any browser on the LAN/mesh (accept the certificate
once). Pick **Camera / Screen-share / Video-file / Video-URL**, choose the device, pick a **slot
(1–10)**, add a label, press **Publish**. It appears in the console's role dropdowns (● = live).
Off-air it sends a tiny heartbeat + thumbnail; when you preview or air it, it ramps to full
resolution automatically. The LAN can only publish camera slots — never the program stream.

## 8. Overlays & the claim fence

Lower-third / caption / ticker / on-air pill are honest 2D pages. The console lints your text
against the claim fence (proven / conscious / aware / alive / …). If blocked, reword to behaviour
language, or tick **FORCE** only when the exact claim has a committed receipt (every force is
logged to `viewer/runtime/fence_overrides.log`).

## 9. Health & PREFLIGHT (the automated engineer)

The **Health** panel checks OBS, the restreamer, each remote camera (codec-aware — it prints the
H264-pinned republish link if a camera publishes AV1 that OBS can't decode), the browser-source
channels, overlays, the colony stack, and the glass badge — with one-click **FIX** buttons.
**PREFLIGHT** renders every template and verifies non-blank + runs all critical checks → **GO /
NO-GO**. Run it before every show.

## 10. Going live (System-1 DEV preview ONLY)

**This is a dev/rehearsal preview stream (local restreamer → your own YouTube/Twitch test), NOT the worldwide go-live.** The worldwide public go-live runs on System 2: the operator human-types `start_broadcast` on the production MCP (`:8095`), keys in `/etc/uni/runtime.env`, never git. See `production/docs/P1-BRINGUP.md` + `docs/SYSTEM_OVERVIEW.md`.

1. In a shell: `$env:YT_KEY = '…'; $env:TWITCH_KEY = '…'` then `powershell -File viewer\restream.ps1`.
2. Confirm `restream.ps1 -Status` shows the path ready.
3. In the console: type **CONFIRM**, press **GO LIVE**. The banner + glass badge go red.
4. Verify both platform dashboards are receiving. Rotate scenes, watch the projector.
5. To end: **OFF AIR** (CONFIRM), then `restream.ps1 -Stop`.

Keys live only in that shell's environment — never on disk or in git.

## 11. Troubleshooting

- **Remote camera is black** → it's publishing AV1; republish with the H264-pinned link the Health
  panel shows (`…:8443/` picks H264 automatically).
- **A web/clip/overlook scene is black** → a heavy WebGL page hit the OBS-CEF limit; use a simpler
  page, or (rare) fall back to a window capture.
- **Overlays vanished** → they hide themselves ~8s after the console stops writing (honest
  staleness). Check `overlay_server.cjs` and the spool.
- **Console feels slow** → the live monitor is the projector, not the panels; the panels are
  snapshots by design. If the whole box is loaded, confirm `throttle_colony.cjs` ran (colony
  capped at 30fps).
- **Voice dropped on a cut** → shouldn't happen (voice anchors); if it does, re-pick the voice.

## 12. Glossary

Program / Preview / TAKE (switcher), Role (A/B/C camera position), Slot (a remote source 1–10),
WHIP (browser→studio publish), Claim fence (honesty lint), Air truth (OFF / REHEARSAL / LIVE
STREAMING / LIVE LIVE), Projector (OBS's real 30fps monitor), Restreamer (MediaMTX dual fan-out).
