// door_banner_test.cjs — guards the Door hero banner against the 2026-07-18 lie where a studio that
// was simply OFF (fresh boot, or a close whose audit line we no longer hold) rendered the alarming
// red "THE DOOR WILL NOT OPEN", although the door opens fine on the key (/api/start -> studio_up.ps1
// brings the stack up in ~30s). It extracts the ACTUAL bannerState() from door.html (no
// re-implementation, no drift) and asserts the truth rules across every studio state.
//
//   node viewer/door_banner_test.cjs     # exit 0 = all cases correct, 1 = a banner lies
const fs = require("fs");
const path = require("path");
const html = fs.readFileSync(path.join(__dirname, "door.html"), "utf8");
const start = html.indexOf("function bannerState(m, tiles){");
const end = html.indexOf("async function tick(){", start);
if (start < 0 || end < 0) { console.log("EXTRACT FAILED — bannerState() not found in door.html"); process.exit(1); }
const bannerState = eval("(" + html.slice(start, end).trim() + ")");

const CRIT = ["obs", "overlays", "mediamtx", "console", "publisher", "colonycam"];
const up = CRIT.map(k => ({ key: k, up: true, warn: false, label: k }));
const down = CRIT.map(k => ({ key: k, up: false, warn: false, label: k }));
const now = Date.now();
const iso = ms => new Date(ms).toISOString();

const cases = [
  { name: "studio UP",                          m: { stack: "UP",   lastAction: { action: "door:open:all", at: iso(now) } },          tiles: up,   state: "THE DOOR IS OPEN",            cta: "open" },
  { name: "graceful close (planned)",           m: { stack: "DOWN", lastAction: { action: "door:close:all", at: iso(now - 60000) } }, tiles: down, state: "CLOSED — AS PLANNED",         cta: "key" },
  { name: "down at rest, no last action",       m: { stack: "DOWN", lastAction: {} },                                                tiles: down, state: "STUDIO CLOSED — TURN THE KEY", cta: "key" },
  { name: "key turned 30s ago, still down",     m: { stack: "DOWN", lastAction: { action: "door:open:all", at: iso(now - 30000) } }, tiles: down, state: "THE STUDIO WON'T COME UP",    cta: "fault" },
  { name: "open 10min ago (stale) => at rest",  m: { stack: "DOWN", lastAction: { action: "door:open:all", at: iso(now - 600000) } },tiles: down, state: "STUDIO CLOSED — TURN THE KEY", cta: "key" },
  { name: "post-reboot, down, no door verb",    m: { stack: "DOWN", lastAction: { action: "boot", at: iso(now - 120000) } },        tiles: down, state: "STUDIO CLOSED — TURN THE KEY", cta: "key" },
];

let fail = 0;
for (const c of cases) {
  const r = bannerState(c.m, c.tiles);
  const okState = r.state === c.state, okCta = r.ctaSig === c.cta, noLie = r.state !== "THE DOOR WILL NOT OPEN";
  const pass = okState && okCta && noLie;
  if (!pass) fail++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.name}  ->  "${r.state}" (${r.ctaSig})`);
  if (!okState) console.log(`      expected state "${c.state}"`);
  if (!okCta)   console.log(`      expected cta ${c.cta}`);
  if (!noLie)   console.log(`      STILL SHOWS "THE DOOR WILL NOT OPEN"`);
}
console.log(fail === 0
  ? "\nALL PASS — a down-but-openable studio invites the key; only a genuine failed bring-up alarms."
  : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
