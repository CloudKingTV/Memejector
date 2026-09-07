/**
 * Hand state client.
 *
 * Receives the protocol defined in docs/protocol.md and hands it to whoever
 * asked, unchanged. It resolves nothing about gestures — no grab, no throw, no
 * discard. Those are the wall's interpretation of position, velocity, pinch and
 * what happens to be under the hand, and keeping that split means gesture tuning
 * is a browser refresh rather than a Python restart.
 *
 * Reconnects on its own, forever. The tracker getting restarted mid-stream must
 * not mean reloading the wall.
 *
 * A mouse shim produces the same messages with nothing running at all, so the
 * UI can be developed with no Python. It is opt-in (`?shim=1`) rather than an
 * automatic fallback: silently pretending to have a tracker would hide exactly
 * the failure Phase 2 exists to catch.
 */

const RECONNECT_MIN = 250;
const RECONNECT_MAX = 4000;

export function createHandSource(options = {}) {
  const url = options.url || 'ws://127.0.0.1:8787';
  const onFrame = options.onFrame || (() => {});
  const onHello = options.onHello || (() => {});
  const onStatus = options.onStatus || (() => {});

  const state = {
    connected: false,
    source: null,
    hello: null,
    hands: { left: null, right: null },
    seq: 0,
    dropped: 0,          // gaps in seq: frames the tracker sent that we lost
    fps: 0,
    latency: 0,          // capture -> received, ms
    trackerCost: 0,      // capture -> socket write, ms
    lastAt: 0,
    error: null
  };

  let ws = null;
  let backoff = RECONNECT_MIN;
  let timer = null;
  let stopped = false;

  function ingest(msg) {
    if (msg.type === 'hello') {
      state.hello = msg;
      state.source = msg.source;
      if (msg.v !== 1) {
        // Refuse to guess at a protocol we do not know rather than
        // misinterpreting coordinates on a live wall.
        state.error = `protocol v${msg.v}, this wall speaks v1`;
        onStatus(state);
        return;
      }
      state.error = null;
      onHello(msg, state);
      return;
    }

    if (msg.type === 'status') {
      state.error = msg.state === 'ok' ? null : (msg.detail || msg.state);
      onStatus(state);
      return;
    }

    if (msg.type !== 'frame') return;

    const now = Date.now();
    if (state.seq && msg.seq > state.seq + 1) state.dropped += msg.seq - state.seq - 1;
    state.seq = msg.seq;
    state.latency = now - msg.t_capture;
    state.trackerCost = msg.t_send - msg.t_capture;
    state.fps = msg.meta ? msg.meta.fps : 0;
    state.lastAt = now;

    state.hands.left = null;
    state.hands.right = null;
    for (const h of msg.hands) state.hands[h.id] = h;

    onFrame(msg, state);
  }

  function connect() {
    if (stopped) return;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      schedule();
      return;
    }

    ws.onopen = () => {
      state.connected = true;
      state.error = null;
      backoff = RECONNECT_MIN;
      onStatus(state);
    };
    ws.onmessage = (e) => {
      try { ingest(JSON.parse(e.data)); } catch { /* a bad line is not fatal */ }
    };
    ws.onclose = () => {
      state.connected = false;
      state.hands.left = null;
      state.hands.right = null;
      onStatus(state);
      schedule();
    };
    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }

  function schedule() {
    if (stopped || timer) return;
    timer = setTimeout(() => { timer = null; connect(); }, backoff);
    backoff = Math.min(RECONNECT_MAX, backoff * 1.7);
  }

  return {
    state,
    start() { stopped = false; connect(); },
    stop() {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (ws) { try { ws.close(); } catch { /* ignore */ } }
    },
    /** True when frames have arrived recently, not merely when the socket is up. */
    get live() {
      return state.connected && Date.now() - state.lastAt < 500;
    }
  };
}

/**
 * Mouse shim. Emits the same messages so nothing downstream can tell.
 * Mouse position is the hand, holding a button is a pinch, and the wheel is
 * depth (which a mouse otherwise has no way to express).
 */
export function createMouseShim(options = {}) {
  const onFrame = options.onFrame || (() => {});
  const onHello = options.onHello || (() => {});
  const target = options.target || window;

  const state = {
    connected: true, source: 'shim', hello: null,
    hands: { left: null, right: null },
    seq: 0, dropped: 0, fps: 60, latency: 0, trackerCost: 0,
    lastAt: Date.now(), error: null
  };

  let x = 0.5, y = 0.5, px = 0.5, py = 0.5, depth = 0.5;
  let closed = false, since = Date.now();
  let raf = null, last = performance.now();

  const onMove = (e) => {
    x = e.clientX / window.innerWidth;
    y = e.clientY / window.innerHeight;
  };
  const onDown = (e) => { if (!closed) { closed = true; since = Date.now(); } e.preventDefault(); };
  const onUp = () => { if (closed) { closed = false; since = Date.now(); } };
  const onWheel = (e) => {
    depth = Math.max(0, Math.min(1, depth - e.deltaY * 0.0009));
    e.preventDefault();
  };

  function tick(now) {
    const dt = Math.max(0.001, (now - last) / 1000);
    last = now;
    const vx = (x - px) / dt, vy = (y - py) / dt;
    px = x; py = y;
    state.seq++;
    const t = Date.now();
    state.lastAt = t;
    const msg = {
      type: 'frame', v: 1, seq: state.seq, t_capture: t, t_send: t,
      hands: [{
        id: 'right', conf: 1,
        pos: [x, y], raw: [x, y], vel: [vx, vy], depth,
        pinch: { closed, value: closed ? 0.15 : 0.7, since }
      }],
      meta: { fps: 60, dropped: 0 }
    };
    state.hands.right = msg.hands[0];
    state.hands.left = null;
    onFrame(msg, state);
    raf = requestAnimationFrame(tick);
  }

  return {
    state,
    start() {
      target.addEventListener('mousemove', onMove);
      target.addEventListener('mousedown', onDown);
      target.addEventListener('mouseup', onUp);
      target.addEventListener('wheel', onWheel, { passive: false });
      const hello = {
        type: 'hello', v: 1, source: 'shim',
        camera: { w: 0, h: 0, fps: 60 },
        projector: { w: window.innerWidth, h: window.innerHeight },
        mirrored: false, calibrated: true,
        depth_baseline: { near: 0, far: 1 }
      };
      state.hello = hello;
      onHello(hello, state);
      raf = requestAnimationFrame(tick);
    },
    stop() {
      target.removeEventListener('mousemove', onMove);
      target.removeEventListener('mousedown', onDown);
      target.removeEventListener('mouseup', onUp);
      target.removeEventListener('wheel', onWheel);
      if (raf) cancelAnimationFrame(raf);
    },
    get live() { return true; }
  };
}
