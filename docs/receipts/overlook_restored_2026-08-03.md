# The colony overview went black — and the camera was never down

**Date:** 2026-08-03, ~04:15–04:30 UTC · **Track:** studio · **State:** live, 16h16m into a 25h run
**Reported by:** the operator — *"I closed the window and so the stream is black for the colony overview"*

## Two faults, only one of them the one he reported

**1. The window he closed.** `cap_overlook` and `cap_colony` are OBS **`window_capture`** sources, not
browser sources. They capture two real Chrome windows by exact title:

| source | window title | URL |
|---|---|---|
| `cap_overlook` | `Stratified Palimpsest — Overlooker` | `:4200/stream` (the UNI PRODUCER page) |
| `cap_colony` | `Prismarine Viewer` | `:3020` (the world camera) |

They are real Chrome windows *on purpose* — OBS's own CEF renders their WebGL to a black frame.
Closing the windows left OBS capturing nothing, silently.

**2. The one he could not have seen: the chip's firewall had dropped the camera.** `:3020` was
unreachable from THINKER — but `ss -lntp` on the chip showed `rootlessport` still **LISTENING on
`*:3020`**. The service was healthy the whole time. The `inet filter` `trusted` chain allowlists
`tcp dport 4200` but had **no rule for 3020**, and the `input` chain policy is `drop`.

Both `:3020` and `:4000` were reachable from THINKER at 00:38 UTC the same night and were gone by
04:18 — the ruleset was flushed and those rules did not come back.

**This is the third boot-twin drift on `/etc/nftables.conf`, and the first to reach air.** The file's
own comments document the pattern twice already: `:4200` (persisted 2026-07-15, *"Picked up at BOOT
ONLY"*) and `:8300` (*"WAS A RUNTIME-ONLY RULE… caught this time before a reboot rather than
after"*). `:3020` was runtime-only, was never written to the file, and vanished on the flush.

## What was done

- **Runtime rule added** (audit `02568f214f5a4cec`):
  `nft add rule inet filter trusted tcp dport 3020 accept`.
  `:3020` went from TCP-closed to **HTTP 200, title `Prismarine Viewer`** immediately.
  LAN/mesh/tailnet scoped only — the same trust level `:4200` already had. Not internet-exposed.
  **`nft add rule` is additive; nftables was NOT reloaded** — the file's own comment warns that
  `ExecReload`/`ExecStop` flush the ruleset and would kill netavark DNAT for the ERP stack.
- **Both Chrome channel windows relaunched** with the exact argument list `studio_channels.ps1`
  uses, by profile tag (`ch_overlook`, `ch_colony`), by DNS name — no IP literal.
- **`cap_overlook` re-bound** to the new window and staged in **preview first**, screenshotted, and
  only then cut to program. Program was `CLIP` at the time and was not disturbed until verified.
- **Cut to `OVERLOOK`** via the console's own `POST :8098/api/cut`.

## Proof it is actually on air

Screenshot of the live program scene shows: the world rendering (stone, lava, a UNI on terrain),
`THE COLONY · Day 1`, and **five live UNI cards** — UNI-1-1, 1-2, 1-3, 2-1, 3-1 — each with kin,
bars, state and current action (`foraging · mine + wait + wait · 24% sure`, `fleeing · jump + turn +
step · 26% sure`). Narration ticker live: *"UNI-1-1 has weathered a long stretch out here."*

Producer health at handoff: `driver=producer verdict=LIVE colony_count=5 tps=20`.

**`outputSkippedFrames` was 441 before any of this and 441 after all of it.** Stream uptime
16:16:21 continuous, congestion 0, never reconnecting.

## Durability added

**`viewer/channel_windows_watchdog.ps1`** — nothing supervised these two Chrome windows.
`systray_watchdog.ps1` covers OBS/MediaMTX/command_center/publisher/overlay_server;
`door_watchdog.ps1` covers launcher + healer. A `window_capture` whose target window does not exist
captures pure black and **reports no error anywhere** — which is exactly how this reached air.

The watchdog resolves each channel **by profile tag**, never by a global title search, so it can
never match the operator's own Chrome. It **never kills anything, never touches OBS, never changes a
scene.** Its entire blast radius is "a Chrome window may get opened". It refuses to relaunch the same
channel more than once per 90 s, so a crash-looping channel backs off instead of machine-gunning
Chrome (CLAUDE.md records a real window-spawn storm on 2026-07-14).

**Live drill, not a claim:** killed the off-air `ch_colony` window; watchdog relaunched it in ~22 s
with the correct title restored. Log line: `RELAUNCH colony was ABSENT -> started
http://uni-lab-lan.uni-lab.local:3020/`.

## The boot twin was PROMOTED — operator co-signed, same night

At 04:43 UTC the operator said *"promote the firewall rule now before I sleep"*. Done, with a
backup first and without ever reloading nftables:

```
backup   cat /etc/nftables.conf > /etc/uni/nftables.conf.bak-pre-colonycam-20260803   (3790 bytes)
promote  cat /etc/uni/nftables.conf.with-colonycam-3020-20260803 > /etc/nftables.conf
verify   nft -c -f /etc/nftables.conf                       -> SYNTAX_OK (rc 0)
         ls -la /etc/nftables.conf   -> -rw------- root root 4790   (0600 root PRESERVED)
         grep dport -> line 27 :4200   line 42 :3020   line 53 :8300   (nothing lost)
         md5sum  6b2f3c6e4cfaee55429ecb139b080811  == staged file   (byte-identical)
```

**nftables was NOT reloaded, deliberately.** The runtime rule added earlier is still live, so the
camera never blinked; the file now simply agrees with the running ruleset and will survive a reboot.
Reloading would have flushed the ruleset and killed netavark DNAT for the ERP stack — the file's own
`:4200` comment warns of exactly that.

Proof no flush occurred, taken immediately after: colony cam `:3020` HTTP 200, producer `:4200`
HTTP 200, **chip `:443` HTTP 200 (ERP still serving)**, stream `outputSkippedFrames` still 441 at
uptime 16:30:57.

**The runtime rule and the boot twin now match. This residual is CLOSED.**

## Also fixed the same night: the music was ducked, not lost

The operator asked to *"get the music back"*. It was never lost — `ShowRadio` was unmuted and
`PLAYING` the whole time, sitting 15 dB down at −24.3 dB. Cause: **`RemoteCam1` was still unmuted in
the UI with nobody on it**, so the camera-duck engine shipped earlier that night was holding the bed
in `DUCK` — correct behaviour per the operator's own spec (*"unmute in UI and focus comes to me with
music duck… only restore if all camera mics are muted"*), just pointed at an empty chair.

Muting the voice matrix (`POST :8098/api/voice {"which":"mute"}`) released it, and the engine did
exactly what it was built to do:

```
CAM_MUTE_EVENT input=RemoteCam8 muted=true
CAM_DUCK_WRITE state=RESTORED prevState=DUCK targetDb=-20.7 unmutedCams=[] anyHot=false
CAM_DUCK_CEILING_RELEASED bed=ShowRadio releasedCeilingDb=-20.7
```

Bed restored to −20.7 dB, the operator's own level, from the captured ceiling rather than a cached
guess. **This is the first LIVE observation of the `DUCK → RESTORED` transition** — gate
`camera-mic-ducking-and-slot-awareness` had it as `NOT_MEASURED` (proven off-air by RED-3 only).
Class A evidence now exists for it.

## Third fault, same night: no music and no card — and my first guess was WRONG

Operator, 04:48 UTC: *"there is no music the card it not overlayed on screen and no sound"*.

**One cause, both symptoms.** `ShowRadio` is an `ffmpeg_source` on
`http://<chip>:8687/radio?session=obs-studio-thinker`, and `command_center`'s music poller reads
`:8687/api/nowplaying` to fill the now-playing card. `:8687` was answering **HTTP 000** from THINKER,
so: no audio (the bed could not fetch the stream) and no card (the spool held `err: "unreachable"`,
and `nowplaying.html` / `musicbug.html` correctly **self-hide** rather than air a track name they
cannot stand behind — the honesty guard working exactly as designed).

**I assumed the firewall again and I was wrong.** `:8687` was indeed missing from the `trusted`
allowlist, so I added the runtime rule — **and `:8687` still returned HTTP 000.** That negative
result is what found the real fault.

**The real fault: `cpradio` was wedged.** `ss -lntp` showed `0.0.0.0:8687` **LISTENING with a
`Recv-Q` of 14** — fourteen completed connections stacked in the accept queue, unanswered. A healthy
listener sits at 0. The port was open; the process behind it had stopped accepting. Confirmed on
restart: it **ignored SIGTERM for 10 s and required SIGKILL**
(`StopSignal SIGTERM failed to stop container cpradio in 10 seconds, resorting to SIGKILL`).

`podman restart cpradio` → `:8687` answered **HTTP 200 in 67 ms**.

**The firewall rule was necessary but not sufficient.** Both were true at once: the port was blocked
from THINKER *and* the service behind it was hung. Fixing only one would have left it broken, and
the rule is not wasted — it is required for THINKER to reach `:8687` at all.

**Recovery, measured:** nudged `ShowRadio` to re-open its session (its ffmpeg connection had died
during the outage) → session `OPEN`, `cursor=4989` (counting from zero, a genuine fresh connect).

```
ShowRadio   frames 131  non-silent 131  peak -5.3 dB      <- real audio, not a flag
CARD        Dead Faces — The Collected Packages (Alone)  sessionOpen=true  pos=31.3
```

Verified again minutes later the card had advanced to `Dracos & Cartiers … pos=76.8` — the playlist
is genuinely rolling, not frozen on one entry.

**`:8687` persisted to the boot twin** alongside `:3020`
(`/etc/uni/nftables.conf.with-colonycam-and-radio-20260803`, sha256 `87b09343…`), promoted to
`/etc/nftables.conf` after `nft -c -f` validation. Final file: `-rw------- root root 5566`, ports at
lines 27 `:4200`, 38 `:3020`, 52 `:8687`, 63 `:8300`. **nftables still never reloaded.** Confirmed
after: `:3020` `:4200` `:8687` `:443` all HTTP 200 — ERP untouched.

## A limitation this exposed in my own fallback, stated plainly

`music_director`'s `enforceOneBed()` falls back to the file bed when `radioIsPlaying()` is false — and
it decides that from OBS's `mediaState`. Throughout this outage `ShowRadio` reported
`OBS_MEDIA_STATE_PLAYING` while fetching nothing, because ffmpeg reports PLAYING for a
connected-but-dead upstream. **So the fallback never fired.** The "real fallback" shipped earlier
tonight protects against the source *stopping*; it does not detect a source that is *lying about
playing*. Detecting that needs a meter check (zero non-silent frames over N seconds), not a state
check. Not fixed here — recorded as a known gap.

## Stated residual — what is still open
- **`:4000` is still firewalled off** and was not restored. It is not needed for the overlook
  (`:4200` + `:3020` are), and every health surface now reads `:4200`. Minimal change was preferred
  mid-broadcast over opening a second port.
- **The watchdog is not boot-persistent.** It is a resident process started by hand tonight; it will
  not come back on its own after a reboot of THINKER.
- The on-air health ticker reads `10/12 systems up · DOWN: cam1, cam2` — not investigated, outside
  the scope of this fault.
