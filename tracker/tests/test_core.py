"""
Everything here runs with no camera, no MediaPipe and no OpenCV. It covers the
parts that are easy to get subtly wrong and impossible to debug while standing
in front of a projector.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from memejector_tracker.calibration import (
    Calibration, apply_homography, solve_homography)
from memejector_tracker.filters import OneEuro, OneEuro2D
from memejector_tracker.pinch import PinchDetector


def approx(a, b, tol=1e-6):
    return abs(a - b) < tol


def test_homography_recovers_corners():
    """Four camera corners onto the unit square, exactly."""
    src = [(100, 80), (1180, 60), (1210, 690), (70, 700)]
    dst = [(0, 0), (1, 0), (1, 1), (0, 1)]
    h = solve_homography(src, dst)
    for (sx, sy), (dx, dy) in zip(src, dst):
        ux, uy = apply_homography(h, sx, sy)
        assert approx(ux, dx, 1e-9) and approx(uy, dy, 1e-9), (ux, uy, dx, dy)
    print("  homography: 4 corners exact")


def test_homography_is_perspective_not_affine():
    """
    A real projector view is a trapezoid. The centre of the camera quad must NOT
    map to (0.5, 0.5) — if it does, the solve collapsed to an affine fit and
    keystone is being ignored.
    """
    src = [(200, 100), (1000, 140), (1150, 640), (120, 600)]
    dst = [(0, 0), (1, 0), (1, 1), (0, 1)]
    h = solve_homography(src, dst)
    cx = sum(p[0] for p in src) / 4
    cy = sum(p[1] for p in src) / 4
    ux, uy = apply_homography(h, cx, cy)
    assert 0 < ux < 1 and 0 < uy < 1
    assert not (approx(ux, 0.5, 1e-3) and approx(uy, 0.5, 1e-3))
    print(f"  homography: perspective preserved (centre -> {ux:.4f}, {uy:.4f})")


def test_homography_rejects_collinear():
    try:
        solve_homography([(0, 0), (1, 1), (2, 2), (3, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)])
    except ValueError:
        print("  homography: rejects collinear points")
        return
    raise AssertionError("collinear points should not solve")


def test_one_euro_kills_jitter_at_rest():
    """A still hand with sensor noise must come out quieter than it went in."""
    f = OneEuro()   # shipped defaults
    noise = [0.5 + (0.004 if i % 2 else -0.004) for i in range(120)]
    out = [f.apply(v, i / 60.0) for i, v in enumerate(noise)]
    tail_in = noise[60:]
    tail_out = out[60:]
    spread_in = max(tail_in) - min(tail_in)
    spread_out = max(tail_out) - min(tail_out)
    assert spread_out < spread_in * 0.35, (spread_in, spread_out)
    print(f"  one euro: jitter {spread_in:.5f} -> {spread_out:.5f} at rest")


def test_one_euro_keeps_up_when_moving():
    """A fast sweep must not lag more than a few frames behind."""
    f = OneEuro()   # shipped defaults
    out = None
    for i in range(120):
        t = i / 60.0
        out = f.apply(t * 1.0, t)          # 1.0 units/sec ramp
    truth = 119 / 60.0
    lag_frames = (truth - out) * 60.0
    # 4 frames at 60 fps is 67 ms of filter lag. Above that the dot stops
    # feeling attached to the fingertip, and the filter alone would eat most of
    # the end-to-end budget before the camera and MediaPipe have spent theirs.
    assert lag_frames < 4.0, f"{lag_frames:.2f} frames of filter lag"
    print(f"  one euro: {lag_frames:.2f} frames of lag at 1.0 units/sec")


def test_pinch_hysteresis_does_not_chatter():
    """
    Hover the signal exactly on the close threshold with noise. A single-threshold
    detector flips constantly here; a hysteretic one must settle.
    """
    d = PinchDetector(close_at=0.32, open_at=0.45)
    flips = 0
    prev = d.closed
    t = 0.0
    for i in range(400):
        t += 16.0
        v = 0.32 + (0.01 if i % 2 else -0.01)
        s = d.update(v, t)
        if s.closed != prev:
            flips += 1
            prev = s.closed
    assert flips <= 1, f"{flips} state changes while hovering on the threshold"
    print(f"  pinch: {flips} flip(s) across 400 frames on the threshold")


def test_pinch_actually_triggers_and_releases():
    d = PinchDetector(close_at=0.32, open_at=0.45)
    t = 0.0
    for _ in range(10):
        t += 16.0
        d.update(0.20, t)
    assert d.closed, "a clear pinch must close"
    closed_at = d.since
    for _ in range(10):
        t += 16.0
        s = d.update(0.60, t)
    assert not s.closed, "a clear release must open"
    assert s.since > closed_at, "since must move when the state changes"
    print("  pinch: closes, opens, and timestamps the change")


def test_pinch_survives_one_bad_frame():
    """One frame of landmark garbage must not fire a gesture."""
    d = PinchDetector(close_at=0.32, open_at=0.45, debounce_ms=40)
    t = 0.0
    for _ in range(10):
        t += 16.0
        d.update(0.70, t)
    t += 16.0
    d.update(0.05, t)                       # single bogus frame
    assert not d.closed, "a one-frame spike closed the pinch"
    print("  pinch: ignores a single bad frame")


def test_pinch_rejects_bad_thresholds():
    try:
        PinchDetector(close_at=0.5, open_at=0.4)
    except ValueError:
        print("  pinch: refuses thresholds with no hysteresis")
        return
    raise AssertionError("open_at below close_at should be rejected")


def test_depth_baseline_is_monotonic():
    c = Calibration(depth_near=0.10, depth_far=0.30)
    vals = [c.to_depth(s / 100) for s in range(5, 40)]
    assert all(b >= a for a, b in zip(vals, vals[1:])), "depth must never go backwards"
    assert c.to_depth(0.05) == 0.0 and c.to_depth(0.40) == 1.0, "depth must clamp"
    assert approx(c.to_depth(0.20), 0.5), c.to_depth(0.20)
    print("  depth: monotonic, clamped, mid-point correct")


def test_uncalibrated_still_produces_usable_coordinates():
    c = Calibration()
    x, y = c.to_projector(640, 360)
    assert approx(x, 0.5) and approx(y, 0.5)
    print("  calibration: uncalibrated falls back to normalized camera space")


def test_calibration_roundtrip(tmp=Path("/tmp/memejector-cal-test.json")):
    src = [(100, 80), (1180, 60), (1210, 690), (70, 700)]
    c = Calibration(matrix=solve_homography(src, [(0, 0), (1, 0), (1, 1), (0, 1)]),
                    mirrored=False, depth_near=0.12, depth_far=0.33, identity=False)
    c.save(tmp)
    back = Calibration.load(tmp)
    assert back.mirrored is False and approx(back.depth_near, 0.12)
    ax, ay = c.to_projector(640, 360)
    bx, by = back.to_projector(640, 360)
    assert approx(ax, bx) and approx(ay, by)
    tmp.unlink()
    print("  calibration: survives a save/load round trip")


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    print(f"running {len(fns)} tests\n")
    for fn in fns:
        fn()
    print(f"\nall {len(fns)} passed")
