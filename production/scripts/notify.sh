#!/bin/sh
# production/scripts/notify.sh - DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware)
# Best-effort outward notification. Usage: notify.sh <check> <failure_reason>
# If UNI_NOTIFY_URL is unset: no-op degrade (echo to stderr, exit 0) - a missing webhook must never
# fail the caller (heartbeat.sh). If set: POST a small JSON payload. A notify failure (bad URL, network
# down, webhook 500) is likewise swallowed - it must never propagate a non-zero exit to the caller.
set -u
check="${1:-unknown}"
reason="${2:-(no reason given)}"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

if [ -z "${UNI_NOTIFY_URL:-}" ]; then
  echo "notify.sh: UNI_NOTIFY_URL unset, no-op (would have sent: [$check] $reason)" >&2
  exit 0
fi

payload=$(printf '{"ts":"%s","check":"%s","failure_reason":"%s"}' "$ts" "$check" "$reason")
curl -sS -m 10 -X POST -H 'Content-Type: application/json' -d "$payload" "$UNI_NOTIFY_URL" >/dev/null 2>&1 || true
exit 0
