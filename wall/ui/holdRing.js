/**
 * Press-and-hold to confirm, with a visible fill ring.
 *
 * This ships in Phase 1 guarding the only destructive action that exists yet
 * (clearing the ash). That is deliberate. The component that will eventually
 * stand between a twitchy tracking blob and a market order gets built and tuned
 * on the wall for weeks before it guards anything that costs money.
 *
 * Never a tap. Releasing early always cancels, and the ring visibly unwinds
 * rather than snapping back, so a near-miss is legible.
 */

import { clamp, expApproach } from '../sim/motion.js';
import { heatCss } from '../sim/heat.js';

export function makeHoldRing(feel) {
  let active = null;   // { id, label, onComplete }
  let progress = 0;
  let display = 0;
  let flash = 0;

  return {
    get active() { return active; },
    get progress() { return progress; },

    begin(id, label, onComplete) {
      if (active && active.id === id) return;
      active = { id, label, onComplete };
      progress = 0;
    },

    /** Called every frame with whether the key/gesture is still held. */
    update(dt, held) {
      flash = Math.max(0, flash - dt * 2.2);
      if (!active) { display = expApproach(display, 0, 12, dt); return; }

      if (held) {
        progress += dt / feel.hold.seconds;
        if (progress >= 1) {
          const done = active;
          active = null;
          progress = 0;
          flash = 1;
          done.onComplete();
        }
      } else {
        // Unwind rather than snap, so an aborted hold reads as an abort.
        progress -= dt / (feel.hold.seconds * 0.45);
        if (progress <= 0) { active = null; progress = 0; }
      }
      display = expApproach(display, progress, 22, dt);
    },

    cancel() { active = null; progress = 0; },

    draw(ctx, s, x, y) {
      if (!active && display < 0.01 && flash < 0.01) return;
      const R = feel.hold.ringRadius * (s.h / 1080);
      const p = clamp(display, 0, 1);

      ctx.save();
      ctx.translate(x, y);
      ctx.lineCap = 'round';

      // Track.
      ctx.strokeStyle = 'rgba(120,90,70,0.28)';
      ctx.lineWidth = R * 0.16;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();

      // Fill. Heats up as it completes, so the ring itself is a heat cue.
      if (p > 0.001) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = heatCss(0.35 + p * 0.6, 0.95);
        ctx.lineWidth = R * 0.20;
        ctx.beginPath();
        ctx.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      if (flash > 0) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = heatCss(1, flash * 0.8);
        ctx.lineWidth = R * 0.24 * (1 + (1 - flash));
        ctx.beginPath();
        ctx.arc(0, 0, R * (1 + (1 - flash) * 0.5), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      }

      if (active) {
        ctx.fillStyle = heatCss(0.5 + p * 0.4, 0.85);
        ctx.font = `${Math.round(R * 0.34)}px ui-monospace, "Cascadia Mono", Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(active.label, 0, R * 1.55);
      }
      ctx.restore();
    }
  };
}
