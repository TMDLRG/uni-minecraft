#!/bin/sh
# production/scripts/colony_gate.sh - DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware)
# Thin wrapper around viewer/verify_colony.cjs (THE colony-size proof gate: producer colony_count ==
# RCON players - Director; docs/STUDIO_SYSTEMS.md claim rule #2). Passes through its exit code and lets
# stdout flow to the caller (heartbeat.sh captures it into the same ledger context).
# Usage: colony_gate.sh [host]   (default host: 127.0.0.1, same default as verify_colony.cjs itself)
set -u
REPO_ROOT="${REPO_ROOT:-/opt/uni}"
node "$REPO_ROOT/viewer/verify_colony.cjs" "${1:-127.0.0.1}"
exit $?
