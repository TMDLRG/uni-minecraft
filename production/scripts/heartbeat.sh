#!/bin/sh
# production/scripts/heartbeat.sh - DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware)
# Timer-triggered probe (uni-heartbeat.timer -> uni-heartbeat.service, fixed 60s cadence). Re-checks the
# platform is genuinely up - never claims from process existence (binding rule, CLAUDE.md method-of-work
# #1). Mirrors production/verify_p1.sh's style: set -u, pass()/fail() helpers, PASS/FAIL prefixed lines.
#
# TODO(idle cadence): the trigger stays a flat 60s (see uni-heartbeat.timer's comment) but this script
# could internally skip the heavy P1 re-run when broadcast.json shows no active session, still probing +
# logging every tick. Not implemented - left as a follow-up, not attempted here.
#
# Design note: every probe below is READ-ONLY. This script may reach IN_SHOW_VERBS-tier surfaces the
# same way verify_p1.sh already does (plain HTTP probes), but it NEVER calls a HUMAN_GATED MCP verb
# (open_session, admit_guest, schedule, start_broadcast, stop_broadcast) - a daemon must not self-approve
# those (gating contract, production/mcp/server.py).
#
# Exit 0 always: a heartbeat script must not itself crash-loop the timer. A probe FAILING is captured
# data (ledger row + notify), not a script crash.
set -u

SPOOL="${UNI_BCAST_SPOOL:-/var/lib/uni/broadcast}"
LOGFILE="$SPOOL/audit/heartbeat.ndjson"
COLONY_HEALTH_URL="${UNI_COLONY_HEALTH_URL:-http://127.0.0.1:4000/producer/health}"
SCRIPT_DIR=$(dirname "$0")

fails=0
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; fails=$((fails+1)); }
jesc() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1" 2>/dev/null || echo '""'; }

ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# 1. P1 proof gate - same throwaway-container invocation documented at the top of verify_p1.sh.
p1_rc=0
podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
  --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh >/dev/null 2>&1 || p1_rc=$?
if [ "$p1_rc" -eq 0 ]; then pass "P1 gate (verify_p1.sh exit 0)"; p1_pass=true
else fail "P1 gate (verify_p1.sh exit $p1_rc)"; p1_pass=false; fi

# 2. relay: is the uni/program path ready? (python3 json parsing, no jq dependency)
paths_json=$(curl -sS -m 10 http://127.0.0.1:9997/v3/paths/list 2>/dev/null)
program_ready=$(printf '%s' "$paths_json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("unknown"); sys.exit(0)
for item in d.get("items", []):
    if item.get("name") == "uni/program":
        print("true" if item.get("ready") else "false")
        sys.exit(0)
print("missing")
' 2>/dev/null)
[ -n "$program_ready" ] || program_ready="unknown"
if [ "$program_ready" = "true" ]; then pass "relay uni/program path ready"
else fail "relay uni/program path not ready (got '$program_ready')"; fi

# 3. colony source health - non-fatal if unreachable (may be intentionally down, docs/STUDIO_SYSTEMS.md).
# UNI_COLONY_HEALTH_URL may be a WireGuard address in production; loopback is only this node's default.
colony_json=$(curl -sS -m 10 "$COLONY_HEALTH_URL" 2>/dev/null)
if [ -n "$colony_json" ]; then
  colony_summary=$(printf '%s' "$colony_json" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("verdict=? driver=? frame=?"); sys.exit(0)
print("verdict=%s driver=%s frame=%s" % (d.get("verdict", "?"), d.get("driver", "?"), d.get("frame", "?")))
' 2>/dev/null)
  pass "colony source reachable ($colony_summary)"
  colony_reachable=true
else
  echo "INFO  colony source unreachable (may be intentionally down) at $COLONY_HEALTH_URL"
  colony_summary=""
  colony_reachable=false
fi

# 4. colony-size proof gate (viewer/verify_colony.cjs via colony_gate.sh).
colony_gate_out=$("$SCRIPT_DIR/colony_gate.sh" 2>&1)
colony_gate_rc=$?
echo "$colony_gate_out"
if [ "$colony_gate_rc" -eq 0 ]; then pass "colony-size gate (colony_gate.sh exit 0)"; gate_pass=true
else fail "colony-size gate (colony_gate.sh exit $colony_gate_rc)"; gate_pass=false; fi

# 5. append one JSON line to the ledger (append-only, mirrors the discipline used elsewhere in this repo).
mkdir -p "$(dirname "$LOGFILE")" 2>/dev/null
json=$(printf '{"ts":%s,"p1_gate_pass":%s,"p1_gate_rc":%s,"relay_program_ready":%s,"colony_reachable":%s,"colony_summary":%s,"colony_gate_pass":%s,"colony_gate_rc":%s,"fails":%s}' \
  "$(jesc "$ts")" "$p1_pass" "$p1_rc" "$(jesc "$program_ready")" "$colony_reachable" "$(jesc "$colony_summary")" "$gate_pass" "$colony_gate_rc" "$fails")
printf '%s\n' "$json" >> "$LOGFILE"

# 6. notify on any failure only; success is silent.
if [ "$fails" -gt 0 ]; then
  "$SCRIPT_DIR/notify.sh" "heartbeat" "$fails check(s) failed at $ts (p1_pass=$p1_pass relay_ready=$program_ready colony_gate_pass=$gate_pass)" || true
fi

exit 0
