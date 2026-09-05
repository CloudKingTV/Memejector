/**
 * Named zones in normalized 0..1 space, origin top-left of the projected rect.
 *
 * The whole horseshoe is declared here even though Phase 1 only draws in three
 * of these regions. That is deliberate: it keeps the Phase 1 composition honest
 * about the space later phases need, so spatial persistence (Phase 4) is filling
 * in a map that already exists rather than fighting for room.
 *
 * Rule from the brief: nothing readable ever lands inside SILHOUETTE.
 */

export const ZONES = {
  // Dead center. Atmosphere only, never content. Runtime-adjustable on the wall
  // (, . nudge x, ; ' nudge width) and persisted, so it can be fitted to a real
  // body shadow once and left alone.
  SILHOUETTE: { cx: 0.50, cy: 0.63, rx: 0.115, ry: 0.40 },

  // Phase 1: the flow. Phase 4: new launches, same band.
  LAUNCH_STREAM: { x: 0.00, y: 0.03, w: 1.00, h: 0.34 },

  // Phase 4. Empty in Phase 1, and staying empty on purpose.
  BAGS:      { x: 0.025, y: 0.60, w: 0.26, h: 0.26 },
  WATCHLIST: { x: 0.735, y: 0.34, w: 0.24, h: 0.32 },

  // Phase 1: the pile and the scars.
  ASH_FLOOR: { x: 0.00, y: 0.72, w: 1.00, h: 0.28 },

  // Peripheral chrome. Small numbers only.
  HUD_TL: { x: 0.022, y: 0.045 },
  HUD_TR: { x: 0.978, y: 0.045 },
  HUD_BL: { x: 0.022, y: 0.955 },
  HUD_BR: { x: 0.978, y: 0.955 }
};

/**
 * Signed-ish distance to the silhouette ellipse: <1 inside, 1 on the boundary.
 * Shared by the force field and the "is this text about to land on my chest"
 * assertions in the chrome layer.
 */
export function ellipseDistance(s, x, y) {
  const dx = (x - s.cx) / s.rx;
  const dy = (y - s.cy) / s.ry;
  return Math.hypot(dx, dy);
}
