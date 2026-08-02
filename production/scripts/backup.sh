#!/bin/sh
# backup.sh -- daily backup of the broadcast node's durable state + configs.
# DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).
#
# Run by uni-backup.service (uni-backup.timer, daily 04:00 UTC); can also be run ad hoc. Rsyncs
# into a DATE-STAMPED subdirectory of UNI_BACKUP_DEST -- never a flat mirror -- so `--delete-after`
# only prunes stale files WITHIN today's snapshot and older daily snapshots are never destroyed.
# Each source is mirrored under its own absolute-path-shaped subdir so a restore is a direct
# `cp -a $SNAPSHOT/etc/uni/* /etc/uni/`-style copy (see production/docs/RUNBOOK_DR.md).
#
# Env:
#   UNI_BACKUP_DEST   REQUIRED. An rsync target, e.g.
#                     user@uni-tab-arm-1:/var/lib/uni/backups/uni-lab-79740c
#                     No default is invented here -- an unset dest is a hard failure, never a
#                     silently-chosen remote host.
#
# NOTE ON SECRETS: /etc/uni/ contains runtime.env, which holds the deploy token/password
# (UNI_RUNTIME_TOKEN / UNI_DEPLOY_PW -- see production/mcp/server.py). It is backed up AS-IS,
# with no redaction attempted: an automatic redaction pass risks silently corrupting a secret a
# real restore would need. The backup destination (UNI_BACKUP_DEST) must therefore be
# access-controlled to at least the same standard as the node itself.
#
# House style: verify_p1.sh's pass()/fail() accumulator -- every leg is attempted (so a partial
# backup still lands as much as possible), failures are tracked, and the script exits non-zero
# with a clear FAIL summary if any leg failed. No failed leg is silently treated as success.
set -u

fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

if [ -z "${UNI_BACKUP_DEST:-}" ]; then
  echo "FAIL backup.sh: UNI_BACKUP_DEST is not set (e.g. user@host:/var/lib/uni/backups/<node>). Refusing to invent a default remote host." >&2
  exit 1
fi
command -v rsync >/dev/null 2>&1 || { echo "FAIL backup.sh: rsync not found on PATH." >&2; exit 1; }

STAMP=$(date -u +%Y%m%d)
DEST_ROOT="${UNI_BACKUP_DEST%/}/${STAMP}"

TOTAL_BYTES=0
TOTAL_FILES=0

# run_leg <label> <src-dir> <dest-subpath-under-DEST_ROOT> [extra rsync args...]
run_leg() {
  label="$1"; src="$2"; sub="$3"
  shift 3
  echo "--- backing up: $label ---"
  echo "    $src  ->  ${DEST_ROOT}/${sub}"
  # --mkpath (rsync >=3.2.3) creates the dated destination tree (incl. remote, over ssh) as
  # needed; if the node's rsync predates 3.2.3 the parent path must be pre-created once.
  out=$(rsync -aH --delete-after --mkpath --stats "$@" "$src" "${DEST_ROOT}/${sub}" 2>&1)
  rc=$?
  echo "$out"
  if [ "$rc" -ne 0 ]; then
    fail "rsync leg '$label' exited $rc"
    return 1
  fi
  # awk (ERE alternation) handles both the modern rsync (3.1+) field name "Number of regular
  # files transferred:" and the older "Number of files transferred:" wording; sed's \| is a
  # non-portable GNU extension so it is avoided here.
  bytes=$(printf '%s\n' "$out" | awk -F': ' '/^Total bytes sent:/{gsub(",","",$2); print $2; exit}')
  files=$(printf '%s\n' "$out" | awk -F': ' '/^Number of (regular files|files) transferred:/{gsub(",","",$2); print $2; exit}')
  bytes="${bytes:-0}"; files="${files:-0}"
  TOTAL_BYTES=$((TOTAL_BYTES + bytes))
  TOTAL_FILES=$((TOTAL_FILES + files))
  pass "rsync leg '$label' ok (files=$files bytes=$bytes)"
  return 0
}

run_leg "broadcast spool" \
  /var/lib/uni/broadcast/ "var/lib/uni/broadcast/"

run_leg "/etc/uni (contains runtime.env secret -- see header NOTE ON SECRETS)" \
  /etc/uni/ "etc/uni/"

run_leg "containers/systemd quadlets" \
  /etc/containers/systemd/ "etc/containers/systemd/"

run_leg "uni-* systemd units only (filtered, not the whole unit directory)" \
  /etc/systemd/system/ "etc/systemd/system/" \
  --include='*/' --include='uni-*.service' --include='uni-*.timer' --exclude='*'

# --- manifest -----------------------------------------------------------------------------
# sha256 every file that actually landed in today's snapshot. Excludes manifest.sha256 itself
# (a straight `find ... > dest/manifest.sha256` risks the shell's output-truncation racing
# find's own traversal into a self-referencing, partially-hashed manifest entry).
echo "--- computing manifest ---"
if [ -d "$DEST_ROOT" ]; then
  find "$DEST_ROOT" -type f ! -name 'manifest.sha256' -exec sha256sum {} \; > "${DEST_ROOT}/manifest.sha256" 2>/tmp/backup.sh.manifest.err
  if [ -s /tmp/backup.sh.manifest.err ]; then
    fail "manifest computation reported errors (see /tmp/backup.sh.manifest.err)"
  else
    manifest_lines=$(wc -l < "${DEST_ROOT}/manifest.sha256" | tr -d ' ')
    pass "manifest.sha256 written (${manifest_lines} files) -> ${DEST_ROOT}/manifest.sha256"
  fi
  rm -f /tmp/backup.sh.manifest.err 2>/dev/null || true
else
  fail "destination snapshot dir ${DEST_ROOT} does not exist locally -- cannot compute a local manifest (remote-only rsync target?)"
fi

echo "---"
echo "SUMMARY: ${TOTAL_FILES} file(s) transferred, ${TOTAL_BYTES} byte(s) sent, snapshot=${DEST_ROOT}"
if [ "$fails" -eq 0 ]; then
  echo "backup.sh: ALL LEGS PASS"
  exit 0
else
  echo "backup.sh: $fails FAILURE(S) -- do not trust this snapshot as complete"
  exit 1
fi
