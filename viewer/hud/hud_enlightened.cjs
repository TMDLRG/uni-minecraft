// hud_enlightened.cjs -- THE ENLIGHTENED SIGHT: detectors that catch the
// "green but lying" class of failure so all can heal and maintain resonance.
//
// The HUD is a downstream READ-ONLY observer (per its design fence and the
// broader CLAUDE.md "reads never actuate" law). Detectors return FINDINGS
// with locators — they never repair, never mutate, never call heal verbs.
// A finding is a truth-share; healing belongs to a separate seat.
//
// Every finding carries:
//   { code, severity, title, detail, source, since_ms }
// where:
//   code       = kebab-case slug like "obs-sentinel-present"
//   severity   = "info" | "warn" | "bad"
//   title      = one-line human summary
//   detail     = concrete data ("3 sentinel files: run_a, run_b, run_c")
//   source     = the underlying signal locator (for provenance)
//   since_ms   = how long this finding has been true (0 for a fresh one)

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// -------- OBS sentinel: crash-marker rot detection --------------------
// Per CLAUDE.md: OBS force-kills leave orphan `.sentinel/run_<uuid>` files;
// next start declares a crash -> Safe Mode -> obs-websocket skipped.
// This detector SEES the rot; healing (deleting the .sentinel dir) is
// studio_up.ps1's job at the moment of OBS launch.
//
// SERVICE-ACCOUNT NOTE: when the HUD runs as a Windows Service under
// LocalSystem, process.env.APPDATA points at the SYSTEM profile
// (C:\Windows\system32\config\systemprofile\AppData\Roaming) rather than
// the operator's %APPDATA% where OBS actually writes. hud_service_install.ps1
// captures $env:USERPROFILE at install time and sets HUD_OPERATOR_HOME as
// a service env var. We honor that first.
function obsSentinelFinding() {
  const opHome = process.env.HUD_OPERATOR_HOME;
  const appData = opHome ? path.join(opHome, "AppData", "Roaming")
                        : (process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"));
  const sentinelDir = path.join(appData, "obs-studio", ".sentinel");
  const source = `file://${sentinelDir}`;
  let entries;
  try { entries = fs.readdirSync(sentinelDir); }
  catch (e) {
    if (e.code === "ENOENT") return null; // clean
    return { code: "obs-sentinel-unreadable", severity: "info", title: "OBS sentinel dir unreadable",
             detail: e.message, source, since_ms: 0 };
  }
  const runFiles = entries.filter((n) => n.startsWith("run_"));
  if (runFiles.length === 0) return null;
  return {
    code: "obs-sentinel-present",
    severity: "warn",
    title: `OBS crash-marker present: next OBS start will Safe-Mode`,
    detail: `${runFiles.length} sentinel file(s): ${runFiles.slice(0, 3).join(", ")}${runFiles.length > 3 ? " ..." : ""}. Heal: studio_up.ps1 removes .sentinel/ on start (self-heal). Never hand-launch OBS.`,
    source,
    since_ms: 0,
  };
}

// -------- contradictions: fabric lies --------------------
// One tile says up=true but its detail mentions 'down', 'UNREACHABLE', etc.
// The stack says UP but ~zero tiles are up. journey step is reboot_* but
// studio is up. Producer up but colony count is 0. Any door with circle broken.
function contradictionsFromSnapshot(snapshot, sinceMap, now) {
  const out = [];
  const studioPorts = snapshot.studio_ports || {};
  const door_open = snapshot.door_open || {};
  const stackState = snapshot.stack && snapshot.stack.state;
  const journey = snapshot.journey_current_step;

  // (a) tile up=true but detail contains 'down|UNREACHABLE|failed|not reachable'
  for (const [key, t] of Object.entries(studioPorts)) {
    if (t && t.up === true && /down|UNREACHABLE|failed|not reachable|refused/i.test(String(t.detail || ""))) {
      out.push(mark({
        code: `tile-lies-up-${key}`, severity: "bad",
        title: `Tile '${key}' claims UP but its own detail says otherwise`,
        detail: `up=true, detail="${t.detail}"`,
        source: "launcher /api/mission tile", now, sinceMap,
      }));
    }
  }

  // (b) stack=UP but <2 tiles up (fabric-wide lie)
  if (stackState === "UP") {
    const tilesUp = Object.values(studioPorts).filter((t) => t && t.up === true).length;
    if (tilesUp < 2) {
      out.push(mark({
        code: "stack-up-but-nothing-up", severity: "bad",
        title: `stack=UP but only ${tilesUp} tiles are up`,
        detail: `launcher's own stack roll-up disagrees with its own tiles`,
        source: "launcher /api/mission .stack vs .tiles[]", now, sinceMap,
      }));
    }
  }

  // (c) journey step is reboot_* but studio ports include something UP
  //     (during a reboot the studio should be OFF)
  if (journey && /^reboot_|^prep_close_/i.test(journey.id || "")) {
    const studioUp = ["obs","mediamtx","overlays","console","publisher"].filter((k) => studioPorts[k] && studioPorts[k].up === true);
    if (studioUp.length > 0) {
      out.push(mark({
        code: "journey-reboot-but-studio-up", severity: "warn",
        title: `journey step ${journey.id} expects studio OFF but ${studioUp.length} studio port(s) are UP`,
        detail: `up during reboot/close prep: ${studioUp.join(", ")}`,
        source: "door /api/door/journey vs launcher /api/mission", now, sinceMap,
      }));
    }
  }

  // (d) producer_up latest = 1 but the colony detail contains colony_count=0
  //     (that is the "LIVE but empty colony" honest-substrate lie)
  const producerRing = snapshot.metrics && snapshot.metrics.producer_up || [];
  const lastProducer = producerRing.length ? producerRing[producerRing.length - 1] : null;
  const colonyTile = studioPorts.colony;
  if (lastProducer === 1 && colonyTile && /colony_count=0(\s|$)/.test(colonyTile.detail || "")) {
    out.push(mark({
      code: "producer-live-but-empty-colony", severity: "bad",
      title: `producer verdict=LIVE but colony_count=0 (LIVE-but-empty is the fake-life class)`,
      detail: `${colonyTile.detail}. Empty colony with LIVE verdict = fake life; the science seat must reconcile.`,
      source: "hud ring producer_up + /api/mission colony tile", now, sinceMap,
    }));
  }

  // (e) any door with circle_ok=false
  for (const [k, d] of Object.entries(door_open)) {
    if (d && d.circle_ok === false) {
      out.push(mark({
        code: `door-circle-broken-${k}`, severity: "bad",
        title: `door '${k}' circle BROKEN (its 4 vectors don't form a coherent state machine)`,
        detail: d.prediction || "(no prediction)",
        source: "door /api/door/state", now, sinceMap,
      }));
    }
  }

  // (f) on-air-but-no-egress: latest stack=UP with an "air-*" hint in studio_ports.console.detail
  //     but no readers/telemetry evidence. (We can't fully verify egress from the HUD without
  //     an extra probe; this checks the console's air line + the relay tile as a first pass.)
  const consoleTile = studioPorts.console;
  if (consoleTile && consoleTile.up === true && /air=(LIVE_LIVE|STREAMING)/i.test(consoleTile.detail || "")) {
    const relayTile = studioPorts.relay;
    if (!relayTile || relayTile.up !== true) {
      out.push(mark({
        code: "on-air-but-no-relay", severity: "bad",
        title: `console reports on-air but relay is not reachable (no public egress possible)`,
        detail: `console detail: "${consoleTile.detail}"; relay tile: ${JSON.stringify(relayTile)}`,
        source: "launcher /api/mission console + relay tiles", now, sinceMap,
      }));
    }
  }

  return out;
}

// -------- runaway watch: is the poll loop dead? is a probe flatlined? -------
function runawayFindings(hudState, snapshot, now, sinceMap) {
  const out = [];
  const rings = hudState.rings || {};

  // Poll loop dead: last_poll_at older than 3x poll interval
  const lastPoll = hudState.last_poll_at;
  const poll_ms = hudState.poll_interval_ms || 3000;
  if (lastPoll && (now - lastPoll) > 3 * poll_ms) {
    out.push(mark({
      code: "poll-loop-stalled", severity: "bad",
      title: `HUD poll loop stalled -- last poll was ${Math.round((now - lastPoll) / 1000)}s ago (>${(3 * poll_ms) / 1000}s threshold)`,
      detail: `snapshot data is stale; upstreams may be blocked or the HUD process is hung`,
      source: "hudState.last_poll_at", now, sinceMap,
    }));
  }

  // Flatlined probe: last 30 samples of a latency ring are all identical (impossible unless probe is stuck)
  ["launcher_latency_ms", "gaia_latency_ms"].forEach((k) => {
    const values = (snapshot.metrics && snapshot.metrics[k]) || [];
    const recent = values.slice(-30).filter((v) => v != null);
    if (recent.length >= 10 && new Set(recent).size === 1) {
      out.push(mark({
        code: `probe-flatlined-${k}`, severity: "warn",
        title: `${k} has flatlined at ${recent[0]}ms for the last ${recent.length} polls`,
        detail: `identical value repeated ${recent.length} times = probe is cached, mocked, or the upstream is frozen`,
        source: `hud metrics.${k}`, now, sinceMap,
      }));
    }
  });

  return out;
}

// -------- journey stuck: current step > 20 minutes old ----------------------
function journeyStuckFinding(snapshot, doorJourneyBody, now, sinceMap) {
  const j = snapshot.journey_current_step;
  if (!j) return null;
  // door_journey.state() exposes armedAt on manual-detect steps. Look for the raw
  // step in the passed-through body if we have it; else no verdict.
  const steps = (doorJourneyBody && doorJourneyBody.steps) || [];
  const step = steps.find((s) => s.id === j.id);
  if (!step) return null;
  // We only meaningfully know age for manual-detect steps (armedAt). For auto
  // steps whose completion signal is a probe, we can't infer age from here.
  const armedAt = step.armedAt;
  if (!armedAt) return null;
  const ageMs = now - Date.parse(armedAt);
  if (ageMs > 20 * 60 * 1000) {
    return mark({
      code: "journey-step-stuck",
      severity: "warn",
      title: `journey step '${j.id}' has been current for ${Math.round(ageMs / 60000)} min (>20 min threshold)`,
      detail: `armed at ${armedAt}; either the operator hasn't performed the manual action or the auto-detect condition never fired`,
      source: "door /api/door/journey step.armedAt", now, sinceMap,
    });
  }
  return null;
}

// -------- upstream unreachable: not "green but lying" -- honest DOWN ---------
// Complements the contradictions: if a key upstream is DOWN, surface it as info
// (not bad) so the HUD's own status stays coherent.
function upstreamFindings(snapshot, now, sinceMap) {
  const out = [];
  const ups = snapshot.upstreams || {};
  for (const [name, u] of Object.entries(ups)) {
    if (u && u.up === null) {
      out.push(mark({
        code: `upstream-unreachable-${name}`, severity: "info",
        title: `upstream '${name}' unreachable`,
        detail: u.err || "no error message",
        source: u.url || `upstream ${name}`, now, sinceMap,
      }));
    }
  }
  return out;
}

// helper: attach since_ms via a persistent map keyed by code
function mark({ code, severity, title, detail, source, now, sinceMap }) {
  const first = sinceMap.get(code);
  if (first == null) sinceMap.set(code, now);
  const since_ms = now - sinceMap.get(code);
  return { code, severity, title, detail, source, since_ms };
}

// -------- top-level: gather every finding -----------------------------------
// SCOPE FENCE: this runs in the SERVICE context (LocalSystem). Detectors here
// must not depend on the operator's user profile. OBS-sentinel detection
// (which requires reading %APPDATA% of a specific user, and Windows enforces
// a per-user visibility fence that LocalSystem cannot cross for some app-
// created dirs) lives in the USER-MODE helper viewer/hud/hud_user_sight.ps1
// which POSTs findings to /api/hud/sight/push. The module still exports
// obsSentinelFinding() so the helper can reuse the same logic, but gather()
// itself does not call it.
function gather(snapshot, hudState, doorJourneyBody, sinceMap) {
  const now = Date.now();
  const findings = [];
  findings.push(...contradictionsFromSnapshot(snapshot, sinceMap, now));
  findings.push(...runawayFindings(hudState, snapshot, now, sinceMap));
  const j = journeyStuckFinding(snapshot, doorJourneyBody, now, sinceMap);
  if (j) findings.push(j);
  findings.push(...upstreamFindings(snapshot, now, sinceMap));

  // Drop stale sinceMap entries for codes we no longer see
  const active = new Set(findings.map((f) => f.code));
  for (const k of [...sinceMap.keys()]) if (!active.has(k)) sinceMap.delete(k);

  return {
    updated_at: new Date(now).toISOString(),
    total: findings.length,
    counts: {
      bad:  findings.filter((f) => f.severity === "bad").length,
      warn: findings.filter((f) => f.severity === "warn").length,
      info: findings.filter((f) => f.severity === "info").length,
    },
    findings,
  };
}

module.exports = { gather, obsSentinelFinding, contradictionsFromSnapshot, runawayFindings, journeyStuckFinding, upstreamFindings };
