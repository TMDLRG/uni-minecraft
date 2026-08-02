#!/usr/bin/env python3
"""programshot.py -- the PROOF loop. Every ~2s: screenshot the CURRENT PROGRAM scene from the
mixer and write it where nginx already serves it, so the program is visible in ANY browser
(and so the operator -- and the agent -- can LOOK at the real frame instead of trusting logs):

    /var/lib/uni/status/program.jpg    the live frame (atomic tmp+mv)
    /var/lib/uni/status/program.json   {scene, streaming, bytes, ts}

View at  https://<node>/status/live.html  (page ships alongside this).
Runs as a host service (venv python, obs adapter over loopback :4455). Honest by construction:
if OBS is unreachable the .json goes stale and live.html shows STALE -- never a frozen fake.
"""
from __future__ import annotations

import base64
import json
import os
import sys
import time

sys.path.insert(0, "/opt/uni")
from production.mcp.adapters import obs  # noqa: E402

OUT_DIR = os.environ.get("UNI_STATUS_DIR", "/var/lib/uni/status")
INTERVAL = float(os.environ.get("UNI_SHOT_INTERVAL_S", "2"))


def write_atomic(path: str, data: bytes) -> None:
    tmp = path + ".tmp"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, path)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    while True:
        t0 = time.time()
        try:
            scene = obs.get_current_scene().get("currentProgramSceneName") or ""
            shot = obs._request("GetSourceScreenshot", {
                "sourceName": scene, "imageFormat": "jpeg",
                "imageWidth": 640, "imageHeight": 360, "imageCompressionQuality": 70,
            })
            b64 = shot.get("imageData") or ""
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            jpg = base64.b64decode(b64)
            st = obs._request("GetStreamStatus")
            write_atomic(os.path.join(OUT_DIR, "program.jpg"), jpg)
            write_atomic(os.path.join(OUT_DIR, "program.json"), json.dumps({
                "scene": scene,
                "streaming": bool(st.get("outputActive")),
                "frames": st.get("outputTotalFrames"),
                "skipped": st.get("outputSkippedFrames"),
                "jpgBytes": len(jpg),
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }).encode())
        except Exception as exc:  # keep looping; staleness is the honest failure signal
            try:
                write_atomic(os.path.join(OUT_DIR, "program.json"), json.dumps({
                    "error": str(exc)[:200],
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }).encode())
            except Exception:
                pass
        time.sleep(max(0.2, INTERVAL - (time.time() - t0)))


if __name__ == "__main__":
    main()
