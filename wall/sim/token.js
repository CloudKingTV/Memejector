/**
 * Token lifecycle.
 *
 *   live -> dying -> lands on the pile, becomes ash
 *     \-> rugging -> blows apart into fragments, burns a permanent scar
 *
 * Heat is the state. Everything visible about a token is derived from it.
 */

import { clamp, expApproach, applyDrag } from './motion.js';
import { heatRadius } from './heat.js';

export const STATE = {
  LIVE: 'live',
  DYING: 'dying',
  RUGGING: 'rugging'
};

export function makeToken(mint, feel, rng) {
  const t = feel.token;
  return {
    // identity, straight from the feed
    mint: mint.mint,
    symbol: mint.symbol,
    liquidity: mint.liquidity,
    marketCap: mint.marketCap,
    holders: mint.holders,
    devHolding: mint.devHolding,
    lpBurned: mint.lpBurned,
    bornAt: mint.createdAt,

    // physical state (prev is kept so render can interpolate between sim steps)
    x: -0.04,
    y: feel.flow.spawnBandTop + rng.biasLow(feel.flow.spawnBandBias)
       * (feel.flow.spawnBandBottom - feel.flow.spawnBandTop),
    px: -0.04,
    py: 0,
    vx: rng.range(0.02, 0.06),
    vy: rng.range(-0.01, 0.01),

    // heat
    heat: rng.range(0.88, 1.0),
    coolRate: rng.range(t.coolRateMin, t.coolRateMax) * (mint.lpBurned ? 0.8 : 1.15),
    pumpLeft: 0,
    pumpsRemaining: rng.chance(t.pumpChance) ? rng.int(1, 2) : 0,
    nextPumpIn: rng.range(1.5, 7),

    // fate. Dev holding a big bag and unburned LP is what actually rugs.
    rugRisk: t.rugBaseChance * (1 + mint.devHolding * 9) * (mint.lpBurned ? 0.25 : 1),

    state: STATE.LIVE,
    fade: 1,
    age: 0,
    wobble: rng.range(0, Math.PI * 2),
    wobbleRate: rng.range(0.6, 1.5),
    size: 0.7 + rng.biasLow(2.2) * 0.9,  // most mints are small

    // How hard this one gets carried downstream. Without the spread every
    // token traces the same arc and the flow reads as a single wedge across
    // one corner of the wall instead of filling it.
    driftScale: clamp(rng.gauss(1, 0.38), 0.35, 2.1)
  };
}

export function radiusOf(tok, feel) {
  return feel.token.baseRadius * tok.size * heatRadius(tok.heat, feel.token.radiusHeatGain);
}

/**
 * Advance one fixed step. Returns 'alive' | 'died' | 'rugged'.
 * The caller owns what happens on death; a token never touches the ledger.
 */
export function stepToken(tok, dt, field, feel, sil, time, rng) {
  tok.px = tok.x;
  tok.py = tok.y;
  tok.age += dt;
  tok.wobble += tok.wobbleRate * dt;

  if (tok.state === STATE.LIVE) {
    // Pumps: a token that spikes back up is what makes the flow worth watching.
    if (tok.pumpLeft > 0) {
      tok.pumpLeft -= dt;
      tok.heat = clamp(tok.heat + feel.token.pumpHeat * dt * 1.8, 0, 1);
    } else {
      tok.heat = expApproach(tok.heat, 0, tok.coolRate, dt);
      if (tok.pumpsRemaining > 0) {
        tok.nextPumpIn -= dt;
        if (tok.nextPumpIn <= 0) {
          tok.pumpsRemaining--;
          tok.pumpLeft = rng.range(0.4, feel.token.pumpDurationMax);
          tok.nextPumpIn = rng.range(2.5, 9);
        }
      }
    }

    // rugRisk is a per-second probability, so the step scales it directly.
    if (rng.float() < tok.rugRisk * dt) {
      tok.state = STATE.RUGGING;
      return 'rugged';
    }

    if (tok.heat <= feel.token.deathHeat) tok.state = STATE.DYING;
  }

  if (tok.state === STATE.DYING) {
    // No timed fade. A dead token is heavy: it sinks, lands, and becomes part of
    // the pile. "Most die on their own and fall off the bottom" is literal.
    tok.heat = expApproach(tok.heat, 0, tok.coolRate * 1.6, dt);
  }

  const [ax, ay] = field.sample(tok.x, tok.y, tok.heat, time, sil);
  const own = feel.flow.driftX * (tok.driftScale - 1);
  tok.vx = applyDrag(tok.vx + (ax + own) * dt, feel.flow.drag, dt);
  tok.vy = applyDrag(tok.vy + ay * dt, feel.flow.drag, dt);
  tok.x += tok.vx * dt;
  tok.y += tok.vy * dt;

  // Left the field entirely. Landing on the pile is the caller's call, because
  // only the caller knows how high the pile currently is.
  if (tok.y > 1.06 || tok.x > 1.10) return 'gone';
  return 'alive';
}
