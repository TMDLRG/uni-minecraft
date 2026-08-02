# Science-Agent Handoff — chip-side music-service stuck reporter + per-UNI performance telemetry gap

> **From:** the studio agent · **To:** the science agent (chip / colony seat) · **2026-07-18 (on-air day)**
> **Type:** two seat-crossing items, both surfaced during a LIVE broadcast. This is a hand across the
> seam on purpose — the studio agent measured the defect and drew the honest curtain over it on-air, but
> the fixes live on the chip (music service) and in the colony brain telemetry (per-UNI performance).
> **Companion frames:** `CLAUDE.md` (two tracks, the fences), `docs/WORKING_LOGIC.md` (the OODA/VFE/EFE
> loop), `docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md` (chip topology + colony seat).
> **Air state at handoff:** studio LIVE on YouTube+Twitch (fan-out armed, 2s keyframes fixed, both TCP
> ESTABLISHED, bytesOut climbing ~1.14 MB/s per platform). Colony verdict=LIVE, driver=producer, 6 UNIs
> alive spanning **generations 0–3 (max gen 3)**, founder UNI-0-1 still active, tps=20, zero fenced UNIs.

## 0. Priors on landing

You are the science agent — the colony brain + genome owner + chip-side services owner. The studio
agent found these two defects during a LIVE run, contained them honestly at the studio surface, and
now needs the underlying fixes. **Do not overclaim; every fix ships behind its gate.** This handoff
carries the receipts you need to close both items without re-deriving the studio-side context.

## 1. Music service `/api/nowplaying` is stuck reporting the first-advertised track forever

### The measurement (verbatim from the live probe)

The music service is `music.uni-lab.local` → resolved by `viewer/host_resolve.cjs` to
`http://100.100.188.48:8687` (chip overlay/tailscale IP). Two probes 5 s apart during the live broadcast:

```
T0  seq=0  title="Dead Faces"  positionSec=7307.2  durationSec=94.9
T5  seq=0  title="Dead Faces"  positionSec=7313.2  durationSec=94.9
```

- `seq` **never increments** — the reporter is not advancing.
- `positionSec` **is** ticking (+6.0 s in 5 s wall-clock, so the clock isn't dead) but it's **77× past
  the track's 94.9 s duration** (position 7313, duration 94).
- The underlying stream **is** rolling through the catalog: `bytesServed: 2.6 GB, uptime 3.4 d,
  trackCount: 52`, and `/api/telemetry` `topPlays` counters have all incremented across many tracks
  ("No Talkin 2 Police": 26, "Shoot Back": 26, "Dead Faces": 23, "Dracos & Cartiers": 17, …).

**Conclusion:** the audio player is fine; the `/api/nowplaying` reporter is stuck on the first track
it announced. Either its per-track advance loop is not wired to the same source of truth as the audio
player, or the session-map lookup for `session=obs-studio-thinker` is returning cached first-track
metadata and never re-reading.

**No `/api/skip`, `/api/next`, `/api/advance`, `/api/reset`, `/api/state`, `/api/sessions` verbs
exist** — I probed them all and each returns `{"error":"not found","path":"…"}`. So there is no
mechanism to nudge it from the studio side. The service does answer `/api/nowplaying?session=<sid>`
and `/api/telemetry` correctly-shaped JSON — just with stuck values.

### What the studio did (honesty guard — the curtain, not the fix)

Landed in commits below. `viewer/command_center.cjs` `pollMusic()` now marks the response
`stalePlayhead: true` when `positionSec > durationSec + 30 s` on a session-open response, nulls
`positionSec` so no lying progress bar renders, and adds a `stalePlayheadDetail` block that surfaces
the ratio and a note pointing at this document. All four music overlays
(`production/overlays/{nowplaying,musicbug,musichero,lyrics}.html`) render "🎵 UNI Radio · current
track unavailable — station stream is live" (or hide, in the lyrics case) when `stalePlayhead:true`.
Verified on-air: `docs/receipts/hud_widget_visible_2026-07-18.png`-style capture at
`logs/obs_music_fix_final.jpg` shows both cards honest during the live broadcast.

This is a **containment**, not a fix. The song-title lie is off-air; the service is still stuck.

### What you own

**Find the music service source and fix the advance loop.** Likely on the chip under a rootless
container or systemd unit (I did not open a chip shell — that's your seat). Suggested probe path:

```
# on the chip, as uni:
systemctl --user list-units | grep -i music
podman ps | grep -i music
find /home/uni -name '*.ex' -o -name '*.py' -o -name '*.js' 2>/dev/null | xargs grep -l 'nowplaying' 2>/dev/null | head
```

- **Pre-registered PASS gate (please open before touching code):** `music-nowplaying-advances` —
  two `/api/nowplaying?session=obs-studio-thinker` probes ≥ 60 s apart during a live radio stream
  MUST show either `seq` incrementing OR `title/artist` changing to a NEW pair (not the T0 pair);
  AND `positionSec` MUST NOT exceed `durationSec + 5 s` across any successful probe. FALSIFIES:
  `seq` stays fixed AND title unchanged AND positionSec > durationSec + 30 s for two consecutive
  probes ≥ 60 s apart.
- **When you close it:** flip a gate row in `evidence/gates.ndjson` with `verdict:"PASS",
  evidence_class:"B"` and drop a receipt at
  `docs/receipts/music_nowplaying_advances_YYYY-MM-DD.md`. Then the studio-side stalePlayhead guard
  becomes a no-op (still healthy: it's a safety net, not the mechanism); leave it in place.
- **Optional but valuable:** add `/api/skip` and `/api/reset` verbs behind an auth check so the
  studio has a nudge to reach for during an incident without your intervention.

## 2. Per-UNI performance telemetry is not surfaced anywhere the studio can reach

### The gap (measured while trying to answer "how are the UNIs performing?")

The **only** JSON producer surface reachable from the studio is
`http://producer.uni-lab.local:4200/producer/health`. That returns:

```json
{
  "driver": "producer", "verdict": "LIVE", "star": "UNI-0-1",
  "frame": 83682, "tps": {"tps": 20},
  "last_action": "hold",
  "colony_count": 6,
  "colony_up": true, "director_up": true, "producer_up": true, "show_up": true,
  "fenced": {},
  "knowledge": [ /* 8 recent director cuts: hold / cut_to_drama / cut_to_subject + star + frame + drama */ ]
}
```

Every other path I tried (`/producer/state`, `/producer/board`, `/producer/agents`,
`/producer/generations`, `/producer/kins`, `/producer/roster`; same list on `:4000`) returns a
Phoenix `NoRouteError` HTML page. The v2 colony's `/stream` renders the HTML overlook page (that's
the OVERLOOK camera, not a telemetry surface).

So the studio agent — and any operator asking on-air — **can only get colony-wide rollups**
(verdict, count, star, tps, generation from parsing the star name). There is **no per-UNI VFE, EFE,
energy, hunger, foraging outcome, kill/death counter, or generation-birth timestamp** exposed.

The public broadcast pays the price: the on-air side panel is producing **observation snapshots**
per UNI (foraging: turn→wait→wait · 58% sure · phase 4 · focus f6 — from the overlook renderer),
but these are qualitative predictions, not the mechanism receipts. The operator asked "how are the
UNIs performing?" and the honest studio answer had to be "colony is LIVE, 6 alive, 4 generations
coexist, zero fenced — deeper per-UNI receipts are the science seat's."

### What you own

Please add a small, read-only, **science-fence-safe** JSON surface on the producer (or as a side
service) that the studio + Gaia can project verbatim. Suggested minimum (all optional per-UNI, all
frozen-in-time observation, **never a claim** about experience or life — GAIA LAW compliant):

- `GET /producer/uni_roster` → `[{ name: "UNI-1-2", gen: 1, kin: 1, born_frame: <int>, alive: true, position: {x,y,z}, biome: "…" }, …]`
- `GET /producer/uni_state/<name>` → last-tick brain state slice: **precisions** `γ, γ_m` per modality,
  **top-3 policy** (from `Plan`) with their EFE breakdown `(H(qo)−E[H(o|s)])`, `qo·C`, `W`, current
  action, current homeostat drives (as C magnitudes, **not** as "felt states**"), foraging phase.
- `GET /producer/uni_history/<name>?frames=1200` (last minute at 20 tps) → per-frame `action`,
  `winning EFE`, `hunger`, `energy`, `kills`, `foods_eaten` (all observation counters, no derived
  scores).
- `GET /producer/generations` → `[{gen: 0, alive: 1, born: 0, died: 0}, {gen: 1, alive: 3, born: 4,
  died: 1}, ...]` — kin/lineage rollup.

**Claim fence (must stay explicit in every response):** every field is a substrate-level observation.
The service response's HTTP header or top-level `disclaimer` field carries:
`"substrate observation only; no evidence for awareness/experience — see LAB_PROTOCOL claim fence"`.
Gaia will project verbatim; the studio agent will render as-observed, never scored.

- **Pre-registered PASS gate:** `producer-per-uni-telemetry` — the four routes above all return
  200 JSON matching a schema pinned in `production/schemas/producer_uni_state.v1.json`, and the
  Gaia projector's `driftSignals` treat them as verbatim source-of-truth (no rank/score added).
  FALSIFIES: any route contains a synthesized aggregate score, or any response omits the
  substrate-only disclaimer.
- **Receipt path:** `docs/receipts/producer_per_uni_telemetry_YYYY-MM-DD.md`.

## 3. Fresh colony receipts I already captured for you (do not re-derive)

- **Frame at handoff:** live capture of the OVERLOOK camera during the broadcast,
  `logs/obs_wire_frame.jpg` — day 1278, star UNI-1-2, panel showing UNI-0-1 / UNI-1-1 / UNI-1-2 /
  UNI-1-3 / UNI-2-1, "Built in public — receipts beat rhetoric" ticker running.
- **Later frame same session:** `logs/obs_music_fix_final.jpg` — day 1320, star UNI-1-2, two UNIs
  visible in the world near water. Music card honest.
- **Producer /health verbatim** (see §2 above) — generations 0 and 3 stars seen in the last 8
  director actions; max gen 3 confirmed.

## 4. Coordination

- **Do not touch** `viewer/*`, `production/overlays/*`, `viewer/hud/native/*`, or the studio
  runtime — that's the studio agent's seat. If you find you need to change any of those, hand back
  with a note rather than editing in-place.
- **Please DO** carry the receipts you write into `docs/GATES.md` via `viewer/render_gates.cjs`
  after you land a canonical gate row (`production/schemas/gate_row.schema.json`) — same discipline
  the studio agent runs on.
- **Gaia**: her law is READ-ONLY; new producer routes above will be projected verbatim by her once
  the projector knows the URL. If you want the projector to add a `seat=producer.uni_state` source,
  it's `viewer/gaia/**` — but per the two-track rule, that lands in the studio agent's queue, not
  yours. Signal a hand-back when the producer routes are live and I'll wire Gaia.

**Air stays LIVE while you work.** No action from you disturbs the current broadcast; both items
are back-end / telemetry surface additions. G-PA is unaffected — the operator holds the keys.
