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
| `F` | fullscreen |
| `T` | re-fetch `feel.json` |
| `C` | clear ash and scars — **hold to confirm** |
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

### What to judge

- Does the flow part around you, or do tokens land on your chest? Walk left and right; the
  ellipse is static in Phase 1, so find out how much slack it needs.
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

---

## Phase 2 — pinch cursor over a plain page

Tracker, calibration, WebSocket, driving a dot on a blank page. No trading UI touches this.

Adds `tracker/` in full, `recordings/`, `wall/input/hands.js`, the mouse shim, and a
throwaway `wall/dev/cursor.html`.

**Film:** slow horizontal sweeps, fast flicks, hand held still for ten seconds, pinch open
and closed twenty times, arm extending and retracting, and walking out of frame and back.

**Judge:** the latency number on the HUD; whether the dot sits still when your hand does;
whether pinch ever chatters; whether the dot lands where your finger points at all four
corners and in the middle; whether it recovers cleanly when your hand leaves frame.
Pass/fail is capture-to-paint under about 80 ms with no visible jitter at rest.

---

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
