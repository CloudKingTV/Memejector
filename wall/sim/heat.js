/**
 * Heat is the only visual channel that carries state.
 *
 * There is no green and no red-for-down anywhere in this project. A token is
 * born white-hot, cools to ember, sinks as ash. It reads instantly, muted, with
 * no context and no legend — which is the whole point, because most people will
 * see this as a three-second clip with the sound off.
 *
 * Every colour in the running app comes out of this file. A hex literal
 * appearing anywhere else is a bug.
 */

import { clamp } from './motion.js';

// heat -> rgb. Ordered cold to hot.
const STOPS = [
  [0.00, [ 34,  30,  27]],  // cold ash
  [0.10, [ 62,  40,  32]],  // dead ember
  [0.22, [124,  38,  22]],  // dull red
  [0.36, [190,  62,  22]],  // ember
  [0.52, [240, 104,  30]],  // orange
  [0.68, [255, 156,  54]],  // hot orange
  [0.84, [255, 206, 118]],  // yellow-white
  [1.00, [255, 246, 232]]   // white hot
];

const LUT_SIZE = 256;
const LUT = new Uint8ClampedArray(LUT_SIZE * 3);

(function buildLut() {
  for (let i = 0; i < LUT_SIZE; i++) {
    const h = i / (LUT_SIZE - 1);
    let a = STOPS[0], b = STOPS[STOPS.length - 1];
    for (let s = 0; s < STOPS.length - 1; s++) {
      if (h >= STOPS[s][0] && h <= STOPS[s + 1][0]) { a = STOPS[s]; b = STOPS[s + 1]; break; }
    }
    const span = b[0] - a[0];
    const t = span > 0 ? (h - a[0]) / span : 0;
    const o = i * 3;
    LUT[o]     = a[1][0] + (b[1][0] - a[1][0]) * t;
    LUT[o + 1] = a[1][1] + (b[1][1] - a[1][1]) * t;
    LUT[o + 2] = a[1][2] + (b[1][2] - a[1][2]) * t;
  }
})();

/** heat 0..1 -> [r,g,b] 0..255 */
export function heatRgb(heat) {
  const i = Math.round(clamp(heat, 0, 1) * (LUT_SIZE - 1)) * 3;
  return [LUT[i], LUT[i + 1], LUT[i + 2]];
}

export function heatCss(heat, alpha = 1) {
  const [r, g, b] = heatRgb(heat);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Buoyant fraction, 0..1. Cubed rather than linear on purpose: a linear falloff
 * leaves mid-heat tokens hovering forever, so almost everything drifted off the
 * right edge instead of dying. Cubed means only a genuinely hot token rises, and
 * everything else is already on its way down.
 */
export function heatLift(heat) {
  const h = clamp(heat, 0, 1);
  return h * h * h;
}

/** Radius multiplier. Cooling visibly shrinks a token before it dies. */
export function heatRadius(heat, gain) {
  return 1 - gain + gain * clamp(heat, 0, 1);
}

