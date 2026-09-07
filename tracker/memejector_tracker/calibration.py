"""
Camera pixels to projector pixels, and the depth baseline.

The homography solve is pure Python on purpose. Calibration data has to be
loadable and applicable by the replay and synthetic sources, which run with no
OpenCV installed, and a dependency-free version can be unit tested without a
camera in the room.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_PATH = Path(__file__).resolve().parents[1] / "calibration.json"


def solve_homography(src: list[tuple[float, float]],
                     dst: list[tuple[float, float]]) -> list[float]:
    """
    Eight-parameter perspective transform from four point correspondences.

    Builds the 8x8 system and solves it with Gaussian elimination and partial
    pivoting. Returns [h0..h7]; h8 is fixed at 1.
    """
    if len(src) != 4 or len(dst) != 4:
        raise ValueError("need exactly four point pairs")

    a: list[list[float]] = []
    b: list[float] = []
    for (x, y), (u, v) in zip(src, dst):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        b.append(u)
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b.append(v)

    n = 8
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(a[r][col]))
        if abs(a[pivot][col]) < 1e-12:
            raise ValueError("degenerate calibration points — are three of them collinear?")
        a[col], a[pivot] = a[pivot], a[col]
        b[col], b[pivot] = b[pivot], b[col]

        inv = 1.0 / a[col][col]
        for j in range(col, n):
            a[col][j] *= inv
        b[col] *= inv

        for r in range(n):
            if r == col:
                continue
            f = a[r][col]
            if f == 0:
                continue
            for j in range(col, n):
                a[r][j] -= f * a[col][j]
            b[r] -= f * b[col]

    return b


def apply_homography(h: list[float], x: float, y: float) -> tuple[float, float]:
    d = h[6] * x + h[7] * y + 1.0
    if abs(d) < 1e-12:
        return (0.0, 0.0)
    return ((h[0] * x + h[1] * y + h[2]) / d,
            (h[3] * x + h[4] * y + h[5]) / d)


@dataclass
class Calibration:
    """
    matrix maps camera pixels to projector-normalized 0..1.

    mirrored records whether the camera feed was flipped before landmarks were
    read, so MediaPipe's handedness labels can be corrected. It gets shown in the
    wall's HUD because a swapped left and right hand will happen at least once
    and it should be obvious why.

    depth_near / depth_far are the apparent hand span with the hand tucked at the
    body and with the arm fully extended. MediaPipe's own z coordinate is
    relative to the wrist and is not usable for reach, so depth is measured as
    the pixel spread across the palm landmarks against these two numbers. Crude,
    and it works, because all depth has to do is grow a fill ring monotonically
    as the arm reaches out.
    """
    matrix: list[float] = field(default_factory=lambda: [1, 0, 0, 0, 1, 0, 0, 0])
    camera: dict = field(default_factory=lambda: {"w": 1280, "h": 720, "fps": 30})
    projector: dict = field(default_factory=lambda: {"w": 1920, "h": 1080})
    mirrored: bool = True
    depth_near: float = 0.10
    depth_far: float = 0.30
    identity: bool = True

    def to_projector(self, cam_x: float, cam_y: float) -> tuple[float, float]:
        if self.identity:
            # Uncalibrated: fall back to plain normalized camera coordinates so
            # the pipeline still runs and the wall can say so, rather than
            # refusing to start.
            return (cam_x / self.camera["w"], cam_y / self.camera["h"])
        return apply_homography(self.matrix, cam_x, cam_y)

    def to_depth(self, span: float) -> float:
        lo, hi = self.depth_near, self.depth_far
        if hi <= lo:
            return 0.0
        return max(0.0, min(1.0, (span - lo) / (hi - lo)))

    def save(self, path: Path = DEFAULT_PATH) -> None:
        path.write_text(json.dumps({
            "matrix": self.matrix,
            "camera": self.camera,
            "projector": self.projector,
            "mirrored": self.mirrored,
            "depth_near": self.depth_near,
            "depth_far": self.depth_far,
        }, indent=2))

    @classmethod
    def load(cls, path: Path = DEFAULT_PATH) -> "Calibration":
        if not path.exists():
            return cls()
        d = json.loads(path.read_text())
        return cls(
            matrix=d["matrix"],
            camera=d.get("camera", {"w": 1280, "h": 720, "fps": 30}),
            projector=d.get("projector", {"w": 1920, "h": 1080}),
            mirrored=d.get("mirrored", True),
            depth_near=d.get("depth_near", 0.10),
            depth_far=d.get("depth_far", 0.30),
            identity=False,
        )
