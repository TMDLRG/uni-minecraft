# DD + TDD Plan — Land the UNI Broadcast Studio as real, documented, DNS-only, durable code

> **In-repo canonical copy** (owner-approved 2026-07-13). The session-local mirror
> `~/.claude/plans/make-a-full-dd-parallel-bengio.md` is identical but does not travel with the repo — this is
> the one a fresh chat reads. Working logic: `docs/WORKING_LOGIC.md`. Scope split: studio track (this plan) vs
> science track (`docs/DEEPENING_PLAN.md`, a separate agent).

> Branch `lab/ozone-life-uni-hard-science`. Scope: **the broadcast STUDIO / platform / DNS / UX / docs.**
> The science lineages are **OUT OF SCOPE** and owned by a separate agent (see Scope Fence).
> Method: **Document-Driven (docs are the change-management) + Test-Driven (gates are the tests),
> run as a VFE/EFE/OODA loop** — the same reasoning the colony itself uses.
> Hard rule, everywhere: **NO IP literals in code. Ever. Only `<name>.uni-lab.local` DNS names.**
> **Only real files/code in this repo — no training data, no internet knowledge.**

---

## Context — why this plan exists

The studio was brought "up" over the last sessions by **ephemeral runtime hacks**, not code. The owner's
exact words: *"you do NOT have a working platform you HACKED OBs… where is my working command center?"* Every
fix that made the last live test look right — the `uni-cam` container (bare `podman run`), five podman
forwarders, `VIEWER_URL` injected by distributed-Erlang RPC, the OBS scenes flipped to `browser_source`,
`ShowMusic` added to scenes by hand, the NVIDIA GPU pinning — lives only in a running process's memory. Tear
the box down and it is all gone. That is not a durable broadcast SYSTEM; it is a demo held up by hand.

At the same time three structural debts block "professional, durable, easy for the operator":
1. **Runtime ≠ code.** Nothing above is reproducible from a cold boot. `studio_up.ps1` does not rebuild it.
2. **IPs are hard-coded** in ~40 places across ~17 files, even though a full `uni-lab.local` DNS system exists.
3. **The remote-source gateway is unhardened** — no PIN, no LAN/WAN distinction, an IP-only cert, and no way
   for a camera to reach the studio from outside the LAN.

And the documentation has **drifted**: a whole cluster of studio docs still describes the pre-2026-07-12
architecture (node2 headless-OBS mixer, colony-on-THINKER) that the ADR chain retired.

**Intended outcome:** the broadcast studio *uses our real code*, is *perfectly and honestly documented*, *runs
in every place it needs to*, is *stable and durable* (supervised, boot-persistent, reboot-proven), is *easy for
the operator* (one DNS name, one screen, one-click stop, human-typed go-live), supports the *remote source on
all 10 slots by URL (never IP) from anywhere in the world with PIN 2077 + an off-LAN approval gate*, and is
*proven by a full PUBLIC live broadcast test that sweeps every layout, camera, and music feed, plus color bars*.
Nothing is left behind: every open studio item ends this plan either DONE-with-a-gate or documented honestly.

---

## How this agent works — VFE / EFE / OODA, Document-Driven, Test-Driven

The colony's mind is an **active-inference OODA loop**; the operator-agent runs the **same loop** over the
studio. Full detail in `docs/WORKING_LOGIC.md`; the essentials:

**The colony's real loop (tie-to-code):** the live tick is `SP.Runtime.Agent` (`lib/sp/runtime/agent.ex`)
driving `SP.Brain.MC.step/2` (`lib/sp/brain/mc.ex`): **Observe** the body's sense line → **Orient** by
minimising **VFE** `q(s)=softmax(prior+Σγ_m·lnA)` (`infer.ex`; `(lnB)·s` convention) + Hebbian learn
(`learn.ex`) → **Decide** by minimising **EFE** = epistemic `H(qo)−E[H(o|s)]` + pragmatic `qo·C` + gated
novelty `W` over a depth-5 plan (`efe.ex`, `plan.ex`) → **Act** out the Port.

**The operator-agent's loop (every turn):** **Observe** by running the GATES (never process existence) →
**Orient (VFE)** by diffing measured state vs the documented true state (the gap is the prediction error) →
**Decide (EFE)** the one item that most reduces uncertainty/risk (one cure at a time) → **Act** as code + doc
(DD) + gate (TDD).

**DD = change-management:** a work-item is done only when code is committed+pushed, the canonical doc/ADR is
TRUE, and the gate row is in `evidence/gates.ndjson`. **TDD = gates first:** name the PASS gate before the
change; the full **public** broadcast sweep is the integration test. No FE-engine code is touched by this plan.

---

## Scope fence (binding — state it loudly so no future chat conflates the two tracks)

This plan is **the broadcast-studio track ONLY**: production paths, runtimes, UIs/UX, end-to-end process, DNS,
and their documentation. It touches **no FE-engine code** and **forces no science gate**.

The **science track is a separate agent's job.** The built-but-unproven lineages —
`homeostat_colony` live, `forage-pureworld-graduation` (task #25 in the science track), the
spine/glands/hemispheres phases, and every pre-registered RED in `docs/receipts/red_preregistration_*` — stay on
their disciplined pre-registered-RED track under `docs/LAB_PROTOCOL.md`. **This plan does not design, run,
close, or re-document them.** The CLAUDE.md rewrite (WS5) makes this two-track split explicit: *studio agent*
vs *science agent*, so handoffs never cross.

The one place the two tracks meet is a single read-only gate: the **colony-scene-on-program** cut stays blocked
until `forage-pureworld-graduation` PASSes (already encoded in `infra_registry.json.goLiveGate` and
`verify_colony.cjs`). The studio may broadcast *everything else* publicly now; the colony world-view cuts to
program as a camera, but any **life/awareness claim on-air** remains fenced to the science verdict.

---

## Measured starting state (2026-07-13 — verify before trusting; do not re-derive)

- **THINKER is on Tailscale** — `100.98.223.27`, MagicDNS `thinker.[redacted: client-identifier].ts.net`; the chip is
  `uni-lab-hub 100.100.188.48`; suffix `[redacted: client-identifier].ts.net` is a **separate namespace** from `uni-lab.local`
  (zero conflict). **node2 is NOT on this tailnet** (it is on the flaky wg mesh) — reinforces the ADR-014 move
  of the relay onto THINKER-local `restream.ps1`. → **Tailscale is the durable WAN transport.** (Measured.)
- **10 remote slots are already fully wired** (`publisher.cjs SLOTS=cam1..cam10`, `mediamtx_local.yml`
  cam1..cam10, OBS RemoteCam1..10). The count goal is already met — do not change it.
- **`publisher.cjs` has no PIN, no auth, no LAN/WAN detection**; binds `0.0.0.0` (so already Tailscale-reachable).
- **`studio_up.ps1` re-runs `studio_stage.cjs` on every bring-up** (line ~310) → OBS scene fixes persist *iff*
  they live in `studio_stage.cjs`. It does **not** host the colony (correct); it only checks chip `:4000`.
- **The colony bring-up on the chip is the ephemeral part** — `uni-cam`, the `:3020` publish, and `VIEWER_URL`
  are not yet quadlets/baked env.
- **DNS is further along than the registry says.** The rootful `uni-dns` dnsmasq quadlet is **confirmed
  running** on the chip, serving `/etc/uni/dns/uni-lab.local.hosts` (`colony`/`colonycam`/`glass`/`masterplan`
  →122, `cams`→196, `mc`→10.89.1.40 — matches `infra_registry.json`). So the WS2 conversion is largely
  unblocked; the registry's `"dnsmasq (planned)"` wording is stale doc-drift (fix in WS0). Confirm end-to-end
  with the `dnsSetupClosure().closed` gate before merging the conversion; on-LAN cameras also have mDNS/avahi.
- **Docs drift**: `RUNBOOK_GOLIVE.md` still documents the retired node2 headless-OBS mixer; the SYSTEM-1
  studio docs (`RUNBOOK_STUDIO`, `STUDIO_OPERATOR_MANUAL`, `RUNBOOK_LIVE_STREAM`) carry stale-banners; ADRs
  011–014 are the only Accepted set and are current truth.
- **NO-GO stands** until the studio persistence + the public broadcast test pass (`RELEASE_READINESS.md`).
- **Studio broadcast stack status (checked live 2026-07-13, session that built Gaia — see WS-Gaia below): still
  DOWN.** `studio_up.ps1` was not run this session; MediaMTX/OBS/command_center/publisher/launcher ports
  (9997/8090/8098/8099/8443/4455/1935) were all confirmed down on THINKER. Nothing in WS1–WS4/WS6 changed this
  session — the broadcast bring-up + public go-live test remain fully ahead of us.

---

## Workstreams

> Order is DD-first: make the docs true, then make the code true, then prove it live. Each WS lists its
> **files**, its **change**, and its **gate** (the test) — all grounded in the real files, no invented paths.

### WS0 — DD baseline: make the docs true *first* (so the plan builds on truth, not drift)

- Reconcile the drifted studio docs against the ADR chain (011–014 = current truth):
  - `production/docs/RUNBOOK_GOLIVE.md` — rewrite to the THINKER-native-OBS + THINKER-local `restream.ps1`
    fan-out path (ADR-011/012/014); it currently describes the RETIRED node2 `uni-bcast-mixer` :4455.
  - Confirm the SYSTEM-1 stale-banners (`RUNBOOK_STUDIO`, `STUDIO_OPERATOR_MANUAL`, `RUNBOOK_LIVE_STREAM`,
    `RESUME_2026-07-11_PRODUCER_GOLIVE`, `work_orders/producer_golive`, both `*_HANDOFF`) still point to the
    canonical replacements (`docs/STUDIO_SYSTEMS.md`, `production/docs/DEPLOYED_STATE.md`, the ADRs). Add banners
    to the two UNCLEAR pre-correction plans (`BROADCAST_REARCHITECTURE.md`, `MASTER_PLAN_RESONANCE_2026-06-21.md`).
  - `docs/UNI_QA_AND_E2E_PLAN.md` references a stale lab host IP — fix to DNS.
- **Gate:** a doc-drift sweep (grep for retired surface names `uni-bcast-mixer`/`-overlays`/`-pubgate`, for the
  colony-on-THINKER wording, and for the SYSTEM-2 framing) returns only historical files that carry a banner.

### WS1 — Persist every runtime hack into code (task #20) — the "real platform, not OBS hacks" fix

**Load-bearing deploy constraint (verified):** the colony runs **bare rootless `podman run`** under `uni` (uid
1000) — there are **zero** rootless quadlets today (`/run/user/1000/systemd/generator` does not exist). The MCP
mutation verbs are **rootful** (`podman_quadlet_apply` writes `/etc/containers/systemd/`; `os_file_write` can't
reach `/home/uni`), and a rootful uni-cam couldn't even join the rootless `uni-colony-net`. So the colony
quadlets install **as-uni over SSH** (`ssh uni@10.190.245.122` — the established rootless-colony path), NOT via
MCP. Model them on the repo's quadlet convention (`production/dns/uni-dns.container`,
`production/containers/systemd/uni-bcast-*.container`). Boot-start needs `loginctl enable-linger uni` (root,
one-time) + `WantedBy=default.target`. *NOT VERIFIED (confirm as-uni first, don't invent):* live `uni-colony`
run args, whether `:4000`/RCON `:25575` are LAN-published vs loopback, whether linger is set, any existing
forwarders, and that the images are in uni's **rootless** store.

1. **`uni-cam` — Dockerfile + rootless quadlet (chip, as-uni).** `deploy/uni-os/uni-cam.Dockerfile`: bake
   `canvas`+`gl` at BUILD (`npm install canvas gl` after the pruned install at :34-35 — root cause: package.json
   lists only mineflayer+prismarine-viewer, so the native deps never install), and replace the failing
   `xvfb-run` ENTRYPOINT (:44) with explicit `sh -c "Xvfb :99 -screen 0 1280x720x24 -nolisten tcp & sleep 1;
   exec node director.js"`. NEW `deploy/uni-os/uni-cam.container` (rootless, `Network=uni-colony-net`,
   `PublishPort=3020:3020`, `Restart=on-failure`, `WantedBy=default.target`) → `~uni/.config/containers/systemd/`.
   Land the image in uni's rootless store (`podman save | ssh uni@chip podman load`), then `systemctl --user
   daemon-reload && start uni-cam`.
2. **`:3020` LAN publish + forwarders (chip).** The uni-cam quadlet's `PublishPort=3020:3020` **is** the LAN
   publish — no separate forwarder. Fold uni-colony `:4000` exposure into its quadlet `PublishPort=4000:4000`
   (matches the working studio-probes-LAN state).
3. **`VIEWER_URL` baked, no RPC (chip + THINKER).** NEW `deploy/uni-os/uni-colony.container` with
   `Environment=… VIEWER_URL=http://colonycam.uni-lab.local:3020 UNI_AUTOSTART=1`; also add it to
   `uni-colony.Dockerfile` ENV (:45, defense-in-depth) and change `ui/lib/sp_ui_web/live/stream_live.ex:252`
   default from `localhost` to `http://colonycam.uni-lab.local:3020`. Replaces the ephemeral distributed-Erlang
   `os:putenv` RPC.
4. **OBS scene fixes (THINKER, `viewer/studio_stage.cjs`; re-run every bring-up at :310).**
   - `cap_colony`(:59) → `browser("http://colonycam.uni-lab.local:3020/")`; `cap_glass`(:60) →
     `browser("https://glass.uni-lab.local/glass/")` (the `browser()` helper at :46 exists; raw cam not
     `/stream`, since OBS composites its own `:8099` overlays at :216 — `/stream` would double them).
   - **Drop the 32 px titlebar crop for cap_colony/cap_glass items only** (browser sources have no titlebar; the
     crop clips content) across the **11** scenes that use them (COLONY, CAM_PIP, COLONY_SIDE, PIP, GLASS_TALK,
     TEACH, NEWSDESK, ANCHOR, GLASS_OS, DUAL_WORLD, COLONY_SIDE_MUSIC).
     <!-- Corrected 2026-08-01: this said 9 and listed 9, omitting CAM_PIP and COLONY_SIDE_MUSIC. Executed as
          written, those two scenes would have kept the wrong crop — a list whose length IS the claim. Derive
          it, do not retype it:
            node -e "const S=require('./viewer/studio_stage.cjs').SCENES; console.log(Object.keys(S).filter(k=>/cap_colony|cap_glass/.test(JSON.stringify(S[k]))).join(', '))" -->

   - `COLONY_HOST`(:39) → `colony.uni-lab.local`; `cap_web`(:64) → `masterplan.uni-lab.local:4100`.
   - **ShowMusic in every scene** (today 6 of 33 — COLONY, PIP, GLASS_OS, OVERLOOK, WEB, STANDBY_OFFLINE;
     the denominator said 27 until 2026-08-01): idempotent loop after :218 pushing `["ShowMusic"]` into every
     scene except `BARS_TONE` (keep the sound-check tone clean).
   - **Glass cert (flag):** OBS CEF can't accept the self-signed glass cert → add an idempotent step to import
     the glass CA into THINKER's LocalMachine Trusted Root, or `cap_glass` won't load.
   - **Knock-on:** `studio_channels.ps1` + `throttle_colony.cjs` now target windows that no longer exist → drop /
     skip those bring-up steps.
5. **GPU pinning (THINKER).** NEW `viewer/gen_gpu_pref.ps1` (idempotent HKCU `UserGpuPreferences`
   `GpuPreference=2` for `chrome.exe` + `obs64.exe`), called from `studio_up.ps1` right after line 168, **before**
   OBS/Chrome. Also fix the colony probe (:176-181) → probe `colony.uni-lab.local:4000` **and**
   `colonycam.uni-lab.local:3020`, WARN-not-start if the cam is down (chip owns it).

- **Gate (reboot-persistence — the MCP-verifiable *absence* today is the current proof of no persistence):**
  after installing the rootless quadlets + linger and a chip reboot, `os_file_list
  /run/user/1000/systemd/generator` now lists `uni-cam.service`/`uni-colony.service` (today it's absent);
  as-uni `systemctl --user is-active uni-cam` = active; THINKER `Test-NetConnection colonycam.uni-lab.local
  -Port 3020` = OK; `verify_colony.cjs 10.190.245.122` PASS (needs LAN RCON `:25575` — flag: currently
  loopback-only); OBS `GetSourceScreenshot` on `cap_colony` has pixel-variance above threshold (rejects both a
  black AND the WGC-white frame); `verify_overlays.cjs` exit 0 + `overlay_proof.png`; the `/stream` iframe `src`
  = `colonycam.uni-lab.local:3020` after a uni-colony restart.

### WS2 — NO IPs: one shared FQDN helper + conversion of ~40 literals

- **`viewer/fqdn.cjs` (new)** — loads `infra_registry.json`, exports `fqdn(name)`→`<name>.<zone>` and
  `url(name,{path,proto,port})`→`<proto>://<name>.<zone>:<port><path>` (reuses each service's declared
  `proto`/`port`; correct for http/ws/rtmp/rtsp), reusing the exact `` `${s.name}.${REG.zone}` `` derivation
  from `infra.cjs:275/344`. `require()`d by `launcher.cjs`, `command_center.cjs`, `discovery.cjs`,
  `studio_stage.cjs`, and `infra.cjs` (refactor its two inline derivations to call it). `publisher.cjs` has no
  Category-A literal — helper optional there.
- **Conversion pattern (once; representative sites, not exhaustive):** raw-IP literal → `fqdn('svc')`/`url('svc')`:
  - `command_center.cjs` — `LAN_IP`(:32)→`fqdn("cams")`; `COLONY_HOST`(:38)→`fqdn("colony")`;
    `rtmp://…149:1935`(:490-491)→`url("relay")`; ssh host(:937)→`uni@${fqdn("glass")}`.
  - `command_center.html:545` `.lanip` → set from the server (`s.camsFqdn`).
  - `studio_stage.cjs` — `COLONY_HOST`(:39) / `url("colony")`(:63) / `url("masterplan")`(:64).
  - `discovery.cjs:21-24` → `url("cams")` / `url("colony",{path:"/stream"})` / `url("glass",{path:"/glass/"})` /
    `url("masterplan")`.
  - `launcher.cjs:26-32` → `fqdn("cams"|"relay"|"glass"|"colony")`.
  - `studio_up.ps1:177,361` + `studio_channels.ps1:46-47` + `launch_channels.ps1:18` (PowerShell can't
    `require`): add a 2-line JSON loader (`$REG=…|ConvertFrom-Json; function Fqdn($n){"$n.$($REG.zone)"}`) and use
    `Fqdn 'colony'` / `Fqdn 'cams'` / `Fqdn 'glass'` (ASCII-only — satisfies `ascii_lint`).
- **Stays an IP (bootstrap independence):** `infra_registry.json` (declared data), `infra.cjs:272`
  (DNS-bootstrap resolver), **`infra.cjs:21`** (the drift-checker's own SSH read — circular if it depended on the
  DNS it validates), `apply_nrpt.ps1`/`diag_dns.ps1` resolver/diagnostic addrs, `mediamtx_local.yml` ACL CIDRs
  (IP-matched, not name-able).
- **Delete, don't convert (retired, IP-carrying):** pubgate (`production/guest/pubgate/*`,
  `…/systemd/uni-bcast-pubgate.container`), node2-mixer + headless-OBS
  (`…/systemd/uni-bcast-mixer.container`, `production/containers/Containerfile.obs`, `obs-entrypoint.sh`), and —
  verify-then-delete — the pre-command_center `viewer/studio.cjs` if unlaunched.
- **Hard sequencing dependency:** names resolve only after **dnsmasq (`uni-dns`) is up on the chip** (production/dns
  Phase 3 + `:53` accept), the chip resolv.conf cutover, and THINKER's NRPT rule (`apply_nrpt.ps1`). **Convert
  AFTER DNS is proven** — gate the merge on `infra.cjs` `dnsSetupClosure().closed === true` (all declared names
  resolve to declared IPs). On-LAN guest cameras are covered by mDNS/avahi regardless.
- **Gate:** `grep -rIn` for the fleet IP ranges across `viewer/` returns only the registry + the named
  bootstrap/resolver exceptions; `hub.html` (the DNS-native reference) and every tool resolve by name;
  `/api/infra .dnsSetup.value.closed == true`.

### WS3 — Remote-source hardening: PIN 2077 + off-LAN approval + Tailscale WAN + DNS cert

Gate fires **only on the new-stream event** (bare `POST /camN/whip`, `publisher.cjs:56-57` → `proxyWhip`);
trickle/teardown (`PATCH/DELETE …/session`) + `OPTIONS` pass straight through.
- **PIN** — `const PIN = process.env.UNI_PUBLISH_PIN || "2077"` (operator-overridable, never git). `pub.html`
  sends it as request header **`X-UNI-Pin`** (header not query — stays out of URLs/logs) on the WHIP-offer POST;
  wrong/absent → **401**. Strip `X-UNI-*` headers in `proxyWhip` before forwarding to MediaMTX.
- **LAN/off-LAN classifier** (dependency-free helper on `req.socket.remoteAddress`, handles `::1` +
  IPv4-mapped `::ffff:`): trusted = `127.0.0.0/8`, `10.190.245.0/24`, `192.168.0.0/16`, `10.89.0.0/16` → PIN ⇒
  **start immediately**. **Tailscale `100.64/10`, wg `10.13.13/24`, public, and any real IPv6 fall through to
  "off-LAN"** by not being in the set ⇒ PIN **and** operator approval. This is the leaked-PIN defense.
- **Approval queue (202 + retry)** — off-LAN offer w/ valid PIN → `202 {pending, token}`; publisher holds
  `pendingApprovals` (2-min TTL). `pub.html` polls same-origin `GET /approvalstatus?token=`; on `approved` it
  re-POSTs the same offer with `X-UNI-Approval: token`; `denied`/`expired` → terminal. Operator side on loopback
  `:8095`: `GET /pending`, `POST /approve {token}`, `POST /deny {token}` (reuse the `:8095 /cue` body-read
  pattern). `command_center.cjs`: add `approvals` to `/api/state`, `POST /api/approve` + `/api/deny` behind the
  `x-uni-cc` fence. `command_center.html`: a **prominent top banner** (leaked-PIN defense — not a buried panel),
  one row per pending "Slot N · label · ip · [APPROVE] [DENY]", on the existing 2 s refresh.
- **CLOSE the `:8889` bypass (`mediamtx_local.yml`) — REQUIRED, or the gate is moot.** MediaMTX's
  `webrtcAddress: :8889` binds all interfaces with any-IP publish to cam1..10, so a Tailscale peer could publish
  directly to `:8889/camN/whip` and skip the `:8443` PIN/approval gate. Fix: **`webrtcAddress: 127.0.0.1:8889`**
  (signaling loopback-only; media still flows over `webrtcLocalUDPAddress :8189/udp` via
  `webrtcIPsFromInterfaces` — Tailscale-safe). Keep inbound TCP `:8443` + UDP `:8189` open on the tailnet iface.
- **Tailscale WAN URLs — two names, NO split-DNS (decision resolved).** On-LAN guest:
  `https://cams.uni-lab.local:8443/` (resolves via **mDNS/avahi**, zero client config). Off-LAN guest:
  `https://thinker.[redacted: client-identifier].ts.net:8443/` (**MagicDNS**, zero config, routes over WireGuard). Split-DNS is
  neither needed nor sufficient — dnsmasq doesn't bind the tailnet IP, and `cams.uni-lab.local` maps to
  THINKER's LAN IP, unroutable for a remote peer; MagicDNS already returns the right tailnet address. Both names
  go in the cert SAN.
- **DNS cert** — `gen_auto_cert.ps1:52` SAN → `DNS:cams.uni-lab.local, DNS:thinker.[redacted: client-identifier].ts.net,
  DNS:localhost` (+ loopback IPs for back-compat). One-time `-Force` regen + re-accept per machine (the >30-day
  idempotency guard skips otherwise). MediaMTX `:8889` serves the same `auto.crt`, so the names cover it too.
- **Latent bug w/ real impact** — `command_center.cjs:473` reads `v.at`; `/registrations` emits `ageMs`, so
  `liveCams` is ALWAYS empty and **Broadcast-Test Stage 4 (cameras+fan-out) never enumerates any publisher
  today**. Fix to `v.ageMs`.
- **Gate:** page 200; PIN-less POST → 401; LAN PIN POST → proxied; off-LAN (Tailscale) PIN POST → 202 pending →
  in `/pending` + command_center banner → APPROVE releases / DENY → 403; direct `:8889` off-LAN publish refused;
  cert validates by name; all 10 slots publish.

### WS4 — Finish the half-built studio features + kill latent bugs (GAPS/blockers that are studio-scoped)

From `production/docs/GAPS_REGISTER.md` + `RELEASE_READINESS.md` blockers, the **studio-scoped** ones only:
- **OFF AIR one-click** (already fixed `e52d8bc`) — keep; add to the acceptance sweep.
- **Music bed** on program with volume + on/off (WS1 #4 makes it durable) — operator control in the console.
- **Run-of-show UI** surfaced (`production/run-of-show/GUIDE.md` contract) — confirm it drives real verbs.
- **restream.ps1 fan-out durability** (ADR-014) — supervised, survives a drop; `-Status` gate
  `path=uni ready=True readers=2` + `ffmpeg pushers alive: N (stable)`.
- **Boot-persistence** — every studio component a supervised tray/watchdog or host service; proven across a
  reboot onto canonical bytes (`systray_watchdog.ps1`).
- **Panic + DR rehearsals** (`RUNBOOK_PANIC.md` / `RUNBOOK_DR.md`) — the receipts they owe (G-STOP, G-DR).
- **Bugs:** `command_center.cjs` `v.at`→`ageMs` (WS3); any other latent ones surfaced.
- Explicitly **not here:** anything FE-engine or science-lineage (other agent).

### WS5 — CLAUDE.md rewrite (DONE 2026-07-13)

Added to `CLAUDE.md` + `docs/WORKING_LOGIC.md`: the two-track split (studio vs science agent), the VFE/EFE/OODA
working logic tied to real code, DD+TDD as the method, the NO-IP rule + `fqdn.cjs`, and the remote-source
security model; fixed the ADR-013 pending→Accepted drift; pointed at this in-repo plan. Refresh CLAUDE.md's
"Current status" block to the measured post-plan truth as the later workstreams land.

### WS6 — The full PUBLIC live broadcast test (acceptance — task #19)

- **Public is the only option** (owner-binding) — never private/unlisted as the acceptance path.
- Extend the existing `runBroadcastTest()` (`command_center.cjs`, `POST/GET /api/broadcast_test`) to **sweep
  every scene/layout, every camera (incl. the colony world-view + all remote slots present), every music feed,
  and color bars (SMPTE)** — a single automated pass with per-stage evidence.
- **GO LIVE is human-typed** (`golive CONFIRM`, gate G-PA); **OFF AIR is one-click**.
- Fan-out via THINKER-local `restream.ps1` (ADR-014) to YouTube + Twitch; keys only in the operator ENV /
  `/etc/uni/runtime.env`, never git, never held by an agent.
- **Gate:** the sweep completes green end-to-end on the real hardware at the 720p30 floor; public egress shows
  `readers=2`; the run is recorded as a gate row + receipt. This is the definition of done for the whole plan.

### WS-Gaia — parallel/additional deliverable: the world-visibility organ (built + landed green, 2026-07-13/14)

**Not a WS0–WS6 substitute — a new, additional studio-track surface that sits alongside them, not in their
execution-order sequence.** It does not advance WS1–WS4/WS6 (the broadcast stack is still DOWN — see "Measured
starting state" above) and it is not required to unblock any of WS0–WS6. It shares this plan's discipline
(DD+TDD, NO-IP, gate-not-process-existence) and lives entirely on the studio side of the scope fence.

- **What it is:** `viewer/gaia/**` — a READ-ONLY, SIGNAL-ONLY MCP + UI (served on THINKER, `:8096/gaia`) that
  mirrors every track (repo/git, gate ledger, infra registry, science-source excerpts, studio probes, colony
  probes, sessions, its own code, drift) as direct signals with full provenance, never a summary/score/verdict.
  Canonical doc, full detail: **`docs/GAIA.md`** — read that, not this entry, for the mechanism, the MCP tool/
  resource list, and the litigation-hold (WORM) design for colony-mind evidence.
- **Where it sits relative to WS0–WS6:** additive only. It touches no FE-engine code and sets no science gate
  (same fence this whole plan already draws). It does not change any WS0–WS6 file, gate, or execution order.
- **Verified state (gate ledger `evidence/gates.ndjson`, do not re-derive without re-running the gates):**
  `gaia-slice1-live` → PASS; `gaia-litigation-hold` → PASS; `gaia-boot-persistent` → PARTIAL (crash-restart and
  boot-launcher cold-start are PROVEN; the literal power-cycle reboot leg is PENDING until the next real reboot
  — `viewer/gaia/gaia_boot_proof.ps1` will auto-confirm it when that happens, no human judgment needed).
- **Time-sensitive cross-track note:** Gaia's litigation-hold work surfaced a MANDATORY capture-before-destroy
  procedure for the colony's brain state ahead of any v2→v3 redeploy — `docs/handoffs/
  GAIA_CAPTURE_BEFORE_DESTROY_2026-07-14.md`. That procedure is the **science/OS-mind agent's** action item, not
  this plan's; noted here only so a studio-track reader routes it correctly rather than losing it.

---

## Execution order

1. **WS5 CLAUDE.md** (orient the executing chat first — DONE) → 2. **WS0 docs-true** → 3. **WS2 NO-IP + dnsmasq
   resolve** (names must resolve before hardening/URLs depend on them) → 4. **WS1 persist-to-code** (chip
   quadlets + studio_stage + GPU) → 5. **WS3 remote hardening** → 6. **WS4 finish features/bugs** → 7. **WS6
   full public live test**. One cure at a time; each step updates its doc + records its gate before the next.
   (WS-Gaia runs in parallel to this sequence, not as a numbered step in it — see WS-Gaia above.)

## Verification (the gates ARE the tests — never claim from process existence)

- Overlays: `node viewer/verify_overlays.cjs` exit 0 + `overlay_proof.png`.
- Colony count-consistency: `node viewer/verify_colony.cjs 10.190.245.122` PASS.
- Driver: fresh `/producer/health` = `verdict=LIVE, driver=producer` + frame-advance.
- Relay: `restream.ps1 -Status` → `path=uni ready=True readers=2` + `ffmpeg pushers alive: N (stable)`.
- NO-IP: `grep -rn` IPv4 → only registry + bootstrap.
- Remote: on-LAN PIN publish immediate; off-LAN PIN publish → pending approval → slot on approve; wrong PIN 401.
- Reboot-persistence: full teardown + fresh boot reproduces the whole studio with zero manual patching.
- Acceptance: the full **public** broadcast sweep green on hardware, recorded as a gate row + receipt.

## Decisions (resolved — no open ambiguity)

- **WAN transport = Tailscale, two zero-config names, no split-DNS.** On-LAN `cams.uni-lab.local` (mDNS/avahi),
  off-LAN `thinker.[redacted: client-identifier].ts.net` (MagicDNS). (Measured + routing-analysed.)
- **Approval hold = 202 + retry** (robust to unbounded human delay; clean cancelable "waiting" UX), not a
  long-held socket.
- **Science track = separate agent.** This plan forces no FE-engine change and no science gate.
