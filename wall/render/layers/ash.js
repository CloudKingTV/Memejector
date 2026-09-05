/**
 * The floor. The pile and the scars.
 *
 * This is the layer that makes the wall messier at the end of a session than at
 * the start, and it is the one thing here that no other trading UI has. It does
 * not clear, it does not fade politely, and it survives a reload.
 */

import { heatRgb } from '../../sim/heat.js';

export function drawAsh(ctx, s, world) {
  const led = world.ledger;
  const heights = led.heights;
  const n = led.columns;
  if (!n) return;

  const colW = s.w / (n - 1);

  // Body of the pile.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, s.h);
  for (let i = 0; i < n; i++) {
    ctx.lineTo(i * colW, s.h - heights[i] * s.h);
  }
  ctx.lineTo(s.w, s.h);
  ctx.closePath();

  const top = s.h - Math.max(0.02, maxOf(heights)) * s.h;
  const g = ctx.createLinearGradient(0, top, 0, s.h);
  g.addColorStop(0, 'rgba(48,40,35,0.95)');
  g.addColorStop(0.35, 'rgba(28,24,21,0.98)');
  g.addColorStop(1, 'rgba(14,12,11,1)');
  ctx.fillStyle = g;
  ctx.fill();

  // Rim. A faint ember edge along the crest, so the pile reads as something that
  // used to be hot rather than a grey shape at the bottom of the screen.
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x = i * colW, y = s.h - heights[i] * s.h;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(120,58,30,0.24)';
  ctx.lineWidth = Math.max(1, s.h * 0.0016);
  ctx.stroke();
  ctx.restore();
}

/**
 * Scars. Permanent. Each rug burns one at the x where it happened and it stays
 * there for the life of the ledger, including across restarts.
 */
export function drawScars(ctx, s, world, feel) {
  const led = world.ledger;
  if (!led.scars.length) return;
  const w = feel.scar.width * s.w;

  ctx.save();
  for (const scar of led.scars) {
    const x = scar.x * s.w;
    const col = Math.max(0, Math.min(led.columns - 1, Math.floor(scar.x * led.columns)));
    const floorY = s.h - led.heights[col] * s.h;
    // Deterministic per-scar jitter so no two burns are the same width and the
    // floor does not end up looking like a bar chart.
    const jitter = 0.7 + (Math.sin(scar.x * 997.3) * 0.5 + 0.5) * 0.8;
    const w2 = w * jitter;
    const height = s.h * 0.085 * (0.5 + scar.intensity) * jitter;
    const [r, g, b] = heatRgb(0.20);

    // Soot smeared up out of the wound, elliptical rather than rectangular.
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(x, floorY, w2, height, 0, 0, Math.PI * 2);
    ctx.clip();
    const grad = ctx.createLinearGradient(0, floorY - height, 0, floorY + height);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.42, `rgba(${r},${g},${b},${0.34 * scar.intensity})`);
    grad.addColorStop(1, `rgba(8,5,4,${0.75 * scar.intensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(x - w2, floorY - height, w2 * 2, height * 2);
    ctx.restore();

    // A dull ember still sitting in it. This is the only thing on the wall that
    // never cools all the way down.
    ctx.globalCompositeOperation = 'lighter';
    const e = ctx.createRadialGradient(x, floorY, 0, x, floorY, w2 * 0.8);
    e.addColorStop(0, `rgba(${r + 46},${g + 14},${b},${0.22 * scar.intensity})`);
    e.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = e;
    ctx.fillRect(x - w2, floorY - w2, w2 * 2, w2 * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function maxOf(arr) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
  return m;
}
