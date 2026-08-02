// hud_endpoints_test.cjs -- HTTP contract tests against a live hud_server.
//
// Spins up its own server on a random-ish port to isolate from any running HUD.
// Exit 0 iff every route obeys the contract:
//   - GET / /hud /hud.html      -> 200 html
//   - GET /api/hud/health       -> 200 envelope, ok:true
//   - GET /api/hud/snapshot     -> 200 envelope, has hud/upstreams/gates
//   - GET /api/hud/discovery    -> 200 envelope, lists routes
//   - GET /api/hud/timeseries   -> 200 for known metric, 404 for unknown
//   - GET /api/hud/audience/recent -> 200 envelope, has rows array
//   - POST /api/hud/audience/publish (with header + valid) -> 202 ok:true
//   - POST (missing header) -> 403
//   - POST (wrong content-type) -> 415
//   - POST (invalid JSON) -> 400
//   - POST (missing sanitized_by) -> 400
//   - PUT / -> 405
//   - GET /nope -> 404

"use strict";
const http = require("http");
const assert = require("assert");

process.env.HUD_PORT = "8199"; // isolated port for tests
process.env.HUD_BIND = "127.0.0.1";
process.env.HUD_POLL_MS = "30000"; // slow poll -- we don't want probe noise
const srv = require("../hud_server.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  return Promise.resolve().then(fn).then(() => { ok += 1; })
    .catch((e) => { fail += 1; console.log(`  FAIL: ${name} :: ${e && e.message || e}`); });
}

function req(method, path, opts) {
  return new Promise((resolve, reject) => {
    const options = {
      host: "127.0.0.1", port: 8199, path, method, agent: false,
      headers: Object.assign({ "connection": "close" }, (opts && opts.headers) || {}),
    };
    const r = http.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    r.on("error", reject);
    r.setTimeout(4000, () => { r.destroy(new Error("timeout")); });
    if (opts && opts.body != null) r.write(opts.body);
    r.end();
  });
}

(async () => {
  console.log("hud_endpoints_test:");
  srv.start();
  await new Promise((r) => setTimeout(r, 300)); // let it bind

  await t("GET / returns 200 html", async () => {
    const r = await req("GET", "/");
    assert.strictEqual(r.status, 200);
    assert.ok(/text\/html/i.test(r.headers["content-type"] || ""));
    assert.ok(r.body.includes("UNI HUD"), "body missing UNI HUD title");
  });

  await t("GET /hud returns 200 html", async () => {
    const r = await req("GET", "/hud");
    assert.strictEqual(r.status, 200);
  });

  await t("GET /api/hud/health returns envelope ok:true", async () => {
    const r = await req("GET", "/api/hud/health");
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.envelope.server, "uni-hud");
    assert.strictEqual(j.result.ok, true);
  });

  await t("GET /api/hud/snapshot returns envelope with expected shape", async () => {
    const r = await req("GET", "/api/hud/snapshot");
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.ok(j.result.hud, "no result.hud");
    assert.ok(j.result.upstreams, "no result.upstreams");
    assert.ok(Array.isArray(j.result.gates), "gates not array");
    assert.ok(j.result.metrics, "no result.metrics");
    assert.ok(j.result.audience, "no result.audience");
  });

  await t("GET /api/hud/discovery lists routes", async () => {
    const r = await req("GET", "/api/hud/discovery");
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.ok(j.result.routes, "no routes");
    assert.ok(j.result.routes["GET /api/hud/snapshot"], "snapshot route missing");
    assert.ok(Array.isArray(j.result.laws), "laws not array");
  });

  await t("GET /api/hud/timeseries?metric=stack returns values", async () => {
    const r = await req("GET", "/api/hud/timeseries?metric=stack&window=10");
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.result.metric, "stack");
    assert.ok(Array.isArray(j.result.values));
  });

  await t("GET /api/hud/timeseries?metric=bogus returns 404", async () => {
    const r = await req("GET", "/api/hud/timeseries?metric=bogus");
    assert.strictEqual(r.status, 404);
  });

  await t("GET /api/hud/audience/recent returns rows array", async () => {
    const r = await req("GET", "/api/hud/audience/recent");
    assert.strictEqual(r.status, 200);
    const j = JSON.parse(r.body);
    assert.ok(Array.isArray(j.result.rows));
  });

  await t("POST /api/hud/audience/publish missing header returns 403", async () => {
    const r = await req("POST", "/api/hud/audience/publish", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source: "t", author: "a", text: "x", ts: Date.now(), sanitized_by: "me" }),
    });
    assert.strictEqual(r.status, 403);
  });

  await t("POST wrong content-type returns 415", async () => {
    const r = await req("POST", "/api/hud/audience/publish", {
      headers: { "content-type": "text/plain", "x-uni-cc": "1" },
      body: "hi",
    });
    assert.strictEqual(r.status, 415);
  });

  await t("POST invalid JSON returns 400", async () => {
    const r = await req("POST", "/api/hud/audience/publish", {
      headers: { "content-type": "application/json", "x-uni-cc": "1" },
      body: "{not-json",
    });
    assert.strictEqual(r.status, 400);
  });

  await t("POST missing sanitized_by returns 400", async () => {
    const r = await req("POST", "/api/hud/audience/publish", {
      headers: { "content-type": "application/json", "x-uni-cc": "1" },
      body: JSON.stringify({ source: "t", author: "a", text: "x", ts: Date.now() }),
    });
    assert.strictEqual(r.status, 400);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.code, "sanitized_by");
  });

  await t("POST valid row returns 202", async () => {
    const r = await req("POST", "/api/hud/audience/publish", {
      headers: { "content-type": "application/json", "x-uni-cc": "1" },
      body: JSON.stringify({ source: "test", author: "unit", text: "hi", ts: Date.now(), sanitized_by: "test-vouch" }),
    });
    assert.strictEqual(r.status, 202);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.ok, true);
    assert.ok(j.size >= 1, "size should be >= 1");
  });

  await t("PUT / returns 405", async () => {
    const r = await req("PUT", "/");
    assert.strictEqual(r.status, 405);
  });

  await t("DELETE /api/hud/health returns 405", async () => {
    const r = await req("DELETE", "/api/hud/health");
    assert.strictEqual(r.status, 405);
  });

  await t("GET /nope returns 404", async () => {
    const r = await req("GET", "/nope");
    assert.strictEqual(r.status, 404);
  });

  await t("POST /api/hud/sight/push missing header returns 403", async () => {
    const r = await req("POST", "/api/hud/sight/push", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ findings: [] }),
    });
    assert.strictEqual(r.status, 403);
  });

  await t("POST /api/hud/sight/push malformed body returns 400", async () => {
    const r = await req("POST", "/api/hud/sight/push", {
      headers: { "content-type": "application/json", "x-uni-cc": "1" },
      body: JSON.stringify({ wrong: "shape" }),
    });
    assert.strictEqual(r.status, 400);
  });

  await t("POST /api/hud/sight/push valid findings returns 202 with accepted count", async () => {
    const r = await req("POST", "/api/hud/sight/push", {
      headers: { "content-type": "application/json", "x-uni-cc": "1" },
      body: JSON.stringify({
        pushed_from: "endpoints_test",
        findings: [
          { code: "test-finding", severity: "info", title: "hello", detail: "test", source: "test" },
          { code: "another", severity: "warn", title: "warn", detail: "d", source: "s" },
          { code: "", severity: "bad" }, // invalid -- dropped
        ],
      }),
    });
    assert.strictEqual(r.status, 202);
    const j = JSON.parse(r.body);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.accepted, 2);
    assert.strictEqual(j.dropped, 1);
  });

  srv.stop();
  console.log(`  ${ok}/${n} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
})();
