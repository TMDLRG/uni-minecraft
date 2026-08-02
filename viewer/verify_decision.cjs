// verify_decision.cjs — the operator's answer can be RECORDED, and it can be recorded ONLY.
//
// WHAT THIS GATE IS FOR
// ---------------------
// POST /api/decision is the first MUTATING surface built for the operator rather than for an agent,
// and it is the only new one in the Phase 3 plan. A write route on a server that binds 0.0.0.0 is
// exactly where this repository has been bitten before: TRACK's own comment route shipped with a read
// law and no write fence, and its header claimed "a polled READ never spawns anything" while the
// write had nothing at all.
//
// So this gate asks two different questions, and they fail in opposite directions:
//
//   1. DOES IT REFUSE?  non-loopback peer, rebound Host, missing CSRF header, wrong content-type,
//      oversize body, and a subject the plan never asks about.
//   2. DOES IT ACCEPT?  a same-origin, correctly-fenced, well-formed decision must be RECORDED.
//      Without this positive control the whole gate passes by refusing everything, which is the
//      cheapest possible false green and the one a fence gate is most likely to ship.
//
//   3. AND IS THAT ALL IT DOES?  a real append must leave evidence/gates.ndjson (S4 — the operator's
//      alone), the control-plane ledger, the comment ledger and viewer/.presence/ BYTE-IDENTICAL.
//      Proved by hashing them either side of a live request, not by reading the source and believing
//      it. "It only writes one file" is a claim about behaviour, and this repository has already
//      convicted itself once for evidencing a behavioural claim with three regexes.
//
// THE CLAIM LEVEL IS CHECKED AS A CLAIM. Every row must carry `presence_evident` and a caveat naming
// what was NOT proved. A row that dropped the caveat would read as authentication, and an agent on
// this box can produce every row this endpoint accepts.
//
// NOTHING MAY CONSUME IT AS AUTHORITY. The last check greps the tree: if any file other than the
// writer, the reader and this gate reads decisions.ndjson, an agent has gained the ability to
// authorise itself by writing a file, and that is a fault regardless of what the reader does with it.
//
// IT NEVER TOUCHES THE REAL LEDGER. The server is booted as a child against a throwaway
// TRACK_DECISIONS path in a temp dir — the same technique verify_track.cjs uses for TRACK_COMMENTS,
// and for the same reason: a positive control that appends to the real evidence file is a gate that
// writes evidence.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const REPO = path.join(__dirname, "..");
const SERVER = path.join(__dirname, "track", "track_server.cjs");
const D = require("./track/decisions.cjs");

const PORT = Number(process.env.DECISION_GATE_PORT || 8137);
const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const sha = (p) => { try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); } catch { return "ABSENT"; } };

// Hash a whole directory tree (used for viewer/.presence/, which may not exist — "ABSENT" is a
// perfectly good fingerprint and stays stable as long as it stays absent).
function treeSha(dir) {
  if (!fs.existsSync(dir)) return "ABSENT";
  const parts = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else parts.push(e.name + ":" + sha(p));
    }
  };
  walk(dir);
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

function request({ pathname = "/api/decision", method = "POST", headers = {}, body = "", host }) {
  return new Promise((resolve) => {
    const h = { "content-type": "application/json", "x-uni-cc": "1", ...headers };
    if (host) h.host = host;
    const req = http.request({ host: "127.0.0.1", port: PORT, path: pathname, method, headers: h }, (res) => {
      let b = "";
      res.on("data", (d) => (b += d));
      res.on("end", () => resolve({ status: res.statusCode, body: b }));
    });
    req.on("error", (e) => resolve({ status: 0, body: "ERR " + e.message }));
    req.setTimeout(8000, () => { req.destroy(); resolve({ status: 0, body: "TIMEOUT" }); });
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uni-decision-"));
  const ledger = path.join(tmp, "decisions.ndjson");
  let child = null;

  // Fingerprints of every file this route must NOT touch.
  const GATES = path.join(REPO, "evidence", "gates.ndjson");
  const CPL = path.join(REPO, "evidence", "control_plane", "ledger.ndjson");
  const COMMENTS = path.join(REPO, "evidence", "track_comments.ndjson");
  const PRESENCE = path.join(REPO, "viewer", ".presence");
  const before = { gates: sha(GATES), cp: sha(CPL), comments: sha(COMMENTS), presence: treeSha(PRESENCE) };

  try {
    child = spawn(process.execPath, [SERVER], {
      cwd: REPO,
      env: { ...process.env, TRACK_PORT: String(PORT), TRACK_DECISIONS: ledger },
      stdio: "ignore",
    });
    // Wait for it to answer rather than sleeping a guessed amount.
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      await sleep(250);
      const r = await request({ pathname: "/healthz", method: "GET", body: "" });
      up = r.status === 200;
    }
    if (!up) {
      bad("the server under test came up", `no answer on 127.0.0.1:${PORT} after 15s — nothing below was measured`);
      throw new Error("server did not start");
    }
    ok("the server under test came up", `127.0.0.1:${PORT}, writing a THROWAWAY ledger at ${ledger} — the real evidence file is never touched`);

    // ---- what is even decidable, read live from the plan --------------------------------------
    const subjects = D.subjects();
    const stop = subjects.find((s) => s.kind === "stop");
    subjects.length >= 10 && stop
      ? ok("the decidable set is read LIVE from the plan, not hardcoded",
          `${subjects.length} decidable item(s): ${subjects.filter((s) => s.kind === "stop").length} stops, ` +
          `${subjects.filter((s) => s.kind === "not_mine").length} not_mine, ` +
          `${subjects.filter((s) => s.kind === "operator_step").length} OPERATOR step(s). ` +
          `Add a stop to the plan and it becomes answerable with no edit here.`)
      : bad("the decidable set is read LIVE from the plan, not hardcoded", `got ${subjects.length} subject(s)`);

    // ---- 1. THE REFUSALS ----------------------------------------------------------------------
    const good = JSON.stringify({ subject: stop.id, decision: "a test decision written by the gate", actor: "gate", role: "test" });

    {
      const r = await request({ headers: { "x-uni-cc": "0" }, body: good });
      r.status === 403
        ? ok("REFUSED without the `x-uni-cc: 1` header", "403 — the house CSRF fence; a cross-site simple request cannot set it without a preflight")
        : bad("REFUSED without the `x-uni-cc: 1` header", `expected 403, got ${r.status}: ${r.body.slice(0, 160)}`);
    }
    {
      const r = await request({ headers: { "content-type": "text/plain" }, body: good });
      r.status === 403
        ? ok("REFUSED without `content-type: application/json`", "403 — text/plain is CORS-simple and a JS-free <form> can send it; JSON forces a preflight")
        : bad("REFUSED without `content-type: application/json`", `expected 403, got ${r.status}: ${r.body.slice(0, 160)}`);
    }
    {
      // DNS REBINDING: the request arrives over loopback carrying an attacker's hostname. Peer and
      // headers all look right; only the Host header still names the attacker.
      const r = await request({ host: "evil.test", body: good });
      r.status === 403 && /Host|127\.0\.0\.1 or localhost/i.test(r.body)
        ? ok("REFUSED when the Host header is not a loopback name (DNS rebinding)",
            "403 — arrives over loopback, same-origin to the browser, every other fence satisfied. The Host header is the only place the rebound request still carries the attacker's name.")
        : bad("REFUSED when the Host header is not a loopback name (DNS rebinding)", `expected 403, got ${r.status}: ${r.body.slice(0, 160)}`);
    }
    {
      const big = JSON.stringify({ subject: stop.id, decision: "x".repeat(70000) });
      const r = await request({ body: big });
      r.status !== 200
        ? ok("REFUSED an oversize body (>64 KB)", `the socket is destroyed past 65536 bytes rather than buffered; got ${r.status === 0 ? "a dropped connection" : r.status}`)
        : bad("REFUSED an oversize body (>64 KB)", `a 70 KB body was ACCEPTED with 200 — the cap is not enforced`);
    }
    {
      const r = await request({ body: JSON.stringify({ subject: "a question nobody asked", decision: "yes" }) });
      const j = (() => { try { return JSON.parse(r.body); } catch { return {}; } })();
      r.status === 400 && j.code === "UNKNOWN_SUBJECT" && Array.isArray(j.decidable)
        ? ok("REFUSED a subject the plan never asks about, and SAID what is decidable",
            `400 UNKNOWN_SUBJECT, and the refusal carries all ${j.decidable.length} answerable items. A ledger of answers to unstated questions is one nothing can reconcile.`)
        : bad("REFUSED a subject the plan never asks about, and SAID what is decidable", `got ${r.status}: ${r.body.slice(0, 200)}`);
    }
    {
      const r = await request({ body: JSON.stringify({ subject: stop.id, decision: "   " }) });
      const j = (() => { try { return JSON.parse(r.body); } catch { return {}; } })();
      r.status === 400 && j.code === "EMPTY_DECISION"
        ? ok("REFUSED an empty decision", "400 EMPTY_DECISION — a blank row would read as an answer")
        : bad("REFUSED an empty decision", `got ${r.status}: ${r.body.slice(0, 160)}`);
    }

    // Nothing may have been written by any refusal.
    fs.existsSync(ledger) && fs.readFileSync(ledger, "utf8").trim() !== ""
      ? bad("NO refusal wrote a row", "the throwaway ledger is non-empty after six refusals")
      : ok("NO refusal wrote a row", "the throwaway ledger is still empty after all six refusals — a refused request that writes anyway is a fence with a hole behind it");

    // ---- 2. THE POSITIVE CONTROL --------------------------------------------------------------
    let accepted = null;
    {
      const r = await request({ body: good });
      const j = (() => { try { return JSON.parse(r.body); } catch { return {}; } })();
      accepted = j.row || null;
      r.status === 200 && accepted && accepted.seq === 1
        ? ok("NEGATIVE CONTROL: a correctly-fenced decision IS recorded",
            `200, seq 1, subject ${accepted.subject} (${accepted.subject_kind}). Without this the five refusals above ` +
            `would be satisfied by a route that refuses everything, which is the cheapest false green a fence gate can ship.`)
        : bad("NEGATIVE CONTROL: a correctly-fenced decision IS recorded", `got ${r.status}: ${r.body.slice(0, 220)}`);
    }
    {
      const carries = accepted && accepted.claim_level === "presence_evident" &&
        /NOT unforgeable/i.test(String(accepted.claim_caveat)) && /agent on this box/i.test(String(accepted.claim_caveat));
      carries
        ? ok("every row carries `presence_evident` AND the caveat, in the row itself",
            "the fences prove the request came from this box as a loopback name with a preflight-forcing header. NONE PROVES A HUMAN. " +
            "A row that dropped the caveat would read as authentication.")
        : bad("every row carries `presence_evident` AND the caveat, in the row itself",
            `claim_level=${accepted && accepted.claim_level} caveat=${String(accepted && accepted.claim_caveat).slice(0, 120)}`);
    }
    {
      const serverWitness = accepted && /peer 127\.0\.0\.1|peer ::1|peer ::ffff:127\.0\.0\.1/.test(String(accepted.witness));
      // And a caller must NOT be able to dictate it.
      const r = await request({ body: JSON.stringify({ subject: stop.id, decision: "second", witness: "the operator was definitely here, honest" }) });
      const j = (() => { try { return JSON.parse(r.body); } catch { return {}; } })();
      const forged = j.row && /honest/.test(String(j.row.witness));
      serverWitness && !forged
        ? ok("the witness is written by the SERVER and cannot be supplied by the caller",
            `recorded "${String(accepted.witness).slice(0, 80)}…"; a caller-supplied witness was DROPPED. A caller-supplied witness is a caller telling you what to believe about it.`)
        : bad("the witness is written by the SERVER and cannot be supplied by the caller",
            `serverWitness=${serverWitness} forged=${forged} got=${String(j.row && j.row.witness).slice(0, 120)}`);
    }

    // ---- 3. THE CHAIN --------------------------------------------------------------------------
    {
      const rows = D.readRows(ledger);
      const v = D.verify(rows);
      v.ok && rows.length === 2
        ? ok("the ledger is a verifying hash chain", `${rows.length} rows, head ${String(v.head).slice(0, 16)}…, every prev_hash resolves and seq is contiguous`)
        : bad("the ledger is a verifying hash chain", `rows=${rows.length} faults=${JSON.stringify(v.faults).slice(0, 200)}`);
    }
    {
      // MUTATION: edit a row in place, as an agent quietly rewriting history would.
      const rows = D.readRows(ledger);
      const tampered = rows.map((r, i) => (i === 0 ? { ...r, decision: "something he never said" } : r));
      const v = D.verify(tampered);
      const caught = !v.ok && v.faults.some((f) => /EDITED AFTER IT WAS WRITTEN/.test(f));
      caught
        ? ok("MUTATION: a row edited after the fact is CAUGHT", `"${v.faults[0].slice(0, 130)}…"`)
        : bad("MUTATION: a row edited after the fact is CAUGHT", `the chain still verified after a row's text was replaced: ${JSON.stringify(v.faults).slice(0, 200)}`);
    }
    {
      // MUTATION: drop a row from the middle — the shape a deletion actually takes.
      const rows = D.readRows(ledger);
      const v = D.verify([rows[0], { ...rows[1], seq: 3 }]);
      !v.ok
        ? ok("MUTATION: a renumbered/removed row is CAUGHT", `"${v.faults[0].slice(0, 130)}…"`)
        : bad("MUTATION: a renumbered/removed row is CAUGHT", "a renumbered chain verified");
    }
    {
      // The canonical form must depend on CONTENT ONLY, never on key insertion order — otherwise two
      // readers of the same row compute different hashes and the chain means nothing across processes.
      const a = { seq: 1, utc: "z", actor: "m", decision: "d" };
      const b = { decision: "d", actor: "m", utc: "z", seq: 1 };
      D.hashOf(a) === D.hashOf(b)
        ? ok("NEGATIVE CONTROL: the hash depends on content, not on key order", `both orderings give ${D.hashOf(a).slice(0, 16)}… — sorted-key canonical JSON, the same rule as SP.ControlPlane.Ledger.canonical/1`)
        : bad("NEGATIVE CONTROL: the hash depends on content, not on key order", "two key orderings of the same row hashed differently");
    }
    {
      // And it must actually distinguish rows — a hash that ignores content would pass the check above.
      D.hashOf({ a: 1 }) !== D.hashOf({ a: 2 })
        ? ok("NEGATIVE CONTROL: the hash distinguishes different content", "a one-byte change moves the digest, so the order-independence check above is not vacuous")
        : bad("NEGATIVE CONTROL: the hash distinguishes different content", "two different rows hashed identically");
    }

    // ---- 4. AND THAT IS ALL IT DOES ------------------------------------------------------------
    {
      const after = { gates: sha(GATES), cp: sha(CPL), comments: sha(COMMENTS), presence: treeSha(PRESENCE) };
      const moved = Object.keys(before).filter((k) => before[k] !== after[k]);
      moved.length === 0
        ? ok("a real append touched NOTHING ELSE — not gates.ndjson, not the control-plane ledger, not presence",
            `hashed either side of ${results.length} live requests including two accepted writes: ` +
            `evidence/gates.ndjson ${before.gates.slice(0, 12)}… (S4, the operator's alone) · control-plane ledger ${before.cp.slice(0, 12)}… · ` +
            `track_comments ${before.comments.slice(0, 12)}… · viewer/.presence ${before.presence === "ABSENT" ? "ABSENT, and still absent" : before.presence.slice(0, 12) + "…"}. ` +
            `MEASURED, not read off the source.`)
        : bad("a real append touched NOTHING ELSE — not gates.ndjson, not the control-plane ledger, not presence",
            `THESE MOVED: ${moved.join(", ")} — the decision route wrote something that is not its own ledger`);
    }
    {
      // The route must not be able to mint presence even by name: no write path in the module or the
      // handler may mention the presence dir or the go-live token.
      const src = fs.readFileSync(path.join(REPO, "viewer", "track", "decisions.cjs"), "utf8");
      const writes = [...src.matchAll(/fs\.(appendFileSync|writeFileSync|mkdirSync|rmSync|unlinkSync)\(([^)]*)\)/g)].map((m) => m[0]);
      const onlyLedger = writes.every((w) => /ledgerPath/.test(w));
      onlyLedger && writes.length > 0
        ? ok("the module's every write targets the decision ledger and nothing else",
            `${writes.length} write call(s), all against ledgerPath: ${writes.map((w) => w.slice(0, 46)).join(" · ")}`)
        : bad("the module's every write targets the decision ledger and nothing else",
            `${writes.length} write call(s): ${writes.join(" · ").slice(0, 240)}`);
    }
    {
      // NOTHING MAY CONSUME IT AS AUTHORITY.
      //
      // USE VERSUS MENTION, AND THE FIRST VERSION OF THIS CHECK GOT IT WRONG — in the gate written to
      // guard against exactly that. It was a naive substring search, so it convicted
      // `viewer/gate_registry.json`, whose only occurrence of the string is inside the `_why` PROSE
      // describing this very gate. It reported "read by: viewer/gate_registry.json" about a file that
      // cannot read anything: JSON is data. The gate passed 20/20 when it was written and went red the
      // moment it was registered, because registering it added the word to a description.
      //
      // This repository has convicted a word-list detector for the same fault before — resonance L3's
      // mutation detector matched four gates ON PROSE ALONE — and its conclusion is the one taken here:
      // a judgement pretending to be a pattern match is the thing being guarded against, so the
      // exceptions are DECLARED IN THE OPEN, one line each, and every one taken is PRINTED rather than
      // counted. An allowlist that grows silently is the same defect wearing a different hat.
      //
      // Whole-line comments are stripped first, because a comment cannot read a file either.
      const DECLARED_MENTIONS = {
        "viewer/track/decisions.cjs": "THE WRITER — the only append path",
        "viewer/track/track_server.cjs": "THE ROUTE — POST /api/decision and GET /api/decisions",
        "viewer/verify_decision.cjs": "THIS GATE",
        "viewer/gate_registry.json": "PROSE ONLY — the `_why` field describing this gate. JSON is data; it reads nothing.",
      };
      const codeOnly = (src) =>
        src.split(/\r?\n/).filter((l) => { const t = l.trim(); return !t.startsWith("//") && !t.startsWith("#") && !t.startsWith("*"); }).join("\n");
      const hits = [];
      const declaredSeen = [];
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) { if (!/node_modules|_build|\.git|deps|runtime|snapshots/.test(e.name)) walk(path.join(d, e.name)); continue; }
          if (!/\.(cjs|js|mjs|ex|exs|py|ps1|json|yml)$/.test(e.name)) continue;
          const p = path.join(d, e.name);
          const rel = path.relative(REPO, p).replace(/\\/g, "/");
          let src; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
          if (!codeOnly(src).includes("decisions.ndjson")) continue;
          if (DECLARED_MENTIONS[rel]) declaredSeen.push(`${rel} (${DECLARED_MENTIONS[rel]})`);
          else hits.push(rel);
        }
      };
      for (const d of ["viewer", "lib", "test", "runs", "production", ".github"]) {
        const full = path.join(REPO, d);
        if (fs.existsSync(full)) walk(full);
      }
      hits.length === 0
        ? ok("NOTHING ELSE IN THE TREE READS decisions.ndjson",
            `a decision is a RECORD of an answer, never a licence to act on it — if a gate ever read this ` +
            `file to decide whether it may proceed, an agent would have gained the ability to authorise ` +
            `itself by writing a file. ${declaredSeen.length} DECLARED mention(s), each printed rather ` +
            `than counted: ${declaredSeen.join(" · ")}`)
        : bad("NOTHING ELSE IN THE TREE READS decisions.ndjson",
            `UNDECLARED reference in: ${hits.join(", ")} — either it reads the ledger (a fault) or it ` +
            `merely names it (declare it in DECLARED_MENTIONS with the reason, in the open)`);
    }
  } catch (e) {
    if (!results.some((r) => !r.pass)) bad("the gate ran to completion", e.message);
  } finally {
    if (child) child.kill();
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
  console.log(`\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - decision, ${results.length - failed.length}/${results.length} checks in ${Date.now() - t0} ms`);
  console.log("  WHAT THIS GATE DOES NOT ESTABLISH: that any row was written BY THE OPERATOR. It cannot,");
  console.log("  and neither can the endpoint. An agent on this box satisfies every fence. The claim");
  console.log("  level is `presence_evident` and the ledger is tamper-EVIDENT, not authentic.");
  process.exit(failed.length === 0 ? 0 : 1);
})();
