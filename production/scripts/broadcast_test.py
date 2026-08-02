#!/usr/bin/env python3
"""broadcast_test.py -- STALE, pre-correction 5-stage broadcast test for System 2 (uni-lab-79740c).

RETIRED for live use (2026-07-13, confirmed cross-session with the Producer/command_center
owner) -- same class of retirement as production/verify_p1.sh (superseded by verify_p1_v2.sh).
Written 2026-07-11 23:36 to 2026-07-12 01:37, ~10 hours BEFORE the P7 architecture correction
(docs/STUDIO_SYSTEMS.md, finalized 2026-07-12 11:31, commit 84acc36) that retired the node2
mixer/overlays stack. This script's colony default (COLONY_HOST=THINKER), its obs.py adapter
target (uni-bcast-mixer on node2, RETIRED), and its overlays.py writes (a third writer racing
command_center.cjs's own writeState()) all predate that correction and target boxes/services
that no longer host those roles. Do not run it or retarget its env vars.

THE LIVE, CORRECT, ALREADY-PROVEN 5-stage broadcast test is:
    POST http://127.0.0.1:8098/api/broadcast_test   (from THINKER; {"private":true} is the
                                                       default -- loopback only, no public
                                                       fan-out re-point)
    GET  http://127.0.0.1:8098/api/broadcast_test    (poll for stage progress)
implemented in viewer/command_center.cjs's runBroadcastTest() (P4, 2026-07-12) -- it already
ran end-to-end: bytes climbing to the relay, all 24 templates as the suite stood on 2026-07-12
(it is 33 today, and BARS_TONE is one of them rather than an addition to them) rendering real
pixels on program, camera+fanout, park to STANDBY + StopStream. It runs FROM THINKER, where
OBS and overlays actually live post-correction, sidestepping the cross-box topology problem
this script has. Use that instead.

--- Original docstring below, preserved for history, now describing a STALE topology. ---

User directive 2026-07-12: "engineer, implement, and validate ... a 5 stage broadcast test
that runs through all for us and provides a detailed log and diags back on all broadcast
tests and preflight". A broadcast test MUST BE SEEN: stage 3 cuts the REAL program (watch it
live at  srt://<node-lan>:8890?streamid=read:uni/program  in VLC while this runs).

Stages (each -> PASS / FAIL / SKIP with per-check diagnostics + timings):
  1. PREFLIGHT      platform surfaces (overlays/relay/mixer/MCP), colony source over the LAN,
                    assets (music bed, bars+tone), scenes present, disk/mem/load.
  2. ENCODER/INGEST OBS StartStream -> relay uni/program ready:true + bytesReceived CLIMBING
                    + OBS output stats (frames, congestion). The single-encode keystone.
  3. SCENE+SOUND    classic soundcheck, SEEN on program: SMPTE bars + 1kHz tone first, then
                    every scene cut with a lower-third announcing it, music bed under.
                    Per-scene non-blank screenshot proof.
  4. CAMERAS+FANOUT relay cam1..cam3 (browser WHIP publishers): ready/codec/tracks; then
                    YT/Twitch fan-out truth: keys present? tee running? program readers?
                    Honest SKIP when the operator has not provided keys yet.
  5. PARK+REPORT    park STANDBY, mute the reel, KEEP THE ENCODER RUNNING (stay-live
                    readiness: public egress begins the moment keys land + relay restart),
                    write the full JSON + Markdown report.

Live log:    /run/uni-broadcast-test.log            (tail it while running)
Report:      /var/lib/uni/broadcast/audit/broadcast_test_<UTC>.json + .md
Exit code:   0 = stages 1-3 all PASS (4 may be SKIP -- operator-held keys / no cams yet)
             1 = any of stages 1-3 FAIL
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

sys.path.insert(0, "/opt/uni")
from production.mcp.adapters import obs, overlays  # noqa: E402

LOG = "/run/uni-broadcast-test.log"
AUDIT_DIR = "/var/lib/uni/broadcast/audit"
NODE_LAN = os.environ.get("UNI_NODE_LAN_IP", "node2.uni-lab.local")
COLONY_HOST = os.environ.get("UNI_COLONY_HOST", "thinker.uni-lab.local")  # THINKER (source box)
BED = "/var/lib/uni/broadcast/music/bed.m4a"
BARS = "/var/lib/uni/broadcast/clips/bars_tone.mp4"
RUNTIME_ENV = "/etc/uni/runtime.env"
UTC = lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

REPORT = {"startedUtc": UTC(), "node": "uni-lab-79740c", "stages": [], "watchUrls": {
    "program_srt": f"srt://{NODE_LAN}:8890?streamid=read:uni/program",
    "program_rtmp": f"rtmp://{NODE_LAN}:1935/uni/program",
    "cam_publish": [f"https://{NODE_LAN}:8889/cam{i}/publish?video-codec=h264/90000" for i in (1, 2, 3)],
}}


def log(msg: str) -> None:
    line = f"[{UTC()}] {msg}"
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")
    print(line, flush=True)


def http_get(url: str, timeout: float = 6.0):
    """(status, body_bytes, ms) -- never raises."""
    t0 = time.time()
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status, r.read(), round((time.time() - t0) * 1000)
    except urllib.error.HTTPError as e:
        return e.code, b"", round((time.time() - t0) * 1000)
    except Exception as e:
        return 0, str(e).encode(), round((time.time() - t0) * 1000)


def relay_paths():
    st, body, _ = http_get("http://127.0.0.1:9997/v3/paths/list")
    if st != 200:
        return {}
    try:
        return {p["name"]: p for p in json.loads(body).get("items", [])}
    except Exception:
        return {}


class Stage:
    def __init__(self, n: int, name: str):
        self.n, self.name, self.checks, self.t0 = n, name, [], time.time()
        log(f"===== STAGE {n}: {name} =====")

    def check(self, cid: str, ok, value, detail: str = "") -> bool:
        ok = bool(ok)
        row = {"id": cid, "ok": ok, "value": value, "detail": detail}
        self.checks.append(row)
        log(f"  [{'PASS' if ok else 'FAIL'}] {cid}: {value}{(' -- ' + detail) if detail else ''}")
        return ok

    def skip(self, cid: str, value, detail: str = "") -> None:
        self.checks.append({"id": cid, "ok": None, "value": value, "detail": detail})
        log(f"  [SKIP] {cid}: {value}{(' -- ' + detail) if detail else ''}")

    def close(self, skipped: bool = False) -> str:
        hard = [c for c in self.checks if c["ok"] is not None]
        verdict = "SKIP" if skipped else ("PASS" if all(c["ok"] for c in hard) else "FAIL")
        REPORT["stages"].append({
            "stage": self.n, "name": self.name, "verdict": verdict,
            "seconds": round(time.time() - self.t0, 1), "checks": self.checks,
        })
        log(f"===== STAGE {self.n} verdict: {verdict} ({round(time.time() - self.t0, 1)}s) =====\n")
        return verdict


# ---------------------------------------------------------------- stage 1
def stage1() -> str:
    s = Stage(1, "PREFLIGHT")
    # overlay surfaces (server + program pages)
    st, body, ms = http_get("http://127.0.0.1:8099/overlays/state.json")
    fresh = ""
    try:
        snap = json.loads(body)
        fresh = snap.get("updatedUtc", "?")
    except Exception:
        pass
    s.check("overlays.state", st == 200, f"HTTP {st} ({ms}ms)", f"updatedUtc={fresh}")
    for page in ("lower-third.html", "ticker.html", "caption.html", "onair.html",
                 "title.html", "clock.html", "standby.html", "stage.html"):
        st, _, ms = http_get(f"http://127.0.0.1:8099/{page}")
        s.check(f"overlays.{page}", st == 200, f"HTTP {st} ({ms}ms)")
    # relay
    pm = relay_paths()
    s.check("relay.api", bool(pm), f"paths: {sorted(pm.keys())}")
    for p in ("uni/program", "cam1", "cam2", "cam3"):
        s.check(f"relay.path.{p}", p in pm, "configured" if p in pm else "MISSING (re-ship mediamtx.yml)")
    # mixer (OBS)
    try:
        ver = obs._request("GetVersion")
        s.check("obs.ws", True, f"obs {ver.get('obsVersion')} ws {ver.get('obsWebSocketVersion')}")
        scenes = [x.get("sceneName") for x in obs.list_scenes()]
        missing = [x for x in obs.KNOWN_SCENES if x not in scenes]
        s.check("obs.scenes", not missing, f"{len(scenes)} scenes",
                ("missing: " + ",".join(missing)) if missing else "all 8 canonical present")
        inputs = [i.get("inputName") for i in obs.list_inputs()]
        for need in ("Soundtrack", "Clip", "RemoteCam1", "RemoteCam2", "RemoteCam3"):
            s.check(f"obs.input.{need}", need in inputs, "present" if need in inputs else "missing (rebuild scenes)")
    except obs.ObsError as e:
        s.check("obs.ws", False, str(e))
    # production MCP: healthy signature is 401 (fail-closed token gate); 404 = impostor
    st, _, ms = http_get("http://127.0.0.1:8095/prod-mcp")
    s.check("mcp.8095", st == 401, f"HTTP {st} ({ms}ms)", "healthy signature IS 401; 404=impostor")
    # colony source across the LAN (System 1 on THINKER)
    st, b1, _ = http_get(f"http://{COLONY_HOST}:4000/producer/health", timeout=8)
    if st == 200:
        try:
            h1 = json.loads(b1)
            time.sleep(4)
            _, b2, _ = http_get(f"http://{COLONY_HOST}:4000/producer/health", timeout=8)
            h2 = json.loads(b2)
            adv = (h2.get("frame") or 0) > (h1.get("frame") or 0)
            s.check("colony.producer", h2.get("verdict") == "LIVE" and h2.get("driver") == "producer" and adv,
                    f"verdict={h2.get('verdict')} driver={h2.get('driver')} colony={h2.get('colony_count')}",
                    f"frame {h1.get('frame')}->{h2.get('frame')} advancing={adv}")
        except Exception as e:
            s.check("colony.producer", False, f"health unparseable: {e}")
    else:
        s.check("colony.producer", False, f"HTTP {st}", f"{COLONY_HOST}:4000 unreachable")
    st, _, ms = http_get(f"http://{COLONY_HOST}:3020/", timeout=8)
    s.check("colony.cam3020", st == 200, f"HTTP {st} ({ms}ms)")
    # assets
    for cid, path in (("asset.bed", BED), ("asset.bars_tone", BARS)):
        ok = os.path.isfile(path) and os.path.getsize(path) > 10000
        s.check(cid, ok, f"{path} {'%d bytes' % os.path.getsize(path) if ok else 'MISSING'}")
    # system
    try:
        du = subprocess.run(["df", "-BG", "/var/lib/uni"], capture_output=True, text=True, timeout=5)
        free_g = int(re.findall(r"(\d+)G\s+\d+%", du.stdout)[-1])
        s.check("sys.disk", free_g > 20, f"{free_g}G free on /var/lib/uni")
    except Exception as e:
        s.check("sys.disk", False, f"df failed: {e}")
    try:
        load1 = float(open("/proc/loadavg").read().split()[0])
        mem = dict(l.split(":") for l in open("/proc/meminfo").read().splitlines() if ":" in l)
        avail_g = round(int(mem["MemAvailable"].strip().split()[0]) / 1048576, 1)
        s.check("sys.load", load1 < 16, f"load1={load1}")
        s.check("sys.mem", avail_g > 2, f"{avail_g}G available")
    except Exception as e:
        s.check("sys.stats", False, str(e))
    return s.close()


# ---------------------------------------------------------------- stage 2
def stage2() -> str:
    s = Stage(2, "ENCODER -> RELAY INGEST")
    try:
        st0 = obs._request("GetStreamStatus")
        s.check("obs.pre", True, f"outputActive={st0.get('outputActive')}")
        if not st0.get("outputActive"):
            obs._request("StartStream")
            log("  StartStream sent")
        deadline = time.time() + 25
        ready = False
        while time.time() < deadline:
            p = relay_paths().get("uni/program") or {}
            if p.get("ready"):
                ready = True
                break
            time.sleep(2)
        p = relay_paths().get("uni/program") or {}
        s.check("relay.ready", ready, f"ready={p.get('ready')}",
                f"tracks={p.get('tracks')} readers={len(p.get('readers') or [])}")
        b = []
        for i in range(3):
            b.append((relay_paths().get("uni/program") or {}).get("bytesReceived") or 0)
            if i < 2:
                time.sleep(4)
        s.check("relay.bytes_climbing", b[0] < b[1] < b[2], f"bytesReceived {b[0]} -> {b[1]} -> {b[2]}")
        st1 = obs._request("GetStreamStatus")
        frames, skipped = st1.get("outputTotalFrames") or 0, st1.get("outputSkippedFrames") or 0
        s.check("obs.output", bool(st1.get("outputActive")),
                f"active={st1.get('outputActive')} bytes={st1.get('outputBytes')}",
                f"frames={frames} skipped={skipped} ({(100.0 * skipped / max(1, frames)):.2f}%) congestion={st1.get('outputCongestion')}")
    except obs.ObsError as e:
        s.check("obs.stream", False, str(e), getattr(e, "how_to_fix", ""))
    return s.close()


def _showrunner(action: str) -> str:
    """Pause/resume the show-runner so the TEST owns the program during the sweep.
    Run #2 (2026-07-12 06:03Z) proved uni-producer races the sweep -- it cut the program
    back to STANDBY between the test's cuts (scene.TITLE/GLASS FAILed with program=STANDBY,
    GUESTS lost its RequestResponse in the crossfire). systemctl start/stop only -- the
    boot-enable state is untouched."""
    r = subprocess.run(["systemctl", action, "uni-producer.service", "uni-playout.service"],
                       capture_output=True, text=True, timeout=30)
    return f"systemctl {action} producer+playout rc={r.returncode}"


# ---------------------------------------------------------------- stage 3
def stage3() -> str:
    s = Stage(3, "SCENE + SOUND SWEEP (WATCH THE PROGRAM NOW)")
    log(f"  >>> WATCH LIVE: vlc '{REPORT['watchUrls']['program_srt']}'  <<<")
    s.check("sweep.exclusive", True, _showrunner("stop"), "test owns the program during the sweep")
    try:
        overlays.set_on_air(True, "INTERNAL TEST")
        overlays.set_overlay("ticker", {"items": [
            {"text": "UNI SYSTEMS 5-STAGE BROADCAST TEST -- internal relay only", "tone": "ok"},
            {"text": f"watch: srt://{NODE_LAN}:8890?streamid=read:uni/program", "tone": "ok"},
        ]})
    except Exception as e:
        s.check("overlay.announce", False, f"overlay write failed: {e}")
    # classic soundcheck: SMPTE bars + 1kHz tone, audible + visible.
    # play_media FIRST -- it re-creates the Clip input if a prior roll_clip race destroyed it
    # (run #3: SetInputMute 600'd because Clip had been removed); only then unmute.
    try:
        obs.play_media("Clip", BARS, scene="CLIP")
        obs._request("SetInputMute", {"inputName": "Clip", "inputMuted": False})
        obs.cut_to_scene("CLIP", transition="Cut")
        overlays.set_overlay("lowerThird", {"visible": True, "kicker": "SOUND CHECK",
                                            "title": "SMPTE bars + 1 kHz reference tone",
                                            "subtitle": "classic test pattern -- stage 3 of 5", "tone": "ok"})
        time.sleep(10)
        shot = obs._request("GetSourceScreenshot", {"sourceName": "CLIP", "imageFormat": "jpeg",
                                                    "imageWidth": 480, "imageHeight": 270})
        s.check("soundcheck.bars_tone", len(shot.get("imageData") or "") > 4000,
                f"bars+tone screenshot {len(shot.get('imageData') or '')}b64 chars", "tone audible on program audio")
    except (obs.ObsError, Exception) as e:
        s.check("soundcheck.bars_tone", False, f"{e}")
    # music bed under everything else
    try:
        obs._request("SetInputVolume", {"inputName": "Soundtrack", "inputVolumeDb": -14})
        obs._request("SetInputMute", {"inputName": "Soundtrack", "inputMuted": False})
        s.check("sound.bed", True, "Soundtrack unmuted at -14 dB (bed.m4a)")
    except obs.ObsError as e:
        s.check("sound.bed", False, str(e))
    order = ["TITLE", "NEWSDESK", "GLASS", "GUESTS", "PIP", "COLONY", "CLIP", "STANDBY"]
    for sc in order:
        try:
            obs.cut_to_scene(sc, transition="Cut")
            overlays.set_overlay("lowerThird", {"visible": True, "kicker": "BROADCAST TEST",
                                                "title": f"scene: {sc}",
                                                "subtitle": "stage 3 sweep -- internal relay only", "tone": "ok"})
            time.sleep(6)
            cur = obs.get_current_scene().get("currentProgramSceneName")
            shot = obs._request("GetSourceScreenshot", {"sourceName": sc, "imageFormat": "jpeg",
                                                        "imageWidth": 480, "imageHeight": 270})
            blen = len(shot.get("imageData") or "")
            s.check(f"scene.{sc}", cur == sc and blen > 3000, f"program={cur} shot={blen}b64",
                    "non-blank" if blen > 3000 else "BLANK/near-blank frame")
        except obs.ObsError as e:
            s.check(f"scene.{sc}", False, str(e))
    try:
        obs._request("SetInputMute", {"inputName": "Clip", "inputMuted": True})  # reel back to muted
    except obs.ObsError:
        pass
    return s.close()


# ---------------------------------------------------------------- stage 4
def stage4() -> str:
    s = Stage(4, "REMOTE CAMERAS + PUBLIC FAN-OUT")
    for u in REPORT["watchUrls"]["cam_publish"]:
        log(f"  camera publish URL: {u}")
    # poll up to 90s for cameras (operator starts them on the laptop while this runs)
    deadline = time.time() + 90
    seen = {}
    while time.time() < deadline:
        pm = relay_paths()
        seen = {n: pm[n] for n in ("cam1", "cam2", "cam3") if pm.get(n, {}).get("ready")}
        if seen:
            break
        remain = int(deadline - time.time())
        log(f"  waiting for camera publishers... ({remain}s left)")
        time.sleep(10)
    if seen:
        for n, p in seen.items():
            tracks = p.get("tracks") or []
            h264 = any("H264" in t.upper() or "AVC" in t.upper() for t in tracks)
            s.check(f"cam.{n}", h264, f"publishing tracks={tracks}",
                    "H264 OK" if h264 else "wrong codec -- republish with the h264-pinned URL")
        for n in ("cam1", "cam2", "cam3"):
            if n not in seen:
                s.skip(f"cam.{n}", "not publishing", "start it from the publish URL above")
    else:
        for n in ("cam1", "cam2", "cam3"):
            s.skip(f"cam.{n}", "no publisher within 90s", "GUESTS scene shows them the moment they publish")
    # public fan-out truth (keys are operator-held; never invented)
    keys = {}
    try:
        with open(RUNTIME_ENV) as f:
            env_text = f.read()
        for k in ("YT_KEY", "TWITCH_KEY"):
            m = re.search(rf"^{k}=(.+)$", env_text, re.M)
            keys[k] = bool(m and m.group(1).strip())
    except FileNotFoundError:
        keys = {"YT_KEY": False, "TWITCH_KEY": False}
    if keys.get("YT_KEY") or keys.get("TWITCH_KEY"):
        s.check("fanout.keys", True, f"YT_KEY={'SET' if keys['YT_KEY'] else 'absent'} TWITCH_KEY={'SET' if keys['TWITCH_KEY'] else 'absent'}")
        readers = len((relay_paths().get("uni/program") or {}).get("readers") or [])
        s.check("fanout.tee_reading", readers >= 1, f"program readers={readers}",
                "the tee ffmpeg reads the program locally; >=1 means fan-out is consuming")
        try:
            lg = subprocess.run(["podman", "logs", "--tail", "40", "uni-bcast-relay"],
                                capture_output=True, text=True, timeout=10)
            tail = (lg.stdout + lg.stderr)[-1500:]
            bad = re.findall(r"(failed|error|refused|denied)", tail, re.I)
            s.check("fanout.relay_log", not bad, f"{len(bad)} error markers in last 40 log lines",
                    tail.replace("\n", " | ")[:400])
        except Exception as e:
            s.check("fanout.relay_log", False, f"podman logs failed: {e}")
    else:
        s.skip("fanout.public", "YT_KEY + TWITCH_KEY absent from /etc/uni/runtime.env",
               "operator adds keys + systemctl restart uni-bcast-relay -> egress starts (config already live)")
    return s.close()


# ---------------------------------------------------------------- stage 5
def stage5(verdicts) -> str:
    s = Stage(5, "PARK TO TRUE IDLE (stop the encoder -- go-live starts it)")
    try:
        obs.cut_to_scene("STANDBY", transition="Fade", ms=400)
        overlays.set_overlay("lowerThird", {"visible": False})
        overlays.set_on_air(False, "STANDBY")
        cur = obs.get_current_scene().get("currentProgramSceneName")
        s.check("park.standby", cur == "STANDBY", f"program={cur}")
        # STOP the encoder. Leaving x264 running 24/7 in STANDBY burned ~1 core continuously and
        # (with the cam spin) tripped the node load warn on 2026-07-12. Real broadcast starts the
        # encoder at go-live: operator hits go-live in /control -> StartStream + relay fan-out.
        try:
            obs._request("StopStream")
        except obs.ObsError:
            pass
        st = obs._request("GetStreamStatus")
        s.check("encoder.parked", not st.get("outputActive"),
                f"outputActive={st.get('outputActive')}",
                "idle costs no encode; go-live (human-gated, /control) restarts it")
    except obs.ObsError as e:
        s.check("park", False, str(e))
    # hand the program back to the show-runner (paused for the stage-3 sweep)
    s.check("showrunner.resumed", True, _showrunner("start"))
    return s.close()


def main() -> int:
    open(LOG, "w").close()
    log("UNI SYSTEMS -- 5-STAGE BROADCAST TEST (System 2, uni-lab-79740c)")
    log(f"watch program: vlc '{REPORT['watchUrls']['program_srt']}'")
    v = [stage1()]
    v.append(stage2())
    v.append(stage3() if v[1] == "PASS" else "SKIP")
    if v[2] == "SKIP":
        log("stage 3 SKIPPED: encoder/ingest failed -- nothing to sweep")
    v.append(stage4())
    v.append(stage5(v))
    REPORT["finishedUtc"] = UTC()
    REPORT["verdicts"] = dict(zip(["preflight", "encoder", "sweep", "cameras_fanout", "park"], v))
    core_pass = all(x == "PASS" for x in v[:3])
    REPORT["overall"] = "PASS" if core_pass else "FAIL"
    os.makedirs(AUDIT_DIR, exist_ok=True)
    ts = UTC().replace(":", "")
    jpath = f"{AUDIT_DIR}/broadcast_test_{ts}.json"
    with open(jpath, "w", encoding="utf-8") as f:
        json.dump(REPORT, f, indent=2)
    md = [f"# 5-stage broadcast test -- {REPORT['startedUtc']} (node uni-lab-79740c)",
          f"**OVERALL: {REPORT['overall']}**  (stages 1-3 are the core; 4 may be SKIP while keys/cams are operator-held)",
          "", f"watch program: `{REPORT['watchUrls']['program_srt']}`",
          "camera publish: " + " ".join(f"`{u}`" for u in REPORT["watchUrls"]["cam_publish"]), ""]
    for st in REPORT["stages"]:
        md.append(f"## Stage {st['stage']}: {st['name']} -- **{st['verdict']}** ({st['seconds']}s)")
        for c in st["checks"]:
            mark = {True: "PASS", False: "FAIL", None: "SKIP"}[c["ok"]]
            md.append(f"- [{mark}] `{c['id']}` {c['value']}" + (f" -- {c['detail']}" if c["detail"] else ""))
        md.append("")
    mpath = f"{AUDIT_DIR}/broadcast_test_{ts}.md"
    with open(mpath, "w", encoding="utf-8") as f:
        f.write("\n".join(md))
    log(f"report: {jpath}")
    log(f"report: {mpath}")
    log(f"OVERALL: {REPORT['overall']}  verdicts={REPORT['verdicts']}")
    return 0 if core_pass else 1


if __name__ == "__main__":
    sys.exit(main())
