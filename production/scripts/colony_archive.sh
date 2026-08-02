#!/bin/sh
# colony_archive.sh — D-D1 in the UNI OS+MIND Deepening Plan.
# Scheduled by production/systemd/uni-colony-archive.timer (daily 03:30 UTC).
# Snapshots the Minecraft world + kin memory files to a dated subdir with a manifest.sha256.
#
# Sources (from UNI-LAB):
#   /var/lib/uni/colony-memory/       -> the bind-mounted kin .bin files (per C-C4b)
#                                        (fallback: /var/lib/uni/broadcast-src/runs/colony/)
#   /var/lib/uni/mcserver/uni_world*  -> the Minecraft world directory
#                                        (fallback: /var/lib/uni/broadcast-src/mcserver/uni_world*)
#
# Dest:
#   /var/lib/uni/backups/colony/YYYYMMDD/HHMM/  with manifest.sha256
#
# Retention: handled by production/scripts/backup.sh (D-D2), not here — this script just LAYS DOWN
# the dated subdir.
#
# Exit 0 on success, non-zero on partial failure (caller — the timer — logs it).
set -u

DEST_ROOT="${UNI_COLONY_ARCHIVE_ROOT:-/var/lib/uni/backups/colony}"
KIN_SRC="${UNI_KIN_SRC:-/var/lib/uni/colony-memory}"
MC_SRC="${UNI_MC_SRC:-/var/lib/uni/mcserver}"

# Fallbacks if the bind-mount is not yet in place.
[ -d "$KIN_SRC" ] || KIN_SRC="/var/lib/uni/broadcast-src/runs/colony"
[ -d "$MC_SRC" ] || MC_SRC="/var/lib/uni/broadcast-src/mcserver"

date_dir=$(date -u +%Y%m%d)
time_dir=$(date -u +%H%M)
dest="$DEST_ROOT/$date_dir/$time_dir"
mkdir -p "$dest/kin" "$dest/world"

fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

# --- kin .bin files ---
if [ -d "$KIN_SRC" ]; then
  n=0
  for f in "$KIN_SRC"/*.bin; do
    [ -f "$f" ] || continue
    cp -a "$f" "$dest/kin/" && n=$((n + 1))
  done
  pass "kin: $n .bin files copied from $KIN_SRC"
else
  fail "kin: source dir $KIN_SRC missing"
fi

# --- MC world snapshot ---
if [ -d "$MC_SRC" ]; then
  # Use rsync when available (handles world lock file gracefully); tar as fallback.
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude 'session.lock' "$MC_SRC/" "$dest/world/" && pass "world: rsync'd from $MC_SRC" || fail "world: rsync failed"
  else
    (cd "$MC_SRC" && tar --exclude 'session.lock' -cf - .) | (cd "$dest/world" && tar -xf -) && pass "world: tar'd from $MC_SRC" || fail "world: tar failed"
  fi
else
  fail "world: source dir $MC_SRC missing"
fi

# --- manifest.sha256 ---
(cd "$dest" && find . -type f ! -name manifest.sha256 -print0 | xargs -0 sha256sum > manifest.sha256) \
  && pass "manifest.sha256 written ($(wc -l < "$dest/manifest.sha256") entries)" \
  || fail "manifest.sha256 write failed"

# --- audit row ---
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
AUDIT="/var/lib/uni/broadcast/audit/heartbeat.ndjson"
if [ -w "$(dirname "$AUDIT")" ]; then
  python3 - "$AUDIT" "$dest" "$fails" <<EOF
import json, sys
row = {
  "schema_version": 1,
  "source": "colony_archive",
  "ts": "$ts",
  "kind": "event",
  "payload": {
    "dest": sys.argv[2],
    "fails": int(sys.argv[3]),
    "outcome": "PASS" if int(sys.argv[3]) == 0 else "PARTIAL"
  },
  "provenance": {
    "server": "$(hostname 2>/dev/null || echo uni-lab)",
    "git_commit": "",
    "evidence_class": "C",
    "audit_id": ""
  }
}
with open(sys.argv[1], "a") as f:
  f.write(json.dumps(row) + "\n")
EOF
fi

if [ "$fails" -eq 0 ]; then
  echo "colony_archive: OK ($dest)"
  exit 0
else
  echo "colony_archive: $fails legs failed ($dest)"
  exit 1
fi
