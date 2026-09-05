# Wall Terminal — Brief

The north star. Every design argument gets settled against this document.

## The goal

A body-scale trading interface projected on my wall that I control with arm and hand
gestures while streaming. The camera faces me, the projector is behind me, so the
audience sees me silhouetted against the interface. It has to look like nothing else
and be shareable as a muted 3-second clip.

This is not a port of GMGN or Dexscreener. Those are table-shaped and built for desktop
and phone. **If a design decision would work fine on a monitor, it's the wrong decision.**

## Hardware on hand

Nothing new is being bought.

- Projector, normal throw, sitting back in the room. Front-throw, so my body casts a
  shadow on the wall.
- Sony ZV-1, USB webcam mode via Sony Imaging Edge Webcam.
- Camera stand.
- Solana Seeker phone, iPhone 14.
- Windows PC.
- My own Solana validator, 3+ years live.

No IR laser, no depth camera, no ultra-short-throw. That rules out real touch detection.
The input model is **pinch-in-air, not touch**.

## Input architecture (decided, not up for relitigation)

- Python + OpenCV + MediaPipe Hands reading the ZV-1 over USB.
- Four-corner homography calibration: project dots at the screen corners, click them
  once in the camera view, store the matrix. Camera pixels to projector pixels from
  then on.
- Hand landmarks stream to the UI over a WebSocket, not synthetic OS mouse events. The
  UI receives raw hand state (positions, pinch open/closed, velocity) and decides what
  it means. No `pyautogui`.
- UI is a fullscreen web app in Chrome on the projector display.
- Camera mounts above the projector, not beside it, so my arm doesn't occlude my own hand.

Two processes: `tracker/` (Python) and `wall/` (web app), completely decoupled. The
tracker must be replayable from a recorded session file so the UI can be iterated on
without standing up.

## Interaction model

The wall is a stream, not a screen. New mints enter from one edge and drift across. Most
die on their own and fall off the bottom. The job is to grab the ones worth grabbing
before they pass.

Three verbs, nothing more:

- **Grab** out of the flow to catch it. It's now in my hand, live, following me.
- **Throw forward** at the wall to buy. Harder throw = bigger size.
- **Throw away** (sideways, off the edge) to sell or discard.
- Just let go and it rejoins the stream.

In scope once the basics work:

- **Depth as size.** Arm extended = bigger position. Fill ring grows with reach, pull
  back to shrink.
- **Two hands, two roles.** Left hand holds a token as context lock, right hand acts on
  it. Holding two tokens at once renders the pair comparison in the space between my
  hands. That gesture is impossible on any other device.
- **Spatial persistence.** Coins occupy fixed physical positions and stay there. Bags
  bottom-left, watchlist mid-right, new launches streaming across the top. After a week
  I should be reaching for a place I know without looking.

## Design rules

These are the whole project.

- **Camera-facing layout.** Never put text or live content where my torso sits. Dead
  center is dead. Content lives in a horseshoe around my silhouette. Center is atmosphere.
- **Gestures read from behind.** Arm position and arc, not finger detail. Nobody watching
  can see my fingers.
- **Momentum over snapping.** Everything flung keeps moving, decelerates, settles with
  slight overshoot. Zero-latency snapping reads as software. Inertia reads as mass.
  Biggest perceived-quality lever in the build.
- **Light spill.** When something ignites, let the glow bleed onto the surrounding wall.
  The projector is real light on my real arm, and the camera picks that up for free.
- **The ugliness stays in.** Rugs don't fade politely, they blow apart and fragments fall.
  Losses accumulate somewhere visible — a pile, a scar — that doesn't clear. The wall gets
  messier over a session. Every trading UI on earth is trying to look institutional and
  calm; mine looking chaotic and physical is the entire differentiation.
- **Heat, not green/red.** Tokens are born white-hot, cool to ember, sink as ash. Reads
  instantly with no sound and no context.
- **Big consequences.** A buy sends a shockwave across the whole wall. A rug visibly
  collapses. Motion and color carry everything; numbers stay small and peripheral.
- **Hit targets 3-4x bigger than feels necessary.** Jitter is real. No hover states.
  Dwell rings and pinch-confirm only.

## Data

Don't scrape GMGN or Dexscreener. They rate-limit or block, and their data model is
table-shaped anyway.

- Jupiter for quotes and swaps.
- Birdeye / Dexscreener API for pair data.
- Helius, or my own validator, for the firehose of new mints. My validator means I can
  surface new pools before the terminals do. Build toward that.

Start with a mock data source that mimics the real shape so the UI runs with no keys.
Real feeds behind an interface I can swap.

## Safety (non-negotiable)

- Every irreversible action is press-and-hold-to-confirm with a visible fill ring, never
  a tap. A false-positive blob on a wall interface is a market order.
- Trading runs against a delegated key with a hard per-session spend cap, never my main
  wallet. A wall terminal is physically exposed in a way a laptop isn't.
- Hard kill switch: a gesture and a keyboard key that freeze all order execution instantly.
- Paper-trading mode is the default. Live mode requires an explicit flag.

## Build order

Do not skip ahead. Each phase has to look or feel right on the wall before the next one
starts.

1. **The flow, no gestures.** Tokens entering, drifting, dying, rugging, ash piling at the
   bottom, flow parting around a center ellipse for my silhouette. Keyboard controls for
   pause, flow rate, force-a-rug (for filming), toggle silhouette zone, fullscreen.
   Already prototyped as a single HTML file that works; rebuild it properly as the
   foundation of the real app.
2. **Pinch cursor over a plain page.** Tracker + calibration + WebSocket, driving a dot on
   a blank HTML page. One evening. Prove latency and jitter before any trading UI touches it.
3. **One gesture end to end.** Grab a token out of the flow, push forward to size, hold to
   fill. Mock data, paper trades. If this feels good on the wall, everything else follows.
4. **Second hand, pair comparison, spatial persistence zones.**
5. **Real data feeds.**
6. **Live execution with the delegated key and caps.**

## Working agreement

- Windows. Commands must actually run there.
- After each phase: exactly what to film and what to judge, so it can be tested on the
  wall in a dark room and reported back.
- Prefer few dependencies. This has to survive being restarted mid-stream.
- Ask before adding anything that requires hardware or a paid API.
