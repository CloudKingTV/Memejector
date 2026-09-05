/**
 * Seeded PRNG. Every random draw in the simulation goes through one of these so
 * a run can be reproduced exactly — which is what makes "film the rug at t=42s
 * twice" possible.
 */

export function makeRng(initialSeed = 1) {
  let seed = (initialSeed >>> 0) || 1;
  let s = seed;

  const next = () => {
    // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    get seed() { return seed; },
    /**
     * Reseed in place. Consumers hold a reference to this object (the feed does),
     * so stepping the seed must not hand out a new one.
     */
    reseed(value) {
      seed = (value >>> 0) || 1;
      s = seed;
    },
    float: next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => Math.floor(lo + next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    /** Box-Muller, clamped. Used for anything that should cluster around a mean. */
    gauss: (mean = 0, sd = 1) => {
      const u = Math.max(next(), 1e-9), v = next();
      const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + g * sd;
    },
    /** Weighted toward the low end. Most mints are duds. */
    biasLow: (power = 2) => Math.pow(next(), power)
  };
}
