#!/usr/bin/env python3
"""producer-sample.py - a tiny sample writer for broadcast.json.

It writes a single, schema-valid sample snapshot of the overlay state contract
(broadcast.json) so the transparent overlay pages can be opened and tested
locally without the full uni-producer running.

The write is ATOMIC: a temp file in the same directory is written then
os.replace()'d over the target, exactly like the glass cockpit's collect.py.
This guarantees a reader (an overlay page mid-fetch) never sees a half-written
file - it sees either the old snapshot or the new one.

Default target: /var/lib/uni/broadcast/broadcast.json  (the host bind from the
master design). nginx aliases that to /overlays/state.json with no-store; for
LOCAL testing you can instead point --out at an overlays/state.json sitting next
to the pages and serve the folder with any static server.

DESIGN/REFERENCE only - this writes a SAMPLE, nothing here is deployed.

Usage:
  python producer-sample.py                       # one snapshot to the default path
  python producer-sample.py --out ./state.json    # write next to the pages for local test
  python producer-sample.py --loop 1.0            # rewrite every 1.0s (live updatedUtc + a ticking caption)
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone

DEFAULT_OUT = "/var/lib/uni/broadcast/broadcast.json"

# A small rotating set of caption lines so --loop visibly advances (and shows
# the translations path working in the caption overlay).
CAPTION_CYCLE = [
    {
        "en": "Tonight: aligning mental-health treatment to nature.",
        "es": "Esta noche: alinear el tratamiento de salud mental con la naturaleza.",
        "hi": "आज रात: मानसिक स्वास्थ्य उपचार को प्रकृति के साथ जोड़ना।",
    },
    {
        "en": "The science feed, back on the air for every time zone.",
        "es": "El canal de ciencia, de vuelta al aire para cada zona horaria.",
        "hi": "विज्ञान फीड, हर समय क्षेत्र के लिए फिर से प्रसारित।",
    },
    {
        "en": "From ending school shootings to a path to the stars.",
        "es": "Desde acabar con los tiroteos escolares hasta un camino a las estrellas.",
        "hi": "स्कूली गोलीबारी को रोकने से लेकर सितारों तक के रास्ते तक।",
    },
]


def now_iso() -> str:
    """ISO-8601 UTC with millisecond precision and a trailing Z."""
    return (
        datetime.now(timezone.utc)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def build_snapshot(tick: int) -> dict:
    """Build one schema-valid broadcast.json snapshot.

    `tick` advances the caption line so a --loop run visibly moves.
    """
    cap = CAPTION_CYCLE[tick % len(CAPTION_CYCLE)]
    return {
        "updatedUtc": now_iso(),
        "source": "producer-sample",
        "onAir": {"value": True, "text": "LIVE"},
        "lowerThird": {
            "visible": True,
            "kicker": "UNI EXPERT",
            "title": "Dr. A. Rivera",
            "subtitle": "Trauma and the nervous system",
            "tone": "ok",
        },
        "title": {
            "visible": False,
            "kicker": "",
            "text": "",
            "subtitle": "",
            "tone": "accent",
        },
        "ticker": [
            {"text": "EducateWright - the science feed, back on air", "tone": "ok"},
            {"text": "Multilingual coverage across every time zone", "tone": "accent"},
            {"text": "Design reference snapshot - status: pending", "tone": "warn"},
        ],
        "caption": {
            "visible": True,
            "lang": "en",
            "text": cap["en"],
            "translations": {"es": cap["es"], "hi": cap["hi"]},
        },
        "clock": {
            "zones": ["UTC", "America/Chicago", "Europe/London", "Asia/Kolkata"]
        },
        "music": {"volume": 0.18, "ducked": True},
        "nowPlaying": {"segment": "Interview", "lang": "en", "clipId": None},
        "brand": {
            "logo": "uni-logo.png",
            "poweredBy": "solution-wright-logo-light.png",
        },
        "evidence": {"class": "C"},
    }


def atomic_write_json(path: str, payload: dict) -> None:
    """Atomically write `payload` as JSON to `path` (tmp in same dir + os.replace)."""
    directory = os.path.dirname(os.path.abspath(path)) or "."
    os.makedirs(directory, exist_ok=True)
    data = json.dumps(payload, ensure_ascii=False, indent=2)

    fd, tmp_path = tempfile.mkstemp(prefix=".broadcast.", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_path, path)  # atomic on POSIX and Windows
    except Exception:
        # Best-effort cleanup of the temp file on failure.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Write a sample broadcast.json.")
    parser.add_argument(
        "--out",
        default=DEFAULT_OUT,
        help="Target path for broadcast.json (default: %(default)s).",
    )
    parser.add_argument(
        "--loop",
        type=float,
        default=0.0,
        metavar="SECONDS",
        help="If > 0, rewrite every SECONDS with a fresh updatedUtc and advancing caption.",
    )
    args = parser.parse_args(argv)

    tick = 0
    try:
        if args.loop and args.loop > 0:
            print(
                "writing sample broadcast.json to %s every %.2fs (Ctrl-C to stop)"
                % (args.out, args.loop),
                file=sys.stderr,
            )
            while True:
                atomic_write_json(args.out, build_snapshot(tick))
                tick += 1
                time.sleep(args.loop)
        else:
            atomic_write_json(args.out, build_snapshot(tick))
            print("wrote sample broadcast.json -> %s" % args.out, file=sys.stderr)
    except KeyboardInterrupt:
        print("\nstopped", file=sys.stderr)
        return 0
    except OSError as exc:
        print("error: could not write %s: %s" % (args.out, exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
