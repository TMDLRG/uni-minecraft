# OPERATOR RUN SHEET — you are the primary operator

**Print this. It is the only page you need to run a show.**
Everything here was **proven live**, not asserted. Where something is unproven, it says so. Receipts:
`docs/receipts/production_sweep_2026-07-16.md` and the 2026-07-17 sweep
(`undermined_signals_swept_2026-07-17.md`, `air_alarm_the_one_change_2026-07-17.md`,
`hud_glance_honesty_2026-07-17.md`).

> **What changed 2026-07-17 (a full audit — nothing to relearn, just better):** every always-on panel
> that used to read green while something was dark now tells the truth (the byte-count preflight, the
> egress row with no armed-count floor, a frozen HUD that looked live, a SIGHT panel that greened as its
> sensor died). The HUD got an **off-monitor AIR ALARM** (§4a) so you can step away. Gaia is whole. The
> run-of-show and off-air steps now survive a mid-show restart. None of your muscle memory changes.

---

## 0. THE ONE CALL — "what is my state?"

```
curl -s http://127.0.0.1:8090/api/status
```

Answers everything: stack, the journey step you're on, every surface's live probe, what to do next.
**Never grep the repo to answer a state question.** If this doesn't answer, the door is down → open
the Door icon (`viewer/door_open.vbs`) — it resurrects from fully cold.

The **HUD** is the same truth as a glance surface: **`Ctrl+Shift+H`** (it is a native widget, *not*
a webpage — there is no URL that shows it).

---

## 1. WHAT ONLY YOU CAN DO (the agent is forbidden — G-PA)

| Action | Why it's yours |
|---|---|
| **Type stream keys + passphrase** | An agent must never handle a key. |
| **Pick the PC webcam device** | The Bind button; the agent can't know which hardware you want. |
| **Unmute the mic before a talk cut** | All cams + mic boot muted (talent-hot policy). |
| **Fill the broadcast metadata** | showTitle / segment / presenter / guest / dateline / kicker / rundown. |
| **Toggle `MUSIC ON AIR`** if you go off DMCA-safe programming | Default ON per your owned/licensed policy. |
| **Type `CONFIRM` to go live** | Gate G-PA. No agent ever types it. |
| **Rule the `colony_on_program` fence** | See §6. Nobody else can decide it. |

---

## 2. COLD START (nothing is running)

1. Double-click the **Door** icon on the desktop (or `viewer/door_open.vbs`).
2. In the Door (`http://127.0.0.1:8090/door`), press **ONE KEY** (open-all).
3. Wait until `curl http://127.0.0.1:8090/api/status` shows **`stack: UP`**.

What comes back **by itself** after a reboot: the Door + healer, Gaia, the HUD (service + widget).
The broadcast stack comes back via **ONE KEY**.

> **Never hand-launch OBS. Never force-kill OBS.** Only `studio_up.ps1` launches it (correct working
> dir); a force-kill leaves a crash sentinel and the next start comes up in Safe Mode with no
> websocket. Close it gracefully or not at all.

---

## 2a. FIRST-TIME LOCAL SURFACE SETUP (once per hardware change)

Command center → Camera roles panel:

1. **Pick your webcam** in the "PC cam" dropdown → click **Bind**. The `PC cam:` pill turns green.
   *(Persists across rebuilds via `runtime/camhost.json`.)*
2. **Unmute MicHost** using the voice buttons when you're about to talk. All cams + mic boot
   **muted** by default (talent-hot policy — no unattended mic on air, ever).

Command center → Broadcast metadata panel:

3. Fill **showTitle** / **presenter** / **kicker** / **dateline** (all optional; absent fields
   render UNKNOWN in overlays, never fabricated).
4. If you want a **STATION BUG** on program, set text + corner + color + tick ON.

Command center → Music panel:

5. Confirm **MUSIC ON AIR** is **ON** (default per your DMCA policy — full on-air, owned/licensed).
   If you're airing on a strict platform for a segment, toggle it OFF for that segment.

## 2b. THE OFF-AIR / SHUTDOWN / REBOOT / BRING-BACK-UP PATH (verbs only, no scripts)

Every step here is a UI button or a single API call. Nothing to type in a shell.

**Off-air:**
- Console → **OFF AIR** button. (Or `POST /api/offair`.) One click, never blocked.

**Disarm fan-out:**
- Console → Streaming Endpoints → **DISARM**. Or HUD → **DISARM**. Or `POST /api/endpoints
  {action:"pin-disarm"}`.

**Close the studio (graceful — no force-kill, no crash sentinel):**
- Door (`http://127.0.0.1:8090/door`) → **CLOSE ALL (graceful)** button. This closes OBS + MediaMTX
  + overlays + console + publisher through the Door's own state machine; Door + HUD + Gaia stay up
  (the 3 always-on surfaces, "never in close-all").

**Reboot:**
- Windows Start → Restart. This is the only OS-level action; nothing here should own the reboot
  because nothing here should be that trusted.

**After the reboot (bring-back-up):**
- Log in. **Door auto-opens** on your desktop (per-user Startup `.vbs`). **HUD widget** and **Gaia**
  come back on their own. **HUD service** (`UNI-HUD`, SCM auto-start) is already running.
- Door → **🔑 ONE KEY — OPEN ALL** button. The studio comes up in order: LAN cert trust refreshes,
  OBS launches with the UNI profile/collection, MediaMTX starts, overlays start, publisher starts,
  console starts, colony + glass windows open.
- Wait until the Door shows `stack=UP` (or console → check status).
- Console → **PREFLIGHT — render + verify EVERYTHING** button. Judges pixels, not process existence.
  If any scene is black, it says so BEFORE you go live.
- Console → Streaming Endpoints → **📥 IMPORT from streaming.txt** button. Reads
  `~/Desktop/streaming.txt` server-side, encrypts, wraps your PIN. Response shows only masked keys.
  (No re-typing of keys, ever.)
- HUD → PIN → **ARM**. Or console → **FAN-OUT ON**.
- Console → type CONFIRM → **GO LIVE**. Cut to a scene. Speak.

---

## 3. SET UP THE KEYS — the SAFE IMPORT (new 2026-07-17)

The agent never holds a stream key. Put them in a plaintext file the SERVER reads directly; the
agent triggers the import but never sees the contents.

1. **On your Desktop**, create `streaming.txt`:

    ```
    # streaming.txt — the SERVER reads this. Delete after import.

    passphrase: <your long AES-256-GCM passphrase — REQUIRED. No backdoor: lose it, keys are gone.>
    pin: <4-8 digit PIN — OPTIONAL, wraps the passphrase for one-click ARM>

    # Endpoints, one per line. Pipe-separated OR JSON:
    YouTube #1 | rtmp://a.rtmp.youtube.com/live2/ | live_yourkeyhere
    Twitch     | rtmp://live.twitch.tv/app/       | live_yourkeyhere
    {"name":"YouTube backup","url":"rtmp://a.rtmp.youtube.com/live2/","key":"live_backup"}
    ```

    The same platform can appear more than once (name is the key: "YouTube #1" / "YouTube #2").
    Comments (`#`) and blank lines are ignored.

2. **Say "import"** — the server reads `~\Desktop\streaming.txt`, encrypts straight into
   `endpoints.enc` (AES-256-GCM), wraps the PIN, and returns only masked keys.

3. **DELETE `streaming.txt`** — plaintext keys should not linger. The encrypted store on disk is
   what persists.

**Alternative (classic path if you'd rather type in the browser):** Console → Streaming Endpoints
panel → paste keys, pick a passphrase → **SAVE (encrypt)** → **SETPIN**. Order matters — SAVE before
SETPIN.

**Risk you already accepted:** a short PIN is weaker than the passphrase. Accepted because a leaked
stream key only lets someone hijack the channel (rotate it in 30s) — it never exposes data.

---

## 4. ARM THE FAN-OUT (every time — it does **not** survive a reboot)

**HUD** (`Ctrl+Shift+H`) or the console: type the **PIN** → **ARM**.

Then confirm on the HUD's **MIXER strip**: `EGRESS readers` should equal your enabled endpoint count.

> **PROVEN GOTCHA:** the ARM does **not** survive a reboot or a command-center crash. The `.enc`
> files *do* survive — the in-memory unlock does not (`command_center.cjs:51 epMem`). After any
> reboot it is **one PIN click**, never a re-entry of keys.
>
> This is correct fail-closed design, not a bug: no unattended process may resurrect key-holding
> egress. **Do not "fix" it by persisting the passphrase.**

---

## 4a. THE AIR ALARM — you can now step away (new 2026-07-17)

The HUD widget now carries an **off-monitor alarm**. It is **silent unless you are measurably on the
air** — it does nothing during setup, off-air, or the normal ARM-before-CONFIRM window. Once you are
streaming, if the world goes dark it **flashes the taskbar, sounds, and pops a tray balloon** even if
you are not looking at the screen. Three things trip it:

- **EGRESS COLLAPSE** — live, but nobody is pulling the program for 30s (a pusher died / ingest dropped).
- **KEY REJECTED** — the ingest is publishing but a platform is dropping it (check that key).
- **BLIND** — the HUD lost the snapshot while you were on the air.

A red banner appears at the very top of the HUD with an **ACK** button per alarm. **ACK silences the
SOUND for 10 minutes** — it does **not** clear the red banner (that stays until the fault clears), and
it **never** disarms your fan-out or touches GO LIVE. The alarm only warns; every action stays yours.

---

## 5. RUN THE BROADCAST TEST

```
POST http://127.0.0.1:8098/api/broadcast_test      (button in the command center)
GET  same path = live progress
```

**Fan-out must already be ARMED or stage 4 fails by design** (`readers >= 1` *is* the definition of
on-air). Takes ~3 minutes.

| Stage | What it proves |
|---|---|
| 1 PREFLIGHT | OBS + MediaMTX + overlays reachable |
| 2 ENCODER | stream started, bytes climbing, frames advancing |
| 3 SEEN SWEEP | **every scene's PIXELS** — judged only where content is present |
| 4 CAMERAS + FANOUT | **public egress: readers sampled twice, 6s apart** |
| 5 PARK | the studio is put back the way it was found |

**Proven 2026-07-16 (4 keyless rehearsals):** stage 3 PASS (15 rendered / 0 black / 14 skipped),
stage 4 FAIL on `no readers` (correct with no keys), `go=NO-GO`. **The test can both pass and fail** —
it is no longer theatre. It caught a real black scene (WEB pointed at the dead chip IP) that the old
byte-count check passed.

> ### ⚠️ THE TEST CANNOT PROVE YOU ARE ON THE AIR
> Stage 4 measures **local MediaMTX readers** — that an ffmpeg is copying the program *out of this
> box*. It **cannot** see whether YouTube/Twitch **accepted** it. **Confirm public air on the
> platform dashboard, every time.** If a key is rejected, the pusher flaps (attach → refused → die →
> respawn ~3s); stage 4's two-sample check calls that **UNSTABLE** — that message means *check the key*.

---

## 6. GO LIVE

1. **You** type `CONFIRM` and press **GO LIVE**. (G-PA. Never an agent.)
2. **Cut COLONY.** It is the source verifiably rendering (**99.9%** non-black, measured).

**Music scene picks (2026-07-16):** if you want a dedicated music segment, cut **`MUSIC_HOUR`**
(cover full frame + progress + up-next + store URLs). For a talk over a track, cut **`MUSIC_CARD`**
(you on the left, cover card on the right). `ShowRadio` is a session-pinned `/radio` MP3 stream —
you never manage the URL; it resolves at bring-up from the registry. See §11 for the
music-service story.
3. Confirm on the platform dashboard.

**Scene guidance, measured 2026-07-16:**
- ✅ **COLONY 99.9%** · **OVERLOOK 88.6%** · DUAL_WORLD 59.9% · COLONY_SIDE 44.5% · GLASS_OS 39.0% ·
  WEB 38.7% · BARS_TONE 81.7%
- ⏭️ Every camera scene (CAM_A/CAM_B/GRID/TRIO/DUAL_AB/DESK/SHARE/…) is **dark because no camera is
  publishing** — not broken, just unconnected.
- ❌ **Do not rebuild the stage before a show.** A `studio_stage.cjs` rebuild re-rolls the WGC
  dice on `cap_colony`/`cap_overlook` — the two sources that currently work.

### THE FENCE — you must rule on this before the cut
`forage-pureworld-graduation` is **PENDING**, so `colony_on_program` is **live-BLOCKED** — but the
fence is **display-only; no code enforces it**, and the test cuts COLONY to program. Decide which
reading binds:
- **(a)** the camera may cut; only on-air **life/awareness claims** are fenced, or
- **(b)** the **scene** stays off program until PASS.

**Don't let a default program scene decide it for you.**

### DO NOT SAY ON AIR
**"Six UNIs are alive."** `verify_colony.cjs` FAILs (RCON isn't LAN-published), so `colony_count=6`
has **one source and zero corroboration** — the Lab Protocol requires two. It blocks no broadcast
(the colony is a *picture*, not a claim). It hard-blocks the *claim*.

---

## 7. STAYING LIVE — read before a long run

**A 4-hour run is NOT underwritten. Attend it, or don't do it.** Stated plainly:

| Risk | What you must know |
|---|---|
| **Black picture** | OBS WGC window-capture is a documented dice-roll, **twice realized**. Detection exists; **automatic recovery does not**. The durable fix (`cam_bridge.cjs`) **is not built**. |
| **A cc crash drops ALL public air** | The watchdog restores the *process*, not the *fan-out*. Re-ARM needs your PIN → **you must be reachable**. |
| **Supervisors disagree under air** | `door_healer` abstains while streaming; `systray_watchdog` restarts unconditionally. Know this before hour 3. |
| **No soak gate exists** | Pre-register `studio-soak-4h` **before** a sustained run, as a harness collector — not an LLM session. |
| **Chip lease moves** | Symptom: **colony camera + producer go unreachable together while the chip is fine.** Check the DHCP lease before diagnosing the studio. |

---

## 8. OFF AIR / EMERGENCY

- **OFF AIR** — in the command center. Always one click. Never gated behind a code.
- **DISARM** — HUD or console. **No PIN required** (stopping is never gated).
- **G-STOP** — ⚠️ **has never been human-fired.** Worth 60 seconds of rehearsal *before* a public run.
- **Close the studio** — the Door's **close-all** (graceful). Never force-kill OBS.

---

## 9. WHEN SOMETHING LOOKS WRONG

| Symptom | First move |
|---|---|
| Anything at all | `curl http://127.0.0.1:8090/api/status` — it names the problem |
| Colony cam **and** producer both dead, chip fine | The chip's **DHCP lease moved.** Not the studio. |
| "OFF AIR" but you think you're live | Check for **SYNCING** — that means *not measured*, not *off*. The HUD never fabricates OFF. |
| A scene is black | Was its **input** connected? The test skips absent inputs and only fails a scene whose content is present. |
| Gate ladder / receipts | `docs/GATES.md`, `docs/receipts/` |

---

## 11. MUSIC SERVICE (fully integrated 2026-07-16)

**The service** — The Collected Packages Radio — runs on the chip at `music.uni-lab.local:8687`
(currently `10.190.245.121:8687` until the other agent's DNS work lands). It exposes `/radio`
(endless MP3), `/api/nowplaying?session=<sid>` (metadata), `/api/telemetry` (listener count),
`/api/tracks`, `/art/<file>`, `/lyrics/<file>.md`, `/healthz`.

**How the studio consumes it (all automatic — nothing to type):**

| Piece | What it does |
|---|---|
| `viewer/infra_registry.json` — `music` service | Declares the name so any consumer (including CEF) can be given a live IP via `host_resolve`. |
| `viewer/command_center.cjs` — music poller | Every 5s: GET `/api/nowplaying + /api/telemetry`, mirrors into `spool.nowPlaying`. Overlays read the spool — they **never** hit the music service directly. |
| `viewer/studio_stage.cjs` — `ShowRadio` input | ffmpeg_source on `/radio?session=obs-studio-thinker`. URL resolved from `music.uni-lab.local` at bring-up. |
| **Scenes** — `MUSIC_HOUR` / `MUSIC_CARD` / `COLONY_SIDE_MUSIC` | Full cover / talk-with-card / colony-with-card. Cut them like any other scene. |
| **Fallback** — `STANDBY_OFFLINE` | Local file bed when the music service is unreachable. Honest degrade. |
| **Overlays** — `ovl_nowplaying` / `ovl_musicbug` / `ovl_music_hero` / `ovl_lyrics` | Lower-third strip / corner bug / full hero / side lyrics panel. All auto-driven; no operator config needed. |
| **`musicOnAir` gate** | Defaults `ON` per your DMCA policy. Toggle in the Music panel. When `false`, the music scenes still exist but the operator can refuse to cut them on program. |

**Honest failure mode:** if the music service is unreachable, `nowPlaying` records `err:"…"`,
overlays render "unbound" instead of a stale/fabricated payload, and the fallback `STANDBY_OFFLINE`
carries the local file bed if you park there. No black music screen.

## 12. WHAT THE HUD / COMMAND CENTER TELLS YOU AT A GLANCE (2026-07-16)

Every field on the command center now traces to a real upstream — none are hardcoded literals:

| Panel | Field | Source |
|---|---|---|
| Camera roles | `PC cam:` pill | OBS `GetInputSettings` on CamHost → resolved to a device name |
| MIC | LIVE / MUTED / unknown | OBS event mirror `audioMute` |
| Health | `SIGHT: GO/HOLD/BLOCK` pill | Derived from health checks + pcBound + micOk |
| Health | one row per fan-out endpoint | Each armed pusher's respawn count + rate |
| Colony | verdict / driver / count / tps / frame / star | 5s poller of `colony:4200/producer/health` |
| Music | title / artist / album / cover / progress / next / listeners | 5s poller of `music:8687/api/nowplaying + /api/telemetry` |
| Metadata | showTitle / segment / presenter / guest / dateline / kicker / rundown | Your input, persisted in `spool.meta` |

**Freshness discipline:** panels flip to "STALE" when their `updatedUtcExternal` is >20s old.
A CC self-heartbeat cannot make a stalled panel look fresh — that was fixed 2026-07-16.

## 10. THE LAWS (never violated, by anyone)

1. Reads never actuate — a GET never spawns a process.
2. OBS is launched **only** by `studio_up.ps1`. Never hand-launch. **Never force-kill.**
3. One bring-up at a time (OS mutex `UNI_STUDIO_UP`).
4. **Never private** — the broadcast test runs the one live path; stage 4 needs real public egress.
5. Science is out of scope for the studio: don't touch `lib/sp/**`.
6. Remote doors (world/colony/colonycam/relay/producer) are **observe-only**.
7. **Go-live is human-typed (G-PA).** The agent never types CONFIRM, never holds a key.
