/**
 * Phase 1: the flow, no gestures.
 *
 * Wiring only. Everything with an opinion about how the wall looks or moves
 * lives in sim/, render/ or config/feel.json.
 */

import { makeSurface } from './render/canvas.js';
import { buildSprites } from './render/sprites.js';
import { applySpill } from './render/spill.js';
import { drawAtmosphere, drawVignette, drawSilhouetteOutline } from './render/layers/atmosphere.js';
import { drawFlow, drawFlowLabels, drawMotes } from './render/layers/flow.js';
import { drawAsh, drawScars } from './render/layers/ash.js';
import { drawChrome, drawHelp, drawDebug, drawToast } from './render/layers/chrome.js';
import { makeWorld } from './sim/world.js';
import { clamp, expApproach } from './sim/motion.js';
import { makeHoldRing } from './ui/holdRing.js';
import { makeKeys } from './input/keys.js';
import { makeKillSwitch } from './safety/mode.js';
import { startFeed } from './data/feed.js';
import './data/mock.js';

const FEEL_URL = './config/feel.json';

const state = {
  paused: false,
  showSilhouette: false,
  showHelp: false,
  showDebug: false,
  killed: false,
  toast: '',
  toastAlpha: 0
};

const perf = { fps: 60, sim: 0, draw: 0, bloom: 0 };

async function loadFeel() {
  const res = await fetch(`${FEEL_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`feel.json: ${res.status}`);
  return res.json();
}

function toast(text) {
  state.toast = text;
  state.toastAlpha = 1;
}

async function boot() {
  let feel = await loadFeel();

  const canvas = document.getElementById('wall');
  const surface = makeSurface(canvas, feel.bloom.scale);
  buildSprites();

  const seed = Number(new URLSearchParams(location.search).get('seed')) || 20260905;
  const world = makeWorld(feel, seed);
  world.restoreSilhouette();
  if (world.ledger.restore()) toast('ledger restored');

  const feed = startFeed('mock', { rng: world.rng }, {
    onMint: (mint) => world.admit(mint),
    onTick: () => {},
    onRug: () => {}
  });

  const keys = makeKeys();
  const kill = makeKillSwitch();
  let hold = makeHoldRing(feel);

  let flowMul = 1;
  let last = performance.now();
  let accumulator = 0;
  let fpsSmooth = 60;

  document.getElementById('boot').classList.add('gone');

  // Debug handle. Used by the smoke test and by anyone poking at a live wall
  // from devtools mid-session; nothing in the app reads it.
  window.__wall = {
    world, surface, perf, state,
    get feel() { return feel; },
    stats() {
      return {
        tokens: world.tokens.length,
        fragments: world.fragments.length,
        shockwaves: world.shockwaves.length,
        scars: world.ledger.scars.length,
        ledger: { ...world.ledger.stats },
        ashPeak: Math.max(...world.ledger.heights),
        flow: world.flowMultiplier,
        fps: perf.fps
      };
    }
  };

  function handleActions() {
    for (const { action, shift } of keys.drain()) {
      switch (action) {
        case 'pause':
          state.paused = !state.paused;
          break;
        case 'rug':
          if (shift) world.rugHottest(); else world.rugRandom();
          break;
        case 'silhouette':
          state.showSilhouette = !state.showSilhouette;
          break;
        case 'fullscreen':
          if (document.fullscreenElement) document.exitFullscreen();
          else document.documentElement.requestFullscreen().catch(() => {});
          break;
        case 'reloadFeel':
          loadFeel().then((next) => {
            feel = next;
            world.setFeel(feel);
            hold = makeHoldRing(feel);
            buildSprites();
            toast('feel reloaded');
          }).catch((e) => toast(`feel failed: ${e.message}`));
          break;
        case 'kill':
          state.killed = kill.toggle();
          toast(state.killed ? 'EXECUTION FROZEN' : 'execution released');
          break;
        case 'debug':
          state.showDebug = !state.showDebug;
          break;
        case 'help':
          state.showHelp = !state.showHelp;
          break;
        case 'seedPrev':
        case 'seedNext': {
          const next = world.seed + (action === 'seedNext' ? 1 : -1);
          world.reseed(next);
          toast(`seed ${next}`);
          break;
        }
      }
    }
  }

  function handleHeld(dt) {
    if (keys.held('flowUp'))   flowMul *= Math.exp(0.9 * dt);
    if (keys.held('flowDown')) flowMul *= Math.exp(-0.9 * dt);
    flowMul = clamp(flowMul, 0.05, 10);
    world.setFlowMultiplier(flowMul);

    const sil = world.silhouette;
    const nudge = 0.09 * dt;
    if (keys.held('silLeft'))   world.setSilhouette({ cx: clamp(sil.cx - nudge, 0.1, 0.9) });
    if (keys.held('silRight'))  world.setSilhouette({ cx: clamp(sil.cx + nudge, 0.1, 0.9) });
    if (keys.held('silNarrow')) world.setSilhouette({ rx: clamp(sil.rx - nudge * 0.4, 0.04, 0.35) });
    if (keys.held('silWiden'))  world.setSilhouette({ rx: clamp(sil.rx + nudge * 0.4, 0.04, 0.35) });

    // The one destructive action in Phase 1, and it is press-and-hold, not a tap.
    const clearing = keys.held('clear');
    if (clearing && !hold.active) {
      hold.begin('clear-ledger', 'HOLD TO CLEAR', () => {
        world.ledger.clear();
        toast('ledger cleared');
      });
    }
    hold.update(dt, clearing);
  }

  function render(alpha) {
    const { ctx, w, h } = surface;
    const t0 = performance.now();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#050403';
    ctx.fillRect(0, 0, w, h);

    // Ambient warmth: how much heat is currently on the wall. A busy session
    // lights the room more than a quiet one, which the stream camera sees.
    let heatSum = 0;
    for (const tok of world.tokens) heatSum += tok.heat;
    const ambient = clamp(heatSum / 45, 0, 1);

    // Shake is a camera effect, so it moves the world and not the chrome.
    const shakeX = world.shake ? (Math.random() - 0.5) * world.shake * h : 0;
    const shakeY = world.shake ? (Math.random() - 0.5) * world.shake * h : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawAtmosphere(ctx, surface, world, feel, ambient);
    drawMotes(ctx, surface, world, feel, alpha);
    drawAsh(ctx, surface, world);
    drawScars(ctx, surface, world, feel);
    drawFlow(ctx, surface, world, feel, alpha);
    if (state.showSilhouette) drawSilhouetteOutline(ctx, surface, world.silhouette);

    ctx.restore();
    const t1 = performance.now();

    applySpill(surface, feel.bloom);
    const t2 = performance.now();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette(ctx, surface, feel);

    // Text after the bloom pass, so small type stays crisp.
    ctx.save();
    ctx.translate(shakeX, shakeY);
    drawFlowLabels(ctx, surface, world, feel);
    ctx.restore();

    drawChrome(ctx, surface, world, feel, state);
    hold.draw(ctx, surface, w * 0.5, h * 0.88);
    if (state.showHelp) drawHelp(ctx, surface, feel);
    if (state.showDebug) drawDebug(ctx, surface, world, feel, perf);
    drawToast(ctx, surface, feel, state.toast, state.toastAlpha);

    perf.draw = t1 - t0;
    perf.bloom = t2 - t1;
  }

  function frame(now) {
    const rawDt = Math.min(0.25, (now - last) / 1000) || 0;
    last = now;

    fpsSmooth = expApproach(fpsSmooth, rawDt > 0 ? 1 / rawDt : 60, 3, rawDt);
    perf.fps = fpsSmooth;
    state.toastAlpha = Math.max(0, state.toastAlpha - rawDt * 0.5);

    handleActions();
    handleHeld(rawDt);

    const step = 1 / feel.sim.hz;
    const t0 = performance.now();
    if (!state.paused) {
      accumulator += rawDt;
      let steps = 0;
      while (accumulator >= step && steps < feel.sim.maxCatchUpSteps) {
        world.step(step);
        accumulator -= step;
        steps++;
      }
      // Tab was hidden or the machine stalled: drop the backlog rather than
      // fast-forwarding through it on stream.
      if (accumulator > step * feel.sim.maxCatchUpSteps) accumulator = 0;

      const want = world.takeDemand();
      if (want > 0) feed.pull(want);
    }
    perf.sim = performance.now() - t0;

    render(state.paused ? 1 : clamp(accumulator / step, 0, 1));
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

boot().catch((err) => {
  const el = document.getElementById('boot');
  el.textContent = String(err.message || err);
  el.style.color = '#c2542a';
  console.error(err);
});
