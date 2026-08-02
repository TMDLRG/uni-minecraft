# UNI Production - broadcast graphics package (overlays)

Transparent, **2D-canvas / CSS-only** overlay pages for the UNI Production
Platform. Each page is a complete standalone HTML file that polls a shared
`state.json` (the `broadcast.json` overlay contract) and renders exactly one
widget. OBS captures each as a transparent browser-source and composites them
over the program. No WebGL/WebGPU anywhere (it renders black in OBS CEF capture
and under software raster), no build step, no npm.

> This directory is a **design / reference**. Nothing here is deployed. See the
> Status footer.

## The pages

| Page | Reads | Renders |
|------|-------|---------|
| `ticker.html` | `state.ticker[]` | Bottom news ticker (seamless doubled-string CSS scroll). |
| `lower-third.html` | `state.lowerThird` | Animated name strap (kicker/title/subtitle/tone), crossfades in/out on `visible`. |
| `title.html` | `state.title` | Full-screen title / bumper card, crossfades in/out on `visible`. |
| `caption.html` | `state.caption` | Live captions/subtitles; language via `?lang=` or `state.caption.lang`; shows `translations` if present. |
| `onair.html` | `state.onAir` | ON-AIR indicator + debounced steps(1) flash. |
| `clock.html` | `state.clock.zones[]` | Multi-zone world clock (Intl + tabular-nums). |
| `standby.html` | (self; optional `state.title`) | Full-screen "please stand by" fill card with a slow 2D-canvas accent (playout fallback). |

Shared palette + base transparent styles: `assets/overlays.css` (glass tokens:
`--panel`, `--ink`, `--accent`, `--ok`, `--warn`, `--crit`).

Sample state writer: `producer-sample.py`. Static seed (a schema-valid snapshot DEPLOY installs
to `/var/lib/uni/broadcast/broadcast.json` before the overlays container starts): `broadcast.sample.json`.

## URL pattern

The overlays container (`uni-bcast-overlays`, `caddy`/`nginx:alpine` static)
serves this folder at loopback `127.0.0.1:8099`:

```
http://127.0.0.1:8099/overlays/<page>.html
```

Examples:

```
http://127.0.0.1:8099/overlays/ticker.html
http://127.0.0.1:8099/overlays/lower-third.html
http://127.0.0.1:8099/overlays/caption.html?lang=es
http://127.0.0.1:8099/overlays/clock.html
http://127.0.0.1:8099/overlays/onair.html
http://127.0.0.1:8099/overlays/standby.html
```

Each page fetches `./state.json` (relative), which the static server **aliases**
to the producer's spool with `Cache-Control: no-store`:

```
/overlays/state.json  ->  /var/lib/uni/broadcast/broadcast.json   (alias, no-store)
```

So the producer writes `broadcast.json` once and every page picks it up on its
next poll (every ~250-1000ms depending on the widget).

## Adding a page as an OBS browser-source (transparent)

1. In OBS, in a scene, add a **Browser** source.
2. **URL:** the page URL, e.g. `http://127.0.0.1:8099/overlays/lower-third.html`.
3. **Width / Height:** match the canvas, e.g. `1920 x 1080`.
4. Leave **"Shutdown source when not visible"** unchecked so polling continues;
   check **"Refresh browser when scene becomes active"** if you want a clean reset
   per scene.
5. Transparency is automatic - the pages set `html,body{background:transparent}`,
   so OBS composites them over the video with no extra custom CSS needed. (If you
   want to be explicit, the OBS browser-source "Custom CSS" box can stay at its
   default `body { background-color: rgba(0,0,0,0); margin: 0; overflow: hidden; }`
   - the pages already do exactly that.)
6. Stack the overlay sources above your camera/clip/colony sources in the scene.
7. Repeat per overlay you want in that scene (ticker + lower-third + onair + clock
   is a common news-desk stack). `standby.html` is its own STANDBY scene fill (it
   paints an opaque backdrop on purpose - it is a fallback card, not a see-through
   overlay).

**Anti-throttle note:** on the containerized Linux target OBS browser-sources do
not hit the Windows dual-GPU WebGL-black problem, and these pages use no WebGL, so
no special flags are required. If you ever capture them in a real Chrome window
instead (the dev-box escape hatch), launch with the anti-throttle flags
(`--disable-gpu`, `--disable-background-timer-throttling`,
`--disable-renderer-backgrounding`) so the poll/animation loops keep running while
the window is unfocused.

## The `state.json` contract

`state.json` is the `broadcast.json` overlay state, defined by
`production/schemas/broadcast.schema.json`. Shape (abridged):

```jsonc
{
  "updatedUtc": "2026-06-21T18:04:22.117Z", // ISO-8601 UTC; pages show staleness honestly
  "source": "uni-producer",
  "onAir":      { "value": true, "text": "LIVE" },
  "lowerThird": { "visible": true, "kicker": "UNI EXPERT", "title": "Dr. A. Rivera",
                  "subtitle": "Trauma & the nervous system", "tone": "ok" },
  "title":      { "visible": false, "kicker": "", "text": "", "subtitle": "" },
  "ticker":     [ { "text": "EducateWright - the science feed, back on air", "tone": "ok" } ],
  "caption":    { "visible": true, "lang": "en", "text": "...live line...",
                  "translations": { "es": "...", "hi": "..." } },
  "clock":      { "zones": ["UTC", "America/Chicago", "Europe/London", "Asia/Kolkata"] },
  "music":      { "volume": 0.18, "ducked": true },
  "nowPlaying": { "segment": "Interview", "lang": "en", "clipId": null },
  "brand":      { "logo": "uni-logo.png", "poweredBy": "solution-wright-logo-light.png" },
  "evidence":   { "class": "C" }
}
```

`tone` is one of `ok | warn | crit | unknown | accent` and maps to a left-border colour
(`accent` is the neutral brand-accent default the pages + CSS use).
Who writes it: the `uni-producer`, and the production-MCP `set_overlay` / `narrate`
/ `duck` tools mutate it.

**Honest rendering, by design.** Every page:

- Shows **staleness** from `updatedUtc`: if the snapshot is older than the page's
  threshold, the ticker pauses + tags "feed stale Ns", straps hide, and a missing
  feed shows "no feed" - the overlays never imply a live signal that is not there.
- Renders **nothing or a muted placeholder** for a missing field (e.g. an
  unavailable caption language shows "no &lt;lang&gt; caption available" greyed out,
  never an invented translation; an invalid clock zone shows "invalid zone", never
  a fabricated time).
- Uses no WebGL/WebGPU (2D canvas / DOM / CSS only) so it captures cleanly under
  `chromium --disable-gpu` software raster and in OBS CEF.

## Test it locally (no container needed)

From this folder, write a sample snapshot **next to the pages** and serve them
with any static server:

```bash
# 1) write a live-updating sample state.json beside the pages
python producer-sample.py --out ./state.json --loop 1.0 &

# 2) serve this folder (so ./state.json resolves)
python -m http.server 8099
#    then open, e.g.:
#    http://127.0.0.1:8099/lower-third.html
#    http://127.0.0.1:8099/caption.html?lang=hi
```

(When served straight from this folder the pages resolve `./state.json` to the
file you wrote; in production the same `./state.json` resolves to the nginx alias
of `/var/lib/uni/broadcast/broadcast.json`.)

---

## Status (honest)

- This is a **design / reference**, not a deployed system. Every "the overlay
  will / does" is a proposal; status: **pending**. The pages are working,
  buildable HTML/CSS/JS authored against the fixed `broadcast.json` schema, but no
  broadcast node, container, or stream is stood up here.
- Evidence posture: the schema and rendering techniques are authored this session
  against `docs/UNI_PRODUCTION_PLATFORM.md`; nothing is marked verified / proven /
  guaranteed / real. As captured, not asserted as live.
- The pages render honestly: stale/missing data is shown as stale/missing (muted
  placeholders), never faked.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi,
  cloudflared, portainer) is **never** a mutation target of this graphics package,
  and the encoder is **not** co-located with it. These overlays are read-only
  consumers of `state.json`; the producer agent only proposes overlay state and
  **cannot self-approve** - mutating broadcast actions route through the human
  approval gate.
