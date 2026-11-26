import type { RemoveBackgroundFn } from "./remove-background";
import { RemovalProgress } from "./remove-background-progress";
import { BG_MODEL, type WorkerReply, type WorkerRequest } from "./remove-background-protocol";

/** Estimated download sizes (bytes) on first use, refined by the real totals as they arrive. */
const EXPECTED_BYTES: Record<string, number> = {
  [`fetch:/models/${BG_MODEL}`]: 44_000_000,
  "fetch:/onnxruntime-web/ort-wasm-simd-threaded.wasm": 12_700_000,
  "fetch:/onnxruntime-web/ort-wasm-simd-threaded.mjs": 30_000,
};

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/**
 * Runs the background-removal library in a dedicated module worker, so decoding, inference and encoding never block
 * the page. One worker per run, terminated when it ends (or is cancelled) to give its memory back; the model
 * then comes from the browser's HTTP cache.
 */
export const removeBackgroundInWorker: RemoveBackgroundFn = (image, opts) => createWorkerRemover()(image, opts);

/** The worker remover with its assets served from `publicPath` (tests point it at an unreachable host). */
export const createWorkerRemover = (cfg: { publicPath?: string } = {}): RemoveBackgroundFn => (image, { maxSide, onProgress, signal }) =>
  new Promise<Blob>((resolve, reject) => {
    if (signal.aborted) return reject(abortError());
    let worker: Worker;
    try {
      worker = new Worker(new URL("./remove-background.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      return reject(e instanceof Error ? e : new Error("worker unavailable"));
    }
    const progress = new RemovalProgress(EXPECTED_BYTES);
    const finish = () => {
      signal.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      finish();
      reject(abortError());
    };
    signal.addEventListener("abort", onAbort);
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const m = e.data;
      if (m.type === "progress") {
        const p = progress.update(m.key, m.current, m.total);
        onProgress(p.fraction, p.phase);
      } else if (m.type === "done") {
        finish();
        resolve(m.blob);
      } else {
        finish();
        reject(new Error(m.message));
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      finish();
      reject(new Error(e.message || "worker failed"));
    };
    const req: WorkerRequest = { image, maxSide, publicPath: cfg.publicPath };
    worker.postMessage(req);
  });
