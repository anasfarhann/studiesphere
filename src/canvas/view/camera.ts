import type { Rect } from "../model/types";

/**
 * Maps between screen pixels and world units.
 * (x, y) is the world point shown at screen (0, 0); zoom is screen px per world unit.
 */
export class Camera {
  static MIN_ZOOM = 0.1;
  static MAX_ZOOM = 8;

  x: number;
  y: number;
  zoom: number;

  constructor(x = 0, y = 0, zoom = 1) {
    this.x = x;
    this.y = y;
    this.zoom = zoom;
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.x + sx / this.zoom, this.y + sy / this.zoom];
  }

  worldToScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.x) * this.zoom, (wy - this.y) * this.zoom];
  }

  /** Moves the content with the finger: a screen drag of (dx, dy) shifts the camera by the opposite world amount. */
  panBy(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
  }

  /** Scales by `factor` around screen point (sx, sy), keeping the world point under it fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    const [anchorX, anchorY] = this.screenToWorld(sx, sy);
    const nextZoom = Math.min(Camera.MAX_ZOOM, Math.max(Camera.MIN_ZOOM, this.zoom * factor));
    this.zoom = nextZoom;
    this.x = anchorX - sx / nextZoom;
    this.y = anchorY - sy / nextZoom;
  }

  /** The world-space rectangle visible in a viewport of the given size in CSS px. */
  viewRect(widthPx: number, heightPx: number): Rect {
    return {
      minX: this.x,
      minY: this.y,
      maxX: this.x + widthPx / this.zoom,
      maxY: this.y + heightPx / this.zoom,
    };
  }
}
