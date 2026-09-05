/**
 * The force field over the projected rect.
 *
 * Tokens are not on scripted paths. They sample this field and get pushed, which
 * is why the flow parts around the silhouette instead of clipping through it,
 * and why two runs with different seeds don't look like the same conveyor belt.
 *
 * The silhouette is an ellipse here. Later it can be a real body mask derived
 * from the camera and nothing downstream has to change — the field is the seam.
 */

import { clamp, smoothstep } from './motion.js';
import { heatLift } from './heat.js';

/* --- cheap value noise, two octaves, curled ------------------------------- */

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** Scalar potential. Curl of this gives a divergence-free (swirling) flow. */
function potential(x, y, t, scale, driftRate) {
  const ty = y + t * driftRate;
  return valueNoise(x * scale, ty * scale) * 0.65
       + valueNoise(x * scale * 2.7 + 13.1, ty * scale * 2.7 - 7.3) * 0.35;
}

/* --- the field ------------------------------------------------------------ */

export function makeField(feel) {
  let cfg = feel;
  const EPS = 0.004;

  function curl(x, y, t) {
    const s = cfg.flow.curlScale, d = cfg.flow.curlDrift;
    const dpdy = (potential(x, y + EPS, t, s, d) - potential(x, y - EPS, t, s, d)) / (2 * EPS);
    const dpdx = (potential(x + EPS, y, t, s, d) - potential(x - EPS, y, t, s, d)) / (2 * EPS);
    return [dpdy, -dpdx];
  }

  /**
   * Repulsion from the silhouette, plus a tangential component in the direction
   * of drift. Without the tangential term tokens dam up against the front face
   * of the ellipse instead of sliding around it — the difference between water
   * parting around a rock and water hitting a wall.
   */
  function silhouette(x, y, sil) {
    const nx = (x - sil.cx) / sil.rx;
    const ny = (y - sil.cy) / sil.ry;
    const d = Math.hypot(nx, ny);
    const outer = 1 + sil.margin;
    if (d > outer || d < 1e-6) return [0, 0];

    // Gradient of the ellipse field, in world space.
    let gx = 2 * (x - sil.cx) / (sil.rx * sil.rx);
    let gy = 2 * (y - sil.cy) / (sil.ry * sil.ry);
    const gl = Math.hypot(gx, gy) || 1;
    gx /= gl; gy /= gl;

    // Hard near the body, easing off through the margin.
    const strength = smoothstep(outer, 0.55, d) * sil.push;

    // Slide around, perpendicular to the gradient, pushed away from the waist:
    // anything above centre height goes up and over, anything below goes under,
    // and the two streams rejoin behind. The sign matters — get it backwards and
    // the whole flow funnels down one flank and piles into a single column.
    const tangential = sil.tangential * strength * (y > sil.cy ? -1 : 1);
    return [
      gx * strength - gy * tangential,
      gy * strength + gx * tangential
    ];
  }

  return {
    setFeel(next) { cfg = next; },

    /**
     * @param gravityScale lets motes drift lazily through the same field the
     *        tokens are falling through, without a second field to keep in sync.
     * @returns [ax, ay] acceleration in normalized units/sec^2
     */
    sample(x, y, heat, t, sil, gravityScale = 1) {
      const f = cfg.flow;

      // Global drift: the stream runs left to right.
      let ax = f.driftX;
      let ay = 0;

      // Hot rises, cold sinks. This is the whole life arc of a token in one line.
      ay += (f.gravity - f.buoyancy * heatLift(heat)) * gravityScale;

      const [cx, cy] = curl(x, y, t);
      ax += cx * f.curlStrength;
      ay += cy * f.curlStrength;

      const [sx, sy] = silhouette(x, y, sil);
      ax += sx;
      ay += sy;

      // Soft ceiling and left wall so nothing escapes upward off the top.
      if (y < 0.02) ay += (0.02 - y) * 4;

      return [ax, ay];
    },

    /** Exposed for the debug overlay. */
    silhouetteForce: silhouette
  };
}
