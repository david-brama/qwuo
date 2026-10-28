/**
 * Presenter keyboard / clicker mapping for the projector page. The functions
 * are self-contained so the page can embed them with Function#toString.
 */

export type KeyNav = "next" | "back" | null;

export type KeyInput = {
  key: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export type KeyContext = {
  /** Focus is in a text field, select, slider or the filter panel. */
  typing: boolean;
  /** QR modal or Reset confirm is open. */
  modalOpen: boolean;
  /** Focus is on a button: Space/Enter activate it natively instead. */
  onButton: boolean;
};

/** Minimum gap between two key-driven steps (clickers can double-send). */
export const KEY_NAV_DEBOUNCE_MS = 400;

/**
 * → / PageDown / Space / Enter = Next; ← / PageUp = Back (clickers send
 * PageUp/PageDown). Held keys (repeat), modifier chords, typing and open
 * modals are ignored. No key maps to Reset.
 */
export function projectorKeyAction(e: KeyInput, ctx: KeyContext): KeyNav {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.typing || ctx.modalOpen) return null;
  switch (e.key) {
    case "ArrowRight":
    case "PageDown":
      return "next";
    case " ":
    case "Spacebar":
    case "Enter":
      return ctx.onButton ? null : "next";
    case "ArrowLeft":
    case "PageUp":
      return "back";
    default:
      return null;
  }
}

/** True when enough time passed since the last key-driven step. */
export function keyNavAllowed(
  nowMs: number,
  lastNavMs: number,
  debounceMs: number,
): boolean {
  return nowMs - lastNavMs >= debounceMs;
}
