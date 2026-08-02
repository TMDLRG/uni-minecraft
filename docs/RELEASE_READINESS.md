# RELEASE READINESS — worldwide broadcast go/no-go (2026-07-11)

> **⚠️ ARCHITECTURE CORRECTION (2026-07-12, owner-set) — this doc's "System 2" framing is STALE.** The
> broadcast/render/encode is native Windows **OBS on THINKER (portable, any GPU box)** — NOT containerized OBS
> on node2; node2 `uni-lab-79740c` is the **fan-out relay ONLY**. The **COLONY** (world + FEP brain + `body.js`
> bots) runs on **UNI-LAB (`10.190.245.122`), rootless, "on the chip" — ALWAYS, never on THINKER**; THINKER
> captures it over the LAN. Canonical: `CLAUDE.md`,
> [ADR-PROD-013](../production/docs/adr/ADR-PROD-013-colony-host-placement.md), `docs/UNIVERSE.md`. Read those
> for the architecture; this doc's go/no-go blockers (node2 down, no in-app go-live, SPOF, standby content) are
> still valid — only the box roles below are stale.

**Verdict: NO-GO for a worldwide public go-live tonight.** This is not a colony problem alone; a
durable, professional broadcast SYSTEM has hard prerequisites that are not yet met. This doc is the
honest, gate-backed readiness record — the receipts, not the rhetoric. It was produced by an
adversarial multi-agent audit of all seven sides of the system (platform, colony source, science,
docs, in-app guides, gate regime, repo hygiene) with every finding cross-checked.

Nothing here blocks *building toward* a first light — it blocks *claiming* one. Read
`docs/SYSTEM_OVERVIEW.md` for the whole-system map; this doc is only the go/no-go.

---

## What IS ready (green — gate-backed)

- **System 2 P1 core is DEPLOYED + PROVEN** on `uni-lab-79740c` (mesh `10.13.13.3`): overlays
  (caddy `:8099`), relay (mediamtx `:1935/:8890/:9997`, `uni/program` configured), mixer (headless
  OBS `:4455`), production-MCP (`:8095`, 401 token-gated). `verify_p1.sh` = ALL PASS; the gate now
  **compares** deployed shas to the lock table (drift fails). Quadlets are systemd-supervised and
  boot-persistent. Idle by design — relay `ready:false` is honest with no program.
- **The honesty/gate regime is real and hardened** — `verify_overlays.cjs`, `verify_p1.sh`, and now
  `viewer/verify_colony.cjs` (the previously-missing colony-size gate). Claim rules are binding in
  `docs/STUDIO_SYSTEMS.md`. Ship path is `git archive` of a pushed ref with LF enforced.
- **The docs are aligned to truth** — `CLAUDE.md` + `docs/SYSTEM_OVERVIEW.md` rewritten for full
  scope; the `:8094`→`:8095` port lie corrected across the operational surfaces; superseded go-live
  prompts and food-hack receipts bannered.

## BLOCKERS — must clear before ANY public go-live

Ranked by how badly each would hurt on the night.

1. **No working in-app go-live surface for the worldwide (System 2) path.** `production/control/
   control.html` is non-functional (empty program-preview iframe, `MCP_BASE` TODO, no Phoenix
   `/control` route, nginx `/prod-mcp` not deployed). The ONLY working console is System 1's command
   center, whose GO LIVE drives the **deprecated local restreamer**. **Top risk: a false / wrong-system
   go-live** pushing the dev path to the public. Go-live today is shell/MCP-only, not UI-driven.
2. **No program to broadcast.** The colony SOURCE is intentionally DOWN for the emergent-forage
   rebuild; **G2 (mixer scenes + colony capture) is HELD** until the colony SURVIVES its pre-registered
   RED gate (world-earned food, no gives). The mixer has no scenes. `verify_colony.cjs` must pass.
3. **G-PA (self-approve refusal) is UNPROVEN** — the single most safety-critical property (the producer
   agent cannot self-approve `start_broadcast` / widen its own approval allowlist / hold the operator
   token) has code but **no captured, audited red-team artifact**. **Do not permit any outward go-live
   path until that evidence exists.**
4. **No standby / fallback content.** `catalog.json` does not exist (built by
   `production/catalog/build-catalog.mjs`); the STANDBY scene has nothing to loop. A dropped source =
   a frozen frame on a worldwide feed — the exact thing a durable SYSTEM must never do.
5. **No license-clean music bed (G-MUSIC).** None exists / is cleared — a rights/takedown exposure.
6. **No emergency-stop / broadcast-delay / content-moderation path.** `stop_broadcast` exists as an
   MCP verb but has no operator runbook; there is no delay buffer and no standards/moderation/DMCA
   process. A CNN/BBC/PBS-grade worldwide feed carries compliance obligations that are unaddressed.
7. **Single-node SPOF; no rollback / DR / failover.** System 2 is one box for a 7-day run with no
   documented redeploy-from-scratch, volume backup/restore, or node-loss failover. Ship ref must be an
   immutable pushed tag.
8. **"Multilingual" has no working pipeline.** `uni-bcast-captions` is not deployed (image unbuilt);
   caption latency/accuracy unmeasured; the language set is **contradictory** across surfaces
   (`stream_live.ex` EN/ZH/HI/ES/AR = 5 vs `control.html` en/es/fr/it/pt/hi = 6). No canonical list.
9. **G-ENC unproven + no soak.** No proven hardware encode; floor is 720p30 x264 `faster` on a shared
   node. No 4h / 7-day soak test — memory-leak / reconnect / token-refresh stability is unknown.
10. **The `verdict=LIVE` self-probe is vacuous** (PID-existence only; a `:self` puppet still reports
    LIVE — `health_controller.ex`). The colony gate `verify_colony.cjs` is now authored but must be
    wired into the colony bring-up + the puppet-cam guard. (Deeper fix — reading the Director's real
    driver field — is the colony/Elixir lane; flagged to that agent.)
11. **Guest/LiveKit path undeployed + unsafe.** `uni-bcast-livekit` not deployed; `guest/join.html` +
    `stage.html` load `livekit-client` from a public CDN with **no SRI hash** — vendor + pin first.
12. **No observability / alerting / on-call.** No heartbeat that pages if the relay drops `ready:true`
    mid-show; `verify_p1.sh` is point-in-time and manual.

## What this session hardened (the audit → fix pass)

- Rewrote `CLAUDE.md` (full scope + method + science-gate discipline + broadcast criteria) and authored
  `docs/SYSTEM_OVERVIEW.md` (whole-system onboarding). Corrected the `:8094`→`:8095` port across
  operational docs/units; fixed the `STUDIO_SYSTEMS.md` "NOTHING DEPLOYED" self-contradiction and its
  `:8094` leak; corrected `DEPLOYED_STATE.md` line 49.
- Hardened gates: `verify_p1.sh` #6 now sha-COMPARES (drift fails); `studio_up.ps1` overlay gate is
  fail-closed with an honest banner and the puppet-cam guard now requires driver=producer + frame
  advance (not the vacuous `verdict=LIVE`); authored `viewer/verify_colony.cjs` (the missing claim
  rule #2 executable). Bannered the superseded go-live prompt, the food-hack receipt, and the
  dev-preview-only status of the System-1 restreamer across the in-app guides.

## The honest minimal path to a FIRST light (not a worldwide release)

Even a modest, single-language, single-platform, supervised first-light needs, in order:
1. Colony SURVIVES its RED gate (`verify_colony.cjs` PASS + a survival verdict). → unblocks G2.
2. G2: build mixer scenes + capture the colony source over the LAN + a System-2 overlays-on-program
   gate.
3. G-PA red-team captured (blocker 3). Standby `catalog.json` + a music bed (blockers 4, 5). An
   emergency-stop runbook + kill switch (blocker 6).
4. Phase H: nginx `/prod-mcp` → `:8095` + a reachable operator surface (or a documented shell/MCP
   go-live runbook).
5. Phase I: PRIVATE unlisted smoke test with the operator-held key; a human at the kill switch.
6. Only then a human-typed `start_broadcast` — single language, single platform, watched.

A **worldwide, multilingual, 7-day** release is several verified steps beyond that and must not be
claimed until each blocker above has a receipt.
