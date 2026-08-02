#!/usr/bin/env python3
"""
cpradio session-liveness patch — closes the leaked-session defect behind the stuck
/api/nowplaying reporter.

ROOT CAUSE (proven 2026-07-18, receipt: docs/receipts/music_nowplaying_stuck_root_cause_2026-07-18.md):
`SESSIONS[sid]` is written ONLY by the pump thread, cleaned up ONLY in stream()'s `finally:`, and
the request socket has NO timeout. A peer that vanishes without a write-visible error parks the
pump thread forever, so `finally:` never runs: the session record leaks with `seq` frozen at 0 and
LISTENERS permanently incremented. nowplaying() then reports that dead record as authoritative and
computes positionSec = now - frozen_track_started, which grows without bound.

Measured signature: activeListeners=1 with ZERO established TCP connections on :8687;
seq=0, positionSec=10942.7 vs durationSec=94.9 (115x overshoot).

This script is IDEMPOTENT: re-running it on an already-patched file exits 0 without changes.
It runs on the HOST (the volume is mounted read-only into the container).

Usage:
    python3 patch_session_liveness.py /var/lib/containers/storage/volumes/musicradio/_data/server.py
"""
import ast
import re
import sys

MARKER = "# --- UNI session-liveness patch (2026-07-18) ---"


def die(msg):
    print("FAIL: " + msg, file=sys.stderr)
    raise SystemExit(1)


def sub_once(src, old, new, label):
    """Replace `old` exactly once; fail loudly if it is missing or ambiguous."""
    n = src.count(old)
    if n == 0:
        die("anchor not found for %s -- the upstream file has changed; re-derive the patch "
            "instead of forcing it." % label)
    if n > 1:
        die("anchor for %s matched %d times (expected 1); refusing to guess." % (label, n))
    return src.replace(old, new, 1)


# ---------------------------------------------------------------------------
# 1. imports: `socket` is needed for socket.timeout in the except clause.
# ---------------------------------------------------------------------------
P_IMPORT = (
    "import json, os, time, threading, urllib.parse",
    "import json, os, socket, time, threading, urllib.parse",
    "import line",
)

# ---------------------------------------------------------------------------
# 2. globals: tunables + drop the hand-maintained LISTENERS counter.
#
#    LISTENERS is DERIVED from len(SESSIONS) from here on. That is what kills the
#    counter-drift class outright: with one source of truth there is no way for the
#    reaper and stream()'s finally: to double-decrement, and no way for the gauge to
#    disagree with the map.
# ---------------------------------------------------------------------------
P_GLOBALS = (
    """_lock = threading.Lock()
SESSIONS = {}
LISTENERS = 0
STATS = {"total_connections": 0, "bytes_served": 0, "track_plays": {}}""",
    MARKER + """
# A dead peer must RAISE, not park a thread forever. This is the primary cure: with no
# timeout, self.wfile.write() on a vanished peer blocks indefinitely, stream()'s finally:
# never runs, and the session record leaks with seq frozen at 0.
STREAM_WRITE_TIMEOUT = float(os.environ.get("RADIO_WRITE_TIMEOUT", "20"))
# A session that has not moved bytes for this long is not playing anything. nowplaying()
# refuses to report it, and the reaper drops it.
SESSION_STALE_SEC = float(os.environ.get("RADIO_SESSION_STALE_SEC", "30"))
# Incident levers (/api/reset, /api/skip). UNSET => the verbs return 503 "not configured".
# We do not ship an unauthenticated mutation, and we do not describe these as secured
# unless this token is actually set.
ADMIN_TOKEN = os.environ.get("RADIO_ADMIN_TOKEN", "")

_lock = threading.Lock()
SESSIONS = {}
STATS = {"total_connections": 0, "bytes_served": 0, "track_plays": {}}


def _session_live(s, now=None):
    \"\"\"A session is live only if its pump thread moved bytes recently. The pump is the only
    writer of last_progress, so a parked/dead thread can never look live.\"\"\"
    if not s:
        return False
    now = time.monotonic() if now is None else now
    return (now - s.get("last_progress", s.get("track_started", 0.0))) <= SESSION_STALE_SEC


def _reap_locked():
    \"\"\"Drop sessions whose pump has stopped progressing. Caller holds _lock.\"\"\"
    now = time.monotonic()
    for k in [k for k, v in SESSIONS.items() if not _session_live(v, now)]:
        SESSIONS.pop(k, None)


def _reaper_loop():
    while True:
        time.sleep(5)
        try:
            with _lock:
                _reap_locked()
        except Exception:
            pass
""",
    "globals block",
)

# ---------------------------------------------------------------------------
# 3. stream(): derive the gauge from len(SESSIONS), seed last_progress, and do not let a
#    NEW connection stomp a LIVE incumbent that is using the same session id.
# ---------------------------------------------------------------------------
P_STREAM_ENTER = (
    """    def stream(self, sid):
        global LISTENERS
        with _lock:
            if LISTENERS >= MAX_LISTENERS:
                return self._json({"error": "stream full"}, 503)
            LISTENERS += 1
            STATS["total_connections"] += 1
            if not sid:
                sid = "anon-%d" % STATS["total_connections"]
            SESSIONS[sid] = {"seq": 0, "track_started": time.monotonic(),
                             "connected_at": time.time(), "ip": self.client_address[0]}""",
    """    def stream(self, sid):
        with _lock:
            # reap first, so leaked records can never consume a listener slot (the old
            # counter made every leak permanently shrink capacity toward 503 "stream full")
            _reap_locked()
            if len(SESSIONS) >= MAX_LISTENERS:
                return self._json({"error": "stream full"}, 503)
            STATS["total_connections"] += 1
            if not sid:
                sid = "anon-%d" % STATS["total_connections"]
            # SID COLLISION: if a LIVE connection already owns this id, do not overwrite its
            # playhead (that reset seq to 0 under the incumbent and corrupted its telemetry).
            # The incumbent keeps the public name; the newcomer streams under a private key.
            if _session_live(SESSIONS.get(sid)):
                sid = "%s#%d" % (sid, STATS["total_connections"])
            now = time.monotonic()
            SESSIONS[sid] = {"seq": 0, "track_started": now, "last_progress": now,
                             "connected_at": time.time(), "ip": self.client_address[0]}""",
    "stream() entry",
)

P_STREAM_EXIT = (
    """        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        finally:
            with _lock:
                LISTENERS -= 1
                SESSIONS.pop(sid, None)""",
    """        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError,
                socket.timeout, TimeoutError, OSError):
            # socket.timeout/OSError are the whole point: with STREAM_WRITE_TIMEOUT set, a
            # vanished peer now unwinds the thread into this finally: instead of parking.
            pass
        finally:
            with _lock:
                SESSIONS.pop(sid, None)""",
    "stream() exit",
)

# Arm the timeout right before pumping.
P_STREAM_TIMEOUT = (
    """            if want_meta:
                self.send_header("icy-metaint", str(METAINT))
            self.end_headers()
            self._pump(sid, want_meta)""",
    """            if want_meta:
                self.send_header("icy-metaint", str(METAINT))
            self.end_headers()
            # ThreadingHTTPServer leaves the request socket blocking with no timeout; without
            # this the pump can block forever on a dead peer and leak its session record.
            try:
                self.connection.settimeout(STREAM_WRITE_TIMEOUT)
            except Exception:
                pass
            self._pump(sid, want_meta)""",
    "stream() timeout arming",
)

# ---------------------------------------------------------------------------
# 4. _pump(): heartbeat last_progress inside the per-chunk lock that ALREADY exists for
#    bytes_served -- zero additional lock acquisitions.
# ---------------------------------------------------------------------------
P_PUMP_HEARTBEAT = (
    """                        with _lock:
                            STATS["bytes_served"] += take""",
    """                        with _lock:
                            STATS["bytes_served"] += take
                            _s = SESSIONS.get(sid)
                            if _s is not None:
                                _s["last_progress"] = time.monotonic()""",
    "_pump heartbeat",
)

# ---------------------------------------------------------------------------
# 5. nowplaying(): never report a record we cannot show is live, and never emit an
#    unbounded positionSec. Server-side twin of the studio's stalePlayhead containment.
# ---------------------------------------------------------------------------
P_NOWPLAYING = (
    """    def nowplaying(self, sid):
        with _lock:
            s = SESSIONS.get(sid) if sid else None
            if not s:
                ref = int((time.monotonic() - START_MONO)) % max(1, len(ORDER))
                return self._json({"status": "no-session",
                                   "hint": "open /radio?session=<id> with the same id, then poll here",
                                   "reference": track_public(ORDER[ref])})
            seq, pos = s["seq"], time.monotonic() - s["track_started"]""",
    """    def nowplaying(self, sid):
        with _lock:
            s = SESSIONS.get(sid) if sid else None
            live = _session_live(s)
            if s is not None and not live:
                # a stranded record: its pump is gone, so nothing is playing on this session.
                SESSIONS.pop(sid, None)
            if not live:
                ref = int((time.monotonic() - START_MONO)) % max(1, len(ORDER))
                return self._json({"status": "stale-session" if s is not None else "no-session",
                                   "hint": "open /radio?session=<id> with the same id, then poll here",
                                   "stalePlayhead": s is not None,
                                   "reference": track_public(ORDER[ref])})
            seq, pos = s["seq"], time.monotonic() - s["track_started"]""",
    "nowplaying staleness guard",
)

# Bound the reported position: a live session should never read past its track.
P_NOWPLAYING_BOUND = (
    """        t = ORDER[seq]
        out = track_public(t)
        out["positionSec"] = round(pos, 1)""",
    """        t = ORDER[seq]
        out = track_public(t)
        # Never emit an unbounded playhead. A live session that somehow reads past its own
        # track duration is reporting a clock we do not trust -- say so instead of lying.
        _dur = out.get("durationSec") or 0
        if _dur and pos > _dur + 5:
            out["stalePlayhead"] = True
            out["positionSec"] = None
        else:
            out["positionSec"] = round(pos, 1)""",
    "nowplaying position bound",
)

# ---------------------------------------------------------------------------
# 6. telemetry(): report the derived, honest gauge.
# ---------------------------------------------------------------------------
P_TELEMETRY = (
    """                "activeListeners": LISTENERS, "totalConnections": STATS["total_connections"],""",
    """                "activeListeners": len(SESSIONS), "totalConnections": STATS["total_connections"],""",
    "telemetry gauge",
)

# ---------------------------------------------------------------------------
# 7. incident verbs + the reaper thread.
# ---------------------------------------------------------------------------
P_DO_POST = (
    """    def static(self, rel, ctype):""",
    """    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        if p.path not in ("/api/reset", "/api/skip"):
            return self._json({"error": "not found", "path": p.path}, 404)
        if not ADMIN_TOKEN:
            # No token configured => no mutation. We do not ship an unauthenticated verb and
            # then call it secured.
            return self._json({"error": "not configured",
                               "hint": "set RADIO_ADMIN_TOKEN in the container env to enable"}, 503)
        supplied = self.headers.get("X-Radio-Token", "")
        if supplied != ADMIN_TOKEN:
            return self._json({"error": "unauthorized"}, 401)
        sid = urllib.parse.parse_qs(p.query).get("session", [None])[0]
        with _lock:
            if p.path == "/api/reset":
                dropped = list(SESSIONS) if not sid else [k for k in SESSIONS if k == sid]
                for k in dropped:
                    SESSIONS.pop(k, None)
                return self._json({"ok": True, "action": "reset", "dropped": dropped})
            s = SESSIONS.get(sid) if sid else None
            if not s:
                return self._json({"error": "no such session", "session": sid}, 404)
            s["seq"] = (s["seq"] + 1) % len(ORDER)
            s["track_started"] = time.monotonic()
            return self._json({"ok": True, "action": "skip", "session": sid, "seq": s["seq"]})

    def static(self, rel, ctype):""",
    "admin verbs",
)

P_MAIN = (
    """def main():
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True""",
    """def main():
    threading.Thread(target=_reaper_loop, daemon=True).start()
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    srv.daemon_threads = True""",
    "reaper thread start",
)

PATCHES = [P_IMPORT, P_GLOBALS, P_STREAM_ENTER, P_STREAM_EXIT, P_STREAM_TIMEOUT,
           P_PUMP_HEARTBEAT, P_NOWPLAYING, P_NOWPLAYING_BOUND, P_TELEMETRY, P_DO_POST, P_MAIN]


def main():
    if len(sys.argv) != 2:
        die("usage: patch_session_liveness.py <path-to-server.py>")
    path = sys.argv[1]

    with open(path, "r", encoding="utf-8") as fh:
        src = fh.read()

    if MARKER in src:
        print("already patched (marker present); no changes made.")
        return 0

    for old, new, label in PATCHES:
        src = sub_once(src, old, new, label)

    # No `global LISTENERS` declarations may survive -- the name is gone.
    leftover = re.findall(r"^\s*global\s+LISTENERS\s*$", src, flags=re.M)
    if leftover:
        die("a `global LISTENERS` declaration survived the patch; refusing to write.")
    if re.search(r"\bLISTENERS\b", src):
        die("a bare LISTENERS reference survived the patch; refusing to write.")

    # Syntax gate BEFORE we touch the file on disk.
    try:
        ast.parse(src)
    except SyntaxError as e:
        die("patched source does not parse: %s" % e)

    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)

    print("patched OK: %s" % path)
    print("  - socket write timeout armed (dead peers raise instead of parking a thread)")
    print("  - last_progress heartbeat + reaper thread (leaks self-heal)")
    print("  - nowplaying refuses stale records and never emits an unbounded positionSec")
    print("  - activeListeners derived from len(SESSIONS) (counter-drift class removed)")
    print("  - /api/reset + /api/skip present but 503 unless RADIO_ADMIN_TOKEN is set")
    print("NOW: restart the container -> podman restart cpradio")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
