#!/usr/bin/env node
// verify_producer_drift.cjs — MAKE THE SILENT TERRAIN REVERT LOUD.
//
//   node viewer/verify_producer_drift.cjs            # human report + exit code
//   node viewer/verify_producer_drift.cjs --json      # machine-readable
//
// -------------------------------------------------------------------------------------------------
// WHY THIS EXISTS (2026-08-04, RAID 095b3418 / ADR-263 family).
// The colony-terrain fix (director.js forceload change) is LIVE in the running uni-producer
// container but is NOT in the image it was built from. Measured:
//   running container /app/viewer/director.js  sha256 f04022aa951a850e...   (the FIXED file)
//   image v1b-9e6cee1  /app/viewer/director.js  sha256 edeb77802a8624bf...   (the OLD broken file)
//   container Mounts: []  — no volume, so the fix lives only in the writable layer.
// The systemd unit runs `podman run --rm ... Restart=always RestartSec=5`, so ANY exit — crash,
// OOM, reboot, systemctl restart — destroys the container and recreates it FROM THE IMAGE within
// five seconds. The terrain would revert to empty sky and NOTHING would report it, because no
// signal in the estate measures whether the world renders or whether the running bytes are the
// intended bytes. This closes that specific blindness with one measurement.
//
// It is the same lesson as the audio meter and the window-state check: an existence signal (the
// container is running) is not an outcome signal (it is running the CORRECT code). This measures
// the outcome — the actual bytes on the running process's disk — against two references.
//
// READ-ONLY. It runs `podman exec ... sha256sum` and `podman image inspect` over read-only SSH and
// compares to the repo copy. It starts, stops, and mutates nothing.
//
// THREE HASHES, THREE QUESTIONS:
//   REPO      = sha256(viewer/director.js on this box)          — the intended source of truth
//   CONTAINER = sha256(/app/viewer/director.js in the running container)
//   IMAGE     = sha256(/app/viewer/director.js in the image the unit recreates from)
//
//   CONTAINER == REPO ?  the running code is the intended code. If not: the live process is stale.
//   IMAGE     == REPO ?  a recreate would keep the fix. If not: a recreate REVERTS — rebuild needed.
//
// The dangerous-but-current state (fix live, image stale) is CONTAINER==REPO && IMAGE!=REPO. That
// is the exact state RAID 095b3418 records, and this reports it as WARN — working now, one exit
// from broken — rather than as OK (falsely reassuring) or FAIL (it is not broken yet).
"use strict";

const { execFileSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_FILE = path.join(__dirname, "director.js");
const SSH_HOST = "uni@uni-lab-lan.uni-lab.local";
const CONTAINER = "uni-producer";
const CONTAINER_PATH = "/app/viewer/director.js";
const asJson = process.argv.includes("--json");

function sh(cmd) {
  // one read-only ssh round-trip; returns trimmed stdout or throws
  return execFileSync("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=12", SSH_HOST, cmd],
    { encoding: "utf8", timeout: 30000 }).trim();
}
const short = (h) => (h || "").slice(0, 16);

function repoHash() {
  try { return crypto.createHash("sha256").update(fs.readFileSync(REPO_FILE)).digest("hex"); }
  catch (e) { return { err: "repo file unreadable: " + e.message }; }
}
function containerHash() {
  // sha256sum prints "<hash>  <path>"; take field 1. Empty/none if the container is not running.
  try { const out = sh(`podman exec ${CONTAINER} sha256sum ${CONTAINER_PATH} 2>/dev/null || echo NONE`);
    return out === "NONE" || !out ? { err: "container not running or file absent" } : out.split(/\s+/)[0]; }
  catch (e) { return { err: "ssh/podman failed: " + String(e.message).split("\n")[0] }; }
}
function imageHash() {
  // Find the image the UNIT actually recreates from (parse the generated unit's ExecStart), then
  // read director.js out of that exact image. Do NOT hardcode the tag — the whole point is to catch
  // drift, and a hardcoded tag would hide a tag change.
  try {
    const img = sh(`systemctl --user show ${CONTAINER}.service -p ExecStart 2>/dev/null | grep -oE 'localhost/[^ ]*uni-producer[^ ]*' | head -1`);
    if (!img) return { err: "could not determine image from unit ExecStart" };
    const out = sh(`podman run --rm --entrypoint sha256sum ${img} ${CONTAINER_PATH} 2>/dev/null || echo NONE`);
    return out === "NONE" || !out ? { err: "image or file absent: " + img } : { hash: out.split(/\s+/)[0], image: img };
  } catch (e) { return { err: "ssh/podman failed: " + String(e.message).split("\n")[0] }; }
}

(function main() {
  const repo = repoHash();
  const cont = containerHash();
  const imgR = imageHash();
  const img = imgR && imgR.hash ? imgR.hash : imgR;

  const repoOk = typeof repo === "string";
  const contOk = typeof cont === "string";
  const imgOk = imgR && typeof imgR.hash === "string";

  let verdict, exit, why;
  if (!repoOk || !contOk || !imgOk) {
    verdict = "UNKNOWN"; exit = 2;
    why = "could not measure all three hashes — this is not a pass; investigate the errors below";
  } else if (cont === repo && img === repo) {
    verdict = "OK"; exit = 0;
    why = "running container AND image both match the repo — the fix is durable; a recreate keeps it";
  } else if (cont === repo && img !== repo) {
    verdict = "WARN"; exit = 1;
    why = "running container matches the repo but the IMAGE does NOT — the fix is LIVE but UNBACKED. " +
          "Any exit (crash, OOM, reboot, systemctl restart) recreates from the image and REVERTS it " +
          "within ~5s. Rebuild the image (PLAN 7 Front A). This is RAID 095b3418.";
  } else if (cont !== repo) {
    verdict = "STALE"; exit = 1;
    why = "the RUNNING container does NOT match the repo — the live process is executing stale bytes. " +
          "Either the repo moved ahead of the deploy, or the container reverted to the image already.";
  } else {
    verdict = "DRIFT"; exit = 1;
    why = "unexpected hash combination — inspect the three values below";
  }

  const report = {
    at: new Date().toISOString(),
    verdict, why,
    repo: repoOk ? short(repo) : repo,
    container: contOk ? short(cont) : cont,
    image: imgOk ? short(img) : imgR,
    imageTag: imgR && imgR.image ? imgR.image : null,
  };

  if (asJson) { console.log(JSON.stringify(report, null, 2)); process.exit(exit); }

  console.log("=== uni-producer director.js drift ===\n");
  console.log("  repo      : " + (repoOk ? short(repo) : JSON.stringify(repo)));
  console.log("  container : " + (contOk ? short(cont) : JSON.stringify(cont)));
  console.log("  image     : " + (imgOk ? short(img) : JSON.stringify(imgR)) + (imgR && imgR.image ? "   (" + imgR.image + ")" : ""));
  console.log("");
  console.log("  VERDICT   : " + verdict);
  console.log("  " + why);
  console.log("");
  if (verdict === "WARN")
    console.log("  fix: rebuild the image so the fix is baked in, then recreate the container from it.");
  process.exit(exit);
})();
