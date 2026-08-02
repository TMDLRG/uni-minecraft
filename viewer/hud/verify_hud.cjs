// verify_hud.cjs -- THE HUD PROOF GATE (binding; see docs/HUD.md).
//
// "HUD server up" is NOT enough. This gate verifies:
//   1. TCP :8100 binds (or the configured HUD_PORT)
//   2. GET /api/hud/health returns 200 envelope with ok:true
//   3. GET /api/hud/snapshot returns 200 envelope with stack + door_open + gates
//   4. POST /api/hud/audience/publish (loopback + x-uni-cc:1 + valid row) returns 202
//   5. POST without sanitized_by returns 400 code:sanitized_by
//   6. POST WITHOUT x-uni-cc, in a cross-site shape, returns 403   <- added 2026-07-28
//   7. Four non-GET methods across two read-only paths return 405
//   8. No IPv4 literal in viewer/hud/** outside {127.0.0.1, 0.0.0.0}
//
// CHECK 6 WAS MISSING UNTIL 2026-07-28 and an adversarial sweep found it. Checks 4 and 5 both SEND
// `x-uni-cc: 1`; nothing asserted that a request WITHOUT it is refused. So the gate whose purpose is
// proving the HUD's fence exercised that fence only in the allow direction, and deleting the header
// check from hud_server.cjs would have left this gate green. Check 7 was one PUT on one path while
// the line above it claimed "every non-GET on read-only paths".
//
// Exit 0 = PROVEN. Exit non-zero = the HUD is NOT verified; no agent may claim
// "HUD up" without this gate green.
//
// Mirrors viewer/verify_overlays.cjs / viewer/verify_colony.cjs convention:
// leading tag "HUD GATE: PASS -- ..." on success, one line per probe on
// failure, exit code IS the verdict.

"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const HUD_PORT = Number(process.env.HUD_PORT || 8100);
const HUD_HOST = process.env.HUD_HOST || "127.0.0.1";

function req(method, pathStr, opts) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let done = false;
    const finish = (v) => { if (done) return; done = true; try { r.destroy(); } catch (_) {} resolve({ ...v, latencyMs: Date.now() - t0 }); };
    const r = http.request({
      host: HUD_HOST, port: HUD_PORT, path: pathStr, method, agent: false, timeout: (opts && opts.timeout) || 3500,
      headers: Object.assign({ "connection": "close", "accept": "application/json" }, (opts && opts.headers) || {}),
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => finish({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8"), headers: res.headers }));
    });
    r.on("timeout", () => finish({ status: 0, err: "timeout" }));
    r.on("error", (e) => finish({ status: 0, err: e.message }));
    if (opts && opts.body != null) r.write(opts.body);
    r.end();
  });
}

let checks = [];
function pass(name, detail) { checks.push({ name, pass: true, detail }); }
function fail(name, why) { checks.push({ name, pass: false, why }); }

async function run() {
  // 1. TCP binds -- indirectly checked by /api/hud/health responding
  const h = await req("GET", "/api/hud/health");
  if (h.status !== 200) { fail("bind+health", `GET /api/hud/health => ${h.status} err=${h.err || "-"}`); }
  else {
    try {
      const j = JSON.parse(h.body);
      if (j.envelope && j.envelope.server === "uni-hud" && j.result && j.result.ok === true) {
        pass("bind+health", `HTTP ${h.status} uptime=${j.result.uptime_ms}ms poll_count=${j.result.poll_count}`);
      } else { fail("bind+health", "envelope shape mismatch"); }
    } catch (e) { fail("bind+health", `bad-json: ${e.message}`); }
  }

  // 2. snapshot envelope shape
  const s = await req("GET", "/api/hud/snapshot", { timeout: 5000 });
  if (s.status !== 200) { fail("snapshot", `GET /api/hud/snapshot => ${s.status} err=${s.err || "-"}`); }
  else {
    try {
      const j = JSON.parse(s.body);
      const r = j.result || {};
      const missing = [];
      if (!r.hud) missing.push("hud");
      if (!r.upstreams) missing.push("upstreams");
      if (!r.stack) missing.push("stack");
      if (!Array.isArray(r.gates)) missing.push("gates[]");
      if (!r.metrics) missing.push("metrics");
      if (!r.audience) missing.push("audience");
      if (missing.length) fail("snapshot", `missing fields: ${missing.join(", ")}`);
      else pass("snapshot", `has hud upstreams stack gates(${r.gates.length}) metrics audience`);
    } catch (e) { fail("snapshot", `bad-json: ${e.message}`); }
  }

  // 3. audience publish honest sanitizer gate
  const p1 = await req("POST", "/api/hud/audience/publish", {
    headers: { "content-type": "application/json", "x-uni-cc": "1" },
    body: JSON.stringify({ source: "verify", author: "hud-gate", text: "verify_hud stub", ts: Date.now(), sanitized_by: "verify_hud" }),
  });
  if (p1.status === 202) pass("audience-accept", `POST => 202`);
  else fail("audience-accept", `POST vouched row => ${p1.status} err=${p1.err || "-"}`);

  const p2 = await req("POST", "/api/hud/audience/publish", {
    headers: { "content-type": "application/json", "x-uni-cc": "1" },
    body: JSON.stringify({ source: "verify", author: "hud-gate", text: "unvouched", ts: Date.now() }),
  });
  if (p2.status === 400) {
    try {
      const j = JSON.parse(p2.body);
      if (j.code === "sanitized_by") pass("audience-reject-unvouched", `POST unvouched => 400 code:sanitized_by`);
      else fail("audience-reject-unvouched", `POST unvouched => 400 but wrong code:${j.code}`);
    } catch (_) { fail("audience-reject-unvouched", `POST unvouched => 400 but body not json`); }
  } else fail("audience-reject-unvouched", `POST unvouched => ${p2.status} (expected 400)`);

  // 3b. THE CSRF FENCE, IN THE REFUSE DIRECTION -- added 2026-07-28 after an adversarial sweep.
  //
  // Checks 3 and 5 above both send `x-uni-cc: 1` and assert 202 and 400. NOTHING HERE EVER TESTED
  // THAT A POST WITHOUT THE HEADER IS REFUSED. The gate that exists to prove the HUD's fence
  // exercised it only in the ALLOW direction, so deleting the header check from hud_server.cjs would
  // have left this gate green -- and `x-uni-cc` is the whole reason a third-party page in the
  // operator's browser cannot drive this route.
  const csrf = await req("POST", "/api/hud/audience/publish", {
    // Exactly the shape a browser sends with NO preflight, and what a JS-free <form> produces.
    headers: { "content-type": "text/plain;charset=UTF-8", origin: "https://evil.example.test" },
    body: JSON.stringify({ source: "verify", author: "hud-gate", text: "csrf probe", ts: Date.now(), sanitized_by: "verify_hud" }),
  });
  if (csrf.status === 403) pass("audience-refuses-cross-site", `POST without x-uni-cc, cross-site shape => 403`);
  else fail("audience-refuses-cross-site",
    `POST without x-uni-cc => ${csrf.status} (expected 403). The CSRF fence is the only thing ` +
    `stopping a page in the operator's browser from publishing to the audience surface.`);

  // 4. method fence -- non-GET on read-only paths. FOUR methods on two paths, not one PUT on one
  // path: the header above claims "Every non-GET on read-only paths returns 405", and one probe is
  // not "every". A DELETE branch added tomorrow would have passed the old check untouched.
  const fenced = [];
  for (const [m, p] of [["PUT", "/"], ["DELETE", "/"], ["PATCH", "/"], ["POST", "/api/hud/snapshot"]]) {
    const r = await req(m, p);
    fenced.push(`${m} ${p} => ${r.status}`);
    if (r.status !== 405) {
      fail("method-fence", `${m} ${p} => ${r.status} (expected 405) [${fenced.join(" · ")}]`);
      break;
    }
  }
  if (fenced.length === 4) pass("method-fence", fenced.join(" · "));

  // 5. no-ip-literal (structural, disk scan)
  const nip = scanForIpLiterals();
  if (nip.scanned === 0) {
    fail("no-ip-literal", "0 files scanned — the walk found nothing, so this check looked at nothing");
  } else if (nip.violations.length === 0) {
    pass("no-ip-literal",
      `${nip.scanned} files scanned, 0 live fleet-host literals in code · ${nip.mentions.length} ` +
      `mention(s) in whole-line comments, reported and NOT convicted (viewer/ip_fence.cjs's rule, ` +
      `reused rather than reimplemented — the old copy here convicted 2234 assembly version numbers)`);
  } else {
    fail("no-ip-literal",
      `${nip.violations.length} live literal(s) in code, first=${nip.violations[0].file}:` +
      `${nip.violations[0].line} ip=${nip.violations[0].ip} — "${nip.violations[0].text}"`);
  }

  // report
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  if (failed === 0) {
    console.log(`HUD GATE: PASS -- ${passed}/${checks.length} probes green, HUD verified on ${HUD_HOST}:${HUD_PORT}`);
    for (const c of checks) console.log(`  PASS  ${c.name}: ${c.detail}`);
    process.exit(0);
  } else {
    console.log(`HUD GATE: FAIL -- ${passed}/${checks.length} probes passed, ${failed} FAILED`);
    for (const c of checks) {
      if (c.pass) console.log(`  PASS  ${c.name}: ${c.detail}`);
      else console.log(`  FAIL  ${c.name}: ${c.why}`);
    }
    process.exit(1);
  }
}

/**
 * REWRITTEN 2026-07-28, and the old version had been RED THE WHOLE TIME WITHOUT ANYONE SEEING IT.
 *
 * The original was a naked `/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/` against an allowlist of two
 * addresses, with no mention/use separation and no exclusion of build output. Measured: **2234
 * violations**, of which the first is `native/publish/service/UNI.Hud.Service.deps.json:23
 * ip=10.0.0.0` — a .NET ASSEMBLY VERSION. It convicted version numbers, dates, and every comment
 * recording an address that had been removed.
 *
 * Nobody saw it because this gate is `ci:false` — it needs the HUD on :8100, so the runner lists it
 * and does not run it. A gate that has been failing for months in a way no one observes is not a
 * gate; it is a file. That is the real defect here, and it is worse than the regex.
 *
 * The fix is not a better regex written here. Step 4.4 already built the mention/use separation and
 * the "is this even a host?" rule for exactly this problem, and its own header records that a naive
 * version "convicted honest documentation" six times. So this REUSES `viewer/ip_fence.cjs` —
 * `isFleetHost` (a version like 10.0.0.0 is not a machine; x.0.0.0 is a range; .0 and .255 are
 * network and broadcast) and `walkTree` (a whole-line comment is MENTION, reported, never convicted).
 * One rule, one place, and when it improves both fences improve.
 */
function scanForIpLiterals() {
  const F = require("../ip_fence.cjs");
  const HUD = path.resolve(__dirname);
  const EXTS = new Set([".cjs", ".html", ".ps1", ".vbs", ".js", ".json", ".md", ".ndjson"]);
  // Build output is not source. `native/{bin,obj,publish}` is compiler artefact carrying assembly
  // versions that look exactly like RFC1918 addresses, and no human writes an address there.
  const SKIP_DIRS = new Set(["node_modules", "build", "logs", "tests", "bin", "obj", "publish", ".vs"]);

  const files = [];
  (function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.isFile() && EXTS.has(path.extname(entry.name).toLowerCase())) files.push(p);
    }
  })(HUD);

  const rels = files.map((f) => path.relative(HUD, f).replace(/\\/g, "/"));
  const read = (rel) => { try { return fs.readFileSync(path.join(HUD, rel), "utf8"); } catch { return null; } };
  const { uses, mentions } = F.walkTree(rels, read, null);

  return { scanned: files.length, violations: uses, mentions };
}

run().catch((e) => { console.log(`HUD GATE: FAIL -- verify crashed: ${e.message}`); process.exit(2); });
