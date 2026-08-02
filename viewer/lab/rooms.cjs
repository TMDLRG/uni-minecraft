// rooms.cjs — ROOMS, AIRLOCKS, PORTALS. (Phase 9 step 4.6, build L4)
//
// L3 put 109 real gates on one floor. A floor is not a building. This adds the walls, and with
// walls comes the only question a wall makes possible: CAN YOU GET THROUGH IT, AND WHY NOT.
//
// THREE KINDS OF CLOSED, AND THE DIFFERENCE IS THE WHOLE BUILD
// ------------------------------------------------------------
//   open            nothing gates it. Walk in.
//   sealed_by_rule  A DOOR EXISTS and a written rule forbids THIS actor from opening it. Someone
//                   else — the operator — can. The rule is quoted from the plan, by id.
//   no_door         THERE IS NO DOOR. Not "you may not enter": there is no mechanism to enter by,
//                   for anyone, including him. Nothing to unlock, no key that would work.
//
// Collapsing these into one grey "locked" is the exact failure this build exists to prevent. A
// reader who learns "closed" stops asking which kind, and the two demand completely different
// things: `sealed_by_rule` waits on a DECISION, `no_door` waits on SOMETHING BEING BUILT. Drawing
// them the same way tells him a decision would open the airlock. It would not.
//
// AND `no_door` IS COMPUTED, NOT ASSERTED
// ----------------------------------------
// The airlock to air reads `no_door` because a scan of this repository finds NOTHING THAT CAN MINT
// A PRESENCE TOKEN. F31's guard refuses for want of one; a door would be the thing that produces
// one; there is none, so `mayGoLive()` refuses every path and always will until something is built.
// If a minter ever lands, the scan finds it and the room changes state on its own, with nothing
// here edited. That is proof artifact A6 — an absence he can probe for — rather than a sentence in
// an HTML file that stays true by nobody checking.
//
// WHAT THIS DOES NOT DO, EVER
// ----------------------------
// It does not open anything. It reads. There is no path from this module or its page to
// `spend()`, to a mint, to :8098, or to any actuator — a surface that draws a door must not be
// able to walk through it, or the drawing becomes the deciding.
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.resolve(__dirname, "..", "..");
const VIEWER = path.join(REPO, "viewer");
const PLAN = path.join(REPO, "evidence", "remediation", "phase9_plan.json");
const ATTEMPTS = path.join(REPO, "evidence", "gate_attempts.ndjson");
const GATES = path.join(REPO, "evidence", "gates.ndjson");

const guard = require("../golive_guard.cjs");

// ---- the minter scan: is there a door to the air at all? ------------------------------------------

// A MINTER is a file that WRITES THE PRESENCE TOKEN. Not one that mentions it, not one that reads
// it — the guard itself names the path and writes only the spent-nonce ledger, which is the
// opposite of minting.
const MENTIONS_TOKEN = /TOKEN_PATH|token\.json/;
const WRITES = /writeFileSync|appendFileSync|createWriteStream|fs\.write\b|fsp?\.writeFile/;

// Spared BY NAME, and every spared file is listed in the output on every run. A verifier that
// writes a token into a temp sandbox is proving the guard REFUSES; sparing that is not sparing
// "anything that looks like a test", which is how an exclusion rule degrades into excluding
// everything.
//
// AND THIS FILE CONVICTED ITSELF ON ITS FIRST RUN — the eighth time a fence in this repository has.
// `rooms.cjs` names `token.json` only inside the regex that hunts for it, and names `writeFileSync`
// only inside the regex that hunts for THAT. Use versus mention, again. It is spared by name like
// every other exclusion rather than by a clever rule about regex literals, because a rule that
// spares "code that only mentions the pattern" spares any minter whose author writes a comment.
const SPARED = new Set([
  "golive_guard.cjs", // declares the path; writes only the spent-nonce ledger, which is the opposite of minting
  "verify_golive_refuses_agents.cjs", // mints into a temp SANDBOX copy to prove the guard refuses
  "prove_golive_refuses_me.cjs", // the A6 prover; reads, never writes
  "rooms.cjs", // this file — it carries the hunting regexes and nothing else
  "verify_lab_l4.cjs", // plants a minter under a temp root to prove this scan bites
]);

function cjsFiles(root) {
  const out = [];
  const walk = (d) => {
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".cjs") || e.name.endsWith(".js")) out.push(p);
    }
  };
  walk(root);
  return out;
}

/** Everything in `root` that could put a presence token on disk. Root is overridable so the gate
 *  can plant one and prove the scan still finds it — a scan nobody has seen succeed is not a scan. */
function minters(root = VIEWER) {
  const found = [];
  const spared = [];
  for (const f of cjsFiles(root)) {
    const base = path.basename(f);
    let src;
    try {
      src = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    if (!MENTIONS_TOKEN.test(src) || !WRITES.test(src)) continue;
    const rel = path.relative(root, f).replace(/\\/g, "/");
    if (SPARED.has(base)) {
      spared.push(rel);
      continue;
    }
    found.push(rel);
  }
  return { found, spared };
}

// ---- the rule that seals the second room, quoted from the plan by id ------------------------------

function stop(id) {
  try {
    const p = JSON.parse(fs.readFileSync(PLAN, "utf8"));
    return (p.stops || []).find((s) => s.id === id) || null;
  } catch {
    return null;
  }
}

// ---- populations, all measured ---------------------------------------------------------------------

function uniqueGates() {
  try {
    const rows = fs
      .readFileSync(GATES, "utf8")
      .split(/\r?\n/)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter((r) => r && r.name);
    return [...new Map(rows.map((r) => [r.name, r])).values()];
  } catch {
    return [];
  }
}

function attempts() {
  try {
    const rows = fs
      .readFileSync(ATTEMPTS, "utf8")
      .split(/\r?\n/)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return { header: rows.find((r) => r.tally_ever_pending || r.tally_pending_now) || null, gates: rows.filter((r) => r.gate) };   // header field renamed in W1
  } catch {
    return { header: null, gates: [] };
  }
}

// ---- the building ------------------------------------------------------------------------------------

function building(opts = {}) {
  const root = opts.minterRoot || VIEWER;
  const gates = uniqueGates();
  const at = attempts();
  const pending = gates.filter((g) => g.verdict === "PENDING");
  const mint = minters(root);

  // THE AIRLOCK. Its state is asked of the real guard and the real tree, every time.
  const verdicts = ["api/golive", "api/broadcast_test", "studio.cjs golive", "obs_golive.cjs",
    "obs_streamtest.cjs", "obs_ctl.cjs StartStream", "obs_req.cjs StartStream"]
    .map((a) => ({ path: a, ...guard.mayGoLive(a) }));
  const wentThrough = verdicts.filter((v) => v.allowed);

  const airlock = {
    id: "the-airlock-to-air",
    title: "THE AIRLOCK TO AIR",
    // no_door is the COMPUTED conjunction: the guard refuses, and nothing in the tree can produce
    // the thing it is refusing for want of.
    door: mint.found.length === 0 && wentThrough.length === 0 ? "no_door" : "door_exists",
    why:
      mint.found.length === 0
        ? "THERE IS NO DOOR. F31's guard refuses every path to air for want of a presence token, and " +
          "NOTHING IN THIS REPOSITORY CAN MINT ONE — scanned, not assumed. This is not a locked door " +
          "and it is not permission being withheld: there is no mechanism to enter by, for anyone, " +
          "including the operator. Nothing here is waiting on a decision. It is waiting on something " +
          "being built, and building it is S6 — his, not an agent's, because minting IS opening."
        : "a minter exists: " + mint.found.join(", ") + " — the airlock now has a door and its state " +
          "is a question about who may open it, which is a different question from this one",
    scan: { root: path.relative(REPO, root).replace(/\\/g, "/") || ".", found: mint.found, spared_by_name: mint.spared },
    paths: verdicts.map((v) => ({ path: v.path, refused: !v.allowed, code: v.code })),
    claim_level: guard.CLAIM_LEVEL,
    claim_caveat:
      "presence_evident, NOT unforgeable, and F31 binds THIS CODEBASE'S paths — the OBS WebSocket " +
      "on 127.0.0.1:4455 has no authentication, so any process on the box reaches the same actuator " +
      "without passing any of these seven.",
    members: verdicts.length,
  };

  // THE SEALED ROOM. A door exists — every one of these gates has a runner or a rule about running
  // it — and S10 forbids this actor from opening it.
  const s10 = stop("S10");
  const sealed = {
    id: "the-sealed-room",
    title: "THE PENDING GATES",
    door: s10 ? "sealed_by_rule" : "open",
    rule: s10 ? { id: s10.id, what: s10.what } : null,
    why: s10
      ? "A DOOR EXISTS AND A RULE HOLDS IT SHUT. S10 forbids an agent from running these. The " +
        "operator can; nothing here can. That is the difference from the airlock, and it is the " +
        "difference between waiting on a decision and waiting on a build."
      : "S10 is no longer in the plan, so nothing seals this room",
    // MEASURED AGAINST THE RULE'S OWN NUMBER, and the disagreement is carried rather than resolved.
    the_count_does_not_match: s10
      ? {
          rule_says: "nine",
          measured_unique_names: pending.length,
          // The sidecar's number, and it is NOT the same question. Kept side by side deliberately.
          ever_pending_per_the_4_2_sidecar: at.header ? at.header.ever_pending : null,   // renamed from pending_gates in W1
          and_they_are_different_questions:
            "PENDING NOW is the last row for each gate. EVER PENDING is any row that ever said it, " +
            "and most of those gates were decided afterwards. The first is a backlog; the second is " +
            "a history of one. Step 4.2's sidecar computed the second and labelled it the first.",
          consequence:
            "S10 NAMES A COUNT AND NO MEMBERS, so nothing can mechanically enforce it — a guard " +
            "cannot check a list it was never given. This room therefore holds EVERY pending gate, " +
            "which over-seals rather than under-seals, and says so instead of picking nine and " +
            "calling the choice a measurement.",
        }
      : null,
    breakdown: at.header ? at.header.tally_ever_pending : null,   // renamed from tally in W1
    members: pending.length,
  };

  const floor = {
    id: "the-gate-floor",
    title: "THE GATE FLOOR",
    door: "open",
    why: "nothing gates it. Every gate this instrument has ever recorded a verdict for, standing on the floor L3 built.",
    members: gates.length,
  };

  return {
    build: "L4",
    read_at: new Date().toISOString(),
    rooms: [floor, sealed, airlock],
    // Said once, here, so no surface has to remember to repeat it.
    the_distinction:
      "OPEN · SEALED BY RULE · NO DOOR. Sealed waits on a DECISION. No-door waits on something " +
      "BEING BUILT. Drawing them the same way would tell a reader that a decision opens the airlock. " +
      "It does not.",
  };
}

// ---- portals: other surfaces, and liveness ONLY from a real probe (F26) -------------------------------

// DECLARED. The lab probes these and nothing else, with GET and nothing else. A surface that can be
// pointed at an arbitrary URL is a request forwarder wearing a floor plan.
const PORTALS = [
  { id: "track", title: "UNI TRACK", url: "http://127.0.0.1:8102/", what: "the plan, live" },
  { id: "hud", title: "UNI HUD", url: "http://127.0.0.1:8100/", what: "the glance surface" },
  { id: "door", title: "THE DOOR", url: "http://127.0.0.1:8098/", what: "command centre — and one of the seven paths to air" },
  { id: "voice", title: "THE TRANSCRIPT", url: "http://127.0.0.1:5858/", what: "what was said out loud" },
  { id: "lab", title: "THIS LAB", url: "http://127.0.0.1:8103/healthz", what: "you are standing in it" },
];

/** Probe every declared portal. GET only, short timeout, loopback only, and each answer stamped
 *  with the moment it was actually observed. Anything not probed says `not_probed` — never `down`,
 *  because "I did not look" and "I looked and it was dark" are different facts (F26). */
async function probePortals(timeoutMs = 800) {
  const http = require("http");
  const at = new Date().toISOString();
  return Promise.all(
    PORTALS.map(
      (p) =>
        new Promise((resolve) => {
          const u = new URL(p.url);
          if (u.protocol !== "http:" || (u.hostname !== "127.0.0.1" && u.hostname !== "localhost")) {
            return resolve({ ...p, liveness: "not_probed", why: "not loopback; this lab probes nothing else" });
          }
          const req = http.request(
            { method: "GET", host: u.hostname, port: u.port, path: u.pathname, timeout: timeoutMs },
            (res) => {
              res.resume();
              resolve({ ...p, liveness: "up", status: res.statusCode, probed_at: at });
            }
          );
          req.on("timeout", () => { req.destroy(); resolve({ ...p, liveness: "down", why: "no answer in " + timeoutMs + "ms", probed_at: at }); });
          req.on("error", (e) => resolve({ ...p, liveness: "down", why: e.code || e.message, probed_at: at }));
          req.end();
        })
    )
  );
}

module.exports = { building, minters, probePortals, PORTALS, SPARED, REPO, VIEWER, PLAN };
