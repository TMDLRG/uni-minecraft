// hud_enlightened_test.cjs -- unit tests for the sight detectors.

"use strict";
const assert = require("assert");
const enl = require("../hud_enlightened.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  try { fn(); ok += 1; }
  catch (e) { fail += 1; console.log(`  FAIL: ${name} :: ${e.message}`); }
}

console.log("hud_enlightened_test:");

// ---------- contradictions: tile lies -------------------------------------
t("tile up=true with 'down' in detail -> contradiction", () => {
  const snap = { studio_ports: { obs: { up: true, detail: "obs down :4455" } }, door_open: {}, metrics: {} };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  const hit = findings.find((f) => f.code === "tile-lies-up-obs");
  assert.ok(hit, "expected tile-lies-up-obs finding");
  assert.strictEqual(hit.severity, "bad");
});

t("tile up=true with clean detail -> no finding", () => {
  const snap = { studio_ports: { obs: { up: true, detail: "obs-websocket :4455" } }, door_open: {}, metrics: {} };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  assert.ok(!findings.find((f) => f.code === "tile-lies-up-obs"), "should not fire on clean detail");
});

t("stack=UP with 0 tiles up -> stack-up-but-nothing-up", () => {
  const snap = { stack: { state: "UP" }, studio_ports: { a: { up: false }, b: { up: false } }, door_open: {}, metrics: {} };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  assert.ok(findings.find((f) => f.code === "stack-up-but-nothing-up"), "expected stack-up-but-nothing-up");
});

t("journey step reboot_1 with studio ports UP -> journey-reboot-but-studio-up", () => {
  const snap = {
    journey_current_step: { id: "reboot_1" },
    studio_ports: { obs: { up: true }, mediamtx: { up: true }, console: { up: false } },
    door_open: {}, metrics: {},
  };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  assert.ok(findings.find((f) => f.code === "journey-reboot-but-studio-up"), "expected journey-reboot-but-studio-up");
});

t("producer_up=1 but colony_count=0 in detail -> fake-life finding", () => {
  const snap = {
    studio_ports: { colony: { up: true, detail: "driver=producer verdict=LIVE colony_count=0 frame=x" } },
    door_open: {}, metrics: { producer_up: [0, 0, 1, 1, 1] },
  };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  const hit = findings.find((f) => f.code === "producer-live-but-empty-colony");
  assert.ok(hit, "expected producer-live-but-empty-colony finding");
  assert.strictEqual(hit.severity, "bad");
});

t("door with circle_ok=false -> door-circle-broken", () => {
  const snap = { studio_ports: {}, door_open: { obs: { circle_ok: false, prediction: "broken" } }, metrics: {} };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  assert.ok(findings.find((f) => f.code === "door-circle-broken-obs"), "expected door-circle-broken-obs");
});

t("on-air-but-no-relay -> bad finding", () => {
  const snap = {
    studio_ports: {
      console: { up: true, detail: "air=STREAMING program=OVERLOOK" },
      relay: { up: false },
    },
    door_open: {}, metrics: {},
  };
  const findings = enl.contradictionsFromSnapshot(snap, new Map(), Date.now());
  const hit = findings.find((f) => f.code === "on-air-but-no-relay");
  assert.ok(hit, "expected on-air-but-no-relay finding");
  assert.strictEqual(hit.severity, "bad");
});

// ---------- runaway: poll stalled ------------------------------------------
t("last poll > 3x interval -> poll-loop-stalled", () => {
  const hudState = { last_poll_at: Date.now() - 20000, poll_interval_ms: 3000, rings: {} };
  const findings = enl.runawayFindings(hudState, { metrics: {} }, Date.now(), new Map());
  assert.ok(findings.find((f) => f.code === "poll-loop-stalled"), "expected poll-loop-stalled");
});

t("last poll recent -> no poll-stall finding", () => {
  const hudState = { last_poll_at: Date.now() - 1000, poll_interval_ms: 3000, rings: {} };
  const findings = enl.runawayFindings(hudState, { metrics: {} }, Date.now(), new Map());
  assert.ok(!findings.find((f) => f.code === "poll-loop-stalled"), "should not fire when poll recent");
});

t("30 identical latency samples -> probe-flatlined", () => {
  const values = new Array(30).fill(150);
  const snap = { metrics: { launcher_latency_ms: values } };
  const findings = enl.runawayFindings({ rings: {} }, snap, Date.now(), new Map());
  assert.ok(findings.find((f) => f.code === "probe-flatlined-launcher_latency_ms"), "expected probe-flatlined");
});

// ---------- upstream unreachable -------------------------------------------
t("upstream up=null -> upstream-unreachable-X", () => {
  const snap = { upstreams: { gaia_drift: { up: null, err: "timeout", url: "http://x" } } };
  const findings = enl.upstreamFindings(snap, Date.now(), new Map());
  assert.ok(findings.find((f) => f.code === "upstream-unreachable-gaia_drift"), "expected upstream-unreachable-gaia_drift");
});

// ---------- gather + since_ms tracking -----------------------------------
t("gather returns envelope with counts and findings", () => {
  const snap = {
    upstreams: { x: { up: null, err: "e" } },
    studio_ports: {}, door_open: {}, metrics: {},
    stack: { state: null }, journey_current_step: null,
  };
  const hudState = { last_poll_at: Date.now(), poll_interval_ms: 3000, rings: {} };
  const result = enl.gather(snap, hudState, null, new Map());
  assert.ok(typeof result.updated_at === "string");
  assert.ok(typeof result.total === "number");
  assert.ok(result.counts && typeof result.counts.bad === "number");
  assert.ok(Array.isArray(result.findings));
});

t("since_ms is 0 on first sight, positive on second sight", () => {
  const since = new Map();
  const snap = { studio_ports: { x: { up: true, detail: "down :1" } }, door_open: {}, metrics: {} };
  const hudState = { last_poll_at: Date.now(), poll_interval_ms: 3000, rings: {} };
  const r1 = enl.gather(snap, hudState, null, since);
  const first = r1.findings.find((f) => f.code === "tile-lies-up-x");
  assert.strictEqual(first.since_ms, 0);
  // Wait a bit, gather again
  const t0 = Date.now();
  while (Date.now() - t0 < 15) { /* wait ~15ms */ }
  const r2 = enl.gather(snap, hudState, null, since);
  const second = r2.findings.find((f) => f.code === "tile-lies-up-x");
  assert.ok(second.since_ms >= 10, `expected since_ms >= 10, got ${second.since_ms}`);
});

t("stale finding is dropped from sinceMap when it no longer fires", () => {
  const since = new Map();
  const snap1 = { studio_ports: { x: { up: true, detail: "down :1" } }, door_open: {}, metrics: {} };
  const hudState = { last_poll_at: Date.now(), poll_interval_ms: 3000, rings: {} };
  enl.gather(snap1, hudState, null, since);
  assert.ok(since.has("tile-lies-up-x"), "sinceMap should have the code after first gather");
  const snap2 = { studio_ports: { x: { up: true, detail: "up :1" } }, door_open: {}, metrics: {} };
  enl.gather(snap2, hudState, null, since);
  assert.ok(!since.has("tile-lies-up-x"), "sinceMap should drop stale code after clean gather");
});

console.log(`  ${ok}/${n} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
