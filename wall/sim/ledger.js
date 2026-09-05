/**
 * The pile and the scars. This is where "the ugliness stays in" lives.
 *
 * Ash is a heightfield: one array of column heights across the floor. Anything
 * that dies lands in a column and raises it, with a little spread, so the pile
 * grows unevenly under wherever the flow happens to be dumping. It slumps toward
 * its neighbours over time — which is settling, not clearing; total volume is
 * conserved.
 *
 * A rug additionally burns a scar at a fixed x. Scars never decay and never
 * clear on their own. The wall is supposed to be visibly messier at the end of a
 * session than at the start.
 *
 * Persisted to localStorage, because "survives being restarted mid-stream" and
 * "the mess doesn't clear" are the same requirement.
 *
 * Changing ash.columns in feel.json needs a page reload, not a T reload.
 */

const KEY = 'memejector.ledger.v1';
const SAVE_DEBOUNCE_MS = 2000;

export function makeLedger(feel) {
  const n = feel.ash.columns;
  let heights = new Float32Array(n);
  let scars = [];               // { x, intensity, bornAt, symbol }
  let stats = { died: 0, rugged: 0, spawned: 0 };
  let saveTimer = null;

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        localStorage.setItem(KEY, JSON.stringify({
          v: 1, n, heights: Array.from(heights, (h) => Math.round(h * 1e5) / 1e5),
          scars, stats
        }));
      } catch { /* private mode, quota, whatever — the wall keeps running */ }
    }, SAVE_DEBOUNCE_MS);
  }

  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || !Array.isArray(d.heights)) return false;
      // Resample if the column count changed between sessions.
      const src = d.heights;
      for (let i = 0; i < n; i++) {
        heights[i] = src[Math.min(src.length - 1, Math.floor(i * src.length / n))] || 0;
      }
      scars = Array.isArray(d.scars) ? d.scars.slice(0, 400) : [];
      stats = Object.assign(stats, d.stats || {});
      return true;
    } catch { return false; }
  }

  function colOf(x) {
    return Math.max(0, Math.min(n - 1, Math.floor(x * n)));
  }

  function deposit(x, amount) {
    const c = colOf(x);
    const spread = feel.ash.spread;
    let total = 0;
    for (let d = -spread; d <= spread; d++) total += Math.exp(-(d * d) / (spread * 0.8));
    for (let d = -spread; d <= spread; d++) {
      const i = c + d;
      if (i < 0 || i >= n) continue;
      const w = Math.exp(-(d * d) / (spread * 0.8)) / total;
      heights[i] = Math.min(feel.ash.maxHeight, heights[i] + amount * w);
    }
    scheduleSave();
  }

  return {
    get heights() { return heights; },
    get scars() { return scars; },
    get stats() { return stats; },
    get columns() { return n; },

    restore,

    tokenDied(x) {
      stats.died++;
      deposit(x, feel.ash.riseFromDeath);
    },

    fragmentLanded(x) {
      deposit(x, feel.ash.riseFromFragment);
    },

    tokenRugged(x, symbol) {
      stats.rugged++;
      const existing = scars.find((s) => Math.abs(s.x - x) < feel.scar.width * 0.5);
      if (existing) {
        existing.intensity = Math.min(feel.scar.maxIntensity,
          existing.intensity + feel.scar.intensityPerRug * 0.6);
      } else {
        scars.push({
          x, intensity: feel.scar.intensityPerRug,
          bornAt: Date.now(), symbol
        });
        if (scars.length > 400) scars.shift();
      }
      scheduleSave();
    },

    tokenSpawned() { stats.spawned++; },

    /** Slump toward neighbours. Volume preserving — a pile settling, not tidying. */
    step(dt) {
      const rate = Math.min(0.45, feel.ash.slump * dt);
      if (rate <= 0) return;
      const prev = heights.slice();
      for (let i = 1; i < n - 1; i++) {
        const avg = (prev[i - 1] + prev[i + 1]) * 0.5;
        heights[i] = prev[i] + (avg - prev[i]) * rate;
      }
    },

    /** Only ever called behind hold-to-confirm. */
    clear() {
      heights = new Float32Array(n);
      scars = [];
      stats = { died: 0, rugged: 0, spawned: 0 };
      try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    }
  };
}
