/**
 * Tokens, fragments and shockwaves.
 *
 * Everything here draws additively over black, because that is what light on a
 * wall does. Positions are interpolated between the last two sim states so
 * motion stays smooth even when the sim step and the display refresh disagree.
 */

import { drawBody } from '../sprites.js';
import { heatCss, heatRgb } from '../../sim/heat.js';
import { radiusOf } from '../../sim/token.js';
import { clamp } from '../../sim/motion.js';
import { ellipseDistance } from '../../config/layout.js';

/**
 * Echoes of the body along its own velocity vector.
 *
 * Cheaper than a real position history and it reads better on the wall: a fast
 * token smears into a streak, a hovering one stays a point, and the whole field
 * suddenly has a direction. This is most of what makes the flow look like flow
 * rather than a scatter plot that happens to be animating.
 */
function trail(ctx, heat, x, y, vx, vy, r, alpha, steps, lag, s) {
  const speed = Math.hypot(vx, vy);
  if (speed < 0.012) return;
  for (let i = 1; i <= steps; i++) {
    const back = i * lag;
    const t = 1 - i / (steps + 1);
    drawBody(ctx, heat * (0.72 + t * 0.28),
      x - vx * back * s.w, y - vy * back * s.h,
      r * (0.32 + t * 0.5), alpha * t * 0.5);
  }
}

/** Motes: atmosphere, not content. Drawn under everything else. */
export function drawMotes(ctx, s, world, feel, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of world.motes) {
    const x = (m.px + (m.x - m.px) * alpha) * s.w;
    const y = (m.py + (m.y - m.py) * alpha) * s.h;
    drawBody(ctx, m.heat, x, y, m.r * s.h, 0.85);
  }
  ctx.restore();
}

export function drawFlow(ctx, s, world, feel, alpha) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Detonation rings first, behind the bodies. Deliberately tight and short:
  // a rug collapses, it does not announce itself across the whole wall. The
  // full-wall shockwave is reserved for a buy in Phase 3, and it stops meaning
  // anything if a rug already spends it.
  for (const wv of world.shockwaves) {
    const t = wv.t / wv.life;
    const cx = wv.x * s.w, cy = wv.y * s.h;

    // The detonation flash. Short, white, and violent — a rug is the one thing
    // on this wall that is allowed to be ugly, and it has to land in the first
    // two frames or the moment is gone.
    const fl = Math.max(0, 1 - t / feel.rug.flashFraction);
    if (fl > 0) {
      const fr = feel.rug.flashRadius * s.h * (0.35 + wv.size * 0.65) * (0.4 + (1 - fl) * 1.4);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, fr);
      g.addColorStop(0, `rgba(255,250,238,${0.95 * fl * fl})`);
      g.addColorStop(0.28, `rgba(255,168,72,${0.55 * fl * fl})`);
      g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cx - fr, cy - fr, fr * 2, fr * 2);
    }

    const r = t * feel.rug.shockwaveSpeed * s.h;
    const fade = (1 - t) * (1 - t);
    const [cr, cg, cb] = heatRgb(0.34 + wv.power * 0.3);
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.72 * fade})`;
    ctx.lineWidth = feel.rug.shockwaveWidth * s.h * (1 - t * 0.75);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const steps = feel.token.trailSteps;
  const lag = feel.token.trailSeconds;

  for (const tok of world.tokens) {
    const x = (tok.px + (tok.x - tok.px) * alpha) * s.w;
    const y = (tok.py + (tok.y - tok.py) * alpha) * s.h;
    const wob = Math.sin(tok.wobble) * 0.06 + 1;
    const r = radiusOf(tok, feel) * s.h * wob;
    const a = clamp(tok.fade, 0, 1);
    trail(ctx, tok.heat, x, y, tok.vx, tok.vy, r, a, steps, lag, s);
    drawBody(ctx, tok.heat, x, y, r, a);
  }

  for (const f of world.fragments) {
    const x = (f.px + (f.x - f.px) * alpha) * s.w;
    const y = (f.py + (f.y - f.py) * alpha) * s.h;
    const life = 1 - clamp(f.age / f.life, 0, 1);
    const r = f.r * s.h * (0.5 + life * 0.5);
    trail(ctx, f.heat, x, y, f.vx, f.vy, r, life, steps, lag * 0.7, s);
    drawBody(ctx, f.heat, x, y, r, life);
  }

  ctx.restore();
}

/**
 * Symbols. Small, dim, and only on tokens hot enough to be worth reading — the
 * brief wants motion and colour carrying the signal with numbers peripheral, so
 * this is deliberately restrained. Never drawn inside the silhouette.
 */
export function drawFlowLabels(ctx, s, world, feel) {
  const sil = world.silhouette;
  ctx.save();
  ctx.font = `${Math.round(feel.chrome.fontPx * s.h / 1080 * 1.1)}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (const tok of world.tokens) {
    if (tok.heat < 0.55 || tok.size < 1.05) continue;
    const nxp = tok.x, nyp = tok.y;
    if (ellipseDistance(sil, nxp, nyp) < 1.25) continue;   // never on the torso
    if (nxp < 0.02 || nxp > 0.98) continue;
    // Keep out of the HUD corners, or the tally ends up underneath a ticker.
    if (nyp < 0.115 && (nxp < 0.20 || nxp > 0.80)) continue;
    if (nyp > 0.885 && (nxp < 0.20 || nxp > 0.80)) continue;

    const r = radiusOf(tok, feel) * s.h;
    ctx.fillStyle = heatCss(Math.min(1, tok.heat + 0.15), (tok.heat - 0.55) / 0.45 * 0.8);
    ctx.fillText(tok.symbol, nxp * s.w, nyp * s.h + r * 1.5);
  }
  ctx.restore();
}
