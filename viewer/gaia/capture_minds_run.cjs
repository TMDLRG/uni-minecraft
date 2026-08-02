// capture_minds_run.cjs — one-command litigation-hold capture of the colony minds. Byte-safe (Node pipes
// ssh's tar stream straight into `tar -x`; NO shell redirection to corrupt the archive). Read-only on the
// colony. The colony host is read from viewer/infra_registry.json (no IP literal in code). ssh + tar resolve
// to the OS tools (Windows OpenSSH + bsdtar, or git-bash) so it runs the same from any shell / scheduler.
//
//   node viewer/gaia/capture_minds_run.cjs        # capture once (exit 0 on success)
//   const { runCapture } = require("./capture_minds_run.cjs"); await runCapture();  // -> manifest
//
// This is the shared primitive for BOTH the periodic loop (capture_minds_loop.cjs) and the mandatory
// capture-before-destroy checkpoint (run this, then commit the new bytes, before any colony redeploy/rm).
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { ingestDir } = require("./capture_minds.cjs");

const REPO = path.resolve(__dirname, "..", "..");
const LOGDIR = path.join(REPO, "logs");
const LOG = path.join(LOGDIR, "capture_minds.log");
const TIMEOUT_MS = 45000;

function log(msg) {
  try { fs.mkdirSync(LOGDIR, { recursive: true }); } catch (_) {}
  try { fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch (_) {}
}

function colonyHost() {
  try {
    const reg = require(path.join(REPO, "viewer", "infra_registry.json"));
    const s = (reg.services || []).find((x) => x.name === "colony") || {};
    return (s.probe && s.probe.host) || "";
  } catch (_) { return ""; }
}

// runCapture(tier) -> Promise<manifest>. ssh `podman exec uni-colony tar cf -` (reads the brain dir,
// read-only) piped into `tar -x` locally, then ingestDir() WORM-stores every mind with chain-of-custody.
// tier: "stream" (default — gitignored high-cadence WORM) or "anchor" (committed, for pre-redeploy).
function runCapture(tier) {
  tier = tier === "anchor" ? "anchor" : "stream";
  return new Promise((resolve, reject) => {
    const chip = colonyHost();
    if (!chip) { log("no colony host in registry"); return reject(new Error("no colony host in registry")); }
    const remote = "podman exec uni-colony tar cf - -C /app/runs colony";
    const source = `ssh uni@${chip} ${remote}`;

    let tmp;
    try { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uni_minds_")); }
    catch (e) { return reject(e); }
    let settled = false;
    const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} };
    const done = (err, man) => {
      if (settled) return; settled = true;
      clearTimeout(timer); cleanup();
      if (err) { reject(err); } else { resolve(man); }
    };

    const ssh = spawn("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=6", `uni@${chip}`, remote],
      { stdio: ["ignore", "pipe", "pipe"] });
    const tar = spawn("tar", ["-xf", "-", "-C", tmp], { stdio: ["pipe", "ignore", "pipe"] });

    const timer = setTimeout(() => {
      try { ssh.kill("SIGKILL"); } catch (_) {}
      try { tar.kill("SIGKILL"); } catch (_) {}
      log("capture TIMEOUT (>45s) — killed ssh/tar");
      done(new Error("capture timed out"));
    }, TIMEOUT_MS);

    let sshErr = "", tarErr = "", sshDone = false, tarDone = false, sshCode = null;
    ssh.stderr.on("data", (d) => { sshErr += d; });
    tar.stderr.on("data", (d) => { tarErr += d; });
    ssh.on("error", (e) => done(new Error("ssh spawn failed: " + e.message)));
    tar.on("error", (e) => done(new Error("tar spawn failed: " + e.message)));
    ssh.stdout.pipe(tar.stdin);

    const finish = () => {
      if (!sshDone || !tarDone || settled) return;
      if (sshCode !== 0) { log(`ssh failed (${sshCode}): ${sshErr.trim().slice(0, 120)}`); return done(new Error(`ssh exit ${sshCode}: ${sshErr.trim().slice(0, 120)}`)); }
      const coldir = path.join(tmp, "colony");
      if (!fs.existsSync(coldir)) { log("no colony/ after extract: " + tarErr.trim().slice(0, 120)); return done(new Error("no colony/ dir after extract")); }
      let man;
      try { man = ingestDir(coldir, source, tier); }
      catch (e) { log("ingest failed: " + e.message); return done(e); }
      log(`OK capture ${man.capture_id}: ${man.count} minds, ${man.distinct_states} distinct`);
      done(null, man);
    };
    ssh.on("close", (code) => { sshDone = true; sshCode = code; finish(); });
    tar.on("close", () => { tarDone = true; finish(); });
  });
}

if (require.main === module) {
  const tier = process.argv[2] === "anchor" ? "anchor" : "stream";  // `node capture_minds_run.cjs anchor` for pre-redeploy
  runCapture(tier)
    .then((man) => { process.stdout.write(`captured ${man.count} minds (${tier}; capture ${man.capture_id}, ${man.distinct_states} distinct)\n`); process.exit(0); })
    .catch((e) => { process.stderr.write(`capture_minds_run: ${e.message}\n`); process.exit(1); });
}

module.exports = { runCapture };
