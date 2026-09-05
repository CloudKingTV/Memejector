/**
 * Synthetic mints with the real field shape, driven by the world's seeded RNG so
 * a session is reproducible.
 *
 * This is not a placeholder to be thrown away. It is how the wall gets developed,
 * filmed and rehearsed without keys, without rate limits, and without waiting for
 * the chain to produce something photogenic.
 */

import { registerFeed } from './feed.js';

const HEAD = ['giga', 'based', 'moon', 'turbo', 'wif', 'bonk', 'pepe', 'chad', 'retard', 'ai',
  'quantum', 'dark', 'fart', 'goat', 'silly', 'baby', 'mega', 'hyper', 'cosmic', 'first',
  'jeet', 'anon', 'rug', 'sol', 'degen', 'wojak', 'boden', 'tremp', 'shrek', 'nyan'];
const TAIL = ['coin', 'inu', 'cat', 'dog', 'ai', 'fi', 'dao', 'x', 'god', 'lord',
  'chain', 'net', 'swap', 'pump', 'sol', 'meme', 'bot', 'core', '69', '420'];
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function fakeMint(rng) {
  let s = '';
  for (let i = 0; i < 44; i++) s += B58[rng.int(0, B58.length - 1)];
  return s;
}

function fakeSymbol(rng) {
  const a = rng.pick(HEAD);
  return (rng.chance(0.55) ? a + rng.pick(TAIL) : a).slice(0, 10).toUpperCase();
}

function fakeName(rng, symbol) {
  const s = symbol.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @param {{ rng: object }} options — the world's RNG, so the feed is part of the seed
 */
export function createMockFeed(options, handlers) {
  const rng = options.rng;
  let stopped = false;

  return {
    /** Produce n mints. Called by the loop when the sim opens spawn slots. */
    pull(n) {
      if (stopped) return;
      for (let i = 0; i < n; i++) {
        const symbol = fakeSymbol(rng);

        // Distributions roughly matched to what a pump.fun firehose actually
        // looks like: most launches are tiny, dev-heavy and unburned.
        const liquidity = Math.exp(rng.range(Math.log(600), Math.log(90000)));
        const devHolding = Math.min(0.95, Math.abs(rng.gauss(0.12, 0.14)));
        const lpBurned = rng.chance(0.28);
        const holders = Math.max(1, Math.round(Math.exp(rng.range(Math.log(3), Math.log(1400)))));

        handlers.onMint({
          mint: fakeMint(rng),
          symbol,
          name: fakeName(rng, symbol),
          createdAt: Date.now(),
          liquidity,
          marketCap: liquidity * rng.range(1.6, 14),
          holders,
          devHolding,
          lpBurned,
          priceUsd: liquidity / (1e9 * rng.range(0.4, 2.2))
        });
      }
    },

    stop() { stopped = true; }
  };
}

registerFeed('mock', (options, handlers) => createMockFeed(options, handlers));
