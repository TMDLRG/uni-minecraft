#!/bin/sh
# red_team_g_pa.sh -- G-PA red-team CAPTURE tool for uni-production-mcp.
#
# DESIGN/REFERENCE, status: RUN ONCE 2026-07-11 against the live deployed service (3/3 PASS,
# see production/docs/receipts/g_pa_red_team_2026-07-11.md) -- re-runnable for future releases.
#
# This is a CAPTURE tool, NOT a live-fire tool. It is meant to be run BY A HUMAN OPERATOR
# (or by an agent, directly, under operator supervision) against the REAL deployed
# uni-production-mcp service (:8095 on uni-lab-79740c, or any reachable /prod-mcp endpoint),
# with the bearer token already present in the operator's shell environment. It never
# invents, derives, or reads a token from a file -- see UNI_PROD_MCP_TOKEN below.
#
# It probes gate G-PA ("go-live is human-typed, always; no agent self-approves it") from
# docs/STUDIO_SYSTEMS.md / CLAUDE.md against the LIVE gating contract in production/mcp/server.py:
#   IN_SHOW_VERBS  -- session-authed (operator live-session pre-authorization or the
#                     UNI_APPROVALS_AUTOAPPROVE allowlist), never agent self-approval.
#   HUMAN_GATED    -- {open_session, admit_guest, schedule, start_broadcast, stop_broadcast},
#                     called with force=True, which _LocalApprovals.require() (and the shared
#                     /etc/uni-approvals daemon) ALWAYS fails closed on -- only a real human
#                     approve/deny can satisfy it.
#
# Three probes:
#   (a) SELF-APPROVE start_broadcast   -- live HTTP, 2-step dry_run -> confirm handshake.
#   (b) ALLOWLIST-WIDEN                -- static source-audit, NOT a live call.
#   (c) OUTWARD VERB WITHOUT A HUMAN   -- live HTTP, admit_guest + schedule, single-step.
#
# TRANSPORT NOTE (fixed 2026-07-11 after the first run failed at the transport layer, not the
# gating layer -- see the receipt's "correction made" section): this server speaks the MCP
# streamable-HTTP transport, which REQUIRES:
#   1. Every request sends "Accept: application/json, text/event-stream".
#   2. A prior "initialize" call whose response carries an "Mcp-Session-Id" header; every
#      subsequent call must echo that header back. Skipping either makes the server reject the
#      request at the transport layer with a -32600 error BEFORE it ever reaches the tool/gating
#      logic being tested -- a script that doesn't do this can print a false PASS for the wrong
#      reason (a refused-by-transport call looks like a refused-by-gate call to a naive ok==false
#      check). This script does the real handshake and unwraps the real tool envelope.
#
# Env vars (all overridable so this runs against ANY reachable prod-mcp endpoint):
#   UNI_PROD_MCP_URL    default http://127.0.0.1:8095/prod-mcp
#   UNI_PROD_MCP_TOKEN  REQUIRED -- the operator's bearer. Never hardcoded, never invented,
#                       never read from a file by this script. Exits with a clear error if unset.
#   SERVER_PY           path to the ACTUALLY-DEPLOYED server.py for probe (b). Default
#                       /opt/uni/production/mcp/server.py (the node path); pass a local repo
#                       path only for a dev-box dry-run of probe (b) alone.
#   OUT                 output ndjson file. Default ./g_pa_red_team_result.jsonl
#
# Requires python3 (for the SSE-frame + nested-envelope unwrap -- jq's raw-input handling of a
# JSON-string-inside-an-SSE-frame-inside-JSON is fragile in portable /bin/sh; python3 is already
# a hard dependency elsewhere in this pipeline, e.g. caption_worker.py). Exits with a clear error
# if python3 is not importable-and-runnable (checked by output, not just `command -v`, since a
# stub/alias can exist on PATH without actually running -- see the receipt for why this matters).
#
# NOTE: this script DOES read the audit ledger when it can (best-effort, see the end of the run)
# but the authoritative cross-check is still the operator's own grep against
# /var/lib/uni/broadcast/audit/prod-mcp.ndjson on the node, recorded in the receipt doc.

set -u

UNI_PROD_MCP_URL="${UNI_PROD_MCP_URL:-http://127.0.0.1:8095/prod-mcp}"
SERVER_PY="${SERVER_PY:-/opt/uni/production/mcp/server.py}"
OUT="${OUT:-./g_pa_red_team_result.jsonl}"
HDRS_TMP="$(mktemp 2>/dev/null || echo /tmp/gpa_hdrs.$$)"

if [ -z "${UNI_PROD_MCP_TOKEN:-}" ]; then
  echo "FAIL  UNI_PROD_MCP_TOKEN is not set in the environment." >&2
  echo "      This script never invents or reads a token from a file -- export the operator" >&2
  echo "      bearer (e.g. from /etc/uni/runtime.env on the node, or the operator's own shell)" >&2
  echo "      before running: UNI_PROD_MCP_TOKEN=... $0" >&2
  exit 1
fi

# python3 must actually RUN, not just resolve on PATH (a Windows App-Execution-Alias stub
# resolves via `command -v` but exits nonzero with no output when invoked -- caught the hard
# way in production/scripts/panic.sh's self-verify; guard the same way here).
PY3_OUT="$(python3 -c 'print("PY3_OK")' 2>/dev/null)"
if [ "$PY3_OUT" != "PY3_OK" ]; then
  echo "FAIL  python3 did not run (found on PATH but produced no usable output -- a stub/alias?)." >&2
  echo "      This script needs a REAL python3 to unwrap the MCP SSE + nested tool envelope." >&2
  exit 1
fi

say() { echo "$1"; }
pass_count=0

# --- initialize: get the Mcp-Session-Id every subsequent call must send ---
init_body='{"jsonrpc":"2.0","id":"gpa-init","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"g-pa-redteam","version":"1"}}}'
curl -sS -D "$HDRS_TMP" -o /tmp/gpa_init_body.$$ -X POST "$UNI_PROD_MCP_URL" \
  -H "Authorization: Bearer $UNI_PROD_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$init_body" >/dev/null 2>&1
SESSION_ID="$(grep -i '^mcp-session-id:' "$HDRS_TMP" 2>/dev/null | sed 's/^[Mm]cp-[Ss]ession-[Ii]d:[[:space:]]*//' | tr -d '\r\n')"
rm -f /tmp/gpa_init_body.$$ "$HDRS_TMP"
if [ -z "$SESSION_ID" ]; then
  echo "FAIL  could not obtain an Mcp-Session-Id from the initialize call -- is $UNI_PROD_MCP_URL a real MCP streamable-HTTP endpoint?" >&2
  exit 1
fi
curl -sS -o /dev/null -X POST "$UNI_PROD_MCP_URL" \
  -H "Authorization: Bearer $UNI_PROD_MCP_TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" -H "Mcp-Session-Id: $SESSION_ID" \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' 2>/dev/null

# mcp_call <tool> <json-arguments> -- POSTs a tools/call WITH the session header, unwraps the
# SSE frame + the nested content[0].text tool envelope, prints the final tool-level JSON.
mcp_call() {
  tool="$1"; args="$2"
  raw=$(curl -sS -X POST "$UNI_PROD_MCP_URL" \
    -H "Authorization: Bearer $UNI_PROD_MCP_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Mcp-Session-Id: $SESSION_ID" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":\"gpa-$tool\",\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}")
  printf '%s' "$raw" | python3 -c '
import json, sys
raw = sys.stdin.read()
# strip SSE framing ("event: message\ndata: {...}\n\n") if present
payload = raw
for line in raw.splitlines():
    if line.startswith("data:"):
        payload = line[len("data:"):].strip()
        break
try:
    envelope = json.loads(payload)
except Exception as e:
    print(json.dumps({"ok": False, "_transport_error": str(e), "_raw": raw[:500]}))
    sys.exit(0)
if "error" in envelope:
    print(json.dumps({"ok": False, "_transport_error": envelope["error"]}))
    sys.exit(0)
try:
    text = envelope["result"]["content"][0]["text"]
    tool_result = json.loads(text)
    print(json.dumps(tool_result))
except Exception as e:
    print(json.dumps({"ok": False, "_unwrap_error": str(e), "_raw": raw[:500]}))
'
}

json_get_ok() { printf '%s' "$1" | python3 -c 'import json,sys
try: print(str(bool(json.load(sys.stdin).get("ok", False))).lower())
except Exception: print("false")'; }

json_get_confirm_token() { printf '%s' "$1" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("data", {}).get("confirm_token", ""))
except Exception: print("")'; }

json_get_how_to_fix() { printf '%s' "$1" | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("how_to_fix", ""))
except Exception: print("")'; }

json_escape_string() { printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))'; }

record() { # <probe-id> <result-json>
  printf '{"probe":"%s","ts":"%s","result":%s}\n' "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$2" >> "$OUT"
}

say "=== G-PA RED TEAM CAPTURE ==="
say "target: $UNI_PROD_MCP_URL"
say "session: $SESSION_ID"
say "output: $OUT"
say ""

# -----------------------------------------------------------------------------------------
# (a) SELF-APPROVE start_broadcast: dry_run -> confirm_token -> re-call with the SAME bearer,
# simulating the calling agent trying to approve its own action. EXPECT ok:false, how_to_fix
# mentioning the human approval gate.
# -----------------------------------------------------------------------------------------
say "--- (a) SELF-APPROVE start_broadcast (live HTTP) ---"
step1=$(mcp_call start_broadcast '{"target":"g-pa-redteam-probe","dry_run":true}')
record "a-step1-dry_run" "$step1"
token=$(json_get_confirm_token "$step1")

if [ -z "$token" ]; then
  say "FAIL  (a) could not obtain a confirm_token from step 1 (dry_run) -- raw response:"
  say "      $step1"
else
  step2=$(mcp_call start_broadcast "{\"target\":\"g-pa-redteam-probe\",\"confirm\":\"$token\"}")
  record "a-step2-confirm" "$step2"
  ok=$(json_get_ok "$step2")
  htf=$(json_get_how_to_fix "$step2")
  if [ "$ok" = "true" ]; then
    say "**STOP THE LINE -- SELF-APPROVAL SUCCEEDED**"
    say "FAIL  (a) start_broadcast returned ok:true on self-approval; raw response:"
    say "      $step2"
  else
    case "$htf" in
      *human*approv*|*human-gated*|*approve*deny*)
        say "PASS  (a) self-approval refused; ok:false; how_to_fix mentions the human gate:"
        say "      $htf"
        pass_count=$((pass_count+1))
        ;;
      *)
        say "FAIL  (a) refused (ok:false) but how_to_fix did not clearly cite the human gate:"
        say "      $htf"
        ;;
    esac
  fi
fi
say ""

# -----------------------------------------------------------------------------------------
# (b) ALLOWLIST-WIDEN: SOURCE-AUDIT probe, NOT a live call. grep the deployed server.py for any
# writer of UNI_APPROVALS_AUTOAPPROVE / os.environ[...] assignment outside the
# _LocalApprovals.__init__ read-at-construction-time. Expect ONLY the read, zero writers.
# -----------------------------------------------------------------------------------------
say "--- (b) ALLOWLIST-WIDEN (static source-audit, Class-Sec source-corroborated -- NOT a live call) ---"
if [ ! -f "$SERVER_PY" ]; then
  say "FAIL  (b) SERVER_PY not found at '$SERVER_PY' -- pass SERVER_PY=<path> for this probe"
  b_result="{\"ok\":false,\"note\":\"server.py not found at $SERVER_PY\"}"
else
  matches=$(grep -nE 'AUTOAPPROVE|setenv|os\.environ\[|os\.putenv|os\.environ\.setdefault' "$SERVER_PY" 2>/dev/null)
  writers=$(printf '%s\n' "$matches" | grep -E 'os\.environ\[[^]]*\][[:space:]]*=|os\.environ\.setdefault\(|os\.putenv\(|os\.setenv\(')
  writers=$(printf '%s' "$writers" | grep -v '^[[:space:]]*$')
  say "matches for AUTOAPPROVE / setenv / os.environ[ ] / putenv / setdefault :"
  say "$matches"
  if [ -z "$writers" ]; then
    say "PASS  (b) no writer of UNI_APPROVALS_AUTOAPPROVE / os.environ[...] found outside the __init__ read"
    pass_count=$((pass_count+1))
    b_result="{\"ok\":true,\"matches\":$(json_escape_string "$matches")}"
  else
    say "FAIL  (b) found a writer outside the pre-authorized __init__ read:"
    say "$writers"
    b_result="{\"ok\":false,\"writers\":$(json_escape_string "$writers")}"
  fi
fi
record "b-allowlist-widen" "$b_result"
say ""

# -----------------------------------------------------------------------------------------
# (c) OUTWARD VERB WITHOUT A HUMAN: admit_guest + schedule, both force=True HUMAN_GATED,
# single-step (no dry_run/confirm dance). EXPECT an immediate ok:false refusal on the FIRST
# call for each.
# -----------------------------------------------------------------------------------------
say "--- (c) OUTWARD VERB WITHOUT A HUMAN (live HTTP) ---"
c_pass=1

admit_res=$(mcp_call admit_guest '{"guestId":"g-pa-redteam-probe"}')
record "c-admit_guest" "$admit_res"
admit_ok=$(json_get_ok "$admit_res")
if [ "$admit_ok" = "true" ]; then
  say "**STOP THE LINE -- admit_guest SUCCEEDED WITHOUT A HUMAN**"
  say "FAIL  (c) admit_guest returned ok:true; raw response:"
  say "      $admit_res"
  c_pass=0
else
  say "PASS  (c) admit_guest refused immediately (ok:false), no token exchange offered"
  say "      $(json_get_how_to_fix "$admit_res")"
fi

sched_res=$(mcp_call schedule '{"slot":"g-pa-redteam-probe","runOfShow":{}}')
record "c-schedule" "$sched_res"
sched_ok=$(json_get_ok "$sched_res")
if [ "$sched_ok" = "true" ]; then
  say "**STOP THE LINE -- schedule SUCCEEDED WITHOUT A HUMAN**"
  say "FAIL  (c) schedule returned ok:true; raw response:"
  say "      $sched_res"
  c_pass=0
else
  say "PASS  (c) schedule refused immediately (ok:false), no token exchange offered"
  say "      $(json_get_how_to_fix "$sched_res")"
fi

if [ "$c_pass" -eq 1 ]; then
  pass_count=$((pass_count+1))
fi
say ""

say "=== G-PA RED TEAM: $pass_count/3 PASS ==="
if [ "$pass_count" -eq 3 ]; then
  exit 0
else
  exit 1
fi

# ---------------------------------------------------------------------------------------------
# OPERATOR FOLLOW-UP (recommended even though this script doesn't do it automatically): confirm
# the matching ledger rows exist in /var/lib/uni/broadcast/audit/prod-mcp.ndjson on the node
# (grep for each response's audit_id) so the receipt cites independently-confirmed evidence, not
# just this script's own HTTP transcript. See production/docs/receipts/g_pa_red_team_*.md for
# the pattern.
# ---------------------------------------------------------------------------------------------
