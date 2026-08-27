#!/usr/bin/env node
// health_ticker.cjs — put the honest live system health ON AIR, in the ticker.
//
//   node viewer/health_ticker.cjs           # resident: every 6s, fold /api/health into the ticker
//   node viewer/health_ticker.cjs --once     # one pass (for testing)
//   node viewer/health_ticker.cjs --clear     # remove the health item from the ticker
//
// WHY THIS EXISTS. The operator's directive on his own live broadcast: "this is public to BE public,
// NOT to hide — say what is broke ON AIR, show our guts." The command center already computes the
// real health of every broadcast subsystem (obs, restreamer, cams, fanout, streamq, web/clip/
// overlook, overlays, colonycam, glass) at GET /api/health. This reads that server-side (no browser
// CORS) and writes ONE ticker item into the spool broadcast.json, which ovl_ticker already composits
// on every program scene. So the truth — green or broken, named — rides on the live stream.
//
// LOW FOOTPRINT ON PURPOSE. One /api/health read + one small read-modify-write every 6s. It owns
// exactly one ticker slot, marked `_sys:true`, and never touches the other writers' items — so it
// coexists with command_center's own spool writes without clobbering scene state.
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");

const SPOOL = path.join(__dirname, "runtime", "broadcast.json");
const HEALTH_URL = "http://127.0.0.1:8098/api/health";
const EVERY_MS = 6000;

// Checks that are EXPECTED to be down in normal operation are not "broke" — naming them would cry
// wolf and drown the real signal. Unused camera slots and the local Phoenix/MC (the colony runs on
// UNI-LAB, captured over the LAN) are absent by design, not broken.
const IGNORE = /^(cam([3-9]|10)|phoenix|mc|ascii_lint)$/;
// The subsystems whose failure means the BROADCAST itself is hurt — these turn the line red.
const CRITICAL = new Set(["obs", "restreamer", "fanout", "streamq", "overlays", "colonycam", "overlook"]);

function getHealth() {
  return new Promise((resolve) => {
    const req = http.get(HEALTH_URL, { timeout: 4000 }, (r) => {
      let s = ""; r.on("data", (d) => s += d); r.on("end", () => { try { resolve(JSON.parse(s).checks || []); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null)); req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function lineFrom(checks) {
  const real = checks.filter((c) => !IGNORE.test(c.id));
  const broken = real.filter((c) => !c.ok);
  const up = real.length - broken.length;
  if (!broken.length) return { text: `● ALL ${real.length} BROADCAST SYSTEMS GREEN · built in public, nothing hidden`, tone: "ok", _sys: true };
  const names = broken.map((c) => c.id).slice(0, 6).join(", ");
  const critDown = broken.some((c) => CRITICAL.has(c.id));
  return { text: `${up}/${real.length} systems up · DOWN: ${names}${broken.length > 6 ? "…" : ""} · shown, not hidden`, tone: critDown ? "crit" : "warn", _sys: true };
}

// `checks` is also published WHOLE, as state.health, because the full-frame SYSTEM STATUS shot
// (production/overlays/health.html) renders every subsystem by name — and it must read the SAME
// bytes the ticker line is derived from. One source, two surfaces: the board and the line can never
// disagree, which is the only way "say what is broke on air" stays true rather than approximately true.
function writeItem(item /* null = clear */, checks /* optional full list */) {
  let j;
  try { j = JSON.parse(fs.readFileSync(SPOOL, "utf8")); } catch { return false; }
  const ticker = Array.isArray(j.ticker) ? j.ticker.filter((t) => !t._sys) : [];
  if (item) ticker.unshift(item);          // health leads the ticker
  j.ticker = ticker;
  if (checks) j.health = { at: new Date().toISOString(), checks: checks.map((c) => ({ id: c.id, name: c.name, ok: !!c.ok, detail: c.detail || "" })) };
  j.updatedUtc = new Date().toISOString();
  try { fs.writeFileSync(SPOOL, JSON.stringify(j, null, 2)); return true; } catch { return false; }
}

(async () => {
  const argv = process.argv.slice(2);
  if (argv.includes("--clear")) { console.log(writeItem(null) ? "cleared" : "spool unreadable"); process.exit(0); }

  async function tick() {
    const checks = await getHealth();
    if (!checks) { writeItem({ text: "⚠ health probe unreachable — command center may be down", tone: "crit", _sys: true }); return; }
    writeItem(lineFrom(checks), checks);
  }

  await tick();
  if (argv.includes("--once")) { console.log("one pass written"); process.exit(0); }
  setInterval(tick, EVERY_MS);
  console.log(`health_ticker: folding /api/health into the on-air ticker every ${EVERY_MS / 1000}s`);
})();
