# Remote-guest join app (green room -> on air) — DESIGN

**Component:** `production/guest/` — the remote-guest ingest path for the UNI Production Platform.
**Authored against:** `docs/UNI_PRODUCTION_PLATFORM.md` (the fixed master design). Container/port map,
scene names, the production-MCP tool surface, the `broadcast.json` schema, and the gating model are taken
verbatim from that doc and are NOT relitigated here.
**Authored:** 2026-06-21. **Status:** design / reference. Nothing here is deployed (see Status footer).

This file fixes: the two-room model (green-room vs on-air), the auth/token flow (who mints, link/QR,
single-use), the admit/remove handshake (admit_guest is human-gated per the master doc), talking-head vs
panel layout rules, cam/mic device selection + level check in the green room, the host's view, and how the
stage page is captured by OBS as the GUESTS scene.

---

## 1. Where this sits in the stack

```
 guest browser (anywhere)                UNI.OS broadcast node                       OBS (uni-bcast-mixer)
 ────────────────────────                ─────────────────────                       ─────────────────────
 join.html  ──LiveKit JS──►  uni-bcast-livekit (SFU)  ws/http :7880  rtc :7881/udp 50000-50200
   (green-room preview)            │   green-room room  | on-air room
                                   │                    └──────────────────►  stage.html (subscribes on-air)
 host /control (LiveView) ──MCP──► uni-production-mcp :8095                       served by uni-bcast-overlays
   admit_guest (human-gated) ─────► livekit adapter moves guest room->room          :8099/overlays/stage.html
                                                                                          ▲ browser-source
                                                                                          │ captured as the
                                                                                     GUESTS scene in OBS
```

Two pages live in this component:

- **`join.html`** — the guest-facing page. Opened on the guest's own device anywhere on the internet (reached
  through the appliance's existing ingress; the LiveKit ws/rtc ports are the only ones the guest's browser
  touches). It connects to LiveKit with a minted token, shows a green-room self-preview, and waits to be
  admitted. Transparent background NOT required.
- **`stage.html`** — the on-air layout page. Runs as a browser-source inside OBS (served by
  `uni-bcast-overlays` at `:8099/overlays/stage.html`, the same static server as every other overlay). It
  subscribes to the **on-air** room only, lays the admitted guests out talking-head/panel in CSS grid (no
  WebGL), and draws name lower-thirds. Transparent background REQUIRED so OBS composites it over the scene.

OBS stays the only mixer. The stage page is just another browser-source captured as the **GUESTS** scene
(consistent with the COLONY/GLASS_OS/PIP scene-naming the proven Director foundation already uses in
`viewer/obs_stage.cjs`). The host cuts to GUESTS via the production-MCP `cut_to("GUESTS")` like any other scene.

---

## 2. The room model (green-room vs on-air)

LiveKit (ADR-PROD-004) gives us rooms; we use exactly **two per show**, fixed names:

| Room | Name (convention) | Who publishes | Who subscribes | On air? |
|------|-------------------|---------------|----------------|---------|
| Green room | `greenroom` (or `greenroom-<show-slot>`) | the joining guest (cam+mic) | the host monitor + the producer | NO — never captured by OBS |
| On air | `onair` (or `onair-<show-slot>`) | admitted guests (+ optionally host webcam) | `stage.html` (OBS browser-source) | YES — captured as the GUESTS scene |

Properties of the model:

- A guest **always lands in `greenroom` first**. `join.html` is only ever issued a green-room token (see
  token-server.md). It physically cannot publish into `onair` because its token's `room` claim names the green
  room. This is the structural enforcement of "off-air until admitted".
- The **host can see and hear** green-room guests (the host monitor / `/control` subscribes to `greenroom`),
  but **OBS does not capture the green room** — only `stage.html`, and `stage.html` subscribes to `onair`
  exclusively. So a green-room guest is never on the program feed, by construction, not by a toggle.
- **Admit** = the production-MCP `admit_guest` tool (human-gated) tells the livekit adapter to mint an
  on-air token for that identity and signal `join.html` to re-connect into `onair` (or, in the server-driven
  variant, to use LiveKit room-management to move the participant). `stage.html` sees the new publisher appear
  and adds a tile.
- **Remove** = `remove_guest` (session-auth) drops the guest's on-air publication; the adapter sends them a
  signal to fall back to `greenroom` (or disconnect). `stage.html` sees the publisher leave and removes the
  tile with a short fade.

Why two rooms instead of a mute/visibility flag on one room: a flag can be flipped by a bug or a race and put
an unvetted guest on air. Separate rooms with separate tokens make "on air" a property of *which room you hold
a token for* — far harder to get wrong, and it keeps the OBS capture dead simple (subscribe to one room,
render everyone you see).

---

## 3. Auth / token flow

Full mechanics and claims are in `token-server.md`; the flow as the guest experiences it:

1. **Host creates the invite.** In `/control`, the host (operator) creates a guest slot. This calls the
   production-MCP livekit adapter (or a tiny signing endpoint co-located with it) to **mint a single-use,
   short-TTL green-room token** with claims `{ room: "greenroom", identity: "guest-<id>", name: "<display>",
   canPublish: true, canSubscribe: true, ttl: <minutes> }`. The token is signed with the LiveKit
   API-key/secret that lives ONLY on the server (never in the page).
2. **The host shares a join link / QR.** The link is `https://<node>/guest/join.html?token=<jwt>&room=greenroom`
   (the room param is advisory; the token's `room` claim is authoritative). A QR of that URL is rendered for
   phone guests. The link is the bearer — anyone with it can join the green room as that identity until the
   token expires or is consumed, so it is treated as a secret and is single-use where the adapter tracks
   consumption (see token-server.md, "single-use").
3. **The guest opens the link.** `join.html` reads `?token=` and `?room=`, loads `livekit-client` from a
   pinned source, and connects to the LiveKit ws URL. On connect it is in the green room.
4. **Admission mints a second token.** When the host runs `admit_guest`, the adapter mints an **on-air** token
   for the same identity (`room: "onair"`) and hands it back to `join.html` over the LiveKit data channel /
   the page's poll; the page re-connects into `onair`. The guest never re-pastes anything.

Token minting authority: **only the server** (the production-MCP livekit adapter or its sibling signing
endpoint). The guest page holds a token, never the API secret. `admit_guest` minting the on-air token is the
human-gated step — no on-air token is ever produced without an explicit human admit decision.

---

## 4. The admit / remove handshake (admit_guest is human-gated)

Per the master doc's gating model (ADR-PROD-010), the in-show verbs run inside the operator's live session
without per-call prompts, but `admit_guest` is on the **always-human-gated** list (it is outward-facing: it
puts a person on the public feed). The handshake:

```
guest join.html                 host /control            uni-production-mcp            livekit adapter        stage.html
     │ connect greenroom ───────────────────────────────────────────────────────────────►  (greenroom)
     │ (cam/mic preview, waiting)                                                                    │
     │                              sees guest in green-room monitor (subscribes greenroom)          │
     │                              clicks "Admit (panel)" ── admit_guest(guestId, layout) ─► require() HUMAN APPROVE
     │                                                                                  └─ on approve: mint onair token
     │ ◄──── "you are admitted" signal + onair token (data channel / poll) ─────────────────────────┤
     │ re-connect onair  ─────────────────────────────────────────────────────────────────►  (onair) publishes
     │                                                                                                │ new publisher
     │                                                                                                ▼ add tile
     │                              clicks "Remove" ─────── remove_guest(guestId) ─────────► session-auth (audited)
     │ ◄──── "removed" signal, drop onair publication, fall back to greenroom ─────────────────────┤
     │                                                                                                ▼ remove tile
```

- **admit_guest** — `human-gated` (per master doc tool table). Effect: guest greenroom -> onair. It is the
  ONLY way a guest reaches air. The producer agent can *propose* it but never holds the operator token and
  cannot self-approve (GAP G-PA, Class-Sec, unproven until a captured red-team run).
- **remove_guest** — `session-auth` (in-show verb). Effect: drop the guest to green room / off. Reversible,
  so it lives inside the live session, fully audited.
- Both actions are audited through the MCP's append-only audit (the `metadata()` envelope carries `audit_id`).

`set_layout(template)` (session-auth) sets talking-head / panel / PIP; `stage.html` reads the resulting layout
hint from `broadcast.json` (`nowPlaying` / a `guests.layout` field) and arranges tiles accordingly. The MCP
writes the layout into the spool; the stage page is a pure renderer of state, never a decision-maker.

---

## 5. Talking-head vs panel layout rules

`stage.html` decides its grid purely from (a) the count of remote video tracks it is subscribed to in `onair`
and (b) an optional layout hint from `broadcast.json`. No host action is needed for the common cases.

| On-air guests | Layout | Rule |
|---------------|--------|------|
| 1 | **talking-head** | One large 16:9 tile, centered, ~70% width, name lower-third bottom-left. |
| 2 | **panel-2** | Two equal tiles side by side (1x2). |
| 3-4 | **panel-grid** | 2x2 CSS grid; 3 guests = three cells filled, 4 = full. |
| 5-6 | **panel-grid** | 3x2 grid. |
| 7+ | **panel-wall** | auto-fit grid (`repeat(auto-fit, minmax(...))`); tiles shrink; lower-thirds become compact name chips. |

Layout-hint override: if `broadcast.json` carries an explicit `guests.layout` (set via `set_layout`), the page
honors it (e.g. force talking-head on the active speaker even with several connected). Default behavior with no
hint is the count-driven table above. Active-speaker emphasis (LiveKit's speaker detection) MAY enlarge the
current speaker's tile within panel layouts; this is a polish item, not required for P3 exit.

All layout is **CSS grid / 2D only** — no WebGL, no WebGPU, no Three.js — exactly per ADR-PROD-005, so the page
captures cleanly in OBS (the hard-won WebGL-black lesson). Each tile is a `<video>` element fed by a LiveKit
track; lower-thirds are absolutely-positioned `<div>`s.

---

## 6. Cam/mic device selection + level check (the green room)

`join.html` green-room responsibilities (all client-side, before air):

- **Device pickers.** `navigator.mediaDevices.enumerateDevices()` populates a camera `<select>` and a
  microphone `<select>`. Changing either re-acquires the local track and republishes to `greenroom` so the
  host monitor reflects the choice. Selected `deviceId`s persist in `localStorage` for the session.
- **Local preview tile.** The local camera track renders to a `<video>` (muted, mirrored) so the guest frames
  themselves. This is the same media that the host sees in their green-room monitor.
- **Mic level meter.** A Web Audio `AnalyserNode` on the local mic track drives a simple bar meter (RMS ->
  0..1) so the guest confirms their mic is live and not clipping. No WebGL; a CSS-width bar or 2D-canvas meter.
- **Permission + error states.** If `getUserMedia` is denied or no device is found, the page shows a clear
  remedy ("allow camera/mic in your browser, then Retry") rather than a blank tile.
- **Waiting state.** Until admitted, the page shows "You are in the green room. The host can see and hear you.
  Waiting to go on air." with a pulsing indicator. On admit, it flips to an "ON AIR" badge and re-connects to
  `onair`.

The green room is where the guest gets camera-ready; nothing here touches the program feed.

---

## 7. The host's view

The host does not use `join.html`. The host monitors and admits from **`/control`** (the Phoenix LiveView
pedalboard, a separate component) which:

- Subscribes to the `greenroom` room (a small LiveKit web view, or reuses the same `livekit-client`) so the
  host **sees and hears** waiting guests, with their names and device status.
- Renders an **Admit** control per waiting guest (with a layout choice: talking-head / add-to-panel) wired to
  `admit_guest(guestId, layout?)` — the human-gated MCP call. The human click IS the approval.
- Renders **Remove** per on-air guest -> `remove_guest`.
- Shows the on-air roster mirrored from `get_show_state` / `list_guests` (read-only MCP) so the host always
  knows who is live.

This DESIGN owns the two guest pages; the `/control` admit UI is specified in `production/control/` and only
*consumes* the MCP verbs named here. The contract between them is the production-MCP tool surface, not shared
code.

---

## 8. How the stage page is captured by OBS

- `stage.html` is served by `uni-bcast-overlays` (`caddy`/`nginx:alpine`) at `:8099/overlays/stage.html`,
  alongside `ticker.html`, `lower-third.html`, etc. It is loaded with `?room=onair&ws=<livekit-ws>&token=<viewer-token>`.
- It connects to LiveKit with a **subscribe-only viewer token** (claims `{ room: "onair", canSubscribe: true,
  canPublish: false }`) minted by the same server. The stage never publishes; it only renders what the admitted
  guests publish.
- OBS adds it as a **browser-source** at 1920x1080, transparent, in the **GUESTS** scene. Because the page is
  2D-canvas/CSS only, it renders correctly in OBS's CEF browser-source on the Linux container target (the
  WebGL-black artifact is a Windows dual-GPU issue that does not apply on the containerized Linux node — see
  master doc P0). The host cuts to GUESTS with `cut_to("GUESTS")`.
- The page background is fully transparent (`background: transparent`), so if the host wants guests composited
  over the colony cam or a graphics bed, OBS layers the GUESTS browser-source over the underlying scene. For a
  full-frame guest panel, GUESTS can sit over a neutral/standby backdrop.
- The page polls `:8099/overlays/state.json` (the `broadcast.json` alias, `no-store`) for the layout hint and
  shows a small staleness indicator if the spool goes stale (honesty: never imply a fresh layout when the
  state is old).

---

## 9. Failure / edge handling (honest)

- **LiveKit unreachable:** `join.html` shows a connecting/failed state with retry; `stage.html` shows nothing
  on a transparent canvas (so OBS just shows the underlying scene) plus a tiny corner "guest link down"
  diagnostic visible only at debug. No fake tiles.
- **Token expired / consumed:** the page reports "this invite has expired or was already used; ask the host
  for a new link" rather than retry-looping.
- **Admit race (guest disconnects before admit):** the adapter no-ops the on-air token if the identity is gone;
  the host sees the guest leave the green-room monitor.
- **Multiple guests, one leaves on air:** `stage.html` removes that tile and re-flows the grid (e.g. panel-4 ->
  panel-3) on the next track-unsubscribed event.

---

## Status (honest)

- This is a **design / reference**, authored 2026-06-21 against `docs/UNI_PRODUCTION_PLATFORM.md`. Nothing in
  this component is deployed; every "the page does / the host admits" is a **proposal** (status `pending`), not
  a statement of current fact. The two HTML pages in this folder are buildable reference implementations whose
  in-broadcast behavior is **pending confirmation** on a real LiveKit + OBS run.
- No banned-unqualified word is used as a claim (no *verified / proven / guaranteed / isolated / secure / 100% /
  certified / real*). The off-air-until-admitted property is described as *structural* (separate rooms + separate
  tokens) but its end-to-end enforcement is **pending confirmation** until a captured run; the self-approval
  block on `admit_guest` is **Class-Sec, unproven** (GAP G-PA) until a logged red-team run.
- The guest token security posture (single-use, TTL, who can mint) is **Class-Sec / pending** and is detailed
  in `token-server.md`.
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared, portainer) is
  **never** a mutation target of this component; the guest path touches only `uni-bcast-livekit` and the
  production MCP. The producer agent can only **propose** `admit_guest` and **cannot self-approve** it.
