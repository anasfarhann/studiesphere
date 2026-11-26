import type { TextFont } from "../settings/tool-settings";
export type Point = [x: number, y: number, pressure: number];
export type Base = { id: string; z: number; updatedAt: number };
export type StrokeEl = Base & {
  type: "stroke";
  tool: "pen" | "highlighter";
  color: string;
  size: number;
  points: Point[];
  simulatePressure: boolean;
  /** "px": drawn at exactly `size`. Absent on older strokes, whose highlighters draw 3x wide (see strokeWidth). */
  sizeMode?: "px";
};
export type TextEl = Base & {
  type: "text";
  x: number;
  y: number;
  w: number;
  text: string;
  fontSize: number;
  color: string;
  /** Style fields are optional: a box without them is sans, regular weight, no underline (as before they existed). */
  font?: TextFont;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};
export type ImageEl = Base & {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  assetPath: string;
  /** Visible part of the source image, in source fractions 0-1. Absent: the whole image. */
  crop?: { x: number; y: number; w: number; h: number };
};
export type AudioEl = Base & {
  type: "audio";
  x: number;
  y: number;
  assetPath: string;
  durationMs: number;
};
export type FileEl = Base & {
  type: "file";
  x: number;
  y: number;
  assetPath: string;
  fileName: string;
  mime: string;
  bytes: number;
  /** Storage path of a first-page preview (PDFs); absent for every other file. */
  thumbPath?: string;
};
export type CanvasElement = StrokeEl | TextEl | ImageEl | AudioEl | FileEl;
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
