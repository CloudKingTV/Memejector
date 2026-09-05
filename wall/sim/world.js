/**
 * Entity store and the fixed-step loop.
 *
 * Fixed 60 Hz simulation with an accumulator; render interpolates between the
 * last two states. Two reasons that matters beyond correctness: the feel of
 * momentum stops depending on frame rate, and a seeded run is reproducible, so
 * a good-looking sequence can be filmed twice.
 *
 * Nothing in here touches the DOM, a canvas, or the network.
 */

import { makeRng } from './rng.js';
import { makeField } from './field.js';
import { makeToken, stepToken, radiusOf, STATE } from './token.js';
import { makeLedger } from './ledger.js';
import { applyDrag, clamp } from './motion.js';

export function makeWorld(feel, seed) {
  let cfg = feel;
  const rng = makeRng(seed);
  const field = makeField(cfg);
  const ledger = makeLedger(cfg);

  const tokens = [];
  const fragments = [];
  const shockwaves = [];

  /**
   * Motes carry no data. They exist so the flow is visible between tokens and
   * so the parting around the silhouette reads even in a quiet moment — which
   * is most of the time, and is what a three-second clip is going to catch.
   */
  const motes = [];
  function seedMotes() {
    motes.length = 0;
    for (let i = 0; i < cfg.flow.motes; i++) {
      motes.push({
        x: rng.float(), y: rng.range(0.02, 0.95),
        px: 0, py: 0,
        vx: rng.range(0.02, 0.09), vy: 0,
        heat: cfg.flow.moteHeat * rng.range(0.35, 1.5),
        r: rng.range(0.0016, 0.0042)
      });
    }
  }
  seedMotes();

  function stepMotes(dt) {
    for (const m of motes) {
      m.px = m.x; m.py = m.y;
      const [ax, ay] = field.sample(m.x, m.y, cfg.flow.moteHeat, time, silhouette, cfg.flow.moteGravity);
      m.vx = applyDrag(m.vx + ax * dt, cfg.flow.drag, dt);
      m.vy = applyDrag(m.vy + ay * dt, cfg.flow.drag, dt);
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.x > 1.04 || m.y > 1.0) {
        // Re-enter from the left edge or the top, so ambient embers cover the
        // whole wall instead of forming one diagonal band out of the corner.
        if (rng.chance(0.6)) { m.x = -0.03; m.y = rng.range(0.02, 0.62); }
        else { m.x = rng.range(0, 1); m.y = -0.03; }
        m.px = m.x; m.py = m.y;
        m.vx = rng.range(0.02, 0.09); m.vy = 0;
      }
    }
  }

  let time = 0;
  let shake = 0;
  let flowMultiplier = 1;
  let spawnDebt = 0;
  const silhouette = { ...cfg.silhouette };

  /* --- events --------------------------------------------------------- */

  function rug(tok) {
    const r = cfg.rug;
    ledger.tokenRugged(tok.x, tok.symbol);
    shake = Math.max(shake, r.shake * (0.6 + tok.size * 0.6));
    shockwaves.push({ x: tok.x, y: tok.y, t: 0, life: r.shockwaveLife, power: tok.heat, size: tok.size });

    // Blow apart. Fragments carry the token's heat outward and then fall.
    const count = Math.round(r.fragments * (0.6 + tok.size * 0.7));
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const s = r.fragmentSpeed * rng.range(0.25, 1) * (0.7 + tok.size * 0.5);
      fragments.push({
        x: tok.x, y: tok.y, px: tok.x, py: tok.y,
        vx: Math.cos(a) * s + tok.vx,
        vy: Math.sin(a) * s * 0.75 + tok.vy - 0.1,
        heat: clamp(tok.heat * rng.range(0.85, 1.35), 0, 1),
        r: radiusOf(tok, cfg) * rng.range(0.18, 0.46),
        life: r.fragmentLife * rng.range(0.5, 1),
        age: 0,
        spin: rng.range(-8, 8),
        angle: rng.range(0, Math.PI * 2)
      });
    }
  }

  /* --- step ------------------------------------------------------------ */

  // Spawn slots the sim has room for. The step loop opens them, the feed fills
  // them, so the simulation never invents a token the data source didn't produce.
  let spawnSlots = 0;

  /** Height of the ash surface under x, in normalized y (1 = floor of the rect). */
  function floorAt(x) {
    const i = Math.max(0, Math.min(ledger.columns - 1,
      Math.floor(clamp(x, 0, 0.999) * ledger.columns)));
    return 1 - ledger.heights[i];
  }

  function step(dt) {
    time += dt;
    shake = applyDrag(shake, cfg.rug.shakeDecay, dt);

    // Spawn. Debt-based so a fractional rate is still exact over time.
    spawnDebt += cfg.flow.spawnPerSecond * flowMultiplier * dt;
    while (spawnDebt >= 1) {
      spawnDebt -= 1;
      if (tokens.length < cfg.flow.maxTokens) spawnSlots++;
    }

    for (let i = tokens.length - 1; i >= 0; i--) {
      const tok = tokens[i];
      const result = stepToken(tok, dt, field, cfg, silhouette, time, rng);
      if (result === 'rugged') {
        rug(tok);
        tokens.splice(i, 1);
        continue;
      }
      if (result === 'gone') {
        tokens.splice(i, 1);
        continue;
      }
      // Settling onto the pile. Fade over the last stretch so it sinks in
      // rather than popping out of existence.
      const floor = floorAt(tok.x);
      const gap = floor - tok.y;
      if (gap < 0.06 && tok.state === STATE.DYING) {
        tok.fade = clamp(gap / 0.06, 0, 1);
      }
      if (gap <= 0) {
        if (tok.x > -0.02 && tok.x < 1.02) ledger.tokenDied(clamp(tok.x, 0, 1));
        tokens.splice(i, 1);
      }
    }

    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      f.px = f.x; f.py = f.y;
      f.age += dt;
      f.angle += f.spin * dt;
      f.vy += cfg.rug.fragmentGravity * dt;
      f.vx = applyDrag(f.vx, cfg.rug.fragmentDrag, dt);
      f.vy = applyDrag(f.vy, cfg.rug.fragmentDrag * 0.35, dt);
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.heat = Math.max(0, f.heat - dt * 0.42);

      if (f.y >= floorAt(f.x) || f.age > f.life) {
        if (f.x > -0.02 && f.x < 1.02) ledger.fragmentLanded(clamp(f.x, 0, 1));
        fragments.splice(i, 1);
      }
    }

    for (let i = shockwaves.length - 1; i >= 0; i--) {
      const s = shockwaves[i];
      s.t += dt;
      if (s.t >= s.life) shockwaves.splice(i, 1);
    }

    stepMotes(dt);
    ledger.step(dt);
  }

  return {
    tokens, fragments, shockwaves, motes, ledger, field,
    get time() { return time; },
    get shake() { return shake; },
    get silhouette() { return silhouette; },
    get flowMultiplier() { return flowMultiplier; },
    get rng() { return rng; },
    get seed() { return rng.seed; },
    /** Consume the spawn slots opened since the last call. Drives the feed. */
    takeDemand() {
      const d = spawnSlots;
      spawnSlots = 0;
      return tokens.length < cfg.flow.maxTokens ? d : 0;
    },

    step,

    admit(mint) {
      const tok = makeToken(mint, cfg, rng);
      tokens.push(tok);
      ledger.tokenSpawned();
      return tok;
    },

    rugToken(tok) {
      const i = tokens.indexOf(tok);
      if (i < 0) return false;
      tok.state = STATE.RUGGING;
      rug(tok);
      tokens.splice(i, 1);
      return true;
    },

    rugRandom() {
      const visible = tokens.filter((t) => t.x > 0.02 && t.x < 0.98);
      if (!visible.length) return false;
      return this.rugToken(visible[rng.int(0, visible.length - 1)]);
    },

    rugHottest() {
      const visible = tokens.filter((t) => t.x > 0.02 && t.x < 0.98);
      if (!visible.length) return false;
      visible.sort((a, b) => b.heat * b.size - a.heat * a.size);
      return this.rugToken(visible[0]);
    },

    setFlowMultiplier(m) { flowMultiplier = clamp(m, 0, 12); },

    setFeel(next) {
      const moteCountChanged = next.flow.motes !== cfg.flow.motes;
      cfg = next;
      field.setFeel(next);
      if (moteCountChanged) seedMotes();
    },

    setSilhouette(patch) {
      Object.assign(silhouette, patch);
      try { localStorage.setItem('memejector.silhouette.v1', JSON.stringify(silhouette)); }
      catch { /* ignore */ }
    },

    restoreSilhouette() {
      try {
        const raw = localStorage.getItem('memejector.silhouette.v1');
        if (raw) Object.assign(silhouette, JSON.parse(raw));
      } catch { /* ignore */ }
    },

    reseed(nextSeed) {
      rng.reseed(nextSeed);
      tokens.length = 0;
      fragments.length = 0;
      shockwaves.length = 0;
      time = 0;
      shake = 0;
      spawnDebt = 0;
      spawnSlots = 0;
      seedMotes();
    }
  };
}
