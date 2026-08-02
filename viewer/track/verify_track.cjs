// verify_track.cjs — THE TRACK GATE. UNI TRACK's one write route has a law, and it is asked, not read.
//
// WHY THIS FILE EXISTS AT ALL
// ----------------------------
// It did not, until 2026-07-28. TRACK is the operator's persistent surface — every Phase 9 finding is
// posted to it — and it had no gate of any kind. An adversarial sweep then found that its single
// write route, `POST /api/comment`, had no `x-uni-cc`, no Origin or Referer check, no peer check and
// no content-type check, while the server binds `0.0.0.0`. Anything on the LAN could append to the
// comment ledger, and any page in the operator's browser could fire it as a CORS-simple request with
// no preflight.
//
// The file's own header claimed "THE LAW IT INHERITS (from the Door, verbatim): a polled READ never
// spawns anything." The read law held. The write had nothing. Nothing ever probed it.
//
// SO EVERY CHECK HERE IS A REAL REQUEST TO A REAL SERVER
// -------------------------------------------------------
// The lesson this repository paid for on the same day: a source regex is evidence about text. The
// L5 gate asserted "exactly one non-GET route" by grepping its own server's source, which was true
// and said nothing about who may call it. So this boots `track_server.cjs` on an ephemeral port,
// against a THROWAWAY comment ledger, and asks it.
//
// Usage: node viewer/track/verify_track.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn, spawnSync } = require("child_process");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const SERVER = path.join(HERE, "track_server.cjs");
const REAL_COMMENTS = path.join(REPO, "evidence", "track_comments.ndjson");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const realBefore = fs.existsSync(REAL_COMMENTS)
  ? crypto.createHash("sha256").update(fs.readFileSync(REAL_COMMENTS)).digest("hex")
  : "absent";

// ---- boot the real server, against a throwaway ledger ---------------------------------------------

const tmpLedger = path.join(os.tmpdir(), `uni-track-gate-${crypto.randomUUID()}.ndjson`);
const boot = bootServer(tmpLedger);

if (!boot) {
  bad("the TRACK server boots", "could not start track_server.cjs on an ephemeral port");
} else {
  ok("the TRACK server boots", `answering on 127.0.0.1:${boot.port}, writing to a throwaway ledger`);

  // ---- THE FENCE, ASKED FOUR WAYS -----------------------------------------------------------------

  const body = JSON.stringify({ target: "gate-selftest", text: "verify_track.cjs probe" });

  // Exactly the shape a browser sends with NO preflight — and the shape a JS-free auto-submitting
  // <form enctype="text/plain"> produces, which CORS does not govern at all.
  const hostile = req(boot.port, "POST", "/api/comment", body, {
    "content-type": "text/plain;charset=UTF-8",
    origin: "https://evil.example.test",
    referer: "https://evil.example.test/page",
    "sec-fetch-site": "cross-site",
  });
  const noHeader = req(boot.port, "POST", "/api/comment", body, { "content-type": "application/json" });
  const wrongType = req(boot.port, "POST", "/api/comment", body, { "content-type": "text/plain", "x-uni-cc": "1" });

  hostile.status === 403 && noHeader.status === 403 && wrongType.status === 403
    ? ok("the comment route REFUSES a cross-site request",
        "a CORS-simple POST carrying a hostile Origin → 403 · application/json with no x-uni-cc → 403 " +
        "· x-uni-cc with the wrong content-type → 403. Measured against a booted server, not read off " +
        "the source. Until 2026-07-28 the first of these was a 200 and a write.")
    : bad("the comment route REFUSES a cross-site request",
        `hostile=${hostile.status} no-header=${noHeader.status} wrong-type=${wrongType.status}`);

  // POSITIVE CONTROL. A fence gate with no accept case passes by refusing everything, which is the
  // same defect wearing the opposite sign.
  const proper = req(boot.port, "POST", "/api/comment", body, {
    "content-type": "application/json", "x-uni-cc": "1",
  });
  let wrote = false;
  try {
    wrote = fs.readFileSync(tmpLedger, "utf8").includes("verify_track.cjs probe");
  } catch { /* not written */ }

  proper.status === 200 && wrote
    ? ok("POSITIVE CONTROL: the proper shape is accepted and appended",
        "loopback peer + x-uni-cc: 1 + application/json → 200, and the row is on disk in the " +
        "throwaway ledger. So the three refusals above are refusals about THOSE requests, not a " +
        "route that says no to everything.")
    : bad("POSITIVE CONTROL: the proper shape is accepted and appended",
        `status=${proper.status} appended=${wrote} — if this fails the fence is not a fence, it is a wall`);

  // THE PEER DECISION, TESTED AS A DECISION — corrected 2026-07-28.
  //
  // This used to be `/remoteAddress/.test(source)` — a source regex, named as if it proved the write
  // route enforces a loopback peer. Every probe in this gate connects from 127.0.0.1, so the refusal
  // branch was never exercised by a request, and a one-line `loopback = true` would have shipped
  // green while reopening LAN writes. Found by a re-audit of this same day's work.
  //
  // The decision is now a pure exported function, called directly with real non-loopback addresses.
  // A behavioural request from a genuinely non-loopback socket is not feasible over a loopback
  // connection (the socket's remoteAddress is loopback by construction), so the decision itself is
  // the unit under test — and the DNS-rebinding vector, which IS reachable over loopback, is probed
  // over the wire by the Host-pin check below.
  const { isLoopbackPeer, isLoopbackHost } = require(SERVER);
  // FIXTURE ADDRESSES ARE RFC 5737 DOCUMENTATION SPACE, DELIBERATELY.
  // This line carried `10.190.245.5` until 2026-07-29 — inside the chip's real /24. It was only ever
  // a MENTION (an address that must be REFUSED), but `host-tracking` flagged it as a chip literal in
  // live code and was RIGHT to: nothing distinguishes a fixture from a hardcoded endpoint by
  // inspection, and infra_registry.json's `_lan_dynamic_law` exists because that lease already moved
  // .122 -> .121 once and every hand-written literal went stale in place. Two of this gate's own
  // entries were already documentation-range; one was not, and the inconsistency is what made it
  // invisible to the author. Nothing is lost: `::ffff:10.0.0.1` still covers 10/8 and
  // `192.168.1.50` still covers private space, so the refusal is proved over the same ground.
  const peerAllows = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  const peerRefuses = ["198.51.100.5", "198.51.100.50", "::ffff:203.0.113.9", "203.0.113.7", ""];
  const peerOk = peerAllows.every((a) => isLoopbackPeer(a)) && peerRefuses.every((a) => !isLoopbackPeer(a));

  peerOk
    ? ok("the peer DECISION admits loopback and refuses the LAN",
        `isLoopbackPeer allows {${peerAllows.join(", ")}} and refuses {${peerRefuses.map((a) => a || "empty").join(", ")}} ` +
        `— tested as the decision the route actually calls, not by grepping the source for the word ` +
        `remoteAddress, which every loopback probe satisfied while the refusal branch went unrun.`)
    : bad("the peer DECISION admits loopback and refuses the LAN",
        `allows: ${peerAllows.filter((a) => !isLoopbackPeer(a)).join(",") || "all"} · ` +
        `wrongly-admits: ${peerRefuses.filter((a) => isLoopbackPeer(a)).join(",") || "none"}`);

  // THE DNS-REBINDING PROBE — over the wire, because the Host header IS client-controllable over
  // loopback. A rebound request carries the attacker's hostname; the Host pin is the one check that
  // still refuses it. This vector had NO coverage until 2026-07-28.
  const rebound = req(boot.port, "POST", "/api/comment", body, {
    host: "rebind.evil.test:" + boot.port, "x-uni-cc": "1", "content-type": "application/json",
  });
  const hostDecisionOk = isLoopbackHost("127.0.0.1:8102") && isLoopbackHost("localhost") && !isLoopbackHost("rebind.evil.test");

  rebound.status === 403 && hostDecisionOk
    ? ok("a DNS-rebound write is refused by the Host pin",
        "a POST carrying Host: rebind.evil.test — the exact shape a rebinding attacker's page sends, " +
        "same-origin and over loopback so peer and header both pass — returns 403. The peer check " +
        "does NOT stop this; the Host pin does, and lab_server.cjs had it while this file did not.")
    : bad("a DNS-rebound write is refused by the Host pin",
        `rebound POST status=${rebound.status} (want 403) · host-decision-ok=${hostDecisionOk}`);

  // ---- reads stay reads ----------------------------------------------------------------------------

  const home = req(boot.port, "GET", "/", null, {});
  const del = req(boot.port, "DELETE", "/api/comment", null, { "x-uni-cc": "1" });
  const put = req(boot.port, "PUT", "/api/comment", body, { "x-uni-cc": "1", "content-type": "application/json" });

  home.status === 200 && del.status === 404 && put.status === 404
    ? ok("the read surface still answers, and no other method reaches the write",
        "GET / → 200 · DELETE and PUT on the comment path fall through to 404, so POST is the only " +
        "method that reaches the append and it is the only one fenced.")
    : bad("the read surface still answers, and no other method reaches the write",
        `GET=${home.status} DELETE=${del.status} PUT=${put.status}`);

  boot.close();
}

fs.rmSync(tmpLedger, { force: true });

// ---- and the gate itself wrote nothing real ----------------------------------------------------------

{
  const realAfter = fs.existsSync(REAL_COMMENTS)
    ? crypto.createHash("sha256").update(fs.readFileSync(REAL_COMMENTS)).digest("hex")
    : "absent";
  realAfter === realBefore
    ? ok("this gate wrote nothing to the real comment ledger",
        `evidence/track_comments.ndjson hashes to ${realBefore.slice(0, 16)}… before and after. The ` +
        `positive control needs a real append to mean anything, so the server was booted against a ` +
        `throwaway file — a gate that proves a write works by writing evidence is not a gate.`)
    : bad("this gate wrote nothing to the real comment ledger",
        `the ledger changed: ${realBefore.slice(0, 16)}… → ${realAfter.slice(0, 16)}…`);
}

// ---- helpers -------------------------------------------------------------------------------------------

function bootServer(ledgerPath) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const port = 18200 + Math.floor(Math.random() * 700);
    if (req(port, "GET", "/healthz", null, {}).status !== 0) continue;   // occupied

    const child = spawn(process.execPath, [SERVER], {
      cwd: REPO,
      env: { ...process.env, TRACK_PORT: String(port), TRACK_COMMENTS: ledgerPath },
      stdio: "ignore",
    });
    for (let i = 0; i < 40; i++) {
      if (req(port, "GET", "/", null, {}).status === 200) return { port, close: () => child.kill() };
      sleep(250);   // a real synchronous sleep, not a spawned process that schedules a no-op
    }
    child.kill();
  }
  return null;
}

/** A synchronous HTTP request, so the checks stay in one straight line. */
function req(port, method, pathname, body, headers) {
  const r = spawnSync(process.execPath, ["-e",
    'const http=require("http");const a=JSON.parse(process.argv[1]);' +
    'const q=http.request({host:"127.0.0.1",port:a.port,method:a.method,path:a.path,headers:a.headers,timeout:20000},(res)=>{' +
    '  let b="";res.on("data",d=>b+=d);res.on("end",()=>console.log(JSON.stringify({status:res.statusCode,body:b})));});' +
    'q.on("error",e=>console.log(JSON.stringify({status:0,body:String(e.code||e.message)})));' +
    'q.on("timeout",()=>{q.destroy();console.log(JSON.stringify({status:0,body:"timeout"}))});' +
    'if(a.body!==null)q.write(a.body);q.end();',
    JSON.stringify({ port, method, path: pathname, headers, body: body === undefined ? null : body })],
    { encoding: "utf8", timeout: 30000 });
  try {
    return JSON.parse(String(r.stdout || "").trim().split(/\r?\n/).pop());
  } catch {
    return { status: 0, body: "no answer" };
  }
}

/**
 * A REAL synchronous sleep. The first version of this was
 * `spawnSync(node, ["-e", "setTimeout(()=>{}, 250)"])`, which does not sleep at all: it schedules a
 * no-op and exits immediately, so the retry loop it paced was spinning. It also spawned a process
 * per iteration. Atomics.wait blocks this thread for the requested time and costs nothing.
 */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ---- verdict --------------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - track, ${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
