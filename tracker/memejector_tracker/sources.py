"""
Frame sources. Three of them, and the wall cannot tell them apart.

  camera     ZV-1 over USB, MediaPipe Hands, the real thing
  replay     a recorded .jsonl, played back at its original timing
  synthetic  a procedural hand, no camera and no MediaPipe required

The synthetic source is not a toy. It means the whole pipeline — server, socket,
wall, cursor, latency HUD — can be brought up and verified before anyone fights
with a camera driver, and it means the wall can be developed with nothing
installed but `websockets`. When the dot moves under synthetic and not under
camera, the problem is the camera; that is worth a lot at 11pm.

cv2 and mediapipe are imported inside the camera source only, so the other two
run without them.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Iterator

from .calibration import Calibration
from .filters import OneEuro2D
from .pinch import PinchDetector
from .schema import Hand, Pinch, now_ms


class SyntheticSource:
    """
    A right hand tracing a slow ellipse around the wall, pinching periodically,
    and reaching in and out. Deterministic: the same wall-clock second always
    produces the same pose, so two runs are comparable.
    """

    name = "synthetic"

    def __init__(self, fps: float = 60.0, hands: int = 1) -> None:
        self.fps = fps
        self.hand_count = hands
        self.calibration = Calibration()
        self._t0 = time.perf_counter()
        self._seq = 0

    def hello_fields(self) -> dict:
        return {
            "camera": {"w": 1280, "h": 720, "fps": self.fps},
            "projector": self.calibration.projector,
            "mirrored": False,
            "calibrated": False,
            "depth_baseline": {"near": self.calibration.depth_near,
                               "far": self.calibration.depth_far},
        }

    def _pose(self, t: float, phase: float) -> tuple[float, float, float, float]:
        x = 0.5 + 0.34 * math.cos(t * 0.55 + phase)
        y = 0.5 + 0.26 * math.sin(t * 0.78 + phase)
        depth = 0.5 + 0.45 * math.sin(t * 0.4 + phase)
        # A clean square wave: pinched for ~2s out of every 5.
        pinch_val = 0.18 if (t + phase) % 5.0 < 2.0 else 0.72
        return x, y, depth, pinch_val

    def frames(self) -> Iterator[tuple[list[Hand], float]]:
        period = 1.0 / self.fps
        next_at = time.perf_counter()
        filters = [OneEuro2D() for _ in range(self.hand_count)]
        pinches = [PinchDetector() for _ in range(self.hand_count)]
        while True:
            now = time.perf_counter()
            if now < next_at:
                time.sleep(min(period, next_at - now))
            next_at += period
            if next_at < time.perf_counter() - period * 5:
                next_at = time.perf_counter()

            t = time.perf_counter() - self._t0
            t_capture = now_ms()
            hands: list[Hand] = []
            for i in range(self.hand_count):
                phase = i * 2.1
                rx, ry, depth, pv = self._pose(t, phase)
                fx, fy = filters[i].apply(rx, ry, t)
                hands.append(Hand(
                    id="right" if i == 0 else "left",
                    conf=0.99,
                    pos=(fx, fy), raw=(rx, ry),
                    vel=filters[i].velocity,
                    depth=depth,
                    pinch=pinches[i].update(pv, t_capture),
                ))
            self._seq += 1
            yield hands, t_capture

    def close(self) -> None:
        pass


class ReplaySource:
    """
    Plays a recording back at its original timing. The recording is the wire
    format, so this is just "read a line, wait the right amount, hand it over".
    """

    name = "replay"

    def __init__(self, path: Path, loop: bool = True, speed: float = 1.0) -> None:
        self.path = Path(path)
        self.loop = loop
        self.speed = max(0.05, speed)
        self._hello: dict | None = None
        if not self.path.exists():
            raise FileNotFoundError(f"no recording at {self.path}")

    def _lines(self) -> Iterator[dict]:
        with self.path.open() as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                try:
                    yield json.loads(line)
                except json.JSONDecodeError:
                    continue

    def hello_fields(self) -> dict:
        if self._hello is None:
            for msg in self._lines():
                if msg.get("type") == "hello":
                    self._hello = msg
                    break
            else:
                self._hello = {}
        h = self._hello
        return {
            "camera": h.get("camera", {"w": 1280, "h": 720, "fps": 30}),
            "projector": h.get("projector", {"w": 1920, "h": 1080}),
            "mirrored": h.get("mirrored", False),
            "calibrated": h.get("calibrated", False),
            "depth_baseline": h.get("depth_baseline", {"near": 0.1, "far": 0.3}),
        }

    def frames(self) -> Iterator[tuple[list[Hand], float]]:
        while True:
            first_t: float | None = None
            started = time.perf_counter()
            for msg in self._lines():
                if msg.get("type") != "frame":
                    continue
                t_cap = msg.get("t_capture", 0.0)
                if first_t is None:
                    first_t = t_cap
                # Reproduce the original inter-frame timing, so latency and
                # jitter look the same on replay as they did live.
                target = (t_cap - first_t) / 1000.0 / self.speed
                wait = target - (time.perf_counter() - started)
                if wait > 0:
                    time.sleep(min(wait, 1.0))
                hands = [
                    Hand(id=h["id"], conf=h.get("conf", 1.0),
                         pos=tuple(h["pos"]), raw=tuple(h.get("raw", h["pos"])),
                         vel=tuple(h.get("vel", (0.0, 0.0))),
                         depth=h.get("depth", 0.0),
                         pinch=Pinch(**h["pinch"]) if "pinch" in h else Pinch())
                    for h in msg.get("hands", [])
                ]
                # Restamp to now: the wall measures latency against its own
                # clock, and a recording from last Tuesday would read as a
                # four-day delay.
                yield hands, now_ms()
            if not self.loop:
                return

    def close(self) -> None:
        pass


class CameraSource:
    """
    The real one. ZV-1 over USB in Imaging Edge Webcam mode, MediaPipe Hands,
    landmarks through the homography into projector-normalized coordinates.
    """

    name = "camera"

    def __init__(self, calibration: Calibration, index: int = 0,
                 width: int = 1280, height: int = 720, fps: int = 60,
                 min_cutoff: float = 0.8, beta: float = 2.5,
                 close_at: float = 0.32, open_at: float = 0.45,
                 landmarks: bool = False, max_hands: int = 2) -> None:
        import cv2  # noqa: F401  (imported here so the other sources need no cv2)

        self.calibration = calibration
        self.landmarks = landmarks
        self.cap = _open_camera(index, width, height, fps)
        self._cv2 = cv2

        import mediapipe as mp
        self._mp = mp
        self.hands = mp.solutions.hands.Hands(
            static_image_mode=False,
            max_num_hands=max_hands,
            model_complexity=0,          # 0 is roughly twice as fast as 1 and
                                         # plenty for palm position and pinch
            min_detection_confidence=0.6,
            min_tracking_confidence=0.5,
        )
        self._filters: dict[str, OneEuro2D] = {}
        self._pinches: dict[str, PinchDetector] = {}
        self._filter_kw = {"min_cutoff": min_cutoff, "beta": beta}
        self._pinch_kw = {"close_at": close_at, "open_at": open_at}
        self.dropped = 0

    def hello_fields(self) -> dict:
        c = self.calibration
        return {
            "camera": c.camera,
            "projector": c.projector,
            "mirrored": c.mirrored,
            "calibrated": not c.identity,
            "depth_baseline": {"near": c.depth_near, "far": c.depth_far},
        }

    def _for(self, key: str) -> tuple[OneEuro2D, PinchDetector]:
        if key not in self._filters:
            self._filters[key] = OneEuro2D(**self._filter_kw)
            self._pinches[key] = PinchDetector(**self._pinch_kw)
        return self._filters[key], self._pinches[key]

    def frames(self) -> Iterator[tuple[list[Hand], float]]:
        cv2 = self._cv2
        t0 = time.perf_counter()
        while True:
            ok, frame_bgr = self.cap.read()
            t_capture = now_ms()
            if not ok:
                self.dropped += 1
                time.sleep(0.01)
                yield [], t_capture
                continue

            h_px, w_px = frame_bgr.shape[:2]
            rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            result = self.hands.process(rgb)

            out: list[Hand] = []
            if result.multi_hand_landmarks:
                handedness = result.multi_handedness or []
                for i, lm in enumerate(result.multi_hand_landmarks):
                    label = "right"
                    conf = 1.0
                    if i < len(handedness):
                        cls = handedness[i].classification[0]
                        label = cls.label.lower()
                        conf = float(cls.score)
                    # MediaPipe labels handedness as if looking at a mirror. The
                    # camera faces the operator, so the label is correct only
                    # when the feed is NOT mirrored; flip it when it is.
                    if self.calibration.mirrored:
                        label = "left" if label == "right" else "right"

                    pts = [(p.x * w_px, p.y * h_px) for p in lm.landmark]
                    out.append(self._to_hand(label, conf, pts, t_capture,
                                             time.perf_counter() - t0, lm))
            yield out, t_capture

    def _to_hand(self, label, conf, pts, t_capture, t_sec, lm) -> Hand:
        WRIST, THUMB_TIP, INDEX_TIP = 0, 4, 8
        INDEX_MCP, PINKY_MCP = 5, 17

        # Hand span across the knuckles: the reference length for both pinch and
        # depth. Using the wrist-to-fingertip distance instead would change with
        # finger curl, which is exactly what pinch is trying to measure.
        span = math.dist(pts[INDEX_MCP], pts[PINKY_MCP])
        span = max(span, 1e-3)

        palm_x = (pts[WRIST][0] + pts[INDEX_MCP][0] + pts[PINKY_MCP][0]) / 3
        palm_y = (pts[WRIST][1] + pts[INDEX_MCP][1] + pts[PINKY_MCP][1]) / 3
        rx, ry = self.calibration.to_projector(palm_x, palm_y)

        filt, pinch = self._for(label)
        fx, fy = filt.apply(rx, ry, t_sec)

        pinch_raw = math.dist(pts[THUMB_TIP], pts[INDEX_TIP]) / span
        depth = self.calibration.to_depth(span / self.calibration.camera["w"])

        return Hand(
            id=label, conf=conf,
            pos=(fx, fy), raw=(rx, ry), vel=filt.velocity, depth=depth,
            pinch=pinch.update(pinch_raw, t_capture),
            landmarks=[[round(p.x, 4), round(p.y, 4), round(p.z, 4)]
                       for p in lm.landmark] if self.landmarks else None,
        )

    def close(self) -> None:
        try:
            self.cap.release()
        except Exception:
            pass
        try:
            self.hands.close()
        except Exception:
            pass


def _open_camera(index: int, width: int, height: int, fps: int):
    """
    On Windows the ZV-1 in Imaging Edge Webcam mode wants the DirectShow
    backend. The default MSMF backend is where the "it opens but every frame is
    green" and "it opens but read() returns False" reports come from, so try
    DSHOW first and fall back only if it is unavailable.
    """
    import cv2

    backends = []
    if hasattr(cv2, "CAP_DSHOW"):
        backends.append(("DSHOW", cv2.CAP_DSHOW))
    backends.append(("default", 0))

    errors = []
    for name, flag in backends:
        cap = cv2.VideoCapture(index, flag) if flag else cv2.VideoCapture(index)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
            cap.set(cv2.CAP_PROP_FPS, fps)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # latency, not smoothness
            ok, _ = cap.read()
            if ok:
                print(f"camera {index} open via {name} at "
                      f"{int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x"
                      f"{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
                return cap
            errors.append(f"{name}: opened but returned no frames")
            cap.release()
        else:
            errors.append(f"{name}: would not open")
    raise RuntimeError(
        f"could not open camera index {index}. Tried: {'; '.join(errors)}. "
        "Check that Sony Imaging Edge Webcam is running and that nothing else "
        "(OBS, Teams, Zoom) already holds the camera."
    )
