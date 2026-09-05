/**
 * Pre-rendered radial-gradient sprites, one per heat bucket.
 *
 * Drawing a cached sprite is roughly two orders of magnitude cheaper than
 * setting shadowBlur per body, which is the difference between 220 tokens at
 * 60 fps and 40 tokens at 20 fps.
 *
 * Each sprite is a hard core plus a soft halo. The core is what reads as the
 * token; the halo is what lands on the wall and on your arms.
 */

import { heatRgb } from '../sim/heat.js';

const BUCKETS = 32;
const SPRITE_PX = 128;      // drawn scaled; 128 is enough for the halo gradient

let sprites = null;

export function buildSprites() {
  sprites = [];
  for (let i = 0; i < BUCKETS; i++) {
    const heat = i / (BUCKETS - 1);
    const [r, g, b] = heatRgb(heat);
    const c = document.createElement('canvas');
    c.width = c.height = SPRITE_PX;
    const x = c.getContext('2d');
    const mid = SPRITE_PX / 2;

    // Halo. Wide, dim, and the thing that produces light spill after bloom.
    const halo = x.createRadialGradient(mid, mid, 0, mid, mid, mid);
    const lift = 0.25 + heat * 0.75;
    halo.addColorStop(0.00, `rgba(${r},${g},${b},${0.62 * lift})`);
    halo.addColorStop(0.16, `rgba(${r},${g},${b},${0.26 * lift})`);
    halo.addColorStop(0.42, `rgba(${r},${g},${b},${0.055 * lift})`);
    halo.addColorStop(1.00, `rgba(${r},${g},${b},0)`);
    x.fillStyle = halo;
    x.fillRect(0, 0, SPRITE_PX, SPRITE_PX);

    // Core. Tight, near-saturated, pushed toward white at high heat.
    const coreR = mid * (0.15 + heat * 0.08);
    const wr = Math.min(255, r + heat * heat * 70);
    const wg = Math.min(255, g + heat * heat * 70);
    const wb = Math.min(255, b + heat * heat * 70);
    const core = x.createRadialGradient(mid, mid, 0, mid, mid, coreR);
    core.addColorStop(0.0, `rgba(${wr},${wg},${wb},1)`);
    core.addColorStop(0.6, `rgba(${r},${g},${b},0.85)`);
    core.addColorStop(1.0, `rgba(${r},${g},${b},0)`);
    x.fillStyle = core;
    x.fillRect(0, 0, SPRITE_PX, SPRITE_PX);

    sprites.push(c);
  }
  return sprites;
}

export function spriteFor(heat) {
  if (!sprites) buildSprites();
  const i = Math.max(0, Math.min(BUCKETS - 1, Math.round(heat * (BUCKETS - 1))));
  return sprites[i];
}

/**
 * Draw a glowing body. `radiusPx` is the core radius; the halo extends well past
 * it, which is intentional — that overlap is what makes a dense flow read as
 * one mass of light rather than a scatter plot.
 */
export function drawBody(ctx, heat, xPx, yPx, radiusPx, alpha = 1) {
  const s = spriteFor(heat);
  const size = radiusPx * 5.2;
  const prev = ctx.globalAlpha;
  ctx.globalAlpha = prev * alpha;
  ctx.drawImage(s, xPx - size / 2, yPx - size / 2, size, size);
  ctx.globalAlpha = prev;
}
