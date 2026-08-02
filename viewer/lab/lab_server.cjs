// lab_server.cjs — THE LAB, on http://127.0.0.1:8103/lab   (Phase 9 step 4.6, build L0)
//
// L0 IS AN EMPTY ROOM AND THAT IS THE POINT. Floor, grid, walls, three room shells, five arches,
// the Gaia dome, WASD, click-to-stand. ZERO NODES. Nothing served here knows what a truth_class
// is, and nothing here reads the Control Plane.
//
// The discipline is not modesty, it is order. L2 is "the screenshot gate, AND IT MUST BITE" — it
// has to fail on swapped materials — and a gate cannot prove that against a renderer that already
// assumed the materials. So L0 commits to nothing, L1 brings the five materials from a FIXTURE,
// and only then is there something for L2 to swap.
//
// READ-ONLY, WITH EXACTLY ONE WRITE-SHAPED ROUTE, AND THAT SENTENCE CHANGED ON 2026-07-28.
//
// Through L4 this read: "There is no POST branch here — not a guarded one, an absent one." That was
// true and it is not any more: L5's desk runs a registered gate, which DOES something, and dressing
// it as a GET to keep the sentence true would have been the dishonest way to preserve it. An
// adversarial sweep found this paragraph still standing 178 lines above the guarded POST branch —
// a file describing itself as it was, which is the most persuasive kind of wrong.
//
// So: `POST /api/lab/run`, and nothing else. Loopback Host, `x-uni-cc: 1`, JSON content-type,
// one-at-a-time, a timeout on the child, and an exact-match allowlist of one path. A surface built
// to be walked around should not be able to change anything by being walked around in — and the one
// thing it can do, it does in a throwaway checkout it then deletes.
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const buildIdentity = require("../build_identity.cjs"); // BOOT IDENTITY — the commit THIS process runs

// 8103 is the lab. UNI_LAB_PORT exists so the L5 gate can boot THIS SERVER on an ephemeral port and
// test the CSRF fence with real requests — the previous version regexed the source for the route
// table and concluded "exactly one non-GET route", which is true and says nothing about who may call
// it. A fence has to be asked, not read.
const PORT = Number(process.env.UNI_LAB_PORT) || 8103;
const PAGE = path.join(__dirname, "lab.html");
const L1 = path.join(__dirname, "l1.html");
const FIXTURE = path.join(__dirname, "fixtures", "l1_materials.json");
const L3 = path.join(__dirname, "l3.html");
const projection = require("./projection.cjs");   // L3: the real gate ledger, read live
const L4 = path.join(__dirname, "l4.html");
const rooms = require("./rooms.cjs");             // L4: the building, F31's guard, the portal probes
const L5 = path.join(__dirname, "l5.html");
const desk = require("./desk.cjs");               // L5: the exact row, and the run from committed bytes
const L6 = path.join(__dirname, "l6.html");
const gauntlet = require("./gauntlet.cjs");       // L6: the whole lab in one walk, and the co-sign

// L6's gauntlet takes ~28s (L5 alone boots the BEAM and cycles worktrees). It runs ONCE, in a
// background child that streams progress, so the event loop stays free and the stations light one by
// one. `spawnSync` in the handler would freeze every other poll for the whole run.
let gauntState = null;
function startGauntlet() {
  if (gauntState) return;
  const { spawn } = require("child_process");
  gauntState = {
    started_at: Date.now(),
    builds: gauntlet.BUILDS.map((b) => ({ id: b.id, title: b.title, done: false, passed: false, checks: null })),
    passed: 0, of: gauntlet.BUILDS.length, all_green: false, finished: false,
  };
  const child = spawn(process.execPath, [path.join(__dirname, "gauntlet.cjs")], { cwd: gauntlet.REPO });
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if (msg.step) {
        const s = gauntState.builds.find((b) => b.id === msg.step.id);
        if (s) { s.done = true; s.passed = msg.step.passed; s.checks = msg.step.checks; s.killed = msg.step.killed; }
        gauntState.passed = gauntState.builds.filter((b) => b.done && b.passed).length;
      }
      if (msg.done) {
        gauntState.finished = true;
        gauntState.all_green = gauntState.builds.every((b) => b.done && b.passed);
      }
    }
  });
  child.on("close", () => { gauntState.finished = true; gauntState.all_green = gauntState.builds.every((b) => b.done && b.passed); });
  child.on("error", () => { gauntState.error = true; });
}

// One run at a time. Each one checks out a worktree of the real repository; unbounded concurrency is
// unbounded worktrees, and the second request is refused rather than queued so the caller is told.
let runInFlight = false;

const server = http.createServer((req, res) => {
  const send = (code, type, body) => {
    res.writeHead(code, {
      "content-type": type,
      // A room you walk around must not be cached into a room from last week — the same reason
      // TRACK caches nothing.
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    res.end(body);
  };

  // GET-ONLY, WITH EXACTLY ONE CARVE-OUT, NAMED HERE.
  //
  // L0 through L4 were GET-only by omission and the refusal below said "there is no other branch",
  // which was true. L5 needs one: the desk runs a gate, which DOES something, and dressing that as a
  // GET to keep a sentence true would be the dishonest way to preserve it.
  //
  // So the carve-out is a single exact pathname, listed by name, refused for every other path and
  // every other method. It is not a wildcard and it is not a prefix, because a prefix is how one
  // exception becomes a class of them. The L5 gate asserts this set has exactly one member.
  const POST_ALLOWED = new Set(["/api/lab/run"]);
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (req.method === "POST" && POST_ALLOWED.has(url.pathname)) {
    // falls through to that route, and only that route
  } else if (req.method !== "GET" && req.method !== "HEAD") {
    return send(405, "text/plain",
      "the lab is read-only apart from POST /api/lab/run, which runs a registered gate in a " +
      "throwaway worktree at HEAD and writes nothing your working tree can see. It DOES write " +
      ".git/worktrees while the checkout exists, and removes it afterwards — 'writes nothing' was " +
      "the old wording here and it was false at the .git level.");
  }

  if (url.pathname === "/api/identity") {
    return send(200, "application/json", JSON.stringify(buildIdentity.identity(), null, 2));
  }
  if (url.pathname === "/healthz") return send(200, "text/plain", "ok");

  // L0 SERVES ITS OWN CENSUS, and the honest number is zero. A surface that shows nothing should
  // say it shows nothing, out loud and in machine-readable form, rather than leaving a reader to
  // wonder whether the room is empty or the feed is broken.
  if (url.pathname === "/api/lab") {
    return send(200, "application/json", JSON.stringify({
      build: "L0",
      title: "THE EMPTY ROOM",
      nodes: 0,
      why_zero:
        "L0 commits to nothing about truth_class. L1 brings the five materials from a fixture and " +
        "L2's screenshot gate must be able to FAIL on swapped materials — which it cannot prove " +
        "against a renderer that already assumed them.",
      renders: ["floor", "grid", "walls", "room_shells:3", "arches:5", "gaia_dome", "you"],
      controls: ["WASD", "shift-stride", "click-to-stand"],
      cpu_only: "2d canvas; no WebGL, no WebGPU, no Three.js — enforced by viewer/lab/verify_lab_l0.cjs",
      identity: buildIdentity.identity(),
    }, null, 2));
  }

  // L1 — the five materials, from a fixture. SOCKET-FREE: this route reads a FILE, and there is
  // no route here that reads live state. The projection is L3's build, and a renderer that
  // reached for real gates before anything could say what a fogged one looks like would be
  // showing a claim it had not earned.
  if (url.pathname === "/api/lab/fixture") {
    try {
      return send(200, "application/json", fs.readFileSync(FIXTURE, "utf8"));
    } catch {
      return send(500, "text/plain", "fixture missing");
    }
  }
  // L3 - THE PROJECTION. The first route here that reads LIVE state: the real gate ledger, at
  // 1 Hz, diff-suppressed. Still a READ - it opens one file and writes nothing.
  if (url.pathname === "/api/lab/live") {
    return send(200, "application/json", JSON.stringify(projection.poll(), null, 1));
  }
  if (url.pathname === "/lab/l3") {
    try {
      return send(200, "text/html; charset=utf-8", fs.readFileSync(L3, "utf8"));
    } catch {
      return send(500, "text/plain", "l3.html missing");
    }
  }

  // L4 - ROOMS, AIRLOCKS, PORTALS. Also a READ, in both directions: `building()` opens the plan,
  // the ledger and F31's guard and returns; `probePortals()` issues GET and nothing else, to the
  // declared loopback table and nothing else. Neither can open a door - a surface that draws one
  // must not be able to walk through it.
  if (url.pathname === "/api/lab/rooms") {
    return send(200, "application/json", JSON.stringify(rooms.building(), null, 1));
  }
  if (url.pathname === "/api/lab/portals") {
    return rooms
      .probePortals()
      .then((portals) =>
        send(200, "application/json", JSON.stringify({
          probed: true,
          note:
            "liveness comes only from a real probe (F26). `up` means it answered, and the status " +
            "code says what it answered with; `down` means it was asked and did not; `not_probed` " +
            "means nobody looked, which is a different fact from either.",
          portals,
        }, null, 1))
      )
      .catch((e) => send(500, "application/json", JSON.stringify({ error: String(e && e.message) })));
  }
  if (url.pathname === "/lab/l4") {
    try {
      return send(200, "text/html; charset=utf-8", fs.readFileSync(L4, "utf8"));
    } catch {
      return send(500, "text/plain", "l4.html missing");
    }
  }

  // L5 - THE DESK. Reads: the registry, the ledger, the schema's shape. Shows the exact bytes that
  // would be appended and NEVER appends them (S4).
  if (url.pathname === "/api/lab/stations") {
    return send(200, "application/json", JSON.stringify({ stations: desk.stations(), gap: desk.theGap() }, null, 1));
  }
  if (url.pathname === "/api/lab/desk") {
    const id = url.searchParams.get("gate") || "";
    const may = desk.canRun(id);
    return send(200, "application/json", JSON.stringify({
      gate: id,
      before: desk.preRegistration(id),
      // Asked for WITHOUT a run, deliberately, so the page shows the refusal rather than a blank:
      // the after-row does not exist until something has run.
      after_refusal: desk.afterRun(id, null),
      may_run: may.allowed ? { allowed: true } : { allowed: false, code: may.code, why: may.why },
    }, null, 1));
  }
  // The one POST in this lab, and it is a POST because it DOES something.
  //
  // FENCED TWO WAYS, and the second was MISSING until an adversarial audit found it on 2026-07-28.
  //
  //   AGAINST THE ID BEING A COMMAND — held from the start. The body's gate id is a lookup key
  //   against the registry, the argv comes from the registry entry, no shell, and the process runs
  //   in a throwaway worktree at HEAD.
  //
  //   AGAINST THE REQUEST BEING UNWANTED — absent. There was no Origin check, no CSRF header, and
  //   JSON.parse ignored content-type, so the exact shape a browser sends with NO preflight
  //   (Content-Type: text/plain, or a JS-free auto-submitting form, which CORS does not govern at
  //   all) was accepted and acted on. Any page the operator had open could make his lab spawn gates
  //   and git worktrees in his own repository.
  //
  // The fix is not new: this repository already mandates it. `viewer/command_center.cjs:1579` carries
  // the same header check, and ADR-PROD-015 specifies "GET-only + ONE loopback-only POST … requiring
  // header x-uni-cc: 1" — L5's architecture, verbatim, with the fence made mandatory. L5 kept the
  // body cap and the loopback bind and dropped the fence. A custom header and a JSON content-type
  // each force a CORS preflight, so no third-party page can fire this as a simple request.
  //
  // ONE AT A TIME. Each run adds a git worktree to the real repository and spawns a child; without a
  // bound, a loop is unbounded worktrees. Refusing the second is honest and cheap.
  if (url.pathname === "/api/lab/run" && req.method === "POST") {
    if (req.headers["x-uni-cc"] !== "1" ||
        !String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      return send(403, "text/plain",
        "POST /api/lab/run requires header `x-uni-cc: 1` and `content-type: application/json`. " +
        "The lab is walked from its own page, not from someone else's — both requirements force a " +
        "CORS preflight, which a cross-site simple request or a plain <form> cannot satisfy.");
    }

    // HOST PIN — added 2026-07-28, and its absence was the audit's "probe C", unimplemented in the
    // first pass. A header fence stops CSRF. It does NOT stop DNS REBINDING: an attacker-controlled
    // hostname that resolves to 127.0.0.1 is SAME-ORIGIN to the browser, so the page may set any
    // header it likes and read the response back. Pinning Host to a loopback name closes it, because
    // the rebound request arrives carrying the attacker's hostname.
    const host = String(req.headers.host || "").toLowerCase().split(":")[0];
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]" && host !== "::1") {
      return send(403, "text/plain",
        `Host "${req.headers.host}" is not a loopback name. This route is reachable only as ` +
        `127.0.0.1 or localhost — a header fence stops CSRF but not DNS rebinding, where a hostname ` +
        `that resolves to loopback is same-origin to the browser and can set any header it likes.`);
    }
    // ORIGIN, when present. A same-origin fetch from the lab's own page sends none; a cross-site one
    // sends the attacker's. Both are refused above, so this is defence in depth and is checked
    // second on purpose — a fence that depends on one condition is one condition from being open.
    const origin = String(req.headers.origin || "");
    if (origin && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)) {
      return send(403, "text/plain", `Origin "${origin}" is not this lab.`);
    }

    // THE BOUND IS TAKEN HERE, NOT IN `end`. It used to be READ when the headers arrived and SET when
    // the body finished, so two POSTs overlapping in body transfer both passed the check and both
    // ran — a TOCTOU race, in the guard whose entire job is "one at a time". Node's HTTP handling is
    // single-threaded, so claiming the slot in the same synchronous block that tests it is enough.
    if (runInFlight) {
      return send(409, "text/plain",
        "a run is already under way. Each run checks out a worktree of this repository and spawns a " +
        "child; letting them stack would leave worktrees behind faster than they are removed.");
    }
    runInFlight = true;
    const release = () => { runInFlight = false; };

    let body = "";
    req.on("data", (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on("aborted", release);
    req.on("error", release);
    req.on("end", () => {
      let id = "";
      try {
        id = String(JSON.parse(body).gate || "");
      } catch {
        release();
        return send(400, "text/plain", "expected {\"gate\":\"<registered id>\"}");
      }
      const may = desk.canRun(id);
      if (!may.allowed) {
        release();
        return send(200, "text/plain", ` RESULT ${JSON.stringify({ refused: may })}\n`);
      }

      // If the caller walks away mid-run the child keeps going — it is in its own worktree and
      // killing it halfway would leave a half-finished gate looking like a failing one. What must
      // NOT happen is the slot staying held forever, so the release is tied to the run, not the
      // socket, and `res.write` after a closed socket is a no-op rather than a throw.
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      let gone = false;
      res.on("close", () => { gone = true; });

      desk
        .run(id, (line) => { if (!gone) res.write(line + "\n"); })
        .then((observed) => {
          const after = observed.refused ? null : desk.afterRun(id, observed);
          // `run_token` is stripped. It is already spent by `afterRun` above, so a replay fails —
          // but a single-use credential does not belong on the wire at all.
          const { output, run_token, ...seen } = observed;
          if (!gone) res.end(" RESULT " + JSON.stringify({ observed: seen, after }) + "\n");
        })
        .catch((e) => { if (!gone) res.end(" RESULT " + JSON.stringify({ error: String(e && e.message) }) + "\n"); })
        .finally(release);
    });
    return;
  }
  if (url.pathname === "/lab/l5") {
    try {
      return send(200, "text/html; charset=utf-8", fs.readFileSync(L5, "utf8"));
    } catch {
      return send(500, "text/plain", "l5.html missing");
    }
  }

  // L6 - THE GAUNTLET, THEN THE CO-SIGN. A READ: it starts the gauntlet child (once) and reads F31's
  // guard for the co-sign. The co-sign is instant and always HOLD until a presence mint exists.
  if (url.pathname === "/api/lab/gauntlet") {
    startGauntlet();
    return send(200, "application/json", JSON.stringify({ ...gauntState, cosign: gauntlet.coSign() }, null, 1));
  }
  // THE TWO IMAGES CHECKPOINT E ASKS FOR. The organic-operator co-sign found L6 telling the operator
  // to "look at two images, distinguishable with no text read" while the page showed none — his one
  // move was homework. These render L2's rasteriser directly: swap=0 is the golden fixture, swap=1 is
  // L2's canonical material swap. Rendered in memory, nothing written. He looks; he decides; no text.
  if (url.pathname === "/api/lab/shot") {
    try {
      const shot = require("./shot.cjs");
      const nodes = shot.fixture();
      const swap = url.searchParams.get("swap") === "1"
        ? { lit_solid: "seamed_solid", seamed_solid: "lit_solid" }   // L2's canonical swap — verify_shot.cjs:44
        : null;
      return send(200, "image/png", shot.png(shot.render(nodes, swap)));
    } catch (e) {
      return send(500, "text/plain", "shot render failed: " + (e && e.message));
    }
  }
  if (url.pathname === "/lab/l6") {
    try {
      return send(200, "text/html; charset=utf-8", fs.readFileSync(L6, "utf8"));
    } catch {
      return send(500, "text/plain", "l6.html missing");
    }
  }

  if (url.pathname === "/lab/l1") {
    try {
      return send(200, "text/html; charset=utf-8", fs.readFileSync(L1, "utf8"));
    } catch {
      return send(500, "text/plain", "l1.html missing");
    }
  }

  if (url.pathname === "/" || url.pathname === "/lab") {
    let html;
    try {
      html = fs.readFileSync(PAGE, "utf8");
    } catch {
      return send(500, "text/plain", "lab.html missing");
    }
    return send(200, "text/html; charset=utf-8", html);
  }

  send(404, "text/plain", "Not Found");
});

server.listen(PORT, "127.0.0.1", () =>
  console.log(`UNI LAB (L0, the empty room) on http://127.0.0.1:${PORT}/lab`)
);
server.on("error", (e) => {
  console.log("SRVERR " + e.message);
  process.exit(2);
});
