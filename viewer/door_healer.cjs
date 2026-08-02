// door_healer.cjs — THE HEALER: the Door brings the studio to healthy ON ITS OWN, no LLM, no click.
// A durable active-inference OODA loop (the same VFE/EFE/OODA the colony runs), applied to the studio:
//
//   OBSERVE  — the sense line: probe every studio surface + the overlay spool (measured, never
//              process-existence).
//   ORIENT   — minimise VFE: diff the observed state against the healthy prior; the gap per surface is
//              the prediction error (surprise).
//   DECIDE   — minimise EFE: choose the ONE remediation that most reduces the gap toward the healthy
//              target C, under the fences. Pragmatic = moves toward "studio broadcast-ready"; epistemic
//              = fixes the ROOT (a down mixer is higher surprise than a stale caption, so bring the
//              whole stack up coherently before fiddling a leaf).
//   ACT      — drive the Port: the coherent bring-up (ONE KEY OPEN ALL -> studio_up.ps1) or the cheap
//              leaf fix (re-seed a torn overlay spool). One cure at a time; idempotent; recorded.
//
// FENCES (this ACTUATES — burned-in lessons):
//   * NEVER runs inside a polled read (the 2026-07-14 OBS-spawn-loop lesson). It is a supervised loop
//     of its own; door_journey.state() stays a pure observer that only REPORTS what the healer achieved.
//   * NEVER touches a LIVE stream: if air is STREAMING, the healer only observes — it will not restart
//     OBS/console under the audience. It heals pre-air / off-air.
//   * NEVER presses GO LIVE (G-PA stays human) and never holds a key.
//   * ONE cure at a time with a per-remediation cooldown, so it cannot stack studio_up shells.
//   * The colony/network layer (colony by name, DNS, chip firewall) is the OS/beacon limb's to heal —
//     the Door OBSERVES it and reports, but does not mutate the chip from here.
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const doors = require("./door_lifecycle.cjs");
const buildIdentity = require("./build_identity.cjs");

const RUNTIME = path.join(__dirname, "runtime");
const LEDGER = path.join(RUNTIME, "door_healer.ndjson");
const SPOOL = path.join(RUNTIME, "broadcast.json");
const COLONY_NAME = "uni-lab-lan.uni-lab.local"; // resolve by NAME, never a transient IP literal

function tcp(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (done) return; done = true; try { s.destroy(); } catch (_) {} resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true)); s.once("timeout", () => fin(false)); s.once("error", () => fin(false));
    s.connect(port, host);
  });
}
function getJson(host, port, p, timeout = 2500) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: p, timeout }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve(JSON.parse(b || "null")); } catch (_) { resolve(null); } });
    });
    req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); }); req.end();
  });
}
function audit(entry) { try { fs.mkdirSync(RUNTIME, { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n"); } catch (_) {} }

// ---- OBSERVE: the sense line -----------------------------------------------------------------------
async function observe() {
  const [obs, mediamtx, consoleUp, overlaysUp, publisher] = await Promise.all([
    tcp("127.0.0.1", 4455), tcp("127.0.0.1", 9997), tcp("127.0.0.1", 8098), tcp("127.0.0.1", 8099), tcp("127.0.0.1", 8443),
  ]);
  let spool = { fresh: false, valid: false, ageS: null };
  if (overlaysUp) {
    const s = await getJson("127.0.0.1", 8099, "/state.json");
    if (s && s.updatedUtc) { spool.valid = true; spool.ageS = Math.round((Date.now() - new Date(s.updatedUtc).getTime()) / 1000); spool.fresh = spool.ageS < 15; }
  }
  // air (never disturb a live stream) + colony-by-name (observe only; the beacon heals the network)
  const air = await getJson("127.0.0.1", 8098, "/api/state");
  const streaming = !!(air && air.air && air.air.streaming);
  const [colonyCam, phoenix, producer] = await Promise.all([tcp(COLONY_NAME, 3020, 2000), tcp(COLONY_NAME, 4000, 2000), tcp(COLONY_NAME, 4200, 2000)]);
  return { obs, mediamtx, consoleUp, overlaysUp, publisher, spool, streaming,
    colony: { camByName: colonyCam, phoenixByName: phoenix, producerByName: producer } };
}

// ---- THE SECOND CLAUSE (Phase 9 step 1.1): identity staleness is ANNUNCIATED, never healed -------------
// A watchdog that only checks liveness can be fooled by a HEALTHY process running STALE bytes — the census of
// 2026-07-26 found this healer itself 50 commits behind. This clause makes the healer SEE that: it compares
// its own frozen boot commit (and the Door's served /api/identity) against LIVE HEAD and annunciates any lag.
// It is deliberately OUTSIDE observe()/orient()'s studio-health path and reaches NO action: a restart to adopt
// new bytes is a deploy step, the operator's to take, and NEVER taken automatically — least of all under air.
// Pure core: given each body's served boot commit and the live HEAD, which are behind? No IO, so it is
// deterministic and directly testable — and it reaches no action by construction.
function identityLag(bodies, live) {
  const out = [];
  for (const b of bodies) {
    if (!b.boot) out.push({ body: b.body, boot: null, live, behind: null, why: `${b.body} served no boot commit` });
    else if (live && b.boot !== live) out.push({ body: b.body, boot: b.boot, live, behind: true, why: `${b.body} running boot ${b.boot.slice(0, 12)} while HEAD is ${live.slice(0, 12)} — stale bytes` });
  }
  return out;
}

async function identityAnnunciations() {
  const bodies = [];
  // this healer's own process (a pure local read — no network, cannot throw into the loop)
  try { bodies.push({ body: "door_healer", boot: buildIdentity.identity().boot_git_commit }); } catch (_) {}
  // the Door on the same box, via its served identity (best-effort; a down Door is a studio gap, not an identity one)
  try { const d = await getJson("127.0.0.1", 8090, "/api/identity"); if (d) bodies.push({ body: "door", boot: d.boot_git_commit }); } catch (_) {}
  return identityLag(bodies, buildIdentity.liveGitHead());
}

// ---- ORIENT: the gap vs the healthy prior (prediction error) ---------------------------------------
function orient(s) {
  const gaps = [];
  // studio surfaces (ours to heal)
  if (!s.obs) gaps.push({ surface: "obs", severity: 3, why: "OBS mixer :4455 down — no encode/mix path" });
  if (!s.consoleUp) gaps.push({ surface: "console", severity: 3, why: "command center :8098 down — no operator surface" });
  if (!s.overlaysUp) gaps.push({ surface: "overlays", severity: 2, why: "overlay server :8099 down" });
  if (!s.mediamtx) gaps.push({ surface: "mediamtx", severity: 2, why: "MediaMTX :9997 down — no ingest/fan-out" });
  if (!s.publisher) gaps.push({ surface: "publisher", severity: 1, why: "camera gateway :8443 down" });
  if (s.overlaysUp && !s.spool.fresh) gaps.push({ surface: "spool", severity: 1, why: `overlay spool ${s.spool.valid ? "stale (" + s.spool.ageS + "s)" : "corrupt/unreadable"} — overlays will not verify` });
  // colony/network (observe + report; NOT ours to mutate from the Door)
  const colonyGaps = [];
  if (!s.colony.producerByName) colonyGaps.push("producer :4200 unreachable by name");
  if (!s.colony.camByName) colonyGaps.push("colony cam :3020 unreachable by name");
  if (!s.colony.phoenixByName) colonyGaps.push("phoenix :4000 unreachable by name");
  return { gaps, colonyGaps, healthy: gaps.length === 0 };
}

// ---- DECIDE: the ONE remediation minimising EFE, under the fences ----------------------------------
// cooldowns so a slow bring-up cannot be stacked
const cooldown = { bring_up_stack: 0, reseed_spool: 0 };
const COOL = { bring_up_stack: 130 * 1000, reseed_spool: 8 * 1000 };
function decide(s, o) {
  if (o.healthy) return null;
  // FENCE: never restart the stack under a live audience.
  if (s.streaming) {
    // the only live-safe heal is a leaf: a torn spool can be re-seeded without touching OBS.
    if (s.overlaysUp && !s.spool.fresh && Date.now() > cooldown.reseed_spool) return { action: "reseed_spool", reason: "spool stale/corrupt while LIVE — leaf fix only (never restart the mixer under the audience)" };
    return { action: null, reason: "LIVE — down surfaces need a stack action; will NOT restart under the audience. Observing." };
  }
  // ROOT-first (epistemic): if any core process surface is down, the coherent bring-up fixes them all.
  const coreDown = !s.obs || !s.consoleUp || !s.overlaysUp || !s.mediamtx || !s.publisher;
  if (coreDown && Date.now() > cooldown.bring_up_stack) {
    return { action: "bring_up_stack", reason: "core surface(s) down -> ONE KEY OPEN ALL (studio_up.ps1): the one coherent, idempotent bring-up that self-heals OBS + starts everything in order" };
  }
  // leaf: stack up but the spool is torn (the power-cut null-byte class) -> re-seed valid overlay state.
  if (s.overlaysUp && !s.spool.fresh && Date.now() > cooldown.reseed_spool) {
    return { action: "reseed_spool", reason: "stack up but overlay spool stale/corrupt -> re-seed a valid honest spool so overlays verify" };
  }
  return { action: null, reason: "gap present but the relevant remediation is on cooldown (one cure at a time — not stacking)" };
}

// ---- ACT: drive the Port ---------------------------------------------------------------------------
const HONEST_SPOOL = () => ({
  updatedUtc: new Date().toISOString(), source: "door-healer (self-heal)",
  onAir: { value: false, text: "LIVE" },
  lowerThird: { visible: true, kicker: "UNI COLONY — LIVE EXPERIMENT", title: "Active-inference agents in a real Minecraft world", subtitle: "Behaviour and viability-learning — never experience or consciousness", tone: "ok" },
  title: { visible: false, kicker: "", text: "", subtitle: "", tone: "ok" },
  ticker: [{ text: "Built in public — receipts beat rhetoric", tone: "accent" }],
  caption: { visible: false, lang: "en", text: "" },
  clock: { zones: [{ label: "UTC", zone: "UTC" }, { label: "SHOW", zone: "America/New_York" }] },
  music: { volume: 0.25, ducked: false }, nowPlaying: { segment: "Colony Live", lang: "en", clipId: null, layout: "fullframe" }, brand: "UNI",
});
async function act(remediation) {
  if (remediation.action === "bring_up_stack") {
    cooldown.bring_up_stack = Date.now() + COOL.bring_up_stack;
    try { await doors.verb("open", "all"); return { ok: true, did: "verb open all (studio_up.ps1 idempotent bring-up)" }; }
    catch (e) { return { ok: false, did: "verb open all FAILED: " + (e && e.message) }; }
  }
  if (remediation.action === "reseed_spool") {
    cooldown.reseed_spool = Date.now() + COOL.reseed_spool;
    try { fs.mkdirSync(RUNTIME, { recursive: true }); fs.writeFileSync(SPOOL, JSON.stringify(HONEST_SPOOL(), null, 2)); return { ok: true, did: "re-seeded valid overlay spool (broke the torn-write deadlock)" }; }
    catch (e) { return { ok: false, did: "reseed FAILED: " + (e && e.message) }; }
  }
  return { ok: false, did: "no-op" };
}

// ---- one OODA cycle (dry=true stops before ACT; used for reporting/tests) --------------------------
async function healOnce(dry) {
  const sense = await observe();
  const o = orient(sense);
  const decision = decide(sense, o);
  // THE SECOND CLAUSE: annunciate identity staleness every cycle, independently of studio health, and NEVER
  // act on it. This runs whether or not the studio is healthy and whether or not air is streaming — a stale
  // process is a truth to surface at all times, and surfacing it is the whole remedy the healer applies here.
  const annunciations = await identityAnnunciations();
  if (annunciations.length) audit({ event: "identity-stale-annunciate", annunciations, note: "ANNUNCIATE ONLY — never auto-restarted; adopting new bytes is a deploy step, never under air" });
  const report = { healthy: o.healthy, gaps: o.gaps.map((g) => g.surface + ":" + g.why), colonyGaps: o.colonyGaps, annunciations, streaming: sense.streaming, decision };
  if (o.healthy) { return Object.assign(report, { acted: null }); }
  if (!decision || !decision.action) { audit({ event: "observe", report }); return Object.assign(report, { acted: null }); }
  if (dry) return Object.assign(report, { acted: null, dry: true });
  const result = await act(decision);
  audit({ event: "heal", action: decision.action, reason: decision.reason, result, gaps: report.gaps });
  return Object.assign(report, { acted: { action: decision.action, result } });
}

// ---- the supervised loop (run by the watchdog, NOT by any poll) ------------------------------------
async function runLoop({ intervalMs = 5000 } = {}) {
  audit({ event: "healer-start", intervalMs });
  // eslint-disable-next-line no-constant-condition
  for (;;) {
    try { await healOnce(false); } catch (e) { audit({ event: "healer-error", err: e && e.message }); }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

module.exports = { observe, orient, decide, act, healOnce, runLoop, identityAnnunciations, identityLag };

if (require.main === module) {
  const mode = process.argv[2] || "once";
  if (mode === "loop") { runLoop({ intervalMs: Number(process.argv[3]) || 5000 }); }
  else { healOnce(mode !== "act").then((r) => { console.log(JSON.stringify(r, null, 2)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); }); }
}
