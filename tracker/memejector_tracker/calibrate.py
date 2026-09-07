"""
Four-corner homography calibration, plus the depth baseline.

Projects one dot at a time into each corner of the wall, you click that dot
where you see it in the camera view, and the four correspondences give the
transform from camera pixels to projector-normalized coordinates. Do it once
per camera-and-projector placement; it is stored and reused.

Needs opencv-python. The depth step additionally needs mediapipe, and is
skipped with a warning if it is missing — the homography is the part that
matters and depth has usable defaults.
"""

from __future__ import annotations

from pathlib import Path

from .calibration import Calibration, solve_homography

CORNERS = [
    ("top left",     0.06, 0.06, (0.0, 0.0)),
    ("top right",    0.94, 0.06, (1.0, 0.0)),
    ("bottom right", 0.94, 0.94, (1.0, 1.0)),
    ("bottom left",  0.06, 0.94, (0.0, 1.0)),
]

WALL_WIN = "memejector calibration - wall"
CAM_WIN = "memejector calibration - camera (click the dot)"


def _draw_target(cv2, np, w: int, h: int, fx: float, fy: float, label: str):
    img = np.zeros((h, w, 3), dtype=np.uint8)
    cx, cy = int(fx * w), int(fy * h)
    # Concentric rings, brightest in the middle: easy to find the centre of in a
    # dim camera image, and it survives a badly focused projector.
    for r, c in ((46, 40), (30, 90), (18, 170), (9, 255)):
        cv2.circle(img, (cx, cy), r, (c, c, c), -1, cv2.LINE_AA)
    cv2.circle(img, (cx, cy), 60, (0, 90, 190), 2, cv2.LINE_AA)
    cv2.putText(img, f"{label}  -  click this dot in the camera window",
                (int(w * 0.5) - 320, int(h * 0.5)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (120, 90, 60), 1, cv2.LINE_AA)
    cv2.putText(img, "SPACE skip point   BACKSPACE redo   ESC cancel",
                (int(w * 0.5) - 240, int(h * 0.5) + 34),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (80, 60, 40), 1, cv2.LINE_AA)
    return img


def run_calibration(camera_index: int = 0, width: int = 1280, height: int = 720,
                    projector_w: int = 1920, projector_h: int = 1080,
                    projector_x: int = 0, projector_y: int = 0,
                    mirrored: bool = True,
                    out: Path | None = None) -> int:
    import cv2
    import numpy as np

    from .sources import _open_camera

    try:
        cap = _open_camera(camera_index, width, height, 30)
    except RuntimeError as exc:
        print(f"\n{exc}\n")
        return 1

    cv2.namedWindow(WALL_WIN, cv2.WINDOW_NORMAL)
    cv2.moveWindow(WALL_WIN, projector_x, projector_y)
    cv2.setWindowProperty(WALL_WIN, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
    cv2.namedWindow(CAM_WIN, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(CAM_WIN, 960, 540)

    clicked: list[tuple[float, float]] = []
    pending: list[tuple[float, float]] = []

    def on_click(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            pending.append((float(x), float(y)))

    cv2.setMouseCallback(CAM_WIN, on_click)

    print("\nCalibration")
    print("  A dot appears in each corner of the wall in turn.")
    print("  Click that dot where you see it in the camera window.")
    print("  Stand out of the way; the camera must see the wall, not you.\n")

    src: list[tuple[float, float]] = []
    dst: list[tuple[float, float]] = []
    i = 0
    cancelled = False

    while i < len(CORNERS):
        label, fx, fy, target = CORNERS[i]
        cv2.imshow(WALL_WIN, _draw_target(cv2, np, projector_w, projector_h, fx, fy, label))

        ok, frame = cap.read()
        if ok:
            view = frame.copy()
            if mirrored:
                view = cv2.flip(view, 1)
            for (px, py) in clicked:
                cv2.drawMarker(view, (int(px), int(py)), (60, 200, 255),
                               cv2.MARKER_CROSS, 18, 2)
            cv2.putText(view, f"[{i + 1}/4] click the {label} dot", (16, 34),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (60, 200, 255), 2, cv2.LINE_AA)
            cv2.imshow(CAM_WIN, view)

        key = cv2.waitKey(16) & 0xFF
        if key == 27:
            cancelled = True
            break
        if key == 8 and clicked:          # backspace
            clicked.pop(); src.pop(); dst.pop(); i -= 1
            continue

        if pending:
            px, py = pending.pop()
            # The view was flipped for display, so undo that before storing:
            # landmarks are read from the unflipped frame at runtime.
            cam_x = (width - px) if mirrored else px
            clicked.append((px, py))
            src.append((cam_x, float(py)))
            dst.append(target)
            print(f"  {label}: camera ({cam_x:.0f}, {py:.0f})")
            i += 1

    cv2.destroyWindow(WALL_WIN)
    cv2.destroyWindow(CAM_WIN)

    if cancelled or len(src) != 4:
        cap.release()
        print("\ncancelled — nothing saved.\n")
        return 1

    try:
        matrix = solve_homography(src, dst)
    except ValueError as exc:
        cap.release()
        print(f"\n{exc}\nThe four clicks need to form a proper quadrilateral. "
              f"Run it again and click the centre of each dot.\n")
        return 1

    cal = Calibration(
        matrix=matrix,
        camera={"w": width, "h": height, "fps": 30},
        projector={"w": projector_w, "h": projector_h},
        mirrored=mirrored,
        identity=False,
    )

    # Sanity check: the four corners must come back where they went in.
    worst = 0.0
    for (sx, sy), (dx, dy) in zip(src, dst):
        ux, uy = cal.to_projector(sx, sy)
        worst = max(worst, abs(ux - dx), abs(uy - dy))
    print(f"\nhomography solved, corner error {worst * 100:.4f}% of wall")

    near, far = _depth_baseline(cv2, cap, width, mirrored)
    if near is not None:
        cal.depth_near, cal.depth_far = near, far

    cap.release()
    cv2.destroyAllWindows()

    path = out or Path(__file__).resolve().parents[1] / "calibration.json"
    cal.save(path)
    print(f"saved {path}\n")
    return 0


def _depth_baseline(cv2, cap, width: int, mirrored: bool):
    """
    Apparent hand span with the hand tucked at the body, and with the arm fully
    extended. MediaPipe's z is relative to the wrist and useless for reach, so
    depth is read off how big the hand looks. Crude, and enough — all depth has
    to do is grow a fill ring monotonically as you reach out.
    """
    try:
        import math

        import mediapipe as mp
    except ImportError:
        print("mediapipe not installed — keeping default depth baseline. "
              "Depth-as-size will be roughly calibrated at best.")
        return None, None

    hands = mp.solutions.hands.Hands(max_num_hands=1, model_complexity=0,
                                     min_detection_confidence=0.6)
    win = "memejector calibration - depth"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.resizeWindow(win, 960, 540)

    results = {}
    for stage, prompt in (("near", "hand TUCKED at your chest"),
                          ("far", "arm FULLY EXTENDED toward the wall")):
        print(f"  {prompt} — hold still and press SPACE (S to skip)")
        samples: list[float] = []
        while True:
            ok, frame = cap.read()
            if not ok:
                continue
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = hands.process(rgb)
            span = None
            if res.multi_hand_landmarks:
                lm = res.multi_hand_landmarks[0].landmark
                h_px, w_px = frame.shape[:2]
                a = (lm[5].x * w_px, lm[5].y * h_px)
                b = (lm[17].x * w_px, lm[17].y * h_px)
                span = math.dist(a, b) / width

            view = cv2.flip(frame, 1) if mirrored else frame.copy()
            cv2.putText(view, prompt, (16, 34), cv2.FONT_HERSHEY_SIMPLEX,
                        0.8, (60, 200, 255), 2, cv2.LINE_AA)
            cv2.putText(view, f"span {span:.4f}" if span else "no hand detected",
                        (16, 68), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (60, 200, 255) if span else (60, 60, 200), 2, cv2.LINE_AA)
            cv2.imshow(win, view)

            key = cv2.waitKey(16) & 0xFF
            if span is not None:
                samples.append(span)
                samples = samples[-12:]          # rolling window
            if key == ord(" "):
                if len(samples) >= 6:
                    results[stage] = sum(samples) / len(samples)
                    break
                print("    hold the pose until a span is showing, then press SPACE")
            elif key in (ord("s"), 27):
                break

    hands.close()
    cv2.destroyWindow(win)

    near, far = results.get("near"), results.get("far")
    if near is None or far is None:
        print("  depth baseline skipped — keeping defaults.")
        return None, None
    if far <= near:
        print(f"  depth baseline looks wrong (near {near:.4f} >= far {far:.4f}); "
              f"keeping defaults. Extended should look BIGGER than tucked.")
        return None, None
    print(f"  depth baseline: near {near:.4f}, far {far:.4f}")
    return near, far
