/** A screen-space point in CSS px. */
export type P = [x: number, y: number];

export interface PinchUpdate {
  panDx: number;
  panDy: number;
  zoomFactor: number;
  centerX: number;
  centerY: number;
}

/**
 * Two-finger gesture step. Apply as `camera.panBy(panDx, panDy)` then
 * `camera.zoomAt(centerX, centerY, zoomFactor)`: the world point under the previous midpoint
 * ends up under the next midpoint, scaled by the change in finger distance.
 */
export function pinchUpdate(prev: [P, P], next: [P, P]): PinchUpdate {
  const pcx = (prev[0][0] + prev[1][0]) / 2;
  const pcy = (prev[0][1] + prev[1][1]) / 2;
  const centerX = (next[0][0] + next[1][0]) / 2;
  const centerY = (next[0][1] + next[1][1]) / 2;
  const d0 = Math.hypot(prev[1][0] - prev[0][0], prev[1][1] - prev[0][1]);
  const d1 = Math.hypot(next[1][0] - next[0][0], next[1][1] - next[0][1]);
  const zoomFactor = d0 > 0 && d1 > 0 ? d1 / d0 : 1;
  return { panDx: centerX - pcx, panDy: centerY - pcy, zoomFactor, centerX, centerY };
}
