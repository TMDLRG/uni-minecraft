// fqdn_test.cjs -- unit tests for the fqdn helper.

"use strict";
const assert = require("assert");
const { fqdn, url, zone, service } = require("../fqdn.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  try { fn(); ok += 1; }
  catch (e) { fail += 1; console.log(`  FAIL: ${name} :: ${e.message}`); }
}

console.log("fqdn_test:");

t("zone reads registry", () => {
  assert.strictEqual(zone(), "uni-lab.local");
});

t("fqdn composes name.zone for known service", () => {
  assert.strictEqual(fqdn("launcher"), "launcher.uni-lab.local");
  assert.strictEqual(fqdn("mediamtx"), "mediamtx.uni-lab.local");
  assert.strictEqual(fqdn("overlays"), "overlays.uni-lab.local");
});

t("url composes proto://name.zone:port", () => {
  assert.strictEqual(url("launcher"), "http://launcher.uni-lab.local:8090");
  assert.strictEqual(url("overlays"), "http://overlays.uni-lab.local:8099");
});

t("unknown service throws", () => {
  assert.throws(() => fqdn("nope-not-a-service"), /unknown service/);
  assert.throws(() => url("also-nope"), /unknown service/);
  assert.throws(() => service("still-nope"), /unknown service/);
});

t("service returns frozen row", () => {
  const s = service("launcher");
  assert.strictEqual(s.name, "launcher");
  assert.strictEqual(s.port, 8090);
  assert.throws(() => { s.name = "hacked"; }, /read.only|not extensible|assign to read only|Cannot assign/i);
});

t("url returns empty for non-URL protos", () => {
  // 'obs' has proto 'ws' -- URL-buildable; 'mc' has 'tcp' -- not URL-buildable
  assert.throws(() => url("mc"), /no URL scheme|cannot build/);
});

t("no IPv4 literal in fqdn.cjs source", () => {
  const src = require("fs").readFileSync(require.resolve("../fqdn.cjs"), "utf8");
  const matches = src.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) || [];
  const bad = matches.filter((m) => m !== "127.0.0.1" && m !== "0.0.0.0");
  assert.deepStrictEqual(bad, [], `IPv4 literal found in fqdn.cjs: ${bad.join(", ")}`);
});

console.log(`  ${ok}/${n} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
