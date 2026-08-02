// hud_ring_test.cjs -- unit tests for the bounded monotonic ring.

"use strict";
const assert = require("assert");
const { Ring } = require("../hud_ring.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  try { fn(); ok += 1; }
  catch (e) { fail += 1; console.log(`  FAIL: ${name} :: ${e.message}`); }
}

console.log("hud_ring_test:");

t("constructor rejects bad cap", () => {
  assert.throws(() => new Ring(0), /cap/);
  assert.throws(() => new Ring(-1), /cap/);
  assert.throws(() => new Ring("x"), /cap/);
  assert.throws(() => new Ring(1e7), /cap/);
});

t("push then all -- basic order", () => {
  const r = new Ring(5);
  r.push("a"); r.push("b"); r.push("c");
  assert.deepStrictEqual(r.all().map((e) => e.value), ["a","b","c"]);
  assert.strictEqual(r.size, 3);
});

t("wraps at cap; oldest evicted", () => {
  const r = new Ring(3);
  r.push("a"); r.push("b"); r.push("c"); r.push("d");
  assert.deepStrictEqual(r.all().map((e) => e.value), ["b","c","d"]);
  assert.strictEqual(r.size, 3);
});

t("wraps well past cap", () => {
  const r = new Ring(3);
  for (let i = 0; i < 100; i += 1) r.push(i);
  assert.deepStrictEqual(r.all().map((e) => e.value), [97,98,99]);
  assert.strictEqual(r.size, 3);
});

t("recent returns exactly n most recent", () => {
  const r = new Ring(10);
  for (let i = 0; i < 10; i += 1) r.push(i);
  assert.deepStrictEqual(r.recent(3).map((e) => e.value), [7,8,9]);
  assert.deepStrictEqual(r.recent(10).map((e) => e.value), [0,1,2,3,4,5,6,7,8,9]);
  assert.deepStrictEqual(r.recent(0), []);
  assert.deepStrictEqual(r.recent(100).map((e) => e.value), [0,1,2,3,4,5,6,7,8,9]);
});

t("sparkline returns values only", () => {
  const r = new Ring(5);
  r.push(10); r.push(20); r.push(30);
  assert.deepStrictEqual(r.sparkline(2), [20, 30]);
  assert.deepStrictEqual(r.sparkline(10), [10, 20, 30]);
});

t("timestamps monotonic under clock reversal", () => {
  const r = new Ring(5);
  r.push("x", 1000); r.push("y", 1000); r.push("z", 500);
  const ts = r.all().map((e) => e.ts);
  assert.deepStrictEqual(ts, [1000, 1001, 1002]);
});

t("timestamps default to Date.now", () => {
  const r = new Ring(3);
  const t0 = Date.now();
  r.push("a");
  const gotTs = r.all()[0].ts;
  assert.ok(gotTs >= t0 && gotTs <= t0 + 1000, `ts ${gotTs} not near now ${t0}`);
});

t("clear resets state", () => {
  const r = new Ring(3);
  r.push("a"); r.push("b");
  r.clear();
  assert.strictEqual(r.size, 0);
  assert.deepStrictEqual(r.all(), []);
});

t("exact cap boundary + one over", () => {
  const r = new Ring(2);
  r.push("a"); r.push("b");
  assert.deepStrictEqual(r.all().map((e) => e.value), ["a","b"]);
  r.push("c");
  assert.deepStrictEqual(r.all().map((e) => e.value), ["b","c"]);
  assert.strictEqual(r.size, 2);
});

console.log(`  ${ok}/${n} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
