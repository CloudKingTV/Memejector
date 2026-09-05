/**
 * Light spill.
 *
 * The projector is real light hitting a real wall and real arms, and the stream
 * camera picks that up for free — but only if the bright parts of the frame are
 * actually bright and actually bleed. This pass downscales the scene to a
 * quarter, crushes the mid-tones so only hot things survive, blurs, and
 * composites back additively.
 *
 * Runs before the chrome layer so small text never blooms into mush.
 */

export function applySpill(surface, cfg) {
  const { ctx, bloom, bloomCtx, w, h } = surface;
  if (cfg.strength <= 0) return;

  bloomCtx.setTransform(1, 0, 0, 1, 0, 0);
  bloomCtx.clearRect(0, 0, bloom.width, bloom.height);

  // brightness+contrast acts as a soft threshold: contrast pivots around mid
  // grey, so the near-black background stays black and only the cores survive.
  bloomCtx.filter = `brightness(${cfg.brightness}) contrast(${cfg.contrast}) blur(${cfg.blurPx}px)`;
  bloomCtx.drawImage(surface.canvas, 0, 0, w, h, 0, 0, bloom.width, bloom.height);
  bloomCtx.filter = 'none';

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = cfg.strength;
  ctx.drawImage(bloom, 0, 0, bloom.width, bloom.height, 0, 0, w, h);
  ctx.restore();
}
