// hud_audience_sanitizer_test.cjs -- unit tests for the sanitizer-vouched receiver.

"use strict";
const assert = require("assert");
const { Audience } = require("../hud_audience.cjs");

let n = 0, ok = 0, fail = 0;
function t(name, fn) {
  n += 1;
  try { fn(); ok += 1; }
  catch (e) { fail += 1; console.log(`  FAIL: ${name} :: ${e.message}`); }
}
function r(over) {
  return Object.assign({ source: "yt", author: "Alice", text: "hi", ts: Date.now(), sanitized_by: "test-vouch" }, over || {});
}

console.log("hud_audience_sanitizer_test:");

t("well-formed row accepts", () => {
  const a = new Audience();
  const res = a.accept(r());
  assert.strictEqual(res.ok, true);
  assert.strictEqual(a.size, 1);
});

t("missing sanitized_by rejects", () => {
  const a = new Audience();
  const res = a.accept(r({ sanitized_by: undefined }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "sanitized_by");
  assert.strictEqual(a.size, 0);
});

t("empty sanitized_by rejects", () => {
  const a = new Audience();
  const res = a.accept(r({ sanitized_by: "" }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "sanitized_by");
});

t("null sanitized_by rejects", () => {
  const a = new Audience();
  const res = a.accept(r({ sanitized_by: null }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "sanitized_by");
});

t("missing source rejects", () => {
  const res = new Audience().accept(r({ source: undefined }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "source");
});

t("empty text rejects", () => {
  const res = new Audience().accept(r({ text: "" }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "text");
});

t("field > 200 bytes rejects", () => {
  const big = "x".repeat(300);
  const res = new Audience().accept(r({ text: big }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "text");
});

t("iso-8601 ts accepted", () => {
  const res = new Audience().accept(r({ ts: "2026-07-14T20:00:00Z" }));
  assert.strictEqual(res.ok, true);
});

t("bad ts rejects", () => {
  const res = new Audience().accept(r({ ts: "not-a-date" }));
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.code, "ts");
});

t("html brackets stripped from stored row", () => {
  const a = new Audience();
  a.accept(r({ text: "hi <script>evil</script> bye" }));
  const stored = a.recent(1)[0];
  assert.ok(!stored.text.includes("<"), "no < in stored text");
  assert.ok(!stored.text.includes(">"), "no > in stored text");
});

t("cap wraps oldest rows", () => {
  const a = new Audience({ cap: 3 });
  for (let i = 0; i < 5; i += 1) a.accept(r({ author: `A${i}` }));
  assert.strictEqual(a.size, 3);
  const rows = a.recent(3);
  assert.deepStrictEqual(rows.map((x) => x.author), ["A2", "A3", "A4"]);
});

t("non-object input rejects", () => {
  const a = new Audience();
  assert.strictEqual(a.accept(null).ok, false);
  assert.strictEqual(a.accept("string").ok, false);
  assert.strictEqual(a.accept(42).ok, false);
});

console.log(`  ${ok}/${n} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
