export type InputKind = "pen" | "touch" | "mouse";
export type Gesture = { kind: "draw" } | { kind: "pan" } | { kind: "pinch" } | { kind: "ignore" };

/**
 * Decides what a new pointer does. Owns the pen-only state: once an Apple Pencil (pointerType 'pen')
 * has been seen, fingers and palms never draw — one finger pans, two pinch.
 */
export class InputRouter {
  penSeen = false;
  /** 'auto' = pen-only as soon as a pen has been seen. */
  penOnly: boolean | "auto" = "auto";

  get isPenOnly(): boolean {
    return this.penOnly === "auto" ? this.penSeen : this.penOnly;
  }

  classify(e: { pointerType: InputKind; activeTouches: number }): Gesture {
    if (e.pointerType === "pen") {
      this.penSeen = true;
      return { kind: "draw" };
    }
    if (e.pointerType === "mouse") return { kind: "draw" };
    if (e.activeTouches <= 0) return { kind: "ignore" };
    if (e.activeTouches >= 2) return { kind: "pinch" };
    return this.isPenOnly ? { kind: "pan" } : { kind: "draw" };
  }
}
