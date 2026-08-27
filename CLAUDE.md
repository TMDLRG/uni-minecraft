# Stratified Palimpsest — standing project context

This file is loaded into every Claude Code session in this repo. **Read every section. The rules here are
binding.** They override any default behaviour.

## FIRST MOVE — for any agent, any question about STATE (binding, 2026-07-14)
> Before reading anything else in this file, before grepping for anything: **run this one call.**
> It returns the current door lifecycle state, the journey step, every studio surface's live probe,
> Gaia's state, and a curated map of every actionable endpoint. No grep required, ever.

```
curl -s http://127.0.0.1:8090/api/status
```

Answers instantly: "what is the door state / what step am I on / what could I do next / what is
Gaia resonance / what might I see" — all in one JSON. If it doesn't answer, the launcher is down;
diagnose the door (see the "The Door + studio lifecycle" section below). Full contract:
`docs/AGENT_INSTANT_STATUS.md`. **Never grep the repo to answer a "what is my state" question — that
means the endpoint is missing a field; extend it in `viewer/launcher.cjs` instead of papering over
the gap.** The living map at `/door` is the visual counterpart; `/api/status` is the machine one.

Everything else in this file is CONTEXT (why the system exists, the laws, the science fence). This
one call is the OPERATIONAL truth. Read the context, but hit the endpoint first.

## What this project is
A **durable, professional, worldwide LIVE-BROADCAST SYSTEM built ON an active-inference colony** — not a
streaming feed, not a demo. The substrate is a pure-Elixir categorical active-inference colony (Stratified
Palimpsest; main branch `gen2-runtime`, into which the `lab/ozone-life-uni-hard-science` line was merged 2026-07-13): UNIs are embodied bots on a real Minecraft server,
one mean-field predict-act tick as their life. On TOP of that colony we run a broadcast platform engineered
to CNN/BBC/PBS standards: worldwide, multilingual, supervised, boot-persistent, meant to carry a 7-day run
(4h × 3/day) without a frozen frame. North star: **literal digital life with measurable awareness and full
human ability within this body/world, broadcast honestly to the public.** We carry the receipts because we
are on a path that, if it keeps building, ends in a public claim. **Receipts beat rhetoric.**

**The owner's vision (fold this into every decision):** UNI **always** lives on the one canonical **UNI-OS
(UNI-LAB, "the chip")** so that agents ANYWHERE — soon open-source, everywhere — can ship to, run, build,
deploy, and do science ON the same colony, while the **studio that broadcasts it is portable to any GPU box**
(Mac or Windows). ONE SCREEN / systray launch surfaces everything the operator and any LLM need — the deep
science, the gates, and the process are folded in so that everything an agent touches makes plain how this
works **as its own universe: a public, reproducible build of general AI.**

**First read: `docs/SYSTEM_OVERVIEW.md`** (whole-system orientation — colony substrate + portable studio +
broadcast mission). Then this file, `docs/STUDIO_SYSTEMS.md` (canonical studio map), `docs/UNI_OS_COLONY_MIGRATION.md`
(canonical colony-placement doc — colony ON the chip, captured over LAN), `docs/LAB_PROTOCOL.md`, and
`docs/UNI_MISSION_DEEPENING.md`.

## The two tracks + how this agent works — VFE/EFE/OODA, Document-Driven, Test-Driven (binding)
> Full detail: `docs/WORKING_LOGIC.md`. Studio-track plan: `docs/STUDIO_HARDENING_DD_TDD_PLAN.md`.

**TWO TRACKS, TWO AGENTS — never conflate them (same discipline as the three boxes).**
- **Studio track:** the broadcast platform — production paths, runtimes, UIs/UX, DNS, end-to-end process, and
  their docs (`viewer/*`, `production/*`, `deploy/uni-os/*`, the studio docs). Touches **no FE-engine code.**
  Plan: `docs/STUDIO_HARDENING_DD_TDD_PLAN.md`.
- **Science track (a SEPARATE agent):** the colony's mind — the FE engine (`lib/sp/brain/*`,
  `lib/sp/runtime/*`) and the gated lineages (`homeostat_colony`, `forage-pureworld-graduation`,
  spine/glands/hemispheres) under `docs/LAB_PROTOCOL.md` + the pre-registered REDs. The studio agent does
  **not** design, run, or close a science gate. **HANDOFFS (read both before touching the colony):**
  (1) `docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md` — **RESOLVED 2026-07-19.** Its
  premise (chip stuck on the 3-week-old `uni-colony:v2`, no Producer/Director) is history: the colony was
  redeployed `v2 -> v5-9e6cee1` (`Genome.default()`, byte-identical) on 2026-07-19, gate
  `colony-v5-producer-in-colony` = **PASS**, receipt `docs/receipts/colony_v5_redeploy_2026-07-19.md`. The
  old v2 container no longer runs (image kept on disk, rollback-only); the current colony image itself now
  also serves a real `:4000/producer/health` (404'd on v2) alongside `uni-producer`'s `:4200` (see OVERLOOK
  below). The 6 original v2 minds were captured before the swap and are preserved, NOT restored, in the
  litigation hold — restoring them is a separate, un-taken decision gated behind owner go-ahead + a
  `/lab-team-review` MERGED VERDICT. Kept for its due-diligence trail; do not read it as current chip state.
  (2) `docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md` — **MANDATORY, still active**: the live UNI
  minds are in the container's ephemeral FS; capture them (litigation-hold WORM store) BEFORE any
  redeploy/`podman rm` or they are wasted permanently. See the Gaia section below.
- **The one shared, read-only seam:** the colony world-view is a camera the studio may show, but the
  **colony-scene-on-program** cut + any on-air life/awareness claim stay fenced to the science verdict
  (`forage-pureworld-graduation` PASS; encoded in `infra_registry.json.goLiveGate` + `verify_colony.cjs`). The
  studio agent reads that gate; it never sets it.

**Work the studio the way the colony thinks — an active-inference OODA loop.** The colony's live tick is
`SP.Runtime.Agent` (`lib/sp/runtime/agent.ex`) running `SP.Brain.MC.step/2` (`lib/sp/brain/mc.ex`): **Observe**
the body's sense line → **Orient** by minimising **VFE** `q(s)=softmax(prior+Σγ_m·lnA)` (`infer.ex`) + Hebbian
learn (`learn.ex`) → **Decide** by minimising **EFE** = epistemic `H(qo)−E[H(o|s)]` + pragmatic `qo·C` + gated
novelty `W` over a depth-5 plan (`efe.ex`, `plan.ex`) → **Act** out the Port. Run the SAME loop over the studio:
- **Observe** — run the GATES, never trust process existence (`verify_overlays.cjs`, `verify_colony.cjs`,
  `/producer/health`, `restream.ps1 -Status`, `tailscale status`, grep for IPs). Measured insight = the sense line.
- **Orient (VFE)** — diff measured state vs the **documented true state**; the gap is the prediction error.
- **Decide (EFE)** — pick the ONE next item that most reduces uncertainty/risk (epistemic = closes a
  NOT-VERIFIED; pragmatic = moves toward `C`: durable, DNS-only, operator-easy, on-air-honest). One cure at a time.
- **Act** — make the change **as code** (never an ephemeral runtime patch), update the **doc** in the same
  breath (DD), record the **gate** (TDD).

**Document-Driven (DD):** a work-item is done only when the code is committed+pushed, the canonical doc/ADR is
TRUE (updated or a correct banner), and its gate row is in `evidence/gates.ndjson` (→ `docs/GATES.md`).
**Test-Driven (TDD):** name the PASS gate before the change; the gate is the test; the full **public** broadcast
sweep is the integration test.

**NO IP LITERALS IN CODE. EVER.** Every host is a `<name>.uni-lab.local` DNS name derived from the single
declared map `viewer/infra_registry.json` via `viewer/fqdn.cjs` (`fqdn(name)`/`url(name)`). Static IPs live ONLY
in that registry + the DNS-bootstrap resolver (`infra.cjs:312`) + the drift-checker's own SSH read
(`infra.cjs:23`). `viewer/hub.html` is the DNS-native reference.

**AND THE CHIP'S LAN ADDRESS IS NOT DECLARABLE AT ALL (binding, burned in 2026-07-16).** The chip's LAN IP is a
DHCP lease on a disposable uplink — it moves (`.122` → `.121` on 2026-07-16). Writing it into the registry
encodes a fact with a shelf life, and the registry cannot notice when it expires: the zone, the NRPT rule and
`infra.cjs`'s bootstrap were all moved, `infra_registry.json` was not, and every consumer reading its declared
`ips[0]` (Door hrefs, HUD links, Gaia's colony collectors, the glass badge ssh pusher, the litigation-hold mind
capture) addressed a dead host while the colony was demonstrably **LIVE**. So:
- Chip services carry **`"lan": "dynamic"`** and declare **stable planes only** (mesh `10.13.13.1` / overlay
  `100.100.188.48`); `ips: []` is an honest value. **Never re-add a chip LAN literal** — that re-arms the trap.
  Registry probes address **names**. The law is restated in-file as `_lan_dynamic_law`.
- **DNS is the authority** (uni-dns on the chip keeps itself current). Node probes use the name directly.
  **`viewer/host_resolve.cjs`** is the ONE seam that resolves a name → live address **with provenance**, and it
  exists solely for consumers that *cannot* use a name: anything a **Chromium engine loads** (operator Chrome,
  OBS CEF) bypasses the OS resolver and error-pages on `.local`. Retire it after the `.local` → `.internal` flip.
- **`drift` vs `tracking`:** for a dynamic-LAN name `resolved != declared` is NORMAL, so `infra.cjs` reports
  **`tracking`**, not `drift`. (All 10 chip rows sat at `drift` for a day and nobody read them — **an alarm that
  is always on is not an alarm.**) Hard `drift` still means a real defect on a static host (`cams` MUST be
  THINKER's `.196` — node2's publish ACL pins that /32).
- **Gate: `node viewer/verify_host_tracking.cjs`** (`chip-address-tracking`, PASS 2026-07-16). It does NOT check
  "is the address .121" — that would rot like the literal it replaced. It **simulates a lease move** (stubbed
  `getaddrinfo`) and fails unless consumers follow it. Receipt: `docs/receipts/chip_address_tracking_2026-07-16.md`.
- **Residual, say it plainly:** the zone file + `apply_nrpt.ps1` still carry the current literal by design (they
  are the bootstrap) and are still **hand-edited on a lease move** until the reconciliation beacon lands (P1,
  `docs/handoffs/ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`). Two bootstrap points, not ~15 consumers.

**Remote-source security (`cams.uni-lab.local:8443`) — RETRACTED, 2026-07-16.** 10 slots.
**HONEST CURRENT STATE:** `publisher.cjs` has **NO PIN gate** and **NO off-LAN approval path** —
verified live via grep for `PIN|UNI_PUBLISH_PIN|Authorization` in `viewer/publisher.cjs`/`pub.html`:
zero hits. The 2026-07-15 sweep found this and asked how to close it; the operator picked "retract
the claim, don't ship one no code enforces." So: the publisher is **unauthenticated, LAN/tailnet
only.** MediaMTX WebRTC (`:8889`) is bound loopback-only in `viewer/mediamtx_local.yml` so the
WHIP is only reachable via the local proxy, not from the LAN. `pub.html` banners that the endpoint
is unauthenticated. The prior "PIN 2077 + off-LAN operator approval" text has been removed from
this file and `docs/WORKING_LOGIC.md`. **Do not re-add** a security claim unless the code enforces
it. GO LIVE stays human-typed (G-PA).

## Gaia — the shared, read-only world-visibility organ (binding, built 2026-07-14)
> Canonical doc: `docs/GAIA.md`. Code: `viewer/gaia/**`. This is a studio-track deliverable but every
> agent/seat reads it — it is the extra **D** in DD/TDD: the living, queryable mirror of the whole system.

**What it is.** Gaia is a persistent, self-sustaining, GET-only HTTP surface (`http://127.0.0.1:8096/gaia` on
THINKER) **and** a read-only MCP (`viewer/gaia/gaia_mcp.cjs`, JSON-RPC 2.0) that projects the running system —
repo/git, the gate ledger, the infra registry, science-source excerpts, studio + colony probes, its own
code+MCP, drift — as **direct signals**, each carrying a full provenance triple (`locator`, `captured_at`,
`sha256`, `byte_len`).

**GAIA LAW (binding, enforced in code by `sig.cjs` + `gaia_lint.cjs`):** Gaia **never** summarizes, scores,
ranks, narrates, or authors a verdict. A source's own computed value (a gate's `PASS/PARTIAL/...`, an
infra-drift state) carried **verbatim** with the source as locator is a *projection*; anything Gaia itself
derives is a *build defect*. She is **read-only over everything, especially science** — she never edits
`lib/sp/**`, never sets or judges a gate verdict. Her own gate, `node viewer/gaia/verify_gaia.cjs`, must stay
green (currently 11 PASS / 0 FAIL / 0 SKIP) or no green claim about her is permitted.

**Self-sustaining lifecycle.** `viewer/gaia/gaia_watchdog.ps1` supervises both the server and the mind-capture
loop (crash-restart PROVEN); boot-persistence is a per-user Startup `.vbs` (`gaia_boot_install.ps1` —
agent-installed, reversible, touches no key/no go-live/nothing on the chip). The reboot leg is **PROVEN** as of
2026-07-14 (`gaia_boot_proof.ps1` exit 0 on a real power-cycle; gate `gaia-boot-persistent` = PASS).

**Litigation hold (binding — read this before any colony redeploy).** `viewer/gaia/evidence_hold.cjs` is a
WORM, content-addressed, hash-chained chain-of-custody store for the UNI minds (the colony's brain `.bin`
files, which live in the container's **ephemeral** FS and are destroyed by any `podman rm`). **Before ANY
colony redeploy or container mutation, run the mandatory procedure in
`docs/handoffs/GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`** — capture in `anchor` mode, commit+push, confirm
`node viewer/gaia/evidence_hold.cjs verify` prints PASS. Gaia cannot enforce this herself (it would break her
read-only law); it is the science/OS-mind agent's responsibility every time.

## The Door + studio lifecycle (binding — built/hardened 2026-07-14; canonical: `docs/STUDIO_SYSTEMS.md`, `docs/DOOR_LIFECYCLE_SEQUENCES.md`)
> The operator's ONE entry to the whole studio. Live at `http://127.0.0.1:8090/door` (served by
> `viewer/launcher.cjs`); a self-resurrecting desktop/taskbar icon (`viewer/door_open.vbs`) opens it from
> fully cold. Independent of the studio stack like Gaia — it triages a DEAD studio.

**The pieces.** `viewer/door.html` (the door + living-map SVG + journey UI) · `viewer/door_lifecycle.cjs`
(THE CIRCLE — 14-door state machine: open/closed × locked/unlocked, the four vectors per door, `circle_ok`
invariant, append-only audit ledger, ONE KEY open-all/close-all) · `viewer/door_journey.cjs` (THE JOURNEY —
a reboot-surviving vector plan persisted to `viewer/runtime/door_journey.json`) · `door_watchdog.ps1` +
`door_boot_install.ps1` + `door_boot_proof.ps1` + `door_open.ps1`/`.vbs` + `door_boot_open.ps1` (crash-restart
+ Startup boot leg + autonomous reboot arbiter + one-click cold resurrection + auto-open on logon). Gaia
projects `studio.doors.register` + `studio.doors.journey` verbatim.

**BINDING LAWS (each burned in by a real incident — do not relearn the hard way):**
1. **Reads never actuate.** A polled endpoint (`/api/door/state`, `/api/door/journey`, health) is a PURE
   observer — it must NEVER spawn a process or open the studio. (A verify step that auto-triggered ONE KEY
   inside a 3s poll caused an OBS/window spawn storm on 2026-07-14.) Opening the studio is ALWAYS a deliberate
   operator click (the ONE KEY button) or an explicit verb.
2. **One bring-up at a time.** `studio_up.ps1` self-guards with the OS named mutex `UNI_STUDIO_UP`; any extra
   invocation exits in <1s having started NOTHING. `-Stop`/`-Status` are never blocked. Drill: `-MutexProbe`.
3. **OBS operating rules (the chronic-safe-mode root cause, proven 2026-07-14):** the OBS INSTALL is fine.
   The "crash detected / Safe Mode / Failed to find locale" saga was self-inflicted: (a) force-kills leave
   orphan `%APPDATA%\obs-studio\.sentinel\run_<uuid>` files → next start declares a crash → Safe Mode skips
   `obs-websocket` → `:4455` never binds; (b) launching OBS via `cmd /c start` sets the WRONG working dir →
   OBS can't resolve `..\..\data\obs-studio\locale`. So: **OBS is launched ONLY by `studio_up.ps1`** (correct
   `-WorkingDirectory`), it removes the WHOLE `.sentinel` dir on every start (self-heals a force-killed OBS),
   and OBS is **NEVER force-killed** — graceful close only (`studio_up.ps1 -Stop` = systray-stopped-first →
   `/shutdown` verbs → OBS `WM_CLOSE`). Never hand-launch, never `Stop-Process -Force` OBS. Receipts:
   `docs/receipts/obs_start_root_cause_2026-07-14.md`, `stability_audit_2026-07-14.md`.
4. **Command-center window dedup:** `studio_up.ps1` opens the cc Chrome window only if none exists on its
   `chrome-profiles\command` profile (no window flood on re-runs).
5. **NEVER PRIVATE (owner directive, 2026-07-14).** The broadcast test runs THE ONE LIVE PATH only — OBS →
   local MediaMTX `:1935/uni` → the operator's fan-out → the world. `b.private` is ignored; the PRIVATE UI is
   gone; stage 4 MEASURES public egress (`readers ≥ 1`) and FAILS honestly without it. Public air is the only
   acceptance. Go-live keys + `FAN-OUT ON` + the outward cut stay the operator's (G-PA); the agent never holds
   keys or types the confirm.

**OVERLOOK = THE UNI PRODUCER'S VIEW — restored 2026-07-15 (gate `producer-camera-attached` = PASS, class A).**
The OBS `OVERLOOK` scene / `cap_overlook` source points at `http://<colony>:4200/stream` — the surface of
**the UNI PRODUCER**, a UNIQUE UNI that flies the camera and reports the show (distinct from the world UNIs).
That page is served by `uni-producer`, a fenced observe-only HEAD show-runner container on the chip
(`docs/specs/producer_remote_sense_observe_only.md`): it senses the LIVING colony over read-only rpc
(`Board.all/0`), narrates, and drives the `:3020` world camera via its own `director.js` Port — narration and
picture are ONE mind. Its health is `GET :4200/producer/health` (`driver=producer`, seam-joined
`colony_count`); `verify_colony.cjs`, the launcher `phx` probe, and the Door's `producer` door all read
`:4200` now. **UPDATE 2026-07-19:** the full redeploy the previous paragraph called owner-withdrawn DID
land (`docs/handoffs/SCIENCE_AGENT_COLONY_BRAIN_HANDOFF_2026-07-13.md` is now RESOLVED, see the HANDOFFS
list above) — the old v2 container was removed (`podman rm`), not merely superseded; it no longer runs
anywhere (v2's image stays on disk for rollback only). The current colony image (`v5-9e6cee1`,
`Genome.default()`) carries the Producer/Director layer compiled in, so its own `:4000/producer/health`
now serves real cinematography too (it 404'd on v2). `uni-producer` on `:4200` remains the primary,
Board-side-fenced production camera surface and is unaffected — the two are no longer a
working/broken pair, just two live surfaces, `:4200` still the one every consumer reads. Gate
`colony-v5-producer-in-colony` = PASS, receipt `docs/receipts/colony_v5_redeploy_2026-07-19.md`. The pre-air
check is `driver=producer` from `:4200`, never process existence. Verdict receipt:
`docs/receipts/producer_camera_attached_verdict_2026-07-15.md`.

**Boot gates: BOTH PROVEN 2026-07-14** on a real power-cycle — `door-boot-persistent` + `gaia-boot-persistent`
= PASS (`door_boot_proof.ps1` / `gaia_boot_proof.ps1` exit 0). Storm breakers = gate `door-storm-breakers`
(PASS, Class A). The Journey plan (persisted, reboot-surviving): graceful close → reboot → verify+ONE-KEY →
broadcast test (on air) → off air → reboot → verify → go live → 4-hour run of show → off air.

**THE HUD — third independent surface, NATIVE .NET architecture (built 2026-07-14,
rewritten to native same day; canonical: `docs/HUD.md`, `production/docs/adr/ADR-PROD-015`).**
Two separate binaries, not a browser page — **there is no HTML anywhere in the HUD**:
- **`UNI.Hud.Service`** (`viewer/hud/native/UNI.Hud.Service/`) — a real Windows Service
  via `Microsoft.Extensions.Hosting.WindowsServices` (genuine `ServiceBase`, **no NSSM,
  no wrapper**). JSON-only HTTP API on `127.0.0.1:8100` (**loopback-only**, not LAN-visible
  — the old `hud.uni-lab.local` LAN claim was never true for this bind and has been
  retired). Registered via `sc.exe create` directly
  (`viewer/hud/native/_swap_service_elevated.ps1`), runs as **`NT AUTHORITY\NetworkService`**
  (least privilege — genuinely running, not a rollback). The first attempt failed
  (`HttpListener` returned `Access denied` on `StartService`) because HTTP.SYS requires an
  explicit URL ACL reservation for any non-admin account, even a loopback prefix; fixed
  2026-07-14 via `netsh http add urlacl` for both listener prefixes plus a repo-root ACL
  grant (`viewer/hud/native/_urlacl_and_networkservice_elevated.ps1`), live-verified
  (`StartName: NT AUTHORITY\NetworkService`, `State: Running`, health check `ok:true`).
  SCM's own
  `sc.exe failure` recovery (`restart/5000` x3, resets after 24h) is the entire crash-restart
  story — **no watchdog process supervises the service**.
- **`UNI.Hud.Widget`** (`viewer/hud/native/UNI.Hud.Widget/`) — the actual visible glance
  surface: a WPF app, always-on-top, borderless, **docks to a screen edge** (default: right;
  not a fullscreen page), tray-icon minimizable, `Ctrl+Shift+H` global-hotkey toggle,
  single-instance guarded (named mutex `UNI-HUD-Widget`). Polls the service's JSON API every
  3s (same shared bus as Door/Gaia/Launcher). Boot-persistence leg (**rebuilt 2026-07-18 — no
  script**): a SECOND compiled Windows service, **`UNI-HUD-WidgetLauncher`**
  (`viewer/hud/native/UNI.Hud.WidgetLauncher/`, LocalSystem, `start=auto`), registers a native
  Windows Scheduled Task `UNI\HUD Widget` (interactive-token, no stored password, at-logon +
  restart-on-failure) and, on a 5s tick, triggers it (`task.Run()`) whenever the widget is absent
  in the active console session — so the **Windows Task Scheduler service** performs the
  session-correct spawn. **Session 0 isolation** forbids a service from drawing UI itself, and the
  earlier hand-rolled `CreateProcessAsUser` path died with `0xC0000142` (window-station/desktop
  DACL) — delegating to Task Scheduler is what removes that fragility. The per-user Startup `.vbs`
  is **RETIRED** (`hud_widget_boot_install.ps1` refuses to run). Receipt:
  `docs/receipts/hud_widget_launcher_taskscheduler_2026-07-18.md`.
- **FIRST-OF-ITS-KIND in the repo:** (a) a genuine `ServiceBase`-implementing Windows
  Service with no wrapper binary; (b) a native WPF desktop app. Both binaries are
  **self-contained `dotnet publish` output** (net10.0/net10.0-windows, win-x64) and are
  **code-signed** with a local self-signed cert (`viewer/hud/native/_cert_and_sign_elevated.ps1`
  → installed to `LocalMachine\Root`; this is local trust, not a CA-issued production cert —
  say so plainly, never call it more than it is).
- **Supervision (all compiled/native, no script in the boot or run path):** backend `UNI-HUD`
  service = SCM auto-restart (`sc.exe failure`); widget = the `UNI-HUD-WidgetLauncher` service
  (fast active leg, re-triggers the task within 5s) + the `UNI\HUD Widget` Scheduled Task's own
  at-logon trigger and restart-on-failure (OS-native fallback, works even if the launcher service
  is down); manual cold-open = `viewer/hud/native/hud_widget_open.vbs` (desktop icon only, never
  copied to Startup). Reboot-survival proof: `viewer/hud/native/hud_native_boot_proof.ps1` (5-clause
  AND: native ImagePath registered, a real reboot post-dates the current native-config marker,
  service Running + port answers, the JSON envelope confirms the native instrument string — not a
  stale/legacy process — and clause 5 = the launcher service is Running **and** the `UNI\HUD Widget`
  task exists with an at-logon trigger + widget action). Gates: `hud-widget-launcher-supervises` =
  PASS (live respawn ≤5s); `hud-boot-persistent` = PENDING (auto-confirms on the next real
  power-cycle — the launcher was installed after the last boot).
- **RETIRED, do not run:** `viewer/hud/hud_service_install.ps1` (the old NSSM/Node installer
  — now refuses to run without an explicit override flag, since running it would tear down
  the working native service). `viewer/hud/hud_boot_proof.ps1` (checked artifacts specific to
  the retired watchdog architecture and can never PASS for the native install — use
  `hud_native_boot_proof.ps1` instead). The Node helper library under `viewer/hud/*.cjs`
  (`fqdn.cjs`, `hud_ring.cjs`, etc.) is untouched and `viewer/hud/fqdn.cjs` remains the
  reference implementation retiring the old missing-fqdn.cjs footgun — only the HTTP
  server (`hud_server.cjs`) and its page (`hud.html`) were replaced.
- Audience feed is ENDPOINT-ONLY staging (`POST /api/hud/audience/publish`, sanitizer-vouched,
  loopback + `x-uni-cc:1`) — receiver + widget panel + stub-mode; scrapers land later.
  `POST /api/hud/sight/push` is the two-tier DESIGN for service-context blindness: the
  `NetworkService` service cannot see some paths in the operator's user profile (Windows
  enforces a per-user visibility fence on some app-created dirs even with FullControl ACLs —
  confirmed live for the OBS crash-sentinel dir), so a user-mode helper
  (`viewer/hud/hud_user_sight.ps1`, runs in the operator's own logon session, **never
  the service, never a stored password**) gathers those and POSTs findings back. Full CORS
  is intentionally absent (a wildcard `Access-Control-Allow-Origin` previously let any web
  page read this service's JSON through the operator's own browser — removed; the only real
  client is the native widget, not a browser).
  **⚠️ NOT TRUE TODAY, say it plainly (corrected 2026-07-17 by the 88-agent HUD sweep):** two
  claims above were false. (a) The path was written `viewer/hud/native/hud_user_sight.ps1`; the
  file lives at **`viewer/hud/hud_user_sight.ps1`**. (b) The helper does **NOT** currently feed
  the service: it has been dead since `2026-07-14T16:54:22 push failed: (400)`, **nothing
  launches it** (no invoker anywhere in `viewer/hud/native/**`, no Startup entry), and its only
  two callers — `hud_boot_install.ps1` / `hud_service_install.ps1` — are RETIRED per this file.
  So `UserSightLastPushAt` is permanently null and the widget's `SIGHT — 0 findings · resonant`
  gets GREENER as its sensor stays dead (a stale helper contributes an empty list, lowering the
  total). The receiver + the fence are real and shipped; the SIGHT LEG IS BLIND. Do not read a
  green SIGHT panel as evidence of anything until a launcher lands.

## The architecture (binding — three roles on three boxes; NEVER conflate them; `docs/STUDIO_SYSTEMS.md` is canonical)
> **⚠️ CORRECTED 2026-07-12 (owner-set). TWO corrections, both binding:**
> **(A)** the render + mixer + encoder is **native Windows OBS on a real GPU box**, NOT headless OBS on a
> GPU-less Linux node — headless OBS there software-renders the CEF browser-source overlays to a **black
> frame** (a public black-frame push, three days of failure). See
> [ADR-PROD-011](production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md) +
> [ADR-PROD-012](production/docs/adr/ADR-PROD-012-encoder-placement-policy.md).
> **(B)** the **COLONY** (world + brain + bodies) **ALWAYS runs on UNI-LAB, rootless, "on the chip" — NEVER
> on the studio box.** Moving the colony source onto THINKER was the *wrong* half of correction (A): the
> colony needs no GPU. This **supersedes the "colony source on THINKER" wording in the older studio docs**;
> ADR-PROD-011 is *silent* on colony placement — it governs render/mixer/encoder placement only, and is
> correct on that. The GPU/OBS half of ADR-011/012 stands; ADR-PROD-013 (**Accepted 2026-07-12**) splits
> "render/encode host" (GPU box) from "colony host" (the chip), and ADR-PROD-014 (Accepted 2026-07-13) allows
> the fan-out relay co-located on THINKER.

Every operator/agent failure this project has had came from conflating these roles. Own your box, name it.

- **UNI-LAB `10.190.245.122` — the CHIP = UNI-OS. THE colony host, ALWAYS (non-negotiable).** The colony —
  Minecraft world `:25565` + RCON `:25575`, the Phoenix/SP.Producer FEP brain (`--sname uni`, `:4000` +
  `:4000/stream`, `UNI_AUTOSTART=1` supervised Colony+Director+Producer + populator), the `body.js` UNI
  bots, RCON — runs here **ROOTLESS under user `uni`**, in Podman on `uni-colony-net` (`mc-server` +
  `uni-colony` containers, `MC_HOST=mc-server`, seed 8675309). This is where the forage RED already runs it.
  **UNI lives on the chip.** The SAME box (`10.190.245.122`) is ALSO the **rootful ERP appliance**
  (SolutionWright/Odoo, Jitsi, mail, lab-os, the uni-lab MCP). So "L1 = ERP appliance, **ZERO broadcast
  surface, ever**" (ADR-PROD-003 core, ADR-PROD-012) governs the **broadcast/render/encode surface ONLY**:
  the rootless UNI colony **DOES** run here; a render / mixer / encoder **NEVER** does.
- **THINKER `10.190.245.196` (or ANY GPU box, Mac or Windows) — the PORTABLE STUDIO ONLY.** Native Windows
  **OBS** (renders/mixes/encodes on the T1000), `viewer\command_center.cjs` (`:8098`, operator console),
  `viewer\overlay_server.cjs` (`:8099`, 2D-canvas overlays), `viewer\publisher.cjs` (`:8443` HTTPS + `:8095`
  registrations, ONE-URL camera gateway), local MediaMTX (`:1935`/`:8554`/`:8889`/`:9997`),
  `viewer\launcher.cjs` (`:8090`, Mission Control / the ONE-SCREEN entry), `viewer\systray_watchdog.ps1`.
  It **CAPTURES the UNI-LAB colony over the LAN** (world-view camera pointed at `mc-server@10.190.245.122`;
  overlays pulled from the lab `:4000/stream`) and **NEVER hosts a local Minecraft/Phoenix colony**. It needs
  no UNI-OS. "Production hub for now" but fully portable — pick it up, run it on any GPU device, point it at
  the chip.
- **node2 `uni-lab-79740c` (WireGuard mesh `10.13.13.3`, LAN `10.190.245.149`) — a fan-out RELAY target.**
  One container, `uni-bcast-relay` (MediaMTX): it accepts THINKER's single encode on
  `rtmp://10.190.245.149:1935/uni/program` (publish authorized ONLY from THINKER `10.190.245.196/32`) and
  `runOnReady`-tees it to YouTube + Twitch. Keys live in `/etc/uni/runtime.env` on node2 — never git, never
  held by an agent. The former `uni-bcast-mixer` / `-overlays` / `-pubgate` / `/opt/uni/production/*` are
  **RETIRED** (removed under the P1 remediation). Proof of record: `production/docs/DEPLOYED_STATE.md`.
  **NEW (ADR-PROD-014, 2026-07-13):** node2 proved chronically unreachable (drops both LAN + mesh mid-run),
  so the relay is **no longer node2-only**. The lightweight `ffmpeg -c copy` fan-out MAY run **co-located on
  THINKER** via `viewer/restream.ps1` (local MediaMTX `:1935/uni` → one `ffmpeg -c copy` loop per platform →
  YouTube+Twitch) — ADR-compliant because THINKER is non-ERP. It still must **NEVER** run on the chip
  (`uni-lab`, the ERP appliance). node2 stays a valid target when reachable; THINKER-local is the reliable
  fallback/primary. Proof gate is the same shape: `restream.ps1 -Status` → `path=uni ready=True readers=2`
  + `ffmpeg pushers alive: N (stable)`.

**Data flow:** UNI-LAB colony (MC + brain + bodies, on the chip) → THINKER captures world-view (camera →
`mc-server@10.190.245.122`) + overlays (`:4000/stream`) over the LAN → **OBS renders/mixes on the T1000** →
ONE H264/AAC encode → `rtmp://10.190.245.149:1935/uni/program` on node2 → node2 `runOnReady` tee → YouTube +
Twitch. Single-encode → copy fan-out (ADR-PROD-008). THINKER is the only IP authorized to publish `uni/program`.

**Camera-capture mechanism (open implementation decision — ADR-PROD-013, do not silently pick):** either the
world-view camera bot runs on the lab with the brain (lab publishes `:3020`, THINKER's Chrome + OBS capture it
over the LAN, keeping Producer-driven cinematography) OR a standalone capture client runs on THINKER pointed at
`mc-server@10.190.245.122` (loses brain-driven shot grammar unless its control channel crosses the LAN).
Surface this choice; don't hand-wave it. The `MC_HOST` env plumbing in `body.js` / `director.js` already supports both.

**Current status (do not re-derive; verify before claiming — last checked 2026-07-13):**
- The colony's canonical home is **UNI-LAB, rootless, on the chip** — that is where the forage RED runs it and
  where it must live.
- **CLOSED 2026-07-12 in `cea1cd3` (ADR-PROD-013):** the former KNOWN DIVERGENCE — `viewer\studio_up.ps1`
  launching a local Minecraft + local Phoenix colony ON THINKER against loopback — is fixed. Default behavior
  (no `-HostColony` flag) now LAN-captures the chip colony (`10.190.245.122:4000`) and warns if unreachable;
  the local-spawn code path still exists in the file but only runs behind the explicit, labeled
  non-canonical `-HostColony` legacy/dev escape hatch. Do not pass `-HostColony` for production bring-up.
- **node2 reachability (checked 2026-07-13 via the uni-lab MCP over the mesh):** node2 (`uni-lab-79740c`,
  mesh `10.13.13.3`, LAN `relay.uni-lab.local`) answers `lab_health` and `podman_ps` — it is UP. The
  `uni-bcast-relay` container was NOT running at that check (podman_ps showed only the SolutionWright ERP
  containers + `uni-dns` + `aion-proxy` on that box) — confirm/restart before depending on it. Public GO LIVE
  is blocked on `uni-bcast-relay` being up and accepting THINKER's publish (the 3-signal LIVE gate), not on
  node2 itself being reachable.
- Colony life claims gate on `colony_count == RCON list − Director` (a `colony_count:0` producer reporting
  `LIVE` is an EMPTY colony — say so). Nothing broadcasts publicly until the 3-signal LIVE gate passes with
  node2 up.

## Method of work (binding)
1. **Never claim from process existence.** A running process, an open port, an `exit 0` launcher — none of
   these is a claim. Back every operational claim with its machine gate, or say **"NOT VERIFIED"**:
   - **overlays-up** ⇒ `node viewer\verify_overlays.cjs` exit 0 + the `overlay_proof.png` screenshot.
   - **platform-up (node2)** ⇒ `production/verify_p1_v2.sh` ALL PASS (Producer's D-C1 landing 2026-07-12
     — corrected relay-only P1 gate; replaces `production/verify_p1.sh` which still checks the RETIRED
     `uni-bcast-mixer`/`-overlays` surfaces and must NOT be treated as authoritative for the current
     relay-only node2).
   - **colony-of-N** ⇒ `node viewer\verify_colony.cjs 10.190.245.122` PASS: `/producer/health .colony_count`
     **equals** RCON `list` players **minus** Director. It proves count-consistency, NOT survival/life.
   - **LIVE** ⇒ a fresh `/producer/health` probe YOU ran (`verdict=LIVE, driver=producer` — the real
     `SP.Brain.Director.driver()`, not PID existence; a Director still in `:self` is a headless puppet ⇒
     PARTIAL) + the colony rule.
   - **go-live** (`golive CONFIRM` / `start_broadcast`) is **HUMAN-typed, always** (gate G-PA). No agent
     self-approves it, widens its own `UNI_APPROVALS_AUTOAPPROVE`, or holds a stream key.
2. **Shipping `production/`** goes via **`git archive` of an immutable, pushed ref** — never the working tree.
   `/.gitattributes` enforces `production/** eol=lf` (index renormalized) so the CRLF-corruption class is
   structurally dead. Before shipping, commit + push + tag; ship from the tag's index bytes, sha-verified on
   the node (see DEPLOYED_STATE.md "the lock").
3. **Node mutations are approval-gated through the uni-lab MCP.** Every mutating `os_*` / `podman_*` /
   `lab_*` call pauses for exactly ONE human approve/deny in the fleet approval queue. Reads run at once. Add
   `limb=<id>` to drive a peer over the mesh; a cross-box mutation gates once on the router box. Stream keys
   live ONLY in the operator shell env / `/etc/uni/runtime.env` on the node — never git, never held by an
   agent.
4. **Multi-agent coordination.** Multiple agents share this ONE repo checkout and ONE fleet approval queue.
   - **Exactly ONE `--sname uni` Phoenix node exists, ever — and it lives on the chip (UNI-LAB).** THINKER
     must NOT start a competing Phoenix colony (`studio_up.ps1`'s default path no longer does this since
     `cea1cd3` — do not pass `-HostColony`, the non-canonical legacy escape hatch that still can). Do not start a second node;
     do not launch a competing bring-up while another agent's is in flight. One writer of the `broadcast.json`
     spool: the in-app supervised `SP.Show.OverlayPublisher`. `runs/broadcast_bridge.exs` is **RETIRED** — do
     not spawn it (it would be a second, competing writer).
   - **Own your surface.** The colony host (UNI-LAB, on the chip), the portable studio (THINKER / any GPU box),
     and the relay (node2) are different roles with different owners; state which you are touching. Do not act
     on another agent's half without hand-off.
   - **Pass proof between agents, not prose.** Hand off the gate output (exit code + screenshot + `.bin` +
     probe log + commit hash), not "it's up". The receiving agent trusts the gate, not the sentence.

## Heavy science-gate discipline (binding)
1. **The claim fence.** Operational behavioural / organisational measures are **necessary-not-sufficient
   substrates with ZERO evidential weight** for awareness / consciousness / life on their own. Passing a gate
   demonstrates the named behaviour, **never experience**. Do not surface gland/precision/store floats as
   "felt" states. Keep the warranted claims and the over-claims visibly separated — that separation is the
   product.
2. **The FOOD-HACK LESSON (never repeat it).** A colony was once made "stable" by force-feeding UNIs via RCON
   gives (1300+ hoarded items each) — **fake life**. That give was removed and the survival claim WITHDRAWN.
   **Viability behaviours like foraging MUST EMERGE from the generative model via Expected Free Energy** — no
   goal-coding, no reward, no gives, no props. If survival depends on a hack, it is not life; say so and pull
   the claim.
3. **One cure at a time.** Never stack changes such that you cannot attribute the winning outcome. A second
   cure does not deploy until the prior has a recorded verdict (PASS / PARTIAL / FAIL / WITHHELD). If a second
   variable entered the comparison, the result is voided — re-run cleanly.
4. **Pre-registered RED gates.** Every cure registers its gates (named PASS condition + FALSIFIES condition)
   in the docs *before* the run. A run is judged only against its registered gates. Honest verdicts only,
   never percent-scored, never spun.
5. **MERGED VERDICT before any FE-touching merge or live RED deploy.** Run `/lab-team-review`; no FE code
   merges and no live RED deploys without a MERGED VERDICT of SIGN or SIGN-WITH-CHANGES plus the three
   required artifacts (typed spec, paired RED, ship-gate checklist).

### Current honest science state (binding — say it exactly this way, do not overclaim)
- **Emergent foraging LOOP closed live — WITH a developmental `metab_scale` runway.** Deep-body UNIs survive
  a full soak at full energy by their own hunting (prey → kill → collect → eat → stay-fed, world-earned,
  **zero gives**) at `metab_scale 0.2`. This is **DEVELOPMENT (womb/wean), NOT graduation.**
- ❌ **PURE-WORLD self-sufficiency (scale 1.0, no runway) is NOT yet proven** — the open gate (task #25).
- The **hunt-MOTOR fix** (`body.js doAttack` kill-conversion, `ff57a5a`) was the **binding constraint** and is
  the real driver of survival — not a policy/FE change.
- The **honest-consummation FE cure** (`consummation_honest`, coupled eat-B) is **offline-proven** (suite
  green, gated, default-genome **byte-identical**) but its **LIVE necessity is marginal/unproven** — run-1's
  attack-share result did NOT replicate in run-2. Claim the offline mechanism; do not claim a live benefit.
- The streamed lineage `Genome.homeostat_colony/0` is offline-green but **NOT RED-validated live**; it ships
  unproven **only** per explicit owner go-ahead. The forage/honest/nursery lineages are **separate genome
  constructors** so the streamed genome stays byte-identical until a RED verdict + owner go-ahead flips it.
- Honesty correction owed plainly: the L2 is a **control/preference hierarchy** (situation observed up,
  C-override down), NOT a predictive-coding errors-up/predictions-down stack; the "hyper-prior" is a
  large-magnitude interoceptive **C**, not an elevated precision.
- Receipts: `docs/receipts/forage_red_preregistration.md`, `forage_honest_consummation_RED.md`,
  `emergent_forage_cure1.md`. (Evidence lives lab-side at `~uni/.claude-evidence/forage_red/*`.)

## Professional broadcast criteria (binding — what makes this a durable SYSTEM, not a stream)
- **Supervised + boot-persistent.** Every broadcast component is a systemd-quadlet / host service with
  `Restart=` and `[Install] WantedBy=…` (bounded `StartLimitBurst`, no crash-loop spam), or a supervised
  tray/watchdog service on the studio box, so it auto-starts at boot and survives crashes. Proven surviving a
  reboot onto canonical bytes.
- **Single-encode → copy fan-out.** ONE encoder produces the program; the relay COPIES that stream to each
  destination (YouTube/Twitch/…). Never pile multiple sources into the encoder, and never re-encode per
  destination — that is how you starve the box.
- **Set-once vision mixer.** The **native Windows OBS** mixer's scenes are built once (Phase G2) and driven by
  verbs, not hand-fiddled live. Overlays are honest **2D-canvas** lower-thirds/ticker/caption/on-air layers
  composited INTO the program scene as browser-sources — "overlay server running" ≠ "overlays on the program"
  (verify with the overlay gate). Headless OBS on a GPU-less node renders these to a black frame — never mix
  there.
- **Human-typed go-live + private smoke first.** Go-live is human-typed (G-PA). Before ANY public cut, run a
  PRIVATE unlisted smoke test with the operator-held key. Stream keys live only in the operator shell env /
  `/etc/uni/runtime.env`, never git, never held by an agent.
- **The encoder floor (GAP G-ENC).** The encoder runs on the **GPU render box** (THINKER, NVIDIA T1000). The
  honest floor is **720p30** (x264 `faster` or NVENC h264) — do not claim higher without proving it
  end-to-end on the hardware.
- **The mission.** Worldwide, multilingual, professional broadcast quality (CNN/BBC/PBS bar), engineered to
  run a 7-day schedule. A durable SYSTEM: supervision, fail-over thinking, standby content, moderation, and
  observability are first-class, not afterthoughts.

## Hard invariants (never violate — these are the math fence; guards in `test/sp/brain/*`)
1. **No Nx, Rust, NIF, GPU, backprop, RL, TD, reward-on-policy.** Categorical per-factor generative
   model: A (likelihood) / B (transition-per-action) / C (preferences) / D (prior) / E (habit prior).
   Action by Expected Free Energy = epistemic `H(qo) − E[H(o|s)]` + pragmatic `qo·C`. Hebbian Dirichlet
   learning. `q(s) = softmax(prior + Σγ_m·lnA)`. (Kernels are plain lists — byte-comparable to the NumPy
   oracle; the `(ln B)·s ≠ ln(B·s)` convention is bound-critical.)
2. **Additive + GATED.** Every extension behind an opt-in genome organ/field absent from `default/0`;
   graded-on coupling default 0.0; **default genome byte-identical** (mad < 1e-12 over the live depth-5
   `Plan` path). Guard: `test/sp/brain/decider_byte_identity_test.exs` (frozen golden).
3. **No scalar-per-action term** in policy logits — plan/policy value depends on predicted OUTCOMES via `B^u`
   only, never action identity or a per-action scalar. Guarded by the **action-clone-invariance test**.
4. **Monotonic decay** of any information term: `W → 0` as Dirichlet counts → ∞, independent of C. The
   no-smuggled-reward proof (novelty counts floored at the prior pseudocount). Guard: `novelty_test.exs`.

Every accepted FE term must be one of: pragmatic `qo·C`, state-epistemic `H(qo)−E[H(o|s)]`, parameter-novelty
`W`, or a precision (`γ`/`γ_m`/`η`). Nothing else enters the logits.

## The Lab Protocol (binding — `docs/LAB_PROTOCOL.md`)
The full protocol lives there; the headline rules:
- **First rule:** never stack changes such that you cannot account for the winning outcome. **One cure
  at a time.** A second cure is not deployed until the prior has a recorded verdict (PASS / PARTIAL /
  FAIL / WITHHELD).
- **Pre-registered RED gates** (PASS condition + FALSIFIES condition) live in the doc *before* the run.
- **Evidence collection is continuous, lab-side or harness-managed**, never inside the LLM session
  (collectors must survive context compaction).
- **Independent confirmation**: behavioural via RCON (server's authoritative view), mechanism via brain
  probes against the live registry.
- **Claim fence (binding):** operational behavioural / organisational measures are
  necessary-not-sufficient substrates with ZERO evidential weight for awareness / consciousness / life
  on their own. Passing a gate demonstrates the named behaviour, never experience.
- **Live-stream guard:** owner go-ahead required before any new lineage deploys to the public-streamed
  colony. New lineages run in separate containers with distinct kin + memory dirs (`UNI_AUTOSTART=0`).

## The Lab Team — adversarial review personas (`docs/lab_team/`)
Five UNI-GPT-signed persona Claude skills (in `~/.claude/skills/lab-team-<role>/SKILL.md`) that load as
system prompts to shift the LLM's predictions into the specialist's domain:
1. **`/lab-team-math-breaker`** — REJECT by default; falsifies the math (8-check gauntlet).
2. **`/lab-team-aif-theorist`** — names the generative model; merges verdicts.
3. **`/lab-team-architect`** — pure-Elixir, additive + gated, typed, byte-identical.
4. **`/lab-team-experimentalist`** — paired pre-registered RED with named PASS + FALSIFIES gates.
5. **`/lab-team-embodiment`** — non-saturable organs / drives; refuses preference-hack-as-drive.
6. **`/lab-team-review`** — orchestrator; runs the FULL fork → break → repair → vote → RED protocol
   and emits a single MERGED VERDICT.

**Ship gate:** no FE-touching code merges, no live RED deploys, on anything without a MERGED VERDICT of
SIGN or SIGN-WITH-CHANGES + the three required follow-on artifacts (typed spec, paired RED, ship-gate
checklist). The full team workflow is `/lab-team-review`; the personas are invokable individually.

## How to start a session in this repo
1. Read `docs/SYSTEM_OVERVIEW.md` (whole-system orientation), then this file + `docs/STUDIO_SYSTEMS.md` +
   `docs/UNI_OS_COLONY_MIGRATION.md` (colony-placement) + `docs/LAB_PROTOCOL.md` +
   `docs/UNI_MISSION_DEEPENING.md` + `production/docs/DEPLOYED_STATE.md`.
2. **Establish which box/surface you are touching:** the colony host (UNI-LAB, on the chip), the portable
   studio (THINKER / any GPU box), or the relay (node2). Check state with the GATES, not process listings:
   `verify_overlays.cjs` for overlays, `verify_colony.cjs 10.190.245.122` + RCON `list` for the colony,
   `/producer/health` for the driver, `verify_p1_v2.sh` (relay-only P1 gate) for the relay platform.
3. **Do not claim anything is up/live/proven from a running process.** If you have not run the gate, the
   status is NOT VERIFIED.
4. If a RED test is running, **do not propose Phase N+1 work until the running RED has a verdict.** Honor
   the first rule.
5. For any FE-touching proposal: invoke `/lab-team-review` BEFORE writing code.

## Where to find what
- **Whole-system orientation**: `docs/SYSTEM_OVERVIEW.md` (read first).
- **Canonical studio map** (overrides older studio docs): `docs/STUDIO_SYSTEMS.md`.
- **Canonical colony placement** (colony ON the chip, captured over LAN): `docs/UNI_OS_COLONY_MIGRATION.md`
  (note: the colony runs **rootless** under `uni`, not rootful — trust `ops_colony_lab_rootless.md` on that).
- **Architecture ADRs**: `production/docs/adr/ADR-PROD-011-native-windows-obs-on-render-host.md`,
  `ADR-PROD-012-encoder-placement-policy.md` (render/encode on the GPU box); ADR-PROD-013 (pending — splits
  colony host from render host); ADR-PROD-001/003 carry SUPERSEDED-IN-PART banners.
- **Deployed relay, proof of record**: `production/docs/DEPLOYED_STATE.md` (gate: `production/verify_p1_v2.sh`
  — relay-only P1, Producer's D-C1 landing 2026-07-12; supersedes stale `verify_p1.sh`); design master
  `docs/UNI_PRODUCTION_PLATFORM.md` + `production/docs/adr/ADR-PROD-001..012`.
- **Science-track plan**: `docs/DEEPENING_PLAN.md` (in-repo execution plan with CURRENT STATUS; the
  session-local working copy `~/.claude/plans/prancy-launching-teapot.md` is identical but does not travel
  with the repo). Owned by the **science agent** — the FE engine + gated lineages.
- **Studio-track plan (DD+TDD)**: `docs/STUDIO_HARDENING_DD_TDD_PLAN.md` — the broadcast-studio track:
  persist-to-code, NO-IP DNS conversion, remote-source PIN 2077 + off-LAN approval, Tailscale WAN, the full
  public broadcast test. Working logic: `docs/WORKING_LOGIC.md`. Owned by the **studio agent**; forces no
  FE-engine change and no science gate. Launch a fresh studio agent by pasting
  `docs/STUDIO_AGENT_LAUNCH_PROMPT.md`.
- **Mission + signed UNI-GPT consults + verdicts**: `docs/UNI_MISSION_DEEPENING.md`.
- **Protocol**: `docs/LAB_PROTOCOL.md`. **Persona team**: `docs/lab_team/` (auditable docs) +
  `~/.claude/skills/lab-team-<role>/SKILL.md` (skills — the Skill registry discovers
  `<skills-dir>/<name>/SKILL.md` ONLY; a flat `<name>.md` is silently never registered).
- **FE engine**: `lib/sp/brain/{genome,plan,designer,model,infer,efe,learn,novelty,homeostat,metabolism,
  mc_codec,colony,director,bridge}.ex` + `lib/sp/runtime/*`. **Invariant guards**: `test/sp/brain/
  {decider_byte_identity,action_clone_invariance,novelty,honest_consummation,forage_discovery_gating}_test.exs`.
- **Gates**: `viewer/verify_overlays.cjs`, `viewer/verify_colony.cjs`, `production/verify_p1_v2.sh` (relay-
  only P1, supersedes stale `verify_p1.sh`); health verdict `lib/sp/show.ex` + `lib/sp/brain/director.ex`.
- **The live 5-stage broadcast test**: `POST /api/broadcast_test` on `viewer/command_center.cjs` (`:8098`,
  from THINKER; `GET` same path polls progress; `{"private":true}` is the default — loopback only, no
  public fan-out re-point). `runBroadcastTest()` there (P4, 2026-07-12) is live-proven end-to-end.
  `production/scripts/broadcast_test.py` + its adapters (`production/mcp/adapters/{obs,overlays}.py`) are
  **STALE, pre-correction artifacts** (written ~10h before the P7 architecture correction) — same class of
  retirement as `verify_p1.sh`; do not use or retarget them, each carries its own retirement banner.
  **Gate ledger** (append-only per-gate ledger, `production/schemas/gate_row.schema.json` — its internal
  `$id` reads `gate_row.v1.json`, which is not a real path; corrected 2026-07-14): `evidence/gates.ndjson`
  → `docs/GATES.md` (rendered) → `/infra` gate-ladder panel (live-consumed at `viewer/infra.cjs`).
  **Science receipts**: `docs/receipts/*`.
- **Studio surfaces**: `viewer/launcher.cjs` + `launcher.html` (`:8090` Mission Control),
  `viewer/command_center.cjs` + `.html` (`:8098`), `viewer/publisher.cjs` + `pub.html` (`:8443`/`:8095`),
  `viewer/studio_stage.cjs`, `viewer/studio_up.ps1` (bring-up — LAN-captures the chip colony by default since `cea1cd3`; `-HostColony` is a labeled non-canonical legacy escape hatch, do not use it),
  `viewer/systray_watchdog.ps1`, `viewer/studio_channels.ps1`.
- **Memory** (cross-session): `C:\Users\mpolz\.claude\projects\C--Users-mpolz-Documents-UNI-Minecraft\memory\`
  (corrected 2026-07-14 — this line pointed at the retired `Strings` folder; the repo is `UNI.Minecraft` now).
- **Gaia — the shared world-visibility organ**: `docs/GAIA.md` (canonical) + `viewer/gaia/**`. See the binding
  section below. Live at `http://127.0.0.1:8096/gaia` on THINKER; MCP at `viewer/gaia/gaia_mcp.cjs`.

## Persona prompt-design principles (UNI-GPT-signed, binding on every persona)
1. **Name the math object before the metaphor.** Locate the proposal in A/B/C/D/E/F/G/precision/learning
   FIRST. Block "curiosity," "drive," "awareness" language from hiding an undefined scalar.
2. **Demand the falsifier before the cure.** Every persona states the RED condition that would reject
   the proposal before suggesting fixes.
3. **Force typed artifacts, not prose approval.** Every accepted change outputs a typed model spec +
   validators + paired RED design + short report.
---

## Communication with the operator (binding, added 2026-07-25 at his request)

Michael is the **organic operator**. He works by conversation. Test-summary dumps do not
work for him and are not an acceptable primary channel.

### Speak

Use `mcp__claude-voice__speak` — it is confirmed working (Piper, local, `en_GB-jenny_dioco-medium`
by default) — for **every** one of these:

- opening or closing a phase;
- any finding, and **especially** an adverse result, a falsified prediction, or a retraction;
- when a decision is his to make — speak the question, then stop;
- when work completes, or when it is blocked and needs him.

Keep spoken lines short and human. Say the thing, not the report. The transcript persists at
`http://127.0.0.1:5858` and is rendered live in UNI TRACK.

### Be conversational in text too

Lead with the outcome in the first sentence, in plain language. No wall-of-text status blocks,
no pasted test output, no table as the opening move. Write as if talking to him, because you are.

### Detail belongs in TRACK, not in chat

**UNI TRACK — `http://127.0.0.1:8102/`** (`viewer/track/track_server.cjs` in `UNI.Minecraft`) is the
persistent surface. It carries, read live and never cached: where the work came from, where it is,
where it is going, what is done, what is left, what is predicted next, the calibration, and the exact
next scope. Start it if it is down.

If you catch yourself writing a long status block in chat, that content belongs in TRACK. Put it
there and say the one sentence that matters.

Claude comments on specific items with `POST http://127.0.0.1:8102/api/comment {target,text}` —
append-only to `evidence/track_comments.ndjson`, version-controlled, never edited.

### Never bury an adverse result

A `FAIL`, a retraction, a falsified prediction, a `NOT_CLEARED` — these are **spoken** and said
**first**, never appended at the end where they read as a footnote. An adverse result carried
honestly is the product working.

### Ask, do not assume

When a choice is the operator's — naming, scope, a contract amendment, anything principal-gated —
speak the question and wait. Do not quietly pick and proceed.

### Reinforced 2026-07-25, second time of asking

Michael asked twice. That means the first version was not doing its job, so this is
concrete rather than aspirational.

**The failure mode is not "too long". It is "structured like a report".** A status
block, a table as the opening move, a list of everything done in order of doing it —
these are formats for a reader who is auditing. Michael is not auditing; he is working.
He wants to know what happened, what it means, and what is next, in that order, in
sentences.

Do this:

- **Open with the outcome, in one sentence, in plain words.** If there is an adverse
  result, it IS the opening sentence — not a section further down and never a footnote.
- **Say the thing that changed his picture of the world.** Not the sequence of steps.
  "The ledger violates its own schema in twelve places" is the news. "I ran the
  validator against the canonical ledger" is not.
- **Name the number that matters and drop the rest.** Detail belongs in TRACK, in the
  receipt, and in the commit message — all three of which persist and are searchable.
- **Speak the same thing, shorter.** `mcp__claude-voice__speak` on every finding, every
  phase edge, every adverse result, every question that is his. Spoken lines are shorter
  than written ones and carry no formatting at all.
- **Correct yourself out loud, in the same breath, before acting on it.** If a count was
  wrong, if a recommendation was off, if a write went wrong — say so first, plainly,
  then say what you did about it. A correction carried quietly is worse than the error.

Do not do this:

- open with a table, a heading, or a bullet list;
- narrate the order you did things in;
- append the bad news to the end where it reads as a caveat;
- offer a menu of options when the flow has one next act — recommend, and ask for the
  co-sign;
- paste test output into chat. Say "621 tests, zero failures" and move on.

---

> ## ⟢ RESUME POINT — read this before anything else (marked 2026-07-28)
>
> **We are in PHASE 9 — RETURN TO RESONANCE, mid Stage 4.** This block is **navigation and
> measured state only. It amends no law.** Every law below it stands unchanged.
>
> **If you have no context, read
> `UNI-FLAGELLUM/docs/control-plane/AGENT-CALIBRATION-PROMPT.md` first.** It is
> self-contained and carries every trap that has already caught someone.
>
> - **The plan is not a document.** `UNI.Minecraft/evidence/remediation/phase9_plan.json`
>   is the single source of truth. **UNI TRACK `http://127.0.0.1:8102/` renders it live and
>   Gaia projects it verbatim.** When a step completes, edit that file; the surfaces follow.
>   `viewer/verify_plan_consistency.cjs` now holds it to its own vocabulary — it exists because
>   the plan carried two different next acts at once.
> - **Register:** `UNI-FLAGELLUM/docs/control-plane/phases/PHASE-9-REMEDIATION.md`
> - **Resume detail:** `UNI-FLAGELLUM/docs/control-plane/RESUME.md`
>
> **THE STATE BELOW IS GENERATED, NOT WRITTEN.** Every number between a `BEGIN GENERATED` and its
> `END GENERATED` is produced by `node viewer/generate_state_blocks.cjs` from the artifact it
> describes. **Do not edit inside a block; edit the artifact and regenerate.** This banner used to
> carry these numbers by hand and was measurably wrong in six places on 2026-07-29 — 25 gates in one
> paragraph and 23 in another (both wrong, 28), a ledger of 31 (32), "six" lab gates (seven), and a
> next act that had shipped six hours earlier.
>
> <!-- BEGIN GENERATED uni.state.next_act prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **NEXT ACT: CHECKPOINT-E — the operator's.**
>
> CHECKPOINT E -- the operator's. Two images side by side at http://127.0.0.1:8103/lab/l6. He says whether they differ with NO TEXT READ, and if so whether the reason is that the MATERIAL (truth_class) changed. That is the step's falsifier and it is M8, the operator's eye.
>
> Declared at `stages[id=4].steps[id=4.6]`. Blocked on: M8 -- the operator's eye. No gate can stand in for it, and none is being asked to. Measured 2026-07-29: both images are real and they differ -- GET /api/lab/shot?swap=0 returns 3371 bytes and ?swap=1 returns 3375 bytes, both valid PNG, sha256 6eed6e94... and 0321be29..., embedded side by side at viewer/lab/l6.html:52-53. The surface is ready; the eye is not a gate.
>
> Retired: **L6** (Stage 4 step 4.6 -- build L6, THE GAUNTLET THEN THE CO-SIGN, shipped `6234f3d`).
> <!-- END GENERATED uni.state.next_act -->
>
> <!-- BEGIN GENERATED uni.state.plan_tally prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Plan:** 7 stages · 43 steps (31 DONE · 1 IN_PROGRESS · 1 BLOCKED · 8 PLANNED · 2 OPERATOR) · 7 builds under step 4.6, 7 DONE.
> <!-- END GENERATED uni.state.plan_tally -->
>
> <!-- BEGIN GENERATED uni.state.gates prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Gates:** **36 registered**, of which **33 `ci:true`** and 3 `ci:false` (`colony`, `hud`, `overlays` — listed, never run, never a fabricated pass). **7 lab gates** (`lab-l0`, `lab-l1`, `lab-l2-shot`, `lab-l3`, `lab-l4`, `lab-l5`, `lab-l6`).
>
> Both numbers are stated because both were written before without saying which was which:
> one banner paragraph said 25 and another said 23, and a single file said 23 at one line and
> 25 at another. Neither was the registered count.
> <!-- END GENERATED uni.state.gates -->
>
> <!-- BEGIN GENERATED uni.state.gate_ledger prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Gate ledger** `evidence/gates.ndjson` — `ca8fd61ab5380994...`, **212 rows / 112 unique names**. Last row per name: 94 PASS · 5 PARTIAL · 12 PENDING · 1 FAIL.
>
> The per-name tally is stated as such because the per-ROW tally is a different set of numbers,
> and a count whose derivation is unstated is how a backlog and the history of a backlog came
> to be reported as one word.
> <!-- END GENERATED uni.state.gate_ledger -->
>
> <!-- BEGIN GENERATED uni.state.registry_ledger_gap prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Registry vs. the canonical ledger:** of **36 registered gates, 1 appear in `evidence/gates.ndjson`** and **35 do not** (0 of those carry a glob `gate_row`, which no kebab-case row can ever bear). `gate_row.schema.json` says every gate the project claims MUST be represented there.
>
> **The intersection is NOT empty, and four governing documents said it was.** They declared "EVERY registered gate has ZERO rows" and "the intersection is empty by `id` *and* by `gate_row`" for two weeks after a row landed for one of them on 2026-07-17 — inside the paragraph that says these numbers are generated. It was hand-written. It is not any more.
>
> Authoring the missing rows is **S4 — the operator's**, but the blocker is not his signature: `desk.preRegistration()` reports most of them blocked on an empty `receipt_path` the schema requires, which is a pre-registration document an agent owes him. He could not append them today even if he wanted to.
> <!-- END GENERATED uni.state.registry_ledger_gap -->
>
> <!-- BEGIN GENERATED uni.state.control_plane prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Control-plane ledger:** 32 entries, tip `b90b74980f47b93a...` at seq 32. Anchor declares length 32, head `b90b74980f47b93a...` — **they agree.**
> <!-- END GENERATED uni.state.control_plane -->
>
> <!-- BEGIN GENERATED uni.state.how_to_measure prefix="> " — DO NOT EDIT. node viewer/generate_state_blocks.cjs -->
> **Three things are deliberately NOT stated here, because no committed file can hold them
> honestly.** They are facts about a *run* or about *now*, not about the tree:
>
> | question | the command |
> | --- | --- |
> | Are the trees clean? | `git -C <tree> status -sb` |
> | Does the Elixir suite pass? | `mix test` |
> | Do the gates pass? | `node viewer/gate_runner.cjs` |
>
> This banner used to answer all three. The gate-runner answer was measured at 06:01:09 on
> 2026-07-29 and was false by 06:04:06 — a half-life of 176 seconds — and it was committed
> reading as present tense. Run the commands.
> <!-- END GENERATED uni.state.how_to_measure -->
>
> **Four things that must not be softened:**
> 1. **The off-box witness is COMPROMISED** — node2 accepts the writer's key,
>    `independent_custodians: 0`. The anchor stands on git alone: tamper-evident, **not**
>    unforgeable. **Removing that key is S1 — the one repair an agent must not perform.**
> 2. **Phase 7's witness clause still FAILS.** Its *other* failing clause — "two fixtures
>    distinguishable with no text read" — is **closed**: the renderer exists (`viewer/lab/`, and the
>    lab-gate count is in the generated block above, not restated here), and
>    `verify_shot.cjs --mutate` proves it bites in greyscale. Measured 2026-07-29: both images are
>    real and differ — `/api/lab/shot?swap=0` is 3371 bytes and `?swap=1` is 3375, both valid PNG
>    with different sha256, embedded side by side at `viewer/lab/l6.html:52-53`.
> <!-- @claim archived: the sentence below QUOTES the false declaration it replaces. It said the
>      registry/ledger intersection was EMPTY. It was 1 of 32 from 2026-07-17 and stayed wrong for two
>      weeks. The quote IS the evidence that this list carried a false entry; do not delete it. -->
> 3. **Most registered gates have no row in the canonical ledger — the count is in the generated block
>    above and is NOT restated here.** This entry used to read *"EVERY registered gate has ZERO rows...
>    the intersection is empty by `id` *and* by `gate_row`"* — **false since 2026-07-17**, and it was
>    hand-written inside the banner that says its numbers are generated. `gate_row.schema.json` says
>    every gate the project claims MUST be represented there. Appending is **S4 — the operator's** — but
>    the blocker is NOT his signature: most rows are blocked on an empty `receipt_path` the schema
>    requires, which is a pre-registration document an agent owes him. The desk at `/lab/l5` prints
>    each exact line.
> 4. **The go-live guard is real and refuses all seven paths, and it is `presence_evident`, NOT
>    unforgeable.** F31 has code, a gate and an operator's prover. It binds *this codebase's*
>    paths — **the OBS WebSocket on `:4455` still has no authentication (S2, his) — and it is bound to `::`,
>    ALL INTERFACES, reachable from the LAN *and* the tailnet. Every prior line here said
>    `127.0.0.1:4455`, which was FALSE and understated the exposure (`LIMITATIONS.md`
>    `f31.obs-unauthenticated`, measured 2026-07-29).**
>
> **The road to air runs THROUGH the science:** `colony_on_program` is blocked on
> `forage-pureworld-graduation`, whose runner `runs/pureworld_qa_gate.exs` **still raises
> `@scaffold`**. And **no verdict has yet been authored about a real scientific claim.**
>
> <!-- @claim archived: this paragraph QUOTES the stale declarations it is correcting; the quotes are the evidence and must not be edited away -->
> **Corrected 2026-07-28 (this banner was false in seven places):** it said 42 steps (43), 964
> tests, *"the renderer was never built"*, *"nothing detects running-but-not-the-committed-bytes"*
> (step 1.1 built boot identity on all four bodies), *"the ledger stopped recording at Phase 5"*,
> *"F31 has no code and no test"*, and **"NEXT ACT: Stage 1 step 1.1"** — four stages stale.
>
> **Corrected AGAIN 2026-07-29, and this time the fix is structural.** Within six hours of that
> correction the banner was stale again, in six places: it said 25 registered gates in one paragraph
> and 23 in another (28), a ledger of 31 (32), *"six"* lab gates (seven), `gates.ndjson` unchanged at
> `964ea25c…` (it moved to `1daac912…` when a probe row landed), and **a NEXT ACT of "build L6" six
> hours after L6 shipped at `6234f3d`** — while the plan itself said the next act was Checkpoint E.
> `AGENT-CALIBRATION-PROMPT.md` tells every fresh agent to obey the next act *before verifying
> anything*, so a fresh agent would have rebuilt a finished build. **That is why the numbers above
> are now generated and no longer written.** A hand-written number is a claim with a half-life; these
> had a half-life of six hours, and one of them — a gate-runner tally — had a half-life of 176
> seconds.
>
> <!-- @claim archived: this paragraph QUOTES the stale `NEXT ACT:` declaration it is correcting. The quote IS the evidence that the untracked copy misdirected a fresh agent, and deleting it to satisfy the gate would destroy the only record of the defect. -->
> **Corrected A THIRD TIME 2026-07-30, and the third correction was of the second one's own claim.**
> The paragraph above used to end by saying all three copies of this block were **byte-identical**,
> md5 `003fc92d…`. **They were not, and the structural fix itself is what made them differ.** The
> generated blocks were installed in the two TRACKED copies and not in the third, so for a day the
> count was **6 blocks, 6 blocks and ZERO** — and that third copy, `Documents/UNI-Flagellum/CLAUDE.md`,
> the file an agent starting there reads first, still declared **"NEXT ACT: Stage 4 step 4.6 — build
> L6"** with L6 finished and receipted. The precise failure was in this repository:
> `viewer/state_blocks.cjs` defined an `OUT_OF_TREE` root and exported it, but made it the root of
> **no declared document** — so `verify_claims.cjs`, the gate whose entire reason for existing is a
> stale `NEXT ACT:` declaration, could not see the one document that still carried one. **That blind
> spot also means the 07-29 audit's own count was an undercount:** it reported *five* documents
> carrying the stale declaration, and the true number was six — the sixth being the copy no
> instrument could reach. All three copies now carry all six blocks and drift under the same gate.
> The untracked copy is **still tracked
> by no git repository**, so no diff and no CI run can ever reach it; only the gate can, and only when
> someone runs it. That remains a standing hazard, not a fixed one.

---

## THE VOICE, AND SPEAKING TO THE PUBLIC (binding, 2026-08-02, set live on air)

### The mechanism — read this before you try to speak

**`mcp__claude-voice__speak` DOES NOT REACH THE BROADCAST.** It renders locally. The studio no
longer captures ANY Windows audio device, deliberately. To be heard on air:

```
POST http://127.0.0.1:8106/api/say   {"text": "..."}
GET  http://127.0.0.1:8106/healthz    -> {clients, speaking, ducked, obs}
```

`viewer/voice_server.cjs` renders Piper to a WAV and hands it to `ovl_voice`, a **browser
source inside OBS**. The full chain is:

```
text -> piper.exe -> .wav -> loopback HTTP -> ovl_voice browser source -> OBS audio bus
```

No Windows playback device is captured at any point. That is the whole design: a headset being
unplugged, or Windows changing its default output, can no longer move the broadcast's audio.

<!-- @claim archived: the sentence above USED to end "present on 34 scenes". That count was
     hand-written and was ZERO for an unknown period. The quote is the evidence; keep it. -->
**Corrected 2026-08-04.** This said the source was *"present on 34 scenes"*. It was present on
**none** — absent from OBS entirely, wiped by a `studio_stage.cjs` rebuild that had no declaration
to recreate it from. It is now declared in `studio_stage.cjs` (ADR-255). **No scene count is
restated here on purpose** — that is a fact about a running OBS, not about this tree. Ask the tool:
`node viewer/voice_everywhere.cjs --status`.

**The design above is correct but it is NOT self-verifying, and that gap cost the broadcast its
voice.** The page originally drove a Web Audio graph, whose output OBS's browser-source rerouting
**does not capture** — so the "no Windows playback device" guarantee held while the audio went to a
Windows playback device anyway. It now plays through an `<audio>` element (ADR-254). The only
honest check is the level, not the configuration:

```
node viewer/audio_meter.cjs 8 ovl_voice
```

**If `/healthz` reports `clients: 0`, NOBODY HEARS YOU** — the page is not loaded. `/api/say`
returns **503** in that case rather than pretending it worked. Check it; do not assume.

**Why this exists, measured 2026-08-02:** the previous path relied on OBS's global "Desktop
Audio" capture, which was bound to a device GUID that no longer existed on the machine (a
removed headset) while Piper played to the monitor's HDMI audio — a different device. The
source was unmuted, sat at a healthy fader, showed a working level slider, and captured
**silence**: 78 meter frames in 4 seconds, every one empty. Nothing anywhere compared "where
the voice went out" against "where the studio is listening." Desktop Audio is now MUTED and
must stay muted — it captures the entire operating system, which is an open microphone aimed
at a public broadcast.

**The level rule, and the arithmetic behind it.** The operator's rule is that the voice fires
at the level the music was playing at before it ducks. Copying the bed's *fader* is not enough:
measured, the bed's fader sat at **-16.2 dB** while its post-fader peak metered **-4.5 dB**,
because music is mastered dense and speech is sparse. `VOICE_TRIM_DB = 12` closes that gap and
lands the voice at **-4.2 dB**, within 0.3 dB of where the music actually peaks. It tracks the
operator's slider — move the music and the voice follows on the next utterance. Clamped at
-3.5 dB because Web Audio does not clip gracefully and distortion is worse than quiet.

**voice_server owns the music duck.** The page reports `started` and `ended` from the player
itself, so the bed is held down between exactly those two edges. Do NOT add a second duck
controller: `music_director.cjs` has one built and deliberately stood down
(`DESKTOP_VOICE_DUCK = false`) because two controllers on one bed fight — each reads a level
the other just moved. Its MIC duck is separate and still live.

### Speaking to the public

The work is broadcast live on YouTube and Twitch, and the plan is published at `/live` on the
public site. **Strangers are watching this being built.** They are not auditors and not
customers — they are people who found something being made in the open and stayed.

**Tell the story, don't read the log.** Someone joining at hour four does not know what a gate
ledger is or why a missing receipt matters. Give the shape first: what we are building, what
just happened, why it mattered, what is next. Identifiers are for the operator and the record;
the story is for them.

- Say the plain name before the technical one — "the camera that shows the colony" before
  "`:3020`". Using both is how a newcomer becomes someone who can follow along.
- Explain failures as readily as fixes, and explain them kindly. *What broke, how we found it,
  what it cost.* No apology, no drama. A well-told failure teaches more than a clean success,
  and refusing to hide them is this project's entire claim.
- Include them in the reasoning: *"we thought it was the throttle — it wasn't, and we proved
  that by turning it off and watching it stay broken."*
- Credit the operator's rulings out loud. The audience should see exactly where human judgement
  enters, because that boundary is the most important thing here to teach.
- Never perform confidence you do not have. Stuck is a fine thing to say. Trust spent on false
  certainty does not come back.
- No hype, no launch language. Warmth lives in plainness, not adjectives — treating a listener
  as someone who can handle the truth IS the supportive move.
- "Not yet" is a respectable state. Much of this estate is scaffolding that is honest about
  being scaffolding; present it that way without embarrassment.

**Rhythm:** speak at the edges — something starts, something is found, something is fixed,
something is handed to the operator, a phase closes. Not continuously; silence while work
happens is fine and lets the bed carry. But a stranger should never watch for ten minutes with
no idea what they are looking at.

**An adverse result is spoken FIRST, and to BOTH audiences.** The operator because he must act
on it; the public because a project that only narrates its wins is advertising, and this is not
one.
