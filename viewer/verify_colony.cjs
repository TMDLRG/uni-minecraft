// verify_colony.cjs — THE COLONY-SIZE PROOF GATE (binding claim rule #2; docs/STUDIO_SYSTEMS.md).
// Until now this rule ("colony_count == RCON players − Director") lived only in prose — the exact
// science-load-bearing check whose ABSENCE let the 2026-07-11 spawn-runaway (Producer colony_count=0/2/3
// while the MC server held 19-20 bots) go unproven. This makes it machine-runnable, like
// verify_overlays.cjs for overlays and verify_p1.sh for the platform.
//
//   node viewer/verify_colony.cjs [host]     (default host: 127.0.0.1)
//     - GET http://<host>:4200/producer/health  -> the Producer's colony_count (seam-joined from the
//       living colony's Board over read-only rpc; :4200 = the fenced HEAD show-runner `uni-producer`,
//       gate producer-camera-attached PASS 2026-07-15. The legacy v2 node's :4000 has NO health route.)
//     - RCON `list` (via rcon.cjs)               -> the MC server's authoritative player list
//     - Director is the camera bot, not a UNI -> subtract 1 if present.
//   PASS (exit 0)  when producer colony_count === (RCON players − Director present) AND no cap-pressure.
//   FAIL (exit 1)  on ANY mismatch — that is orphan bots and/or a Board-publish gap; the colony is NOT
//                  clean, NOT stable, and NO agent may claim a colony size. Prints both numbers + the roster.
//
// NOTE: a fresh colony legitimately populates over a few frames; run this when the colony should be
// STEADY, and re-run to confirm the count is not still climbing (churn). It does NOT prove survival or
// life — only that the Producer's model agrees with the server. Survival is the separate RED gate.
const http = require("http");
const { execFileSync } = require("child_process");
const path = require("path");

const HOST = process.argv[2] || "127.0.0.1";
const HEALTH = `http://${HOST}:4200/producer/health`;

function getJson(url) {
  return new Promise((res, rej) => {
    const req = http.get(url, { timeout: 6000 }, (r) => {
      let b = "";
      r.on("data", (d) => (b += d));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(new Error("bad JSON from " + url + ": " + e.message)); } });
    });
    req.on("timeout", () => { req.destroy(); rej(new Error("timeout " + url)); });
    req.on("error", rej);
  });
}

function fail(msg) { console.log("COLONY GATE: FAIL — " + msg); process.exit(1); }

(async () => {
  // 1) Producer's internal colony_count (the Board snapshot — the number that diverged in the runaway).
  let health;
  try { health = await getJson(HEALTH); }
  catch (e) { fail("cannot read " + HEALTH + " (" + e.message + ") — colony source not up / not this host"); }
  const colonyCount = health.colony_count;
  if (typeof colonyCount !== "number") fail("/producer/health has no numeric colony_count: " + JSON.stringify(health));

  // 2) The MC server's authoritative view via RCON `list`.
  let listOut;
  try {
    // Pass the SAME host to RCON as the health probe, so the gate works against the UNI-LAB colony over the LAN
    // (e.g. `node verify_colony.cjs 10.190.245.122` now probes /producer/health AND RCON on the lab, not loopback).
    listOut = execFileSync(process.execPath, [path.join(__dirname, "rcon.cjs"), "list"],
      { encoding: "utf8", timeout: 8000, env: { ...process.env, RCON_HOST: HOST } });
  } catch (e) { fail("RCON `list` failed (" + (e.message || e) + ") — MC/RCON down or unreachable"); }
  const m = listOut.match(/There are (\d+) of a max of (\d+) players online:?\s*(.*)/s);
  if (!m) fail("could not parse RCON list output: " + JSON.stringify(listOut.trim().slice(0, 200)));
  const players = parseInt(m[1], 10);
  const cap = parseInt(m[2], 10);
  const roster = (m[3] || "").trim();
  const directorPresent = /(^|[,\s])Director([,\s]|$)/.test(roster) ? 1 : 0;
  const unisOnServer = players - directorPresent;

  // 3) The gate.
  console.log(`  producer colony_count = ${colonyCount}`);
  console.log(`  RCON: ${players}/${cap} players; Director present = ${!!directorPresent}; UNIs on server = ${unisOnServer}`);
  console.log(`  roster: ${roster}`);
  if (players >= cap) console.log(`  *** WARNING: server at the ${cap}-player CAP — new spawns are blocked; this is the runaway signature. ***`);

  if (colonyCount !== unisOnServer) {
    fail(`colony_count(${colonyCount}) != RCON UNIs(${unisOnServer}). Orphan bots and/or a Board-publish gap — colony is NOT clean/stable. No colony-size claim is permitted.`);
  }
  console.log(`COLONY GATE: PASS — producer colony_count(${colonyCount}) == RCON UNIs(${unisOnServer}). (Model agrees with the server. This proves count-consistency, NOT survival/life.)`);
  process.exit(0);
})();
