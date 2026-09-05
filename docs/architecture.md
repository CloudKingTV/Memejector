# Architecture

Proposal. Nothing here is built yet.

## The two processes and the seam between them

```
  ZV-1 (USB)                                    Projector (2nd display)
      |                                                   ^
      v                                                   |
  +-----------+     ws://127.0.0.1:8787      +------------------------+
  | tracker/  | ---------------------------> |  wall/  (Chrome kiosk) |
  | Python    |     hand frames, JSON        |  static ES modules     |
  +-----------+                              +------------------------+
      |                                                   ^
      | writes                                            |
      v                                                   |
  recordings/*.jsonl  --->  replay server  -----------------
```

The seam is one versioned JSON message, defined once in `docs/protocol.md`. Three things
can produce it and the wall cannot tell them apart:

1. the live tracker,
2. the replay server reading a `.jsonl` back at original timing,
3. a mouse shim inside the wall itself, for developing with no Python running.

**The recording format is the wire format.** One line of JSONL per frame, byte-identical
to what goes over the socket. That is what makes "iterate on the UI without standing up"
actually true, and it costs nothing to build that way from the start.

The tracker decides *sensor* questions: where is the hand, is the pinch closed, how fast
is it moving, how far is the arm extended. The wall decides *meaning*: is that a grab, a
throw, a discard, a hold-to-confirm. Nothing in the tracker knows what a token is.

## wall/ — internal structure

Four layers, one direction of dependency: `data -> sim -> render`, with `input` feeding
sim and `config` read by everything.

### sim/ — no DOM, no canvas, no fetch

Pure state and physics. Fixed timestep (60 Hz) driven by an accumulator, render
interpolates between the last two sim states. This matters for two reasons beyond
correctness: the feel of momentum stops depending on frame rate, and a seeded run is
reproducible, so "the rug at t=42s" can be filmed twice.

- `rng.js` — seeded PRNG. Every random draw in the sim goes through it. Seed is visible
  and steppable from the keyboard so a good-looking run can be re-filmed.
- `motion.js` — the feel primitives, and the most important file in the repo. Critically
  damped springs, exponential decay toward a target, an overshoot-and-settle easing. Every
  moving thing goes through this module. No component gets to write its own `x += dx`.
  The brief calls inertia the biggest perceived-quality lever, so it gets one
  implementation and one set of constants rather than being scattered.
- `field.js` — force field over the projected rect. The silhouette is an ellipse-shaped
  repulsion source; flow is a global drift vector; a little curl noise stops the paths
  looking like a conveyor belt. Tokens sample the field, they don't follow scripted paths.
  Later the same field can take a real body mask from the camera instead of the ellipse,
  and nothing downstream changes.
- `heat.js` — a single scalar 0..1 per token driving color, radius, glow strength and
  buoyancy. `heatToColor(h)` owns the white-hot -> ember -> ash ramp. There is no green
  and no red anywhere in the codebase; if a hex value shows up outside this file, it's a bug.
- `token.js` — lifecycle state machine: `spawning -> live -> cooling -> dying -> ash`, plus
  the `rugging` branch that skips straight to fragments.
- `ledger.js` — the pile and the scar. Ash is a heightfield: an array of column heights
  across the floor. Anything that dies lands in a column and raises it, with a bit of
  spread. A rug additionally burns a permanent scar at a fixed x that never decays and
  never clears. Snapshotted to `localStorage` on a debounce and restored on load, because
  "survives being restarted mid-stream" and "the mess doesn't clear" are the same
  requirement.
- `world.js` — entity store and the fixed-step loop. Owns nothing clever.

### render/ — draws sim state, owns no state

Canvas2D, layered, with a cheap bloom. No WebGL for now: pre-rendered radial-gradient
sprites plus `globalCompositeOperation = 'lighter'` handles a few hundred glowing bodies
at 1080p comfortably, and the light spill comes from drawing the bright layer into a
quarter-resolution offscreen canvas, blurring it with a CSS `filter`, and compositing it
back additively. That is a real bloom, it looks like light on a wall, and it adds zero
dependencies. If it turns out not to sell the ignition moment, WebGL is a contained
swap inside this directory.

- `canvas.js` — layer setup, device pixel ratio, resize.
- `sprites.js` — pre-rendered gradient sprites, keyed by heat bucket. Drawing a cached
  sprite is roughly 50x cheaper than `shadowBlur` per body.
- `spill.js` — the bloom pass.
- `layers/atmosphere.js` — the center. Haze, ambient spill, whatever the silhouette is
  read against. No content, by rule.
- `layers/flow.js` — tokens and fragments.
- `layers/ash.js` — the floor pile and the scars.
- `layers/chrome.js` — small peripheral numbers, mode badge, help overlay.

### data/

`feed.js` defines the interface, `mock.js` is the only implementation in Phase 1:

```js
// onMint(token), onTick(mint, patch), onRug(mint, reason)
startFeed({ onMint, onTick, onRug }) -> stop()
```

The mock emits the *real* field shape from day one: mint address, symbol, name, created
timestamp, liquidity, market cap, holder count, dev holding %, LP-burn flag, price
samples. Heat and rug probability get derived from those fields, not from invented ones,
so Phase 5 is swapping the module rather than rewriting the sim.

### config/

- `feel.json` — every tunable that affects motion, color and timing, fetched at load with
  a cache-buster and re-fetchable from a key. That means tuning happens standing in a dark
  room with a text editor open, not by rebuilding.
- `layout.js` — named zones in normalized 0..1 coordinates: `SILHOUETTE`, `LAUNCH_STREAM`
  (top), `BAGS` (bottom-left), `WATCHLIST` (mid-right), `ASH_FLOOR`, plus the horseshoe
  ring itself. Phase 1 only uses three of them, but declaring the whole map now forces
  Phase 1's composition to leave the other regions empty, and makes Phase 4's spatial
  persistence a matter of filling in a map that already exists.

### ui/ and safety/

`ui/holdRing.js` is the press-and-hold-to-confirm fill ring: a state machine plus a draw
call. It ships in Phase 1 guarding the one destructive keyboard action that exists then
(clear the ash and scars). That is deliberate. The component that will later stand between
a twitchy blob and a market order gets built and tuned on the wall for weeks before it
guards anything that costs money.

`safety/mode.js` is a constant, `PAPER`, and a badge rendered on the wall. Live mode will
require an explicit flag that does not exist yet. Having the badge visible from Phase 1
also means the stream can always see which mode is running.

## tracker/ — structure only, built in Phase 2

- `schema.py` — the one definition of the wire message. Mirrors `docs/protocol.md`.
- `capture.py` — camera open. On Windows the ZV-1 in Imaging Edge Webcam mode wants the
  DirectShow backend (`cv2.CAP_DSHOW`); the default MSMF backend is where the "it opens
  but every frame is green" reports come from.
- `calibrate.py` — projects four corner dots, takes four clicks in the camera view,
  solves the homography, writes `calibration.json`. Also captures the depth baseline
  (arm tucked / arm extended) and the mirror flag.
- `hands.py` — MediaPipe Hands, landmarks through the homography into projector-normalized
  coordinates, One Euro filter on position. One Euro rather than a plain low-pass because
  it gives low jitter when the hand is still and low lag when it's moving fast, which is
  exactly the two failure modes that make air-pinch feel broken.
- `pinch.py` — pinch detection with hysteresis. Two thresholds, not one, or the pinch will
  chatter open/closed at the boundary and every grab becomes a coin flip.
- `server.py` — WebSocket broadcast, plus record-to-JSONL as a side effect.
- `replay.py` — serves a `.jsonl` over the same socket at original timing.

## Stack decisions and why

**No bundler, no framework, no TypeScript for now.** Plain ES modules served statically.
The brief asks for few dependencies and for something that survives being restarted
mid-stream; a build step is a thing that can be broken at 11pm with the stream live. The
whole wall is canvas drawing and a physics loop, which is the case where React earns the
least. If the codebase gets big enough that types would pay for themselves, adding a
bundler later is a mechanical change.

**Canvas2D, not WebGL, not DOM.** Reasoning above under `render/`. DOM is out entirely:
hundreds of animated glowing bodies is the one thing DOM is worst at.

**One static server.** `python -m http.server` against `wall/` keeps the dev toolchain to
a single runtime, since Python is already required for the tracker.

## Latency budget

Phase 2's pass/fail is a number, so the instrumentation is designed in now. Every frame
carries `t_capture` and `t_send`. Both processes are on the same Windows box, so
`time.time()*1000` and `Date.now()` are the same clock and the wall can compute
capture-to-paint directly and draw it on a HUD.

Rough target, to be confirmed by measurement rather than assumed:

| stage                    | expected |
|--------------------------|----------|
| ZV-1 USB capture         | 15-35 ms |
| MediaPipe inference      | 8-20 ms  |
| filter + socket + Chrome | 5-15 ms  |
| render to photons        | 16-33 ms |

Anything under ~80 ms end to end should feel attached to the hand. Above ~120 ms it will
feel like dragging something through mud, and the fix is dropping capture resolution
before anything else.

## Open questions

1. **Projector native resolution and the usable rect.** 1080p? And is the whole projected
   rectangle usable wall, or is part of it landing on a ceiling, a skirting board, or
   furniture? `layout.js` constants depend on the answer, and it's cheaper to know before
   composing than after.
2. **The existing prototype.** The single HTML file that already works is the feel target.
   Dropping it in at `docs/prototype/` would let the rebuild be measured against it instead
   of re-derived from description.
3. **Wall stack** — confirming the no-bundler, Canvas2D call above, or overriding it.
4. **Approximate throw distance.** How far back from the wall are you standing when
   trading? It sets the depth-estimation range in Phase 3 and the minimum readable text
   size everywhere.
