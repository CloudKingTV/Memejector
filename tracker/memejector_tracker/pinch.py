"""
Pinch detection.

Two things matter here and both are easy to get wrong.

Hysteresis: the pinch closes below one threshold and opens above a higher one.
With a single threshold the signal chatters across the boundary and every grab
becomes a coin flip. The gap between the two is the difference between a gesture
and a dice roll.

Normalization by hand span: a raw thumb-to-index distance in pixels shrinks as
the arm extends. An un-normalized threshold would make pinch progressively
harder to trigger the further you reach — which is the exact direction the brief
wants to use for sizing a position, so it would fight the interaction rather
than support it.
"""

from __future__ import annotations

from .schema import Pinch, now_ms


class PinchDetector:
    def __init__(self, close_at: float = 0.32, open_at: float = 0.45,
                 debounce_ms: float = 40.0) -> None:
        if open_at <= close_at:
            raise ValueError("open_at must be above close_at or there is no hysteresis")
        self.close_at = close_at
        self.open_at = open_at
        self.debounce_ms = debounce_ms
        self.closed = False
        self.since = now_ms()
        self._pending: bool | None = None
        self._pending_since = 0.0

    def update(self, value: float, t_ms: float | None = None) -> Pinch:
        """
        value: thumb-tip to index-tip distance, already divided by hand span.
        """
        t = now_ms() if t_ms is None else t_ms
        want = self.closed
        if not self.closed and value < self.close_at:
            want = True
        elif self.closed and value > self.open_at:
            want = False

        if want != self.closed:
            # A state change has to hold for debounce_ms before it counts. One
            # bad frame of landmark noise should not fire a buy.
            if self._pending != want:
                self._pending = want
                self._pending_since = t
            elif t - self._pending_since >= self.debounce_ms:
                self.closed = want
                self.since = t
                self._pending = None
        else:
            self._pending = None

        return Pinch(closed=self.closed, value=value, since=self.since)

    def reset(self) -> None:
        self.closed = False
        self.since = now_ms()
        self._pending = None
