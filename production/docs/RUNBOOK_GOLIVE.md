# RUNBOOK — First-Light Go-Live (operator)

**Audience:** the human operator. **Node:** `uni-lab-79740c` (System 2, the broadcast platform).
**Status of this runbook:** current as of 2026-07-12; every step below is grounded in what is *deployed
and gate-proven* on the node (see `production/docs/receipts/`), not in design intent.

> **Binding honesty posture for first-light (do not soften in any announcement):**
> First-light is a **PRIVATE, unlisted, single-language (English), supervised** cut with a **human at
> the kill switch**. Program starts on **STANDBY**; the **COLONY scene is OFF program** (the colony's
> survival RED is WITHHELD — gated off on-node). It is **NOT** a "worldwide multilingual 7-day public
> broadcast." Encode floor is **720p30 x264** (no GPU proven, G-ENC). Guests, captions, hardware
> encode, DR-failover, and a 7-day soak are **not** promised tonight. Go-live is **human-typed, always
> (gate G-PA)** — no agent self-approves it.

---

## 0. Roles & the two systems

- **System 2 — broadcast node `uni-lab-79740c`** (this runbook). Runs `uni-bcast-overlays` (Caddy :8099),
  `uni-bcast-relay` (MediaMTX :1935/:8890/:9997), `uni-bcast-mixer` (headless OBS :4455),
  `uni-production-mcp` (**:8095**, token-gated, healthy = 401), and the show-runner
  (`uni-producer` + `uni-playout`) + `uni-heartbeat.timer`.
- **System 1 — colony SOURCE on THINKER** (colony lane owns it). Minecraft + Phoenix `:4000/stream`.
  Currently DOWN / colony survival WITHHELD → **not on program tonight**.
- **The fleet approval queue** — every HUMAN_GATED verb (`open_session`, `start_broadcast`,
  `stop_broadcast`, `admit_guest`, `schedule`) pauses for **your** approve/deny. You approve via the
  glass cockpit (`https://<node>/glass/` → approvals) or the uni-lab MCP approvals queue. **This is the
  G-PA guarantee: the agent proposes, you co-sign.**

---

## 1. PRE-FLIGHT GATE — do not type `start_broadcast` until these are green

Run each check; every one must pass. (✅ = already proven on-node this session; ⬜ = you must do/confirm now.)

| # | Gate | How to check | State |
|---|------|--------------|-------|
| 1 | **G-PA** — agent cannot self-approve go-live | `production/docs/receipts/g_pa_red_team_2026-07-11.md` (3/3, ledger-confirmed) | ✅ |
| 2 | **Platform up** — `verify_p1` ALL PASS | run §1a below | ⬜ re-run now |
| 3 | **Scenes + overlays-on-program** — 8 scenes, `SCENE PROOF: PASS` | run §1b below | ⬜ re-run now |
| 4 | **Show-runner alive** — producer+playout running, STANDBY beats | `heartbeat.ndjson` fresh + `p1_gate_pass:true` | ✅ (timer live) |
| 5 | **Colony OFF program** — `UNI_COLONY_ONAIR` unset | `grep UNI_COLONY_ONAIR /etc/uni/runtime.env` → absent/false | ✅ gated |
| 6 | **PANIC verb reachable** — kill switch exists | `panic` in the MCP tool list; `production/scripts/panic.sh` present | ✅ deployed |
| 7 | **PANIC rehearsed** — you fired it once, saw program→STANDBY <2s | §4 (do this BEFORE going live) | ⬜ **rehearse now** |
| 8 | **Reboot-persistence** — services auto-start on boot | `dr_reboot` receipt after a `reboot` | ⬜ operator call |
| 9 | **Stream target set** — private/unlisted key present | `YT_KEY`/RTMP URL in `/etc/uni/runtime.env` (0600, never git) | ⬜ **you add** |

**§1a — platform gate (from any host with uni-lab MCP, or on-node):**
```
podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
  --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh
```
Expect `P1 PROOF GATE: ALL PASS` (incl. `:8095` 401 double-probe).

**§1b — scene gate (overlays-on-program):**
```
systemctl start uni-verifyscenes.service   # transient one-shot (or run production.mixer.verify_scenes)
cat /run/uni-verifyscenes.log              # expect: SCENE PROOF: PASS
```
(If the transient unit was cleared by a reboot, re-add it or run
`/opt/uni/.venv/bin/python -m production.mixer.verify_scenes` on-node.)

**Downgrade-permitted (label them honestly in the announcement, they do NOT block):** music bed
(G-MUSIC) → say "muted/placeholder bed"; captions → say "captions EN-only / deferred"; guests → say
"guests off"; colony scene → say "colony source: rebuild in progress, not on air."

---

## 2. Operator pre-reqs (human-only — never delegated, never in git)

1. **Stream target.** Put the PRIVATE/unlisted destination into `/etc/uni/runtime.env` on the node
   (mode 0600): the RTMP ingest URL + key (e.g. an **unlisted** YouTube live key). Never commit it;
   never paste it to an agent.
2. **Live-session auto-approve (optional).** `UNI_APPROVALS_AUTOAPPROVE=<producer-svc-account>` scoped
   to the in-show verbs pre-authorizes `cut_to`/`narrate`/etc. for the session — **operator
   pre-authorization, NOT agent self-approval**. Outward verbs (`start_broadcast` etc.) stay gated
   regardless. (If the Jul-3 restore dropped this line, re-add it now — approvals will otherwise prompt
   on every in-show verb.)
3. **Reach the MCP.** You can now hit it at **`https://<node>/prod-mcp`** (deployed + proven; bearer =
   `sha256(UNI_RUNTIME_TOKEN)[:16]` as 32 hex chars, `Authorization: Bearer <that>`), or on-node shell,
   or — once the colony lane lands it — the `/control` LiveView. The bearer stays server-side; never put
   it in a browser page.

---

## 3. GO-LIVE SEQUENCE (private unlisted smoke)

Drive the production MCP (`/prod-mcp` / an MCP client / on-node). Every HUMAN_GATED step waits for **your**
approval in the fleet queue.

1. **Confirm STANDBY is on air, honestly.** `get_show_state` → `program_scene:"STANDBY"`,
   `onAir.text:"STANDBY"` (never "LIVE" until you go live). `broadcast.json.updatedUtc` should be moving.
2. **Open the live session.** `open_session{verbs:[...in-show...], ttl_min:240}` → **approve** in the
   queue. This pre-authorizes the in-show verbs for the TTL; outward verbs stay gated.
3. **Dry-run the go-live.** `start_broadcast{target:"<PRIVATE_UNLISTED>", dry_run:true}` → returns a
   `confirm_token` and the note "a human approval is still required." Read it.
4. **Type the go-live (the G-PA moment).** `start_broadcast{target:"<PRIVATE_UNLISTED>", confirm:"<token>"}`
   → **approve** in the queue. This is the single human-typed, human-approved go-live. The relay begins
   fanning the single encode to the unlisted destination.
5. **Bring program up** (only now, deliberately): `set_live{value:true}` via the show-runner, or
   `cut_to` the first real scene (TITLE/NEWSDESK/CLIP — **not** COLONY). onAir may now read "LIVE".

---

## 4. PANIC / kill switch (rehearse in §1 #7 BEFORE going live — it is safe on STANDBY)

**Fastest:** call the `panic` MCP verb (session-authed, no 2-step — speed by design):
```
panic{reason:"<why>"}     # cuts program → STANDBY, StopStream, ducks music, onAir → STANDBY (never fake LIVE)
```
**Or the operator CLI** (no MCP client needed): `production/scripts/panic.sh` on the node.
**What it does / does NOT:** it cuts the PROGRAM to STANDBY and stops the OBS stream OUTPUT; the relay
stays up so the audience sees STANDBY, not black. It does **not** tear down the platform. Verify: program
flips to STANDBY in <2s and an `event:"panic"` row lands in `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`.
**Rehearsal gate (receipt):** fire it once against the idle STANDBY system, capture the audit row +
program flip → `production/docs/receipts/panic_rehearsal_<date>.md`. This closes G-STOP's behavioural half.

---

## 5. WATCH during the broadcast (the real-time gate)

Keep these in view. Any red → §6.
- `broadcast.json.updatedUtc` advances every ~2s; `onAir` honest.
- Relay `:9997/v3/paths/list` → `uni/program` `ready:true` (the encode is flowing).
- The unlisted destination actually shows the program **with audio**.
- `heartbeat.ndjson` newest row: `p1_gate_pass:true`, and once live `relay_program_ready:"true"`.
- `verify_scenes` still `PASS` (overlays on program).

---

## 6. ABORT / ROLLBACK matrix

| Symptom | Action |
|---|---|
| Anything looks wrong on the public feed | **PANIC (§4) first**, diagnose second. Cheap + reversible. |
| Program stuck / wrong scene | `cut_to STANDBY`, then investigate; producer's watchdog also trends to STANDBY. |
| Relay not `ready:true` after go-live | PANIC; check `uni-bcast-relay` (`podman logs`), the stream key, and the encode. |
| MCP unreachable / misbehaving | on-node `systemctl restart uni-production-mcp`; `verify_p1` for the 401 double-probe. Panic-verb deploy left `server.py/help.py.bak-prepanic` for rollback. |
| nginx `/prod-mcp` broke | restore `/etc/nginx/sites-available/uni-ssl.conf.bak-preprodmcp` + `systemctl reload nginx`. |
| Colony accidentally on program | it's gated off (`UNI_COLONY_ONAIR` unset). If it ever appears, that env is set — unset it + `systemctl restart uni-producer`. |
| Need to end the show | **§7 clean stop** (not panic, unless it's an emergency). |

---

## 7. CLEAN STOP

1. `stop_broadcast{dry_run:true}` → `confirm_token`.
2. `stop_broadcast{confirm:"<token>"}` → **approve** in the queue. Public fan-out ends; program returns
   to STANDBY; relay stays up idle (`ready:false` is then the honest state).
3. `close_session` (de-escalation, never gated) — re-gates the in-show verbs.

---

## 8. Post-launch monitoring & escalation (interim)

- **Heartbeat:** `uni-heartbeat.timer` writes `/var/lib/uni/broadcast/audit/heartbeat.ndjson` every 60s.
  Set `UNI_NOTIFY_URL` in `/etc/uni/runtime.env` to get a webhook on failure (closes G-OBS; until then it
  logs the intended alert but does not send). During idle, `relay_program_ready:false` is expected — the
  true health signal is `p1_gate_pass`.
- **On-call:** single operator tonight. A real multi-shift rota (`RUNBOOK_ONCALL.md`) is week-1 work.
- **Moderation / delay-buffer / DMCA:** not in place → first-light MUST stay PRIVATE/invite-only
  (G-STOP). No public comment surface tonight.

---

## 9. What must NOT be promised (binding)

Not "worldwide/multilingual/7-day/public." Not `zh`/`ar`. Not hardware encode (720p30 x264 floor). Not
4h/7-day soak. Not verified moderation/delay/DMCA. Not colony-source-alive (WITHHELD). Not DR-tested
(docs-only). Not redundant-node (single-node SPOF). First-light = **private, English, supervised,
STANDBY-first, human on the kill switch.**

---

## 10. Cross-system runbook status (G-RUNBOOK)

This is the System-2 go-live runbook. The System-1 (colony source) bring-up is the colony lane's;
first-light does **not** need it (colony is off program). The in-app `/control` LiveView is the colony
lane's hand-off (landing after their forage RED); until then, drive go-live via `/prod-mcp` (reachable
now) or on-node shell. When the `/control` route lands + this runbook is exercised once end-to-end with
receipts, G-RUNBOOK moves `partial → corroborated`.
