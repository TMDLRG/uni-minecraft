// build_identity.cjs — BOOT-TIME build identity for a Node body (The Door :8090, Gaia :8096, TRACK :8102).
//
// WHY THIS EXISTS (Phase 9, step 1.1). A long-lived process can be HEALTHY yet running STALE bytes: it
// started days ago, git HEAD has since advanced, and nothing on the box can tell. The census of 2026-07-26
// measured this from OUTSIDE (the Door was 50 commits behind). This module lets each body report it about
// ITSELF, so a later live probe measures the running code and not a ghost.
//
// THE DEFECT IT REPLACES (gaia.cjs:175). `readGitHead(REPO)` was called INSIDE the per-request assembler,
// so `envelope.git_commit` reported `.git/HEAD` AT REQUEST TIME — i.e. the REPOSITORY's head, not the commit
// the running code loaded from. A stale process therefore advertised the NEW commit while executing OLD code:
// the field that should have caught staleness is the field that hid it. The pre-registered falsifier for this
// step is exactly "a freshness field RECOMPUTED PER REQUEST".
//
// THE FIX. Capture identity ONCE, as early as possible, and serve it VERBATIM for the life of the process.
// Two independent components, because they answer different questions:
//
//   boot_git_commit    — `.git/HEAD` read ONCE, at the instant this module is first required (≈ process boot,
//                        because every entrypoint requires it first). Compared to LIVE HEAD by the gate, its
//                        lag is the commits-behind count — the census, now self-reported.
//   module_set_sha256  — sha256 over the on-disk source bytes of every module resident in require.cache under
//                        the repo root, captured ONCE (on first identity() call, when the cache is complete)
//                        and FROZEN. The gate recomputes it fresh; a difference means the bytes on disk are no
//                        longer the bytes this process booted against — an in-place edit or an un-restarted pull
//                        that leaves boot_git_commit unchanged. It is the ground-truth "what code is loaded",
//                        independent of git entirely.
//
// The freeze is the whole property: identity() returns byte-identical values on every call for the life of the
// process. verify_build_identity.cjs proves it, and proves a per-request implementation FAILS the same check.
//
// Builtins only (fs, path, crypto) — no new runtime dependency, no child_process here (a body computing its own
// identity must not shell out; the gate may, because the gate is not the body). READ-ONLY. Mutates nothing.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// The algorithm tag is hashed into module_set_sha256 so the digest is pinned to this construction: a change
// to how we hash is a change to the identity, never a silent reinterpretation of an old number.
const ALGO = "uni.build_identity.module_set.v1";

// ---- boot capture, at module-load time (the earliest honest instant) -----------------------------------
// These are read the moment this file is first required. Every Node entrypoint requires build_identity.cjs
// before its own app modules, so this is process boot to within a few module loads — and, decisively, BEFORE
// any HTTP request and before any later `git` operation could move HEAD.
const BOOT_UTC = new Date().toISOString();
const PID = process.pid;

// Repo root: walk up from this file until a `.git` is found. Falls back to viewer/.. (this file lives in
// viewer/). Never throws — an unresolved root yields a null commit, reported honestly, never faked.
function findRepoRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, ".git"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.join(__dirname, "..");
}

const REPO_ROOT = findRepoRoot(__dirname);

// Resolve the git directory for a checkout. In a normal clone `.git` is a DIRECTORY. In a git WORKTREE it is
// a FILE containing `gitdir: <path>` pointing at `…/.git/worktrees/<name>`, whose `commondir` names the main
// `.git` where shared refs and packed-refs live. A reader that assumes a directory reads nothing in a worktree
// and silently returns null — which defeats staleness detection (found by proof 2 of this very step, running
// from a clean worktree). Both forms are resolved here so a real commit is never lost to a null.
function resolveGitDir(repoRoot) {
  const dotgit = path.join(repoRoot, ".git");
  let st;
  try { st = fs.statSync(dotgit); } catch (_) { return null; }
  if (st.isDirectory()) return { gitDir: dotgit, commonDir: dotgit };
  try {
    const m = fs.readFileSync(dotgit, "utf8").match(/^gitdir:\s*(.+)$/m);
    if (!m) return { gitDir: dotgit, commonDir: dotgit };
    let gitDir = m[1].trim();
    if (!path.isAbsolute(gitDir)) gitDir = path.resolve(repoRoot, gitDir);
    let commonDir = gitDir;
    try {
      const cd = fs.readFileSync(path.join(gitDir, "commondir"), "utf8").trim();
      commonDir = path.isAbsolute(cd) ? cd : path.resolve(gitDir, cd);
    } catch (_) {}
    return { gitDir, commonDir };
  } catch (_) {
    return { gitDir: dotgit, commonDir: dotgit };
  }
}

// Read HEAD via fs only (no child_process) — follows `ref:` → loose ref (worktree then common dir) → packed-refs.
// Worktree-aware via resolveGitDir, so the value is directly comparable to the old envelope stamp in any checkout.
function readGitHeadAt(repoRoot) {
  try {
    const g = resolveGitDir(repoRoot);
    if (!g) return null;
    const head = fs.readFileSync(path.join(g.gitDir, "HEAD"), "utf8").trim();
    const m = head.match(/^ref:\s*(.+)$/);
    if (!m) return head; // detached HEAD — the file already holds the sha
    const ref = m[1];
    for (const base of [g.gitDir, g.commonDir]) {
      const looseRef = path.join(base, ref);
      if (fs.existsSync(looseRef)) return fs.readFileSync(looseRef, "utf8").trim();
    }
    const packed = path.join(g.commonDir, "packed-refs");
    if (fs.existsSync(packed)) {
      for (const line of fs.readFileSync(packed, "utf8").split("\n")) {
        if (!line || line[0] === "#" || line[0] === "^") continue;
        const sp = line.indexOf(" ");
        if (sp < 0) continue;
        if (line.slice(sp + 1).trim() === ref) return line.slice(0, sp).trim();
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

// Captured ONCE, now. This is the commit the process booted on — frozen for its whole life.
const BOOT_GIT_COMMIT = readGitHeadAt(REPO_ROOT);

// ---- module-set hashing --------------------------------------------------------------------------------
// Enumerate the loaded module set (require.cache) under the repo root, excluding node_modules and anything
// inside .git, sort for determinism, and hash {relative-path, sha256(on-disk bytes)} for each. Reading bytes
// from disk is exact at boot (they were just loaded); when the GATE recomputes this later, a divergence means
// disk no longer matches what this process booted against.
function computeModuleSet(repoRoot) {
  const root = repoRoot.replace(/[\\/]+$/, "");
  const files = Object.keys(require.cache)
    .filter((f) => {
      const nf = f.replace(/\\/g, "/");
      if (!nf.startsWith(root.replace(/\\/g, "/") + "/")) return false;
      if (nf.includes("/node_modules/")) return false;
      if (nf.includes("/.git/")) return false;
      return true;
    })
    .sort();
  const h = crypto.createHash("sha256");
  h.update(ALGO);
  h.update("\0");
  const members = [];
  for (const f of files) {
    const rel = path.relative(root, f).replace(/\\/g, "/");
    let fileHash;
    try {
      fileHash = crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
    } catch (_) {
      fileHash = "MISSING"; // a cached module whose file is gone still changes the identity, honestly
    }
    h.update(rel);
    h.update("\0");
    h.update(fileHash);
    h.update("\0");
    members.push({ path: rel, sha256: fileHash });
  }
  return { sha256: h.digest("hex"), count: files.length, members };
}

// The frozen boot identity — memoized on first call. By the time any request arrives the cache is complete,
// so freezing here == freezing at boot, and every later call returns the same bytes.
let FROZEN = null;
function identity() {
  if (FROZEN) return FROZEN;
  const ms = computeModuleSet(REPO_ROOT);
  FROZEN = Object.freeze({
    server_boot_utc: BOOT_UTC,
    pid: PID,
    repo_root: REPO_ROOT,
    boot_git_commit: BOOT_GIT_COMMIT,
    module_set_sha256: ms.sha256,
    module_count: ms.count,
  });
  return FROZEN;
}

// Explicit alias for entrypoints to call at startup, making "boot" genuinely startup rather than first-request.
function freeze() {
  return identity();
}

// ---- live readers for the GATE / watchdog (deliberately NOT frozen) ------------------------------------
// These read the world AS IT IS NOW. Naming them "live" keeps the frozen/served identity and the fresh probe
// impossible to confuse — the confusion that was the original defect.
function liveGitHead(repoRoot) {
  return readGitHeadAt(repoRoot || REPO_ROOT);
}
function freshModuleSetSha(repoRoot) {
  return computeModuleSet(repoRoot || REPO_ROOT).sha256;
}

module.exports = {
  identity,
  freeze,
  liveGitHead,
  freshModuleSetSha,
  // exposed for the gate's independent reimplementation checks and for tests against a fixture repo
  _internals: { readGitHeadAt, computeModuleSet, findRepoRoot, REPO_ROOT, ALGO },
};
