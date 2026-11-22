export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
}

export type WheelAction =
  | { kind: "zoom"; factor: number }
  | { kind: "pan"; dx: number; dy: number };

const LINE_PX = 16;

/**
 * Turns a wheel event into a camera action. ctrlKey (trackpad pinch, or ctrl+wheel) zooms at the cursor;
 * anything else pans (dx, dy are screen px for Camera.panBy, so content follows the scroll direction).
 */
export function wheelAction(e: WheelInput, pageHeightPx: number): WheelAction {
  const scale = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? pageHeightPx : 1;
  if (e.ctrlKey) return { kind: "zoom", factor: Math.exp(-e.deltaY * scale * 0.01) };
  return { kind: "pan", dx: -e.deltaX * scale, dy: -e.deltaY * scale };
}
