/**
 * Canvas setup. One visible canvas, one quarter-resolution offscreen for bloom.
 *
 * Canvas2D rather than WebGL: pre-rendered gradient sprites with additive
 * compositing handle a few hundred glowing bodies at 1080p comfortably, and the
 * light spill comes out of a downscale-blur-composite pass that needs no
 * dependencies. If that stops selling the ignition moment, WebGL is a contained
 * swap inside this directory.
 */

export function makeSurface(canvas, bloomScale = 0.25) {
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const bloom = document.createElement('canvas');
  const bloomCtx = bloom.getContext('2d', { alpha: true });

  const surface = {
    canvas, ctx, bloom, bloomCtx,
    w: 0, h: 0, dpr: 1,
    /** Reference length for anything that should scale with the projection. */
    get unit() { return surface.h; }
  };

  function resize() {
    // The projector is fixed-pixel; DPR above 1 buys nothing but fill rate.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.round(window.innerWidth * dpr);
    const h = Math.round(window.innerHeight * dpr);
    if (w === surface.w && h === surface.h && dpr === surface.dpr) return;

    surface.dpr = dpr;
    surface.w = canvas.width = w;
    surface.h = canvas.height = h;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';

    bloom.width = Math.max(1, Math.round(w * bloomScale));
    bloom.height = Math.max(1, Math.round(h * bloomScale));

    ctx.imageSmoothingEnabled = true;
    bloomCtx.imageSmoothingEnabled = true;
    if (surface.onResize) surface.onResize(surface);
  }

  surface.resize = resize;
  window.addEventListener('resize', resize);
  resize();
  return surface;
}

