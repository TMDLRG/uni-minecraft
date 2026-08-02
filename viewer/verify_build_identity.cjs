// verify_build_identity.cjs — THE BOOT-IDENTITY GATE (Phase 9, step 1.1).
//
// WHAT THIS GATE PROVES, AND WHY IT IS SHAPED THIS WAY:
//   A long-lived body can be HEALTHY yet running STALE bytes. The old design stamped envelope.git_commit by
//   reading .git/HEAD ON EVERY REQUEST (gaia.cjs:175), so the field reported the REPOSITORY's head, not the
//   commit the running code loaded from — a stale process advertised the new commit while executing old code.
//
//   The fix is build_identity.cjs: capture identity ONCE at boot and serve it verbatim. This gate proves the
//   fix has teeth and that the body is actually wired to it. It does NOT merely assert two equal reads — that
//   would pass on the defect too, because HEAD does not move between two back-to-back reads. Instead it
//   REPRODUCES the stale scenario on a sandbox: capture once, move HEAD, and assert the captured value stays
//   at boot while a live read follows — the exact difference between "frozen" and "recomputed per request".
//
// PASS — all checks pass. FALSIFIES — a body that recomputes its envelope commit per request (the pre-registered
//   falsifier); a captured identity that drifts; a body still reading .git/HEAD in its request path.
//
// READ-ONLY over the real repo. Its only writes are to an OS temp sandbox it creates and removes (never the
// real .git, never a frozen artifact, never gates.ndjson). Usage: node viewer/verify_build_identity.cjs
//   exit 0 = PASS, 1 = FAIL.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const bi = require("./build_identity.cjs");

const results = [];
const ok = (name, detail) => results.push({ pass: true, name, detail });
const bad = (name, detail) => results.push({ pass: false, name, detail });

const HEX64 = /^[0-9a-f]{64}$/;
const SHA40 = () => crypto.randomBytes(20).toString("hex");

// ---- 1. the served identity is FROZEN — byte-identical across calls -------------------------------------
function checkFrozen() {
  const a = bi.identity();
  const b = bi.identity();
  const problems = [];
  if (JSON.stringify(a) !== JSON.stringify(b)) problems.push("identity() returned two different objects — it is not frozen");
  if (a !== b) problems.push("identity() is not memoized to a single frozen object (a fresh object each call is a per-call recompute)");
  if (!a.boot_git_commit || !/^[0-9a-f]{40}$/.test(String(a.boot_git_commit))) problems.push(`boot_git_commit is not a 40-hex sha: ${a.boot_git_commit}`);
  if (!HEX64.test(String(a.module_set_sha256))) problems.push(`module_set_sha256 is not a 64-hex digest: ${a.module_set_sha256}`);
  if (!(a.module_count > 0)) problems.push(`module_count is not positive: ${a.module_count}`);
  if (!Object.isFrozen(a)) problems.push("identity() object is not Object.frozen — a caller could mutate the served identity");
  if (problems.length) bad("served-identity-is-frozen", problems.join("\n      "));
  else ok("served-identity-is-frozen", `identity() is one frozen object across calls: boot ${String(a.boot_git_commit).slice(0, 12)} · module_set ${a.module_set_sha256.slice(0, 12)}… over ${a.module_count} modules`);
}

// ---- 2. THE TEETH: reproduce the stale scenario on a sandbox --------------------------------------------
// Build a throwaway .git in an OS temp dir. Capture HEAD once (as build_identity does at boot). Then MOVE
// HEAD — the process is now "running stale bytes". A value captured once must still read the BOOT commit; a
// per-request read must follow HEAD. If both agree, the sandbox is not exercising the difference and the gate
// is vacuous, so disagreement is REQUIRED here.
function checkStaleSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-bootid-"));
  try {
    const gitDir = path.join(dir, ".git");
    fs.mkdirSync(path.join(gitDir, "refs", "heads"), { recursive: true });
    fs.writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/main\n");

    const bootSha = SHA40();
    fs.writeFileSync(path.join(gitDir, "refs", "heads", "main"), bootSha + "\n");

    // capture once — this is what build_identity does at module load
    const captured = bi._internals.readGitHeadAt(dir);

    // HEAD moves — a commit lands while our "process" keeps running
    const movedSha = SHA40();
    fs.writeFileSync(path.join(gitDir, "refs", "heads", "main"), movedSha + "\n");

    // a LIVE read (what the gate/watchdog uses) must follow; the captured value must NOT
    const live = bi.liveGitHead(dir);

    const problems = [];
    if (captured !== bootSha) problems.push(`captured HEAD ${captured} != the boot sha ${bootSha} it was taken at`);
    if (live !== movedSha) problems.push(`live read ${live} did not follow the move to ${movedSha} — the reader is caching, so this gate cannot tell frozen from stale`);
    if (captured === live) problems.push(`captured (${captured}) == live (${live}) after a HEAD move — the sandbox failed to move HEAD, the gate is VACUOUS`);
    if (problems.length) bad("stale-scenario-distinguishes-frozen-from-live", problems.join("\n      "));
    else ok("stale-scenario-distinguishes-frozen-from-live", `sandbox HEAD moved ${bootSha.slice(0, 8)}→${movedSha.slice(0, 8)}: captured stayed at boot, live followed — a frozen stamp reports boot, a per-request stamp would report the move`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 2b. worktree-aware: HEAD resolves when .git is a FILE (a gitdir pointer), not just a directory ------
// Found by proof 2 of this step: run from a git worktree, `.git` is a file "gitdir: …" and the old reader
// returned null. A null boot commit silently defeats staleness detection, so both a DETACHED worktree (HEAD is
// a sha) and a BRANCH worktree (HEAD is a ref resolved via the common dir) must read a real commit here.
function checkWorktreeAware() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uni-bootid-wt-"));
  try {
    const problems = [];
    // (a) detached worktree: .git file → gitdir with HEAD holding a sha directly
    const gd = path.join(dir, "gitdir_detached");
    fs.mkdirSync(gd, { recursive: true });
    const detachedSha = SHA40();
    fs.writeFileSync(path.join(gd, "HEAD"), detachedSha + "\n");
    const wtA = path.join(dir, "wt_detached");
    fs.mkdirSync(wtA, { recursive: true });
    fs.writeFileSync(path.join(wtA, ".git"), `gitdir: ${gd}\n`);
    const gotA = bi._internals.readGitHeadAt(wtA);
    if (gotA !== detachedSha) problems.push(`detached worktree: read ${gotA} != ${detachedSha} (the null-in-a-worktree defect)`);

    // (b) branch worktree: HEAD is a ref, resolved via commondir/refs
    const common = path.join(dir, "common_git");
    fs.mkdirSync(path.join(common, "refs", "heads"), { recursive: true });
    const gd2 = path.join(dir, "gitdir_branch");
    fs.mkdirSync(gd2, { recursive: true });
    fs.writeFileSync(path.join(gd2, "commondir"), common + "\n");
    fs.writeFileSync(path.join(gd2, "HEAD"), "ref: refs/heads/wt\n");
    const branchSha = SHA40();
    fs.writeFileSync(path.join(common, "refs", "heads", "wt"), branchSha + "\n");
    const wtB = path.join(dir, "wt_branch");
    fs.mkdirSync(wtB, { recursive: true });
    fs.writeFileSync(path.join(wtB, ".git"), `gitdir: ${gd2}\n`);
    const gotB = bi._internals.readGitHeadAt(wtB);
    if (gotB !== branchSha) problems.push(`branch worktree: read ${gotB} != ${branchSha} (ref not resolved via commondir)`);

    if (problems.length) bad("head-reader-is-worktree-aware", problems.join("\n      "));
    else ok("head-reader-is-worktree-aware", `HEAD reads a real commit in both a detached (${detachedSha.slice(0, 8)}) and a branch (${branchSha.slice(0, 8)}) worktree — never a silent null`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 3. module_set_sha256 follows the loaded bytes ------------------------------------------------------
// The fresh recompute over the current require.cache must equal the frozen boot value on a clean tree (the
// bytes on disk are the bytes booted against), and must be a change-sensitive hash — a single-byte edit to any
// member changes it. Proven on a sandboxed reimplementation of the same construction to avoid touching a real
// loaded module.
function checkModuleSetHash() {
  const frozen = bi.identity().module_set_sha256;
  const fresh = bi.freshModuleSetSha();
  const problems = [];
  if (frozen !== fresh) problems.push(`frozen module_set_sha256 ${frozen.slice(0, 12)}… != fresh recompute ${fresh.slice(0, 12)}… — this process is running bytes that differ from disk (a stale process, or an uncommitted edit under a running body)`);

  // change-sensitivity: the same construction over a fixture must change when one byte changes
  const mk = (b) => {
    const h = crypto.createHash("sha256");
    h.update(bi._internals.ALGO); h.update("\0");
    h.update("x.cjs"); h.update("\0");
    h.update(crypto.createHash("sha256").update(b).digest("hex")); h.update("\0");
    return h.digest("hex");
  };
  if (mk(Buffer.from("a")) === mk(Buffer.from("b"))) problems.push("module-set construction is not content-sensitive — a byte change did not change the digest");

  if (problems.length) bad("module-set-hash-tracks-loaded-bytes", problems.join("\n      "));
  else ok("module-set-hash-tracks-loaded-bytes", `frozen == fresh (${frozen.slice(0, 12)}…) on a clean tree, and the digest is content-sensitive`);
}

// ---- 4. WIRING: Gaia serves the frozen identity and no longer reads .git/HEAD per request ---------------
// The one check that is RED against the pre-fix tree. Comment-stripped so it fires on the CALL, not on prose
// documenting the removal (use vs mention — the trap that has convicted honest docs on this platform).
function checkGaiaWired() {
  const gaiaFile = path.join(__dirname, "gaia", "gaia.cjs");
  const src = fs.readFileSync(gaiaFile, "utf8");
  const codeLines = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ""));
  const code = codeLines.join("\n");

  const problems = [];
  // (a) no per-request HEAD read remains in the request path
  if (/readGitHead\s*\(/.test(code)) problems.push("gaia.cjs still CALLS readGitHead(...) — the envelope commit is recomputed per request (the gaia.cjs:175 defect)");
  if (/\.git["'`]\s*,\s*["'`]HEAD/.test(code) || /["'`]\.git\/HEAD["'`]/.test(code)) problems.push("gaia.cjs still reads .git/HEAD directly — that read must move to build_identity, captured once at boot");
  // (b) the envelope commit is sourced from build_identity's frozen identity
  if (!/build_identity/.test(code)) problems.push("gaia.cjs does not require build_identity — its envelope commit is not sourced from the frozen boot identity");
  if (!/identity\s*\(\s*\)\s*\.\s*boot_git_commit/.test(code)) problems.push("gaia.cjs does not stamp identity().boot_git_commit into its envelope");

  if (problems.length) bad("gaia-envelope-wired-to-boot-identity", problems.join("\n      "));
  else ok("gaia-envelope-wired-to-boot-identity", "gaia.cjs sources envelope.git_commit from build_identity.identity().boot_git_commit and performs no per-request .git/HEAD read");
}

// ---- 5. the other two Node bodies serve their boot identity too ----------------------------------------
// The Door (launcher.cjs) and TRACK (track_server.cjs) were identity-SILENT — a healthy-but-stale one could
// not be caught. Each must now require build_identity and serve identity() (a pure read; the Door's law forbids
// a read that spawns). Source-scanned because requiring these files starts their HTTP servers — the running
// bodies are exercised by the live probe (proof 3, M3), not here.
function checkNodeBodiesWired() {
  const bodies = [
    { name: "Door", file: path.join(__dirname, "launcher.cjs"), req: "./build_identity.cjs" },
    { name: "TRACK", file: path.join(__dirname, "track", "track_server.cjs"), req: "../build_identity.cjs" },
  ];
  const problems = [];
  for (const b of bodies) {
    const code = fs.readFileSync(b.file, "utf8").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
    if (!code.includes(`require("${b.req}")`) && !code.includes(`require('${b.req}')`)) problems.push(`${b.name} (${path.basename(b.file)}) does not require build_identity`);
    if (!/identity\s*\(\s*\)/.test(code)) problems.push(`${b.name} does not serve identity() — it is silent about its own running bytes`);
    if (!/\/api\/identity/.test(code)) problems.push(`${b.name} exposes no /api/identity route for the watchdog to probe`);
  }
  if (problems.length) bad("door-and-track-serve-boot-identity", problems.join("\n      "));
  else ok("door-and-track-serve-boot-identity", "the Door and TRACK both require build_identity, serve identity(), and expose /api/identity for the watchdog");
}

// ---- 6. the watchdog's second clause: annunciate staleness, NEVER restart ------------------------------
// The healer must SEE a healthy-but-stale process (the census found the healer itself 50 commits behind) and
// annunciate it — but a restart to adopt new bytes is a deploy step, never automatic, least of all under air.
// Prove both: identityLag FIRES on a boot≠HEAD, is SILENT when fresh (negative control), and no identity
// condition can reach a restart — decide() returns no action for a healthy studio regardless of staleness.
function checkWatchdogClause() {
  const healer = require("./door_healer.cjs");
  const problems = [];

  if (typeof healer.identityLag !== "function") { bad("watchdog-annunciates-staleness-never-restarts", "door_healer exposes no identityLag — the second clause is absent"); return; }

  const HEAD = "a".repeat(40);
  const OLD = "b".repeat(40);
  const stale = healer.identityLag([{ body: "door_healer", boot: OLD }, { body: "door", boot: HEAD }], HEAD);
  if (!(stale.length === 1 && stale[0].body === "door_healer" && stale[0].behind === true)) problems.push(`identityLag did not annunciate the stale body exactly once: ${JSON.stringify(stale)}`);

  // negative control (M6): every body on HEAD ⇒ silence, not a fabricated alarm
  const fresh = healer.identityLag([{ body: "door_healer", boot: HEAD }, { body: "door", boot: HEAD }], HEAD);
  if (fresh.length !== 0) problems.push(`identityLag fired on a fresh set (false alarm): ${JSON.stringify(fresh)}`);

  // the safety invariant: a fully-healthy, non-streaming studio yields NO action — so nothing about identity,
  // which is not even an input to decide(), can trigger a restart. And under air the only heal is a leaf.
  const healthySense = { obs: true, consoleUp: true, overlaysUp: true, mediamtx: true, publisher: true, spool: { fresh: true, valid: true, ageS: 1 }, streaming: false, colony: {} };
  const dHealthy = healer.decide(healthySense, healer.orient(healthySense));
  if (dHealthy && dHealthy.action) problems.push(`decide() returned an action for a healthy studio — a restart path is reachable without a studio gap: ${dHealthy.action}`);
  const dAir = healer.decide(Object.assign({}, healthySense, { streaming: true, obs: false }), healer.orient(Object.assign({}, healthySense, { streaming: true, obs: false })));
  if (dAir && dAir.action === "bring_up_stack") problems.push("decide() would restart the stack UNDER AIR — the never-restart-under-air fence is broken");

  if (problems.length) bad("watchdog-annunciates-staleness-never-restarts", problems.join("\n      "));
  else ok("watchdog-annunciates-staleness-never-restarts", "the healer annunciates a stale body, stays silent when fresh, and reaches no restart from any identity condition (and never restarts the stack under air)");
}

(function main() {
  checkFrozen();
  checkStaleSandbox();
  checkWorktreeAware();
  checkModuleSetHash();
  checkGaiaWired();
  checkNodeBodiesWired();
  checkWatchdogClause();

  for (const r of results) process.stdout.write(`  [${r.pass ? "PASS" : "FAIL"}] ${r.name.padEnd(46)} ${r.detail}\n`);
  const fails = results.filter((r) => !r.pass).length;
  const passes = results.length - fails;
  process.stdout.write(`\nBOOT-IDENTITY GATE: ${fails ? "FAIL" : "PASS"} — ${passes} check(s) PASS, ${fails} FAIL.\n`);
  process.exit(fails ? 1 : 0);
})();
