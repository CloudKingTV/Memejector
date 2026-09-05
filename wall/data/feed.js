/**
 * The feed interface. One shape, swappable implementations.
 *
 *   startFeed({ onMint, onTick, onRug }) -> stop()
 *
 * Phase 1 has one implementation (mock). Phase 5 adds Helius or the validator
 * for new mints, Birdeye/Dexscreener for pair data, Jupiter for quotes — all
 * behind this same call, so the simulation never learns where its data came from.
 *
 * A mint is deliberately the real field shape, not a convenient one:
 *
 *   {
 *     mint: string,          // base58 address
 *     symbol: string,
 *     name: string,
 *     createdAt: number,     // ms epoch
 *     liquidity: number,     // USD
 *     marketCap: number,     // USD
 *     holders: number,
 *     devHolding: number,    // 0..1 fraction of supply held by the deployer
 *     lpBurned: boolean,
 *     priceUsd: number
 *   }
 *
 * Heat and rug risk are derived from those fields rather than invented, so
 * swapping in a real feed does not mean rewriting the sim.
 */

const registry = new Map();

export function registerFeed(name, factory) {
  registry.set(name, factory);
}

export function startFeed(name, options, handlers) {
  const factory = registry.get(name);
  if (!factory) throw new Error(`unknown feed: ${name} (have: ${[...registry.keys()].join(', ')})`);
  return factory(options, handlers);
}
