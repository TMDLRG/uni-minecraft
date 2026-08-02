# UNI HUD — the third independent surface

**Canonical doc.** Structurally parallel to `docs/GAIA.md`. Read this before
touching any file under `viewer/hud/**`. The HUD is the third always-on
surface, alongside **The Door** (`viewer/launcher.cjs` on `:8090`) and
**Gaia** (`viewer/gaia/gaia_server.cjs` on `:8096`).

> **Native architecture (2026-07-14, rewritten same day as first shipped).**
> There is **no HTML anywhere in the HUD** and **no browser page to load**.
> Two separate binaries: `UNI.Hud.Service` (JSON-only Windows Service,
> loopback `127.0.0.1:8100`, **not LAN-reachable**) and `UNI.Hud.Widget`
> (the thing you actually look at — a native WPF always-on-top desktop
> panel). An earlier Node.js + NSSM + `hud.html` version existed for a few
> hours this same session and was fully retired — see §7.

---

## 1. What the HUD is

**`UNI.Hud.Widget`** is a WPF desktop panel — always-on-top (`Topmost=true`),
custom title bar via **`WindowChrome`** (so it keeps a borderless look while
getting *real* native window behaviour: drag-to-move, double-click-title to
maximize, drag-edge resize, and Windows Snap — drag-to-edge / `Win`+arrows).
`AllowsTransparency=false` + `ShowInTaskbar=true` are load-bearing: they are
what make maximize respect the work area (never covering the taskbar) and make
a minimize land on the **taskbar** so the window is always recoverable.

**Window controls (title bar, left→right):** ⤢ cycle-dock (Right→Left→Top→
Bottom→Float), — minimize (to taskbar), ▢/❐ maximize/restore, 🗕 hide-to-tray,
✕ quit. Right-click anywhere for the same actions plus explicit Dock Left/
Right/Top/Bottom/Float. **Recovery is guaranteed three ways** — the taskbar
button (minimize), the tray icon (a left-click *always shows*, never hides),
and the `Ctrl+Shift+H` global hotkey. If the window is ever entirely off every
monitor (stale saved position, unplugged display) it auto-snaps back to a
right dock (`EnsureOnScreen`). Docking always resets `WindowState=Normal`
first, so it works even from a maximized state. Single-instance guarded (named
mutex `UNI-HUD-Widget`). It shows, at a glance:

Since **2026-07-16** the HUD is a **live-TV mixer-board NOC**: everything the operator needs to know
at a glance, with top-level access to every surface, **nothing collapsed and nothing clipped**. The
layout is exactly three rows — title bar / **one scrolling body** / footer — so you scroll the HUD, not
five little boxes. (The old 6-row grid had only one elastic row, so gates/sight/audience were squeezed
to nothing and the footer could be pushed off-screen with no way to reach it.) Default dock **440px**,
set as a named constant **in `DockTo()`** — the XAML `Width` alone does not apply, because `DockTo(Right)`
runs on load and would overwrite it.

- **Air-state hero** — `● LIVE` / `● STREAMING` / `REHEARSAL` / `OFF AIR` / **`SYNCING`**, from the
  service's first-class, staleness-qualified `air` object. **It never fabricates OFF.** Stale, missing,
  or mission-unreachable all render `SYNCING`, because "we do not know" is not "off". *(Was: a regex
  scrape of the console tile's free-text detail for `air=(\w+)` **defaulting to `"OFF"`** — so an absent
  tile or reworded string read a confident OFF AIR while the show could be live. The root cause was
  upstream: `launcher.cjs` forwarded the console's fabricated `{level:"OFF"}` fallback while dropping the
  `airStale` flag that qualified it. Both fixed; see `docs/receipts/hud_mixer_board_2026-07-16.md`.)*
- **MIXER strip — EGRESS / ENCODER / COLONY.** Every value traces to a named upstream field and carries
  a `source` string. **EGRESS readers** (numeric, from MediaMTX `:9997` — `null` means *not measured*,
  `0` means *measured zero*; never parsed out of a health prose string). **ENCODER** fps / congestion /
  dropped%. **COLONY** frames-per-second — Δ`mission.colony.frame`/Δt, *the* honest "the mind is running"
  line: a flat zero here means **FROZEN** even while every process reports "up".
  **Sparklines are for continuous magnitudes only; binaries render as pills.** *(Was: `producer_up`, a
  0/1 binary on a fixed 0..1 axis — structurally incapable of anything but a flat line — and
  `launcher_latency_ms`, which charted the HUD's own poll round-trip, i.e. its plumbing, not the
  broadcast. Both retired, and pinned out by a unit test.)*
- **NOC — door tiles** — one per door in the snapshot, **rendered dynamically with the count computed
  from the data**; open/locked/`circle_ok` colored (fails closed), prediction **on the tile face**.
  Every door carrying a server-supplied `href` is clickable (`↗`), and they are collected into the
  **ACCESS row** for one-click reach. *(Was: a hardcoded **13**-key array against **14** live doors — the
  14th was never drawn — under a hardcoded header `"NOC — 13 DOORS"` that matched the bug, plus a
  5-entry `DoorUrls` dict that left 9 doors unopenable.)*
  **The NO-IP-LITERAL rule is satisfied by not knowing the address**: `door_lifecycle.cjs` has always
  returned a real per-door `href`; the service now passes it through, so chip-side doors
  (`producer`/`colony`/`colonycam`) are clickable **with zero IP literals in widget code**. The widget
  renders the *declared* address faithfully — if the registry is stale, the link is stale, and that is a
  registry defect, not a widget one.
- **GAIA panel** — every seat from the data with real signal counts and live up/down, an **OPEN GAIA**
  button (href from the snapshot, not a widget constant), and drift rows carrying their **real `equal`**
  (MATCH / DRIFT). Seat colour comes **only** from real probe evidence: seats whose signals carry no
  `live.up` render grey and say verbatim *"no live probe (not evidence of health)"* — they are never
  green. Counting is done **client-side on purpose**: GAIA LAW forbids Gaia computing rollups about
  herself; a downstream consumer may count what she projects verbatim. Seats are **never** hardcoded —
  the live envelope has 9 and emits no `relay` seat, so a hardcoded list would invent one.
- **BROADCAST HEALTH** — the console's `/api/health` check board (obs, restreamer, cams, overlays,
  colonycam, phoenix, fan-out, stream quality). *(This was fetched every 3s and **thrown away** —
  `SnapshotBuilder.cs:15` bound it and never referenced it.)*
- **SOC — gate ladder** — every row in `evidence/gates.ndjson` (supersede semantics: latest verdict wins
  per name), **non-PASS first** (FAIL > PARTIAL > WITHHELD > PENDING > PASS), all of them reachable via
  the outer scroll, with a header computed from the same rows it renders — so header and body cannot
  disagree. *(Was: `MaxHeight="160"` → ~11 of 65 visible, unsorted, 22 non-PASS buried under 43 PASS.)*
- **SIGHT counter** — total findings + bad/warn/info breakdown from the
  service's `/api/hud/sight` (contradictions, rot, runaway detectors — see
  `Enlightened.cs` — plus user-mode findings merged in via `/api/hud/sight/push`).
- **Audience feed** — reverse-chronological list of accepted rows from
  `POST /api/hud/audience/publish` (staged: no scrapers ship yet; see §5).
- **Provenance footer** — poll count, upstream commit, last-poll timestamp.

Refresh cadence: **3 seconds** (`DispatcherTimer` in `MainWindow.xaml.cs`,
matches Door + Launcher + Infra's shared bus).

## 2. Data flow — pure aggregator over the truth surfaces

```
UNI.Hud.Widget (WPF, HudClient.cs)
  every 3s  ──▶  GET 127.0.0.1:8100/api/hud/snapshot
                     │
        UNI.Hud.Service — TWO loops, deliberately separate
                     │
   FAST loop (3s, broadcast-critical):
                     ├──▶ GET :8090/api/mission        (tiles + stack + air + airStale + colony)
                     ├──▶ GET :8090/api/door/state     (the door register — count comes from DATA)
                     ├──▶ GET :8090/api/door/journey   (journey step + predicts_next)
                     ├──▶ GET :8098/api/health         (the broadcast-engineer check board)
                     ├──▶ GET :9997/v3/paths/list      (MediaMTX — NUMERIC egress readers)
                     ├──▶ read evidence/gates.ndjson   (gate ledger, via HUD_REPO_ROOT env)
                     └──▶ own in-memory Ring buffers   (continuous magnitudes only)

   SLOW loop (120s, FIRE-AND-FORGET — never awaited by the fast loop):
                     └──▶ GET :8096/api/gaia           (full envelope → seat rollup + drift equal)
```

**Why Gaia is on her own detached loop (burned in 2026-07-16 — do not undo).** Every Gaia seat route
computes her **full envelope** internally before filtering (`gaia_server.cjs:150`) — a measured
**~20s / 611KB** job. It previously sat in the 3s fast loop behind an 8s timeout, so (a) it timed out on
**every poll since it was added** (`drift rows: 0`, latency ring a solid `[8015,8000,8000,…]` — the HUD
never once had Gaia data and never said so), and (b) because `Task.WhenAll` waits for all upstreams, that
doomed timeout dragged the "3s" loop to a **measured 11.1s**. Giving it its own *interval* is **not
enough** — `await`ing it inline still stalls the fast loop (measured 18.5s). It must be fire-and-forget,
guarded by `_gaiaInFlight`. Its 40s timeout sits deliberately **under** `gaia_server`'s own 45s
`ENVELOPE_TIMEOUT_MS` so a real server-side 504 surfaces as a 504.

The fast loop **deficit-sleeps** (sleeps the *remainder* of the interval, not a fixed 3s on top of the
work) so it honors the period it advertises. The snapshot publishes **both** `poll_interval_ms` (nominal)
and `poll_interval_measured_ms` (real) — them disagreeing **is** the signal. Never assert a cadence you
have not measured.

The service polls independent of whether the widget is running — the widget is just one client of
`/api/hud/snapshot`; `Enlightened.Gather()` sight detectors and Event Log emissions run regardless.

Gates are read **directly from `evidence/gates.ndjson`** on disk
(`Gates.cs`, path resolved via `HUD_REPO_ROOT` env set at service-install
time, falling back to `process.cwd()`/`__dirname`-equivalent walk-up). Same
file Gaia projects. Supersede semantics honored (later row with the same
`name` overrides an earlier one).

## 3. Three-leg supervision (boot persistence)

Two independent binaries, two independent supervision stories:

1. **`UNI.Hud.Service` — SCM auto-restart only, no watchdog process.**
   Registered via `sc.exe create` directly
   (`viewer/hud/native/_swap_service_elevated.ps1`) — the `.exe` implements
   `ServiceBase` natively via `Microsoft.Extensions.Hosting.WindowsServices`,
   so **no NSSM, no wrapper binary of any kind**. `StartType=Automatic`.
   Crash recovery: `sc.exe failure UNI-HUD reset=86400
   actions=restart/5000/restart/5000/restart/5000` (three 5-second-delay
   restarts, count resets after 24h clean). Runs as **`NT AUTHORITY\NetworkService`**
   — least privilege, genuinely deployed. The first attempt failed
   (`HttpListener` under `NetworkService` returned `Access denied` on
   `StartService`) because HTTP.SYS requires an explicit URL ACL reservation
   for any non-admin account before it will let `HttpListener.Start()` bind
   a prefix — even a loopback-only one; `LocalSystem`/`Administrators` get
   an implicit allowance, `NetworkService` does not. Root-caused and fixed
   2026-07-14 (`viewer/hud/native/_urlacl_and_networkservice_elevated.ps1`):
   `netsh http add urlacl` for `http://127.0.0.1:8100/` and
   `http://localhost:8100/`, plus a `ReadAndExecute` ACL grant on the repo
   root (the service reads `evidence/gates.ndjson` etc.), then reinstall +
   start under `NetworkService`. Live-verified independently:
   `Get-CimInstance Win32_Service` → `StartName: NT AUTHORITY\NetworkService`,
   `State: Running`; `curl 127.0.0.1:8100/api/hud/health` → `200 {ok:true}`.
   No watchdog process supervises this binary — SCM's own recovery policy is
   the whole story.
2. **`UNI.Hud.Widget` — a SECOND compiled Windows service + a native
   Scheduled Task (rebuilt 2026-07-18, no script).** Session 0 isolation
   forbids a service from drawing UI, so the widget is a user-session `.exe`;
   the question is only how a service *launches* it. The
   `UNI-HUD-WidgetLauncher` service (`viewer/hud/native/UNI.Hud.WidgetLauncher/`,
   `ServiceBase` via `WindowsServices`, `LocalSystem`, `start=auto`, installed
   by `_install_widget_launcher_elevated.ps1`) registers a native Windows
   Scheduled Task `UNI\HUD Widget` — principal = the logged-on operator via an
   **interactive token (no stored password)**, trigger = **at-logon**, plus
   **restart-on-failure** — and on a 5s tick calls `task.Run()` whenever the
   widget is absent in the active console session. The **Windows Task Scheduler
   service** then performs the session-correct spawn. This replaces the earlier
   hand-rolled `CreateProcessAsUser` (which died with `0xC0000142`, a
   window-station/desktop DACL failure) and the per-user Startup `.vbs` (retired;
   `hud_widget_boot_install.ps1` refuses to run). The widget's named-mutex guard
   makes any double-fire (service trigger + at-logon) a safe no-op. **The old
   "known gap — nothing relaunches the widget mid-session until next logon" is
   CLOSED:** the launcher re-triggers within 5s (live-proven: killed PID 8132 →
   respawned PID 25788 in 2.6s). Service-account discipline holds — LocalSystem
   is a machine identity, the task stores no password. Receipt:
   `docs/receipts/hud_widget_launcher_taskscheduler_2026-07-18.md`.
3. **Cold-triage click:** `viewer/hud/native/hud_widget_open.vbs` — manual
   desktop-icon launch of the widget exe, works from a totally dead state (never
   copied to Startup — that path is retired).

**Reboot-survival gate:** `viewer/hud/native/hud_native_boot_proof.ps1`
implements a **5-clause AND**: (1) `sc query`'s `ImagePath` is the native
`UNI.Hud.Service.exe` under `viewer/hud/native/publish/service/`; (2) OS
`LastBootUpTime` is after the service registry key's last-config-write time
(a self-bootstrapping marker file, `logs/hud_native_boot_install.marker`,
stands in for a true registry-key timestamp read — PS 5.1 has no native
cmdlet for that, and this achieves the same non-gameable property: only
`ChangeServiceConfig2` calls, i.e. `sc create`/`sc config`/`sc failure`,
touch it — a manual `Stop-Service`/`Start-Service` does not); (3) service
`Running` and `:8100` answers; (4) the JSON envelope's `instrument` field
reads `"UNI.Hud.Service@0.2"` (proves the *native* binary is what's
actually serving, not a stale process that happened to still hold the
port); (5) `widget_launch_supervised` — the `UNI-HUD-WidgetLauncher` service
is registered `start=auto` and Running, AND the native Scheduled Task
`UNI\HUD Widget` exists with an at-logon trigger and an action running
`UNI.Hud.Widget.exe` (was: "the widget's Startup `.vbs` is present"). **The OLD
`viewer/hud/hud_boot_proof.ps1` checks artifacts specific to the retired
watchdog architecture and can never PASS for this install — do not cite it
as reboot-survival evidence for the native stack.** Note: installing the
launcher refreshes the native-config marker, so `hud-boot-persistent` is
honestly **PENDING** until the next real power-cycle (clauses 1,3,4,5 pass now;
clause 2 confirms on reboot).

## 4. Endpoints

All served by `UNI.Hud.Service`'s `HttpApiHost.cs` — an `HttpListener`
bound **only** to `http://127.0.0.1:8100/` and `http://localhost:8100/`
(loopback, **not** `0.0.0.0`, **not** LAN-reachable).

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/hud/health` | Cheap liveness — no upstream call. Envelope with `ok:true`, pid, uptime. |
| GET | `/api/hud/snapshot` | The composed view: upstreams + door_open + gates + drift + audience + metrics + sight. |
| GET | `/api/hud/sight` | Sight envelope alone (contradictions + rot + runaway + user-mode findings). |
| GET | `/api/hud/audience/recent?n=<int>` | Last N accepted audience rows. |
| POST | `/api/hud/audience/publish` | Accept a sanitizer-vouched row (see §5). |
| POST | `/api/hud/sight/push` | User-mode helper posts findings the service can't see itself (see §6). |
| GET | `/api/hud/discovery` | Self-describing manifest (routes, laws). |
| any non-GET on any other path | | **`405 method_not_allowed`** (structural fence). |
| any GET on an unrecognized path | | `404 not_found` — **there is no `/`, `/hud`, or `/hud.html` route; this is JSON-only by construction.** |

No `Access-Control-Allow-Origin` header is ever sent (a wildcard `*`
previously shipped and was removed — see the ultracode-review receipt; it
let any web page the operator's browser loaded read this service's JSON
through the loopback boundary via `fetch()`. The only real client is the
native widget, which is not a browser and has no CORS concept at all).

### 4a. Fan-out ARM/DISARM (2026-07-16 — widget→command-center, NOT a `:8100` route)

The Widget's Air-hero panel carries a PIN entry + ARM/DISARM. This is **not** a new `:8100`
route — the `:8100` service stays exactly the two narrow POSTs in the table above. The Widget
process itself POSTs **directly** to the command center (`:8098/api/endpoints`, a surface that
was already mutating and already CSRF-fenced there), on the operator's own click, never proxied
through the read-only service. `MainWindow.xaml.cs`'s `_cc` client + `OnArm`/`OnDisarm`.

The mechanism: a short 4–8 digit PIN unwraps the SAME AES-256-GCM stream-key passphrase the
console's "Streaming endpoints" panel already used — `viewer/pin_store.cjs` is a second,
independent encrypted file (`endpoints_pin.enc`, key = scrypt(PIN)) whose plaintext is the real
passphrase. Setting the PIN requires the real passphrase once (proves the operator knows it);
after that the PIN alone reconstructs it. **ARM** = PIN unwraps the passphrase, unlocks
`endpoints.enc`, and starts fan-out (`/api/endpoints {action:"pin-arm"}`) — one step. **DISARM**
needs no PIN (`{action:"pin-disarm"}`) — stopping is always a single click, never gated. Neither
action ever calls `/api/golive` or types `CONFIRM` — the public StartStream cut stays the
operator's separate, deliberate, human-typed action (G-PA, unchanged). Owner-accepted risk: a
short PIN is weaker than the full passphrase; accepted because a leaked stream key only risks
channel hijack (easy to rotate), never data exposure.

## 5. Audience receiver — sanitizer-vouched, endpoint-only staging

`POST /api/hud/audience/publish` accepts one row per request. Requirements:

- **Source loopback only** (`IPAddress.IsLoopback` on the real socket
  endpoint `HttpListener` hands us — not a spoofable header).
- **Header `x-uni-cc: 1` required.**
- **Content-type `application/json`** or `415`.
- **Body payload ≤ 64 KB** or the connection is dropped defensively.
- **Row shape** (all fields required, each ≤ 200 UTF-8 bytes):
  ```json
  { "source": "yt|tw|stub|...", "author": "string",
    "text": "string (valid UTF-8)", "ts": <unix-ms | ISO-8601>,
    "sanitized_by": "string (who vouched this row is clean)" }
  ```
- **`sanitized_by` is MANDATORY.** The HUD does NOT sanitize itself.
  Upstream must vouch. Rejecting an unvouched row is the
  `hud-audience-sanitizer-honest` gate.

Implementation: `HudState.cs`'s `Audience.Accept(JsonElement)`. **This
endpoint was completely broken from first native ship until the
2026-07-14 ultracode review caught it** — `Accept` was originally typed
`Accept(dynamic input)`, and a `System.Text.Json.JsonElement` has no
dynamic members to bind against, so every single call threw
`RuntimeBinderException` on the first field access and was silently
reported back as a generic `{code:"shape"}` rejection. Fixed to explicit
`TryGetProperty` calls; regression-covered by
`viewer/hud/native/UNI.Hud.Service.Tests/AudienceTests.cs`.

Ring capacity 200 (in-memory, per-process — resets on service restart;
there is no persistence layer, by design, for a glance surface).

**No YouTube/Twitch scraper ships yet.** The receiver + widget panel land
so future adapters plug in cleanly. One cure at a time.

## 6. User-mode sight helper — the two-tier fix for service-context blindness

`UNI.Hud.Service` runs as `NT AUTHORITY\NetworkService`. Windows enforces a
per-user visibility fence on some app-created directories that a machine
account **cannot see even with a `FullControl` ACL entry** — live-confirmed for the
OBS crash-sentinel directory
(`%APPDATA%\obs-studio\.sentinel`): an admin-context `cmd.exe /c dir`
enumerates it fine, but a scheduled task running literally as
`NT AUTHORITY\SYSTEM` gets `ENOENT` on the exact same path. This is a
genuine, structural Windows session-visibility boundary, not a
permissions bug to fix by widening the ACL.

The correct architecture — and the **only** correct one, per this
project's binding service-account discipline (never run a service as a
person, never prompt for a password) — is two-tier:

1. **`viewer/hud/native/hud_user_sight.ps1`** runs in the **operator's own
   logon session** (installed as a Startup `.vbs`, no elevation, no
   password), gathers what only the operator's session can see (OBS crash
   sentinels, recent crash logs, Chrome profile locks), and POSTs findings
   to `POST /api/hud/sight/push` (loopback + `x-uni-cc:1`, same header
   discipline as audience).
2. `UNI.Hud.Service` merges those into `/api/hud/sight`'s output
   (`user.`-prefixed codes, `pushed_from` provenance), with a 90-second
   freshness window — stale user-mode findings age out rather than lying
   forever if the helper stops running.

`Enlightened.cs`'s `Gather()` — the **service-context** sight detectors
(contradictions, poll-stall, upstream-unreachable) — deliberately does
**not** attempt any user-profile probe. That scope fence is enforced by a
comment at the top of the file; do not add one there — it belongs in
`hud_user_sight.ps1`.

## 7. Retired: the Node/NSSM/HTML architecture

For a few hours on 2026-07-14, the HUD shipped as `viewer/hud/hud_server.cjs`
(Node.js, JSON + an `hud.html` browser page), NSSM-wrapped as the SCM
service, with `hud_watchdog.ps1` as a fallback supervisor and
`@yao-pkg/pkg`/`caxa` producing the `.exe`. **That entire design was
retired the same day** in favor of the native architecture described
above. What's still true from that era and was **preserved, not
rewritten**: `viewer/hud/fqdn.cjs` (the reference `fqdn()`/`url()` helper
CLAUDE.md had long declared but never implemented — untouched by the
native rewrite), the port number (`:8100`), the 3-second poll cadence, the
five-upstream fan-out shape, and the audience-row JSON contract (§5).

**Files from that era, retired — do not run, do not cite as current:**
- `viewer/hud/hud_service_install.ps1` — the NSSM installer. Now refuses
  to run without an explicit override flag (running it would tear down the
  working native service and reinstall the old Node/NSSM stack).
- `viewer/hud/hud_boot_proof.ps1` — checks watchdog-era artifacts
  (`UNI-HUD-Watchdog.vbs`, a `hud_watchdog started` log line) that the
  native architecture never produces. Use
  `viewer/hud/native/hud_native_boot_proof.ps1` instead.
- `viewer/hud/hud_server.cjs`, `viewer/hud/hud.html`,
  `viewer/hud/build_exe.ps1`, `viewer/hud/hud_chaos.cjs`,
  `viewer/hud/tests/*.cjs` (the 73-assertion Node suite) — all describe or
  test the retired implementation. The old suite's green status is **not**
  coverage evidence for the native `.NET` code; see §8.
- `viewer/hud/hud_watchdog.ps1` — kept, but rewritten: its dormant fallback
  path now calls `sc.exe start UNI-HUD` (the currently-registered service,
  whatever binary that is) instead of spawning the retired
  `node.exe hud_server.cjs` directly. Normally dormant entirely, since the
  SCM-precedence check short-circuits before ever reaching it.

## 8. Test coverage

`viewer/hud/native/UNI.Hud.Service.Tests` (xUnit) — created in the
2026-07-14 ultracode review pass specifically because the native rewrite
shipped with **zero** test coverage of its own C# logic (the old 73
Node assertions test a different, retired codebase entirely and were never
capable of exercising any of this). Current coverage:

- **`RingTests.cs`** — the monotonic-timestamp guard under a simulated
  clock-jump-backward, wrap-at-cap eviction, sparkline windowing.
- **`AudienceTests.cs`** — the full validation/sanitization contract
  (missing fields, oversized multi-byte UTF-8, both accepted `ts` shapes,
  the mandatory `sanitized_by` gate, angle-bracket stripping) — this is the
  regression suite for the dynamic-binding bug described in §5.

**`SnapshotHonestyTests.cs` (26 tests, added 2026-07-16)** now pins the honesty properties themselves,
so they are falsifiable in CI rather than re-argued by eye on every edit. Each encodes a defect that was
real and live: stale/missing/mission-down air ⇒ `UNKNOWN` never `OFF`; MediaMTX unreachable ⇒ `readers`
is `null` (not a confident `0`); `ParseDriftRaw` reads the **JSON-encoded string** at `value.raw`
(reading `value.raw.equal` directly — as the design doc specified — silently yields `undefined` for
every row); rate math returns `null` on first-sample and on counter-reset (never a fabricated `0`, never
a negative); `circle_ok`/`ok` fail closed; door `href` passthrough; and
`MetricsCarryNoBinaryOrSelfLatencySeries` asserts the retired `producer_up`/`launcher_latency_ms` series
cannot come back onto the surface. The service's internal seams are exposed to the test assembly via
`InternalsVisibleTo` rather than widened to `public` just to be testable.

Not yet covered (documented gap, not silently ignored): `Gates.cs`'s supersede-by-name parsing,
`Enlightened.cs`'s since-tracking/eviction, `HttpApiHost.cs`'s loopback+header auth gate (needs an
in-process `HttpListener` integration harness), and the widget's own rendering (see the ARM/DISARM click
gap in §9b — note UI Automation **can** attach to the widget, so a UIA-driven click test is the obvious
next step). Run `dotnet test` from `viewer/hud/native/` — `UNI.Hud.sln` wires the test project in.

## 9. Gate ladder (append-only in `evidence/gates.ndjson`)

Originally pre-registered in `docs/receipts/red_preregistration_hud.md`
for the (now-retired) NSSM architecture. The 2026-07-14 ultracode review
found all 8 `hud-*` gate rows describe that retired mechanism verbatim
(NSSM restart semantics, `hud-server.exe` SHA256, `hud_watchdog.ps1` log
lines) with zero superseding rows appended despite the native rewrite
shipping. Per the Lab Protocol's append-only rule, 8 new superseding rows
have been appended — see `evidence/gates.ndjson` (search `hud-`) and
`docs/GATES.md` for the current native-architecture pass conditions.

Verdict advancement: **NEVER mutate a prior row.** Append a new row with
`supersedes: ["<prior-row-name>"]`. Re-render `docs/GATES.md` after each
append.

### 9a. Honesty fixes (2026-07-16 — operator-caught: "the HUD is not honest")

Three real overclaims found + fixed, all in the direction of "claims ok/up with
insufficient evidence" (never the reverse — fail closed, not fail open):

1. **`producer_up` metric** (`PollWorker.cs`) accepted `driver=producer` ALONE as
   "producer UP", with no `verdict=LIVE` requirement — the project's own colony
   rule (CLAUDE.md) states driver=producer is necessary but NOT sufficient. A
   `driver=producer verdict=PARTIAL` response was rendering green. Fixed to
   require `verdict=LIVE`, full stop.
2. **`circle_ok` default** — THREE call sites (`SnapshotBuilder.cs`,
   `Enlightened.cs`, `MainWindow.xaml.cs`'s door renderer) defaulted a
   missing/unreadable `circle_ok` field to **true** (claimed a door's circle was
   fine with zero evidence). All three now default to **false** — fail closed,
   matching the `open`/`locked` fields' existing (correct) default. No
   observed regression: `door_lifecycle.cjs` already always emits a real
   boolean, so this was a latent landmine, not a currently-visible symptom —
   fixed anyway per the claim fence.

### 9b. The mixer-board rebuild (2026-07-16 — operator: "producer up means nothing")

Full receipt: **`docs/receipts/hud_mixer_board_2026-07-16.md`**. Seven gates pre-registered PENDING
*before* any code, all closed **PASS** with live evidence: `hud-speeds-meaningful`,
`hud-air-honest-unknown`, `hud-all-doors-rendered`, `hud-gates-all-seeable`, `hud-gaia-honest-seats`,
`hud-nothing-clipped`, `hud-glance-honest`.

**The lesson worth keeping.** The plan was written from a careful code read and was still **wrong or
incomplete on four points that only *measuring the running system* revealed**:

1. **Gaia had never worked — not once.** `gaia_drift` timed out on *every poll since it was added*
   (`drift rows: 0`, latency ring `[8015,8000,8000,…]`). The HUD showed nothing and never said why.
2. **The advertised 3s cadence was off by 3.7×** — a measured **11.1s** (237 polls in 2620s), because
   `Task.WhenAll` waited on that doomed 8s timeout every cycle. The published constant `3000` made it
   unfalsifiable.
3. **The air lie's root cause was upstream of the HUD** — `launcher.cjs:97` dropped `airStale` while
   forwarding the console's fabricated `OFF`. No widget change could have fixed it. (The plan assumed
   `mission.airStale` existed; `curl` showed `undefined`.)
4. **`value.raw.equal` does not exist** (it is a JSON-encoded *string*), and **Gaia has 9 seats, not 10**
   — there is no `relay` seat, so the specified hardcoded list would have *invented* one.

**And the metric caught its own author.** Fixing (2) exposed a regression *I introduced while fixing
(1)*: giving Gaia her own interval but still `await`ing her ~20s call inline reproduced the same defect
once per 120s — measured **18524ms**, *worse than the original*. Hence fire-and-forget + `_gaiaInFlight`.
This is precisely why `poll_interval_measured_ms` ships next to `poll_interval_ms`: **never assert a
cadence you have not measured.**

**Known-stale, filed separately (not a HUD defect):** the chip moved `.122 → .121`, but
`infra_registry.json` still declares `.122` — so the `producer`/`colony`/`colonycam` door hrefs open dead
addresses and Gaia's colony seat reads `4 DOWN / 0 up` while the colony is genuinely LIVE. The widget
renders the declared address faithfully; **the registry is stale.** A static `.122→.121` swap is the
wrong fix (transient DHCP uplink — see `ADAPTIVE_SELF_NETWORK_HANDOFF_2026-07-15.md`). The new Gaia panel
is what exposed it — the surface doing its job on day one.

## 10. Structural fences (honest by construction)

1. **NO IPv4 literal anywhere in `viewer/hud/**`** outside allowlist
   `{127.0.0.1, 0.0.0.0}`. (Enforcement for the native tree is currently
   manual code review, not an automated scanner — the old
   `tests/hud_no_ip_test.cjs` only walks the retired `.cjs` files. A native
   equivalent is a known follow-up, not yet built.)
2. **Reads never actuate.** Every polled `:8100` endpoint is a pure GET. Two
   narrow POSTs on `:8100` (audience publish, sight push), both loopback + header
   gated. The Widget's fan-out ARM/DISARM (§4a) is a THIRD actuating path, but it
   is not a `:8100` route at all — it is the Widget process itself, on the
   operator's own click, POSTing to the already-mutating, already-fenced
   command center (`:8098`). `:8100` stays exactly as described above.
3. **HUD is DOWNSTREAM of Gaia — outside her write-fence.** Renders Gaia
   signals but is not bound by GAIA LAW's rendering constraint.
4. **No stream key held. No `CONFIRM` ever typed. No science gate
   touched.**
5. **Service account discipline:** `NT AUTHORITY\NetworkService`
   (least-privilege machine identity — never a person's account, never a
   stored password; see §3 for the URL ACL reservation that made this
   account actually work, after an initial attempt failed for lack of
   it). User-scoped observations go through the two-tier helper in §6,
   never through widening the service's own identity.

## 11. Related files

- **Service:** `viewer/hud/native/UNI.Hud.Service/{Program,HttpApiHost,PollWorker,
  SnapshotBuilder,Enlightened,Gates,HudState,EventLogger}.cs`
- **Widget:** `viewer/hud/native/UNI.Hud.Widget/{App,MainWindow}.xaml(.cs)`,
  `HudClient.cs`, `HotKey.cs`
- **Tests:** `viewer/hud/native/UNI.Hud.Service.Tests/{RingTests,AudienceTests}.cs`
- **Supervision:** `viewer/hud/native/_swap_service_elevated.ps1` (service
  install, current), `viewer/hud/native/_stop_service_elevated.ps1`,
  `viewer/hud/native/_sign_and_reinstall_elevated.ps1` (combined sign +
  reinstall with NetworkService-attempt/rollback), `hud_widget_boot_install.ps1`,
  `hud_widget_open.vbs`, `hud_native_boot_proof.ps1`
- **Signing:** `viewer/hud/native/_cert_and_sign_elevated.ps1` (self-signed
  cert, installed to `LocalMachine\Root`, used by `signtool`)
- **Retired (do not run — see §7):** `viewer/hud/hud_service_install.ps1`,
  `viewer/hud/hud_boot_proof.ps1`, `viewer/hud/hud_server.cjs`,
  `viewer/hud/hud.html`, `viewer/hud/build_exe.ps1`, `viewer/hud/hud_chaos.cjs`
- **Preserved from the retired era:** `viewer/hud/fqdn.cjs`
- ADR: `production/docs/adr/ADR-PROD-015-uni-hud-independent-surface.md`
- Ultracode review receipt: `docs/receipts/hud_native_ultracode_review_2026-07-14.md`
