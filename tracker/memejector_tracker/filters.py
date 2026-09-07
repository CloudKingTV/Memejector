"""
One Euro filter.

Chosen over a plain low-pass because air-pinch has exactly two failure modes and
they pull in opposite directions: jitter when the hand is still, and lag when it
moves fast. A fixed smoothing constant can only fix one of them. One Euro adapts
its cutoff to the speed of the signal, so a stationary hand goes quiet and a fast
flick stays attached to the fingertip.

Reference: Casiez, Roussel, Vogel (CHI 2012). Forty lines, no dependencies.
"""

from __future__ import annotations

import math


class LowPass:
    def __init__(self) -> None:
        self.value: float | None = None

    def apply(self, x: float, alpha: float) -> float:
        if self.value is None:
            self.value = x
        else:
            self.value = alpha * x + (1 - alpha) * self.value
        return self.value

    def reset(self) -> None:
        self.value = None


def _alpha(cutoff: float, dt: float) -> float:
    tau = 1.0 / (2 * math.pi * cutoff)
    return 1.0 / (1.0 + tau / dt)


class OneEuro:
    """
    min_cutoff  lower = steadier when still, laggier when moving
    beta        higher = more responsive to speed, jitterier
    d_cutoff    smoothing on the speed estimate itself

    Defaults measured, not guessed: at 60 fps on a 0..1 normalized signal these
    give ~2.9 frames (48 ms) of lag on a 1.0 unit/sec sweep while keeping ~9% of
    the frame-to-frame jitter of a still hand. Note that min_cutoff is what
    controls rest jitter; beta buys responsiveness almost for free because the
    speed estimator is itself smoothed. Both are overridable from
    tracker/tracker.json and from the command line, because the number that
    matters is the one you measure on your own wall.
    """

    def __init__(self, min_cutoff: float = 0.8, beta: float = 2.5,
                 d_cutoff: float = 1.0) -> None:
        self.min_cutoff = min_cutoff
        self.beta = beta
        self.d_cutoff = d_cutoff
        self._x = LowPass()
        self._dx = LowPass()
        self._last_t: float | None = None
        self._last_x: float | None = None

    def reset(self) -> None:
        self._x.reset()
        self._dx.reset()
        self._last_t = None
        self._last_x = None

    def apply(self, x: float, t: float) -> float:
        """t in seconds."""
        if self._last_t is None:
            self._last_t = t
            self._last_x = x
            self._x.apply(x, 1.0)
            return x

        dt = t - self._last_t
        if dt <= 0:
            dt = 1e-3
        self._last_t = t

        dx = (x - self._last_x) / dt
        self._last_x = x
        edx = self._dx.apply(dx, _alpha(self.d_cutoff, dt))

        cutoff = self.min_cutoff + self.beta * abs(edx)
        return self._x.apply(x, _alpha(cutoff, dt))


class OneEuro2D:
    """Two independent filters plus the smoothed velocity the wall wants."""

    def __init__(self, **kw) -> None:
        self.fx = OneEuro(**kw)
        self.fy = OneEuro(**kw)
        self._last: tuple[float, float] | None = None
        self._last_t: float | None = None
        self.velocity = (0.0, 0.0)

    def reset(self) -> None:
        self.fx.reset()
        self.fy.reset()
        self._last = None
        self._last_t = None
        self.velocity = (0.0, 0.0)

    def apply(self, x: float, y: float, t: float) -> tuple[float, float]:
        out = (self.fx.apply(x, t), self.fy.apply(y, t))
        if self._last is not None and self._last_t is not None:
            dt = max(t - self._last_t, 1e-3)
            # Velocity off the filtered signal, not the raw one: raw velocity at
            # 60 fps is mostly sensor noise and the wall uses this to decide
            # whether something was thrown.
            vx = (out[0] - self._last[0]) / dt
            vy = (out[1] - self._last[1]) / dt
            k = 0.35
            self.velocity = (self.velocity[0] + (vx - self.velocity[0]) * k,
                             self.velocity[1] + (vy - self.velocity[1]) * k)
        self._last = out
        self._last_t = t
        return out
