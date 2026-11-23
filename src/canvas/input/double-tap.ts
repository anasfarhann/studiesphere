const DOUBLE_TAP_MS = 350;
const DOUBLE_TAP_DIST = 24;
const TAP_PRESS_MS = 300;
const TAP_MOVE = 10;

/** Recognises two quick, still taps near each other (screen pixels). */
export class DoubleTap {
  private downs = new Map<number, { t: number; x: number; y: number }>();
  private last: { t: number; x: number; y: number } | null = null;

  down(id: number, x: number, y: number, now = Date.now()): void {
    this.downs.set(id, { t: now, x, y });
  }

  /** True when a press at (x, y) right now is the second tap of a double tap. */
  isSecond(x: number, y: number, now = Date.now()): boolean {
    const p = this.last;
    return !!p && now - p.t <= DOUBLE_TAP_MS && Math.hypot(x - p.x, y - p.y) <= DOUBLE_TAP_DIST;
  }

  /** Pointer lifted: remember it if it was a tap. */
  up(id: number, x: number, y: number, now = Date.now()): void {
    const d = this.downs.get(id);
    this.downs.delete(id);
    this.last = d && now - d.t <= TAP_PRESS_MS && Math.hypot(x - d.x, y - d.y) <= TAP_MOVE ? { t: now, x, y } : null;
  }

  forget(id: number): void {
    this.downs.delete(id);
  }

  reset(): void {
    this.last = null;
  }
}
