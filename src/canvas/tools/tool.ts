import type { Point } from "../model/types";
import type { InputKind } from "../input/router";

/** World coordinates + pressure (0..1). */
export type WorldPoint = Point;
export type PointerInfo = { kind: InputKind; pressure: number; timeStamp: number; shiftKey: boolean };
export type ToolId = "pen" | "highlighter" | "eraser" | "lasso" | "text" | "hand";

export interface Tool {
  id: ToolId;
  down(p: WorldPoint, e: PointerInfo): void;
  move(pts: WorldPoint[], e: PointerInfo): void;
  up(): void;
  cancel(): void;
}
