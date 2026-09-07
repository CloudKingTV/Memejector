"""
The wire message. One definition, mirrored by docs/protocol.md.

Everything the tracker sends and everything a recording contains goes through
here, so a recording made today still replays against a wall built in six months.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field, asdict
from typing import Optional

PROTOCOL_VERSION = 1


def now_ms() -> float:
    """
    Milliseconds since epoch, the same clock JavaScript's Date.now() reads.

    Both processes are on the same Windows box, so the wall can subtract this
    from its own Date.now() and get a real capture-to-paint latency with no
    clock sync. That measurement is Phase 2's whole pass/fail, so it has to be
    the wall clock and not a monotonic counter.
    """
    return time.time() * 1000.0


@dataclass
class Pinch:
    closed: bool = False
    value: float = 1.0
    since: float = field(default_factory=now_ms)


@dataclass
class Hand:
    id: str                      # "left" | "right", already mirror-corrected
    conf: float
    pos: tuple[float, float]     # projector-normalized 0..1, One Euro filtered
    raw: tuple[float, float]     # same space, unfiltered
    vel: tuple[float, float]     # normalized units per second
    depth: float                 # 0 = tucked at the body, 1 = arm extended
    pinch: Pinch
    landmarks: Optional[list] = None

    def to_json(self) -> dict:
        d = {
            "id": self.id,
            "conf": round(self.conf, 3),
            "pos": [round(self.pos[0], 5), round(self.pos[1], 5)],
            "raw": [round(self.raw[0], 5), round(self.raw[1], 5)],
            "vel": [round(self.vel[0], 4), round(self.vel[1], 4)],
            "depth": round(self.depth, 4),
            "pinch": {
                "closed": self.pinch.closed,
                "value": round(self.pinch.value, 4),
                "since": self.pinch.since,
            },
        }
        if self.landmarks is not None:
            d["landmarks"] = self.landmarks
        return d


def frame(seq: int, hands: list[Hand], t_capture: float,
          fps: float = 0.0, dropped: int = 0) -> dict:
    """
    A frame is sent even when no hands are detected, so the wall can tell
    "the hand left the frame" from "the tracker died".
    """
    return {
        "type": "frame",
        "v": PROTOCOL_VERSION,
        "seq": seq,
        "t_capture": round(t_capture, 2),
        "t_send": round(now_ms(), 2),
        "hands": [h.to_json() for h in hands],
        "meta": {"fps": round(fps, 2), "dropped": dropped},
    }


def hello(source: str, camera: dict, projector: dict, mirrored: bool,
          calibrated: bool, depth_baseline: dict) -> dict:
    return {
        "type": "hello",
        "v": PROTOCOL_VERSION,
        "source": source,
        "camera": camera,
        "projector": projector,
        "mirrored": mirrored,
        "calibrated": calibrated,
        "depth_baseline": depth_baseline,
    }


def status(state: str, detail: str = "") -> dict:
    return {"type": "status", "v": PROTOCOL_VERSION, "state": state, "detail": detail}
