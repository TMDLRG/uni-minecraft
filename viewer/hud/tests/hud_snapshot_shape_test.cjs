// hud_snapshot_shape_test.cjs -- shape test for /api/hud/snapshot's envelope.
// Confirms every required top-level result field is present and typed correctly.

"use strict";
const assert = require("assert");

process.env.HUD_PORT = "8198";
process.env.HUD_BIND = "127.0.0.1";
process.env.HUD_POLL_MS = "30000";

const srv = require("../hud_server.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  try { fn(); ok += 1; }
  catch (e) { fail += 1; console.log(`  FAIL: ${name} :: ${e.message}`); }
}

console.log("hud_snapshot_shape_test:");

const env = srv.envelope(srv.buildSnapshot());

t("envelope has schema_version 1", () => {
  assert.strictEqual(env.schema_version, 1);
});

t("envelope.server == uni-hud", () => {
  assert.strictEqual(env.envelope.server, "uni-hud");
});

t("envelope.timestamp is ISO-8601", () => {
  assert.match(env.envelope.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
});

t("result.hud has required fields", () => {
  const h = env.result.hud;
  assert.strictEqual(typeof h.version, "string");
  assert.strictEqual(typeof h.port, "number");
  assert.strictEqual(typeof h.uptime_ms, "number");
  assert.strictEqual(typeof h.poll_count, "number");
  assert.strictEqual(typeof h.poll_interval_ms, "number");
});

t("result.upstreams is an object keyed by source name", () => {
  const u = env.result.upstreams;
  assert.strictEqual(typeof u, "object");
  for (const k of Object.keys(u)) {
    assert.ok("up" in u[k], `upstream ${k} missing 'up'`);
    assert.ok("url" in u[k], `upstream ${k} missing 'url'`);
  }
});

t("result.gates is an array", () => {
  assert.ok(Array.isArray(env.result.gates), "gates not array");
});

t("result.drift is an array", () => {
  assert.ok(Array.isArray(env.result.drift), "drift not array");
});

t("result.audience has size + cap", () => {
  const a = env.result.audience;
  assert.strictEqual(typeof a.size, "number");
  assert.strictEqual(typeof a.cap, "number");
});

t("result.metrics has the 5 expected keys, each an array", () => {
  const m = env.result.metrics;
  const need = ["producer_up", "stack", "launcher_latency_ms", "gaia_latency_ms", "audience_count"];
  for (const k of need) {
    assert.ok(Array.isArray(m[k]), `metric ${k} not array`);
  }
});

t("result.stack has state field", () => {
  assert.ok("state" in env.result.stack, "stack missing state");
});

console.log(`  ${ok}/${n} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
