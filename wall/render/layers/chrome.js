/**
 * Peripheral chrome. Small numbers, corners only.
 *
 * Two rules from the brief drive everything in this file: numbers stay small and
 * peripheral because motion and colour carry the signal, and nothing readable
 * ever lands where a torso sits. Every draw call here is anchored to a corner.
 */

import { heatCss } from '../../sim/heat.js';
import { ZONES } from '../../config/layout.js';
import { currentMode } from '../../safety/mode.js';

function font(s, feel, scale = 1) {
  return `${Math.round(feel.chrome.fontPx * (s.h / 1080) * scale)}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
}

export function drawChrome(ctx, s, world, feel, state) {
  const dim = feel.chrome.dim;
  ctx.save();
  ctx.font = font(s, feel);
  ctx.textBaseline = 'top';

  // Top-left: mode. Always present, always first thing on the wall.
  const tl = ZONES.HUD_TL;
  ctx.textAlign = 'left';
  const modeAlpha = state.killed ? 0.55 + Math.sin(world.time * 6) * 0.35 : 0.85;
  ctx.fillStyle = state.killed ? `rgba(255,90,40,${modeAlpha})` : heatCss(0.62, 0.7);
  ctx.fillText(state.killed ? 'FROZEN' : currentMode, tl.x * s.w, tl.y * s.h);

  ctx.fillStyle = heatCss(0.30, dim);
  ctx.fillText(`seed ${world.seed}`, tl.x * s.w, tl.y * s.h + s.h * 0.026);
  if (state.paused) {
    ctx.fillStyle = heatCss(0.75, 0.8);
    ctx.fillText('PAUSED', tl.x * s.w, tl.y * s.h + s.h * 0.052);
  }

  // Top-right: what the flow is doing.
  const tr = ZONES.HUD_TR;
  ctx.textAlign = 'right';
  ctx.fillStyle = heatCss(0.34, dim);
  ctx.fillText(`flow ×${world.flowMultiplier.toFixed(2)}`, tr.x * s.w, tr.y * s.h);
  ctx.fillText(`${world.tokens.length} live`, tr.x * s.w, tr.y * s.h + s.h * 0.026);

  // Bottom-left: the tally. This is the number that should make you wince.
  const bl = ZONES.HUD_BL;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const st = world.ledger.stats;
  ctx.fillStyle = heatCss(0.22, dim * 0.9);
  ctx.fillText(`${st.died} ash`, bl.x * s.w, bl.y * s.h - s.h * 0.026);
  ctx.fillStyle = heatCss(0.42, dim + 0.15);
  ctx.fillText(`${st.rugged} rugged`, bl.x * s.w, bl.y * s.h);

  // Bottom-right: how to find the help.
  const br = ZONES.HUD_BR;
  ctx.textAlign = 'right';
  ctx.fillStyle = heatCss(0.18, dim * 0.7);
  ctx.fillText('?', br.x * s.w, br.y * s.h);

  ctx.restore();
}

const KEYMAP = [
  ['Space', 'pause / resume'],
  ['↑ ↓', 'flow rate'],
  ['R', 'rug a random token'],
  ['Shift+R', 'rug the hottest token'],
  ['S', 'silhouette outline'],
  [', .', 'nudge silhouette left / right'],
  ['; \'', 'narrow / widen silhouette'],
  ['F', 'fullscreen'],
  ['T', 'reload feel.json'],
  ['C', 'clear ash + scars (hold)'],
  ['[ ]', 'previous / next seed'],
  ['K', 'kill switch'],
  ['D', 'debug HUD'],
  ['?', 'this list']
];

export function drawHelp(ctx, s, feel) {
  const pad = s.h * 0.035;
  const lh = s.h * 0.032;
  const w = s.w * 0.30;
  const h = lh * (KEYMAP.length + 1.6);
  const x = s.w - w - pad;
  const y = s.h * 0.5 - h / 2;

  ctx.save();
  ctx.fillStyle = 'rgba(10,8,7,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = heatCss(0.28, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);

  ctx.font = font(s, feel);
  ctx.textBaseline = 'middle';
  KEYMAP.forEach(([key, desc], i) => {
    const ly = y + lh * (i + 1.2);
    ctx.textAlign = 'left';
    ctx.fillStyle = heatCss(0.55, 0.85);
    ctx.fillText(key, x + s.w * 0.014, ly);
    ctx.fillStyle = heatCss(0.22, 0.7);
    ctx.fillText(desc, x + s.w * 0.075, ly);
  });
  ctx.restore();
}

export function drawDebug(ctx, s, world, feel, perf) {
  const pad = s.h * 0.035;
  ctx.save();
  ctx.font = font(s, feel, 0.9);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = [
    `${perf.fps.toFixed(1)} fps`,
    `sim   ${perf.sim.toFixed(2)} ms`,
    `draw  ${perf.draw.toFixed(2)} ms`,
    `bloom ${perf.bloom.toFixed(2)} ms`,
    `tokens ${world.tokens.length}  frags ${world.fragments.length}`,
    `waves ${world.shockwaves.length}  scars ${world.ledger.scars.length}`,
    `${s.w}×${s.h} @ dpr ${s.dpr}`
  ];
  const top = s.h * 0.14;
  const lh = s.h * 0.024;
  // Backing panel: without it the readout sits on top of the flow and neither
  // is legible.
  ctx.fillStyle = 'rgba(10,8,7,0.82)';
  ctx.fillRect(pad - lh * 0.5, top - lh * 0.5, s.w * 0.16, lh * (lines.length + 0.6));
  ctx.fillStyle = heatCss(0.45, 0.85);
  lines.forEach((l, i) => ctx.fillText(l, pad, top + i * lh));
  ctx.restore();
}

/** Shown when feel.json is reloaded, so a tuning session has feedback. */
export function drawToast(ctx, s, feel, text, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.font = font(s, feel);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = heatCss(0.7, alpha * 0.9);
  ctx.fillText(text, s.w / 2, s.h * 0.055);
  ctx.restore();
}
