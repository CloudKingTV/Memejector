/**
 * The feel primitives.
 *
 * The brief calls inertia the biggest perceived-quality lever in the build, so
 * there is exactly one implementation of it. Nothing else in the codebase writes
 * its own `x += dx * dt` against a target; if it eases toward something, or
 * loses speed, it goes through here.
 *
 * Phase 1's momentum is all integrator plus drag: nothing is snapped to a
 * target, so nothing needs a spring yet. Springs and overshoot arrive in Phase 3
 * when a token can be grabbed, thrown and made to settle — adding them now would
 * just be dead code claiming to be the centrepiece.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential approach. Use for anything that should
 * ease toward a value with no overshoot: heat, opacity, dimming.
 */
export function expApproach(current, target, rate, dt) {
  return target + (current - target) * Math.exp(-rate * dt);
}

/** Velocity-space drag, frame-rate independent. `drag` is fraction lost per second. */
export function applyDrag(v, drag, dt) {
  return v * Math.exp(-drag * dt);
}
