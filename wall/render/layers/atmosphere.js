/**
 * The center. Atmosphere only, never content.
 *
 * Dead center is where the operator's torso sits, so by rule nothing readable
 * goes here. What does go here is the thing the silhouette is read against: a
 * warm haze that the body occludes, and a vignette that pushes attention out to
 * the horseshoe where the actual interface lives.
 */

import { heatCss } from '../../sim/heat.js';

export function drawAtmosphere(ctx, s, world, feel, ambient) {
  const a = feel.atmosphere;
  const cx = world.silhouette.cx * s.w;
  const cy = world.silhouette.cy * s.h;

  // Ambient haze, warmed by how much heat is currently on the wall. A busy
  // session literally lights the room more than a quiet one.
  const radius = a.hazeRadius * s.h;
  const g = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, radius);
  const warmth = 0.25 + ambient * 0.75;
  g.addColorStop(0, heatCss(0.30 + ambient * 0.28, a.hazeStrength * warmth));
  g.addColorStop(0.55, heatCss(0.18 + ambient * 0.2, a.hazeStrength * 0.32 * warmth));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, s.h);
  ctx.restore();
}

export function drawVignette(ctx, s, feel) {
  const v = feel.atmosphere.vignette;
  if (v <= 0) return;
  const g = ctx.createRadialGradient(
    s.w / 2, s.h / 2, Math.min(s.w, s.h) * 0.30,
    s.w / 2, s.h / 2, Math.max(s.w, s.h) * 0.72
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${v})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s.w, s.h);
}

/** Debug only: the ellipse the flow is parting around. Toggled with S. */
export function drawSilhouetteOutline(ctx, s, sil) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,150,70,0.45)';
  ctx.setLineDash([6, 10]);
  ctx.lineWidth = Math.max(1, s.h * 0.0015);
  ctx.beginPath();
  ctx.ellipse(sil.cx * s.w, sil.cy * s.h, sil.rx * s.w, sil.ry * s.h, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,150,70,0.16)';
  ctx.beginPath();
  ctx.ellipse(sil.cx * s.w, sil.cy * s.h,
    sil.rx * s.w * (1 + 0.38), sil.ry * s.h * (1 + 0.38), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
