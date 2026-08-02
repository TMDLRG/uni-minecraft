# UNI Production Platform - GAPS Register

> **⚠️ P7 CORRECTION (2026-07-12) — read [ADR-PROD-011](adr/ADR-PROD-011-native-windows-obs-on-render-host.md) + [ADR-PROD-012](adr/ADR-PROD-012-encoder-placement-policy.md) first.**
> Gap deltas after the P1–P8 remediation:
> - **G-ENC** (encoder): largely CLOSES — T1000 NVENC available on THINKER; x264 `faster` 720p30 stays as the
>   documented software floor per ADR-PROD-012.
> - **G-DR** (disaster recovery): shifts to **2 SPOFs** — THINKER (render + encode) + node2 (relay). Add
>   mitigation-not-deployed row: "cold-standby OBS install on node2 (< 60 min rebuild)."
> - **G-STOP** (kill switch): repointed to the **relay-side** panic — a MCP `panic` verb kills node2's
>   mediamtx `runOnReady` tee so the public feed goes dark instantly regardless of encoder state.
> - **G-OBS** (heartbeat surface): drop the mixer-heartbeat check row for node2; add THINKER's tray watchdog
>   probes (Probe-Health + Dismiss-OBSDialogs) as the equivalent local liveness surface.

- **Status:** Proposed (design). This register tracks the load-bearing assertions whose evidence is not yet
  captured. A row is **closed only by linked evidence** (a captured run, a measured artifact, a logged
  red-team result) - never by assertion.
- **Authored:** 2026-06-21
- **Master contract:** `docs/UNI_PRODUCTION_PLATFORM.md` (the six original gaps: G-ENC, G-PA, G-CAP, G-MUSIC,
  G-9x16, G-YTLIB) + the **2026-07-11 readiness audit** gaps (G-RUNBOOK, G-DR, G-STOP, G-OBS, G-GATE — see
  `docs/RELEASE_READINESS.md`). ADRs: `production/docs/adr/`.

**Status vocabulary (canonical):** `corroborated` / `passed_source` / `pending_external` / `pending_hardware`
/ `heuristic` / `unguarded` / `refuted`. A gap moves toward closure only when the **What closes it** evidence
is captured and linked; an unmet assertion stays open at its honest status.

**Evidence classes (appliance taxonomy):** A = independently reproduced, B = observed-with-artifact,
C = command-output, Sec = security-relevant-**unproven**, pending = not-yet-established.

| ID | Assertion at risk | Status | Live source | What closes it | Owner |
|----|-------------------|--------|-------------|----------------|-------|
| **G-ENC** | The broadcast H.264 encode (4h x 3/day) runs on a dedicated broadcast node and does **not** load the ERP appliance; a real encode host/GPU exists (NVENC/VAAPI) or the x264-720p30-`faster` floor is met without stressing the business stack. | `pending_hardware` | `lab-os/systemd/uni-cockpit-kiosk.service` (chromium `--disable-gpu`, Matrox G200 = no HW encode, observed); the ingest map (no `nvidia`/`--gpus`/CDI); `production/containers/systemd/uni-bcast-mixer.container` (encoder param) | A captured encode-load run on the chosen broadcast node showing the encode CPU/GPU load living on that node and the ERP appliance untouched (Class-B artifact: node `top`/`nvidia-smi`/`vainfo` + appliance load, side by side). Operator must first provision the node/GPU. | Operator (hardware) + Pip Line |
| **G-PA** | The producer agent **cannot self-approve** a destructive go-live / cut: outward verbs (`start_broadcast`, `stop_broadcast`, `admit_guest`, `schedule`) always require an explicit human decision, and the agent cannot widen its own `UNI_APPROVALS_AUTOAPPROVE` allowlist or hold the operator token. | `corroborated` | ADR-PROD-010; `/etc/uni-approvals` + `uni-approvald` + `UNI_APPROVALS_AUTOAPPROVE`; `production/mcp/server.py` (`MUTATING_TOOLS`, `approvals.require()`); `production/mcp/red_team_g_pa.sh` | A **logged red-team run** (Class-Sec artifact) where the producer agent attempts to self-approve / widen its allowlist / drive an outward verb without a human and is refused, with the audit trail captured. **Closed 2026-07-11:** `production/docs/receipts/g_pa_red_team_2026-07-11.md` — 3/3 PASS, live self-approve refusal on `start_broadcast` + immediate refusal on `admit_guest`/`schedule`, each `audit_id` independently confirmed in `/var/lib/uni/broadcast/audit/prod-mcp.ndjson`; allowlist-widen refuted by source (no writer of `UNI_APPROVALS_AUTOAPPROVE` exists outside the read-only `__init__`). **What this does NOT test:** the human-approval positive path (a real operator approving via `/etc/uni-approvals`) — only the refusal-without-a-human path was exercised, which is the correct scope for this row. | Guard Ian + Operator |
| **G-CAP** | Real-time multilingual captioning (faster-whisper transcribe + translate) meets an on-air latency/quality bar on the chosen node. | `pending_hardware` | ADR-PROD-006; `uni-bcast-captions` quadlet; `tts-sidecar:8500` (Piper, observed); `broadcast.json.caption` | A measured caption run on the broadcast node: captured end-to-end latency (audio -> caption line) + a quality/accuracy sample per language (Class-B artifact). No latency or accuracy figure is claimed until then. | Operator (hardware) + Tess Ter |
| **G-MUSIC** | A broadcast music bed asset exists and is license-clean (CC / royalty-free) for the looping bed + duck-under-speech mix. | `pending` | `docs/UNI_PRODUCTION_PLATFORM.md` (Sources: "the music bed - **must be sourced - none exists today**"); the FINAL pool (one music video, not a bed) | A sourced, license-documented music-bed asset committed to the catalog with its CC/royalty-free license recorded (Class-B artifact: the asset + its license provenance). No bed is claimed to exist until then. | Operator + Content Curator |
| **G-9x16** | Most catalog content is vertical 9:16; a 16:9 broadcast must pillarbox / shorts-wall vertical clips, and the overlay/playout framing handles it cleanly. | `heuristic` | `content/media/streets-shorts/FINAL/*` (vertical MP4s, observed); ADR-PROD-005 (pillarbox framing); ADR-PROD-007 (playout) | A captured playout run showing vertical clips correctly pillarboxed / shorts-walled in the 16:9 program (Class-B artifact: a frame grab of a vertical clip framed on air). Currently a heuristic from the observed aspect of the FINAL pool. | Des Igner + Operator |
| **G-YTLIB** | The catalog source is complete: whether a dedicated YouTube-library repo exists beyond the on-host FINAL pool + the known playlists. | `pending` | `content/media/streets-shorts/FINAL/` + the known playlists; `production/catalog/build-catalog.mjs` (points at FINAL/ + playlists until confirmed) | Operator confirmation of the authoritative library set (FINAL/ + playlists, or a named additional repo), captured as a recorded decision; the catalog builder is then pointed at the confirmed set (Class-C artifact: the confirmation + the builder config). | Operator + Query Quinn |
| **G-RUNBOOK** | A single cross-system operator runbook exists for a worldwide go-live (spanning the UNI-LAB colony source (on the chip) + the portable THINKER studio + the node2 relay; NOT "colony on THINKER" — see ADR-PROD-013), AND a REACHABLE in-app go-live surface exists for the System-2 path. | `partial` (blocker) | **Runbook `production/docs/RUNBOOK_GOLIVE.md` COMMITTED** (pre-flight gate, exact go-live verb sequence, PANIC/abort/rollback, honest posture) + **nginx `/prod-mcp` → `:8095` DEPLOYED + PROVEN** (`https://<node>/prod-mcp` → 401 through the operator nginx front, regression-clean; `nginx_prod_mcp_2026-07-12.md`); `production/control/control.html` (`MCP_BASE=/prod-mcp`) can now reach the MCP; the Phoenix `/control` LiveView is the colony lane's hand-off (landing after their forage RED) | **Runbook + nginx half done 2026-07-12.** Remaining: the `/control` LiveView route (colony) + exercise the runbook once end-to-end (Class-B) → then `corroborated`. Until then, go-live is reachable-MCP + shell/MCP per the runbook; a false/wrong-system go-live is the residual risk. | Operator + Pip Line + Colony |
| **G-DR** | Rollback / disaster-recovery / node-loss failover exists for the SINGLE-node broadcast platform (a 7-day-run SPOF): redeploy-from-scratch, volume backup/restore, ship-to-previous-tag. | `pending` (blocker) | System 2 is one box (`uni-lab-79740c`); ship path is `git archive` with no rollback target; no backup/restore/failover documented | A documented + rehearsed redeploy-from-scratch (from a pinned tag) + a volume backup/restore procedure + a node-loss plan (Class-B: a captured rebuild). | Operator + Pip Line |
| **G-STOP** | An emergency-stop / kill-switch + broadcast-delay buffer + content-moderation/standards path exists for a public worldwide feed. | `partial` (blocker) | **`panic` MCP verb DEPLOYED + live on `:8095`** (session-authed, audited, NOT human-gated — speed over a 2nd approval; cuts to STANDBY + StopStream + duck + onAir=STANDBY) + `production/scripts/panic.sh` operator CLI + `production/docs/RUNBOOK_PANIC.md`; `stop_broadcast` (human-gated) remains | **Deploy half done 2026-07-12** (`production/docs/receipts/panic_verb_deploy_2026-07-12.md`): verify_p1 ALL PASS post-restart (401 double-probe → bijectivity passed → panic registered). **Remaining for `corroborated`:** operator fires the PANIC rehearsal (audit `event:panic` + program→STANDBY <2s + relay up); a delay-buffer decision; and a moderation/standards/takedown path. Compliance obligations for CNN/BBC/PBS-grade output otherwise unaddressed. | Operator + Guard Ian |
| **G-OBS** | Continuous observability + alerting exists for a running broadcast (heartbeat that pages if the relay drops `ready:true` mid-show; a live health dashboard; on-call). | `partial` | `uni-heartbeat.timer` deployed + enabled on `uni-lab-79740c` (60s cadence, boot-persistent); writing `heartbeat.ndjson` rows with `p1_gate_pass` re-running `verify_p1.sh` each tick; `notify.sh` alert path wired | **Deployed 2026-07-12** (`production/docs/receipts/heartbeat_deploy_2026-07-12.md`): first row captured, `p1_gate_pass:true`, notify path proven (no-ops + logs intent without a URL). **Remaining for `corroborated`:** operator sets `UNI_NOTIFY_URL`, then capture the induced-fault alert-fire (stop relay → webhook within 60s → restart → clears); + refine idle-vs-live cadence so idle `relay_ready=false` isn't counted a fault; + run colony_gate on-node. | Operator + Pip Line |
| **G-GATE** | Every user-facing claim is backed by a machine-runnable gate that cannot pass falsely. | `partial` | `verify_overlays.cjs` (overlays) + `verify_p1.sh` (platform, now sha-comparing) + **NEW** `viewer/verify_colony.cjs` (colony_count==RCON−Director) exist. STILL OPEN: `verdict=LIVE` is PID-only (a `:self` puppet passes — `health_controller.ex`); System 2 has NO overlays-on-program gate for G2; `verify_colony.cjs` is authored but not yet wired into the colony bring-up + puppet-cam guard | Read the Director's REAL driver field into `/producer/health` + require driver=producer & frame-advance for `verdict=LIVE` (colony/Elixir lane); wire `verify_colony.cjs` into bring-up; add a System-2 obs-websocket overlays-on-program check before G2 go-live (Class-B: captured gate runs). | Colony agent + Pip Line |

---

## How a row closes

1. The **What closes it** evidence is captured (a run, a measured artifact, a logged red-team result, or an
   operator-recorded confirmation).
2. The evidence is **linked** in the row's **Live source** column with its evidence class.
3. The **Status** is updated to the honest post-evidence value (`corroborated` / `passed_source`, or
   `refuted` if the evidence contradicts the assertion).
4. The matching ADR's Status (honest) footer is updated to reference the captured evidence.

No row is closed by assertion, by a passing build, or by a design review - **only** by linked captured
evidence.

---

## Status (honest)

This register is a **design** artifact; every row is currently open at its honest status. No banned-
unqualified word is used as a claim (no verified / proven / guaranteed / isolated / secure / 100% /
certified / real). G-ENC and G-CAP are `pending_hardware`; **G-PA is `corroborated`** (Class-Sec, 3/3 PASS
red-team + ledger-confirmed, 2026-07-11 — see `production/docs/receipts/g_pa_red_team_2026-07-11.md`);
G-MUSIC and G-YTLIB are `pending`; G-9x16 is `heuristic`. The business stack (`solutionwright-*`, odoo,
jitsi, cloudflared, portainer) is **never** a mutation target and the encoder is **not** co-located with the
ERP appliance; the producer agent **cannot self-approve** - rows close only by linked captured evidence.

**2026-07-11 readiness-audit additions:** G-RUNBOOK / G-DR / G-STOP are `pending` **blockers** for any public
go-live; G-OBS is `pending`; G-GATE is `partial` (colony + platform + overlay gates exist and are hardened;
the `verdict=LIVE` PID-only weakness and the System-2 overlays-on-program gate remain open). None is closed.
The full go/no-go is `docs/RELEASE_READINESS.md`: **NO-GO for a worldwide public go-live** until these clear.

---

## 2026-07-12 — DNS + enterprise-hardening additions

The owner's directive: clean the IP/port sprawl into a human `uni-lab.local` namespace, surface the FULL
live insight of every ip/port/container/name/build/route as verified live reads, and make the whole thing
production-ready enterprise class (including secured external camera inbound in the near future). Two SAFE
pieces landed this session; the rest is staged, dependency-correct, one cure at a time.

**Landed (SAFE, repo-only, live-verified):**
- **Live-infra observability surface** — `viewer/{infra.cjs,infra.html,infra_registry.json,probes.cjs}` +
  `launcher.cjs` `GET /infra` + `/api/infra`. Every value is a live read (rootless SSH to the chip for
  `ip addr`/`podman ps`/`resolv.conf`, local `os`/`git` for THINKER, tcp/http health probes, Node `dns`
  drift) with an honest per-field state (`fresh|stale|unreachable|not_verified|drift`) — never green from
  process existence. Loopback-only, GET-only, read-class, no secret rendered. Verified against the real
  fleet (chip 16 interfaces + rootless container counts live; node2 `unreachable`; drift `not_verified`
  until the resolver is built). This is the proof surface for everything below.
- **DNS Phase 1 repo artifacts** — `production/dns/{uni-lab.local.hosts,dnsmasq.uni.conf,uni-dns.container,
  README.md}`. Authoritative unicast dnsmasq for `uni-lab.local`; the deploy is phased + gated (README).

**Enterprise-hardening roadmap (staged, dependency-correct — each stage is a separate gated effort):**
- **Stage A — internal names** (`production/dns/*`): dnsmasq zone + container `--dns` + THINKER NRPT.
  Phases 0–4 approval-gated but non-disruptive; **Phase 5 host cutover is owner-signed + RED-gated**;
  Phase 8 (node2) BLOCKED on G-NODE2.
- **Stage B — name→service routing** (kill `IP:port`): extend the existing nginx `:443 server_name
  "uni-lab.local _"` with `Host`-vhosts (`erp`→8188, `meet`→8446, `mail`→18082, `masterplan`→4100) +
  a THINKER-side proxy for `studio`/`cams`. Rootful MCP mutation, one co-sign apiece.
- **Stage C — internal TLS**: `step-ca`/`mkcert` root trusted per box, `*.uni-lab.local`; nginx terminates.
- **Stage D — observability over names** (the surface above, rendered over Stage-A/B names).
- **Stage E — firewall**: nftables default-deny inbound on uni-lab; external scan shows only the intended edge.
- **Stage F — external DNS + secured inbound** (owner-domain-gated; **no domain today**): a real registered
  domain, Cloudflare Tunnel publishing ONLY `cams.<domain>` (WHIP) + optional `ops.<domain>`; colony + ERP
  get **no external record, ever**; per-contributor short-lived scoped WHIP bearer tokens replace the LAN
  ip-allowlist; program fan-out stays locked to loopback + `10.88.0.0/16`; go-live stays human-typed.

| ID | Assertion at risk | Status | Live source | What closes it | Owner |
|----|-------------------|--------|-------------|----------------|-------|
| **G-NODE2** | The fan-out relay (node2) is reachable and accepting THINKER's publish — the public go-live dependency. | `refuted` | `viewer/infra.cjs` node2 probe → `unreachable` (tcp `10.190.245.149:1935` + `10.13.13.3` mesh, 100% loss, confirmed from the mesh router); ADR-PROD-012/013 | Box back online; `Test-NetConnection 10.190.245.149 -Port 1935` ok + the relay API answers + `uni-bcast-relay` accepts a THINKER test publish (Class-C). **Blocks ALL public go-live, Stage-A Phase 8, and Stage F.** | Operator (node2) |
| **G-DNS** | Fleet-wide human names (`uni-lab.local`) resolve everywhere — LAN, wg mesh, and inside podman containers. | `unguarded` | `production/dns/*` authored (Phase 1); nothing deployed; `viewer/infra.cjs` drift = `not_verified` (resolver not built) | Stage-A GATE 4 (out-of-band `nslookup` of every fleet name + upstream) **and** GATE 5 (host cutover, all existing names still resolve, `swo*`/`mc-server` still Up) pass from THINKER + a container + uni-lab (Class-B). | Operator + Colony |
| **G-EXEC** | The Phase-5 resolver cutover is executable through the current MCP surface. | `pending_external` | MCP filesystem sandbox `[/opt/uni /var/lib/uni /etc/uni /var/log/uni /run]`; `/etc/resolv.conf` + `/etc/nsswitch.conf` are OUT of sandbox and `os_exec` is OFF | Owner enables `UNI_MCP_EXEC_ENABLED=1` + an argv allowlist for the two edits, OR hand-edits the two files under the Phase-5 RED gate. Infeasible unattended by design. | Operator |
| **G-IPSPRAWL** | Configs reference human names, not raw IPs (the sprawl the owner called out). | `heuristic` | grep: `CLAUDE.md`, `viewer/*`, `mediamtx.yml` etc. still carry literal IPs; the name map now exists but nothing is re-pointed | After G-DNS: re-point configs at `*.uni-lab.local` / `${VARS}`; a grep for hard-coded fleet IPs comes back clean outside the declared map (Class-C). | Colony + Operator |
| **G-TLS** | External-facing surfaces present a trusted cert (no self-signed warning). | `unguarded` | `publisher.cjs :8443` + relay `:8889` are self-signed (`auto.crt`) | Stage C (internal CA) for `*.uni-lab.local`, then Stage F edge cert; `openssl s_client` + a browser with no warning (Class-B). | Operator |
| **G-EXTDNS** | Off-LAN cameras publish securely over a minimal, authenticated inbound surface. | `pending_external` | no owner-registered domain today; the LAN ip-allowlist cannot work off-LAN; `cloudflared` already runs here for `swo-mail` | Stage F: owner domain + Cloudflare Tunnel exposing only `cams`/`ops` + scoped short-lived WHIP tokens (operator-minted, never agent-held) + a port scan showing only the intended edge (Class-Sec). BLOCKED on G-NODE2 + a domain. | Operator |
| **G-FW** | A default-deny firewall confines the colony / ERP / MCP from unintended inbound. | `unguarded` | no nftables table readable in the survey | Stage E nftables default-deny inbound on uni-lab (allow `:22` LAN/mesh, `:443` proxy, the one pinned WebRTC UDP); an external scan shows only intended ports (Class-Sec). Must precede any external exposure. | Operator |
| **G-TAB** | `uni-tab-arm-1` (mesh `10.13.13.5`) role + liveness. | `pending` | registry-only (`viewer/infra_registry.json`); `viewer/infra.cjs` renders `not_verified` — never probed, never green | Capture `lab_health limb=uni-tab-arm-1` (Class-C); record its role. | Operator |

None of these DNS/enterprise rows is closed. G-NODE2 is `refuted` (down) and **gates public go-live, Stage-A
Phase 8, and Stage F**. The observability surface renders every one of them honestly today — `refuted` red,
`unguarded`/`pending` grey, `not_verified` never green — which is the point: the proof surface tells the
truth about its own gaps before any of them are claimed closed.
