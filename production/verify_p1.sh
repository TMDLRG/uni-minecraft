#!/bin/sh
# verify_p1.sh - THE P1 PROOF GATE for the broadcast node (uni-lab-79740c).
# Analogue of viewer/verify_overlays.cjs for System 2: no agent may claim the platform is up
# without this passing. Probes the REAL surfaces + hashes the REAL deployed files - never
# process-existence. Runs inside a throwaway container on the node:
#
#   podman run --rm --network host -v /var/lib/uni:/w:ro -v /etc/containers/systemd:/q:ro \
#     --entrypoint sh docker.io/alpine/git /w/broadcast-src/production/verify_p1.sh
#
# Companion host-level checks (run via the uni-lab MCP, allowlisted):
#   podman ps --filter name=uni-bcast --format '{{.Names}} :: {{.Status}}'   # 3 containers Up
#   systemctl is-enabled uni-production-mcp uni-bcast-mixer uni-bcast-relay uni-bcast-overlays
#
# Exit 0 = every check passed. Any failure prints FAIL and exits 1.
set -u
fails=0
say() { echo "$1"; }
pass() { say "PASS  $1"; }
fail() { say "FAIL  $1"; fails=$((fails+1)); }

# 1. overlays serving live state
if wget -qO- http://127.0.0.1:8099/overlays/state.json 2>/dev/null | grep -q updatedUtc; then
  pass "overlays :8099 serves state.json (updatedUtc present)"
else fail "overlays :8099 state.json"; fi

# 2. overlay page serving
if wget -qO- http://127.0.0.1:8099/onair.html 2>/dev/null | grep -qi doctype; then
  pass "overlays :8099 serves onair.html"
else fail "overlays :8099 onair.html"; fi

# 3. relay API + program path configured
paths=$(wget -qO- http://127.0.0.1:9997/v3/paths/list 2>/dev/null)
if echo "$paths" | grep -q '"name":"uni/program"'; then
  pass "relay :9997 API answers; uni/program path configured"
else fail "relay :9997 uni/program"; fi

# 4. mixer obs-websocket demands an upgrade (426) = OBS alive
code=$(wget -SO- http://127.0.0.1:4455/ 2>&1 | grep -o 'HTTP/1.1 426' | head -1)
if [ "$code" = "HTTP/1.1 426" ]; then
  pass "mixer :4455 obs-websocket answers 426 Upgrade Required"
else fail "mixer :4455 (want 426, got '$code')"; fi

# 5. production-MCP HTTP surface alive (404 on / is the healthy shape).
# DOUBLE-PROBE with a gap: a crash-looping service (Restart=3s) binds the port for a moment on
# every restart and can fool a single probe - found the hard way 2026-07-11 (restart counter 366
# while a lone probe said 404-healthy). Both probes must answer. The authoritative liveness is
# the host-side companion:  systemctl is-active uni-production-mcp  (must print 'active').
# :8095 (NOT the designed 8094 - that port belongs to uni-glass-configure on this node; probing
# 8094 here would "pass" against the WRONG service, which is exactly how the collision hid).
# 401 Unauthorized is THE healthy signature: the real production-MCP is token-gated and
# fail-closes unauthenticated requests. A 404 here means the WRONG service answered (the
# glass-configure impostor's signature during the port-collision incident) - REJECTED.
mcp_probe() { wget -SO- http://127.0.0.1:8095/ 2>&1 | grep -o 'HTTP/1.1 [0-9]*' | head -1; }
c1=$(mcp_probe); sleep 6; c2=$(mcp_probe)
ok_code() { case "$1" in "HTTP/1.1 401") return 0;; *) return 1;; esac; }
if ok_code "$c1" && ok_code "$c2"; then
  pass "production-MCP :8095 answers 401 token-gated on both probes 6s apart (the real, fail-closed service)"
else fail "production-MCP :8095 wrong/unstable (probe1='$c1' probe2='$c2'; want 401; 404=impostor - check systemctl is-active)"; fi

# 6. deployed-file integrity - COMPARE each immutable config/quadlet to its expected sha256 (the
# DEPLOYED_STATE.md lock table = the git-index bytes @ the locked commit). A DRIFTED file now FAILS
# the gate instead of merely printing a new hash (the old print-only check let silent drift PASS).
# broadcast.json is the LIVE mutable spool (the producer rewrites it) -> existence-only, never pinned.
say "--- deployed-file integrity (expected sha256 == DEPLOYED_STATE.md lock table) ---"
check_sha() { # <path> <expected>
  if [ ! -f "$1" ]; then fail "missing $1"; return; fi
  got=$(sha256sum "$1" | cut -d' ' -f1)
  if [ "$got" = "$2" ]; then pass "sha OK $1"; else fail "sha DRIFT $1 (got $got expected $2)"; fi
}
check_sha /w/broadcast/mediamtx.yml       9d314adb33f1a657768fb1dd11c5d07c2d15f3011e24273e7dc6c2f6309a531a
check_sha /w/broadcast/overlays/Caddyfile e8ce5d3ca57bfca5421de11635a8b27902ab4b0cc68fc1b83e462d58fbbb39d6
check_sha /q/uni-bcast-mixer.container    e7a2ad2ff2caca8965cba3f29ae6e2502b85502729b7a8d988e707a76ede046f
check_sha /q/uni-bcast-relay.container    39d6f87c2cfee18ccf6a115594d7af6031879fc475c53c01f1f40692a726992c
check_sha /q/uni-bcast-overlays.container 7e782f65e740a068873c18930c290923d24b202446e99819cced101b0562b211
if [ -f /w/broadcast/broadcast.json ]; then say "  (broadcast.json present - live mutable spool, not sha-pinned)"; else fail "missing /w/broadcast/broadcast.json"; fi

say "---"
if [ "$fails" -eq 0 ]; then say "P1 PROOF GATE: ALL PASS"; exit 0
else say "P1 PROOF GATE: $fails FAILURE(S) - the platform is NOT up; no agent may claim otherwise"; exit 1; fi
