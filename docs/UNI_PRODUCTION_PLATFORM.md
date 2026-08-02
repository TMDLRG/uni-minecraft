# UNI Production Platform — end-to-end live broadcast on UNI.OS

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](../production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](../production/docs/adr/ADR-PROD-012-encoder-placement-policy.md) + [STUDIO_SYSTEMS.md](STUDIO_SYSTEMS.md) first.**
> The mixer / captions / livekit container sections below are **VOIDED** — headless containerized OBS on
> a GPU-less Linux node software-renders CEF to black. The mixer is now native Windows OBS on THINKER
> (NVIDIA T1000). The Linux node's role collapses to `uni-bcast-relay` (mediamtx copy-fan-out to YouTube +
> Twitch via `runOnReady` tee) — the only container that stays. The platform-level data flow is now
> single-encode THINKER → node2 RTMP → YT/Twitch. Overlays (2D-canvas per ADR-PROD-005) and single-encode
> → copy fan-out (ADR-PROD-008) are UNCHANGED. Any mention below of the "System 2 mixer" is stale.

**Status:** complete buildable design (v1). Supersedes the v0 grounding plan; the P0 foundation section is
unchanged. This document fixes every architecture decision, the container/port map, the MCP tool surface, and
the `broadcast.json` overlay contract, then hands off to the `production/` tree (quadlets, MCP server, overlay
package, run-of-show, guest app, control UI, catalog, ADRs, GAPS). Every artifact under `production/` is
authored against the contracts fixed here.

**Authored:** 2026-06-21. **Evidence posture:** this is a *design*. Nothing here is deployed. Foundation
(P0) claims are Class-C/B (read this session from the named files). Every "the platform will…" is a proposal,
status `pending`, not a statement of current fact. See the Honesty footer + GAPS register at the foot.

**Posture update (2026-07-11): P1 CORE IS DEPLOYED on `uni-lab-79740c` (mesh 10.13.13.3)** — overlays/relay/mixer/production-MCP live; see `production/docs/DEPLOYED_STATE.md` + `verify_p1.sh`. The `production-MCP` deployed on **`:8095`** (401), NOT the designed `:8094` (`:8094` = `uni-glass-configure`, 404). Sections below stating "Nothing here is deployed" and `:8094` are the ORIGINAL design and are superseded on this point.

---

## Mission (why this exists)
The **EducateWright** nonprofit + the **UNI** project need their **science feed back on the air** — it has
been drowned out. The platform is a **7-day-a-week** live broadcast covering the mission: **end school
shootings, solve trauma, align mental-health treatment to nature, world peace, global understanding, free
food / water / health, and a path to travel the stars.** It must reach **all time zones** and be
**multilingual**, at the production quality of **CNN / BBC / PBS / Twitch**, run by **one operator + guests +
the UNI expert (AI)** backed by a full **LLM/MCP production team**.

## Operating picture (the one-man-band)
One person mixes a broadcast-grade live show by **voice or text commands** (like a singer with a pedalboard):
cut cameras, ride the music, roll clips, bring guests up from a green room, trigger graphics, start a
narration in any language — all by speaking or typing, with the **UNI Producer** (an LLM/MCP agent) running
the gallery underneath. Remote guests join by opening a simple UNI.OS-hosted page, connecting cam+mic, and
authenticating; the host admits them to a green room, then to air.

---

## P0 — proven foundation (already working; build on it, do not relitigate)
- **The Director model:** ONE external show-runner cues a **set-once vision-mixer**; the encoder passes
  **ONE feed** to YouTube. Never pile sources into the encoder. (`viewer/director_show.cjs` cues OBS via
  obs-websocket; `viewer/obs_stage.cjs` builds the clean scenes; `viewer/launch_channels.ps1` brings up the
  source windows.) `director_show.cjs` carries the seam comment *"replace the timer with cues from
  SP.Producer beats"* — that seam is where the UNI Producer takes over.
- **Channels proven on air:** COLONY (Minecraft colony cam `:3020`), GLASS_OS (the **real** UNI.OS glass
  `https://10.190.245.122/glass/`), PIP (two-up), looping music bed, fade transitions — one RTMP to YouTube.
- **Hard-won rendering lesson (dev box):** WebGL renders **black** in OBS CEF browser-sources and in
  cross-origin iframes; only **real Chrome windows captured via WGC** work, with anti-throttle flags. *This
  constraint is a Windows-dual-GPU artifact and goes away once the pipeline is containerized on UNI.OS/Linux
  — design for the container target.* The glass cockpit proves the escape hatch even on Linux: it renders a
  rotating globe + live gauges entirely on the **2D canvas** (never WebGL) under `chromium --disable-gpu`
  software raster, so it captures cleanly. **The whole graphics package follows that rule: 2D-canvas / CSS
  only, never WebGL/WebGPU.**
- The Minecraft colony production (`viewer/director.js` / `SP.Producer` / `:3020` + `:4000/stream`) is
  **self-contained** — it is just one source; **leave it alone**. The platform consumes it over the LAN; it
  never edits inside it. (Container recipe already exists: `docs/UNI_OS_COLONY_MIGRATION.md`.)

---

## The one architecture-shaping constraint: where the encoder runs

The UNI Lab appliance (the Dell PowerEdge that hosts `/glass`, the uni-lab MCP, and the **protected business
stack** — `solutionwright-odoo` ERP, Jitsi, cloudflared) has a **Matrox G200: no 3D, no hardware video
encode** (observed 2026-06-21 from `lab-os/systemd/uni-cockpit-kiosk.service`, which runs `chromium
--disable-gpu`; and from ingest map A — no `nvidia`/`--gpus`/CDI passthrough anywhere). A 4 h × 3/day H.264
broadcast encoded in **x264 software** on that box would load its CPU heavily and put the mission-critical ERP
at risk — which the Epistemic Charter forbids (the business stack is read-only, never stressed).

**Decision (ADR-PROD-003):** the broadcast **encoder/mixer runs on a dedicated UNI.OS broadcast node**, *not*
co-located with the ERP. The node runs the **same UNI.OS image + rootful-Podman + quadlet pattern**, so the
stack is identical; it just adds a cheap **NVENC/VAAPI-capable GPU**. The quadlets are **host-portable** and
**encoder-parameterised**: `x264` software is the zero-GPU default; `h264_nvenc` (NVIDIA) or `h264_vaapi`
(`/dev/dri`) engage when a GPU is present (`PodmanArgs=--device nvidia.com/gpu=all` via CDI, or
`--device /dev/dri`). The appliance keeps serving `/glass` and the MCP/approval control plane; the broadcast
node does the heavy lifting. This is GAP **G-ENC** (the exact node/GPU is an operator hardware choice; until
chosen, the design encodes 720p30 x264 `faster` as the honest floor). The NVIDIA **T1000** already attached to
the ComfyUI dev box is a *candidate* NVENC node, but the brief is to move **off** the dev box — so a dedicated
node is the target.

---

## Target architecture — the container stack (containerized on UNI.OS)

Everything runs as **Podman quadlets** (`.container` → `podman-system-generator` → `.service` at boot, the
exact `portainer.container` pattern from ingest map A) plus a few **host systemd services** (Python under
`/opt/uni/production`, the `uni-control-mcp.service` pattern). All mutations go through the **uni-lab MCP +
human-approval gate** (the agent cannot self-approve). Persistent broadcast state lives under
`/var/lib/uni/broadcast/` (host bind) or named Podman volumes — never `/tmp` or `/run` (tmpfs, wiped).

### Container / service map (the fixed contract — every artifact uses these names + ports)

| # | Unit | Kind | Image / module | Bind / port (loopback unless noted) | Role |
|---|------|------|----------------|------------------------------------|------|
| 1 | `uni-bcast-mixer` | quadlet | `obsproject/obs` headless + xvfb/wayland + obs-websocket | obs-websocket `127.0.0.1:4455`; RTMP out → relay | **Vision mixer + encoder.** Set-once OBS; scenes COLONY/GLASS/GUESTS/CLIP/NEWSDESK/TITLE/STANDBY/PIP, each layered with overlay browser-sources + the music bed. One program → SRT/RTMP → relay. Encoder param: x264 / nvenc / vaapi. |
| 2 | `uni-bcast-relay` | quadlet | `bluenviron/mediamtx` | RTMP `:1935`, SRT `:8890`, API `127.0.0.1:9997` | **Restreamer.** Single ingest from the mixer → copy-fan-out (no re-encode) to YouTube + Twitch + others. SRT mixer→relay for resilience. |
| 3 | `uni-bcast-overlays` | quadlet | `caddy`/`nginx:alpine` static | `127.0.0.1:8099` | Serves the **transparent 2D-canvas overlay pages** + the `stage` (guest layout) page + `state.json` (aliased from the spool). Captured by OBS as browser-sources. |
| 4 | `uni-bcast-livekit` | quadlet | `livekit/livekit-server` | ws/http `:7880`, rtc-tcp `:7881`, rtc-udp `50000-50200` | **WebRTC SFU for guests.** Green-room room + on-air room; talking-head/panel. The `stage` page subscribes to the on-air room; OBS captures the stage page. |
| 5 | `uni-bcast-captions` | quadlet/svc | `faster-whisper` (CTranslate2) | `127.0.0.1:8501` (8500 is Piper TTS) | **Live captioner.** Transcribes program/mic audio → caption text (+ optional translation) → writes into `broadcast.json` for the caption overlay + a YT caption track. |
| 6 | `uni-production-mcp` | host svc | `python -m production.mcp.server` | `127.0.0.1:8094` (deployed :8095 on this node), nginx `/prod-mcp` | **The production MCP** (FastMCP). Tools: `open_session`/`close_session`/`command`, `cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`, `start_segment`, `admit_guest`, `schedule`, `start/stop_broadcast`, read-only `get_show_state`/`list_*`. Mirrors `services/control_mcp` exactly; destructive ops gated through `/etc/uni-approvals`. |
| 7 | `uni-producer` | host svc | `python -m production.producer.run` | — | **The UNI Producer** (show-runner). Runs the deterministic run-of-show clock + auto-duck + standby/watchdog, emits "beats"; an LLM (Claude over the MCP) handles creative/narration/guest decisions + the operator's voice/text commands. The `director_show.cjs` seam, generalised. |
| 8 | `uni-playout` | host svc | `python -m production.playout.run` | — | **Scheduler / playout.** Reads `catalog.json` + the per-slot run-of-show; cues live segments; rolls clips from the FINAL pool; 7-day 4h×3 grid; fallback/standby on glitch. |

Plus reused, **not** modified: the **colony source** (`:3020` cam + `:4000/stream`, the Strings Elixir/Phoenix
+ Node stack — leave alone) and the **glass cockpit** (`https://…/glass/`, a browser-source). The
**operator control UI** is a new Phoenix LiveView route in the existing `ui/` app (`:4000`, `/control`).

```
 SOURCES                          MIXER (set-once)            ENCODE→FAN-OUT            AUDIENCE
 ───────                          ────────────────            ──────────────            ────────
 colony cam :3020 ───────────┐
 /glass cockpit ─────────────┤
 overlay pages :8099 ────────┤   uni-bcast-mixer (OBS) ──SRT──► uni-bcast-relay ──► YouTube (program)
 guest stage :8099 ◄─LiveKit─┤      scenes + audio mix          (MediaMTX copy)  ──► Twitch
 operator webcam/mic ────────┤      music duck + narration                       ──► others
 pre-recorded clips (FINAL)──┘      ONE program out
        ▲          ▲                      ▲
        │          │                      │ cues
   uni-playout  uni-bcast-captions   uni-producer ◄──MCP──► uni-production-mcp ◄── operator (voice/text)
   (run-of-show) (faster-whisper)    (beats+LLM)            (gated tools)          + UNI expert (Claude)
```

---

## The seven technology decisions (each justified; full ADRs in `production/docs/adr/`)

1. **Vision mixer / compositor → OBS Studio, headless, containerized (ADR-PROD-001).** The Director model is
   the proven foundation and it already drives OBS over obs-websocket; on **Linux** OBS browser-sources do
   not hit the Windows dual-GPU WebGL-black problem, and OBS gives scenes, transitions, per-source audio
   mixing, ducking (sidechain/`obs-advanced-audio`), and RTMP/SRT output for free. Rejected: a pure
   headless-Chromium+CDP compositor (the `BROADCAST_REARCHITECTURE.md` Phase-2 idea) as the *whole* mixer — it
   reinvents audio/transitions/mux; we instead use HTML pages as **graphics sources composited into OBS**.
   Rejected: LiveKit Egress room-composite as the mixer — it can't cleanly ingest the colony cam or local
   clips as first-class sources, and it discards the proven Director seam. (We still use LiveKit for guests.)
2. **WebRTC stack for guests → LiveKit (ADR-PROD-004).** Apache-2.0, self-hostable in one quadlet, a room
   model that maps directly to *green-room → on-air*, simulcast, a mature JS SDK, and server-side admin to
   admit/remove. Rejected: mediasoup (you build all signaling + layout), Janus (older ergonomics). The host
   admits a guest from the green-room room to the on-air room; a `stage` page subscribes to the on-air room
   and lays out talking-head/panel in 2D/CSS; OBS captures the stage page (so OBS stays the only mixer).
3. **MCP production surface → a new `production_mcp` FastMCP server (ADR-PROD-002).** Separate server, new
   port **8094** (deployed :8095 on this node), new systemd unit, new nginx `/prod-mcp` location (in both confs, stream-safe headers),
   **shared** `/etc/uni-approvals` store + the existing `uni-approvald` daemon. Mirrors `services/control_mcp`
   to the letter: `@mcp.tool(structured_output=True)`, read-only sync `@_threaded` / mutating `async def`
   gating via `approvals.require()` first, the `metadata()` provenance envelope, bearer auth, loopback/WG bind
   guard, append-only audit, and a charter-clean `help.py`. Tool surface table below.
4. **Graphics framework → transparent 2D-canvas/CSS overlay pages driven by a shared `broadcast.json`
   (ADR-PROD-005).** Copies the glass cockpit's proven techniques (ticker = doubled-string CSS scroll; clocks
   = `Intl.DateTimeFormat` + `tabular-nums`; card/tone; rotation/crossfade; alarm-debounce) but with a
   transparent background, split one-widget-per-URL. State flows producer → atomic-write
   `/var/lib/uni/broadcast/broadcast.json` → nginx `state.json` alias (`no-store`) → each page's
   `fetch(...,{cache:'no-store'})` loop. No WebGL ⇒ no black-in-capture. Free, no build step, no npm.
5. **TTS + captions → Piper (narration) + faster-whisper (live captions) (ADR-PROD-006).** Piper is already
   the stack (`tts-sidecar:8500`, voices configured per language — en/es/fr/it/pt/hi + the ClaudeSpeak
   EN+HI code-switch engine); `narrate(text,lang)` synthesizes a WAV that OBS plays on a dedicated narration
   bus with the music bed auto-ducked. faster-whisper (CTranslate2, open) transcribes the program/mic audio
   → caption text; translation (existing translator path or an LLM) yields multilingual subtitles; the caption
   overlay renders them and/or pushes a YT caption track. Real-time multilingual caption latency/quality is
   GAP **G-CAP** (pending measurement).
6. **Scheduler / playout → a `production/playout` host service over a content-catalog index (ADR-PROD-007).**
   Walks the **600 broadcast-ready vertical MP4s** in `content/media/streets-shorts/FINAL/` (+ investigation
   + music video), joins each short's existing `manifest.json` (`total_duration_s`), `meta.json` (title /
   language / `evidence_chip`), and `_status/*.json` (aired → YouTube id) into one **`catalog.json`** (none
   exists yet — the builder is `production/catalog/build-catalog.mjs`). The scheduler executes a per-slot
   run-of-show across the 7-day 4h×3 grid; on any source/encoder glitch it cuts to **STANDBY** and loops
   catalog content (last-frame hold → standby reel). Watchdog = systemd `Restart=always` + a health probe.
7. **Restreamer → MediaMTX (ADR-PROD-008).** One small Go binary/quadlet that ingests the mixer's single
   stream over **SRT** (more resilient than RTMP over the internet) and **copy**-fans-out (no re-encode) to
   YouTube + Twitch + others — so the encoder encodes once. Speaks RTMP/SRT/WHIP/HLS. Conservative
   alternative documented: classic `nginx-rtmp` `push` directives.

**Plus a non-infra decision — the on-air UNI expert (ADR-PROD-009):** a **Claude persona**, *not* uni-mind's
own inference (uni-mind is research-stage; its serving surfaces have no shipped weights / are a 4-pattern
closed class — ingest map E). The persona is seeded with uni-mind's `docs/press/02_FACT_SHEET.md` (ground
truth), `docs/prompts/UNI_CHAT.md` (voice/tone contract), and **`docs/press/05_CLAIMS_AND_FENCES.md` as a
hard compile-time lint on every on-air word** (no AGI / no "beats LLMs" / "cache hit" not "memory"; UNI math
stays private). `uni-deep-chat` may appear only as a clearly-labeled on-screen *microscope* (surprisal/cache
B-roll), never as the talking expert.

---

## The `broadcast.json` overlay contract (the fixed graphics state schema)

Producer writes it atomically (tmp + `os.replace`, exactly like `glass/collect.py`); nginx aliases it to
`/overlays/state.json` with `Cache-Control: no-store`; every overlay page polls it. Schema (full JSON Schema
in `production/schemas/broadcast.schema.json`):

```jsonc
{
  "updatedUtc": "2026-06-21T18:04:22.117Z",   // ISO-8601 UTC; every page shows staleness honestly
  "source": "uni-producer",                    // who wrote this snapshot
  "onAir":      { "value": true, "text": "LIVE" },
  "lowerThird": { "visible": true, "kicker": "UNI EXPERT", "title": "Dr. A. Rivera",
                  "subtitle": "Trauma & the nervous system", "tone": "ok" },
  "title":      { "visible": false, "kicker": "", "text": "", "subtitle": "" },
  "ticker":     [ { "text": "EducateWright • the science feed, back on air", "tone": "ok" } ],
  "caption":    { "visible": true, "lang": "en", "text": "...live transcript line...",
                  "translations": { "es": "...", "hi": "..." } },
  "clock":      { "zones": ["UTC", "America/Chicago", "Europe/London", "Asia/Kolkata"] },
  "music":      { "volume": 0.18, "ducked": true },        // 0..1; ducked under speech
  "nowPlaying": { "segment": "Interview", "lang": "en", "clipId": null },
  "brand":      { "logo": "uni-logo.png", "poweredBy": "solution-wright-logo-light.png" },
  "evidence":   { "class": "C" }               // appliance taxonomy; never styled as Class-A
}
```

Overlay pages (each transparent, one widget, served at `:8099/overlays/<page>.html`): `ticker.html`,
`lower-third.html`, `title.html` (doubles as the bumper card), `caption.html`, `onair.html`, `clock.html`, `standby.html`,
and `stage.html` (the LiveKit guest layout). The producer writes `broadcast.json`; the MCP `set_overlay` /
`narrate` / `duck` tools mutate it.

---

## The production MCP tool surface (the fixed verb set)

All tools return the `metadata()` envelope (own `server="uni-production-mcp"`, own `VERSION`,
`evidence_class`, `audit_id`). Read-only tools are never gated. Mutating tools are listed in `MUTATING_TOOLS`
and gate through `approvals.require()` first.

| Tool | Kind | Gating | Effect |
|------|------|--------|--------|
| `get_show_state` | read | — | Current scene, on-air bool, music level, guests, now-playing, run-of-show position. |
| `list_sources` / `list_scenes` | read | — | OBS scenes/sources. |
| `list_clips` / `list_segments` | read | — | Catalog clips + run-of-show segments. |
| `list_guests` | read | — | Green-room + on-air guests. |
| `caption_status` | read | — | Captioner health + current line. |
| `approvals_pending` / `approvals_status` | read | — | Observe the gate (cannot decide). |
| `cut_to(scene, transition?, ms?)` | mutate | **session-auth** | Program cut/transition. |
| `set_music_volume(level)` | mutate | session-auth | Ride the music bed (0..1). |
| `duck(on, target_db?)` | mutate | session-auth | Duck music under speech. |
| `narrate(text, lang, voice?)` | mutate | session-auth | Piper TTS → narration bus (auto-duck). |
| `set_overlay(layer, payload)` | mutate | session-auth | Lower-third / ticker / title / caption / on-air. |
| `roll_clip(clipId, mode?)` | mutate | session-auth | Play a catalog clip into the CLIP scene. |
| `start_segment(template, params)` | mutate | session-auth | Launch a run-of-show template beat. |
| `set_layout(template)` | mutate | session-auth | Talking-head / panel / PIP layout. |
| `admit_guest(guestId, layout?)` | mutate | **human-gated** | Move a guest green-room → on-air (outward-facing). |
| `remove_guest(guestId)` | mutate | session-auth | Drop a guest to green room / off. |
| `schedule(slot, runOfShow)` | mutate | human-gated | Set/replace a slot's run-of-show. |
| `start_broadcast(target)` | mutate | **human-gated + 2-step confirm** | Go live to YouTube/Twitch. |
| `stop_broadcast()` | mutate | **human-gated + 2-step confirm** | End the public stream. |
| `open_session(verbs?, ttl_min?)` | mutate | **human-gated** | Open a live session: pre-authorize the in-show verbs (operator approves once). |
| `close_session()` | mutate | ungated (de-escalation) | Close the live session; in-show verbs re-gate. |
| `command(text, execute?)` | mutate | session-auth | Voice/text pedalboard: resolve free text to an in-show verb and dispatch it (unmatched → LLM fallback). |

**Gating model (ADR-PROD-010) — the honest reconciliation of "destructive ops human-approval-gated" with
live operation.** A human can't approve/deny every cut during a live show. So: the operator opens a
**live session** (one human act = an operator-set `UNI_APPROVALS_AUTOAPPROVE` allowlist scoped to the in-show
verbs — this is the appliance's *operator pre-authorization*, **not** agent self-approval). Within the
session, the in-show verbs (`cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`,
`start_segment`, `set_layout`, `remove_guest`) run without per-call prompts but are **fully audited**. The
**outward-facing / irreversible** verbs (`start_broadcast`, `stop_broadcast`, `admit_guest`, `schedule`)
**always** require an explicit human decision (and `start/stop_broadcast` add the 2-step dry-run→confirm
handshake). The producer agent never holds the operator token; it can only propose. This is GAP **G-PA**
(self-approval-blocked-on-the-automated-path is Class-Sec, *unproven* until a captured red-team run).

---

## Sources, guests, multilingual, scheduler — the operating model

- **Sources / channels:** operator webcam(s)+mic (v4l2/WHIP into OBS), remote guests (LiveKit → stage page),
  the colony cam (`:3020`) + `/glass` + overlay pages (browser-sources), pre-recorded clips from the FINAL
  pool (media source), the music bed (media source, **must be sourced — none exists today**, GAP **G-MUSIC**;
  use CC/royalty-free).
- **Guest ingest (the green room):** a UNI.OS-hosted page (`production/guest/`, LiveKit JS) → token/link
  auth → green room (cam+mic check, the host sees them but they are off-air) → host `admit_guest` →
  on-air room → the stage page lays them out (talking-head for one, panel for N). Multiple guests supported.
- **Multilingual:** narration in N languages (Piper per language); live captions + translated subtitles
  (faster-whisper + translate); audience language selection on the caption overlay; segments tagged by
  language so the **time-zone schedule** picks language per slot (the FINAL pool already has 6-language
  variants of the daily UNI shorts).
- **Scheduler / playout (7-day, 4h × 3/day):** the weekly grid places three 4-hour slots/day across time
  zones, each with a per-slot run-of-show + language; `uni-playout` cues live segments and rolls catalog
  clips; **standby/fallback** — on a source or encoder glitch, cut to STANDBY and loop catalog content
  (last-frame hold → standby reel) until recovery; watchdog auto-restarts.
- **Content pipeline (already exists):** Piper TTS → ffmpeg `drawtext` caption-bake over ComfyUI SDXL
  backgrounds → ffmpeg concat+mux → `FINAL/*.mp4`; `post-uni-day.mjs` publishes to YouTube. The platform's
  catalog **ingests** that output; the producer can also commission new segments through the same drivers.

---

## Run-of-show templates & roles
- **Templates** (`production/run-of-show/`): News-desk · Interview (host+guest) · Panel (host+N guests) ·
  Explainer (host+graphics+colony) · Colony-Live (MC feed + UNI narration) · Film/segment playout · Q&A/Chat ·
  Green-room/standby. Each is a JSON/YAML of ordered beats (scene, duration, overlays, narration cues, audio,
  language) that the producer/playout executes. A 4-hour slot template chains beats; the weekly grid chains
  slots.
- **Roles (collapsed into the MCP team + the operator):** Host (operator) · UNI Expert (Claude on cam/voice)
  · Producer (the `uni-producer` agent) · Director (cuts) · Graphics · Audio · Guest-wrangler — all driven by
  the operator's voice/text through the production MCP.

## Operator control (the pedalboard)
A Phoenix LiveView route `/control` in the existing `ui/` app (`:4000`; CSP already loosened for iframing —
ingest map D): scene/cut buttons, transition control, a **music fader + duck toggle**, a **narrate box +
language picker**, overlay editors (lower-third/ticker/title/caption), a **clip browser** over the catalog,
guest green-room admit/remove, run-of-show segment launchers, ON-AIR + go-live/stop (gated), and a program
preview. **Voice control:** mic → STT (whisper) → intent (rules or an LLM) → production-MCP call ("cut to
colony", "duck the music", "lower third for Dr. Rivera", "roll BnB phase 1", "admit the guest"). **Text
control:** a command/chat box → an LLM → MCP calls. Both route through the MCP so every action is audited and
session-gated.

---

## Phased roadmap

| Phase | Deliverable | Exit check |
|-------|-------------|-----------|
| **P0** *(done)* | Director + clean stage + `/glass` + WGC foundation on the dev box. | One RTMP to YouTube, observed. |
| **P1** | Containerize on a broadcast node: `uni-bcast-mixer` (OBS) + `uni-bcast-relay` (MediaMTX) + `uni-production-mcp`; move the 3-channel show into containers; add `set_music_volume` + Piper `narrate` + auto-`duck`. | Same show, now from quadlets; one program to YouTube; music + narration controllable via MCP. |
| **P2** | Graphics package (transparent 2D-canvas overlays + `broadcast.json` spool) + multilingual captions (`uni-bcast-captions`) + the operator voice/text control (`/control` + STT). | Lower-thirds/ticker/clock/captions on air; operator cuts the show by voice/text. |
| **P3** | Guest ingest (`uni-bcast-livekit` green-room + `admit_guest`) + multi-cam + talking-head/panel via the stage page. | A remote guest joins, lands in green room, is admitted to a panel. |
| **P4** | Scheduler/playout (7-day 4h×3) + `catalog.json` builder + restream to Twitch/others + standby/fallback resilience. | 24/7 grid runs; a killed source cuts to STANDBY and recovers. |
| **P5** | Full UNI Producer autonomy (LLM show-runner) + the UNI-expert Claude persona on cam/voice + polish to CNN/BBC/PBS par + GAPS closure. | A slot runs largely producer-driven; G-PA/G-ENC/G-CAP closed by captured evidence. |

---

## Constraints
Free/open tooling. Containerized on UNI.OS (rootful Podman, quadlets, uni-lab MCP with **human-approval-gated
mutations** — the agent cannot self-approve). Honesty: timestamp + source + evidence-class every status claim.
**Do not stress the dev box** and **do not co-locate the encoder with the ERP appliance** (G-ENC). The
operator (one person) + guests + the UNI expert must run a CNN/BBC/PBS-par show by voice/text.

## The `production/` tree (what each part holds)
```
production/
  README.md                     index + quick-start
  containers/systemd/*.container the 4–5 quadlets (mixer, relay, overlays, livekit, captions)
  systemd/*.service             host units (production-mcp, producer, playout)
  mcp/                          PRODUCTION_MCP_SPEC.md + reference server.py (FastMCP, gated tools, adapters)
  overlays/                     the transparent 2D-canvas pages + the sample broadcast.json producer
  schemas/                      broadcast.schema.json (the overlay contract)
  run-of-show/                  the 8 templates + the 4h-slot + weekly grid + the guide
  guest/                        the green-room join app + the stage (panel) page (LiveKit)
  control/                      the /control LiveView design + reference page + voice→intent→MCP
  catalog/                      catalog spec + build-catalog.mjs + standby/playout policy
  docs/                         adr/ (10 ADRs) + ROADMAP.md + DEPLOY.md + GAPS_REGISTER.md
```

---
## Status (honest)

Charter: `UNI.OS/docs/life-no-game/EPISTEMIC_CHARTER.md` Art. VIII (binding) + live `uni://charter`.

- No banned-unqualified word used as a claim: *verified · proven · guaranteed · isolated · secure · 100% ·
  certified · real*. (Used: checked / observed / as captured / reported / appears / pending confirmation.)
- This document is a **design**; no part of the proposed stack is deployed. Every "will / runs / does" about
  the platform is a **proposal** (status `pending`), not current fact.
- Foundation (P0) + ingest claims are **Class-C/B**, as captured **2026-06-21** from the named files this
  session (`viewer/*.cjs`, `services/control_mcp/*`, `services/glass/*`, `lab-os/*`, the content `FINAL/`
  pool, `uni-mind/docs/*`). `systemctl active`-style claims are not made for anything unbuilt.
- Composite/health tones gate on the weakest constituent ("no green over yellow"); aggregates show parts.
- Evidence class per claim (appliance taxonomy): A=independently reproduced, B=observed-with-artifact,
  C=command-output, Sec=security-relevant-**unproven**, pending=not-yet-established. The gating/self-approval
  and encoder-isolation claims are **Sec/pending** until captured runs close them.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
  read-only observation, **never** a mutation target; the encoder is **not** co-located with it. Every
  mutating action routes through the human approval gate; the producer only proposes and cannot self-approve.
- Open gaps tracked in `production/docs/GAPS_REGISTER.md`:
  - **G-ENC** (`pending_hardware`) — no hardware encode on the appliance; encoder node/GPU is an operator
    choice; x264-software-on-the-ERP-box is forbidden (would stress the business stack).
  - **G-PA** (`pending_external`) — "the producer agent cannot self-approve a destructive go-live/cut";
    self-approval-blocked-on-the-automated-path is Class-Sec, unproven until a logged red-team run.
  - **G-CAP** (`pending_hardware`) — real-time multilingual caption latency/quality unmeasured.
  - **G-MUSIC** (`pending`) — no music bed asset exists; must source CC/royalty-free.
  - **G-9x16** (`heuristic`) — most catalog content is vertical 9:16; a 16:9 broadcast must pillarbox /
    shorts-wall it.
  - **G-YTLIB** (`pending`) — whether a dedicated YouTube-library repo exists beyond the on-host FINAL pool +
    the known playlists; the catalog builder is pointed at FINAL/ + the playlists until the operator confirms.
