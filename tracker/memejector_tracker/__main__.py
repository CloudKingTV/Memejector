"""
CLI.

    python -m memejector_tracker run                    # camera (needs cv2 + mediapipe)
    python -m memejector_tracker run --source synthetic # no camera, no mediapipe
    python -m memejector_tracker run --record           # write recordings/<stamp>.jsonl
    python -m memejector_tracker replay recordings/x.jsonl
    python -m memejector_tracker calibrate
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path

from .calibration import Calibration, DEFAULT_PATH
from .server import TrackerServer

ROOT = Path(__file__).resolve().parents[2]
RECORDINGS = ROOT / "recordings"
SETTINGS = Path(__file__).resolve().parents[1] / "tracker.json"


def load_settings() -> dict:
    if SETTINGS.exists():
        try:
            return json.loads(SETTINGS.read_text())
        except json.JSONDecodeError as exc:
            print(f"warning: {SETTINGS.name} is not valid JSON ({exc}); using defaults")
    return {}


def build_source(args, settings: dict):
    from .sources import ReplaySource, SyntheticSource

    if args.source == "synthetic":
        return SyntheticSource(fps=args.fps or 60, hands=args.hands)

    if args.source == "replay":
        return ReplaySource(Path(args.file), loop=not args.once, speed=args.speed)

    from .sources import CameraSource
    cal = Calibration.load(Path(args.calibration))
    if cal.identity:
        print("warning: no calibration.json — falling back to raw camera "
              "coordinates. Run `calibrate` before judging accuracy.")
    f = settings.get("filter", {})
    p = settings.get("pinch", {})
    return CameraSource(
        cal, index=args.camera,
        width=cal.camera.get("w", 1280), height=cal.camera.get("h", 720),
        fps=args.fps or cal.camera.get("fps", 60),
        min_cutoff=args.min_cutoff if args.min_cutoff is not None else f.get("min_cutoff", 0.8),
        beta=args.beta if args.beta is not None else f.get("beta", 2.5),
        close_at=p.get("close_at", 0.32), open_at=p.get("open_at", 0.45),
        landmarks=args.landmarks, max_hands=args.hands,
    )


def cmd_run(args) -> int:
    settings = load_settings()
    try:
        source = build_source(args, settings)
    except ImportError as exc:
        print(f"\n{exc}\n\nThe camera source needs opencv-python and mediapipe:\n"
              f"    pip install -r tracker\\requirements.txt\n\n"
              f"To bring up the rest of the pipeline without them:\n"
              f"    python -m memejector_tracker run --source synthetic\n")
        return 1
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"\n{exc}\n")
        return 1

    record = None
    if args.record:
        RECORDINGS.mkdir(parents=True, exist_ok=True)
        record = RECORDINGS / f"{datetime.now():%Y%m%d-%H%M%S}-{source.name}.jsonl"

    server = TrackerServer(source, host=args.host, port=args.port, record=record)
    try:
        asyncio.run(server.run())
    except KeyboardInterrupt:
        print("\nstopped.")
    return 0


def cmd_replay(args) -> int:
    args.source = "replay"
    args.record = False
    return cmd_run(args)


def cmd_calibrate(args) -> int:
    try:
        from .calibrate import run_calibration
    except ImportError as exc:
        print(f"\n{exc}\n\nCalibration needs opencv-python:\n"
              f"    pip install -r tracker\\requirements.txt\n")
        return 1
    return run_calibration(camera_index=args.camera,
                           width=args.width, height=args.height,
                           projector_w=args.projector_width,
                           projector_h=args.projector_height,
                           projector_x=args.projector_x,
                           projector_y=args.projector_y,
                           mirrored=not args.no_mirror,
                           out=Path(args.calibration))


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="memejector_tracker",
                                 description="Hand state over a WebSocket.")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--host", default="127.0.0.1")
        p.add_argument("--port", type=int, default=8787)
        p.add_argument("--calibration", default=str(DEFAULT_PATH))
        p.add_argument("--camera", type=int, default=0, help="camera index")
        p.add_argument("--fps", type=int, default=0)
        p.add_argument("--hands", type=int, default=2, choices=(1, 2))
        p.add_argument("--landmarks", action="store_true",
                       help="include all 21 landmarks (roughly triples message size)")
        p.add_argument("--min-cutoff", type=float, default=None)
        p.add_argument("--beta", type=float, default=None)
        p.add_argument("--speed", type=float, default=1.0)
        p.add_argument("--once", action="store_true", help="replay: do not loop")
        p.add_argument("--file", default="")

    r = sub.add_parser("run", help="stream hand frames")
    r.add_argument("--source", choices=("camera", "synthetic", "replay"), default="camera")
    r.add_argument("--record", action="store_true", help="write recordings/<stamp>.jsonl")
    common(r)
    r.set_defaults(fn=cmd_run)

    p = sub.add_parser("replay", help="replay a recording over the same socket")
    p.add_argument("file")
    common(p)
    p.set_defaults(fn=cmd_replay)

    c = sub.add_parser("calibrate", help="four-corner homography + depth baseline")
    c.add_argument("--camera", type=int, default=0)
    c.add_argument("--width", type=int, default=1280)
    c.add_argument("--height", type=int, default=720)
    c.add_argument("--projector-width", type=int, default=1920)
    c.add_argument("--projector-height", type=int, default=1080)
    c.add_argument("--projector-x", type=int, default=0,
                   help="virtual-desktop X offset of the projector display")
    c.add_argument("--projector-y", type=int, default=0)
    c.add_argument("--no-mirror", action="store_true",
                   help="camera feed is not mirrored")
    c.add_argument("--calibration", default=str(DEFAULT_PATH))
    c.set_defaults(fn=cmd_calibrate)

    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
