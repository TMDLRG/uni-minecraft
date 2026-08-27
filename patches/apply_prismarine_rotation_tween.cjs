#!/usr/bin/env node
// apply_prismarine_rotation_tween.cjs -- tween the director camera's ROTATION, not just its position.
//
// WHY THIS PATCH EXISTS
// prismarine-viewer's setFirstPersonCamera tweens POSITION over 50ms and then SNAPS rotation:
//
//     new TWEEN.Tween(this.camera.position).to({ x: pos.x, y, z: pos.z }, 50).start()
//     this.camera.rotation.set(pitch, yaw, 0, 'ZYX')          <-- no tween
//
// For a free-look human player that is invisible. For UNI's director camera it is THE dominant
// judder on the broadcast. viewer/director.js:265 pushes a new pose ten times a second
// (`setInterval(glide, 100)`) and every shot in its table (director.js:38-45) is an orbit with a
// `facing` target -- so yaw changes on EVERY update. That is ten visible rotation steps per second
// no matter what frame rate the page draws at. No frame-pacing, bitrate, encoder or GPU work can
// touch it, because the page is drawing precisely what it was told to draw.
//
// This is also why the 2026-08-03 attempt to cap these pages at 30fps was the wrong lever, and why
// the "smoothness" problem survived every counter in the studio reading green.
//
// WHY A SCRIPT AND NOT A .patch FILE
// patch-package is not installed here and there is no patches/ directory in the dependency tree.
// More importantly a line-numbered diff CORRUPTS silently when upstream shifts. This matches on
// CONTENT: it refuses if the expected upstream text is absent, and it is idempotent, so a container
// build can run it unconditionally.
//
// THE DURABILITY TRAP THIS EXISTS TO CLOSE
// The edit lives in node_modules, which is NOT version-controlled and is DESTROYED by `npm ci`.
// Applied by hand it regresses on the next clean install with nothing noticing. Wire this into the
// build (deploy/uni-producer/Containerfile, after npm ci) so it cannot be silently lost.
//
//   node patches/apply_prismarine_rotation_tween.cjs [pathToViewerJs]
//   node patches/apply_prismarine_rotation_tween.cjs --verify     (exit 1 if NOT applied)
//
// Exit 0 applied-or-already-applied, 1 not applied / refused, 2 file not found.

const fs = require("fs");
const path = require("path");

const VERIFY = process.argv.includes("--verify");
const argPath = process.argv.slice(2).find((a) => !a.startsWith("--"));

const CANDIDATES = argPath ? [argPath] : [
  path.join(__dirname, "..", "viewer", "node_modules", "prismarine-viewer", "viewer", "lib", "viewer.js"),
  path.join(__dirname, "..", "node_modules", "prismarine-viewer", "viewer", "lib", "viewer.js"),
  "/app/viewer/node_modules/prismarine-viewer/viewer/lib/viewer.js",
  "/app/node_modules/prismarine-viewer/viewer/lib/viewer.js",
];

const file = CANDIDATES.find((p) => fs.existsSync(p));
if (!file) {
  console.error("NOT FOUND: prismarine-viewer/viewer/lib/viewer.js");
  CANDIDATES.forEach((c) => console.error("  looked: " + c));
  process.exit(2);
}

const src = fs.readFileSync(file, "utf8");
const MARK = "// UNI PATCH (2026-08-03) -- tween ROTATION over the same 50ms as position.";

if (src.includes(MARK)) {
  console.log("ALREADY APPLIED: " + file);
  process.exit(0);
}
if (VERIFY) {
  console.error("NOT APPLIED: " + file);
  process.exit(1);
}

// The exact upstream text. If this is absent, upstream changed and a blind edit would be wrong.
const FIND = `    this.camera.rotation.set(pitch, yaw, 0, 'ZYX')
  }`;

if (src.indexOf(FIND) === -1) {
  console.error("REFUSING: upstream text not found in " + file);
  console.error("prismarine-viewer's setFirstPersonCamera has changed shape. Re-derive the patch by");
  console.error("hand rather than forcing it -- a patch that applies to the wrong code is worse than");
  console.error("no patch, and this one steers a live broadcast camera.");
  process.exit(1);
}
if (src.split(FIND).length - 1 !== 1) {
  console.error("REFUSING: upstream text matched more than once -- ambiguous target.");
  process.exit(1);
}

const REPLACE = `    ${MARK}
    //
    // Upstream tweens position and then SNAPS rotation. For UNI's director camera that is the
    // dominant judder: viewer/director.js:265 pushes a new pose 10x/second and every shot is an
    // orbit with a \`facing\` target, so yaw changes on EVERY update -- ten visible rotation steps
    // per second, at any frame rate.
    //
    // Shortest-arc on yaw: tweening 179deg -> -179deg naively unwinds the long way through 2pi and
    // the camera spins a full turn. Accumulate into an unwrapped angle, renormalise on completion
    // (an equivalent angle, so no visible change).
    const TWO_PI = Math.PI * 2
    if (!this._uniRot) {
      this._uniRot = { yaw, pitch }
      this.camera.rotation.set(pitch, yaw, 0, 'ZYX')
      return
    }
    let dYaw = yaw - this._uniRot.yaw
    while (dYaw > Math.PI) dYaw -= TWO_PI
    while (dYaw < -Math.PI) dYaw += TWO_PI
    if (this._uniRotTween) this._uniRotTween.stop()
    this._uniRotTween = new TWEEN.Tween(this._uniRot)
      .to({ yaw: this._uniRot.yaw + dYaw, pitch }, 50)
      .onUpdate(() => { this.camera.rotation.set(this._uniRot.pitch, this._uniRot.yaw, 0, 'ZYX') })
      .onComplete(() => {
        this._uniRot.yaw = ((this._uniRot.yaw + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI
        this.camera.rotation.set(this._uniRot.pitch, this._uniRot.yaw, 0, 'ZYX')
      })
      .start()
  }`;

const out = src.replace(FIND, REPLACE);
fs.writeFileSync(file, out, "utf8");

// Never leave a syntactically broken renderer behind: check it, and roll back if it does not parse.
try {
  new (require("vm").Script)(out, { filename: file });
} catch (e) {
  fs.writeFileSync(file, src, "utf8");
  console.error("ROLLED BACK -- patched file did not parse: " + e.message);
  process.exit(1);
}

console.log("APPLIED: " + file);
console.log("");
console.log("NOT YET PROVEN ON AIR. The falsifier: watch the colony camera during an orbit shot.");
console.log("Rotation should glide between pose updates instead of stepping ~10x/second. If it");
console.log("still steps, this patch is not in the copy that RUNS -- director.js executes inside");
console.log("uni-producer, and deploy/uni-producer/Containerfile:32 COPIES director.js into the");
console.log("image, so the host's node_modules is NOT the running copy.");
