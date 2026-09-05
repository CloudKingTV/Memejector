/**
 * Keyboard for Phase 1.
 *
 * Two kinds of input: discrete actions that fire once on press, and held keys
 * that the loop samples every frame (flow rate, silhouette nudging, and the
 * hold-to-confirm on clearing the ash).
 */

const DISCRETE = {
  Space: 'pause',
  KeyR: 'rug',
  KeyS: 'silhouette',
  KeyF: 'fullscreen',
  KeyT: 'reloadFeel',
  KeyK: 'kill',
  KeyD: 'debug',
  BracketLeft: 'seedPrev',
  BracketRight: 'seedNext',
  Slash: 'help'
};

const HELD = {
  ArrowUp: 'flowUp',
  ArrowDown: 'flowDown',
  Comma: 'silLeft',
  Period: 'silRight',
  Semicolon: 'silNarrow',
  Quote: 'silWiden',
  KeyC: 'clear'
};

export function makeKeys() {
  const down = new Set();
  const queue = [];

  function onDown(e) {
    if (e.repeat) {
      // Held keys still need their state; discrete ones must not re-fire.
      if (HELD[e.code]) down.add(e.code);
      return;
    }
    if (DISCRETE[e.code] || HELD[e.code]) e.preventDefault();
    down.add(e.code);
    const action = DISCRETE[e.code];
    if (action) queue.push({ action, shift: e.shiftKey, alt: e.altKey });
  }

  function onUp(e) {
    down.delete(e.code);
  }

  // A key held while the window loses focus would otherwise stay stuck down —
  // which on a wall terminal means a hold-to-confirm that completes on its own.
  function onBlur() { down.clear(); }

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    /** Discrete actions since the last call. */
    drain() {
      const out = queue.slice();
      queue.length = 0;
      return out;
    },
    /** Is a held-action key currently down? */
    held(action) {
      for (const code in HELD) if (HELD[code] === action && down.has(code)) return true;
      return false;
    },
    isDown(code) { return down.has(code); },
    destroy() {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    }
  };
}
