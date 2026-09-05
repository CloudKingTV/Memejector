/**
 * Trading mode.
 *
 * Paper is the default and there is no code path in Phase 1 that can change it.
 * Live mode will require an explicit flag that does not exist yet, and when it
 * does, it will still be gated behind a delegated key with a hard per-session
 * spend cap — never a main wallet.
 *
 * The badge is on the wall from Phase 1 so the stream can always see which mode
 * is running, and so the absence of the badge is immediately wrong.
 */

export const MODE = Object.freeze({
  PAPER: 'PAPER',
  LIVE: 'LIVE'
});

export const currentMode = MODE.PAPER;

/** Kill switch. Freezes order execution instantly. Nothing to freeze yet. */
export function makeKillSwitch() {
  let armed = false;
  return {
    get engaged() { return armed; },
    toggle() { armed = !armed; return armed; },
    engage() { armed = true; },
    release() { armed = false; },
    /** Every order path in Phase 6 asks this before doing anything. */
    assertClear() {
      if (armed) throw new Error('kill switch engaged');
    }
  };
}
