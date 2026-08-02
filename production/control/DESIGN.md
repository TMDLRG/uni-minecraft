# The Operator Control Surface (the pedalboard) - DESIGN

**What this is:** the design for the one-operator broadcast control surface for the UNI Production
Platform. It is the "pedalboard" the master design calls for: one person mixes a broadcast-grade live
show by voice or text, cutting cameras, riding the music, rolling clips, bringing guests up, triggering
graphics, and starting narration in any language - while the UNI Producer runs the gallery underneath.

**Where it lives:** a new Phoenix LiveView route `/control` in the existing `ui/` app (Phoenix 1.8 +
LiveView 1.0 on `:4000`; CSP already loosened for iframing - ingest map D). A standalone reference page
(`control.html`) is usable before the LiveView route exists. The concrete route wiring is in
`liveview-route.md`; the voice grammar is in `voice-intents.md`.

**The one rule that shapes everything:** every operator action is a call to the production MCP
(`uni-production-mcp`, loopback `127.0.0.1:8095`, reached from the browser via nginx `/prod-mcp`). The UI
holds NO production logic of its own - it is a thin caller. That is what makes every action audited
(append-only ledger in the MCP) and session-gated (the approvals model below). Mirrors the fixed tool
surface in `docs/UNI_PRODUCTION_PLATFORM.md` exactly; this document does not invent verbs.

**Evidence posture:** this is a DESIGN/REFERENCE. Nothing here is deployed or running. Every "the panel
does X" is a proposal, status `pending`. See the Status (honest) footer.

---

## 1. Panel layout (the pedalboard, top to bottom)

A single full-height dark control surface, sized for a 1080p operator monitor, laid out so the most-used
controls (cut buttons, music fader, narrate box) are reachable without scrolling. Touch-friendly hit
targets (>= 44px) so it also drives from a tablet next to the camera.

```
+--------------------------------------------------------------------------------------+
|  HEADER:  UNI Producer - Operator Control      [session: CLOSED]  [ON-AIR: --]  clock |
+----------------------------------------+---------------------------------------------+
|  PROGRAM PREVIEW                        |  RUN-OF-SHOW                                 |
|  (iframe of the program / overlays      |  [News-desk] [Interview] [Panel] [Explainer]|
|   composite; honest STALE marker if     |  [Colony-Live] [Film] [Q&A] [Green-room]    |
|   broadcast.json is old)                |  -> start_segment(template, params)         |
|                                         |                                             |
|  current scene chip - now-playing chip  |  GUEST GREEN ROOM                            |
+----------------------------------------+  green-room: [Dr Rivera (admit)]  [remove]   |
|  SCENE / CUT  (program bus)             |  on-air:     [Host] [Dr Rivera (remove)]    |
|  [COLONY][GLASS][GUESTS][CLIP]          |  -> admit_guest (HUMAN-GATED) / remove_guest |
|  [NEWSDESK][TITLE][STANDBY][PIP]        +---------------------------------------------+
|  transition: (cut)(fade)  ms:[__400__]  |  OVERLAY EDITORS                            |
|  -> cut_to(scene, transition, ms)       |  Lower-third: kicker[__] title[__] sub[__]  |
+----------------------------------------+    tone[ok v]   [show][hide]                |
|  AUDIO                                   |  Ticker: [+ add item] item[__] tone[ok v]   |
|  music ||||||||----  0.18   [duck: ON]   |  Title:  kicker[__] text[__] sub[__][show]  |
|  -> set_music_volume(level) / duck(on)   |  Caption: lang[en v] text[__][show][hide]   |
+----------------------------------------+    -> set_overlay(layer, payload)           |
|  NARRATE                                 +---------------------------------------------+
|  lang[en v] voice[auto v]                |  CLIP BROWSER (over catalog.json)           |
|  [ multi-line text to speak............ ]|  filter: lang[all v]  q[______]             |
|  [ Narrate ]  -> narrate(text,lang,voice)|  ROR-001  "What the loop..."  en  0:42  [roll]|
+----------------------------------------+  BNB-P1   "Bayesian Not..."   en  1:10  [roll]|
|  BROADCAST (human-gated)                 |  ...        -> roll_clip(clipId, mode)      |
|  [ GO LIVE -> YouTube ]  [ STOP ]        |                                             |
|  state: idle / dry-run / confirm-pending |                                             |
|  -> start_broadcast / stop_broadcast     |                                             |
+----------------------------------------+---------------------------------------------+
|  FOOTER:  voice: [mic off]  "..last heard.."   |  command box: [ type a command... ][>] |
+--------------------------------------------------------------------------------------+
```

Regions:

- **Header** - identity, the live-session state pill (CLOSED / OPEN), the ON-AIR pill (mirrors
  `broadcast.json.onAir`), and a multi-zone clock. The ON-AIR pill is read-only here; it reflects state,
  it does not start the stream.
- **Program preview** - an iframe of the program/overlays composite (e.g. the overlays static root or a
  low-latency WHEP preview when one exists). It renders an honest `STALE` marker when `broadcast.json`'s
  `updatedUtc` is old, exactly like the overlay pages - never a faked-live frame. Below it, two chips show
  the current scene and `nowPlaying.segment`.
- **Scene / Cut** - the program bus: one button per scene. Transition picker (cut/fade) + ms field.
- **Audio** - the music fader + a duck toggle.
- **Narrate** - a textbox + language picker + optional voice picker + a Narrate button.
- **Broadcast** - the human-gated go-live / stop pair with a visible 2-step confirm state.
- **Run-of-show** - segment launcher buttons.
- **Guest green room** - two lists (green-room, on-air) with admit/remove.
- **Overlay editors** - lower-third / ticker / title / caption editors.
- **Clip browser** - a filterable list over `catalog.json`.
- **Footer** - the voice mic toggle + last-heard line, and the free-text command box (LLM path).

---

## 2. Control -> production-MCP tool map (the binding contract)

Every control maps to exactly one tool from the fixed surface in `docs/UNI_PRODUCTION_PLATFORM.md`.
No control invents a verb. Gating column repeats the master design's gating model (section 4 below).

| Control (UI) | Emits event | Production-MCP tool | Args | Gating |
|---|---|---|---|---|
| Scene button COLONY/GLASS/GUESTS/CLIP/NEWSDESK/TITLE/STANDBY/PIP | `cut` | `cut_to` | `scene`, `transition`, `ms` | session-auth (in-show) |
| Transition picker + ms | (folds into `cut`) | `cut_to` | `transition` in {cut,fade}, `ms` | session-auth |
| Music fader | `set_music_volume` | `set_music_volume` | `level` 0..1 | session-auth |
| Duck toggle | `duck` | `duck` | `on` bool, `target_db?` | session-auth |
| Narrate button | `narrate` | `narrate` | `text`, `lang`, `voice?` | session-auth |
| Lower-third show/hide/edit | `set_overlay` | `set_overlay` | `layer:"lowerThird"`, `payload` | session-auth |
| Ticker add/edit | `set_overlay` | `set_overlay` | `layer:"ticker"`, `payload` (array) | session-auth |
| Title show/hide/edit | `set_overlay` | `set_overlay` | `layer:"title"`, `payload` | session-auth |
| Caption show/hide/lang | `set_overlay` | `set_overlay` | `layer:"caption"`, `payload` | session-auth |
| ON-AIR overlay toggle | `set_overlay` | `set_overlay` | `layer:"onAir"`, `payload` | session-auth |
| Clip "roll" button | `roll_clip` | `roll_clip` | `clipId`, `mode?` | session-auth |
| Run-of-show segment button | `start_segment` | `start_segment` | `template`, `params` | session-auth |
| Layout (talking-head/panel/PIP) | `set_layout` | `set_layout` | `template` | session-auth |
| Guest "remove" | `remove_guest` | `remove_guest` | `guestId` | session-auth |
| Guest "admit" | `admit_guest` | `admit_guest` | `guestId`, `layout?` | **HUMAN-GATED** |
| Run-of-show "save slot" | `schedule` | `schedule` | `slot`, `runOfShow` | **HUMAN-GATED** |
| GO LIVE | `start_broadcast` | `start_broadcast` | `target` | **HUMAN-GATED + 2-step confirm** |
| STOP | `stop_broadcast` | `stop_broadcast` | - | **HUMAN-GATED + 2-step confirm** |
| (open live session) | `open_session` | sets `UNI_APPROVALS_AUTOAPPROVE` allowlist (operator pre-auth) | scoped verb list | one human act |
| Program preview / chips | (read poll) | `get_show_state` | - | read (never gated) |
| Clip browser populate | (read) | `list_clips` | - | read |
| Run-of-show populate | (read) | `list_segments` | - | read |
| Guest lists populate | (read) | `list_guests` | - | read |
| Caption status strip | (read) | `caption_status` | - | read |
| Approval-pending banner | (read) | `approvals_pending` / `approvals_status` | - | read (observe only) |

**Read tools** drive the live state of the panel. The panel polls `get_show_state` (and `list_*`,
`caption_status`, `approvals_pending`) on a short interval (LiveView `handle_info(:refresh)`, mirroring
`stream_live.ex`'s 1s tick) and re-renders chips/lists. The MCP is the single source of truth; the UI
never keeps a private copy of show state.

**Mutating tools** are fired on `phx-click` / `phx-submit` events. Each handler does one thing: build the
arg map, POST to `/prod-mcp`, then let the next read poll reflect the result (optimistic chips are allowed
but always reconciled against the next `get_show_state`).

---

## 3. The MCP call shape (how the UI talks to `/prod-mcp`)

The browser never talks to `:8095` directly (loopback-bound). Two transport options, both ending at the
same MCP, both audited:

- **A (preferred): the LiveView is the caller.** The `phx-click` reaches the Elixir process; the
  `ControlLive` server makes the HTTP call to `http://127.0.0.1:8095` (the MCP's loopback bind) with the
  operator bearer held server-side (never shipped to the browser). This keeps the token off the client and
  is the pattern `liveview-route.md` implements with `:req` / `:httpc`.
- **B (the standalone page, and a fallback): the browser calls nginx `/prod-mcp`.** `control.html` POSTs
  to `/prod-mcp` with an `Authorization: Bearer <token>` header (TODO: injected by the operator, never
  hard-coded). nginx proxies to `127.0.0.1:8095` with the stream-safe headers from ADR-PROD-002.

Request body (JSON-RPC / MCP `tools/call` shape - the exact envelope is fixed by the MCP server in
`production/mcp/`; this is the reference shape the control surface targets):

```jsonc
POST /prod-mcp
Authorization: Bearer <operator-token>          // TODO wire; never in client source
Content-Type: application/json
{
  "method": "tools/call",
  "params": { "name": "cut_to", "arguments": { "scene": "COLONY", "transition": "fade", "ms": 400 } }
}
```

Response is the MCP `metadata()` envelope (`server:"uni-production-mcp"`, `VERSION`, `evidence_class`,
`audit_id`, plus the tool result or an approval-pending marker). The UI surfaces `audit_id` in a small
"last action" line so the operator can see the action was logged.

Gated tools that are not auto-approved come back as **approval-pending** (not success): the UI parks the
control in a pending state and starts polling `approvals_status(request_id=...)` until a human
approves/denies via the `uni-approve` CLI or the approval daemon. This is the same daemon the uni-lab MCP
uses; the producer agent cannot approve its own request.

---

## 4. Session-gating UX (the honest reconciliation)

This implements ADR-PROD-010 from the master design. The charter requires destructive ops to be
human-approval-gated, but a human cannot approve every cut during a live show. The resolution:

### Opening a live session = one human act

The operator clicks **Open live session**. This is the *operator pre-authorization*: it sets
`UNI_APPROVALS_AUTOAPPROVE` to an allowlist scoped to the in-show verbs only
(`cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`, `start_segment`,
`set_layout`, `remove_guest`). It is NOT agent self-approval - a human set it, scoped, for this session.
The header pill flips `CLOSED -> OPEN` and shows the allowlisted verbs on hover. Closing the session
(or a session TTL) clears the allowlist; in-show verbs then fall back to per-call approval.

UX states of the session pill:

- **CLOSED** (default) - every mutating verb prompts for human approval; in-show verbs feel sluggish.
  The pill is muted grey. A tooltip explains: "open a session to ride the show without per-cut prompts."
- **OPEN** - in-show verbs run without per-call prompts but are fully audited (each returns an
  `audit_id`). The pill is amber and shows a countdown to TTL. A small "X audited actions this session"
  counter increments.
- The outward-facing verbs are **never** in the allowlist, so they always show the gated UX below even
  while a session is OPEN.

### The always-gated verbs (outward-facing / irreversible)

`start_broadcast`, `stop_broadcast`, `admit_guest`, `schedule` always require an explicit human decision.
Their controls render distinctly (a red/gold border, a lock glyph) and use this flow:

1. Operator clicks (e.g.) **GO LIVE**. The control enters **confirm-pending**: it is disabled, shows a
   spinner, and a banner appears: "Approval pending - approve in the uni-approve queue (request <id>)."
   For `start_broadcast`/`stop_broadcast` the first click is the **dry-run** half of the 2-step handshake;
   the UI shows the dry-run result (target, bitrate, scene) and a second **Confirm go-live** button.
2. The UI polls `approvals_status(request_id=...)`. On **approved**, the control flips to its live state
   (GO LIVE -> a pulsing ON-AIR + a STOP button enabled). On **denied/timeout**, it returns to idle with
   a muted "denied" note - no retry loop (the master design's no-retry-on-deny rule).
3. `admit_guest` shows the same pending state: the guest stays in the green-room list with an
   "admit pending" badge until a human approves; only then does the guest move to the on-air list.

The panel always shows an **approval inbox strip** (fed by `approvals_pending`) so the operator can see
any request currently waiting - including ones they just fired - and knows to clear the queue. The UI can
only **observe** the gate (`approvals_pending` / `approvals_status` are read tools); it can never decide.

### Visual language for gating

| State | Border | Glyph | Behaviour |
|---|---|---|---|
| in-show verb, session OPEN | none | - | fires immediately, logs audit_id |
| in-show verb, session CLOSED | none | hourglass | fires but parks pending until approved |
| outward verb, any session | gold/red | lock | always parks pending; 2-step for broadcast |
| approval pending | dashed amber | spinner | disabled; polling status |
| denied | dashed grey | x | returns to idle, muted note, no auto-retry |

---

## 5. Per-region detail

### Program preview
- Iframe `src` is the overlays composite or a WHEP preview (TODO: confirm the preview endpoint with the
  mixer agent; until then the overlays static root is the honest stand-in).
- Staleness: read `broadcast.json.updatedUtc` (via `get_show_state` or a direct `state.json` poll); if
  older than ~5s, overlay a muted `STALE` ribbon. Never hide staleness.
- Scene chip = `get_show_state().scene`; now-playing chip = `nowPlaying.segment` (+ `clipId` if a clip).

### Scene / Cut
- Eight buttons, fixed scene names: `COLONY GLASS GUESTS CLIP NEWSDESK TITLE STANDBY PIP`. The currently
  live scene is highlighted (from `get_show_state`).
- Transition picker {cut, fade}; default fade 400ms (mirrors the proven foundation's fade transition). A
  cut sends `ms:0`.
- Emits `cut_to(scene, transition, ms)`.

### Audio (music + duck)
- The fader is a range input 0..1 (step 0.01). Releasing it (or debounced input) emits
  `set_music_volume(level)`. The numeric value is shown. Reflects `broadcast.json.music.volume`.
- Duck toggle emits `duck(on)`; reflects `broadcast.json.music.ducked`. When narration auto-ducks, the
  toggle shows the ducked state (read-back) so the operator sees the producer's auto-duck without surprise.

### Narrate
- A multi-line textbox, a language picker (en/es/fr/it/pt/hi - the Piper-configured set), and an optional
  voice picker (auto = the language's default voice; the ClaudeSpeak EN+HI code-switch engine handles
  Hinglish). Write Hindi in Devanagari and English in Latin - the engine switches by script.
- Narrate emits `narrate(text, lang, voice?)`. The music auto-ducks for the duration (the MCP/producer
  side handles the duck-restore); the duck toggle reflects it.

### Overlay editors (-> set_overlay, payloads match broadcast.schema.json exactly)
- **Lower-third**: `kicker`, `title`, `subtitle`, `tone` (ok/warn/crit/unknown), show/hide. Payload:
  `{ "visible": true, "kicker": "...", "title": "...", "subtitle": "...", "tone": "ok" }`.
- **Ticker**: an add/remove list of `{text, tone}` items; payload is the whole array (matches the schema's
  `ticker` array). Empty array hides the ticker.
- **Title**: `kicker`, `text`, `subtitle`, `tone`, show/hide. Payload mirrors the schema `title` object.
- **Caption**: `lang`, `text`, show/hide. (In normal operation captions stream from
  `uni-bcast-captions`; this editor is the manual override / correction path.) Payload mirrors the schema
  `caption` object.
- Each editor's "show"/"hide" only flips `visible`; the text fields fill the rest of the payload.

### Clip browser (over catalog.json)
- Reads the catalog via `list_clips` (the MCP reads `catalog.json` built by
  `production/catalog/build-catalog.mjs`). Each row: `clipId`, title, language, duration, an evidence chip,
  and aired-state. Filter by language + a text query.
- "roll" emits `roll_clip(clipId, mode)` where `mode` in {`cut`, `queue`} (cut now vs queue into the CLIP
  scene). Vertical 9:16 clips are flagged (G-9x16) so the operator knows they pillarbox.

### Guest green room
- Two lists from `list_guests`: green-room (off-air, host can see) and on-air. Green-room rows have an
  **Admit** button (human-gated) and a **Remove** button; on-air rows have **Remove** (session-auth).
- Admit shows the pending badge until a human approves (section 4).

### Run-of-show segment launchers
- One button per template from `list_segments` / the `run-of-show/` templates: News-desk, Interview,
  Panel, Explainer, Colony-Live, Film/segment, Q&A/Chat, Green-room/standby.
- Emits `start_segment(template, params)`; a small params popover collects template params (e.g. guest
  id, clip id, language) before firing.

### Broadcast (ON-AIR + go-live/stop)
- The ON-AIR header pill is a read-back of `onAir.value`. Going live is the **GO LIVE** control with the
  2-step gated flow (section 4). STOP is enabled only while on air, also 2-step gated.

### Footer (voice + command box)
- **Voice**: a mic toggle. When on, the browser captures mic audio -> STT (whisper) -> intent -> the same
  MCP calls (full grammar + LLM fallback in `voice-intents.md`). The last-heard transcript line is shown
  so the operator sees what was recognized before it fires (and risky intents can require a tap-confirm).
- **Command box**: free text -> an LLM -> MCP calls (the text-control path). Same audit + gating.

---

## 6. Why route everything through the MCP (the design invariant)

- **Audit**: the MCP appends every call to its audit ledger and returns an `audit_id`. The UI cannot
  bypass this - it has no other way to affect the show.
- **Gating**: the MCP is where `approvals.require()` runs; the UI only proposes. A compromised or buggy UI
  still cannot go live without a human (the outward verbs are never auto-approved).
- **One source of truth**: show state lives in the MCP/`broadcast.json`, not the browser. The UI is a
  view + a remote. This is the same discipline as `stream_live.ex`, which only reads the Director's
  broadcast and never owns state.
- **Charter**: the business stack (solutionwright-*, odoo, jitsi, cloudflared, portainer) is never a
  mutation target of this surface; none of these controls touch it. The producer agent never holds the
  operator token and cannot self-approve.

---

## Status (honest)

- This is a **DESIGN/REFERENCE**, not a deployed or running system. Every "the panel does / shows / fires"
  is a **proposal**, status `pending`. No part of `/control` exists yet at the time of writing.
- No banned-unqualified word is used as a claim (no: verified, proven, guaranteed, isolated, secure, 100%,
  certified, real). The audit and gating behaviours described are the **intended** contract, **pending
  confirmation** against a built MCP and a captured run.
- Evidence posture: the existing `ui/` patterns reused here (`stream_live.ex` 1s `handle_info` poll,
  `phx-click`/`phx-submit`, the loosened CSP) were read this session from the named files (Class-C). The
  tool surface, gating model, scene names, and `broadcast.json` field shapes are taken **as captured** from
  `docs/UNI_PRODUCTION_PLATFORM.md` and `production/schemas/broadcast.schema.json`; this document does not
  add or rename any verb or field.
- Gating is the safety spine and is **Sec/pending**: that the producer agent cannot self-approve a
  destructive go-live/cut on the automated path (GAP **G-PA**) is unproven until a logged red-team run.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
  **never** a mutation target of this control surface; the encoder is not co-located with the ERP. Every
  mutating action routes through the human approval gate; the producer only proposes and cannot
  self-approve.
