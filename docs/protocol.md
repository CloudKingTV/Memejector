# Hand frame protocol v1

The contract between `tracker/` and `wall/`. Defined before either exists so both can be
built against it independently, and so a recording made today still replays in six months.

Transport: WebSocket, `ws://127.0.0.1:8787`, one JSON object per message, UTF-8.
Recording: the same objects, one per line, in `recordings/<timestamp>.jsonl`.

## Message types

### `hello` — once, on connect

```json
{
  "type": "hello",
  "v": 1,
  "source": "live" | "replay" | "shim",
  "camera": { "w": 1280, "h": 720, "fps": 60 },
  "projector": { "w": 1920, "h": 1080 },
  "mirrored": true,
  "calibrated": true,
  "depth_baseline": { "near": 0.34, "far": 0.71 }
}
```

`mirrored` tells the wall whether MediaPipe's handedness labels were flipped before
sending. The tracker corrects them; the field is informational and shows up in the HUD,
because a swapped left/right hand is going to happen at least once and it should be
obvious why.

### `frame` — continuous, at camera rate

```json
{
  "type": "frame",
  "v": 1,
  "seq": 84213,
  "t_capture": 1725570000123.4,
  "t_send": 1725570000141.9,
  "hands": [
    {
      "id": "right",
      "conf": 0.93,
      "pos": [0.412, 0.688],
      "raw": [0.409, 0.691],
      "vel": [-0.02, 0.41],
      "depth": 0.62,
      "pinch": { "closed": true, "value": 0.081, "since": 1725570000012.0 }
    }
  ],
  "meta": { "fps": 58.4, "dropped": 0 }
}
```

| field | meaning |
|---|---|
| `seq` | monotonic frame counter; gaps mean dropped frames |
| `t_capture` | ms since epoch when the frame left the camera, same clock as `Date.now()` |
| `t_send` | ms since epoch at socket write; `t_send - t_capture` is the tracker's own cost |
| `id` | `"left"` or `"right"`, already mirror-corrected |
| `pos` | projector-normalized, 0..1, origin top-left of the projected rect, One Euro filtered |
| `raw` | same space, unfiltered, for measuring jitter and for velocity honesty |
| `vel` | normalized units per second, computed in the tracker from the high-rate stream |
| `depth` | 0 = hand tucked at the body, 1 = arm fully extended, from the calibration baseline |
| `pinch.value` | thumb-tip to index-tip distance, normalized by hand span so it survives depth changes |
| `pinch.closed` | debounced boolean, hysteresis applied in the tracker |
| `pinch.since` | when `closed` last changed; the wall needs dwell time, not just state |

`hands` is empty when nothing is detected. It is never `null`, and a frame with no hands
is still sent, so the wall can distinguish "hand is gone" from "tracker died".

Landmarks are omitted by default. A `landmarks` array of 21 `[x, y, z]` triples can be
enabled by tracker config for debugging, and roughly triples message size.

### `status` — on change

```json
{ "type": "status", "v": 1, "state": "ok" | "no_camera" | "uncalibrated" | "paused",
  "detail": "camera index 0 returned no frames" }
```

## Design notes

**Depth is apparent hand span, not MediaPipe z.** The z coordinate MediaPipe returns is
relative to the wrist and is not usable for how far the arm is extended. Instead the
tracker measures the pixel distance across the palm landmarks and maps it against the
near/far baseline captured during calibration. It is crude and it works, because the only
thing depth has to do is grow a fill ring monotonically as the arm reaches out.

**Pinch is normalized by hand span** for the same reason: a raw thumb-index distance in
pixels shrinks as the arm extends, so an un-normalized threshold would make pinch
progressively harder to trigger the further you reach — which is the exact direction the
brief wants to use for sizing a position.

**Hysteresis, always.** Pinch closes below one threshold and opens above a higher one.
The gap between them is the difference between a grab gesture and a coin flip.

**The tracker never sends gestures.** No `"grab"`, no `"throw"`. Those are wall-side
interpretations of position, velocity, pinch state and what happens to be under the hand.
Keeping that boundary means gesture tuning is a browser refresh, not a Python restart, and
the same recording can be replayed against three different gesture models.

## Versioning

`v` is bumped on any breaking change to `frame`. The wall refuses to interpret a version
it doesn't know and says so on screen rather than guessing. Recordings carry the version
they were made with in their `hello` line.
