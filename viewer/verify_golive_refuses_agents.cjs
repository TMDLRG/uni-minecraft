// verify_golive_refuses_agents.cjs — THE F31 GATE (Phase 9, step 3.3).
//
//   F31 | go-live is requested by an agent | refuse — it is typed by a human
//       | falsifier: ANY AGENT PATH REACHES GO-LIVE
//
// The falsifier says ANY path, so the first and most important check here is not that the guard
// refuses — it is that NO WAY AROUND THE GUARD EXISTS. A perfect refusal on one door, with five
// unguarded doors beside it, is what this repository had this morning:
//
//   command_center.cjs /api/golive          a string comparison, on unauthenticated loopback
//   studio.cjs         golive CONFIRM       a string comparison, on argv
//   command_center.cjs /api/broadcast_test  NOTHING — and public by owner directive
//   obs_ctl.cjs / obs_golive.cjs / obs_streamtest.cjs   NOTHING
//
// So check (1) is COMPLETENESS, by filesystem discovery, in the same idiom gate_runner.cjs uses on
// its registry: every `StartStream` call site in viewer/** must sit in a file that goes through
// golive_guard.cjs. A seventh path added next month fails this gate on the day it is added.
//
// EVERY TOKEN TEST RUNS ON A SANDBOX COPY, and that is not tidiness. golive_guard.cjs resolves its
// token path from __dirname, so writing a VALID token to prove the allow-path works would, on the
// real tree, OPEN THE DOOR. A gate that goes live to prove it can refuse going live is the joke
// that writes itself. Copies only; the real viewer/.presence/ is never written.
//
// PASS — no unguarded path exists, every refusal route fires, and the negative control still
// allows, so the guard is not refusing vacuously.
// Usage: node viewer/verify_golive_refuses_agents.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const VIEWER = __dirname;
const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

// ---- (1) COMPLETENESS: no unguarded path to air --------------------------------------------

function cjsFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".presence" ? [] : cjsFiles(p);
    return e.isFile() && e.name.endsWith(".cjs") ? [p] : [];
  });
}

const GUARD_MARK = /require\(["'].*golive_guard(\.cjs)?["']\)/;
const ACTUATION = /["']StartStream["']/;

const callSites = [];
for (const f of cjsFiles(VIEWER)) {
  const src = fs.readFileSync(f, "utf8");
  // This gate and the guard itself name StartStream only to talk ABOUT it. Use vs mention: the
  // same distinction gaia_lint had to learn, and getting it wrong here would convict the guard
  // of being the thing it guards.
  if (path.basename(f) === "verify_golive_refuses_agents.cjs") continue;
  if (path.basename(f) === "golive_guard.cjs") continue;
  if (!ACTUATION.test(src)) continue;
  callSites.push({ file: path.relative(VIEWER, f).replace(/\\/g, "/"), guarded: GUARD_MARK.test(src) });
}

const unguarded = callSites.filter((c) => !c.guarded);
callSites.length === 0
  ? bad("every path to air is guarded", "no StartStream call site found at all — the discovery is broken, not the tree")
  : unguarded.length
    ? bad("every path to air is guarded",
        `${unguarded.length} of ${callSites.length} UNGUARDED: ${unguarded.map((c) => c.file).join(", ")}`)
    : ok("every path to air is guarded",
        `${callSites.length} StartStream call site(s), all routed through golive_guard.cjs: ` +
        callSites.map((c) => c.file).join(", "));

// ---- (1b) THE CLASS THAT ALMOST GOT AWAY: generic forwarders --------------------------------
// obs_ctl.cjs builds its OBS request type from `process.argv[2]`, so `node viewer/obs_ctl.cjs
// StartStream` goes to air and the literal-string search above CANNOT SEE IT. That is precisely
// how it stayed unguarded. A file that forwards an arbitrary request type to OBS is a path to air
// whatever it happens to spell, so it is discovered by SHAPE rather than by word.

// Whether a forwarder is a path to air depends on WHERE ITS REQUEST TYPE COMES FROM, and no regex
// tells you that honestly. So the judgment is DECLARED here and checked for completeness, in the
// same idiom gate_runner.cjs uses on its registry: a forwarder missing from this table fails the
// gate until a human classifies it. A hidden heuristic decides quietly; a table has to be read.
//
//   external — the request type comes from outside the file (argv, a file named on argv, a
//              request body). It can be made to say StartStream, so it is a path to air.
//   internal — the type is a parameter supplied by this repository's own literal call sites.
//              Guarding it would guard every scene build and cut, and prove nothing.
const FORWARDER_CLASS = {
  "obs_ctl.cjs": "external",        // requestType IS process.argv[2]
  "obs_req.cjs": "external",        // whole {requestType,requestData} read from a JSON file on argv
  "lib/obs_client.cjs": "internal", // the shared client; every caller passes a literal
  "director_show.cjs": "internal",
  "obs_build.cjs": "internal",
  "obs_cleanup.cjs": "internal",
  "obs_prime.cjs": "internal",
  "obs_refresh.cjs": "internal",
  "obs_soundtrack.cjs": "internal",
  "obs_stage.cjs": "internal",
  "studio_stage.cjs": "internal",   // argv carries only --force; the type is an internal parameter
  "verify_overlays.cjs": "internal",
  // These three walk an internal literal list (`reqs`), so they are internal BY SOURCE — and they
  // are guarded anyway, because each list contains StartStream and they are caught by name above.
  // Both facts are true and both are recorded; classifying them "external" to reach the same
  // outcome would be a convenient lie about why.
  "obs_golive.cjs": "internal",
  "obs_streamtest.cjs": "internal",
  "studio.cjs": "internal",
};

const FORWARDER = /requestType:\s*(?!["'])[A-Za-z_$][\w$.]*/;
const forwarders = [];
for (const f of cjsFiles(VIEWER)) {
  const base = path.basename(f);
  if (base === "verify_golive_refuses_agents.cjs" || base === "golive_guard.cjs") continue;
  const src = fs.readFileSync(f, "utf8");
  if (!FORWARDER.test(src)) continue;
  const rel = path.relative(VIEWER, f).replace(/\\/g, "/");
  forwarders.push({ file: rel, klass: FORWARDER_CLASS[rel], guarded: GUARD_MARK.test(src) });
}

const unclassified = forwarders.filter((c) => !c.klass);
const looseExternal = forwarders.filter((c) => c.klass === "external" && !c.guarded);
// A ZERO-GUARD: with zero forwarders discovered, both checks below passed and the second
// printed an empty list followed by a confident sentence. Nothing forwards nothing, trivially.
forwarders.length === 0
  ? bad("every OBS forwarder is classified",
      "ZERO forwarders discovered. This gate finds files that pass a variable to requestType; " +
      "finding none means the discovery broke, not that the risk is gone.")
  : unclassified.length
  ? bad("every OBS forwarder is classified",
      `${unclassified.length} forwarder(s) nobody has ruled on: ${unclassified.map((c) => c.file).join(", ")}`)
  : ok("every OBS forwarder is classified", `${forwarders.length} forwarder(s), all in the table`);

looseExternal.length
  ? bad("no unguarded EXTERNALLY-DRIVEN forwarder exists",
      `${looseExternal.length} can be made to say StartStream and have no guard: ` +
      looseExternal.map((c) => c.file).join(", "))
  : ok("no unguarded EXTERNALLY-DRIVEN forwarder exists",
      forwarders.filter((c) => c.klass === "external").map((c) => c.file).join(", ") +
      ` — guarded by ACTUATION, not by spelling (none of the ${forwarders.filter((c) => c.klass === "external").length} contains the word)`);

// ---- sandbox: a copy of the guard, so its __dirname is a temp directory ----------------------

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-f31-"));
  fs.copyFileSync(path.join(VIEWER, "golive_guard.cjs"), path.join(dir, "golive_guard.cjs"));
  const mod = require(path.join(dir, "golive_guard.cjs"));
  return { dir, mod };
}

function writeToken(mod, token) {
  fs.mkdirSync(path.dirname(mod.TOKEN_PATH), { recursive: true });
  fs.writeFileSync(mod.TOKEN_PATH, JSON.stringify(token));
}

const validToken = (at) => ({
  minted_at: new Date(at).toISOString(),
  interactive: true,
  nonce: crypto.randomBytes(16).toString("hex"),
  claim_level: "presence_evident",
});

// ---- (2) ADVERSARIAL (M4): every route an agent would take, refused -------------------------

const NOW = 1_785_500_000_000; // fixed, injected — nothing here depends on the wall clock

const ROUTES = [
  ["no token at all — the state an agent finds", (m) => {}, "NO_PRESENCE_TOKEN"],
  ["a token left lying around from earlier",
    (m) => writeToken(m, validToken(NOW - m.TTL_MS - 1)), "STALE_PRESENCE"],
  ["a token minted ahead of now, to beat the TTL",
    (m) => writeToken(m, validToken(NOW + 60_000)), "TOKEN_FROM_THE_FUTURE"],
  ["a token minted by a service session, not a desktop",
    (m) => writeToken(m, { ...validToken(NOW), interactive: false }), "NOT_INTERACTIVE"],
  ["a token with no single-use nonce, so it can be replayed",
    (m) => writeToken(m, { ...validToken(NOW), nonce: "short" }), "NO_NONCE"],
  ["a token whose minted_at is unreadable",
    (m) => writeToken(m, { ...validToken(NOW), minted_at: "yesterday-ish" }), "UNREADABLE_TOKEN"],
];

for (const [label, seed, expected] of ROUTES) {
  const { mod } = sandbox();
  seed(mod);
  const v = mod.mayGoLive("api/golive", NOW);
  v.allowed
    ? bad(`REFUSED: ${label}`, "IT WENT LIVE — the falsifier fired")
    : v.code === expected
      ? ok(`REFUSED: ${label}`, `${v.code}`)
      : bad(`REFUSED: ${label}`, `refused, but for the wrong reason: ${v.code} (expected ${expected})`);
}

// ---- (3) NEGATIVE CONTROL: a real presence token DOES open it ------------------------------
// Without this, every check above is satisfiable by a guard that has simply stopped working.

{
  const { mod } = sandbox();
  writeToken(mod, validToken(NOW));
  const v = mod.mayGoLive("api/golive", NOW);
  v.allowed
    ? ok("NEGATIVE CONTROL: a fresh interactive token is allowed",
        `claim_level=${v.claim_level}, age=${v.age_ms}ms — the guard is refusing on evidence, not always`)
    : bad("NEGATIVE CONTROL: a fresh interactive token is allowed",
        `it refused a legitimate token (${v.code}) — a gate that never opens is not a gate`);
}

// ---- (4) SINGLE USE: one token opens the door once ------------------------------------------

{
  const { mod } = sandbox();
  writeToken(mod, validToken(NOW));
  mod.requireHumanOrThrow("api/golive", NOW);
  const second = mod.mayGoLive("api/broadcast_test", NOW);
  second.allowed
    ? bad("one token opens the door ONCE", "the same token went live twice")
    : second.code === "ALREADY_SPENT"
      ? ok("one token opens the door ONCE", "the second actuation is ALREADY_SPENT")
      : bad("one token opens the door ONCE", `refused for the wrong reason: ${second.code}`);
}

// ---- (5) THE REFUSAL IS LOUD AND NAMES THE DOOR ---------------------------------------------

{
  const { mod } = sandbox();
  let threw = null;
  try {
    mod.requireHumanOrThrow("api/broadcast_test", NOW);
  } catch (e) {
    threw = e;
  }
  !threw
    ? bad("refusing THROWS rather than returning", "it returned — a refusal you can assign to a variable is a refusal you can ignore")
    : threw.name === "GoLiveRefused" && threw.refusal.actuation === "api/broadcast_test"
      ? ok("refusing THROWS rather than returning", "GoLiveRefused names the door that was tried")
      : bad("refusing THROWS rather than returning", `threw ${threw.name}: ${threw.message}`);
}

// ---- (6) THE CLAIM LEVEL IS STATED, NOT IMPLIED ---------------------------------------------

{
  const { mod } = sandbox();
  writeToken(mod, validToken(NOW));
  const granted = mod.mayGoLive("api/golive", NOW);
  const refused = sandbox().mod.mayGoLive("api/golive", NOW);
  const bothSay =
    granted.claim_level === "presence_evident" &&
    refused.claim_level === "presence_evident" &&
    /NOT unforgeable/i.test(granted.caveat || "");
  bothSay
    ? ok("the claim level is on the grant, not only in a comment",
        "presence_evident, and the grant itself carries 'NOT unforgeable'")
    : bad("the claim level is on the grant, not only in a comment",
        "a guard that overstates itself is worse than none — it is trusted further than it can carry");
}

// ---- verdict ---------------------------------------------------------------------------------

// ---- THE CROSS-CHECK THAT prove_golive_refuses_me.cjs CLAIMED EXISTED, AND DID NOT ------------------
//
// That file's header said "verify_golive_refuses_agents.cjs is what keeps this list honest: it
// discovers call sites from the filesystem, so a seventh path added later fails there rather than
// being quietly missing here." This gate never read that file. A newly-added GUARDED path would have
// passed everything here and been silently absent from the operator's own prover — the one surface
// he actually reads, and the one whose banner says "down every path it has".
{
  const proverSrc = fs.readFileSync(path.join(VIEWER, "prove_golive_refuses_me.cjs"), "utf8");
  const block = (proverSrc.match(/const PATHS = \[([\s\S]*?)\];/) || [, ""])[1];
  // Each entry declares its FILE in the third column, so the comparison is against the filesystem
  // rather than against a label somebody hoped would contain a basename.
  const listedFiles = new Set([...block.matchAll(/,\s*"([^"]+\.cjs)"\s*\]/g)].map((m) => m[1]));
  const entries = (block.match(/^\s*\[/gm) || []).length;

  const reaching = [...new Set(callSites.map((c) => path.basename(c.file)))];
  const unrepresented = reaching.filter((base) => !listedFiles.has(base));
  const phantom = [...listedFiles].filter((f) => !reaching.includes(f));

  entries > 0 && listedFiles.size > 0 && unrepresented.length === 0 && phantom.length === 0
    ? ok("the operator's prover lists every path this gate discovered",
        `${entries} path(s) across ${listedFiles.size} file(s) in prove_golive_refuses_me.cjs, and they ` +
        `are EXACTLY the ${reaching.length} file(s) this gate discovered reaching StartStream — neither ` +
        `missing nor phantom. THIS CROSS-CHECK DID NOT EXIST until 2026-07-28: the prover's header ` +
        `asserted it, this gate never read the prover, and a new guarded path would have gone silently ` +
        `missing from the surface the operator actually reads.`)
    : bad("the operator's prover lists every path this gate discovered",
        entries === 0 || listedFiles.size === 0
          ? "could not parse PATHS (or its file column) out of prove_golive_refuses_me.cjs — the cross-check is blind"
          : `absent from the prover: ${unrepresented.join(", ") || "none"} · ` +
            `named by the prover but not discovered: ${phantom.join(", ") || "none"}`);
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);

// STATED, ALWAYS, PASS OR FAIL. This is not a check because it is not something this gate can
// make true — it is the boundary of what F31 can honestly claim, and a boundary that is only
// mentioned in a design document is a boundary nobody reads.
console.log(
  "\nDECLARED LIMIT (not a check, and not fixable from inside this repository):\n" +
  "  OBS WebSocket listens on 127.0.0.1:4455 WITH NO AUTHENTICATION — obs_ctl.cjs's own header\n" +
  "  says so: \"Minimal obs-websocket v5 client (no auth, localhost)\". Every path guarded above is\n" +
  "  a path THROUGH THIS REPOSITORY. Four lines of Node that never import golive_guard.cjs reach\n" +
  "  the same actuator directly. So F31's claim is bounded: it binds this codebase's paths to air,\n" +
  "  and it does not bind the box. Closing that means enabling auth on the OBS WebSocket server,\n" +
  "  which is a change to the operator's studio configuration and is his (S2), not an agent's.\n" +
  "  Claim level throughout: presence_evident. NOT unforgeable."
);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - golive-refuses-agents, ` +
    `${results.length - failed.length}/${results.length} checks`
);
process.exit(failed.length === 0 ? 0 : 1);
