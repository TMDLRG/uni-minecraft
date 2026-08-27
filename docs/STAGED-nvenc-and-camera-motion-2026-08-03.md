# STAGED: the NVENC switch and the camera-motion fix — both blocked on the operator, with proof

**2026-08-03, hour ~28 of a public run.** The operator asked for both of these directly. Neither can
be performed by an agent tonight. This document records exactly why, and stages both so his part is
as small as possible.

Nothing in here has been applied. The air is on `MUSIC_HOUR`, clean.

---

## 1 · NVENC — BLOCKED by F31, and the block is correct

### The change
`%APPDATA%\obs-studio\basic\profiles\UNI\basic.ini`, and the profile is **`[Output] Mode=Advanced`**
(verified), so the live key is the `[AdvOut]` one, NOT `[SimpleOutput]`:

```ini
[AdvOut]
Encoder=obs_x264        ->   Encoder=obs_nvenc_h264_tex
```

### Why it is worth doing
1080p30 is being encoded in **software x264, preset veryfast, CBR 4000** on a **35 W i7-10700T**,
while **NVENC 12.2 (driver 13.0) sits registered and completely idle** on the T1000 that OBS is
already compositing on. The box measured **100% CPU across three consecutive samples**. The fan-out
is `-c copy` (`viewer/dual_push.cjs:71-78`), so every output parameter is decided in OBS alone.

### Why an agent cannot do it
Two independent facts, both verified tonight:

1. **OBS refuses encoder changes while streaming.** `viewer/command_center.cjs:951` says it in the
   codebase's own words — *"You cannot change stream service settings while streaming"*. The
   Settings → Output → Streaming → Encoder control is disabled for the duration of an active output.
2. **Restarting the stream is the operator's door.** `viewer/command_center.cjs:2212` —
   `/api/golive` returns `golive_guard.refusalResponse("api/golive")`. F31 refuses every agent path.
   The `StartStream` call at `:2218` sits behind that refusal.

So the sequence is: stop the stream → change the encoder → **start the stream, which only Michael
can do** (mint a presence token, type `CONFIRM`). An agent that stopped the stream would take the
broadcast off air with **no path back on its own**.

**There is a bypass and it is deliberately not being used.** OBS WebSocket on `:4455` is
unauthenticated, and `obs.req("StartStream")` would start the output directly, around F31. That is
exactly the chokepoint the guard exists to be. Going around it would make the guard a decoration.
S6 is his; this is not an agent's call to make.

### DO NOT BUNDLE — the trap
`%APPDATA%\obs-studio\global.ini:7` `BrowserHWAccel=false` is forcing **thirteen 1080p CEF pages**
onto the CPU and is the other obvious win. **Change it in a separate window.** It needs a full OBS
restart; an OBS restart goes through `viewer/studio_up.ps1:423` → `studio_stage.cjs`; and with OBS
not streaming, the refusal guard at `studio_stage.cjs:526-529` does not fire — so the **WGC
black-picture dice gets re-rolled on the two capture sources that currently work**. That has cost
the live window twice already (`docs/handoffs/CAM_ROBUST_MEDIA_SOURCE_2026-07-16.md:14-25`).

### The operator's runbook
1. Announce the window (films / `MUSIC_HOUR` already holds the air).
2. Stop the stream.
3. OBS → Settings → Output → **Advanced** → Streaming → Encoder → **NVIDIA NVENC H.264**. Change
   nothing else in that dialog.
4. Re-arm and go live: mint presence, `POST :8098/api/golive {"confirm":"CONFIRM"}`.
5. Verify: `node viewer/dual_push.cjs --status` (readers=2, both alive), then **look at a frame** —
   `curl -s -o f.jpg "http://127.0.0.1:8098/api/thumb?scene=MUSIC_HOUR"`.

### The falsifier, stated in advance
NVENC moves load **onto the T1000**, which is also compositing OBS while both channel windows render
with hardware acceleration. **If judder gets worse rather than better after the switch, that is the
falsifier and the change should be reverted, not defended.**

---

## 2 · CAMERA MOTION — BLOCKED by the deployment shape, not by a guard

### The diagnosis (this is the real judder, and it is not frame rate)
The camera **pose** is updated 10×/second by RCON teleport — `viewer/director.js:265`,
`glideTimer = setInterval(glide, 100)` — while the page draws at ~59 fps. The client **tweens
position over 50 ms but SNAPS rotation with no tween at all**
(`prismarine-viewer/viewer/lib/viewer.js:76-83`: position gets `new TWEEN.Tween(...).to({x,y,z}, 50)`,
rotation gets a bare `.set(...)`).

Every director shot is an orbit with a `facing` target, so **yaw changes on every single update:
ten visible rotation steps per second, at any frame rate.** No frame-pacing, bitrate, encoder or GPU
work touches this. It is the largest genuine smoothness win available.

### The two edits

**(a) `viewer/director.js:265`** — pose arrival rate:
```js
glideTimer = setInterval(glide, 100)   ->   setInterval(glide, 50)
```

**(b) `prismarine-viewer/viewer/lib/viewer.js:76-83`** — tween the rotation over the same duration as
the position tween, **shortest-arc on yaw** so it does not unwind through 2π at the wrap.

### Why an agent cannot do it tonight
**`viewer/director.js` is baked into the container image, not mounted.**
`deploy/uni-producer/Containerfile:32`:

```
COPY viewer/director.js ./viewer/director.js
```

Editing the repo file changes nothing at runtime. Landing it needs an image rebuild + redeploy, and
`deploy/uni-producer/deploy.sh` is on the forbidden list — it is stale, refuses to run, and is
documented to **break the live camera by creating a second forwarder colliding on `:3020`**.

Confirmed independently: **`director.js` is not running on THINKER at all** (no `node director.js`
process), so the local `viewer/node_modules/prismarine-viewer` copy is **not** the one that executes.
Editing it would have been a placebo — the precise failure mode this project exists to prevent, and
the same shape as the ffmpeg `-reconnect` proposal that was withdrawn earlier tonight.

### Order of application, and the risk to respect
Apply **(b) the rotation tween FIRST and alone.** It costs nothing and carries no streaming risk.

**(a) is the risky half and terrain is already missing.** Doubling the teleport rate doubles the
mineflayer `move` handler's socket emits and chunk-window bookkeeping, and
`worldView.updatePosition` has **no re-entrancy guard** (`worldView.js:105-130`). On a
`viewDistance: 4` camera (`director.js:258-260`) that is precisely the load the slow shot table was
written to avoid — `director.js:34-46` says the motion was deliberately calmed *"so a viewDistance-4
camera on a modest box keeps terrain streamed in instead of orbiting into blue void."*

**Measure terrain at 20 Hz before going further. If streaming degrades, revert to 100 ms and keep
only the rotation tween.**

### A durability trap that will silently undo this
The `prismarine-viewer` edit lives in **`node_modules`**, is **not version-controlled**, and will be
**silently lost on the next `npm ci`**. It must be committed as a patch (e.g. `patch-package`) or it
regresses with nothing noticing.

### Blast radius
`director.js` is a Port owned by `SP.Brain.Director` with `EXIT_ON_STDIN_EOF=1` and a single-camera
invariant (`lib/sp/brain/director.ex:663-687`, `director.js:229-235`). **It cannot be restarted
standalone.** The change lands only on an SP restart, which also takes the `:4200` producer page down
— and therefore the OVERLOOK feed.

---

## Still open, and NOT fixed by either of the above

**The missing terrain.** A freshly reloaded viewer shows a UNI in empty sky with no ground, minutes
later. Ruled out tonight, with evidence:

- not a crashed page — `channel_probe` returns ALIVE, exit 0;
- not RCON being dead from the camera's side — RCON from THINKER does not connect at all, so
  `director.js` inside the cluster is unaffected, and the Producer reads `tps 20.0` through it;
- not the camera being lost after a respawn — `/producer/health` shows `star: UNI-2-1` with the star
  rotating across beats, and `director.ex:250-252` re-sends the star precisely so a fresh camera does
  not *"sit at its spawn point until the next cut."*

Leading hypothesis, **UNVERIFIED**: the framed UNI is high enough that no terrain falls inside the
camera's 64-block `viewDistance: 4` bubble, and the server-side `forceload` square
(`director.js:84-96`) is not covering it. The measurement that would settle it is the **Y coordinate
of the star and of `Director`** — which needs RCON *from inside the cluster*, since it is unreachable
from THINKER.

**Also note:** `/api/thumb` serves a **cached** frame for off-program scenes — an OVERLOOK thumb came
back byte-identical (12558 bytes) to one taken 90 minutes earlier. Do not diagnose a non-program
scene from it.
