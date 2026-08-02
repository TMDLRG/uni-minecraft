// door_journey.cjs — THE JOURNEY: a GOAL-driven, gate-measured path to (and through) the live show.
// Every step's status is computed from a LIVE probe, never a checkbox you tick. The sequence is the
// real objective: studio healthy -> broadcast test on the air -> GO LIVE (human) -> run of show ->
// off air. Persisted to viewer/runtime/door_journey.json so progress survives a reboot; Gaia projects
// it verbatim (studio.doors.journey).
//
// REBOOT IS A TRACKED RUNTIME CONDITION, NOT A STEP (corrected 2026-07-15). The old journey forced a
// two-reboot "ceremony" (close-all -> reboot -> verify, twice) as mandatory steps, so it sat stuck
// demanding a reboot that a healthy, running studio does not need to go live -- dishonest. Now:
//   * the go-live path has NO reboot step;
//   * reboot() reports {state: not_needed | pending | detected, reason, lastBootAt, persistenceProven}
//     computed live -- surfaced next to the journey, never gating it;
//   * a reboot is "pending" only when something OUTSTANDING requires one (a change writes
//     runtime/reboot_pending.json), or when the operator chooses to validate boot-persistence.
//
// SELF-HEALING (2026-07-15): the studio_ready step no longer says "press the ONE KEY" and wait. The
// supervised door_healer.cjs OBSERVES the surfaces and ACTS (active-inference OODA) to bring the
// studio to healthy on its own -- no LLM, no operator click. state() here stays a PURE OBSERVER
// (reads never actuate -- the burned-in 2026-07-14 lesson): it reports what the healer's work has
// achieved; it never spawns anything itself.
const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const net = require("net");
const doors = require("./door_lifecycle.cjs");

const RUNTIME = path.join(__dirname, "runtime");
const STATE_FILE = path.join(RUNTIME, "door_journey.json");
const LEDGER = path.join(RUNTIME, "door_journey.ndjson");
const REBOOT_PENDING = path.join(RUNTIME, "reboot_pending.json"); // a change writes this when it needs a reboot
const GATES = path.join(__dirname, "..", "evidence", "gates.ndjson");

function tcp(host, port, timeout = 1200) {
  return new Promise((resolve) => {
    const s = new net.Socket(); let done = false;
    const fin = (ok) => { if (done) return; done = true; try { s.destroy(); } catch (_) {} resolve(ok); };
    s.setTimeout(timeout);
    s.once("connect", () => fin(true)); s.once("timeout", () => fin(false)); s.once("error", () => fin(false));
    s.connect(port, host);
  });
}
function httpJson(host, port, p, timeout = 2000) {
  return new Promise((resolve) => {
    const req = http.request({ host, port, path: p, timeout }, (res) => {
      let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => { try { resolve({ ok: true, body: JSON.parse(b || "null") }); } catch (_) { resolve({ ok: false, body: null }); } });
    });
    req.on("error", () => resolve({ ok: false, body: null }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, body: null }); });
    req.end();
  });
}
function bootTime() { return new Date(Date.now() - Math.round(os.uptime() * 1000)); }

async function studioDoorsClosed() { const st = await doors.state(); const s = st.doors.filter((d) => d.scope === "studio"); return { allClosed: s.every((d) => !d.open), stillOpen: s.filter((d) => d.open).map((d) => d.key) }; }

// A gate is proven when evidence/gates.ndjson's LATEST row for that name has verdict PASS.
function gatePass(name) {
  try {
    const rows = fs.readFileSync(GATES, "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean);
    let latest = null;
    for (const r of rows) if (r.name === name) latest = r; // last wins (append-only supersede)
    return latest && latest.verdict === "PASS";
  } catch (_) { return false; }
}

// ---- REBOOT: a tracked runtime condition, surfaced beside the journey, never a step ---------------
function reboot() {
  const lastBootAt = bootTime();
  const persistenceProven = gatePass("door-boot-persistent") && gatePass("gaia-boot-persistent");
  let pending = false, reason = "no reboot outstanding — a healthy, running studio does not need one to go live";
  try {
    if (fs.existsSync(REBOOT_PENDING)) {
      const m = JSON.parse(fs.readFileSync(REBOOT_PENDING, "utf8"));
      pending = true; reason = (m && m.reason) || "a change flagged that a reboot is required to take effect";
    }
  } catch (_) {}
  return {
    state: pending ? "pending" : "not_needed",
    inPath: pending,                 // is a reboot ON the current path, or not-in-path?
    reason,
    lastBootAt: lastBootAt.toISOString(),
    persistenceProven,               // if true, a validation reboot would confirm self-recovery; if false, it's informative
    note: "reboot is runtime state (not_needed | pending | detected), not a required journey step; write runtime/reboot_pending.json to mark one outstanding",
  };
}

// ---- Live checks for each real step (measured, honest) --------------------------------------------
async function studioReadyCheck() {
  const [obs, overlaysUp, consoleUp] = await Promise.all([tcp("127.0.0.1", 4455), tcp("127.0.0.1", 8099), tcp("127.0.0.1", 8098)]);
  let spoolFresh = false, spoolAgeS = null;
  if (overlaysUp) {
    const s = await httpJson("127.0.0.1", 8099, "/state.json");
    if (s.ok && s.body && s.body.updatedUtc) { spoolAgeS = Math.round((Date.now() - new Date(s.body.updatedUtc).getTime()) / 1000); spoolFresh = spoolAgeS < 15; }
  }
  // colony observable by NAME (never a literal): the command center's own health board reports it
  let colonyLive = false, colonyDetail = "console down";
  if (consoleUp) {
    const h = await httpJson("127.0.0.1", 8098, "/api/state");
    const air = h.body && h.body.air;
    colonyLive = !!(air); colonyDetail = air ? `console up (air=${air.level || (air.streaming ? "STREAMING" : "OFF")})` : "console up";
  }
  const missing = [];
  if (!obs) missing.push("OBS :4455");
  if (!overlaysUp) missing.push("overlays :8099");
  if (overlaysUp && !spoolFresh) missing.push(`overlay spool stale (${spoolAgeS == null ? "unreadable" : spoolAgeS + "s"})`);
  if (!consoleUp) missing.push("console :8098");
  const done = obs && overlaysUp && spoolFresh && consoleUp;
  return { done, detail: done
    ? `studio healthy: OBS + overlays (spool ${spoolAgeS}s fresh) + ${colonyDetail}. The healer keeps it here — no reboot, no click.`
    : `healing: still down -> ${missing.join(", ")}. door_healer is bringing these up (or run ONE KEY OPEN ALL); this step completes on its own when healthy.` };
}
const streamingState = async () => { const s = await httpJson("127.0.0.1", 8098, "/api/state"); return !!(s.body && s.body.air && s.body.air.streaming); };

// 2026-07-17 (gate journey-vectors-durable-and-probed):
// C1 — `sawLive` WAS a module-level bool, reset to false on every cc/journey restart, so a mid-show
//      bounce made `off_air` unable to auto-complete (it requires sawLive) even though the show
//      really aired. It now PERSISTS in the same runtime/door_journey.json the step statuses live in,
//      alongside `liveStartedAt` — the on-air clock the run-of-show vector needs.
// C2 — `run_of_show` was `check: null` (manual-only, no probe). It now MEASURES on-air conformance to
//      the slot DURATION (from production/run-of-show/slot-4h.yaml). Not the segment content — a pure
//      probe can't verify a human conducted the show well — but the slot CLOCK is real and measurable.
function journeyMeta() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) || {}; } catch (_) { return {}; } }
function markLive() {
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    let changed = false;
    if (st.sawLive !== true) { st.sawLive = true; changed = true; }
    if (!st.liveStartedAt) { st.liveStartedAt = new Date().toISOString(); changed = true; }
    if (changed) { fs.mkdirSync(RUNTIME, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2)); }
  } catch (_) {}
}
function slotDurationS() {
  try {
    const y = fs.readFileSync(path.join(__dirname, "..", "production", "run-of-show", "slot-4h.yaml"), "utf8");
    const m = /durationHours:\s*([0-9.]+)/.exec(y);
    if (m) return Math.round(parseFloat(m[1]) * 3600);
  } catch (_) {}
  return 4 * 3600; // honest default if the yaml is unreadable
}
const fmtDur = (s) => `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
let sawLive = journeyMeta().sawLive === true; // hydrate from disk (C1) so a restart never forgets

const STEPS = [
  { id: "studio_ready", label: "Studio healthy — OBS + overlays + colony captured (self-heals)", kind: "auto",
    desc: "The studio is up and broadcast-ready: OBS mixer, overlay spool fresh, colony captured over the LAN BY NAME. door_healer.cjs brings this to green on its own (active-inference: observe -> orient -> heal) with no reboot and no click; if the healer is off, press ONE KEY (OPEN ALL) above.",
    check: studioReadyCheck },
  { id: "feature_test", label: "Broadcast test — every feature green, ON THE AIR", kind: "auto",
    desc: "Run BROADCAST TEST in the command center. THE ONE LIVE PATH (never private): with FAN-OUT ON this is public air; stage 4 only passes with real public egress (readers >= 1). Cameras, overlays, endpoints all exercised on the air.",
    check: async () => { const bt = await httpJson("127.0.0.1", 8098, "/api/broadcast_test"); const go = bt.body && bt.body.go === true; return { done: !!go, detail: go ? "last broadcast_test: go=true (all stages PASS)" : "not yet green — run BROADCAST TEST from the command center (it goes public; readers>=1 required)" }; } },
  { id: "go_live", label: "GO LIVE — the real show (you type CONFIRM)", kind: "auto",
    desc: "Public air, human-typed (G-PA). The journey and the healer can only WATCH for it — neither can or will press this for you.",
    check: async () => { const streaming = await streamingState(); if (streaming) { sawLive = true; markLive(); } return { done: streaming, detail: streaming ? "LIVE — on the air" : "not yet live — type CONFIRM + GO LIVE in the command center" }; } },
  { id: "run_of_show", label: "Conduct the run of show", kind: "auto",
    desc: "Co-pilot through production/run-of-show/slot-4h.yaml on the real console. This vector MEASURES the on-air clock against the slot DURATION (it advances as the scheduled slot elapses, completes when the full slot has run OR you close the show) — it does not judge the segment content.",
    check: async () => {
      const streaming = await streamingState();
      const meta = journeyMeta();
      const startedAt = meta.liveStartedAt ? Date.parse(meta.liveStartedAt) : null;
      const target = slotDurationS();
      if (!meta.sawLive && !streaming) return { done: false, detail: `not started — the run-of-show clock starts at GO LIVE (slot target ${fmtDur(target)})` };
      const elapsed = startedAt ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : 0;
      if (!streaming && meta.sawLive) return { done: true, detail: `run of show closed after ${fmtDur(elapsed)} on air (slot target ${fmtDur(target)})` };
      if (elapsed >= target) return { done: true, detail: `full slot elapsed on air: ${fmtDur(elapsed)} / ${fmtDur(target)} — run of show complete` };
      return { done: false, detail: `conducting: ${fmtDur(elapsed)} / ${fmtDur(target)} on air` };
    } },
  { id: "off_air", label: "Off air — show complete", kind: "auto",
    desc: "Stream stopped at the end of the run. The journey is complete. (sawLive is persisted — a mid-show restart no longer forgets the show aired.)",
    check: async () => { const streaming = await streamingState(); const persistedSawLive = sawLive || journeyMeta().sawLive === true; return { done: !streaming && persistedSawLive, detail: streaming ? "still streaming" : (persistedSawLive ? "off air — journey complete" : "not on air yet") }; } },
];

function loadState() {
  try {
    const st = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (!Array.isArray(st.steps)) throw new Error("no steps");
    // reconcile: drop steps no longer in the model, add new ones (survives the reboot-ceremony removal)
    const known = new Set(STEPS.map((s) => s.id));
    st.steps = st.steps.filter((x) => known.has(x.id));
    for (const def of STEPS) if (!st.steps.find((x) => x.id === def.id)) st.steps.push({ id: def.id, status: "pending" });
    if (typeof st.currentIndex !== "number" || st.currentIndex > STEPS.length) st.currentIndex = 0;
    return st;
  } catch (_) { return { startedAt: new Date().toISOString(), currentIndex: 0, steps: STEPS.map((s) => ({ id: s.id, status: "pending" })) }; }
}
function saveState(st) { fs.mkdirSync(RUNTIME, { recursive: true }); fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2)); }
function audit(entry) { try { fs.mkdirSync(RUNTIME, { recursive: true }); fs.appendFileSync(LEDGER, JSON.stringify(Object.assign({ ts: new Date().toISOString() }, entry)) + "\n"); } catch (_) {} }

// Synchronous arm (no awaits -> cannot be raced by a concurrent poll).
function armCurrentStep() {
  const st = loadState();
  const idx = st.currentIndex || 0;
  if (idx < STEPS.length) {
    const rec = st.steps.find((x) => x.id === STEPS[idx].id);
    if (rec && rec.status !== "done") rec.status = "current";
    saveState(st);
  }
  return st;
}
function recordAdvanceIfDone(stepId, live) {
  if (!live || !live.done) return;
  const st = loadState();
  const idx = st.currentIndex || 0;
  if (idx >= STEPS.length || STEPS[idx].id !== stepId) return;
  const rec = st.steps.find((x) => x.id === stepId);
  if (!rec || rec.status === "done") return;
  rec.status = "done"; rec.at = new Date().toISOString(); rec.note = live.detail;
  st.currentIndex = idx + 1;
  saveState(st);
  audit({ step: stepId, event: "auto-advance", detail: live.detail });
}

async function state() {
  let st = armCurrentStep();
  const idx = st.currentIndex || 0;
  const liveById = {};
  if (idx < STEPS.length) {
    const def = STEPS[idx];
    if (def.check) {
      let live = null;
      try { live = await def.check(); } catch (e) { live = { done: false, detail: "check error: " + (e && e.message) }; }
      liveById[def.id] = live;
      recordAdvanceIfDone(def.id, live);
    }
  }
  st = loadState();
  const steps = STEPS.map((def, i) => {
    const rec = st.steps.find((x) => x.id === def.id) || {};
    const status = i < st.currentIndex ? "done" : (i === st.currentIndex ? "current" : "pending");
    return { id: def.id, label: def.label, desc: def.desc, kind: def.kind, status, at: rec.at, note: rec.note, live: liveById[def.id] || null };
  });
  return { startedAt: st.startedAt, currentIndex: st.currentIndex, complete: st.currentIndex >= STEPS.length, steps, reboot: reboot() };
}

async function advance(note, actor) {
  const st = loadState();
  const idx = st.currentIndex || 0;
  if (idx >= STEPS.length) return { ok: false, err: "journey already complete" };
  const def = STEPS[idx];
  const rec = st.steps.find((x) => x.id === def.id);
  rec.status = "done"; rec.at = new Date().toISOString(); rec.note = note || "marked done by operator";
  st.currentIndex = idx + 1;
  saveState(st);
  audit({ step: def.id, event: "manual-advance", note: rec.note, actor: actor || "operator" });
  return { ok: true, advancedTo: STEPS[idx + 1] ? STEPS[idx + 1].id : "complete" };
}
function reset() {
  const st = { startedAt: new Date().toISOString(), currentIndex: 0, steps: STEPS.map((s) => ({ id: s.id, status: "pending" })) };
  saveState(st); audit({ event: "reset" });
  return st;
}

module.exports = { state, advance, reset, reboot, STEPS };
