/** The smallest model (quantised, about 40 MB): enough for photos of notes, and kind to iPad memory and data. */
export const BG_MODEL = "isnet_quint8";

/** `publicPath`: where the model and WASM files are served; absent: the library's default (IMG.LY's CDN). */
export type WorkerRequest = { image: Blob; maxSide: number; publicPath?: string };
export type WorkerReply =
  | { type: "progress"; key: string; current: number; total: number }
  | { type: "done"; blob: Blob }
  | { type: "error"; message: string };

/** Target size for an image of w x h whose long side must not exceed maxSide (never upscaled). */
export function fitWithin(w: number, h: number, maxSide: number): { w: number; h: number } {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}
