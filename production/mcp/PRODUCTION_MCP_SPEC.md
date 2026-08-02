# PRODUCTION_MCP_SPEC -- the uni-production-mcp surface

> **Deployment note (2026-07-11):** on the P1 node `uni-lab-79740c` this MCP is DEPLOYED on **`:8095`**, not the designed `:8094` -- `:8094` is taken by `uni-glass-configure` (answers 404; the real MCP is 401 token-gated). The `:8094` in this spec is the original design port; the wiring on the node uses `:8095`. See `production/docs/DEPLOYED_STATE.md` + `verify_p1.sh`.

**Status:** DESIGN / REFERENCE (v1). Nothing here is deployed; every "the server does X"
is a proposal (status `pending`) authored against the fixed contracts in
`docs/UNI_PRODUCTION_PLATFORM.md`. This document fixes the framework, every tool
(signature, kind, gating, effect, adapter), the metadata envelope, the auth/bind/audit
obligations, the systemd + nginx wiring (port 8094), the gating / live-session model, and
how this server composes with `uni-control-mcp` + the shared `/etc/uni-approvals` daemon.

The reference implementation lives beside this spec: `server.py`, `help.py`, and
`adapters/{obs,overlays,tts,livekit}.py`. It is importable-shaped and self-consistent
(`create_server()` runs a build-time bijection check); adapter internals that touch live
services carry `TODO`s where the handshake is environment-specific.

---

## 1. Framework + module layout

- **Framework:** `from mcp.server.fastmcp import FastMCP` (the exact `services/control_mcp`
  framework). The server is built in `create_server() -> FastMCP("uni-production-mcp",
  instructions=PRIMER, host=..., port=8094, streamable_http_path="/prod-mcp")`.
- **Tools** are nested `@mcp.tool(structured_output=True)` functions defined inside
  `create_server()`.
- **Read-only tools** are sync, wrapped with a local `@_threaded` (`functools.wraps`) that
  awaits `asyncio.to_thread(fn, ...)` so the event loop is never blocked. They return
  `metadata(...)`.
- **Mutating tools** are `async def`. They FIRST gate:

  ```python
  decision = await asyncio.to_thread(
      _APPROVALS.require, "<tool>", {args}, summary="...", force=<bool>)
  if not decision.ok:
      return _approval_refusal("<tool>", decision, _AUDIT)
  # ... await asyncio.to_thread(real_work...) ...
  rid = _AUDIT.write({...})
  return metadata("<tool>", audit_id=rid, evidence_class="C", ...)
  ```

- **`MUTATING_TOOLS`** (a module-level `set`) is the **single source of truth** for which
  tools gate. `HUMAN_GATED` is the always-human subset (called with `force=True`);
  `TWO_STEP_TOOLS` is the `start/stop_broadcast` dry-run -> confirm subset.
- **`help.TOOL_HELP`** keys equal the `@mcp.tool` names exactly and are charter-clean. A
  build-time check (`_verify_tool_consistency`) fails fast on any drift (mirrors
  control_mcp's registry-consistency guard).

```
production/mcp/
  PRODUCTION_MCP_SPEC.md   <- this file
  __init__.py              VERSION + SERVER_NAME
  server.py                create_server() + all tools + auth/bind/audit/approvals
  help.py                  CORE_PRIMER + TOOL_HELP + CHARTER + core_help()/full_manual()
  adapters/
    __init__.py
    obs.py                 obs-websocket v5 (ws://127.0.0.1:4455)
    overlays.py            atomic broadcast.json write (tmp + os.replace)
    tts.py                 Piper via tts-sidecar:8500 -> WAV
    livekit.py             LiveKit admin: token mint, green-room -> on-air, remove
```

---

## 2. The tool surface (the fixed verb set)

Every tool returns the `metadata()` envelope (own `server="uni-production-mcp"`, own
`VERSION`, `evidence_class`, and -- for mutating tools -- `audit_id`). Read-only tools are
never gated. The **Adapter** column names the thin function each tool calls.

| Tool | Signature | Kind | Gating | Effect | Adapter |
|------|-----------|------|--------|--------|---------|
| `get_show_state` | `()` | read | -- | Program scene, on-air, music level + ducked, guests, now-playing, run-of-show position. | overlays + obs |
| `list_sources` | `()` | read | -- | OBS inputs/sources (`GetInputList`). | obs |
| `list_scenes` | `()` | read | -- | OBS scenes (COLONY/GLASS/GUESTS/CLIP/NEWSDESK/TITLE/STANDBY/PIP). | obs |
| `list_clips` | `()` | read | -- | Catalog clips from `catalog.json` over the FINAL pool. | catalog (file) |
| `list_segments` | `()` | read | -- | Run-of-show templates available to launch. | run-of-show |
| `list_guests` | `()` | read | -- | Green-room + on-air guests. | livekit |
| `caption_status` | `()` | read | -- | Captioner health + current caption line (GAP G-CAP). | overlays |
| `approvals_pending` | `()` | read | -- | Approval requests waiting on the shared gate (observe). | approvals |
| `approvals_status` | `(request_id)` | read | -- | Status of one approval request (observe). | approvals |
| `cut_to` | `(scene, transition?, ms?)` | mutate | **session-auth** | Program cut/transition. | obs.cut_to_scene |
| `set_music_volume` | `(level)` | mutate | session-auth | Ride the music bed (0..1). | obs.set_input_volume + overlays |
| `duck` | `(on, target_db?)` | mutate | session-auth | Duck music under speech. | obs.duck_music + overlays |
| `narrate` | `(text, lang="en", voice?)` | mutate | session-auth | Piper TTS -> narration bus (auto-duck). | tts.synth + obs |
| `set_overlay` | `(layer, payload)` | mutate | session-auth | lowerThird/ticker/title/caption/onAir. | overlays.set_overlay |
| `roll_clip` | `(clipId, mode?)` | mutate | session-auth | Play a catalog clip into the CLIP scene. | obs.play_media + overlays |
| `start_segment` | `(template, params?)` | mutate | session-auth | Launch a run-of-show template beat. | overlays (+ run-of-show) |
| `set_layout` | `(template)` | mutate | session-auth | Talking-head / panel / PIP layout. | overlays (+ obs) |
| `remove_guest` | `(guestId)` | mutate | session-auth | Drop a guest -> green room / off. | livekit.remove_guest |
| `admit_guest` | `(guestId, layout?)` | mutate | **human-gated** | Move a guest green-room -> on-air. | livekit.admit_guest |
| `schedule` | `(slot, runOfShow)` | mutate | human-gated | Set/replace a slot's run-of-show. | run-of-show (file) |
| `start_broadcast` | `(target, dry_run=true, confirm?)` | mutate | **human-gated + 2-step** | Go live to YouTube/Twitch. | obs (StartStream) + overlays |
| `stop_broadcast` | `(dry_run=true, confirm?)` | mutate | **human-gated + 2-step** | End the public stream. | obs (StopStream) + overlays |
| `open_session` | `(verbs?, ttl_min=240)` | mutate | **human-gated** (force=True) | Open the operator live session: pre-authorize the in-show verbs for `ttl_min`. Operator approves once. | local session state |
| `close_session` | `()` | mutate | ungated (de-escalation) | Close the live session; in-show verbs re-gate. | local session state |
| `command` | `(text, execute=true)` | mutate | session-auth | The voice/text pedalboard: resolve free text to an in-show verb via the built-in grammar and dispatch it; unmatched text returns an LLM-fallback suggestion; human-gated verbs are never auto-run. | obs/overlays/tts |

Read-only tools: 9. Mutating tools (`MUTATING_TOOLS`): 15 (incl. `open_session`, `command`). Ungated session control: 1 (`close_session`, de-escalation). Human-gated: 5 (`open_session` + the 4 outward verbs). Two-step: 2. Total registered tools: 25.

**Session control (the live-session gating model, ADR-PROD-010).** The operator opens a live session with `open_session` (human-gated: approved once through the gate); the in-show verbs then auto-approve until `close_session` or the `ttl_min` expires. This is operator pre-authorization, not agent self-approval. `command` is the voice/text pedalboard entry: it resolves free text to an in-show verb and dispatches it within the open session; outward (human-gated) verbs are never auto-run by `command`.

---

## 3. The metadata envelope (provenance contract)

Every tool returns `metadata(tool, ...)`:

```jsonc
{
  "ok": true,
  "tool": "cut_to",
  "data": { ... tool-specific ... },
  "evidence_class": "C",            // A/B/C/Sec/pending -- never asserted as A here
  "provenance": {
    "server": "uni-production-mcp",
    "version": "0.1.0-design",
    "git_commit": "<UNI_GIT_COMMIT or 'unknown'>",
    "timestamp": "2026-06-21T18:04:22Z"
  },
  "help": "<help.TOOL_HELP[tool]>",  // charter-clean one-liner
  "docs": "uni://prod-mcp/guide",
  "audit_id": "<ledger row id>",     // present on mutating tools
  "how_to_fix": "..."                // present only on failures
}
```

- **Evidence class** per the appliance taxonomy: A=independently reproduced,
  B=observed-with-artifact, C=command-output, Sec=security-relevant-**unproven**,
  pending=not-yet-established. This server never styles anything as Class-A. Refusals and
  the self-approval-blocked path are `Sec`; unreachable adapters degrade to `pending`.
- **`how_to_fix`** is populated on every failure -- callers read it, they do not guess.

---

## 4. Auth, bind, and audit obligations

### 4.1 Bearer auth (fail-closed)
- The expected bearer is derived from the deploy password:
  `sha256(UNI_DEPLOY_PW)[:16 bytes].hex()` -> a 32-hex-char token.
- `BearerAuthMiddleware` (ASGI) requires `Authorization: Bearer <token>` to equal that
  value on every HTTP request. If `UNI_DEPLOY_PW` is unset, `_expected_bearer()` is `None`
  and the middleware refuses **all** requests with `401` -- fail-closed, never fail-open.

### 4.2 Bind guard
- `_assert_bind_guard()` runs in `main()` before serving. It `exit(1)`s if the host is
  `0.0.0.0` / `::` / empty, or any host outside the loopback / WireGuard prefixes
  (`127.`, `::1`, `10.`). The server binds `127.0.0.1:8094` by default; nginx terminates
  TLS and proxies `/prod-mcp` to it. The MCP itself is never internet-facing.

### 4.3 Audit (append-only)
- Every mutating tool, **and every approval refusal**, writes an append-only ledger row
  via `_AUDIT.write({...})` and surfaces the returned `audit_id` in the envelope. On the
  appliance this reuses the shared `control_mcp` audit ledger; the local shim writes NDJSON
  under the broadcast spool (`/var/lib/uni/broadcast/audit/prod-mcp.ndjson`, never `/tmp`).
- Audit must never crash a tool: a write error still returns the row id for the envelope.

---

## 5. Gating / live-session model (ADR-PROD-010)

The honest reconciliation of "destructive ops are human-approval-gated" with live
operation. A human cannot approve/deny every cut during a live show, so:

- **Live session = operator pre-authorization, NOT agent self-approval.** One human act
  sets `UNI_APPROVALS_AUTOAPPROVE` to an allowlist scoped to the **in-show verbs**
  (`cut_to`, `set_music_volume`, `duck`, `narrate`, `set_overlay`, `roll_clip`,
  `start_segment`, `set_layout`, `remove_guest`). Within the session those verbs run
  without a per-call prompt **but are fully audited**. `approvals.require()` is still called
  for each; it consults the operator's allowlist. The producer agent never holds the
  operator token -- it can only propose.
- **Outward-facing / irreversible verbs are always human-gated.** `admit_guest`,
  `schedule`, `start_broadcast`, `stop_broadcast` call `approvals.require(..., force=True)`.
  `force=True` bypasses the allowlist and **always** requires an explicit human
  approve/deny via the shared `/etc/uni-approvals` daemon. There is no allowlist entry that
  can auto-approve them.
- **`start_broadcast` / `stop_broadcast` add a 2-step handshake.** Step 1: call with
  `dry_run=true` -> the server issues a `confirm_token` (a propose-only act, no gate). Step
  2: call again with `confirm=<token>` within 5 minutes -> the token is consumed AND the
  human gate (`force=True`) must clear before the stream actually starts/stops. A missing or
  expired token returns a `Sec`-class refusal.

In the reference `_LocalApprovals` (dev box, no daemon): `force=True` always denies (no
human present to approve), and an in-show verb is approved only if it is in the
`UNI_APPROVALS_AUTOAPPROVE` allowlist -- otherwise it denies. This fails **closed** for any
gated verb, which is the security-correct default.

> **GAP G-PA (`pending_external`, Class-Sec):** "the producer agent cannot self-approve a
> destructive go-live/cut" is *unproven* until a logged red-team run captures the automated
> path being blocked at the gate. The design blocks it (`force=True` + no agent token); the
> evidence is pending.

---

## 6. Composition: uni-control-mcp + the shared approvals daemon

- **Separate server, separate port, separate unit.** This is a *new* FastMCP server on
  **8094** with its own systemd unit and its own nginx `/prod-mcp` location -- it does not
  modify `uni-control-mcp` (the OS/Podman control surface). The two run side by side.
- **Shared control plane.** Both servers gate through the **same** `/etc/uni-approvals`
  store and the **same** `uni-approvald` daemon (the human approve/deny queue), and both
  append to the shared audit ledger. `server.py` imports `services.control_mcp.approvals` /
  `.audit` when present on the appliance, and falls back to local shims with identical
  shapes on the dev box. This means one operator approval surface governs both OS mutations
  and broadcast mutations.
- **Why separate, not a bolt-on (ADR-PROD-002):** the production verbs are a distinct
  trust domain (outward-facing broadcast) and a distinct failure domain (the broadcast
  node), so they get their own port/unit/nginx location and their own `VERSION`/`help`,
  while reusing the proven approval + audit + metadata machinery.

---

## 7. systemd unit + nginx wiring (port 8094)

### 7.1 Host systemd unit (`production/systemd/uni-production-mcp.service`)

```ini
[Unit]
Description=UNI Production MCP (FastMCP, broadcast control surface)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
# Loopback bind by contract; nginx terminates TLS and proxies /prod-mcp here.
Environment=UNI_PROD_MCP_BIND_HOST=127.0.0.1
Environment=UNI_PROD_MCP_PORT=8094
Environment=UNI_MCP_APPROVAL_REQUIRED=1
Environment=UNI_APPROVALS_DIR=/etc/uni-approvals
Environment=UNI_BROADCAST_DIR=/var/lib/uni/broadcast
Environment=UNI_OBS_WS=ws://127.0.0.1:4455
Environment=UNI_TTS_URL=http://127.0.0.1:8500
Environment=UNI_LIVEKIT_URL=ws://127.0.0.1:7880
# The bearer is derived from the deploy password. server.py reads it from UNI_RUNTIME_TOKEN
# (the appliance source, supplied via /etc/uni/runtime.env) or UNI_DEPLOY_PW; a verbatim
# UNI_PROD_MCP_TOKEN / UNI_MCP_TOKEN overrides. These + the LiveKit/OBS secrets come from an
# EnvironmentFile (not in git):
EnvironmentFile=-/etc/uni/runtime.env
EnvironmentFile=-/etc/uni/production-mcp.env
# The live session is opened by the OPERATOR, not the unit. UNI_APPROVALS_AUTOAPPROVE is
# set by the operator's "open live session" action, scoped to the in-show verbs, and is
# NOT baked here (so the default posture fails closed).
ExecStart=/opt/uni/production/.venv/bin/python -m production.mcp.server
WorkingDirectory=/opt/uni/production
Restart=always
RestartSec=2
# Hardening (the encoder/business stack are never mutation targets):
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/uni/broadcast
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### 7.2 nginx location (added to both confs, stream-safe headers)

```nginx
# /prod-mcp -> the production MCP on 8094 (mirrors the control MCP /mcp -> 8090 block).
location /prod-mcp {
    proxy_pass         http://127.0.0.1:8094/prod-mcp;
    proxy_http_version 1.1;
    # Forward the UPSTREAM's authority (not $host) so the MCP's DNS-rebinding guard accepts it:
    proxy_set_header   Host              127.0.0.1:8094;
    proxy_set_header   X-Real-IP         $remote_addr;
    proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    # Streamable-HTTP / SSE safety (NOT a WebSocket -- forcing Connection: upgrade => upstream 421):
    proxy_set_header   Connection        "";
    proxy_buffering    off;
    proxy_cache        off;
    proxy_read_timeout 3600s;
    chunked_transfer_encoding on;
    # The bearer Authorization header is forwarded as-is; BearerAuthMiddleware enforces it.
}
```

The MCP path (`streamable_http_path="/prod-mcp"`) means clients reach the server at
`https://<appliance>/prod-mcp` over WireGuard/LAN only (and the producer/playout services
reach `http://127.0.0.1:8094/prod-mcp` directly on the node).

---

## 8. Failure + degradation behavior (honest by construction)

- **Adapter unreachable** (OBS down, tts-sidecar down, LiveKit admin down): the tool
  returns `ok=false`, `evidence_class="pending"`, and the adapter's `how_to_fix`. Read-only
  tools degrade to honest emptiness (e.g. `list_guests` reports
  `livekit_admin_unavailable` rather than faking presence; `get_show_state` reports the
  scene as `null` when the mixer is unreachable).
- **Approval denied / no live session**: `_approval_refusal()` returns `ok=false`,
  `evidence_class="Sec"`, the refusal reason in `how_to_fix`, and writes an
  `approval_refused` audit row.
- **2-step token missing/expired**: `Sec`-class refusal telling the caller to dry-run first.
- **Overlay write**: atomic (`tmp + os.replace`); a page never reads a half-written
  snapshot, and `updatedUtc` lets every page show staleness honestly.

---

## Status (honest)

Charter: `UNI.OS/docs/life-no-game/EPISTEMIC_CHARTER.md` Art. VIII (binding) + live
`uni://charter`.

- No banned-unqualified claim word is used as a claim (*verified / proven / guaranteed /
  isolated / secure / 100% / certified / real*). Status language only: checked / observed /
  as captured / reported / appears / pending confirmation.
- This is a **design/reference**. The server is **not deployed**; every "the server does X"
  is a proposal, status `pending`. The reference modules import-check this session
  (`create_server()` builds, the bijection guard passes, the bearer derives to 32 hex
  chars, the bind guard rejects `0.0.0.0`), which is **Class-C** (command output), not a
  statement that the live broadcast control plane runs.
- Composite/health tones gate on the weakest constituent ("no green over yellow").
- Live-appliance safety: the business stack (`solutionwright-*`, odoo, jitsi, cloudflared,
  portainer) is read-only observation and is **never** a mutation target of this server; the
  encoder is **not** co-located with the ERP appliance. Every mutating action routes through
  the shared human approval gate; the producer agent only proposes and **cannot
  self-approve** (`force=True` on the outward verbs + no agent-held operator token).
- Open gaps (full register in `production/docs/GAPS_REGISTER.md`): **G-PA** (self-approval
  block is Class-Sec, unproven until a captured red-team run), **G-ENC** (encoder
  node/GPU is an operator hardware choice), **G-CAP** (caption latency/quality unmeasured),
  **G-MUSIC** (no music-bed asset exists yet).
