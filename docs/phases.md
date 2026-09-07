# Build order

One phase at a time. Each one has to look or feel right on the wall, in a dark room,
before the next starts.

---

## Phase 1 — the flow, no gestures

Tokens entering, drifting, dying, rugging, ash piling, flow parting around the silhouette
ellipse. Keyboard only. This is the foundation everything else is built on top of, so it
gets built properly rather than as a prototype.

### Files created in Phase 1

```
wall/
  index.html
  main.js                     loop, wiring, feel.json fetch
  config/
    feel.json                 every tunable, hot-reloadable
    layout.js                 named zones in 0..1 space, full horseshoe
  sim/
    rng.js                    seeded PRNG
    motion.js                 springs, damping, overshoot
    field.js                  silhouette repulsion + drift + curl noise
    heat.js                   heat scalar -> color, radius, glow
    token.js                  lifecycle state machine
    ledger.js                 ash heightfield + permanent scars, persisted
    world.js                  entity store, fixed-step loop
  render/
    canvas.js                 layers, DPR, resize
    sprites.js                pre-rendered gradient sprites
    spill.js                  quarter-res bloom pass
    layers/
      atmosphere.js
      flow.js
      ash.js
      chrome.js               peripheral numbers, mode badge, help
  ui/
    holdRing.js               press-and-hold fill ring
  data/
    feed.js                   feed interface
    mock.js                   seeded synthetic mints, real field shape
  input/
    keys.js
  safety/
    mode.js                   PAPER
scripts/
  wall.ps1                    static server + Chrome kiosk on the projector display
```

24 files. If any of them turns out to be twenty lines existing only for symmetry, it gets
folded into its neighbour rather than kept for tidiness.

Nothing under `tracker/` is written in Phase 1.

### Keyboard map

| key | action |
|---|---|
| `Space` | pause / resume the simulation |
| `Up` / `Down` | flow rate |
| `R` | rug a random visible token |
| `Shift+R` | rug the hottest token |
| `S` | toggle the silhouette zone outline |
| `,` / `.` | nudge the silhouette left / right |
| `;` / `'` | narrow / widen the silhouette |
| `F` | fullscreen |
| `T` | re-fetch `feel.json` |
| `C` | clear ash and scars — **hold to confirm**, the only destructive action in Phase 1 |
| `[` / `]` | previous / next seed |
| `K` | kill switch (visible freeze state; nothing to freeze yet) |
| `D` | debug HUD: fps, entity count, sim ms, render ms |
| `?` | key overlay |

### What to film

Dark room, projector on, stand in front of it the way you would on stream. Phone on the
camera stand or handheld from where the audience camera sits. Four clips:

1. **60 seconds of idle flow**, you standing in the middle, not touching anything. This is
   the one that matters most.
2. **A forced rug** (`Shift+R`) with the wall reasonably full.
3. **Flow rate from lowest to highest** over about 20 seconds.
4. **Three minutes compressed** — start clean, let ash and scars build, film the last ten
   seconds of it.

### Numbers to expect

Measured headless at 1920×1080, seed 20260905:

| | at ×1 flow | at ×3 flow |
|---|---|---|
| live tokens | ~32 | ~85 |
| token fate | 57% cool and fall into the pile, 31% survive across to the right edge, ~2% rug | same |
| ash after 2 min | ~0.03 of wall height | ~0.19 |

If those are wildly different on your machine, something is wrong. If they match and it
still looks wrong, that is a `feel.json` problem, not a code problem.

### What to judge

- Does the flow part around you, or do tokens land on your chest? Stand where you normally
  stand, press `S` to show the ellipse, and fit it to your actual shadow with `,` `.` `;` `'`.
  It persists, so this is a one-time calibration. Then press `S` again and check it still
  parts correctly when you move a step either way.
- Cut clip 1 to three seconds, mute it, and ask whether it reads as something you'd stop
  scrolling for. That is the actual bar.
- Does anything decelerate in a way that reads as software? Snapping, linear fades,
  anything arriving exactly on target with no overshoot.
- Does the glow land on your arms as real light, or is the bloom only visible on the wall?
- Is heat legible without knowing the code? Point at the screen and say which tokens are
  new and which are dying, then check.
- Clip 4: is the wall visibly messier at the end than the start? If it isn't, the ash and
  scars are too polite.
- Anything readable that shouldn't be, or unreadable that should be, from where you stand.
- Press `D` and check `bloom`. That pass is the whole render cost — everything else is
  1-2 ms. If it is above ~8 ms on your GPU, drop `bloom.scale` to 0.2 or `bloom.blurPx` to
  5 in `feel.json` and press `T`. (It measures 25-40 ms in headless software rendering,
  which is not representative — your projector display is running a real GPU.)

---

## Phase 2 — pinch cursor over a plain page

Tracker, calibration, WebSocket, driving a dot on a plain page. No trading UI
touches this. The only questions are: does the dot land where you point, does it
stay still when your hand does, does pinch fire when you mean it to, and how long
does the whole path take.

### Files added in Phase 2

```
tracker/
  requirements.txt
  tracker.json                tuning: One Euro constants, pinch thresholds
  memejector_tracker/
    __main__.py               CLI: run / replay / calibrate
    schema.py                 the wire message, mirrors docs/protocol.md
    filters.py                One Euro
    pinch.py                  hysteresis + debounce
    calibration.py            homography solve/apply, depth baseline, save/load
    sources.py                camera | replay | synthetic
    server.py                 WebSocket broadcast, records as a side effect
    calibrate.py              the four-corner tool
  tests/test_core.py          runs with no camera and no MediaPipe
wall/
  input/hands.js              WS client + mouse shim, same messages either way
  dev/cursor.html             the Phase 2 diagnostic
recordings/sample.jsonl       8s of synthetic hand, for replay with nothing installed
scripts/
  tracker.ps1
  calibrate.ps1
```

### Install

```powershell
python -m pip install -r tracker\requirements.txt
```

`opencv-python` and `mediapipe` are only needed by the camera source. The
synthetic and replay sources need nothing but `websockets`.

### Bring it up in this order

Do not start with the camera. Each step rules out a layer, so when something
breaks you know which one.

**1. Synthetic — no camera, no MediaPipe.** Two terminals:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Source synthetic
powershell -ExecutionPolicy Bypass -File scripts\wall.ps1 -Page cursor
```

Two dots trace ellipses and pinch on a cycle. If this works, the socket, the
protocol, the page and the projector are all fine, and anything that breaks
later is the camera or MediaPipe.

**2. Replay.** Same thing from the recorded file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Replay recordings\sample.jsonl
```

**3. Calibrate.** Projector on, camera mounted above it, you out of the way:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\calibrate.ps1
```

A dot appears in each corner of the wall in turn; click it where you see it in
the camera window. Then the depth baseline: hand tucked at your chest, SPACE;
arm fully extended at the wall, SPACE. Writes `tracker/calibration.json`.

**4. Camera.**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\tracker.ps1 -Record
```

Start Sony Imaging Edge Webcam first, and close anything else holding the camera
(OBS, Teams, Zoom) — the ZV-1 will only give it to one program at a time.
`-Record` writes `recordings/<timestamp>-camera.jsonl`, which you can replay
later to work on the wall without standing up.

### What to film

1. **Slow horizontal sweeps** at chest height, edge to edge, three times.
2. **Fast flicks** — the motion a throw will be made of.
3. **Hand held still for ten seconds**, arm out, not moving. Watch the jitter
   number settle.
4. **Pinch open and closed twenty times**, at a normal speed and then quickly.
5. **Arm extending and retracting** — watch the depth ring grow and shrink.
6. **Walking out of frame and back**, twice.
7. **Killing the tracker terminal and restarting it** while the page stays open.

### What to judge

Pass/fail is a number and it is on the screen:

- **Latency under ~80 ms median.** Above ~120 ms it will feel like dragging
  something through mud. The HUD splits out the tracker's own share
  (capture to socket), so you can tell a slow camera from a slow filter.
- **Jitter under ~3 px with the hand still.** The readout only appears when you
  actually hold still; a sweep is not jitter.
- **No pinch chatter.** Twenty deliberate pinches should be twenty state changes,
  not thirty.
- **The dot lands on all five rings.** Point at each corner and the centre. Right
  in the middle but wrong at the corners means the calibration collapsed to an
  affine fit and keystone is being ignored — recalibrate and click the dot
  centres more carefully.
- **The hollow ring is the unfiltered position.** The gap between it and the
  solid dot is the filter doing its job. A large constant gap while moving is
  lag; a ring vibrating around a still dot is jitter being removed.
- **Recovery.** Hand out of frame and back should re-acquire cleanly. Killing
  the tracker should show `disconnected`, and restarting it should reconnect on
  its own with no reload.

If latency is high, drop the camera resolution first — it is almost always the
biggest single cost. If jitter is high, lower `filter.min_cutoff` in
`tracker/tracker.json`. If the dot lags a fast sweep, raise `filter.beta`. Both
take a tracker restart, not a code change.

### Numbers measured so far

Transport only, synthetic source, no camera in the path:

| | |
|---|---|
| frame rate | 60.2 fps, zero dropped frames |
| capture to browser | 0.7 ms median, 1.1 ms p95 |
| One Euro filter lag | 2.9 frames (48 ms) on a 1.0 unit/sec sweep |
| One Euro jitter kept | ~9% of a still hand's frame-to-frame movement |

That is the floor. The ZV-1 and MediaPipe will add the real cost, and measuring
that is what Phase 2 is for.

## Phase 3 — one gesture end to end

Grab a token out of the flow, push forward to size, hold to fill. Mock data, paper trades.
The buy shockwave. If this feels good, everything else follows.

---

## Phase 4 — second hand, pair comparison, spatial persistence

Left hand as context lock, right hand acting. The between-the-hands comparison. Bags,
watchlist and launch stream in fixed physical positions.

---

## Phase 5 — real feeds

Helius or the validator for new mints, Birdeye/Dexscreener for pair data, Jupiter for
quotes. Behind the Phase 1 feed interface.

Needs API keys, so it gets discussed before it gets built.

---

## Phase 6 — live execution

Delegated key, hard per-session spend cap, kill switch wired to real order cancellation,
live mode behind an explicit flag. Paper stays the default forever.
