#!/usr/bin/env node
// apply_obs_ws_auth.cjs — make every obs-websocket client auth-aware (RAID f3871277).
//
//   node patches/apply_obs_ws_auth.cjs            # apply (idempotent)
//   node patches/apply_obs_ws_auth.cjs --verify   # report only; exit 1 if any target unpatched
//
// Content-matched and idempotent: each target has an EXACT old->new Identify string. If the old
// string is absent (already patched, or the file changed), the file is reported and skipped rather
// than blindly edited. Every client gets `const __obsauth = require(<lib>/obs_auth.cjs)` injected
// once at module top, and its Identify (op:1) `d` built by __obsauth.identifyD(m.d, extra) so auth
// is added ONLY when the server's Hello asked for it — backward-compatible with a passwordless OBS.
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "viewer");
const VERIFY = process.argv.includes("--verify");

// [file relative to viewer/, requirePath, exact old Identify string, exact new Identify string]
const T = [
  // dominant JSON.stringify form -> identifyD(m.d)
  ["voice_server.cjs",       "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["voice_everywhere.cjs",   "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["claudespeak_source.cjs", "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["music_everywhere.cjs",   "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["radio_everywhere.cjs",   "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["verify_overlays.cjs",    "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["studio_stage.cjs",       "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["film_return.cjs",        "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_req.cjs",            "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  // send(op,d) helper form -> identifyD(m.d)
  ["obsreq.cjs",             "./lib/obs_auth.cjs", "send(1, { rpcVersion: 1 })", "send(1, __obsauth.identifyD(m.d))"],
  ["radio_refresh.cjs",      "./lib/obs_auth.cjs", "send(1, { rpcVersion: 1 })", "send(1, __obsauth.identifyD(m.d))"],
  ["overlook_rehook.cjs",    "./lib/obs_auth.cjs", "send(1, { rpcVersion: 1 })", "send(1, __obsauth.identifyD(m.d))"],
  // eventSubscriptions variants -> identifyD(m.d, {eventSubscriptions})
  ["audio_meter.cjs",        "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1, eventSubscriptions: 1 << 16 } }", "{ op: 1, d: __obsauth.identifyD(m.d, { eventSubscriptions: 1 << 16 }) }"],
  ["music_director.cjs",     "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1, eventSubscriptions: EVENT_SUBS } }", "{ op: 1, d: __obsauth.identifyD(m.d, { eventSubscriptions: EVENT_SUBS }) }"],
  // --- the remaining manual/dev obs_*.cjs tools + studio.cjs, spaced form ---
  ["obs_build.cjs",          "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_ctl.cjs",            "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_golive.cjs",         "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_refresh.cjs",        "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_shot.cjs",           "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_soundtrack.cjs",     "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["obs_streamtest.cjs",     "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["studio.cjs",             "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  ["verify_radio_bed.cjs",   "./lib/obs_auth.cjs", "{ op: 1, d: { rpcVersion: 1 } }", "{ op: 1, d: __obsauth.identifyD(m.d) }"],
  // --- compact form (no spaces) ---
  ["director_show.cjs",      "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_cleanup.cjs",        "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_crop.cjs",           "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_cut.cjs",            "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_inventory.cjs",      "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_prime.cjs",          "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_prog.cjs",           "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_shot2.cjs",          "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_stage.cjs",          "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_stat.cjs",           "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["obs_verify.cjs",         "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1}}", "{op:1,d:__obsauth.identifyD(m.d)}"],
  ["_meter_probe.cjs",       "./lib/obs_auth.cjs", "{op:1,d:{rpcVersion:1,eventSubscriptions:0x7FF|0x10000}}", "{op:1,d:__obsauth.identifyD(m.d,{eventSubscriptions:0x7FF|0x10000})}"],
];

// obs_client.cjs (the shared lib, in viewer/lib/) is patched by INJECTING auth into its existing
// d-block rather than replacing a one-liner, because it builds d over three lines.
const CLIENT = {
  file: "lib/obs_client.cjs",
  require: "./obs_auth.cjs",
  old: "        if (this.subscriptions !== undefined) d.eventSubscriptions = this.subscriptions;\n",
  new: "        if (this.subscriptions !== undefined) d.eventSubscriptions = this.subscriptions;\n" +
       "        const __a = __obsauth.authString(m.d); if (__a) d.authentication = __a;\n",
};

const REQUIRE_LINE = (p) => `const __obsauth = require("${p}");`;

function injectRequire(src, requirePath) {
  if (src.includes("__obsauth = require(")) return src; // already present
  const line = REQUIRE_LINE(requirePath);
  const lines = src.split("\n");
  // after "use strict"; else after a shebang; else at top
  let idx = lines.findIndex((l) => /^["']use strict["'];?\s*$/.test(l.trim()));
  if (idx >= 0) { lines.splice(idx + 1, 0, line); return lines.join("\n"); }
  if (lines[0] && lines[0].startsWith("#!")) { lines.splice(1, 0, line); return lines.join("\n"); }
  return line + "\n" + src;
}

let patched = 0, already = 0, missing = 0;
function handle(rel, requirePath, oldStr, newStr) {
  const abs = path.join(ROOT, rel);
  let src;
  try { src = fs.readFileSync(abs, "utf8"); } catch { console.log(`  MISSING FILE  ${rel}`); missing++; return; }
  const hasNew = src.includes(newStr);
  const hasOld = src.includes(oldStr);
  if (hasNew && !hasOld) {
    // already patched; ensure require present
    if (!src.includes("__obsauth = require(")) { fs.writeFileSync(abs, injectRequire(src, requirePath)); }
    console.log(`  already       ${rel}`); already++; return;
  }
  if (!hasOld) { console.log(`  NOT FOUND     ${rel}  (identify string absent — inspect)`); missing++; return; }
  if (VERIFY) { console.log(`  UNPATCHED     ${rel}`); missing++; return; }
  let out = injectRequire(src, requirePath);
  // replace only the FIRST occurrence (the Identify), not any coincidental later match
  out = out.replace(oldStr, newStr);
  fs.writeFileSync(abs, out);
  console.log(`  patched       ${rel}`); patched++;
}

console.log(VERIFY ? "=== VERIFY obs-ws auth ===" : "=== APPLY obs-ws auth ===");
for (const [rel, rp, o, n] of T) handle(rel, rp, o, n);
// obs_client special case
{
  const abs = path.join(ROOT, CLIENT.file);
  let src = fs.readFileSync(abs, "utf8");
  if (src.includes("d.authentication = __a")) { console.log(`  already       ${CLIENT.file}`); already++; }
  else if (!src.includes(CLIENT.old)) { console.log(`  NOT FOUND     ${CLIENT.file}  (d-block absent — inspect)`); missing++; }
  else if (VERIFY) { console.log(`  UNPATCHED     ${CLIENT.file}`); missing++; }
  else { src = injectRequire(src, CLIENT.require).replace(CLIENT.old, CLIENT.new); fs.writeFileSync(abs, src); console.log(`  patched       ${CLIENT.file}`); patched++; }
}

console.log(`\n${VERIFY ? "verify" : "apply"}: ${patched} patched · ${already} already · ${missing} missing/unpatched`);
process.exit(missing > 0 && VERIFY ? 1 : 0);
