#!/bin/sh
# panic.sh -- OPERATOR-RUN emergency stop: cut program to STANDBY + stop the stream, via the
# `panic` MCP verb (production/mcp/server.py, IN_SHOW_VERBS tier -- session-authed, same as
# cut_to; NOT a new human-gated verb). This is a curl/bearer alternative to a full MCP client
# for when that is easier to reach mid-incident than control.html or a chat client. See
# production/docs/RUNBOOK_PANIC.md action 1 (CUT-TO-STANDBY-AND-STOP).
#
# DESIGN/REFERENCE, status: pending (authored, not yet run on node hardware).
#
# Env (both REQUIRED -- no invented defaults; a clear error if either is unset):
#   UNI_PROD_MCP_URL    the MCP tools/call endpoint, e.g. http://127.0.0.1:8095/prod-mcp
#   UNI_PROD_MCP_TOKEN  the operator bearer token (BearerAuthMiddleware, server.py:350-372)
# Optional:
#   OUT   local panic log path (default ./panic.local.log) -- a LOCAL convenience log only,
#         separate from the server-side append-only audit ledger the `panic` tool itself writes
#         (UNI_PROD_MCP_AUDIT, default /var/lib/uni/broadcast/audit/prod-mcp.ndjson).
#
# Usage: panic.sh ["<short reason>"]     (default reason: "manual operator panic")
# Exit 0 ONLY if the panic call itself succeeded (ok:true in the returned envelope).
set -u

REASON="${1:-manual operator panic}"
OUT="${OUT:-./panic.local.log}"

if [ -z "${UNI_PROD_MCP_URL:-}" ]; then
  echo "FAIL panic.sh: UNI_PROD_MCP_URL is not set (e.g. http://127.0.0.1:8095/prod-mcp)." >&2
  exit 1
fi
if [ -z "${UNI_PROD_MCP_TOKEN:-}" ]; then
  echo "FAIL panic.sh: UNI_PROD_MCP_TOKEN is not set (the operator bearer token)." >&2
  exit 1
fi
command -v curl >/dev/null 2>&1 || { echo "FAIL panic.sh: curl not found on PATH." >&2; exit 1; }

# JSON-escape the reason string. jq preferred, python3 fallback, minimal-sed last resort --
# same jq-or-python3-fallback pattern as red_team_g_pa.sh. Each tier's OUTPUT is validated
# (non-empty) before it is trusted, not just `command -v` -- a `command -v` hit does not
# guarantee the binary actually runs (observed: a broken/stub `python3` on PATH that
# `command -v` finds but that exits non-zero with nothing on stdout).
json_escape() {
  if command -v jq >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | jq -Rs . 2>/dev/null)
    if [ -n "$out" ]; then printf '%s' "$out"; return; fi
  fi
  if command -v python3 >/dev/null 2>&1; then
    out=$(python3 -c 'import json,sys; sys.stdout.write(json.dumps(sys.argv[1]))' "$1" 2>/dev/null)
    if [ -n "$out" ]; then printf '%s' "$out"; return; fi
  fi
  esc=$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')
  printf '"%s"' "$esc"
}

# Extract .ok from the metadata() envelope. jq preferred, python3 fallback, grep last resort.
# Same output-validated fallthrough as json_escape() above.
extract_ok() {
  if command -v jq >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | jq -r 'if .ok == true then "true" else "false" end' 2>/dev/null)
    case "$out" in true|false) printf '%s' "$out"; return ;; esac
  fi
  if command -v python3 >/dev/null 2>&1; then
    out=$(printf '%s' "$1" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
    print("true" if d.get("ok") is True else "false")
except Exception:
    print("false")
' 2>/dev/null)
    case "$out" in true|false) printf '%s' "$out"; return ;; esac
  fi
  case "$1" in
    *'"ok":true'*|*'"ok": true'*) printf 'true' ;;
    *) printf 'false' ;;
  esac
}

REASON_JSON=$(json_escape "$REASON")
BODY="{\"method\":\"tools/call\",\"params\":{\"name\":\"panic\",\"arguments\":{\"reason\":${REASON_JSON}}}}"

echo "panic.sh: calling panic tool at ${UNI_PROD_MCP_URL} (reason: ${REASON})"
RESP=$(curl -sS -X POST "$UNI_PROD_MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${UNI_PROD_MCP_TOKEN}" \
  -d "$BODY")
CURL_RC=$?

if [ "$CURL_RC" -ne 0 ]; then
  echo "FAIL panic.sh: curl could not reach ${UNI_PROD_MCP_URL} (exit ${CURL_RC})." >&2
  echo "  Fallback: SSH to the node and run: systemctl stop uni-bcast-mixer  (see RUNBOOK_PANIC.md action 1, fallback path)" >&2
  exit 1
fi

echo "--- panic tool response ---"
if command -v jq >/dev/null 2>&1; then
  printf '%s\n' "$RESP" | jq . 2>/dev/null || printf '%s\n' "$RESP"
else
  printf '%s\n' "$RESP"
fi
echo "----------------------------"

OK=$(extract_ok "$RESP")

# Local convenience log -- separate from the server-side audit ledger the tool itself writes.
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
OUT_DIR=$(dirname "$OUT")
[ -d "$OUT_DIR" ] || mkdir -p "$OUT_DIR" 2>/dev/null || true
printf '%s  panic.sh run  reason="%s"  ok=%s  url=%s\n' "$TS" "$REASON" "$OK" "$UNI_PROD_MCP_URL" >> "$OUT" 2>/dev/null \
  || echo "WARN panic.sh: could not append to local log ${OUT} (non-fatal; server audit ledger is authoritative)." >&2

echo ""
echo "=============================================================="
echo " PROGRAM SHOULD NOW BE ON STANDBY -- VERIFY VISUALLY"
echo " (open the private stream URL or :8099/status/ and confirm)"
echo "=============================================================="

if [ "$OK" = "true" ]; then
  exit 0
else
  echo "FAIL panic.sh: panic tool call did NOT report ok:true -- see response above." >&2
  exit 1
fi
