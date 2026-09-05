# Memejector

A body-scale Solana memecoin trading interface projected on a wall and driven by arm and
hand gestures, built to be operated on stream with the operator silhouetted against it.

Two decoupled processes:

- **`tracker/`** — Python. Reads a Sony ZV-1 over USB, runs MediaPipe Hands, maps camera
  pixels to projector pixels through a four-corner homography, and broadcasts hand state
  over a WebSocket. Knows nothing about tokens.
- **`wall/`** — a fullscreen Chrome web app on the projector display. Receives raw hand
  state and decides what it means. Knows nothing about cameras.

The seam between them is one versioned JSON message. Recorded sessions are that same
message as JSONL, so the wall can be developed against a replay with nobody standing in
front of the camera.

## Read first

- [`BRIEF.md`](BRIEF.md) — the design brief. Settles arguments.
- [`docs/architecture.md`](docs/architecture.md) — structure, stack decisions, rationale.
- [`docs/protocol.md`](docs/protocol.md) — the hand frame wire format.
- [`docs/phases.md`](docs/phases.md) — build order, and what to film and judge after each phase.

## Status

**Phase 1 built.** The flow, keyboard controls, no gestures. `tracker/` does not exist yet.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\wall.ps1
```

Serves `wall/` and opens Chrome fullscreen on the first non-primary display. `-Display N`
picks a different one (it prints what it found), `-Windowed` skips kiosk mode, `-Seed N`
reruns a specific session. Press `?` on the wall for the key map.

No install step, no build step, no dependencies. Python 3 is used only as a static file
server.

## Safety

Paper trading is the default and live mode will require an explicit flag. Every
irreversible action is press-and-hold with a visible fill ring, never a tap. Trading will
run against a delegated key with a hard per-session spend cap, never a main wallet.
