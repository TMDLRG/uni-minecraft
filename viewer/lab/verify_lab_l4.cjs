// verify_lab_l4.cjs — THE L4 GATE (Phase 9 step 4.6, build 4): three kinds of closed, kept apart.
//
// L4's one job is a distinction, so its gate's one job is to stop that distinction collapsing.
//
//   open            nothing gates it
//   sealed_by_rule  A DOOR EXISTS and a written rule forbids this actor from opening it
//   no_door         there is no mechanism to enter by, for anyone
//
// The pressure to collapse them is real and it always points the same way: "locked" is one word and
// it renders in one branch. But `sealed_by_rule` waits on a DECISION and `no_door` waits on
// SOMETHING BEING BUILT, and a reader told they are the same concludes that a decision opens the
// airlock. It does not. So this gate fails if the three ever share a drawing branch, and fails if
// `no_door` is ever asserted rather than computed.
//
// Usage: node viewer/lab/verify_lab_l4.cjs      exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const R = require("./rooms.cjs");

const results = [];
const ok = (n, d) => results.push({ pass: true, name: n, detail: d });
const bad = (n, d) => results.push({ pass: false, name: n, detail: d });

const b = R.building();
const page = fs.readFileSync(path.join(__dirname, "l4.html"), "utf8");
const src = fs.readFileSync(path.join(__dirname, "rooms.cjs"), "utf8");
const uncommented = src.split(/\r?\n/).filter((l) => !l.trim().startsWith("//")).join("\n");
const air = b.rooms.find((r) => r.id === "the-airlock-to-air");
const sealed = b.rooms.find((r) => r.id === "the-sealed-room");
const floor = b.rooms.find((r) => r.id === "the-gate-floor");

// ---- the three states exist, and they are three ----------------------------------------------------

{
  const states = new Set(b.rooms.map((r) => r.door));
  states.size === 3 && air && sealed && floor
    ? ok("three kinds of closed, not one",
        b.rooms.map((r) => `${r.id}=${r.door}`).join(" · ") +
        " — sealed waits on a DECISION, no-door waits on something BEING BUILT, and they are not " +
        "the same fact wearing different words")
    : bad("three kinds of closed, not one",
        `${states.size} distinct door state(s): ${[...states].join(", ")}`);
}

{
  // The renderer must branch three ways. One branch with three colours makes the difference a mood.
  const draw = page.slice(page.indexOf("function drawDoor"), page.indexOf("function drawRoom"));
  const branches = [/=== "open"/, /=== "sealed_by_rule"/].filter((re) => re.test(draw)).length;
  const gapDrawn = /line\(a, yw, b, yw\)/.test(draw);     // open: the wall is absent, a threshold only
  const barDrawn = /the bar across it|lineWidth = 4\.5/.test(draw);
  const wallOnly = /NO DOOR\. Unbroken wall/.test(draw) && /wall\(a, yw, b, yw/.test(draw);

  branches === 2 && gapDrawn && barDrawn && wallOnly
    ? ok("the three doors are drawn by three different code paths",
        "a GAP with a lit threshold and no wall above it · a FRAMED panel with a bar across it · " +
        "UNBROKEN WALL with no frame and no panel. Three objects, not three colours — a colour is " +
        "read as a mood and a missing doorway is read as a fact.")
    : bad("the three doors are drawn by three different code paths",
        `branches=${branches} gap=${gapDrawn} bar=${barDrawn} wall-only=${wallOnly}`);
}

// ---- THE ONE THAT MATTERS: no_door is COMPUTED ------------------------------------------------------

{
  air && air.door === "no_door" && air.scan && Array.isArray(air.scan.found) && air.scan.found.length === 0
    ? ok("NO DOOR IS COMPUTED, NOT ASSERTED",
        `scanned ${air.scan.root}/ for anything that can mint a presence token: none. F31's guard ` +
        `refuses all ${air.paths.length} paths to air for want of a token, and nothing in this ` +
        `repository can produce one. If a minter ever lands, the scan finds it and the room changes ` +
        `state with nothing edited.`)
    : air && air.door !== "no_door"
      // CORRECTED 2026-07-28: this branch used to be a bare ok(), so ANY reason the airlock stopped
      // reading no_door — including a hardcoded one — was reported as the scan doing its job. The
      // door may only exist because something that can mint was FOUND.
      ? (air.scan && Array.isArray(air.scan.found) && air.scan.found.length > 0
          ? ok("NO DOOR IS COMPUTED, NOT ASSERTED",
              `the airlock reads ${air.door} because the scan FOUND a minter: ${air.scan.found.join(", ")}.`)
          : bad("NO DOOR IS COMPUTED, NOT ASSERTED",
              `the airlock reads ${air.door} while the scan found NOTHING that can mint — the state ` +
              `no longer follows the measurement`))
      : bad("NO DOOR IS COMPUTED, NOT ASSERTED", "the airlock state did not come from a scan");
}

{
  // M1 MUTATION: plant a minter and the wall must become a door. A scan nobody has seen succeed is
  // not a scan, and "found nothing" is the answer it gives whether it works or not.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-l4-"));
  fs.writeFileSync(
    path.join(dir, "mint_presence.cjs"),
    'const TOKEN_PATH = "x"; require("fs").writeFileSync(TOKEN_PATH, "{}");\n'
  );
  const mutated = R.building({ minterRoot: dir });
  const mAir = mutated.rooms.find((r) => r.id === "the-airlock-to-air");
  fs.rmSync(dir, { recursive: true, force: true });

  mAir.door === "door_exists" && mAir.scan.found.includes("mint_presence.cjs")
    ? ok("MUTATION: plant a minter and the wall becomes a door",
        "a file that writes the presence token is found and the airlock stops reading no_door — " +
        "so today's `no_door` is a measurement of this tree, not a sentence about it")
    : bad("MUTATION: plant a minter and the wall becomes a door",
        `planted a minter and the airlock still reads ${mAir.door} (found: ${mAir.scan.found.join(", ") || "none"})`);
}

{
  // Every exclusion is visible. An invisible allowlist is how a fence stops fencing without anyone
  // noticing — and this file's own scan convicted rooms.cjs on its first run, which is why the list
  // exists at all.
  const listed = air && Array.isArray(air.scan.spared_by_name);
  listed && air.scan.spared_by_name.length > 0
    ? ok("every spared file is named on every run",
        air.scan.spared_by_name.join(", ") + " — spared BY NAME, printed here, never by a clever rule " +
        "about which mentions are innocent. THIS SCAN CONVICTED ITS OWN SOURCE on its first run: " +
        "rooms.cjs names the token only inside the regex hunting for it. Use versus mention, again.")
    : bad("every spared file is named on every run", "the exclusion list is not in the payload");
}

// ---- the seal is quoted, not retold -----------------------------------------------------------------

{
  // The QUOTE must match the plan, not merely be a string — corrected 2026-07-28. This asserted
  // `id === "S10" && typeof what === "string"`, which a hardcoded `what: "anything"` in rooms.cjs
  // would satisfy while the room stopped quoting the plan at all. The point of "read from the plan
  // at render time" is that it stays true only if it is actually read, so the check reads the plan
  // itself and compares.
  const planS10 = (() => {
    try {
      const p = JSON.parse(fs.readFileSync(path.join(R.REPO, "evidence", "remediation", "phase9_plan.json"), "utf8"));
      return (p.stops || []).find((s) => s.id === "S10");
    } catch { return null; }
  })();

  sealed && sealed.rule && sealed.rule.id === "S10" && planS10 && sealed.rule.what === planS10.what
    ? ok("the seal quotes the plan by id, VERBATIM",
        `S10: "${sealed.rule.what}" — and it is byte-identical to the plan's own stops[S10].what, read ` +
        `here from the plan directly. If the rule is ever lifted or reworded there, the room follows, ` +
        `and a hardcoded quote in rooms.cjs would now FAIL this rather than pass it.`)
    : bad("the seal quotes the plan by id, VERBATIM",
        planS10
          ? `rooms.cjs says "${sealed && sealed.rule && sealed.rule.what}" but the plan's S10 says "${planS10.what}"`
          : "the plan's S10 stop could not be read, or the sealed room's rule did not come from it");
}

{
  // The rule says nine. The ledger says otherwise, and the disagreement is CARRIED rather than
  // silently resolved by picking nine gates and calling the choice a measurement.
  const d = sealed && sealed.the_count_does_not_match;
  d && d.rule_says === "nine" && d.measured_unique_names !== 9 && /NAMES A COUNT AND NO MEMBERS/.test(d.consequence)
    ? ok("A STOP CONDITION THAT NAMES A COUNT AND NO MEMBERS CANNOT BE ENFORCED",
        `S10 says nine; the ledger has ${d.measured_unique_names} unique PENDING gate names and ` +
        `${d.ever_pending_per_the_4_2_sidecar} ever-pending rows, and S10 names no members. A guard cannot check a list it ` +
        `was never given, so the room holds ALL of them — over-sealing, stated, rather than choosing ` +
        `nine and presenting the choice as a finding.`)
    : d
      // CORRECTED 2026-07-28: this branch fired on ANY truthy `d`, regardless of rule_says, of the
      // measured count, or of the consequence text — only a missing field could fail it. The
      // "disagreement is closed" claim must actually be true.
      ? (d.rule_says === "nine" && d.measured_unique_names === 9
          ? ok("A STOP CONDITION THAT NAMES A COUNT AND NO MEMBERS CANNOT BE ENFORCED",
              `the counts now agree at ${d.measured_unique_names} — the disagreement is genuinely closed`)
          : bad("A STOP CONDITION THAT NAMES A COUNT AND NO MEMBERS CANNOT BE ENFORCED",
              `rule_says=${d.rule_says} measured=${d.measured_unique_names} and the consequence text no ` +
              `longer explains the gap — the payload stopped carrying the finding`))
      : bad("A STOP CONDITION THAT NAMES A COUNT AND NO MEMBERS CANNOT BE ENFORCED",
          "the count discrepancy is not carried in the payload");
}

// ---- the refusal is physical --------------------------------------------------------------------------

{
  const blocked = page.slice(page.indexOf("function blocked"), page.indexOf("addEventListener(\"keydown\""));
  /r\.door !== "open"/.test(blocked) && /return r;/.test(blocked) && /if \(hit\)/.test(page)
    ? ok("you cannot walk into a room that will not open",
        "collision, not narration. A page that says CLOSED and then lets you through has taught you " +
        "its words are decoration, and you will read the next one that way.")
    : bad("you cannot walk into a room that will not open", "the walls do not stop movement");
}

// ---- liveness only from a real probe (F26) ---------------------------------------------------------------

{
  const probe = uncommented.slice(uncommented.indexOf("async function probePortals"));
  const getOnly = /method: "GET"/.test(probe) && !/method:\s*"(POST|PUT|DELETE|PATCH)"/i.test(probe);
  const loopbackOnly = /hostname !== "127\.0\.0\.1"/.test(probe);
  const stamps = /probed_at/.test(probe);
  const hasNotProbed = /not_probed/.test(probe);

  getOnly && loopbackOnly && stamps && hasNotProbed
    ? ok("liveness comes only from a real probe, and the probe is GET on loopback",
        "F26. Every answer is stamped with the moment it was observed, and anything not probed says " +
        "not_probed — never down, because 'I did not look' and 'I looked and it was dark' are " +
        "different facts. A surface that can be pointed at an arbitrary URL is a request forwarder " +
        "wearing a floor plan.")
    : bad("liveness comes only from a real probe, and the probe is GET on loopback",
        `GET-only=${getOnly} loopback-only=${loopbackOnly} stamped=${stamps} not_probed=${hasNotProbed}`);
}

// ---- it cannot open anything ------------------------------------------------------------------------------

{
  // ENUMERATED, not word-matched. The first version of this check searched for the word "mint" and
  // convicted the prose explaining why nothing here mints — use versus mention, the ninth time in
  // this repository. What matters is not which words appear but WHICH DOORS THE CODE CAN REACH, so
  // this collects every member of the guard the module actually touches and requires the set to be
  // a subset of the read-only surface. A new actuator added tomorrow fails it by name.
  const READ_ONLY = new Set(["mayGoLive", "presence", "CLAIM_LEVEL", "TOKEN_PATH", "refusalResponse"]);
  const touched = [...uncommented.matchAll(/\bguard\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  const reachable = [...new Set(touched)].filter((m) => !READ_ONLY.has(m));
  const nonGet = /method:\s*["'](POST|PUT|DELETE|PATCH)["']/i.test(uncommented);
  const pageOpens = /method:\s*["']POST["']|:8098|spend\(/i.test(page.replace(/<!--[\s\S]*?-->/g, ""));

  reachable.length === 0 && !nonGet && !pageOpens
    ? ok("nothing here can open anything",
        `the module touches guard.{${[...new Set(touched)].join(", ")}} and nothing else — every one ` +
        `of them is a READ. spend() and requireHumanOrThrow() are not reachable from this surface, ` +
        `no request here is anything but GET, and the page has no POST and no route to :8098. A ` +
        `surface that draws a door must not be able to walk through it, or the drawing becomes the deciding.`)
    : bad("nothing here can open anything",
        `reachable actuators: ${reachable.join(", ") || "none"} · non-GET=${nonGet} · page=${pageOpens}`);
}

{
  const writes = /writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync/.test(
    uncommented.replace(/const WRITES = [^\n]*\n/, "")
  );
  !writes
    ? ok("the building writes nothing",
        "it opens the plan, the ledger, the sidecar and the guard, and returns")
    : bad("the building writes nothing", "a write call is present in a module that projects evidence");
}

// ---- populations are real ------------------------------------------------------------------------------------

{
  const gates = fs.readFileSync(path.join(R.REPO, "evidence", "gates.ndjson"), "utf8")
    .split(/\r?\n/).filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter((r) => r && r.name);
  const uniq = new Set(gates.map((r) => r.name)).size;
  // CURRENT verdict, which is the last row for each name — not "any row that ever said PENDING".
  // Those are 12 and 59, and the difference is not cosmetic: it is the whole backlog versus
  // everything that was ever in it. This check caught step 4.2's sidecar reporting the second and
  // calling it the first.
  const current = [...new Map(gates.map((r) => [r.name, r])).values()];
  const pendingNow = current.filter((r) => r.verdict === "PENDING").length;
  const everPending = new Set(gates.filter((r) => r.verdict === "PENDING").map((r) => r.name)).size;

  // The paths count is DERIVED from the guard's own path list rather than compared to a literal.
  // It used to read `air.paths.length === 7` against a 7-element array in rooms.cjs — a hardcode
  // checked against a hardcode, in a check named "measured, not decorated".
  const provedPaths = (() => {
    try {
      const src = fs.readFileSync(path.join(R.REPO, "viewer", "prove_golive_refuses_me.cjs"), "utf8");
      const block = (src.match(/const PATHS = \[([\s\S]*?)\];/) || [, ""])[1];
      return (block.match(/^\s*\[/gm) || []).length;
    } catch { return -1; }
  })();

  floor.members === uniq && sealed.members === pendingNow &&
  air.paths.length > 0 && air.paths.length === provedPaths
    ? ok("every room's population is measured, not decorated",
        `${uniq} on the floor · ${pendingNow} sealed · ${air.paths.length} paths to air (matching the ${provedPaths} the operator's prover walks), all refused ` +
        `(${[...new Set(air.paths.map((p) => p.code))].join(", ")}). The sealed room holds the gates ` +
        `PENDING NOW, not the ${everPending} that have ever been pending — ${everPending - pendingNow} ` +
        `of those were decided later and are not waiting on anything.`)
    : bad("every room's population is measured, not decorated",
        `floor=${floor.members}/${uniq} sealed=${sealed.members}/${pendingNow} air=${air.paths.length} vs prover=${provedPaths}`);
}

{
  // The claim level travels with the airlock. F31 is `presence_evident`, not unforgeable, and it
  // binds this codebase's paths and NOT the box — that caveat has to ride along or the room reads
  // as a stronger guarantee than it is.
  air.claim_level === "presence_evident" && /4455|no authentication/i.test(air.claim_caveat)
    ? ok("the airlock carries its own claim level and its own limit",
        "presence_evident, NOT unforgeable — and the OBS WebSocket on 127.0.0.1:4455 has no auth, so " +
        "any process on the box reaches the same actuator without passing any of the seven. A guard " +
        "that overstates itself is worse than none, because it is trusted further than it can carry.")
    : bad("the airlock carries its own claim level and its own limit",
        "the claim level or the box-level caveat is missing from the payload");
}

// ---- verdict ------------------------------------------------------------------------------------------------------

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? "  ok" : "FAIL"}  ${r.name} - ${r.detail}`);
console.log(
  `\nGATE: ${failed.length === 0 ? "PASS" : "FAIL"} - lab-l4, ${results.length - failed.length}/${results.length} checks`
);
console.log(`  ${b.rooms.map((r) => r.title + " [" + r.door + "]").join("  ·  ")}`);
console.log("  Walk it: node viewer/lab/lab_server.cjs  ->  http://127.0.0.1:8103/lab/l4");
process.exit(failed.length === 0 ? 0 : 1);
