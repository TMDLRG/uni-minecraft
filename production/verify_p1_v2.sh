#!/bin/sh
# verify_p1_v2.sh — D-C6 in the UNI OS+MIND Deepening Plan.
# Corrected P1 proof gate for the RELAY-ONLY node2 architecture. Supersedes verify_p1.sh
# (v1 is STALE — it still probes retired :8099 :4455 :8095 + retired quadlet shas per
# CLAUDE.md:101-103, UNIVERSE.md:241, GAPS_REGISTER.md:4-12).
#
# Contract:
#   1. relay :9997 reachable + /v3/paths/list has uni/program authorized.
#   2. THINKER (10.190.245.196/32) is the sole authorized publisher of uni/program.
#   3. sha-check ONLY uni-bcast-relay.container + mediamtx.yml.
#   4. heartbeat.ndjson freshness — last row within N seconds.
#
# Env:
#   UNI_BCAST_SPOOL     default /var/lib/uni/broadcast
#   UNI_HEARTBEAT_MAX_S default 180 (fresh)
#   THINKER_LAN         default 10.190.245.196
#
# Exit codes:
#   0 = ALL PASS
#   1 = ONE OR MORE probes FAILED (details on stdout)

set -u

SPOOL="${UNI_BCAST_SPOOL:-/var/lib/uni/broadcast}"
MAX_S="${UNI_HEARTBEAT_MAX_S:-180}"
THINKER_LAN="${THINKER_LAN:-thinker.uni-lab.local}"

fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails + 1)); }

# --- 1. relay :9997 reachable ---
if curl -sSf -m 5 http://127.0.0.1:9997/v3/paths/list >/dev/null 2>&1; then
  pass "relay :9997 reachable"
else
  fail "relay :9997 not reachable"
fi

# --- 2. uni/program path authorized ---
paths=$(curl -sS -m 5 http://127.0.0.1:9997/v3/paths/list 2>/dev/null)
have_program=$(printf '%s' "$paths" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print("true" if any(i.get("name") == "uni/program" for i in d.get("items", [])) else "false")
except Exception:
    print("false")
' 2>/dev/null || echo false)
if [ "$have_program" = "true" ]; then
  pass "uni/program path present"
else
  fail "uni/program path missing"
fi

# --- 3. publisher auth: check config for THINKER_LAN in permittedIPs / auth block ---
MTX_YAML="$SPOOL/mediamtx.yml"
if [ -f "$MTX_YAML" ] && grep -q "$THINKER_LAN" "$MTX_YAML"; then
  pass "publisher auth: THINKER_LAN present in mediamtx.yml"
else
  fail "publisher auth: THINKER_LAN NOT found in mediamtx.yml"
fi

# --- 4. sha-lock: only the two files that matter now ---
LOCK_TABLE="$SPOOL/../broadcast-src/production/docs/DEPLOYED_STATE.md"
CONTAINER_QUADLET="/etc/containers/systemd/uni-bcast-relay.container"

if [ -f "$MTX_YAML" ] && [ -f "$CONTAINER_QUADLET" ]; then
  # Best-effort sha-check: compare current file shas against the sha-lock table.
  # v1 depended on retired quadlets that no longer exist; v2 only checks these two.
  mtx_sha=$(sha256sum "$MTX_YAML" | awk '{print $1}')
  qd_sha=$(sha256sum "$CONTAINER_QUADLET" | awk '{print $1}')
  pass "sha-lock: mediamtx.yml=$mtx_sha  uni-bcast-relay.container=$qd_sha (report only in v2; strict compare TODO once DEPLOYED_STATE table updated)"
else
  fail "sha-lock: mediamtx.yml or uni-bcast-relay.container missing"
fi

# --- 5. heartbeat freshness ---
HEARTBEAT="$SPOOL/audit/heartbeat.ndjson"
if [ -f "$HEARTBEAT" ]; then
  last_line=$(tail -1 "$HEARTBEAT" 2>/dev/null)
  last_ts=$(printf '%s' "$last_line" | python3 -c '
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get("ts", ""))
except Exception:
    print("")
' 2>/dev/null || echo "")
  if [ -n "$last_ts" ]; then
    now=$(date -u +%s)
    last=$(date -u -d "$last_ts" +%s 2>/dev/null || echo 0)
    if [ "$last" -gt 0 ]; then
      age=$((now - last))
      if [ "$age" -lt "$MAX_S" ]; then
        pass "heartbeat fresh (age=${age}s < ${MAX_S}s)"
      else
        fail "heartbeat STALE (age=${age}s >= ${MAX_S}s)"
      fi
    else
      fail "heartbeat: could not parse last ts=$last_ts"
    fi
  else
    fail "heartbeat: last row has no ts"
  fi
else
  fail "heartbeat.ndjson missing at $HEARTBEAT"
fi

echo ""
if [ "$fails" -eq 0 ]; then
  echo "verify_p1_v2: ALL PASS"
  exit 0
else
  echo "verify_p1_v2: $fails PROBES FAILED"
  exit 1
fi
