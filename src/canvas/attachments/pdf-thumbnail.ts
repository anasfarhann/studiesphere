const TIMEOUT_MS = 8000;

/**
 * Renders page 1 of a PDF to a JPEG of `maxWidth` CSS px. pdfjs-dist is imported on demand so it
 * never lands in the canvas bundle; its worker is bundled as an asset on our own origin.
 * Resolves null on any failure or after 8 s: a thumbnail is a nicety, never a blocker.
 */
export async function renderPdfThumbnail(file: Blob, maxWidth = 480): Promise<Blob | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cleanup: (() => void) | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), TIMEOUT_MS);
  });
  const work = (async (): Promise<Blob | null> => {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    cleanup = () => void task.destroy?.();
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: maxWidth / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.8));
  })();
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    try {
      cleanup?.();
    } catch {
      // best effort
    }
  }
}
