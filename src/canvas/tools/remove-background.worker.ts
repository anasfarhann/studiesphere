/// <reference lib="webworker" />
import { removeBackground } from "@imgly/background-removal";
import { BG_MODEL, fitWithin, type WorkerReply, type WorkerRequest } from "./remove-background-protocol";

/**
 * Background removal off the main thread. The photo is decoded and scaled down here (long side <= maxSide, aspect
 * kept, so the element's crop fractions stay valid) and handed to the library as raw RGBA; the result is a PNG.
 * Model and WASM files come from IMG.LY's CDN (the library's default publicPath) on first use.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerReply) => scope.postMessage(m);

async function rgba(image: Blob, maxSide: number): Promise<Blob> {
  const bitmap = await createImageBitmap(image);
  const { w, h } = fitWithin(bitmap.width, bitmap.height, maxSide);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const data = ctx.getImageData(0, 0, w, h).data;
  return new Blob([data], { type: `image/x-rgba8;width=${w};height=${h}` });
}

scope.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  try {
    const input = await rgba(e.data.image, e.data.maxSide);
    const blob = await removeBackground(input, {
      ...(e.data.publicPath ? { publicPath: e.data.publicPath } : {}),
      model: BG_MODEL,
      device: "cpu",
      output: { format: "image/png", quality: 0.8 },
      progress: (key, current, total) => post({ type: "progress", key, current, total }),
    });
    post({ type: "done", blob });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
